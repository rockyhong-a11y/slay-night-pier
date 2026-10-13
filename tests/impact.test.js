import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeHitSound, IMPACT_PROFILES } from '../src/impact.js';
import { Game } from '../src/game.js';

test('all fifty authored strike landmarks belong to the exact shipped combat banks', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/sprites/manifest.json', import.meta.url)));
  const contacts = JSON.parse(readFileSync(new URL('../public/assets/motion/strike-contacts.json', import.meta.url)));
  assert.equal(Object.keys(contacts.actors).length, 10);
  for (const [id, actor] of Object.entries(contacts.actors)) {
    const bank = manifest[id].combat;
    const bytes = readFileSync(new URL(`../public${bank.image}`, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actor.sourceSHA256, hash, `${id} contacts need regeneration after an art change`);
    assert.equal(actor.imageVersion, bank.imageVersion);
    assert.equal(Object.keys(actor.poses).length, 5);
    for (const [name, point] of Object.entries(actor.poses)) {
      assert.deepEqual(point.rect, bank.poses[name].rect);
      assert.deepEqual(point.centerPivot, bank.poses[name].centerPivot);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
      assert.ok(point.pixel[0] >= 0 && point.pixel[0] < point.rect[2]);
      assert.ok(point.pixel[1] >= 0 && point.pixel[1] < point.rect[3]);
    }
  }
});

test('the common impact sample has a finite normalized crack and decaying body at mobile audio rates', () => {
  for (const rate of [22050, 44100, 48000]) {
    const samples = makeHitSound(rate);
    assert.equal(samples.length, Math.ceil(rate * .24));
    let peak = 0, head = 0, tail = 0;
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Number.isFinite(samples[i]));
      peak = Math.max(peak, Math.abs(samples[i]));
      if (i < samples.length / 4) head += samples[i] ** 2;
      if (i > samples.length * .75) tail += samples[i] ** 2;
    }
    assert.ok(peak > .85 && peak < .87);
    assert.ok(tail < head * .01, 'hit tail clears quickly between successive punches');
    assert.deepEqual(samples, makeHitSound(rate), 'same cached sound family for every character');
  }
  assert.ok(IMPACT_PROFILES.ground.freeze > IMPACT_PROFILES.light.freeze);
});

test('a paired wrestling landing emits one ground-contact burst without legacy particles or rings', () => {
  const game = new Game({ seed: 14 });
  game.motion = JSON.parse(readFileSync(new URL('../public/assets/motion/combat.json', import.meta.url), 'utf8'));
  game.start();
  const p = game.state.player, enemy = game.state.enemies[0];
  enemy.x = p.x + 55; enemy.y = p.y; enemy.cooldown = 20;
  game.state.enemies[1].x = 600; game.state.enemies[1].cooldown = 20;
  assert.equal(game.action('grab'), true);
  game.step(p.activeClip.duration * p.activeClip.impactAt + .03);
  assert.equal(game.hitBursts.length, 1);
  assert.equal(game.hitBursts[0].kind, 'ground');
  assert.equal(game.hitBursts[0].ground, true);
  assert.equal(game.particles, undefined); assert.equal(game.rings, undefined);
  game.step(1);
  assert.equal(game.hitBursts.length, 0, 'no persistent dust or screen-wide ring');
  game.destroy();
});
