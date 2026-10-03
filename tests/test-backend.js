const assert = require('assert'); const { makeEnv } = require('./fakegas');
const env = makeEnv(); env.ctx.setupDemo(); env.props.PASSCODE = 'demo123';
const P = 'demo123';
let r = env.post({ action: 'load', passcode: 'nope' }); assert.equal(r.ok, false); assert.match(r.error, /Wrong/);
r = env.post({ action: 'load', passcode: P }); assert.ok(r.ok); assert.equal(r.champions.length, 6); assert.equal(r.technicians.length, 3);
assert.equal(r.champions[0]['Deployment Date'], '2026-03-04');
const img = Buffer.from('fakejpeg').toString('base64');
// Partial update: only a lab report for existing champion, lowercase name
r = env.post({ action: 'submit', passcode: P, submissionId: 's1', technician: 'Lerato Mokoena', champion: 'chloe adams', fields: { 'Water Quality': 'Pass' },
  files: [{ column: 'Lab Report', mimeType: 'application/pdf', data: img }] });
assert.ok(r.ok, r.error); assert.equal(r.champion, 'Chloe Adams'); assert.deepEqual(r.files, ['Chloe Adams Lab Report.pdf']);
const chloe = env.sheets.Champions[3]; assert.equal(chloe[0], 'Chloe Adams'); assert.equal(chloe[6], 'Pass'); assert.match(chloe[11], /drive.google.com/);
assert.equal(chloe[1], 'Free State'); assert.equal(Object.prototype.toString.call(chloe[4]), '[object Date]', 'date kept');
assert.equal(env.sheets.Champions.length, 7, 'no duplicate row');
// Repeat with same id → no reprocessing
const fileCount = env.files.length;
r = env.post({ action: 'submit', passcode: P, submissionId: 's1', technician: 'Lerato Mokoena', champion: 'Chloe Adams', fields: {}, files: [{ column: 'Lab Report', mimeType: 'application/pdf', data: img }] });
assert.ok(r.repeat); assert.equal(env.files.length, fileCount);
// Replace lab report → old binned
r = env.post({ action: 'submit', passcode: P, submissionId: 's2', technician: 'Lerato Mokoena', champion: 'Chloe Adams', files: [{ column: 'Lab Report', mimeType: 'application/pdf', data: img }] });
assert.ok(r.ok); assert.equal(env.files.filter(f => !f.trashed && f.name === 'Chloe Adams Lab Report.pdf').length, 1);
assert.equal(env.files.filter(f => f.trashed).length, 1);
// New champion + new technician, video mov
r = env.post({ action: 'submit', passcode: P, submissionId: 's3', technician: 'Sipho Zulu', champion: 'Zanele  Mthembu', fields: { Province: 'Western Cape', 'Site Type': 'Trailer', Status: 'Completed', 'Deployment Date': '2026-09-30' },
  files: [{ column: 'Photo 1', mimeType: 'image/jpeg', data: img }, { column: 'Video', mimeType: 'video/quicktime', data: img }] });
