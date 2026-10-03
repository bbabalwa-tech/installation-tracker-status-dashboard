// Water Programme Intake: the phone app.
//
// The app shows a form, sends it to the Apps Script backend, and shows what
// was saved. The backend does the filing into Drive and the Sheet.

// Paste the web app URL from your Apps Script deployment here (SETUP.md, step 6).
const API_URL = 'https://script.google.com/macros/s/AKfycbzf6Mbgs1JfrvqXvIp5N3NJTX5sopAOX_Y9SLZFNijwznZjLNFdW6UXrLYwXlFN5KABLA/exec';

// Videos upload straight to Google Drive. 200 MB is about a minute of normal phone video.
const VIDEO_MAX_MB = 200;
// Above this, the app warns that the video will be slow on mobile data.
const LARGE_VIDEO_MB = 40;
// Videos recorded in the app are kept small whatever the phone's own camera
// settings are: 720p at about 1.5 Mbps, so 30 seconds is roughly 6 MB.
const RECORD_SECONDS = 30;
const RECORD_VIDEO_BITS = 1500000;
// Photos are shrunk to this many pixels on the longest side before sending:
// sharp enough for the dashboard, and a few hundred KB instead of several MB.
const PHOTO_MAX_PIXELS = 1600;
const PHOTO_QUALITY = 0.8;

// The Sheet columns the form can fill. The form inputs use these as their names.
const DETAIL_COLUMNS = ['Province', 'Site Type', 'Status', 'Deployment Date', 'Scheduled Week', 'Water Quality'];
const EVIDENCE_COLUMNS = ['Photo 1', 'Photo 2', 'Photo 3', 'Video', 'Lab Report', 'Lab Certificate'];
// What a champion needs before the evidence view counts them as complete.
// Lab documents are shown but not required, because not every site has them.
const REQUIRED_EVIDENCE = ['Photo 1', 'Photo 2', 'Photo 3', 'Video'];
const NEW = '__new__';

let passcode = localStorage.getItem('passcode') || '';
// A random ID for this phone, so wrong passcodes only lock out the phone they came from.
const deviceId = localStorage.getItem('deviceId') || newSubmissionId();
localStorage.setItem('deviceId', deviceId);
let champions = [];
let technicians = [];
let chosenFiles = {};  // evidence column -> file ready to send
let sending = false;
// Remembers a video already uploaded, so tapping Submit again after a
// failure does not send the whole video a second time.
let uploadedVideo = {};
// Stays the same when Submit is tapped again after a failure, so the backend
// can spot a repeat. Any edit to the form starts a fresh ID.
let submissionId = newSubmissionId();

const form = document.getElementById('submit-form');
const $ = id => document.getElementById(id);

// ---------- Talking to the backend ----------

