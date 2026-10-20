import json,urllib.request,urllib.parse,sys,time
R=json.load(open('routes_def.json'))
EPS=["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
for k,r in R.items():
  la=[p[0] for p in r['wps']]; lo=[p[1] for p in r['wps']]
  m=0.006
  bb=f"{min(la)-m},{min(lo)-m},{max(la)+m},{max(lo)+m}"
  q=f"""[out:json][timeout:120];(
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service)$"]({bb});
way["building"]({bb});relation["building"]({bb});
way["natural"="water"]({bb});relation["natural"="water"]({bb});
way["leisure"~"park|garden"]({bb});way["landuse"~"grass|recreation_ground|forest"]({bb});
node["natural"="tree"]({bb});
nwr["tourism"~"attraction|museum"]({bb});nwr["historic"]({bb});nwr["amenity"="place_of_worship"]["name"]({bb});
);out body geom;"""
  for ep in EPS:
    try:
      d=urllib.request.urlopen(urllib.request.Request(ep,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'rwr/1.0'}),timeout=180).read()
      j=json.loads(d); json.dump(j,open(f'osm_{k}.json','w')); print(k,len(j['elements']),ep); break
    except Exception as e: print('fail',ep,e); time.sleep(3)
