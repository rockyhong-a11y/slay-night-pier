"""Extract nine complete walking sheets to private review banks.

Run with Python/Pillow/numpy; no Blender or public import occurs here. Actual
8-connected alpha silhouettes, rather than nominal grid bounds, identify bodies.
Pixels are never resized or warped. One provisional anatomy calibration is used
per character; crop/root translations do not normalize each pose's dimensions.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import statistics
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IDS = ['nova', 'viper', 'tempest', 'raven', 'seraph', 'ember', 'valkyrie', 'lynx', 'onyx']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=ROOT / 'tools/walk-source/sheets')
parser.add_argument('--output', type=Path, default=Path('/private/tmp/slay-wholebody-sheets'))
parser.add_argument('--actors', default=','.join(IDS))
parser.add_argument('--calibration', type=Path, help='Optional JSON {id: {rawBodyHeight: number}}; one global reference per character')
parser.add_argument('--sources', type=Path, help='Optional JSON {id: sheetPath}; relative paths resolve against the repository')
parser.add_argument('--reference-metrics', type=Path, default=ROOT / 'tools/walk-source/reference-metrics.json')
parser.add_argument('--provenance', type=Path, default=ROOT / 'tools/walk-source/provenance.json')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
actors = args.actors.split(',')
if any(actor not in IDS for actor in actors):
    raise ValueError('This extractor owns only the nine generated walk sheets; Atlas is separate')
overrides = json.loads(args.calibration.read_text()) if args.calibration else {}
source_overrides = json.loads(args.sources.read_text()) if args.sources else {}
previous_path = args.output / 'manifest.json'
previous_entries = json.loads(previous_path.read_text()).get('characters', {}) if previous_path.exists() else {}
combat = json.loads((ROOT / 'public/assets/sprites/manifest.json').read_text())
audit = json.loads(args.reference_metrics.read_text())
provenance = json.loads(args.provenance.read_text()) if args.provenance.exists() else {}


def connected_components(mask):
    """Run-length union-find labels an8-connected mask without scipy."""
    parent, runs, previous = [], [], []

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for y, row in enumerate(mask):
        edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
        current, cursor = [], 0
        for start, end in zip(starts.tolist(), ends.tolist()):
            node = len(parent)
            parent.append(node)
            while cursor < len(previous) and previous[cursor][1] < start:
                cursor += 1
            j = cursor
            while j < len(previous) and previous[j][0] <= end:
                old = find(previous[j][2])
                fresh = find(node)
                if old != fresh:
                    parent[fresh] = old
                j += 1
            runs.append((y, start, end, node))
            current.append((start, end, node))
        previous = current
    labels = np.zeros(mask.shape, dtype=np.int32)
    components = {}
    for y, start, end, node in runs:
        key = find(node) + 1
        labels[y, start:end] = key
        if key not in components:
            components[key] = {'label': key, 'area': 0, 'bbox': [start, y, end, y + 1]}
        component = components[key]
        component['area'] += end - start
        box = component['bbox']
        box[0] = min(box[0], start); box[1] = min(box[1], y)
        box[2] = max(box[2], end); box[3] = max(box[3], y + 1)
    return labels, sorted(components.values(), key=lambda component: component['area'], reverse=True)


def crop_pose(bank, pose):
    frame = bank['poses'][pose]
    source = Image.open(ROOT / 'public' / bank['image'].lstrip('/')).convert('RGBA')
    x, y, w, h = frame['rect']
    return source.crop((x, y, x + w, y + h)), frame


def bounds(mask):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        raise ValueError('An anatomy measurement band is empty')
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def crown_measure(mask, raw_scale, source_depth):
    box = bounds(mask)
    limit = min(mask.shape[0], round(box[1] + source_depth * raw_scale))
    head = mask[box[1]:limit]
    hb = bounds(head)
    return {'width': hb[2] - hb[0], 'depth': limit - box[1],
            'center': (hb[0] + hb[2]) / 2, 'top': box[1], 'bottom': limit}


def provisional_calibration(id, masks, bank):
    idle, frame = crop_pose(bank, 'idle')
    canonical_mask = np.asarray(idle.getchannel('A')) > 180
    box = bounds(canonical_mask)
    canonical_cut = frame['pivot'][1] - audit['headCrownBandFloorHeightRange'][0] * bank['bodyHeight']
    canonical_depth = canonical_cut - box[1]
    canonical_width = audit['actors'][id]['headCrownBand']['idle']['spanAt270']
    scales = []
    for mask in masks:
        box = bounds(mask)
        raw_scale = (box[2] - box[0]) / canonical_width
        for _ in range(8):
            measured = crown_measure(mask, raw_scale, canonical_depth)
            new_scale = measured['width'] / canonical_width
            if abs(raw_scale - new_scale) < .0001:
                break
            raw_scale = new_scale
        scales.append(raw_scale)
    raw_scale = statistics.median(scales)
    kind = 'provisional crown-band width match; no standing-height normalization'
    if id == 'nova' and id not in source_overrides:
        raw_scale = 1 / .67
        kind = 'provisional independent head least-squares scale0.67; anatomy revision remains recommended'
    if id in overrides:
        raw_scale = float(overrides[id]['rawBodyHeight']) / bank['bodyHeight']
        kind = 'one explicit per-character raw-reference override; still needs visual review'
    if not math.isfinite(raw_scale) or raw_scale <= 0:
        raise ValueError(f'{id}: invalid anatomy calibration')
    measures = [crown_measure(mask, raw_scale, canonical_depth) for mask in masks]
    return bank['bodyHeight'] * raw_scale, {
        'status': 'PROVISIONAL_NEEDS_MANUAL_VISUAL_REVIEW', 'kind': kind,
        'canonicalBodyHeight': bank['bodyHeight'], 'uniformScaleToCanonical': 1 / raw_scale,
        'canonicalCrownWidth': canonical_width, 'canonicalCrownDepth': canonical_depth,
        'candidateCrownWidthsRaw': [measure['width'] for measure in measures],
        'candidateCrownWidthsAt128': [measure['width'] / raw_scale * 128 / bank['bodyHeight'] for measure in measures],
        'canonicalCrownWidthAt128': canonical_width * 128 / bank['bodyHeight'],
        'overrideProvenance': overrides.get(id),
        'limitation': 'Hair, camera yaw, and pose guard changes can affect contour measurements. This is an initial whole-character calibration, not anatomical acceptance. No individual pose, head, torso or leg rescaling is permitted.',
    }


def root_x(image, mask, raw_height, ground):
    rgba = np.asarray(image)
    rgb = rgba[:, :, :3].astype(np.float32)
    skin = mask & (rgb[:, :, 0] > 105) & (rgb[:, :, 0] > rgb[:, :, 1] * 1.12) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.12)
    y0 = max(0, round(ground - raw_height * .48))
    y1 = min(mask.shape[0], round(ground - raw_height * .34))
    points = np.nonzero(skin[y0:y1])[1]
    if len(points) < 12:
        points = np.nonzero(mask[y0:y1])[1]
    if len(points) < 12:
        points = np.nonzero(mask)[1]
    return float(np.median(points))


def review_tile(image, height, pivot, label):
    tile = Image.new('RGB', (256, 200), '#16202b')
    scale = 128 / height
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    tile.paste(resized, (round(128 - pivot[0] * scale), round(180 - pivot[1] * scale)), resized)
    ImageDraw.Draw(tile).text((8, 8), label, fill='#eeeade')
    return tile


manifest = {'version': 1, 'sampleRate': 12, 'characters': {},
            'status': 'PRIVATE_PREVIEW_FOR_VISUAL_REVIEW',
            'method': 'Whole connected body components; original RGBA pixels; one provisional per-character body reference; no per-frame dimension normalization or UV/body-part warp.'}
review_rows = []
for id in actors:
    sheet_path = Path(source_overrides[id]) if id in source_overrides else args.input / f'{id}-walk-sheet.png'
    if not sheet_path.is_absolute():
        sheet_path = ROOT / sheet_path
    sheet = Image.open(sheet_path).convert('RGBA')
    rgba = np.asarray(sheet)
    labels, components = connected_components(rgba[:, :, 3] >= 160)
    bodies = components[:12]
    if len(bodies) != 12 or min(body['area'] for body in bodies) < max(body['area'] for body in bodies) * .30:
        raise ValueError(f'{id}: twelve unambiguous complete bodies required; largest areas {[c["area"] for c in components[:16]]}')
    ordered = sorted(bodies, key=lambda body: (body['bbox'][1] + body['bbox'][3]) / 2)
    bodies = [body for row in range(3) for body in sorted(ordered[row * 4:row * 4 + 4], key=lambda item: item['bbox'][0])]
    frame_order = overrides.get(id, {}).get('frameOrder', list(range(12)))
    if (not isinstance(frame_order, list) or len(frame_order) != 12
            or any(not isinstance(index, int) or isinstance(index, bool) for index in frame_order)
            or sorted(frame_order) != list(range(12))):
        raise ValueError(f'{id}: frameOrder must be a permutation of the twelve source cells')
    bodies = [bodies[source_index] for source_index in frame_order]
    masks, cutouts, records = [], [], []
    for index, body in enumerate(bodies):
        x0, y0, x1, y1 = body['bbox']; pad = 6
        box = [max(0, x0 - pad), max(0, y0 - pad), min(sheet.width, x1 + pad), min(sheet.height, y1 + pad)]
        local_labels = labels[box[1]:box[3], box[0]:box[2]]
        core = local_labels == body['label']
        ownership = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
        # Mask only this whole component and its antialiased edge. Never include
        # a neighboring body's boot/hair, even when it crosses a nominal cell.
        ownership &= (local_labels == 0) | (local_labels == body['label'])
        pixel = np.array(sheet.crop(box))
        pixel[~ownership, 3] = 0
        cutout = Image.fromarray(pixel, 'RGBA')
        mask = np.asarray(cutout.getchannel('A')) > 180
        cutouts.append(cutout); masks.append(mask)
        records.append({'index': index, 'phase': index / 12, 'sourceCellIndex': frame_order[index], 'sourceBounds': box,
                        'opaqueComponentBounds': body['bbox'], 'componentArea': body['area'],
                        'sourceComponentLabel': body['label'], 'coreBounds': bounds(mask)})
    bank = combat[id]['combat']
    raw_height, calibration = provisional_calibration(id, masks, bank)
    grounds = [bounds(mask)[3] - 1 + 3.5 * raw_height / bank['bodyHeight'] for mask in masks]
    roots = [root_x(image, mask, raw_height, ground) for image, mask, ground in zip(cutouts, masks, grounds)]
    size = math.ceil(max(max(image.width for image in cutouts) + 32,
                         max(ground for ground in grounds) + 32) / 16) * 16
    target_root = [size / 2, size - 16]
    previous = previous_entries.get(id, {})
    source_hash = hashlib.sha256(sheet_path.read_bytes()).hexdigest()
    reuse = (previous.get('sourceSHA256') == source_hash
             and previous.get('frameOrder', list(range(12))) == frame_order
             and len(previous.get('frames', [])) == 12) and all(
        (args.output / frame['image']).exists() for frame in previous.get('frames', []))
    if reuse:
        size = previous['cellSize']; target_root = previous['pivot']
    frames, images = [], []
    for index, (cutout, source, ground, root) in enumerate(zip(cutouts, records, grounds, roots)):
        if reuse:
            frame = dict(previous['frames'][index])
            frame['centerPivot'] = [frame['pivot'][0], frame['pivot'][1] - raw_height / 2]
            frame['sourceCellIndex'] = source['sourceCellIndex']
            frames.append(frame)
            images.append(Image.open(args.output / frame['image']).convert('RGBA'))
            continue
        dx = round(target_root[0] - root); dy = round(target_root[1] - ground)
        if dx < 0 or dy < 0 or dx + cutout.width > size or dy + cutout.height > size:
            raise ValueError(f'{id}:{index}: root translation would clip complete body; increase uniform canvas padding')
        image = Image.new('RGBA', (size, size)); image.alpha_composite(cutout, (dx, dy))
        name = f'{id}-walk-{index:02}.png'; image.save(args.output / name)
        pivot = [root + dx, ground + dy]
        frames.append({'phase': index / 12, 'sourceCellIndex': source['sourceCellIndex'], 'image': name, 'pivot': pivot,
                       'centerPivot': [pivot[0], pivot[1] - raw_height / 2],
                       'sourceBounds': source['sourceBounds'], 'sourceComponentLabel': source['sourceComponentLabel'],
                       'wholeBodyTranslation': [dx, dy], 'feet': {},
                       'soleObservation': {'lowestOpaquePixel': bounds(np.asarray(image.getchannel('A')) > 180)[3] - 1,
                                           'informativeOnly': True, 'perfectDepthSoleLock': False}})
        images.append(image)
    entry = {'actor': id, 'source': 'Built-in image_gen identity transfer from original combat idle and actual Atlas chronological walk guide',
             'description': 'PRIVATE complete-body preview. Original pixels with connected-component matte isolation and whole-body translations; one provisional character anatomy calibration; no part warping or per-frame resizing.',
             'sourceSheet': str(sheet_path.resolve()), 'sourceSHA256': source_hash,
             'sourceProvenance': (provenance.get('characters', provenance.get('otherCharacters', provenance)).get(id)
                                  if isinstance(provenance, dict) else next((record for record in provenance if record.get('id') == id), None)),
             'provenanceSource': str(args.provenance.resolve()) if args.provenance.exists() else None,
             'referenceMetricsSource': str(args.reference_metrics.resolve()),
             'sourceBodyHeight': raw_height, 'bodyHeight': raw_height, 'renderBodyHeight': raw_height,
             'sourceToRenderScale': 1., 'canonicalBodyHeight': bank['bodyHeight'],
             'canonicalComparison': {'image': bank['image'], 'bodyHeight': bank['bodyHeight']},
             'cycleDistanceSourcePixels': 70 / 128 * raw_height,
             'cycleDistanceSourceUnits': 70 / 128 * raw_height,
             'cycleDistanceWorldAt128': 70., 'sampleRate': 12, 'cellSize': size,
             'frameOrder': frame_order,
             'frameOrderPolicy': 'A validated chronological permutation of complete source drawings; no image-content edits or missing/duplicated source cells.',
             'pixelGeometryReused': reuse,
             'alignmentPolicy': 'Unchanged source frames reuse exact PNGs and ground/root pivots when the single anatomy reference is revised; only body-reference metadata and comparison rendering change.',
             'cadenceCalibration': {'kind': 'provisional artistic visual cadence', 'cycleWorldDistanceAt128': 70,
                                    'worldSoleLock': False, 'stanceMeasuresInformationalOnly': True},
             'pivot': target_root, 'calibration': calibration, 'componentExtraction': records, 'frames': frames}
    manifest['characters'][id] = entry
    idle, idle_frame = crop_pose(bank, 'idle'); jab, jab_frame = crop_pose(bank, 'jab')
    tiles = [review_tile(idle, bank['bodyHeight'], idle_frame['pivot'], f'{id} canonical idle')]
    tiles += [review_tile(images[index], raw_height, frames[index]['pivot'], f'{id} walk{index}/12') for index in [0, 4, 8]]
    tiles.append(review_tile(jab, bank['bodyHeight'], jab_frame['pivot'], f'{id} canonical jab'))
    row = Image.new('RGB', (256 * 5, 200), '#16202b')
    for i, tile in enumerate(tiles): row.paste(tile, (256 * i, 0))
    row.save(args.output / f'{id}-idle-walk-jab-128.png'); review_rows.append(row)
    animation = [review_tile(image, raw_height, frame['pivot'], f'{id} provisional70world/cycle') for image, frame in zip(images, frames)]
    animation[0].save(args.output / f'{id}-wholebody-gait-128.gif', save_all=True,
                      append_images=animation[1:], duration=56, loop=0)
    # Static anatomy-transition witness; combat timing/contact is checked by the
    # real-browser harness, rather than manufactured by this source preview.
    transition = [tiles[0]] * 8 + animation * 2 + [tiles[-1]] * 4 + [tiles[0]] * 8
    transition[0].save(args.output / f'{id}-idle-walk-jab-128.gif', save_all=True,
                       append_images=transition[1:], duration=56, loop=0)
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'{id}:12 connected bodies; raw reference{raw_height:.3f};128px crown widths {[round(x, 2) for x in calibration["candidateCrownWidthsAt128"]]}; PRIVATE_VISUAL_REVIEW_REQUIRED', flush=True)

board = Image.new('RGB', (256 * 5, 200 * len(review_rows)), '#16202b')
for row, image in enumerate(review_rows): board.paste(image, (0, 200 * row))
board.save(args.output / f'all{len(review_rows)}-idle-walk-jab-128.png')
print('Private complete-body preview:', args.output, flush=True)
