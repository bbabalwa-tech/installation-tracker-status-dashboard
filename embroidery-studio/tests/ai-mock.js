// Simulates Claude calling the app's design tools, to check the AI path end to end.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => {
    const sample = async (input, opts) => {
      const T = Object.fromEntries(opts.tools.map(t => [t.name, t]));
      const log = [];
      log.push(await T.clear_design.execute({}));
      log.push(await T.set_settings.execute({ fabric: 'fleece', name: 'Mountain logo' }));
      log.push(await T.add_objects.execute({ objects: [
        { kind: 'fill', name: 'Sky disc', color: '#f6a03a', angle: 0, d: 'M 65 30 C 92 30 105 50 105 70 C 105 92 88 110 65 110 C 42 110 25 92 25 70 C 25 50 38 30 65 30 Z' },
        { kind: 'fill', name: 'Mountains', color: '#1d3557', angle: 135, d: 'M 22 100 L 50 55 L 62 72 L 78 48 L 108 100 Z' },
        { kind: 'satin', name: 'Snow line', color: '#ffffff', width: 2, d: 'M 70 58 Q 78 54 86 60' },
        { kind: 'run', name: 'Ground', color: '#1d3557', triple: true, d: 'M 20 104 L 110 104' },
        { kind: 'text', text: 'ADVENTURE', font: 'varsity', heightMm: 9, x: 65, y: 122, color: '#1d3557' },
      ] }));
      log.push(await T.get_stitch_report.execute({}));
      opts.onText({ text: 'Done. **Built your logo** for fleece.\n- Use cut-away\n- Add topping', delta: '' });
      window.__log = log;
      return { text: 'Done. **Built your logo** for fleece.\n- Use cut-away\n- Add topping', truncated: false };
    };
    window.claude = { use: async n => (n === 'sample' ? sample : null) };
  });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(2000);
  await p.click('[data-tool=ai]'); await p.fill('#chatIn', 'mountain logo for a hoodie'); await p.click('#sendAi'); await p.waitForTimeout(2500);
  console.log(JSON.stringify(await p.evaluate(() => window.__log), null, 0).slice(0, 1500));
  await p.screenshot({ path: out + '/ai-chat.png' });
  await p.click('[data-tool=stitch]'); await p.waitForTimeout(800); await p.click('#sheetClose'); await p.waitForTimeout(400);
  await p.screenshot({ path: out + '/ai-stitch.png' });
  console.log('errors:', errs); await b.close();
})();
