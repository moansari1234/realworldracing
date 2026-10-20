// "Build anywhere" screen: a Leaflet map where the player drops start / via / finish pins (or one pin for a
// surprise route), searches any place on Earth, then generates a race from live OpenStreetMap data.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocode } from './osm.js';
import { generateRace } from './builder.js';
import { fetchStreetDetail } from './mapillary.js';

const $ = (s) => document.querySelector(s);
let map = null, pins = [], markers = [], line = null, busy = false, onReady = null, lastResult = null;

const icon = (label, cls) => L.divIcon({ className: '', html: `<div class="pin ${cls}"><span><b>${label}</b></span></div>`, iconSize: [34, 44], iconAnchor: [17, 42] });

export function initBuilder(readyCb) {
  onReady = readyCb;
  $('#bk-back').onclick = closeBuilder;
  $('#bk-undo').onclick = () => { if (busy) return; pins.pop(); redraw(); };
  $('#bk-clear').onclick = () => { if (busy) return; pins = []; redraw(); };
  $('#bk-loc').onclick = locate;
  $('#bk-build').onclick = () => build();
  $('#bk-race').onclick = () => { if (lastResult) { closeBuilder(); onReady(lastResult, true); } };
  $('#bk-share').onclick = share;
  $('#bk-again').onclick = () => { lastResult = null; setStage('pick'); };
  let t = null; const inp = $('#bk-q'), res = $('#bk-res');
  inp.addEventListener('input', () => { clearTimeout(t); const q = inp.value.trim(); if (q.length < 3) { res.innerHTML = ''; return; } t = setTimeout(() => search(q), 450); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); search(inp.value.trim(), true); } });
}

async function search(q, jump = false) {
  const res = $('#bk-res');
  try {
    const r = await geocode(q); res.innerHTML = '';
    if (jump && r[0]) { go(r[0]); return; }
    for (const p of r) { const b = document.createElement('button'); b.innerHTML = `<b>${esc(p.short)}</b><small>${esc(p.name)}</small>`; b.onclick = () => go(p); res.appendChild(b); }
  } catch (e) { res.innerHTML = '<div class="bk-err">Search is unavailable right now. Pan the map instead.</div>'; }
}
function go(p) { $('#bk-res').innerHTML = ''; $('#bk-q').value = p.short; $('#bk-q').blur(); map.setView([p.lat, p.lon], 16); }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openBuilder(opts = {}) {
  $('#builder').classList.remove('hide'); $('#menu').classList.add('hide');
  if (!map) {
    map = L.map('bk-map', { zoomControl: false, attributionControl: true }).setView(opts.center || [17.3850, 78.4867], opts.zoom || 14);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    map.on('click', (e) => { if (busy || lastResult) return; if (pins.length >= 6) pins[pins.length - 1] = [e.latlng.lat, e.latlng.lng]; else pins.push([e.latlng.lat, e.latlng.lng]); redraw(); });
  }
  setTimeout(() => map.invalidateSize(), 50);
  if (opts.pins) { pins = opts.pins.slice(); redraw(); map.fitBounds(L.latLngBounds(pins).pad(0.3)); if (opts.auto) build(opts.seed); }
  else { setStage('pick'); redraw(); }
}
export function closeBuilder() { if (busy) return; $('#builder').classList.add('hide'); $('#menu').classList.remove('hide'); }

