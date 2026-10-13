"""Render true articulated SD combat raster poses in Blender.
Blender --background --factory-startup --python tools/build-combat-poses.py -- --source /path/to/original-motion-kit --output /tmp/combat-pose-renders
The source directory contains the original directional kit manifest.json and ten .webp sheets.
"""
from pathlib import Path
import argparse,sys,json,math
import bpy
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
opt=parser.parse_args(args);source=Path(opt.source);out=Path(opt.output);out.mkdir(parents=True,exist_ok=True)
ROOT=Path(__file__).resolve().parents[1]
kits=json.loads((source/'manifest.json').read_text())['characters']
POSES=['idle','windup','jab','cross','lowKick','roundhouse','strikeRecovery','launcher','charge','clinch','underhook','overhead','throwArc','slam','recover','guard','parry','wristCatch','hipTurn','armLock','hurt','back']
HEIGHT=298;CELL=512;ORTHO=424;CAM_X=30;CAM_Z=170
body_height=HEIGHT*CELL/ORTHO
pivot=[CELL/2-CAM_X*CELL/ORTHO,CELL/2+CAM_Z*CELL/ORTHO]
center_pivot=[pivot[0],pivot[1]-body_height/2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=CELL;scene.render.resolution_y=CELL;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.view_settings.view_transform='Standard'
bpy.ops.object.camera_add(location=(CAM_X,-800,CAM_Z));camera=bpy.context.object;camera.rotation_euler=(math.pi/2,0,0);camera.data.type='ORTHO';camera.data.ortho_scale=ORTHO;scene.camera=camera

def two_bone(a,b,l1,l2,pole=1):
 d=Vector((b[0]-a[0],b[1]-a[1]));length=min(l1+l2-.01,max(abs(l1-l2)+.01,d.length));direction=d.normalized() if d.length else Vector((0,1));perp=Vector((-direction.y,direction.x))*pole
 along=(l1*l1+length*length-l2*l2)/(2*length);across=math.sqrt(max(0,l1*l1-along*along));joint=Vector(a)+direction*along+perp*across;end=Vector(a)+direction*length
 return tuple(joint),tuple(end)

def skeleton(pose):
 pelvis=100;lean=6;headLean=0;hands={'L':(43,166),'R':(34,148)};feet={'L':(-26,0),'R':(29,0)}
 if pose=='windup':pelvis=95;lean=-6;hands={'L':(9,183),'R':(24,174)}
 if pose=='jab':lean=15;hands={'L':(122,182),'R':(27,169)}
 if pose=='cross':lean=20;hands={'L':(37,175),'R':(128,180)}
 if pose=='lowKick':pelvis=100;lean=-7;feet={'L':(-26,0),'R':(89,60)};hands={'L':(35,185),'R':(24,174)}
 if pose=='roundhouse':pelvis=111;lean=-20;feet={'L':(-25,0),'R':(112,176)};hands={'L':(24,201),'R':(-13,194)}
 if pose=='strikeRecovery':pelvis=95;lean=9;hands={'L':(56,153),'R':(33,169)}
 if pose=='launcher':pelvis=103;lean=12;hands={'L':(66,274),'R':(32,172)}
 if pose=='charge':pelvis=81;lean=-9;hands={'L':(-5,183),'R':(10,189)};feet={'L':(-35,0),'R':(29,0)}
 if pose=='clinch':pelvis=92;lean=12;hands={'L':(82,177),'R':(74,164)}
 if pose=='underhook':pelvis=78;lean=17;hands={'L':(73,180),'R':(61,191)}
 if pose=='overhead':pelvis=104;lean=1;hands={'L':(19,295),'R':(35,286)}
 if pose=='throwArc':pelvis=104;lean=-27;headLean=-10;hands={'L':(-8,246),'R':(12,254)}
 if pose=='slam':pelvis=49;lean=18;hands={'L':(92,94),'R':(78,103)};feet={'L':(-59,0),'R':(64,0)}
 if pose=='recover':pelvis=87;lean=11;hands={'L':(41,142),'R':(37,148)}
 if pose=='guard':pelvis=95;lean=0;hands={'L':(20,226),'R':(44,219)}
 if pose=='parry':lean=12;hands={'L':(106,201),'R':(44,193)}
 if pose=='wristCatch':pelvis=93;lean=14;hands={'L':(108,182),'R':(90,174)}
 if pose=='hipTurn':pelvis=82;lean=-18;hands={'L':(74,160),'R':(67,168)};feet={'L':(-34,0),'R':(48,0)}
 if pose=='armLock':pelvis=80;lean=15;hands={'L':(114,155),'R':(108,171)}
 if pose=='hurt':pelvis=89;lean=-23;headLean=-8;hands={'L':(18,158),'R':(-17,175)}
 p=(0,pelvis);n=(lean,pelvis+86);j={'pelvis':p,'neck':n,'headTop':(lean+headLean,pelvis+198)}
 for suffix,sign in [('L',-1),('R',1)]:
  shoulder=(lean+sign*5,pelvis+79);hip=(sign*7,pelvis-1)
  elbow,wrist=two_bone(shoulder,hands[suffix],60,72,-1 if pose in ['guard','overhead','launcher'] else 1)
  knee,ankle=two_bone(hip,feet[suffix],48,52,-1)
  j.update({f'shoulder{suffix}':shoulder,f'elbow{suffix}':elbow,f'wrist{suffix}':wrist,f'hip{suffix}':hip,f'knee{suffix}':knee,f'ankle{suffix}':ankle})
 return j

all_objects=[];metadata={};material_cache={}
def material(character):
 if character in material_cache:return material_cache[character]
 image=bpy.data.images.load(str(source/f'{character}.webp'));image.pack();mat=bpy.data.materials.new(character+'_Original_Cutout');mat.use_nodes=True
 nodes=mat.node_tree.nodes;nodes.clear();tex=nodes.new('ShaderNodeTexImage');tex.image=image;em=nodes.new('ShaderNodeEmission');tr=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial')
 links=mat.node_tree.links;links.new(tex.outputs['Color'],em.inputs['Color']);links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(tr.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])
 material_cache[character]=mat;return mat

