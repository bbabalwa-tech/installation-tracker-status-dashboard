const { chromium, devices } = require('playwright'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { makeEnv } = require('./fakegas');
// Generated test files and screenshots go to the system temp folder, not the repo.
const DIR = path.join(__dirname, '..', 'intake'); const SP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'intake-test-'));
(async () => {
  const env = makeEnv(); env.ctx.setupDemo(); env.props.PASSCODE = 'demo123';
  const browser = await chromium.launch();
  // Big "camera" photo
  const gen = await browser.newPage({ viewport: { width: 4000, height: 3000 } });
  await gen.setContent('<canvas id=c width=4000 height=3000></canvas><script>const x=c.getContext("2d"),d=x.createImageData(4000,3000);for(let i=0;i<d.data.length;i++)d.data[i]=(i%4==3)?255:(Math.random()*255|0);x.putImageData(d,0,0)</script><style>body{margin:0}</style>');
  await gen.screenshot({ path: SP + '/big.jpg', type: 'jpeg', quality: 95 }); await gen.close();
  fs.writeFileSync(SP + '/lab.pdf', '%PDF-1.4 fake');
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  let calls = 0;
  await page.route('https://app.test/**', async route => {
    const req = route.request(); const p = new URL(req.url()).pathname.slice(1) || 'index.html';
    let body = fs.readFileSync(path.join(DIR, p));
    if (p === 'app.js') body = body.toString().replace("const API_URL = 'https://script.google.com/macros/s/AKfycbzf6Mbgs1JfrvqXvIp5N3NJTX5sopAOX_Y9SLZFNijwznZjLNFdW6UXrLYwXlFN5KABLA/exec';", "const API_URL = 'https://api.test/exec';");
    const type = { html: 'text/html', js: 'text/javascript', png: 'image/png', webmanifest: 'application/manifest+json' }[p.split('.').pop()];
    route.fulfill({ body, contentType: type });
  });
  await page.route('https://api.test/**', async route => {
    const body = route.request().postData(); if (JSON.parse(body).action === 'submit') calls++;
    assert.equal(route.request().headers()['content-type'], 'text/plain');
    await new Promise(r => setTimeout(r, 400));
    const res = env.post(JSON.parse(body));
    route.fulfill({ body: JSON.stringify(res), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
  });
  // Fake Google Drive upload address
  let putCount = 0;
  await page.route('https://upload.test/**', async route => {
    const req = route.request(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    putCount++; const n = Number(new URL(req.url()).pathname.split('/').pop());
    const id = env.finishUpload(n, req.postDataBuffer() || Buffer.alloc(0));
    route.fulfill({ status: 200, body: JSON.stringify({ id }), contentType: 'application/json', headers: cors });
  });
  await page.goto('https://app.test/index.html');
  await page.screenshot({ path: SP + '/1-signin.png', fullPage: true });
  await page.fill('#passcode', 'wrong'); await page.click('#signin-button');
  await page.waitForSelector('.message.error'); assert.match(await page.textContent('#message'), /Wrong passcode/);
  await page.fill('#passcode', 'demo123'); await page.click('#signin-button');
  await page.waitForSelector('#submit-form:not([hidden])');
  // Existing champion prefill
  await page.selectOption('#technician', 'Nomsa Dlamini');
  await page.selectOption('#champion', 'Aya Ndlovu');
  assert.equal(await page.inputValue('select[name="Province"]'), 'Gauteng');
  assert.equal(await page.inputValue('input[name="Deployment Date"]'), '2026-03-04');
  // Nothing changed
  await page.click('#submit-button'); assert.match(await page.textContent('#message'), /Nothing has changed/);
  // Add photo 1 via gallery input
  await page.setInputFiles('.slot[data-column="Photo 1"] input:not([capture])', SP + '/big.jpg');
  await page.waitForSelector('.slot[data-column="Photo 1"] .slot-status.ready');
  console.log('original', (fs.statSync(SP + '/big.jpg').size/1024).toFixed(0), 'KB ->', await page.textContent('.slot[data-column="Photo 1"] .slot-status'));
  await page.setInputFiles('.slot[data-column="Lab Report"] input', SP + '/lab.pdf');
  // 30 MB video: above the old limit, now accepted
  fs.writeFileSync(SP + '/walk.mp4', Buffer.alloc(30 * 1024 * 1024, 1));
  await page.setInputFiles('.slot[data-column="Video"] input:not([capture])', SP + '/walk.mp4');
  await page.waitForSelector('.slot[data-column="Video"] .slot-status.ready');
  await page.selectOption('select[name="Water Quality"]', 'Pass');
  await page.screenshot({ path: SP + '/2-form.png', fullPage: true });
  // Double tap
  const before = calls;
  await page.click('#submit-button'); await page.click('#submit-button', { force: true }).catch(() => {});
  await page.waitForSelector('.message.success');
  assert.equal(calls - before, 1, 'double tap sent once');
  const msg = await page.textContent('#message'); console.log('confirmation:', msg);
  assert.match(msg, /Aya Ndlovu Video.mp4/); assert.equal(putCount, 1);
  assert.ok(env.files.find(f => f.name === 'Aya Ndlovu Video.mp4' && !f.trashed));
  assert.match(msg, /Aya Ndlovu Photo 1.jpg/); assert.match(msg, /Aya Ndlovu Lab Report.pdf/);
  const photo = env.files.find(f => f.name === 'Aya Ndlovu Photo 1.jpg'); console.log('saved photo bytes', photo.bytes.length);
  assert.ok(photo.bytes.length < 1024 * 1024);
  assert.equal(env.sheets.Champions[1][6], 'Pass'); assert.equal(env.sheets.Champions[1][1], 'Gauteng');
  await page.screenshot({ path: SP + '/3-confirm.png', fullPage: true });
  // New champion, pipeline
  await page.waitForTimeout(500);
  await page.selectOption('#champion', '__new__');
  await page.fill('#new-champion', 'Kagiso Sithole');
  await page.selectOption('select[name="Province"]', 'Limpopo'); await page.selectOption('select[name="Site Type"]', 'Physical');
  await page.selectOption('select[name="Status"]', 'Pipeline');
  assert.ok(await page.isHidden('#date-field')); await page.fill('input[name="Scheduled Week"]', 'Week of 16 Nov 2026');
  await page.click('#submit-button'); await page.waitForSelector('.message.success');
  const k = env.sheets.Champions.at(-1); assert.equal(k[0], 'Kagiso Sithole'); assert.equal(k[5], 'Week of 16 Nov 2026'); assert.equal(k[4], '');
  // Failure path: network down
  await page.waitForTimeout(500);
  await page.selectOption('#champion', 'Sam Carter'); await page.selectOption('select[name="Status"]', 'In Progress');
  await page.route('https://api.test/**', r => r.abort(), { times: 1 });
  await page.click('#submit-button'); await page.waitForSelector('.message.error');
  assert.match(await page.textContent('#message'), /Could not reach the server/);
  await page.screenshot({ path: SP + '/4-error.png', fullPage: true });
  await page.click('#submit-button'); await page.waitForSelector('.message.success');
  // Evidence view
  await page.waitForTimeout(500);
  await page.click('#tab-evidence'); await page.screenshot({ path: SP + '/5-evidence.png', fullPage: true });
  const summary = await page.textContent('#evidence-summary'); console.log('summary:', summary);
  await page.click('[data-champion="Chloe Adams"]'); assert.equal(await page.inputValue('#champion'), 'Chloe Adams');
  // Reload keeps sign-in
  await page.reload(); await page.waitForSelector('#submit-form:not([hidden])');
  assert.deepEqual(errors.filter(e => !e.includes('ERR_FAILED')), []);
  console.log('UI tests passed');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
