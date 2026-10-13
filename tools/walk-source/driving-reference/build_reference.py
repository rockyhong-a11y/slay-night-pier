"""Original SD mannequin walking reference, authored locally in Blender.
+X forward, +Z up. No image cards, copied character texture or external assets.
Three complete cycles over4s; geometry and paired limb lengths remain fixed.
"""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix
OUT=Path('/private/tmp/slay-motion-reference');OUT.mkdir(exist_ok=True);(OUT/'frames').mkdir(exist_ok=True)
FPS=24;FRAMES=96;PERIOD=4/3;STANCE=.62;THIGH=.225;CALF=.180;STRIDE=.20
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=sc.render.resolution_y=512;sc.render.resolution_percentage=100;sc.render.fps=FPS;sc.frame_start=1;sc.frame_end=FRAMES
sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB';sc.render.film_transparent=False
sc.world.color=(.72,.76,.79);sc.view_settings.view_transform='Standard';sc.view_settings.exposure=0;sc.view_settings.gamma=1
try:sc.eevee.taa_render_samples=16
except:pass

def mat(name,color,rough=.75):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
SKIN=mat('Warm ivory mannequin',(.73,.62,.46));KIT=mat('Charcoal kit',(.07,.095,.12));JOINT=mat('Joint articulations',(.30,.36,.40));SOLE=mat('Foot sole',(.055,.065,.075));EYE=mat('Face landmarks',(.025,.035,.045));FLOOR=mat('Plain neutral floor',(.79,.82,.84))
objs={}
def sphere(name,size,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);bpy.ops.object.shade_smooth();objs[name]=o;return o

def cylinder(name,radius,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=1);o=bpy.context.object;o.name=name;o.data.materials.append(material);bpy.ops.object.shade_smooth();objs[name]=o;return o

def foot(name):
 bpy.ops.mesh.primitive_cube_add();o=bpy.context.object;o.name=name;o.scale=(.084,.041,.035);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(SOLE);be=o.modifiers.new('Rounded boot','BEVEL');be.width=.018;be.segments=3;objs[name]=o;return o

sphere('head',(.25,.228,.27),SKIN);sphere('torso',(.108,.158,.165),KIT);sphere('pelvis',(.112,.115,.082),KIT);sphere('neck',(.052,.062,.057),SKIN)
# Small face landmarks make the forward axis unambiguous without copying a person.
sphere('eye.L',(.016,.022,.023),EYE);sphere('eye.R',(.016,.022,.023),EYE);sphere('nose',(.035,.027,.035),SKIN)
for side in ['L','R']:
 cylinder('thigh.'+side,.059,SKIN);cylinder('calf.'+side,.046,SKIN);sphere('knee.'+side,(.06,.06,.06),JOINT);sphere('ankle.'+side,(.038,.038,.038),JOINT);foot('boot.'+side)
 cylinder('upperArm.'+side,.037,SKIN);cylinder('forearm.'+side,.031,SKIN);sphere('elbow.'+side,(.038,.038,.038),JOINT);sphere('hand.'+side,(.044,.041,.052),KIT);sphere('shoulder.'+side,(.046,.046,.046),SKIN)

def smooth(x):return x*x*(3-2*x)
def rotY(a):return Matrix.Rotation(a,3,'Y')
def footstate(q,y):
 heel=Vector((-.045,0,0));toe=Vector((.115,0,0));swing=q>=STANCE
 if not swing:
  x=.10-STRIDE*q/STANCE
  if q<.11:pitch=-.18*(1-smooth(q/.11));contact=heel;mode='heel'
  elif q>.45:pitch=.30*smooth((q-.45)/(STANCE-.45));contact=toe;mode='toe'
  else:pitch=0;contact=heel;mode='flat'
  R=rotY(pitch);target=Vector((x+contact.x,y,0));origin=target-R@contact
 else:
  u=(q-STANCE)/(1-STANCE);x=-.10+STRIDE*smooth(u);pitch=.30+(-.18-.30)*smooth(u);R=rotY(pitch)
  z=-min((R@heel).z,(R@toe).z)+.045*math.sin(math.pi*u)
  origin=Vector((x,y,z));target=origin+R@toe;mode='swing'
 ankle=origin+R@Vector((0,0,.070))
 return {'q':q,'planted':not swing,'mode':mode,'pitch':pitch,'origin':origin,'ankle':ankle,'heel':origin+R@heel,'toe':origin+R@toe,'contact':target}