BONES=[('hair','neck','hairTip',130),('thighR','hipR','kneeR',48),('shinR','kneeR','ankleR',52),('upperArmR','shoulderR','elbowR',48),('thighL','hipL','kneeL',48),('shinL','kneeL','ankleL',52),('body','pelvis','neck',86),('upperArmL','shoulderL','elbowL',48),('head','neck','headTop',112),('forearmR','elbowR','wristR',57.6),('forearmL','elbowL','wristL',57.6)]

def create_part(character,view,name,rank,transverse):
 meta=kits[character]['views'][view]['parts'][name];rect=meta['rect'];px,py=meta['pivot'];tx,ty=meta['tip'];x,y,w,h=rect
 if name=='hair':tx,ty=px,h+py;transverse=kits[character]['views'][view]['hairLengthWorld']
 sv=Vector((tx-px,-(ty-py)));sl=sv.length;su=sv.normalized();sp=Vector((su.y,-su.x))
 verts=[]
 for cx,cy in [(0,h),(w,h),(w,0),(0,0)]:
  v=Vector((cx-px,-(cy-py)));verts.append((v.dot(sp)*transverse/sl,0,v.dot(su)))
 mesh=bpy.data.meshes.new(f'{character}_{view}_{name}_Mesh');mesh.from_pydata(verts,[],[(0,1,2,3)]);uv=mesh.uv_layers.new()
 atlasw,atlash=kits[character]['width'],kits[character]['height']
 for i,(cx,cy) in enumerate([(x,y+h),(x+w,y+h),(x+w,y),(x,y)]):uv.data[i].uv=(cx/atlasw,1-cy/atlash)
 obj=bpy.data.objects.new(f'{character}_{view}_{name}',mesh);scene.collection.objects.link(obj);obj.data.materials.append(material(character));obj['sourceCharacter']=character;obj['bone']=name;obj['sourceLength']=sl;obj['view']=view;obj['drawLayer']=rank
 all_objects.append(obj);return obj

for character in kits:
 rigs={}
 for view in ['right','up']:
  rigs[view]={name:create_part(character,view,name,rank,length) for rank,(name,a,b,length) in enumerate(BONES)}
 for obj in all_objects:obj.hide_render=True;obj.hide_viewport=True
 metadata[character]={'bodyHeight':body_height,'pivot':pivot,'centerPivot':center_pivot,'poses':{}}
 for frame,pose in enumerate(POSES,1):
  j=skeleton(pose);view='up' if pose=='back' else 'right';hair_length=kits[character]['views'][view]['hairLengthWorld'];j['hairTip']=(j['neck'][0]-5,j['neck'][1]-hair_length)
  for objects in rigs.values():
   for obj in objects.values():obj.hide_render=True;obj.hide_viewport=True
  for rank,(name,a,b,length) in enumerate(BONES):
   obj=rigs[view][name];obj.hide_render=False;obj.hide_viewport=False;start=j[a];end=j[b];dx,dz=end[0]-start[0],end[1]-start[1]
   obj.location=(start[0],-rank*.05,start[1]);obj.rotation_euler=(0,math.atan2(dx,dz),0);obj.scale=(1,1,math.hypot(dx,dz)/obj['sourceLength'])
   for prop in ['location','rotation_euler','scale','hide_viewport']:obj.keyframe_insert(data_path=prop,frame=frame)
  scene.frame_set(frame)
  # Evaluate keyed transforms first, then isolate exactly this character/view.
  # Other rigs have independent pose keys on the same review timeline.
  for obj in all_objects:obj.hide_render=True
  for obj in rigs[view].values():obj.hide_render=False
  bpy.context.view_layer.update()
  scene.render.filepath=str(out/f'{character}-{pose}.png');bpy.ops.render.render(write_still=True)
  metadata[character]['poses'][pose]={'image':f'{character}-{pose}.png','joints':{key:[round(v[0],3),round(v[1],3)] for key,v in j.items()},'view':view}
 for objects in rigs.values():
  for obj in objects.values():obj.hide_render=True;obj.hide_viewport=True
# Save the articulated rig and packed original pixels as editable evidence.
scene.frame_start=1;scene.frame_end=len(POSES);scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-combat-poses.blend'))
(out/'manifest.json').write_text(json.dumps(metadata,separators=(',',':')))
print('Rendered articulated SD combat poses from original cutout limbs. No whole-body substitute for arm extension.')
