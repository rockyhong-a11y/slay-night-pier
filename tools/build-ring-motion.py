"""Author the ring-only two-person motions using reviewed complete SD drawings.

Prepare alpha contact hulls without changing any source image:
  python3 tools/build-ring-motion.py --prepare
Author, sample at 60 Hz, pack original textures, and render review frames:
  Blender --background --factory-startup --python tools/build-ring-motion.py --
Assemble the rendered review board:
  python3 tools/build-ring-motion.py --assemble
Reopen and verify the packed original art and sampled action state:
  Blender --background tools/sd-ring-motion.blend --python tools/build-ring-motion.py -- --verify

Coordinates match game.sampleMotion: body-height units, original standing body
center at (0,0), mat at z=-.5, +x along the captured attacker's facing. Positive
angle is clockwise in Canvas. Reflections are discrete relativeFacing values;
every drawing keeps scaleX=scaleY=1. Whole drawings are never limb-warped.
Cover/submission holds are sampled at holdAt and frozen by the contest engine.
The later release/recovery keys are also editable in the saved Blender scene.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/assets/motion'
REVIEW = ROOT / 'artifacts/ring-motion-review'
PRIVATE = Path('/private/tmp/slay-ring-motion')
FPS = 60
PI = math.pi
T = [0,.04,.08,.14,.21,.29,.35,.40,.48,.57,.66,.76,.87,1]
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ([] if any(a.startswith('--background') for a in sys.argv) else sys.argv[1:])
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepare',action='store_true')
parser.add_argument('--assemble',action='store_true')
parser.add_argument('--skip-renders',action='store_true')
parser.add_argument('--verify',action='store_true')
args = parser.parse_args(argv)
manifest = json.loads((ROOT/'public/assets/sprites/manifest.json').read_text())
PRIVATE.mkdir(parents=True,exist_ok=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

if args.verify:
    import bpy
    exported=json.loads(bpy.data.texts['ring-motion-export.json'].as_string())
    published=json.loads((PUBLIC/'ring.json').read_text())
    assert exported==published,'Published ring motion differs from the saved editable scene'
    inspected=json.loads(bpy.data.texts['ring-motion-inspection.json'].as_string())
    textures={node.image.name:node.image for mat in bpy.data.materials if mat.use_nodes for node in mat.node_tree.nodes if node.type=='TEX_IMAGE'}
    assert len(textures)==2 and all(image.packed_file for image in textures.values())
    for actor,sha in exported['sourceSpriteHashes'].items():
        image=next(image for image in textures.values() if Path(image.filepath).name==Path(manifest[actor]['combat']['image']).name)
        assert hashlib.sha256(bytes(image.packed_file.data)).hexdigest()==sha,actor
    checks={}
    for id,clip in exported['clips'].items():
        start,end=inspected['clips'][id]['timeline'];selected=sorted(set([0,len(clip['frames'])-1]+[round(phase*(end-start)) for phase in [clip['contactAt'],clip['impactAt'],clip.get('holdAt',.4),.87]]))
        for index in selected:
            bpy.context.scene.frame_set(start+index)
            for role in ['hero','victim']:
                root=bpy.data.objects[id+'_'+role];record=clip['frames'][index][role]
                assert abs(root.location.x-record['x'])<1e-5 and abs(root.location.z-record['z'])<1e-5,(id,index,role,'location')
                assert abs(root.rotation_euler.y-record['angle'])<1e-5,(id,index,role,'angle')
                assert abs(root.scale.x)==root.scale.y==root.scale.z==1,(id,index,role,'scale')
                pose=clip['actorPoseMap'][role].get(record['pose'],{}).get(root['actor'],record['pose'])
                planes=[child for child in root.children if child.get('pose') and not child.hide_render]
                assert len(planes)==1 and planes[0]['pose']==pose,(id,index,role,'pose')
                assert len(planes[0].data.vertices)==4 and len(planes[0].data.polygons)==1 and len(planes[0].modifiers)==0
            impact=bpy.data.objects[id+'_ImpactAnchor'].matrix_world.translation
            assert abs(impact.x-clip['frames'][index]['impactAnchor']['x'])<1e-5
            assert abs(impact.z-clip['frames'][index]['impactAnchor']['z'])<1e-5
        checks[id]={'sampledFramesChecked':len(selected),'keyCount':clip['authoredKeyCount'],'scaleInvariant':True,'packedPoseAndContactStateMatchesJSON':True}
    assert inspected['clips']['nova_cornerDive']['heroRotationRange']>=2*math.pi-1e-5
    report={'status':'REOPEN_INTEGRITY_PASS','actualBlenderVersion':bpy.app.version_string,'clips':checks,'packedOriginalTextures':2,'sourceSpriteHashes':exported['sourceSpriteHashes'],'sceneSHA256':digest(Path(bpy.data.filepath))}
    (REVIEW/'reopen-integrity.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    raise SystemExit

def convex(points):
    points = sorted(set(points))
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[];upper=[]
    for p in points:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]

if args.prepare:
    from PIL import Image
    hulls={'alphaThreshold':160,'actors':{}}
    for actor in ['atlas','nova']:
        bank=manifest[actor]['combat'];path=ROOT/'public'/bank['image'].lstrip('/')
        image=Image.open(path).convert('RGBA');poses={}
        for key,record in bank['poses'].items():
            x,y,w,h=record['rect'];alpha=image.crop((x,y,x+w,y+h)).getchannel('A')
            px,py=record['centerPivot'];unit=bank['bodyHeight'];points=[]
            for row in range(h):
                opaque=[col for col in range(w) if alpha.getpixel((col,row))>160]
                if opaque:points.extend([((opaque[0]-px)/unit,(py-row)/unit),((opaque[-1]-px)/unit,(py-row)/unit)])
            if not points:raise ValueError(f'{actor}:{key}: empty body')
            poses[key]={'points':convex(points),'rect':record['rect'],'centerPivot':record['centerPivot']}
        hulls['actors'][actor]={'image':bank['image'],'sourceSHA256':digest(path),'bodyHeight':bank['bodyHeight'],'poses':poses}
    (PRIVATE/'pose-hulls.json').write_text(json.dumps(hulls))
    print('Prepared actual alpha contact hulls for Atlas and Nova; source images unchanged.')
    raise SystemExit

if args.assemble:
    from PIL import Image,ImageDraw,ImageFont
    report=json.loads((REVIEW/'inspection.json').read_text());font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',14)
    rows=report['clips'];board=Image.new('RGB',(5*320,len(rows)*216),(22,25,33));draw=ImageDraw.Draw(board)
    for row,(id,record) in enumerate(rows.items()):
        for col,shot in enumerate(record['reviewFrames']):
            frame=Image.open(REVIEW/shot['image']).convert('RGBA');frame.thumbnail((320,192))
            board.paste(frame,(col*320,row*216),frame)
            draw.text((col*320+6,row*216+194),f"{id}  {shot['phase']:.2f}",fill='white',font=font)
    board.save(REVIEW/'ring-motion-board.png')
    print(REVIEW/'ring-motion-board.png')
    raise SystemExit

def state(x=0,z=0,angle=0,pose='idle',facing=1):
    return {'x':x,'z':z,'angle':angle,'pose':pose,'relativeFacing':facing,'scaleX':1,'scaleY':1}

def states(xs,zs,angles,poses,facings=None):
    if isinstance(poses,str):poses=poses.split()
    assert len(xs)==len(zs)==len(angles)==len(poses)==len(T)
    return [state(x,z,a,p,(facings or [1]*len(T))[i]) for i,(x,z,a,p) in enumerate(zip(xs,zs,angles,poses))]

POSE_MAP={
    'ringSupine':{'atlas':'germanRelease','nova':'verticalRelease'},
    'ringSeated':{'atlas':'bulldogLand','nova':'cradleRoll'},
    'ringProne':{'atlas':'ddtFall','nova':'neckbreakerFall'},
    'ringFolded':{'atlas':'underhook','nova':'underhook'},
}
COMBAT_POSE_MAP={
    'atlas':{'folded':'underhook','shoulderFold':'powerbombSit','supine':'germanRelease','prone':'ddtFall',
        'backbend':'throwArc','kneeling':'spinebusterLand','tuck':'powerbombSit','seated':'bulldogLand'},
    'nova':{'folded':'underhook','shoulderFold':'cradleTuck','supine':'verticalRelease','prone':'neckbreakerFall',
        'backbend':'backSuplexArch','kneeling':'snapmareFinish','tuck':'cradleTuck','seated':'cradleRoll'},
}
CLIPS={}

def add(id,name,type,duration,hero,victim,heroId='atlas',contact=.35,impact=None,hold=None,feature='chest',grip=(.12,-.20),groundHero=None,groundVictim=None,surface='ground',events=None):
    clip={'id':id,'name':name,'type':type,'heroId':heroId,'victimId':'nova' if heroId=='atlas' else 'atlas',
        'duration':duration,'contactAt':contact,'impactAt':contact if impact is None else impact,
        'recoveryAt':.87,'recovery':.13,'poseBlend':.065,'times':T,'hero':hero,'victim':victim,
        'gripFeature':feature,'gripLocal':grip,'gripPeriods':[[contact,.76]],'impactSurface':surface,
        'impactVictimLocal':(0,-.25) if surface=='body' else (0,-.5),
        'groundHero':groundHero if groundHero is not None else [[0,1]],
        'groundVictim':groundVictim if groundVictim is not None else [[0,1]],
        'events':events or [{'at':contact,'type':'contact'},{'at':contact if impact is None else impact,'type':'impact'},{'at':.87,'type':'release'}],
        'actorPoseMap':{'hero':copy.deepcopy(POSE_MAP),'victim':copy.deepcopy(POSE_MAP)},
        'sourceArtPolicy':'Existing reviewed fullbody combat drawings, unit isotropic scale; no source-image changes.'}
    if hold is not None:
        clip.update({'holdAt':hold,'holdUntil':.66,'releaseAt':.76,'holdPosePolicy':'Freeze the complete sampled holdAt state during the pin/submission contest; use escape clip on escape.'})
    CLIPS[id]=clip
    return clip

zero=[0]*14
rebound=add('ropeRebound','로프 리바운드','rope',1.04,
    states([0,.01,-.015,-.055,-.12,-.10,-.05,.025,.20,.43,.65,.86,1.07,1.20],zero,
        [0,-.02,-.05,-.10,-.20,-.23,-.15,-.04,.035,.07,.07,.04,.015,0],
        'idle guard guard throwArc throwArc throwArc windup charge cross cross strikeRecovery strikeRecovery guard idle'),
    [state(2.3,0,0,'idle',-1) for _ in T],contact=.21,
    events=[{'at':.21,'type':'ropeContact'},{'at':.40,'type':'ropeRelease'},{'at':.87,'type':'runReady'}])
rebound['gripPeriods']=[];rebound['ropeCompression']=.12;rebound['returnDistance']=1.20

running=add('runningClothesline','러닝 클로스라인','strike',.88,
    states([0,.02,.06,.14,.25,.38,.52,.63,.78,.86,.91,.96,1,1.02],zero,
        [0,0,-.01,-.02,-.03,-.02,0,.025,.035,.035,.025,.015,.01,0],
        'windup windup windup windup windup cross cross cross cross cross strikeRecovery recover guard idle'),
    states([1.25,1.25,1.25,1.25,1.25,1.25,1.26,1.30,1.39,1.49,1.57,1.62,1.64,1.64],
        [0,0,0,0,0,0,0,.045,.10,.045,0,0,0,0],
        [0,0,0,0,0,0,.05,.16,.34,.40,.08,.02,0,0],
        'idle idle idle idle idle idle hurt hurt hurt hurt ringSupine ringSupine ringSupine ringSupine',[-1]*14),
    contact=.45,groundVictim=[[0,.35],[.66,1]])
running['gripPeriods']=[];running['extendedPoseLeadSeconds']=.88*(.45-.29)

for actor in ['atlas','nova']:
    moonsault=actor=='nova'
    hp=('guard guard underhook backSuplexArch backSuplexArch backSuplexArch backSuplexArch backSuplexArch backSuplexArch backSuplexArch verticalRelease neckbreakerFall recover idle' if moonsault else
        'guard guard underhook underhook armLock armLock armLock armLock armLock ddtFall ddtFall spinebusterLand recover idle')
    h=states([0,0,0,.04,.24,.57,.90,1.20,1.62,1.98,2.10,2.13,2.13,2.13] if moonsault else [0,0,0,.12,.48,.90,1.12,1.40,1.72,1.92,2.10,2.12,2.12,2.12],
        [.9,.87,.85,1.04,1.49,1.89,2.10,2.05,1.56,.70,.04,0,0,0] if moonsault else [.9,.88,.85,1.06,1.40,1.55,1.38,1.16,.90,.36,0,0,0,0],
        [0,0,-.05,-.20,-.75,-1.55,-2.20,-2.80,-3.90,-5.15,-2*PI,-2*PI,-2*PI,-2*PI] if moonsault else [0,0,0,-.15,.12,.45,.75,1.05,1.10,.65,.15,0,0,0],hp,
        [-1]*12+[1,1] if moonsault else [1]*14)
    c=add(actor+'_cornerDive','문솔트' if moonsault else '다이빙 엘보 드롭','dive',1.86 if moonsault else 1.62,
        h,[state(2.28,0,0,'ringSupine',-1) for _ in T],heroId=actor,
        contact=.70 if moonsault else .65,groundHero=[[.76,1]],surface='body',feature='chest',
        events=[{'at':.08,'type':'takeoff'},{'at':.35,'type':'airborne'},{'at':.70 if moonsault else .65,'type':'impact'},{'at':.87,'type':'recover'}])
    c.update({'travel':{'xStart':0,'xEnd':2.13 if moonsault else 2.12,'cornerHeight':.9,'targetGrounded':True},
        'cornerTechnique':'backward wholebody moonsault' if moonsault else 'bent-arm elbow drop',
        'rotationTurns':-1 if moonsault else 0,'gripPeriods':[]})

atlas_cover=add('atlas_cover','래터럴 프레스','cover',1.52,
    states([-.12,-.10,-.08,-.03,.05,.14,.20,.20,.20,.20,.20,.24,.34,.45],zero,
        [0,.04,.08,.12,.15,.10,.03,0,0,0,0,.015,0,0],
        'guard underhook spinebusterLand spinebusterLand spinebusterLand ddtFall ddtFall ddtFall ddtFall ddtFall ddtFall spinebusterLand recover idle'),
    [state(.46,0,0,'verticalRelease',1) for _ in T],contact=.21,hold=.35,feature='shoulders',grip=(.10,-.24),surface='body')
nova_cover=add('nova_cover','레그 훅 커버','cover',1.58,
    states([-.12,-.10,-.07,-.025,.10,.31,.42,.42,.42,.42,.42,.39,.40,.44],zero,
        [0,-.025,-.06,-.13,-.28,-.52,-.65,-.65,-.65,-.65,-.65,-.28,-.03,0],
        'guard underhook snapmareFinish snapmareFinish scissorsFinish neckbreakerFall neckbreakerFall neckbreakerFall neckbreakerFall neckbreakerFall neckbreakerFall snapmareFinish recover idle'),
    [state(.44,0,0,'germanRelease',1) for _ in T],heroId='nova',contact=.21,hold=.35,feature='shoulderAndLeg',grip=(.04,-.19),surface='body')
for c in [atlas_cover,nova_cover]:
    c['events']=[{'at':.21,'type':'coverContact'},{'at':.35,'type':'hold'},{'at':.76,'type':'release'},{'at':.87,'type':'recover'}]
    c['gripPeriods']=[[.21,.76]]
    c['drawingApproximation']='Lateral/leg-hook pin uses existing low fullbody art; no newly painted clasped-hand or chest-press drawing.'

atlas_sub=add('atlas_submission','스탠딩 암홀드','submission',1.68,
    states([0,.005,.01,.015,.02,.025,.03,.03,.03,.03,.03,.02,.01,0],zero,
        [0,0,.015,.035,.055,.075,.07,.07,.07,.07,.07,.04,.01,0],
        'guard guard wristCatch wristCatch armLock armLock armLock armLock armLock armLock armLock wristCatch recover idle'),
    states([.52,.50,.48,.46,.45,.44,.44,.44,.44,.44,.44,.47,.51,.55],zero,
        [0,-.02,-.04,-.05,-.03,0,0,0,0,0,0,.01,0,0],
        'hurt hurt hurt underhook scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish recover guard'),
    contact=.21,hold=.40,feature='wristAndElbow',grip=(.20,.08),surface='body')
nova_sub=add('nova_submission','시티드 크로스 암바','submission',1.76,
    states([0,.005,.01,.02,.04,.10,.14,.14,.14,.14,.14,.14,.15,.16],zero,
        [0,0,-.025,-.04,-.15,-.32,-.40,-.40,-.40,-.40,-.40,-.22,-.02,0],
        'guard wristCatch armDragPivot armDragPivot scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish scissorsFinish recover idle',
        [1,1,1,1,-1,-1,-1,-1,-1,-1,-1,-1,1,1]),
    states([.51,.49,.47,.44,.41,.38,.35,.35,.35,.35,.35,.37,.42,.50],zero,
        [0,-.02,-.04,-.03,0,0,0,0,0,0,0,0,0,0],
        'hurt hurt underhook underhook germanRelease germanRelease germanRelease germanRelease germanRelease germanRelease germanRelease sweepFall recover guard'),
    heroId='nova',contact=.21,hold=.40,feature='trappedWristAndElbow',grip=(-.29,-.025),surface='body')
for c in [atlas_sub,nova_sub]:
    c['events']=[{'at':.21,'type':'lockContact'},{'at':.40,'type':'hold'},{'at':.76,'type':'release'},{'at':.87,'type':'recover'}]
    c['gripPeriods']=[[.21,.76]]
    c['drawingApproximation']='Existing arm-lock/curled/side-fall drawings establish the hold; fingers are not repainted around the opponent arm.'

atlas_fin=add('atlas_finisher','하버 브레이커','finisher',2.18,
    states([0,.01,.02,.025,.03,.035,.04,.045,.06,.08,.11,.13,.13,.13],
        [0,0,-.025,-.04,-.025,.03,.08,.08,.075,.025,0,0,0,0],
        [0,0,-.015,-.03,-.025,0,0,0,.02,.035,0,0,0,0],
        'clinch clinch underhook underhook powerbombHold powerbombHold powerbombHold powerbombHold powerbombHold spinebusterDrive powerbombSit powerbombSit spinebusterLand guard'),
    states([.52,.48,.41,.31,.21,.13,.10,.10,.11,.31,.70,.74,.77,.78],
        [0,0,.045,.19,.45,.76,.95,.95,.91,.42,0,0,0,0],
        [0,.02,.18,.90,2.50,PI,PI,PI,3.32,4.0,0,0,0,0],
        'idle idle underhook underhook cradleTuck hurt hurt hurt cradleTuck cradleTuck verticalRelease verticalRelease verticalRelease verticalRelease',[-1]*14),
    contact=.14,impact=.66,feature='waist',grip=(.08,.35),groundVictim=[[0,.08],[.66,1]])
atlas_fin['gripPeriods']=[[.14,.57]];atlas_fin['stallAt']=[.35,.40]
nova_fin=add('nova_finisher','드래곤 브리지 스플렉스','finisher',2.26,
    states([0,0,-.005,-.01,-.025,-.055,-.10,-.15,-.20,-.24,-.27,-.27,-.23,-.16],
        [0,-.015,-.025,-.04,-.025,.02,.065,.07,.04,0,0,0,0,0],
        [0,-.01,-.02,-.025,-.04,-.055,-.06,-.04,-.025,-.01,0,0,0,0],
        'clinch clinch underhook underhook backSuplexArch backSuplexArch dragonBridge dragonBridge dragonBridge dragonBridge dragonBridge dragonBridge verticalRelease guard'),
    states([.43,.39,.32,.22,.10,-.09,-.34,-.61,-.81,-.94,-1.0,-1.02,-1.03,-1.03],
        [0,0,.05,.18,.42,.74,.81,.57,.25,.04,0,0,0,0],
        [0,-.04,-.12,-.35,-.65,-.90,-1.20,-1.38,-.55,-.15,0,0,0,0],
        'back back underhook underhook hurt hurt hurt hurt ddtFall ddtFall ddtFall ddtFall ddtFall ddtFall',[1]*14),
    heroId='nova',contact=.14,impact=.66,feature='rearWaistAndShoulders',grip=(.12,.28),groundVictim=[[0,.08],[.66,1]])
nova_fin['gripPeriods']=[[.14,.57]];nova_fin['bridgeAt']=[.66,.76]
for c in [atlas_fin,nova_fin]:
    c['events']=[{'at':.14,'type':'grip'},{'at':.35,'type':'signature'},{'at':.66,'type':'impact'},{'at':.87,'type':'release'}]
    c['damagePolicy']='One impact; vulnerability/down time only. Never an automatic HP knockout.'

pin_escape=add('pinEscape','숄더 킥아웃','escape',.86,
    states([.20,.20,.20,.22,.25,.29,.33,.37,.40,.42,.44,.46,.47,.48],zero,
        [0,.025,.06,.10,.12,.12,.10,.065,.04,.015,0,0,0,0],
        'ringSeated ringSeated ringSeated ringSeated underhook underhook recover recover guard guard guard idle idle idle'),
    states([.46,.46,.47,.49,.53,.58,.62,.65,.68,.69,.70,.71,.72,.73],zero,
        [0,-.08,-.18,-.34,-.48,-.46,-.32,-.18,-.08,-.025,0,0,0,0],
        'ringSupine ringSupine ringSupine ringSeated ringSeated ringSeated ringSeated underhook recover recover guard guard idle idle'),
    contact=.14,impact=.14,feature='shoulderRelease')
pin_escape['gripPeriods']=[];pin_escape['events']=[{'at':.14,'type':'shoulderLift'},{'at':.29,'type':'kickout'},{'at':.87,'type':'recover'}]
sub_escape=add('submissionEscape','로프 브레이크·암 슬립','escape',.98,
    states([.03,.03,.025,.015,0,-.03,-.055,-.08,-.11,-.13,-.14,-.14,-.14,-.14],zero,
        [0,.01,.025,.04,.045,.025,0,-.025,-.02,-.01,0,0,0,0],
        'armLock armLock wristCatch wristCatch guard guard underhook recover guard guard guard idle idle idle'),
    states([.44,.45,.47,.51,.56,.61,.64,.68,.70,.72,.74,.75,.76,.76],zero,
        [0,-.025,-.05,-.09,-.12,-.10,-.07,-.04,-.015,0,0,0,0,0],
        'ringSeated ringSeated ringSeated ringSeated ringSeated underhook underhook recover recover guard guard guard idle idle'),
    contact=.14,impact=.14,feature='wristRelease')
sub_escape['gripPeriods']=[];sub_escape['events']=[{'at':.14,'type':'wristSlip'},{'at':.29,'type':'release'},{'at':.87,'type':'recover'}]
for c in [pin_escape,sub_escape]:
    c['captureStartTransforms']=True
    c['startTransformPolicy']='Rebase each actor to the captured hold state using sample minus first sample; blend the painted pose during the escape entry.'

def resolve(clip,role,pose):
    actor=clip['heroId'] if role=='hero' else clip['victimId']
    return clip['actorPoseMap'][role].get(pose,{}).get(actor,pose)

for id,clip in CLIPS.items():
    assert len(clip['hero'])==len(clip['victim'])==len(T)>=12
    for role in ['hero','victim']:
        actor=clip['heroId'] if role=='hero' else clip['victimId']
        for value in clip[role]:
            assert value['scaleX']==value['scaleY']==1
            assert resolve(clip,role,value['pose']) in manifest[actor]['combat']['poses'],(id,role,value['pose'])

import bpy
from mathutils import Vector
hulls=json.loads((PRIVATE/'pose-hulls.json').read_text())['actors']
for actor in ['atlas','nova']:
    assert hulls[actor]['sourceSHA256']==digest(ROOT/'public'/manifest[actor]['combat']['image'].lstrip('/')),f'Stale {actor} hulls; run --prepare'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=FPS;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=False
scene.render.resolution_x=640;scene.render.resolution_y=384;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.025,.03,.04)
scene.compositing_node_group=None
matmesh=bpy.data.meshes.new('Review_Mat_Line');matmesh.from_pydata([(-4,.05,-.506),(4,.05,-.506),(4,.05,-.5),(-4,.05,-.5)],[],[(0,1,2,3)])
matline=bpy.data.objects.new('Review_Mat_Line',matmesh);scene.collection.objects.link(matline);matline['reviewHelper']=True
mat=bpy.data.materials.new('Review_Mat_Grey');mat.use_nodes=True;mat.node_tree.nodes.clear()
em=mat.node_tree.nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(.12,.15,.20,1);out=mat.node_tree.nodes.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(em.outputs[0],out.inputs[0]);matmesh.materials.append(mat)
materials={};roots={};controls={};spans={};cursor=1
def material(actor):
    if actor in materials:return materials[actor]
    bank=manifest[actor]['combat'];im=bpy.data.images.load(str(ROOT/'public'/bank['image'].lstrip('/')));im.alpha_mode='STRAIGHT';im.pack()
    mat=bpy.data.materials.new(actor+'_Reviewed_Combat_RGBA');mat.use_nodes=True;n=mat.node_tree.nodes;n.clear();links=mat.node_tree.links
    tex=n.new('ShaderNodeTexImage');tex.image=im;em=n.new('ShaderNodeEmission');tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');out=n.new('ShaderNodeOutputMaterial')
    links.new(tex.outputs['Color'],em.inputs['Color']);links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(tr.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs[0]);materials[actor]=mat;return mat
def actor_root(actor,label,poses):
    root=bpy.data.objects.new(label,None);scene.collection.objects.link(root);root['actor']=actor;root['pivot']='original standing body center';root['drawingScaleInvariant']=True
    bank=manifest[actor]['combat'];unit=1/bank['bodyHeight']
    for pose in sorted(set(poses)):
        record=bank['poses'][pose];x,y,w,h=record['rect'];px,py=record['centerPivot'];mesh=bpy.data.meshes.new(label+'__'+pose)
        mesh.from_pydata([(-px*unit,0,-(h-py)*unit),((w-px)*unit,0,-(h-py)*unit),((w-px)*unit,0,py*unit),(-px*unit,0,py*unit)],[],[(0,1,2,3)])
        uv=mesh.uv_layers.new()
        for i,(sx,sy) in enumerate([(x,y+h),(x+w,y+h),(x+w,y),(x,y)]):uv.data[i].uv=(sx/bank['width'],1-sy/bank['height'])
        plane=bpy.data.objects.new(label+'__'+pose,mesh);scene.collection.objects.link(plane);plane.parent=root;plane['pose']=pose;plane['completeReviewedDrawing']=True;plane.data.materials.append(material(actor))
    return root
def control(parent,name,feature):
    obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);obj.parent=parent;obj.empty_display_type='SPHERE';obj.empty_display_size=.025;obj['feature']=feature;return obj
def fcurves(action):
    try:return list(action.fcurves)
    except AttributeError:return [f for layer in action.layers for strip in layer.strips for bag in strip.channelbags for f in bag.fcurves]
def in_periods(t,periods):return any(a<=t<=b for a,b in periods)
for id,clip in CLIPS.items():
    start=cursor;end=start+round(clip['duration']*FPS);pair={}
    for role in ['hero','victim']:
        actor=clip['heroId'] if role=='hero' else clip['victimId'];root=actor_root(actor,id+'_'+role,[resolve(clip,role,v['pose']) for v in clip[role]]);pair[role]=root
        for plane in root.children:
            for f in [start-1,end+1]:
                plane.hide_render=True;plane.hide_viewport=True;plane.keyframe_insert(data_path='hide_render',frame=f);plane.keyframe_insert(data_path='hide_viewport',frame=f)
        for phase,value in zip(T,clip[role]):
            frame=start+round(phase*(end-start));root.location=(value['x'],-.01 if role=='hero' else .01,value['z']);root.rotation_euler=(0,value['angle'],0);root.scale=(value['relativeFacing'],1,1)
            root['relativeFacing']=value['relativeFacing'];root['semanticPose']=value['pose']
            for prop in ['location','rotation_euler','scale','["relativeFacing"]']:root.keyframe_insert(data_path=prop,frame=frame)
            actual=resolve(clip,role,value['pose'])
            for plane in root.children:
                plane.hide_render=plane['pose']!=actual;plane.hide_viewport=plane.hide_render;plane.keyframe_insert(data_path='hide_render',frame=frame);plane.keyframe_insert(data_path='hide_viewport',frame=frame)
    grip=control(pair['hero'],id+'_GripAnchor',clip['gripFeature']);grip.location=(clip['gripLocal'][0],0,clip['gripLocal'][1])
    impact=control(pair['victim'],id+'_ImpactAnchor',clip['impactSurface']);impact.location=(clip['impactVictimLocal'][0],0,clip['impactVictimLocal'][1])
    controls[id]=(grip,impact);roots[id]=pair;spans[id]=(start,end)
    for event in clip['events']:scene.timeline_markers.new(id+' / '+event['type'].upper(),frame=start+round(event['at']*(end-start)))
    cursor=end+12
for obj in bpy.data.objects:
    if obj.animation_data and obj.animation_data.action:
        for curve in fcurves(obj.animation_data.action):
            for key in curve.keyframe_points:
                key.interpolation='CONSTANT' if curve.data_path.startswith('hide') or curve.data_path in ['scale','["relativeFacing"]'] else 'BEZIER'
                key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'

# Use the actual raster hull for support. This changes only the complete actor's
# vertical root translation, retaining every painted pixel and body proportion.
ground_report={};unmodified_z={}
for id,clip in CLIPS.items():
    start,end=spans[id];unmodified_z[id]={}
    for frame in range(start,end+1):
        scene.frame_set(frame)
        unmodified_z[id][frame]={role:obj.location.z for role,obj in roots[id].items()}
for id,clip in CLIPS.items():
    start,end=spans[id];lowest=[]
    for frame in range(start,end+1):
        scene.frame_set(frame);phase=(frame-start)/(end-start)
        for role,obj in roots[id].items():
            if not in_periods(phase,clip['groundHero' if role=='hero' else 'groundVictim']):continue
            actor=obj['actor'];pose=next(p['pose'] for p in obj.children if p.get('pose') and not p.hide_render)
            angle=obj.rotation_euler.y;facing=int(obj.get('relativeFacing',1));lift=unmodified_z[id][frame][role]
            minimum=min(-math.sin(angle)*x*facing+math.cos(angle)*z for x,z in hulls[actor]['poses'][pose]['points'])
            obj.location.z=-.5-minimum+max(0,lift);obj.keyframe_insert(data_path='location',index=2,frame=frame)
            lowest.append(obj.location.z+minimum)
    ground_report[id]={'minimumGroundedAlphaZ':min(lowest),'maximumGroundedAlphaZ':max(lowest)}
for pair in roots.values():
    for obj in pair.values():
        for curve in fcurves(obj.animation_data.action):
            if curve.data_path=='location' and curve.array_index==2:
                for key in curve.keyframe_points:key.interpolation='LINEAR'

export={'version':1,'sampleRate':FPS,'unit':'bodyHeight','pivot':'bodyCenter','matZ':-.5,
    'authoring':'Actual Blender keyed complete SD image planes, evaluated action curves and contact controls.',
    'sourceScene':'tools/sd-ring-motion.blend','sourceSpriteHashes':{a:hulls[a]['sourceSHA256'] for a in hulls},
    'coordinateSystem':{'x':'right along captured hero facing','z':'up from original standing body center','angle':'clockwise Canvas radians'},
    'combatPoseMap':COMBAT_POSE_MAP,
    'combatPoseLimitations':{'prone':'Both hero banks lack a face-down prone drawing; the closest existing low side-fall drawing is used. No standing strike fallback is appropriate.'},
    'clips':{}}
inspection={'version':1,'scene':'tools/sd-ring-motion.blend','anatomyAcceptance':'Rendered review required; scale invariants alone do not approve contact artwork.',
    'sceneType':'Packed complete raster planes and kinematic root/contact controls; no skeletal deformation or body-part extraction.','clips':{}}
PUBLIC.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
for id,clip in CLIPS.items():
    start,end=spans[id];frames=[];bounds=[]
    for frame in range(start,end+1):
        scene.frame_set(frame);phase=(frame-start)/(end-start);row={'t':round(phase,6)};deps=bpy.context.evaluated_depsgraph_get()
        for role,obj in roots[id].items():
            pose=next(p['pose'] for p in obj.children if p.get('pose') and not p.hide_render);semantic=next((v['pose'] for t,v in reversed(list(zip(T,clip[role]))) if round(t*(end-start))<=frame-start),clip[role][0]['pose'])
            row[role]={'x':round(obj.location.x,6),'z':round(obj.location.z,6),'angle':round(obj.rotation_euler.y,6),'pose':semantic,
                'relativeFacing':int(obj.get('relativeFacing',1)),'scaleX':1,'scaleY':1}
            for x,z in hulls[obj['actor']]['poses'][pose]['points']:
                point=obj.matrix_world@Vector((x,0,z));bounds.append((point.x,point.z))
        grip,impact=controls[id];g=grip.evaluated_get(deps).matrix_world.translation;i=impact.evaluated_get(deps).matrix_world.translation
        row['grip']={'active':in_periods(phase,clip['gripPeriods']),'feature':clip['gripFeature'],'source':'Blender evaluated GripAnchor','x':round(g.x,6),'z':round(g.z,6)}
        row['impactAnchor']={'surface':clip['impactSurface'],'source':'Blender evaluated victim-relative ImpactAnchor','x':round(i.x,6),'z':round(i.z,6)}
        if id.endswith('cornerDive'):row['travelProgress']=round(min(1,max(0,roots[id]['hero'].location.x/clip['travel']['xEnd'])),6)
        frames.append(row)
    meta={k:copy.deepcopy(v) for k,v in clip.items() if k not in ['times','hero','victim','groundHero','groundVictim','gripLocal','impactVictimLocal']}
    meta.update({'authoredKeyCount':len(T),'frames':frames,'grounding':'Actual alpha>160 convex hull, complete-actor Z translation only.'})
    export['clips'][id]=meta
    record={'timeline':[start,end],'authoredKeyCount':len(T),'sampleCount':len(frames),'heroStart':frames[0]['hero'],'heroEnd':frames[-1]['hero'],'victimEnd':frames[-1]['victim'],
        'heroRotationRange':max(f['hero']['angle'] for f in frames)-min(f['hero']['angle'] for f in frames),'sourceScaleMinMax':[1,1],**ground_report[id],
        'holdSample':min(frames,key=lambda f:abs(f['t']-clip['holdAt'])) if 'holdAt' in clip else None,'reviewFrames':[]}
    assert all(math.isfinite(value) for row in frames for role in ['hero','victim'] for key,value in row[role].items() if isinstance(value,(float,int)))
    if not args.skip_renders:
        minx=min(x for x,z in bounds);maxx=max(x for x,z in bounds);minz=min(z for x,z in bounds);maxz=max(z for x,z in bounds)
        camdata=bpy.data.cameras.new(id+'_ReviewCamera');camdata.type='ORTHO';camdata.ortho_scale=max(2.6,maxx-minx+.4,(maxz-minz+.4)*640/384)
        camera=bpy.data.objects.new(id+'_ReviewCamera',camdata);scene.collection.objects.link(camera);cx=(minx+maxx)/2;cz=(minz+maxz)/2
        camera.location=(cx,-8,cz);camera.rotation_euler=(PI/2,0,0);scene.camera=camera
        phases=[0,.21,clip.get('holdAt',.40),clip['impactAt'],.87]
        for index,phase in enumerate(phases):
            frame=start+round(phase*(end-start));scene.frame_set(frame);name=f'{id}-{index:02}.png';scene.render.filepath=str(REVIEW/name);bpy.ops.render.render(write_still=True)
            record['reviewFrames'].append({'image':name,'phase':phase,'frame':frame})
    inspection['clips'][id]=record
assert inspection['clips']['nova_cornerDive']['heroRotationRange']>=2*PI-1e-5
(PUBLIC/'ring.json').write_text(json.dumps(export,separators=(',',':')))
(REVIEW/'inspection.json').write_text(json.dumps(inspection,indent=2))
scene.frame_start=1;scene.frame_end=cursor-12;scene.frame_set(1)
scene['ringMotionAuthoring']=True;scene['matZ']=-.5;scene['drawingScaleInvariant']='scaleX=scaleY=1; discrete isotropic reflection only';scene['sourceSpriteHashes']=json.dumps(export['sourceSpriteHashes'])
scene['phasePolicy']='Normalized t; holdAt contests freeze the sampled actor pair; escape clips are separate.'
text=bpy.data.texts.new('ring-motion-export.json');text.write(json.dumps(export,indent=2))
text=bpy.data.texts.new('ring-motion-inspection.json');text.write(json.dumps(inspection,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-ring-motion.blend'),compress=True)
print(f'Exported {len(CLIPS)} real Blender ring actions at60Hz; packed original Atlas/Nova art and review frames saved.')
