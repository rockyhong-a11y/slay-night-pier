"""Render reviewed complete RGBA walking frames with one uniform actor calibration.

Validate paths and frame geometry (this does not approve anatomy):
  python3 tools/build-wholebody-walk-scene.py --input INPUT/manifest.json --validate-only

Bake private PNGs and a shared, packed, editable Blender scene:
  Blender --background --factory-startup --python tools/build-wholebody-walk-scene.py -- \
    --input INPUT/manifest.json --output /private/tmp/slay-wholebody-blender

Input: {characters: {id: {sourceBodyHeight: rawReference, bodyHeight: rawReference,
  cycleDistanceSourcePixels: distance, frames: [{image, phase, pivot, centerPivot}]}}}.
The input pixels must still be in the raw reference's coordinate system. Each
complete image becomes one rigid plane; only a whole-image pivot translation and
the common270/rawReference similarity are applied. This script never extracts
limbs, changes body-part proportions, or scales a pose from its bounding box.

Actors have separate collections and cameras in one shared scene, arranged along
X for editing. Their12-frame timelines share phase. Select an actor's camera to
inspect its complete body. All image textures are packed into the blend file.
Output remains private; use the root packer after actual rendered visual review.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import math
import sys

ROOT=Path(__file__).resolve().parents[1]
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--output',type=Path,default=Path('/private/tmp/slay-wholebody-blender'))
parser.add_argument('--actors',help='Comma-separated subset, preserving input order by default')
parser.add_argument('--scene-name',default='sd-wholebody-walk.blend')
parser.add_argument('--scene-reference',default='tools/sd-wholebody-walk.blend',help='Stable authoring-scene reference retained in exported metadata; does not change the private output path')
parser.add_argument('--validate-only',action='store_true')
args=parser.parse_args(argv)
input_path=args.input/'manifest.json' if args.input.is_dir() else args.input
source=json.loads(input_path.read_text())
entries=source.get('characters') or {source['actor']:source}
actors=args.actors.split(',') if args.actors else list(entries)
if not actors or len(set(actors))!=len(actors):raise ValueError('Choose unique actors')
if any(actor not in entries for actor in actors):raise ValueError('Actor missing from input manifest')
if args.output.resolve().is_relative_to((ROOT/'public').resolve()):
    raise ValueError('This authoring tool writes private outputs only; root owns the public import')
if Path(args.scene_name).name!=args.scene_name or not args.scene_name.endswith('.blend'):
    raise ValueError('Use a simple .blend scene filename')

CANONICAL_HEIGHT=270.
RESOLUTION=384
ORTHO=330.
# Keep the approved uniform actor calibration; raise only the framing center to
# retain taller hair silhouettes and antialiased edges in the reviewed sources.
CAMERA_Z=150.
CANONICAL_TO_RENDER=RESOLUTION/ORTHO
RENDER_HEIGHT=CANONICAL_HEIGHT*CANONICAL_TO_RENDER
RENDER_PIVOT=[RESOLUTION/2,RESOLUTION/2+CAMERA_Z*CANONICAL_TO_RENDER]
SPACING=400.
records={}

def finite_pair(value,label):
    if not isinstance(value,(list,tuple)) or len(value)!=2 or any(not math.isfinite(float(v)) for v in value):
        raise ValueError(f'{label}: a finite two-dimensional point is required')
    return [float(v) for v in value]

for actor in actors:
    entry=entries[actor]
    reference=float(entry['sourceBodyHeight'])
    if not math.isfinite(reference) or reference<=0:raise ValueError(f'{actor}: invalid raw body reference')
    # The extractor supplies unscaled raw pixel images. Refuse already scaled
    # render inputs rather than silently applying the calibration twice.
    input_height=float(entry.get('renderBodyHeight',entry.get('bodyHeight',reference)))
    if abs(input_height-reference)>1e-5:
        raise ValueError(f'{actor}: images are already scaled; raw reference{reference}, input pixel reference{input_height}')
    frames=entry.get('frames')
    if not isinstance(frames,list) or len(frames)!=12:raise ValueError(f'{actor}: twelve complete walking frames are required')
    canonical_scale=CANONICAL_HEIGHT/reference
    frame_records=[]
    for index,frame in enumerate(frames):
        path=Path(frame['image'])
        if not path.is_absolute():path=input_path.parent/path
        path=path.resolve()
        if not path.is_file():raise FileNotFoundError(path)
        pivot=finite_pair(frame.get('pivot',entry.get('pivot')),f'{actor}:{index}:pivot')
        center=finite_pair(frame.get('centerPivot',[pivot[0],pivot[1]-reference/2]),f'{actor}:{index}:centerPivot')
        phase=float(frame.get('phase',index/12))
        if not math.isfinite(phase) or not 0<=phase<1:raise ValueError(f'{actor}:{index}: phase must be in[0,1)')
        frame_records.append({'path':path,'pivot':pivot,'centerPivot':center,'phase':phase,
                              'SHA256':hashlib.sha256(path.read_bytes()).hexdigest()})
    cycle=float(entry.get('cycleDistanceSourcePixels',entry.get('cycleDistanceSourceUnits',70/128*reference)))
    if not math.isfinite(cycle) or cycle<=0:raise ValueError(f'{actor}: invalid cycle distance')
    records[actor]={'reference':reference,'canonicalScale':canonical_scale,'frames':frame_records,'cycleSource':cycle}

if args.validate_only:
    from PIL import Image
    report={}
    for actor,record in records.items():
        margins=[]
        for index,frame in enumerate(record['frames']):
            image=Image.open(frame['path']).convert('RGBA')
            mask=image.getchannel('A').point(lambda a:255 if a>0 else 0)
            box=mask.getbbox()
            if box is None:raise ValueError(f'{actor}:{index}: empty opaque body')
            px,py=frame['pivot'];s=record['canonicalScale'];x0,x1=(box[0]-px)*s,(box[2]-px)*s
            z0,z1=(py-box[3])*s,(py-box[1])*s
            margin=min(x0+ORTHO/2,ORTHO/2-x1,z0-(CAMERA_Z-ORTHO/2),(CAMERA_Z+ORTHO/2)-z1)
            if margin<0:raise ValueError(f'{actor}:{index}: fixed camera would clip the body by{-margin:.3f}canonical pixels')
            margins.append(margin)
        report[actor]={'frames':12,'rawBodyReference':record['reference'],
            'uniformSourceToCanonical':record['canonicalScale'],
            'uniformSourceToRender':record['canonicalScale']*CANONICAL_TO_RENDER,
            'minimumCameraMarginCanonicalPixels':min(margins),
            'cycleWorldDistanceAt128':record['cycleSource']/record['reference']*128}
    print(json.dumps({'geometryOnly':True,'anatomyAcceptance':False,'actors':report},indent=2))
    raise SystemExit(0)

import bpy
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=scene.render.resolution_y=RESOLUTION
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
# A12-frame loop at18fps previews1.5cycles/s, close to the artistically
# calibrated104world/s ÷70world/cycle. Runtime still advances by world distance.
scene.render.fps=18
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
# Input PNGs already have reviewed alpha; no chromakey or color grading is used.
scene.compositing_node_group=None
args.output.mkdir(parents=True,exist_ok=True)
out={'version':1,'sampleRate':source.get('sampleRate',12),'status':'PRIVATE_BLENDER_RENDER_FOR_VISUAL_REVIEW',
     'method':'Complete RGBA images, per-actor uniform raw-to-canonical calibration, whole-image root translation, no body-part extraction/warp or pose bbox normalization.',
     'characters':{}}
cameras={}
timeline=[]

def output_point(point,pivot,source_to_render):
    return [RENDER_PIVOT[0]+(point[0]-pivot[0])*source_to_render,
            RENDER_PIVOT[1]+(point[1]-pivot[1])*source_to_render]

for actor_index,actor in enumerate(actors):
    entry=entries[actor];record=records[actor];reference=record['reference'];s=record['canonicalScale']
    source_to_render=s*CANONICAL_TO_RENDER;offset_x=actor_index*SPACING
    collection=bpy.data.collections.new(f'{actor}_complete_walk');scene.collection.children.link(collection)
    collection['actor']=actor;collection['rawBodyReference']=reference
    collection['sourceToCanonicalUniformScale']=s;collection['sourceToRenderUniformScale']=source_to_render
    collection['completeBodyOneImagePerFrame']=True;collection['worldSoleLock']=False
    camera_data=bpy.data.cameras.new(f'{actor}_walk_camera');camera_data.type='ORTHO';camera_data.ortho_scale=ORTHO
    camera=bpy.data.objects.new(f'{actor}_walk_camera',camera_data);collection.objects.link(camera)
    camera.location=(offset_x,-800,CAMERA_Z);camera.rotation_euler=(math.pi/2,0,0);cameras[actor]=camera
    result=copy.deepcopy(entry)
    result.update({'actor':actor,'sourceBodyHeight':reference,'canonicalBodyHeight':CANONICAL_HEIGHT,
                   'bodyHeight':RENDER_HEIGHT,'renderBodyHeight':RENDER_HEIGHT,
                   'sourceToRenderScale':source_to_render,'sourceToCanonicalScale':s,
                   'cycleDistanceSourcePixels':record['cycleSource'],'cycleDistanceSourceUnits':record['cycleSource'],
                   'cycleDistanceWorldAt128':record['cycleSource']/reference*128,
                   'pivot':RENDER_PIVOT,'sourceScene':args.scene_reference,'authoringSceneFile':args.scene_name,
                   'sourceManifest':str(input_path.resolve()),'sourceCellSize':entry.get('cellSize'),'cellSize':RESOLUTION,
                   'authoringCollection':collection.name,'authoringCamera':camera.name,
                   'canonicalComparison':{**entry.get('canonicalComparison',{}),'bodyHeight':CANONICAL_HEIGHT},
                   'description':'Complete source RGBA walking images, actually rendered in Blender with one actor-specific uniform scale and whole-frame pivot translation; anatomy requires rendered visual review.',
                   'frames':[]})
    stable_sheet=ROOT/'tools/walk-source/sheets'/f'{actor}-walk-sheet.png'
    if stable_sheet.is_file() and hashlib.sha256(stable_sheet.read_bytes()).hexdigest()==entry.get('sourceSHA256'):
        result['originalSourceSheet']=entry.get('sourceSheet')
        result['sourceSheet']=str(stable_sheet.relative_to(ROOT))
    for index,frame in enumerate(record['frames']):
        image=bpy.data.images.load(str(frame['path']));image.alpha_mode='STRAIGHT';image.pack()
        width,height=image.size;px,py=frame['pivot']
        material=bpy.data.materials.new(f'{actor}_whole_RGBA_{index:02}');material.use_nodes=True
        nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Linear'
        emission=nodes.new('ShaderNodeEmission');transparent=nodes.new('ShaderNodeBsdfTransparent')
        mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial')
        links.new(texture.outputs['Color'],emission.inputs['Color'])
        links.new(texture.outputs['Alpha'],mix.inputs[0])
        links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])
        mesh=bpy.data.meshes.new(f'{actor}_complete_quad_{index:02}')
        mesh.from_pydata([((x-px)*s,0,(py-y)*s) for x,y in [(0,0),(width,0),(width,height),(0,height)]],[],[(0,1,2,3)])
        uv=mesh.uv_layers.new()
        for polygon in mesh.polygons:
            for loop in polygon.loop_indices:uv.data[loop].uv=[(0,1),(1,1),(1,0),(0,0)][mesh.loops[loop].vertex_index]
        plane=bpy.data.objects.new(f'{actor}_complete_pose_{index:02}',mesh);collection.objects.link(plane);mesh.materials.append(material)
        plane.location=(offset_x,0,0);plane.scale=(1,1,1)
        plane['phase']=frame['phase'];plane['sourceImage']=str(frame['path']);plane['sourceSHA256']=frame['SHA256']
        plane['sourcePixelPivot']=frame['pivot'];plane['completeBodyOneImage']=True
        plane['sourceToCanonicalUniformScale']=s;plane['noBodyPartWarp']=True
        for at,hidden in [(0,True),(index+1,False),(index+2,True)]:
            plane.hide_render=hidden;plane.hide_viewport=hidden
            plane.keyframe_insert(data_path='hide_render',frame=at);plane.keyframe_insert(data_path='hide_viewport',frame=at)
        source_frame=copy.deepcopy(entry['frames'][index])
        rendered=copy.deepcopy(source_frame)
        rendered.update({'phase':frame['phase'],'image':f'{actor}-wholebody-walk-{index:02}.png',
                         'pivot':RENDER_PIVOT,'root':RENDER_PIVOT,
                         'centerPivot':output_point(frame['centerPivot'],frame['pivot'],source_to_render),
                         'sourceImage':str(frame['path']),'sourcePNG_SHA256':frame['SHA256'],
                         'packedTextureReference':f'{args.scene_reference}::{image.name}',
                         'sourcePixelPivot':frame['pivot'],'sourcePixelCenterPivot':frame['centerPivot']})
        for foot in rendered.get('feet',{}).values():
            if 'pixel' in foot:foot['pixel']=output_point(foot['pixel'],frame['pivot'],source_to_render)
        if 'soleObservation' in rendered:
            observation=rendered['soleObservation'];original=copy.deepcopy(observation)
            observation['sourceObservation']=original
            if 'lowestOpaquePixel' in observation:
                observation['lowestOpaquePixel']=output_point([px,observation['lowestOpaquePixel']],frame['pivot'],source_to_render)[1]
            observation['informativeOnly']=True;observation['perfectDepthSoleLock']=False
        result['frames'].append(rendered)
    out['characters'][actor]=result
    timeline.append({'actor':actor,'collection':collection.name,'camera':camera.name,'authoringOffsetX':offset_x})

for actor in actors:
    scene.camera=cameras[actor]
    for index,frame in enumerate(out['characters'][actor]['frames']):
        scene.frame_set(index+1);bpy.context.view_layer.update()
        scene.render.filepath=str(args.output/frame['image']);bpy.ops.render.render(write_still=True)

scene.frame_start=1;scene.frame_end=12;scene.frame_set(1);scene.camera=cameras[actors[0]]
scene['wholeBodyWalkAuthoring']=True;scene['canonicalBodyHeight']=CANONICAL_HEIGHT
scene['renderBodyHeight']=RENDER_HEIGHT;scene['fixedRenderedGroundPivot']=RENDER_PIVOT
scene['actorCameras']=json.dumps(timeline)
scene['authoringPreviewFPS']=18
scene['authoringPreviewCadence']='180steps/min; runtime uses each actor distance/cycle metadata'
scene['anatomyAcceptance']='Separate actual rendered visual QA required; geometry alone is not acceptance.'
embedded=bpy.data.texts.new('wholebody-walk-export.json');embedded.write(json.dumps(out,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(args.output/args.scene_name),compress=True)
(args.output/'manifest.json').write_text(json.dumps(out,indent=2))
(args.output/'scene-cameras.json').write_text(json.dumps(timeline,indent=2))
print(f'Rendered{len(actors)*12} complete RGBA walking frames and packed scene in{args.output}')
