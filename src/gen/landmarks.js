import * as THREE from 'three';
import { rng, Batch, M4, box, cyl, dome, extrude, pointedArchShape, paint, prep } from '../util.js';
import { signTexture } from './textures.js';

/** Landmark generators: each famous place on a route is rebuilt procedurally from its real
 *  OpenStreetMap footprint (position, size, orientation) using a recipe for its architecture. */
export function buildLandmarks(data, track, theme, mats) {
  const group = new THREE.Group(); const list = []; const updaters = [];
  for (const lm of data.landmarks) {
    const gen = GENS[lm.gen]; if (!gen) continue;
    const g = new THREE.Group(); const b = new Batch(); const ctx = { b, g, mats, track, lm, data, updaters };
    gen(ctx);
    const m = b.build(mats.flat); if (m) g.add(m);
    if (lm.x !== undefined && !g.userData.placed) { g.position.set(lm.x, 0, lm.z); }
    group.add(g);
    const p = lm.x !== undefined ? { x: lm.x, z: lm.z } : g.userData.center;
    list.push({ name: lm.name, x: p.x, z: p.z, r: Math.max(lm.w || 40, lm.d || 40) / 2 + 60 });
  }
  return { group, list, update: (t, night) => updaters.forEach(u => u(t, night)) };
}

const STONE = '#d8c6a0', STONE_D = '#b89c70', LIME = '#efe8d8', GRANITE = '#8e877b';