function redraw() {
  markers.forEach(m => m.remove()); markers = []; if (line) { line.remove(); line = null; }
  pins.forEach((p, i) => {
    const last = i === pins.length - 1 && pins.length > 1; const lab = i === 0 ? 'S' : last ? 'F' : String(i);
    const m = L.marker(p, { icon: icon(lab, i === 0 ? 'start' : last ? 'finish' : 'via'), draggable: true }).addTo(map);
    m.on('dragend', () => { const ll = m.getLatLng(); pins[i] = [ll.lat, ll.lng]; redraw(); }); markers.push(m);
  });
  if (pins.length > 1) line = L.polyline(pins, { color: '#ff4d2e', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(map);
  const n = pins.length; let km = 0; for (let i = 1; i < n; i++) km += map.distance(pins[i - 1], pins[i]) / 1000;
  $('#bk-hint').innerHTML = n === 0 ? '<b>Tap the map</b> to drop your start. Then tap again for the finish, or hit Surprise me.'
    : n === 1 ? '<b>Start set.</b> Tap for the finish (add more taps for via points), or let the engine pick a route.'
    : `<b>${n - 2 ? (n - 2) + ' via · ' : ''}${km.toFixed(1)} km</b> as the crow flies. Drag pins to adjust.${km > 7 ? ' <span class="bk-warn">Too long: keep it under 7 km.</span>' : ''}`;
  $('#bk-build').textContent = n === 1 ? 'Surprise me' : 'Build race';
  $('#bk-build').disabled = n === 0 || km > 7;
  $('#bk-undo').disabled = $('#bk-clear').disabled = n === 0;
}

function locate() {
  if (!navigator.geolocation) return;
  $('#bk-loc').classList.add('busy');
  navigator.geolocation.getCurrentPosition((p) => { $('#bk-loc').classList.remove('busy'); map.setView([p.coords.latitude, p.coords.longitude], 16); if (!pins.length) { pins.push([p.coords.latitude, p.coords.longitude]); redraw(); } },
    () => { $('#bk-loc').classList.remove('busy'); $('#bk-hint').innerHTML = "<b>Couldn't get your location.</b> Search for a place instead."; }, { enableHighAccuracy: true, timeout: 10000 });
}

function setStage(s) { $('#builder').dataset.stage = s; }
function status(msg) { $('#bk-status').textContent = msg; }

async function build(seed) {
  if (busy || !pins.length) return; busy = true; setStage('busy'); status('Starting…');
  try {
    const res = await generateRace(pins, status, { seed });
    lastResult = res; const d = res.data;
    if (line) line.remove(); line = L.polyline(d.center.map(c => routeLL(d, c)), { color: '#ff4d2e', weight: 6, opacity: 0.95 }).addTo(map);
    if (pins.length === 1) { pins.push(d.pins[1]); }
    markers.forEach(m => m.remove()); markers = [];
    markers.push(L.marker(routeLL(d, d.center[0]), { icon: icon('S', 'start') }).addTo(map), L.marker(routeLL(d, d.center[d.center.length - 1]), { icon: icon('F', 'finish') }).addTo(map));
    map.fitBounds(line.getBounds().pad(0.15));
    $('#bk-title').textContent = d.name;
    $('#bk-meta').innerHTML = [`${(d.length / 1000).toFixed(1)} km`, `${d.buildings.length} real buildings`, `${d.landmarks.length} landmarks`, res.theme.label].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
    $('#bk-lms').textContent = d.landmarks.length ? 'Passing ' + d.landmarks.map(l => l.name).join(' · ') : (d.streets.slice(0, 4).join(' → '));
    setStage('done'); onReady(res, false);
    // warm the Mapillary street-detail cache while the player looks at the route (never blocks)
    fetchStreetDetail(d).then(r => { if (lastResult === res && r.ok && r.features.length) { const s = document.createElement('span'); s.textContent = `${r.features.length} Mapillary street objects`; $('#bk-meta').appendChild(s); } });
  } catch (e) {
    console.error(e); setStage('pick'); redraw(); $('#bk-hint').innerHTML = `<span class="bk-warn">${esc(e.message || 'Something went wrong.')}</span>`;
  } finally { busy = false; }
}
function routeLL(d, c) { const [lat0, lon0] = d.origin; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110540; return [lat0 - c[1] / kz, lon0 + c[0] / kx]; }

async function share() {
  if (!lastResult) return; const p = lastResult.data.pins.concat(pins.slice(1, -1));
  const all = [lastResult.data.pins[0], ...pins.slice(1, -1), lastResult.data.pins[1]];
  const u = `${location.origin}${location.pathname}?race=${all.map(q => q[0].toFixed(5) + ',' + q[1].toFixed(5)).join(';')}`;
  try { if (navigator.share) { await navigator.share({ title: 'Real World Racing', text: `Race me: ${lastResult.data.name}`, url: u }); return; } } catch (e) { }
  try { await navigator.clipboard.writeText(u); $('#bk-share').textContent = 'Link copied'; setTimeout(() => $('#bk-share').textContent = 'Share', 1800); } catch (e) { prompt('Copy this link', u); }
}
