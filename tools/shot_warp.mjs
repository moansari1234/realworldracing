// headless: inject a pre-generated live race (or ?track=<key>), warp to fractions of the route, screenshot each.
// usage: node test/shot_warp.mjs <res.json|track:key> <tag> <frac,frac,...> [cam=2] [mode=desk|phone]
import { chromium } from '/workspace/tools/pw/node_modules/playwright-core/index.mjs'; import fs from 'fs';
const [src, tag, fracs, cam = '2', mode = 'desk'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/workspace/tools/chr/root/usr/lib/chromium/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const o = mode === 'phone' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const page = await (await browser.newContext(o)).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });
const isTrack = src.startsWith('track:');
await page.goto('http://localhost:4173/?mly=0' + (isTrack ? '&track=' + src.slice(6) : ''), { waitUntil: 'load' }); await page.waitForTimeout(1500);
if (!isTrack) { const res = JSON.parse(fs.readFileSync(src, 'utf8')); await page.evaluate((r) => window.__rwr.live(r), res); await page.waitForTimeout(500); }
await page.evaluate(() => window.__rwr.start()); await page.waitForTimeout(500); await page.evaluate(() => { window.__rwr.game.count = 0; });
for (const f of fracs.split(',')) {
  await page.evaluate(([f, cm]) => { const g = window.__rwr.game; const P = g.player; const w = g.track.length * f; const p = g.track.pointAt(w); P.x = p.x; P.z = p.z; P.y = p.y; P.h = Math.atan2(p.tx, p.tz); P.hint = p.i; P.s = w; P.v = 0; g.camMode = cm; g.ais.forEach((a, k) => { a.v.s = w + 30 + k * 9; }); g.camPos.set(P.x - Math.sin(P.h) * 12, P.y + 5, P.z - Math.cos(P.h) * 12); }, [+f, +cam]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/sh/${tag}_${f}.png`, timeout: 120000 });
}
console.log(JSON.stringify(await page.evaluate(() => { const g = window.__rwr.game; return { water: g.data.water.length, L: g.track.length }; })));
await browser.close();
