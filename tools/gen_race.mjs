// Node: generate a live race (no Mapillary) and write the res JSON for injection with window.__rwr.live(res).
// HTTP responses are cached in /tmp/rwr_http so re-bakes after code changes are offline + deterministic.
// RWR_NO_OVERPASS=1 forces the OSM API tile fallback.
// usage: NODE_USE_ENV_PROXY=1 node test/gen_race.mjs "<name>" "lat,lon;lat,lon" out.json
import fs from 'fs'; import crypto from 'crypto';
import { generateRace } from '../web/src/live/builder.js';
const CACHE = '/tmp/rwr_http'; fs.mkdirSync(CACHE, { recursive: true });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (process.env.RWR_NO_OVERPASS && /overpass|interpreter/.test(String(url))) throw new Error('overpass disabled (RWR_NO_OVERPASS)');
  const k = crypto.createHash('sha1').update(String(url) + '|' + (o.body || '')).digest('hex'); const f = `${CACHE}/${k}`;
  if (fs.existsSync(f)) { const b = fs.readFileSync(f, 'utf8'); return new Response(b, { status: 200 }); }
  const r = await realFetch(url, o); if (!r.ok) return r; const b = await r.text(); fs.writeFileSync(f, b); return new Response(b, { status: 200 });
};
const [name, pinsArg, out] = process.argv.slice(2);
const pins = pinsArg.split(';').map(p => p.split(',').map(Number));
const res = await generateRace(pins, (m) => process.stderr.write('  ' + m + '\n'), { name });
fs.writeFileSync(out, JSON.stringify(res));
const d = res.data; console.log(JSON.stringify({ km: (d.length / 1000).toFixed(2), b: d.buildings.length, water: d.water.length, parks: d.parks.length, streets: d.streets.slice(0, 12) }));
