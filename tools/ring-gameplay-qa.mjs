import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.env.QA_OUT || 'artifacts/ring-night/gameplay');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.QA_URL || 'http://localhost:5173/');
await page.waitForFunction(()=>window.__SLAY__?.game?.loaded);
await page.locator('#start').click();
const results=await page.evaluate(()=>{
  const game=window.__SLAY__.game;cancelAnimationFrame(game.raf);game.raf=null;game.startLoop=()=>{};game.setMuted(true);
  const cases=[];
  for(const hero of ['atlas','nova']){
    game.start(hero);const events=[];game.onEvent=event=>events.push({type:event.type,time:game.state.time,move:event.move});
    let nextInput=0;
    for(let frame=0;frame<120*180 && game.state.status==='playing';frame++){
      const s=game.state,p=s.player,e=s.opponent,m=s.match;
      if(s.time>=nextInput){
        nextInput=s.time+.14;
        if(game.captured()){game.setMove(0,0);game.action('escape');}
        else if(m.attacker===p && m.phase==='submission')game.action('submission');
        else if(m.phase==='wrestling'){
          const dx=e.x-p.x,dy=e.y-p.y;
          if(game.nearRopes(e) && !p.grapple){
            game.setMove(Math.abs(210-p.x)>8?Math.sign(210-p.x):0,Math.abs(.54-p.y)>.04?Math.sign(.54-p.y):0);
          }else{
          game.setMove(Math.abs(dx)>65?Math.sign(dx):0,Math.abs(dy)>.04?Math.sign(dy):0);
          if(Math.abs(dx)<89 && Math.abs(dy)<.17){
            game.setMove(0,0);
            if(e.action==='down')game.action('pin');
            else if(p.meter>=100)game.action('finisher');
            else if(s.grabContext.ready)game.action('grab');
            else if(['idle','walk','charge'].includes(p.action)){game.beginStrike();game.endStrike();}
          }
          }
          if(p.action==='down')game.action('escape');
        }
      }
      game.step(1/120);
      if(![p.x,p.y,p.hp,p.meter,e.x,e.y,e.hp,e.meter].every(Number.isFinite))throw Error('Non-finite state');
    }
    const s=game.state; game.render();
    cases.push({hero,status:s.status,time:s.time,winner:s.match.winner?.id??s.match.winner,method:s.match.finishMethod,hp:[s.player.hp,s.opponent.hp],meters:[s.player.meter,s.opponent.meter],events:events.slice()});
  }
  return cases;
});
await page.screenshot({path:path.join(out,'full-match-result.png')});
const report={passed:results.every(x=>['victory','defeat'].includes(x.status))&&errors.length===0,description:'Two matches using action/setMove/step only. No health, position, meter, AI or outcome injection. A simple legal-input bot attempts close grapples and pins; each match must terminate by the rules.',results,errors};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,results:results.map(({events,...r})=>({...r,eventCount:events.length,eventTypes:[...new Set(events.map(e=>e.type))]})),errors},null,2));await browser.close();if(!report.passed)process.exitCode=1;
