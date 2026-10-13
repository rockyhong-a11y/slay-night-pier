import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, GAME_CONSTANTS } from '../src/game.js';
import { ENCOUNTERS } from '../src/roster.js';
import { COMBAT_RULES } from '../src/combat-moves.js';

const motion = JSON.parse(readFileSync(new URL('../public/assets/motion/combat.json', import.meta.url), 'utf8'));
const createGame = (hero = 'atlas') => {
  const events = [];
  const game = new Game({ seed: 14, onEvent: event => events.push(event) });
  game.motion = motion;
  game.start(hero);
  return { game, events };
};
const advance = (game, seconds) => {
  while (seconds > .00001) { const dt = Math.min(seconds, .05); game.step(dt); seconds -= dt; }
};

test('one stage encounters contain every enemy exactly once and victory requires all eight', () => {
  const { game, events } = createGame();
  const allIds = ENCOUNTERS.flatMap(encounter => encounter.enemies);
  assert.equal(new Set(allIds).size, 8);
  assert.equal(game.state.encountered, 2);
  for (let wave = 0; wave < 3; wave++) {
    for (const enemy of game.state.enemies.filter(enemy => enemy.hp > 0)) game.damageEnemy(enemy, 999);
    advance(game, .2);
    assert.equal(game.state.kills, [2, 5, 8][wave]);
    if (wave < 2) {
      assert.equal(game.state.status, 'playing');
      assert.equal(game.state.phase, 'advance');
      game.state.player.x = GAME_CONSTANTS.waves[wave + 1].trigger;
      advance(game, .1);
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

test('portrait lane movement stays inside encounter gates', () => {
  const { game } = createGame();
  game.setMove(1, 1);
  advance(game, 3.5);
  assert.ok(game.state.player.x <= GAME_CONSTANTS.waves[0].end);
  assert.ok(game.state.player.y <= .96);
  game.setMove(-1, -1);
  advance(game, 3.5);
  assert.ok(game.state.player.x >= 50);
  assert.ok(game.state.player.y >= .08);
  game.destroy();
});

test('tag preserves independent health and both heroes must fall for game over', () => {
  const { game } = createGame();
  game.state.player.hp = 44;
  game.beginStrike();
  assert.equal(game.action('tag'), true);
  assert.equal(game.state.player.id, 'nova');
  assert.equal(game.state.team.find(hero => hero.id === 'atlas').hp, 44);
  assert.equal(game.state.team.find(hero => hero.id === 'atlas').strikeHeld, false);
  assert.equal(game.action('tag'), false);
  game.state.player.hp = 1;
  game.state.player.invulnerable = 0;
  game.damagePlayer(10);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.player.id, 'atlas');
  game.state.player.hp = 1;
  game.state.player.invulnerable = 0;
  game.damagePlayer(10);
  assert.equal(game.state.status, 'gameover');
  assert.equal(game.state.player.strikeHeld, false);
  assert.equal(game.inputBuffer.length, 0);
  game.destroy();
});

test('pause and pointer cancellation clear a held charge without firing on resume or release', () => {
  const { game, events } = createGame();
  game.beginStrike(); advance(game, .6);
  assert.equal(game.state.player.chargeReady, true);
  game.pause(true);
  const time = game.state.time;
  assert.equal(game.endStrike(), false);
  advance(game, 2);
  assert.equal(game.state.time, time);
  game.pause(false); advance(game, .3);
  assert.equal(game.state.player.action, 'idle');
  assert.equal(game.state.player.strikeHeld, false);
  assert.equal(game.state.player.chargeTime, 0);
  assert.equal(events.filter(event => event.type === 'strike').length, 0);
  game.beginStrike(); advance(game, .5); game.cancelStrike();
  assert.equal(game.endStrike(), false);
  assert.equal(game.state.player.action, 'idle');
  game.start('nova');
  assert.equal(game.inputBuffer.length, 0);
  assert.equal(game.state.player.id, 'nova');
  game.destroy();
});

test('real-health input-only play clears all eight using charge, rear grab, timed counter, and tag', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, events } = createGame(hero);
    let ticks = 0, nextTagAt = 13, lastCharge = -10, counterDone = false;
    while (game.state.status === 'playing' && ticks < 60 * 180) {
      const player = game.state.player;
      const targets = game.state.enemies.filter(enemy => enemy.hp > 0).sort((a, b) =>
        Math.hypot(a.x - player.x, (a.y - player.y) * 330) - Math.hypot(b.x - player.x, (b.y - player.y) * 330));
      const canAct = ['idle', 'walk', 'charge'].includes(player.action);
      if (game.state.time >= nextTagAt && canAct && !player.strikeHeld) {
        game.action('tag'); nextTagAt += 13;
      }
      if (!targets.length) game.setMove(1, 0);
      else {
        const enemy = targets[0], dx = enemy.x - player.x, dy = enemy.y - player.y;
        const distance = Math.hypot(dx, dy * 330);
        if (player.strikeHeld) {
          game.setMove(0, 0);
          if (player.chargeTime >= COMBAT_RULES.chargeThreshold + .12) game.endStrike();
        } else if (distance > 67) {
          game.setMove(Math.abs(dx) > 52 ? Math.sign(dx) : 0, Math.abs(dy) > .07 ? Math.sign(dy) : 0);
          if (counterDone && distance < 125 && canAct && game.state.time - lastCharge > 3) {
            game.setMove(0, 0); game.beginStrike(); lastCharge = game.state.time;
          }
        } else {
          game.setMove(0, 0);
          if (!counterDone) {
            const incoming = targets.find(target => target.action === 'attack' && !target.attackHit &&
              target.actionTime >= (target.boss ? .65 : .48) - .14);
            if (incoming && canAct) { game.action('counter'); counterDone = true; }
          } else if (canAct && game.state.tagCooldown < 2.9) game.action('grab');
        }
      }
      game.step(1 / 60); ticks++;
    }
    assert.equal(game.state.status, 'victory', `${hero} completes ordinary-input combat`);
    assert.equal(game.state.kills, 8);
    assert.equal(game.state.encountered, 8);
    assert.ok(game.state.team.some(fighter => fighter.hp > 0));
    assert.ok(game.state.team.every(fighter => fighter.hp <= fighter.maxHp));
    assert.ok(events.some(event => event.type === 'counter'));
    assert.ok(events.some(event => event.type === 'rearOpening'));
    assert.ok(events.some(event => event.type === 'grapple' && event.side === 'rear'));
    assert.ok(events.some(event => event.type === 'tag'));
    assert.equal(events.filter(event => event.type === 'kill').length, 8);
    game.destroy();
  }
});

