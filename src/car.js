import * as THREE from 'three';
import { Batch, M4, box, cyl, paint, prep } from './util.js';

/** Procedural low-poly cars, built from scratch (no external models): side profile -> chamfered
 *  extrusion -> glasshouse -> wheels -> lights. Forward is +Z. */
export const CARS = {
  gt: { name: 'Deccan GT', desc: 'Low, fast coupe', accel: 15, vmax: 62, grip: 7.5, steer: 0.55, mass: 1 },
  hatch: { name: 'Banjara Hatch', desc: 'Nimble city hatchback', accel: 13.5, vmax: 54, grip: 9.5, steer: 0.65, mass: 0.85 },
  auto: { name: 'Turbo Auto', desc: 'Three-wheeler. Chaos.', accel: 12, vmax: 46, grip: 11, steer: 0.8, mass: 0.6 },
};

const prof = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return s; };
function bodyFromProfile(pts, width) {
  const g = new THREE.ExtrudeGeometry(prof(pts), { depth: width - 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 1 });
  g.translate(0, 0, -(width - 0.3) / 2); g.rotateY(-Math.PI / 2); return g; // x(length) -> z
}

export function buildCar(kind, color) {
  const grp = new THREE.Group(); const b = new Batch(); const glassB = new Batch(); const lightB = new Batch();
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10); wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 6); hubGeo.rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a', flatShading: true });
  const addWheel = (x, z, r = 1) => {
    const w = new THREE.Group(); const t = new THREE.Mesh(wheelGeo, tyreMat); t.scale.setScalar(r); const h = new THREE.Mesh(hubGeo, new THREE.MeshLambertMaterial({ color: '#b8bcc2', flatShading: true })); h.scale.setScalar(r);
    w.add(t, h); w.position.set(x, 0.36 * r, z); t.castShadow = true; grp.add(w); wheels.push(w); return w;
  };
  let front = [];
  if (kind === 'gt') {
    b.add(bodyFromProfile([[-2.2, 0.25], [2.25, 0.25], [2.3, 0.55], [2.0, 0.8], [0.9, 0.95], [-1.9, 1.0], [-2.25, 0.95], [-2.3, 0.5]], 1.95), color);
    glassB.add(bodyFromProfile([[-1.4, 0.9], [0.75, 0.9], [-0.1, 1.38], [-1.05, 1.4], [-1.65, 0.98]], 1.6));
    b.add(box(1.9, 0.08, 0.35), '#111', M4(0, 1.18, -2.05)); b.add(box(0.1, 0.25, 0.1), '#111', M4(0.6, 0.95, -2.05)); b.add(box(0.1, 0.25, 0.1), '#111', M4(-0.6, 0.95, -2.05));
    front = [1.45, -1.4]; for (const s of [-1, 1]) { addWheel(s * 0.88, 1.45); addWheel(s * 0.88, -1.4, 1.05); }
    for (const s of [-1, 1]) { lightB.add(box(0.45, 0.1, 0.1), '#fffbe6', M4(s * 0.65, 0.72, 2.27)); lightB.add(box(0.5, 0.1, 0.08), '#ff2a2a', M4(s * 0.6, 0.75, -2.3)); }
    b.add(box(1.7, 0.18, 0.2), '#1b1b1b', M4(0, 0.25, 2.2));
  } else if (kind === 'hatch') {
    b.add(bodyFromProfile([[-1.75, 0.3], [1.85, 0.3], [1.9, 0.7], [1.6, 0.9], [0.7, 1.05], [-1.6, 1.08], [-1.8, 0.95]], 1.75), color);
    glassB.add(bodyFromProfile([[-1.6, 1.0], [0.6, 1.0], [-0.05, 1.62], [-1.45, 1.65], [-1.7, 1.05]], 1.55));
    b.add(box(1.5, 0.08, 1.3), color, M4(0, 1.68, -0.75));
    for (const s of [-1, 1]) { addWheel(s * 0.8, 1.2); addWheel(s * 0.8, -1.15); }
    for (const s of [-1, 1]) { lightB.add(box(0.4, 0.18, 0.1), '#fffbe6', M4(s * 0.6, 0.78, 1.88)); lightB.add(box(0.2, 0.35, 0.08), '#ff2a2a', M4(s * 0.75, 0.9, -1.82)); }
  } else { // auto-rickshaw
    b.add(box(1.35, 0.35, 2.7), '#1f1f1f', M4(0, 0.3, 0));
    b.add(box(1.3, 0.85, 1.4), color, M4(0, 0.6, -0.55));
    const nose = bodyFromProfile([[0.2, 0.3], [1.35, 0.3], [1.35, 0.9], [0.9, 1.5], [0.2, 1.5]], 1.25); b.add(nose, color);
    b.add(box(1.45, 0.12, 2.3), '#121212', M4(0, 1.95, -0.25));
    for (const [x, z] of [[-0.66, 1.0], [0.66, 1.0], [-0.66, -1.35], [0.66, -1.35]]) b.add(box(0.06, 1.2, 0.06), '#222', M4(x, 0.75, z));
    b.add(box(1.32, 0.55, 0.05), '#111', M4(0, 1.2, -1.35));
    glassB.add(box(1.1, 0.5, 0.05), undefined, M4(0, 1.55, 1.15, 0, 1, 1, 1, -0.3));
    b.add(box(1.36, 0.5, 1.2), '#2e7d32', M4(0, 1.3, -0.55)); // green canvas sides
    addWheel(0, 1.25, 0.85); addWheel(-0.62, -1.0, 0.85); addWheel(0.62, -1.0, 0.85);
    lightB.add(box(0.3, 0.2, 0.1), '#fffbe6', M4(0, 1.0, 1.4)); for (const s of [-1, 1]) lightB.add(box(0.15, 0.15, 0.06), '#ff2a2a', M4(s * 0.55, 0.55, -1.37));
    front = [1.25];
  }
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.35 });
  const m = b.build(bodyMat); grp.add(m);
  const gm = glassB.build(new THREE.MeshStandardMaterial({ color: '#4a6a86', roughness: 0.1, metalness: 0.5, flatShading: true })); if (gm) grp.add(gm);
  const lm = lightB.build(new THREE.MeshBasicMaterial({ vertexColors: true })); grp.add(lm);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, kind === 'auto' ? 3 : 4.6), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; grp.add(shadow);
  grp.userData = { wheels, frontZ: kind === 'auto' ? 1.25 : (kind === 'gt' ? 1.45 : 1.2) };
  return grp;
}

