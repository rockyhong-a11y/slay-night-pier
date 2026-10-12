import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, GAME_CONSTANTS, sampleMotion } from '../src/game.js';
import { ENCOUNTERS } from '../src/roster.js';

const motion = JSON.parse(readFileSync(new URL('../public/assets/motion/grapples.json', import.meta.url), 'utf8'));
const createGame = (hero = 'atlas') => {
  const events = [];
  const game = new Game({ seed: 14, onEvent: event => events.push(event) });
  game.motion = motion;
  game.start(hero);
  return { game, events };
};
const advance = (game, seconds) => {
  while (seconds > 0) { const dt = Math.min(seconds, 0.1); game.step(dt); seconds -= dt; }
};
const putEnemyInRange = game => {
  const enemy = game.state.enemies.find(enemy => enemy.hp > 0);
  enemy.x = game.state.player.x + 55;
  enemy.y = game.state.player.y;
  enemy.cooldown = 10;
  return enemy;
};

test('one stage encounters contain every enemy exactly once and victory requires all eight', () => {
  const { game, events } = createGame();
  const allIds = ENCOUNTERS.flatMap(encounter => encounter.enemies);
  assert.equal(new Set(allIds).size, 8);
  assert.equal(game.state.encountered, 2);
  for (let wave = 0; wave < 3; wave++) {
    for (const enemy of game.state.enemies.filter(enemy => enemy.hp > 0)) game.damageEnemy(enemy, 999);
    advance(game, 0.2);
    assert.equal(game.state.kills, [2, 5, 8][wave]);
    if (wave < 2) {
      assert.equal(game.state.status, 'playing');
      assert.equal(game.state.phase, 'advance');
      game.state.player.x = GAME_CONSTANTS.waves[wave + 1].trigger;
      advance(game, 0.1);
      assert.equal(game.state.wave, wave + 2);
    }
  }
  assert.equal(game.state.status, 'victory');
  assert.equal(game.state.progress, 1);
  assert.equal(game.state.encountered, 8);
  assert.deepEqual(events.filter(event => event.type === 'wave').flatMap(event => event.enemyIds), allIds);
  assert.equal(game.state.boss.id, 'onyx');
  game.destroy();
});

test('portrait lane movement stays inside the encounter gate until enemies are defeated', () => {
  const { game } = createGame();
  game.setMove(1, 1);
  advance(game, 3.5);
  assert.ok(game.state.player.x <= GAME_CONSTANTS.waves[0].end);
  assert.ok(game.state.player.y <= 0.96);
  game.setMove(-1, -1);
  advance(game, 3.5);
  assert.ok(game.state.player.x >= 50);
  assert.ok(game.state.player.y >= 0.08);
  game.destroy();
});

test('a directional punch hits once, builds meter, and does not hit another depth lane', () => {
  const { game } = createGame();
  const victim = putEnemyInRange(game);
  const other = game.state.enemies.find(enemy => enemy !== victim);
  other.x = victim.x;
  other.y = 0.02;
  other.cooldown = 10;
  const victimHp = victim.hp;
  const otherHp = other.hp;
  const meter = game.state.player.meter;
  assert.equal(game.action('attack'), true);
  advance(game, 0.25);
  assert.ok(victim.hp < victimHp);
  assert.equal(other.hp, otherHp);
  const hpAfterImpact = victim.hp;
  advance(game, 0.12);
  assert.equal(victim.hp, hpAfterImpact);
  assert.ok(game.state.player.meter > meter);
  assert.equal(game.state.combo, 1);
  game.destroy();
});

test('actual Blender tracks distinguish overhead powerbomb from backward suplex', () => {
  const powerLift = sampleMotion(motion.clips.powerbomb, motion.clips.powerbomb.duration * 0.44);
  const suplexThrow = sampleMotion(motion.clips.suplex, motion.clips.suplex.duration * 0.69);
  const powerEnd = sampleMotion(motion.clips.powerbomb, motion.clips.powerbomb.duration);
  const suplexEnd = sampleMotion(motion.clips.suplex, motion.clips.suplex.duration);
  assert.ok(powerLift.victim.z > 0.8, 'powerbomb lifts the victim above the hero');
  assert.ok(suplexThrow.victim.x < 0, 'suplex throws behind the hero');
  assert.ok(powerEnd.victim.x > 0.5);
  assert.ok(suplexEnd.victim.x < -0.5);
  assert.ok(Number.isFinite(powerLift.hero.angle));
});

