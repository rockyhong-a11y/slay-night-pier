import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseURL = process.env.QA_URL || 'http://localhost:5173';
const artifactDirectory = path.resolve('artifacts/browser-qa');
await fs.mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { baseURL, started: new Date().toISOString(), checks: [], errors: [], requests: [], screenshots: [], limitation: 'Chromium desktop with mobile touch emulation; physical iOS Safari long-press and browser chrome were not tested.' };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`); };
async function shot(page, name, fullPage = false) {
  const file = path.join(artifactDirectory, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
  return file;
}
async function contextFor(width, height, colorScheme = 'dark') {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 900, hasTouch: true, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ size: `${width}x${height}`, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ size: `${width}x${height}`, message: message.text() }); });
  page.on('requestfailed', request => report.requests.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.requests.push({ url: response.url(), status: response.status() }); });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__SLAY__?.game.loaded));
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function state(page) {
  return page.evaluate(() => {
    const s = window.__SLAY__.game.state;
    return { status: s.status, time: s.time, kills: s.kills, score: s.score, combo: s.combo, wave: s.wave, phase: s.phase,
      encountered: s.encountered, player: { id: s.player.id, hp: s.player.hp, meter: s.player.meter, action: s.player.action, x: s.player.x, y: s.player.y, specialty: s.player.specialty },
      enemies: s.enemies.map(e => ({ id: e.id, hp: e.hp, action: e.action, x: e.x, y: e.y })) };
  });
}
async function stopFrames(page) {
  await page.evaluate(() => { const g = window.__SLAY__.game; cancelAnimationFrame(g.raf); g.raf = null; g.lastFrame = null; g.setMove(0, 0); });
}
async function step(page, dt) {
  await page.evaluate(dt => { const g = window.__SLAY__.game; g.step(dt); g.publish(true); g.render(); }, dt);
}
async function stageCloseEnemy(page, id) {
  return page.evaluate(id => {
    const g = window.__SLAY__.game, p = g.state.player;
    p.action = 'idle'; p.actionTime = 0; p.vx = 0; p.z = 0; p.grapple = null; p.invulnerable = 1000; g.queuedAttack = false;
    for (const e of g.state.enemies) if (e.hp > 0) { e.cooldown = 1000; e.action = 'idle'; e.actionTime = 0; e.vx = 0; e.y = .1; e.x = p.x + 200; }
    const enemy = g.state.enemies.find(e => e.id === id && e.hp > 0) || g.state.enemies.find(e => e.hp > 0);
    if (enemy) { enemy.x = p.x + 50; enemy.y = p.y; }
    g.hitstop = 0; g.render();
    return enemy && { id: enemy.id, hp: enemy.hp };
  }, id);
}

try {
  for (const [width, height] of [[320,568],[393,852],[430,932],[844,390],[1280,900]]) {
    for (const theme of ['dark','light']) {
      const { context, page } = await contextFor(width, height, theme);
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, visualWidth: visualViewport.width }));
      await shot(page, `lobby-${width}x${height}-${theme}`, true);
      assert.ok(dimensions.scroll <= width + 1 && dimensions.width <= width + 1, `Lobby horizontal overflow at ${width}x${height}: ${JSON.stringify(dimensions)}`);
      const lobbyButtons = await page.locator('#lobby button').evaluateAll(elements => elements.map(e=>{const r=e.getBoundingClientRect();return {name:e.id||e.dataset.hero, left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
      for (const button of lobbyButtons) assert.ok(button.left>=0 && button.right<=width+1, `Lobby button ${button.name} overflows configured width ${width}: ${JSON.stringify(button)}`);
      if(width===320 && height===568) assert.ok(lobbyButtons.find(b=>b.name==='start').bottom<=height, 'Start button must be fully visible on smallest portrait screen');
      assert.equal(await page.locator('[data-hero]').count(), 2);
      assert.equal(await page.locator('.enemy-roster figure').count(), 8);
      await page.locator('#start').click();
      assert.equal((await state(page)).status, 'playing');
      const controls = await page.locator('#arena button,#joystick').evaluateAll(elements => elements.map(e => {
        const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') || e.textContent.trim(), left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      }));
      for (const control of controls) assert.ok(control.left >= 0 && control.right <= width + 1 && control.top >= 0 && control.bottom <= height + 1, `Offscreen ${control.name} at ${width}x${height}: ${JSON.stringify(control)}`);
      await stopFrames(page);
      await step(page, .016);
      await shot(page, `game-${width}x${height}-${theme}`);
      check(`responsive ${width}x${height} ${theme}`, { dimensions, lobbyButtons, controls, horizontalOverflow:false, lobbyRequiresVerticalScroll:lobbyButtons.some(b=>b.bottom>height) });
      await context.close();
    }
  }

  const { context, page } = await contextFor(393, 852);
  await page.locator('[data-hero="nova"]').tap();
  assert.equal(await page.locator('[data-hero="nova"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#start').tap();
  assert.equal((await state(page)).player.id, 'nova');
  check('hero selection starts Nova');

  const joystick = await page.locator('#joystick').boundingBox();
  const beforeMovement = (await state(page)).player.x;
  const cdp = await context.newCDPSession(page);
  const center = { x:joystick.x+joystick.width/2, y:joystick.y+joystick.height/2 };
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:center.x,y:center.y}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:center.x+joystick.width*.35,y:center.y}] });
  await page.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  const afterMovement = (await state(page)).player.x;
  assert.ok(afterMovement > beforeMovement+35, `Joystick movement ${beforeMovement} -> ${afterMovement}`);
  assert.deepEqual(await page.evaluate(() => window.__SLAY__.game.move), {x:0,y:0});
  check('touch joystick moves and releases', { from:beforeMovement, to:afterMovement });

  await stopFrames(page);
  await stageCloseEnemy(page);
  const attackBox = await page.locator('[data-action="attack"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:attackBox.x+attackBox.width/2,y:attackBox.y+attackBox.height/2}] });
  for (let i=0;i<7;i++) { await page.waitForTimeout(170); await step(page,.17); }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await step(page,.5);
  const attacked = await state(page);
  assert.ok(attacked.score>0 && attacked.combo>=2, 'Attack hold should damage and combo');
  assert.equal(await page.locator('[data-action="attack"]').evaluate(e=>e.classList.contains('pressed')), false);
  check('touch attack hold repeats and releases', { score:attacked.score, combo:attacked.combo });

  const grappleSamples = [];
  for (const hero of ['atlas','nova']) {
    await page.evaluate(hero => { window.__SLAY__.game.start(hero); }, hero);
    await stopFrames(page);
    const enemy = await stageCloseEnemy(page);
    await page.locator('[data-action="grab"]').tap();
    assert.equal((await state(page)).player.action, 'grapple');
    await step(page,.5);
    const sample = await page.evaluate(() => { const g=window.__SLAY__.game,p=g.state.player; return { hero:p.id, clip:p.grapple.clip.name, specialty:p.specialty, banner:g.state.banner, victimX:p.grapple.target.x-p.x, elapsed:p.actionTime, targetHp:p.grapple.target.hp }; });
    grappleSamples.push(sample);
    await shot(page, `grapple-${hero}-midpoint`);
    await step(page,1.5);
    const finished = await state(page);
    assert.equal(finished.player.action,'idle');
    assert.ok(finished.enemies.find(e=>e.id===enemy.id).hp<enemy.hp,'Grapple should deal damage');
    check(`${hero} grapple completes with damage`, { sample });
  }
  assert.notEqual(grappleSamples[0].specialty,grappleSamples[1].specialty);
  assert.ok(Math.abs(grappleSamples[0].victimX-grappleSamples[1].victimX)>20,'Grapple trajectories must differ visibly');
  check('Powerbomb and suplex use distinct Blender tracks', { samples:grappleSamples });

  await stageCloseEnemy(page);
  const healthBeforeSpecial = await state(page);
  await page.evaluate(() => { const g=window.__SLAY__.game; g.state.player.meter=45; g.publish(true); });
  const chargedAt45 = await page.locator('[data-action="special"]').evaluate(e=>e.classList.contains('charged'));
  await page.locator('[data-action="special"]').tap();
  assert.equal((await state(page)).player.action,'special');
  await step(page,1);
  assert.equal((await state(page)).player.meter,0);
  assert.ok((await state(page)).enemies.some((e,i)=>e.hp<healthBeforeSpecial.enemies[i].hp),'Special should deal area damage');
  check('45 meter special activation and damage', { readinessMatches:chargedAt45 });

  await page.evaluate(() => { const g=window.__SLAY__.game; g.state.team.find(h=>h.id==='atlas').hp=83; g.state.team.find(h=>h.id==='nova').hp=61; g.state.tagCooldown=0; g.publish(true); });
  await page.locator('[data-action="tag"]').tap();
  assert.equal((await state(page)).player.id,'atlas');
  assert.equal((await state(page)).player.hp,83);
  await step(page,3);
  await page.locator('[data-action="tag"]').tap();
  assert.equal((await state(page)).player.id,'nova');
  assert.equal((await state(page)).player.hp,61);
  check('tag preserves both individual health pools');

  await page.locator('#pause').tap();
  const pausedAt = (await state(page)).time;
  await step(page,2);
  assert.equal((await state(page)).time,pausedAt);
  assert.equal((await state(page)).status,'paused');
  await shot(page,'pause-mobile');
  await page.locator('#resume').tap();
  await step(page,.2);
  assert.equal((await state(page)).status,'playing');
  assert.ok((await state(page)).time>pausedAt);
  check('pause freezes simulation and resume continues');

  await page.evaluate(() => { window.__qaSuppression = []; for(const type of ['contextmenu','selectstart','dragstart']) document.addEventListener(type, event => { queueMicrotask(()=>window.__qaSuppression.push({type,target:event.target.id||event.target.dataset.action||event.target.tagName,prevented:event.defaultPrevented})); }); });
  for (const selector of ['[data-action="attack"]','#joystick','#pause']) {
    const bounds = await page.locator(selector).boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]});
    await page.waitForTimeout(850);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    if(selector==='#pause') await page.locator('#resume').tap();
  }
  const suppression = await page.evaluate(() => {
    const selectors=['[data-action="attack"]','#joystick','#pause','.wordmark'];
    return selectors.map(selector=>{const e=document.querySelector(selector),style=getComputedStyle(e);return{selector,userSelect:style.userSelect,webkitUserSelect:style.webkitUserSelect,callout:style.webkitTouchCallout,
      prevented:['contextmenu','selectstart','dragstart'].map(type=>({type,prevented:!e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))}))};});
  });
  for(const element of suppression) { assert.equal(element.userSelect,'none'); for(const event of element.prevented) assert.equal(event.prevented,true); }
  assert.equal(await page.evaluate(()=>String(window.getSelection())), '');
  await page.locator('#help').tap();
  const checkbox=page.locator('#reduce-effects');
  const checked=await checkbox.isChecked();
  await checkbox.tap();
  assert.equal(await checkbox.isChecked(),!checked);
  const nativeAllowed=await checkbox.evaluate(e=>['contextmenu','selectstart','dragstart'].map(type=>({type,allowed:e.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))})));
  assert.ok(nativeAllowed.every(event=>event.allowed));
  await page.locator('#help-dialog [data-close]').last().tap();
  check('mobile long press suppresses non-editable selection and native checkbox stays usable', { actualEvents:await page.evaluate(()=>window.__qaSuppression), syntheticSuppression:suppression, nativeAllowed });

  await page.evaluate(()=>window.__SLAY__.game.start('atlas'));
  await stopFrames(page);
  const defeated=[];
  for(let wave=1;wave<=3;wave++) {
    for(let safety=0;safety<35;safety++) {
      const snapshot=await state(page);
      const enemy=snapshot.enemies.find(e=>e.hp>0);
      if(!enemy) break;
      await stageCloseEnemy(page,enemy.id);
      await page.locator('[data-action="grab"]').tap();
      assert.equal((await state(page)).player.action,'grapple');
      await step(page,2);
      const after=await state(page);
      if(after.enemies.find(e=>e.id===enemy.id).hp===0 && !defeated.includes(enemy.id)) defeated.push(enemy.id);
    }
    assert.ok(!(await state(page)).enemies.some(e=>e.hp>0),`Wave ${wave} must clear by grapples`);
    if(wave<3) {
      await page.keyboard.down('d');
      for(let i=0;i<5;i++) await step(page,1);
      await page.keyboard.up('d');
      assert.equal((await state(page)).wave,wave+1);
    }
  }
  const victory=await state(page);
  assert.equal(victory.status,'victory'); assert.equal(victory.kills,8); assert.equal(victory.encountered,8); assert.equal(new Set(defeated).size,8);
  await page.waitForTimeout(750);
  assert.equal(await page.locator('#result-label').textContent(),'STAGE CLEAR');
  await shot(page,'victory-mobile');
  check('all eight distinct enemies defeated through input-triggered grapples and natural wave advancement', { defeated, score:victory.score, status:victory.status });

  await page.locator('#play-again').tap();
  await stopFrames(page);
  async function stageEnemyStrike() {
    await page.evaluate(()=>{
      const g=window.__SLAY__.game,p=g.state.player; p.hp=1;p.invulnerable=0;p.action='idle';p.vx=0;g.hitstop=0;
      const e=g.state.enemies.find(e=>e.hp>0);e.x=p.x+20;e.y=p.y;e.action='attack';e.actionTime=.479;e.actionDuration=.82;e.attackHit=false;
      for(const other of g.state.enemies)if(other!==e)other.cooldown=1000;
    });
    await step(page,.03);
  }
  const heroBefore=(await state(page)).player.id;
  await stageEnemyStrike();
  assert.notEqual((await state(page)).player.id,heroBefore);
  assert.equal((await state(page)).status,'playing');
  await stageEnemyStrike();
  assert.equal((await state(page)).status,'gameover');
  await page.waitForTimeout(750);
  assert.equal(await page.locator('#result-label').textContent(),'GAME OVER');
  await shot(page,'gameover-mobile');
  check('enemy strikes auto-tag on first KO and show gameover on second KO');
  await page.locator('#result-home').tap();
  assert.equal(await page.locator('#lobby').isVisible(),true);
  await page.locator('[data-hero="atlas"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-hero="atlas"]').getAttribute('aria-pressed'),'true');
  check('result returns to lobby and keyboard hero selection works');
  await context.close();
  assert.equal(report.errors.length,0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.requests.length,0, `Failed requests: ${JSON.stringify(report.requests)}`);
  check('no JavaScript errors or failed asset requests');
} catch(error) {
  report.failure={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  report.finished=new Date().toISOString();
  await fs.writeFile(path.join(artifactDirectory,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
  console.log(`Report: ${path.join(artifactDirectory,'report.json')}`);
}
