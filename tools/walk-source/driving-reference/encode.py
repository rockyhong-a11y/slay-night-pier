import bpy
from pathlib import Path
p=Path('/private/tmp/slay-motion-reference')
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.render.resolution_x=s.render.resolution_y=512;s.render.resolution_percentage=100;s.render.fps=24;s.frame_start=1;s.frame_end=96
ed=s.sequence_editor_create()
seq=ed.strips.new_image('Mannequin reference',str(p/'frames/walk-001.png'),channel=1,frame_start=1)
for n in range(2,97):seq.elements.append(f'walk-{n:03}.png')
s.render.filepath=str(p/'walk-reference.mp4')
try:
 s.render.image_settings.media_type='VIDEO';s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='MEDIUM'
except Exception as e:
 print('Encoding settings failure',e);print(s.render.bl_rna.properties.keys());raise
s.view_settings.view_transform='Standard'
bpy.ops.render.render(animation=True)
