"""Pack the twelve actual Blender walking renders without repainting their body pixels.
python3 tools/pack-walk-frames.py --input /tmp/walk-renders
python3 tools/pack-walk-frames.py --input /tmp/walk-renders --merge
"""
from pathlib import Path
import argparse,hashlib,json,os
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--merge',action='store_true')
opt=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/sprites'
source=json.loads((opt.input/'manifest.json').read_text())
reference_height=293.0440
pixel_scale=384/370
walks={}
for character,entry in source['characters'].items():
    entry['referenceWorldHeight']=reference_height
    entry['referenceDefinition']='Atlas standing anatomical reference; hair plumes never rescale the body'
    entry['headCoreHeight']=90.
    entry['bodyHeight']=reference_height*pixel_scale
    entry['cycleDistance']=entry['cycleWorldDistance']/reference_height*128
    entry['centerPivot']=[entry['pivot'][0],entry['pivot'][1]-entry['bodyHeight']/2]
    for frame in entry['frames']:frame['centerPivot']=entry['centerPivot']
    images=[Image.open(opt.input/frame['image']).convert('RGBA') for frame in entry['frames']]
    crops=[image.getchannel('A').getbbox() for image in images]
    sizes=[(box[2]-box[0],box[3]-box[1]) for box in crops]
    sheet=Image.new('RGBA',(sum(size[0] for size in sizes),max(size[1] for size in sizes)),(0,0,0,0))
    frames=[]
    cursor=0
    for index,(image,frame,box,size) in enumerate(zip(images,entry['frames'],crops,sizes)):
        sheet.alpha_composite(image.crop(box),(cursor,0))
        frames.append({key:frame[key] for key in ['phase','pivot','centerPivot','contactFoot','foot','feet']})
        frames[-1]['feet']=json.loads(json.dumps(frame['feet']))
        for foot in frames[-1]['feet'].values():
            foot['pixel']=[foot['pixel'][0]-box[0],foot['pixel'][1]-box[1]]
        for key in ['pivot','centerPivot','foot']:
            frames[-1][key]=[frame[key][0]-box[0],frame[key][1]-box[1]]
        frames[-1]['rect']=[cursor,0,*size]
        cursor+=size[0]
    sheet.save(OUT/(character+'-walk.webp'),'WEBP',lossless=True,exact=True)
    version=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    walks[character]={'image':'/assets/sprites/'+character+'-walk.webp',
                     'imageVersion':version(OUT/(character+'-walk.webp')),
                     'width':sheet.width,'height':sheet.height,'frames':frames,
                     'bodyHeight':entry['bodyHeight'],'referenceWorldHeight':entry['referenceWorldHeight'],
                     'cycleDistance':entry['cycleDistance'],'sampleRate':source['sampleRate'],
                     'source':'Blender, original SD directional parts, fixed-length contact IK',
                     'sourceScene':'tools/sd-walk.blend'}
    if entry.get('rig'):
        rig=json.loads(json.dumps(entry['rig']))
        rig['cycleWorldDistance']=entry['cycleWorldDistance']
        texture=Image.open(opt.input/rig.pop('texture')).convert('RGBA')
        unique={tuple(part['sourceRect']) for part in rig['parts'].values()}
        back=Image.open(opt.input/rig['backFrame']['image']).convert('RGBA')
        back_box=back.getchannel('A').getbbox();back=back.crop(back_box)
        tex_width=sum(rect[2] for rect in unique)+back.width
        tex_height=max(max(rect[3] for rect in unique),back.height)
        atlas=Image.new('RGBA',(tex_width,tex_height),(0,0,0,0));placements={};cursor=0
        for rect in sorted(unique):
            x,y,w,h=rect;atlas.alpha_composite(texture.crop((x,y,x+w,y+h)),(cursor,0))
            placements[rect]=[cursor,0,w,h];cursor+=w
        atlas.alpha_composite(back,(cursor,0))
        rig['backFrame']={'rect':[cursor,0,back.width,back.height],
          'pivot':[entry['pivot'][0]-back_box[0],entry['pivot'][1]-back_box[1]],
          'centerPivot':[entry['centerPivot'][0]-back_box[0],entry['centerPivot'][1]-back_box[1]]}
        for part in rig['parts'].values():part['rect']=placements[tuple(part.pop('sourceRect'))]
        rig_path=OUT/(character+'-walk-rig.webp');atlas.save(rig_path,'WEBP',lossless=True,exact=True)
        rig['image']='/assets/sprites/'+rig_path.name;rig['imageVersion']=version(rig_path)
        upper_images=[Image.open(opt.input/frame['image']).convert('RGBA') for frame in rig['upperFrames']]
        upper_boxes=[image.getchannel('A').getbbox() for image in upper_images]
        upper=Image.new('RGBA',(sum(box[2]-box[0] for box in upper_boxes),max(box[3]-box[1] for box in upper_boxes)),(0,0,0,0))
        upper_frames=[];cursor=0
        for image,box in zip(upper_images,upper_boxes):
            w,h=box[2]-box[0],box[3]-box[1];upper.alpha_composite(image.crop(box),(cursor,0))
            upper_frames.append({'rect':[cursor,0,w,h],
                'pivot':[entry['pivot'][0]-box[0],entry['pivot'][1]-box[1]],
                'centerPivot':[entry['centerPivot'][0]-box[0],entry['centerPivot'][1]-box[1]]})
            cursor+=w
        upper_path=OUT/(character+'-walk-upper.webp');upper.save(upper_path,'WEBP',lossless=True,exact=True)
        rig['upperImage']='/assets/sprites/'+upper_path.name;rig['upperImageVersion']=version(upper_path)
        rig['upperFrames']=upper_frames;rig['bodyHeight']=entry['bodyHeight']
        walks[character]['rig']=rig
    print(character,'walk',len(frames),'body reference',round(entry['bodyHeight'],3),'cycle world pixels',round(entry['cycleDistance'],3))
(ROOT/'tools/walk-motion.json').write_text(json.dumps(source,separators=(',',':')))
(opt.input/'walk-fields.json').write_text(json.dumps(walks,separators=(',',':')))
if opt.merge:
    path=OUT/'manifest.json'
    manifest=json.loads(path.read_text())
    for character,walk in walks.items():manifest[character]['walk']=walk
    temp=path.with_suffix('.walk-tmp.json')
    temp.write_text(json.dumps(manifest,separators=(',',':')))
    os.replace(temp,path)
    print('Merged only walk fields into the latest combat manifest.')
