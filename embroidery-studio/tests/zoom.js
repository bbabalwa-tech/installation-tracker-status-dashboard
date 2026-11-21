const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(2500);
  await p.click('[data-tool=stitch]'); await p.click('#sheetClose'); await p.waitForTimeout(300);
  const box = await p.locator('#cv').boundingBox();
  // zoom on the sunflower centre/petal and on the lettering
  for (const [name, mx, my] of [['zoom-petal', 0.44, 0.33], ['zoom-text', 0.5, 0.82]]) {
    await p.click('#zfit'); await p.waitForTimeout(100);
    for (let i = 0; i < 9; i++) { await p.mouse.move(box.x + box.width * mx, box.y + box.height * my); await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
    await p.waitForTimeout(400); await p.screenshot({ path: out + '/' + name + '.png' });
  }
  await b.close();
})();
