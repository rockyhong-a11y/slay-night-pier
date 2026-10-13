"""Author and sample the 28 SD combat clips in real Blender at 60 Hz.
Blender --background --factory-startup --python tools/build-combat-motion.py
Each paired technique has 12+ authored transform keys, grip/contact markers,
independent hero/victim motion, and a dedicated recovery section.
"""
from pathlib import Path
import bpy,json,math,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/motion';OUT.mkdir(parents=True,exist_ok=True)
FPS=60;K=[0,.05,.11,.20,.31,.43,.54,.64,.72,.81,.90,1]
PI=math.pi

def state(x=0,z=0,a=0,pose='idle'):return {'x':x,'z':z,'angle':a,'scaleX':1,'scaleY':1,'pose':pose}
def keys(points,poses):return [state(*point,pose) for point,pose in zip(points,poses)]
CLIPS={}

def strike(name,duration,contact,hero_points,poses):
 times=[0,.07,.10 if name=='jab' else .16,.22 if name=='chargeStrike' else .20 if name=='launcher' else .25,contact,.49,.59,.69,.80,.91,1]
 # Draw the fully extended limb 85ms before contact so runtime pose blending
 # reaches full opacity at impact, then retain it through the follow-through.
 poses=list(poses)
 if name in ['jab','cross']:poses[2]=name
 if name=='launcher':poses[3]='launcher'
 if name=='chargeStrike':poses[3]='cross'
 times=sorted(set(times));hero=[]
 for index,t in enumerate(times):
  point=hero_points[min(index,len(hero_points)-1)];hero.append(state(*point,poses[min(index,len(poses)-1)]))
 victim=[state(.62,0,0,'idle') for _ in times]
 for i,t in enumerate(times):
  if t>=contact:victim[i]=state(.62+.13*min(1,(t-contact)/.24),.04*math.sin(PI*min(1,(t-contact)/.4)),-.10,'hurt')
 CLIPS[name]={'type':'strike','duration':duration,'contactAt':contact,'impactAt':contact,'recoveryAt':.72,'recovery':.1,'times':times,'hero':hero,'victim':victim,'gripPeriods':[],'events':[{'at':contact,'type':'hit'}]}

strike('jab',.34,.36,[(0,0,0),(-.015,0,-.02),(-.02,-.015,-.02),(.01,0,.01),(.055,.01,.035),(.06,.005,.025),(.045,0,.018),(.018,0,.01),(.007,0,0),(0,0,0),(0,0,0)],['idle','windup','windup','jab','jab','jab','jab','strikeRecovery','strikeRecovery','idle','idle'])
strike('cross',.40,.39,[(0,0,0),(-.025,0,-.04),(-.03,-.01,-.04),(.005,0,-.01),(.095,.015,.045),(.10,.005,.04),(.07,0,.03),(.035,0,.01),(.01,0,0),(0,0,0),(0,0,0)],['strikeRecovery','windup','windup','cross','cross','cross','cross','strikeRecovery','strikeRecovery','idle','idle'])
strike('lowKick',.45,.37,[(0,0,0),(-.015,0,-.02),(-.025,-.012,-.03),(-.02,.01,-.025),(.045,.015,-.04),(.05,.005,-.03),(.032,0,-.025),(.014,0,-.01),(.005,0,0),(0,0,0),(0,0,0)],['strikeRecovery','windup','lowKick','lowKick','lowKick','lowKick','lowKick','strikeRecovery','strikeRecovery','idle','idle'])
strike('roundhouse',.51,.39,[(0,0,0),(-.02,-.01,-.035),(-.015,.01,-.04),(.015,.045,-.05),(.065,.07,-.045),(.08,.06,-.02),(.07,.03,0),(.045,.015,.01),(.015,0,.005),(0,0,0),(0,0,0)],['strikeRecovery','windup','roundhouse','roundhouse','roundhouse','roundhouse','roundhouse','strikeRecovery','recover','idle','idle'])
strike('launcher',.61,.36,[(0,0,0),(-.045,-.035,-.06),(-.07,-.055,-.085),(-.025,-.025,-.02),(.13,.06,.04),(.17,.095,.025),(.14,.06,.015),(.08,.015,.01),(.03,0,.005),(0,0,0),(0,0,0)],['charge','charge','charge','windup','launcher','launcher','cross','strikeRecovery','recover','idle','idle'])
strike('chargeStrike',.64,.37,[(0,0,0),(-.04,-.025,-.06),(-.075,-.04,-.08),(-.025,-.018,-.035),(.17,.025,.035),(.20,.04,.04),(.16,.02,.035),(.085,.01,.015),(.025,0,0),(0,0,0),(0,0,0)],['charge','charge','charge','windup','cross','cross','cross','strikeRecovery','recover','idle','idle'])
for name in ['launcher','chargeStrike']:
 clip=CLIPS[name]
 for i,t in enumerate(clip['times']):
  if t>=clip['contactAt']:
   progress=min(1,(t-clip['contactAt'])/.42)
   clip['victim'][i]=state(.62+.55*progress,.32*math.sin(PI*progress),2*PI*progress,'hurt' if progress<.85 else 'rearFacing')