# Periodically smoothed support pelvis height; the lower constraint prevents any leg overextension.
N=512;raw=[]
reach=math.sqrt(THIGH*THIGH+CALF*CALF+2*THIGH*CALF*math.cos(math.radians(15)))
for i in range(N):
 phase=i/N;feet=[footstate(phase,.09),footstate((phase+.5)%1,-.09)]
 h=[f['ankle'].z+math.sqrt(max(.001,reach*reach-f['ankle'].x**2)) for f in feet if f['planted']]
 raw.append(min(h))
heights=[sum(raw[(i+k)%N]*(5-abs(k)) for k in range(-4,5))/25 for i in range(N)]
def hipheight(phase):
 p=phase*N;i=int(p)%N;return heights[i]*(1-(p%1))+heights[(i+1)%N]*(p%1)

def ik(hip,ankle):
 v=ankle-hip;dist=v.length
 if dist>THIGH+CALF-.00001:raise RuntimeError('Leg overreach '+str(dist))
 d=v.normalized();cross=Vector((-d.z,0,d.x)) # knee bends forward +X
 if cross.x<0:cross=-cross
 along=(THIGH**2+dist**2-CALF**2)/(2*dist);across=math.sqrt(max(0,THIGH**2-along**2))
 knee=hip+d*along+cross*across
 flex=math.degrees(math.acos(max(-1,min(1,(dist*dist-THIGH*THIGH-CALF*CALF)/(2*THIGH*CALF)))))
 return knee,flex

def locate(name,p):objs[name].location=p
def segment(name,a,b):
 o=objs[name];v=b-a;o.location=(a+b)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(v);o.scale.z=v.length

def keyall(frame):
 for o in objs.values():
  for key in ['location','scale']:o.keyframe_insert(data_path=key,frame=frame)
  o.keyframe_insert(data_path='rotation_quaternion' if o.rotation_mode=='QUATERNION' else 'rotation_euler',frame=frame)