/** Arcade vehicle model: velocity vector blended toward heading by tyre grip (drifts when the handbrake drops grip). */
export class Vehicle {
  constructor(kind, color, track, s0, lane) {
    this.spec = CARS[kind]; this.mesh = buildCar(kind, color); this.track = track;
    const p = track.pointAt(s0); this.x = p.x + p.nx * lane; this.z = p.z + p.nz * lane; this.y = p.y;
    this.h = Math.atan2(p.tx, p.tz); this.vx = 0; this.vz = 0; this.steer = 0; this.s = s0; this.hint = p.i; this.nitro = 1; this.finished = false; this.lap = 0;
    this.surface = 'road'; this.wallHit = 0; this.rpm = 0; this.pitch = 0; this.roll = 0; this.progress = s0;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  update(dt, inp) {
    const sp = this.spec; const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let vF = this.vx * fx + this.vz * fz; // forward speed
    const q = this.track.nearest(this.x, this.z, this.hint, 30); this.hint = q.i;
    const half = q.w / 2; const offRoad = q.d > half + 0.4;
    this.surface = offRoad ? 'kerb' : 'road';
    // steering (less at speed)
    const target = inp.steer * sp.steer / (1 + Math.abs(vF) * 0.03);
    this.steer += (target - this.steer) * Math.min(1, dt * 8);
    const boost = inp.nitro && this.nitro > 0 ? 1.6 : 1; if (inp.nitro && this.nitro > 0) this.nitro = Math.max(0, this.nitro - dt * 0.25); else this.nitro = Math.min(1, this.nitro + dt * 0.04);
    const vmax = sp.vmax * (offRoad ? 0.55 : 1) * (boost > 1 ? 1.25 : 1);
    let acc = 0;
    if (inp.throttle) acc += sp.accel * boost * (1 - Math.max(0, vF) / vmax);
    if (inp.brake) acc -= vF > 0.5 ? 26 : 9;
    acc -= vF * 0.08 + (offRoad ? vF * 0.6 : 0);
    vF += acc * dt; if (!inp.throttle && !inp.brake && Math.abs(vF) < 0.3) vF = 0;
    // yaw
    const wb = 2.6; this.h += (vF / wb) * Math.tan(this.steer) * dt * (vF < 0 ? 1 : 1);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
    // lateral slip
    let vL = this.vx * nfz - this.vz * nfx;
    const grip = (inp.handbrake ? 1.4 : sp.grip) * (offRoad ? 0.7 : 1);
    vL *= Math.exp(-grip * dt);
    if (inp.handbrake) vF *= Math.exp(-0.6 * dt);
    this.vx = nfx * vF + nfz * vL; this.vz = nfz * vF - nfx * vL;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // corridor walls (buildings line the real street)
    const q2 = this.track.nearest(this.x, this.z, this.hint, 30);
    const lim = q2.w / 2 + (this.track.elev[q2.i] > 1 ? 3.6 : 4.2);
    this.wallHit = Math.max(0, this.wallHit - dt);
    if (q2.d > lim) {
      const nx = (this.x - q2.x) / q2.d, nz = (this.z - q2.z) / q2.d;
      this.x = q2.x + nx * lim; this.z = q2.z + nz * lim;
      const vn = this.vx * nx + this.vz * nz; if (vn > 0) { this.vx -= vn * nx * 1.5; this.vz -= vn * nz * 1.5; this.vx *= 0.8; this.vz *= 0.8; this.wallHit = 0.25; }
    }
    // ends of a point-to-point track are walled too
    if (!this.track.loop) { if (q2.s < 2 && (this.vx * q2.tx + this.vz * q2.tz) < 0) { this.vx *= 0.5; this.vz *= 0.5; } }
    const ty = q2.y + 0.12; this.y += (ty - this.y) * Math.min(1, dt * 12);
    this.pitch += ((-(acc) * 0.004) - this.pitch) * Math.min(1, dt * 5);
    this.roll += ((vL * 0.02 + this.steer * vF * 0.004) - this.roll) * Math.min(1, dt * 5);
    this.s = q2.s; this.vF = vF; this.vL = vL; this.offRoad = offRoad;
    this.sync(dt);
  }
  sync(dt) {
    const m = this.mesh; m.position.set(this.x, this.y, this.z); m.rotation.set(this.pitch, this.h, this.roll, 'YXZ');
    const v = this.vF ?? this.speed;
    for (const w of m.userData.wheels) { w.children[0].rotation.x += v * dt / 0.36; w.children[1].rotation.x = w.children[0].rotation.x; if (w.position.z > 0.5) w.rotation.y = this.steer; }
  }
}

/** AI racer: follows the real centreline on its own lane, braking for the real corners ahead. */
export class AIDriver {
  constructor(veh, skill, lane) { this.v = veh; this.skill = skill; this.lane = lane; this.cur = 0; this.wob = Math.random() * 10; }
  update(dt, t, playerS) {
    const v = this.v, tr = v.track; const sp = v.spec;
    const curv = Math.max(tr.curvatureAhead(v.s, 40), tr.curvatureAhead(v.s + 25, 50) * 0.8);
    let target = sp.vmax * this.skill * (1 - Math.min(0.62, curv * 1.15));
    // gentle rubber band so races stay close
    const gap = v.s - playerS; target *= gap > 120 ? 0.9 : gap < -150 ? 1.08 : 1;
    this.cur += Math.max(-24 * dt, Math.min(sp.accel * dt, target - this.cur));
    const L = tr.length;
    let s = v.s + this.cur * dt; if (!tr.loop) s = Math.min(s, L);
    const p = tr.pointAt(s); const lane = this.lane + Math.sin(t * 0.3 + this.wob) * 1.2; const hw = p.w / 2 - 1.6; const ln = Math.max(-hw, Math.min(hw, lane));
    const nx = p.x + p.nx * ln, nz = p.z + p.nz * ln;
    const dx = nx - v.x, dz = nz - v.z; const h = Math.atan2(dx, dz);
    if (Math.hypot(dx, dz) > 0.01) { let dh = h - v.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; v.h += dh * Math.min(1, dt * 6); v.steer = Math.max(-0.5, Math.min(0.5, dh * 3)); }
    v.vx = dx / dt; v.vz = dz / dt; v.x = nx; v.z = nz; v.vF = this.cur;
    if (tr.loop && s >= L) { v.lap++; s -= L; }
    v.s = s; v.y += (p.y + 0.12 - v.y) * Math.min(1, dt * 10); v.progress = v.lap * L + s;
    v.sync(dt);
  }
}