# Anatomically distinct headlocks, knee drops, arm throws, scissors and pins.
import sys
sys.path.insert(0,str(ROOT/'tools'))
from wrestling_techniques import author_techniques
CLIPS.update(author_techniques(state))
CLIPS['atlas_front_left']['victimFrontDuring']=[.29,.65]

# A second lift and second impact are authored, not simulated by repeating one clip.
for hero in ['atlas','nova']:
 times=[0,.04,.09,.15,.22,.30,.38,.42,.47,.53,.61,.67,.72,.78,.85,.92,1]
 if hero=='atlas':
  opponent=[(.50,0,0),(.44,.02,-.1),(.30,.13,.8),(.13,.42,2.5),(.08,.61,PI),(.39,.30,4.1),(.75,-.21,1.5*PI),(.73,-.16,1.5*PI),(.40,.14,2.7),(.18,.42,PI),(.08,.80,PI),(.20,.75,3.5),(.46,.25,4.25),(.97,-.21,1.5*PI),(1.08,-.20,1.5*PI),(1.12,-.21,1.5*PI),(1.14,-.21,1.5*PI)]
  xs=[0,.01,.02,.03,.05,.07,.10,.08,.04,.03,.04,.08,.13,.15,.1,.04,0];zs=[0,-.03,-.07,.01,.08,-.01,-.13,-.05,-.08,.01,.10,.07,-.04,-.17,-.08,-.02,0];angles=[0,-.02,-.06,0,.02,.06,.1,.06,-.03,0,0,.03,.08,.1,.05,.02,0]
 else:
  opponent=[(.42,0,0),(.39,.015,0),(.27,.10,-.20),(.10,.35,-.53),(-.18,.52,-.8),(-.57,.25,-1.28),(-.87,-.21,-PI/2),(-.81,-.12,-1.6),(-.46,.13,-2.30),(-.20,.35,-3.10),(-.03,.57,-3.85),(-.18,.54,-4.50),(-.53,.17,-5.55),(-.98,-.21,-2.5*PI),(-1.06,-.20,-2.5*PI),(-1.1,-.21,-2.5*PI),(-1.12,-.21,-2.5*PI)]
  xs=[0,.01,.01,-.01,-.09,-.25,-.37,-.27,-.11,-.04,-.07,-.20,-.37,-.45,-.3,-.1,0];zs=[0,-.02,-.06,.03,.08,.01,-.14,-.03,-.05,.02,.08,.03,-.03,-.17,-.08,-.02,0];angles=[0,-.03,-.10,-.25,-.44,-.82,-1.08,-.67,-.23,-.10,-.25,-.56,-.92,-1.20,-.76,-.25,0]
 poses=['clinch','underhook','underhook','overhead','overhead','throwArc','slam','recover','clinch','underhook','overhead','throwArc','throwArc','slam','slam','recover','idle']
 CLIPS[hero+'_chain']={'name':'킹 오브 부두' if hero=='atlas' else '롤링 스플렉스 체인','heroId':hero,'type':'chain','direction':'front' if hero=='atlas' else 'rear','duration':2.05,'contactAt':.09,'impactAt':.78,'impacts':[.38,.78],'recoveryAt':.85,'recovery':.17,'times':times,'hero':[state(x,z,a,p) for x,z,a,p in zip(xs,zs,angles,poses)],'victim':keys(opponent,['hurt']*len(times)),'gripPeriods':[[.09,.23],[.47,.62]],'events':[{'at':.09,'type':'grip'},{'at':.38,'type':'impact'},{'at':.47,'type':'regrip'},{'at':.78,'type':'impact'},{'at':.92,'type':'release'}]}

