// Mapillary street-level detail (API v4): map features (street lights, poles, signs, traffic lights, benches…)
// and street-level images (for facade colours) along a race corridor. Network-only, no three.js, so it runs
// in Node tests as well as the browser. Everything is optional: any failure resolves to an empty result.
import { projector } from './bake.js';

const cfg = { base: '/api/mly', direct: false, timeout: 9000, budget: 25000 };
/** browser default: same-origin Vercel proxy (/api/mly). Node tests: setEndpoint('https://graph.mapillary.com', true) */
export function setEndpoint(base, direct = false) { cfg.base = base; cfg.direct = direct; }

const TILE = 0.003;            // ~330 m cells; Mapillary needs bbox area < 0.01 deg^2, these are 9e-6
const MAX_TILES = 60;
const memo = new Map();

function qurl(p, params) {
  const q = new URLSearchParams(params).toString();
  return cfg.direct ? `${cfg.base}/${p}?${q}` : `${cfg.base}?p=${p}&${q}`;
}
async function getJSON(u, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  try { const r = await fetch(u, { signal: ctl?.signal }); if (!r.ok) throw new Error('mly ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/** cells of the TILE grid touched by the route corridor (centreline sampled every ~15 m, ±pad m) */
export function corridorTiles(data, pad = 45) {
  const P = projector(data.origin[0], data.origin[1]); const C = data.center; const set = new Map();
  const dLat = pad / 110540, dLon = pad / (Math.cos(data.origin[0] * Math.PI / 180) * 111320);
  const step = Math.max(1, Math.round(15 / 4));
  for (let i = 0; i < C.length; i += step) {
    const [la, lo] = P.inv(C[i][0], C[i][1]);
    for (const [a, b] of [[la - dLat, lo - dLon], [la + dLat, lo + dLon], [la - dLat, lo + dLon], [la + dLat, lo - dLon], [la, lo]]) {
      const ti = Math.floor(b / TILE), tj = Math.floor(a / TILE); set.set(ti + ',' + tj, [ti, tj]);
    }
  }
  return [...set.values()].slice(0, MAX_TILES).map(([ti, tj]) => [ti * TILE, tj * TILE, (ti + 1) * TILE, (tj + 1) * TILE]);
}
const bboxStr = (b) => b.map(v => v.toFixed(6)).join(',');

/**
 * Fetch raw street detail for a track. Resolves to
 *   { ok, features: [[lon, lat, object_value], ...], images: [{ id, lon, lat, ca, pano, url }], tiles, failed, ms }
 * Never rejects. Uses data.mly when a test harness pre-injected it.
 */
export function fetchStreetDetail(data, opts = {}) {
  if (data.mly && Array.isArray(data.mly.features)) return Promise.resolve({ ok: true, injected: true, ...data.mly });
  if (!data.origin || !data.center?.length) return Promise.resolve({ ok: false, features: [], images: [], error: 'no origin' });
  const key = `${data.origin[0].toFixed(5)},${data.origin[1].toFixed(5)}|${data.center.length}|${Math.round(data.length)}`;
  if (memo.has(key)) return memo.get(key);
  const pr = run(data, key, opts).catch((e) => ({ ok: false, features: [], images: [], error: String(e?.message || e) }));
  memo.set(key, pr); pr.then(r => { if (!r.ok) memo.delete(key); });
  return pr;
}

async function run(data, key, opts) {
  const t0 = Date.now();
  const cached = loadCache(key); if (cached) return { ...cached, ok: true, cached: true, ms: 0 };
  const tiles = corridorTiles(data);
  // fine 0.0004° (~45 m) cell mask of the corridor: features outside it are dropped straight away
  const mask = new Set(); { const P = projector(data.origin[0], data.origin[1]); const C = data.center; const F = 0.0004;
    for (let i = 0; i < C.length; i += 2) { const [la, lo] = P.inv(C[i][0], C[i][1]); const a = Math.floor(lo / F), b = Math.floor(la / F); for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) mask.add((a + u) + ',' + (b + v)); }
    mask.F = F; }
  const inMask = (lo, la) => mask.has(Math.floor(lo / mask.F) + ',' + Math.floor(la / mask.F));
  const feats = new Map(), imgs = new Map(); let failed = 0, done = 0, authFail = false;
  const jobs = tiles.map(b => ({ p: 'map_features', b, params: { fields: 'id,object_value,geometry', bbox: bboxStr(b), limit: 2000 } }));
  // images: one tiny bbox (~±30 m) every ~90 m along the route, so samples spread over the whole race
  { const P = projector(data.origin[0], data.origin[1]); const C = data.center; const n = opts.imageSpots || 40;
    const every = Math.max(90, (data.length || C.length * 4) / n); const stepI = Math.max(1, Math.round(every / 4)); const d = 0.00028;
    for (let i = Math.round(stepI / 2); i < C.length; i += stepI) { const [la, lo] = P.inv(C[i][0], C[i][1]); const b = [lo - d * 1.6, la - d, lo + d * 1.6, la + d];
      jobs.push({ p: 'images', b, params: { fields: 'id,computed_geometry,compass_angle,thumb_256_url,is_pano', bbox: bboxStr(b), limit: 4 } }); } }
  const deadline = t0 + (opts.budget || cfg.budget); let jobsN = jobs.length;
  const fj = jobs.filter(j => j.p === 'map_features'), ij = jobs.filter(j => j.p === 'images'); const q = [];
  while (fj.length || ij.length) { if (fj.length) q.push(fj.shift()); if (ij.length) q.push(ij.shift()); if (ij.length) q.push(ij.shift()); } // interleave so both kinds arrive early
  const one = async (j) => {
    for (let att = 0; att < 2; att++) {
      if (Date.now() > deadline || authFail) return;
      try {
        const res = await getJSON(qurl(j.p, j.params), cfg.timeout);
        const list = res.data || [];
        // Mapillary occasionally returns an empty page for a populated bbox: retry once
        if (!list.length && att === 0) { await sleep(250); continue; }
        if (j.p === 'map_features' && list.length >= j.params.limit * 0.98 && (j.depth || 0) < 2) {
          // dense city: this tile hit the page cap, so split it into quarters instead of losing features
          const [w, s0, e, n] = j.b, mx = (w + e) / 2, my = (s0 + n) / 2;
          for (const b of [[w, s0, mx, my], [mx, s0, e, my], [w, my, mx, n], [mx, my, e, n]]) { q.push({ ...j, b, depth: (j.depth || 0) + 1, params: { ...j.params, bbox: bboxStr(b) } }); jobsN++; }
        }
        if (j.p === 'map_features') { for (const f of list) { const c = f.geometry?.coordinates; if (c && f.object_value && inMask(c[0], c[1])) feats.set(f.id, [+c[0].toFixed(7), +c[1].toFixed(7), f.object_value]); } }
        else for (const im of list) { const c = im.computed_geometry?.coordinates; if (!c || !im.thumb_256_url || !inMask(c[0], c[1])) continue; imgs.set(im.id, { id: im.id, lon: c[0], lat: c[1], ca: im.compass_angle ?? 0, pano: !!im.is_pano, url: im.thumb_256_url }); }
        done++; opts.onProgress?.(done, jobsN); return;
      } catch (e) {
        if (/mly (401|403|503)/.test(e.message)) authFail = true;
        if (att === 1) failed++; else await sleep(400);
      }
    }
  };
  const W = opts.concurrency || 6;
  await Promise.all(Array.from({ length: W }, async () => { while (q.length) await one(q.shift()); }));
  const out = { ok: (feats.size + imgs.size) > 0 || (done > 0 && !authFail), features: [...feats.values()], images: [...imgs.values()], tiles: tiles.length, jobs: jobsN, failed, authFail, ms: Date.now() - t0 };
  if (out.ok && out.features.length) saveCache(key, out);
  return out;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// small localStorage cache (thumbnail URLs are signed and expire, so keep it to a day)
const LS = 'rwr-mly:';
function loadCache(key) {
  try { if (typeof localStorage === 'undefined') return null; const s = localStorage.getItem(LS + key); if (!s) return null; const o = JSON.parse(s); if (Date.now() - o.t > 864e5) { localStorage.removeItem(LS + key); return null; } return o.v; } catch (e) { return null; }
}
function saveCache(key, v) {
  try {
    if (typeof localStorage === 'undefined') return;
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(LS)) localStorage.removeItem(k); } // keep only the latest route
    const s = JSON.stringify({ t: Date.now(), v: { features: v.features, images: v.images, tiles: v.tiles } }); if (s.length < 1.5e6) localStorage.setItem(LS + key, s);
  } catch (e) { }
}

/** classify a Mapillary object_value into a prop kind (null = not rendered) */
export function classifyFeature(v) {
  if (v.startsWith('marking--') || /manhole|catch-basin|water-valve|traffic-cone|cctv|sign--store|sign--back|sign--other|wire-group|pothole|ramp/.test(v)) return null;
  if (v.startsWith('object--street-light')) return 'lamp';
  if (v.startsWith('object--support--utility-pole')) return 'upole';
  if (v.startsWith('object--support--')) return 'pole';
  if (v.startsWith('object--traffic-light')) return 'tlight';
  if (v.startsWith('regulatory--stop')) return 'sStop';
  if (/^regulatory--(yield|give-way)/.test(v)) return 'sYield';
  if (/^regulatory--maximum-speed-limit|^regulatory--speed-limit/.test(v)) return 'sSpeed';
  if (/^regulatory--(no-|road-closed|end-of-prohibition)/.test(v)) return 'sProhib';
  if (v.startsWith('regulatory--')) return 'sMand';
  if (v.startsWith('warning--')) return 'sWarn';
  if (v.startsWith('information--') || v.startsWith('complementary--')) return 'sInfo';
  if (v.startsWith('object--traffic-sign--direction')) return /back/.test(v) ? 'sBack' : 'sDir';
  if (v.startsWith('object--traffic-sign')) return /back/.test(v) ? 'sBack' : 'sGeneric';
  if (v.startsWith('object--bench')) return 'bench';
  if (v.startsWith('object--trash-can')) return 'bin';
  if (v.startsWith('object--fire-hydrant')) return 'hydrant';
  if (/bollard/.test(v)) return 'bollard';
  if (/billboard|sign--advertisement/.test(v)) return 'billboard';
  if (v.startsWith('object--banner')) return 'banner';
  if (/junction-box|mailbox|phone-booth|parking-meter/.test(v)) return 'box';
  if (/tree|vegetation/.test(v)) return 'tree';
  return null;
}
