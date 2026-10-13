import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, advanceGait, spriteGeometry, sampleMotion } from '../src/game.js';
import { updateFootContacts, legPose } from '../src/walk-rig.js';

const sprites = JSON.parse(readFileSync(new URL('../public/assets/sprites/manifest.json', import.meta.url)));
const walking = JSON.parse(readFileSync(new URL('../tools/walk-motion.json', import.meta.url)));
const simulate = (input, slices = 120) => {
  const game = new Game();
  game.manifest = sprites;
  game.start();
  for (const enemy of game.state.enemies) { enemy.x = 600; enemy.cooldown = 100; }
  game.setMove(input, 0);
  for (let i = 0; i < slices; i++) game.step(1 / slices);
  return game;
};

test('walking cadence follows actual stick distance and remains independent of frame rate', () => {
  const slow = simulate(.2), full = simulate(1), thirty = simulate(1, 30);
  assert.ok(Math.abs(slow.state.player.walkDistance / full.state.player.walkDistance - .2) < 1e-8);
  assert.ok(Math.abs(full.state.player.gaitTravel - thirty.state.player.gaitTravel) < 1e-8);
  assert.ok(full.state.player.walkDistance > slow.state.player.walkDistance * 4.9);
  slow.destroy(); full.destroy(); thirty.destroy();
});

test('a blocked gate, idle, pause, and hit knockback cannot drive a walking cycle', () => {
  const game = simulate(0);
  const p = game.state.player;
  p.x = 640; game.setMove(1, 0); game.step(.2);
  assert.equal(p.walkDistance, 0);
  assert.equal(p.gaitMoving, false);
  p.x = 150; p.action = 'hurt'; p.actionDuration = 1; p.actionTime = 0; p.vx = 80;
  game.step(.2);
  assert.ok(p.x > 150);
  assert.equal(p.walkDistance, 0);
  const phase = p.gaitPhase;
  game.pause(); game.step(1);
  assert.equal(p.gaitPhase, phase);
  game.destroy();
});

test('leftward movement mirrors forward steps while an opponent retreat reverses the same gait', () => {
  const forward = { facing: -1, gaitTravel: 0, walkDistance: 0 };
  const retreat = { facing: 1, gaitTravel: 0, walkDistance: 0 };
  advanceGait(forward, -12, 0, .1, 60);
  advanceGait(retreat, -12, 0, .1, 60);
  assert.equal(forward.gaitDirection, 1);
  assert.equal(retreat.gaitDirection, -1);
  assert.ok(Math.abs(forward.gaitPhase - .2) < 1e-9);
  assert.ok(Math.abs(retreat.gaitPhase - .8) < 1e-9);
});

test('tagging back to a previously walking hero creates contacts at the new arrival position', () => {
  const game = simulate(1);
  const atlas = game.state.player;
  assert.ok(atlas.gaitFeet?.left);
  assert.equal(game.tag(), true);
  game.setMove(0, 1);
  for (let i = 0; i < 240; i++) game.step(1 / 60);
  const arrival = { x: game.state.player.x, y: game.state.player.y };
  assert.equal(game.tag(), true);
  assert.equal(game.state.player, atlas);
  assert.equal(atlas.x, arrival.x);
  assert.equal(atlas.y, arrival.y);
  assert.equal(atlas.gaitFeet, null);
  assert.equal(atlas.gaitLegPose, null);
  assert.equal(atlas.gaitMoving, false);
  game.setMove(1, 0);
  game.step(1 / 60);
  const pose = legPose(atlas, sprites.atlas.walk.rig, atlas.gaitPlaneSlope);
  for (const [side, leg] of Object.entries(pose)) {
    if (!leg.planted) continue;
    assert.ok(Math.abs(leg.renderWorld.x - atlas.gaitFeet[side].x) < 1e-8);
    assert.ok(Math.abs(leg.renderWorld.y - atlas.gaitFeet[side].y) < 1e-8);
    assert.ok(Math.abs(leg.renderWorld.y - arrival.y) < .03);
  }
  game.destroy();
});

