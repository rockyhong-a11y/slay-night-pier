import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
import { DIRECTIONS, GRAB_MOVES, CHAIN_MOVES, COMBAT_RULES } from '../src/combat-moves.js';

const baseURL=process.env.QA_URL||'http://localhost:5173',out=path.resolve(process.env.QA_OUTPUT||'artifacts/combat-qa');await fs.mkdir(out,{recursive:true});
const heroes=process.env.QA_HERO?process.env.QA_HERO.split(','):['atlas','nova'];for(const hero of heroes)assert.ok(['atlas','nova'].includes(hero),`Unknown QA hero ${hero}`);
const browser=await chromium.launch();
const report={baseURL,started:new Date().toISOString(),checks:[],errors:[],requests:[],sequences:[],limitation:'Isolated combat checks stage positions, facing, and cooldowns while keeping normal damage and all input/action timing. Full-stage fairness is tested separately without staging.'};
const resumeCounters=process.env.QA_RESUME==='counters';if(resumeCounters){const previous=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));report.checks=previous.checks.filter(c=>!c.name.startsWith('Onyx'));report.sequences=previous.sequences.filter(s=>!s.name.includes('onyx'));report.initialRun=previous.initialRun||previous.started;report.resumed=new Date().toISOString();}
const check=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(`PASS ${name}`);};
let context,page,events=[];
async function open(){context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,colorScheme:'dark',recordVideo:{dir:out,size:{width:393,height:852}}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});await page.goto(baseURL,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);assert.equal(await page.evaluate(()=>typeof window.__SLAY__.game.beginStrike),'function');await page.evaluate(()=>{const g=window.__SLAY__.game,original=g.onEvent;window.__combatQAEvents=[];g.onEvent=e=>{window.__combatQAEvents.push({...e,time:g.state.time});original(e);};});}
async function snapshot(){return page.evaluate(()=>{const g=window.__SLAY__.game,s=g.state,p=s.player;return{status:s.status,time:s.time,kills:s.kills,phase:s.phase,wave:s.wave,score:s.score,charge:s.charge,grabContext:s.grabContext,buffered:g.inputBuffer.length,player:{id:p.id,hp:p.hp,x:p.x,y:p.y,facing:p.facing,action:p.action,time:p.actionTime,duration:p.actionDuration,move:p.activeMove?.id,renderPose:p.renderPose,renderPoseFrom:p.renderPoseFrom,renderPoseTime:p.renderPoseTime,renderPoseDuration:p.renderPoseDuration,contactAt:p.activeClip?.contactAt,recoveryAt:p.activeClip?.recoveryAt,held:p.strikeHeld,chainHits:p.chainHits,guardUntil:p.guardUntil,counterCooldown:p.counterCooldown},grapple:p.grapple&&{id:p.grapple.move.id,target:p.grapple.target.id,impacted:p.grapple.impacted,clipDuration:p.grapple.clip?.duration},enemies:s.enemies.map(e=>({id:e.id,hp:e.hp,x:e.x,y:e.y,facing:e.facing,action:e.action,time:e.actionTime,attackHit:e.attackHit,rearUntil:e.rearUntil,facingLocked:e.facingLocked})),events:window.__combatQAEvents};});}
async function step(dt,realTime=false){await page.evaluate(dt=>{const g=window.__SLAY__.game;let remaining=dt;while(remaining>0){const slice=Math.min(remaining,1/60);g.step(slice);g.render();remaining-=slice;}g.publish(true);},dt);if(realTime)await page.waitForTimeout(Math.round(dt*1000));}
async function reset(hero='atlas'){
 await page.evaluate(()=>window.__SLAY__.home());await page.locator(`[data-hero="${hero}"]`).tap();await page.locator('#start').tap();
 await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.setMove(0,0);g.reducedMotion=true;window.__combatQAEvents=[];g.state.player.invulnerable=0;});
}
async function closeEnemy({side='front',facing,attack=false,x=190}={}){
 return page.evaluate(({side,facing,attack,x})=>{const g=window.__SLAY__.game,p=g.state.player;p.x=x;p.y=.57;p.facing=1;p.action='idle';p.actionTime=0;p.vx=0;p.z=0;p.invulnerable=0;p.counterCooldown=0;g.hitstop=0;g.camera=x-140;g.setMove(0,0);for(const e of g.state.enemies){e.x=x+340;e.y=.1;e.cooldown=1000;e.action='idle';e.actionTime=0;e.vx=0;e.invulnerable=0;}const e=g.state.enemies[0];e.x=p.x+48;e.y=p.y;e.facing=facing??(side==='rear'?1:-1);e.facingLocked=side==='rear'?1000:0;if(attack)e.cooldown=0;g.render();return{id:e.id,hp:e.hp};},{side,facing,attack,x});
}
async function keyTap(code='j'){await page.keyboard.down(code);await page.keyboard.up(code);}
async function contactProof(){return page.evaluate(()=>{
 const g=window.__SLAY__.game,ctx=g.ctx,drawFighter=g.drawFighter,drawImage=ctx.drawImage,drawEffects=g.drawEffects,translate=ctx.translate;let actor=null,inEffects=false,index=0;const points=[],bursts=[];
 g.drawFighter=function(...args){const old=actor;actor=args[0];try{return drawFighter.apply(this,args);}finally{actor=old;}};
 ctx.drawImage=function(image,...args){const sprite=actor&&g.sprites.get(actor.id),landmark=actor&&g.strikeContacts?.actors[actor.id]?.poses[actor.renderPose];if(image===sprite?.combat&&args.length===8&&landmark?.rect.every((v,i)=>Math.abs(v-args[i])<.01)){const t=this.getTransform(),x=args[4]+landmark.pixel[0]/args[2]*args[6],y=args[5]+landmark.pixel[1]/args[3]*args[7];points.push({id:actor.id,pose:actor.renderPose,alpha:this.globalAlpha,x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f});}return drawImage.call(this,image,...args);};
 g.drawEffects=function(...args){inEffects=true;index=0;try{return drawEffects.apply(this,args);}finally{inEffects=false;}};
 ctx.translate=function(x,y){const result=translate.call(this,x,y);if(inEffects){const t=this.getTransform(),burst=g.hitBursts[index++];bursts.push({x:t.e,y:t.f,burst:{...burst}});}return result;};
 try{g.render();return{points,bursts,scale:g.width/420};}finally{g.drawFighter=drawFighter;ctx.drawImage=drawImage;g.drawEffects=drawEffects;ctx.translate=translate;}
 });}
