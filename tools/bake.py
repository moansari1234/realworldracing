"""Bake real OSM data into a compact race-track JSON per route.
Pipeline: OSM (Overpass) -> road graph (oneways ignored, main roads preferred) -> shortest path through
landmark waypoints -> smoothed centerline + widths -> nearby buildings/roads/water/parks/trees/landmarks
in local metres (x east, z south)."""
import json, math, os, re, sys, hashlib
OUT_DIR = os.environ.get('RWR_TRACKS_OUT', '../web/public/tracks')  # override for dry runs
import networkx as nx
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import unary_union

R = json.load(open('routes_def.json'))
WIDTH = {'motorway':22,'trunk':20,'primary':17,'secondary':14,'tertiary':12,'unclassified':10,'residential':9,
         'living_street':8,'service':7,'pedestrian':12}
COST = {'motorway':1,'trunk':1,'primary':1,'secondary':1.05,'tertiary':1.15,'unclassified':1.4,'residential':1.6,
        'living_street':2.2,'service':3,'pedestrian':1.0}

LANDMARKS = {
 'oldcity': [
  dict(id='charminar', name='Charminar', gen='charminar', osm=r'^Charminar$', ll=(17.36160,78.47464), size=(20,20)),
  dict(id='mecca', name='Mecca Masjid', gen='masjid', osm=r'^Mecca Masjid$', ll=(17.36066,78.4736)),
  dict(id='gulzar', name='Gulzar Houz', gen='fountain', ll=(17.36345,78.47499), size=(10,10)),
  dict(id='charkaman', name='Char Kaman', gen='kaman', osm=r'^Char Kaman$'),
  dict(id='machli', name='Machli Kaman', gen='kaman', osm=r'^Machli Kaman$'),
  dict(id='chowmahalla', name='Chowmahalla Palace', gen='palace', osm=r'^Chowmahalla Palace$', ll=(17.35758,78.4717)),
  dict(id='salarjung', name='Salar Jung Museum', gen='museum', osm=r'^Salar Jung Museum$', ll=(17.37139,78.48014)),
  dict(id='clocktower', name='Mehboob Chowk Clock Tower', gen='clocktower', osm=r'Mehboob Chowk Clock', size=(6,6)),
 ],
 'lake': [
  dict(id='buddha', name='Buddha Statue', gen='buddha', ll=(17.41558,78.47500), size=(14,14)),
  dict(id='secretariat', name='Telangana Secretariat', gen='secretariat', osm=r'సెక్రటేరియట్|Secretariat', ll=(17.40979,78.46885)),
  dict(id='martyrs', name="Martyrs' Memorial", gen='memorial', ll=(17.40866,78.47298), size=(30,30)),
  dict(id='ambedkar', name='Ambedkar Statue', gen='statue', osm=r'Ambedkar', size=(16,16)),
  dict(id='lumbini', name='Lumbini Park', gen='parkgate', ll=(17.40971,78.47282), size=(14,8)),
  dict(id='ntr', name='NTR Gardens', gen='parkgate', ll=(17.41251,78.46883), size=(14,8)),
  dict(id='sanjeevaiah', name='Sanjeevaiah Park', gen='parkgate', ll=(17.43200,78.47580), size=(14,8)),
 ],
 'hitec': [
  dict(id='cyber', name='Cyber Towers', gen='cybertowers', osm=r'^Cyber Towers', ll=(17.45067,78.38014), size=(70,70)),
  dict(id='inorbit', name='Inorbit Mall', gen='mall', osm=r'^Inorbit Mall', ll=(17.43455,78.38669)),
  dict(id='cablebridge', name='Durgam Cheruvu Cable Bridge', gen='cablebridge'),
  dict(id='mindspace', name='Mindspace IT Park', gen='glasscampus', osm=r'Mindspace'),
 ],
}

def proj(lat0, lon0):
    kx = math.cos(math.radians(lat0)) * 111320.0; kz = 110540.0
    return lambda lat, lon: ((lon - lon0) * kx, -(lat - lat0) * kz)

def chaikin(pts, it=2):
    for _ in range(it):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [(a[0]*.75+b[0]*.25, a[1]*.75+b[1]*.25), (a[0]*.25+b[0]*.75, a[1]*.25+b[1]*.75)]
        out.append(pts[-1]); pts = out
    return pts

