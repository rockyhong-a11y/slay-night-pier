import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WrestlingGame, RING_RULES } from '../src/wrestling-game.js';
import { GRAB_MOVES } from '../src/combat-moves.js';
import { sampleMotion } from '../src/game.js';

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const combat = json('public/assets/motion/combat.json');
const ring = json('public/assets/motion/ring.json');
const manifest = json('public/assets/sprites/manifest.json');
const make = (hero = 'atlas', ai = false, seed = 14) => {
  const events = [], game = new WrestlingGame({ ai, seed, onEvent: event => events.push(event) });
  game.motion = { clips: { ...combat.clips, ...ring.clips } }; game.manifest = manifest;
  game.ringMotion = ring;
  game.start(hero); return { game, events, p: game.state.player, o: game.state.opponent };
};
const advance = (game, seconds) => { while (seconds > .000001) { const dt = Math.min(seconds, 1 / 120); game.step(dt); seconds -= dt; } };
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);
const stageClose = (p, o) => { p.x = 165; o.x = 225; p.y = o.y = .54; p.facing = 1; o.facing = -1; };
const tap = game => { game.beginStrike(); game.endStrike(); };

test('one fixed-ring match starts exactly Atlas/Nova and never spawns stage enemies or tags', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, p, o } = make(hero);
    assert.equal(p.id, hero); assert.equal(o.id, hero === 'atlas' ? 'nova' : 'atlas');
    assert.deepEqual(game.state.enemies, [o]); assert.deepEqual(game.state.team, [p, o]);
    assert.equal(game.state.match.phase, 'wrestling'); assert.equal(game.action('tag'), false);
    game.setMove(1, 1); advance(game, 8);
    near(p.x, RING_RULES.right); near(p.y, RING_RULES.bottom); assert.equal(game.camera, 0);
    const travel = p.gaitTravel; advance(game, 1); near(p.gaitTravel, travel);
    assert.equal(game.state.kills, 0); assert.equal(game.state.status, 'playing');
    game.destroy();
  }
});

test('all playable paired poses exist in each actual hero bank, including sixteen opponent reaction mappings', () => {
  const { game } = make();
  assert.equal(game.validateCombatPoses(), true);
  assert.ok(ring.combatPoseMap.atlas.supine); assert.ok(ring.combatPoseMap.nova.prone);
  const original = JSON.stringify(combat.clips.atlas_front_down);
  const hero = game.state.player, victim = game.state.opponent;
  const resolved = game.resolveClip(combat.clips.atlas_front_down, hero, victim);
  for (const frame of resolved.frames) assert.ok(manifest.nova.combat.poses[frame.victim.pose], `real Nova reaction art ${frame.victim.pose}`);
  assert.equal(JSON.stringify(combat.clips.atlas_front_down), original, 'original source clip stays immutable');
  game.manifest = structuredClone(manifest); delete game.manifest.nova.combat.poses[resolved.frames.at(-1).victim.pose];
  assert.throws(() => game.validateCombatPoses(), /자세 .*없습니다/, 'missing reaction art must fail instead of drawing a punch fallback');
  game.destroy();
});

test('health floors at1; damage alone never wins, kills, changes roster, or automatically tags', () => {
  const { game, p, o, events } = make(); stageClose(p, o);
  game.damageEnemy(o, 5000, { down: true }); game.damagePlayer(5000, -1, o);
  assert.equal(p.hp, 1); assert.equal(o.hp, 1); assert.equal(game.state.status, 'playing');
  assert.equal(game.state.kills, 0); assert.equal(events.filter(event => event.type === 'kill' || event.type === 'gameover').length, 0);
  assert.equal(game.state.player, p); advance(game, 8); assert.ok(p.hp >= 1 && o.hp >= 1);
  game.destroy();
});

test('all sixteen directional grapples retain a single real contact and floor recovery inside ring bounds', () => {
  const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (const hero of ['atlas', 'nova']) for (const side of ['front', 'rear']) for (const [direction, input] of Object.entries(directions)) {
    const { game, p, o, events } = make(hero); stageClose(p, o); o.facing = side === 'front' ? -1 : 1;
    game.setMove(...input); assert.equal(game.action('grab'), true);
    const move = GRAB_MOVES[hero][side][direction], hp = o.hp, clip = p.grapple.clip;
    assert.equal(p.grapple.move.id, move.id);
    advance(game, clip.duration * clip.impactAt - .025); assert.equal(o.hp, hp);
    advance(game, .075); assert.equal(o.hp, hp - move.damage);
    while (p.grapple) game.step(1 / 120);
    assert.equal(o.action, 'down'); assert.equal(events.filter(event => event.type === 'slam').length, 1);
    assert.ok([p.x, o.x].every(x => x >= RING_RULES.left && x <= RING_RULES.right));
    assert.equal(game.action('grab'), false, 'lying opponent cannot be looped into standing grabs');
    advance(game, o.actionDuration + .8); assert.equal(o.action, 'idle'); assert.equal(game.state.status, 'playing');
    game.destroy();
  }
});

