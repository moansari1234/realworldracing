import * as THREE from 'three';
import { canvasTex, rng } from '../util.js';

// Facade atlas: 4 bays x 8 floors per texture repeat. UV: u = metres/BAY_U, v = metres/FLOOR_V
export const BAYS = 4, FLOORS = 8;
const W = 512, H = 1024, bw = W / BAYS, fh = H / FLOORS;

function archPath(x, ctx, x0, y0, w, h) {
  ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0, y0 + h * 0.4);
  ctx.quadraticCurveTo(x0, y0, x0 + w / 2, y0 - h * 0.05); ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + h * 0.4);
  ctx.lineTo(x0 + w, y0 + h); ctx.closePath();
}

export function facadeTextures(style, seed = 1) {
  const r = rng(seed);
  const lit = []; for (let i = 0; i < BAYS * FLOORS; i++) lit.push(r() < 0.45);
  const rnd = []; for (let i = 0; i < BAYS * FLOORS; i++) rnd.push(r());
  const drawWin = (ctx, emissive) => {
    for (let f = 0; f < FLOORS; f++) for (let b = 0; b < BAYS; b++) {
      const k = f * BAYS + b; const x = b * bw, y = H - (f + 1) * fh; const on = lit[k];
      const ground = f === 0;
      if (style === 'glass') {
        ctx.fillStyle = emissive ? (on ? '#ffe9b8' : '#000') : ['#5d87a8', '#6f97b5', '#4f7896', '#86a9c2'][Math.floor(rnd[k] * 4)];
        ctx.fillRect(x + 3, y + 6, bw - 6, fh - 10);
        if (!emissive) { const g = ctx.createLinearGradient(x, y, x + bw, y + fh); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x + 3, y + 6, bw - 6, fh - 10);
          ctx.fillStyle = 'rgba(200,215,225,0.8)'; ctx.fillRect(x + bw / 2 - 1, y + 6, 2, fh - 10); }
        continue;
      }
      if (style === 'mughal') {
        if (ground) {
          // shopfront: shutter or open shop
          if (emissive) { ctx.fillStyle = on || rnd[k] > 0.3 ? '#ffd27a' : '#000'; ctx.fillRect(x + 8, y + 30, bw - 16, fh - 30); continue; }
          if (rnd[k] < 0.45) { ctx.fillStyle = '#7d7b78'; ctx.fillRect(x + 8, y + 30, bw - 16, fh - 30); ctx.fillStyle = '#5f5d5a'; for (let s = y + 34; s < y + fh; s += 6) ctx.fillRect(x + 8, s, bw - 16, 2); }
          else { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x + 8, y + 30, bw - 16, fh - 30); ctx.fillStyle = ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad'][Math.floor(rnd[k] * 5)]; for (let s = 0; s < 4; s++) ctx.fillRect(x + 14 + s * 26, y + fh - 40 - rnd[(k + s) % 32] * 30, 18, 40); }
          ctx.fillStyle = ['#b03a2e', '#1f618d', '#117a65', '#b9770e', '#6c3483', '#c2185b'][Math.floor(rnd[(k + 5) % 32] * 6)]; ctx.fillRect(x + 4, y + 6, bw - 8, 22);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(['TEA', 'ATTAR', 'BANGLES', 'PEARLS', 'IRANI CHAI', 'BIRYANI', 'SILK', 'HALEEM'][Math.floor(rnd[(k + 9) % 32] * 8)], x + 10, y + 22);
          continue;
        }
        const ww = bw * 0.42, wh = fh * 0.58, x0 = x + (bw - ww) / 2, y0 = y + fh * 0.22;
        if (emissive) { ctx.fillStyle = on ? '#ffcf7a' : '#000'; archPath(0, ctx, x0, y0, ww, wh); ctx.fill(); continue; }
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y + fh - 10, bw, 10); // chhajja shadow band
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y + fh - 14, bw, 4);
        ctx.fillStyle = '#2b2620'; archPath(0, ctx, x0, y0, ww, wh); ctx.fill();
        if (rnd[k] < 0.5) { ctx.fillStyle = rnd[k] < 0.25 ? '#2f7d5b' : '#3d6fa0'; ctx.fillRect(x0 - 10, y0 + wh * 0.25, 9, wh * 0.75); ctx.fillRect(x0 + ww + 1, y0 + wh * 0.25, 9, wh * 0.75); }
        continue;
      }
      // modern
      const ww = bw * 0.62, wh = fh * 0.5, x0 = x + (bw - ww) / 2, y0 = y + fh * 0.22;
      if (emissive) { ctx.fillStyle = on ? '#ffe2a8' : '#000'; ctx.fillRect(x0, y0, ww, wh); continue; }
      ctx.fillStyle = '#c8c8c8'; ctx.fillRect(x0 - 4, y0 - 4, ww + 8, wh + 8);
      ctx.fillStyle = ground ? '#3b3f44' : '#45525e'; ctx.fillRect(x0, y0, ww, ground ? fh * 0.75 : wh);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y0, ww / 2, wh);
      if (!ground && rnd[k] < 0.35) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y + fh * 0.8, bw - 8, 5); ctx.fillStyle = '#888'; for (let s = x + 6; s < x + bw - 4; s += 8) ctx.fillRect(s, y + fh * 0.66, 2, fh * 0.14); }
    }
  };
  const map = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = style === 'glass' ? '#d9dee2' : '#ffffff'; ctx.fillRect(0, 0, W, H);
    // subtle grime
    const gr = rng(seed + 7);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${gr() * 0.04})`; ctx.fillRect(gr() * W, gr() * H, 2 + gr() * 14, 2 + gr() * 30); }
    drawWin(ctx, false);
  });
  const emissiveMap = canvasTex(W, H, (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); drawWin(ctx, true); });
  return { map, emissiveMap };
}

export function roadTexture(kind = 'main', asphalt = '#5a5856') {
  // u across road (0..1), v along road (repeat every 12 m)
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = asphalt; ctx.fillRect(0, 0, w, h);
    const r = rng(42);
    for (let i = 0; i < 2500; i++) { const v = 60 + r() * 90; ctx.fillStyle = `rgba(${v},${v},${v},0.35)`; ctx.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 25; i++) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(r() * w, r() * h, 10 + r() * 40, 3 + r() * 20); }
    if (kind === 'main') {
      ctx.fillStyle = '#f4f1e6'; ctx.fillRect(6, 0, 4, h); ctx.fillRect(w - 10, 0, 4, h); // edge lines
      ctx.fillStyle = '#f2c230'; ctx.fillRect(w / 2 - 3, 0, 6, h * 0.5); // dashed centre
      ctx.fillStyle = '#f4f1e6'; ctx.fillRect(w / 4 - 2, h * 0.1, 4, h * 0.3); ctx.fillRect(3 * w / 4 - 2, h * 0.6, 4, h * 0.3);
    }
  });
}

export function signTexture(text, bg = '#0e3b5c', fg = '#fff', w = 512, h = 128) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = fg; ctx.font = `bold ${Math.floor(h * 0.5)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 4);
  }, false);
}
