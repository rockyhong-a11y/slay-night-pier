"""Blender compositor-only restoration of diagnostic leg material color markers.

Blender --background --factory-startup --python tools/restore-walk-marker-colors.py -- \
  --input artifacts/walk-redo/onyx-four-key-markers.png --output /private/tmp/slay-onyx-color-restore

The exact full-resolution RGBA source is a connected image plate. Marker color
classification uses a duplicate Non-Color input; output uses the original sRGB
input and Standard display transform. No pixel-array writes, crop, pose fitting,
body-part extraction, scale or geometry changes occur. Original alpha passes
through the compositor. External verification must inspect alpha and RGB error;
invisible RGB beneath zero alpha can be normalized by Blender's image pipeline.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import statistics
import sys

ROOT = Path(__file__).resolve().parents[1]
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--output', type=Path, default=Path('/private/tmp/slay-onyx-color-restore'))
parser.add_argument('--actor', default='onyx')
parser.add_argument('--reference', type=Path)
parser.add_argument('--markers', choices=['blue-red', 'green-magenta'], default='blue-red')
parser.add_argument('--material', choices=['skin', 'pants'], default='skin')
parser.add_argument('--rows', type=int, default=2)
parser.add_argument('--cols', type=int, default=2)
parser.add_argument('--lower-band', type=float, help='Top fraction of each row allowed for leg material selection')
parser.add_argument('--magenta-balance', type=float, help='Minimum min(R,B)/max(R,B); defaults to source-specific reviewed marker hue')
parser.add_argument('--magenta-green', type=float, help='Maximum G/max(R,B); excludes retained purple costume trim')
args = parser.parse_args(argv)
if args.lower_band is None:
    args.lower_band = .43 if args.actor == 'lynx' else .52
if args.magenta_balance is None:
    args.magenta_balance = .55 if args.actor in ['raven', 'tempest', 'lynx'] else .85
if args.magenta_green is None:
    args.magenta_green = .15 if args.actor == 'lynx' else .35
if not args.actor.replace('-', '').replace('_', '').isalnum():
    raise ValueError('Use a simple actor identifier')
if args.reference is None:
    args.reference = ROOT / 'tools/walk-source/references' / f'{args.actor}-idle.png'
if args.rows < 1 or args.cols < 1 or not 0 < args.lower_band < 1:
    raise ValueError('Use positive grid counts and an interior lower-body band')
if args.output.resolve().is_relative_to((ROOT / 'public').resolve()):
    raise ValueError('Diagnostic restoration remains private until reviewed')
args.output.mkdir(parents=True, exist_ok=True)

import bpy
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.dither_intensity = 0
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
source = bpy.data.images.load(str(args.input.resolve()), check_existing=False)
source.alpha_mode = 'STRAIGHT'; source.colorspace_settings.name = 'sRGB'; source.pack()
raw = bpy.data.images.load(str(args.input.resolve()), check_existing=False)
raw.alpha_mode = 'STRAIGHT'; raw.colorspace_settings.name = 'Non-Color'; raw.pack()
width, height = source.size
scene.render.resolution_x = width; scene.render.resolution_y = height
scene.render.resolution_percentage = 100

# Read-only palette sampling from the retained canonical face and thighs.
reference = bpy.data.images.load(str(args.reference.resolve()), check_existing=False)
reference.alpha_mode = 'STRAIGHT'; reference.colorspace_settings.name = 'Non-Color'; reference.pack()
rw, rh = reference.size
pixels = list(reference.pixels)
palette_pixels = []
rois = [(.32, .12, .95, .46), (.20, .58, .85, .84)] if args.material == 'skin' else [(.25, .60, .82, .85)]
for roi in rois:
    for y in range(round(roi[1] * rh), round(roi[3] * rh)):
        for x in range(round(roi[0] * rw), round(roi[2] * rw)):
            index = ((rh - 1 - y) * rw + x) * 4
            r, g, b, alpha = pixels[index:index + 4]
            skin = r > 100 / 255 and r > g * 1.12 and g > b * 1.12 and .4 < b / max(g, 1e-8) < .85
            charcoal = 20 / 255 < max(r, g, b) < .50 and max(r, g, b) - min(r, g, b) < .16
            if alpha > .8 and (skin if args.material == 'skin' else charcoal):
                palette_pixels.append((r, g, b))
if len(palette_pixels) < 40:
    raise ValueError('Canonical selected material sample is insufficient')

def quantile(values, q):
    ordered = sorted(values); position = q * (len(ordered) - 1)
    lo, hi = math.floor(position), math.ceil(position)
    return ordered[lo] * (hi - position) + ordered[hi] * (position - lo) if hi != lo else ordered[lo]

palette = {str(q): [quantile([pixel[channel] for pixel in palette_pixels], q) for channel in range(3)]
           for q in [.1, .25, .5, .9]}
def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

# A rigid source-sized plane remains editable in the saved scene. The compositor
# reads its original image directly to avoid any rasterization/filtering change.
mesh = bpy.data.meshes.new(f'{args.actor}_complete_source_plate')
mesh.from_pydata([(-width / 2, 0, height / 2), (width / 2, 0, height / 2),
                 (width / 2, 0, -height / 2), (-width / 2, 0, -height / 2)], [], [(0, 1, 2, 3)])
uv = mesh.uv_layers.new()
for polygon in mesh.polygons:
    for loop in polygon.loop_indices:
        uv.data[loop].uv = [(0, 1), (1, 1), (1, 0), (0, 0)][mesh.loops[loop].vertex_index]
plate = bpy.data.objects.new('Connected_whole_RGBA_no_geometry_edit', mesh)
scene.collection.objects.link(plate)
material = bpy.data.materials.new('Original_complete_RGBA'); material.use_nodes = True
nodes = material.node_tree.nodes; nodes.clear(); links = material.node_tree.links
texture = nodes.new('ShaderNodeTexImage'); texture.image = source; texture.interpolation = 'Closest'
emission = nodes.new('ShaderNodeEmission'); output = nodes.new('ShaderNodeOutputMaterial')
links.new(texture.outputs['Color'], emission.inputs['Color']); links.new(emission.outputs[0], output.inputs['Surface'])
mesh.materials.append(material)
bpy.ops.object.camera_add(location=(0, -1000, 0))
camera = bpy.context.object; camera.rotation_euler = (math.pi / 2, 0, 0)
camera.data.type = 'ORTHO'; camera.data.ortho_scale = width; scene.camera = camera

tree = bpy.data.node_groups.new('Marker_material_color_only_restore', 'CompositorNodeTree')
tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
scene.compositing_node_group = tree
node_source = tree.nodes.new('CompositorNodeImage'); node_source.image = source
node_source.label = 'Original sRGB pixels and untouched alpha'
node_raw = tree.nodes.new('CompositorNodeImage'); node_raw.image = raw
node_raw.label = 'Raw marker classification only; never output as art'
separate = tree.nodes.new('CompositorNodeSeparateColor'); separate.mode = 'RGB'
tree.links.new(node_raw.outputs['Image'], separate.inputs['Image'])

def math_node(operation, a, b=None):
    node = tree.nodes.new('ShaderNodeMath'); node.operation = operation
    for index, value in enumerate([a, b]):
        if value is None: continue
        if isinstance(value, (int, float)): node.inputs[index].default_value = value
        else: tree.links.new(value, node.inputs[index])
    return node.outputs[0]

r, g, b = [separate.outputs[name] for name in ['Red', 'Green', 'Blue']]
if args.markers == 'blue-red':
    blue = math_node('MULTIPLY', math_node('GREATER_THAN', b, 40 / 255),
                     math_node('MULTIPLY', math_node('LESS_THAN', math_node('DIVIDE', r, math_node('MAXIMUM', b, 1e-8)), .45),
                               math_node('LESS_THAN', math_node('DIVIDE', g, math_node('MAXIMUM', b, 1e-8)), .65)))
    red = math_node('MULTIPLY', math_node('GREATER_THAN', r, 40 / 255),
                    math_node('MULTIPLY', math_node('LESS_THAN', math_node('DIVIDE', g, math_node('MAXIMUM', r, 1e-8)), .35),
                              math_node('LESS_THAN', math_node('DIVIDE', b, math_node('MAXIMUM', r, 1e-8)), .35)))
else:
    blue = math_node('MULTIPLY', math_node('GREATER_THAN', g, 40 / 255),
                     math_node('MULTIPLY', math_node('LESS_THAN', math_node('DIVIDE', r, math_node('MAXIMUM', g, 1e-8)), .65),
                               math_node('LESS_THAN', math_node('DIVIDE', b, math_node('MAXIMUM', g, 1e-8)), .55)))
    maximum = math_node('MAXIMUM', r, b); minimum = math_node('MINIMUM', r, b)
    # Raven/Tempest temporary pink is red-biased (R/B up to 1.65). The other
    # sheets use near-equal R/B, so retain the narrower threshold there to keep
    # Lynx's original blue-biased purple shorts trim outside the marker mask.
    red = math_node('MULTIPLY', math_node('GREATER_THAN', minimum, 40 / 255),
                    math_node('MULTIPLY', math_node('GREATER_THAN', math_node('DIVIDE', minimum, math_node('MAXIMUM', maximum, 1e-8)), args.magenta_balance),
                              math_node('LESS_THAN', math_node('DIVIDE', g, math_node('MAXIMUM', maximum, 1e-8)), args.magenta_green)))
gate = None
for row in range(args.rows):
    low = row / args.rows + args.lower_band / args.rows
    high = (row + 1) / args.rows
    node = tree.nodes.new('CompositorNodeBoxMask')
    node.inputs['Position'].default_value = [.5, 1 - (low + high) / 2]
    # BoxMask sizes are width-normalized on both axes, unlike its position.
    node.inputs['Size'].default_value = [1., (high - low) * height / width]
    gate = node.outputs['Mask'] if gate is None else math_node('MAXIMUM', gate, node.outputs['Mask'])
opaque = math_node('GREATER_THAN', node_source.outputs['Alpha'], .0001)
gate = math_node('MULTIPLY', gate, opaque)
blue = math_node('MULTIPLY', blue, gate); red = math_node('MULTIPLY', red, gate)
mask = math_node('MAXIMUM', blue, red)
intensity = math_node('MAXIMUM', r, math_node('MAXIMUM', g, b))
ramp = tree.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'LINEAR'
stops = [(0., [0, 0, 0]), (.20, [value * .20 for value in palette['0.5']]),
         (.55, palette['0.1']), (.78, palette['0.25']), (.95, palette['0.5']), (1., palette['0.9'])]
for index, (position, color) in enumerate(stops):
    element = ramp.color_ramp.elements[index] if index < 2 else ramp.color_ramp.elements.new(position)
    element.position = position; element.color = [*(linear(value) for value in color), 1.]
tree.links.new(intensity, ramp.inputs['Factor'])
original_channels = tree.nodes.new('CompositorNodeSeparateColor'); original_channels.mode = 'RGB'
tree.links.new(node_source.outputs['Image'], original_channels.inputs['Image'])
skin_channels = tree.nodes.new('CompositorNodeSeparateColor'); skin_channels.mode = 'RGB'
tree.links.new(ramp.outputs['Color'], skin_channels.inputs['Image'])
restored = tree.nodes.new('CompositorNodeCombineColor'); restored.mode = 'RGB'
inverse = math_node('SUBTRACT', 1., mask)
selected_alpha = math_node('MULTIPLY', mask, node_source.outputs['Alpha'])
for name in ['Red', 'Green', 'Blue']:
    original = math_node('MULTIPLY', original_channels.outputs[name], inverse)
    selected = math_node('MULTIPLY', skin_channels.outputs[name], selected_alpha)
    tree.links.new(math_node('ADD', original, selected), restored.inputs[name])
tree.links.new(node_source.outputs['Alpha'], restored.inputs['Alpha'])
witness_color = tree.nodes.new('CompositorNodeCombineColor'); witness_color.mode = 'RGB'
tree.links.new(math_node('MULTIPLY', red, node_source.outputs['Alpha']), witness_color.inputs['Red'])
tree.links.new(math_node('MULTIPLY', blue, node_source.outputs['Alpha']), witness_color.inputs['Blue'])
tree.links.new(selected_alpha, witness_color.inputs['Alpha'])
witness = witness_color
group_output = tree.nodes.new('NodeGroupOutput')
link = tree.links.new(restored.outputs['Image'], group_output.inputs['Image'])
restored_name = f'{args.actor}-color-restored.png'
witness_name = f'{args.actor}-color-mask-witness.png'
scene_name = f'{args.actor}-marker-color-restore.blend'
scene.render.filepath = str(args.output / restored_name); bpy.ops.render.render(write_still=True)
tree.links.remove(link); link = tree.links.new(witness.outputs['Image'], group_output.inputs['Image'])
scene.render.filepath = str(args.output / witness_name); bpy.ops.render.render(write_still=True)
tree.links.remove(link); tree.links.new(restored.outputs['Image'], group_output.inputs['Image'])
scene['colorOnlyRestore'] = True; scene['geometryChanged'] = False
scene['alphaSource'] = 'Exact original image alpha compositor output'
scene['markerThresholdSpace'] = 'Non-Color original sRGB channel ratios'
bpy.ops.wm.save_as_mainfile(filepath=str(args.output / scene_name), compress=True)
report = {'method': 'Actual Blender compositor at exact source resolution; original sRGB plate + raw-channel marker masks + sampled canonical target-material ramp + original alpha passthrough. No pixel-array writes or image geometry edits.',
          'actor': args.actor, 'markerSet': args.markers, 'targetMaterial': args.material,
          'input': str(args.input.resolve()), 'inputSHA256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
          'canonicalReference': str(args.reference.resolve()), 'canonicalReferenceSHA256': hashlib.sha256(args.reference.read_bytes()).hexdigest(),
          'dimensions': [width, height], 'rows': args.rows, 'cols': args.cols, 'lowerBodyBandFraction': args.lower_band,
          'paletteSampleCount': len(palette_pixels), 'paletteSRGB8Quantiles': {key: [round(value * 255, 2) for value in values] for key, values in palette.items()},
          'skinRampSRGB8': [{'intensity': position, 'RGB': [round(value * 255, 2) for value in color]} for position, color in stops],
          'markerThresholds': ({'minimumDominantChannel8': 40, 'blue_R_over_B': .45, 'blue_G_over_B': .65, 'red_G_over_R': .35, 'red_B_over_R': .35}
                               if args.markers == 'blue-red' else {'minimumDominantChannel8': 40, 'green_R_over_G': .65, 'green_B_over_G': .55, 'magenta_minRB_over_maxRB': args.magenta_balance, 'magenta_G_over_maxRB': args.magenta_green}),
          'geometryChanged': False, 'alphaValidation': 'External source/output pixel comparison still required',
          'outputs': [restored_name, witness_name, scene_name]}
(args.output / 'restore-settings.json').write_text(json.dumps(report, indent=2))
print('Private actual Blender color restoration:', args.output)
