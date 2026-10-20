import * as THREE from 'three';
import { rng, pick, Batch, M4, box, cyl, dome, paint } from '../util.js';
import { BAYS, FLOORS } from './textures.js';

const signedArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };

/** Procedural building engine.
 *  Every footprint (real OSM outline or generated filler) is extruded with a theme facade,
 *  then decorated by seeded rules: parapets, roof tanks, stair rooms, domes, crowns, awnings. */
export function buildBuildings(list, theme, mats, track) {
  const pos = [], uv = [], col = [], nor = [];
  const roof = new Batch(), deco = new Batch();
  const fu = 3 * BAYS, fv = theme.floorH * FLOORS;
  const tc = new THREE.Color();
  const pushV = (x, y, z, u, v, c, n) => { pos.push(x, y, z); uv.push(u, v); col.push(c.r, c.g, c.b); nor.push(n[0], n[1], n[2]); };
  for (const b of list) {
    const r = rng(b.s * 977 + 13);
    let p = b.p.slice(); if (signedArea(p) < 0) p.reverse(); // positive area => edge normal (dz,-dx) points outward
    const area = Math.abs(signedArea(p));
    let h = b.h;
    if (!h) {
      const [f0, f1] = theme.floors; let floors = f0 + Math.floor(r() * (f1 - f0 + 1));
      if (theme.facade === 'glass') { if (area < 400) floors = 3 + Math.floor(r() * 4); else if (area > 2500) floors += 6; }
      if (theme.facade === 'mughal' && area > 1500) floors = Math.min(floors, 3);
      if (theme.facade === 'modern' && area < 120) floors = 2;
      h = floors * theme.floorH;
    }
    h = Math.max(h, 3.2);
    tc.set(b.color || pick(r, theme.walls)); tc.offsetHSL(0, 0, (r() - 0.5) * 0.06);
    // walls (vertex range kept so street-level facade colours can repaint this building later)
    b._w0 = pos.length / 3;
    let ucur = r() * 4;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const n = [dz / L, 0, -dx / L];
      const u0 = ucur / fu, u1 = (ucur + L) / fu, v1 = h / fv;
      pushV(a[0], 0, a[1], u0, 0, tc, n); pushV(c[0], h, c[1], u1, v1, tc, n); pushV(c[0], 0, c[1], u1, 0, tc, n);
      pushV(a[0], 0, a[1], u0, 0, tc, n); pushV(a[0], h, a[1], u0, v1, tc, n); pushV(c[0], h, c[1], u1, v1, tc, n);
      ucur += L;
      // shop awning facing the race track
      if (theme.shops && L > 4 && track && r() < 0.7) {
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2; const q = track.nearest(mx, mz);
        if (q.d < q.w / 2 + 14 && (q.x - mx) * n[0] + (q.z - mz) * n[2] > 0) {
                    const aw = new THREE.BoxGeometry(L * 0.9, 0.15, 1.8); aw.translate(0, 0, 0.9); aw.rotateX(0.25);
          deco.add(aw, pick(r, ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d3c98', '#e67e22', '#16a085']), M4(mx + n[0] * 0.05, 3.0, mz + n[2] * 0.05, Math.atan2(n[0], n[2])));
        }
      }
    }
    b._w1 = pos.length / 3;
    // roof cap
    const shape = new THREE.Shape(p.map(q => new THREE.Vector2(q[0], -q[1])));
    const rg = new THREE.ShapeGeometry(shape); rg.rotateX(-Math.PI / 2); rg.translate(0, h, 0);
    roof.add(rg, theme.roof);
    // parapet (thin ring)
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 1) continue;
      const g = new THREE.BoxGeometry(L, 0.9, 0.25); g.translate(0, 0.45, 0);
      roof.add(g, tc.clone().offsetHSL(0, 0, -0.05), M4((a[0] + c[0]) / 2, h, (a[1] + c[1]) / 2, -Math.atan2(c[1] - a[1], c[0] - a[0])));
    }
    // roof decorations
    let cx = 0, cz = 0; p.forEach(q => { cx += q[0]; cz += q[1]; }); cx /= p.length; cz /= p.length;
    const rad = Math.sqrt(area) * 0.25;
    if (area > 40 && r() < theme.tankChance) { // black Sintex water tanks
      const k = 1 + Math.floor(r() * 2);
      for (let t = 0; t < k; t++) deco.add(cyl(0.75, 0.75, 1.6, 8), '#1b1b1b', M4(cx + (r() - 0.5) * rad, h, cz + (r() - 0.5) * rad));
    }
    if (area > 60 && r() < 0.4) deco.add(box(3, 2.6, 3), tc.clone().offsetHSL(0, 0, -0.08), M4(cx + (r() - 0.5) * rad, h, cz + (r() - 0.5) * rad, r() * 3));
    if (theme.domeChance && area > 90 && r() < theme.domeChance) {
      const dr = Math.min(Math.sqrt(area) * 0.2, 5);
      deco.add(cyl(dr * 0.9, dr * 0.9, 1.2, 10), '#efe6d2', M4(cx, h, cz));
      deco.add(dome(dr, dr * 1.6, 10), '#f4efe4', M4(cx, h + 1.2, cz));
      for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) deco.add(cyl(0.35, 0.45, 3, 6), '#efe6d2', M4(cx + ox * dr * 1.2, h, cz + oz * dr * 1.2));
    }
    if (theme.facade === 'glass' && h > 30) {
      deco.add(box(Math.sqrt(area) * 0.4, 4, Math.sqrt(area) * 0.4), '#9aa6ad', M4(cx, h, cz));
      if (r() < 0.4) deco.add(cyl(0.15, 0.15, 10, 4), '#d33', M4(cx, h + 4, cz));
    }
    if (theme.facade === 'modern' && r() < 0.15 && area > 80) deco.add(box(6, 3, 0.3), pick(r, ['#c62828', '#1565c0', '#2e7d32', '#f9a825']), M4(cx, h + 0.9, cz, r() * 3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const grp = new THREE.Group();
  const walls = new THREE.Mesh(g, mats.facade); walls.castShadow = walls.receiveShadow = true; grp.add(walls); grp.userData.walls = walls;
  const rm = roof.build(mats.flat); if (rm) grp.add(rm);
  const dm = deco.build(mats.flat); if (dm) grp.add(dm);
  return grp;
}

/** Filler engine: where OpenStreetMap has no mapped building next to the track, grow plausible
 *  street-front blocks so the corridor reads as a dense city street. */
export function fillerBuildings(track, data, theme, occupied, isBlocked) {
  const out = []; const r = rng(data.center.length * 31 + data.key.length);
  if (!theme.filler) return out;
  const C = data.center;
  for (const side of [-1, 1]) {
    let i = 2;
    while (i < C.length - 2) {
      const seg = 3 + Math.floor(r() * 3); // 12-20 m frontage
      const i1 = Math.min(i + seg, C.length - 1);
      if (r() > theme.filler) { i = i1 + 1; continue; }
      const a = track.frame(i), c = track.frame(i1);
      const wa = C[i][2] / 2 + 5 + r() * 2, wc = C[i1][2] / 2 + 5 + r() * 2;
      const dep = theme.fillerDepth[0] + r() * (theme.fillerDepth[1] - theme.fillerDepth[0]);
      const p0 = [a.x + a.nx * side * wa, a.z + a.nz * side * wa], p1 = [c.x + c.nx * side * wc, c.z + c.nz * side * wc];
      const free = ([x, z]) => !occupied(x, z) && !isBlocked(x, z);
      const clear = ([x, z]) => { const q = track.nearest(x, z); return q.d > q.w / 2 + 3; };
      if (free(p0) && free(p1) && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 6) {
        for (const dd of [dep, dep * 0.6, 6]) {
          const p2 = [c.x + c.nx * side * (wc + dd), c.z + c.nz * side * (wc + dd)], p3 = [a.x + a.nx * side * (wa + dd), a.z + a.nz * side * (wa + dd)];
          const mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
          if (free(p2) && free(p3) && free(mid) && clear(p2) && clear(p3)) { out.push({ p: [p0, p1, p2, p3], h: 0, s: Math.floor(r() * 1e5), filler: true }); break; }
        }
      }
      i = i1 + (r() < 0.2 ? 2 : 0) + 1;
    }
  }
  return out;
}