test('all ten Blender walking rigs preserve body lengths, scales, alternating soles, and planted world contacts', () => {
  assert.equal(Object.keys(walking.characters).length, 10);
  const references = new Set();
  for (const [id, clip] of Object.entries(walking.characters)) {
    assert.equal(clip.frames.length, 12, id);
    references.add(clip.referenceWorldHeight);
    const groups = new Map();
    for (const frame of clip.frames) {
      assert.ok(Math.abs(Math.hypot(...frame.joints.headTop.map((v,i) => v-frame.joints.neck[i])) - 90) < 1e-4, id);
      assert.ok(Math.abs(Math.hypot(...frame.joints.neck.map((v,i) => v-frame.joints.pelvis[i])) - 90) < 1e-4, id);
      for (const scale of Object.values(frame.scales)) assert.deepEqual(scale, [1,1,1], id);
      for (const [footName, foot] of Object.entries(frame.feet)) {
        if (!foot.planted) continue;
        assert.ok(Math.abs(foot.z) < .001, `${id} ${footName} sole stays on the ground`);
        const cycle = Math.floor(frame.phase + (footName === 'right' ? .5 : 0));
        const key = `${footName}:${cycle}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(foot.worldX);
      }
    }
    for (const contacts of groups.values()) assert.ok(Math.max(...contacts)-Math.min(...contacts) < .001, `${id} planted foot cannot slide`);
    assert.equal(new Set(clip.frames.map(frame => frame.contactFoot)).size, 2, id);
  }
  assert.equal(references.size, 1, 'long hair cannot resize a character’s torso');
});

test('walking and combat cells share an isotropic authored body reference and a consistent floor pivot', () => {
  for (const [id, actor] of Object.entries(sprites)) {
    for (const frame of actor.walk.frames) {
      const geometry = spriteGeometry(frame, actor.walk.bodyHeight, 128);
      assert.ok(Math.abs(geometry.width / geometry.height - frame.rect[2] / frame.rect[3]) < 1e-10, id);
      assert.ok(Math.abs(geometry.y + frame.pivot[1] * geometry.scale - 64) < 1e-8, id);
    }
    for (const frame of Object.values(actor.combat.poses)) {
      const geometry = spriteGeometry(frame, frame.bodyHeight || actor.combat.bodyHeight, 128);
      assert.ok(Math.abs(geometry.width / geometry.height - frame.rect[2] / frame.rect[3]) < 1e-10, id);
    }
  }
});

test('a paired landing draws its actual contact pose fully opaque and never squashes the fighter', () => {
  const game = new Game();
  game.motion = JSON.parse(readFileSync(new URL('../public/assets/motion/combat.json', import.meta.url)));
  game.start();
  const p = game.state.player, enemy = game.state.enemies[0];
  game.capture(enemy,{id:'atlas_front_up',clip:'atlas_front_up',damage:1},'grapple');
  const clip = p.grapple.clip;
  p.actionTime = clip.impactAt*clip.duration;
  game.state.time = p.actionTime;
  const pose = sampleMotion(clip,p.actionTime).victim;
  const combatImage = {}, calls = [], scales = [], alphaStack = [];
  const context = new Proxy({globalAlpha:1,
    save() { alphaStack.push(this.globalAlpha); },
    restore() { this.globalAlpha=alphaStack.pop(); },
    drawImage(...args) { calls.push({args,alpha:this.globalAlpha}); },
    scale(x,y) { scales.push([x,y]); },
  },{get(target,key) { return key in target ? target[key] : () => {}; }});
  game.ctx=context;
  game.sprites.set(enemy.id,{metadata:sprites[enemy.id],combat:combatImage});
  enemy.renderPose='shoulderFold';enemy.renderPoseFrom='shoulderFold';
  game.drawFighter(enemy,{...pose,scaleX:.2,scaleY:3},p);
  assert.equal(enemy.renderPose,pose.pose);
  assert.equal(enemy.renderPoseBlend,1);
  const drawings=calls.filter(call=>call.args[0]===combatImage);
  assert.equal(drawings.length,1,'the old inverted pose cannot occlude the landing');
  assert.equal(drawings[0].alpha,1);
  assert.deepEqual(drawings[0].args.slice(1,5),sprites[enemy.id].combat.poses[pose.pose].rect);
  assert.ok(scales.every(([x,y])=>Math.abs(x)===1 && y===1));
  game.destroy();
});

test('every character keeps its real rendered soles planted through all headings, slow sticks, and changing directions', () => {
  for(const [id,metadata] of Object.entries(sprites)) {
    const rig=metadata.walk.rig;
    for(const laneScale of [140,162,220]) for(const speed of [.2,1]) {
      for(const heading of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],'curve']) {
        const actor={id,x:200,y:.5,facing:1,walkDistance:0,gaitTravel:0,gaitMoving:false};
        const contacts=new Map();
        for(let step=0;step<180;step++) {
          const vector=heading==='curve' ? [Math.cos(step*.032),Math.sin(step*.032)] : heading;
          const norm=Math.hypot(...vector),dx=vector[0]/norm*80*speed/120,dy=vector[1]/norm*80*speed/120/laneScale;
          actor.x+=dx;actor.y+=dy;
          if(Math.abs(vector[0])>.2)actor.facing=vector[0]>0?1:-1;
          advanceGait(actor,dx,dy,1/120,metadata.walk.cycleDistance,laneScale);
          updateFootContacts(actor,rig,laneScale,128);
          const pose=legPose(actor,rig,laneScale,128);
          for(const [side,leg] of Object.entries(pose)) {
            assert.ok(Math.abs(Math.hypot(...leg.knee.map((v,i)=>v-leg.hip[i]))-rig.parts['thigh'+leg.suffix].length)<1e-8,id);
            assert.ok(Math.abs(Math.hypot(...leg.ankle.map((v,i)=>v-leg.knee[i]))-rig.parts['shin'+leg.suffix].length)<1e-8,id);
            if(!leg.planted)continue;
            const foot=actor.gaitFeet[side],key=side+':'+foot.cycle;
            assert.ok(Math.abs(leg.renderWorld.x-foot.x)<1e-8,`${id} actual raster shoe X matches world contact`);
            assert.ok(Math.abs(leg.renderWorld.y-foot.y)<1e-8,`${id} actual raster sole matches its ground lane`);
            if(!contacts.has(key))contacts.set(key,{x:foot.x,y:foot.y});
            const start=contacts.get(key);
            assert.ok(Math.abs(start.x-foot.x)<1e-9 && Math.abs(start.y-foot.y)<1e-9,`${id} stance cannot skate on ${heading}`);
          }
        }
      }
    }
  }
});
