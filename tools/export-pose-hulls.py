#!/usr/bin/env python3
"""Export painted contact hulls; pixels and sprite metadata are never edited.

python3 tools/export-pose-hulls.py
python3 tools/export-pose-hulls.py --poses nova:cradleTuck,nova:cradleRoll,viper:tuck
The hull encloses opaque pixel squares, not transparent atlas rectangles.
"""
from pathlib import Path
from PIL import Image
import argparse,hashlib,json,math

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--manifest',type=Path,default=ROOT/'public/assets/sprites/manifest.json')
parser.add_argument('--output',type=Path,default=ROOT/'tools/pose-contact-hulls.json')
parser.add_argument('--poses',default='nova:cradleTuck,nova:cradleRoll,viper:tuck')
parser.add_argument('--alpha-threshold',type=int,default=160)
options=parser.parse_args()
manifest=json.loads(options.manifest.read_text())

def cross(a,b,c):
 return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def convex_hull(points):
 points=sorted(set(points));lower=[];upper=[]
 for point in points:
  while len(lower)>1 and cross(lower[-2],lower[-1],point)<=0:lower.pop()
  lower.append(point)
 for point in reversed(points):
  while len(upper)>1 and cross(upper[-2],upper[-1],point)<=0:upper.pop()
  upper.append(point)
 return lower[:-1]+upper[:-1]

def densify(hull,minimum=30,target=48):
 # Preserve every exact support vertex. Added collinear edge points do not
 # change any min-Z support value at any rotation angle.
 if len(hull)>=minimum:return hull
 lengths=[math.dist(a,b) for a,b in zip(hull,hull[1:]+hull[:1])]
 divisions=[1]*len(hull)
 while sum(divisions)<target:
  index=max(range(len(hull)),key=lambda i:lengths[i]/divisions[i]);divisions[index]+=1
 result=[]
 for index,(a,b) in enumerate(zip(hull,hull[1:]+hull[:1])):
  for step in range(divisions[index]):
   t=step/divisions[index];result.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
 return result

export={'version':1,'alphaThreshold':options.alpha_threshold,'criterion':'alpha > threshold','supportGeometry':'opaque pixel square boundaries','unit':'bodyHeight','pivot':'frame.centerPivot','coordinateSystem':{'x':'right','z':'up'},'grounding':{'rotatedZ':'-x*sin(angle) + z*cos(angle)','rootZ':'-0.5 - min(rotatedZ)'},'poses':{}}
for selection in options.poses.split(','):
 character,key=selection.split(':');bank=manifest[character]['combat'];frame=bank['poses'][key]
 path=ROOT/'public'/bank['image'].lstrip('/');sheet=Image.open(path).convert('RGBA');x,y,width,height=frame['rect'];alpha=sheet.crop((x,y,x+width,y+height)).getchannel('A');pixels=alpha.load();points=[];solid_count=0
 for row in range(height):
  solid=[column for column in range(width) if pixels[column,row]>options.alpha_threshold]
  if not solid:continue
  solid_count+=len(solid);left=solid[0];right=solid[-1]+1
  points.extend([(left,row),(right,row),(left,row+1),(right,row+1)])
 if not points:raise SystemExit(f'No opaque pixels: {selection}')
 exact=convex_hull(points);hull=densify(exact);px,pz=frame['centerPivot'];body=frame.get('bodyHeight',bank['bodyHeight'])
 normalized=[[round((hx-px)/body,8),round((pz-hy)/body,8)] for hx,hy in hull]
 record={'poseKey':key,'image':bank['image'],'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rect':frame['rect'],'centerPivot':frame['centerPivot'],'bodyHeight':body,'solidPixelCount':solid_count,'exactSupportVertexCount':len(exact),'pointCount':len(normalized),'points':normalized}
 export['poses'].setdefault(character,{})[key]=record
 print(f'{selection}: {len(exact)} exact support vertices; {len(normalized)} exported points; {solid_count} opaque pixels')
options.output.write_text(json.dumps(export,indent=2)+'\n')
