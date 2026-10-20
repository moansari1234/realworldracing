import { Grid } from './util.js';

/** Race track built from the baked real-world centreline. Gives frames, elevation, nearest-point queries. */
export class Track {
  constructor(data) {
    this.data = data; const C = this.C = data.center; const n = C.length;
    this.loop = data.loop;
    // cumulative distance
    this.s = new Float32Array(n); for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]);
    this.length = this.s[n - 1];
    // elevation: lift long bridge runs into proper decks with ramps
    const e = new Float32Array(n);
    let i = 0;
    while (i < n) {
      if (!C[i][4]) { i++; continue; }
      let j = i; while (j < n && C[j][4]) j++;
      const len = this.s[Math.min(j, n - 1)] - this.s[i];
      const H = len > 150 ? 9 : len > 50 ? 5 : 0;
      if (H) {
        const ramp = 70;
        for (let k = 0; k < n; k++) {
          const sk = this.s[k], a = this.s[i], b = this.s[Math.min(j, n - 1)];
          let t = sk < a ? 1 - (a - sk) / ramp : sk > b ? 1 - (sk - b) / ramp : 1;
          if (t > 0) { t = t * t * (3 - 2 * t); e[k] = Math.max(e[k], H * t); }
        }
      }
      i = j;
    }
    this.elev = e;
    this.grid = new Grid(25);
    for (let k = 0; k < n; k++) this.grid.add(C[k][0], C[k][1], Math.max(30, C[k][2]), k);
    this.frames = []; for (let k = 0; k < n; k++) this.frames.push(this._frame(k));
  }
  _frame(i) {
    const C = this.C, n = C.length; const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    return { x: C[i][0], z: C[i][1], y: this.elev[i], tx, tz, nx: -tz, nz: tx, w: C[i][2], name: C[i][3] };
  }
  frame(i) { return this.frames[Math.max(0, Math.min(this.frames.length - 1, i))]; }
  /** nearest point on centreline. returns {i, t, x, z, y, d (abs lateral), off (signed), w} */
  nearest(x, z, hint = -1, win = 0) {
    const C = this.C, n = C.length;
    let cand;
    if (hint >= 0 && win) { cand = []; for (let k = hint - win; k <= hint + win; k++) { let kk = k; if (this.loop) kk = (k + n) % n; if (kk >= 0 && kk < n) cand.push(kk); } }
    else { cand = this.grid.near(x, z); if (!cand.length) cand = null; }
    let best = 1e18, bi = 0;
    if (cand) for (const k of cand) { const dx = C[k][0] - x, dz = C[k][1] - z; const d = dx * dx + dz * dz; if (d < best) { best = d; bi = k; } }
    else for (let k = 0; k < n; k += 4) { const dx = C[k][0] - x, dz = C[k][1] - z; const d = dx * dx + dz * dz; if (d < best) { best = d; bi = k; } }
    // refine on adjacent segments
    let res = null;
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j + 1 >= n) continue;
      const a = C[j], b = C[j + 1]; const sx = b[0] - a[0], sz = b[1] - a[1]; const l2 = sx * sx + sz * sz || 1;
      let t = ((x - a[0]) * sx + (z - a[1]) * sz) / l2; t = Math.max(0, Math.min(1, t));
      const px = a[0] + sx * t, pz = a[1] + sz * t; const d = Math.hypot(x - px, z - pz);
      if (!res || d < res.d) {
        const L = Math.sqrt(l2); const off = ((x - px) * (-sz / L) + (z - pz) * (sx / L));
        res = { i: j, t, x: px, z: pz, y: this.elev[j] * (1 - t) + this.elev[j + 1] * t, d, off, w: a[2] * (1 - t) + b[2] * t, s: this.s[j] + t * Math.sqrt(l2), tx: sx / L, tz: sz / L };
      }
    }
    if (!res) { const f = this.frames[bi]; res = { i: bi, t: 0, x: f.x, z: f.z, y: f.y, d: Math.sqrt(best), off: 0, w: f.w, s: this.s[bi], tx: f.tx, tz: f.tz }; }
    return res;
  }
  pointAt(s) {
    // position on centreline at distance s (wraps on loops)
    const L = this.length; if (this.loop) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = this.s.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const t = (s - this.s[lo]) / ((this.s[hi] - this.s[lo]) || 1); const a = this.frames[lo], b = this.frames[hi];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx: a.tx + (b.tx - a.tx) * t, tz: a.tz + (b.tz - a.tz) * t, nx: a.nx, nz: a.nz, w: a.w + (b.w - a.w) * t, i: lo };
  }
  curvatureAhead(s, dist) {
    // max heading change over the next dist metres => used by AI braking
    const a = this.pointAt(s), b = this.pointAt(s + dist * 0.5), c = this.pointAt(s + dist);
    const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d);
  }
}