for hero in ['atlas','nova']:
 for kind in ['slam','armLock']:
  poses=['guard','guard','parry','wristCatch','hipTurn','overhead','throwArc','throwArc','slam','slam','recover','idle']
  if kind=='armLock':poses=['guard','guard','parry','wristCatch','armLock','armLock','hipTurn','armLock','armLock','recover','recover','idle']
  xs=[0,-.01,-.015,.01,.02,.03,.045,.055,.055,.04,.01,0];zs=[0,0,-.01,-.02,-.035,.02,.025,-.045,-.11,-.055,-.015,0];angles=[0,-.015,-.02,.015,.05,.03,.06,.09,.1,.07,.02,0]
  if hero=='nova':xs=[-x for x in xs];angles=[-a*5 for a in angles]
  if kind=='slam':
   opponent=[(.56,0,0),(.55,0,0),(.47,.02,-.04),(.37,.07,-.12),(.22,.23,.55),(.10,.43,2.5),(.17,.39,3.5),(.42,.17,4.3),(.80,-.21,1.5*PI),(.87,-.20,1.5*PI),(.92,-.21,1.5*PI),(.94,-.21,1.5*PI)]
   if hero=='nova':opponent=[(-x+.55 if i>3 else x,z,-a) for i,(x,z,a) in enumerate(opponent)]
  else:opponent=[(.56,0,0),(.55,0,0),(.47,.01,-.04),(.42,.03,.15),(.45,-.015,.35),(.43,-.035,.61),(.42,-.07,.86),(.46,-.11,1.11),(.55,-.21,PI/2),(.63,-.20,PI/2),(.67,-.21,PI/2),(.68,-.21,PI/2)]
  CLIPS[f'{hero}_counter_{kind}']={'name':('캐치 파워슬램' if hero=='atlas' else '리버설 스플렉스') if kind=='slam' else ('숄더 록 슬램' if hero=='atlas' else '스탠딩 암브레이커'),'heroId':hero,'type':'counter','direction':'front','duration':1.26 if kind=='slam' else 1.34,'contactAt':.20,'impactAt':.72,'recoveryAt':.81,'recovery':.18,'times':K,'hero':[state(x,z,a,p) for x,z,a,p in zip(xs,zs,angles,poses)],'victim':keys(opponent,['jab','jab']+['hurt']*10),'gripPeriods':[[.20,.43]] if kind=='slam' else [[.20,.64]],'gripType':'waist' if kind=='slam' else 'wrist','events':[{'at':.11,'type':'parry'},{'at':.20,'type':'grip'},{'at':.72,'type':'impact'},{'at':.90,'type':'release'}]}

# Real Blender authoring scene; each move has its own objects and timeline span.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=FPS;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.render.resolution_x=640;scene.render.resolution_y=384;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(0,-8,.25));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.25))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.5;scene.camera=camera
manifest=json.loads((ROOT/'public/assets/sprites/manifest.json').read_text());materials={}
def material(character):
 if character in materials:return materials[character]
 bank=manifest[character]['combat'];image=bpy.data.images.load(str(ROOT/'public'/bank['image'].lstrip('/')));image.pack();mat=bpy.data.materials.new(character+'_Combat_Bank');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();tex=nodes.new('ShaderNodeTexImage');tex.image=image;em=nodes.new('ShaderNodeEmission');tr=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial');links=mat.node_tree.links;links.new(tex.outputs['Color'],em.inputs['Color']);links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(tr.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0]);materials[character]=mat;return mat

def actor(character,label,poses):
 root=bpy.data.objects.new(label,None);scene.collection.objects.link(root);root['character']=character;root['pivot']='bodyCenter';root['upAxis']='Z';root['forwardAxis']='X';bank=manifest[character]['combat']
 for pose in sorted(set(poses)):
  frame=bank['poses'].get(pose) or bank['poses'].get('idle') or next(iter(bank['poses'].values()));x,y,w,h=frame['rect'];px,pz=frame['centerPivot'];unit=1/bank['bodyHeight'];mesh=bpy.data.meshes.new(label+'_'+pose+'_Mesh');mesh.from_pydata([(-px*unit,0,-(h-pz)*unit),((w-px)*unit,0,-(h-pz)*unit),((w-px)*unit,0,pz*unit),(-px*unit,0,pz*unit)],[],[(0,1,2,3)]);uv=mesh.uv_layers.new()
  for i,(cx,cy) in enumerate([(x,y+h),(x+w,y+h),(x+w,y),(x,y)]):uv.data[i].uv=(cx/bank['width'],1-cy/bank['height'])
  obj=bpy.data.objects.new(label+'__'+pose,mesh);scene.collection.objects.link(obj);obj.parent=root;obj['pose']=pose;obj.data.materials.append(material(character))
 return root

