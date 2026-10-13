"""Author original SD walking with fixed-length limbs and planted-foot IK in Blender.
Blender --background --factory-startup --python tools/build-walk-motion.py -- --source /path/to/directional-kit --output /tmp/walk-renders
The source drawings are packed, unchanged. Meshes rotate and translate; their scales remain one.
"""
from pathlib import Path
import argparse, colorsys, json, math, sys
import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--character')
opt = parser.parse_args(args)
opt.output.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[1]
kits = json.loads((opt.source / 'manifest.json').read_text())['characters']
if opt.character: kits = {opt.character: kits[opt.character]}
CELL, ORTHO, CAMERA_Z = 384, 370., 165.
PIXEL_SCALE = CELL / ORTHO
FRAMES, STANCE, STRIDE = 12, .60, 43.
CYCLE_LENGTH = 2 * STRIDE / STANCE
REFERENCE_HEIGHT = 293.0440

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = CELL
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.render.image_settings.color_depth = '8'
scene.render.fps = FRAMES
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.compression = 15
bpy.ops.object.camera_add(location=(0, -800, CAMERA_Z))
camera = bpy.context.object
camera.rotation_euler = (math.pi / 2, 0, 0)
camera.data.type = 'ORTHO'
camera.data.ortho_scale = ORTHO
scene.camera = camera

def ik(a, b, l1, l2, bend=1):
    delta = Vector((b[0] - a[0], b[1] - a[1]))
    length = min(l1 + l2 - .001, max(abs(l1 - l2) + .001, delta.length))
    direction = delta.normalized() if delta.length else Vector((0, -1))
    perp = Vector((-direction.y, direction.x)) * bend
    along = (l1*l1 + length*length - l2*l2) / (2*length)
    across = math.sqrt(max(0, l1*l1 - along*along))
    joint = Vector(a) + direction * along + perp * across
    end = Vector(a) + direction * length
    return tuple(joint), tuple(end)

def projected(p):
    return [round(CELL/2 + p[0]*PIXEL_SCALE, 5), round(CELL/2 + (CAMERA_Z-p[1])*PIXEL_SCALE, 5)]

