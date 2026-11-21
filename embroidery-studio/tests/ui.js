const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(2500);
  await p.screenshot({ path: out + '/ui-1.png' });
  await p.click('[data-tool=stitch]'); await p.waitForTimeout(800); await p.screenshot({ path: out + '/ui-2.png' });
  await p.click('[data-tool=export]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xpes')]); await dl.saveAs(out + '/ui.pes');
  await p.click('[data-tool=text]'); await p.waitForTimeout(300); await p.fill('#tt', 'HELLO'); await p.selectOption('#tf', 'block'); await p.click('#tadd'); await p.waitForTimeout(1500);
  await p.click('[data-tool=ai]'); await p.waitForTimeout(300); await p.screenshot({ path: out + '/ui-3.png' });
  await p.setViewportSize({ width: 1280, height: 800 }); await p.click('[data-tool=stitch]'); await p.waitForTimeout(800); await p.screenshot({ path: out + '/ui-4.png' });
  console.log('errors:', errs); await b.close();
})();
