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
const live = makeEnv('Water Champions Dashboard (LIVE)'); assert.throws(() => live.ctx.setupDemo(), /LIVE/);
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
console.log('backend tests passed; submissions logged:', env.sheets.Submissions.length - 1);
