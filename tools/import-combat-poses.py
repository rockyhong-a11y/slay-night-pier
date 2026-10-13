#!/usr/bin/env python3
"""Merge reviewed Higgsfield sheets and original whole-body art into combat atlases.
Higgsfield: python3 tools/import-combat-poses.py nova --sheet /path.png --keys windup,jab,cross,lowKick,roundhouse,strikeRecovery --cols 3 --rows 2 --key green --job ID --source-url URL
No arguments: compact all existing banks to 384 cells, preserving approved raster poses.
"""
from pathlib import Path
from PIL import Image,ImageChops,ImageFilter
from collections import deque
import argparse,json,math
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/sprites';MANIFEST=OUT/'manifest.json'
CELL=384;BODY=270.;FOOT=[165,346.5];CENTER=[165,211.5]
parser=argparse.ArgumentParser();parser.add_argument('character',nargs='?');parser.add_argument('--sheet');parser.add_argument('--keys');parser.add_argument('--cols',type=int,default=3);parser.add_argument('--rows',type=int,default=2);parser.add_argument('--key',choices=['green','magenta'],default='green');parser.add_argument('--job');parser.add_argument('--source-url');parser.add_argument('--blender-dir')
opt=parser.parse_args();manifest=json.loads(MANIFEST.read_text())

def key_image(image,key):
 image=image.convert('RGBA');data=[]
 for r,g,b,a in image.getdata():
  channels=[r,g,b]
  if key=='green':excess=max(0,g-max(r,b));background=(0,255,0)
  else:excess=max(0,min(r,b)-g);background=(255,0,255)
  alpha=max(0.,min(1.,1-excess/255))
  if excess>70 and alpha<.14:alpha=0
  if alpha<.02:data.append((0,0,0,0));continue
  rgb=[round(max(0,min(255,(c-bg*(1-alpha))/alpha))) for c,bg in zip(channels,background)]
  if alpha<.98:
   if key=='green':rgb[1]=min(rgb[1],max(rgb[0],rgb[2]))
   else:rgb[0]=min(rgb[0],max(rgb[1],rgb[0]-excess));rgb[2]=min(rgb[2],max(rgb[1],rgb[2]-excess))
  data.append((*rgb,round(alpha*255)))
 image.putdata(data);return image

def existing_bank(character):
 bank={};entry=manifest[character].get('combat')
 if not entry:return bank
 image=Image.open(ROOT/'public'/entry['image'].lstrip('/')).convert('RGBA')
 for key,pose in entry['poses'].items():
  if pose.get('alias') or pose.get('source')=='Blender original cutout rig':continue
  x,y,w,h=pose['rect'];cell=image.crop((x,y,x+w,y+h)).resize((CELL,CELL),Image.Resampling.LANCZOS)
  bank[key]=(cell,{k:v for k,v in pose.items() if k not in ['rect','pivot','centerPivot']})
 return bank

def silhouettes(image,cols,rows):
 # Generated subjects occasionally cross the nominal cell borders. Separate
 # the actual connected silhouettes before cropping, so neighboring feet and
 # faint green grid/compression fragments cannot become animation pixels.
 alpha=image.getchannel('A');pixels=alpha.tobytes();width,height=image.size
 seen=bytearray(width*height);components=[]
 for seed,value in enumerate(pixels):
  if value<50 or seen[seed]:continue
  queue=deque([seed]);seen[seed]=1;component=[];sx=sy=0
  while queue:
   index=queue.popleft();component.append(index);x=index%width;y=index//width;sx+=x;sy+=y
   for neighbor in (index-1 if x else -1,index+1 if x+1<width else -1,index-width if y else -1,index+width if y+1<height else -1):
    if neighbor>=0 and not seen[neighbor] and pixels[neighbor]>=50:seen[neighbor]=1;queue.append(neighbor)
  if len(component)>1500:components.append((component,sx/len(component),sy/len(component)))
 if len(components)<cols*rows:raise SystemExit(f'Expected {cols*rows} connected figures; found {len(components)}. Inspect source grid.')
 result=[];available=list(components)
 for row in range(rows):
  for col in range(cols):
   cx=(col+.5)*width/cols;cy=(row+.5)*height/rows
   selected=min(available,key=lambda c:(c[1]-cx)**2+(c[2]-cy)**2);available.remove(selected)
   mask=Image.new('L',image.size);data=bytearray(width*height)
   for index in selected[0]:data[index]=255
   mask.frombytes(bytes(data));mask=mask.filter(ImageFilter.MaxFilter(5))
   isolated=image.copy();isolated.putalpha(ImageChops.multiply(alpha,mask));bbox=isolated.getbbox()
   result.append(isolated.crop(bbox))
 return result

