"""Author and sample the 28 SD combat clips in real Blender at 60 Hz.
Blender --background --factory-startup --python tools/build-combat-motion.py
Each paired technique has 12+ authored transform keys, grip/contact markers,
independent hero/victim motion, and a dedicated recovery section.
"""
from pathlib import Path
import bpy,json,math
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

# Twelve independently authored opponent trajectories per directional technique.
# The paths intentionally differ in lift height, acceleration, turnover, landing
# side and hold rather than merely renaming one common throw.
PROFILES={
'atlas_front_up':('하이 리프트 파워밤',1.55,[(.54,0,0),(.51,.01,0),(.45,.04,-.12),(.25,.22,.75),(.10,.46,2.3),(.07,.82,PI),(.12,.83,PI+.08),(.40,.47,4.02),(.97,-.21,1.5*PI),(1.06,-.20,1.5*PI),(1.1,-.21,1.5*PI),(1.12,-.21,1.5*PI)]),
'atlas_front_down':('싯아웃 파워밤',1.34,[(.54,0,0),(.5,0,0),(.43,.02,-.15),(.23,.17,.8),(.09,.40,2.5),(.10,.56,PI),(.22,.55,3.55),(.44,.21,4.22),(.72,-.22,1.5*PI),(.75,-.21,1.5*PI),(.79,-.22,1.5*PI),(.82,-.22,1.5*PI)]),
'atlas_front_left':('스핀 파워밤',1.58,[(.54,0,0),(.49,0,.05),(.43,.04,.15),(.20,.23,1.0),(.10,.49,2.8),(-.14,.61,4.12),(-.28,.58,5.37),(.15,.32,7.0),(.90,-.21,2.5*PI),(.99,-.20,2.5*PI),(1.04,-.21,2.5*PI),(1.05,-.21,2.5*PI)]),
'atlas_front_right':('러닝 파워밤',1.49,[(.54,0,0),(.53,0,0),(.46,.03,-.1),(.27,.20,.8),(.28,.42,2.4),(.51,.56,PI),(.77,.53,3.5),(1.1,.28,4.2),(1.57,-.21,1.5*PI),(1.68,-.20,1.5*PI),(1.74,-.21,1.5*PI),(1.76,-.21,1.5*PI)]),
'atlas_rear_up':('리버스 파워밤',1.52,[(.43,0,0),(.4,.01,0),(.35,.04,-.1),(.13,.22,-.55),(.04,.46,-2.5),(-.06,.70,-PI),(-.31,.65,-3.65),(-.57,.29,-4.23),(-.94,-.21,-1.5*PI),(-1.01,-.20,-1.5*PI),(-1.06,-.21,-1.5*PI),(-1.08,-.21,-1.5*PI)]),
'atlas_rear_down':('백클린치 슬램',1.26,[(.43,0,0),(.40,0,0),(.34,.025,-.05),(.18,.15,-.28),(.08,.33,-.67),(-.18,.41,-.98),(-.40,.27,-1.25),(-.67,.03,-1.48),(-.84,-.22,-PI/2),(-.89,-.21,-PI/2),(-.92,-.22,-PI/2),(-.94,-.22,-PI/2)]),
'atlas_rear_left':('턴오버 파워밤',1.54,[(.43,0,0),(.4,.01,0),(.35,.03,.1),(.14,.2,1.0),(-.02,.45,2.35),(-.17,.56,3.8),(.03,.57,5.2),(.39,.27,6.9),(.86,-.21,2.5*PI),(.96,-.20,2.5*PI),(1.0,-.21,2.5*PI),(1.02,-.21,2.5*PI)]),
'atlas_rear_right':('백 리프트밤',1.46,[(.43,0,0),(.40,.01,0),(.33,.04,-.12),(.16,.25,.9),(.10,.56,2.7),(.21,.73,PI),(.38,.65,3.5),(.69,.32,4.15),(1.15,-.21,1.5*PI),(1.22,-.20,1.5*PI),(1.26,-.21,1.5*PI),(1.28,-.21,1.5*PI)]),
'nova_front_up':('버티컬 스플렉스',1.57,[(.54,0,0),(.5,.01,0),(.42,.03,-.12),(.24,.28,1.13),(.11,.66,2.8),(.02,.84,PI),(-.22,.75,3.6),(-.62,.35,4.22),(-1.04,-.21,1.5*PI),(-1.1,-.20,1.5*PI),(-1.12,-.21,1.5*PI),(-1.14,-.21,1.5*PI)]),
'nova_front_down':('벨리 투 벨리',1.35,[(.54,0,0),(.5,.01,0),(.41,.03,.08),(.23,.18,.25),(.10,.38,.65),(.20,.52,1.01),(.52,.40,1.27),(.80,.15,1.46),(1.06,-.21,PI/2),(1.14,-.20,PI/2),(1.18,-.21,PI/2),(1.2,-.21,PI/2)]),
'nova_front_left':('피셔맨 스플렉스',1.47,[(.54,0,0),(.49,0,0),(.4,.03,-.12),(.20,.22,.55),(.06,.42,1.1),(-.11,.55,2.5),(-.38,.42,3.6),(-.7,.15,4.3),(-.98,-.21,1.5*PI),(-1.0,-.20,1.5*PI),(-1.02,-.21,1.5*PI),(-1.04,-.21,1.5*PI)]),
'nova_front_right':('스냅 스플렉스',1.08,[(.54,0,0),(.50,0,0),(.40,.02,-.1),(.22,.14,.65),(.07,.35,2.2),(-.18,.42,3.25),(-.47,.27,3.92),(-.76,.02,4.5),(-1.01,-.21,1.5*PI),(-1.08,-.20,1.5*PI),(-1.11,-.21,1.5*PI),(-1.12,-.21,1.5*PI)]),
'nova_rear_up':('저먼 스플렉스',1.48,[(.43,0,0),(.40,.01,0),(.33,.03,-.06),(.15,.22,-.30),(-.03,.47,-.60),(-.24,.64,-.85),(-.56,.51,-1.11),(-.87,.18,-1.39),(-1.09,-.21,-PI/2),(-1.14,-.20,-PI/2),(-1.16,-.21,-PI/2),(-1.18,-.21,-PI/2)]),
'nova_rear_down':('드래곤 스플렉스',1.58,[(.43,0,0),(.40,0,0),(.34,.025,-.05),(.14,.25,-.18),(-.03,.56,-.52),(-.27,.76,-.91),(-.62,.56,-1.17),(-.98,.18,-1.43),(-1.24,-.21,-PI/2),(-1.29,-.20,-PI/2),(-1.31,-.21,-PI/2),(-1.32,-.21,-PI/2)]),
'nova_rear_left':('사이드 스플렉스',1.36,[(.43,0,0),(.40,0,0),(.33,.03,.08),(.17,.20,.32),(.19,.41,.6),(.35,.47,.96),(.65,.33,1.2),(.91,.09,1.43),(1.12,-.21,PI/2),(1.2,-.20,PI/2),(1.24,-.21,PI/2),(1.25,-.21,PI/2)]),
'nova_rear_right':('롤링 저먼',1.67,[(.43,0,0),(.39,0,0),(.32,.03,-.1),(.11,.24,-.45),(-.07,.51,-.98),(-.36,.59,-1.5),(-.62,.43,-2.45),(-.69,.16,-3.74),(-.79,-.21,-1.5*PI),(-.87,-.20,-1.5*PI),(-.92,-.21,-1.5*PI),(-.94,-.21,-1.5*PI)])
}

