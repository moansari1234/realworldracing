// In-browser port of data/bake.py: real OSM elements -> road graph -> A* race line -> corridor geometry,
// plus automatic landmark detection from OSM tags. Output matches the baked track JSON format.
import { Grid, pointInPoly, inPolyH } from '../util.js';

const WIDTH = { motorway: 22, trunk: 20, primary: 17, secondary: 14, tertiary: 12, unclassified: 10, residential: 9, living_street: 8, service: 7, pedestrian: 12 };
const COST = { motorway: 1, trunk: 1, primary: 1, secondary: 1.05, tertiary: 1.15, unclassified: 1.4, residential: 1.6, living_street: 2.2, service: 3.2, pedestrian: 2.5 };
const MAIN = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const r1 = (v) => Math.round(v * 10) / 10;

export function projector(lat0, lon0) {
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110540;
  const P = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
  P.inv = (x, z) => [lat0 - z / kz, lon0 + x / kx];
  return P;
}

// ---------------- graph + routing ----------------
export function buildGraph(roadEls, P) {
  const id2i = new Map(), X = [], Z = [], adj = [], isMain = [], roads = [];
  const seen = new Set();
  const node = (id, xy) => { let i = id2i.get(id); if (i === undefined) { i = X.length; id2i.set(id, i); X.push(xy[0]); Z.push(xy[1]); adj.push([]); isMain.push(false); } return i; };
  for (const e of roadEls) {
    const t = e.tags || {}; if (e.type !== 'way' || !t.highway || seen.has(e.id) || !e.geometry) continue; seen.add(e.id);
    let hw = t.highway.replace('_link', '');
    if (hw === 'footway') { if (t.access === 'permit' || /Kaman|Charminar/.test(t.name || '')) hw = 'pedestrian'; else continue; }
    if (!(hw in WIDTH) || t.access === 'private' || t.access === 'no' || t.area === 'yes') continue;
    if (hw === 'service' && /parking_aisle|driveway|drive-through/.test(t.service || '')) continue;
    const g = e.geometry.map(p => P(p.lat, p.lon)); const bridge = t.bridge === 'yes' || t.bridge === 'viaduct'; const tunnel = t.tunnel === 'yes';
    const idx = e.nodes.map((nid, k) => node(nid, g[k]));
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = idx[k], b = idx[k + 1]; const len = Math.hypot(X[a] - X[b], Z[a] - Z[b]); const w = len * COST[hw];
      const ed = { w, len, hw, name: t.name || t.ref || '', bridge, tunnel };
      adj[a].push({ to: b, ...ed }); adj[b].push({ to: a, ...ed });
      if (MAIN.has(hw)) { isMain[a] = true; isMain[b] = true; }
    }
    roads.push({ hw, name: t.name || '', pts: g, bridge, tunnel });
  }
  return { X, Z, adj, isMain, roads, n: X.length };
}

class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; } }

