// Node harness: generate a live race from OSM, fetch Mapillary detail directly (token injected by the sandbox gateway),
// inline the facade thumbnails as data URLs (headless Chromium can't reach the internet) and write res JSON.
import fs from 'fs';
import { generateRace } from '../web/src/live/builder.js';
import { fetchStreetDetail, setEndpoint, classifyFeature } from '../web/src/live/mapillary.js';
const [name, pinsArg, out] = process.argv.slice(2);
const pins = pinsArg.split(';').map(p => p.split(',').map(Number));
const t0 = Date.now();
const res = await generateRace(pins, (m) => process.stderr.write('  ' + m + '\n'), { name });
const t1 = Date.now();
setEndpoint('https://graph.mapillary.com', true);
const raw = await fetchStreetDetail(res.data, { budget: 60000, concurrency: 4 });
const t2 = Date.now();
const kinds = {}; for (const f of raw.features) { const k = classifyFeature(f[2]) || '(skip)'; kinds[k] = (kinds[k] || 0) + 1; }
// inline thumbnails (only the ones the client could use: spread along the route; client picks ≤36)
let ok = 0; const imgs = raw.images.slice(0, 160);
await Promise.all(imgs.map(async (im) => { try { const r = await fetch(im.url); const b = Buffer.from(await r.arrayBuffer()); im.url = 'data:image/jpeg;base64,' + b.toString('base64'); ok++; } catch (e) { im.url = ''; } }));
res.data.mly = { features: raw.features, images: imgs.filter(i => i.url) };
fs.writeFileSync(out, JSON.stringify(res));
console.log(JSON.stringify({ name: res.data.name, km: (res.data.length / 1000).toFixed(2), buildings: res.data.buildings.length, genMs: t1 - t0, mlyMs: t2 - t1, tiles: raw.tiles, jobs: raw.jobs, failed: raw.failed, features: raw.features.length, images: raw.images.length, thumbsInlined: ok, kinds }));
