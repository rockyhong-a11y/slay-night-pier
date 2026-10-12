"""Blender authoring source for SD powerbomb/suplex action tracks.
Run: Blender --background --python tools/build-grapples.py
Textures are the original slay SD full-body sprites packed into the .blend.
The game samples the same Blender timeline at 60 Hz, preserving contact timing.
"""
from pathlib import Path
import bpy, json, math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/motion'
OUT.mkdir(parents=True,exist_ok=True)
FPS=60
# x/z are body-height units. Positive z raises the body, positive angle turns
# clockwise in the game's Canvas. Pivot is the middle of the entire sprite.
KEYS={
 'powerbomb': {
  'duration':1.35,'impactAt':.73,'heroId':'atlas','victimId':'viper',
  'keys':[
   (0,(0,0,0,1,1,3),(.56,0,0,1,1,0)),
   (.12,(.04,-.05,-.10,1,1,4),(.49,.05,-.12,1,1,2)),
   (.27,(.04,.02,0,1,1,5),(.16,.50,1.90,1,1,2)),
   (.42,(.08,.10,-.04,1,1,5),(.10,.95,math.pi,1,1,2)),
   (.56,(.12,.12,0,1,1,5),(.20,.88,3.35,1,1,2)),
   (.68,(.15,-.10,.16,1,.94,5),(.48,.30,4.28,1,1,2)),
   (.73,(.16,-.19,.10,1,.86,6),(.75,-.20,math.pi*1.5,1,1,2)),
   (.82,(.10,-.08,.04,1,.97,6),(.90,-.17,math.pi*1.5,1,1,2)),
   (1,(0,0,0,1,1,0),(1,-.20,math.pi*1.5,1,1,2))
  ]},
 'suplex':{
  'duration':1.30,'impactAt':.70,'heroId':'nova','victimId':'raven',
  'keys':[
   (0,(0,0,0,1,1,0),(.56,0,0,1,1,0)),
   (.14,(.05,-.07,-.10,1,.96,1),(.44,.05,-.10,1,1,2)),
   (.29,(-.04,.10,-.30,1,1,1),(.16,.58,-.34,1,1,2)),
   (.43,(-.19,.12,-.80,1,1,1),(-.25,.99,-.80,1,1,2)),
   (.57,(-.32,-.04,-1.14,1,1,1),(-.70,.57,-1.21,1,1,2)),
   (.70,(-.41,-.18,-1.37,1,.96,1),(-1.05,-.20,-math.pi/2,1,1,2)),
   (.80,(-.30,-.10,-.65,1,.98,1),(-1.10,-.17,-math.pi/2,1,1,2)),
   (1,(0,0,0,1,1,0),(-1.13,-.20,-math.pi/2,1,1,2))
  ]}
}
# Reset a reproducible authoring scene.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.fps=FPS
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=480;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.world.color=(.03,.04,.05)
scene.view_settings.view_transform='Standard'
scene.render.image_settings.color_depth='8'
# Look directly at the 2.5D SD scene with orthographic projection.
bpy.ops.object.camera_add(location=(0,-8,.42))
camera=bpy.context.object;camera.name='Portrait_Action_Review'
camera.rotation_euler=(Vector((0,0,.42))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.3;scene.camera=camera

manifest=json.loads((ROOT/'public/assets/sprites/manifest.json').read_text())
# Crop only the source's authored boundaries; original pixels remain unchanged.
# Cropping happens in a separate Pillow prep step for transparent texture planes.
textures=ROOT/'tools/blender-textures'
materials={}
def material(character,pose):
 key=(character,pose)
 if key in materials:return materials[key]
 image=bpy.data.images.load(str(textures/f'{character}-{pose}.png'));image.pack()
 mat=bpy.data.materials.new(f'{character}_Original_SD_Pose_{pose}')
 mat.use_nodes=True
 nodes=mat.node_tree.nodes;nodes.clear()
 tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
 emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
 transparent=nodes.new('ShaderNodeBsdfTransparent')
 mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial')
 mat.node_tree.links.new(tex.outputs['Color'],emission.inputs['Color'])
 mat.node_tree.links.new(tex.outputs['Alpha'],mix.inputs[0])
 mat.node_tree.links.new(transparent.outputs[0],mix.inputs[1]);mat.node_tree.links.new(emission.outputs[0],mix.inputs[2])
 mat.node_tree.links.new(mix.outputs[0],output.inputs[0])
 try:mat.surface_render_method='DITHERED'
 except:pass
 materials[key]=mat;return mat

def actor(character,label):
 root=bpy.data.objects.new(label,None);scene.collection.objects.link(root)
 root['character']=character;root['unit']='bodyHeight';root['canvasPivot']='bodyCenter'
 for pose in range(3+len(manifest[character].get('grappleFrames',[]))):
  frame=(manifest[character]['frames'][pose] if pose<3 else manifest[character]['grappleFrames'][pose-3])
  aspect=frame['width']/frame['height']
  mesh=bpy.data.meshes.new(f'{label}_OriginalMesh_{pose}')
  if pose>=3:
   unit=1/manifest[character]['grappleBodyHeight']; px,pz=frame['centerPivot'];w,h=frame['width'],frame['height']
   vertices=[(-px*unit,0,-(h-pz)*unit),((w-px)*unit,0,-(h-pz)*unit),((w-px)*unit,0,pz*unit),(-px*unit,0,pz*unit)]
  else:vertices=[(-aspect/2,0,-.5),(aspect/2,0,-.5),(aspect/2,0,.5),(-aspect/2,0,.5)]
  mesh.from_pydata(vertices,[],[(0,1,2,3)])
  uv=mesh.uv_layers.new(name='Original_Pose_UV')
  for i,coord in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=coord
  obj=bpy.data.objects.new(f'{label}_Pose_{pose}',mesh);scene.collection.objects.link(obj);obj.parent=root
  obj.data.materials.append(material(character,pose))
 return root

roots={}
frame_cursor=1
for clip_name,clip in KEYS.items():
 start=frame_cursor;end=start+round(clip['duration']*FPS)
 hero=actor(clip['heroId'],f'{clip_name}_Hero');victim=actor(clip['victimId'],f'{clip_name}_Victim')
 roots[clip_name]=(hero,victim,start,end)
 for root in [hero,victim]:
  for child in root.children:
   for boundary in [start-1,end+1]:
    child.hide_render=True;child.hide_viewport=True
    child.keyframe_insert(data_path='hide_render',frame=boundary);child.keyframe_insert(data_path='hide_viewport',frame=boundary)
 for phase,h,v in clip['keys']:
  frame=start+round(phase*(end-start))
  for root,values in [(hero,h),(victim,v)]:
   x,z,angle,sx,sy,pose=values
   root.location=(x,0,z);root.rotation_euler=(0,angle,0);root.scale=(sx,1,sy)
   root.keyframe_insert(data_path='location',frame=frame)
   root.keyframe_insert(data_path='rotation_euler',frame=frame)
   root.keyframe_insert(data_path='scale',frame=frame)
   for child in root.children:
    visible=int(child.name.rsplit('_',1)[-1])==pose
    child.hide_render=not visible;child.hide_viewport=not visible
    child.keyframe_insert(data_path='hide_render',frame=frame);child.keyframe_insert(data_path='hide_viewport',frame=frame)
  if phase==clip['impactAt']:scene.timeline_markers.new(f'{clip_name.upper()} / GROUND IMPACT',frame=frame)
 scene.timeline_markers.new(f'{clip_name.upper()} / GRIP',frame=start)
 scene.timeline_markers.new(f'{clip_name.upper()} / RECOVER',frame=end)
 frame_cursor=end+20
# The Blender keyframes are linear; the game interpolates samples linearly.
# Linear descent preserves a sharp impact rather than easing into the floor.
for obj in bpy.data.objects:
 if not obj.animation_data or not obj.animation_data.action:continue
 action=obj.animation_data.action
 try:
  for curve in action.fcurves:
   for keyframe in curve.keyframe_points:
    keyframe.interpolation='CONSTANT' if curve.data_path.startswith('hide_') else 'LINEAR'
 except AttributeError:
  for layer in action.layers:
   for strip in layer.strips:
    for bag in strip.channelbags:
     for curve in bag.fcurves:
      for keyframe in curve.keyframe_points:keyframe.interpolation='CONSTANT' if curve.data_path.startswith('hide_') else 'LINEAR'

export={'version':1,'sampleRate':FPS,'unit':'bodyHeight','pivot':'bodyCenter','authoring':'Blender 5.2.2 LTS','clips':{}}
for name,(hero,victim,start,end) in roots.items():
 spec=KEYS[name]
 frames=[]
 for frame in range(start,end+1):
  scene.frame_set(frame)
  phase=(frame-start)/(end-start)
  current=max((key for key in spec['keys'] if key[0]<=phase+1e-6),key=lambda key:key[0])
  values={}
  for label,obj,pose in [('hero',hero,current[1][-1]),('victim',victim,current[2][-1])]:
   values[label]={'x':round(obj.location.x,6),'z':round(obj.location.z,6),'angle':round(obj.rotation_euler.y,6),'scaleX':round(obj.scale.x,6),'scaleY':round(obj.scale.z,6),'pose':int(next((child.name.rsplit('_',1)[-1] for child in obj.children if not child.hide_render),pose))}
  frames.append({'t':round(phase,6),**values})
 export['clips'][name]={'duration':spec['duration'],'impactAt':spec['impactAt'],'heroId':spec['heroId'],'frames':frames,'events':[{'at':0,'type':'grip'},{'at':.42,'type':'apex'},{'at':spec['impactAt'],'type':'impact'},{'at':1,'type':'release'}]}
(OUT/'grapples.json').write_text(json.dumps(export,separators=(',',':')))
scene.frame_start=1;scene.frame_end=frame_cursor-20;scene.frame_set(1)
# Make the imported original textures available inside the editable .blend.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-grapples.blend'))
# Compact stills prove the reviewed grip, apex and slam trajectories. They are
# development previews; gameplay samples the timeline instead of playing video.
for name,(hero,victim,start,end) in roots.items():
 for other,other_roots in roots.items():
  for root in other_roots[:2]:
   root.hide_render=other!=name
 for index,phase in enumerate([0,.27,.42,.56,KEYS[name]['impactAt'],1]):
  scene.frame_set(start+round(phase*(end-start)))
  scene.render.filepath=str(OUT/f'{name}-preview-{index}.png')
  bpy.ops.render.render(write_still=True)
print('Saved Blender source and sampled powerbomb + suplex tracks.')
