import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, advanceGait, spriteGeometry, sampleMotion } from '../src/game.js';

const sprites = JSON.parse(readFileSync(new URL('../public/assets/sprites/manifest.json', import.meta.url)));
const wholeBodyWalk = (bodyHeight = 270) => ({
  mode: 'wholeBody', image: '/assets/sprites/whole-body-test.webp', imageVersion: 'test-version',
  bodyHeight, cycleDistance: 60,
  frames: Array.from({ length: 8 }, (_, i) => {
    const width = 130 + i * 9, height = 300 - i * 3, pivot = [51, height - 7];
    return { rect: [i * 220, 0, width, height], pivot,
      centerPivot: [pivot[0], pivot[1] - bodyHeight / 2] };
  }),
  // A migrated record can retain old data without drawing or updating that rig.
  rig: { obsolete: true },
});
const recordDrawing = () => {
  const calls = [], scales = [], alphaStack = [];
  const ctx = new Proxy({ globalAlpha: 1,
    save() { alphaStack.push(this.globalAlpha); },
    restore() { this.globalAlpha = alphaStack.pop(); },
    drawImage(...args) { calls.push({ args, alpha: this.globalAlpha }); },
    scale(x, y) { scales.push([x, y]); },
    createRadialGradient() { return { addColorStop() {} }; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  return { ctx, calls, scales };
};
const wholeBodyDrawing = () => {
  const game = new Game({ reducedMotion: true });
  game.start();
  const actor = game.state.player;
  const drawing = recordDrawing();
  const sprite = { metadata: { ...sprites[actor.id], walk: wholeBodyWalk() },
    walk: { kind: 'whole-body' }, combat: { kind: 'combat' }, rig: { kind: 'obsolete-rig' } };
  game.ctx = drawing.ctx;
  game.sprites.set(actor.id, sprite);
  return { game, actor, sprite, ...drawing };
};
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

test('whole-body walking selects one complete frame with a uniform standing-reference scale', () => {
  const game = new Game(), { ctx, calls } = recordDrawing();
  game.ctx = ctx; ctx.globalAlpha = .63;
  for (const [id, character] of Object.entries(sprites)) {
    const metadata = wholeBodyWalk(character.combat.bodyHeight);
    const image = { id }, sprite = { metadata: { walk: metadata }, walk: image, rig: {} };
    for (const boss of [false, true]) for (const phase of [0, .124, .125, .28, .999, -.25, 1.25]) {
      const height = 128 * (boss ? 1.15 : 1), cycle = metadata.cycleDistance * (boss ? 1.15 : 1);
      const actor = { id, boss, gaitTravel: phase * cycle, gaitFeet: { stale: true } };
      calls.length = 0;
      game.drawWalk(sprite, actor, height);
      const wrapped = ((phase % 1) + 1) % 1, index = Math.floor(wrapped * metadata.frames.length);
      const frame = metadata.frames[index], geometry = spriteGeometry(frame, metadata.bodyHeight, height);
      assert.equal(calls.length, 1, `${id}: adjacent drawings and old body parts are absent`);
      assert.equal(calls[0].args[0], image);
      assert.deepEqual(calls[0].args.slice(1), [...geometry.rect, geometry.x, geometry.y, geometry.width, geometry.height]);
      assert.equal(calls[0].alpha, .63);
      assert.equal(actor.gaitFrame, index);
      assert.ok(Math.abs(geometry.width / frame.rect[2] - geometry.height / frame.rect[3]) < 1e-12);
      assert.ok(Math.abs(geometry.y + frame.pivot[1] * geometry.scale - height / 2) < 1e-10);
    }
  }
  game.destroy();
});

test('whole-body gait uses actual projected travel and ignores retained mesh metadata', () => {
  const game = new Game();
  const actor = game.state.player;
  game.manifest = { [actor.id]: { walk: wholeBodyWalk() } };
  const laneScale = (game.floorY(1) - game.floorY(0)) / (game.width / 420);
  game.updateWalking(actor, 0, .04, .1);
  game.updateWalking(actor, 3, -.02, .1);
  const expected = .04 * laneScale + Math.hypot(3, -.02 * laneScale);
  assert.ok(Math.abs(actor.walkDistance - expected) < 1e-10);
  assert.ok(Number.isFinite(actor.gaitPhase));
  assert.ok(actor.gaitFeet == null);
  assert.ok(actor.gaitLegPose == null);
  const phase = actor.gaitPhase, travel = actor.gaitTravel;
  game.updateWalking(actor, 0, 0, .1);
  assert.equal(actor.gaitMoving, false);
  assert.equal(actor.gaitPhase, phase);
  assert.equal(actor.gaitTravel, travel);
  game.destroy();
});

test('whole-body walking enters and leaves without ghosting an old walking image over idle, charge, or strike', () => {
  const { game, actor, sprite, calls, scales } = wholeBodyDrawing();
  for (const facing of [-1, 1]) for (const next of ['idle', 'charge', 'strike']) {
    actor.facing = facing; actor.action = 'walk'; actor.gaitMoving = true; actor.gaitTravel = 17;
    actor.renderWasWalking = false; actor.renderPose = 'idle'; actor.renderPoseFrom = 'idle';
    game.state.time += 1;
    calls.length = 0;
    game.drawFighter(actor);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], sprite.walk);
    assert.equal(calls[0].alpha, 1);
    actor.action = next; actor.gaitMoving = false; actor.chargeReady = next === 'charge';
    game.state.time += .005;
    const pose = next === 'charge' ? 'charge' : next === 'strike' ? 'jab' : 'idle';
    calls.length = 0;
    const transform = next === 'strike' ? { pose, x: 0, z: 0, angle: 0, scaleX: .2, scaleY: 3 } : null;
    game.drawFighter(actor, transform);
    assert.equal(calls.length, 1, `old walking image cannot overlay ${next}`);
    assert.equal(calls[0].args[0], sprite.combat);
    assert.deepEqual(calls[0].args.slice(1, 5), sprite.metadata.combat.poses[pose].rect);
    assert.equal(calls[0].alpha, 1);
    assert.equal(actor.renderWasWalking, false);
    assert.equal(actor.renderPoseFromWalk, false);
  }
  assert.ok(scales.every(([x, y]) => Math.abs(x) === 1 && y === 1));
  game.destroy();
});

test('an explicitly requested pose overrides a moving fighter and clears stale walking fades', () => {
  const { game, actor, sprite, calls } = wholeBodyDrawing();
  actor.action = 'walk'; actor.gaitMoving = true; actor.renderWasWalking = true;
  actor.renderPoseFromWalk = true; actor.renderPose = 'idle'; actor.renderPoseFrom = 'hurt';
  game.drawFighter(actor, null, actor, 'jab');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], sprite.combat);
  assert.deepEqual(calls[0].args.slice(1, 5), sprite.metadata.combat.poses.jab.rect);
  assert.equal(calls[0].alpha, 1);
  assert.equal(actor.renderWasWalking, false);
  assert.equal(actor.renderPoseFromWalk, false);
  game.destroy();
});

