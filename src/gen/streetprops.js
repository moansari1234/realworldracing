import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep, paint, M4, box, cyl, rng, pick } from '../util.js';
import { projector } from '../live/bake.js';
import { fetchStreetDetail, classifyFeature } from '../live/mapillary.js';

/* Procedural low-poly street furniture, placed at real Mapillary positions.
   Every prop kind is one merged, vertex-coloured geometry (origin at the base, "front" facing +z)
   drawn with one InstancedMesh; a cheap distance pass keeps only nearby instances alive. */

const part = (geo, col, m) => { const g = prep(geo); paint(g, col); if (m) g.applyMatrix4(m); return g; };
const merge = (parts) => mergeGeometries(parts, false);
const disc = (r, seg, d = 0.04) => { const g = new THREE.CylinderGeometry(r, r, d, seg); g.rotateX(Math.PI / 2); return g; };
const POST = '#8d949b';
function signOnPost(plates, h = 2.3, postCol = POST) {
  const ps = [part(cyl(0.045, 0.05, h + 0.3, 5), postCol)];
  plates.forEach(([g, c, z = 0, y = 0]) => ps.push(part(g, c, M4(0, h + y, 0.06 + z))));
  return merge(ps);
}
function triangle(r, down) { const g = new THREE.CylinderGeometry(r, r, 0.04, 3); g.rotateX(Math.PI / 2); if (down) g.rotateZ(Math.PI); else g.rotateZ(0); return g; }