export function snap(G, x, z, mainOnly = true) {
  let best = -1, bd = 1e18;
  for (let i = 0; i < G.n; i++) { if (mainOnly && !G.isMain[i]) continue; if (!G.adj[i].length) continue; const d = (G.X[i] - x) ** 2 + (G.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return { i: best, d: Math.sqrt(bd) };
}
function snapBest(G, x, z) { const m = snap(G, x, z, true); if (m.i >= 0 && m.d < 260) return m.i; const a = snap(G, x, z, false); return a.i >= 0 ? a.i : m.i; }

export function astar(G, s, t) {
  const g = new Float64Array(G.n).fill(Infinity), prev = new Int32Array(G.n).fill(-1); g[s] = 0;
  const h = (i) => Math.hypot(G.X[i] - G.X[t], G.Z[i] - G.Z[t]);
  const H = new Heap(); H.push(h(s), s); const closed = new Uint8Array(G.n);
  while (H.size) {
    const [, u] = H.pop(); if (u === t) break; if (closed[u]) continue; closed[u] = 1;
    for (const e of G.adj[u]) { const nd = g[u] + e.w; if (nd < g[e.to]) { g[e.to] = nd; prev[e.to] = u; H.push(nd + h(e.to), e.to); } }
  }
  if (prev[t] < 0 && s !== t) return null;
  const path = [t]; while (path[path.length - 1] !== s) path.push(prev[path[path.length - 1]]); return path.reverse();
}

/** pick a finish for "surprise me": a main-road node 1.6–3 km of driving away, well away from the start */
export function pickFinish(G, s, seed = Math.random()) {
  const dist = new Float64Array(G.n).fill(Infinity), len = new Float64Array(G.n); dist[s] = 0; const H = new Heap(); H.push(0, s);
  while (H.size) { const [d, u] = H.pop(); if (d > dist[u]) continue; if (len[u] > 3400) continue; for (const e of G.adj[u]) { const nd = d + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; len[e.to] = len[u] + e.len; H.push(nd, e.to); } } }
  const cand = [];
  for (let i = 0; i < G.n; i++) { if (!G.isMain[i] || !isFinite(dist[i])) continue; const L = len[i], st = Math.hypot(G.X[i] - G.X[s], G.Z[i] - G.Z[s]); if (L > 1600 && L < 3200 && st > L * 0.55) cand.push(i); }
  if (!cand.length) for (let i = 0; i < G.n; i++) if (isFinite(dist[i]) && len[i] > 900 && len[i] < 3400) cand.push(i);
  if (!cand.length) return -1;
  return cand[Math.floor(seed * cand.length) % cand.length];
}

function chaikin(pts, it) { for (let k = 0; k < it; k++) { const o = [pts[0]]; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; }
function resample(pts, step) {
  const out = [pts[0].slice()]; let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) { let a = pts[i]; const b = pts[i + 1]; let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= step && d > 1e-9) { const t = (step - acc) / d; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(a); d = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; } acc += d; }
  const l = pts[pts.length - 1]; if (Math.hypot(out[out.length - 1][0] - l[0], out[out.length - 1][1] - l[1]) > step * 0.3) out.push(l.slice()); return out;
}
export function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const f = pts[0], l = pts[pts.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) { // closed ring: split at the farthest vertex
    let m = 1, md = 0; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - f[0], pts[i][1] - f[1]); if (d > md) { md = d; m = i; } }
    if (m < 1) return pts; return rdp(pts.slice(0, m + 1), eps).concat(rdp(pts.slice(m), eps).slice(1));
  } const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, az] = pts[a], [bx, bz] = pts[b]; const L = Math.hypot(bx - ax, bz - az) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}

/** route through snapped waypoints and turn it into the smoothed centreline the game races on */
export function makeRoute(G, wpIdx) {
  let path = [wpIdx[0]];
  for (let k = 0; k + 1 < wpIdx.length; k++) { const p = astar(G, wpIdx[k], wpIdx[k + 1]); if (!p) return null; path = path.concat(p.slice(1)); }
  const clean = []; for (const n of path) { if (clean.length >= 2 && clean[clean.length - 2] === n) { clean.pop(); continue; } if (clean.length && clean[clean.length - 1] === n) continue; clean.push(n); }
  path = clean; if (path.length < 3) return null;
  const edge = (a, b) => G.adj[a].reduce((best, e) => e.to === b && (!best || e.w < best.w) ? e : best, null);
  const raw = path.map(i => [G.X[i], G.Z[i]]); const edges = []; for (let k = 0; k + 1 < path.length; k++) edges.push(edge(path[k], path[k + 1]));
  const wv = [WIDTH[edges[0].hw]].concat(edges.map(e => Math.max(WIDTH[e.hw], 10)));
  const names = [edges[0].name].concat(edges.map(e => e.name)); const brg = [false].concat(edges.map(e => e.bridge));
  const pts = resample(chaikin(raw, 3), 4);
  const center = []; let j = 0;
  for (const [x, z] of pts) {
    // raw vertices are in order along the path, so search a small window ahead of the last match
    let bj = j, bd = 1e18; for (let k = Math.max(0, j - 2); k < Math.min(raw.length, j + 12); k++) { const d = (raw[k][0] - x) ** 2 + (raw[k][1] - z) ** 2; if (d < bd) { bd = d; bj = k; } } j = bj;
    center.push([r1(x), r1(z), Math.max(wv[bj], 10) * 1.15, names[bj] || '', brg[bj] ? 1 : 0]);
  }
  let ws = center.map(c => c[2]); for (let it = 0; it < 30; it++) ws = ws.map((w, i) => i === 0 || i === ws.length - 1 ? w : (ws[i - 1] + w * 2 + ws[i + 1]) / 4);
  center.forEach((c, i) => c[2] = r1(ws[i]));
  let length = 0; for (let i = 1; i < center.length; i++) length += Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]);
  return { path, raw, center, length };
}