def save(character,bank):
 # Atlas's generated parry cell includes an extraneous opponent arm; omit it.
 if (character=='atlas' and bank.get('parry',(None,{}))[1].get('job')=='68fbb266-7d46-4670-91a5-24b1b3a59623') or (character=='nova' and bank.get('parry',(None,{}))[1].get('job')=='e3bb4808-e001-4ede-835d-a3f2fd9a5991'):bank.pop('parry')
 # Only reviewed generated poses and original whole-body art are runtime assets.
 original=Image.open(ROOT/'public'/manifest[character]['image'].lstrip('/')).convert('RGBA')
 for key,index in [('windup',0),('hurt',2)]:
  if key in bank:continue
  frame=manifest[character]['frames'][index];x,y,w,h=[frame[n] for n in ['x','y','width','height']];drawing=original.crop((x,y,x+w,y+h));ratio=BODY/h;drawing=drawing.resize((round(w*ratio),round(h*ratio)),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(CELL,CELL));canvas.alpha_composite(drawing,(round(FOOT[0]-drawing.width/2),round(FOOT[1]-drawing.height)));bank[key]=(canvas,{'source':'Original SD whole-body pose','originalPose':index})
 if 'back' not in bank:
  bank['back']=(bank['hurt'][0],{'source':'Original SD whole-body pose','originalPose':2,'temporaryRearFallback':True})
 keys=list(bank);cols=3 if len(keys)<=6 else 5;rows=math.ceil(len(keys)/cols);sheet=Image.new('RGBA',(CELL*cols,CELL*rows),(0,0,0,0));poses={}
 for index,key in enumerate(keys):
  image,meta=bank[key];x=index%cols*CELL;y=index//cols*CELL;sheet.alpha_composite(image,(x,y));poses[key]={'rect':[x,y,CELL,CELL],'pivot':FOOT,'centerPivot':CENTER,**meta}
 # Semantic aliases are explicit, so the runtime never needs numeric art guessing.
 for alias,target in {'idle':'windup','charge':'windup','launcher':'cross','strikeRecovery':'windup','recover':'strikeRecovery','guard':'windup','clinch':'windup','underhook':'clinch','overhead':'underhook','throwArc':'recover','slam':'hurt','parry':'hipTurn' if character in ['atlas','nova'] else 'cross','wristCatch':'jab','hipTurn':'clinch','armLock':'wristCatch','roundhouse':'lowKick','rearFacing':'back','rear':'back','chargeStrike':'launcher','counter':'hipTurn','lift':'overhead','lock':'armLock'}.items():
  if target in poses and alias not in poses:poses[alias]={**poses[target],'alias':target}
 sheet.save(OUT/f'{character}-combat.webp','WEBP',lossless=True,exact=True)
 manifest[character]['combat']={'image':f'/assets/sprites/{character}-combat.webp','width':sheet.width,'height':sheet.height,'bodyHeight':BODY,'pivot':FOOT,'centerPivot':CENTER,'poses':poses}
 MANIFEST.write_text(json.dumps(manifest,separators=(',',':')))
 print(character,'combat bank:',len(keys),'authored poses +',len(poses)-len(keys),'aliases')

if opt.blender_dir:
 raise SystemExit('Articulated cutout renders are authoring evidence only; use reviewed generated sheets or original whole-body drawings in runtime banks.')
elif not opt.sheet and not opt.character:
 for character in manifest:save(character,existing_bank(character))
else:
 if not opt.character or not opt.sheet or not opt.keys:parser.error('character, --sheet and --keys are required')
 character=opt.character;keys=opt.keys.split(',');image=key_image(Image.open(opt.sheet),opt.key)
 if len(keys)!=opt.cols*opt.rows:parser.error('The key count must exactly match rows × columns')
 cells=silhouettes(image,opt.cols,opt.rows)
 bbox=cells[0].getchannel('A').point(lambda a:255 if a>30 else 0).getbbox()
 if not bbox:raise SystemExit('First source pose has no visible pixels')
 reference_height=bbox[3]-bbox[1];ratio=BODY/reference_height;bank=existing_bank(character)
 for key,cell in zip(keys,cells):
  if key.startswith('_'):continue
  resized=cell.resize((round(cell.width*ratio),round(cell.height*ratio)),Image.Resampling.LANCZOS)
  canvas=Image.new('RGBA',(CELL,CELL));canvas.alpha_composite(resized,(round(FOOT[0]-resized.width*.5),round(FOOT[1]-resized.height)))
  bank[key]=(canvas,{'source':'Higgsfield','job':opt.job,'url':opt.source_url,'keyColor':opt.key,'alignment':'isolated silhouette, shared scale, individual ground'})
 save(character,bank)