const GEN = {
  lamp: () => merge([
    part(cyl(0.11, 0.17, 8.4, 6), '#5d6168'),
    part((() => { const a = new THREE.BoxGeometry(0.1, 0.1, 2.2); a.translate(0, 0, 1.1); return a; })(), '#5d6168', M4(0, 8.3, 0)),
    part(new THREE.BoxGeometry(0.42, 0.16, 0.8), '#fff3c8', M4(0, 8.2, 2.1)),
  ]),
  upole: () => merge([
    part(cyl(0.13, 0.18, 9, 6), '#6b5440'),
    part(new THREE.BoxGeometry(1.9, 0.12, 0.12), '#5a4636', M4(0, 8.3, 0)),
    ...[-0.8, 0, 0.8].map(x => part(cyl(0.05, 0.06, 0.22, 5), '#dfe6e9', M4(x, 8.36, 0))),
  ]),
  pole: () => merge([part(cyl(0.06, 0.08, 4.2, 6), '#7d848b')]),
  tlight: () => merge([
    part(cyl(0.08, 0.1, 3.4, 6), '#3a3d42'),
    part(box(0.38, 1.05, 0.32), '#23262a', M4(0, 3.3, 0)),
    part(disc(0.11, 8, 0.06), '#e53935', M4(0, 4.12, 0.17)),
    part(disc(0.11, 8, 0.06), '#ffb300', M4(0, 3.82, 0.17)),
    part(disc(0.11, 8, 0.06), '#43a047', M4(0, 3.52, 0.17)),
    part(new THREE.BoxGeometry(0.46, 0.06, 0.2), '#23262a', M4(0, 4.38, 0.12)),
  ]),
  sStop: () => signOnPost([[disc(0.42, 8), '#ffffff'], [disc(0.37, 8), '#c62828', 0.01]]),
  sYield: () => signOnPost([[triangle(0.55, true), '#c62828'], [triangle(0.4, true), '#ffffff', 0.01]]),
  sSpeed: () => signOnPost([[disc(0.38, 14), '#c62828'], [disc(0.3, 14), '#ffffff', 0.01], [new THREE.BoxGeometry(0.22, 0.12, 0.02), '#222222', 0.025]]),
  sProhib: () => signOnPost([[disc(0.38, 14), '#c62828'], [disc(0.3, 14), '#ffffff', 0.01], [new THREE.BoxGeometry(0.5, 0.07, 0.02), '#c62828', 0.025]]),
  sMand: () => signOnPost([[disc(0.36, 14), '#1565c0'], [new THREE.BoxGeometry(0.08, 0.36, 0.02), '#ffffff', 0.02]]),
  sWarn: () => signOnPost([[triangle(0.55), '#c62828'], [triangle(0.4), '#ffffff', 0.01], [new THREE.BoxGeometry(0.07, 0.2, 0.02), '#222222', 0.02, -0.02]]),
  sInfo: () => signOnPost([[new THREE.BoxGeometry(0.62, 0.62, 0.04), '#1565c0'], [new THREE.BoxGeometry(0.3, 0.3, 0.02), '#ffffff', 0.025]]),
  sGeneric: () => signOnPost([[new THREE.BoxGeometry(0.62, 0.62, 0.04), '#e9ecef'], [new THREE.BoxGeometry(0.5, 0.5, 0.02), '#f8f9fa', 0.025]]),
  sBack: () => signOnPost([[new THREE.BoxGeometry(0.6, 0.6, 0.04), '#9aa1a8']]),
  sDir: () => merge([
    part(cyl(0.07, 0.08, 3.6, 6), POST, M4(-1.0, 0, 0)), part(cyl(0.07, 0.08, 3.6, 6), POST, M4(1.0, 0, 0)),
    part(box(2.6, 1.3, 0.06), '#1b6e3a', M4(0, 2.3, 0.1)), part(box(2.4, 1.1, 0.02), '#ffffff', M4(0, 2.4, 0.14)), part(box(2.3, 1.0, 0.02), '#1b6e3a', M4(0, 2.45, 0.155)),
    part(box(1.4, 0.12, 0.02), '#ffffff', M4(-0.2, 3.0, 0.17)), part(box(1.0, 0.12, 0.02), '#ffffff', M4(-0.4, 2.7, 0.17)),
  ]),
  bench: () => merge([
    part(new THREE.BoxGeometry(1.7, 0.08, 0.46), '#8a5a35', M4(0, 0.46, 0)),
    part(new THREE.BoxGeometry(1.7, 0.36, 0.06), '#8a5a35', M4(0, 0.78, -0.22, 0, 1, 1, 1, -0.15)),
    ...[-0.72, 0.72].map(x => part(box(0.07, 0.46, 0.42), '#2f3236', M4(x, 0, 0))),
  ]),
  bin: () => merge([part(cyl(0.26, 0.23, 0.9, 8), '#2f4a3a'), part(cyl(0.29, 0.29, 0.06, 8), '#22352a', M4(0, 0.9, 0))]),
  hydrant: () => merge([
    part(cyl(0.13, 0.15, 0.62, 8), '#c62828'), part(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#c62828', M4(0, 0.62, 0)),
    part((() => { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6); g.rotateZ(Math.PI / 2); return g; })(), '#b71c1c', M4(0, 0.42, 0)),
  ]),
  bollard: () => merge([part(cyl(0.09, 0.1, 0.95, 7), '#30343a'), part(cyl(0.095, 0.095, 0.1, 7), '#f1f3f5', M4(0, 0.72, 0))]),
  // instance colour tints the whole billboard/banner, so their posts stay near-black and the boards white
  billboard: () => merge([
    part(cyl(0.1, 0.13, 3.0, 6), '#2a2a2a', M4(-1.0, 0, 0)), part(cyl(0.1, 0.13, 3.0, 6), '#2a2a2a', M4(1.0, 0, 0)),
    part(box(2.9, 1.6, 0.18), '#ffffff', M4(0, 2.6, 0)), part(box(3.0, 0.1, 0.24), '#3a3a3a', M4(0, 4.2, 0)),
  ]),
  banner: () => merge([part(cyl(0.06, 0.07, 4.4, 6), '#3a3a3a'), part(box(0.7, 1.6, 0.03), '#ffffff', M4(0.38, 2.4, 0))]),
  box: () => merge([part(box(0.62, 1.1, 0.38), '#7b8a84'), part(box(0.66, 0.05, 0.42), '#5f6d68', M4(0, 1.1, 0))]),
  tree: () => merge([part(cyl(0.2, 0.32, 3, 5), '#6b4b32'), part((() => { const g = new THREE.IcosahedronGeometry(2.3, 0); g.scale(1, 0.85, 1); return g; })(), '#5c8c3a', M4(0, 4.4, 0))]),
};
const TALL = new Set(['lamp', 'upole', 'tlight', 'billboard', 'sDir', 'tree']);
// share of the prop budget per kind when a dense city has more than the cap
const WEIGHT = { lamp: 3, tlight: 2.5, upole: 2, sStop: 2, sYield: 2, sSpeed: 1.5, sDir: 1.2, sProhib: 1.2, sMand: 1.2, sWarn: 1.2, sInfo: 1, sGeneric: 1, billboard: 1, bench: 0.6, bin: 0.6, hydrant: 0.6, banner: 0.5, box: 0.4, pole: 0.5, bollard: 0.4, sBack: 0.3, tree: 0.8 };
const DEDUPE = { tlight: 7, lamp: 5, upole: 5, pole: 3, billboard: 6, banner: 3.5, sDir: 5, bench: 2.5, bin: 2.5, box: 2.5, tree: 3, bollard: 1.2, hydrant: 2 };
const AD = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f4511e', '#ffffff'];
// draw order when the budget is tight: what reads best from a car first
const PRIORITY = { tlight: 0, sStop: 0, sYield: 0, sSpeed: 1, sDir: 1, lamp: 1, sProhib: 2, sMand: 2, sWarn: 2, sInfo: 3, sGeneric: 3, billboard: 3, upole: 3, bench: 4, bin: 4, hydrant: 4, bollard: 5, banner: 5, box: 5, pole: 6, sBack: 6, tree: 6 };