// ---------------- corridor geometry ----------------
function lineIndex(center) {
  const g = new Grid(30); for (let i = 0; i + 1 < center.length; i++) { const a = center[i], b = center[i + 1]; g.add((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 20, i); }
  const big = new Grid(220); for (let i = 0; i < center.length; i += 3) big.add(center[i][0], center[i][1], 650, i);
  // distance to centreline: exact within ~30 m, coarse beyond (enough for "near"/"far" filters)
  return (x, z) => {
    let best = { d: 1e9, w: 10, i: 0, px: x, pz: z };
    for (const i of g.near(x, z)) { const a = center[i], b = center[i + 1]; const sx = b[0] - a[0], sz = b[1] - a[1]; const l2 = sx * sx + sz * sz || 1; let t = ((x - a[0]) * sx + (z - a[1]) * sz) / l2; t = Math.max(0, Math.min(1, t)); const px = a[0] + sx * t, pz = a[1] + sz * t; const d = Math.hypot(x - px, z - pz); if (d < best.d) best = { d, w: a[2], i, px, pz }; }
    if (best.d > 1e8) for (const i of big.near(x, z)) { const d = Math.hypot(center[i][0] - x, center[i][1] - z); if (d < best.d) best = { d, w: center[i][2], i, px: center[i][0], pz: center[i][1] }; }
    return best;
  };
}
const ringOf = (geom, P) => geom.map(p => P(p.lat, p.lon));
function closeRings(segs) {
  // stitch multipolygon member ways into rings by matching endpoints. Only CLOSED rings are returned: an open chain
  // (members missing from a partial download) used to be returned too, and drawing it closed its two loose ends
  // with a straight chord, e.g. the Thames riverbank chord across Parliament Street / Whitehall in London.
  const rings = []; const key = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1); const pool = segs.filter(s => s.length > 1).map(s => s.slice());
  while (pool.length) { let ring = pool.shift(); let grew = true;
    while (grew && key(ring[0]) !== key(ring[ring.length - 1])) { grew = false;
      for (let k = 0; k < pool.length; k++) { const s = pool[k]; const e = key(ring[ring.length - 1]);
        if (key(s[0]) === e) { ring = ring.concat(s.slice(1)); } else if (key(s[s.length - 1]) === e) { ring = ring.concat(s.slice().reverse().slice(1)); } else continue; pool.splice(k, 1); grew = true; break; } }
    if (ring.length > 3 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring); }
  return rings;
}
/** OSM multipolygon relation -> [{o: outer ring, h: [inner rings inside it]}]; roles '' count as outer */
function assembleMP(members, P) {
  const segs = (inner) => (members || []).filter(m => m.geometry?.length > 1 && ((m.role === 'inner') === inner)).map(m => ringOf(m.geometry, P));
  const outers = closeRings(segs(false)).map(o => ({ o, h: [], a: areaOf(o) })).sort((a, b) => a.a - b.a);
  for (const r of closeRings(segs(true))) { const [x, z] = r[0]; const host = outers.find(o => pointInPoly(x, z, o.o)); if (host) host.h.push(r); }
  return outers;
}
/** Sutherland–Hodgman clip of a ring to an axis-aligned box (keeps huge rivers/lakes to the area around the route) */
function clipRect(ring, x0, z0, x1, z1) {
  let pts = ring;
  const edges = [[(p) => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= z0, (a, b) => { const t = (z0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z0]; }],
    [(p) => p[1] <= z1, (a, b) => { const t = (z1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z1]; }]];
  for (const [inside, cut] of edges) {
    if (pts.length < 3) return [];
    const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const ia = inside(a), ib = inside(b);
      if (ia) o.push(a); if (ia !== ib) o.push(cut(a, b)); }
    pts = o;
  }
  return pts;
}
const areaOf = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a / 2); };
function footprint(ring) {
  // oriented box from the longest edge direction
  let best = 0, ang = 0; for (let i = 0; i + 1 < ring.length; i++) { const dx = ring[i + 1][0] - ring[i][0], dz = ring[i + 1][1] - ring[i][1]; const L = Math.hypot(dx, dz); if (L > best) { best = L; ang = Math.atan2(dz, dx); } }
  const c = Math.cos(ang), s = Math.sin(ang); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [x, z] of ring) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; return { x: um * c - vm * s, z: um * s + vm * c, w: u1 - u0, d: v1 - v0, a: ang };
}

