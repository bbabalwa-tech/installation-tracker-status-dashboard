/**
 * Water Programme Intake: the backend.
 *
 * This script lives inside the DEMO Google Sheet (Extensions > Apps Script)
 * and is deployed as a web app. The phone app sends every request here as a
 * POST with a JSON body. Two kinds of request exist:
 *   "load"   returns the champions and technicians lists.
 *   "submit" saves files into Drive and writes the champion's Sheet row.
 *
 * Each record is a site. The Sheet tab is called "Champions" and the code
 * says "champion" because the tab copies the column layout of the
 * programme's existing dashboard.
 *
 * Settings live in Project Settings > Script properties:
 *   PASSCODE         the shared passcode technicians type in the app.
 *   MEDIA_FOLDER_ID  the Drive folder that holds one folder per champion
 *                    (setupDemo creates this for you).
 */

// The dashboard reads the Champions tab in exactly this column order.
// Changing this list breaks the dashboard, so the script refuses to write
// if the Sheet does not match it.
const CHAMPION_COLUMNS = [
  'Name', 'Province', 'Site Type', 'Status', 'Deployment Date', 'Scheduled Week',
  'Water Quality', 'Photo 1', 'Photo 2', 'Photo 3', 'Video', 'Lab Report', 'Lab Certificate',
];

// The only values the dropdown columns may hold, so the data stays clean.
const ALLOWED_VALUES = {
  'Province': ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],
  'Site Type': ['Trailer', 'Physical'],
  'Status': ['Completed', 'In Progress', 'Pipeline', 'Not Started'],
  'Water Quality': ['Pass', 'Fail', 'Pending'],
};

// Each evidence column and the kind of file it accepts.
const FILE_COLUMNS = {
  'Photo 1': 'image/',
  'Photo 2': 'image/',
  'Photo 3': 'image/',
  'Video': 'video/',
  'Lab Report': 'application/pdf',
  'Lab Certificate': 'application/pdf',
};

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

// Videos go straight from the phone to Drive (see startVideoUpload), so they
// can be far bigger than anything this script could accept itself.
// 200 MB is about a minute of normal phone video.
const VIDEO_MAX_MB = 200;

// Each phone gets its own count of wrong passcodes, so one person guessing
// cannot lock out every technician. The shared ceiling still stops someone
// guessing from many phones at once.
const MAX_WRONG_PER_PHONE = 10;
const MAX_WRONG_IN_TOTAL = 100;
const LOCKOUT_SECONDS = 15 * 60;

function doPost(e) {
  let result;
  let request = {};
  let signedIn = false;
  try {
    request = JSON.parse(e.postData.contents);
    checkPasscode(request.passcode, request.deviceId);
    signedIn = true;
    if (request.action === 'load') {
      result = { champions: readChampions(), technicians: readTechnicians() };
    } else if (request.action === 'startVideoUpload') {
      result = startVideoUpload(request);
    } else if (request.action === 'submit') {
      result = submit(request);
    } else {
      throw new Error('Unknown request.');
    }
    result.ok = true;
  } catch (err) {
    result = { ok: false, error: err.message };
    // Failed saves are logged so the owner can find them. Wrong passcodes are
    // not, so guessing cannot flood the log.
    if (signedIn && (request.action === 'submit' || request.action === 'startVideoUpload')) {
      logFailure(request, err.message);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets the owner open the web app URL in a browser to confirm it is live.
function doGet() {
  return ContentService.createTextOutput('Water Programme Intake backend is running.');
}

// ---------- Access control ----------

function checkPasscode(passcode, deviceId) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!expected) throw new Error('No passcode has been set up yet. See SETUP.md, step 4.');

  // A passcode can be guessed by trying many times, so pause after repeated misses.
  // During a pause even the right passcode is refused, otherwise a guesser could
  // keep trying and simply wait for a success.
  const cache = CacheService.getScriptCache();
  const phoneKey = 'wrong:' + String(deviceId || 'unknown').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  const phoneMisses = Number(cache.get(phoneKey) || 0);
  const totalMisses = Number(cache.get('wrong:all') || 0);
  if (phoneMisses >= MAX_WRONG_PER_PHONE) {
    throw new Error('Too many wrong passcodes on this phone. Wait 15 minutes, then try again.');
  }
  if (totalMisses >= MAX_WRONG_IN_TOTAL) {
    throw new Error('Sign-in is paused after too many wrong passcodes. Wait 15 minutes, then try again.');
  }
  if (String(passcode || '') !== expected) {
    cache.put(phoneKey, String(phoneMisses + 1), LOCKOUT_SECONDS);
    cache.put('wrong:all', String(totalMisses + 1), LOCKOUT_SECONDS);
    throw new Error('Wrong passcode.');
  }
}

// ---------- Reading ----------

function readChampions() {
  const rows = championsSheet().getDataRange().getValues().slice(1);
  return rows
    .filter(row => String(row[0]).trim() !== '')
    .map(row => {
      const champion = {};
      CHAMPION_COLUMNS.forEach((column, i) => { champion[column] = cellToText(row[i]); });
      return champion;
    });
}

function readTechnicians() {
  return techniciansSheet().getDataRange().getValues().slice(1)
    .map(row => String(row[0]).trim())
    .filter(name => name !== '');
}

function cellToText(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).trim();
}

