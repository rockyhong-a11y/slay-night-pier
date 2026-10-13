// The source geometry and unchanged body reference are exported from sd-walk.blend.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const length=v=>Math.hypot(...v);
const unit=v=>mul(v,1/(length(v)||1));

export function solveLegIK(hip,target,upper,lower) {
  const delta=sub(target,hip),distance=length(delta);
  const reach=clamp(distance,Math.abs(upper-lower)+.001,upper+lower-.001);
  const along=unit(delta);
  let bend=sub([1,0,0],mul(along,dot([1,0,0],along)));
  if(length(bend)<.01)bend=sub([0,1,0],mul(along,dot([0,1,0],along)));
  bend=unit(bend);
  const midpoint=(upper*upper+reach*reach-lower*lower)/(2*reach);
  const height=Math.sqrt(Math.max(0,upper*upper-midpoint*midpoint));
  return {knee:add(hip,add(mul(along,midpoint),mul(bend,height))),ankle:add(hip,mul(along,reach))};
}

function ankleTarget(actor,foot,part,rig,planeSlope,worldHeight) {
  const scale=worldHeight/rig.referenceHeight;
  const soleX=(part.footContact[0]-part.ankle[0])*part.ratio;
  const soleZ=-(part.footContact[1]-part.ankle[1])*part.ratio;
  return [(foot.x-actor.x)/(scale*actor.facing)-soleX,-(foot.y-actor.y)*planeSlope/scale,-soleZ+foot.z];
}

/** Contacts are world X/lane anchors. Changing heading never drags a planted shoe. */
export function updateFootContacts(actor,rig,planeSlope,worldHeight=128) {
  if(!actor.gaitMoving)return;
  const scale=worldHeight/rig.referenceHeight;
  const cycleWorldDistance=rig.cycleWorldDistance || 2*rig.stride/rig.stance;
  const cycleDistance=cycleWorldDistance*scale;
  const travel=actor.walkDistance/cycleDistance;
  const reset=!actor.gaitFeet || actor.gaitRestart;
  if(reset)actor.gaitFeet={};
  for(const [side,offset,hipX] of [['left',0,-rig.hipWidth],['right',.5,rig.hipWidth]]) {
    const cycle=Math.floor(travel+offset),q=travel+offset-cycle;
    const direction={x:actor.gaitX,y:actor.gaitY};
    const desired=(forward)=>({x:actor.x+(hipX*actor.facing+direction.x*forward)*scale,
      y:actor.y+direction.y*forward*scale/planeSlope});
    let foot=actor.gaitFeet[side];
    if(!foot || foot.cycle!==cycle) {
      const start=desired(rig.stride-cycleWorldDistance*Math.min(q,rig.stance));
      foot=actor.gaitFeet[side]={...start,z:0,cycle,q,planted:q<=rig.stance,fromX:start.x,fromY:start.y,earlyLift:false};
    }
    foot.q=q;
    if(q<=rig.stance && !foot.earlyLift) {
      foot.planted=true;foot.z=0;
      const suffix=side==='left'?'L':'R',part=rig.parts['shin'+suffix];
      const ankle=ankleTarget(actor,foot,part,rig,planeSlope,worldHeight);
      const hip=[hipX,0,rig.hipHeight];
      if(length(sub(ankle,hip))>rig.parts['thigh'+suffix].length+part.length-.6) {
        foot.earlyLift=true;foot.liftAt=q;foot.fromX=foot.x;foot.fromY=foot.y;
      }
    }
    if(q>rig.stance || foot.earlyLift) {
      if(foot.planted) {foot.fromX=foot.x;foot.fromY=foot.y;}
      foot.planted=false;
      const start=foot.earlyLift?foot.liftAt:rig.stance;
      const t=clamp((q-start)/(1-start),0,1),end=desired(rig.stride);
      foot.x=mix(foot.fromX,end.x,smooth(t));foot.y=mix(foot.fromY,end.y,smooth(t));
      foot.z=Math.sin(t*Math.PI)*22;
    }
  }
  actor.gaitRestart=false;
}

/** Physical bones keep their full 3D length; projection foreshortens the moving legs naturally. */
export function legPose(actor,rig,planeSlope,worldHeight=128) {
  if(!actor.gaitFeet)return null;
  const result={};
  for(const [side,hipX,suffix] of [['left',-rig.hipWidth,'L'],['right',rig.hipWidth,'R']]) {
    const part=rig.parts['shin'+suffix],foot=actor.gaitFeet[side];
    const hip=[hipX,0,rig.hipHeight];
    const target=ankleTarget(actor,foot,part,rig,planeSlope,worldHeight);
    const {knee,ankle}=solveLegIK(hip,target,rig.parts['thigh'+suffix].length,part.length);
    const sole=[ankle[0]+(part.footContact[0]-part.ankle[0])*part.ratio,ankle[1],
      ankle[2]-(part.footContact[1]-part.ankle[1])*part.ratio];
    const scale=worldHeight/rig.referenceHeight;
    result[side]={hip,knee,ankle,sole,q:foot.q,planted:foot.planted,suffix,
      renderWorld:{x:actor.x+sole[0]*scale*actor.facing,y:actor.y+(-sole[1]-sole[2])*scale/planeSlope}};
  }
  return result;
}

