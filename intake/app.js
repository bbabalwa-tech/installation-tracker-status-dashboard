// Water Champions Intake: the phone app.
//
// The app shows a form, sends it to the Apps Script backend, and shows what
// was saved. The backend does the filing into Drive and the Sheet.

// Paste the web app URL from your Apps Script deployment here (SETUP.md, step 6).
const API_URL = '';

// Apps Script cannot accept very large uploads, so videos over this size are refused on the phone.
const VIDEO_MAX_MB = 20;
// Photos are shrunk to this many pixels on the longest side before sending:
// sharp enough for the dashboard, and a few hundred KB instead of several MB.
const PHOTO_MAX_PIXELS = 1600;
const PHOTO_QUALITY = 0.8;

// The Sheet columns the form can fill. The form inputs use these as their names.
const DETAIL_COLUMNS = ['Province', 'Site Type', 'Status', 'Deployment Date', 'Scheduled Week', 'Water Quality'];
const EVIDENCE_COLUMNS = ['Photo 1', 'Photo 2', 'Photo 3', 'Video', 'Lab Report', 'Lab Certificate'];
// What a champion needs before the evidence view counts them as complete.
// The lab certificate is shown but not required, because not every lab issues one.
const REQUIRED_EVIDENCE = ['Photo 1', 'Photo 2', 'Photo 3', 'Video', 'Lab Report'];
const NEW = '__new__';

let passcode = localStorage.getItem('passcode') || '';
let champions = [];
let technicians = [];
let chosenFiles = {};  // evidence column -> file ready to send
let sending = false;
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
    body: JSON.stringify(Object.assign({ action: action, passcode: passcode }, data)),
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
    '<option value="' + NEW + '">+ Add new champion</option>';
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

function problemWithForm(technician, championName, champion, fields) {
  if (!technician) return 'Choose your name, or add yourself as a new technician.';
  if (!championName) return 'Choose a champion, or add a new one.';
  if (!champion) {
    const existing = champions.find(c => c.Name.toLowerCase() === championName.toLowerCase());
    if (existing) return championName + ' is already in the list. Choose them from the Champion dropdown.';
    if (!fields['Province'] || !fields['Site Type'] || !fields['Status']) {
      return 'A new champion needs a province, site type and status.';
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

  sending = true;
  $('submit-button').disabled = true;
  $('submit-button').textContent = 'Saving... keep this screen open';
  showMessage('info', 'Sending ' + megabytes(totalSize()) + '. Keep this screen open until you see a confirmation.');
  try {
    const files = await Promise.all(Object.keys(chosenFiles).map(column => filePayload(column, chosenFiles[column])));
    const result = await callApi('submit', {
      submissionId: submissionId,
      technician: technician,
      champion: championName,
      fields: fields,
      files: files,
    });
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

function showConfirmation(result) {
  const lines = [];
  if (result.isNewChampion) lines.push('New champion added to the Sheet.');
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
  const camera = kind === 'pdf' ? '' :
    '<label class="btn">' + (kind === 'photo' ? 'Take photo' : 'Record') +
    '<input type="file" class="visually-hidden" accept="' + accept + '" capture="environment"></label>';
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
        ' MB, so record a shorter walkthrough (about 30 seconds).');
    }
    if (kind === 'pdf' && file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
    chosenFiles[slot.dataset.column] = ready;
    setSlotStatus(slot, 'ready', 'Ready to send (' + megabytes(ready.size) + ')',
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

// Files travel to Apps Script as base64 text inside the JSON.
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
    '</strong> champions have all their evidence.';

  const statusOrder = ['Completed', 'In Progress', 'Pipeline', 'Not Started'];
  const rows = champions
    .filter(c => !onlyMissing || missingItems(c).length > 0)
    .sort((a, b) => statusOrder.indexOf(a.Status) - statusOrder.indexOf(b.Status))
    .map(evidenceRow);
  $('evidence-list').innerHTML = rows.length ? rows.join('') : '<p>Nothing is missing. Every champion is complete.</p>';
  $('evidence-list').querySelectorAll('[data-champion]').forEach(button => {
    button.addEventListener('click', () => openChampion(button.dataset.champion));
  });
}

function evidenceRow(champion) {
  const missing = missingItems(champion);
  const chips = EVIDENCE_COLUMNS.concat(['Deployment date', 'Water quality result']).map(item => {
    if (item === 'Lab Certificate' && !champion[item]) return '<span class="chip optional">Lab Certificate (optional)</span>';
    const absent = missing.includes(item);
    return '<span class="chip ' + (absent ? 'missing' : 'have') + '">' + item + (absent ? ' missing' : ' &#10003;') + '</span>';
  });
  return '<div class="champion-row">' +
    '<div class="champion-head"><strong>' + escapeHtml(champion.Name) + '</strong>' +
    '<span class="status">' + escapeHtml(champion.Status || 'No status') + '</span></div>' +
    '<div class="chips">' + chips.join('') + '</div>' +
    '<button type="button" class="link" data-champion="' + escapeHtml(champion.Name) + '">Add evidence for ' +
    escapeHtml(champion.Name.split(' ')[0]) + '</button></div>';
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