// ---------- Saving a submission ----------

// One change at a time, so two phones cannot create the same champion,
// folder or file twice.
function withLock(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('The system is busy saving another submission. Tap Submit again in a moment.');
  }
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function submit(request) {
  return withLock(() => {
    // The app resends the same ID if the technician taps Submit again after a
    // weak-signal timeout. If that ID already saved, report the earlier result
    // instead of saving twice.
    const earlier = findLoggedSubmission(request.submissionId);
    if (earlier) {
      earlier.repeat = true;
      return earlier;
    }

    const technician = cleanName(request.technician, 'technician');
    const fields = checkFields(request.fields || {});
    const files = request.files || [];
    const sheet = championsSheet();
    const existing = findChampion(sheet, cleanName(request.champion, 'site'));
    const name = existing ? existing.name : cleanName(request.champion, 'site');

    if (!existing) {
      ['Province', 'Site Type', 'Status'].forEach(column => {
        if (!fields[column]) throw new Error('A new site needs a ' + column + '.');
      });
    }
    if (Object.keys(fields).length === 0 && files.length === 0 && !request.videoFileId) {
      throw new Error('There was nothing new to save.');
    }
    files.forEach(fileExtension);  // check every file before saving any

    // New files are saved first and the old ones they replace are only binned
    // once the Sheet is updated. If anything fails part way, the Sheet still
    // points at files that exist, and tapping Submit again finishes the job.
    const savedFiles = files.map(file => saveFile(name, file));
    if (request.videoFileId) savedFiles.push(finishVideoUpload(name, request.videoFileId));
    savedFiles.forEach(file => { fields[file.column] = file.url; });

    let rowNumber = existing ? existing.rowNumber : null;
    if (!existing) {
      sheet.appendRow(CHAMPION_COLUMNS.map(column => (column === 'Name' ? name : '')));
      rowNumber = sheet.getLastRow();
    }
    writeFields(sheet, rowNumber, fields);
    addTechnicianIfNew(technician);
    savedFiles.forEach(file => file.replaced.forEach(old => old.setTrashed(true)));

    const result = {
      champion: name,
      isNewChampion: !existing,
      updated: Object.keys(fields),
      files: savedFiles.map(file => file.fileName),
    };
    logSubmission(request.submissionId, technician, result);
    return result;
  });
}

// Only the fields that were sent are written. Blank values are ignored, so an
// update can add or change evidence but never erase it.
function writeFields(sheet, rowNumber, fields) {
  Object.keys(fields).forEach(column => {
    const cell = sheet.getRange(rowNumber, CHAMPION_COLUMNS.indexOf(column) + 1);
    if (column === 'Deployment Date') {
      const parts = fields[column].split('-').map(Number);
      cell.setValue(new Date(parts[0], parts[1] - 1, parts[2])).setNumberFormat('dd mmm yyyy');
    } else if (column === 'Scheduled Week') {
      // Stored as plain text so Sheets does not turn "Week 12" into a date.
      cell.setNumberFormat('@').setValue(fields[column]);
    } else {
      cell.setValue(fields[column]);
    }
  });
}

