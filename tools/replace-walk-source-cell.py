"""Select one approved complete walk body using actual Blender compositor.

The original and edited sheets must share source pixel units and dimensions.
Read-only connected-alpha analysis chooses a roomy rectangle around the entire
selected body, including hair beyond the nominal grid. A compositor BoxMask
replaces that rectangle from the edited whole canvas. No image-array writes,
pose fitting, resampling, geometry edits or per-part transforms occur.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import sys

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--actor', required=True)
parser.add_argument('--original', type=Path, required=True)
parser.add_argument('--edited', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--index', type=int, default=9)
parser.add_argument('--rows', type=int, default=3)
parser.add_argument('--cols', type=int, default=4)
parser.add_argument('--padding', type=int, default=6)
args = parser.parse_args(argv)
if args.output.resolve().is_relative_to((ROOT / 'public').resolve()):
    raise ValueError('Selective whole-body sources remain private until reviewed')
args.output.mkdir(parents=True, exist_ok=True)

def components(mask):
    """Read-only run-length analysis; no source or output pixels are written."""
    parent, runs, previous = [], [], []
    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]; node = parent[node]
        return node
    for y, row in enumerate(mask):
        edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
        current, cursor = [], 0
        for start, end in zip(starts.tolist(), ends.tolist()):
            node = len(parent); parent.append(node)
            while cursor < len(previous) and previous[cursor][1] < start:
                cursor += 1
            j = cursor
            while j < len(previous) and previous[j][0] <= end:
                old, fresh = find(previous[j][2]), find(node)
                if old != fresh: parent[fresh] = old
                j += 1
            runs.append((y, start, end, node)); current.append((start, end, node))
        previous = current
    found = {}
    for y, start, end, node in runs:
        key = find(node)
        if key not in found: found[key] = {'area': 0, 'bbox': [start, y, end, y + 1]}
        item = found[key]; item['area'] += end - start; box = item['bbox']
        box[0] = min(box[0], start); box[1] = min(box[1], y)
        box[2] = max(box[2], end); box[3] = max(box[3], y + 1)
    large = sorted(found.values(), key=lambda item: item['area'], reverse=True)[:args.rows * args.cols]
    if len(large) != args.rows * args.cols or min(item['area'] for item in large) < max(item['area'] for item in large) * .3:
        raise ValueError('Both sheets require twelve unambiguous complete bodies')
    ordered = sorted(large, key=lambda item: (item['bbox'][1] + item['bbox'][3]) / 2)
    return [item for row in range(args.rows) for item in sorted(ordered[row * args.cols:(row + 1) * args.cols], key=lambda item: item['bbox'][0])]

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'; scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'; scene.render.dither_intensity = 0
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
images, bodies = [], []
for path in [args.original, args.edited]:
    image = bpy.data.images.load(str(path.resolve()), check_existing=False)
    image.alpha_mode = 'STRAIGHT'; image.colorspace_settings.name = 'sRGB'; image.pack()
    width, height = image.size
    alpha = np.asarray(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[::-1, :, 3]
    bodies.append(components(alpha >= 160 / 255)); images.append(image)
if images[0].size[:] != images[1].size[:]:
    raise ValueError('Canvas units differ: request a reviewed uniform whole-canvas conversion; do not fit this pose')
if not 0 <= args.index < args.rows * args.cols:
    raise ValueError('Invalid selected source cell')
width, height = images[0].size
boxes = [bank[args.index]['bbox'] for bank in bodies]
pad = args.padding
rectangle = [max(0, min(box[0] for box in boxes) - pad), max(0, min(box[1] for box in boxes) - pad),
             min(width, max(box[2] for box in boxes) + pad), min(height, max(box[3] for box in boxes) + pad)]
x0, y0, x1, y1 = rectangle
for sheet_index, bank in enumerate(bodies):
    for index, item in enumerate(bank):
        if index == args.index: continue
        a, b, c, d = item['bbox']
        if max(x0, a - pad) < min(x1, c + pad) and max(y0, b - pad) < min(y1, d + pad):
            raise ValueError(f'Selected padded body rectangle intersects neighbor {index} on sheet {sheet_index}')

# Source-sized rigid plate is editable; compositor samples source canvases
# directly so original pixels outside the selected rectangle are untouched.
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
plate = bpy.context.object; plate.name = 'Complete_canvas_no_shape_change'
plate.scale = (width / 2, height / 2, 1)
bpy.ops.object.camera_add(location=(0, 0, 1000))
scene.camera = bpy.context.object; scene.camera.data.type = 'ORTHO'; scene.camera.data.ortho_scale = width
scene.render.resolution_x = width; scene.render.resolution_y = height; scene.render.resolution_percentage = 100
tree = bpy.data.node_groups.new('One_whole_cell_source_selection', 'CompositorNodeTree')
tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
scene.compositing_node_group = tree
image_nodes, channels = [], []
for image in images:
    node = tree.nodes.new('CompositorNodeImage'); node.image = image; image_nodes.append(node)
    separate = tree.nodes.new('CompositorNodeSeparateColor'); separate.mode = 'RGB'
    tree.links.new(node.outputs['Image'], separate.inputs['Image']); channels.append(separate)
mask = tree.nodes.new('CompositorNodeBoxMask')
mask.inputs['Position'].default_value = [(x0 + x1) / 2 / width, 1 - (y0 + y1) / 2 / height]
# Blender BoxMask sizes use width-normalized units for both axes. Position
# remains normalized separately by width/height; a height-normalized Y size
# would accidentally select a neighboring row on a non-square source sheet.
mask.inputs['Size'].default_value = [(x1 - x0) / width, (y1 - y0) / width]
def math_node(op, a, b):
    node = tree.nodes.new('ShaderNodeMath'); node.operation = op
    for index, value in enumerate([a, b]):
        if isinstance(value, (int, float)): node.inputs[index].default_value = value
        else: tree.links.new(value, node.inputs[index])
    return node.outputs[0]
inverse = math_node('SUBTRACT', 1., mask.outputs['Mask'])
combined = tree.nodes.new('CompositorNodeCombineColor'); combined.mode = 'RGB'
for name in ['Red', 'Green', 'Blue', 'Alpha']:
    original = math_node('MULTIPLY', channels[0].outputs[name], inverse)
    edited = math_node('MULTIPLY', channels[1].outputs[name], mask.outputs['Mask'])
    tree.links.new(math_node('ADD', original, edited), combined.inputs[name])
out = tree.nodes.new('NodeGroupOutput'); tree.links.new(combined.outputs['Image'], out.inputs['Image'])
name = f'{args.actor}-markers12-cell{args.index}-selected.png'
scene.render.filepath = str(args.output / name); bpy.ops.render.render(write_still=True)
scene['selectedSourceCell'] = args.index; scene['selectionBounds'] = rectangle
scene['geometryChanged'] = False; scene['resampling'] = False
bpy.ops.wm.save_as_mainfile(filepath=str(args.output / f'{args.actor}-whole-cell-selection.blend'), compress=True)
report = {'actor': args.actor, 'method': 'Actual Blender full-resolution compositor; original canvas outside the padded complete-body rectangle and approved edited canvas inside; no resampling or per-pose fit.',
          'dimensions': [width, height], 'sourceCellIndex': args.index, 'rectangle': rectangle,
          'original': str(args.original.resolve()), 'originalSHA256': hashlib.sha256(args.original.read_bytes()).hexdigest(),
          'edited': str(args.edited.resolve()), 'editedSHA256': hashlib.sha256(args.edited.read_bytes()).hexdigest(),
          'originalBodyBounds': boxes[0], 'editedBodyBounds': boxes[1], 'allOriginalBodyBounds': [body['bbox'] for body in bodies[0]],
          'otherBodiesIntersectSelection': False, 'geometryChanged': False, 'resampling': False,
          'output': name, 'validation': 'External pixel comparison and independent phase/anatomy inspection required'}
(args.output / 'cell-selection.json').write_text(json.dumps(report, indent=2))
print('Private actual Blender selected whole body:', args.output / name)