for id,(name,duration,opponent) in PROFILES.items():
 hero,side,direction=id.split('_');running=direction=='right' and hero=='atlas';spin=direction=='left' and hero=='atlas';forward=hero=='nova' and direction=='down' and side=='front' or hero=='nova' and direction=='left' and side=='rear'
 if hero=='atlas':
  xs=[0,.01,.02,.02,.02,.05,.08,.10,.11,.08,.025,0];zs=[0,-.015,-.045,-.09,.02,.07,.08,.01,-.12,-.07,-.02,0];angles=[0,0,-.03,-.06,-.025,0,.025,.055,.10,.08,.02,0]
  if direction=='up':zs[5]=.10;zs[6]=.12
  if direction=='down':zs[8]=-.19;zs[9]=-.14
  if side=='rear' and direction=='down':angles=[0,-.01,-.03,-.10,-.26,-.44,-.66,-.92,-1.05,-.62,-.20,0]
  if running:xs=[0,.015,.025,.05,.14,.32,.56,.68,.64,.43,.18,0]
  if spin:angles=[0,.01,.02,.035,.05,.08,.09,.10,.12,.07,.02,0]
 else:
  xs=[0,.01,.015,.005,-.025,-.10,-.22,-.34,-.43,-.31,-.12,0];zs=[0,-.015,-.035,-.07,.025,.085,.055,-.035,-.15,-.085,-.025,0];angles=[0,-.01,-.025,-.065,-.15,-.33,-.57,-.85,-1.12,-.72,-.25,0]
  if forward:xs=[0,.01,.02,.035,.08,.16,.25,.32,.35,.24,.10,0];angles=[0,0,.02,.05,.1,.24,.47,.75,.94,.6,.2,0]
  if side=='rear' and direction=='right':angles=[0,-.01,-.03,-.10,-.28,-.60,-1.2,-2.30,-3.1,-2.05,-.80,0]
 poses=['clinch','clinch','underhook','underhook','overhead','overhead','throwArc','throwArc','slam','slam','recover','idle']
 if hero=='nova' and not(direction=='up' and side=='front'):poses[4]='underhook';poses[5]='underhook'
 opponent_poses=['rearFacing' if side=='rear' else 'idle']*2+['hurt']*10
 CLIPS[id]={'name':name,'heroId':hero,'type':'grapple','direction':side,'inputDirection':direction,'duration':duration,'contactAt':.11,'impactAt':.72,'recoveryAt':.81,'recovery':.17,'times':K,'hero':[state(x,z,a,p) for x,z,a,p in zip(xs,zs,angles,poses)],'victim':keys(opponent,opponent_poses),'gripPeriods':[[.11,.44]],'events':[{'at':.11,'type':'grip'},{'at':.43,'type':'apex'},{'at':.72,'type':'impact'},{'at':.90,'type':'release'}]}

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