assert.ok(r.ok, r.error); assert.equal(r.isNewChampion, true); assert.deepEqual(r.files, ['Zanele Mthembu Photo 1.jpg', 'Zanele Mthembu Video.mov']);
const z = env.sheets.Champions.at(-1); assert.equal(z.length, 13); assert.equal(z[0], 'Zanele Mthembu'); assert.equal(z[4].getFullYear(), 2026); assert.match(z[7], /drive/); assert.equal(z[8], '');
assert.equal(env.sheets.Technicians.at(-1)[0], 'Sipho Zulu');
// New champion missing province
r = env.post({ action: 'submit', passcode: P, submissionId: 's4', technician: 'Sipho Zulu', champion: 'New Person', fields: { Status: 'Pipeline' } }); assert.match(r.error, /Province/);
// Bad values
r = env.post({ action: 'submit', passcode: P, submissionId: 's5', technician: 'Sipho Zulu', champion: 'Aya Ndlovu', fields: { Status: 'Done' } }); assert.match(r.error, /not a valid Status/);
r = env.post({ action: 'submit', passcode: P, submissionId: 's6', technician: '=HYPERLINK("x")', champion: 'Aya Ndlovu', fields: { Status: 'Completed' } }); assert.match(r.error, /only contain letters/);
r = env.post({ action: 'submit', passcode: P, submissionId: 's7', technician: 'Sipho Zulu', champion: 'Aya Ndlovu', files: [{ column: 'Photo 1', mimeType: 'application/pdf', data: img }] }); assert.match(r.error, /not accepted/);
r = env.post({ action: 'submit', passcode: P, submissionId: 's8', technician: 'Sipho Zulu', champion: 'Aya Ndlovu', fields: { 'Scheduled Week': '=1+1' } }); assert.match(r.error, /scheduled week/);
r = env.post({ action: 'submit', passcode: P, submissionId: 's9', technician: 'Sipho Zulu', champion: 'Aya Ndlovu', fields: { Province: '' } }); assert.match(r.error, /nothing new/);
// Empty values never wipe
assert.equal(env.sheets.Champions[1][1], 'Gauteng');
// Header contract
env.sheets.Champions[0][5] = 'Week'; r = env.post({ action: 'load', passcode: P }); assert.match(r.error, /columns do not match/); env.sheets.Champions[0][5] = 'Scheduled Week';
// LIVE guard
const live = makeEnv('Water Programme Dashboard (LIVE)'); assert.throws(() => live.ctx.setupDemo(), /LIVE/);
// Lockout
for (let i = 0; i < 10; i++) env.post({ action: 'load', passcode: 'x' });
r = env.post({ action: 'load', passcode: P }); assert.match(r.error, /Too many/);
// Missing passcode property
const fresh = makeEnv(); fresh.ctx.setupDemo(); assert.match(fresh.post({ action: 'load', passcode: '' }).error, /No passcode/);
// Video straight to Drive
const env2 = makeEnv(); env2.ctx.setupDemo(); env2.props.PASSCODE = P;
let v = env2.post({ action: 'startVideoUpload', passcode: P, champion: 'aya ndlovu', mimeType: 'video/quicktime', size: 150 * 1024 * 1024, origin: 'https://bbabalwa-tech.github.io' });
assert.ok(v.ok, v.error); assert.equal(v.uploadUrl, 'https://upload.test/session/0');
const up = env2.uploads[0]; assert.equal(up.meta.name, 'Aya Ndlovu Video (uploading).mov'); assert.equal(up.opts.headers.Origin, 'https://bbabalwa-tech.github.io'); assert.equal(up.opts.headers['X-Upload-Content-Length'], String(150 * 1024 * 1024));
assert.match(env2.post({ action: 'startVideoUpload', passcode: P, champion: 'Aya Ndlovu', mimeType: 'video/mp4', size: 201 * 1024 * 1024 }).error, /too large/);
assert.match(env2.post({ action: 'startVideoUpload', passcode: 'x', champion: 'Aya Ndlovu', mimeType: 'video/mp4', size: 10 }).error, /Wrong/);
assert.match(env2.post({ action: 'startVideoUpload', passcode: P, champion: 'Aya Ndlovu', mimeType: 'application/pdf', size: 10 }).error, /not accepted/);
// an older video already on file gets binned
const fid0 = env2.finishUpload(0, Buffer.from('old')); env2.files.find(f => f.id === fid0).name = 'Aya Ndlovu Video.mp4';
v = env2.post({ action: 'startVideoUpload', passcode: P, champion: 'Aya Ndlovu', mimeType: 'video/quicktime', size: 100 });
const fid = env2.finishUpload(1, Buffer.from('new'));
r = env2.post({ action: 'submit', passcode: P, submissionId: 'v1', technician: 'Nomsa Dlamini', champion: 'Aya Ndlovu', fields: {}, files: [], videoFileId: fid });
assert.ok(r.ok, r.error); assert.deepEqual(r.files, ['Aya Ndlovu Video.mov']);
assert.match(env2.sheets.Champions[1][10], new RegExp(fid));
assert.equal(env2.files.find(f => f.id === fid0).trashed, true); assert.equal(env2.files.find(f => f.id === fid).name, 'Aya Ndlovu Video.mov');
// retry after rename (different submission id) is fine and does not bin itself
r = env2.post({ action: 'submit', passcode: P, submissionId: 'v2', technician: 'Nomsa Dlamini', champion: 'Aya Ndlovu', videoFileId: fid });
assert.ok(r.ok, r.error); assert.equal(env2.files.find(f => f.id === fid).trashed, false);
// someone else's file id is refused
r = env2.post({ action: 'submit', passcode: P, submissionId: 'v3', technician: 'Nomsa Dlamini', champion: 'Chloe Adams', videoFileId: fid });
assert.match(r.error, /could not be found/);
// new champion: upload before the row exists
v = env2.post({ action: 'startVideoUpload', passcode: P, champion: 'Kagiso Sithole', mimeType: 'video/mp4', size: 100 });
const fid2 = env2.finishUpload(2, Buffer.from('k'));
r = env2.post({ action: 'submit', passcode: P, submissionId: 'v4', technician: 'Nomsa Dlamini', champion: 'Kagiso Sithole', fields: { Province: 'Limpopo', 'Site Type': 'Trailer', Status: 'Completed' }, videoFileId: fid2 });
assert.ok(r.ok, r.error); assert.equal(env2.sheets.Champions.at(-1)[10].includes(fid2), true);
// ---- Fixes after review ----
const env3 = makeEnv(); env3.ctx.setupDemo(); env3.props.PASSCODE = P;
// Per-phone lockout: phone A is locked, phone B still signs in
for (let i = 0; i < 10; i++) env3.post({ action: 'load', passcode: 'x', deviceId: 'phoneA' });
assert.match(env3.post({ action: 'load', passcode: P, deviceId: 'phoneA' }).error, /on this phone/);
assert.ok(env3.post({ action: 'load', passcode: P, deviceId: 'phoneB' }).ok);
// Shared ceiling: 100 misses from many phones pauses everyone
for (let i = 0; i < 90; i++) env3.post({ action: 'load', passcode: 'x', deviceId: 'p' + i });
assert.match(env3.post({ action: 'load', passcode: P, deviceId: 'phoneC' }).error, /paused/);
const env4 = makeEnv(); env4.ctx.setupDemo(); env4.props.PASSCODE = P;
const S4 = (o) => env4.post(Object.assign({ action: 'submit', passcode: P, deviceId: 'd', technician: 'Nomsa Dlamini', champion: 'Aya Ndlovu' }, o));
// A failed save is logged, marked, and a retry with the same ID still saves
r = S4({ submissionId: 'f1', fields: { Status: 'Done' } }); assert.equal(r.ok, false);
const failRow = env4.sheets.Submissions.at(-1); assert.equal(failRow[1], 'NOT SAVED f1'); assert.match(failRow[4], /NOT SAVED: "Done" is not a valid Status/);
r = S4({ submissionId: 'f1', fields: { Status: 'In Progress' } }); assert.ok(r.ok, r.error); assert.ok(!r.repeat);
// Wrong passcodes are not logged
const logLen = env4.sheets.Submissions.length; env4.post({ action: 'submit', passcode: 'bad', deviceId: 'z', submissionId: 'g' }); assert.equal(env4.sheets.Submissions.length, logLen);
// Busy lock gives a friendly message
env4.lockBusy.value = true; assert.match(S4({ submissionId: 'b1', fields: { Status: 'Completed' } }).error, /busy/); env4.lockBusy.value = false;
// Every file is checked before any is saved
r = S4({ submissionId: 'p1', files: [{ column: 'Photo 1', mimeType: 'image/jpeg', data: img }] }); assert.ok(r.ok, r.error);
const photoV1 = env4.files.find(f => f.name === 'Aya Ndlovu Photo 1.jpg' && !f.trashed);
const fileCount4 = env4.files.length;
r = S4({ submissionId: 'p2', files: [{ column: 'Photo 1', mimeType: 'image/jpeg', data: img }, { column: 'Photo 2', mimeType: 'application/pdf', data: img }] });
assert.match(r.error, /not accepted/); assert.equal(env4.files.length, fileCount4);
// Drive fails on the second file: old photo 1 stays, Sheet still points at it
const sheetLinkBefore = env4.sheets.Champions[1][7];
env4.driveFailAfter.value = 1;
r = S4({ submissionId: 'p3', files: [{ column: 'Photo 1', mimeType: 'image/jpeg', data: img }, { column: 'Photo 2', mimeType: 'image/jpeg', data: img }] });
assert.match(r.error, /Drive is unavailable/); env4.driveFailAfter.value = Infinity;
assert.equal(photoV1.trashed, false); assert.equal(env4.sheets.Champions[1][7], sheetLinkBefore);
// Retry finishes the job and bins both the old photo and the half-finished one
r = S4({ submissionId: 'p3', files: [{ column: 'Photo 1', mimeType: 'image/jpeg', data: img }, { column: 'Photo 2', mimeType: 'image/jpeg', data: img }] });
assert.ok(r.ok, r.error); assert.equal(photoV1.trashed, true);
assert.equal(env4.files.filter(f => f.name === 'Aya Ndlovu Photo 1.jpg' && !f.trashed).length, 1);
// Abandoned uploads older than a day are cleaned up on the next video submit; recent ones are left
env4.post({ action: 'startVideoUpload', passcode: P, deviceId: 'd', champion: 'Aya Ndlovu', mimeType: 'video/mp4', size: 10 });
const oldId = env4.finishUpload(0, Buffer.from('a')); const oldUpload = env4.files.find(f => f.id === oldId); oldUpload.created = new Date(Date.now() - 2 * 86400000);
env4.post({ action: 'startVideoUpload', passcode: P, deviceId: 'd', champion: 'Aya Ndlovu', mimeType: 'video/mp4', size: 10 });
const recentId = env4.finishUpload(1, Buffer.from('b')); const recentUpload = env4.files.find(f => f.id === recentId);
env4.post({ action: 'startVideoUpload', passcode: P, deviceId: 'd', champion: 'Aya Ndlovu', mimeType: 'video/mp4', size: 10 });
const vid = env4.finishUpload(2, Buffer.from('c'));
r = S4({ submissionId: 'v9', videoFileId: vid }); assert.ok(r.ok, r.error);
assert.equal(oldUpload.trashed, true); assert.equal(recentUpload.trashed, false);
console.log('backend tests passed; submissions logged:', env.sheets.Submissions.length - 1);
