import fs from 'fs'; import { Track } from '../web/src/track.js'; import { projector } from '../web/src/live/bake.js'; import { classifyFeature } from '../web/src/live/mapillary.js';
const res = JSON.parse(fs.readFileSync(process.argv[2])); const d = res.data; const T = new Track(d); const P = projector(...d.origin);
const B = {}; const far = {};
for (const [lo, la, v] of d.mly.features) { const k = classifyFeature(v); if (!k) continue; const [x, z] = P(la, lo); const q = T.nearest(x, z); const b = Math.floor(q.s / 200); if (q.d < q.w / 2 + 22) B[b] = (B[b] || 0) + 1; else far[b] = (far[b] || 0) + 1; }
console.log('L', T.length|0, JSON.stringify(B), 'far', JSON.stringify(far));
