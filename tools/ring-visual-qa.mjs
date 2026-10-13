import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.QA_OUT || 'artifacts/ring-night/visual');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.QA_URL||'http://localhost:5173/');await page.waitForFunction(()=>window.__SLAY__?.game?.loaded);await page.locator('#start').click();
await page.evaluate(()=>{const g=window.__SLAY__.game;cancelAnimationFrame(g.raf);g.raf=null;g.startLoop=()=>{};g.setMuted(true);g.aiEnabled=false;g.onEvent=()=>{};});
const records=[];
async function scene(hero,kind,direction){
  const result=await page.evaluate(({hero,kind,direction})=>{
    const g=window.__SLAY__.game;document.querySelectorAll('dialog[open]').forEach(d=>d.close());g.start(hero);g.ringCameraScale=1;
    const p=g.state.player,e=g.state.opponent;p.x=175;e.x=242;p.y=e.y=.54;p.facing=1;e.facing=-1;e.cooldown=100;
    const step=t=>{let remaining=t;while(remaining>0){const dt=Math.min(remaining,1/120);g.step(dt);g.render();remaining-=dt;}g.publish(true);};
    let accepted=true;
    if(kind==='walk'){g.setMove(1,0);step(.25);}
    if(kind==='jab'){accepted=g.action('strike');step(.15);}
    if(kind==='rope'){p.x=64;g.setMove(-1,0);accepted=g.action('run');step(.20);}
    if(kind==='corner'){p.x=65;p.y=.13;accepted=g.action('corner');step(.75);accepted=g.action('corner')&&accepted;step(.48);}
    if(kind==='finisher'){p.meter=100;accepted=g.action('finisher');step(p.actionDuration*.54);}
    if(kind==='pin'||kind==='submission'){e.hp=8;e.fatigue=80;e.action='down';e.actionTime=0;e.actionDuration=10;e.releasedPose=g.floorPose(e);e.releasedAngle=0;e.z=0;accepted=g.action(kind);step(kind==='pin'?1.0:.90);}
    if(kind==='grab'){
      const moves={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};if(direction.startsWith('rear'))e.facing=1;
      g.setMove(...moves[direction.split('_')[1]]);accepted=g.action('grab');step(p.actionDuration*(p.grapple?.clip?.impactAt??.65));
    }
    g.render();return {hero,kind,direction,accepted,action:p.action,opponentAction:e.action,phase:g.state.match.phase,clip:p.activeMove?.id,scale:g.ringCameraScale,positions:[p.x,p.y,e.x,e.y]};
  },{hero,kind,direction});
  const file=`${hero}-${kind}${direction?'-'+direction:''}.png`;await page.locator('#game-canvas').screenshot({path:path.join(out,file)});records.push({...result,file});
}
for(const hero of ['atlas','nova']){
  for(const kind of ['walk','jab','rope','corner','finisher','pin','submission'])await scene(hero,kind);
  for(const side of ['front','rear'])for(const dir of ['up','down','left','right'])await scene(hero,'grab',`${side}_${dir}`);
}
const report={passed:records.every(r=>r.accepted&&r.positions.every(Number.isFinite))&&errors.length===0,description:'Controlled state fixtures for visual inspection. These are not evidence of a fair match outcome; ring-gameplay-qa verifies legal-input matches separately.',records,errors};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,scenes:records.length,failed:records.filter(r=>!r.accepted),errors},null,2));await browser.close();if(!report.passed)process.exitCode=1;