def control(parent,label,feature):
 obj=bpy.data.objects.new(label,None);scene.collection.objects.link(obj);obj.parent=parent
 obj.empty_display_type='SPHERE';obj.empty_display_size=.035;obj['feature']=feature;obj['unit']='bodyHeight';obj['source']='authored anatomical contact control'
 return obj

spans={};controls={};cursor=1
for id,clip in CLIPS.items():
 start=cursor;end=start+round(clip['duration']*FPS);hero=actor(clip.get('heroId','atlas'),id+'_Hero',[value['pose'] for value in clip['hero']]);victim=actor('viper',id+'_Victim',[value['pose'] for value in clip['victim']]);spans[id]=(hero,victim,start,end)
 grip=control(hero,id+'_GripAnchor',clip.get('gripFeature',clip.get('gripType','waist')))
 impact=control(hero,id+'_ImpactAnchor',clip.get('impactSurface','ground'));controls[id]=(grip,impact)
 for root in [hero,victim]:
  for child in root.children:
   if child.get('pose') is None:continue
   for boundary in [start-1,end+1]:child.hide_render=True;child.hide_viewport=True;child.keyframe_insert(data_path='hide_render',frame=boundary);child.keyframe_insert(data_path='hide_viewport',frame=boundary)
 for index,(phase,hero_state,victim_state) in enumerate(zip(clip['times'],clip['hero'],clip['victim'])):
  frame=start+round(phase*(end-start))
  for root,value in [(hero,hero_state),(victim,victim_state)]:
   relative=value.get('relativeFacing',1)
   front=clip.get('victimFrontDuring');victim_front=front and front[0]<=phase<=front[1]
   depth=(-.01 if root is victim else .01) if victim_front else (-.01 if root is hero else .01)
   root.location=(value['x'],depth,value['z']);root.rotation_euler=(0,value['angle'],0);root.scale=(value['scaleX']*relative,1,value['scaleY'])
   root['relativeFacing']=relative;root.keyframe_insert(data_path='["relativeFacing"]',frame=frame)
   for prop in ['location','rotation_euler','scale']:root.keyframe_insert(data_path=prop,frame=frame)
   for child in root.children:
    if child.get('pose') is None:continue
    child.hide_render=child['pose']!=value['pose'];child.hide_viewport=child.hide_render;child.keyframe_insert(data_path='hide_render',frame=frame);child.keyframe_insert(data_path='hide_viewport',frame=frame)
  grip_local=clip.get('gripLocal',[(.15,.12)]*len(clip['times']))[index]
  grip.location=(grip_local[0],0,grip_local[1]);grip.keyframe_insert(data_path='location',frame=frame)
  if clip.get('impactLocal'):
   local=clip['impactLocal']
  else:
   # The floor contact follows the actual landing actor. Counter/chain roots
   # may rotate, so convert the world floor point into the hero control space.
   dx=victim_state['x']-hero_state['x'];dz=-.5-hero_state['z'];a=hero_state['angle']
   local=(math.cos(a)*dx-math.sin(a)*dz,math.sin(a)*dx+math.cos(a)*dz)
  impact.location=(local[0],0,local[1]);impact.keyframe_insert(data_path='location',frame=frame)
 for event in clip['events']:scene.timeline_markers.new(id+' / '+event['type'].upper(),frame=start+round(event['at']*(end-start)))
 cursor=end+12
# Smooth root transitions, constant raster pose keys; continuous sprite crossfades
# happen in the game using poseBlend below, preserving painted anatomy.
def curves(action):
 try:return list(action.fcurves)
 except AttributeError:return [curve for layer in action.layers for strip in layer.strips for bag in strip.channelbags for curve in bag.fcurves]
for obj in bpy.data.objects:
 if obj.animation_data and obj.animation_data.action:
  for curve in curves(obj.animation_data.action):
   for key in curve.keyframe_points:
    key.interpolation='CONSTANT' if curve.data_path.startswith('hide_') or curve.data_path=='["relativeFacing"]' else 'BEZIER';key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'

# A complete cradle roll rotates the already-curled drawing about its body
# center. Key each grounded frame from that drawing's painted footprint so
# it rolls along the floor instead of orbiting the standing-height pivot.
roll=CLIPS['nova_rear_right'];roll['groundedRoll']=True
hulls=json.loads((ROOT/'tools/pose-contact-hulls.json').read_text())['poses']
for character,poses in hulls.items():
 source=ROOT/'public'/manifest[character]['combat']['image'].lstrip('/')
 digest=hashlib.sha256(source.read_bytes()).hexdigest()
 if any(value['sourceSha256']!=digest for value in poses.values()):raise RuntimeError('Contact hulls are stale; run python3 tools/export-pose-hulls.py first')
