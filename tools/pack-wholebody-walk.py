"""Pack reviewed complete walking renders without rescaling individual poses.

Each character entry needs sourceBodyHeight, renderBodyHeight, cycleDistanceSourcePixels,
and frames with image/pivot/phase. Cropping only changes coordinates, never anatomy.
The input may be one actor entry or {characters: {id: entry}}.
Run without --merge to prepare an isolated review bank before changing the game.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--output', type=Path)
parser.add_argument('--merge', action='store_true')
args = parser.parse_args()
source_path = args.input / 'manifest.json' if args.input.is_dir() else args.input
source = json.loads(source_path.read_text())
entries = source.get('characters') or {source['actor']: source}
out = args.output or (ROOT / 'public/assets/sprites' if args.merge else source_path.parent / 'packed')
out.mkdir(parents=True, exist_ok=True)
walks = {}

for actor, entry in entries.items():
    source_height = float(entry['sourceBodyHeight'])
    render_height = float(entry.get('renderBodyHeight', entry.get('bodyHeight')))
    cycle = float(entry.get('cycleDistanceSourcePixels', entry.get('cycleDistanceSourceUnits'))) / source_height * 128
    if source_height <= 0 or render_height <= 0 or cycle <= 0:
        raise ValueError(f'{actor}: invalid standing reference or walking distance')
    if len(entry['frames']) < 8:
        raise ValueError(f'{actor}: an alternating walking cycle requires at least eight reviewed frames')
    images = [Image.open(source_path.parent / f['image']).convert('RGBA') for f in entry['frames']]
    boxes = [image.getchannel('A').getbbox() for image in images]
    if any(box is None for box in boxes):
        raise ValueError(f'{actor}: empty rendered frame')
    sizes = [(box[2] - box[0], box[3] - box[1]) for box in boxes]
    sheet = Image.new('RGBA', (sum(w for w, h in sizes), max(h for w, h in sizes)))
    frames = []
    cursor = 0
    for image, frame, box, (w, h) in zip(images, entry['frames'], boxes, sizes):
        sheet.alpha_composite(image.crop(box), (cursor, 0))
        pivot = frame.get('pivot', entry.get('pivot'))
        if pivot is None:
            raise ValueError(f'{actor}: a fixed authored root/ground pivot is required')
        center = frame.get('centerPivot', [pivot[0], pivot[1] - render_height / 2])
        packed = {'phase': frame['phase'], 'rect': [cursor, 0, w, h],
                  'pivot': [pivot[0] - box[0], pivot[1] - box[1]],
                  'centerPivot': [center[0] - box[0], center[1] - box[1]]}
        if 'sourceCellIndex' in frame:
            packed['sourceCellIndex'] = frame['sourceCellIndex']
        if 'feet' in frame:
            packed['feet'] = json.loads(json.dumps(frame['feet']))
            for foot in packed['feet'].values():
                if 'pixel' in foot:
                    foot['pixel'] = [foot['pixel'][0] - box[0], foot['pixel'][1] - box[1]]
        frames.append(packed)
        cursor += w
    path = out / f'{actor}-walk.webp'
    sheet.save(path, 'WEBP', lossless=True, exact=True)
    walks[actor] = {'mode': 'wholeBody', 'image': f'/assets/sprites/{path.name}',
                   'imageVersion': hashlib.sha256(path.read_bytes()).hexdigest()[:16],
                   'width': sheet.width, 'height': sheet.height, 'bodyHeight': render_height,
                   'canonicalBodyHeight': entry.get('canonicalComparison', {}).get('bodyHeight', entry.get('canonicalBodyHeight', source_height)),
                   'sourceBodyHeight': source_height, 'sourceToRenderScale': render_height / source_height,
                   'cycleDistance': cycle,
                   'frames': frames, 'sampleRate': entry.get('sampleRate', source.get('sampleRate', 24)),
                   'source': entry.get('description', entry.get('source', 'Reviewed complete walking frames')),
                   'sourceScene': ('tools/' + Path(entry['sourceScene']).name) if entry.get('sourceScene') else None}
    for key in ['sourceSHA256', 'sourceJob', 'sourceIndices', 'frameOrder']:
        if key in entry:
            walks[actor][key] = entry[key]
    if 'cadenceCalibration' in entry:
        walks[actor]['cadenceCalibration'] = entry['cadenceCalibration']
    print(f'{actor}: {len(frames)} complete frames, one reference {render_height:.3f}, cycle {cycle:.3f}')

(out / 'walk-fields.json').write_text(json.dumps(walks, separators=(',', ':')))
if args.merge:
    if out.resolve() != (ROOT / 'public/assets/sprites').resolve():
        raise ValueError('--merge requires the public sprite output directory')
    path = ROOT / 'public/assets/sprites/manifest.json'
    manifest = json.loads(path.read_text())
    for actor, walk in walks.items():
        manifest[actor]['walk'] = walk
    temporary = path.with_suffix('.wholebody-tmp.json')
    temporary.write_text(json.dumps(manifest, separators=(',', ':')))
    os.replace(temporary, path)
