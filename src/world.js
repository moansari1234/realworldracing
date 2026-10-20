import * as THREE from 'three';
import { rng, pick, Batch, M4, box, cyl, pointInPoly, inPolyH, polyOuter, polyHoles, Grid, canvasTex } from './util.js';
import { facadeTextures, roadTexture, signTexture } from './gen/textures.js';
import { buildBuildings, fillerBuildings } from './gen/buildings.js';
import { buildLandmarks } from './gen/landmarks.js';

/** World generator: turns one baked real-world track into a low-poly city. */
export function buildWorld(data, track, theme, scene) {
  const root = new THREE.Group(); scene.add(root);
  const mats = makeMaterials(theme, data.key);
  const C = data.center;
  // ---------- ground ----------
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; for (const c of C) { mnx = Math.min(mnx, c[0]); mxx = Math.max(mxx, c[0]); mnz = Math.min(mnz, c[1]); mxz = Math.max(mxz, c[1]); }
  const gsize = Math.max(mxx - mnx, mxz - mnz) + 4000;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), mats.ground); ground.rotation.x = -Math.PI / 2; ground.position.set((mnx + mxx) / 2, -0.02, (mnz + mxz) / 2); ground.receiveShadow = true; root.add(ground);
  const polyMesh = (ring, mat, y, holes = []) => { const sh = new THREE.Shape(ring.map(p => new THREE.Vector2(p[0], -p[1]))); for (const h of holes) sh.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], -p[1])))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.y = y; m.receiveShadow = true; return m; };
  const parkB = []; for (const p of data.parks) { if (p.length > 2) { const m = polyMesh(p, mats.grass, 0.02); root.add(m); parkB.push(p); } }
  // Layer order on flat ground, bottom to top: ground < parks < water < side streets < race road. Each layer sits a
  // little higher AND gets a stronger polygonOffset toward the camera. (Water used to have the strongest offset, -2,
  // so far away it won the depth test against roads and painted rivers over them.)
  const waterPolys = data.water.filter(w => polyOuter(w).length > 2);
  for (const w of waterPolys) { root.add(polyMesh(polyOuter(w), mats.water, 0.03, polyHoles(w))); }
  const inWater = (x, z) => waterPolys.some(w => inPolyH(x, z, w));
  // ---------- side streets ----------
  const sideB = new Batch();
  for (const r of data.roads) {
    const p = r.p, w = r.w * 0.9;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const g = new THREE.PlaneGeometry(L + w * 0.5, w); g.rotateX(-Math.PI / 2);
      sideB.add(g, undefined, M4((a[0] + b[0]) / 2, 0.06 + (r.w % 3) * 0.004, (a[1] + b[1]) / 2, -Math.atan2(b[1] - a[1], b[0] - a[0])));
    }
  }
  const sm = sideB.build(mats.side); if (sm) { sm.traverse(o => { o.castShadow = false; }); root.add(sm); }
  // ---------- main race road (ribbon) ----------
  root.add(buildRoad(track, theme, mats));
  // ---------- buildings: real OSM footprints + generated fillers ----------
  const occ = new Grid(15);
  data.buildings.forEach((b, k) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of b.p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } occ.add((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2, b); });
  const occupied = (x, z) => occ.near(x, z).some(b => pointInPoly(x, z, b.p));
  const lmBlock = (x, z) => data.landmarks.some(l => l.x !== undefined && Math.hypot(l.x - x, l.z - z) < Math.min(Math.max(l.w || 30, l.d || 30) * 0.55 + 6, 45));
  const blocked = (x, z) => inWater(x, z) || lmBlock(x, z) || parkB.some(p => pointInPoly(x, z, p));
  const fill = fillerBuildings(track, data, theme, occupied, blocked);
  const all = data.buildings.concat(fill);
  const bgrp = buildBuildings(all, theme, mats, track); root.add(bgrp);
  for (const b of fill) occ.add(b.p[0][0], b.p[0][1], 20, b);
  // ---------- landmarks ----------
  const lm = buildLandmarks(data, track, theme, mats); root.add(lm.group);
  // ---------- street furniture, trees ----------
  root.add(buildProps(data, track, theme, mats, (x, z) => occupied(x, z) || inWater(x, z) || lmBlock(x, z), parkB, inWater));
  const blockedProp = (x, z) => occupied(x, z) || inWater(x, z) || lmBlock(x, z);
  return { root, mats, landmarks: lm.list, update: lm.update, inWater, blockedProp, buildings: all, walls: bgrp.userData.walls };
}