test('charge release creates a rear opening; four distinct strikes keep their connected combo throw', () => {
  let setup = make(); stageClose(setup.p, setup.o);
  setup.game.beginStrike(); advance(setup.game, .6); assert.equal(setup.o.hp, setup.o.maxHp);
  setup.game.endStrike(); advance(setup.game, .4); assert.equal(setup.o.action, 'rearStun');
  assert.equal(setup.o.facing, setup.p.facing); setup.game.destroy();
  setup = make('nova'); stageClose(setup.p, setup.o); tap(setup.game);
  advance(setup.game, .08); tap(setup.game); advance(setup.game, .25); tap(setup.game);
  advance(setup.game, .35); tap(setup.game); advance(setup.game, .35); tap(setup.game); advance(setup.game, 4);
  assert.deepEqual(setup.events.filter(event => event.type === 'strike').map(event => event.move), ['jab', 'cross', 'lowKick', 'roundhouse']);
  assert.equal(setup.events.filter(event => event.type === 'chain').length, 1);
  assert.ok(setup.events.find(event => event.type === 'chainReady').message.includes('연계 잡기'));
  assert.equal(setup.game.state.status, 'playing'); setup.game.destroy();
});

test('boundary throws translate both roots together and free-standing wrestlers cannot stay fully overlapped', () => {
  for (const [hero, x, targetX] of [['atlas', 290, 345], ['nova', 175, 230], ['nova', 290, 345]]) {
    const { game, p, o } = make(hero); p.x = x; o.x = targetX; p.y = o.y = .54; p.facing = o.facing = 1;
    game.setMove(1, 0); assert.equal(game.action('grab'), true); game.setMove(0, 0);
    const clip = p.grapple.clip, final = sampleMotion(clip, clip.duration);
    while (p.grapple) game.step(1 / 120);
    near(Math.abs(o.x - p.x), Math.abs(final.victim.x - final.hero.x) * 128, .02);
    assert.ok(p.x >= RING_RULES.left && o.x <= RING_RULES.right);
    advance(game, 10); assert.ok(Math.abs(o.x - p.x) >= 42.9, 'recovering actors keep readable separate silhouettes');
    p.x = o.x = 365; p.action = o.action = 'idle'; advance(game, 1);
    assert.ok(Math.abs(o.x - p.x) >= 42.9, 'standing edge overlap also resolves'); game.destroy();
  }
});

test('rope running bounces within the fixed ring, has a cooldown, and a timed running strike knocks down', () => {
  const { game, p, o, events } = make(); game.setMove(1, 0);
  assert.equal(game.action('run'), true); assert.equal(game.action('run'), false);
  advance(game, 1.05); assert.equal(p.run.rebounded, true); assert.equal(p.facing, -1);
  assert.equal(game.state.ropePulse.side, 'right'); assert.ok(game.getRingRender(p)?.transform, 'authored rebound is rendered');
  o.x = 250; o.y = p.y; game.beginStrike(); advance(game, .4);
  assert.ok(o.hp < o.maxHp); assert.equal(o.action, 'down');
  assert.equal(events.filter(event => event.type === 'ropeBounce').length, 1);
  assert.equal(events.filter(event => event.type === 'hit' && event.kind === 'runningClothesline').length, 1);
  game.destroy();
});

test('corner climb requires a corner; a perched dive uses authored travel, one impact, and lands at its target', () => {
  const { game, p, o, events } = make(); assert.equal(game.action('corner'), false);
  p.x = 70; p.y = .14; o.x = 235; o.y = .56;
  assert.equal(game.action('corner'), true); advance(game, .73);
  assert.equal(p.corner.phase, 'perched'); assert.ok(p.z >= .5);
  assert.equal(game.action('corner'), true); const clip = p.activeClip, hp = o.hp;
  advance(game, clip.duration * clip.impactAt - .025); assert.equal(o.hp, hp);
  advance(game, .075); assert.ok(o.hp < hp); assert.equal(o.action, 'down');
  advance(game, clip.duration); assert.equal(p.corner, null); near(p.z, 0);
  assert.equal(events.filter(event => event.type === 'hit' && event.kind === 'cornerDive').length, 1); game.destroy();
});

