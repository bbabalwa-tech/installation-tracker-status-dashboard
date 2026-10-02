/**
 * Water Champions Intake: the backend.
 *
 * This script lives inside the DEMO Google Sheet (Extensions > Apps Script)
 * and is deployed as a web app. The phone app sends every request here as a
 * POST with a JSON body. Two kinds of request exist:
 *   "load"   returns the champions and technicians lists.
 *   "submit" saves files into Drive and writes the champion's Sheet row.
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

const MAX_WRONG_PASSCODES = 10;
const LOCKOUT_SECONDS = 15 * 60;

function doPost(e) {
  let result;
  try {
    const request = JSON.parse(e.postData.contents);
    checkPasscode(request.passcode);
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
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets the owner open the web app URL in a browser to confirm it is live.
function doGet() {
  return ContentService.createTextOutput('Water Champions Intake backend is running.');
}

// ---------- Access control ----------

function checkPasscode(passcode) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!expected) throw new Error('No passcode has been set up yet. See SETUP.md, step 4.');

  // A short PIN can be guessed by trying many times, so pause after repeated misses.
  const cache = CacheService.getScriptCache();
  const misses = Number(cache.get('wrongPasscodes') || 0);
  if (misses >= MAX_WRONG_PASSCODES) {
    throw new Error('Too many wrong passcodes. Wait 15 minutes, then try again.');
  }
  if (String(passcode || '') !== expected) {
    cache.put('wrongPasscodes', String(misses + 1), LOCKOUT_SECONDS);
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

function submit(request) {
  // One submission at a time, so two phones cannot create the same champion twice.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
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
    const existing = findChampion(sheet, cleanName(request.champion, 'champion'));
    const name = existing ? existing.name : cleanName(request.champion, 'champion');

    if (!existing) {
      ['Province', 'Site Type', 'Status'].forEach(column => {
        if (!fields[column]) throw new Error('A new champion needs a ' + column + '.');
      });
    }
    if (Object.keys(fields).length === 0 && files.length === 0 && !request.videoFileId) {
      throw new Error('There was nothing new to save.');
    }

    // Files first: if Drive fails, the Sheet is left exactly as it was.
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

    const result = {
      champion: name,
      isNewChampion: !existing,
      updated: Object.keys(fields),
      files: savedFiles.map(file => file.fileName),
    };
    logSubmission(request.submissionId, technician, result);
    return result;
  } finally {
    lock.releaseLock();
  }
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
// This also stops anyone typing a spreadsheet formula into a name.
function cleanName(value, label) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Please choose a ' + label + '.');
  if (!/^[\p{L}][\p{L} .'-]{1,79}$/u.test(name)) {
    throw new Error('The ' + label + ' name can only contain letters, spaces, hyphens and apostrophes.');
  }
  return name;
}

// Matching ignores capital letters, so "aya ndlovu" finds "Aya Ndlovu" instead of adding a duplicate.
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

// Saves one file as "<Full Name> Photo 1.jpg" (and so on) in the champion's
// own folder. A file already there for that slot is moved to the Drive bin
// (recoverable for 30 days) and replaced.
function saveFile(championName, file) {
  const kind = FILE_COLUMNS[file.column];
  if (!kind) throw new Error('Unknown evidence slot: ' + file.column);
  const extension = EXTENSIONS[file.mimeType];
  if (!extension || file.mimeType.indexOf(kind) !== 0) {
    throw new Error(file.column + ': this type of file is not accepted (' + file.mimeType + ').');
  }

  const baseName = championName + ' ' + file.column;
  const fileName = baseName + '.' + extension;
  const folder = championFolder(championName);
  binExistingFile(folder, baseName);
  const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.mimeType, fileName);
  const saved = folder.createFile(blob);
  return { column: file.column, fileName: fileName, url: saved.getUrl() };
}

// A minute of video is too big to pass through this script, so the phone
// uploads it straight to Drive. This asks Drive for a one-time upload address
// that accepts only this one file, of exactly this size, into the champion's
// folder. The file arrives named "(uploading)" until the submission is saved.
function startVideoUpload(request) {
  const typed = cleanName(request.champion, 'champion');
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
// into this champion's folder is accepted.
function finishVideoUpload(championName, fileId) {
  const folder = championFolder(championName);
  const file = DriveApp.getFileById(String(fileId));
  const parents = file.getParents();
  const baseName = championName + ' Video';
  if (!parents.hasNext() || parents.next().getId() !== folder.getId() || file.getName().indexOf(baseName) !== 0) {
    throw new Error('The uploaded video could not be found. Please add the video again.');
  }
  const fileName = baseName + '.' + file.getName().split('.').pop();
  if (file.getName() !== fileName) {
    binExistingFile(folder, baseName);
    file.setName(fileName);
  }
  return { column: 'Video', fileName: fileName, url: file.getUrl() };
}

function binExistingFile(folder, baseName) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().replace(/\.[^.]+$/, '') === baseName) file.setTrashed(true);
  }
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

function logSubmission(submissionId, technician, result) {
  submissionsSheet().appendRow([
    new Date(), String(submissionId || ''), technician, result.champion,
    result.updated.join(', '), JSON.stringify(result),
  ]);
}

// ---------- One-time demo setup ----------

// Run this once from the Apps Script editor (select setupDemo, press Run).
// It builds the demo tabs with fictional champions and a demo media folder.
function setupDemo() {
  const spreadsheet = SpreadsheetApp.getActive();
  if (spreadsheet.getName().indexOf('LIVE') !== -1) {
    throw new Error('This is the LIVE sheet. Run setupDemo only on the demo sheet.');
  }
  if (spreadsheet.getSheetByName('Champions')) {
    throw new Error('A Champions tab already exists, so setup has already been run. Nothing was changed.');
  }

  const champions = spreadsheet.insertSheet('Champions');
  champions.appendRow(CHAMPION_COLUMNS);
  [
    ['Aya Ndlovu', 'Gauteng', 'Physical', 'Completed', new Date(2026, 2, 4), '', 'Pass'],
    ['Bongani Khumalo', 'Limpopo', 'Trailer', 'Completed', new Date(2026, 2, 9), '', 'Pass'],
    ['Chloe Adams', 'Free State', 'Physical', 'Completed', new Date(2026, 2, 15), '', 'Pending'],
    ['Dumisani Ngcobo', 'KwaZulu-Natal', 'Trailer', 'In Progress', '', '', 'Pending'],
    ['Priya Naidoo', 'North West', 'Trailer', 'Pipeline', '', 'Week of 9 Nov 2026', ''],
    ['Sam Carter', 'Northern Cape', 'Physical', 'Not Started', '', '', ''],
  ].forEach(row => champions.appendRow(row.concat(['', '', '', '', '', ''])));
  champions.getRange('E:E').setNumberFormat('dd mmm yyyy');
  champions.getRange('F:F').setNumberFormat('@');
  champions.setFrozenRows(1);

  const technicians = spreadsheet.insertSheet('Technicians');
  technicians.appendRow(['Name']);
  ['Lerato Mokoena', 'Johan van Wyk', 'Nomsa Dlamini'].forEach(name => technicians.appendRow([name]));
  technicians.setFrozenRows(1);

  submissionsSheet().setFrozenRows(1);

  const folder = DriveApp.createFolder('Water Champions DEMO media');
  PropertiesService.getScriptProperties().setProperty('MEDIA_FOLDER_ID', folder.getId());
  Logger.log('Demo set up. Media folder: ' + folder.getUrl());
}
