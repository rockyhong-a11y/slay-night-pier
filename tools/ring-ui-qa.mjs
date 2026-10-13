import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseURL = process.env.QA_URL || 'http://localhost:5173/';
const out = path.resolve(process.env.QA_OUTPUT || 'artifacts/ring-ui-qa');
await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch();
const report = {baseURL,started:new Date().toISOString(),checks:[],errors:[],requests:[],screenshots:[],limitation:'Chromium mobile touch emulation. Physical iOS Safari browser chrome and callouts are not tested.'};
const pass = (name, detail={}) => {report.checks.push({name,passed:true,...detail}); console.log('PASS ' + name);};
async function shot(page,name,fullPage=false) {
  const file = path.join(out,name+'.png'); await page.screenshot({path:file,fullPage}); report.screenshots.push(file);
}
async function open(width,height,colorScheme='dark') {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<900,hasTouch:true,colorScheme});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('requestfailed',r=>report.requests.push({url:r.url(),failure:r.failure()}));
  page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
  await page.goto(baseURL,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__SLAY__?.game.loaded,{timeout:45000});
  await page.evaluate(()=>document.fonts.ready);return{context,page};
}
async function freeze(page) {
  await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.setMove(0,0);});
}
async function step(page,time) {
  await page.evaluate(time=>{const g=window.__SLAY__.game;for(let t=0;t<time;t+=1/60)g.step(Math.min(1/60,time-t));g.render();g.publish(true);},time);
}
async function state(page) {
  return page.evaluate(()=>{const s=window.__SLAY__.game.state;return{status:s.status,time:s.time,player:{id:s.player.id,hp:s.player.hp,x:s.player.x,y:s.player.y,action:s.player.action,meter:s.player.meter},opponent:{id:s.opponent.id,hp:s.opponent.hp},match:{phase:s.match.phase}};});
}
async function touchHold(page,cdp,selector,milliseconds=850) {
  const rect=await page.locator(selector).boundingBox();assert.ok(rect,selector+' visible');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
  await page.waitForTimeout(milliseconds);await step(page,milliseconds/1000);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
try {
  for(const [width,height] of [[320,568],[360,640],[393,852],[430,932],[844,390],[1280,900]]) for(const theme of ['dark','light']) {
    const {context,page}=await open(width,height,theme);
    const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth}));
    assert.ok(dimensions.scrollWidth<=width+1,'Lobby horizontal overflow '+JSON.stringify(dimensions));
    assert.equal(await page.locator('[data-hero]').count(),2);
    assert.equal(await page.locator('.future-fighter:disabled').count(),8);
    if(width===320&&height===568)assert.ok((await page.locator('#start').boundingBox()).y+(await page.locator('#start').boundingBox()).height<=height,'Start visible at320x568');
    await shot(page,'lobby-'+width+'x'+height+'-'+theme,true);
    await page.locator('#start').click();await freeze(page);await step(page,.016);
    assert.equal((await state(page)).status,'playing');
    assert.notEqual((await state(page)).player.id,(await state(page)).opponent.id);
    assert.deepEqual(await page.locator('.actions [data-action]').evaluateAll(es=>es.map(e=>e.dataset.action).sort()),['counter','grab','strike']);
    assert.deepEqual(await page.locator('.ring-actions [data-action]').evaluateAll(es=>es.map(e=>e.dataset.action).sort()),['corner','finisher','pin','run','submission']);
    assert.equal(await page.locator('.fighter-hud').count(),2);
    const buttons=await page.locator('#arena button:visible,#joystick').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{name:e.id||e.dataset.action,left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    const contentHeight=await page.evaluate(()=>document.documentElement.scrollHeight);if(height>=640||width>=800)for(const b of buttons)assert.ok(b.bottom<=height+1,'Controls below fold '+JSON.stringify(b));for(const b of buttons)assert.ok(b.left>=0&&b.right<=width+1&&b.top>=0&&b.bottom<=contentHeight+1,'Unreachable '+JSON.stringify(b)+' at'+width+'x'+height);if(width<600&&height>550){await page.locator('[data-action=finisher]').scrollIntoViewIfNeeded();assert.ok((await page.locator('[data-action=finisher]').boundingBox()).y<height,'Specials must scroll into view');await page.evaluate(()=>scrollTo(0,0));}
    const ring=await page.locator('.viewport').boundingBox();assert.ok(ring.height>=(width<600&&height>550?200:120),'Ring too small');
    await shot(page,'ring-'+width+'x'+height+'-'+theme);
    pass('Responsive dual HUD and controls '+width+'x'+height+' '+theme,{dimensions,ring,buttons});
    await context.close();
  }
  const {context,page}=await open(393,852),cdp=await context.newCDPSession(page);
  await page.locator('[data-hero="nova"]').tap();await page.locator('#start').tap();await freeze(page);
  assert.equal((await state(page)).player.id,'nova');assert.equal((await state(page)).opponent.id,'atlas');pass('Nova selection creates Atlas opponent');
  const before=await state(page),joy=await page.locator('#joystick').boundingBox(),center={x:joy.x+joy.width/2,y:joy.y+joy.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+joy.width*.3,y:center.y}]});
  await step(page,.4);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await state(page)).player.x>before.player.x+10);assert.deepEqual(await page.evaluate(()=>window.__SLAY__.game.move),{x:0,y:0});
  pass('Actual touch joystick movement and release');
  await page.locator('#pause').tap();const paused=await state(page);await step(page,2);
  assert.equal((await state(page)).time,paused.time);assert.equal((await state(page)).status,'paused');await shot(page,'pause-mobile');
  await page.locator('#resume').tap();await step(page,.2);assert.equal((await state(page)).status,'playing');pass('Pause freezes simulation and resumes');
  await page.evaluate(()=>{window.__qaEvents=[];for(const type of ['contextmenu','selectstart','dragstart'])document.addEventListener(type,e=>queueMicrotask(()=>window.__qaEvents.push({type,prevented:e.defaultPrevented})));});
  for(const selector of ['[data-action="strike"]','[data-action="grab"]','[data-action="counter"]','[data-action="run"]','#joystick','#pause']) {
    await page.evaluate(()=>window.__SLAY__.start());await freeze(page);
    await touchHold(page,cdp,selector);
    if(selector==='#pause')await page.locator('#resume').tap();
    pass('Actual850ms touch long press '+selector);
  }
  for(const selector of ['[data-action="corner"]','[data-action="pin"]','[data-action="submission"]','[data-action="finisher"]']) {
    await page.evaluate(selector=>{const g=window.__SLAY__.game;g.aiEnabled=false;window.__SLAY__.start();cancelAnimationFrame(g.raf);g.raf=null;const p=g.state.player,t=g.state.opponent;p.x=100;p.y=.5;t.x=140;t.y=.5;p.meter=100;if(selector.includes('corner')){p.x=65;p.y=.13;}if(selector.includes('pin')||selector.includes('submission')){t.action='down';t.actionTime=0;t.actionDuration=100;t.downDuration=100;}g.refreshContext();g.publish(true);},selector);
    assert.equal(await page.locator(selector).isDisabled(),false,selector+' must be actionable in legal UI fixture');await touchHold(page,cdp,selector);pass('Actual850ms touch long press '+selector+' in legal state fixture');
  }
  for(const end of ['touchEnd','touchCancel','blur']) {
    await page.evaluate(()=>{const g=window.__SLAY__.game;window.__SLAY__.start();cancelAnimationFrame(g.raf);g.raf=null;g.aiEnabled=false;const p=g.state.player,t=g.state.opponent;p.x=100;p.y=.5;t.x=140;t.y=.5;t.action='down';t.actionTime=0;t.actionDuration=100;t.downDuration=100;g.refreshContext();g.publish(true);});
    const r=await page.locator('[data-action="submission"]').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});await step(page,.25);
    assert.equal((await state(page)).match.phase,'submission');assert.equal(await page.locator('[data-action="submission"]').isDisabled(),false);
    if(end==='blur'){await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
    else await cdp.send('Input.dispatchTouchEvent',{type:end,touchPoints:[]});
    assert.equal((await state(page)).match.phase,'wrestling');assert.equal(await page.evaluate(()=>window.__SLAY__.game.state.player.submissionHeld),false);assert.equal(await page.locator('[data-action="submission"]').evaluate(e=>e.classList.contains('pressed')),false);if(end==='blur')await page.locator('#resume').tap();pass('Real submission hold releases on '+end);
  }
  await page.evaluate(()=>window.__SLAY__.start());await freeze(page);
  const suppression=await page.evaluate(()=>['[data-action="strike"]','[data-action="grab"]','[data-action="counter"]','[data-action="run"]','[data-action="corner"]','[data-action="pin"]','[data-action="submission"]','[data-action="finisher"]','#joystick','#pause','.wordmark','#start'].map(selector=>{
    const e=document.querySelector(selector),s=getComputedStyle(e);
    return{selector,userSelect:s.userSelect,callout:s.webkitTouchCallout,touchAction:s.touchAction,events:['contextmenu','selectstart','dragstart'].map(type=>({type,prevented:!e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))}))};
  }));
  for(const control of suppression){assert.equal(control.userSelect,'none');assert.ok(control.events.every(e=>e.prevented));}
  assert.equal(await page.evaluate(()=>String(getSelection())),'');pass('Callout/selection/drag suppression on all ring and ordinary controls',{suppression,actualEvents:await page.evaluate(()=>window.__qaEvents)});
  await page.locator('#help').tap();const checkbox=page.locator('#reduce-effects'),checked=await checkbox.isChecked();await checkbox.tap();assert.equal(await checkbox.isChecked(),!checked);
  const allowed=await checkbox.evaluate(e=>['contextmenu','selectstart','dragstart'].map(type=>e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))));
  assert.ok(allowed.every(Boolean));await shot(page,'help-native-checkbox');await page.locator('#help-dialog [data-close]').last().tap();await page.waitForFunction(()=>window.__SLAY__.game.state.status==='playing');await page.locator('#game-canvas').focus();pass('Native checkbox and help resume remain usable');
  await page.evaluate(()=>{const g=window.__SLAY__.game;window.__qaInputs=[];const action=g.action.bind(g);g.action=(name,...args)=>{window.__qaInputs.push(name);return action(name,...args);};});
  for(const key of ['Space','KeyU','KeyI','KeyO','KeyP','KeyE']){await page.keyboard.down(key);await page.keyboard.up(key);}
  assert.deepEqual(await page.evaluate(()=>window.__qaInputs),['run','corner','pin','submissionDown','submissionUp','finisher','escape']);pass('Special keyboard contract dispatches exact actions and hold release');
  // Legal hold fixtures use the real engine capture setup. Only display progress
  // is staged; complete match rule tests live in the engine suite.
  await page.evaluate(()=>{window.__SLAY__.start();const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.aiEnabled=false;const s=g.state;s.player.x=140;s.player.y=.5;s.player.action='down';s.player.actionDuration=100;s.opponent.x=100;s.opponent.y=.5;g.startHold(s.opponent,'pin');s.match.count=2;s.match.escapeProgress=.65;g.render();g.publish(true);});
  assert.ok(await page.locator('#capture-overlay').isVisible());assert.equal(await page.locator('#pin-count').textContent(),'2');assert.ok(await page.locator('#escape-button').isVisible());assert.equal(await page.locator('#escape-fill').evaluate(e=>e.style.width),'65%');await shot(page,'pin-escape-context');pass('Pin count and defender escape context rendered');
  await page.evaluate(()=>{window.__SLAY__.start();const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.aiEnabled=false;const s=g.state;s.player.x=100;s.player.y=.5;s.opponent.x=140;s.opponent.y=.5;s.opponent.action='down';s.opponent.actionDuration=100;g.action('submission');s.match.progress=.4;g.render();g.publish(true);});
  assert.equal(await page.locator('#pin-count').textContent(),'40%');assert.equal(await page.locator('[data-action="submission"]').isDisabled(),false);assert.equal(await page.locator('#escape-button').isVisible(),false);pass('Submission attacker can retain or release the hold');
  await page.evaluate(()=>{const g=window.__SLAY__.game;g.finishMatch(g.state.player,'pin');g.render();g.publish(true);});
  await page.waitForTimeout(750);assert.ok(await page.locator('#result-dialog').isVisible());await page.keyboard.press('Escape');assert.ok(await page.locator('#result-dialog').isVisible(),'Result retains rematch choice on Escape');assert.match(await page.locator('#result-desc').textContent(),/핀 폴/);await shot(page,'result-mobile');pass('Match result dialog renders winner and pin finish');
  await page.locator('#result-home').tap();await page.locator('[data-hero="atlas"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-hero="atlas"]').getAttribute('aria-pressed'),'true');pass('Keyboard accessible hero selection');
  await page.evaluate(()=>scrollTo(0,0));await cdp.send('Input.synthesizeScrollGesture',{x:196,y:650,yDistance:-300,gestureSourceType:'touch'});assert.ok(await page.evaluate(()=>scrollY)>10);pass('Lobby touch scrolling preserved');
  const scale=await page.evaluate(()=>visualViewport.scale);await cdp.send('Input.synthesizePinchGesture',{x:196,y:450,scaleFactor:1.2,relativeSpeed:300,gestureSourceType:'touch'});await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>visualViewport.scale)>scale+.05);pass('Pinch zoom preserved');
  await context.close();assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.requests.length,0,JSON.stringify(report.requests));pass('No JavaScript or asset request errors');
} catch(error) {report.failure={message:error.message,stack:error.stack};console.error(error);process.exitCode=1;}
finally {report.status=report.failure?'FAIL':'PASS';report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log('Report: '+out+'/report.json');}