function checkFields(fields) {
  const clean = {};
  Object.keys(fields).forEach(column => {
    const value = String(fields[column] || '').trim();
    if (value === '') return;
    if (ALLOWED_VALUES[column]) {
      if (ALLOWED_VALUES[column].indexOf(value) === -1) {
        throw new Error('"' + value + '" is not a valid ' + column + '.');
      }
    } else if (column === 'Deployment Date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('The deployment date is not a valid date.');
    } else if (column === 'Scheduled Week') {
      if (!/^[A-Za-z0-9][A-Za-z0-9 ,./-]{0,39}$/.test(value)) {
        throw new Error('Keep the scheduled week short, using letters, numbers and spaces only.');
      }
    } else {
      throw new Error('The app sent a field the Sheet does not have: ' + column);
    }
    clean[column] = value;
  });
  return clean;
}

// Names become Sheet cells and Drive file names, so only allow name characters.
// Starting with a letter or number also stops anyone typing a spreadsheet formula.
function cleanName(value, label) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Please choose a ' + label + '.');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]{1,79}$/u.test(name)) {
    throw new Error('The ' + label + ' name can only contain letters, numbers, spaces, hyphens and apostrophes.');
  }
  return name;
}

// Matching ignores capital letters, so "hilltop clinic" finds "Hilltop Clinic" instead of adding a duplicate.
function findChampion(sheet, name) {
  const names = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let i = 1; i < names.length; i++) {
    const existing = String(names[i][0]).trim();
    if (existing.toLowerCase() === name.toLowerCase()) {
      return { name: existing, rowNumber: i + 1 };
    }
  }
  return null;
}

function addTechnicianIfNew(name) {
  const known = readTechnicians().map(t => t.toLowerCase());
  if (known.indexOf(name.toLowerCase()) === -1) techniciansSheet().appendRow([name]);
}

// ---------- Drive ----------

function fileExtension(file) {
  const kind = FILE_COLUMNS[file.column];
  if (!kind) throw new Error('Unknown evidence slot: ' + file.column);
  const extension = EXTENSIONS[file.mimeType];
  if (!extension || file.mimeType.indexOf(kind) !== 0) {
    throw new Error(file.column + ': this type of file is not accepted (' + file.mimeType + ').');
  }
  return extension;
}

// Saves one file as "<Site name> Photo 1.jpg" (and so on) in the champion's
// own folder. Any older file for that slot is returned as "replaced", to be
// moved to the Drive bin (recoverable for 30 days) once the Sheet is updated.
function saveFile(championName, file) {
  const baseName = championName + ' ' + file.column;
  const fileName = baseName + '.' + fileExtension(file);
  const folder = championFolder(championName);
  const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.mimeType, fileName);
  const saved = folder.createFile(blob);
  return { column: file.column, fileName: fileName, url: saved.getUrl(), replaced: filesNamed(folder, baseName, saved.getId()) };
}

// A minute of video is too big to pass through this script, so the phone
// uploads it straight to Drive. This asks Drive for a one-time upload address
// that accepts only this one file, of exactly this size, into the champion's
// folder. The file arrives named "(uploading)" until the submission is saved.
function startVideoUpload(request) {
  return withLock(() => requestVideoUpload(request));
}

function requestVideoUpload(request) {
  const typed = cleanName(request.champion, 'site');
  const existing = findChampion(championsSheet(), typed);
  const name = existing ? existing.name : typed;
  const extension = EXTENSIONS[request.mimeType];
  if (!extension || request.mimeType.indexOf('video/') !== 0) {
    throw new Error('Video: this type of file is not accepted (' + request.mimeType + ').');
  }
  const size = Number(request.size);
  if (!(size > 0 && size <= VIDEO_MAX_MB * 1024 * 1024)) {
    throw new Error('The video is too large. The limit is ' + VIDEO_MAX_MB + ' MB.');
  }

  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({
        name: name + ' Video (uploading).' + extension,
        parents: [championFolder(name).getId()],
      }),
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': request.mimeType,
        'X-Upload-Content-Length': String(size),
        // Drive only lets a browser use the upload address from the website named here.
        Origin: String(request.origin || ''),
      },
    });
  const headers = response.getHeaders();
  return { uploadUrl: headers.Location || headers.location };
}