def material(character, image):
    mat = bpy.data.materials.new(character + '_unchanged_original_SD')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image
    texture.interpolation = 'Linear'
    emission = nodes.new('ShaderNodeEmission')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    output = nodes.new('ShaderNodeOutputMaterial')
    links = mat.node_tree.links
    links.new(texture.outputs['Color'], emission.inputs['Color'])
    matte = nodes.new('ShaderNodeMapRange')
    matte.inputs['From Min'].default_value = .4
    matte.inputs['From Max'].default_value = .9
    matte.clamp = True
    links.new(texture.outputs['Alpha'], matte.inputs['Value'])
    links.new(matte.outputs['Result'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    return mat

def align_costume(character,data,pixels):
    # Palette corrections happen in Blender's packed texture copy; original files and anatomy stay intact.
    regions=[]
    for view,names in [('down',['body','upperArmL','forearmL','upperArmR','forearmR']),('right',['thighL','thighR','shinR'])]:
        for name in names:
            part=data['views'][view]['parts'][name]
            x,y,w,h=part['rect'];regions.append((name,x,y,w,h))
    for name,x,y,w,h in regions:
        tile=pixels[data['height']-(y+h):data['height']-y,x:x+w][::-1]
        for yy in range(h):
            for xx in range(w):
                r,g,b,a=[float(v) for v in tile[yy,xx]]
                if a<.15:continue
                hue,sat,value=colorsys.rgb_to_hsv(r,g,b)
                replacement=None
                if character=='nova' and .40<hue<.62 and sat>.35:
                    replacement=colorsys.hsv_to_rgb(.0,sat,min(1.,value*.86))
                elif character=='ember' and .075<hue<.21 and sat>.40:
                    replacement=colorsys.hsv_to_rgb(.0,sat,value*.84)
                elif character=='viper' and name=='shinR' and yy>h*.23 and (hue<.055 or hue>.95) and sat>.5 and r>g*1.7:
                    replacement=colorsys.hsv_to_rgb(0,.08,value*.30)
                elif character=='viper' and name.startswith('forearm') and yy>h*.61:
                    replacement=colorsys.hsv_to_rgb(0,.84,max(.14,value*.87))
                elif character=='seraph' and .54<hue<.73 and sat>.35:
                    replacement=colorsys.hsv_to_rgb(hue,sat,value*.73)
                elif character=='valkyrie' and .52<hue<.75 and sat>.25:
                    replacement=colorsys.hsv_to_rgb(hue,.06,value*.74)
                elif character=='tempest' and name=='body' and .40<hue<.62 and sat>.32 and abs(xx-w*.5)<w*.30:
                    replacement=colorsys.hsv_to_rgb(hue,sat*.7,value*.28)
                elif character=='onyx' and name=='body' and (yy/h<.44 or yy/h>.67) and value<.53 and not (r>g*1.2 and r>b*1.5):
                    replacement=colorsys.hsv_to_rgb(.77,.64,max(.18,value*1.1))
                if replacement:tile[yy,xx,:3]=replacement
                if character=='viper' and name=='body':
                    # Join the green top through the abdomen and remove outer shorts hems for the leotard silhouette.
                    if .32<yy/h<.83 and .0<hue<.13 and sat>.18 and r>g*1.08:
                        tile[yy,xx,:3]=colorsys.hsv_to_rgb(.43,.85,max(.12,min(.63,value*.54)))
                    if yy/h>.77 and abs(xx-w*.5)/w>(1-yy/h)*1.05+.12:
                        tile[yy,xx,3]=0
    return pixels

PARTS = [
    ('hair', 'neck', 'hairTip', 130., 'down'),
    ('thighR', 'hipR', 'kneeR', 57., 'right'),
    ('shinR', 'kneeR', 'ankleR', 49., 'right'),
    ('footR', 'ankleR', 'footEndR', 1., 'right'),
    ('upperArmR', 'shoulderR', 'elbowR', 39., 'down'),
    ('forearmR', 'elbowR', 'wristR', 48., 'down'),
    ('thighL', 'hipL', 'kneeL', 57., 'right'),
    ('shinL', 'kneeL', 'ankleL', 49., 'right'),
    ('footL', 'ankleL', 'footEndL', 1., 'right'),
    ('body', 'pelvis', 'neck', 90., 'down'),
    ('upperArmL', 'shoulderL', 'elbowL', 39., 'down'),
    ('forearmL', 'elbowL', 'wristL', 48., 'down'),
    ('head', 'neck', 'headTop', 90., 'right'),
]

def make_part(character, data, mat, pixels, name, start, end, length, view, rank):
    # Both walking boots face the movement direction; the kit's left boot is an outward idle shoe.
    source_name = 'shinR' if name.startswith(('foot','shin')) else name
    part = data['views'][view]['parts'][source_name]
    x, y, w, h = part['rect']; px, py = part['pivot']; tx, ty = part['tip']
    full_rect = (x,y,w,h)
    foot_ratio = None
    if name.startswith(('shin','foot')):
        split = round(h * .75)
        ankle_x = px + (tx-px) * (split-py)/(ty-py)
        foot_ratio = 61 / math.hypot(tx-px,ty-py)
        if name.startswith('shin'):
            length = math.hypot(ankle_x-px,split-py) * foot_ratio
            tx,ty = ankle_x,split
        else:
            top = split-9
            y += top; h -= top; px,py = ankle_x,split-top
            tx,ty = px,py-1
    if name == 'hair': tx, ty = px, py + data['views'][view]['hairLengthWorld'] * 1.5
    source_vector = Vector((tx-px, -(ty-py)))
    source_length = source_vector.length
    axis = source_vector.normalized()
    side = Vector((axis.y, -axis.x))
    ratio = foot_ratio if name.startswith('foot') else length / source_length
    def local(cx, cy):
        v = Vector((cx-px, -(cy-py)))
        return (v.dot(side)*ratio, v.dot(axis)*ratio)
    is_shin = name.startswith('shin')
    source_points = [(w*col/6,h*row/24) for row in range(25) for col in range(7)] if is_shin else [(0,h),(w,h),(w,0),(0,0)]
    vertices = [(local(cx,cy)[0], 0, local(cx,cy)[1]) for cx,cy in source_points]
    faces = [(row*7+col,(row+1)*7+col,(row+1)*7+col+1,row*7+col+1) for row in range(24) for col in range(6)] if is_shin else [(0,1,2,3)]
    mesh = bpy.data.meshes.new(character + '_' + name + '_unchanged_aspect')
    mesh.from_pydata(vertices, [], faces)
    uv = mesh.uv_layers.new()
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            cx,cy = source_points[mesh.loops[loop_index].vertex_index]
            uv.data[loop_index].uv = ((x+cx)/data['width'],1-(y+cy)/data['height'])
    obj = bpy.data.objects.new(character + '_' + name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj['sourcePart'] = name; obj['sourceTexturePart'] = source_name; obj['sourceCharacter'] = character; obj['view'] = view
    obj['constantLength'] = length; obj['sourceUniformScale'] = ratio
    obj['startJoint'] = start; obj['endJoint'] = end
    mask = pixels[data['height']-(y+h):data['height']-y, x:x+w, 3][::-1]
    yy,xx = np.where(mask > .35)
    cloud = np.array([local(float(cx),float(cy)) for cx,cy in zip(xx[::2],yy[::2])])
    return {'object':obj, 'cloud':cloud, 'rank':rank, 'start':start, 'end':end, 'length':length,
            'sourcePoints':source_points,'sourcePivot':(px,py),'sourceAnkle':(tx,ty),'ratio':ratio,'sourceHeight':h,
            'sourceRect':full_rect}

def deform_shin(part, knee, ankle):
    # One continuous mesh skins calf to a flat sole; no cropped duplicate boot or ankle seam.
    obj = part['object']; obj.location = (0,-part['rank']*.1,0); obj.rotation_euler = (0,0,0)
    px,py = part['sourcePivot']; ax,ay = part['sourceAnkle']; ratio = part['ratio']
    axis = Vector((ax-px,-(ay-py))).normalized(); side = Vector((axis.y,-axis.x))
    angle = math.atan2(ankle[0]-knee[0],ankle[1]-knee[1]); co,si = math.cos(angle),math.sin(angle)
    for vertex,(sx,sy) in zip(obj.data.vertices,part['sourcePoints']):
        source = Vector((sx-px,-(sy-py)))
        lx,lz = source.dot(side)*ratio,source.dot(axis)*ratio
        calf = (knee[0]+co*lx+si*lz,knee[1]-si*lx+co*lz)
        foot = (ankle[0]+(sx-ax)*ratio,ankle[1]-(sy-ay)*ratio)
        weight = min(1.,max(0.,(sy/part['sourceHeight']-.64)/.25))
        weight = weight*weight*(3-2*weight)
        vertex.co = (calf[0]*(1-weight)+foot[0]*weight,0,calf[1]*(1-weight)+foot[1]*weight)

def world_cloud(part, start, end):
    dx,dz = end[0]-start[0], end[1]-start[1]
    angle = math.atan2(dx,dz); co,si = math.cos(angle),math.sin(angle)
    points = part['cloud']
    return np.column_stack((start[0]+co*points[:,0]+si*points[:,1], start[1]-si*points[:,0]+co*points[:,1]))

def contact_solve(hip, desired, thigh, shin, foot):
    # A separate unscaled foot keeps heel and toe flat while the calf rotates.
    cloud = foot['cloud']
    bottom = float(cloud[:,1].min())
    sole = cloud[cloud[:,1] <= bottom + .8]
    contact_x = float(sole[:,0].mean())
    target = (desired[0]-contact_x,desired[1]-bottom)
    knee,ankle = ik(hip,target,thigh['length'],shin['length'],1)
    return knee,ankle,(ankle[0]+contact_x,ankle[1]+bottom)

def gait(phase, parts):
    # Body, head, and limb lengths are fixed throughout every walking frame.
    j = {'pelvis':(0,96), 'neck':(3,96+math.sqrt(90*90-3*3)),
         'headTop':(3,96+math.sqrt(90*90-3*3)+90), 'hairTip':(3,56)}
    feet = {}
    for side,offset,hipx in [('L',0.,-17),('R',.5,17)]:
        q = (phase+offset) % 1
        planted = q < STANCE+.00001
        if planted:
            footx = STRIDE-CYCLE_LENGTH*q
            footz = 0.
        else:
            swing = (q-STANCE)/(1-STANCE)
            smooth = swing*swing*(3-2*swing)
            footx = -STRIDE+2*STRIDE*smooth
            footz = math.sin(math.pi*swing)*22.
        hip = (hipx,95)
        knee,ankle,sole = contact_solve(hip,(footx,footz),parts['thigh'+side],parts['shin'+side],parts['foot'+side])
        j.update({'hip'+side:hip,'knee'+side:knee,'ankle'+side:ankle,'footEnd'+side:(ankle[0],ankle[1]+1)})
        feet['left' if side=='L' else 'right'] = {
            'x':round(sole[0],6),'z':round(sole[1],6), 'planted':planted,
            'worldX':round(CYCLE_LENGTH*phase+sole[0],6),
            'phase':round(q,6), 'desiredX':round(footx,6),
        }
        shoulder = (hipx*1.65+3,175.)
        swing = math.sin(phase*2*math.pi+(0 if side=='L' else math.pi))
        # Arms swing opposite the matching leg. Broad shoulders keep both sides readable.
        wrist = ((12 if side=='L' else 53)+10*swing,162.+(0 if side=='L' else 8)+2*math.cos(phase*2*math.pi))
        elbow,hand = ik(shoulder,wrist,39,48,-1)
        j.update({'shoulder'+side:shoulder,'elbow'+side:elbow,'wrist'+side:hand})
    return j,feet

metadata = {'version':1,'sampleRate':12,'pivot':'bodyCenter','unit':'authoredBodyHeight','characters':{}}
all_objects = []
for character,data in kits.items():
    image = bpy.data.images.load(str(opt.source/(character+'.webp')))
    pixels = np.asarray(image.pixels[:],dtype=np.float32).reshape(data['height'],data['width'],4)
    pixels = align_costume(character,data,pixels)
    image.pixels.foreach_set(pixels.ravel());image.update();image.pack()
    exported = bpy.data.images.new(character+'_walking_leg_texture',width=data['width'],height=data['height'],alpha=True)
    exported_pixels=pixels.copy();exported_pixels[:,:,3]=np.clip((exported_pixels[:,:,3]-.4)/.5,0,1)
    exported.pixels.foreach_set(exported_pixels.ravel());exported.update()
    exported.save_render(str(opt.output/(character+'-walk-texture.png')),scene=scene)
    mat = material(character,image)
    parts = {}
    for rank,(name,start,end,length,view) in enumerate(PARTS):
        part = make_part(character,data,mat,pixels,name,start,end,length,view,rank)
        parts[name] = part; all_objects.append(part['object'])
    for obj in all_objects: obj.hide_render = True
    baseline,_ = gait(0,parts)
    cloud = np.concatenate([world_cloud(part,baseline[part['start']],baseline[part['end']]) for part in parts.values()])
    # Standing body height follows the face/head reference, excluding long back-hair plumes.
    head_cloud = world_cloud(parts['head'],baseline['neck'],baseline['headTop'])
    reference_height = REFERENCE_HEIGHT
    body_pixels = reference_height*PIXEL_SCALE
    pivot = projected((0,0)); center = [pivot[0], pivot[1]-body_pixels/2]
    entry = {'bodyHeight':body_pixels,'referenceWorldHeight':reference_height,'cycleWorldDistance':CYCLE_LENGTH,
             'referenceDefinition':'Atlas standing anatomical reference; hair plumes never rescale the body',
             'headHeight':float(head_cloud[:,1].max()-head_cloud[:,1].min()),'headCoreHeight':90.,'torsoJointLength':90.,
             'costumeAlignment':'packed Blender texture palette aligned to combat standing outfit',
             'cycleDistance':CYCLE_LENGTH/reference_height*128,'pivot':pivot,'centerPivot':center,'frames':[]}
    rig_parts={}
    for name in ['thighL','thighR','shinL','shinR']:
        part=parts[name]
        rig_parts[name]={'sourceRect':part['sourceRect'],'pivot':part['sourcePivot'],'ankle':part['sourceAnkle'],
                         'ratio':part['ratio'],'length':part['length']}
        if name.startswith('shin'):
            foot=parts['foot'+name[-1]];bottom=float(foot['cloud'][:,1].min())
            sole=foot['cloud'][foot['cloud'][:,1]<=bottom+.8]
            rig_parts[name]['footContact']=[part['sourceAnkle'][0]+float(sole[:,0].mean())/part['ratio'],part['sourceAnkle'][1]-bottom/part['ratio']]
    entry['rig']={'parts':rig_parts,'stride':STRIDE,'stance':STANCE,'referenceHeight':REFERENCE_HEIGHT,'cycleWorldDistance':CYCLE_LENGTH,
                  'texture':character+'-walk-texture.png','hipHeight':95,'hipWidth':17,
                  'calfSkin':[.64,.89],'upperFrames':[],'backFrame':None}
    for frame in range(FRAMES):
        phase = frame/FRAMES; joints,feet = gait(phase,parts)
        for obj in all_objects: obj.hide_render = True
        for name,part in parts.items():
            obj = part['object']; obj.hide_render = False
            start,end = joints[part['start']],joints[part['end']]
            if name.startswith('shin'):
                deform_shin(part,start,end)
                if not obj.data.shape_keys: obj.shape_key_add(name='Basis')
                key = obj.shape_key_add(name='walk_'+str(frame).zfill(2))
                for point,vertex in zip(key.data,obj.data.vertices): point.co = vertex.co
                for shape in obj.data.shape_keys.key_blocks[1:]:
                    shape.value = 1 if shape==key else 0
                    shape.keyframe_insert(data_path='value',frame=frame+1)
                    if shape==key and frame>0:
                        shape.value=0; shape.keyframe_insert(data_path='value',frame=frame)
                        shape.value=1
            else:
                obj.location = (start[0],-part['rank']*.1,start[1])
                obj.rotation_euler = (0,math.atan2(end[0]-start[0],end[1]-start[1]),0)
            obj.scale = (1,1,1)
            for prop in ['location','rotation_euler','scale']:
                obj.keyframe_insert(data_path=prop,frame=frame+1)
        scene.frame_set(frame+1); bpy.context.view_layer.update()
        for obj in all_objects: obj.hide_render = True
        for name,part in parts.items(): part['object'].hide_render = name.startswith('foot')
        scene.render.filepath = str(opt.output/(character+'-walk-'+str(frame).zfill(2)+'.png'))
        bpy.ops.render.render(write_still=True)
        for name,part in parts.items():part['object'].hide_render=name.startswith(('thigh','shin','foot')) or name=='hair'
        upper_image=character+'-walk-upper-'+str(frame).zfill(2)+'.png'
        scene.render.filepath=str(opt.output/upper_image);bpy.ops.render.render(write_still=True)
        entry['rig']['upperFrames'].append({'image':upper_image,'pivot':pivot,'centerPivot':center})
        if frame==0:
            for name,part in parts.items():part['object'].hide_render=name!='hair'
            back_image=character+'-walk-back.png';scene.render.filepath=str(opt.output/back_image);bpy.ops.render.render(write_still=True)
            entry['rig']['backFrame']={'image':back_image,'pivot':pivot,'centerPivot':center}
        primary = 'left' if phase<.5 else 'right'
        foot = feet[primary]
        projected_feet = {key:{**value,'pixel':projected((value['x'],value['z']))} for key,value in feet.items()}
        entry['frames'].append({'phase':phase,'pivot':pivot,'centerPivot':center,'contactFoot':primary,
             'foot':projected((foot['x'],foot['z'])),'feet':projected_feet,
             'joints':{key:[round(value[0],6),round(value[1],6)] for key,value in joints.items()},
             'scales':{name:list(part['object'].scale) for name,part in parts.items()},
             'image':character+'-walk-'+str(frame).zfill(2)+'.png'})
    metadata['characters'][character] = entry
    for obj in all_objects: obj.hide_render = True
scene.frame_start=1; scene.frame_end=FRAMES
scene.frame_set(1)
for obj in all_objects:
    obj.hide_render = obj['sourceCharacter']!='atlas' or obj['sourcePart'].startswith('foot')
    obj.hide_viewport = obj['sourceCharacter']!='atlas' or obj['sourcePart'].startswith('foot')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/sd-walk.blend'))
(opt.output/'manifest.json').write_text(json.dumps(metadata,separators=(',',':')))
print('Rendered',len(kits),'SD walking cycles. All mesh scales remain one, visible soles solved to planted world contacts.')
