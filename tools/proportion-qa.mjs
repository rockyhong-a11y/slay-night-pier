import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const baseURL=process.env.QA_URL||'http://localhost:5173/',out=path.resolve(process.env.QA_OUTPUT||'artifacts/proportion-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,colorScheme:'dark'}),page=await context.newPage();
const modern=process.env.QA_MODERN!=='0';
const report={modern,baseURL,started:new Date().toISOString(),method:'Read-only forensic capture using the actual drawFighter renderer on isolated canvases. Fixed candidate snapshot; QA_MODERN=1 inspects current distance-driven12-frame walk banks, otherwise original6eb61a4 baseline. No source or asset edits. Modern source bounds explicitly load the authored full-body walk image while runtime views stage real updateWalking leg contacts and render the skinned rig plus reviewed upper body. State staging is only used to inspect each actor.',errors:[],requests:[],actors:[],captures:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));
try{
 await page.goto(baseURL,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);await page.locator('#start').tap();
 await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.spawnWave(1);g.spawnWave(2);g.reducedMotion=true;});
 const data=await page.evaluate(async modern=>{
  const g=window.__SLAY__.game,actors=[...g.state.team,...g.state.enemies],results=[];window.__forensicActors=actors;
  if(modern)await Promise.all(actors.map(async actor=>{const sprite=g.sprites.get(actor.id),url=new URL(sprite.walk.src);url.pathname=url.pathname.replace(/[^/]+$/,sprite.metadata.walk.image.split('/').pop());url.search='';const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url.href;});sprite.forensicFullWalk=image;}));
  function bounds(image,rect,pivot){const [x,y,w,h]=rect,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(image,x,y,w,h,0,0,w,h);const rgba=ctx.getImageData(0,0,w,h).data;let left=w,right=0,top=h,bottom=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>160){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}const toes=[];for(let x=left;x<=right;x++){let count=0;for(let y=Math.max(top,bottom-2);y<=bottom;y++)if(rgba[(y*w+x)*4+3]>160)count++;if(count)toes.push(x);}return{left,right,top,bottom,width:right-left+1,height:bottom-top+1,aspect:(right-left+1)/(bottom-top+1),toeX:toes.length?toes.reduce((a,b)=>a+b,0)/toes.length:null,groundOffset:bottom-pivot[1],crop:c.toDataURL('image/png')};}
  for(const actor of actors){const s=g.sprites.get(actor.id),m=s.metadata,poses={};for(const pose of ['idle','jab','cross','lowKick']){const f=m.combat.poses[pose];poses[pose]=bounds(s.combat,f.rect,f.pivot);}const walk=(modern?m.walk.frames:m.runFrames).map((f,index)=>({...bounds(modern?s.forensicFullWalk:s.run,f.rect||[f.x,f.y,f.width,f.height],f.pivot),index}));results.push({id:actor.id,boss:Boolean(actor.boss),renderBodyHeight:g.bodyHeight(actor),combatBodyHeight:m.combat.bodyHeight,runBodyHeight:modern?m.walk.bodyHeight:m.runBodyHeight,runFps:modern?m.walk.sampleRate:m.runFps,poses,walk});}
  return results;
 },modern);
 for(const actor of data){for(const [pose,details] of Object.entries(actor.poses)){const file=path.join(out,`${actor.id}-source-${pose}.png`);await fs.writeFile(file,Buffer.from(details.crop.split(',')[1],'base64'));delete details.crop;}for(const details of actor.walk){const file=path.join(out,`${actor.id}-source-walk-${details.index}.png`);await fs.writeFile(file,Buffer.from(details.crop.split(',')[1],'base64'));delete details.crop;}report.actors.push(actor);}
 const captures=await page.evaluate(modern=>{
  const g=window.__SLAY__.game,old={ctx:g.ctx,width:g.width,height:g.height,camera:g.camera,time:g.state.time},result=[];g.width=420;g.height=300;g.camera=0;g.state.time=10;
  for(const actor of window.__forensicActors){const original={...actor};const states=[{name:'idle',action:'idle',pose:'idle',walkTime:0},...(modern?['jab','cross','lowKick','roundhouse']:['jab']).map(pose=>({name:pose==='jab'?'attack':pose,action:actor.role==='hero'?'strike':'attack',pose,walkTime:0})),...(modern?[0,.25,.5,.75].map(phase=>({name:`walk-${Math.round(phase*12)}`,action:'walk',phase,walkTime:0})):[0,1,2,3,4,5].map(i=>({name:`walk-${i}`,action:'walk',walkTime:(i+.01)/10})))];
   for(const state of states){const canvas=document.createElement('canvas');canvas.width=420;canvas.height=300;g.ctx=canvas.getContext('2d');g.ctx.fillStyle='#18231f';g.ctx.fillRect(0,0,420,300);Object.assign(actor,{x:210,y:.57,facing:1,z:0,hp:actor.maxHp,action:state.action,actionTime:.49,walkTime:state.walkTime,turnTime:1,invulnerable:0,attackHit:true,gaitMoving:state.action==='walk',gaitTravel:(state.phase||0)*g.manifest[actor.id].walk?.cycleDistance*(actor.boss?1.15:1),renderWasWalking:state.action==='walk',renderWalkStarted:0,renderPose:state.pose||'idle',renderPoseFrom:state.pose||'idle',renderPoseTime:0,activeStrike:'jab'});
    if(modern&&state.action==='walk'){
     const distance=(state.phase||0)*g.manifest[actor.id].walk.cycleDistance*(actor.boss?1.15:1)+.01;
     Object.assign(actor,{x:210-distance,walkDistance:0,gaitTravel:0,gaitFeet:null,gaitLegPose:null,gaitRestart:true,gaitMoving:false});
     let remaining=distance;while(remaining>0){const dx=Math.min(remaining,1.2);actor.x+=dx;g.updateWalking(actor,dx,0,1/60);remaining-=dx;}
    }
    g.drawFighter(actor,state.pose?{pose:state.pose,x:0,z:0,angle:0}:null,actor);g.ctx.strokeStyle='#cbab65';g.ctx.lineWidth=1;g.ctx.beginPath();g.ctx.moveTo(0,g.floorY(.57));g.ctx.lineTo(420,g.floorY(.57));g.ctx.stroke();g.ctx.fillStyle='#eeeedf';g.ctx.font='14px monospace';g.ctx.fillText(`${actor.id} ${state.name}`,12,20);result.push({id:actor.id,state:state.name,png:canvas.toDataURL('image/png')});}
   Object.assign(actor,original);
  }
  Object.assign(g,old);return result;
 },modern);
 for(const capture of captures){const file=path.join(out,`${capture.id}-runtime-${capture.state}.png`);await fs.writeFile(file,Buffer.from(capture.png.split(',')[1],'base64'));report.captures.push({id:capture.id,state:capture.state,file});}
 report.movement=[];
 if(!modern)for(const id of data.map(a=>a.id))for(const speed of (['atlas','nova'].includes(id)?[.2,1]:[1])){
  const sequence=await page.evaluate(({id,speed})=>{const g=window.__SLAY__.game;g.start(id==='nova'?'nova':'atlas');cancelAnimationFrame(g.raf);g.raf=null;g.reducedMotion=true;const hero=['atlas','nova'].includes(id);if(!hero){g.spawnWave(1);g.spawnWave(2);g.state.wave=1;}let actor=hero?g.state.player:g.state.enemies.find(a=>a.id===id);if(hero){actor.x=150;for(const enemy of g.state.enemies){enemy.x=600;enemy.y=.1;enemy.cooldown=1000;}g.setMove(speed,0);}else{g.state.enemies=[actor];g.state.player.x=70;g.state.player.y=.57;actor.x=360;actor.y=.57;actor.facing=-1;actor.turnTime=1;actor.cooldown=1000;g.setMove(0,0);}const frames=[];for(let i=0;i<60;i++){g.step(1/60);g.render();if(i%3===0)frames.push({time:g.state.time,x:actor.x,y:actor.y,walkTime:actor.walkTime,frame:Math.floor(actor.walkTime*10)%6,png:g.canvas.toDataURL('image/png')});}return{frames,rootDistance:actor.x-frames[0].x};},{id,speed});
  const name=`${id}-${speed<1?'slow':'normal'}-movement`,files=[];for(let i=0;i<sequence.frames.length;i++){const frame=sequence.frames[i],file=path.join(out,`${name}-${String(i).padStart(3,'0')}.png`);await fs.writeFile(file,Buffer.from(frame.png.split(',')[1],'base64'));delete frame.png;frame.file=file;files.push(file);}sequence.name=name;sequence.id=id;sequence.speedInput=speed;
  const ffmpeg=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH||'/private/tmp/slay-playwright','ffmpeg-1013/ffmpeg-mac');sequence.video=path.join(out,`${name}.webm`);await run('python3',['-c',`from PIL import Image
import io,json,subprocess,sys
data=[]
for file in json.loads(sys.argv[1]):
 b=io.BytesIO();Image.open(file).convert('RGB').save(b,format='JPEG',quality=92);data.append(b.getvalue())
p=subprocess.run([sys.argv[2],'-hide_banner','-loglevel','error','-f','image2pipe','-r','20','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-y',sys.argv[3]],input=b''.join(data),capture_output=True)
if p.returncode:raise RuntimeError(p.stderr.decode())`,JSON.stringify(files),ffmpeg,sequence.video]);report.movement.push(sequence);
 }
 assert.equal(report.actors.length,10);assert.equal(report.errors.length,0);assert.equal(report.requests.length,0);console.log(`Captured${report.actors.length} actors and${report.captures.length} runtime views.`);
}catch(e){report.failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
