# Fallback fetcher: OSM editing API /map tiles -> Overpass-style JSON elements (with way geometry)
import json, sys, time, urllib.request, xml.etree.ElementTree as ET
R = json.load(open('routes_def.json'))
for k in sys.argv[1:]:
    r = R[k]; la = [p[0] for p in r['wps']]; lo = [p[1] for p in r['wps']]; m = 0.005
    a, b, c, d = min(la) - m, min(lo) - m, max(la) + m, max(lo) + m
    nodes = {}; ways = {}; rels = {}
    T = 0.012; i = a
    while i < c:
        j = b
        while j < d:
            u = f"https://api.openstreetmap.org/api/0.6/map?bbox={j:.5f},{i:.5f},{min(j+T,d):.5f},{min(i+T,c):.5f}"
            x = None
            for att in range(4):
                try:
                    x = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'rwr-game/1.0 (anas.jkmk@gmail.com)'}), timeout=120).read(); break
                except Exception as e:
                    print('retry', e, flush=True); time.sleep(6)
            if x is None: j += T; continue
            root = ET.fromstring(x)
            for n in root.iter('node'):
                nodes[int(n.get('id'))] = dict(lat=float(n.get('lat')), lon=float(n.get('lon')), tags={t.get('k'): t.get('v') for t in n.findall('tag')})
            for w in root.iter('way'):
                ways[int(w.get('id'))] = dict(nodes=[int(nd.get('ref')) for nd in w.findall('nd')], tags={t.get('k'): t.get('v') for t in w.findall('tag')})
            for rl in root.iter('relation'):
                rels[int(rl.get('id'))] = dict(members=[dict(type=mm.get('type'), ref=int(mm.get('ref')), role=mm.get('role')) for mm in rl.findall('member')], tags={t.get('k'): t.get('v') for t in rl.findall('tag')})
            print(k, round(i, 3), round(j, 3), len(nodes), len(ways), flush=True); time.sleep(1)
            j += T
        i += T
    els = []
    for nid, n in nodes.items():
        if n['tags']: els.append(dict(type='node', id=nid, lat=n['lat'], lon=n['lon'], tags=n['tags']))
    def geom(w): return [dict(lat=nodes[n]['lat'], lon=nodes[n]['lon']) for n in w['nodes'] if n in nodes]
    for wid, w in ways.items():
        g = geom(w)
        if len(g) == len(w['nodes']) and w['tags']: els.append(dict(type='way', id=wid, nodes=w['nodes'], geometry=g, tags=w['tags']))
    for rid, rl in rels.items():
        mem = [dict(type='way', ref=mm['ref'], role=mm['role'], geometry=geom(ways[mm['ref']])) for mm in rl['members'] if mm['type'] == 'way' and mm['ref'] in ways]
        els.append(dict(type='relation', id=rid, members=mem, tags=rl['tags']))
    json.dump({'elements': els}, open(f'osm_{k}.json', 'w')); print('done', k, len(els), flush=True)
