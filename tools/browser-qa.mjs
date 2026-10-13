import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseURL=process.env.QA_URL||'http://localhost:5173';
const out=path.resolve(process.env.QA_OUTPUT||'artifacts/browser-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
const report={baseURL,started:new Date().toISOString(),checks:[],errors:[],requests:[],screenshots:[],limitation:'Chromium mobile emulation; physical iOS Safari callouts and browser chrome not tested.'};
const check=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(`PASS ${name}`);};
async function shot(page,name,fullPage=false){const file=path.join(out,`${name}.png`);await page.screenshot({path:file,fullPage});report.screenshots.push(file);}
async function open(width,height,colorScheme='dark'){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<900,hasTouch:true,colorScheme});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
 await page.goto(baseURL,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.evaluate(()=>typeof window.__SLAY__.game.beginStrike),'function','Combat overhaul engine must be ready');return{context,page};
}
async function state(page){return page.evaluate(()=>{const s=window.__SLAY__.game.state;return{status:s.status,time:s.time,player:{id:s.player.id,hp:s.player.hp,action:s.player.action,x:s.player.x,y:s.player.y}};});}
async function freeze(page){await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.setMove(0,0);});}
async function step(page,dt){await page.evaluate(dt=>{const g=window.__SLAY__.game;let remaining=dt;while(remaining>0){const slice=Math.min(remaining,1/60);g.step(slice);g.render();remaining-=slice;}g.publish(true);},dt);}
try{
 for(const [width,height] of [[320,568],[393,852],[430,932],[844,390],[1280,900]])for(const theme of ['dark','light']){
  const {context,page}=await open(width,height,theme),dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  await shot(page,`lobby-${width}x${height}-${theme}`,true);assert.ok(dimensions.scroll<=width+1&&dimensions.width<=width+1,`Lobby horizontal overflow${JSON.stringify(dimensions)}`);
  const lobbyButtons=await page.locator('#lobby button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{name:e.id||e.dataset.hero,left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  for(const b of lobbyButtons)assert.ok(b.left>=0&&b.right<=width+1,`Lobby ${b.name} overflow`);if(width===320&&height===568)assert.ok(lobbyButtons.find(b=>b.name==='start').bottom<=height,'320px Start must fit initially');
  assert.equal(await page.locator('[data-hero]').count(),2);assert.equal(await page.locator('.enemy-roster figure').count(),8);await page.locator('#start').click();assert.equal((await state(page)).status,'playing');
  assert.deepEqual(await page.locator('.actions [data-action]').evaluateAll(es=>es.map(e=>e.dataset.action).sort()),['counter','grab','strike']);
  const controls=await page.locator('#arena button,#joystick').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{name:e.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  for(const c of controls)assert.ok(c.left>=0&&c.right<=width+1&&c.top>=0&&c.bottom<=height+1,`Offscreen ${c.name} ${width}x${height}${JSON.stringify(c)}`);
  await freeze(page);await step(page,.016);await shot(page,`game-${width}x${height}-${theme}`);check(`Three-button responsive ${width}x${height} ${theme}`,{dimensions,lobbyButtons,controls});await context.close();
 }
 const {context,page}=await open(393,852),cdp=await context.newCDPSession(page);
 await page.locator('[data-hero="nova"]').tap();await page.locator('#start').tap();assert.equal((await state(page)).player.id,'nova');check('Hero selection starts Nova');
 const b=await page.locator('#joystick').boundingBox(),center={x:b.x+b.width/2,y:b.y+b.height/2},before=(await state(page)).player.x;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+b.width*.35,y:center.y}]});await page.waitForTimeout(400);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok((await state(page)).player.x>before+35);assert.deepEqual(await page.evaluate(()=>window.__SLAY__.game.move),{x:0,y:0});check('Touch joystick moves and releases');await freeze(page);
 await page.evaluate(()=>{const g=window.__SLAY__.game;g.state.player.action='idle';g.state.tagCooldown=0;g.state.team.find(h=>h.id==='atlas').hp=83;g.state.team.find(h=>h.id==='nova').hp=61;for(const e of g.state.enemies)e.cooldown=1000;g.publish(true);});
 await page.locator('[data-action="tag"]').tap();assert.equal((await state(page)).player.id,'atlas');assert.equal((await state(page)).player.hp,83);await step(page,3.1);await page.locator('[data-action="tag"]').tap();assert.equal((await state(page)).player.id,'nova');assert.equal((await state(page)).player.hp,61);check('Tag preserves individual health');
 await page.locator('#pause').tap();const paused=(await state(page)).time;await step(page,2);assert.equal((await state(page)).time,paused);assert.equal((await state(page)).status,'paused');await shot(page,'pause-mobile');await page.locator('#resume').tap();await step(page,.2);assert.equal((await state(page)).status,'playing');assert.ok((await state(page)).time>paused);check('Pause freezes time and resumes');
 await page.evaluate(()=>{window.__qaSuppression=[];for(const type of ['contextmenu','selectstart','dragstart'])document.addEventListener(type,e=>queueMicrotask(()=>window.__qaSuppression.push({type,prevented:e.defaultPrevented})));});
 for(const selector of ['[data-action="strike"]','[data-action="grab"]','[data-action="counter"]','#joystick','#pause']){const r=await page.locator(selector).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});await page.waitForTimeout(850);await step(page,.85);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});if(selector==='#pause')await page.locator('#resume').tap();await step(page,2);}
 const suppression=await page.evaluate(()=>['[data-action="strike"]','[data-action="grab"]','[data-action="counter"]','#joystick','#pause','.wordmark'].map(selector=>{const e=document.querySelector(selector),s=getComputedStyle(e);return{selector,userSelect:s.userSelect,touchAction:s.touchAction,prevented:['contextmenu','selectstart','dragstart'].map(type=>({type,prevented:!e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))}))};}));
 for(const e of suppression){assert.equal(e.userSelect,'none');for(const event of e.prevented)assert.equal(event.prevented,true);}assert.equal(await page.evaluate(()=>String(getSelection())),'');
 await page.locator('#help').tap();const checkbox=page.locator('#reduce-effects'),checked=await checkbox.isChecked();await checkbox.tap();assert.equal(await checkbox.isChecked(),!checked);const nativeAllowed=await checkbox.evaluate(e=>['contextmenu','selectstart','dragstart'].map(type=>({type,allowed:e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))})));assert.ok(nativeAllowed.every(e=>e.allowed));await page.locator('#help-dialog [data-close]').last().tap();check('Longpress callouts suppressed; native checkbox usable',{suppression,nativeAllowed,actualEvents:await page.evaluate(()=>window.__qaSuppression)});
 const strikeRect=await page.locator('[data-action="strike"]').boundingBox(),cancelScore=await page.evaluate(()=>window.__SLAY__.game.state.score);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:strikeRect.x+strikeRect.width/2,y:strikeRect.y+strikeRect.height/2}]});await step(page,.6);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await step(page,.7);
 const cancelled=await page.evaluate(()=>{const g=window.__SLAY__.game;return{held:g.state.player.strikeHeld,buffered:g.inputBuffer.length,action:g.state.player.action,score:g.state.score};});assert.equal(cancelled.held,false);assert.equal(cancelled.buffered,0);assert.equal(cancelled.score,cancelScore);assert.equal(await page.locator('[data-action="strike"]').evaluate(e=>e.classList.contains('pressed')),false);check('Touch pointer cancellation clears charge and buffer without firing',{cancelled});

 await page.locator('#pause').tap();await page.locator('#return-home').tap();await page.locator('[data-hero="atlas"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-hero="atlas"]').getAttribute('aria-pressed'),'true');check('Keyboard hero selection remains usable');
 await page.evaluate(()=>scrollTo(0,0));await cdp.send('Input.synthesizeScrollGesture',{x:196,y:700,yDistance:-300,gestureSourceType:'touch'});assert.ok(await page.evaluate(()=>scrollY)>30,'Touch scrolling must remain usable');check('Lobby touch scrolling preserved');
 const scale=await page.evaluate(()=>visualViewport.scale);await cdp.send('Input.synthesizePinchGesture',{x:196,y:450,scaleFactor:1.2,relativeSpeed:300,gestureSourceType:'touch'});await page.waitForTimeout(250);const zoomed=await page.evaluate(()=>visualViewport.scale);assert.ok(zoomed>scale+.05,'Pinch zoom must remain usable');check('Pinch zoom preserved',{before:scale,after:zoomed});
 await context.close();assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.requests.length,0,JSON.stringify(report.requests));check('No JS errors or failed requests');
}catch(error){report.failure={message:error.message,stack:error.stack};console.error(error);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(`Report: ${out}/report.json`);}