const directionKey={up:'w',down:'s',left:'a',right:'d'};
async function startDirection(direction){await page.keyboard.down(directionKey[direction]);}
async function endDirection(direction){await page.keyboard.up(directionKey[direction]);}
async function frame(name){const file=path.join(out,`${name}.png`);await page.locator('#game-canvas').screenshot({path:file});return{file,state:await snapshot()};}
async function captureSequence(name,duration,interval=.1){
 const frames=[];frames.push(await frame(`${name}-000`));let elapsed=0,index=1;
 while(elapsed<duration){const dt=Math.min(interval,duration-elapsed);await step(dt,true);elapsed+=dt;frames.push(await frame(`${name}-${String(index++).padStart(3,'0')}`));}
 const sequence={name,duration,interval,frames};report.sequences.push(sequence);
 const browserCache=process.env.PLAYWRIGHT_BROWSERS_PATH;
 if(browserCache){const ffmpeg=path.join(browserCache,'ffmpeg-1013/ffmpeg-mac');try{await fs.access(ffmpeg);sequence.video=path.join(out,`${name}.webm`);await run('python3',['-c',`from PIL import Image
import io,json,subprocess,sys
data=[]
for file in json.loads(sys.argv[1]):
 b=io.BytesIO();Image.open(file).convert('RGB').save(b,format='JPEG',quality=92);data.append(b.getvalue())
p=subprocess.run([sys.argv[2],'-hide_banner','-loglevel','error','-f','image2pipe','-r',sys.argv[3],'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-y',sys.argv[4]],input=b''.join(data),capture_output=True)
if p.returncode:raise RuntimeError(p.stderr.decode())`,JSON.stringify(frames.map(f=>f.file)),ffmpeg,String(1/interval),sequence.video]);}catch(error){sequence.videoError=error.message;}}
 sequence.contactSheet=path.join(out,`${name}-sequence.png`);
 const selected=[frames[0],frames[Math.floor(frames.length*.35)],frames[Math.floor(frames.length*.65)],frames.at(-1)].map(f=>f.file);
 await run('python3',['-c',`from PIL import Image,ImageDraw
import json,sys
files=json.loads(sys.argv[1]);ims=[Image.open(f).convert('RGB') for f in files]
w,h=ims[0].size;result=Image.new('RGB',(w*len(ims),h+28),'#101414');draw=ImageDraw.Draw(result)
for i,im in enumerate(ims):result.paste(im,(w*i,28));draw.text((w*i+8,8),str(i+1)+' / '+str(len(ims)),fill='#f2f1e7')
result.save(sys.argv[2])`,JSON.stringify(selected),sequence.contactSheet]);
 return frames;
}
async function advanceToIdle(max=4){for(let n=0;n<Math.ceil(max/.05);n++){const s=await snapshot();if(['idle','walk','hurt'].includes(s.player.action)&&!s.grapple)return;await step(.05);}throw Error('Move never recovered');}
async function setEnemyContact(elapsed){await page.evaluate(elapsed=>{const g=window.__SLAY__.game,e=g.state.enemies[0];e.actionTime=elapsed;g.hitstop=0;},elapsed);}
try{
 await open();
 if(process.env.QA_CONTACT_ONLY==='1'){
  for(const hero of heroes){
   await reset(hero);
   for(const move of ['jab','cross','lowKick','roundhouse',...(process.env.QA_CONTACT_CHARGE==='1'?['chargeStrike']:[])]){
    await advanceToIdle();
    await page.evaluate(()=>{const g=window.__SLAY__.game,p=g.state.player;p.vx=0;p.invulnerable=0;g.hitstop=0;g.setMove(0,0);for(const e of g.state.enemies){e.x=530;e.y=.1;e.cooldown=1000;e.vx=0;}const e=g.state.enemies[0];e.x=p.x+78;e.y=p.y;e.action='attack';e.actionTime=0;e.actionDuration=1000;e.attackHit=true;e.facing=-1;e.activeStrike='jab';g.render();});
    const before=await snapshot();if(move==='chargeStrike'){await page.keyboard.down('j');await step(.55);await page.keyboard.up('j');}else await keyTap();const striking=await snapshot();assert.equal(striking.player.move,move);
    await step(striking.player.duration*striking.player.contactAt+.005);
    const contact=await snapshot();assert.ok(contact.enemies[0].hp<before.enemies[0].hp);if(move==='chargeStrike')assert.ok(['launcher','cross'].includes(contact.player.renderPose),'Charged contact must show extended fist');else assert.equal(contact.player.renderPose,move,'Contact must display the extended semantic limb pose');const contactBlend=Math.min(1,(contact.time-contact.player.renderPoseTime)/(contact.player.renderPoseDuration||.09));assert.ok(contactBlend>=.9,'Contact pose must be at least 90% visible');const canvas=await contactProof(),point=canvas.points.filter(p=>p.id===hero).sort((a,b)=>b.alpha-a.alpha)[0],burst=canvas.bursts.at(-1);let alignmentError=null;if(point&&burst){alignmentError=Math.hypot(point.x-burst.x,point.y-burst.y)/canvas.scale;assert.ok(alignmentError<1,`${hero} ${move} burst must align with actual drawn opaque weapon pixel: ${alignmentError}`);}if(process.env.QA_CONTACT_CHARGE==='1')assert.ok(point&&burst,'Actual Canvas landmark and effect required');const proof=await frame(`${hero}-${move}-exact-contact`);
    report.sequences.push({name:`${hero}-${move}-exact-contact`,frames:[proof]});check(`${hero} ${move} exact contact at distance78`,{contact,contactBlend,canvas,alignmentError});
    await advanceToIdle();
   }
  }
  if(process.env.QA_CONTACT_CHARGE==='1'){
   await reset('atlas');await closeEnemy({attack:true});await step(.01);const before=await snapshot();assert.equal(before.enemies[0].action,'attack');await step(.481);const hit=await snapshot();assert.ok(hit.player.hp<before.player.hp,'Real enemy AI attack must connect');const canvas=await contactProof(),point=canvas.points.filter(p=>p.id===hit.enemies[0].id).sort((a,b)=>b.alpha-a.alpha)[0],burst=canvas.bursts.at(-1);assert.ok(point&&burst);const alignmentError=Math.hypot(point.x-burst.x,point.y-burst.y)/canvas.scale;assert.ok(alignmentError<1);const proof=await frame('viper-real-AI-exact-contact');report.sequences.push({name:'viper-real-AI-exact-contact',frames:[proof]});check('Real Viper AI attack effect aligns with actual opaque fist pixel',{before,hit,canvas,alignmentError});
  }
 }else{

 if(!resumeCounters){
 const assets=await page.evaluate(()=>{const g=window.__SLAY__.game;return{clips:Object.keys(g.motion.clips),banks:[...g.sprites].map(([id,s])=>({id,combat:Boolean(s.combat),metadata:Object.keys(s.metadata.combat?.poses||{}).length,grapple:Boolean(s.grapple)}))};});
 for(const hero of heroes)for(const side of ['front','rear'])for(const direction of DIRECTIONS)assert.ok(assets.clips.includes(GRAB_MOVES[hero][side][direction].clip),`Missing Blender clip ${hero}_${side}_${direction}`);
 for(const id of ['jab','cross','lowKick','roundhouse','chargeStrike','atlas_chain','nova_chain','atlas_counter_slam','nova_counter_slam','atlas_counter_armLock','nova_counter_armLock'])assert.ok(assets.clips.includes(id),`Missing clip ${id}`);
 for(const bank of assets.banks)assert.ok(bank.combat&&bank.metadata>=10,`Missing semantic combat bank ${bank.id}`);check('All directional grab, strike, chain, and counter Blender clips load',assets);
 const limbExtents=await page.evaluate(()=>['atlas','nova'].map(id=>{const s=window.__SLAY__.game.sprites.get(id),poses=s.metadata.combat.poses;return{id,poses:Object.fromEntries(['idle','jab','cross','lowKick','roundhouse'].map(key=>{const source=poses[key],r=source.rect||[source.x,source.y,source.width,source.height],f={...source,x:r[0],y:r[1],width:r[2],height:r[3]},c=document.createElement('canvas');c.width=f.width;c.height=f.height;const ctx=c.getContext('2d');ctx.drawImage(s.combat,f.x,f.y,f.width,f.height,0,0,f.width,f.height);const d=ctx.getImageData(0,0,f.width,f.height).data;let left=f.width,right=0,top=f.height,bottom=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(d[(y*f.width+x)*4+3]>160){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return[key,{left,right,top,bottom,rightFromCenter:right-(f.centerPivot?.[0]||f.pivot[0]),bodyHeight:s.metadata.combat.bodyHeight}];}))};}));
 for(const hero of limbExtents)for(const move of ['jab','cross','lowKick','roundhouse'])assert.ok(hero.poses[move].rightFromCenter>hero.poses.idle.rightFromCenter+12,`${hero.id} ${move} must visibly extend a limb beyond idle silhouette`);
 check('Both hero banks draw extended fists and legs beyond idle silhouette', {limbExtents});

 for(const hero of heroes){
  await reset(hero);await closeEnemy();
  const before=await snapshot();await page.keyboard.down('j');await step(.55);let held=await snapshot();assert.equal(held.player.action,'charge');assert.equal(held.enemies[0].hp,before.enemies[0].hp);assert.ok(held.charge>=1);assert.equal(held.player.held,true);
  await page.keyboard.up('j');let released=await snapshot();assert.equal(released.player.move,'chargeStrike');assert.equal(released.player.held,false);
  const chargeFrames=await captureSequence(`${hero}-charge`,.75,.1);const firstChargeHit=chargeFrames.find(f=>f.state.enemies[0].hp<before.enemies[0].hp);assert.ok(firstChargeHit,'Charged strike requires a contact frame');assert.ok(firstChargeHit.state.player.time>=released.player.duration*released.player.contactAt-.01,'Charged strike cannot damage during windup');let turned=await snapshot();const target=turned.enemies[0];assert.ok(target.hp<before.enemies[0].hp);assert.equal(target.action,'rearStun');assert.equal(target.facing,turned.player.facing);assert.ok(target.facingLocked>0);assert.equal(turned.grabContext.side,'rear');
  await keyTap('k');assert.equal((await snapshot()).grapple.id,`${hero}_rear_down`);await captureSequence(`${hero}-charge-rear-grab`,1.7,.15);check(`${hero}: hold charges, release strikes, turns target, rear grab follows`,{held,released,target});
 }
 for(const hero of heroes){
  await reset(hero);const enemy=await closeEnemy();await keyTap();
  const moves=[];
  for(let index=0;index<4;index++){
   const current=await snapshot();assert.equal(current.player.action,'strike');moves.push(current.player.move);
   await step(current.player.duration*.15);await keyTap();assert.ok((await snapshot()).buffered>0,'Rapid tap should buffer while strike is busy');
   const seq=await captureSequence(`${hero}-${current.player.move}`,current.player.duration*.66,.06);const hits=seq.flatMap(f=>f.state.events).filter(e=>e.type==='hit'&&e.kind===current.player.move);assert.ok(hits.length>0,`Visible contact required for ${current.player.move}`);
   for(let spin=0;spin<12;spin++){const s=await snapshot();if(s.player.move!==current.player.move||s.player.action==='chain')break;await step(.025,true);}
  }
  const chained=await snapshot();assert.deepEqual(moves,['jab','cross','lowKick','roundhouse']);assert.equal(chained.player.action,'chain');assert.equal(chained.grapple.id,CHAIN_MOVES[hero].id);
  await captureSequence(`${hero}-chain`,chained.player.duration+.2,.15);const after=await snapshot();assert.ok(after.enemies.find(e=>e.id===enemy.id).hp<enemy.hp);assert.equal(after.player.action,'idle');
  const strikeEvents=after.events.filter(e=>e.type==='strike');assert.equal(strikeEvents.length,4);assert.equal(after.events.filter(e=>e.type==='chain').length,1);check(`${hero}: four buffered taps form jab/cross/kick/roundhouse and fifth chains`,{moves,chain:chained.grapple.id,events:after.events});
 }
 if(process.env.QA_REGRESSION!=='1')for(const hero of heroes)for(const side of ['front','rear'])for(const direction of DIRECTIONS){
  await reset(hero);const before=await closeEnemy({side});await startDirection(direction);await keyTap('k');await endDirection(direction);const grab=await snapshot();const expected=GRAB_MOVES[hero][side][direction];assert.equal(grab.grapple?.id,expected.id,`${hero} ${side} ${direction}`);
  await captureSequence(expected.id,grab.player.duration+.15,.2);const after=await snapshot();assert.ok(after.enemies[0].hp<before.hp);assert.equal(after.grapple,null);check(`${hero} ${side} ${direction} grab slot`,{id:expected.id,damage:before.hp-after.enemies[0].hp,events:after.events});
 }
 }
 await reset('atlas');await page.evaluate(()=>{const g=window.__SLAY__.game;g.spawnWave(2);g.state.enemies.sort((a,b)=>Number(b.id==='onyx')-Number(a.id==='onyx'));});await closeEnemy({x:1750});
 await page.keyboard.down('j');await step(.6);await page.keyboard.up('j');await step(.75);const onyxOpening=await snapshot();assert.equal(onyxOpening.enemies[0].id,'onyx');assert.equal(onyxOpening.enemies[0].action,'rearStun');
 report.sequences.push({name:'onyx-rear-opening',frames:[await frame('onyx-rear-opening')]});await page.keyboard.down('d');for(let n=0;n<20;n++){const s=await snapshot();if(s.enemies[0].x-s.player.x<76)break;await step(.05);}await page.keyboard.up('d');await keyTap('k');assert.equal((await snapshot()).grapple?.id,'atlas_rear_down');await captureSequence('atlas-onyx-rear-grab',1.7,.15);check('Onyx charged turn and rear grab use final cleaned bank',{opening:onyxOpening});
 for(const hero of heroes)for(const scenario of ['early','slam','armLock','late']){
  await reset(hero);await closeEnemy({attack:true});await step(.01);assert.equal((await snapshot()).enemies[0].action,'attack','Enemy real AI must begin attack');
  const before=await snapshot();
  if(scenario==='early'){await keyTap('l');await captureSequence(`${hero}-counter-early`,.7,.1);const s=await snapshot();assert.ok(!s.events.some(e=>e.type==='counter'));assert.ok(s.player.hp<before.player.hp);assert.ok(s.events.some(e=>e.type==='counterMiss'));check(`${hero} early counter fails`,{events:s.events});}
  else if(scenario==='late'){await step(.5);const hit=await snapshot();assert.ok(hit.player.hp<before.player.hp);await keyTap('l');const s=await snapshot();assert.ok(!s.grapple);assert.ok(s.events.some(e=>e.type==='counterMiss'&&e.reason==='late'));check(`${hero} late counter cannot erase received damage`,{events:s.events});}
  else{await step(.37);if(scenario==='armLock')await startDirection('down');await keyTap('l');if(scenario==='armLock')await endDirection('down');const guarding=await snapshot();assert.equal(guarding.player.action,'guard');await step(.12);const caught=await snapshot();assert.equal(caught.player.action,'counter');assert.equal(caught.grapple.id,`${hero}_counter_${scenario}`);assert.equal(caught.player.hp,before.player.hp);assert.equal(caught.enemies[0].action,'grabbed');assert.equal(caught.enemies[0].attackHit,true);await captureSequence(`${hero}-counter-${scenario}`,caught.player.duration+.15,.15);const after=await snapshot();assert.ok(after.enemies[0].hp<before.enemies[0].hp);assert.equal(after.player.hp,before.player.hp);check(`${hero} timely counter ${scenario} consumes attack, captures, deals damage`,{guarding,caught,events:after.events});}
 }
 await reset();await closeEnemy();await page.keyboard.down('j');await step(.6);await page.locator('#pause').tap();const paused=await snapshot();assert.equal(paused.player.held,false);await page.keyboard.up('j');await page.locator('#resume').tap();await step(.6);assert.ok(!(await snapshot()).events.some(e=>e.type==='strike'),'Pause must cancel held strike without firing');check('Pause cancels charged input without accidental release attack');
 await reset();await closeEnemy({attack:true});await page.evaluate(()=>{const g=window.__SLAY__.game;for(const h of g.state.team)h.hp=1;});await step(.7);let knocked=await snapshot();assert.equal(knocked.status,'playing');assert.equal(knocked.player.id,'nova');await step(1.2);await page.evaluate(()=>{const g=window.__SLAY__.game,p=g.state.player,e=g.state.enemies[0];e.x=p.x+30;e.y=p.y;e.facing=-1;e.action='idle';e.cooldown=0;});await step(.7);assert.equal((await snapshot()).status,'gameover');await page.waitForTimeout(700);assert.equal(await page.locator('#result-label').textContent(),'GAME OVER');await page.screenshot({path:path.join(out,'gameover.png')});check('Enemy AI attacks auto-tag first KO then game over second KO');
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.requests.length,0,JSON.stringify(report.requests));check('No browser errors or failed assets');
}catch(error){report.failure={message:error.message,stack:error.stack};if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{const video=page?.video();if(context)await context.close();if(video)report.video=await video.path();report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(`Report: ${out}/report.json`);}
