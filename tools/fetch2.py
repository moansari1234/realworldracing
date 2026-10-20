import json,urllib.request,urllib.parse,sys,time,os
R=json.load(open('routes_def.json'))
EPS=["https://maps.mail.ru/osm/tools/overpass/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"]
PARTS={
'hw':'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service)$"]({bb});',
'bld':'way["building"]({bb});',
'misc':'way["natural"="water"]({bb});relation["natural"="water"]({bb});way["leisure"~"park|garden"]({bb});way["landuse"~"grass|recreation_ground|forest"]({bb});node["natural"="tree"]({bb});nwr["tourism"~"attraction|museum"]({bb});nwr["historic"]({bb});nwr["amenity"="place_of_worship"]["name"]({bb});way["man_made"="bridge"]({bb});'}
for k in sys.argv[1:]:
  r=R[k]; la=[p[0] for p in r['wps']]; lo=[p[1] for p in r['wps']]; m=0.005
  bb=f"{min(la)-m},{min(lo)-m},{max(la)+m},{max(lo)+m}"
  els=[]
  for pn,p in PARTS.items():
    q=f"[out:json][timeout:170];({p.format(bb=bb)});out body geom;"
    for ep in EPS*2:
      try:
        d=urllib.request.urlopen(urllib.request.Request(ep,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'rwr/1.0'}),timeout=200).read()
        j=json.loads(d); els+=j['elements']; print(k,pn,len(j['elements']),ep,flush=True); break
      except Exception as e: print('fail',pn,ep,e,flush=True); time.sleep(5)
  json.dump({'elements':els},open(f'osm_{k}.json','w'))
