import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, sampleMotion, targetSide } from '../src/game.js';
import { GRAB_MOVES, COMBO_STEPS, CHAIN_MOVES, COUNTER_MOVES, COMBAT_RULES, directionForMove } from '../src/combat-moves.js';

const motion = JSON.parse(readFileSync(new URL('../public/assets/motion/combat.json', import.meta.url), 'utf8'));
const createGame = (hero = 'atlas') => {
  const events = [];
  const game = new Game({ seed: 14, onEvent: event => events.push(event) });
  game.motion = motion; game.start(hero);
  const enemy = game.state.enemies[0];
  enemy.x = game.state.player.x + 55; enemy.y = game.state.player.y;
  enemy.cooldown = 20;
  game.state.enemies[1].x = 600; game.state.enemies[1].cooldown = 20;
  return { game, enemy, events };
};
const advance = (game, seconds) => {
  while (seconds > .00001) { const dt = Math.min(seconds, 1 / 120); game.step(dt); seconds -= dt; }
};
const tap = game => { game.beginStrike(); game.endStrike(); };
const attackingEnemy = game => {
  const enemy = game.state.enemies[0];
  enemy.action = 'attack'; enemy.actionTime = 0; enemy.actionDuration = .82;
  enemy.facing = -1; enemy.attackHit = false; enemy.activeStrike = 'jab';
  return enemy;
};

test('all Blender combat clips contain contact/impact markers and finite paired tracks', () => {
  const ids = [...COMBO_STEPS.map(move => move.id), 'chargeStrike',
    ...Object.values(GRAB_MOVES).flatMap(sides => Object.values(sides).flatMap(directions => Object.values(directions).map(move => move.clip))),
    ...Object.values(CHAIN_MOVES).map(move => move.clip),
    ...Object.values(COUNTER_MOVES).flatMap(moves => Object.values(moves).map(move => move.clip))];
  for (const id of ids) {
    const clip = motion.clips[id];
    assert.ok(clip?.frames?.length > 20, `${id} has sampled Blender frames`);
    assert.ok(clip.duration > .2);
    assert.ok(clip.contactAt >= 0 && clip.contactAt <= 1);
    assert.ok(clip.impactAt >= 0 && clip.impactAt <= 1);
    const middle = sampleMotion(clip, clip.duration * .5);
    assert.ok(Number.isFinite(middle.hero.x)); assert.ok(Number.isFinite(middle.victim.angle));
    assert.equal(typeof middle.hero.pose, 'string');
  }
});

test('quick taps release into distinct jab, cross, low-kick and roundhouse instead of autofire', () => {
  const { game, enemy, events } = createGame();
  const hp = enemy.hp;
  game.beginStrike(); advance(game, .1);
  assert.equal(enemy.hp, hp); assert.equal(game.state.player.action, 'charge');
  game.endStrike();
  assert.equal(game.state.player.activeMove.id, 'jab');
  advance(game, .08); tap(game);
  assert.equal(game.inputBuffer.length, 1, 'pending hit keeps a buffered next tap');
  advance(game, .25); tap(game);
  advance(game, .35); tap(game);
  advance(game, .8);
  assert.deepEqual(events.filter(event => event.type === 'strike').map(event => event.move), ['jab', 'cross', 'lowKick', 'roundhouse']);
  assert.equal(game.state.player.chainHits, 4);
  const hpAfter = enemy.hp;
  advance(game, .6);
  assert.equal(enemy.hp, hpAfter, 'no automatic attacks without another released input');
  assert.equal(events.filter(event => event.type === 'hit').length, 4);
  game.destroy();
});

test('a fifth connected tap legally cancels recovery into a single-impact combo throw', () => {
  const { game, enemy, events } = createGame('nova');
  tap(game); advance(game, .08); tap(game);
  advance(game, .25); tap(game); advance(game, .35); tap(game);
  advance(game, .35); tap(game); advance(game, 2.6);
  const strikes = events.filter(event => event.type === 'strike');
  assert.deepEqual(strikes.map(event => event.move), ['jab', 'cross', 'lowKick', 'roundhouse']);
  assert.equal(events.filter(event => event.type === 'chain').length, 1);
  assert.equal(events.find(event => event.type === 'chain').move, CHAIN_MOVES.nova.id);
  assert.equal(events.filter(event => event.type === 'slam' && event.combatType === 'chain').length, 1);
  assert.equal(events.filter(event => event.type === 'chainImpact').length, 1, 'first slam has presentation feedback without extra damage');
  assert.equal(enemy.hp, 0);
  assert.equal(game.state.kills, 1);
  game.destroy();
});