test('last-wave victory completes the final strike and cancels a held follow-up', () => {
  const { game } = createGame();
  for (let wave = 0; wave < 2; wave++) {
    for (const enemy of game.state.enemies.filter(enemy => enemy.hp > 0)) game.damageEnemy(enemy, 999);
    advance(game, .2);
    game.state.player.x = GAME_CONSTANTS.waves[wave + 1].trigger;
    advance(game, .1);
  }
  const boss = game.state.boss;
  for (const enemy of game.state.enemies.filter(enemy => enemy.hp > 0 && enemy !== boss)) game.damageEnemy(enemy, 999);
  game.state.player.x = boss.x - 55; game.state.player.y = boss.y;
  boss.hp = 1; boss.cooldown = 10;
  game.beginStrike(); advance(game, .6); game.endStrike();
  game.beginStrike();
  advance(game, .3);
  assert.equal(game.state.kills, 8);
  assert.equal(game.state.status, 'playing', 'victory waits for the actual final strike recovery');
  advance(game, .7);
  assert.equal(game.state.status, 'victory');
  assert.equal(game.state.player.action, 'idle');
  assert.equal(game.state.player.strikeHeld, false);
  assert.equal(game.inputBuffer.length, 0);
  assert.equal(game.endStrike(), false);
  const time = game.state.time;
  advance(game, .5);
  assert.equal(game.state.time, time);
  game.destroy();
});