async function callApi(action, data) {
  const response = await fetch(API_URL, {
    method: 'POST',
    // Plain text lets the browser send this straight to Apps Script without a CORS pre-check, which Apps Script cannot answer.
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(Object.assign({ action: action, passcode: passcode, deviceId: deviceId }, data)),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function loadData() {
  const result = await callApi('load');
  champions = result.champions;
  technicians = result.technicians;
  fillChampionList();
  fillTechnicianList();
  renderEvidence();
}

// ---------- Screens ----------

function showScreen(name) {
  $('signin').hidden = name !== 'signin';
  form.hidden = name !== 'submit';
  $('evidence').hidden = name !== 'evidence';
  $('nav').hidden = name === 'signin';
  $('signout').hidden = name === 'signin';
  $('tab-submit').classList.toggle('active', name === 'submit');
  $('tab-evidence').classList.toggle('active', name === 'evidence');
}

function showMessage(type, title, lines) {
  const box = $('message');
  box.className = 'message ' + type;
  box.innerHTML = '<strong>' + escapeHtml(title) + '</strong>' +
    (lines && lines.length ? '<ul>' + lines.map(line => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>' : '');
  box.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideMessage() {
  $('message').hidden = true;
}

async function signIn(event) {
  event.preventDefault();
  passcode = $('passcode').value.trim();
  $('signin-button').disabled = true;
  try {
    await loadData();
    localStorage.setItem('passcode', passcode);
    hideMessage();
    showScreen('submit');
  } catch (err) {
    showMessage('error', 'Could not sign in', [friendlyError(err)]);
  } finally {
    $('signin-button').disabled = false;
  }
}

function signOut() {
  localStorage.removeItem('passcode');
  passcode = '';
  $('passcode').value = '';
  hideMessage();
  showScreen('signin');
}

// ---------- The form ----------

function fillChampionList() {
  const chosen = $('champion').value;
  $('champion').innerHTML = '<option value="">Choose...</option>' +
    champions.map(c => '<option>' + escapeHtml(c.Name) + '</option>').join('') +
    '<option value="' + NEW + '">+ Add new site</option>';
  $('champion').value = chosen;
}

function fillTechnicianList() {
  const chosen = $('technician').value || localStorage.getItem('technician') || '';
  $('technician').innerHTML = '<option value="">Choose...</option>' +
    technicians.map(name => '<option>' + escapeHtml(name) + '</option>').join('') +
    '<option value="' + NEW + '">+ Add new technician</option>';
  $('technician').value = technicians.includes(chosen) ? chosen : '';
}

function selectedChampion() {
  return champions.find(c => c.Name === $('champion').value) || null;
}

// Choosing an existing champion shows what the Sheet already holds, so the
// technician only changes what is new.
function onChampionChange() {
  const champion = selectedChampion();
  $('new-champion-field').hidden = $('champion').value !== NEW;
  DETAIL_COLUMNS.forEach(column => {
    const input = form.elements[column];
    input.value = champion ? champion[column] : '';
    if (input.value !== (champion ? champion[column] : '')) input.value = '';  // a value the dropdown does not offer
  });
  if (champion) {
    $('on-file').innerHTML = 'Already on file: ' + EVIDENCE_COLUMNS
      .map(column => column + (champion[column] ? ' &#10003;' : ' (missing)')).join(', ') +
      '. Adding a file replaces the one on file.';
  } else {
    $('on-file').textContent = '';
  }
  onStatusChange();
}

// Real installs get a date; Pipeline sites only have a planned week. They are
// separate Sheet columns because the dashboard cannot mix dates and text in one.
function onStatusChange() {
  const pipeline = form.elements['Status'].value === 'Pipeline';
  $('date-field').hidden = pipeline;
  $('week-field').hidden = !pipeline;
}

function chosenName(selectId, newInputId) {
  const value = $(selectId).value;
  return value === NEW ? $(newInputId).value.replace(/\s+/g, ' ').trim() : value;
}

// Only fields that have a value and differ from the Sheet are sent.
// A blank never overwrites anything: the app adds and changes, it never erases.
function changedFields(champion) {
  const fields = {};
  DETAIL_COLUMNS.forEach(column => {
    const input = form.elements[column];
    if (input.closest('label').hidden) return;
    const value = input.value.trim();
    if (value && value !== (champion ? champion[column] : '')) fields[column] = value;
  });
  return fields;
}

// A typo in a new name would create a second record for the same person, so
// a name close to an existing one is checked with the technician first.
function confirmNewName(name, existingNames, label) {
  const lookalike = existingNames.find(existing => namesLookAlike(name, existing));
  if (!lookalike) return true;
  return window.confirm('A ' + label + ' called "' + lookalike + '" already exists. Is "' + name +
    '" really a different ' + label + '?\n\nOK: yes, add it as new.\nCancel: go back and choose "' + lookalike + '" from the list.');
}

// True when two names differ by no more than two letters, ignoring case and spaces.
function namesLookAlike(a, b) {
  a = a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  b = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (a === b || Math.abs(a.length - b.length) > 2) return a === b;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length] <= 2;
}

function problemWithForm(technician, championName, champion, fields) {
  if (!technician) return 'Choose your name, or add yourself as a new technician.';
  if (!championName) return 'Choose a site, or add a new one.';
  if (!champion) {
    const existing = champions.find(c => c.Name.toLowerCase() === championName.toLowerCase());
    if (existing) return championName + ' is already in the list. Choose it from the Site dropdown.';
    if (!fields['Province'] || !fields['Site Type'] || !fields['Status']) {
      return 'A new site needs a province, site type and status.';
    }
  }
  if (Object.keys(fields).length === 0 && Object.keys(chosenFiles).length === 0) {
    return 'Nothing has changed yet. Change a detail or add a file, then submit.';
  }
  return '';
}

async function submitForm(event) {
  event.preventDefault();
  if (sending) return;  // ignore a double tap

  const technician = chosenName('technician', 'new-technician');
  const championName = chosenName('champion', 'new-champion');
  const champion = selectedChampion();
  const fields = changedFields(champion);
  const problem = problemWithForm(technician, championName, champion, fields);
  if (problem) {
    showMessage('error', 'Not sent yet', [problem]);
    return;
  }
  if (!confirmNewName(championName, champion ? [] : champions.map(c => c.Name), 'site')) return;
  if (!confirmNewName(technician, $('technician').value === NEW ? technicians : [], 'person')) return;

  sending = true;
  $('submit-button').disabled = true;
  $('submit-button').textContent = 'Saving... keep this screen open';
  showMessage('info', 'Sending ' + megabytes(totalSize()) + '. Keep this screen open until you see a confirmation.');
  try {
    const video = chosenFiles['Video'];
    const columns = Object.keys(chosenFiles).filter(column => column !== 'Video');

    // Step 1: details, photos and PDFs. They are small and send in seconds,
    // so a slow or failed video can never cost the technician the rest.
    let result = null;
    if (Object.keys(fields).length || columns.length) {
      const files = await Promise.all(columns.map(column => filePayload(column, chosenFiles[column])));
      result = await callApi('submit', {
        submissionId: submissionId,
        technician: technician,
        champion: championName,
        fields: fields,
        files: files,
      });
      localStorage.setItem('technician', technician);
    }

    // Step 2: the video, on its own.
    if (video) {
      try {
        const videoFileId = await uploadVideo(video, championName);
        const videoResult = await callApi('submit', {
          submissionId: submissionId + '-video',
          technician: technician,
          champion: championName,
          videoFileId: videoFileId,
        });
        result = result ? combineResults(result, videoResult) : videoResult;
      } catch (err) {
        if (!result) throw err;
        await keepOnlyVideo(result.champion, technician, video);
        showMessage('error', 'Saved, except the video', [
          'The details and other files for ' + result.champion + ' are saved.',
          'The video did not send. ' + friendlyError(err),
          'Tap Submit to try the video again, or add it later on Wi-Fi: choose ' + result.champion + ' and add only the video.',
        ]);
        return;
      }
    }
    localStorage.setItem('technician', technician);
    showConfirmation(result);
    resetForm();
    // Refresh the lists so a new champion appears. If this fails the save
    // still stands, so the confirmation is left in place.
    loadData().catch(() => {});
  } catch (err) {
    showMessage('error', 'Not saved', [
      friendlyError(err),
      'Your entries are still here. Tap Submit to try again; a repeat will not create a duplicate.',
    ]);
  } finally {
    sending = false;
    $('submit-button').disabled = false;
    $('submit-button').textContent = 'Submit';
  }
}

function combineResults(first, second) {
  return {
    champion: first.champion,
    isNewChampion: first.isNewChampion,
    updated: first.updated.concat(second.updated),
    files: first.files.concat(second.files),
    repeat: first.repeat && second.repeat,
  };
}

// After the rest saved but the video did not: reset the form to that champion
// with only the video waiting, so tapping Submit sends just the video.
async function keepOnlyVideo(championName, technician, video) {
  const alreadyUploaded = uploadedVideo;
  resetForm();
  await loadData().catch(() => {});
  $('technician').value = technician;
  $('champion').value = championName;
  onChampionChange();
  chosenFiles['Video'] = video;
  uploadedVideo = alreadyUploaded;
  setSlotStatus(document.querySelector('.slot[data-column="Video"]'), 'ready',
    'Waiting to send (' + megabytes(video.size) + ')');
}

function showConfirmation(result) {
  const lines = [];
  if (result.isNewChampion) lines.push('New site added to the Sheet.');
  result.files.forEach(name => lines.push('Saved to Drive: ' + name));
  const details = result.updated.filter(column => !EVIDENCE_COLUMNS.includes(column));
  if (details.length) lines.push('Updated in the Sheet: ' + details.join(', '));
  if (result.repeat) lines.push('This had already been saved, so nothing was saved twice.');
  showMessage('success', 'Saved for ' + result.champion, lines);
}

function resetForm() {
  const technician = $('technician').value;
  form.reset();
  $('technician').value = technician;
  $('new-technician-field').hidden = true;
  chosenFiles = {};
  uploadedVideo = {};
  document.querySelectorAll('.slot').forEach(slot => setSlotStatus(slot, '', ''));
  onChampionChange();
  submissionId = newSubmissionId();
}

// ---------- Evidence files ----------

// Each slot gets a camera button (opens the camera directly) and a
// choose button (gallery or files). PDFs only get the choose button.
function buildSlot(slot) {
  const kind = slot.dataset.kind;
  const accept = { photo: 'image/*', video: 'video/*', pdf: 'application/pdf' }[kind];
  let camera = kind === 'pdf' ? '' :
    '<label class="btn">' + (kind === 'photo' ? 'Take photo' : 'Record') +
    '<input type="file" class="visually-hidden" accept="' + accept + '" capture="environment"></label>';
  if (kind === 'video' && canRecordInApp()) camera = '<button type="button" class="btn rec-open">Record</button>';
  slot.insertAdjacentHTML('beforeend',
    '<div class="slot-buttons">' + camera +
    '<label class="btn secondary">' + (kind === 'pdf' ? 'Choose PDF' : 'Choose') +
    '<input type="file" class="visually-hidden" accept="' + accept + '"></label></div>' +
    '<img class="preview" alt="" hidden>' +
    '<div class="slot-status"></div>' +
    '<button type="button" class="link remove" hidden>Remove</button>');
  slot.querySelectorAll('input[type=file]').forEach(input => {
    input.addEventListener('change', () => pickFile(slot, input));
  });
  const recordButton = slot.querySelector('.rec-open');
  if (recordButton) recordButton.addEventListener('click', () => openRecorder(slot));
  slot.querySelector('.remove').addEventListener('click', () => {
    delete chosenFiles[slot.dataset.column];
    setSlotStatus(slot, '', '');
  });
}

async function pickFile(slot, input) {
  const file = input.files[0];
  input.value = '';  // so choosing the same file again still counts as a change
  if (!file) return;
  const kind = slot.dataset.kind;
  setSlotStatus(slot, '', kind === 'photo' ? 'Shrinking photo...' : '');
  try {
    let ready = file;
    if (kind === 'photo') ready = await compressPhoto(file);
    if (kind === 'video' && file.size > VIDEO_MAX_MB * 1024 * 1024) {
      throw new Error('This video is ' + megabytes(file.size) + '. The limit is ' + VIDEO_MAX_MB +
        ' MB, so record a shorter walkthrough (about 1 minute).');
    }
    if (kind === 'pdf' && file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
    chosenFiles[slot.dataset.column] = ready;
    const large = kind === 'video' && ready.size > LARGE_VIDEO_MB * 1024 * 1024;
    setSlotStatus(slot, 'ready', 'Ready to send (' + megabytes(ready.size) + ')' +
      (large ? '. This is large for mobile data: it may take several minutes. You can submit without it and add it later on Wi-Fi.' : ''),
      kind === 'photo' ? URL.createObjectURL(ready) : '');
  } catch (err) {
    delete chosenFiles[slot.dataset.column];
    setSlotStatus(slot, 'problem', err.message);
  }
}

function setSlotStatus(slot, state, text, previewUrl) {
  const status = slot.querySelector('.slot-status');
  status.className = 'slot-status ' + state;
  status.textContent = text;
  const preview = slot.querySelector('.preview');
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.hidden = !previewUrl;
  preview.src = previewUrl || '';
  if (!previewUrl) preview.removeAttribute('src');
  slot.querySelector('.remove').hidden = state !== 'ready';
}

// Redraws the photo smaller on a canvas and saves it as a JPEG.
async function compressPhoto(file) {
  const image = await loadImage(file);
  const scale = Math.min(1, PHOTO_MAX_PIXELS / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(image.src);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not shrink this photo.'))),
      'image/jpeg', PHOTO_QUALITY);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This phone could not open that photo. Try taking it again.'));
    image.src = URL.createObjectURL(file);
  });
}

// A video is too big to pass through Apps Script, so the backend gets a
// one-time upload address from Google Drive and the phone sends the video there.
async function uploadVideo(video, championName) {
  if (uploadedVideo.file === video && uploadedVideo.champion === championName) return uploadedVideo.fileId;
  const start = await callApi('startVideoUpload', {
    champion: championName,
    mimeType: video.type.split(';')[0],
    size: video.size,
    origin: location.origin,
  });
  const fileId = await sendToDrive(start.uploadUrl, video);
  uploadedVideo = { file: video, champion: championName, fileId: fileId };
  return fileId;
}

// Uses XMLHttpRequest rather than fetch because only it reports upload progress.
function sendToDrive(uploadUrl, video) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.upload.onprogress = event => {
      $('message').querySelector('strong').textContent =
        'Uploading video: ' + Math.round(event.loaded / event.total * 100) + '%';
    };
    request.onload = () => {
      if (request.status === 200 || request.status === 201) resolve(JSON.parse(request.responseText).id);
      else reject(new Error('Google Drive did not accept the video (error ' + request.status + ').'));
    };
    request.onerror = () => reject(new TypeError('Upload interrupted'));
    request.send(video);
  });
}

// ---------- In-app video recorder ----------

// Phone camera apps often record 4K or high-bitrate video, around 70 MB for
// 30 seconds, which takes minutes on mobile data. Recording inside the app
// lets it choose a small size without touching the phone's own settings.
let recording = null;

function canRecordInApp() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

async function openRecorder(slot) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: true,
    });
    recording = { slot: slot, stream: stream };
    $('rec-preview').srcObject = stream;
    $('rec-time').textContent = '0:00 of 0:' + RECORD_SECONDS;
    $('rec-button').textContent = 'Start recording';
    $('rec-button').classList.remove('rec-stop');
    $('recorder').hidden = false;
  } catch (err) {
    setSlotStatus(slot, 'problem', 'The camera did not open. Allow camera and microphone access for this app, or use Choose to pick a video.');
  }
}