roll_hero,roll_victim,roll_start,roll_end=spans['nova_rear_right']
for frame in range(roll_start+round(.29*(roll_end-roll_start)),roll_start+round(.73*(roll_end-roll_start))+1):
 scene.frame_set(frame)
 for obj,character in [(roll_hero,'nova'),(roll_victim,'viper')]:
  pose=next(child['pose'] for child in obj.children if child.get('pose') is not None and not child.hide_render)
  a=obj.rotation_euler.y
  lowest=min(-math.sin(a)*x+math.cos(a)*z for x,z in hulls[character][pose]['points'])
  obj.location.z=-.5-lowest;obj.keyframe_insert(data_path='location',index=2,frame=frame)
for obj in [roll_hero,roll_victim]:
 for curve in curves(obj.animation_data.action):
  if curve.data_path=='location' and curve.array_index==2:
   for key in curve.keyframe_points:key.interpolation='LINEAR'

export={'version':2,'sampleRate':FPS,'unit':'bodyHeight','pivot':'bodyCenter','authoring':'Blender 5.2.2 LTS','coordinateSystem':{'x':'right along hero facing','z':'up','angle':'clockwise Canvas radians'},'clips':{}}
report={'version':1,'scene':'sd-combat.blend','upAxis':'Z','forwardAxis':'X','pivot':'bodyCenter','sampleRate':FPS,'clips':{}}
for id,(hero,victim,start,end) in spans.items():
 clip=CLIPS[id];frames=[];visible_records=[]
 for frame in range(start,end+1):
  scene.frame_set(frame);phase=(frame-start)/(end-start);record={'t':round(phase,6)}
  for label,obj in [('hero',hero),('victim',victim)]:
   visible=next((child['pose'] for child in obj.children if child.get('pose') is not None and not child.hide_render),'idle')
   record[label]={'x':round(obj.location.x,6),'z':round(obj.location.z,6),'angle':round(obj.rotation_euler.y,6),'scaleX':round(abs(obj.scale.x),6),'scaleY':round(abs(obj.scale.z),6),'relativeFacing':int(obj.get('relativeFacing',1)),'pose':visible}
  # Sample evaluated Blender contact controls, never an actor midpoint.
  active=any(a<=phase<=b for a,b in clip['gripPeriods'])
  grip,impact=controls[id];depsgraph=bpy.context.evaluated_depsgraph_get()
  grip_world=grip.evaluated_get(depsgraph).matrix_world.translation;impact_world=impact.evaluated_get(depsgraph).matrix_world.translation
  record['grip']={'active':active,'type':clip.get('gripType','waist'),'feature':grip['feature'],'source':'Blender evaluated GripAnchor','x':round(grip_world.x,6),'z':round(grip_world.z,6)}
  record['impactAnchor']={'surface':clip.get('impactSurface','ground'),'source':'Blender evaluated ImpactAnchor','x':round(impact_world.x,6),'z':round(impact_world.z,6)}
  frames.append(record)
 metadata={key:value for key,value in clip.items() if key not in ['times','hero','victim']};metadata.update({'authoredKeyCount':len(clip['times']),'poseBlend':.085,'frames':frames})
 impact_sample=min(frames,key=lambda sample:abs(sample['t']-clip['impactAt']))
 export['clips'][id]=metadata;report['clips'][id]={'startFrame':start,'endFrame':end,'authoredKeyCount':len(clip['times']),'samples':len(frames),'contactFrame':start+round(clip['contactAt']*(end-start)),'impactFrame':start+round(clip['impactAt']*(end-start)),'heroEnd':frames[-1]['hero'],'victimEnd':frames[-1]['victim'],'maxVictimHeight':round(max(f['victim']['z'] for f in frames),5),'minimumScale':min(f[role][axis] for f in frames for role in ['hero','victim'] for axis in ['scaleX','scaleY']),'maximumScale':max(f[role][axis] for f in frames for role in ['hero','victim'] for axis in ['scaleX','scaleY']),'gripControl':controls[id][0].name,'gripFeature':controls[id][0]['feature'],'impactControl':controls[id][1].name,'impactAnchor':impact_sample['impactAnchor']}
(OUT/'combat.json').write_text(json.dumps(export,separators=(',',':')))
(OUT/'combat-inspection.json').write_text(json.dumps(report,separators=(',',':')))
scene.frame_start=1;scene.frame_end=cursor-12;scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-combat.blend'))
print(f'Sampled {len(CLIPS)} detailed Blender combat clips at 60 Hz; editable packed textured scene saved.')
