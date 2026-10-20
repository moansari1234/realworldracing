import * as THREE from 'three';
import { Track } from './track.js';
import { buildWorld } from './world.js';
import { THEMES } from './gen/themes.js';
import { Vehicle, AIDriver, CARS } from './car.js';
import { initBuilder, openBuilder } from './live/ui.js';
import { attachStreetDetail } from './gen/streetprops.js';
import { polyOuter, polyHoles } from './util.js';

const TRACKS = [
  { key: 'oldcity', title: "Nizam's Heritage Run", sub: 'Salar Jung Museum → Machli Kaman → Gulzar Houz → Char Kaman → Charminar → Mecca Masjid → Chowmahalla Palace', type: 'Sprint' },
  { key: 'lake', title: 'Hussain Sagar Loop', sub: 'Secretariat → Lumbini Park → Tank Bund (Buddha Statue) → Sanjeevaiah Park → Necklace Road → NTR Gardens', type: '1 lap' },
  { key: 'hitec', title: 'Cyber Sprint', sub: 'Cyber Towers → HITEC City → Inorbit Mall → Durgam Cheruvu Cable Bridge → Jubilee Hills Rd 45', type: 'Sprint' },
];
const RIVALS = [['#c0392b', 'gt', 'Rahul'], ['#f1c40f', 'auto', 'Imran'], ['#16a085', 'hatch', 'Priya'], ['#ecf0f1', 'gt', 'Sana'], ['#8e44ad', 'hatch', 'Vikram']];

const $ = (s) => document.querySelector(s);
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const MOBILE = TOUCH && Math.min(screen.width, screen.height) < 900;
document.body.classList.toggle('touch', TOUCH);
// The renderer is created lazily and guarded: a browser/device with WebGL off (no hardware acceleration, blocked GPU,
// some kiosk/VM browsers) must still get a working menu plus a clear message, not a blank page from a throw at import.
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))); }
  catch (e) { return false; }
}
let renderer = null; let glOk = webglAvailable();
function getRenderer() {
  if (renderer || !glOk) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.3 : 1.75)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    document.body.prepend(renderer.domElement);
  } catch (e) { console.warn('WebGL renderer unavailable:', e?.message || e); renderer = null; glOk = false; showNoGL(); }
  return renderer;
}
function showNoGL() {
  document.body.classList.add('nogl');
  if (!$('#nogl')) {
    const el = document.createElement('div'); el.id = 'nogl'; el.setAttribute('role', 'alert');
    el.innerHTML = '<b>Your browser or device has 3D graphics turned off, so the race can\'t start.</b>' +
      '<span>Real World Racing needs WebGL. Turn on <em>hardware acceleration</em> (Chrome/Edge: Settings → System → “Use graphics acceleration when available”; Firefox: Settings → Performance), update your browser, then reload this page. You can still look around the routes and build one below.</span>' +
      '<button type="button" id="nogl-retry">Reload</button>';
    $('#menu header').after(el); el.querySelector('#nogl-retry').onclick = () => location.reload();
  }
  const go = $('#go'); if (go) { go.disabled = true; go.textContent = '3D graphics needed'; }
  $('#loading')?.classList.add('hide'); $('#menu')?.classList.remove('hide');
}
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 6000);
const onResize = () => { renderer?.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 200));

let game = null; let sel = { track: 'oldcity', car: 'gt', color: '#e67e22', night: false, tilt: false };
let liveTheme = null; const themeFor = (k) => k === 'live' ? liveTheme : THEMES[k];
const keys = {}; addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyN' && game) setNight(!game.night); if (e.code === 'KeyC' && game) game.camMode = (game.camMode + 1) % 3; if (e.code === 'Escape' && game) togglePause(); if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => keys[e.code] = false);
const touch = { steer: 0, throttle: false, brake: false, nitro: false, drift: false, tilt: 0 };