test('a grab follows the sampled track and applies exactly one impact at the Blender marker', () => {
  const { game, events } = createGame('nova');
  const target = putEnemyInRange(game);
  target.maxHp = target.hp = 150;
  assert.equal(game.action('grab'), true);
  assert.equal(target.action, 'grabbed');
  const clip = motion.clips.suplex;
  const impact = clip.duration * clip.impactAt;
  advance(game, impact - 0.08);
  assert.equal(target.hp, 150);
  assert.ok(target.x < game.state.player.x, 'victim moves behind hero before impact');
  advance(game, 0.16);
  assert.equal(target.hp, 101);
  advance(game, 0.7);
  assert.equal(target.hp, 101);
  assert.equal(events.filter(event => event.type === 'slam').length, 1);
  assert.equal(game.state.player.grapple, null);
  game.destroy();
});

test('special meter and jump invulnerability prevent spamming and reward timing', () => {
  const { game } = createGame();
  const victim = putEnemyInRange(game);
  game.state.player.meter = 44;
  assert.equal(game.action('special'), false);
  assert.equal(game.state.player.meter, 44);
  game.state.player.meter = 60;
  assert.equal(game.action('special'), true);
  assert.equal(game.state.player.meter, 15);
  const hp = game.state.player.hp;
  assert.equal(game.damagePlayer(30), false);
  advance(game, 0.95);
  assert.ok(victim.hp < victim.maxHp);
  assert.equal(game.state.player.hp, hp);
  assert.equal(game.action('jump'), true);
  assert.equal(game.damagePlayer(30), false);
  advance(game, 0.75);
  assert.equal(game.state.player.z, 0);
  game.destroy();
});

test('tag preserves separate health and both heroes must fall for game over', () => {
  const { game } = createGame();
  const atlas = game.state.player;
  atlas.hp = 44;
  assert.equal(game.action('tag'), true);
  assert.equal(game.state.player.id, 'nova');
  assert.equal(game.state.team.find(hero => hero.id === 'atlas').hp, 44);
  assert.equal(game.action('tag'), false, 'manual tag has a cooldown');
  game.state.player.hp = 1;
  game.state.player.invulnerable = 0;
  assert.equal(game.damagePlayer(10), true);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.player.id, 'atlas');
  assert.equal(game.state.player.hp, 44);
  game.state.player.hp = 1;
  game.state.player.invulnerable = 0;
  assert.equal(game.damagePlayer(10), true);
  assert.equal(game.state.status, 'gameover');
  game.destroy();
});

test('pause freezes simulation, clears movement, and restart resets pending actions', () => {
  const { game } = createGame();
  game.setMove(1, 0);
  advance(game, 0.2);
  game.pause(true);
  const time = game.state.time;
  const x = game.state.player.x;
  advance(game, 2);
  assert.equal(game.state.status, 'paused');
  assert.equal(game.state.time, time);
  assert.equal(game.state.player.x, x);
  game.pause(false);
  advance(game, 0.2);
  assert.equal(game.state.player.x, x);
  game.queuedAttack = true;
  game.start('nova');
  assert.equal(game.queuedAttack, false);
  assert.equal(game.state.player.id, 'nova');
  assert.equal(game.state.kills, 0);
  assert.equal(game.state.score, 0);
  game.destroy();
});

test('ordinary approach, grab, special, and tag inputs can clear the complete stage with real health', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, events } = createGame(hero);
    let ticks = 0;
    let lastAction = -100;
    let nextTagAt = 9;
    while (game.state.status === 'playing' && ticks < 60 * 180) {
      const player = game.state.player;
      const targets = game.state.enemies.filter(enemy => enemy.hp > 0).sort((a, b) =>
        Math.hypot(a.x - player.x, (a.y - player.y) * 330) - Math.hypot(b.x - player.x, (b.y - player.y) * 330));
      if (game.state.time >= nextTagAt && ['idle', 'walk'].includes(player.action)) {
        game.action('tag');
        nextTagAt += 9;
      }
      if (!targets.length) game.setMove(1, 0);
      else {
        const enemy = targets[0];
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        if (Math.hypot(dx, dy * 330) > 69) {
          game.setMove(Math.abs(dx) > 52 ? Math.sign(dx) : 0, Math.abs(dy) > 0.07 ? Math.sign(dy) : 0);
        } else {
          game.setMove(0, 0);
          if (ticks - lastAction > 14) {
            game.action(player.meter >= 45 && targets.length > 1 ? 'special' : 'grab');
            lastAction = ticks;
          }
        }
      }
      game.step(1 / 60);
      ticks++;
    }
    assert.equal(game.state.status, 'victory', `${hero} clears using gameplay inputs`);
    assert.equal(game.state.kills, 8);
    assert.equal(game.state.encountered, 8);
    assert.ok(game.state.team.some(fighter => fighter.hp > 0));
    assert.ok(game.state.team.every(fighter => fighter.hp <= fighter.maxHp));
    assert.ok(events.some(event => event.type === 'grapple'));
    assert.ok(events.some(event => event.type === 'special'));
    assert.ok(events.some(event => event.type === 'tag'));
    assert.equal(events.filter(event => event.type === 'kill').length, 8);
    game.destroy();
  }
});
