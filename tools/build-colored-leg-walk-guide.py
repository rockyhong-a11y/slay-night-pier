"""Color and sample the original Blender driving mannequin; no character art.

Blender --background tools/walk-source/driving-reference/source.blend --python tools/build-colored-leg-walk-guide.py
python3 tools/build-colored-leg-walk-guide.py --assemble

The original skeleton, motion and fixed3/4camera remain intact. With the camera
at(4,-7,2.15), original R(y-.09) is NEAR BLUE and L(y+.09) is FAR RED.
Guide colors and labels identify anatomical leg identity and are not game art.
"""
from pathlib import Path
import argparse,json,math,sys,hashlib
ROOT=Path(__file__).resolve().parents[1]
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ([] if Path(sys.argv[0]).name.lower()=='blender' else sys.argv[1:])
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--assemble',action='store_true')
parser.add_argument('--output',type=Path,default=ROOT/'artifacts/walk-redo')
args=parser.parse_args(argv);args.output.mkdir(parents=True,exist_ok=True)
prefix='colored-leg-walk-guide'
frames=[1+round(i/12*32) for i in range(12)]
captions={0:'FAR RED leads / NEAR BLUE trails',3:'NEAR BLUE swings / FAR RED supports',
          6:'NEAR BLUE leads / FAR RED trails',9:'FAR RED swings / NEAR BLUE supports'}

if args.assemble:
    from PIL import Image,ImageDraw,ImageFont
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    except OSError:font=ImageFont.load_default()
    try:title=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',24)
    except OSError:title=font
    guide=Image.new('RGB',(2048,1768),'#e9edf2');draw=ImageDraw.Draw(guide)
    draw.rectangle((18,18,42,42),fill='#195df5');draw.text((52,18),'NEAR BLUE = closest leg/boot',font=title,fill='#164abd')
    draw.rectangle((540,18,564,42),fill='#f22b2b');draw.text((574,18),'FAR RED = distant leg/boot',font=title,fill='#ba2020')
    draw.text((1100,20),'One full cycle; fixed camera; screen-right walk',font=font,fill='#202936')
    for i,frame in enumerate(frames):
        image=Image.open(args.output/f'{prefix}-phase-{i:02}.png').convert('RGB')
        tile=Image.new('RGB',(512,568),'#e9edf2');tile.paste(image,(0,56));d=ImageDraw.Draw(tile)
        d.text((12,7),f'PHASE {i:02} / 12',font=title,fill='#1b2534')
        d.text((12,33),captions.get(i,'Keep each colored leg identity through this pose'),font=font,fill='#29384b')
        guide.paste(tile,((i%4)*512,64+(i//4)*568))
    guide.save(args.output/f'{prefix}.png')
    print('Motion guide ready:',args.output/f'{prefix}.png')
    raise SystemExit(0)

import bpy
from mathutils import Vector
scene=bpy.context.scene
expected=['head','torso','pelvis']+[f'{part}.{side}' for side in ['L','R'] for part in ['thigh','calf','knee','ankle','boot']]
if any(name not in bpy.data.objects for name in expected):
    raise RuntimeError('Open the original tools/walk-source/driving-reference/source.blend first')
source_scene=Path(bpy.data.filepath)
camera=scene.camera
assert tuple(round(v,2) for v in camera.location)==(4.,-7.,2.15)
assert camera.data.type=='ORTHO'
def material(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface']);p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.8;return m
blue=material('Guide NEAR BLUE anatomical R',(.025,.13,.92))
red=material('Guide FAR RED anatomical L',(.91,.035,.025))
for side,mat in [('R',blue),('L',red)]:
    for part in ['thigh','calf','knee','ankle','boot']:
        obj=bpy.data.objects[f'{part}.{side}'];obj.data.materials.clear();obj.data.materials.append(mat)
        obj['guideLegIdentity']='NEAR BLUE' if side=='R' else 'FAR RED'
scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.frame_start=1;scene.frame_end=32
bpy.context.preferences.filepaths.save_version=0
original=json.loads((ROOT/'tools/walk-source/driving-reference/motion-inspection.json').read_text())
report={'purpose':'Original3D driving mannequin, anatomical leg identity guide only; colors/labels must not appear in game art.',
        'sourceScene':str(source_scene),'sourceSceneSHA256':hashlib.sha256(source_scene.read_bytes()).hexdigest(),
        'camera':{'location':list(camera.location),'type':camera.data.type,'orthoScale':camera.data.ortho_scale},
        'sampleSourceFrames':frames,'near':'original R, y-.09, BLUE','far':'original L, y+.09, RED',
        'phase0':'far red forward contact / near blue rear toe-off',
        'phase6':'near blue forward contact / far red rear toe-off',
        'phase3':'near blue recovering swing / far red stance',
        'phase9':'far red recovering swing / near blue stance','noRigOrMotionChange':True,'rows':[]}
for index,frame in enumerate(frames):
    scene.frame_set(frame);bpy.context.view_layer.update()
    scene.render.filepath=str(args.output/f'{prefix}-phase-{index:02}.png')
    bpy.ops.render.render(write_still=True)
    row={'phaseIndex':index,'sourceFrame':frame,'phase':(frame-1)/32,'legs':{}}
    for side,meaning in [('R','nearBlue'),('L','farRed')]:
        foot=original['rows'][frame-1]['feet'][side]
        row['legs'][meaning]={'hip':foot['hip'],'knee':list(bpy.data.objects[f'knee.{side}'].location),
            'ankle':list(bpy.data.objects[f'ankle.{side}'].location),'mode':foot['mode'],'planted':foot['planted'],
            'kneeFlexDegrees':foot['kneeFlexDegrees'],'thighLength':foot['thighLength'],'calfLength':foot['calfLength'],
            'heel':foot['heel'],'toe':foot['toe']}
    report['rows'].append(row)
for key,modes in [('sampledPrimaryHeelFlatSupportKneeFlexRange',['heel','flat']),
                  ('sampledSecondaryToeOffKneeFlexRange',['toe']),('sampledSwingKneeFlexRange',['swing'])]:
    values=[leg['kneeFlexDegrees'] for row in report['rows'] for leg in row['legs'].values() if leg['mode'] in modes]
    report[key]=[min(values),max(values)]
report['interpretation']='Original rig unchanged. Leading heel/flat support is near-straight; trailing toe-off flexes during weight transfer. Near/far color identity is fixed through the cycle.'
scene.frame_set(1);scene['guideNearLeg']='R BLUE';scene['guideFarLeg']='L RED'
scene['guideOnly']='Original opaque mannequin; anatomy/pose identity reference, no copied character pixels.'
embedded=bpy.data.texts.new('colored-leg-guide-inspection.json');embedded.write(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(args.output/f'{prefix}.blend'),compress=True)
(args.output/f'{prefix}.json').write_text(json.dumps(report,indent=2))
print('Rendered12original mannequin phase poses; assemble with ordinary Python')