/**
 * Turn raw Mapillary features into prop placements in track space.
 * Returns [{ k, x, z, ry, s }] (k = kind, ry = yaw so +z faces the right way).
 */
export function placeFeatures(raw, data, track, occupied, opts = {}) {
  const P = projector(data.origin[0], data.origin[1]); const r = rng(raw.length + 7);
  const out = []; const seen = new Map(); const stats = {};
  for (const [lon, lat, v] of raw) {
    const k = classifyFeature(v); if (!k) continue;
    let [x, z] = P(lat, lon); const q = track.nearest(x, z); const hw = q.w / 2;
    if (q.d > hw + (k === 'billboard' || k === 'tree' ? 34 : 22)) continue;
    if (q.y > 0.5 && q.d < hw + 6) continue; // bridge decks
    const side = q.off >= 0 ? 1 : -1, nx = -q.tz, nz = q.tx;
    // our race road is a bit wider than reality: pull kerbside furniture out of the driving line
    const minOff = k === 'billboard' ? hw + 4 : hw + 0.9;
    if (q.d < minOff) { x = q.x + nx * side * minOff; z = q.z + nz * side * minOff; }
    if (occupied(x, z)) { // inside a building footprint (or water / landmark): try the kerb instead
      const o = hw + 1.0; x = q.x + nx * side * o; z = q.z + nz * side * o; if (occupied(x, z)) continue;
    }
    // Mapillary keeps one feature per detected face (a traffic-light pole can carry 4-6), so merge by kind radius
    const rad = DEDUPE[k] || 3; const gx = Math.round(x / rad), gz = Math.round(z / rad);
    let dup = false; for (let a = -1; a <= 1 && !dup; a++) for (let b = -1; b <= 1; b++) { const o = seen.get(`${k}:${gx + a},${gz + b}`); if (o && Math.hypot(o[0] - x, o[1] - z) < rad) { dup = true; break; } }
    if (dup) continue; seen.set(`${k}:${gx},${gz}`, [x, z]);
    const toRoad = Math.atan2(-nx * side, -nz * side);     // +z towards the centreline
    const facing = Math.atan2(-q.tx, -q.tz);                 // +z towards oncoming (player) traffic
    let ry;
    if (k === 'lamp' || k === 'upole') ry = toRoad;
    else if (k === 'bench' || k === 'bin' || k === 'box') ry = toRoad;
    else if (k === 'billboard') ry = Math.atan2(-nx * side - q.tx, -nz * side - q.tz); // half towards the road, half towards oncoming cars
    else if (k === 'sBack') ry = facing + Math.PI;
    else if (k === 'tree' || k === 'hydrant' || k === 'bollard' || k === 'pole') ry = r() * 6.28;
    else ry = facing + side * 0.15;
    out.push({ k, x, z, ry, d: q.d - hw, s: q.s, sc: k === 'tree' ? 0.8 + r() * 0.5 : 1 });
    stats[k] = (stats[k] || 0) + 1;
  }
  // budget: water-fill a quota per kind (priority order) so no single kind eats the cap, then keep each
  // kind's quota evenly spread along the route instead of bunching at one junction
  const cap = opts.cap || 1400; const byK = {};
  for (const p of out) (byK[p.k] ||= []).push(p);
  const order = Object.keys(byK).sort((a, b) => (PRIORITY[a] ?? 6) - (PRIORITY[b] ?? 6));
  const quota = Object.fromEntries(order.map(k => [k, 0])); let total = 0;
  while (total < cap) {
    let bk = null, bv = 1e9; for (const k of order) { if (quota[k] >= byK[k].length) continue; const v = (quota[k] + 1) / (WEIGHT[k] || 0.5); if (v < bv) { bv = v; bk = k; } }
    if (!bk) break; quota[bk]++; total++;
  }
  const kept = [];
  for (const k of order) { const L = byK[k].sort((a, b) => a.s - b.s), n = quota[k]; if (n >= L.length) { kept.push(...L); continue; } for (let i = 0; i < n; i++) kept.push(L[Math.floor((i + 0.5) * L.length / n)]); }
  return { list: kept, stats, dropped: out.length - kept.length };
}

