import { sampleMotion } from './game.js';

// The mat and all fighters share one orthographic coordinate system. No depth
// scaling is applied to artwork: walking to the far rope never changes anatomy.
export const ringFloorY = (height, lane) => height * (.36 + lane * .46);
const TAU = Math.PI * 2;

function polygon(c, points, fill, stroke) {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  if (fill) { c.fillStyle=fill; c.fill(); }
  if (stroke) { c.strokeStyle=stroke; c.stroke(); }
}

function arena(game) {
  const c=game.ctx, W=game.width, H=game.height, s=W/420;
  const bg=c.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#080e1c');bg.addColorStop(.65,'#1a2539');bg.addColorStop(1,'#080d16');
  c.fillStyle=bg;c.fillRect(0,0,W,H);
  const beat=game.reducedMotion?0:Math.sin(game.state.time*.45)*12*s;
  for (const [x,color,dir] of [[W*.14,'#63bffc',1],[W*.86,'#eaaa70',-1]]) {
    const beam=c.createLinearGradient(x,12*s,x+dir*100*s,H*.52);
    beam.addColorStop(0,color+'23');beam.addColorStop(1,color+'00');
    polygon(c,[[x-8*s,0],[x+8*s,0],[x+dir*200*s+beat,H*.65],[x+dir*25*s,H*.65]],beam);
  }
  c.strokeStyle='#879bb629';c.lineWidth=1;
  for(let i=0;i<8;i++){c.beginPath();c.moveTo(i*W/7,0);c.lineTo(i*W/7,H*.27);c.stroke();}
  // A permanent event screen sits above the crowd and outside the playable mat.
  const top=H*.06;
  c.fillStyle='#0b1220';c.fillRect(W*.25,top,W*.5,H*.14);
  c.strokeStyle='#6fa2c742';c.strokeRect(W*.25,top,W*.5,H*.14);
  c.textAlign='center';c.fillStyle='#f3eddd';c.font=`900 ${24*s}px Outfit, sans-serif`;
  c.fillText('RING NIGHT',W/2,top+H*.066);
  c.fillStyle='#c79262';c.font=`600 ${8*s}px Outfit, sans-serif`;c.letterSpacing=`${3*s}px`;
  c.fillText('SLAY  •  SINGLES MATCH',W/2,top+H*.10);c.letterSpacing='0px';
  for(let row=0;row<3;row++)for(let i=0;i<25;i++){
    const x=(i+.5+(row%2)*.4)*W/25,y=H*(.245+row*.027),n=(i*17+row*11)%13;
    c.fillStyle=['#394256','#4b4650','#334452','#56505a'][n%4];
    c.beginPath();c.arc(x,y,3.1*s,0,TAU);c.fill();
    c.fillStyle=['#293347','#384658','#343744'][n%3];c.fillRect(x-4*s,y+3*s,8*s,8*s);
    if(n<3){c.strokeStyle='#596171';c.lineWidth=2*s;c.beginPath();c.moveTo(x-3*s,y+6*s);c.lineTo(x-7*s,y-5*s);c.stroke();}
  }
  c.fillStyle='#101726';c.fillRect(0,H*.325,W,10*s);
  c.fillStyle='#b58c5e';c.fillRect(0,H*.325,W,1*s);
}

function mat(game) {
  const c=game.ctx,W=game.width,s=W/420;
  const left=game.worldX(39),right=game.worldX(381),back=game.floorY(.035),front=game.floorY(1.02);
  // Raised canvas, apron, padded edge and understated mat printing.
  polygon(c,[[left-8*s,back],[right+8*s,back],[right+14*s,front+12*s],[left-14*s,front+12*s]],'#273348','#72839a');
  const fill=c.createLinearGradient(0,back,0,front);fill.addColorStop(0,'#b9cbd8');fill.addColorStop(1,'#e0e8e9');
  c.fillStyle=fill;c.fillRect(left,back,right-left,front-back);
  c.save();c.strokeStyle='#56708422';c.lineWidth=1;
  for(let i=0;i<6;i++){const y=back+(front-back)*i/5;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();}
  c.textAlign='center';c.fillStyle='#31465a16';c.font=`900 ${63*s}px Outfit,sans-serif`;c.fillText('SLAY',W/2,back+(front-back)*.59);
  c.font=`600 ${9*s}px Outfit,sans-serif`;c.fillStyle='#31465a4b';c.letterSpacing=`${3*s}px`;c.fillText('RING  /  NIGHT',W/2,back+(front-back)*.67);c.letterSpacing='0px';
  c.strokeStyle='#63839333';c.lineWidth=2*s;c.beginPath();c.ellipse(W/2,back+(front-back)*.50,90*s,(front-back)*.3,0,0,TAU);c.stroke();
  c.restore();
  for(const [x,y,color,sx,sy] of [[left,back,'#c68d7840',1,1],[right,back,'#719ecc40',-1,1],[left,front,'#c68d7840',1,-1],[right,front,'#719ecc40',-1,-1]]){
    polygon(c,[[x,y],[x+sx*46*s,y],[x,y+sy*32*s]],color);
  }
  const apron=c.createLinearGradient(0,front,0,front+40*s);apron.addColorStop(0,'#233447');apron.addColorStop(1,'#0c1420');
  polygon(c,[[left-14*s,front+8*s],[right+14*s,front+8*s],[right+14*s,front+40*s],[left-14*s,front+40*s]],apron);
  c.fillStyle='#d09a64';c.fillRect(left-14*s,front+8*s,right-left+28*s,2*s);
  c.textAlign='center';c.fillStyle='#d3dbe2';c.font=`800 ${13*s}px Outfit,sans-serif`;c.letterSpacing=`${4*s}px`;
  c.fillText('S L A Y',W/2,front+29*s);c.letterSpacing='0px';
  c.fillStyle='#5a718c';c.font=`600 ${6*s}px monospace`;c.fillText('NIGHT PIER ARENA',W/2,front+37*s);
}