/** classify an OSM feature into one of the procedural landmark recipes */
function classify(t) {
  const name = t.name || ''; const rel = t.religion || '';
  if (t.amenity === 'place_of_worship') return rel === 'muslim' ? 'masjid' : rel === 'christian' ? 'church' : (rel === 'hindu' || rel === 'jain' || rel === 'buddhist' || rel === 'sikh') ? 'temple' : 'temple';
  if (t.man_made === 'tower' && (/clock/i.test(name) || t['tower:type'] === 'clock')) return 'clocktower';
  if (/clock tower|ghanta ghar|ghantaghar/i.test(name)) return 'clocktower';
  if (t.shop === 'mall') return 'mall';
  if (t.leisure === 'stadium') return 'stadium';
  if (t.tourism === 'museum') return 'museum';
  if (/^(castle|fort|palace|manor)$/.test(t.historic || '') || /palace|fort\b|castle/i.test(name)) return 'palace';
  if (t.historic === 'memorial' || t.historic === 'monument' || t.tourism === 'artwork') return (t.memorial === 'statue' || t.artwork_type === 'statue' || /statue/i.test(name)) ? 'statue' : 'monument';
  if (t.man_made === 'tower') return 'tower';
  if (t.leisure === 'park') return 'parkgate';
  if (t.building && (+(t['building:levels'] || 0) >= 15 || parseFloat(t.height || 0) >= 50)) return 'tower';
  if (t.tourism === 'attraction' || t.historic) return 'monument';
  return null;
}
const DEFAULT_SIZE = { clocktower: 8, statue: 16, monument: 14, temple: 30, church: 30, masjid: 50, museum: 50, palace: 80, mall: 90, stadium: 160, tower: 30, parkgate: 14 };

