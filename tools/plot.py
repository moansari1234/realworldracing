import json,sys
from PIL import Image,ImageDraw
k=sys.argv[1]; d=json.load(open(f'../web/public/tracks/{k}.json'))
xs=[c[0] for c in d['center']]; zs=[c[1] for c in d['center']]
mx,Mx,mz,Mz=min(xs)-400,max(xs)+400,min(zs)-400,max(zs)+400
S=1000/max(Mx-mx,Mz-mz); im=Image.new('RGB',(int((Mx-mx)*S),int((Mz-mz)*S)),(235,230,220)); dr=ImageDraw.Draw(im)
T=lambda p:((p[0]-mx)*S,(p[1]-mz)*S)
for w in d['water']: dr.polygon([T(p) for p in w],fill=(120,170,220))
for w in d['parks']: dr.polygon([T(p) for p in w],fill=(150,200,130))
for r in d['roads']: dr.line([T(p) for p in r['p']],fill=(200,200,200),width=2)
for b in d['buildings']: dr.polygon([T(p) for p in b['p']],fill=(170,140,120))
dr.line([T(c) for c in d['center']],fill=(220,30,30),width=4)
for l in d['landmarks']:
  if 'x' in l: x,y=T((l['x'],l['z'])); dr.ellipse([x-6,y-6,x+6,y+6],fill=(0,0,0)); dr.text((x+8,y),l['name'],fill=(0,0,0))
x,y=T(d['center'][0]); dr.ellipse([x-8,y-8,x+8,y+8],fill=(0,160,0))
im.save(f'map_{k}.png')
