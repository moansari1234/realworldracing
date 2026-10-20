// Live OpenStreetMap access from the browser: geocoding (Nominatim), map data (Overpass mirrors, then the
// OSM editing API as a fallback). Everything is normalised to Overpass-style elements with way geometry.

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const HW = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|footway';

export async function geocode(q) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { 'Accept-Language': 'en' } }); if (!r.ok) throw new Error('search failed');
  return (await r.json()).map(p => ({ name: p.display_name, short: p.name || p.display_name.split(',')[0], lat: +p.lat, lon: +p.lon, cc: p.address?.country_code || '', city: p.address?.city || p.address?.town || p.address?.state_district || p.address?.state || '' }));
}
export async function reverse(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lon}`, { headers: { 'Accept-Language': 'en' } });
    const p = await r.json(); const a = p.address || {};
    return { cc: a.country_code || '', city: a.city || a.town || a.village || a.state_district || a.county || a.state || '', area: a.suburb || a.neighbourhood || a.quarter || a.road || '' };
  } catch (e) { return { cc: '', city: '', area: '' }; }
}

const withTimeout = (p, ms, ctl) => Promise.race([p, new Promise((_, rej) => setTimeout(() => { ctl?.abort(); rej(new Error('timeout')); }, ms))]);

async function overpass(query, ms, onStatus) {
  // try two mirrors at once, then the rest; first good answer wins
  const tryOne = async (url) => {
    const ctl = new AbortController();
    const r = await withTimeout(fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal }), ms, ctl);
    if (!r.ok) throw new Error('overpass ' + r.status);
    const j = await r.json(); if (!j.elements) throw new Error('bad overpass'); return j.elements;
  };
  const any = (urls) => new Promise((res, rej) => { let n = urls.length, errs = []; urls.forEach(u => tryOne(u).then(res, e => { errs.push(e); if (--n === 0) rej(errs[0]); })); });
  try { return await any(OVERPASS.slice(0, 2)); } catch (e) { onStatus?.('Map server busy, trying another…'); }
  return await any(OVERPASS.slice(2));
}

/** OSM editing API, tiled. Returns everything in the bbox (roads, buildings, water…) as elements. */
async function osmApi(s, w, n, e, onStatus) {
  const T = 0.01; const tiles = [];
  for (let a = s; a < n; a += T) for (let b = w; b < e; b += T) tiles.push([b, a, Math.min(b + T, e), Math.min(a + T, n)]);
  if (tiles.length > 64) throw new Error('area too big');
  const nodes = new Map(), ways = new Map(), rels = new Map(); let done = 0;
  const one = async (t) => {
    for (let att = 0; att < 3; att++) {
      try {
        const r = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${t.map(v => v.toFixed(5)).join(',')}`);
        if (!r.ok) throw new Error('api ' + r.status);
        const j = await r.json();
        for (const el of j.elements) { if (el.type === 'node') nodes.set(el.id, el); else if (el.type === 'way') ways.set(el.id, el); else rels.set(el.id, el); }
        onStatus?.(`Downloading map tiles ${++done}/${tiles.length}…`); return;
      } catch (err) { await new Promise(r => setTimeout(r, 1500)); }
    }
  };
  const q = tiles.slice(); await Promise.all([0, 1, 2, 3].map(async () => { while (q.length) await one(q.shift()); }));
  // A bbox download only holds the member ways that touch the tiles, so big water multipolygons (the Thames riverbank,
  // lakes) arrive as open chains. Fetch the whole relation for those so their rings close properly.
  const partial = [...rels.values()].filter(r => r.tags?.natural === 'water' && r.members?.length <= 3000 && r.members.some(m => m.type === 'way' && !ways.has(m.ref))).slice(0, 4);
  await Promise.all(partial.map(async (r) => {
    try {
      onStatus?.('Downloading rivers and lakes…'); let res = null;
      for (let att = 0; att < 2 && !res?.ok; att++) {
        if (att) await new Promise(ok => setTimeout(ok, 2000)); // 429 right after the tile burst: back off once
        const ctl = new AbortController(); res = await withTimeout(fetch(`https://api.openstreetmap.org/api/0.6/relation/${r.id}/full.json`, { signal: ctl.signal }), 20000, ctl);
      }
      if (!res.ok) return; const j = await res.json();
      for (const el of j.elements) { if (el.type === 'node') { if (!nodes.has(el.id)) nodes.set(el.id, el); } else if (el.type === 'way') { if (!ways.has(el.id)) ways.set(el.id, el); } else if (el.id === r.id) rels.set(el.id, el); }
    } catch (e) { /* the open chains are dropped by the bake: missing water beats water on the road */ }
  }));
  return apiToElements(nodes, ways, rels);
}
function apiToElements(nodes, ways, rels) {
  const els = [];
  for (const n of nodes.values()) if (n.tags) els.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.tags });
  const geom = (w) => w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => ({ lat: n.lat, lon: n.lon }));
  for (const w of ways.values()) { if (!w.tags) continue; const g = geom(w); if (g.length === w.nodes.length) els.push({ type: 'way', id: w.id, nodes: w.nodes, geometry: g, tags: w.tags }); }
  for (const r of rels.values()) els.push({ type: 'relation', id: r.id, tags: r.tags || {}, members: (r.members || []).filter(m => m.type === 'way' && ways.has(m.ref)).map(m => ({ type: 'way', ref: m.ref, role: m.role, geometry: geom(ways.get(m.ref)) })) });
  return els;
}