rows=[]
for frame in range(1,FRAMES+2):
 t=(frame-1)/FPS;phase=(t/PERIOD)%1;h=hipheight(phase);lean=math.radians(2);R=rotY(lean)
 root=Vector((0,0,h));locate('pelvis',root);locate('torso',root+R@Vector((0,0,.17)));locate('neck',root+R@Vector((0,0,.322)));head=root+R@Vector((0,0,.593));locate('head',head)
 for name in ['head','torso','neck']:objs[name].rotation_euler=(0,lean,0)
 for side,sy,offset in [('L',1,0),('R',-1,.5)]:
  locate('eye.'+side,head+R@Vector((.230,sy*.083,.055)))
 locate('nose',head+R@Vector((.250,0,.009)))
 rec={'frame':frame,'time':t,'phase':phase,'pelvisHeight':h,'headCenter':list(head),'feet':{}}
 for side,sy,offset in [('L',1,0),('R',-1,.5)]:
  q=(phase+offset)%1;f=footstate(q,sy*.09);hip=root+Vector((0,sy*.09,0));knee,flex=ik(hip,f['ankle']);segment('thigh.'+side,hip,knee);segment('calf.'+side,knee,f['ankle']);locate('knee.'+side,knee);locate('ankle.'+side,f['ankle']);boot=objs['boot.'+side];boot.rotation_euler=(0,f['pitch'],0);boot.location=f['origin']+rotY(f['pitch'])@Vector((.035,0,.035))
  # Arms oppose legs, with modest12degree swing and fixed elbow bend.
  shoulder=root+R@Vector((0,sy*.164,.288));swing=math.radians(12)*math.cos(2*math.pi*q+math.pi);upperDir=Vector((math.sin(swing),sy*.035,-math.cos(swing))).normalized();elbow=shoulder+upperDir*.135;lowerDir=Vector((math.sin(swing+.20),0,-math.cos(swing+.20)));wrist=elbow+lowerDir*.115
  segment('upperArm.'+side,shoulder,elbow);segment('forearm.'+side,elbow,wrist);locate('shoulder.'+side,shoulder);locate('elbow.'+side,elbow);locate('hand.'+side,wrist)
  rec['feet'][side]={'q':q,'planted':f['planted'],'mode':f['mode'],'heel':list(f['heel']),'toe':list(f['toe']),'contact':list(f['contact']),'hip':list(hip),'knee':list(knee),'ankle':list(f['ankle']),'kneeFlexDegrees':flex,'thighLength':(hip-knee).length,'calfLength':(knee-f['ankle']).length,'lowestSole':min(f['heel'].z,f['toe'].z),'treadmillContactX':f['contact'].x,'locomotionEquivalentContactX':f['contact'].x+STRIDE/STANCE*(t/PERIOD)}
 keyall(frame);rows.append(rec)
# Frame-by-frame baked object actions are deterministic and preserve shape.
for o in objs.values():
 if o.animation_data and o.animation_data.action:
  try:
   for fcurve in o.animation_data.action.fcurves:
    for k in fcurve.keyframe_points:k.interpolation='LINEAR'
  except:pass
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003));ground=bpy.context.object;ground.name='Plain floor';ground.data.materials.append(FLOOR)
for name,loc,power,size in [('Key',(3,-4,5),450,5),('Fill',(-3,-1,3),250,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.65))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-7,2.15));cam=bpy.context.object;cam.name='Fixed three-quarter right orthographic';cam.rotation_euler=(Vector((0,0,.68))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.72;sc.camera=cam
sc.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
stance=[f for r in rows[:FRAMES] for f in r['feet'].values() if f['planted']]
report={'model':'Original opaque3D SD mannequin, no person/image cards/textures','worldUp':'+Z','forward':'+X','duration':4,'fps':FPS,'frameCount':FRAMES,'cycles':3,'stepsPerMinute':90,'camera':'fixed orthographic3/4right','bodyReference':'Atlas canonical proportions; headheight.54, torso.31, thigh.225, calf.180','inPlace':True,'contactMethod':'Treadmill relative stride with heel-to-flat-to-toe roll; adding virtual root displacement yields planted locomotion anchors.','legLengthMaxError':max(max(abs(f['thighLength']-THIGH),abs(f['calfLength']-CALF)) for r in rows for f in r['feet'].values()),'stanceKneeFlexRange':[min(f['kneeFlexDegrees'] for f in stance),max(f['kneeFlexDegrees'] for f in stance)],'lowestSoleMin':min(f['lowestSole'] for r in rows for f in r['feet'].values()),'leftRightCrossovers':sum(r['feet']['L']['ankle'][1]<=r['feet']['R']['ankle'][1] for r in rows),'rows':rows,'sceneObjects':[{'name':o.name,'type':o.type} for o in sc.objects]}
(OUT/'motion-inspection.json').write_text(json.dumps(report,indent=2))
for frame in range(1,FRAMES+1):
 sc.frame_set(frame);sc.render.filepath=str(OUT/'frames'/f'walk-{frame:03}.png');bpy.ops.render.render(write_still=True)
print('REFERENCE READY',json.dumps({k:report[k] for k in ['stanceKneeFlexRange','legLengthMaxError','lowestSoleMin','leftRightCrossovers']}),flush=True)