// Gives an uploaded video its proper name. Only a file this app uploaded
// into this champion's folder is accepted. The older video, and any upload
// abandoned more than a day ago, are binned once the Sheet is updated.
function finishVideoUpload(championName, fileId) {
  const folder = championFolder(championName);
  const file = DriveApp.getFileById(String(fileId));
  const parents = file.getParents();
  const baseName = championName + ' Video';
  if (!parents.hasNext() || parents.next().getId() !== folder.getId() || file.getName().indexOf(baseName) !== 0) {
    throw new Error('The uploaded video could not be found. Please add the video again.');
  }
  const fileName = baseName + '.' + file.getName().split('.').pop();
  if (file.getName() !== fileName) file.setName(fileName);
  const replaced = filesNamed(folder, baseName, file.getId())
    .concat(abandonedUploads(folder, baseName + ' (uploading)', file.getId()));
  return { column: 'Video', fileName: fileName, url: file.getUrl(), replaced: replaced };
}

// Files in the folder with this name (ignoring the extension), except one to keep.
function filesNamed(folder, baseName, keepId) {
  const found = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getId() !== keepId && file.getName().replace(/\.[^.]+$/, '') === baseName) found.push(file);
  }
  return found;
}

function abandonedUploads(folder, baseName, keepId) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return filesNamed(folder, baseName, keepId).filter(file => file.getDateCreated().getTime() < dayAgo);
}

function championFolder(championName) {
  const folderId = PropertiesService.getScriptProperties().getProperty('MEDIA_FOLDER_ID');
  if (!folderId) throw new Error('No media folder is set up yet. See SETUP.md, step 3.');
  const root = DriveApp.getFolderById(folderId);
  const matches = root.getFoldersByName(championName);
  return matches.hasNext() ? matches.next() : root.createFolder(championName);
}

// ---------- Sheet tabs ----------

function championsSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  // Build safety catch: this script must only ever run against the demo copy.
  if (spreadsheet.getName().indexOf('LIVE') !== -1) {
    throw new Error('This script is attached to the LIVE sheet. It must only run on the demo sheet.');
  }
  const sheet = spreadsheet.getSheetByName('Champions');
  if (!sheet) throw new Error('The Sheet has no Champions tab. Run setupDemo first.');
  const headers = sheet.getRange(1, 1, 1, CHAMPION_COLUMNS.length).getValues()[0]
    .map(header => String(header).trim());
  if (headers.join('|') !== CHAMPION_COLUMNS.join('|')) {
    throw new Error('The Champions tab columns do not match what the dashboard reads. Nothing was saved.');
  }
  return sheet;
}

function techniciansSheet() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Technicians');
  if (!sheet) throw new Error('The Sheet has no Technicians tab. Run setupDemo first.');
  return sheet;
}

// Every saved submission is logged: an audit trail for the owner, and the
// record that stops a repeated tap from saving twice.
function submissionsSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  let sheet = spreadsheet.getSheetByName('Submissions');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Submissions');
    sheet.appendRow(['Time', 'Submission ID', 'Technician', 'Champion', 'What changed', 'Result']);
  }
  return sheet;
}

function findLoggedSubmission(submissionId) {
  if (!submissionId) return null;
  const sheet = submissionsSheet();
  const match = sheet.getRange('B:B').createTextFinder(String(submissionId)).matchEntireCell(true).findNext();
  return match ? JSON.parse(sheet.getRange(match.getRow(), 6).getValue()) : null;
}

// Failures go in the same log. The ID is marked so a retry is never
// mistaken for a submission that already saved.
function logFailure(request, message) {
  try {
    submissionsSheet().appendRow([
      new Date(), 'NOT SAVED ' + String(request.submissionId || ''), String(request.technician || ''),
      String(request.champion || ''), 'NOT SAVED: ' + message, '',
    ]);
  } catch (err) {
    // Logging must never hide the original error from the technician.
  }
}

function logSubmission(submissionId, technician, result) {
  submissionsSheet().appendRow([
    new Date(), String(submissionId || ''), technician, result.champion,
    result.updated.join(', '), JSON.stringify(result),
  ]);
}

// ---------- Demo data ----------

// Fictional sites for the portfolio demo. Some have full evidence and some
// have gaps, so both the dashboard and the evidence view have something to show.
// Last column: 'all' = 3 photos, video, lab report and certificate;
// 'some' = photos and video; 'photos' = two photos; '' = nothing yet.
const DEMO_SITES = [
  ['Riverside Community Hall', 'Gauteng', 'Physical', 'Completed', new Date(2026, 2, 4), '', 'Pass', 'all'],
  ['Hilltop Clinic', 'Limpopo', 'Trailer', 'Completed', new Date(2026, 2, 9), '', 'Pass', 'all'],
  ['Greenvale Primary School', 'Free State', 'Physical', 'Completed', new Date(2026, 2, 15), '', 'Pending', 'some'],
  ['Eastgate Taxi Rank', 'KwaZulu-Natal', 'Trailer', 'In Progress', '', '', 'Pending', 'photos'],
  ['Northfield Sports Ground', 'North West', 'Trailer', 'Pipeline', '', 'Week of 9 Nov 2026', '', ''],
  ['Sunnyridge Community Garden', 'Northern Cape', 'Physical', 'Not Started', '', '', '', ''],
  ['Lakeside Library', 'Eastern Cape', 'Physical', 'Completed', new Date(2026, 2, 22), '', 'Pass', 'all'],
];

