const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/*', r => r.fulfill({ path: out + '/pdfjs/node_modules/pdfjs-dist/build/' + r.request().url().split('/').pop(), contentType: 'text/javascript' }));
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(2000);
  await p.click('#newBtn');
  for (const f of ['logo.png', 'logo.pdf']) {
    if (!(await p.isVisible('#pf').catch(()=>false)) && !(await p.isVisible('#sheet'))) {} ; if (await p.getAttribute('[data-tool=import]','aria-pressed') !== 'true') await p.click('[data-tool=import]'); await p.setInputFiles('#pf', out + '/' + f); await p.waitForSelector('#pgo', { timeout: 20000 });
    await p.click('#pgo'); await p.waitForTimeout(1200);
    const n = await p.evaluate(() => document.querySelectorAll('.toast')[0].textContent); console.log(f, '->', n);
  }
  await p.click('[data-tool=stitch]'); await p.waitForTimeout(800); await p.screenshot({ path: out + '/import.png' });
  console.log('errors:', errs); await b.close();
})();
