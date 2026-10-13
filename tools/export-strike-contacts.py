"""Measure actual fist/boot contact pixels without changing sprite pixels.

python3 tools/export-strike-contacts.py
python3 tools/export-strike-contacts.py --grid artifacts/strike-contacts/contact-grid.png
Coordinates use each crop's centerPivot and authored bodyHeight, with z pointing up.
"""
from pathlib import Path
import argparse
import hashlib
import json
from statistics import mean
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BANDS = {
    'jab': (.45, .70), 'cross': (.45, .70), 'lowKick': (.20, .65),
    'roundhouse': (.45, .72), 'launcher': (.45, .72),
}


def contact(tile, frame, body_height, band):
    """Rightmost opaque attack silhouette, inside its expected floor-height band."""
    floor_y = frame['pivot'][1]
    y_min = max(0, int(floor_y - band[1] * body_height))
    y_max = min(tile.height - 1, int(floor_y - band[0] * body_height))
    alpha = tile.getchannel('A')
    points = [(x, y) for y in range(y_min, y_max + 1)
              for x in range(tile.width) if alpha.getpixel((x, y)) > 180]
    if not points:
        raise ValueError('No solid pixels in the attack contact band')
    x_tip = max(x for x, _ in points)
    edge = [(x, y) for x, y in points if x >= x_tip - 2]
    # The last three solid columns describe the visible striking face. Their
    # centroid is more stable than a single outermost antialias/noise pixel.
    pixel = [round(mean(x for x, _ in edge), 7), round(mean(y for _, y in edge), 7)]
    center = frame['centerPivot']
    return pixel, [round((pixel[0] - center[0]) / body_height, 7),
                   round((center[1] - pixel[1]) / body_height, 7)], [y_min, y_max]


def export(manifest_path, output_path, grid_path=None):
    manifest = json.loads(manifest_path.read_text())
    result = {'version': 1, 'unit': 'authoredBodyHeight', 'pivot': 'bodyCenter',
              'zAxis': 'up', 'alphaThreshold': 180,
              'method': 'Reviewed forwardmost opaque limb cluster (last three columns) inside pose-specific floor-height band; aliases inherit actual source pose band.',
              'actors': {}}
    preview = []
    for actor_id, metadata in manifest.items():
        bank = metadata['combat']
        image_path = ROOT / 'public' / bank['image'].lstrip('/')
        image = Image.open(image_path).convert('RGBA')
        actor = {'image': bank['image'], 'sourceSHA256': hashlib.sha256(image_path.read_bytes()).hexdigest(),
                 'imageVersion': bank.get('imageVersion'), 'poses': {}}
        for pose in BANDS:
            frame = bank['poses'][pose]
            canonical = frame.get('alias', pose)
            seen = {pose}
            while canonical in bank['poses'] and canonical not in seen and bank['poses'][canonical].get('alias'):
                seen.add(canonical)
                canonical = bank['poses'][canonical]['alias']
            band = BANDS.get(canonical, BANDS[pose])
            x, y, w, h = frame['rect']
            tile = image.crop((x, y, x + w, y + h))
            body_height = frame.get('bodyHeight', bank['bodyHeight'])
            pixel, point, rows = contact(tile, frame, body_height, band)
            actor['poses'][pose] = {
                'x': point[0], 'z': point[1], 'pixel': pixel,
                'rect': frame['rect'], 'centerPivot': frame['centerPivot'],
                'bodyHeight': body_height, 'sourcePose': canonical,
                'limb': 'boot' if canonical in ('lowKick', 'roundhouse') else 'fist',
                'floorHeightBand': list(band), 'bandRows': rows,
            }
            preview.append((actor_id, pose, tile, pixel, rows))
        result['actors'][actor_id] = actor
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    if grid_path:
        cell_w, cell_h = 300, 326
        grid = Image.new('RGB', (cell_w * len(BANDS), cell_h * len(manifest)), '#15202b')
        draw = ImageDraw.Draw(grid)
        for index, (actor_id, pose, tile, pixel, rows) in enumerate(preview):
            gx, gy = (index % len(BANDS)) * cell_w, (index // len(BANDS)) * cell_h
            ox, oy = gx + (cell_w - tile.width) // 2, gy + 26
            grid.paste(tile, (ox, oy), tile)
            draw.text((gx + 8, gy + 7), f'{actor_id} / {pose}', fill='#ffffff')
            for row in rows:
                draw.line((ox, oy + row, ox + tile.width, oy + row), fill='#395864', width=1)
            px, py = ox + pixel[0], oy + pixel[1]
            draw.ellipse((px - 5, py - 5, px + 5, py + 5), outline='#00ffff', width=2)
            draw.line((px - 8, py, px + 8, py), fill='#00ffff', width=1)
            draw.line((px, py - 8, px, py + 8), fill='#00ffff', width=1)
        grid_path.parent.mkdir(parents=True, exist_ok=True)
        grid.save(grid_path)
    for actor_id in ('atlas', 'nova'):
        print(actor_id, {pose: [data['x'], data['z']] for pose, data in result['actors'][actor_id]['poses'].items()})
    print(f'Wrote {len(result["actors"]) * len(BANDS)} raster contacts to {output_path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT / 'public/assets/sprites/manifest.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/assets/motion/strike-contacts.json')
    parser.add_argument('--grid', type=Path)
    args = parser.parse_args()
    export(args.manifest, args.output, args.grid)