def resample(pts, step):
    out = [pts[0]]; acc = 0.0
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        while acc + d >= step:
            t = (step - acc) / d; a = (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t); out.append(a); d = math.dist(a, b); acc = 0.0
        acc += d
    if math.dist(out[-1], pts[-1]) > step*0.3: out.append(pts[-1])
    return out

def seed(s): return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16)

def r1(v): return round(v, 1)

def bake(key):
    route = R[key]; els = json.load(open(f'osm_{key}.json'))['elements']
    lat0 = sum(p[0] for p in route['wps'])/len(route['wps']); lon0 = sum(p[1] for p in route['wps'])/len(route['wps'])
    P = proj(lat0, lon0)
    G = nx.Graph(); pos = {}; roads = []
    seen = set()
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'way' and 'highway' in t and e['id'] not in seen and 'geometry' in e:
            seen.add(e['id'])
            hw = t['highway'].replace('_link', '')
            if hw == 'footway' and (re.search(r'Kaman|Charminar', t.get('name', '')) or t.get('access') == 'permit'): hw = 'pedestrian'  # pedestrianised heritage streets
            if hw not in WIDTH: continue
            if t.get('access') == 'private' or t.get('area') == 'yes': continue
            g = [P(p['lat'], p['lon']) for p in e['geometry']]
            for nid, xy in zip(e['nodes'], g): pos[nid] = xy
            for a, b in zip(e['nodes'], e['nodes'][1:]):
                d = math.dist(pos[a], pos[b]) * COST[hw]
                if not G.has_edge(a, b) or G[a][b]['w'] > d:
                    G.add_edge(a, b, w=d, hw=hw, name=t.get('name', ''), bridge=t.get('bridge') == 'yes')
            roads.append(dict(id=e['id'], hw=hw, name=t.get('name', ''), pts=g, bridge=t.get('bridge') == 'yes'))
    main = [n for n in G.nodes if any(G[n][m]['hw'] in ('trunk','primary','secondary','tertiary','motorway') for m in G[n])]
    wpn = []
    for la, lo in route['wps']:
        x, z = P(la, lo); wpn.append(min(main, key=lambda n: (pos[n][0]-x)**2 + (pos[n][1]-z)**2))
    path = [wpn[0]]
    for a, b in zip(wpn, wpn[1:]):
        path += nx.astar_path(G, a, b, heuristic=lambda u, v: math.dist(pos[u], pos[v]), weight='w')[1:]
    # remove immediate back-and-forth (u-turn spikes)
    clean = []
    for n in path:
        if len(clean) >= 2 and clean[-2] == n: clean.pop(); continue
        clean.append(n)
    path = clean
    raw = [pos[n] for n in path]
    edges = [G[a][b] for a, b in zip(path, path[1:])]
    # widths per raw vertex
    wv = [WIDTH[edges[0]['hw']]] + [max(WIDTH[e['hw']], 10) for e in edges]
    names = [edges[0]['name']] + [e['name'] for e in edges]
    brg = [False] + [e['bridge'] for e in edges]
    pts = chaikin(raw, 3)
    pts = resample(pts, 4.0)
    rawls = LineString(raw)
    center = []
    for x, z in pts:
        i = min(range(len(raw)), key=lambda k: (raw[k][0]-x)**2 + (raw[k][1]-z)**2)
        center.append([r1(x), r1(z), max(wv[i], 10) * (1.0 if key == 'oldcity' else 1.2), names[i], 1 if brg[i] else 0])
    # smooth widths
    ws = [c[2] for c in center]
    for _ in range(30): ws = [ws[0]] + [(ws[i-1]+ws[i]*2+ws[i+1])/4 for i in range(1, len(ws)-1)] + [ws[-1]]
    for c, w in zip(center, ws): c[2] = r1(w)
    line = LineString([(c[0], c[1]) for c in center])
    corridor = unary_union([Point(c[0], c[1]).buffer(c[2]/2 + 3, 6) for c in center[::2]] + [line.buffer(9)])
    near = line.buffer(260)
    far = line.buffer(700)
    out = dict(key=key, name=route['name'], loop=bool(route.get('loop')), origin=[lat0, lon0], length=r1(line.length),
               center=center, roads=[], buildings=[], water=[], parks=[], trees=[], landmarks=[])
    # side roads
    pathset = set(zip(path, path[1:])) | set(zip(path[1:], path))
    for rd in roads:
        ls = LineString(rd['pts']) if len(rd['pts']) > 1 else None
        if ls is None or not ls.intersects(far): continue
        c = ls.intersection(far)
        geoms = [c] if c.geom_type == 'LineString' else list(getattr(c, 'geoms', []))
        for g in geoms:
            if g.geom_type != 'LineString' or g.length < 5: continue
            g = g.simplify(1.5)
            out['roads'].append(dict(w=WIDTH[rd['hw']], p=[[r1(x), r1(z)] for x, z in g.coords]))
    # landmark footprints
    lmspecs = LANDMARKS.get(key, []); lmpolys = []
    named = {}
    for e in els:
        t = e.get('tags', {})
        if 'name' in t: named.setdefault(e['type'], []).append(e)
    for spec in lmspecs:
        poly = None
        if spec.get('osm'):
            for e in named.get('way', []):
                if re.search(spec['osm'], e['tags']['name']) and 'geometry' in e and len(e['geometry']) > 3:
                    pp = Polygon([P(p['lat'], p['lon']) for p in e['geometry']])
                    if pp.is_valid and pp.area > 4 and (poly is None or pp.area > poly.area): poly = pp
        if spec['id'] == 'cablebridge':
            # bridge deck = path samples flagged bridge with "Durgam Cheruvu Bridge" name, longest run
            idx = [i for i, c in enumerate(center) if c[1] is not None and 'Durgam Cheruvu Bridge' in c[3]]
            if idx:
                a, b = idx[0], idx[-1]
                out['landmarks'].append(dict(id='cablebridge', name=spec['name'], gen='cablebridge', i0=a, i1=b))
                spec['_i'] = (a + b)//2
            continue
        if poly is not None and spec.get('ll') is None or (poly is not None and Point(P(*spec['ll'])).distance(poly) < 120):
            rect = poly.minimum_rotated_rectangle; cs = list(rect.exterior.coords)
            e1 = (cs[1][0]-cs[0][0], cs[1][1]-cs[0][1]); e2 = (cs[2][0]-cs[1][0], cs[2][1]-cs[1][1])
            w, d = math.hypot(*e1), math.hypot(*e2); ang = math.atan2(e1[1], e1[0])
            cx, cz = rect.centroid.x, rect.centroid.y
            fp = [[r1(x), r1(z)] for x, z in poly.simplify(1).exterior.coords]
        elif spec.get('ll'):
            cx, cz = P(*spec['ll']); w, d = spec.get('size', (40, 40)); ang = 0.0; fp = None
        else:
            print('  landmark missing', spec['id']); continue
        if 'size' in spec and poly is None: w, d = spec['size']
        # if it lands on the corridor, nudge it out perpendicular (except gateways which straddle the road)
        pt = Point(cx, cz)
        dist = line.distance(pt)
        if dist > 900: print('  landmark far', spec['id'], dist); continue
        lm = dict(id=spec['id'], name=spec['name'], gen=spec['gen'], x=r1(cx), z=r1(cz), w=r1(w), d=r1(d), a=round(ang, 3), fp=fp)
        if spec['gen'] in ('kaman', 'charminar'):
            # align to road: find nearest centre sample and its tangent
            i = min(range(len(center)), key=lambda k: (center[k][0]-cx)**2 + (center[k][1]-cz)**2)
            j = min(i+1, len(center)-1); h = max(i-1, 0)
            lm['roadAng'] = round(math.atan2(center[j][1]-center[h][1], center[j][0]-center[h][0]), 3)
            lm['onRoad'] = Point(cx, cz).distance(line) < 25
            if lm['onRoad']: lm['x'], lm['z'] = center[i][0], center[i][1]; lm['ci'] = i
        out['landmarks'].append(lm)
        lmpolys.append(Point(lm['x'], lm['z']).buffer(max(w, d)/2 + 4))
    lmzone = unary_union(lmpolys) if lmpolys else None
    # buildings
    for e in els:
        t = e.get('tags', {})
        if e['type'] != 'way' or 'building' not in t or 'geometry' not in e or len(e['geometry']) < 4: continue
        try:
            pg = Polygon([P(p['lat'], p['lon']) for p in e['geometry']])
            if not pg.is_valid: pg = pg.buffer(0)
        except Exception: continue
        if pg.geom_type != 'Polygon' or pg.area < 12 or not pg.intersects(near): continue
        if lmzone is not None and pg.intersects(lmzone): continue
        if pg.intersects(corridor):
            pg = pg.difference(corridor)
            if pg.geom_type == 'MultiPolygon': pg = max(pg.geoms, key=lambda g: g.area)
            if pg.geom_type != 'Polygon' or pg.area < 12: continue
        pg = pg.simplify(0.8)
        if pg.geom_type != 'Polygon' or len(pg.exterior.coords) < 4: continue
        h = None
        try:
            if 'height' in t: h = float(re.findall(r'[\d.]+', t['height'])[0])
            elif 'building:levels' in t: h = float(re.findall(r'[\d.]+', t['building:levels'])[0]) * 3.3
        except Exception: h = None
        out['buildings'].append(dict(s=seed(e['id']) % 100000, h=r1(h) if h else 0, t=t.get('building', 'yes')[:12],
                                     p=[[r1(x), r1(z)] for x, z in list(pg.exterior.coords)[:-1]]))
    # water and parks. Multipolygons: only closed rings count (polygonize), inner members become holes (islands),
    # and a water polygon that swallows a real share of the ground-level race line is broken data and is dropped.
    # (Same rules as web/src/live/bake.js; an open member chain closed by a straight chord is what put the Thames
    # over Parliament Street in the live London build.)
    from shapely.ops import polygonize
    ground_pts = [Point(c[0], c[1]) for c in center[::3] if not c[4]]
    def ring_of(geom): return [P(p['lat'], p['lon']) for p in geom]
    def mp_polys(e):
        outer = [LineString(ring_of(m['geometry'])) for m in e.get('members', []) if m.get('role', '') in ('outer', '') and len(m.get('geometry', [])) > 1]
        inner = [LineString(ring_of(m['geometry'])) for m in e.get('members', []) if m.get('role') == 'inner' and len(m.get('geometry', [])) > 1]
        if not outer: return []
        polys = list(polygonize(unary_union(outer)))
        holes = unary_union(list(polygonize(unary_union(inner)))) if inner else None
        return [pg.difference(holes) if holes is not None and not holes.is_empty else pg for pg in polys]
    for e in els:
        t = e.get('tags', {})
        kind = 'water' if t.get('natural') == 'water' else 'parks' if (t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'recreation_ground', 'forest')) else None
        if not kind: continue
        if e['type'] == 'way' and len(e.get('geometry', [])) > 3:
            r = ring_of(e['geometry'])
            if math.hypot(r[0][0] - r[-1][0], r[0][1] - r[-1][1]) > 0.5: continue  # open way: not an area
            cands = [Polygon(r)]
        elif e['type'] == 'relation': cands = mp_polys(e)
        else: continue
        for pg in cands:
            try: pg = pg.buffer(0)
            except Exception: continue
            if pg.is_empty or not pg.intersects(far.buffer(800)): continue
            if pg.geom_type == 'MultiPolygon': pg = max(pg.geoms, key=lambda g: g.area)
            if pg.geom_type != 'Polygon': continue
            pg = pg.simplify(2.0)
            if pg.is_empty or pg.geom_type != 'Polygon': continue
            if kind == 'parks':
                if pg.area < 150: continue
                out['parks'].append([[r1(x), r1(z)] for x, z in list(pg.exterior.coords)[:-1]]); continue
            if ground_pts and sum(1 for q in ground_pts if pg.contains(q)) > max(3, len(ground_pts) * 0.15):
                print('  dropped water polygon covering the race line'); continue
            ext = [[r1(x), r1(z)] for x, z in list(pg.exterior.coords)[:-1]]
            holes = [[[r1(x), r1(z)] for x, z in list(h.coords)[:-1]] for h in pg.interiors if Polygon(h).area > 20]
            out['water'].append({'p': ext, 'h': holes} if holes else ext)
    for e in els:
        if e['type'] == 'node' and e.get('tags', {}).get('natural') == 'tree':
            x, z = P(e['lat'], e['lon'])
            if near.contains(Point(x, z)) and not corridor.contains(Point(x, z)): out['trees'].append([r1(x), r1(z)])
    # checkpoints every ~250 m
    n = len(center); step = max(1, int(250/4))
    out['checkpoints'] = list(range(step, n-1, step)) + [n-1]
    # route-name sequence for HUD
    json.dump(out, open(os.path.join(OUT_DIR, f'{key}.json'), 'w'), separators=(',', ':'))
    print(key, 'len', round(line.length), 'samples', n, 'bld', len(out['buildings']), 'roads', len(out['roads']),
          'water', len(out['water']), 'parks', len(out['parks']), 'trees', len(out['trees']), 'lm', [l['id'] for l in out['landmarks']])
    print('  streets:', list(dict.fromkeys(c[3] for c in center if c[3])))

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for k in sys.argv[1:]: bake(k)
