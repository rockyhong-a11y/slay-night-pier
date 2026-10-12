#!/usr/bin/env python3
"""Normalize the user's ten original SD fighters without repainting their art.
Requires Pillow. Usage: python3 tools/prepare-sprites.py /path/to/slay-beach-volley
"""
from pathlib import Path
from PIL import Image
import hashlib, json, sys
if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 tools/prepare-sprites.py /path/to/slay-beach-volley')
SOURCE = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
base = json.loads((SOURCE/'src/sprites.json').read_text())
clips = json.loads((SOURCE/'assets/animation/manifest.json').read_text())
manifest = {}
for character, entry in base.items():
    sprite = Image.open(SOURCE/f'assets/sprites/{character}.webp').convert('RGBA')
    sprite.save(OUT/f'sprites/{character}.webp', 'WEBP', lossless=True)
    portrait = Image.open(SOURCE/f'assets/portraits/{character}.webp')
    portrait.save(OUT/f'portraits/{character}.webp', 'WEBP', lossless=True)
    scale_x, scale_y = sprite.width/entry['width'], sprite.height/entry['height']
    frames = []
    for frame in entry['frames']:
        # Preserve the original whole-body artwork and authored pose boundaries.
        frames.append({'x': round(frame['x']*scale_x), 'y': round(frame['y']*scale_y),
                       'width': round(frame['width']*scale_x), 'height': round(frame['height']*scale_y)})
    run = clips['characters'][character]['clips']['run']
    atlas = Image.open(SOURCE/'assets/animation'/run['image'].removeprefix('./')).convert('RGBA')
    authored = run['views']['right']
    # Canvas-sized run cells preserve ground pivot and relative authored height.
    size, ground, body_height = 256, 242, 216
    sheet = Image.new('RGBA', (size * len(authored), size), (0,0,0,0))
    run_frames = []
    for index, frame in enumerate(authored):
        x,y,w,h = frame['rect']; pose = atlas.crop((x,y,x+w,y+h))
        ratio = body_height/frame.get('bodyHeight',run['bodyHeight'])
        pose = pose.resize((round(w*ratio),round(h*ratio)),Image.Resampling.LANCZOS)
        px, py = frame['pivot']
        draw_x = round(index*size + size/2 - px*ratio)
        draw_y = round(ground-py*ratio)
        sheet.alpha_composite(pose,(draw_x,draw_y))
        run_frames.append({'x':index*size,'y':0,'width':size,'height':size,'pivot':[128,242]})
    sheet.save(OUT/f'sprites/{character}-run.webp','WEBP',lossless=True)
    manifest[character] = {'width':sprite.width,'height':sprite.height,'frames':frames,
                           'image':f'/assets/sprites/{character}.webp',
                           'runImage':f'/assets/sprites/{character}-run.webp','runFrames':run_frames,
                           'runBodyHeight':body_height,'runFps':10,
                           'source':'rockyhong-a11y/slay',
                           'sourceSha256': hashlib.sha256((SOURCE/f'assets/sprites/{character}.webp').read_bytes()).hexdigest()}
(OUT/'sprites/manifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
print(f'Prepared {len(manifest)} original SD fighters, portraits and six-frame run animations.')
