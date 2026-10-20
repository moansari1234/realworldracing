import json,urllib.request,urllib.parse,sys,time,os
R=json.load(open('routes_def.json'))
EPS=["https://overpass-api.de/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"]
HW='way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|pedestrian)$"]({bb});'
BLD='way["building"]({bb});'
def q(body):
  for att in range(4):
    for ep in EPS:
      try:
        d=urllib.request.urlopen(urllib.request.Request(ep,data=urllib.parse.urlencode({'data':f"[out:json][timeout:90];({body});out body geom;"}).encode(),headers={'User-Agent':'rwr/1.0 (anas.jkmk@gmail.com)'}),timeout=120).read()
        return json.loads(d)['elements']
      except Exception as e: print('  fail',ep[:30],e,flush=True); time.sleep(4)
  raise SystemExit('gave up')
for k,parts in [('lake',[HW]),('hitec',[HW,BLD])]:
  r=R[k]; la=[p[0] for p in r['wps']]; lo=[p[1] for p in r['wps']]; m=0.005
  a,b,c,d=min(la)-m,min(lo)-m,max(la)+m,max(lo)+m
  o=json.load(open(f'osm_{k}.json')); ids={(e['type'],e['id']) for e in o['elements']}
  n=3
  for p in parts:
    for i in range(n):
      for j in range(n):
        bb=f"{a+(c-a)*i/n},{b+(d-b)*j/n},{a+(c-a)*(i+1)/n},{b+(d-b)*(j+1)/n}"
        els=q(p.format(bb=bb)); new=[e for e in els if (e['type'],e['id']) not in ids]
        ids|={(e['type'],e['id']) for e in new}; o['elements']+=new; print(k,p[:12],i,j,len(els),flush=True)
        json.dump(o,open(f'osm_{k}.json','w'))