function ringHardware(game, foreground=false) {
  const c=game.ctx,W=game.width,s=W/420,left=game.worldX(42),right=game.worldX(378),back=game.floorY(.035),front=game.floorY(1.02);
  const pulse=game.state.ropePulse;
  const pulseAge=game.state.time-(pulse?.at??-100);
  const vibration=game.reducedMotion?0:Math.sin(pulseAge*34)*Math.exp(-Math.max(0,pulseAge)*6)*9*s;
  const rope=(x1,y1,x2,y2,level,side)=>{
    const z=(24+level*24)*s;
    const deflection=pulse?.side===side && pulseAge<1 ? vibration:0;
    c.lineCap='round';c.lineWidth=(level===1?3.1:2.6)*s;
    c.strokeStyle='#07142670';c.beginPath();c.moveTo(x1,y1-z+2*s);c.quadraticCurveTo((x1+x2)/2+deflection,(y1+y2)/2-z+4*s,x2,y2-z+2*s);c.stroke();
    c.strokeStyle=level===1?'#be684f':'#e2e8e9';c.beginPath();c.moveTo(x1,y1-z);c.quadraticCurveTo((x1+x2)/2+deflection,(y1+y2)/2-z+2*s+deflection*.2,x2,y2-z);c.stroke();
  };
  if(!foreground){for(let i=0;i<3;i++)rope(left,back,right,back,i,'top');}
  else {
    // Front ropes become subtle when a pin or submission is taking place nearby.
    c.save();c.globalAlpha=['pin','submission'].includes(game.state.match?.phase) ? .78 : 1;
    for(let i=0;i<3;i++){rope(left,back,left,front,i,'left');rope(right,back,right,front,i,'right');rope(left,front,right,front,i,'bottom');}
    c.restore();
  }
  for(const [x,y,color] of [[left,foreground?front:back,'#c3785b'],[right,foreground?front:back,'#6596c0']]){
    const metallic=c.createLinearGradient(x-5*s,0,x+5*s,0);metallic.addColorStop(0,'#243146');metallic.addColorStop(.45,'#738392');metallic.addColorStop(1,'#223244');
    c.fillStyle='#070d15';c.fillRect(x-7*s,y-85*s,14*s,91*s);
    c.fillStyle=metallic;c.fillRect(x-4*s,y-82*s,8*s,88*s);
    c.fillStyle=color;c.fillRect(x-6*s,y-87*s,12*s,9*s);
    for(let i=0;i<3;i++){c.fillStyle=color;c.beginPath();c.roundRect(x-9*s,y-(29+i*24)*s,18*s,10*s,3*s);c.fill();c.strokeStyle='#ffffff28';c.lineWidth=1;c.stroke();}
  }
}