/** InstancedMesh per kind + distance culling ("LOD": far props simply aren't drawn) */
export function buildPropMeshes(list, opts = {}) {
  const group = new THREE.Group(); group.name = 'mapillary-props';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const byK = {}; for (const p of list) (byK[p.k] ||= []).push(p);
  const kinds = []; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const r = rng(list.length + 3);
  for (const [k, ps] of Object.entries(byK)) {
    const geo = GEN[k](); const mesh = new THREE.InstancedMesh(geo, mat, ps.length);
    mesh.frustumCulled = false; mesh.castShadow = !opts.mobile && TALL.has(k); mesh.receiveShadow = false;
    const mats = new Float32Array(ps.length * 16), xs = new Float32Array(ps.length), zs = new Float32Array(ps.length);
    const tint = k === 'billboard' || k === 'banner';
    ps.forEach((p, i) => {
      q.setFromAxisAngle(up, p.ry); m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.sc, p.sc, p.sc)); m.toArray(mats, i * 16); xs[i] = p.x; zs[i] = p.z;
      if (tint) { col.set(pick(r, AD)); mesh.setColorAt(i, col); }
    });
    mesh.instanceMatrix.array.set(mats); mesh.instanceMatrix.needsUpdate = true;
    // colours must follow their instance when culling compacts the list
    const cols = mesh.instanceColor ? mesh.instanceColor.array.slice() : null;
    group.add(mesh); kinds.push({ k, mesh, mats, cols, xs, zs, n: ps.length, R: TALL.has(k) ? 1 : 0.6 });
  }
  let last = -1e9, lx = 1e9, lz = 1e9; const R = opts.radius || 420;
  function update(px, pz) {
    // wall-clock throttle (slow frames must not delay it) + skip when the car has barely moved
    const now = performance.now(); if (now - last < 300 || (Math.abs(px - lx) + Math.abs(pz - lz) < 4 && now - last < 3000)) return; last = now; lx = px; lz = pz;
    for (const K of kinds) {
      const rr = (R * K.R) ** 2; const A = K.mesh.instanceMatrix.array; const CA = K.mesh.instanceColor?.array; let c = 0;
      for (let i = 0; i < K.n; i++) {
        const dx = K.xs[i] - px, dz = K.zs[i] - pz; if (dx * dx + dz * dz > rr) continue;
        A.set(K.mats.subarray(i * 16, i * 16 + 16), c * 16); if (CA) CA.set(K.cols.subarray(i * 3, i * 3 + 3), c * 3);
        c++;
      }
      K.mesh.count = c; K.mesh.instanceMatrix.needsUpdate = true; if (CA) K.mesh.instanceColor.needsUpdate = true;
    }
  }
  return { group, update, kinds: kinds.map(K => [K.k, K.n]) };
}

