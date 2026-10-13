import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseURL=process.env.QA_URL||'http://localhost:5173',out=path.resolve(process.env.QA_OUTPUT||'artifacts/full-stage-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
const report={baseURL,started:new Date().toISOString(),method:'Playwright keyboard movement and taps on the visible Grab/Counter/Strike/Tag buttons. Deterministic game.step advances time; no HP, kills, actor positions, facing, cooldowns, or outcomes are edited.',checks:[],inputs:[],events:[],errors:[],requests:[],screenshots:[]};
let context,page;
const held=new Set();
async function move(x,y){const desired=new Set([...(x>.2?['d']:x<-.2?['a']:[]),...(y>.2?['s']:y<-.2?['w']:[])]);for(const key of held)if(!desired.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of desired)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}if(x||y)report.inputs.push({type:'move',x,y});}
async function read(){return page.evaluate(()=>{const g=window.__SLAY__.game,s=g.state,p=s.player;return{status:s.status,time:s.time,wave:s.wave,phase:s.phase,kills:s.kills,score:s.score,encountered:s.encountered,player:{id:p.id,hp:p.hp,maxHp:p.maxHp,x:p.x,y:p.y,action:p.action,counterCooldown:p.counterCooldown},partner:s.team.find(h=>h.id!==p.id),enemies:s.enemies.filter(e=>e.hp>0).map(e=>({id:e.id,hp:e.hp,x:e.x,y:e.y,action:e.action,actionTime:e.actionTime,attackHit:e.attackHit,boss:e.boss})),events:window.__fullStageEvents};});}
async function tap(action,time){await page.locator(`[data-action="${action}"]`).tap();report.inputs.push({type:'action',action,time});}
async function shot(name){const file=path.join(out,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);}
try{
 context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,colorScheme:'dark',recordVideo:{dir:out,size:{width:393,height:852}}});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
 await page.goto(baseURL,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);
 await page.locator('[data-hero="atlas"]').tap();await page.locator('#start').tap();
 await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;const onEvent=g.onEvent;window.__fullStageEvents=[];g.onEvent=e=>{window.__fullStageEvents.push({...e,time:g.state.time});onEvent(e);};});
 let lastWave=0,loops=0,lastKills=0,stallAt=0;
 while(++loops<2500){
  const s=await read();if(s.status!=='playing')break;
  if(s.wave!==lastWave){await shot(`wave-${s.wave}`);lastWave=s.wave;console.log(`WAVE ${s.wave} hp=${s.player.hp} kills=${s.kills} time=${s.time.toFixed(1)}`);}
  if(s.kills!==lastKills){lastKills=s.kills;stallAt=s.time;}
  assert.ok(s.time-stallAt<65,`Combat bot stalled at wave ${s.wave}, kills ${s.kills}`);
  const p=s.player,enemy=s.enemies.sort((a,b)=>Math.hypot(a.x-p.x,(a.y-p.y)*330)-Math.hypot(b.x-p.x,(b.y-p.y)*330))[0];
  if(['idle','walk','hurt','charge'].includes(p.action)){
   if(p.hp<p.maxHp*.22&&s.partner?.hp>p.hp){await move(0,0);await tap('tag',s.time);}
   else if(!enemy){await move(s.phase==='advance'?1:0,0);}
   else{
    const dx=enemy.x-p.x,dy=enemy.y-p.y,distance=Math.hypot(dx,dy*330),contact=(enemy.boss ? .65 : .48)-enemy.actionTime;
    if(enemy.action==='attack'&&!enemy.attackHit&&contact>0&&contact<.145&&distance<114&&Math.abs(dy)<.21&&p.counterCooldown<=0){await move(0,0);await tap('counter',s.time);}
    else if(distance<77&&Math.abs(dy)<.2){await move(0,0);await tap('grab',s.time);}
    else{await move(Math.abs(dx)>53?Math.sign(dx):0,Math.abs(dy)>.055?Math.sign(dy):0);}
   }
  }else await move(0,0);
  await page.evaluate(()=>{const g=window.__SLAY__.game;for(let i=0;i<5;i++){g.step(.016);g.render();}g.publish(true);});
  await page.waitForTimeout(20);
 }
 await move(0,0);const final=await read();report.final=final;report.events=final.events;
 assert.equal(final.status,'victory',`Expected fair input-only victory, got${final.status} hp${final.player.hp} kills${final.kills}`);assert.equal(final.kills,8);assert.equal(final.encountered,8);
 const defeated=final.events.filter(e=>e.type==='kill').map(e=>e.enemy);assert.equal(new Set(defeated).size,8);
 await page.waitForTimeout(750);assert.equal(await page.locator('#result-label').textContent(),'STAGE CLEAR');assert.equal(await page.locator('#result-kills').textContent(),'8 / 8');await shot('victory');
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.requests.length,0,JSON.stringify(report.requests));
 report.checks.push({name:'Full stage clears through real browser movement and button input, with unchanged enemy stats and geometry',passed:true,defeated,score:final.score,time:final.time,heroHealth:final.player.hp});
 console.log(`PASS FULL STAGE ${defeated.join(', ')} score=${final.score} time=${final.time.toFixed(2)} hp=${final.player.hp}`);
}catch(error){report.failure={message:error.message,stack:error.stack};if(page){report.final=await read().catch(()=>null);await shot('failure').catch(()=>{});}console.error(error);process.exitCode=1;}
finally{const video=page?.video();if(context)await context.close();if(video)report.video=await video.path();report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(`Report: ${out}/report.json`);}