test('holding never attacks; releasing charged extended punch preserves a two-second rear opening', () => {
  const { game, enemy, events } = createGame();
  game.beginStrike(); advance(game, COMBAT_RULES.chargeThreshold + .15);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(game.state.player.chargeReady, true);
  assert.ok(game.state.player.chargeTime >= .55);
  game.endStrike();
  assert.equal(game.state.player.activeMove.id, 'chargeStrike');
  assert.equal(game.state.player.chargeTime, 0);
  advance(game, .4);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(enemy.action, 'rearStun');
  const facing = enemy.facing;
  assert.equal(targetSide(game.state.player, enemy), 'rear');
  advance(game, 1.35);
  assert.equal(enemy.facing, facing, 'AI does not overwrite the spun-away facing');
  assert.equal(enemy.action, 'rearStun');
  assert.ok(enemy.facingLocked > .5);
  assert.equal(events.filter(event => event.type === 'hit').length, 1);
  assert.equal(events.filter(event => event.type === 'rearOpening').length, 1);
  game.setMove(0, 1); assert.equal(game.action('grab'), true);
  assert.equal(game.state.player.grapple.move.id, 'atlas_rear_down');
  game.destroy();
});

test('front/rear orientation and dominant screen direction choose all sixteen authored throws', () => {
  const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (const hero of ['atlas', 'nova']) for (const side of ['front', 'rear']) for (const [direction, input] of Object.entries(directions)) {
    const { game, enemy, events } = createGame(hero);
    enemy.facing = side === 'front' ? -1 : 1;
    game.setMove(...input);
    assert.equal(targetSide(game.state.player, enemy), side);
    assert.equal(game.action('grab'), true);
    assert.equal(game.state.player.grapple.move.id, `${hero}_${side}_${direction}`);
    const clip = game.state.player.grapple.clip, hp = enemy.hp;
    advance(game, clip.duration * clip.impactAt - .06);
    assert.equal(enemy.hp, hp, 'grip and lift do not apply damage before contact marker');
    advance(game, .13);
    assert.equal(enemy.hp, hp - GRAB_MOVES[hero][side][direction].damage);
    advance(game, clip.duration + .1);
    assert.equal(events.filter(event => event.type === 'slam').length, 1);
    assert.equal(game.state.player.grapple, null);
    game.destroy();
  }
  assert.equal(directionForMove(.2, -.8), 'up');
  assert.equal(directionForMove(0, 0), 'down');
});

test('early counter expires, has real cooldown, and remains vulnerable to the later strike', () => {
  const { game, events } = createGame(); attackingEnemy(game);
  const hp = game.state.player.hp;
  assert.equal(game.action('counter'), true);
  assert.equal(game.state.player.invulnerable, 0);
  assert.equal(game.action('counter'), false);
  advance(game, .2);
  assert.equal(game.state.player.action, 'idle', 'failed guard returns to a usable stance');
  advance(game, .35);
  assert.ok(game.state.player.hp < hp);
  assert.equal(events.filter(event => event.type === 'counter').length, 0);
  assert.ok(events.some(event => event.type === 'counterMiss' && event.reason === 'early'));
  assert.ok(game.state.player.counterCooldown > 0);
  game.destroy();
});