// ---------------- menu ----------------
const trackData = {};
async function loadTrack(k) { if (k === 'live') return trackData.live; if (!trackData[k]) trackData[k] = await (await fetch(`tracks/${k}.json`)).json(); return trackData[k]; }
function drawPreview(cv, d, theme) {
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; ctx.fillStyle = theme.ground; ctx.fillRect(0, 0, W, H);
  const xs = d.center.map(c => c[0]), zs = d.center.map(c => c[1]); const mx = Math.min(...xs) - 150, Mx = Math.max(...xs) + 150, mz = Math.min(...zs) - 150, Mz = Math.max(...zs) + 150;
  const S = Math.min(W / (Mx - mx), H / (Mz - mz)); const ox = (W - (Mx - mx) * S) / 2, oz = (H - (Mz - mz) * S) / 2; const T = (p) => [ox + (p[0] - mx) * S, oz + (p[1] - mz) * S];
  const poly = (ring, c) => { ctx.fillStyle = c; ctx.beginPath(); ring.forEach((p, i) => { const [x, y] = T(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.fill(); };
  d.water.forEach(w => { ctx.fillStyle = theme.water; ctx.beginPath(); [polyOuter(w), ...polyHoles(w)].forEach(ring => ring.forEach((p, i) => { const [x, y] = T(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); })); ctx.fill('evenodd'); }); d.parks.forEach(w => poly(w, theme.grass)); d.buildings.forEach(b => poly(b.p, 'rgba(60,40,30,0.35)'));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; d.roads.forEach(r => { ctx.beginPath(); r.p.forEach((p, i) => { const [x, y] = T(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
  ctx.strokeStyle = '#ff4d2e'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath(); d.center.forEach((c, i) => { const [x, y] = T(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  const [sx, sy] = T(d.center[0]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill();
  ctx.font = '600 11px Inter, system-ui'; ctx.fillStyle = '#111';
  d.landmarks.forEach(l => { if (l.x === undefined) return; const [x, y] = T([l.x, l.z]); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; const w = ctx.measureText(l.name).width; ctx.fillRect(x + 5, y - 8, w + 6, 15); ctx.fillStyle = '#111'; ctx.fillText(l.name, x + 8, y + 3); });
}
function liveCard(wrap) {
  const el = document.createElement('button'); el.className = 'track anywhere';
  el.innerHTML = `<div class="globe"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="3"/><ellipse cx="60" cy="60" rx="18" ry="44" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 60h88M24 38h72M24 82h72" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M38 92 C 50 70, 70 74, 84 30" stroke="#ff4d2e" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="38" cy="92" r="6" fill="#fff" stroke="#16130f" stroke-width="2"/><circle cx="84" cy="30" r="6" fill="#ff4d2e"/></svg></div><div class="tmeta"><div class="tz">Any city · live OpenStreetMap</div><h3>Build anywhere</h3><p>Search a place or use your location, drop a start and finish, and the engine generates the race in seconds.</p><div class="chips"><span>Any route</span><span>Real buildings</span><span>Auto landmarks</span></div></div>`;
  el.onclick = () => openBuilder(); wrap.appendChild(el);
}
async function buildMenu() {
  const wrap = $('#tracks'); wrap.innerHTML = '';
  liveCard(wrap);
  const list = trackData.live ? [{ key: 'live', title: trackData.live.name, sub: (trackData.live.landmarks.length ? 'Passing ' + trackData.live.landmarks.map(l => l.name).join(' · ') : trackData.live.streets.slice(0, 5).join(' → ')), type: 'Sprint · your route' }, ...TRACKS] : TRACKS;
  for (const t of list) {
    const d = await loadTrack(t.key); const th = themeFor(t.key);
    const el = document.createElement('button'); el.className = 'track' + (sel.track === t.key ? ' on' : '');
    el.innerHTML = `<canvas width="360" height="230"></canvas><div class="tmeta"><div class="tz">${th.label}</div><h3>${t.title}</h3><p>${t.sub}</p><div class="chips"><span>${(d.length / 1000).toFixed(1)} km</span><span>${t.type}</span><span>${d.buildings.length} real buildings</span><span>${d.landmarks.length} landmarks</span></div></div>`;
    drawPreview(el.querySelector('canvas'), d, th);
    el.onclick = () => { sel.track = t.key; document.querySelectorAll('.track').forEach(x => x.classList.remove('on')); el.classList.add('on'); };
    wrap.appendChild(el);
  }
  const cw = $('#cars'); cw.innerHTML = '';
  for (const [k, c] of Object.entries(CARS)) {
    const el = document.createElement('button'); el.className = 'car' + (sel.car === k ? ' on' : ''); el.innerHTML = `<b>${c.name}</b><small>${c.desc}</small><div class="bars"><i style="--v:${c.vmax / 62}"></i><i style="--v:${c.accel / 15}"></i><i style="--v:${c.grip / 11}"></i></div>`;
    el.onclick = () => { sel.car = k; document.querySelectorAll('.car').forEach(x => x.classList.remove('on')); el.classList.add('on'); }; cw.appendChild(el);
  }
  const pw = $('#paints'); pw.innerHTML = '';
  for (const col of ['#e67e22', '#1f6fd1', '#d81b60', '#2ecc71', '#f5f5f5', '#222831', '#f1c40f']) { const el = document.createElement('button'); el.className = 'paint' + (sel.color === col ? ' on' : ''); el.style.background = col; el.onclick = () => { sel.color = col; document.querySelectorAll('.paint').forEach(x => x.classList.remove('on')); el.classList.add('on'); }; pw.appendChild(el); }
  $('#night').onchange = (e) => sel.night = e.target.checked;
  $('#night').checked = sel.night; $('#tilt').checked = sel.tilt; $('#tilt').onchange = (e) => enableTilt(e.target.checked);
}
$('#go').onclick = () => start();

// ---------------- sky ----------------
function makeSky(theme) {
  const g = new THREE.SphereGeometry(4500, 24, 12);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(theme.sky[2]) }, mid: { value: new THREE.Color(theme.sky[1]) }, bot: { value: new THREE.Color(theme.sky[0]) }, night: { value: 0 } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, mid, bot; uniform float night; varying vec3 vp;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y = vp.y; vec3 c = y < 0.08 ? mix(bot, mid, smoothstep(-0.05, 0.08, y)) : mix(mid, top, smoothstep(0.08, 0.6, y));
        vec3 n = mix(vec3(0.02,0.03,0.08), vec3(0.08,0.07,0.16), smoothstep(0.3,-0.05,y));
        float st = step(0.9975, h(floor(vp*400.))) * smoothstep(0.05, 0.3, y);
        gl_FragColor = vec4(mix(c, n + st, night), 1.); }` });
  return new THREE.Mesh(g, m);
}

// ---------------- race ----------------
async function start() {
  if (!getRenderer()) { showNoGL(); return; }
  if (TOUCH && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => { });
  $('#menu').classList.add('hide'); $('#loading').classList.remove('hide');
  await new Promise(r => setTimeout(r, 30));
  const data = await loadTrack(sel.track); const theme = themeFor(sel.track);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar * (MOBILE ? 0.7 : 1)); camera.far = MOBILE ? 2600 : 6000; camera.updateProjectionMatrix();
  const track = new Track(data);
  const t0 = performance.now();
  const world = buildWorld(data, track, theme, scene);
  const sky = makeSky(theme); sky.scale.setScalar(MOBILE ? 0.5 : 1); scene.add(sky);
  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]); scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity); sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
  const headlight = new THREE.SpotLight('#fff2d0', 0, 90, 0.5, 0.5, 1.2); scene.add(headlight, headlight.target);
  // grid start: player at the back, rivals ahead in two lanes
  const cars = []; const w0 = track.frame(4).w;
  const player = new Vehicle(sel.car, sel.color, track, 8, -w0 * 0.2); player.name = 'You'; player.isPlayer = true; cars.push(player);
  const ais = [];
  RIVALS.forEach(([col, kind, name], k) => { const v = new Vehicle(kind, col, track, 16 + k * 9, (k % 2 ? 1 : -1) * w0 * 0.22); v.name = name; cars.push(v); ais.push(new AIDriver(v, 0.86 + k * 0.025 + (kind === 'auto' ? 0.1 : 0), (k % 2 ? 1 : -1) * w0 * 0.22)); });
  cars.forEach(c => { scene.add(c.mesh); c.sync(0); });
  const genStats = { real: data.buildings.length, landmarks: data.landmarks.length, ms: Math.round(performance.now() - t0) };
  game = { scene, track, world, player, cars, ais, sun, hemi, headlight, sky, theme, data, t: 0, state: 'countdown', count: 3.5, raceT: 0, night: false, camMode: 0, camPos: new THREE.Vector3(), finishOrder: [], genStats, lastLm: '', lmT: 0 };
  setNight(sel.night);
  const p0 = track.pointAt(0); game.camPos.set(player.x - Math.sin(player.h) * 14, player.y + 6, player.z - Math.cos(player.h) * 14);
  $('#loading').classList.add('hide'); $('#hud').classList.remove('hide');
  $('#gen').textContent = `${theme.label} · ${data.name} · ${genStats.real} OSM buildings + generated infill · ${genStats.landmarks} landmarks · built in ${genStats.ms} ms`;
  initMinimap(); audio.start();
  // Mapillary street detail: props + facade colours stream in after the race is already playable
  $('#mlycredit').classList.add('hide');
  if (new URLSearchParams(location.search).get('mly') !== '0') {
    const g = game;
    g.mly = attachStreetDetail(g, { mobile: MOBILE, onStage: (st) => {
      if (game !== g) return;
      $('#mlycredit').classList.remove('hide');
      $('#gen').textContent = `${theme.label} · ${data.name} · ${genStats.real} OSM buildings + generated infill · ${genStats.landmarks} landmarks · ${st.props || 0} Mapillary street objects${st.facades ? ` · ${st.facades} facades coloured` : ''} · built in ${genStats.ms} ms`;
    } });
  }
}
function killDetail() { if (game?.mly) game.mly.dead = true; }
function setNight(on) {
  const g = game; g.night = on; const th = g.theme;
  g.sky.material.uniforms.night.value = on ? 1 : 0;
  g.scene.fog.color.set(on ? '#0b1020' : th.fog);
  g.sun.intensity = on ? 0.25 : th.sun.intensity; g.sun.color.set(on ? '#8aa0ff' : th.sun.color);
  g.hemi.intensity = on ? 0.35 : th.hemi[2];
  g.world.mats.facade.emissiveIntensity = on ? 0.9 : 0; g.world.mats.glass.emissiveIntensity = on ? 0.6 : 0;
  g.headlight.intensity = on ? 900 : 0; if (renderer) renderer.toneMappingExposure = on ? 1.25 : 1.0;
}
function quit() { if (!game) return; killDetail(); audio.stop(); disposeScene(game.scene); renderer?.clear(); game = null; $('#hud').classList.add('hide'); $('#results').classList.add('hide'); $('#pause').classList.add('hide'); $('#menu').classList.remove('hide'); }
function disposeScene(sc) { sc.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); if (x.emissiveMap) x.emissiveMap.dispose(); x.dispose(); }); }); }
function togglePause(force) {
  if (!game || game.state === 'done') return; const on = force ?? game.state !== 'paused';
  if (on && game.state !== 'paused') { game.prevState = game.state; game.state = 'paused'; audio.set(0, false); $('#pause').classList.remove('hide'); }
  else if (!on && game.state === 'paused') { game.state = game.prevState; $('#pause').classList.add('hide'); }
}
$('#p-resume').onclick = () => togglePause(false);
$('#p-restart').onclick = () => { $('#pause').classList.add('hide'); killDetail(); audio.stop(); disposeScene(game.scene); game = null; start(); };
$('#p-quit').onclick = () => quit();
$('#hb-menu').onclick = () => togglePause();
$('#hb-cam').onclick = () => { if (game) game.camMode = (game.camMode + 1) % 3; };
$('#hb-night').onclick = () => { if (game) setNight(!game.night); };
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state === 'race') togglePause(true); });
$('#again').onclick = () => { $('#results').classList.add('hide'); killDetail(); audio.stop(); disposeScene(game.scene); game = null; start(); };
$('#back').onclick = () => quit();

function input() {
  const g = (k) => keys[k];
  let steer = (g('ArrowLeft') || g('KeyA') ? 1 : 0) - (g('ArrowRight') || g('KeyD') ? 1 : 0); if (touch.steer) steer = touch.steer; else if (sel.tilt && touch.tilt) steer = touch.tilt;
  return { steer, throttle: g('ArrowUp') || g('KeyW') || touch.throttle, brake: g('ArrowDown') || g('KeyS') || touch.brake, handbrake: g('Space') || touch.drift, nitro: g('ShiftLeft') || g('ShiftRight') || touch.nitro };
}

// ---------------- minimap ----------------
let mm = null;
function initMinimap() {
  const cv = $('#minimap'); const ctx = cv.getContext('2d'); const d = game.data; const xs = d.center.map(c => c[0]), zs = d.center.map(c => c[1]);
  const mx = Math.min(...xs) - 60, Mx = Math.max(...xs) + 60, mz = Math.min(...zs) - 60, Mz = Math.max(...zs) + 60; const S = Math.min(cv.width / (Mx - mx), cv.height / (Mz - mz));
  const ox = (cv.width - (Mx - mx) * S) / 2, oz = (cv.height - (Mz - mz) * S) / 2;
  const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; const o = off.getContext('2d'); const T = (x, z) => [ox + (x - mx) * S, oz + (z - mz) * S];
  d.water.forEach(w => { o.fillStyle = 'rgba(70,140,200,0.6)'; o.beginPath(); [polyOuter(w), ...polyHoles(w)].forEach(ring => ring.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? o.lineTo(x, y) : o.moveTo(x, y); })); o.fill('evenodd'); });
  o.strokeStyle = 'rgba(255,255,255,0.9)'; o.lineWidth = 3; o.beginPath(); d.center.forEach((c, i) => { const [x, y] = T(c[0], c[1]); i ? o.lineTo(x, y) : o.moveTo(x, y); }); o.stroke();
  mm = { ctx, off, T };
}
function drawMinimap() {
  const { ctx, off, T } = mm; ctx.clearRect(0, 0, 220, 220); ctx.drawImage(off, 0, 0);
  for (const l of game.world.landmarks) { const [x, y] = T(l.x, l.z); ctx.fillStyle = '#ffd36b'; ctx.fillRect(x - 2, y - 2, 4, 4); }
  for (const c of game.cars) { const [x, y] = T(c.x, c.z); ctx.fillStyle = c.isPlayer ? '#ff4d2e' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, c.isPlayer ? 5 : 3, 0, 7); ctx.fill(); }
}

// ---------------- audio (procedural engine) ----------------
const audio = {
  ctx: null, osc: null, gain: null,
  start() { try { this.ctx = this.ctx || new AudioContext(); const c = this.ctx; this.osc = c.createOscillator(); this.osc.type = 'sawtooth'; const o2 = c.createOscillator(); o2.type = 'square'; this.o2 = o2; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; this.gain = c.createGain(); this.gain.gain.value = 0.05; this.osc.connect(f); o2.connect(f); f.connect(this.gain); this.gain.connect(c.destination); this.osc.start(); o2.start(); } catch (e) { } },
  set(speed, on) { if (!this.osc) return; const f = 45 + speed * 3.2; this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.05); this.gain.gain.setTargetAtTime(on ? 0.05 : 0.0, this.ctx.currentTime, 0.1); },
  stop() { try { this.osc.stop(); this.o2.stop(); } catch (e) { } this.osc = null; },
};

// ---------------- loop ----------------
const clock = new THREE.Clock();
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!game) return;
  const g = game; if (g.state === 'paused') { renderer.render(g.scene, camera); return; }
  g.t += dt; const P = g.player; const inp = input();
  if (g.state === 'countdown') {
    g.count -= dt; $('#count').textContent = g.count > 0.5 ? Math.ceil(g.count - 0.5) : 'GO!'; $('#count').classList.remove('hide');
    if (g.count <= 0) { g.state = 'race'; $('#count').classList.add('hide'); }
    P.update(dt, { steer: 0 }); g.cars.forEach(c => c.sync(0));
  } else if (g.state === 'race' || g.state === 'done') {
    if (g.state === 'race') g.raceT += dt;
    P.update(dt, g.state === 'done' ? { brake: true, steer: 0 } : inp);
    g.ais.forEach(a => a.update(dt, g.t, P.progress));
    // car-to-car bumps (player vs AI)
    for (const c of g.cars) { if (c === P) continue; const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz); if (d < 2.4 && d > 0.01) { const k = (2.4 - d) / d; P.x += dx * k * 0.8; P.z += dz * k * 0.8; P.vx *= 0.94; P.vz *= 0.94; } }
    // progress (player): monotone distance along the real route
    const tr = g.track; const L = tr.length;
    if (tr.loop) { if (P.lastS !== undefined && P.lastS > L * 0.85 && P.s < L * 0.15) P.lap++; if (P.lastS !== undefined && P.lastS < L * 0.15 && P.s > L * 0.85) P.lap--; }
    P.lastS = P.s; P.progress = (P.lap || 0) * L + P.s;
    const goal = tr.loop ? L : L - 8;
    for (const c of g.cars) if (!c.finished && c.progress >= goal) { c.finished = true; c.time = g.raceT; g.finishOrder.push(c); if (c === P) finish(); }
  }
  g.world.update(g.t, g.night ? 1 : 0);
  if (g.mly) g.mly.update(P.x, P.z);
  // camera
  const sp = P.speed; const fx = Math.sin(P.h), fz = Math.cos(P.h);
  const portrait = camera.aspect < 1; const pk = portrait ? 1.35 : 1;
  const dist = [(9 + sp * 0.06) * pk, 4.5, 16 * pk][g.camMode], hgt = [(3.6 + sp * 0.02) * pk, 1.9, 9 * pk][g.camMode];
  const want = new THREE.Vector3(P.x - fx * dist, P.y + hgt, P.z - fz * dist);
  g.camPos.lerp(want, 1 - Math.exp(-dt * (g.camMode === 1 ? 20 : 6))); camera.position.copy(g.camPos);
  camera.lookAt(P.x + fx * 6, P.y + 1.4, P.z + fz * 6);
  if (P.wallHit > 0) camera.position.y += (Math.random() - 0.5) * 0.25;
  camera.fov += (((portrait ? 74 : 62) + sp * 0.35 + (inp.nitro && P.nitro > 0 ? 8 : 0)) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  g.sky.position.copy(camera.position);
  // sun + shadows follow the player
  const sd = g.theme.sun.dir; g.sun.position.set(P.x + sd[0] * 300, P.y + sd[1] * 300, P.z + sd[2] * 300); g.sun.target.position.set(P.x, P.y, P.z); g.sun.target.updateMatrixWorld();
  g.headlight.position.set(P.x + fx * 1.5, P.y + 1.2, P.z + fz * 1.5); g.headlight.target.position.set(P.x + fx * 30, P.y, P.z + fz * 30); g.headlight.target.updateMatrixWorld();
  // HUD
  const kmh = Math.round(Math.abs(P.vF || 0) * 3.6); $('#spd').textContent = kmh; $('#time').textContent = fmt(g.raceT);
  const order = [...g.cars].sort((a, b) => (b.finished && a.finished) ? a.time - b.time : b.progress - a.progress); const pos = order.indexOf(P) + 1; $('#pos').innerHTML = `${pos}<small>/${g.cars.length}</small>`;
  $('#nitro i').style.width = `${P.nitro * 100}%`;
  $('#prog i').style.width = `${Math.min(100, P.progress / g.track.length * 100)}%`;
  const f = g.track.frame(P.hint); $('#street').textContent = f.name || '';
  let near = null; for (const l of g.world.landmarks) { const d = Math.hypot(l.x - P.x, l.z - P.z); if (d < l.r && (!near || d < near.d)) near = { ...l, d }; }
  if (near && near.name !== g.lastLm) { g.lastLm = near.name; $('#lm').textContent = near.name; $('#lm').classList.remove('hide'); $('#lm').classList.remove('pop'); void $('#lm').offsetWidth; $('#lm').classList.add('pop'); g.lmT = 4; }
  g.lmT -= dt; if (g.lmT < 0) $('#lm').classList.add('hide');
  drawMinimap(); audio.set(Math.abs(P.vF || 0), g.state !== 'done');
  renderer.render(g.scene, camera);
}
function finish() {
  const g = game; g.state = 'done';
  setTimeout(() => {
    if (!game) return; const rows = [...g.cars].sort((a, b) => (a.finished ? a.time : 1e9 - a.progress) - (b.finished ? b.time : 1e9 - b.progress));
    $('#res').innerHTML = rows.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${c.name}</td><td>${c.finished ? fmt(c.time) : '—'}</td></tr>`).join('');
    $('#results').classList.remove('hide');
  }, 1500);
}
// touch controls: multi-touch pointer events so steering and gas work at the same time
for (const [id, fn] of [['tl', (v) => touch.steer = v ? 1 : (touch.steer === 1 ? 0 : touch.steer)], ['tr', (v) => touch.steer = v ? -1 : (touch.steer === -1 ? 0 : touch.steer)], ['tg', (v) => touch.throttle = v], ['tb', (v) => touch.brake = v], ['tn', (v) => touch.nitro = v], ['td', (v) => touch.drift = v]]) {
  const el = document.getElementById(id); if (!el) continue; const ids = new Set();
  const down = (e) => { e.preventDefault(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (_) { } el.classList.add('on'); fn(true); if (navigator.vibrate && (id === 'tn')) navigator.vibrate(15); };
  const up = (e) => { ids.delete(e.pointerId); if (!ids.size) { el.classList.remove('on'); fn(false); } };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
document.getElementById('touch').addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
// tilt steering (phone held sideways)
function onTilt(e) {
  const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  let v = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma; v = v || 0;
  const dz = 3, max = 22; const a = Math.abs(v) < dz ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - dz) / (max - dz)); touch.tilt = -a;
}
async function enableTilt(on) {
  if (on && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') on = false; } catch (e) { on = false; } }
  sel.tilt = on; $('#tilt').checked = on; document.body.classList.toggle('tilting', on);
  if (on) addEventListener('deviceorientation', onTilt); else { removeEventListener('deviceorientation', onTilt); touch.tilt = 0; }
}
// live "build anywhere" results flow back into the menu (and straight into a race when asked)
initBuilder((res, raceNow) => {
  trackData.live = res.data; liveTheme = res.theme; sel.track = 'live'; buildMenu();
  if (raceNow) start();
});
buildMenu().catch(e => console.warn('menu', e)); if (!glOk) showNoGL(); frame();
// debug/screenshot hooks: ?track=lake&warp=1200&night=1&cam=2
const Q = new URLSearchParams(location.search);
if (Q.get('race')) { const pins = Q.get('race').split(';').map(p => p.split(',').map(Number)).filter(p => p.length === 2 && p.every(isFinite)); if (pins.length) openBuilder({ pins, auto: true }); }
if (Q.get('track')) { sel.track = Q.get('track'); sel.night = Q.get('night') === '1'; if (Q.get('car')) sel.car = Q.get('car');
  start().then(() => { if (!game) return; const w = +Q.get('warp') || 0; const g = game; if (w) { const p = g.track.pointAt(w); const P = g.player; P.x = p.x; P.z = p.z; P.y = p.y; P.h = Math.atan2(p.tx, p.tz); P.hint = p.i; P.s = w; g.ais.forEach((a, k) => { a.v.s = w + 10 + k * 8; a.cur = 0; }); g.camPos.set(P.x - Math.sin(P.h) * 12, P.y + 5, P.z - Math.cos(P.h) * 12); }
    if (Q.get('cam')) g.camMode = +Q.get('cam'); if (Q.get('go')) { g.count = 0; } window.__ready = true; }); }
window.__rwr = { get game() { return game; }, start, sel, live(res) { trackData.live = res.data; liveTheme = res.theme; sel.track = 'live'; return buildMenu(); } };
