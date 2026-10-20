// headless: menu must render with WebGL disabled (shows the 3D-graphics notice, Start disabled) and work normally with WebGL.
// usage: node test/nogl.mjs [url=http://localhost:4173/] [tag=nogl]
import { chromium } from '/workspace/tools/pw/node_modules/playwright-core/index.mjs';
const [url = 'http://localhost:4173/', tag = 'nogl'] = process.argv.slice(2);
const exe = '/workspace/tools/chr/root/usr/lib/chromium/chromium';
const runs = [
  ['nogl', ['--no-sandbox', '--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis', '--use-gl=disabled']],
  ['gl', ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']],
];
for (const [name, args] of runs) {
  const browser = await chromium.launch({ executablePath: exe, args });
  for (const mode of ['desk', 'phone']) {
    const o = mode === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } };
    const page = await (await browser.newContext(o)).newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl'), cards: document.querySelectorAll('#tracks .track').length, cars: document.querySelectorAll('#cars .car').length, notice: document.querySelector('#nogl')?.innerText.split('\n')[0] || null, goDisabled: document.querySelector('#go').disabled, goText: document.querySelector('#go').textContent }));
    await page.screenshot({ path: `/tmp/sh/${tag}_${name}_${mode}_menu.png` });
    let after = null;
    if (mode === 'desk') { await page.evaluate(() => window.__rwr.start()); await page.waitForTimeout(name === 'gl' ? 6000 : 1000);
      after = await page.evaluate(() => ({ menuVisible: !document.querySelector('#menu').classList.contains('hide'), hud: !document.querySelector('#hud').classList.contains('hide'), loading: !document.querySelector('#loading').classList.contains('hide'), game: !!window.__rwr.game, canvas: !!document.querySelector('body > canvas') }));
      await page.screenshot({ path: `/tmp/sh/${tag}_${name}_${mode}_afterstart.png` }); }
    console.log(name, mode, JSON.stringify(st), JSON.stringify(after), errs.length ? 'PAGEERRORS ' + errs.join(' | ') : 'no page errors');
  }
  await browser.close();
}