// ---------------- facade colours from street-level thumbnails ----------------
const hsl = { h: 0, s: 0, l: 0 };
/** dominant facade colour in a region of an image (canvas pixels), ignoring sky, vegetation and deep shadow */
export function dominantColour(px, w, h, x0, x1, y0, y1) {
  const bins = new Map(); let valid = 0, tot = 0;
  for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) {
    const i = (y * w + x) * 4; const R = px[i], G = px[i + 1], B = px[i + 2]; tot++;
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (lum < 38 || lum > 238) continue;                              // shadow / blown-out sky
    if (B > R + 12 && B >= G && lum > 120) continue;                   // sky
    if (G > R + 6 && G > B + 4) continue;                              // trees, grass
    valid++; const key = (R >> 5) << 6 | (G >> 5) << 3 | (B >> 5);
    let e = bins.get(key); if (!e) bins.set(key, e = [0, 0, 0, 0]); e[0]++; e[1] += R; e[2] += G; e[3] += B;
  }
  if (tot === 0 || valid < tot * 0.18) return null;
  let best = null; for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
  if (!best || best[0] < valid * 0.08) return null;
  const c = new THREE.Color(best[1] / best[0] / 255, best[2] / best[0] / 255, best[3] / best[0] / 255);
  c.convertSRGBToLinear(); // pixel values are sRGB; vertex colours are linear
  c.getHSL(hsl);
  // photos are shot in shade and through haze: lift lightness a touch, keep it inside a paintable range
  c.setHSL(hsl.h, Math.min(0.55, hsl.s * 1.1), Math.min(0.78, Math.max(0.28, hsl.l * 1.12 + 0.04)));
  return c;
}

function loadImage(url, ms) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    const t = setTimeout(() => { im.src = ''; rej(new Error('timeout')); }, ms);
    im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); rej(new Error('load')); };
    im.src = url;
  });
}

/**
 * Sample facade colours from a few street-level thumbnails and repaint the road-facing buildings.
 * world.buildings[i]._w0/_w1 = vertex range of its walls in world.walls (written by buildBuildings).
 */
export async function applyFacadeColours(images, data, track, world, opts = {}) {
  const res = { sampled: 0, coloured: 0, images: 0, cors: false, failed: 0 };
  if (!images?.length || !world.walls || !world.buildings) return res;
  const P = projector(data.origin[0], data.origin[1]);
  // spread the samples along the route, close to the racing line
  const cands = [];
  for (const im of images) { const [x, z] = P(im.lat, im.lon); const q = track.nearest(x, z); if (q.d < q.w / 2 + 12) cands.push({ ...im, x, z, s: q.s, q }); }
  cands.sort((a, b) => a.s - b.s);
  const pickd = []; const gap = opts.gap || 70; let last = -1e9;
  for (const c of cands) { if (c.s - last >= gap) { pickd.push(c); last = c.s; } }
  const max = opts.max || 36; const sel = pickd.length > max ? pickd.filter((_, i) => i % Math.ceil(pickd.length / max) === 0) : pickd;
  res.candidates = cands.length; res.selected = sel.length;
  // building centroids + their side of the road
  const B = world.buildings.filter(b => b._w1 > b._w0).map(b => { let cx = 0, cz = 0; b.p.forEach(v => { cx += v[0]; cz += v[1]; }); cx /= b.p.length; cz /= b.p.length; const q = track.nearest(cx, cz); return { b, cx, cz, q, best: 1e9 }; })
    .filter(o => o.q.d < o.q.w / 2 + 45);
  const cv = document.createElement('canvas'); const W = 96; cv.width = W; cv.height = 72; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const colAttr = world.walls.geometry.attributes.color; const arr = colAttr.array; const r = rng(7);
  let dirty = false;
  for (const im of sel) {
    if (opts.isDead?.()) break;
    let img; try { img = await loadImage(im.url, 6000); } catch (e) { res.failed++; continue; }
    const H = Math.max(24, Math.round(W * img.naturalHeight / img.naturalWidth)); cv.height = H;
    let px; try { ctx.drawImage(img, 0, 0, W, H); px = ctx.getImageData(0, 0, W, H).data; } catch (e) { res.cors = true; break; } // tainted canvas: give up, keep theme colours
    res.images++;
    const pano = im.pano || img.naturalWidth >= img.naturalHeight * 1.9;
    const tx = im.q.tx, tz = im.q.tz;
    for (const rel of [-90, 90]) {
      // which side of the race road is this camera direction looking at?
      const bear = (im.ca + rel) * Math.PI / 180; const dx = Math.sin(bear), dz = -Math.cos(bear);
      const sideDot = dx * -tz + dz * tx; if (Math.abs(sideDot) < 0.35) continue; const side = sideDot > 0 ? 1 : -1;
      let c;
      if (pano) { const u = 0.5 + rel / 360; c = dominantColour(px, W, H, u - 0.07, u + 0.07, 0.3, 0.5); }
      else c = rel < 0 ? dominantColour(px, W, H, 0.0, 0.2, 0.22, 0.6) : dominantColour(px, W, H, 0.8, 1.0, 0.22, 0.6);
      if (!c) continue; res.sampled++;
      // nearest few road-facing buildings on that side, within ±45 m along the road
      const near = B.filter(o => (o.q.off >= 0 ? 1 : -1) === side && Math.abs(o.q.s - im.s) < 45).map(o => ({ o, d: Math.hypot(o.cx - im.x, o.cz - im.z) })).sort((a, b) => a.d - b.d).slice(0, 7);
      for (const { o, d } of near) {
        if (d >= o.best) continue; o.best = d; const cc = c.clone(); cc.offsetHSL(0, 0, (r() - 0.5) * 0.06);
        for (let v = o.b._w0; v < o.b._w1; v++) { arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b; }
        if (!o.done) { o.done = true; res.coloured++; } dirty = true;
      }
    }
    if (dirty) { colAttr.needsUpdate = true; dirty = false; }
    await new Promise(r => setTimeout(r, 0)); // keep frames flowing
  }
  return res;
}

