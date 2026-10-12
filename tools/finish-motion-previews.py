#!/usr/bin/env python3
"""Create compact contact sheets from actual Blender render stills."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]/'public/assets/motion'
for name in ['powerbomb','suplex']:
    sheet=Image.new('RGB',(1440,696),(17,23,34))
    labels=['GRIP','LIFT','APEX','DESCENT','IMPACT','RECOVERY']
    draw=ImageDraw.Draw(sheet)
    for i in range(6):
        source=root/f'{name}-preview-{i}.png'
        image=Image.open(source).convert('RGBA')
        x,y=(i%3)*480,(i//3)*348
        sheet.paste(image,(x,y),image)
        draw.text((x+16,y+324),labels[i],fill=(217,222,238))
    sheet.save(root/f'{name}-preview.webp','WEBP',quality=90)
    for i in range(6):(root/f'{name}-preview-{i}.png').unlink()
print('Saved Blender contact sheets.')
