// Orchestrates a live build: pins -> street network -> route -> corridor data -> theme -> track JSON.
import { fetchRoads, fetchCorridor, reverse } from './osm.js';
import { projector, buildGraph, snap, makeRoute, pickFinish, bakeCorridor, autoTheme, rdp } from './bake.js';
import { THEMES } from '../gen/themes.js';

const MAX_KM = 7;

export async function generateRace(points, onStatus = () => {}, opts = {}) {
  if (!points.length) throw new Error('Drop a start pin first.');
  const surprise = points.length === 1;
  const la = points.map(p => p[0]), lo = points.map(p => p[1]);
  const lat0 = la.reduce((a, b) => a + b) / la.length, lon0 = lo.reduce((a, b) => a + b) / lo.length;
  const P = projector(lat0, lon0);
  // straight-line sanity check
  let straight = 0; for (let i = 1; i < points.length; i++) { const a = P(...points[i - 1]), b = P(...points[i]); straight += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  if (straight > MAX_KM * 1000) throw new Error(`That's ${(straight / 1000).toFixed(1)} km. Keep races under ${MAX_KM} km so the city fits on your device.`);
  const m = surprise ? 0.02 : 0.006 + Math.min(0.01, straight / 1e6 * 2);
  const geoP = reverse(points[0][0], points[0][1]);
  const roadEls = await fetchRoads(Math.min(...la) - m, Math.min(...lo) - m * 1.05, Math.max(...la) + m, Math.max(...lo) + m * 1.05, onStatus);
  onStatus('Building the road graph…'); await tick();
  const G = buildGraph(roadEls, P);
  if (G.n < 20) throw new Error('No drivable roads here. Try a spot in a town or city.');
  const wp = points.map(p => { const [x, z] = P(...p); const mm = snap(G, x, z, true); if (mm.i >= 0 && mm.d < 260) return mm.i; return snap(G, x, z, false).i; });
  if (surprise) { const f = pickFinish(G, wp[0], opts.seed ?? Math.random()); if (f < 0) throw new Error("Couldn't find a good finish nearby. Drop a finish pin."); wp.push(f); }
  onStatus('Routing the race on real streets…'); await tick();
  const R = makeRoute(G, wp);
  if (!R) throw new Error("These pins aren't connected by roads. Try moving them onto bigger streets.");
  if (R.length < 350) throw new Error('That route is too short. Spread the pins further apart.');
  if (R.length > MAX_KM * 1000 * 1.3) throw new Error(`That route is ${(R.length / 1000).toFixed(1)} km by road. Move the pins closer.`);
  // corridor download along the actual route
  const ll = rdp(R.raw, 25).map(([x, z]) => P.inv(x, z));
  const step = Math.max(1, Math.ceil(ll.length / 90)); const line = ll.filter((_, i) => i % step === 0 || i === ll.length - 1);
  const els = await fetchCorridor(line, onStatus);
  onStatus('Generating the city…'); await tick();
  const C = bakeCorridor({ els, center: R.center, roads: G.roads, P, length: R.length });
  const geo = await geoP;
  const startName = R.center.find(c => c[3])?.[3] || '';
  const endName = [...R.center].reverse().find(c => c[3])?.[3] || '';
  const n = R.center.length; const stepC = Math.max(1, Math.round(250 / 4));
  const checkpoints = []; for (let i = stepC; i < n - 1; i += stepC) checkpoints.push(i); checkpoints.push(n - 1);
  const data = { key: 'live', name: opts.name || routeName(startName, endName, geo), loop: false, origin: [lat0, lon0], length: Math.round(R.length * 10) / 10, center: R.center, checkpoints, ...C, geo };
  data.pins = [points[0], P.inv(...R.center[n - 1])];
  const theme = autoTheme(THEMES, data, geo);
  data.streets = [...new Set(R.center.map(c => c[3]).filter(Boolean))];
  return { data, theme };
}
const tick = () => new Promise(r => setTimeout(r, 16));
function routeName(a, b, geo) {
  if (a && b && a !== b) return `${a} to ${b}`;
  if (a) return `${a} Sprint`;
  return `${geo.area || geo.city || 'Street'} Sprint`;
}