/**
 * Attach Mapillary street detail to a running game. Never blocks the race; any failure leaves the game as it was.
 * Returns a controller with update(px, pz, dt) and a stats object.
 */
export function attachStreetDetail(game, opts = {}) {
  const ctl = { stats: { state: 'loading' }, update() { }, dead: false, ready: null };
  const { data, track, world } = game;
  if (!data.origin) { ctl.stats.state = 'off'; return ctl; }
  ctl.ready = (async () => {
    const raw = await fetchStreetDetail(data);
    if (ctl.dead) return ctl.stats;
    if (!raw.ok || (!raw.features.length && !raw.images.length)) { Object.assign(ctl.stats, { state: 'none', error: raw.error || (raw.authFail ? 'auth' : 'empty') }); return ctl.stats; }
    const placed = placeFeatures(raw.features, data, track, world.blockedProp || (() => false), { cap: opts.mobile ? 800 : 1500 });
    const pm = buildPropMeshes(placed.list, { mobile: opts.mobile, radius: opts.mobile ? 300 : 460 });
    game.scene.add(pm.group); ctl.update = pm.update; ctl.group = pm.group;
    Object.assign(ctl.stats, { state: 'props', raw: raw.features.length, props: placed.list.length, dropped: placed.dropped, byKind: Object.fromEntries(pm.kinds), images: raw.images.length });
    opts.onStage?.(ctl.stats);
    // facades after the props, off the critical path
    await new Promise(r => setTimeout(r, opts.facadeDelay ?? 600));
    if (ctl.dead) return ctl.stats;
    const fc = await applyFacadeColours(raw.images, data, track, world, { max: opts.mobile ? 18 : 36, isDead: () => ctl.dead });
    Object.assign(ctl.stats, { state: 'done', facades: fc.coloured, facadeSamples: fc.sampled, facadeImages: fc.images, facadeCands: fc.candidates, facadeSel: fc.selected, cors: fc.cors, imgFailed: fc.failed });
    opts.onStage?.(ctl.stats);
    return ctl.stats;
  })().catch(e => { Object.assign(ctl.stats, { state: 'error', error: String(e?.message || e) }); return ctl.stats; });
  return ctl;
}