// Sample files, each clearly marked DEMO DATA, published with the app.
const DEMO_ASSETS = 'https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/demo-assets/';

// Run this once from the Apps Script editor (select setupDemo, press Run).
// It builds the demo tabs and a demo media folder. Then run resetDemoData.
function setupDemo() {
  const spreadsheet = SpreadsheetApp.getActive();
  if (spreadsheet.getName().indexOf('LIVE') !== -1) {
    throw new Error('This is the LIVE sheet. Run setupDemo only on the demo sheet.');
  }
  if (spreadsheet.getSheetByName('Champions')) {
    throw new Error('A Champions tab already exists, so setup has already been run. Nothing was changed.');
  }

  const sites = spreadsheet.insertSheet('Champions');
  sites.appendRow(CHAMPION_COLUMNS);
  DEMO_SITES.forEach(site => sites.appendRow(site.slice(0, 7).concat(['', '', '', '', '', ''])));
  sites.getRange('E:E').setNumberFormat('dd mmm yyyy');
  sites.getRange('F:F').setNumberFormat('@');
  sites.setFrozenRows(1);

  const technicians = spreadsheet.insertSheet('Technicians');
  technicians.appendRow(['Name']);
  ['Lerato Mokoena', 'Johan van Wyk', 'Nomsa Dlamini'].forEach(name => technicians.appendRow([name]));
  technicians.setFrozenRows(1);

  submissionsSheet().setFrozenRows(1);

  const folder = DriveApp.createFolder('Water Programme DEMO media');
  PropertiesService.getScriptProperties().setProperty('MEDIA_FOLDER_ID', folder.getId());
  Logger.log('Demo set up. Media folder: ' + folder.getUrl());
}

// Puts the demo back to a tidy state for showing the portfolio: replaces every
// row in the Champions tab with the sites above and attaches the sample files.
// Run it from the editor (select resetDemoData, press Run). The demo sheet only:
// it is refused on any sheet named LIVE.
function resetDemoData() {
  withLock(() => {
    const sheet = championsSheet();
    const sample = name => UrlFetchApp.fetch(DEMO_ASSETS + name).getBlob();
    const files = {
      'Photo 1': [sample('photo-1.jpg'), 'jpg'],
      'Photo 2': [sample('photo-2.jpg'), 'jpg'],
      'Photo 3': [sample('photo-3.jpg'), 'jpg'],
      'Video': [sample('walkthrough.webm'), 'webm'],
      'Lab Report': [sample('lab-report.pdf'), 'pdf'],
      'Lab Certificate': [sample('lab-certificate.pdf'), 'pdf'],
    };
    const included = {
      all: Object.keys(files),
      some: ['Photo 1', 'Photo 2', 'Photo 3', 'Video'],
      photos: ['Photo 1', 'Photo 2'],
    };

    const rows = DEMO_SITES.map(site => {
      const name = site[0];
      const links = {};
      (included[site[7]] || []).forEach(column => {
        const folder = championFolder(name);
        const baseName = name + ' ' + column;
        filesNamed(folder, baseName, '').forEach(old => old.setTrashed(true));
        const blob = files[column][0].copyBlob().setName(baseName + '.' + files[column][1]);
        links[column] = folder.createFile(blob).getUrl();
      });
      return site.slice(0, 7).concat(CHAMPION_COLUMNS.slice(7).map(column => links[column] || ''));
    });

    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, CHAMPION_COLUMNS.length).clearContent();
    sheet.getRange(2, 1, rows.length, CHAMPION_COLUMNS.length).setValues(rows);
    sheet.getRange(2, 5, rows.length, 1).setNumberFormat('dd mmm yyyy');
    Logger.log('Demo reset: ' + rows.length + ' sites.');
  });
}
