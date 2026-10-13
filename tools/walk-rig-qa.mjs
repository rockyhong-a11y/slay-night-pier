import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const url=process.env.QA_URL||'http://localhost:5173/';
const out=path.resolve(process.env.QA_OUTPUT||'artifacts/walk-rig-final');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,colorScheme:'dark'});
const page=await context.newPage();
const report={url,started:new Date().toISOString(),checks:[],errors:[],requests:[],cases:[],method:'Independent actual Canvas sole measurement: the authored shin footContact pixel passes through the real final skinned-UV affine draw transform. Initial identity/geometry/camera are staged; displacement, input, cadence and planted-foot updates use real game.step. No HP, cooldown, outcomes or global gameplay flags are changed.'};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));
page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
const check=(name,data={})=>{report.checks.push({name,passed:true,...data});console.log('PASS '+name);};
async function setup(id='atlas',label='right'){
 await page.evaluate(()=>{const g=window.__SLAY__.game;g.sprites=new Map(window.__walkOriginalSprites);g.manifest={...window.__walkOriginalManifest};window.__SLAY__.home();});
 await page.locator(`[data-hero="${id==='nova'?'nova':'atlas'}"]`).tap();await page.locator('#start').tap();
 await page.evaluate(({id,label})=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;const p=g.state.player;if(id!==p.id){const sprite=window.__walkOriginalSprites.get(id);g.sprites.set(p.id,sprite);g.manifest[p.id]=sprite.metadata;}p.qaIdentity=id;p.boss=id==='onyx';p.x=label.includes('left')?400:150;p.y=label.includes('up')?.85:label.includes('down')?.2:.57;p.facing=1;g.camera=p.x-140;for(const e of g.state.enemies){e.x=620;e.y=.1;}window.__walkQAActor=p;window.__walkSamples=[];g.render();},{id,label});
}
function metrics(samples){
 const groups=new Map();
 for(const s of samples){if(!s.planted||s.alpha<.15)continue;const key=`${s.foot}:${s.cycle}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 return [...groups].filter(([,g])=>g.length>=6).map(([key,g])=>({key,count:g.length,from:g[0].time,to:g.at(-1).time,xSpread:Math.max(...g.map(s=>s.worldX))-Math.min(...g.map(s=>s.worldX)),laneSpread:Math.max(...g.map(s=>s.worldLane))-Math.min(...g.map(s=>s.worldLane)),screenYSpread:Math.max(...g.map(s=>s.screenY))-Math.min(...g.map(s=>s.screenY)),maxAnchorXError:Math.max(...g.map(s=>Math.abs(s.worldX-s.anchorX))),maxAnchorLaneError:Math.max(...g.map(s=>Math.abs(s.worldLane-s.anchorY)))}));
}
async function capture(name,move,duration=1){
 await page.evaluate(move=>{window.__walkSamples=[];window.__SLAY__.game.setMove(...move);},move);
 const frames=[];
 for(let i=0;i<Math.round(duration*60);i++){
  await page.evaluate(()=>{const g=window.__SLAY__.game;g.step(1/60);g.render();});
  if(i%12===0){const file=path.join(out,`${name}-${String(i).padStart(3,'0')}.png`);await page.locator('#game-canvas').screenshot({path:file});frames.push(file);}
 }
 await page.evaluate(()=>window.__SLAY__.game.setMove(0,0));
 const result=await page.evaluate(()=>{const g=window.__SLAY__.game,p=window.__walkQAActor;return{samples:window.__walkSamples,actor:{id:p.id,x:p.x,y:p.y,walkDistance:p.walkDistance,gaitTravel:p.gaitTravel,gaitPhase:p.gaitPhase,gaitFeet:p.gaitFeet,gaitLegPose:p.gaitLegPose},status:g.state.status};});
 return{name,frames,...result,plantMetrics:metrics(result.samples)};
}
try{
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);
 report.bundle=await page.locator('script[type="module"]').evaluateAll(es=>es.map(e=>e.src));
 const assets=await page.evaluate(()=>[...window.__SLAY__.game.sprites].map(([id,s])=>({id,rig:s.metadata.walk?.rig,bodyHeight:s.metadata.walk?.bodyHeight,frames:s.metadata.walk?.frames?.length})));assert.equal(assets.length,10);for(const a of assets)assert.ok(a.rig?.parts?.shinL?.footContact&&a.rig?.parts?.shinR?.footContact,`${a.id} real sole metadata required`);assert.equal(new Set(assets.map(a=>a.bodyHeight.toFixed(6))).size,1);check('All ten normalized walk banks load continuous shin-and-boot rigs',{assets});
 await page.evaluate(()=>{
  const g=window.__SLAY__.game,draw=g.drawFighter,original=g.ctx.drawImage;
  window.__walkOriginalSprites=new Map(g.sprites);window.__walkOriginalManifest={...g.manifest};
  g.drawFighter=function(...args){const old=window.__walkDrawActor;window.__walkDrawActor=args[0];try{return draw.apply(this,args);}finally{window.__walkDrawActor=old;}};
  g.ctx.drawImage=function(image,...args){
   const actor=window.__walkQAActor,info=actor?.gaitDrawInfo,m=actor&&g.sprites.get(actor.id)?.metadata.walk?.rig;
   if(window.__walkDrawActor===actor&&info&&['shinL','shinR'].includes(info.part)&&info.rowStart>=.899&&args.length===8){
    const part=m?.parts[info.part],footName=info.part==='shinL'?'left':'right',foot=actor.gaitFeet?.[footName];
    if(part?.footContact&&foot){const t=this.getTransform(),localX=args[4]+part.footContact[0]/args[2]*args[6],localY=args[5]+part.footContact[1]/args[3]*args[7],x=t.a*localX+t.c*localY+t.e,y=t.b*localX+t.d*localY+t.f;
     window.__walkSamples.push({time:g.state.time,foot:footName,cycle:foot.cycle,q:foot.q,planted:foot.planted,alpha:this.globalAlpha,worldX:x/(g.width/420)+g.camera,worldLane:(y-g.height*.62)/(g.height*.27),screenY:y,anchorX:foot.x,anchorY:foot.y,phase:actor.gaitPhase,travel:actor.gaitTravel,actorX:actor.x,actorY:actor.y});
    }
   }
   return original.call(this,image,...args);
  };
 });
 const ids=process.env.QA_ACTORS?process.env.QA_ACTORS.split(','):assets.map(a=>a.id);
 const directions=[['slow',[.2,0]],['right',[1,0]],['left',[-1,0]],['up',[0,-1]],['down',[0,1]],['up-right',[.7,-.7]],['up-left',[-.7,-.7]],['down-right',[.7,.7]],['down-left',[-.7,.7]]];
 for(const id of ids){
  for(const [label,move] of directions){await setup(id,label);const c=await capture(`${id}-${label}`,move);report.cases.push(c);assert.ok(c.samples.length>=20,`${c.name} must measure actual rendered sole triangles`);assert.ok(c.actor.walkDistance>0);for(const p of c.plantMetrics){assert.ok(p.xSpread<.35&&p.laneSpread<.00075,`${c.name} actual planted sole slides X${p.xSpread.toFixed(3)} lane${p.laneSpread.toFixed(5)}`);assert.ok(p.maxAnchorXError<.35&&p.maxAnchorLaneError<.00075,`${c.name} rendered sole differs from world anchor`);}check(`${c.name} actual rendered soles stay planted`,{distance:c.actor.walkDistance,metrics:c.plantMetrics});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
  const slow=report.cases.find(c=>c.name===`${id}-slow`),full=report.cases.find(c=>c.name===`${id}-right`);assert.ok(Math.abs(slow.actor.gaitTravel/full.actor.gaitTravel-.2)<.001);check(`${id}20% input advances20% gait distance`);
 }
 await setup();await page.evaluate(()=>{const g=window.__SLAY__.game;g.state.player.x=640;g.camera=250;});const before=await page.evaluate(()=>window.__walkQAActor.gaitTravel),blocked=await capture('blocked-gate',[1,0],.3);assert.equal(blocked.actor.gaitTravel,before);check('Blocked gate does not animate gait');
 await setup();await capture('turn-before',[1,0],.15);const changing=await capture('turn-during',[0,-1],.15);for(const p of changing.plantMetrics)assert.ok(p.xSpread<.35&&p.laneSpread<.00075);check('Joystick heading changes preserve existing planted foot anchors',{metrics:changing.plantMetrics});
 await setup();await capture('pause-before',[1,0],.2);await page.locator('#pause').tap();const phase=await page.evaluate(()=>window.__walkQAActor.gaitPhase);await page.evaluate(()=>{const g=window.__SLAY__.game;g.step(1);g.render();});assert.equal(await page.evaluate(()=>window.__walkQAActor.gaitPhase),phase);check('Pause freezes gait');
 assert.equal(report.errors.length,0);assert.equal(report.requests.length,0);check('No browser or asset errors');
}catch(e){report.failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