function frameBasis(start,end) {
  const along=unit(sub(end,start));
  let side=unit([along[2],0,-along[0]]);
  if(length(side)<.01)side=[1,0,0];
  return {along,side};
}

function partPoint(part,u,v,start,end) {
  const axis=unit([part.ankle[0]-part.pivot[0],0,-(part.ankle[1]-part.pivot[1])]);
  const perpendicular=[axis[2],0,-axis[0]],source=[u-part.pivot[0],0,-(v-part.pivot[1])];
  const {along,side}=frameBasis(start,end);
  return add(start,add(mul(side,dot(source,perpendicular)*part.ratio),mul(along,dot(source,axis)*part.ratio)));
}

function calfPoint(part,u,v,knee,ankle,skin) {
  const calf=partPoint(part,u,v,knee,ankle);
  const foot=[ankle[0]+(u-part.ankle[0])*part.ratio,ankle[1],ankle[2]-(v-part.ankle[1])*part.ratio];
  const weight=smooth(clamp((v/part.rect[3]-skin[0])/(skin[1]-skin[0]),0,1));
  return calf.map((value,i)=>mix(value,foot[i],weight));
}

function project(point,height,reference) {
  const scale=height/reference;
  return [point[0]*scale,height/2-(point[2]+point[1])*scale];
}

function triangle(ctx,image,rect,uv,dest) {
  const [s0,s1,s2]=uv,[d0,d1,d2]=dest;
  const determinant=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);
  if(Math.abs(determinant)<.0001)return;
  const ux=s1[0]-s0[0],uy=s1[1]-s0[1],vx=s2[0]-s0[0],vy=s2[1]-s0[1];
  const dx1=d1[0]-d0[0],dx2=d2[0]-d0[0],dy1=d1[1]-d0[1],dy2=d2[1]-d0[1];
  const a=(dx1*vy-dx2*uy)/determinant,c=(dx2*ux-dx1*vx)/determinant;
  const b=(dy1*vy-dy2*uy)/determinant,d=(dy2*ux-dy1*vx)/determinant;
  ctx.save();ctx.beginPath();
  const center=[(d0[0]+d1[0]+d2[0])/3,(d0[1]+d1[1]+d2[1])/3];
  for(let i=0;i<3;i++) {
    const delta=[dest[i][0]-center[0],dest[i][1]-center[1]],len=Math.hypot(...delta)||1;
    const x=dest[i][0]+delta[0]/len*.22,y=dest[i][1]+delta[1]/len*.22;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.clip();
  ctx.transform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);
  ctx.drawImage(image,...rect,0,0,rect[2],rect[3]);ctx.restore();
}

export function drawLegRig(ctx,image,rig,pose,height,actor) {
  const legs=Object.values(pose).sort((a,b)=>b.ankle[1]-a.ankle[1]);
  const rows=[0,.48,.60,.68,.75,.82,.90,1];
  for(const leg of legs) {
    const thigh=rig.parts['thigh'+leg.suffix],shin=rig.parts['shin'+leg.suffix];
    const points=[[0,0],[thigh.rect[2],0],[thigh.rect[2],thigh.rect[3]],[0,thigh.rect[3]]];
    const dest=points.map(([u,v])=>project(partPoint(thigh,u,v,leg.hip,leg.knee),height,rig.referenceHeight));
    const [tl,tr,,bl]=dest,w=thigh.rect[2],h=thigh.rect[3];
    actor.gaitDrawInfo={part:'thigh'+leg.suffix,rowStart:0,rowEnd:1};
    ctx.save();ctx.transform((tr[0]-tl[0])/w,(tr[1]-tl[1])/w,(bl[0]-tl[0])/h,(bl[1]-tl[1])/h,tl[0],tl[1]);
    ctx.drawImage(image,...thigh.rect,0,0,w,h);ctx.restore();
    for(let row=0;row<rows.length-1;row++) {
      const y0=rows[row]*shin.rect[3],y1=rows[row+1]*shin.rect[3],width=shin.rect[2];
      const source=[[0,y0],[width,y0],[width,y1],[0,y1]];
      const destination=source.map(([u,v])=>project(calfPoint(shin,u,v,leg.knee,leg.ankle,rig.calfSkin),height,rig.referenceHeight));
      actor.gaitDrawInfo={part:'shin'+leg.suffix,rowStart:rows[row],rowEnd:rows[row+1]};
      for(const indices of [[0,1,2],[0,2,3]])triangle(ctx,image,shin.rect,indices.map(i=>source[i]),indices.map(i=>destination[i]));
    }
  }
  actor.gaitDrawInfo=null;
}