function drawActors(game) {
  const actors=[game.state.player,game.state.opponent || game.state.enemies?.[0]].filter(Boolean);
  const paired=actors.find(a=>a.grapple);
  actors.sort((a,b)=>a.y-b.y);
  const hold=game.escapePresentation || (['pin','submission','finished'].includes(game.state.match?.phase) ? game.state.match : null);
  if(hold?.attacker && hold?.defender){
    // The wrestler applying the cover/armbar must remain in front of the body
    // being held. Equal mat depths otherwise hide the attacker's face and arms.
    actors.sort((a,b)=>a===hold.defender?-1:b===hold.defender?1:0);
  }
  for(const actor of actors){
    if(actor===paired?.grapple?.target)continue;
    const ring=game.getRingRender?.(actor);
    if(ring?.hidden)continue;
    if(ring)game.drawFighter(actor,ring.transform??null,ring.anchor??actor,ring.pose);
    else if(actor.grapple)game.drawGrapple(actor);
    else if(actor.action==='strike')game.drawFighter(actor,sampleMotion(actor.activeClip,actor.actionTime)?.hero??null,actor);
    else game.drawFighter(actor);
    if(actor===game.state.opponent&&!actor.attackHit&&['strike','grappleWindup','finisherWindup'].includes(actor.action)){
      const c=game.ctx,s=game.width/420,finisher=actor.action==='finisherWindup';
      const label=finisher?'FINISH':actor.action==='grappleWindup'?'잡기':'!';
      const contact=actor.actionDuration*(actor.action==='strike'?(actor.activeClip?.contactAt??.4):1);
      const progress=Math.min(1,actor.actionTime/Math.max(.01,contact));
      const x=game.worldX(actor.x),y=game.floorY(actor.y)-game.bodyHeight(actor)*1.09;
      c.save();c.textAlign='center';c.font=`800 ${10*s}px Outfit,sans-serif`;
      const width=c.measureText(label).width+16*s;c.fillStyle='#101725';c.fillRect(x-width/2,y-13*s,width,21*s);
      c.fillStyle=finisher?'#f18cba':progress>.5?'#fff0aa':'#dba75d';c.fillText(label,x,y);
      c.fillRect(x-width/2,y+7*s,width*progress,2*s);c.restore();
    }
  }
}

function overlay(game) {
  const c=game.ctx,W=game.width,H=game.height,s=W/420,state=game.state,match=state.match||{};
  c.save();c.font=`600 ${8*s}px Outfit,sans-serif`;
  c.textAlign='right';c.fillStyle='#d2a87d';c.fillText('ONE FALL',W-15*s,19*s);
  if(state.banner && state.bannerTime>0){
    const text=state.banner, y=H*.245;c.font=`800 ${Math.min(18,240/Math.max(1,text.length))*s}px Outfit,sans-serif`;
    const width=Math.min(W-32*s,c.measureText(text).width+32*s);
    c.fillStyle='#091322e8';c.fillRect((W-width)/2,y-22*s,width,31*s);c.fillStyle='#ecc38a';c.textAlign='center';c.fillText(text,W/2,y);
  }
  c.restore();
}

export function drawRingScene(game) {
  const c=game.ctx;if(!c)return;
  c.setTransform(game.dpr||1,0,0,game.dpr||1,0,0);c.clearRect(0,0,game.width,game.height);c.save();
  if(game.shake>0&&!game.reducedMotion)c.translate(Math.sin(game.state.time*142)*game.shake,Math.cos(game.state.time*117)*game.shake*.45);
  arena(game);
  // A single camera pulls back for airborne throws on short portrait screens.
  // Scale the entire ring with the athletes; their head/body/limb ratios stay fixed.
  let top=game.height,left=game.width,right=0;
  for(const actor of [game.state.player,game.state.opponent].filter(Boolean)){
    const info=game.getRingRender?.(actor);
    const anchor=info?.anchor||actor;
    const poses=actor.grapple ? Object.values(game.grappleSample(actor)).filter(p=>p && Number.isFinite(p.z)) : [info?.transform || (actor.action==='strike'?sampleMotion(actor.activeClip,actor.actionTime)?.hero:null)];
    for(const pose of poses){
      const height=game.bodyHeight(actor),x=game.worldX(anchor.x)+(pose?.x??0)*game.bodyHeight(anchor)*anchor.facing;
      top=Math.min(top,game.floorY(anchor.y)-height*1.12-(pose?.z??actor.z??0)*game.bodyHeight(anchor));
      left=Math.min(left,x-height*.72);right=Math.max(right,x+height*.72);
    }
  }
  const pivot=game.height*.69;
  const half=game.width/2;
  const target=Math.max(.52,Math.min(1,(pivot-14)/(pivot-Math.min(top,14)),
    (half-12)/(half-Math.min(left,12)),(half-12)/(Math.max(right,game.width-12)-half)));
  const dt=Math.min(.05,Math.max(0,game.state.time-(game.ringCameraTime??game.state.time)));
  game.ringCameraTime=game.state.time;
  game.ringCameraScale=game.ringCameraScale==null?target:game.ringCameraScale+(target-game.ringCameraScale)*(1-Math.exp(-dt*18));
  // During a paused frame/screenshot, settle the camera only if it would crop art.
  const zoom=Math.min(game.ringCameraScale,target);
  c.save();c.translate(game.width/2,pivot);c.scale(zoom,zoom);c.translate(-game.width/2,-pivot);
  mat(game);ringHardware(game);drawActors(game);game.drawEffects();ringHardware(game,true);c.restore();c.restore();overlay(game);
}
