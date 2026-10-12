#!/usr/bin/env python3
"""Turn the game's authored Higgsfield strips into transparent, aligned sprites.
Usage: python3 tools/prepare-higgsfield.py atlas /path/to/atlas-sheet.png
       python3 tools/prepare-higgsfield.py nova /path/to/nova-sheet.png
Original generated sheets are documented by job and URL in ASSET_SOURCES.md.
"""
from pathlib import Path
from PIL import Image
import json, sys
ROOT = Path(__file__).resolve().parents[1]
character, source = sys.argv[1], Path(sys.argv[2])
im = Image.open(source).convert('RGBA')
# Exact green key, a continuous edge matte and removal of green contamination.
# Original characters have no green costumes or hair. Do not run on Viper.
background_green = im.getpixel((0,0))[1]
data = []
for r,g,b,a in im.getdata():
    green_excess = max(0, g-max(r,b))
    alpha = max(0.,min(1., 1-green_excess/max(1,background_green)))
    if g > max(r,b)+60 and alpha < .13: alpha=0
    if alpha < .02:
        data.append((0,0,0,0));continue
    # Unmix the chroma backdrop; suppress remaining chroma spill on soft edges.
    rr=round(min(255,r/alpha));bb=round(min(255,b/alpha))
    gg=round(max(0,min(255,(g-background_green*(1-alpha))/alpha)))
    if alpha < .98:gg=min(gg,max(rr,bb))
    data.append((rr,gg,bb,round(255*alpha)))
im.putdata(data)
size=320
strip=Image.new('RGBA',(size*4,size),(0,0,0,0))
frames=[]
for i in range(4):
    cell=im.crop((round(i*im.width/4),0,round((i+1)*im.width/4),im.height))
    # Keep authored cells so crouching and overhead gestures retain their size.
    ratio=min((size-8)/cell.width,(size-8)/cell.height)
    cell=cell.resize((round(cell.width*ratio),round(cell.height*ratio)),Image.Resampling.LANCZOS)
    strip.alpha_composite(cell,(i*size+(size-cell.width)//2,size-cell.height-4))
    frames.append({'x':i*size,'y':0,'width':size,'height':size,'pose':i+3,'pivot':[160,316],'centerPivot':[160,168.5]})
out=ROOT/f'public/assets/sprites/{character}-grapple.webp'
strip.save(out,'WEBP',lossless=True)
manifest_path=ROOT/'public/assets/sprites/manifest.json'
m=json.loads(manifest_path.read_text());m[character]['grappleImage']=f'/assets/sprites/{character}-grapple.webp';m[character]['grappleFrames']=frames
m[character]['grappleBodyHeight']=295
m[character]['grappleSource']='Higgsfield nano_banana_2_1';manifest_path.write_text(json.dumps(m,separators=(',',':')))
print(f'Prepared {character}: four transparent 320×320 grappling poses, sprite indices 3–6.')
