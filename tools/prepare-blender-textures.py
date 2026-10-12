#!/usr/bin/env python3
"""Prepare original + Higgsfield pose textures for the packed Blender source."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
out=root/'tools/blender-textures';out.mkdir(exist_ok=True)
manifest=json.loads((root/'public/assets/sprites/manifest.json').read_text())
for character in ['atlas','nova','viper','raven']:
    entry=manifest[character]
    for image_name,frames,start in [(entry['image'],entry['frames'],0),(entry.get('grappleImage'),entry.get('grappleFrames',[]),3)]:
        if not image_name:continue
        image=Image.open(root/'public'/image_name.lstrip('/')).convert('RGBA')
        for index,frame in enumerate(frames):
            x,y,w,h=(frame[n] for n in ['x','y','width','height'])
            image.crop((x,y,x+w,y+h)).save(out/f'{character}-{index+start}.png')
print('Prepared packed original and Higgsfield SD texture poses.')
