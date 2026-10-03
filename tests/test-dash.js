const { chromium, devices } = require('playwright'); const fs = require('fs'); const assert = require('assert');
const cols = ['Name','Province','Site Type','Status','Deployment Date','Scheduled Week','Water Quality','Photo 1','Photo 2','Photo 3','Video','Lab Report','Lab Certificate'];
const L = id => ({ v: 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk' });
const S = v => v === null ? null : { v };
const D = (y, m, d, f) => ({ v: `Date(${y},${m},${d})`, f });
const rows = [
  [S('Riverside Community Hall'), S('Gauteng'), S('Trailer'), S('Completed'), D(2026,2,4,'04 Mar 2026'), null, S('Pass'), L('p1'), L('p2'), L('p3'), L('vid1'), L('lab1'), L('cert1')],
  [S('Hilltop Clinic'), S('Limpopo'), S('Trailer'), S('Completed'), D(2026,2,9,'09 Mar 2026'), null, S('Pass'), null, null, null, null, null, null],
  [S('Northfield Sports Ground'), S('North West'), S('Trailer'), S('Pipeline'), null, S('Week of 9 Nov 2026'), null, null, null, null, null, null, null],
  [S('Sunnyridge Community Garden'), S('Northern Cape'), S('Physical'), S('Not Started'), null, null, null, null, null, null, null, null, null],
];
let extra = null; let sheetPublic = true;
function body() {
  const all = extra ? rows.concat([extra]) : rows;
  const table = { cols: cols.map((label, i) => ({ id: String.fromCharCode(65 + i), label, type: i === 4 ? 'date' : 'string' })), rows: all.map(c => ({ c })) };
  return '/*O_o*/\ngoogle.visualization.Query.setResponse(' + JSON.stringify({ version: '0.6', status: 'ok', table }) + ');';
}
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let gvizUrl = '';
  await page.route('https://docs.google.com/**', r => { gvizUrl = r.request().url(); return sheetPublic
    ? r.fulfill({ body: body(), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } })
    : r.fulfill({ status: 302, headers: { location: 'https://accounts.google.com/login' } }); });
  await page.route('https://drive.google.com/**', r => r.fulfill({ body: '<html><body style="background:#444"></body></html>', contentType: 'text/html' }));
  await page.route('https://accounts.google.com/**', r => r.fulfill({ body: 'login', contentType: 'text/html' }));
  await page.goto('file://' + require('path').join(__dirname, '..', 'dashboard', 'index.html'));
  await page.waitForSelector('.card');
  assert.match(gvizUrl, /1WvlIn55anoNlHV-j5nYOF2xaZ29U4MW-rgS7-b3mqEY\/gviz\/tq\?tqx=out:json&headers=1&sheet=Champions/);
  assert.equal(await page.locator('.card').count(), 4);
  assert.equal(await page.textContent('#s-total'), '4'); assert.equal(await page.textContent('#s-done'), '2');
  const aya = page.locator('.card').first(); assert.match(await aya.textContent(), /Riverside Community Hall.*04 Mar 2026.*Pass/s);
  assert.equal(await aya.locator('.thumb img').first().getAttribute('src'), 'https://drive.google.com/thumbnail?id=p1&sz=w1600');
  assert.equal(await aya.locator('.video-box iframe').getAttribute('src'), 'https://drive.google.com/file/d/vid1/preview');
  await aya.locator('.lab-btn').click(); assert.equal(await page.getAttribute('#pdf-frame', 'src'), 'https://drive.google.com/file/d/lab1/preview'); await page.click('#lb-pdf .lb-close');
  assert.match(await page.textContent('.card:has-text("Northfield")'), /Scheduled: Week of 9 Nov 2026/);
  await page.selectOption('#f-stat', 'Pipeline'); assert.equal(await page.locator('.card:not(.hidden)').count(), 1); await page.selectOption('#f-stat', '');
  await page.screenshot({ path: require('os').tmpdir() + '/dash-before.png', fullPage: true });
  // Simulate an intake submission for a new site, then refresh
  extra = [S('Westbank Market'), S('Western Cape'), S('Physical'), S('Completed'), D(2026,9,2,'02 Oct 2026'), null, S('Pending'), L('k1'), null, null, null, null, null];
  await page.reload(); await page.waitForSelector('.card:has-text("Westbank Market")');
  assert.equal(await page.textContent('#s-total'), '5');
  // Private sheet -> clear message
  sheetPublic = false; await page.reload(); await page.waitForSelector('#grid p:has-text("Could not read")');
  assert.deepEqual(errs, []); console.log('dashboard tests passed'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
