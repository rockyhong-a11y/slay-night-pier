"""Bake Atlas' reviewed Higgsfield video as whole-body walking frames in Blender.

Blender --background --factory-startup --python tools/build-higgs-wholebody-walk.py -- \
  --input tools/walk-source/atlas-frames --output /private/tmp/slay-atlas-higgs-wholebody

The full source image is one textured plane. The compositor keys its background;
no body-part extraction, skinning, warping, or per-frame size normalization occurs.
The fixed reference and ground pivot are explicit, and output stays private until
the complete-frame comparison has been reviewed and the root packer imports it.
"""
from pathlib import Path
import argparse, hashlib, json, math, sys

ROOT=Path(__file__).resolve().parents[1]
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path,default=ROOT/'tools/walk-source/atlas-frames')
parser.add_argument('--output',type=Path,default=Path('/private/tmp/slay-atlas-higgs-wholebody'))
parser.add_argument('--source-body-height',type=float,default=757.)
parser.add_argument('--cycle-distance-source',type=float)
parser.add_argument('--cycle-distance-world',type=float,default=70.)
parser.add_argument('--review',action='store_true',help='Inspect existing private renders and create uniform128px comparison; does not edit sprite pixels.')
parser.add_argument('--ground-x',type=float,default=496.)
parser.add_argument('--ground-y',type=float,default=875.)
parser.add_argument('--resolution',type=int,default=384)
args=parser.parse_args(argv);args.output.mkdir(parents=True,exist_ok=True)
if args.cycle_distance_source is None:args.cycle_distance_source=args.source_body_height*args.cycle_distance_world/128.
INDICES=[32,35,37,40,43,45,48,51,53,56,59,61]

