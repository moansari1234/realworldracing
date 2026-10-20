# Real World Racing — Hyderabad

Live: https://realworldracing.vercel.app (Vercel project `realworldracing`)

## Pipeline
1. `data/routes_def.json` — waypoints (lat/lon of landmarks) per route.
2. `data/fetch_api.py <key>` — OSM data via api.openstreetmap.org /map tiles (Overpass was down; `fetch2.py` is the Overpass version).
3. `data/bake.py <key>` — builds road graph (oneways ignored, main roads preferred, heritage footways allowed), A* through waypoints,
   smooths centreline, keeps buildings/roads/water/parks/trees near the corridor, matches landmark footprints → `web/public/tracks/<key>.json`.
   `data/plot.py <key>` renders a 2D check map.
4. `web/` (Vite + three.js): `track.js` (centreline, bridge elevation), `world.js` (ground, roads, kerbs, props),
   `gen/buildings.js` (facade engine + filler engine), `gen/landmarks.js` (procedural landmark recipes), `gen/themes.js` (per-zone styles), `car.js` (procedural cars, arcade physics, AI).
5. Build `npx vite build`; deploy `python3 (internal tool) dist realworldracing`.
6. **Mapillary street detail** (optional layer, live + baked tracks): `src/live/mapillary.js` fetches Mapillary API v4
   `map_features` over ~330 m corridor tiles (0.003°, far under the 0.01 deg² bbox rule; tiles that hit the 2000 page cap split
   into quarters) and `images` in tiny bboxes every ~90 m along the route; features are masked to a ~45 m-cell corridor, cached
   in memory + localStorage (1 day). `src/gen/streetprops.js` turns them into procedural low-poly props at real positions:
   street lights, utility poles/poles, traffic lights, signs by class (stop octagon, give-way, speed, prohibitory, mandatory blue,
   warning triangle, info, green direction boards, generic/back plates), benches, bins, hydrants, bollards, billboards/banners
   (random ad tints), junction boxes, trees. One InstancedMesh per kind, dedupe per kind radius (traffic-light faces → 7 m),
   weighted per-kind budget spread along the route (1500 desktop / 800 phone), distance culling every 300 ms (460 m / 300 m),
   shadows only for tall props on desktop. Facades: ≤36 (phone 18) thumbnails spaced ≥70 m, sampled on a 96 px canvas
   (`crossOrigin=anonymous`; fbcdn thumbs send `Access-Control-Allow-Origin: *`), left/right strips (or ±90° columns on panos),
   sky/vegetation/shadow rejected, dominant colour repaints the nearest road-facing buildings on that side (vertex range
   `b._w0/_w1` recorded by `buildBuildings`). Everything runs after the race starts (`attachStreetDetail` in `main.js`, 25 s budget);
   any failure leaves the game as before. `?mly=0` disables it. Credit "Street detail: Mapillary · CC BY-SA" in the HUD + menu footer.
   **Token**: never in the bundle. `web/api/mly.js` is a Vercel serverless proxy (`/api/mly?p=map_features|images&bbox=…`, field
   whitelist, bbox ≤ 0.0004 deg², CDN cache 1 day) that adds `MLY_TOKEN` from the Vercel env var (set in the project dashboard).
   `vite.config.js` copies `api/` into `dist/` so `vdeploy.py dist realworldracing` ships the function too.
   Tests: `test/gen_mly.mjs` (Node: `NODE_USE_ENV_PROXY=1 node test/gen_mly.mjs "<name>" "lat,lon;lat,lon" out.json` — generates the
   race, fetches Mapillary direct with the sandbox-injected token, inlines thumbs as data URLs), `test/shot_mly.mjs desk|phone out.json tag warpFrac`
   (local preview, injects `res.data.mly`), `test/live_e2e.mjs` (deployed site through the sandbox proxy, injects the race and lets
   the live `/api/mly` + thumbnails run), `test/dens.mjs` (feature density along the route). Shots in `test/shots/`.
7. **Water / multipolygons** (fixed 2026-10-19). Live bake (`src/live/bake.js`): `closeRings` returns only CLOSED rings,
   `assembleMP` builds outer rings (role `outer` or empty) with `inner` rings as holes, big rings are clipped (Sutherland–Hodgman)
   to the route bbox + 1.2 km, and a water polygon covering >15 % of the ground-level (non-bridge) race line is dropped as broken
   data. Water entries are either a ring `[[x,z],…]` or `{p: outer, h: [holes]}` (`polyOuter/polyHoles/inPolyH` in `util.js`;
   world mesh uses `Shape.holes`, minimap/preview fill even-odd). OSM API fallback (`osm.js`): water relations with members
   missing from the bbox tiles are completed via `/api/0.6/relation/<id>/full.json` (≤4, one retry on 429). `data/bake.py`
   applies the same rules (polygonize closed rings, inner → holes, race-line guard; `RWR_TRACKS_OUT=/tmp/x` for dry runs);
   lake + oldcity re-baked (only change: island holes, e.g. the Buddha statue rock in Hussain Sagar).
   Render layering (`world.js`), bottom → top, each higher and with a stronger polygonOffset toward the camera:
   ground (+1) < parks (0) @0.02 < water (−1) @0.03 < side streets (−2) @0.06 < race road (−3) @+0.12. Water used to have the
   strongest offset (−2), so at distance it beat roads in the depth test.
8. **No-WebGL startup** (fixed 2026-10-19). `main.js` no longer creates `THREE.WebGLRenderer` at module load: `webglAvailable()`
   probes a canvas, `getRenderer()` creates it lazily on the first `start()` inside try/catch. The menu always builds; without
   WebGL `showNoGL()` adds a notice under the header ("Your browser or device has 3D graphics turned off…", hardware-acceleration
   hint, Reload button) and disables Start ("3D graphics needed"). Test: `test/nogl.mjs` (WebGL disabled vs swiftshader).
Tests added: `test/gen_race.mjs` (Node live race generator with an on-disk HTTP cache in /tmp/rwr_http; `RWR_NO_OVERPASS=1`
forces the OSM API fallback), `test/shot_warp.mjs <res.json|track:key> <tag> <fracs> [cam]` (warp + screenshot), `test/nogl.mjs`.
Shots: `test/shots/water_*` (before/after), `nogl_menu_*`.
Screenshot hooks: `?track=hitec&warp=2600&go=1&night=1&cam=2`; headless test `(internal tool)`.

## Routes
- oldcity — Nizam's Heritage Run, 2.1 km sprint: Salar Jung Museum → Machli Kaman → Gulzar Houz → Char Kaman → Charminar → Mecca Masjid → Chowmahalla Palace
- lake — Hussain Sagar Loop, 9.7 km lap: Secretariat, Martyrs' Memorial, Lumbini Park, Tank Bund, Buddha Statue, Sanjeevaiah Park, Necklace Road, NTR Gardens
- hitec — Cyber Sprint, 4.4 km: Cyber Towers → HITEC City Rd → Inorbit Mall → Durgam Cheruvu Cable Bridge → Rd 45
Map data © OpenStreetMap contributors (ODbL). Street detail © Mapillary contributors (CC BY-SA).