test('a timely active-hit counter preserves HP and uses neutral slam or down arm lock', () => {
  for (const lock of [false, true]) {
    const { game, enemy, events } = createGame('nova'); attackingEnemy(game);
    advance(game, .37);
    game.setMove(0, lock ? 1 : 0);
    const hp = game.state.player.hp;
    assert.equal(game.action('counter'), true);
    advance(game, .15);
    assert.equal(game.state.player.hp, hp);
    assert.equal(game.state.player.action, 'counter');
    assert.equal(enemy.action, 'grabbed');
    assert.equal(enemy.attackHit, true);
    const expected = COUNTER_MOVES.nova[lock ? 'armLock' : 'slam'].id;
    assert.equal(game.state.player.grapple.move.id, expected);
    advance(game, 2.4);
    assert.equal(events.filter(event => event.type === 'counter').length, 1);
    assert.equal(events.filter(event => event.type === 'slam').length, 1);
    assert.equal(game.state.player.grapple, null);
    game.destroy();
  }
});

test('late counter cannot erase a landed strike or reset its damage', () => {
  const { game, events } = createGame(); attackingEnemy(game);
  const hp = game.state.player.hp;
  advance(game, .53);
  assert.ok(game.state.player.hp < hp);
  const after = game.state.player.hp;
  assert.equal(game.action('counter'), false);
  assert.equal(game.state.player.hp, after);
  assert.ok(events.some(event => event.type === 'counterMiss' && event.reason === 'late'));
  assert.equal(events.filter(event => event.type === 'counter').length, 0);
  game.destroy();
});

test('dense released taps keep a pending contact and reconnect through legal recovery windows', () => {
  const { game, events } = createGame();
  tap(game);
  for (let i = 0; i < 4; i++) { advance(game, .09); tap(game); }
  advance(game, 3.5);
  assert.deepEqual(events.filter(event => event.type === 'strike').map(event => event.move), ['jab', 'cross', 'lowKick', 'roundhouse']);
  assert.equal(events.filter(event => event.type === 'chain').length, 1);
  assert.equal(events.filter(event => event.type === 'hit' && COMBO_STEPS.some(move => move.id === event.kind)).length, 4);
  assert.equal(events.filter(event => event.type === 'slam').length, 1);
  game.destroy();
});

test('capture joins the actual victim position gradually and releases at the rendered final transform', () => {
  const { game, enemy } = createGame('nova');
  enemy.x = game.state.player.x + 38;
  enemy.y = game.state.player.y + .12;
  const start = { x: enemy.x, y: enemy.y };
  assert.equal(game.action('grab'), true);
  assert.equal(enemy.x, start.x); assert.equal(enemy.y, start.y);
  const first = game.grappleSample(game.state.player).victim;
  assert.equal(game.state.player.x + first.x * 128 * game.state.player.facing, start.x);
  assert.ok(Math.abs(game.state.player.y + first.laneOffset - start.y) < 1e-9);
  advance(game, .03);
  assert.ok(Math.abs(enemy.x - start.x) < 9, 'entry does not snap to the authored clinch offset');
  assert.ok(enemy.y > game.state.player.y, 'depth interpolates with horizontal contact');
  const clip = game.state.player.grapple.clip;
  advance(game, .19);
  assert.ok(Math.abs(enemy.y - game.state.player.y) < 1e-9);
  while (game.state.player.grapple) game.step(1 / 120);
  const final = sampleMotion(clip, clip.duration).victim;
  const expectedX = Math.max(30, Math.min(2350, game.state.player.x + final.x * 128 * game.state.player.facing));
  assert.ok(Math.abs(enemy.x - expectedX) < 1e-9);
  assert.ok(Math.abs(enemy.z - final.z) < 1e-9);
  assert.ok(Math.abs(Math.sin(enemy.releasedAngle) - Math.sin(final.angle * game.state.player.facing)) < 1e-9);
  assert.equal(enemy.releasedPose, final.pose);
  game.destroy();
});

test('a defeated grabbed victim releases on the floor and never enters the get-up AI', () => {
  const { game, enemy, events } = createGame();
  enemy.hp = 1;
  game.action('grab');
  while (game.state.player.grapple) game.step(1 / 120);
  assert.equal(enemy.hp, 0);
  assert.equal(enemy.action, 'dead');
  assert.ok(enemy.z < 0);
  assert.ok(Number.isFinite(enemy.releasedAngle));
  advance(game, 2);
  assert.equal(enemy.action, 'dead');
  assert.equal(enemy.hp, 0);
  assert.equal(events.filter(event => event.type === 'kill').length, 1);
  game.destroy();
});