function onRecordButton() {
  if (!recording) return;
  if (recording.mediaRecorder) stopRecording();
  else startRecording();
}

function startRecording() {
  // mp4 where the phone can make it (iPhone, newer Android), otherwise webm.
  const type = ['video/mp4', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const options = { videoBitsPerSecond: RECORD_VIDEO_BITS, audioBitsPerSecond: 64000 };
  if (type) options.mimeType = type;
  const session = recording;
  const mediaRecorder = new MediaRecorder(session.stream, options);
  const chunks = [];
  mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  mediaRecorder.onstop = () => { if (!session.cancelled) useRecording(session.slot, chunks, mediaRecorder.mimeType); };
  mediaRecorder.start(1000);
  session.mediaRecorder = mediaRecorder;
  session.started = Date.now();
  session.timer = setInterval(updateRecordTime, 250);
  $('rec-button').textContent = 'Stop';
  $('rec-button').classList.add('rec-stop');
}

function updateRecordTime() {
  const seconds = Math.min(RECORD_SECONDS, Math.floor((Date.now() - recording.started) / 1000));
  $('rec-time').textContent = '0:' + String(seconds).padStart(2, '0') + ' of 0:' + RECORD_SECONDS;
  if (seconds >= RECORD_SECONDS) stopRecording();
}

function stopRecording() {
  clearInterval(recording.timer);
  if (recording.mediaRecorder.state !== 'inactive') recording.mediaRecorder.stop();
  closeRecorder();
}

function cancelRecording() {
  if (!recording) return;
  recording.cancelled = true;
  if (recording.mediaRecorder) stopRecording();
  else closeRecorder();
}

function closeRecorder() {
  clearInterval(recording.timer);
  recording.stream.getTracks().forEach(track => track.stop());
  $('rec-preview').srcObject = null;
  $('recorder').hidden = true;
  recording = null;
}

function useRecording(slot, chunks, mimeType) {
  const type = (mimeType || (chunks[0] && chunks[0].type) || 'video/mp4').split(';')[0];
  const video = new File(chunks, 'walkthrough.' + (type === 'video/webm' ? 'webm' : 'mp4'), { type: type });
  if (!video.size) {
    setSlotStatus(slot, 'problem', 'Nothing was recorded. Tap Record and try again.');
    return;
  }
  chosenFiles['Video'] = video;
  submissionId = newSubmissionId();  // a new recording is a new submission
  setSlotStatus(slot, 'ready', 'Recorded, ready to send (' + megabytes(video.size) + ')');
}

// Photos and PDFs travel to Apps Script as base64 text inside the JSON.
function filePayload(column, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      column: column,
      mimeType: file.type,
      data: reader.result.split(',')[1],
    });
    reader.onerror = () => reject(new Error('Could not read the file for ' + column + '.'));
    reader.readAsDataURL(file);
  });
}

