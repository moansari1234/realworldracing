// end-to-end check of the deployed site through the sandbox proxy (credentials read from env, never printed)
import { chromium } from '/workspace/tools/pw/node_modules/playwright-core/index.mjs';
const pu = new URL(process.env.HTTPS_PROXY);
const [mode, q, tag] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/workspace/tools/chr/root/usr/lib/chromium/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  proxy: { server: `http://${pu.host}`, username: decodeURIComponent(pu.username), password: decodeURIComponent(pu.password) } });
const o = mode === 'phone' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const page = await (await browser.newContext({ ...o, ignoreHTTPSErrors: true })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 160)); });
let mlyReq = 0, mlyOk = 0, thumbs = 0; page.on('response', r => { const u = r.url(); if (u.includes('/api/mly')) { mlyReq++; if (r.ok()) mlyOk++; } if (u.includes('fbcdn.net')) thumbs++; });
await page.goto('https://realworldracing.vercel.app/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);
const res = JSON.parse((await import('fs')).readFileSync(q, 'utf8')); delete res.data.mly;
await page.evaluate((r) => window.__rwr.live(r), res); await page.evaluate(() => window.__rwr.start());
for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => window.__rwr.game?.state)) break; }
await page.evaluate(() => { window.__rwr.game.count = 0; });
let st; for (let i = 0; i < 60; i++) { await page.waitForTimeout(1000); st = await page.evaluate(() => window.__rwr.game.mly?.stats); if (st && /done|none|error/.test(st.state)) break; }
console.log('mly', JSON.stringify(st), 'requests', mlyReq, 'ok', mlyOk, 'thumbs', thumbs);
await page.evaluate((wf) => { const g = window.__rwr.game; const P = g.player; const w = g.track.length * wf; const p = g.track.pointAt(w); P.x = p.x; P.z = p.z; P.y = p.y; P.h = Math.atan2(p.tx, p.tz); P.hint = p.i; P.s = w; g.ais.forEach((a, k) => { a.v.s = w + 14 + k * 9; }); g.camPos.set(P.x - Math.sin(P.h) * 12, P.y + 5, P.z - Math.cos(P.h) * 12); }, +(process.env.WARP || 0.62));
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(1500);
await page.screenshot({ path: `/tmp/sh/${tag}_race.png`, timeout: 120000 });
console.log('gen:', await page.evaluate(() => document.querySelector('#gen').textContent), 'credit:', await page.evaluate(() => !document.querySelector('#mlycredit').classList.contains('hide')));
await browser.close();