export function bakeCorridor({ els, center, roads, P, length }) {
  const dist = lineIndex(center);
  const inCorr = (x, z) => { const q = dist(x, z); return q.d < q.w / 2 + 3; };
  const out = { roads: [], buildings: [], water: [], parks: [], trees: [], landmarks: [] };
  // side streets within ~600 m
  for (const rd of roads) {
    let cur = [];
    const flush = () => { if (cur.length > 1) out.roads.push({ w: WIDTH[rd.hw], p: rdp(cur, 1.5).map(p => [r1(p[0]), r1(p[1])]) }); cur = []; };
    for (const p of rd.pts) { if (dist(p[0], p[1]).d < 600) cur.push(p); else flush(); } flush();
  }
  // landmarks: scored candidates near the route, spaced out
  const cands = []; const usedIds = new Set();
  for (const e of els) {
    const t = e.tags || {}; if (!t.name) continue; const gen = classify(t); if (!gen) continue;
    let ring = null, x, z;
    if (e.type === 'way' && e.geometry && e.geometry.length > 3) ring = ringOf(e.geometry, P);
    else if (e.type === 'relation') { const rs = assembleMP(e.members, P); if (rs.length) ring = rs[rs.length - 1].o; }
    else if (e.type === 'node') [x, z] = P(e.lat, e.lon);
    let fp = null; if (ring) { fp = footprint(ring); x = fp.x; z = fp.z; }
    if (x === undefined) continue;
    const q = dist(x, z); if (q.d > 230) continue;
    if (gen === 'parkgate' && (!ring || areaOf(ring) < 4000)) continue;
    let score = (t.wikidata || t.wikipedia ? 6 : 0) + (t.tourism ? 3 : 0) + (t.historic ? 3 : 0) + (gen === 'clocktower' ? 3 : 0) + (gen === 'stadium' ? 3 : 0) + (ring ? Math.min(4, Math.log10(areaOf(ring) + 1)) : 0) - q.d / 80;
    if (gen === 'tower' && !t.wikidata) score -= 2; if (gen === 'parkgate') score -= 1;
    const s0 = DEFAULT_SIZE[gen];
    let w = fp ? Math.max(6, fp.w) : s0, d = fp ? Math.max(6, fp.d) : s0;
    if (gen === 'statue' || gen === 'clocktower' || gen === 'monument') { w = Math.min(w, 30); d = Math.min(d, 30); }
    cands.push({ id: `${e.type}${e.id}`, name: t.name, gen, x, z, w, d, a: fp ? fp.a : 0, score, ring, q, height: parseFloat(t.height || 0) || (+(t['building:levels'] || 0) * 3.4) || 0 });
  }
  cands.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= 8) break;
    if (chosen.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 140 || o.name === c.name)) continue;
    if (chosen.filter(o => o.gen === c.gen).length >= 2) continue;
    if (c.gen === 'mall' && (!c.ring || areaOf(c.ring) < 2500)) continue;
    chosen.push(c);
  }
  const lmZones = [];
  for (const c of chosen) {
    usedIds.add(c.id);
    // recipes have minimum sizes; keep the footprint clear of the racing line by nudging it out sideways
    const half = Math.max(c.w, c.d) / 2; const q = dist(c.x, c.z); const need = q.w / 2 + 5 + (c.gen === 'parkgate' ? 0 : Math.min(half, 60));
    if (q.d < need && c.gen !== 'parkgate') { let nx = c.x - q.px, nz = c.z - q.pz; const L = Math.hypot(nx, nz); if (L < 0.5) { const a = center[q.i], b = center[Math.min(q.i + 1, center.length - 1)]; nx = -(b[1] - a[1]); nz = b[0] - a[0]; } const Ln = Math.hypot(nx, nz) || 1; c.x = q.px + nx / Ln * need; c.z = q.pz + nz / Ln * need; }
    const lm = { id: c.id, name: c.name, gen: c.gen, x: r1(c.x), z: r1(c.z), w: r1(c.w), d: r1(c.d), a: Math.round(c.a * 1000) / 1000, fp: null, h: c.height, sign: c.name.toUpperCase().slice(0, 18) };
    out.landmarks.push(lm); lmZones.push([lm.x, lm.z, Math.min(Math.max(c.w, c.d) / 2 + 4, 70)]);
  }
  const inLm = (x, z) => lmZones.some(([lx, lz, r]) => Math.hypot(x - lx, z - lz) < r);
  // buildings: real footprints; vertices that poke into the street are pushed back to the kerb line
  const seenB = new Set(); let nb = 0;
  for (const e of els) {
    const t = e.tags || {}; if (e.type !== 'way' || !t.building || !e.geometry || e.geometry.length < 4 || seenB.has(e.id)) continue; seenB.add(e.id);
    if (usedIds.has(`way${e.id}`)) continue;
    let p = ringOf(e.geometry, P); if (p.length > 3 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.01) p.pop();
    if (p.length < 3) continue; const ar = areaOf(p); if (ar < 12 || ar > 60000) continue;
    let cx = 0, cz = 0; p.forEach(v => { cx += v[0]; cz += v[1]; }); cx /= p.length; cz /= p.length;
    const qc = dist(cx, cz); if (qc.d > 270 || qc.d < qc.w / 2 + 3) continue; if (inLm(cx, cz)) continue;
    let bad = 0; p = p.map(([x, z]) => { const q = dist(x, z); const lim = q.w / 2 + 3.2; if (q.d < lim) { bad++; const L = q.d || 1e-3; return [q.px + (x - q.px) / L * lim, q.pz + (z - q.pz) / L * lim]; } return [x, z]; });
    if (bad > p.length * 0.6) continue;
    p = rdp(p.concat([p[0]]), 0.8); p.pop(); if (p.length < 3) continue;
    let h = 0; const num = (s) => { const m = String(s).match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
    if (t.height) h = num(t.height); else if (t['building:levels']) h = num(t['building:levels']) * 3.3;
    out.buildings.push({ s: e.id % 100000, h: r1(Math.min(h, 320)), t: String(t.building).slice(0, 12), p: p.map(v => [r1(v[0]), r1(v[1])]) });
    if (++nb > 6000) break;
  }
  // water + parks: proper multipolygons (closed outer rings + inner rings as holes), clipped to the area around the route
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const c of center) { bx0 = Math.min(bx0, c[0]); bx1 = Math.max(bx1, c[0]); bz0 = Math.min(bz0, c[1]); bz1 = Math.max(bz1, c[1]); }
  const M = 1200, cx0 = bx0 - M, cx1 = bx1 + M, cz0 = bz0 - M, cz1 = bz1 + M;
  const far = (ring) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return x1 < cx0 || x0 > cx1 || z1 < cz0 || z0 > cz1; };
  const tidy = (ring) => { if (ring.length > 3 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.5) ring = ring.slice(0, -1); ring = clipRect(ring, cx0, cz0, cx1, cz1); if (ring.length < 3) return null; ring = rdp(ring.concat([ring[0]]), 2); ring.pop(); return ring.length >= 3 ? ring.map(v => [r1(v[0]), r1(v[1])]) : null; };
  // the drivable race line at ground level (bridges excluded): a water body may never sit on it
  const ground = center.filter((c, i) => !c[4] && i % 3 === 0);
  const seenW = new Set();
  for (const e of els) {
    const t = e.tags || {}; const kind = t.natural === 'water' ? 'water' : (t.leisure === 'park' || t.leisure === 'garden' || /^(grass|recreation_ground|forest)$/.test(t.landuse || '')) ? 'parks' : null; if (!kind) continue;
    if (seenW.has(e.type + e.id)) continue; seenW.add(e.type + e.id);
    let polys = [];
    if (e.type === 'way' && e.geometry?.length > 3) { const r = ringOf(e.geometry, P); if (Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.5) polys = [{ o: r, h: [] }]; }
    else if (e.type === 'relation') polys = assembleMP(e.members, P);
    for (const pg of polys) {
      if (far(pg.o)) continue; const o = tidy(pg.o); if (!o) continue; if (kind === 'parks' && areaOf(o) < 150) continue;
      if (kind === 'parks') { out.parks.push(o); continue; }
      const h = pg.h.filter(r => !far(r)).map(tidy).filter(r => r && areaOf(r) > 20);
      const w = h.length ? { p: o, h } : o;
      // safety net: a polygon that swallows a real share of the ground-level race line is broken data, drop it
      if (ground.length) { let wet = 0; for (const c of ground) if (inPolyH(c[0], c[1], w)) wet++; if (wet > Math.max(3, ground.length * 0.15)) continue; }
      out.water.push(w);
    }
  }
  for (const e of els) { if (e.type === 'node' && e.tags?.natural === 'tree') { const [x, z] = P(e.lat, e.lon); const q = dist(x, z); if (q.d < 260 && q.d > q.w / 2 + 3) out.trees.push([r1(x), r1(z)]); } }
  return out;
}