function totalSize() {
  return Object.values(chosenFiles).reduce((sum, file) => sum + file.size, 0);
}

// ---------- Evidence completeness view ----------

function missingItems(champion) {
  const missing = REQUIRED_EVIDENCE.filter(column => !champion[column]);
  if (!champion['Deployment Date']) missing.push('Deployment date');
  if (champion['Water Quality'] !== 'Pass' && champion['Water Quality'] !== 'Fail') missing.push('Water quality result');
  return missing;
}

function renderEvidence() {
  const onlyMissing = $('only-missing').checked;
  const complete = champions.filter(c => missingItems(c).length === 0).length;
  $('evidence-summary').innerHTML = '<strong>' + complete + ' of ' + champions.length +
    '</strong> sites have all their evidence.';

  const statusOrder = ['Completed', 'In Progress', 'Pipeline', 'Not Started'];
  const rows = champions
    .filter(c => !onlyMissing || missingItems(c).length > 0)
    .sort((a, b) => statusOrder.indexOf(a.Status) - statusOrder.indexOf(b.Status))
    .map(evidenceRow);
  $('evidence-list').innerHTML = rows.length ? rows.join('') : '<p>Nothing is missing. Every site is complete.</p>';
  $('evidence-list').querySelectorAll('[data-champion]').forEach(button => {
    button.addEventListener('click', () => openChampion(button.dataset.champion));
  });
}