spans={};cursor=1
for id,clip in CLIPS.items():
 start=cursor;end=start+round(clip['duration']*FPS);hero=actor(clip.get('heroId','atlas'),id+'_Hero',[value['pose'] for value in clip['hero']]);victim=actor('viper',id+'_Victim',[value['pose'] for value in clip['victim']]);spans[id]=(hero,victim,start,end)
 for root in [hero,victim]:
  for child in root.children:
   for boundary in [start-1,end+1]:child.hide_render=True;child.hide_viewport=True;child.keyframe_insert(data_path='hide_render',frame=boundary);child.keyframe_insert(data_path='hide_viewport',frame=boundary)
 for phase,hero_state,victim_state in zip(clip['times'],clip['hero'],clip['victim']):
  frame=start+round(phase*(end-start))
  for root,value in [(hero,hero_state),(victim,victim_state)]:
   root.location=(value['x'],0,value['z']);root.rotation_euler=(0,value['angle'],0);root.scale=(value['scaleX'],1,value['scaleY'])
   for prop in ['location','rotation_euler','scale']:root.keyframe_insert(data_path=prop,frame=frame)
   for child in root.children:
    child.hide_render=child['pose']!=value['pose'];child.hide_viewport=child.hide_render;child.keyframe_insert(data_path='hide_render',frame=frame);child.keyframe_insert(data_path='hide_viewport',frame=frame)
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
    key.interpolation='CONSTANT' if curve.data_path.startswith('hide_') else 'BEZIER';key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'

export={'version':2,'sampleRate':FPS,'unit':'bodyHeight','pivot':'bodyCenter','authoring':'Blender 5.2.2 LTS','coordinateSystem':{'x':'right along hero facing','z':'up','angle':'clockwise Canvas radians'},'clips':{}}
report={'version':1,'scene':'sd-combat.blend','upAxis':'Z','forwardAxis':'X','pivot':'bodyCenter','sampleRate':FPS,'clips':{}}
for id,(hero,victim,start,end) in spans.items():
 clip=CLIPS[id];frames=[];visible_records=[]
 for frame in range(start,end+1):
  scene.frame_set(frame);phase=(frame-start)/(end-start);record={'t':round(phase,6)}
  for label,obj in [('hero',hero),('victim',victim)]:
   visible=next((child['pose'] for child in obj.children if not child.hide_render),'idle')
   record[label]={'x':round(obj.location.x,6),'z':round(obj.location.z,6),'angle':round(obj.rotation_euler.y,6),'scaleX':round(obj.scale.x,6),'scaleY':round(obj.scale.z,6),'pose':visible}
  # Separate grip anchor exported for motion/state QA. It is stable relative to
  # the actual opponent during the hold and follows the two actors' trajectory.
  active=any(a<=phase<=b for a,b in clip['gripPeriods'])
  record['grip']={'active':active,'type':clip.get('gripType','waist'),'x':round((record['hero']['x']+record['victim']['x'])*.5,6),'z':round((record['hero']['z']+record['victim']['z'])*.5,6)}
  frames.append(record)
 metadata={key:value for key,value in clip.items() if key not in ['times','hero','victim']};metadata.update({'authoredKeyCount':len(clip['times']),'poseBlend':.085,'frames':frames})
 export['clips'][id]=metadata;report['clips'][id]={'startFrame':start,'endFrame':end,'authoredKeyCount':len(clip['times']),'samples':len(frames),'contactFrame':start+round(clip['contactAt']*(end-start)),'impactFrame':start+round(clip['impactAt']*(end-start)),'heroEnd':frames[-1]['hero'],'victimEnd':frames[-1]['victim'],'maxVictimHeight':round(max(f['victim']['z'] for f in frames),5),'minimumScale':min(f[role]['scaleY'] for f in frames for role in ['hero','victim'])}
(OUT/'combat.json').write_text(json.dumps(export,separators=(',',':')))
(OUT/'combat-inspection.json').write_text(json.dumps(report,separators=(',',':')))
scene.frame_start=1;scene.frame_end=cursor-12;scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-combat.blend'))
print(f'Sampled {len(CLIPS)} detailed Blender combat clips at 60 Hz; editable packed textured scene saved.')