function makeMaterials(theme, key) {
  const fac = facadeTextures(theme.facade, key.length * 17 + 3);
  const facade = new THREE.MeshLambertMaterial({ map: fac.map, vertexColors: true, emissiveMap: fac.emissiveMap, emissive: new THREE.Color('#ffcf88'), emissiveIntensity: 0 });
  const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const roadTex = roadTexture('main', theme.road); const sideTex = roadTexture('side', theme.road);
  const road = new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const side = new THREE.MeshLambertMaterial({ map: sideTex, color: '#e8e8e8', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  sideTex.repeat.set(0.1, 0.1);
  const gtex = canvasTex(256, 256, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); const r = rng(9); for (let i = 0; i < 3000; i++) { const v = 205 + r() * 50; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(r() * w, r() * h, 3, 3); } });
  gtex.repeat.set(400, 400);
  const ground = new THREE.MeshLambertMaterial({ color: theme.ground, map: gtex, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const grass = new THREE.MeshLambertMaterial({ color: theme.grass });
  const water = new THREE.MeshStandardMaterial({ color: theme.water, roughness: 0.15, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const walk = new THREE.MeshLambertMaterial({ vertexColors: true });
  const metal = new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.2, metalness: 0.9, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: '#7fb0d0', roughness: 0.08, metalness: 0.6, flatShading: true, emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0 });
  return { facade, flat, glow, road, side, ground, grass, water, walk, metal, glass };
}

function buildRoad(track, theme, mats) {
  const C = track.C, n = C.length; const grp = new THREE.Group();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const f = track.frame(i), hw = f.w / 2; const y = f.y + 0.12;
    pos.push(f.x + f.nx * hw, y, f.z + f.nz * hw, f.x - f.nx * hw, y, f.z - f.nz * hw);
    uv.push(0, track.s[i] / 12, 1, track.s[i] / 12);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // fix winding so normals point up
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  const road = new THREE.Mesh(g, mats.road); road.receiveShadow = true; grp.add(road);
  // kerbs (yellow/black, Indian style) + sidewalks, per segment so colours can alternate
  const kb = new Batch(), wb = new Batch();
  const [k1, k2] = theme.kerb;
  for (let i = 0; i < n - 1; i++) {
    const a = track.frame(i), b = track.frame(i + 1);
    for (const side of [1, -1]) {
      const ha = a.w / 2, hb = b.w / 2;
      const q = (o1, o2, h, ya, yb) => {
        const p = [a.x + a.nx * side * o1, ya, a.z + a.nz * side * o1, b.x + b.nx * side * o1, yb, b.z + b.nz * side * o1, b.x + b.nx * side * o2, yb, b.z + b.nz * side * o2, a.x + a.nx * side * o2, ya, a.z + a.nz * side * o2];
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); return geo;
      };
      kb.add(q(ha, ha + 0.6, 0, a.y + 0.28, b.y + 0.28), (Math.floor(track.s[i] / 2) % 2) ? k1 : k2);
      wb.add(q(ha + 0.6, ha + 4.5, 0, a.y + 0.3, b.y + 0.3), theme.sidewalk);
    }
  }
  const km = kb.build(mats.flat); km.traverse(o => o.castShadow = false); grp.add(km);
  const wm = wb.build(mats.walk); wm.traverse(o => o.castShadow = false); grp.add(wm);
  // bridge decks: girders + piers + railings
  const bb = new Batch();
  for (let i = 0; i < n - 1; i++) {
    const a = track.frame(i), b = track.frame(i + 1); if (a.y < 0.5) continue;
    const L = Math.hypot(b.x - a.x, b.z - a.z), ang = -Math.atan2(b.z - a.z, b.x - a.x);
    const g = new THREE.BoxGeometry(L + 0.2, 1.4, a.w + 9); g.translate(0, -0.7, 0);
    bb.add(g, '#b8b4ac', M4((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.1, (a.z + b.z) / 2, ang, 1, 1, 1, 0, Math.atan2(b.y - a.y, L)));
    if (i % 6 === 0 && a.y > 2) bb.add(box(2.2, a.y, 2.2), '#a9a59d', M4(a.x, 0, a.z, ang));
    if (i % 2 === 0) for (const s of [1, -1]) bb.add(box(L + 0.3, 1.1, 0.25), '#e8e4dc', M4((a.x + b.x) / 2 + a.nx * s * (a.w / 2 + 4.4), (a.y + b.y) / 2 + 0.3, (a.z + b.z) / 2 + a.nz * s * (a.w / 2 + 4.4), ang));
  }
  const bm = bb.build(mats.flat); if (bm) grp.add(bm);
  // start & finish gantries
  const gantry = (i, label, bg) => {
    const f = track.frame(i); const g = new THREE.Group(); const span = f.w + 6;
    const b2 = new Batch();
    for (const s of [1, -1]) b2.add(box(0.8, 8, 0.8), '#30343a', M4(f.nx * s * span / 2, 0, f.nz * s * span / 2));
    const m = b2.build(mats.flat); g.add(m);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(span, 2.2, 0.4), [mats.flat, mats.flat, mats.flat, mats.flat, new THREE.MeshBasicMaterial({ map: signTexture(label, bg) }), new THREE.MeshBasicMaterial({ map: signTexture(label, bg) })]);
    sign.geometry.deleteAttribute('color');
    sign.material[0] = sign.material[1] = sign.material[2] = sign.material[3] = new THREE.MeshLambertMaterial({ color: '#30343a' });
    sign.position.set(0, 8, 0); sign.rotation.y = Math.atan2(f.tx, f.tz) + Math.PI; g.add(sign);
    g.position.set(f.x, f.y, f.z); grp.add(g);
  };
  gantry(2, 'START', '#0e3b5c');
  if (!track.loop) gantry(n - 3, 'FINISH', '#7a1020');
  return grp;
}

function buildProps(data, track, theme, mats, occupied, parks, inWater) {
  const grp = new THREE.Group(); const r = rng(data.center.length + 99);
  const C = data.center, n = C.length;
  const trees = [];
  // OSM-mapped trees
  for (const t of data.trees) trees.push([t[0], t[1], 0.8 + r() * 0.5]);
  // avenue trees + lamp posts along the track
  const lamps = new Batch(), deco = new Batch();
  for (let i = 0; i < n; i += 2) {
    const f = track.frame(i); if (f.y > 0.5) continue;
    for (const s of [1, -1]) {
      const o = f.w / 2 + 3.2; const x = f.x + f.nx * s * o, z = f.z + f.nz * s * o;
      if (occupied(x, z)) continue;
      if ((i % 8 === 0) && s === 1) {
        // lamp post, arm reaching over the road
        const ang = Math.atan2(-f.nx * s, -f.nz * s);
        lamps.add(cyl(0.12, 0.18, 9, 6), '#5d6168', M4(x, 0, z));
        const arm = new THREE.BoxGeometry(0.12, 0.12, 2.6); arm.translate(0, 0, 1.3); lamps.add(arm, '#5d6168', M4(x, 9, z, ang));
        const head = new THREE.BoxGeometry(0.5, 0.18, 0.9); deco.add(head, '#fff2cc', M4(x - f.nx * s * 2.5, 8.9, z - f.nz * s * 2.5, ang));
      } else if (r() < theme.treeChance * 0.6 && !inWater(x + f.nx * s * 2, z + f.nz * s * 2)) trees.push([x + f.nx * s * 1.5, z + f.nz * s * 1.5, 0.8 + r() * 0.6]);
    }
  }
  // Tank Bund: the famous row of statues of Telugu personalities along the lake side
  if (data.key === 'lake') {
    for (let i = 0; i < n; i += 9) {
      const f = track.frame(i); if (!/Tank Bund/.test(f.name)) continue;
      for (const s of [1, -1]) {
        const o = f.w / 2 + 3; const x = f.x + f.nx * s * o, z = f.z + f.nz * s * o;
        if (!inWater(x + f.nx * s * 12, z + f.nz * s * 12)) continue;
        deco.add(box(1.6, 2.2, 1.6), '#d9d2c3', M4(x, 0, z));
        deco.add(cyl(0.35, 0.55, 2.4, 6), '#6b4f2a', M4(x, 2.2, z));
        deco.add(new THREE.IcosahedronGeometry(0.32, 0), '#6b4f2a', M4(x, 4.85, z));
      }
    }
  }
  // parks get scattered trees
  for (const p of parks) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const area = (x1 - x0) * (z1 - z0); const k = Math.min(300, area / 260);
    for (let t = 0; t < k; t++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (pointInPoly(x, z, p) && track.nearest(x, z).d > track.nearest(x, z).w / 2 + 5) trees.push([x, z, 0.8 + r() * 0.8]); }
  }
  // ambient: parked auto-rickshaws and scooters along old-city kerbs
  if (theme.shops && theme.autos !== false) for (let i = 4; i < n; i += 5) {
    if (r() > 0.35) continue; const f = track.frame(i); if (f.y > 0.5) continue; const s = r() < 0.5 ? 1 : -1; const o = f.w / 2 - 1.3;
    const x = f.x + f.nx * s * o, z = f.z + f.nz * s * o; const ang = Math.atan2(f.tx, f.tz);
    if (r() < 0.6) { // auto-rickshaw
      deco.add(box(1.3, 0.9, 2.6), '#1d1d1d', M4(x, 0.35, z, ang));
      deco.add(box(1.35, 0.8, 1.9), '#f1c40f', M4(x - f.tx * 0.2, 0.35, z - f.tz * 0.2, ang));
      deco.add(box(1.4, 0.15, 2.2), '#222', M4(x - f.tx * 0.3, 1.75, z - f.tz * 0.3, ang));
      deco.add(box(1.36, 0.6, 1.0), '#2e7d32', M4(x + f.tx * 0.5, 1.15, z + f.tz * 0.5, ang));
    } else { deco.add(box(0.5, 0.9, 1.7), pick(r, ['#c0392b', '#2c3e50', '#7f8c8d', '#1f618d']), M4(x, 0.2, z, ang)); }
  }
  // instanced low-poly trees (neem / rain trees)
  if (trees.length) {
    const trunk = new THREE.CylinderGeometry(0.22, 0.35, 3, 5); trunk.translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(2.6, 0); crown.scale(1, 0.8, 1); crown.translate(0, 4.6, 0);
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#6b4b32', flatShading: true }), trees.length);
    const cm = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    trees.forEach(([x, z, s], k) => { m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s * (0.8 + r() * 0.5), s)); tm.setMatrixAt(k, m); cm.setMatrixAt(k, m); col.set(pick(r, ['#4f7d32', '#5c8c3a', '#3f6e2a', '#6b9440', '#557a2e'])); cm.setColorAt(k, col); });
    tm.castShadow = cm.castShadow = true; cm.receiveShadow = true; grp.add(tm, cm);
  }
  const lm = lamps.build(mats.flat); if (lm) grp.add(lm);
  const dm = deco.build(mats.flat); if (dm) grp.add(dm);
  return grp;
}