function evidenceRow(champion) {
  const missing = missingItems(champion);
  const chips = EVIDENCE_COLUMNS.concat(['Deployment date', 'Water quality result']).map(item => {
    if (!REQUIRED_EVIDENCE.includes(item) && EVIDENCE_COLUMNS.includes(item) && !champion[item]) {
      return '<span class="chip optional">' + item + ' (optional)</span>';
    }
    const absent = missing.includes(item);
    return '<span class="chip ' + (absent ? 'missing' : 'have') + '">' + item + (absent ? ' missing' : ' &#10003;') + '</span>';
  });
  return '<div class="champion-row">' +
    '<div class="champion-head"><strong>' + escapeHtml(champion.Name) + '</strong>' +
    '<span class="status">' + escapeHtml(champion.Status || 'No status') + '</span></div>' +
    '<div class="chips">' + chips.join('') + '</div>' +
    '<button type="button" class="link" data-champion="' + escapeHtml(champion.Name) + '">Add evidence for ' +
    escapeHtml(champion.Name) + '</button></div>';
}

function openChampion(name) {
  hideMessage();
  showScreen('submit');
  $('champion').value = name;
  onChampionChange();
  window.scrollTo({ top: 0 });
}

async function refreshEvidence() {
  try {
    await loadData();
    hideMessage();
  } catch (err) {
    showMessage('error', 'Could not refresh', [friendlyError(err)]);
  }
}