/** derive a generation theme from what the map says about this place */
export function autoTheme(THEMES, data, geo) {
  const B = data.buildings; const km = Math.max(0.4, data.length / 1000);
  const lev = B.filter(b => b.h).map(b => b.h / 3.3); const meanLev = lev.length ? lev.reduce((a, b) => a + b, 0) / lev.length : 0;
  const tall = B.filter(b => b.h > 40).length; const meanArea = B.length ? B.reduce((a, b) => a + areaOf(b.p), 0) / B.length : 0;
  const density = B.length / km; const southAsia = ['in', 'pk', 'bd', 'np', 'lk'].includes(geo.cc);
  let base, kind;
  if (tall > 12 || meanLev > 8) { base = THEMES.hitec; kind = 'Downtown'; }
  else if (density > 320 && meanArea < 260) { base = THEMES.oldcity; kind = 'Old Town'; }
  else { base = THEMES.lake; kind = 'City'; }
  const th = JSON.parse(JSON.stringify(base));
  if (base === THEMES.oldcity && !southAsia) { th.facade = 'modern'; th.domeChance = 0; th.walls = ['#e9dcc6', '#d8c3a5', '#c9a98a', '#efe6d6', '#b9886a', '#d6cfc0', '#e3cfa8']; th.floors = [3, 5]; th.tankChance = 0.05; }
  if (!southAsia) { th.autos = false; th.kerb = ['#d23a2a', '#f2f2f2']; th.tankChance = Math.min(th.tankChance, 0.08); th.ground = th.ground; }
  if (B.length < 40 * km) { th.filler = Math.max(th.filler, 0.55); }
  th.label = [geo.city, kind].filter(Boolean).join(' · ');
  th.southAsia = southAsia;
  return th;
}
export { pointInPoly };