test('a healthy pin kicks out, a worn pin counts1/2/3, and rope contact cancels before a win', () => {
  const healthy = make(); stageClose(healthy.p, healthy.o); healthy.o.action = 'down'; healthy.o.actionDuration = 5;
  assert.equal(healthy.game.action('pin'), true); advance(healthy.game, 3);
  assert.equal(healthy.game.state.status, 'playing'); assert.equal(healthy.game.state.match.phase, 'wrestling');
  assert.ok(healthy.events.some(event => event.type === 'holdEscape')); healthy.game.destroy();
  const worn = make(); stageClose(worn.p, worn.o); worn.game.damageEnemy(worn.o, 110, { down: true });
  assert.equal(worn.game.action('pin'), true); advance(worn.game, 3);
  assert.equal(worn.game.state.status, 'victory'); assert.equal(worn.game.state.match.finishMethod, 'pin');
  assert.deepEqual(worn.events.filter(event => event.type === 'pinCount').map(event => event.count), [1, 2, 3]); worn.game.destroy();
  const rope = make(); stageClose(rope.p, rope.o); rope.o.action = 'down'; rope.o.x = 64; rope.p.x = 110;
  assert.equal(rope.game.action('pin'), true); assert.ok(rope.events.some(event => event.type === 'ropeBreak'));
  assert.equal(rope.game.state.status, 'playing'); assert.equal(rope.game.state.match.phase, 'wrestling'); rope.game.destroy();
});

test('holds use common Blender anchors, actual fighter roots, cached pose maps, and immutable motion frames', () => {
  const { game, p, o } = make('nova'); stageClose(p, o); game.damageEnemy(o, 110, { down: true });
  const original = JSON.stringify(ring.clips.pinEscape);
  assert.equal(game.action('submissionDown'), true); advance(game, .8);
  const hero = game.getRingRender(p), victim = game.getRingRender(o);
  assert.equal(hero.anchor, victim.anchor);
  near(p.x, hero.anchor.x + hero.transform.x * 128 * hero.anchor.facing);
  near(o.x, victim.anchor.x + victim.transform.x * 128 * victim.anchor.facing);
  assert.equal(victim.transform.facing, victim.anchor.facing * (victim.transform.relativeFacing ?? 1));
  assert.equal(game.state.context.canSubmission, true, 'holding control remains enabled until release');
  assert.equal(game.ringClip('pinEscape', p), game.ringClip('pinEscape', p), 'pose-map resolution is cached');
  game.action('submissionUp'); assert.ok(game.escapePresentation);
  const initial = game.getRingRender(o); near(o.x, initial.anchor.x + initial.transform.x * 128 * initial.anchor.facing);
  advance(game, .81); assert.equal(game.escapePresentation, null); assert.equal(p.action, 'idle');
  assert.equal(JSON.stringify(ring.clips.pinEscape), original); game.destroy();
});

test('submission requires maintained pressure, can be released, and can win by tapout without zero HP', () => {
  const { game, p, o } = make('nova'); stageClose(p, o); game.damageEnemy(o, 145, { down: true });
  assert.equal(game.action('submissionDown'), true); advance(game, .6); game.action('submissionUp');
  assert.equal(game.state.match.phase, 'wrestling'); assert.equal(game.state.status, 'playing');
  advance(game, 1.4); p.x = 170; o.x = 225; p.y = o.y = .54; o.action = 'down';
  assert.equal(game.action('submissionDown'), true); advance(game, 5);
  assert.equal(game.state.status, 'victory'); assert.equal(game.state.match.finishMethod, 'submission'); assert.ok(o.hp >= 1); game.destroy();
});

test('captured player strike/counter inputs resist at a capped cadence; spam is not an invulnerability toggle', () => {
  const { game, p, o } = make(); stageClose(p, o);
  assert.equal(game.withActor(o, p, () => game.capture(p, GRAB_MOVES.nova.front.up)), true);
  assert.equal(game.state.player, p); assert.equal(p.action, 'grabbed');
  assert.equal(game.beginStrike(), true); const first = p.escapeProgress;
  for (let i = 0; i < 50; i++) game.action('counter'); near(p.escapeProgress, first);
  for (let i = 0; i < 10 && p.action === 'grabbed'; i++) { advance(game, .10); game.beginStrike(); }
  assert.equal(o.grapple, null); assert.equal(p.hp, p.maxHp, 'early resistance cancels before impact damage');
  assert.equal(game.action('escape'), false, 'escape outside a capture has no effect'); game.destroy();
});

test('timely counters reverse actual AI-contact attacks; early guard expires and does not erase damage', () => {
  for (const timely of [false, true]) {
    const { game, p, o, events } = make(); stageClose(p, o);
    game.withActor(o, p, () => game.startStrike('jab', COMBO_STEPS_FOR_TEST));
    const contact = o.strikeDelay + o.actionDuration * o.activeClip.contactAt;
    if (timely) advance(game, contact - .08);
    assert.equal(game.action('counter'), true); const hp = p.hp;
    advance(game, timely ? .12 : contact + .3);
    if (timely) { assert.equal(p.hp, hp); assert.equal(p.grapple?.type, 'counter'); assert.equal(o.action, 'grabbed'); }
    else { assert.ok(p.hp < hp); assert.ok(events.some(event => event.type === 'counterMiss')); }
    game.destroy();
  }
});
const COMBO_STEPS_FOR_TEST = { id: 'jab', name: '잽', damage: 8, range: 91 };

