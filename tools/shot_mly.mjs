// headless check: inject a pre-generated live race (with data.mly pre-fetched), start it, wait for Mapillary detail, screenshot
import { chromium } from '/workspace/tools/pw/node_modules/playwright-core/index.mjs'; import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/workspace/tools/chr/root/usr/lib/chromium/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [mode, file, tag, warpFrac = '0.3', night = '0', cam = '0'] = process.argv.slice(2); const res = JSON.parse(fs.readFileSync(file, 'utf8'));
const o = mode === 'phone' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const page = await (await browser.newContext(o)).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto('http://localhost:4173/', { waitUntil: 'load' }); await page.waitForTimeout(1200);
await page.evaluate((r) => window.__rwr.live(r), res); await page.waitForTimeout(500);
if (night === '1') await page.evaluate(() => { window.__rwr.sel.night = true; });
await page.evaluate(() => window.__rwr.start()); await page.evaluate(() => { window.__rwr.game.count = 0; });
const t0 = Date.now(); let st;
for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); st = await page.evaluate(() => window.__rwr.game.mly?.stats); if (st && /done|none|error|off/.test(st.state)) break; }
console.log('mly after', Date.now() - t0, 'ms', JSON.stringify(st));
await page.evaluate(([f, cm]) => { const g = window.__rwr.game; const P = g.player; const w = g.track.length * f; const p = g.track.pointAt(w); P.x = p.x; P.z = p.z; P.y = p.y; P.h = Math.atan2(p.tx, p.tz); P.hint = p.i; P.s = w; g.camMode = cm; g.ais.forEach((a, k) => { a.v.s = w + 14 + k * 9; }); g.camPos.set(P.x - Math.sin(P.h) * 12, P.y + 5, P.z - Math.cos(P.h) * 12); }, [+warpFrac, +cam]);
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(1500);
await page.screenshot({ path: `/tmp/sh/${tag}.png`, timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => { const g = window.__rwr.game; let vis = 0; g.mly?.group?.children.forEach(m => vis += m.count); return { visibleProps: vis, credit: !document.querySelector('#mlycredit').classList.contains('hide'), gen: document.querySelector('#gen').textContent }; })));
await browser.close();
