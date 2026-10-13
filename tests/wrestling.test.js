import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRAB_MOVES } from '../src/combat-moves.js';
import { Game, sampleMotion } from '../src/game.js';

const motion = JSON.parse(readFileSync(new URL('../public/assets/motion/combat.json', import.meta.url), 'utf8'));
const moves = Object.values(GRAB_MOVES).flatMap(sides => Object.values(sides).flatMap(directions => Object.values(directions)));
const manifest = JSON.parse(readFileSync(new URL('../public/assets/sprites/manifest.json', import.meta.url), 'utf8'));
const hulls = JSON.parse(readFileSync(new URL('../tools/pose-contact-hulls.json', import.meta.url), 'utf8')).poses;

test('sixteen wrestling slots have distinct anatomical holds and paired trajectories, including non-lifting techniques', () => {
  assert.equal(new Set(moves.map(move => move.kind)).size, 16);
  const trajectories = new Set();
  for (const move of moves) {
    const clip = motion.clips[move.clip];
    assert.equal(clip.family, move.kind);
    assert.ok(clip.authoredKeyCount >= 13);
    assert.equal(clip.gripFeature, clip.gripType);
    trajectories.add(JSON.stringify([.2, .38, .47, .65, .82].map(t => {
      const pair = sampleMotion(clip, clip.duration * t);
      return [pair.hero.x, pair.hero.z, pair.hero.angle, pair.victim.x, pair.victim.z, pair.victim.angle];
    })));
    assert.ok(new Set(clip.frames.map(frame => frame.hero.pose)).size >= 4);
    for (const frame of clip.frames) for (const role of ['hero', 'victim']) {
      assert.equal(frame[role].scaleX, 1, `${move.name} ${role} width stays anatomical`);
      assert.equal(frame[role].scaleY, 1, `${move.name} ${role} height stays anatomical`);
      assert.ok([1, -1].includes(frame[role].relativeFacing));
    }
  }
  assert.equal(trajectories.size, 16, 'changing the label or repeating a common powerbomb cannot satisfy this check');
  assert.ok(Math.max(...motion.clips.atlas_rear_left.frames.map(frame => frame.victim.z)) < .12, 'leg sweep stays low');
  assert.ok(Math.max(...motion.clips.nova_front_right.frames.map(frame => frame.hero.z)) > .5, 'hurricanrana has a real scissors leap');
});

test('Blender exports anatomical grip controls and separate knee/pin versus floor impact anchors', () => {
  for (const move of moves) {
    const clip = motion.clips[move.clip];
    for (const frame of clip.frames) {
      assert.equal(frame.grip.source, 'Blender evaluated GripAnchor');
      assert.equal(frame.impactAnchor.source, 'Blender evaluated ImpactAnchor');
      for (const point of [frame.grip, frame.impactAnchor]) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
      }
    }
    const impact = sampleMotion(clip, clip.duration * clip.impactAt).impactAnchor;
    if (move.kind === 'backbreaker' || move.kind === 'cradle') {
      assert.equal(impact.surface, 'body');
      assert.ok(.5 + impact.z > .08 && .5 + impact.z < .4, `${move.name} contacts the low knee/pin, above the floor`);
    } else {
      assert.equal(impact.surface, 'ground');
      assert.ok(Math.abs(impact.z + .5) < .025, `${move.name} contacts the shared floor plane`);
    }
    const landing = clip.frames.at(-1).victim;
    assert.ok(['supine', 'prone', 'seated'].includes(landing.pose), `${move.name} finishes in actual landing artwork`);
    assert.equal(landing.z, 0);
    assert.ok(Math.abs(Math.sin(landing.angle)) < .00001 && Math.cos(landing.angle) > .99999);
  }
  const roll = motion.clips.nova_rear_right;
  assert.ok(Math.abs(roll.frames.at(-1).hero.angle) > 6.2, 'cradle includes a full coupled roll');
  assert.ok(Math.abs(roll.frames.at(-1).victim.angle) > 6.2);
});

test('a running or rolling grab preserves the hero landing position and respects the encounter wall', () => {
  for (const [hero, start] of [['atlas', 180], ['nova', 180], ['atlas', 615], ['nova', 615]]) {
    const game = new Game({ seed: 14 }); game.motion = motion; game.start(hero);
    const p = game.state.player, target = game.state.enemies[0];
    p.x = start; target.x = start + 45; target.y = p.y; target.facing = 1; target.cooldown = 1000;
    game.state.enemies[1].x = 1100; game.state.enemies[1].cooldown = 1000;
    game.setMove(1, 0); assert.equal(game.action('grab'), true);
    const clip = p.grapple.clip, last = sampleMotion(clip, clip.duration);
    const expected = Math.min(640, start + last.hero.x * 128);
    while (p.grapple) game.step(1 / 120);
    assert.ok(Math.abs(p.x - expected) < .001, `${hero} stays at the visible landing, including the wall case`);
    assert.ok(p.x > start);
    const victimExpected = Math.min(2350, start + last.victim.x * 128);
    assert.ok(Math.abs(target.x - victimExpected) < .001);
    game.destroy();
  }
});

test('the coupled cradle roll stays on its painted silhouette floor and every enemy has every required reaction', () => {
  const roll = motion.clips.nova_rear_right;
  for (const frame of roll.frames.filter(frame => frame.t >= .29 && frame.t <= .73)) {
    for (const [role, character] of [['hero', 'nova'], ['victim', 'viper']]) {
      const actor = frame[role], outline = hulls[character][actor.pose].points;
      const minZ = Math.min(...outline.map(([x, z]) => -Math.sin(actor.angle) * x + Math.cos(actor.angle) * z));
      assert.ok(Math.abs(.5 + actor.z + minZ) < .00001, `${character} remains grounded through the complete roll`);
    }
  }
  const enemyIds = ['viper', 'lynx', 'raven', 'seraph', 'tempest', 'ember', 'valkyrie', 'onyx'];
  for (const move of moves) for (const frame of motion.clips[move.clip].frames) {
    assert.ok(manifest[move.hero].combat.poses[frame.hero.pose], `${move.name} has painted hero art`);
    for (const id of enemyIds) assert.ok(manifest[id].combat.poses[frame.victim.pose], `${id} has ${move.name} reaction art`);
  }
});