let apiCache = null; // OSM API fallback returns everything at once; keep it for the corridor pass

/** Phase 1: the road network inside the bbox (for routing). */
export async function fetchRoads(s, w, n, e, onStatus) {
  apiCache = null;
  const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const q = `[out:json][timeout:60][bbox:${bb}];way["highway"~"^(${HW})$"];out geom qt;`;
  try { onStatus?.('Downloading the street network…'); return await overpass(q, 25000, onStatus); }
  catch (err) {
    onStatus?.('Overpass is busy, switching to the OSM API…');
    apiCache = await osmApi(s, w, n, e, onStatus);
    return apiCache.filter(el => el.type === 'way' && el.tags && el.tags.highway);
  }
}

/** Phase 2: buildings, water, parks, trees and landmarks along the chosen route (lat/lon polyline). */
export async function fetchCorridor(path, onStatus) {
  if (apiCache) return apiCache;
  const line = path.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join(',');
  const A = (r) => `(around:${r},${line})`;
  const q = `[out:json][timeout:60];(
    way["building"]${A(280)};
    way["natural"="water"]${A(900)}; relation["natural"="water"]${A(900)};
    way["leisure"~"^(park|garden)$"]${A(500)}; way["landuse"~"^(grass|recreation_ground|forest)$"]${A(400)};
    node["natural"="tree"]${A(260)};
    nwr["name"]["amenity"="place_of_worship"]${A(260)}; nwr["name"]["tourism"~"^(museum|attraction|artwork)$"]${A(260)};
    nwr["name"]["historic"]${A(260)}; nwr["name"]["man_made"="tower"]${A(260)}; nwr["name"]["shop"="mall"]${A(260)};
    way["name"]["leisure"~"^(stadium|park)$"]${A(260)}; way["name"]["building"]["building:levels"]${A(260)};
  );out geom qt;`;
  try { onStatus?.('Downloading buildings and landmarks…'); return await overpass(q, 35000, onStatus); }
  catch (err) {
    try {
      const la = path.map(p => p[0]), lo = path.map(p => p[1]), m = 0.003;
      onStatus?.('Overpass is busy, switching to the OSM API…');
      return await osmApi(Math.min(...la) - m, Math.min(...lo) - m, Math.max(...la) + m, Math.max(...lo) + m, onStatus);
    } catch (e2) { onStatus?.('Map server busy. Using generated buildings.'); return []; }
  }
}