// rotate a local frame by footprint angle a (radians, from bake: edge angle in x/z)
const R = (a, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => { const c = Math.cos(a), s = Math.sin(a); return M4(x * c - z * s, y, x * s + z * c, ry - a, sx, sy, sz); };

function minaret(b, x, z, h, r, col, a = 0, rings = [0.42, 0.64, 0.84]) {
  const P = (yy) => R(a, x, yy, z);
  b.add(cyl(r * 0.85, r, h * 0.9, 12), col, P(0));
  for (const k of rings) { b.add(cyl(r * 1.45, r * 1.25, h * 0.018, 12), STONE_D, P(h * k)); b.add(cyl(r * 1.45, r * 1.45, h * 0.025, 12), col, P(h * k + h * 0.018)); }
  b.add(cyl(r * 0.9, r * 0.9, h * 0.04, 8), STONE_D, P(h * 0.9));
  b.add(dome(r * 1.05, r * 2.0, 10), LIME, P(h * 0.94));
  b.add(cyl(0.08, 0.15, r * 1.5, 4), '#c9a43c', P(h * 0.94 + r * 2.0));
}

const GENS = {
  charminar({ b, lm }) {
    // ~20 m square, four 11 m pointed arches, 56 m minarets with balconies and bulb domes
    const S = 20, a = lm.a || 0;
    b.add(box(S + 6, 0.6, S + 6), STONE_D, R(a, 0, 0, 0));
    const arch = pointedArchShape(11, 17.5, (S - 11) / 2, 21);
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2; const g = extrude(arch, 2.6);
      const ox = Math.sin(ang) * (S / 2 - 1.3), oz = Math.cos(ang) * (S / 2 - 1.3);
      b.add(g, STONE, R(a, ox, 0.6, oz, ang));
      // arch frame trim
      const t = new THREE.BoxGeometry(S, 0.7, 3.2); b.add(t, STONE_D, R(a, ox, 21.3, oz, ang));
      // gallery of small arches on 2nd level
      for (let j = -3; j <= 3; j++) {
        const sx = j * 2.5; const g2 = new THREE.BoxGeometry(1.5, 3.2, 0.3); g2.translate(0, 1.6, 0);
        b.add(g2, '#3b3125', R(a, ox + Math.cos(ang) * sx + Math.sin(ang) * 1.45, 23, oz - Math.sin(ang) * sx + Math.cos(ang) * 1.45, ang));
      }
    }
    b.add(box(S - 0.2, 7, S - 0.2), STONE, R(a, 0, 21.6, 0));
    b.add(box(S + 3, 0.5, S + 3), STONE_D, R(a, 0, 21.3, 0)); // chhajja
    b.add(box(S + 2, 0.45, S + 2), STONE_D, R(a, 0, 28.6, 0));
    for (let j = -4; j <= 4; j++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // parapet merlons
      const px = sx ? sx * (S / 2 + 0.6) : j * 2.2, pz = sz ? sz * (S / 2 + 0.6) : j * 2.2; b.add(box(0.7, 1.4, 0.7), LIME, R(a, px, 29, pz));
    }
    b.add(box(9, 3.5, 6), STONE, R(a, 0, 29, -4)); // rooftop mosque
    b.add(dome(2, 3, 8, 'hemi'), LIME, R(a, 0, 32.5, -4));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) minaret(b, sx * S / 2, sz * S / 2, 56, 1.7, STONE, a, [0.4, 0.52, 0.7, 0.84]);
  },
  masjid({ b, lm }) {
    const a = lm.a || 0; const W = Math.min(Math.max(lm.w, 50), 90), D = Math.min(Math.max(lm.d, 40), 80);
    b.add(box(W, 1, D), '#b9b1a3', R(a, 0, 0, 0)); // courtyard
    b.add(box(W * 0.8, 20, D * 0.32), GRANITE, R(a, 0, 1, -D * 0.3));
    const sh = new THREE.Shape(); const fw = W * 0.8, fh = 22; sh.moveTo(-fw / 2, 0); sh.lineTo(fw / 2, 0); sh.lineTo(fw / 2, fh); sh.lineTo(-fw / 2, fh);
    for (let k = 0; k < 5; k++) { const cx = -fw / 2 + fw * (k + 0.5) / 5, w = fw / 5 * 0.62; const p = new THREE.Path(); p.moveTo(cx - w / 2, 0); p.lineTo(cx - w / 2, 9); p.quadraticCurveTo(cx - w / 2, 14.5, cx, 15.5); p.quadraticCurveTo(cx + w / 2, 14.5, cx + w / 2, 9); p.lineTo(cx + w / 2, 0); sh.holes.push(p); }
    b.add(extrude(sh, 2.5), GRANITE, R(a, 0, 1, -D * 0.3 + D * 0.16 + 1.2));
    for (const s of [-1, 1]) { const x = s * fw / 2; b.add(cyl(2.4, 2.8, 30, 8), GRANITE, R(a, x, 1, -D * 0.14)); b.add(dome(2.8, 4.5, 8), '#a39b8c', R(a, x, 31, -D * 0.14)); }
    for (let j = -6; j <= 6; j++) b.add(box(1, 1.4, 1), '#a39b8c', R(a, j * fw / 13, 23, -D * 0.14));
  },
  fountain({ b, lm, track, g }) {
    // Gulzar Houz sits in the middle of the chowk; keep it beside the racing line
    let x = lm.x, z = lm.z; const q = track.nearest(x, z);
    if (q.d < q.w / 2 + 7) { const s = q.off >= 0 ? 1 : -1; const nx = -q.tz, nz = q.tx; x = q.x + nx * s * (q.w / 2 + 9); z = q.z + nz * s * (q.w / 2 + 9); }
    g.position.set(x, 0, z); g.userData.placed = true;
    b.add(cyl(6, 6.5, 0.9, 8), '#d9cdb5', M4()); b.add(cyl(5.4, 5.4, 0.95, 8), '#4e9fb0', M4());
    b.add(cyl(1.6, 2.2, 1.8, 8), '#e9dfca', M4(0, 0.9)); b.add(cyl(2.4, 1.0, 0.5, 8), '#e9dfca', M4(0, 2.7)); b.add(cyl(0.4, 0.6, 1.5, 6), '#e9dfca', M4(0, 3.2));
    const jet = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.55 })); jet.position.y = 5.5; g.add(jet);
  },
  kaman({ b, lm, track, g }) {
    // historic gateway arch spanning the street; oriented to the real road it stands on
    const q = track.nearest(lm.x, lm.z); const span = q.w + 3; const ang = Math.atan2(q.tz, q.tx);
    const sh = pointedArchShape(span, 14, 3.2, 19);
    b.add(extrude(sh, 4), STONE, M4(0, 0, 0, -ang + Math.PI / 2));
    b.add(box(span + 8, 0.6, 5), STONE_D, M4(0, 19, 0, -ang + Math.PI / 2));
    for (const s of [-1, 1]) { const ox = Math.cos(Math.PI / 2 - ang) * 0, nx = -q.tz, nz = q.tx; minaret(b, nx * s * (span / 2 + 1.6), nz * s * (span / 2 + 1.6), 26, 0.8, STONE, 0, [0.8]); }
    for (let j = -5; j <= 5; j++) { const nx = -q.tz, nz = q.tx; b.add(box(0.8, 1.2, 0.8), LIME, M4(nx * j * (span / 11), 19.6, nz * j * (span / 11))); }
    if (lm.onRoad || q.d < 20) { g.position.set(q.x, track.elev[q.i] || 0, q.z); g.userData.placed = true; }
  },
  palace({ b, lm, mats, g }) {
    const a = lm.a || 0; const W = Math.min(lm.w, 120), D = Math.min(lm.d, 90);
    b.add(box(W * 0.75, 15, D * 0.3), '#f3eee3', R(a, 0, 0, -D * 0.15));
    for (let k = 0; k <= 12; k++) { const x = -W * 0.36 + k * W * 0.06; b.add(cyl(0.45, 0.5, 9, 8), '#fffaf0', R(a, x, 0, D * 0.02)); }
    b.add(box(W * 0.75, 1.2, 3), '#e5dcc8', R(a, 0, 9, D * 0.02)); b.add(box(W * 0.76, 1, D * 0.33), '#d8ccb2', R(a, 0, 15, -D * 0.15));
    b.add(box(W * 0.2, 6, 3), '#f3eee3', R(a, 0, 15, D * 0.0)); // central pediment
    for (const s of [-1, 1]) { b.add(cyl(2, 2, 6, 8), '#f3eee3', R(a, s * W * 0.375, 15, D * 0.0)); b.add(dome(2.1, 3.5, 8), '#f8f3ea', R(a, s * W * 0.375, 21, D * 0.0)); }
    const pool = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 0.3, D * 0.25), mats.water); pool.position.set(Math.cos(a) * 0 - Math.sin(a) * D * 0.25, 0.1, Math.sin(a) * 0 + Math.cos(a) * D * 0.25); pool.rotation.y = -a; g.add(pool);
  },
  museum({ b, lm }) {
    const a = lm.a || 0; const W = Math.min(lm.w, 140), D = Math.min(lm.d, 100);
    b.add(box(W * 0.8, 14, D * 0.5), '#d9a77a', R(a, 0, 0, 0));
    for (let k = -4; k <= 4; k++) b.add(box(2.5, 5, 0.3), '#5a3b26', R(a, k * W * 0.08, 3, D * 0.25 + 0.1));
    b.add(cyl(7, 7, 6, 12), '#e2b98f', R(a, 0, 14, 0)); b.add(dome(7.5, 9, 12, 'hemi'), '#f1e4cf', R(a, 0, 20, 0));
    b.add(box(W * 0.82, 1, D * 0.52), '#c08a5c', R(a, 0, 14, 0));
  },
  buddha({ b, g }) {
    // 18 m monolith on the Rock of Gibraltar island in Hussain Sagar
    const rock = new THREE.DodecahedronGeometry(1, 0); rock.scale(14, 4, 11); b.add(rock, '#7c7468', M4(0, 0.5, 0));
    b.add(cyl(5, 6, 3, 10), '#d6d0c3', M4(0, 3.5)); b.add(cyl(4.2, 4.8, 1.5, 10), '#e6c86e', M4(0, 6.5));
    const prof = [[2.6, 0], [2.8, 2], [2.6, 6], [2.4, 10], [2.8, 12.5], [2.9, 13.6], [1.3, 14.4], [0.9, 15], [1.3, 15.6], [1.35, 16.5], [1.15, 17.3], [0.7, 17.8], [0.25, 18.2], [0.01, 18.3]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.LatheGeometry(prof, 10); body.scale(1, 1, 0.75); b.add(body, '#f2efe7', M4(0, 8));
    const arm = new THREE.BoxGeometry(0.8, 4.2, 0.9); arm.translate(0, 2.1, 0); b.add(arm, '#f2efe7', M4(1.6, 8 + 9.5, 0.9, 0, 1, 1, 1, -0.9));
    b.add(box(1.3, 1.8, 0.4), '#f2efe7', M4(1.6, 8 + 12.5, 3.5));
  },
  secretariat({ b, lm }) {
    const a = lm.a || 0; const W = Math.min(Math.max(lm.w, 120), 220), D = Math.min(Math.max(lm.d, 70), 140);
    b.add(box(W * 0.9, 22, D * 0.6), '#f1ebe0', R(a, 0, 0, 0));
    b.add(box(W * 0.92, 1.2, D * 0.62), '#c99a63', R(a, 0, 22, 0));
    b.add(box(W * 0.3, 26, D * 0.35), '#f1ebe0', R(a, 0, 22, 0));
    for (const s of [-1, 1]) { b.add(cyl(6, 6, 6, 12), '#e9dfcb', R(a, s * W * 0.08, 48, 0)); b.add(dome(6.6, 10, 12), '#d2a774', R(a, s * W * 0.08, 54, 0)); }
    for (let k = -6; k <= 6; k++) { if (Math.abs(k) < 2) continue; b.add(cyl(1.4, 1.4, 2.5, 8), '#e9dfcb', R(a, k * W * 0.07, 23.2, D * 0.28)); b.add(dome(1.6, 2.4, 8), '#d2a774', R(a, k * W * 0.07, 25.7, D * 0.28)); }
    for (let f = 0; f < 6; f++) b.add(box(W * 0.9 + 0.2, 0.25, D * 0.6 + 0.2), '#9fb3c4', R(a, 0, 3 + f * 3.5, 0));
  },
  memorial({ b, g, mats, updaters }) {
    // Telangana Martyrs' Memorial: a stainless-steel diya (lamp) on a sandstone drum
    b.add(cyl(26, 28, 9, 16), '#c9a57a', M4()); b.add(cyl(24, 24, 1, 16), '#b58b5e', M4(0, 9));
    const prof = [[3, 0], [6, 4], [15, 9], [20, 13], [21, 14], [16, 15], [8, 15.5], [0.01, 15.6]].map(([x, y]) => new THREE.Vector2(x, y));
    const lamp = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), mats.metal); lamp.position.y = 10; lamp.castShadow = true; g.add(lamp);
    const fm = new THREE.MeshBasicMaterial({ color: '#ffb52e' });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(4, 18, 8), fm); flame.position.y = 34; g.add(flame);
    updaters.push((t) => { flame.scale.set(1 + Math.sin(t * 7) * 0.05, 1 + Math.sin(t * 5.3) * 0.08, 1); });
  },
  statue({ b }) {
    b.add(cyl(14, 15, 12, 16), '#d9cbb3', M4()); b.add(cyl(4, 4, 4, 8), '#c5b59a', M4(0, 12));
    b.add(cyl(2, 2.6, 22, 8), '#3b3f45', M4(0, 16)); b.add(new THREE.IcosahedronGeometry(1.6, 0), '#3b3f45', M4(0, 39.5));
  },
  parkgate({ b, lm, g, track }) {
    const q = track.nearest(lm.x, lm.z); const ang = Math.atan2(q.tz, q.tx); const nx = -q.tz, nz = q.tx; const s = q.off >= 0 ? 1 : -1;
    const x = q.x + nx * s * (q.w / 2 + 8), z = q.z + nz * s * (q.w / 2 + 8); g.position.set(x, 0, z); g.userData.placed = true;
    for (const k of [-1, 1]) b.add(box(1.4, 7, 1.4), '#c2563a', M4(q.tx * k * 6, 0, q.tz * k * 6));
    b.add(box(14, 1.4, 1.2), '#c2563a', M4(0, 7, 0, -ang));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), new THREE.MeshBasicMaterial({ map: signTexture(lm.name.toUpperCase(), '#1e5631'), side: THREE.DoubleSide }));
    sign.position.set(0, 9, 0); sign.rotation.y = -ang; g.add(sign);
  },
  cybertowers({ b, g, mats, lm }) {
    // the circular, tiered glass landmark that started HITEC City
    const Rr = Math.min(Math.max(lm.w, lm.d) / 2, 34);
    for (let f = 0; f < 10; f++) {
      const rr = Rr * (1 - f * 0.012);
      b.add(cyl(rr + 0.6, rr + 0.6, 0.7, 24), '#eef0f2', M4(0, f * 4.2));
      const gl = new THREE.Mesh(cyl(rr, rr, 3.5, 24), mats.glass); gl.position.y = f * 4.2 + 0.7; g.add(gl);
    }
    b.add(cyl(Rr * 0.35, Rr * 0.35, 50, 16), '#e5e8eb', M4()); b.add(dome(Rr * 0.38, 6, 16, 'hemi'), '#b7c4cc', M4(0, 50));
    b.add(cyl(Rr + 1, Rr + 1, 1.2, 24), '#d0d4d8', M4(0, 42));
  },
  mall({ b, g, lm, track }) {
    const a = lm.a || 0; const W = Math.min(lm.w, 200), D = Math.min(lm.d, 140);
    b.add(box(W, 24, D), '#d9d6d2', R(a, 0, 0, 0));
    for (let f = 0; f < 4; f++) b.add(box(W + 0.4, 0.6, D + 0.4), '#8a8f96', R(a, 0, 5 + f * 5, 0));
    const q = track.nearest(lm.x, lm.z); const face = Math.atan2(q.x - lm.x, q.z - lm.z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ map: signTexture(lm.sign || 'INORBIT', '#5b2a86') }));
    const r = Math.min(W, D) / 2 + 0.5; sign.position.set(Math.sin(face) * r, 18, Math.cos(face) * r); sign.rotation.y = face; g.add(sign);
  },
  glasscampus({ b, g, mats, lm }) {
    const r = rng(7); for (let k = 0; k < 5; k++) { const h = 40 + r() * 40, x = (r() - 0.5) * lm.w * 0.6, z = (r() - 0.5) * lm.d * 0.6; const t = new THREE.Mesh(box(28, h, 22), mats.glass); t.position.set(x, 0, z); t.castShadow = true; g.add(t); b.add(box(29, 3, 23), '#cfd6db', M4(x, h, z)); }
  },
  cablebridge({ b, g, track, lm, updaters }) {
    // Durgam Cheruvu cable-stayed bridge: two A-frame pylons with fanned cables over the lake
    g.userData.placed = true; const i0 = lm.i0, i1 = lm.i1;
    const cables = [], cols = [];
    const mid = track.frame((i0 + i1) >> 1); g.userData.center = { x: mid.x, z: mid.z };
    for (const t of [0.3, 0.7]) {
      const i = Math.round(i0 + (i1 - i0) * t); const f = track.frame(i); const H = 55; const hw = f.w / 2 + 3;
      const top = new THREE.Vector3(f.x, f.y + H, f.z);
      for (const s of [1, -1]) {
        const foot = new THREE.Vector3(f.x + f.nx * s * hw, 0, f.z + f.nz * s * hw);
        const dir = top.clone().sub(foot); const L = dir.length();
        const leg = new THREE.BoxGeometry(1.8, L, 2.4); leg.translate(0, L / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        const m = new THREE.Matrix4().compose(foot, q, new THREE.Vector3(1, 1, 1)); b.add(leg, '#f4f4f2', m);
      }
      b.add(box(3, 6, 3), '#f4f4f2', M4(f.x, f.y + H - 2, f.z));
      for (let k = -14; k <= 14; k++) {
        if (!k) continue; const j = i + k * 3; if (j < i0 - 5 || j > i1 + 5) continue; const d = track.frame(j);
        for (const s of [1, -1]) { cables.push(top.x, top.y - 1 - Math.abs(k) * 0.3, top.z, d.x + d.nx * s * (d.w / 2 + 2), d.y + 0.5, d.z + d.nz * s * (d.w / 2 + 2)); cols.push(k, k); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
    const ca = new Float32Array(cables.length); geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true })); g.add(lines);
    const c = new THREE.Color();
    updaters.push((t, night) => {
      for (let k = 0; k < cols.length; k++) { if (night > 0.5) c.setHSL((cols[k] * 0.03 + t * 0.08) % 1, 0.9, 0.6); else c.set('#e8e8e8'); ca[k * 6] = ca[k * 6 + 3] = c.r; ca[k * 6 + 1] = ca[k * 6 + 4] = c.g; ca[k * 6 + 2] = ca[k * 6 + 5] = c.b; }
      geo.attributes.color.needsUpdate = true;
    });
  },
  // ---- generic recipes used by the live "build anywhere" generator ----
  church({ b, lm }) {
    const a = lm.a || 0; const L = Math.min(Math.max(lm.w, 24), 70), W = Math.min(Math.max(lm.d, 12), 30);
    b.add(box(L, 12, W), '#d9d2c4', R(a, 0, 0, 0));
    const roof = new THREE.CylinderGeometry(W * 0.62, W * 0.62, L, 3, 1); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.6, 1); roof.translate(0, 12 + W * 0.18, 0);
    b.add(roof, '#6d4c41', R(a, 0, 0, 0));
    for (let k = -3; k <= 3; k++) b.add(box(1.2, 5, 0.3), '#3d4a63', R(a, k * L * 0.12, 4, W / 2 + 0.05));
    const tx = -L / 2 - 4; b.add(box(9, 26, 9), '#cfc7b6', R(a, tx, 0, 0)); b.add(box(10, 1, 10), '#b8ae9a', R(a, tx, 26, 0));
    const sp = new THREE.ConeGeometry(5.6, 22, 4); sp.rotateY(Math.PI / 4); sp.translate(0, 11, 0); b.add(sp, '#5d5f66', R(a, tx, 27, 0));
    b.add(box(0.4, 3, 0.4), '#c9a43c', R(a, tx, 49, 0)); b.add(box(1.8, 0.4, 0.4), '#c9a43c', R(a, tx, 50.4, 0));
  },
  temple({ b, lm }) {
    // stepped gopuram gateway + shrine with a shikhara
    const a = lm.a || 0; const S = Math.min(Math.max(Math.max(lm.w, lm.d), 22), 50);
    b.add(box(S, 1.2, S), '#d8cdb8', R(a, 0, 0, 0));
    const cols = ['#e8b04a', '#d9534f', '#5bc0de', '#f0ad4e', '#5cb85c', '#e8e0cf'];
    let w = S * 0.5, d = S * 0.28, y = 1.2;
    for (let k = 0; k < 7; k++) { b.add(box(w, 3.4, d), cols[k % cols.length], R(a, 0, y, S * 0.3)); y += 3.4; w *= 0.84; d *= 0.9; }
    const cap = new THREE.CylinderGeometry(w * 0.3, w * 0.3, w * 1.1, 8); cap.rotateZ(Math.PI / 2); cap.translate(0, y + 1, 0); b.add(cap, '#e8b04a', R(a, 0, 0, S * 0.3));
    b.add(box(S * 0.36, 8, S * 0.36), '#efe5d2', R(a, 0, 1.2, -S * 0.12));
    let r0 = S * 0.2, yy = 9.2; for (let k = 0; k < 5; k++) { b.add(cyl(r0 * 0.85, r0, 2.6, 8), '#e9d9b8', R(a, 0, yy, -S * 0.12)); yy += 2.6; r0 *= 0.82; }
    b.add(dome(r0 * 1.2, r0 * 1.6, 8, 'hemi'), '#e8b04a', R(a, 0, yy, -S * 0.12)); b.add(cyl(0.12, 0.25, 2.5, 4), '#c9a43c', R(a, 0, yy + r0 * 1.6, -S * 0.12));
  },
  monument({ b, lm }) {
    const s = Math.min(Math.max(lm.w, 10), 24);
    b.add(box(s, 1.2, s), '#cfc6b4', M4()); b.add(box(s * 0.62, 1.6, s * 0.62), '#bdb3a0', M4(0, 1.2)); b.add(box(s * 0.36, 3, s * 0.36), '#d8d0c0', M4(0, 2.8));
    const ob = new THREE.CylinderGeometry(s * 0.08, s * 0.16, s * 1.8, 4); ob.rotateY(Math.PI / 4); ob.translate(0, s * 0.9, 0); b.add(ob, '#e3dccd', M4(0, 5.8));
    const tip = new THREE.ConeGeometry(s * 0.11, s * 0.2, 4); tip.rotateY(Math.PI / 4); tip.translate(0, s * 0.1, 0); b.add(tip, '#c9a43c', M4(0, 5.8 + s * 1.8));
  },
  clocktower({ b, g, updaters }) {
    b.add(box(7, 2, 7), '#b9a68a', M4()); b.add(box(5.2, 20, 5.2), '#d8c6a0', M4(0, 2));
    b.add(box(6.2, 5, 6.2), '#cbb48c', M4(0, 22)); b.add(box(6.6, 0.6, 6.6), '#a8916b', M4(0, 27));
    const sp = new THREE.ConeGeometry(4.2, 7, 4); sp.rotateY(Math.PI / 4); sp.translate(0, 3.5, 0); b.add(sp, '#7b5e3b', M4(0, 27.6));
    const faceM = new THREE.MeshBasicMaterial({ color: '#fff8e6' }); const hands = [];
    for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2; const f = new THREE.Mesh(new THREE.CircleGeometry(2, 16), faceM); f.position.set(Math.sin(ang) * 3.12, 24.5, Math.cos(ang) * 3.12); f.rotation.y = ang; g.add(f);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.7), new THREE.MeshBasicMaterial({ color: '#222' })); h.geometry.translate(0, 0.7, 0); h.position.copy(f.position).add(new THREE.Vector3(Math.sin(ang) * 0.03, 0, Math.cos(ang) * 0.03)); h.rotation.y = ang; g.add(h); hands.push(h); }
    updaters.push((t) => hands.forEach(h => h.rotation.z = -t * 0.2));
  },
  stadium({ b, lm }) {
    const a = lm.a || 0; const W = Math.min(Math.max(lm.w, 120), 230), D = Math.min(Math.max(lm.d, 90), 190);
    for (let k = 0; k < 4; k++) { const rw = W / 2 - k * 6, rd = D / 2 - k * 6; const ring = new THREE.CylinderGeometry(rw, rw + 3, 6, 28, 1, true); ring.scale(1, 1, rd / rw); ring.translate(0, 3 + k * 0, 0); b.add(ring, k % 2 ? '#d0d4d8' : '#b9c0c7', R(a, 0, 14 - k * 4, 0)); }
    const pitch = new THREE.CylinderGeometry(W / 2 - 26, W / 2 - 26, 0.3, 28); pitch.scale(1, 1, (D / 2 - 26) / (W / 2 - 26)); b.add(pitch, '#4f8f3a', R(a, 0, 0.15, 0));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { b.add(cyl(0.6, 0.8, 40, 6), '#9aa0a6', R(a, sx * W * 0.42, 0, sz * D * 0.42)); b.add(box(6, 3, 1), '#fff6d0', R(a, sx * W * 0.42, 40, sz * D * 0.42)); }
  },
  tower({ b, g, mats, lm }) {
    const s = Math.min(Math.max(Math.min(lm.w, lm.d), 18), 40); const H = Math.min(Math.max(lm.h || 90, 60), 220);
    const t1 = new THREE.Mesh(box(s, H * 0.6, s), mats.glass); t1.castShadow = true; g.add(t1);
    const t2 = new THREE.Mesh(box(s * 0.74, H * 0.3, s * 0.74), mats.glass); t2.position.y = H * 0.6; t2.castShadow = true; g.add(t2);
    b.add(box(s + 0.6, 1, s + 0.6), '#cfd6db', M4(0, H * 0.6)); b.add(box(s * 0.5, H * 0.08, s * 0.5), '#cfd6db', M4(0, H * 0.9)); b.add(cyl(0.3, 0.5, H * 0.12, 6), '#d8dde2', M4(0, H * 0.98));
  },
};
