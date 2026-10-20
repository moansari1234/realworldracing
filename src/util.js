import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Paint a geometry with a flat vertex colour (so many parts can be merged into one draw call)
export function paint(geo, color) {
  const c = new THREE.Color(color); const n = geo.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
export function prep(geo) {
  // normalise attributes so geometries of different kinds can merge
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export class Batch {
  // collects coloured geometry parts and merges them into one mesh
  constructor() { this.parts = []; }
  add(geo, color, m) { const g = prep(geo); if (color !== undefined) paint(g, color); if (m) g.applyMatrix4(m); this.parts.push(g); return g; }
  build(material) {
    if (!this.parts.length) return null;
    const out = []; let cur = [], n = 0;
    for (const p of this.parts) { cur.push(p); n += p.attributes.position.count; if (n > 600000) { out.push(cur); cur = []; n = 0; } }
    if (cur.length) out.push(cur);
    const grp = new THREE.Group();
    for (const set of out) { const m = new THREE.Mesh(mergeGeometries(set, false), material); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    return grp;
  }
}
export const M4 = (x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)); return m;
};
export function box(w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; }
export function cyl(rt, rb, h, seg = 8) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return g; }
// onion / bulb dome via lathe
export function dome(r, h, seg = 10, kind = 'bulb') {
  const pts = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N; let x;
    if (kind === 'bulb') x = r * (Math.sin(t * Math.PI * 0.95) * (1.1 - t * 0.4) + (t < 0.2 ? 0.0 : 0)) * (1 - Math.pow(t, 3) * 0.9);
    else x = r * Math.cos(t * Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(x, 0.001), t * h));
  }
  pts[0].x = r * (kind === 'bulb' ? 0.85 : 1);
  return new THREE.LatheGeometry(pts, seg);
}
export function pointedArchShape(w, h, sideW, totalH, depthTop = 0) {
  // outer rectangle with a pointed-arch hole
  const s = new THREE.Shape();
  const W = w / 2 + sideW;
  s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, totalH); s.lineTo(-W, totalH); s.lineTo(-W, 0);
  const hole = new THREE.Path();
  const spring = h - w * 0.62;
  hole.moveTo(-w / 2, 0); hole.lineTo(-w / 2, spring);
  hole.quadraticCurveTo(-w / 2, spring + w * 0.45, 0, h);
  hole.quadraticCurveTo(w / 2, spring + w * 0.45, w / 2, spring);
  hole.lineTo(w / 2, 0); hole.lineTo(-w / 2, 0);
  s.holes.push(hole);
  return s;
}
export function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -depth / 2); return g;
}
export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export function pointInPoly(x, z, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;
  }
  return ins;
}
// Water polygons are either a plain ring [[x,z],...] (baked tracks, older live tracks) or {p: outer, h: [holes]}
// (live multipolygons with islands / inner rings). These helpers accept both.
export const polyOuter = (w) => Array.isArray(w) ? w : w.p;
export const polyHoles = (w) => Array.isArray(w) ? [] : (w.h || []);
export function inPolyH(x, z, w) { if (!pointInPoly(x, z, polyOuter(w))) return false; for (const h of polyHoles(w)) if (pointInPoly(x, z, h)) return false; return true; }
export class Grid {
  // spatial hash of points/boxes for fast proximity queries
  constructor(cell = 20) { this.c = cell; this.m = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(x, z, r, v) {
    const c = this.c;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      const k = this.key(i, j); if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(v);
    }
  }
  near(x, z) { return this.m.get(this.key(Math.floor(x / this.c), Math.floor(z / this.c))) || []; }
}