// ---------- Small helpers ----------

function friendlyError(err) {
  // fetch throws a TypeError when there is no connection at all.
  if (err instanceof TypeError) return 'Could not reach the server. Check your signal or data, then try again.';
  return err.message;
}

function megabytes(bytes) {
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function newSubmissionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- Start ----------

document.querySelectorAll('.slot').forEach(buildSlot);
$('signin').addEventListener('submit', signIn);
form.addEventListener('submit', submitForm);
form.addEventListener('change', () => { submissionId = newSubmissionId(); });
form.addEventListener('input', () => { submissionId = newSubmissionId(); });
$('champion').addEventListener('change', onChampionChange);
$('technician').addEventListener('change', () => { $('new-technician-field').hidden = $('technician').value !== NEW; });
form.elements['Status'].addEventListener('change', onStatusChange);
$('tab-submit').addEventListener('click', () => { hideMessage(); showScreen('submit'); });
$('tab-evidence').addEventListener('click', () => { hideMessage(); showScreen('evidence'); });
$('only-missing').addEventListener('change', renderEvidence);
$('refresh').addEventListener('click', refreshEvidence);
$('signout').addEventListener('click', signOut);
$('rec-button').addEventListener('click', onRecordButton);
$('rec-cancel').addEventListener('click', cancelRecording);

if (!API_URL) {
  showMessage('error', 'Not connected yet',
    ['This app has no backend address. Follow SETUP.md to deploy the Apps Script and paste its URL into app.js.']);
  showScreen('signin');
  $('signin-button').disabled = true;
} else if (passcode) {
  loadData().then(() => showScreen('submit')).catch(err => {
    showMessage('error', 'Please sign in again', [friendlyError(err)]);
    showScreen('signin');
  });
} else {
  showScreen('signin');
}