if args.review:
    from PIL import Image,ImageDraw
    manifest_path=args.output/'manifest.json';manifest=json.loads(manifest_path.read_text());entry=manifest['characters']['atlas']
    bank=json.loads((ROOT/'public/assets/sprites/manifest.json').read_text())['atlas']['combat']
    sheet=Image.open(ROOT/'public'/bank['image'].lstrip('/')).convert('RGBA')
    def combat(name):
        frame=bank['poses'][name];x,y,w,h=frame['rect'];return sheet.crop((x,y,x+w,y+h)),frame['pivot']
    idle,idle_pivot=combat('idle');jab,jab_pivot=combat('jab');background=(22,32,43)
    def slot(im,height,pivot,label):
        tile=Image.new('RGB',(256,200),background);s=128/height
        resized=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
        tile.paste(resized,(round(128-pivot[0]*s),round(180-pivot[1]*s)),resized)
        ImageDraw.Draw(tile).text((8,8),label,fill='white');return tile
    slots=[slot(idle,bank['bodyHeight'],idle_pivot,'canonical idle')];images=[];metrics=[]
    for i,frame in enumerate(entry['frames']):
        im=Image.open(args.output/frame['image']).convert('RGBA');images.append(im)
        mask=im.getchannel('A').point(lambda a:255 if a>=160 else 0);box=mask.getbbox()
        head=mask.crop((0,0,im.width,round(443*entry['sourceToRenderScale']))).getbbox()
        bottom=box[3]-1;xs=[x for x in range(im.width) if mask.getpixel((x,bottom))]
        frame['soleObservation']={'bottomRenderPixel':bottom,'bottomSourceY':bottom/entry['sourceToRenderScale'],
            'lowestOpaqueXSpan':[min(xs),max(xs)],'sourceYMinusFixedGround':bottom/entry['sourceToRenderScale']-entry['sourceGroundPivot'][1],
            'informativeOnly':True}
        metrics.append({'frame':i,'sourceIndex':frame['sourceIndex'],'opaqueBodyBounds':box,'opaqueHeadBandBounds':head,
            'visibleHeightAt128':(box[3]-box[1])*128/entry['renderBodyHeight'],
            'headWidthAt128':(head[2]-head[0])*128/entry['renderBodyHeight'],
            'headHeightAt128':(head[3]-head[1])*128/entry['renderBodyHeight']})
        if i in [0,4,8]:slots.append(slot(im,entry['renderBodyHeight'],frame['pivot'],f'Higgs phase{i}/12'))
    slots.append(slot(jab,bank['bodyHeight'],jab_pivot,'canonical jab'))
    board=Image.new('RGB',(256*len(slots),200),background)
    for i,tile in enumerate(slots):board.paste(tile,(256*i,0))
    board.save(args.output/'atlas-idle-higgs-jab-128.png')
    grid=Image.new('RGB',(384*4,408*3),background)
    for i,im in enumerate(images):
        tile=Image.new('RGB',(384,408),background);tile.paste(im,(0,24),im)
        ImageDraw.Draw(tile).text((8,8),f'Higgs{i:02} source{INDICES[i]}',fill='white');grid.paste(tile,((i%4)*384,(i//4)*408))
    grid.save(args.output/'atlas-higgs-keyed-grid.png')
    animation=[slot(im,entry['renderBodyHeight'],entry['pivot'],'104world/s;70world/cycle') for im in images]
    animation[0].save(args.output/'atlas-higgs-gait-128.gif',save_all=True,append_images=animation[1:],duration=56,loop=0)
    idle_mask=idle.getchannel('A').point(lambda a:255 if a>=160 else 0)
    head=idle_mask.crop((0,0,idle.width,118)).getbbox()
    report={'sourceBodyReference':entry['sourceBodyHeight'],'renderBodyReference':entry['renderBodyHeight'],
        'canonicalBodyReference':bank['bodyHeight'],'canonicalHeadBandBounds':head,
        'canonicalHeadWidthAt128':(head[2]-head[0])*128/bank['bodyHeight'],
        'canonicalHeadHeightAt128':(head[3]-head[1])*128/bank['bodyHeight'],
        'frames':metrics,'cadenceCalibration':entry['cadenceCalibration'],
        'interpretation':'Actual opaque mask dimensions at one uniform reference. Pose view and arm posture differ; no separate head/torso or individual frame scaling.'}
    (args.output/'atlas-wholebody-review.json').write_text(json.dumps(report,indent=2))
    manifest_path.write_text(json.dumps(manifest,indent=2));print('Private uniform geometry review:',args.output)
    raise SystemExit(0)

import bpy
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=scene.render.resolution_y=args.resolution;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.fps=24;scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
tree=bpy.data.node_groups.new('AtlasWholebodyChromakey','CompositorNodeTree')
scene.compositing_node_group=tree
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
layers=tree.nodes.new('CompositorNodeRLayers');layers.location=(-460,0)
key=tree.nodes.new('CompositorNodeKeying');key.location=(-200,0)
key.inputs['Key Color'].default_value=(.008023,.597202,.01033,1.)
key.inputs[3].default_value=.5;key.inputs[14].default_value=1.;key.inputs[15].default_value=.5
key.inputs[4].default_value=.20;key.inputs[5].default_value=.45
key.inputs[2].default_value=0;key.inputs[10].default_value=0
key.inputs[11].default_value=-1;key.inputs[12].default_value=1
output=tree.nodes.new('NodeGroupOutput');output.location=(60,0)
tree.links.new(layers.outputs['Image'],key.inputs['Image'])
# The video's floor shadow is also green, at a different brightness. A hue
# guard removes those pixels without interpreting dark boots as background.
# All RGB still comes from the original whole image through Blender Keying's
# despill; no region/body-part mask or generated replacement pixels are used.
rgb=tree.nodes.new('CompositorNodeSeparateColor');rgb.mode='RGB'
tree.links.new(layers.outputs['Image'],rgb.inputs['Image'])
maximum=tree.nodes.new('ShaderNodeMath');maximum.operation='MAXIMUM'
tree.links.new(rgb.outputs['Red'],maximum.inputs[0]);tree.links.new(rgb.outputs['Blue'],maximum.inputs[1])
epsilon=tree.nodes.new('ShaderNodeMath');epsilon.operation='ADD';epsilon.inputs[1].default_value=.00001
tree.links.new(rgb.outputs['Green'],epsilon.inputs[0])
ratio=tree.nodes.new('ShaderNodeMath');ratio.operation='DIVIDE'
tree.links.new(maximum.outputs[0],ratio.inputs[0]);tree.links.new(epsilon.outputs[0],ratio.inputs[1])
threshold=tree.nodes.new('ShaderNodeMath');threshold.operation='SUBTRACT';threshold.inputs[1].default_value=.65
tree.links.new(ratio.outputs[0],threshold.inputs[0])
opacity=tree.nodes.new('ShaderNodeMath');opacity.operation='MULTIPLY';opacity.inputs[1].default_value=4.;opacity.use_clamp=True
tree.links.new(threshold.outputs[0],opacity.inputs[0])
set_alpha=tree.nodes.new('CompositorNodeSetAlpha')
tree.links.new(key.outputs['Image'],set_alpha.inputs['Image']);tree.links.new(opacity.outputs[0],set_alpha.inputs['Alpha'])
tree.links.new(set_alpha.outputs['Image'],output.inputs['Image'])
bpy.ops.object.camera_add(location=(0,-800,0));camera=bpy.context.object
camera.rotation_euler=(math.pi/2,0,0);camera.data.type='ORTHO';camera.data.ortho_scale=960.;scene.camera=camera

scale=args.resolution/960.
def render_pixel(point):return [round(point[0]*scale,6),round(point[1]*scale,6)]
entry={'actor':'atlas','source':'Higgsfield GenJutsu complete walking frames',
       'description':'Reviewed complete Atlas walk from Higgsfield GenJutsu video; actual Blender full-frame chromakey, one fixed reference, no body-part warping.',
       'sourceJob':'d52d9b49-c6df-437e-8c6b-9a859b85a2d8','sourceIndices':INDICES,
       'sourceBodyHeight':args.source_body_height,'sourceToRenderScale':scale,
       'renderBodyHeight':args.source_body_height*scale,
       'bodyHeight':args.source_body_height*scale,
       'cycleDistanceSourceUnits':args.cycle_distance_source,
       'cycleDistanceSourcePixels':args.cycle_distance_source,
       'cadenceCalibration':{'kind':'artistic visual cadence','cycleWorldDistanceAt128':args.cycle_distance_source/args.source_body_height*128,
           'atlasSpeedWorldPerSecond':104,'atlasStepsPerMinute':104/(args.cycle_distance_source/args.source_body_height*128)*120,
           'stanceMeasuresInformationalOnly':True,'worldSoleLock':False,
           'note':'Calibrated for natural game playback. It does not assert source video foot travel equals combat-game world coordinates.'},
       'sampleRate':9.6,'sourceFPS':24,'sourceCycleFrames':30,
       'pivot':render_pixel([args.ground_x,args.ground_y]),
       'sourceGroundPivot':[args.ground_x,args.ground_y],
       'sourceScene':'atlas-higgs-wholebody-walk.blend',
       'keying':{'keyColorLinear':[.008023,.597202,.01033],'clipBlack':.20,'clipWhite':.45,'despillFactor':1,'dilateDistance':-1,'featherDistance':1,'greenHueGuard':'clamp((max(R,B)/(G+epsilon)-.65)*4)'},
       'canonicalComparison':{'image':'/assets/sprites/atlas-combat.webp','bodyHeight':270.,'normalization':'one global reference; no per-frame bbox scaling'},
       'frames':[]}

for f,index in enumerate(INDICES):
    path=args.input/f'frame-{index:03}.png'
    if not path.exists():raise FileNotFoundError(path)
    image=bpy.data.images.load(str(path.resolve()));image.pack()
    material=bpy.data.materials.new(f'Atlas_whole_image_{index:03}');material.use_nodes=True
    nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Linear'
    emission=nodes.new('ShaderNodeEmission');out=nodes.new('ShaderNodeOutputMaterial')
    links.new(texture.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs['Emission'],out.inputs['Surface'])
    mesh=bpy.data.meshes.new(f'Atlas_connected_full_frame_{index:03}')
    mesh.from_pydata([(-480,0,480),(480,0,480),(480,0,-480),(-480,0,-480)],[],[(0,1,2,3)])
    uv=mesh.uv_layers.new()
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:uv.data[loop].uv=[(0,1),(1,1),(1,0),(0,0)][mesh.loops[loop].vertex_index]
    plane=bpy.data.objects.new(f'Atlas_connected_pose_{f:02}',mesh);scene.collection.objects.link(plane);mesh.materials.append(material)
    plane['sourceFrameIndex']=index;plane['sourceSHA256']=hashlib.sha256(path.read_bytes()).hexdigest()
    plane['fixedBodyHeightSourcePixels']=args.source_body_height;plane['completeBodyOneImage']=True
    plane['noPartWarp']=True;plane['uniformScale']=1.
    for frame,hidden in [(0,True),(f+1,False),(f+2,True)]:
        plane.hide_render=hidden;plane.keyframe_insert(data_path='hide_render',frame=frame)

for f,index in enumerate(INDICES):
    scene.frame_set(f+1);bpy.context.view_layer.update()
    name=f'atlas-higgs-walk-{f:02}.png';scene.render.filepath=str(args.output/name);bpy.ops.render.render(write_still=True)
    path=args.input/f'frame-{index:03}.png'
    entry['frames'].append({'phase':f/len(INDICES),'sourcePhase':(index-INDICES[0])/30,
        'image':name,'sourceImage':str(path.resolve()),'sourceSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'sourceIndex':index,'pivot':entry['pivot'],'root':entry['pivot'],
        'centerPivot':render_pixel([args.ground_x,args.ground_y-args.source_body_height/2])})

scene.frame_start=1;scene.frame_end=len(INDICES);scene.frame_set(1)
scene['sourceBodyHeight']=args.source_body_height;scene['fixedGroundPivot']=[args.ground_x,args.ground_y]
scene['cycleDistanceSourcePixels']=args.cycle_distance_source
bpy.ops.wm.save_as_mainfile(filepath=str(args.output/entry['sourceScene']),compress=True)
(args.output/'manifest.json').write_text(json.dumps({'version':1,'sampleRate':9.6,'characters':{'atlas':entry}},indent=2))
print('Baked Atlas complete-body video frames:',args.output)
