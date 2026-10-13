import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const url=process.env.QA_URL||'http://127.0.0.1:5173/';
const out=path.resolve(process.env.QA_OUTPUT||'artifacts/gait-lifecycle-release');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();
const report={url,started:new Date().toISOString(),checks:[],cases:[],errors:[],requests:[],method:'Actual Canvas shin sole pixel through final affine UV draw transforms; real keyboard/button inputs and game.step. Only initial actor positions are staged. HP, cooldowns, attacks, damage and tag outcomes remain unchanged.'};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));
page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
const pass=(name,data={})=>{report.checks.push({name,passed:true,...data});console.log('PASS '+name);};
const shot=async name=>{const p=path.join(out,name+'.png');await page.locator('#game-canvas').screenshot({path:p});return p;};
async function setup(kind='far'){
 await page.keyboard.up('KeyD');await page.keyboard.up('KeyJ');await page.evaluate(()=>window.__SLAY__.home());
 await page.locator('[data-hero="atlas"]').tap();await page.locator('#start').tap();
 await page.evaluate(kind=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;const p=g.state.player;p.x=kind==='turn'?360:150;p.y=.57;
  g.state.enemies.forEach((e,i)=>{e.x=kind==='turn'?170+i*40:kind==='grab'&&i===0?225:2250;e.y=kind==='turn'||kind==='grab'&&i===0?.57:.1;});
  window.__lifeSamples=[];g.render();},kind);
}
async function tick(count,screens=[]){
 for(let i=0;i<count;i++){
  await page.evaluate(()=>{const g=window.__SLAY__.game;g.step(1/60);g.render();});
  if(screens.includes(i))await shot(`frame-${report.cases.length}-${String(i).padStart(3,'0')}`);
 }
}
async function state(){return page.evaluate(()=>{const g=window.__SLAY__.game,p=g.state.player;return{id:p.id,x:p.x,y:p.y,action:p.action,gaitMoving:p.gaitMoving,gaitFeet:p.gaitFeet,gaitLegPose:p.gaitLegPose,renderWasWalking:p.renderWasWalking,renderPoseFromWalk:p.renderPoseFromWalk,renderPoseBlend:p.renderPoseBlend,tagCooldown:g.state.tagCooldown,time:g.state.time};});}
try{
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);
 report.bundle=await page.locator('script[type="module"]').evaluateAll(es=>es.map(e=>e.src));
 assert.ok(report.bundle.some(p=>p.includes('BP5poZXk')),'Frozen release bundle BP5poZXk must be loaded');
 await page.evaluate(()=>{const g=window.__SLAY__.game,draw=g.drawFighter,image=g.ctx.drawImage;window.__lifeSamples=[];
  // Real UI start, with fixture geometry staged before its first simulation tick.
  // Clock advances below always use the real game.step/render methods.
  g.startLoop=()=>{};
  g.drawFighter=function(...args){const old=window.__lifeDrawActor;window.__lifeDrawActor=args[0];try{return draw.apply(this,args);}finally{window.__lifeDrawActor=old;}};
  g.ctx.drawImage=function(texture,...args){const a=window.__lifeDrawActor,info=a?.gaitDrawInfo,rig=a&&g.sprites.get(a.id)?.metadata.walk?.rig;
   if(info&&rig&&info.part.startsWith('shin')&&info.rowStart>=.899&&args.length===8){const part=rig.parts[info.part],side=info.part==='shinL'?'left':'right',foot=a.gaitFeet?.[side];if(foot){const t=this.getTransform(),u=args[4]+part.footContact[0]/args[2]*args[6],v=args[5]+part.footContact[1]/args[3]*args[7],x=t.a*u+t.c*v+t.e,y=t.b*u+t.d*v+t.f;
    window.__lifeSamples.push({id:a.id,time:g.state.time,action:a.action,moving:a.gaitMoving,facing:a.facing,turnFromFacing:a.turnFromFacing,turnTime:a.turnTime,foot:side,cycle:foot.cycle,planted:foot.planted,alpha:this.globalAlpha,worldX:x/(g.width/420)+g.camera,worldLane:(y-g.height*.62)/(g.height*.27),anchorX:foot.x,anchorY:foot.y});}}
   return image.call(this,texture,...args);};
 });
 await setup('turn');await tick(9,[0,2,4,7]);
 const turning=await page.evaluate(()=>window.__lifeSamples.filter(s=>s.moving&&s.planted&&s.alpha>.15&&s.turnFromFacing===-s.facing&&s.turnTime<.09));
 report.npcDebug=await page.evaluate(()=>({samples:window.__lifeSamples,enemies:window.__SLAY__.game.state.enemies.map(e=>({id:e.id,action:e.action,x:e.x,facing:e.facing,turnTime:e.turnTime,turnFromFacing:e.turnFromFacing,gaitMoving:e.gaitMoving}))}));
 assert.ok(turning.length>=8,'Natural NPC turns must measure their actual planted raster soles');
 const turnMetrics={samples:turning.length,actors:[...new Set(turning.map(s=>s.id))],maxX:Math.max(...turning.map(s=>Math.abs(s.worldX-s.anchorX))),maxLane:Math.max(...turning.map(s=>Math.abs(s.worldLane-s.anchorY)))};
 assert.ok(turnMetrics.maxX<.35&&turnMetrics.maxLane<.00075,JSON.stringify(turnMetrics));report.cases.push({name:'npc-active-turn',samples:turning});pass('NPC turn uses current facing while actual soles stay anchored',turnMetrics);
 await setup();await page.keyboard.down('KeyD');await tick(12);const atlasBefore=await state();await shot('atlas-walking-before-tag');
 await page.locator('[data-action="tag"]').tap();const novaIncoming=await state();assert.equal(novaIncoming.id,'nova');assert.equal(novaIncoming.gaitFeet,null);assert.equal(novaIncoming.gaitLegPose,null);
 await tick(184);const novaBefore=await state();assert.ok(novaBefore.x-atlasBefore.x>100,'Nova must actually walk before tagback');await shot('nova-walking-before-tagback');
 await page.locator('[data-action="tag"]').tap();const atlasIncoming=await state();assert.equal(atlasIncoming.id,'atlas');assert.equal(atlasIncoming.gaitFeet,null);assert.equal(atlasIncoming.gaitLegPose,null);assert.ok(Math.abs(atlasIncoming.x-novaBefore.x)<1e-8);
 await tick(6,[0,2,5]);const atlasAfter=await state();assert.ok(atlasAfter.gaitFeet&&atlasAfter.gaitLegPose);for(const foot of Object.values(atlasAfter.gaitFeet))assert.ok(Math.abs(foot.x-atlasAfter.x)<45,'Returning Atlas cannot reuse distant old contacts');
 const tagSamples=await page.evaluate(()=>window.__lifeSamples.filter(s=>s.id==='atlas'&&s.time>3.25&&s.planted&&s.alpha>.15));assert.ok(tagSamples.length>0);const maxTagX=Math.max(...tagSamples.map(s=>Math.abs(s.worldX-s.anchorX))),maxTagLane=Math.max(...tagSamples.map(s=>Math.abs(s.worldLane-s.anchorY)));assert.ok(maxTagX<.35&&maxTagLane<.00075);
 report.cases.push({name:'real-input-tag-lifecycle',atlasBefore,novaIncoming,novaBefore,atlasIncoming,atlasAfter,maxTagX,maxTagLane});pass('Real Atlas→Nova→Atlas tag clears old contacts and resumes a connected rig',{maxTagX,maxTagLane});await page.keyboard.up('KeyD');
 for(const action of ['jab','charge','grab']){
  await setup(action==='grab'?'grab':'far');await page.keyboard.down('KeyD');await tick(12);await shot(`${action}-moving`);
  if(action==='jab'){await page.keyboard.press('KeyJ');}
  else if(action==='charge'){await page.keyboard.down('KeyJ');await tick(38);await page.keyboard.up('KeyD');}
  else{await page.keyboard.press('KeyK');}
  const frames=[];for(let i=0;i<7;i++){await tick(1);const s=await state();frames.push(s);if([0,2,4,6].includes(i))await shot(`${action}-fade-${i}`);}
  const fade=frames.filter(s=>s.renderPoseFromWalk);assert.ok(fade.length>0,`${action} must capture walk→action fade`);
  const poses=fade.filter(s=>!s.gaitMoving).map(s=>JSON.stringify(s.gaitLegPose));assert.ok(poses.length>0,`${action} must retain frozen full-body gait pose`);assert.equal(new Set(poses).size,1,`${action} transition must not reanimate stale gait`);
  report.cases.push({name:`moving-to-${action}`,frames});pass(`Moving→${action} draws a frozen full-body walk fade`,{fadeFrames:fade.length});await page.keyboard.up('KeyD');await page.keyboard.up('KeyJ');
 }
 assert.equal(report.errors.length,0);assert.equal(report.requests.length,0);pass('No browser or asset errors');
}catch(e){report.failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