test('finisher needs100 meter and a standing target, consumes all meter, and damages once without finishing by HP', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, p, o, events } = make(hero); stageClose(p, o);
    assert.equal(game.action('finisher'), false); p.meter = 100;
    assert.equal(game.action('finisher'), true); assert.equal(p.meter, 0);
    const clip = p.grapple.clip, hp = o.hp;
    advance(game, clip.duration * clip.impactAt - .025); assert.equal(o.hp, hp);
    advance(game, .075); assert.equal(o.hp, hp - 63); assert.equal(p.meter, 0);
    assert.equal(events.filter(event => event.type === 'hit' && event.kind === 'finisher').length, 1);
    assert.equal(game.state.status, 'playing'); game.destroy();
  }
});

test('pause freezes match/holds and escape input; release/cancel cannot leave charged attacks stuck', () => {
  const { game, p, o } = make(); stageClose(p, o);
  game.beginStrike(); advance(game, .3); game.pause(true); const time = game.state.time;
  advance(game, 2); assert.equal(game.state.time, time); assert.equal(p.strikeHeld, false);
  game.endStrike(); game.pause(false); advance(game, .2); assert.equal(p.action, 'idle');
  game.damageEnemy(o, 110, { down: true }); assert.equal(game.action('pin'), true);
  game.pause(); const elapsed = game.state.match.elapsed, escape = game.state.match.escapeProgress;
  advance(game, 3); game.action('escape'); game.beginStrike();
  assert.equal(game.state.match.elapsed, elapsed); assert.equal(game.state.match.escapeProgress, escape); game.destroy();
});

test('both complete matches clear with actual movement/combat/pin input, real health and active fair AI', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, events } = make(hero, true, 821);
    for (let step = 0; step < 120 * 150 && game.state.status === 'playing'; step++) {
      const p = game.state.player, o = game.state.opponent;
      if (game.captured()) { game.setMove(0, 0); if (step % 13 === 0) game.action('escape'); }
      else if (game.state.match.phase === 'wrestling') {
        const dx = o.x - p.x, dy = o.y - p.y;
        if (game.nearRopes(o) && !p.grapple) {
          // A rope-side cover is illegal. Retreat through normal movement so
          // the opponent gets up and follows back toward the middle of the mat.
          game.setMove(Math.abs(210 - p.x) > 8 ? Math.sign(210 - p.x) : 0, Math.abs(.54 - p.y) > .04 ? Math.sign(.54 - p.y) : 0);
          game.step(1 / 120); continue;
        }
        game.setMove(Math.abs(dx) > 57 ? Math.sign(dx) : 0, Math.abs(dy) > .045 ? Math.sign(dy) : 0);
        if (game.state.context.canPin) game.action('pin');
        else if (game.state.context.canFinisher) game.action('finisher');
        else if (step % 20 === 0) {
          if (game.state.grabContext.ready) { game.setMove(0, 0); game.action('grab'); }
          else if (['idle', 'walk', 'charge'].includes(p.action) && distanceForTest(p, o) < 110) tap(game);
        }
      }
      game.step(1 / 120);
    }
    assert.equal(game.state.status, 'victory', `${hero} finishes a fair match`);
    assert.equal(game.state.match.finishMethod, 'pin'); assert.equal(game.state.match.count, 3);
    assert.ok(game.state.player.hp >= 1 && game.state.opponent.hp >= 1);
    assert.ok(events.some(event => event.type === 'telegraph'), 'opponent actively attempted attacks under normal AI');
    assert.ok(events.some(event => event.type === 'slam')); assert.equal(game.state.enemies.length, 1);
    game.destroy();
  }
});

test('normal active AI lands real contact and applies legal holds against a waiting player', () => {
  for (const hero of ['atlas', 'nova']) {
    const { game, events, p } = make(hero, true, 821);
    // Ordinary player inactivity, with no position/HP/meter/AI-state fixture.
    advance(game, 20);
    assert.ok(p.hp < p.maxHp, `${hero}: AI damage actually reached the player`);
    assert.ok(events.some(event => event.type === 'hurt'));
    assert.ok(events.some(event => event.type === 'pinStart' || event.type === 'submissionStart'), 'opponent attempts a real finishing hold');
    assert.ok(p.hp >= 1); assert.equal(game.state.kills, 0);
    if (game.state.status === 'defeat') assert.ok(['pin', 'submission'].includes(game.state.match.finishMethod));
    game.destroy();
  }
});
const distanceForTest = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 280);