test('whole-body tag arrivals reset old travel and visual phase before resuming at the new location', () => {
  const game = new Game();
  game.manifest = Object.fromEntries(Object.entries(sprites).map(([id, data]) => [id, { ...data, walk: wholeBodyWalk() }]));
  game.start();
  for (const enemy of game.state.enemies) { enemy.x = 600; enemy.cooldown = 100; }
  const atlas = game.state.player;
  game.setMove(1, 0);
  for (let i = 0; i < 12; i++) game.step(1 / 60);
  assert.ok(atlas.gaitTravel > 0);
  assert.equal(game.tag(), true);
  game.setMove(0, 1);
  for (let i = 0; i < 48; i++) game.step(1 / 60);
  const arrival = { x: game.state.player.x, y: game.state.player.y };
  game.state.tagCooldown = 0;
  atlas.renderWasWalking = atlas.renderPoseFromWalk = true;
  assert.equal(game.tag(), true);
  assert.deepEqual({ x: atlas.x, y: atlas.y }, arrival);
  assert.equal(atlas.walkDistance, 0);
  assert.equal(atlas.gaitTravel, 0);
  assert.equal(atlas.gaitPhase, 0);
  assert.equal(atlas.renderWasWalking, false);
  assert.equal(atlas.renderPoseFromWalk, false);
  assert.ok(atlas.gaitFeet == null);
  game.setMove(-1, 0);
  game.step(1 / 60);
  assert.equal(atlas.facing, -1);
  assert.ok(atlas.gaitPhase > 0 && atlas.gaitPhase < .1);
  assert.ok(atlas.gaitFeet == null);
  game.pause();
  const phase = atlas.gaitPhase;
  game.step(1);
  assert.equal(atlas.gaitPhase, phase);
  game.destroy();
});

test('authored walking and combat raster cells retain their pixel aspect and floor pivots', () => {
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
