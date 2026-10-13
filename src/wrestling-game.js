import { Game, sampleMotion, targetSide } from './game.js';
import { GRAB_MOVES, COMBO_STEPS, COUNTER_MOVES, COMBAT_RULES, directionForMove } from './combat-moves.js';
import { drawRingScene, ringFloorY } from './ring-scene.js';

const BASE = import.meta.env?.BASE_URL ?? './';
const assetUrl = (path, version) => `${BASE}${path.replace(/^\/+/, '')}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const standing = actor => ['idle', 'walk', 'charge', 'guard', 'strike', 'hurt', 'rearStun', 'run', 'grappleWindup', 'finisherWindup'].includes(actor.action);
const free = actor => ['idle', 'walk', 'charge'].includes(actor.action);
const grounded = actor => actor.action === 'down';
const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 280);
const inReach = (a, b, reach = 95) => distance(a, b) < reach && Math.abs(a.y - b.y) < .23;
const unit = (x, y) => { const n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; };
const blankMatch = () => ({ phase: 'wrestling', type: null, attacker: null, defender: null, count: 0,
  progress: 0, escapeProgress: 0, elapsed: 0, winner: null, finishMethod: null });
export const RING_RULES = Object.freeze({ left: 55, right: 365, top: .10, bottom: .94,
  viewWidth: 420, pinInterval: .92, escapeTapInterval: .095, runSpeed: 218,
  runCooldown: 1.6, holdCooldown: 1.2, cornerClimb: .72 });

/** One-fall wrestling: health changes recovery, never directly decides the match. */
export class WrestlingGame extends Game {
  constructor(options = {}) {
    super(options);
    this.aiEnabled = options.ai !== false;
    this.controlledId = this.state.player.id;
    this.aiMove = { x: 0, y: 0 };
    this.aiBuffer = [];
    this.ringMotion = { clips: {} };
    this.resolvedClips = new WeakMap();
    this.escapePresentation = null;
  }

  makeState(status, heroId) {
    const state = super.makeState(status, heroId === 'nova' ? 'nova' : 'atlas');
    const player = state.player, opponent = state.team.find(actor => actor !== player);
    for (const actor of [player, opponent]) Object.assign(actor, { stamina: 100, maxStamina: 100,
      fatigue: 0, downDuration: 1.8, lastDamageAt: -10, grappleCooldown: 0, holdCooldown: 0,
      runCooldown: 0, cornerCooldown: 0, run: null, corner: null, escapeProgress: 0,
      escapeLastAt: -10, submissionHeld: false, captureEscape: 0, getupProtectionUntil: -10,
      repeatMove: null, repeatAt: -10, repeatCount: 0, aiDecision: 0, aiPlanCorner: false });
    player.x = 145; opponent.x = 275; player.y = opponent.y = .54;
    player.facing = 1; opponent.facing = -1;
    Object.assign(state, { player, opponent, team: [player, opponent], enemies: [opponent],
      boss: null, phase: 'wrestling', match: blankMatch(), stageName: 'RING NIGHT',
      objective: '핀폴 3카운트 또는 서브미션으로 승리하세요.',
      totalEnemies: 1, aliveEnemies: 1, encountered: 1, kills: 0, wave: 1,
      pinCount: 0, escapeProgress: 0, currentMove: null, ropePulse: null, context: {} });
    return state;
  }

  async load() {
    if (!this.canvas) { this.loaded = true; return this; }
    const paths = ['/assets/sprites/manifest.json', '/assets/motion/combat.json',
      '/assets/motion/strike-contacts.json', '/assets/motion/ring.json'];
    const responses = await Promise.all(paths.map(path => fetch(assetUrl(path), { cache: 'no-cache' })));
    if (responses.some(response => !response.ok)) throw new Error('링 매치 캐릭터와 Blender 모션을 불러오지 못했습니다.');
    const [manifest, combat, contacts, ring] = await Promise.all(responses.map(response => response.json()));
    const required = ['ropeRebound', 'runningClothesline', 'pinEscape', 'submissionEscape',
      ...['atlas', 'nova'].flatMap(id => ['cornerDive', 'cover', 'submission', 'finisher'].map(type => `${id}_${type}`))];
    if (required.some(id => !ring.clips?.[id]?.frames?.length)) throw new Error('필수 링 매치 Blender 모션이 없습니다.');
    this.manifest = manifest; this.strikeContacts = contacts; this.ringMotion = ring;
    this.motion = { ...combat, clips: { ...combat.clips, ...ring.clips } };
    this.validateCombatPoses();
    await Promise.all(['atlas', 'nova'].map(async id => {
      const metadata = manifest[id];
      if (!metadata?.combat?.poses || !metadata.walk?.frames?.length) throw new Error(`${id} 전신 스프라이트가 없습니다.`);
      const [combatImage, walk] = await Promise.all([image(assetUrl(metadata.combat.image, metadata.combat.imageVersion)),
        image(assetUrl(metadata.walk.image, metadata.walk.imageVersion))]);
      this.sprites.set(id, { combat: combatImage, walk, metadata });
    }));
    this.loaded = true; this.render(); return this;
  }

  start(heroId = 'atlas') {
    // Base reset/audio/loop behavior stays intact; spawnWave is a match setup hook.
    super.start(heroId);
    this.controlledId = this.state.player.id;
    this.aiMove = { x: 0, y: 0 }; this.aiBuffer = [];
    this.controlledBuffer = this.inputBuffer; this.escapePresentation = null;
    this.ringCameraScale = 1; this.ringCameraTime = 0;
    this.state.opponent.cooldown = .85;
    this.refreshContext(); this.audio.sfx('bell');
    this.event('matchStart', { hero: this.state.player.id, opponent: this.state.opponent.id });
    this.publish(true);
  }

  spawnWave() { /* A singles match has exactly one persistent opponent. */ }
  clearWave() { /* Health and stage gates cannot end a wrestling match. */ }
  tag() { return false; }
  floorY(lane) { return ringFloorY(this.height, lane); }
  worldX(x) { return x * this.width / RING_RULES.viewWidth; }
  render() { drawRingScene(this); }

  /** Reuse paired combat methods for either wrestler without changing control ownership. */
  withActor(actor, target, callback) {
    const state = this.state, player = state.player, enemies = state.enemies, move = this.move, buffer = this.inputBuffer;
    if (player.id === this.controlledId) this.controlledBuffer = buffer;
    state.player = actor; state.enemies = [target];
    const ai = actor.id !== this.controlledId;
    if (ai) { this.move = this.aiMove; this.inputBuffer = this.aiBuffer; }
    else if (player !== actor) this.inputBuffer = this.controlledBuffer || [];
    try { return callback(); }
    finally {
      if (ai) this.aiBuffer = this.inputBuffer;
      else this.controlledBuffer = this.inputBuffer;
      state.player = player; state.enemies = enemies; this.move = move;
      this.inputBuffer = player.id === this.controlledId ? this.controlledBuffer : buffer;
    }
  }

  opponentOf(actor) { return this.state.team.find(other => other !== actor); }
  captured(actor = this.state.player) {
    const match = this.state.match;
    return (['pin', 'submission'].includes(match.phase) && match.defender === actor)
      || this.opponentOf(actor)?.grapple?.target === actor;
  }
  nearRopes(actor) {
    return actor.x <= RING_RULES.left + 13 || actor.x >= RING_RULES.right - 13
      || actor.y <= RING_RULES.top + .045 || actor.y >= RING_RULES.bottom - .045;
  }
  nearestCorner(actor) {
    return [{ x: 65, y: .13 }, { x: 355, y: .13 }, { x: 65, y: .91 }, { x: 355, y: .91 }]
      .sort((a, b) => distance(a, actor) - distance(b, actor))[0];
  }

  beginStrike() {
    if (this.captured()) return this.escape();
    if (this.state.match.phase !== 'wrestling') return false;
    const p = this.state.player;
    if (p.corner?.phase === 'perched') return this.startDive(p);
    if (p.run && p.action === 'run') return this.runningStrike(p);
    return super.beginStrike();
  }
  endStrike() { if (this.captured()) return false; return super.endStrike(); }
  cancelStrike() { super.cancelStrike(); if (this.state.player) this.state.player.submissionHeld = false; }

  pause(paused = true) { super.pause(paused); }

  action(action) {
    if (action === 'strikeUp') return this.endStrike();
    if (action === 'submissionUp') {
      this.state.player.submissionHeld = false;
      if (this.state.status === 'playing' && this.state.match.phase === 'submission' && this.state.match.attacker === this.state.player) this.releaseHold('released');
      return true;
    }
    if (this.state.status !== 'playing') return false;
    if (['escape', 'counter', 'strikeDown', 'strike', 'attack'].includes(action) && this.captured()) return this.escape();
    if (action === 'escape') return false;
    const p = this.state.player;
    if (action === 'submissionDown' && this.state.match.phase === 'submission' && this.state.match.attacker === p) {
      p.submissionHeld = true; return true;
    }
    if (this.state.match.phase !== 'wrestling') return false;
    if (action === 'run') return this.startRun(p, this.move);
    if (action === 'corner') return p.corner?.phase === 'perched' ? this.startDive(p) : this.startCorner(p);
    if (action === 'pin') return this.startHold(p, 'pin');
    if (action === 'submission' || action === 'submissionDown') return this.startHold(p, 'submission');
    if (action === 'finisher') return this.finisher(p);
    if (action === 'strikeDown') return this.beginStrike();
    if ((action === 'strike' || action === 'attack') && p.run && p.action === 'run') return this.runningStrike(p);
    if (action === 'counter' && p.run) { p.run = null; p.action = 'idle'; }
    if (action === 'grab' && !standing(this.state.opponent)) return this.unavailable('grab', '상대가 서 있을 때 잡을 수 있습니다.');
    return super.action(action);
  }

  unavailable(action, message) { this.event('outOfRange', { action, message }); return false; }

  startStrike(id, move) {
    const actor = this.state.player;
    if (actor.stamina < 3) { this.inputBuffer.length = 0; actor.action = 'idle'; return false; }
    actor.stamina = Math.max(0, actor.stamina - (move.charged ? 8 : 3));
    super.startStrike(id, move);
    actor.strikeDelay = actor.id === this.controlledId ? 0 : .24;
    if (actor.strikeDelay) this.event('telegraph', { enemy: actor.id, action: 'strike', contactIn: actor.strikeDelay + actor.actionDuration * actor.activeClip.contactAt });
    return true;
  }

  capture(target, move, type = 'grapple') {
    const actor = this.state.player;
    if (!standing(target) || target.action === 'grabbed' || this.state.time < target.getupProtectionUntil) return false;
    if (type !== 'counter' && (actor.grappleCooldown > 0 || actor.stamina < 12)) return this.unavailable('grab', '잠시 숨을 고른 뒤 잡기');
    actor.run = null; actor.corner = null;
    if (type !== 'counter') actor.stamina = Math.max(0, actor.stamina - 12);
    const success = super.capture(target, move, type);
    if (success) {
      actor.grapple.clip = this.resolveClip(actor.grapple.clip, actor, target);
      actor.activeClip = actor.grapple.clip;
      target.gaitMoving = false; target.captureEscape = target.escapeProgress = 0;
      target.strikeDelay = 0;
      target.escapeLastAt = -10;
      actor.grapple.escapeRate = (.82 + this.random() * .68) * (type === 'finisher' ? .70 : 1);
      actor.chargeTime = actor.chargeAmount = actor.chargeRatio = 0;
      this.state.currentMove = this.state.lastMove;
    }
    return success;
  }

  resolveClip(clip, hero, victim = this.opponentOf(hero)) {
    if (!clip?.frames) return clip;
    const victimMap = this.ringMotion?.combatPoseMap?.[victim.id];
    if (!clip.actorPoseMap && !victimMap) return clip;
    this.resolvedClips ||= new WeakMap();
    let cache = this.resolvedClips.get(clip);
    if (!cache) { cache = new Map(); this.resolvedClips.set(clip, cache); }
    const key = `${hero.id}/${victim.id}`;
    if (cache.has(key)) return cache.get(key);
    const resolved = { ...clip, frames: clip.frames.map(frame => {
      const mapped = { ...frame };
      for (const [role, actor] of [['hero', hero], ['victim', victim]]) {
        const pose = clip.actorPoseMap?.[role]?.[frame[role]?.pose]?.[actor.id]
          ?? (role === 'victim' ? victimMap?.[frame[role]?.pose] : null);
        mapped[role] = { ...frame[role], ...(pose ? { pose } : {}) };
      }
      return mapped;
    }) };
    cache.set(key, resolved); return resolved;
  }

  ringClip(id, hero) { return this.resolveClip(this.motion.clips[id], hero); }

  validateCombatPoses() {
    for (const hero of this.state.team) {
      const victim = this.opponentOf(hero);
      const ids = ['jab', 'cross', 'lowKick', 'roundhouse', 'chargeStrike', `${hero.id}_chain`,
        ...Object.values(GRAB_MOVES[hero.id]).flatMap(directions => Object.values(directions).map(move => move.clip)),
        ...Object.values(COUNTER_MOVES[hero.id]).map(move => move.clip),
        'ropeRebound', 'runningClothesline', 'pinEscape', 'submissionEscape',
        ...['cornerDive', 'cover', 'submission', 'finisher'].map(type => `${hero.id}_${type}`)];
      for (const id of ids) {
        const clip = this.resolveClip(this.motion.clips[id], hero, victim);
        if (!clip?.frames?.length) throw new Error(`${id} 필수 모션이 없습니다.`);
        for (const frame of clip.frames) for (const [role, actor] of [['hero', hero], ['victim', victim]]) {
          const pose = frame[role]?.pose;
          if (!this.manifest[actor.id]?.combat?.poses?.[pose]) throw new Error(`${id}: ${actor.id} ${role} 자세 '${pose}'가 없습니다.`);
        }
      }
    }
    return true;
  }

  grappleSample(actor) {
    const grapple = actor.grapple;
    const sample = sampleMotion(grapple.clip, actor.actionTime) || {
      hero: { x: 0, z: 0, angle: 0, pose: 'clinch', relativeFacing: 1 },
      victim: { x: .56, z: 0, angle: 0, pose: 'hurt', relativeFacing: -1 },
    };
    const t = clamp(actor.actionTime / grapple.entryDuration, 0, 1), ease = t * t * (3 - 2 * t);
    for (const key of ['x', 'z', 'angle']) {
      sample.hero[key] *= ease;
      sample.victim[key] = lerp(grapple.entry[key], sample.victim[key], ease);
    }
    sample.hero.facing = actor.facing * (sample.hero.relativeFacing ?? 1);
    sample.victim.facing = t < .5 ? grapple.entry.facing : actor.facing * (sample.victim.relativeFacing ?? 1);
    sample.victim.laneOffset = clamp(actor.y + grapple.entry.lane * (1 - ease), RING_RULES.top, RING_RULES.bottom) - actor.y;
    const previousX = sample.hero.x;
    this.constrainPair(sample, actor);
    if (sample.impactAnchor) sample.impactAnchor.x += sample.hero.x - previousX;
    return sample;
  }

  updateGrapple(actor) {
    const grapple = actor.grapple, target = grapple.target;
    if (!grapple.impacted && target.id !== this.controlledId && this.aiEnabled) {
      const resilience = this.resilience(target);
      target.captureEscape += (this.currentDt || 0) * grapple.escapeRate * resilience;
      target.escapeProgress = target.captureEscape;
      if (target.captureEscape >= 1) { this.breakGrapple(actor, 'escape'); return; }
    }
    super.updateGrapple(actor);
    if (!actor.grapple) {
      actor.grappleCooldown = Math.max(actor.grappleCooldown, .85);
      target.action = 'down'; target.actionDuration = target.downDuration;
      target.invulnerable = Math.max(target.invulnerable, .12);
      target.captureEscape = target.escapeProgress = 0;
    }
  }

  resolveStrike(actor) {
    const target = this.opponentOf(actor), move = actor.activeMove;
    if (!move || target.action === 'grabbed' || !inReach(actor, target, move.range || 129) || (target.x - actor.x) * actor.facing < -28) {
      actor.chainHits = 0; actor.chainTarget = null; return;
    }
    const charged = Boolean(move.charged);
    const landed = this.damageEnemy(target, move.damage + (actor.id === 'atlas' && !charged ? 1 : 0), {
      knockback: actor.facing * (charged ? 120 : move.id === 'roundhouse' ? 40 : 16),
      down: move.running, kind: charged ? 'chargeStrike' : move.id,
      hurtDuration: charged ? COMBAT_RULES.rearDuration : .32, impactPoint: this.strikePoint(actor),
    });
    if (!landed) return;
    if (charged) {
      target.turnFromFacing = target.facing; target.facing = actor.facing;
      target.facingLocked = COMBAT_RULES.rearDuration; target.rearUntil = this.state.time + COMBAT_RULES.rearDuration;
      target.action = 'rearStun'; target.actionTime = 0; target.actionDuration = COMBAT_RULES.rearDuration;
      this.event('rearOpening', { enemy: target.id, duration: COMBAT_RULES.rearDuration, message: '상대의 등 뒤에서 잡기' });
    } else if (!move.running) {
      actor.chainHits = actor.chainTarget === target || !actor.chainTarget ? actor.chainHits + 1 : 1;
      actor.chainTarget = target;
      if (actor.chainHits >= 4) this.event('chainReady', { enemy: target.id, message: '연계 완성 · 한 번 더 공격하면 연계 잡기' });
    }
    this.audio.sfx(charged ? 'launcher' : move.running || move.id.includes('Kick') || move.id === 'roundhouse' ? 'kick' : 'punch');
  }

  resilience(actor) { return clamp(.20 + actor.hp / actor.maxHp * .8 - actor.fatigue / 240, .12, 1); }

  parry(defender, attacker) {
    if (!attacker || defender.action !== 'guard' || defender.counterResolved || this.state.time > defender.guardUntil + .00001
      || !inReach(defender, attacker, 132)) return false;
    defender.counterResolved = true;
    const move = COUNTER_MOVES[defender.id][defender.counterLockIntent ? 'armLock' : 'slam'];
    const success = this.withActor(defender, attacker, () => this.capture(attacker, move, 'counter'));
    if (success) {
      attacker.attackHit = true;
      this.impact(attacker.x, attacker.y, 'guard', { direction: defender.facing });
    }
    return success;
  }

  damageEnemy(target, amount, options = {}) {
    return this.damageFighter(target, amount, this.state.player, options);
  }
  damagePlayer(amount, direction = 1, attacker = this.state.opponent) {
    return this.damageFighter(this.state.player, amount, attacker, { knockback: direction * 100 });
  }
  damageFighter(target, amount, attacker, { knockback = 0, down = false, kind = 'strike', keepGrabbed = false,
    hurtDuration = .32, impactPoint } = {}) {
    if ((target.action === 'grabbed' && !keepGrabbed) || (!keepGrabbed && target.invulnerable > 0)) return false;
    if (!keepGrabbed && this.parry(target, attacker)) return false;
    const wasDown = grounded(target), previousDuration = target.actionDuration, previousTime = target.actionTime;
    const damage = Math.max(1, Math.round(amount));
    target.hp = Math.max(1, target.hp - damage);
    target.fatigue = clamp(target.fatigue + damage * .53 + (kind === 'finisher' ? 18 : 0), 0, 100);
    target.lastDamageAt = this.state.time;
    target.downDuration = clamp(1.8 + (1 - target.hp / target.maxHp) * 2.7 + target.fatigue * .016 + (kind === 'finisher' ? 1.2 : 0), 1.8, 7);
    target.vx = knockback; target.actionTime = 0;
    target.actionDuration = down ? target.downDuration : hurtDuration;
    if (!keepGrabbed) {
      target.action = down || wasDown ? 'down' : 'hurt';
      if (wasDown && !down) { target.actionDuration = previousDuration; target.actionTime = previousTime; }
      target.invulnerable = .10;
      target.strikeHeld = false; target.chargeReady = false; target.chargeTime = target.chargeRatio = target.chargeAmount = 0;
      target.run = null; target.corner = null; target.comboStep = target.chainHits = 0; target.chainTarget = null;
      target.strikeDelay = 0;
      if (target.id === this.controlledId) { this.controlledBuffer = []; if (this.state.player.id === this.controlledId) this.inputBuffer = []; }
      else this.aiBuffer = [];
      if (down && !target.releasedPose) { target.releasedPose = this.floorPose(target); target.releasedAngle = 0; target.z = 0; }
    }
    attacker.meter = kind === 'finisher' ? attacker.meter : clamp(attacker.meter + (down ? 11 : 7), 0, 100);
    target.meter = clamp(target.meter + 3, 0, 100);
    if (attacker.id === this.controlledId) {
      this.state.score += damage * 10; this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo); this.lastHitTime = this.state.time;
    }
    if (!keepGrabbed && impactPoint !== false) this.impact(impactPoint?.x ?? target.x, impactPoint?.y ?? target.y,
      down || kind === 'chargeStrike' ? 'heavy' : 'light', { direction: attacker.facing, height: impactPoint?.height ?? .49 });
    this.event(target.id === this.controlledId ? 'hurt' : 'hit', { hero: attacker.id, enemy: target.id, damage, hp: target.hp, kind, combo: this.state.combo });
    return true;
  }

  floorPose(actor) { return actor.id === 'atlas' ? 'ddtFall' : 'verticalRelease'; }

  startRun(actor, direction) {
    if (!free(actor) || actor.runCooldown > 0 || actor.stamina < 20) return this.unavailable('run', '숨을 고르고 서 있는 상태에서 달리기');
    const vector = Math.hypot(direction.x, direction.y) > .2 ? unit(direction.x, direction.y) : { x: actor.facing, y: 0 };
    actor.run = { dx: vector.x, dy: vector.y, rebounded: false, bounces: 0, remaining: 2.7, reboundAt: -10 };
    actor.stamina -= 20; actor.runCooldown = RING_RULES.runCooldown;
    actor.action = 'run'; actor.actionTime = 0; actor.strikeHeld = false;
    actor.chargeReady = false; actor.chargeTime = actor.chargeAmount = actor.chargeRatio = 0;
    this.event('run', { hero: actor.id, direction: vector }); return true;
  }

  runningStrike(actor) {
    if (!actor.run || actor.action !== 'run') return false;
    const clip = this.ringClip('runningClothesline', actor) || this.motion.clips.roundhouse || { duration: .62, contactAt: .45, recoveryAt: .82 };
    actor.action = 'strike'; actor.actionTime = 0; actor.actionDuration = clip.duration;
    actor.activeClip = clip; actor.activeMove = { id: 'runningClothesline', name: '러닝 클로스라인', damage: actor.run.rebounded ? 31 : 24, range: 109, running: true };
    actor.attackHit = false; actor.comboStep = actor.chainHits = 0; actor.chainTarget = null;
    this.state.lastMove = this.state.currentMove = { ...actor.activeMove, type: 'running' };
    this.audio.sfx('swing'); this.event('runningAttack', { hero: actor.id, rebounded: actor.run.rebounded }); return true;
  }

  updateRun(actor, dt) {
    const run = actor.run;
    const x = actor.x, y = actor.y, laneScale = (this.floorY(1) - this.floorY(0)) / (this.width / 420);
    actor.x += run.dx * RING_RULES.runSpeed * dt; actor.y += run.dy * RING_RULES.runSpeed / laneScale * dt;
    let side = null;
    if (actor.x < RING_RULES.left || actor.x > RING_RULES.right) { side = actor.x < RING_RULES.left ? 'left' : 'right'; run.dx *= -1; }
    if (actor.y < RING_RULES.top || actor.y > RING_RULES.bottom) { side = actor.y < RING_RULES.top ? 'top' : 'bottom'; run.dy *= -1; }
    actor.x = clamp(actor.x, RING_RULES.left, RING_RULES.right); actor.y = clamp(actor.y, RING_RULES.top, RING_RULES.bottom);
    if (Math.abs(run.dx) > .1) actor.facing = Math.sign(run.dx);
    if (side) {
      run.rebounded = true; run.bounces++; run.reboundAt = this.state.time;
      this.state.ropePulse = { side, at: this.state.time }; this.audio.sfx('rope');
      this.event('ropeBounce', { hero: actor.id, side });
    }
    run.remaining -= dt; this.updateWalking(actor, actor.x - x, actor.y - y, dt);
    if (actor.action === 'strike') {
      actor.actionTime += dt;
      if (!actor.attackHit && actor.actionTime >= actor.actionDuration * (actor.activeClip?.contactAt ?? .4)) {
        actor.attackHit = true; this.withActor(actor, this.opponentOf(actor), () => this.resolveStrike(actor));
      }
      if (actor.action === 'strike' && actor.actionTime >= actor.actionDuration) { actor.run = null; actor.action = 'idle'; actor.activeClip = null; }
    } else if (run.remaining <= 0 || run.bounces >= 2) { actor.run = null; actor.action = 'idle'; }
  }

  startCorner(actor) {
    const corner = this.nearestCorner(actor);
    if (!free(actor) || distance(actor, corner) > 49 || actor.cornerCooldown > 0 || actor.stamina < 18) return this.unavailable('corner', '코너 가까이에서 서서 사용하세요.');
    actor.corner = { x: corner.x, y: corner.y, phase: 'climb', elapsed: 0, target: this.opponentOf(actor), startX: actor.x, startY: actor.y };
    actor.action = 'corner'; actor.actionTime = 0; actor.stamina -= 18;
    actor.vx = 0; actor.strikeHeld = false; this.inputBuffer = [];
    actor.chargeReady = false; actor.chargeTime = actor.chargeAmount = actor.chargeRatio = 0;
    this.state.lastMove = this.state.currentMove = { id: 'corner', name: '코너 오르기', type: 'corner' };
    this.event('cornerClimb', { hero: actor.id }); return true;
  }

  startDive(actor) {
    if (actor.corner?.phase !== 'perched') return false;
    const target = this.opponentOf(actor), clip = this.ringClip(`${actor.id}_cornerDive`, actor);
    actor.corner.phase = 'dive'; actor.corner.elapsed = 0;
    actor.corner.startX = actor.x; actor.corner.startY = actor.y;
    actor.corner.landX = clamp(target.x, RING_RULES.left + 15, RING_RULES.right - 15); actor.corner.landY = target.y;
    actor.action = 'cornerDive'; actor.actionTime = 0; actor.actionDuration = clip?.duration ?? 1.18;
    actor.activeClip = clip; actor.attackHit = false;
    actor.facing = target.x >= actor.x ? 1 : -1;
    this.state.lastMove = this.state.currentMove = { id: `${actor.id}_cornerDive`, name: '코너 다이빙 어택', type: 'dive' };
    this.event('divingAttack', { hero: actor.id }); return true;
  }

  updateCorner(actor, dt) {
    const corner = actor.corner; corner.elapsed += dt; actor.actionTime += dt;
    if (corner.phase === 'climb') {
      const t = clamp(corner.elapsed / RING_RULES.cornerClimb, 0, 1);
      const height = this.motion.clips[`${actor.id}_cornerDive`]?.travel?.cornerHeight ?? .50;
      actor.x = lerp(corner.startX, corner.x, t); actor.y = lerp(corner.startY, corner.y, t); actor.z = height * t;
      if (t === 1) { corner.phase = 'perched'; corner.elapsed = 0; actor.actionTime = 0; this.event('cornerReady', { hero: actor.id }); }
    } else if (corner.phase === 'perched') {
      if (actor.id !== this.controlledId && corner.elapsed >= .32) this.startDive(actor);
    } else {
      const clip = actor.activeClip, contact = (clip?.impactAt ?? .66) * actor.actionDuration;
      const t = clamp(actor.actionTime / contact, 0, 1), ease = t * t * (3 - 2 * t);
      actor.x = lerp(corner.startX, corner.landX, ease); actor.y = lerp(corner.startY, corner.landY, ease);
      const sampled = sampleMotion(clip, actor.actionTime);
      const travel = this.travelProgress(clip, actor.actionTime) ?? ease;
      actor.x = lerp(corner.startX, corner.landX, travel); actor.y = lerp(corner.startY, corner.landY, travel);
      actor.z = sampled?.hero.z ?? Math.sin(Math.PI * t) * .85;
      if (!actor.attackHit && actor.actionTime >= contact) {
        actor.attackHit = true;
        const target = this.opponentOf(actor);
        if (inReach(actor, target, 105)) this.damageFighter(target, 42, actor, { down: true, kind: 'cornerDive' });
        else { actor.hp = Math.max(1, actor.hp - 9); actor.fatigue = Math.min(100, actor.fatigue + 8); this.event('diveMiss', { hero: actor.id }); }
        this.impact(actor.x, actor.y, 'ground', { ground: true, direction: actor.facing }); this.audio.sfx('slam');
      }
      if (actor.corner && actor.actionTime >= actor.actionDuration) {
        actor.corner = null; actor.z = 0; actor.action = 'idle'; actor.activeClip = null; actor.cornerCooldown = 2.2;
      }
    }
    this.updateWalking(actor, 0, 0, dt);
  }

  finisher(actor) {
    const target = this.opponentOf(actor);
    if (actor.meter < 100 || !free(actor) || !standing(target) || !inReach(actor, target, 99)) return this.unavailable('finisher', '피니셔는 게이지 100 · 서 있는 상대 가까이에서');
    const move = { id: `${actor.id}_finisher`, clip: `${actor.id}_finisher`, name: actor.id === 'atlas' ? '타이탄 파워밤' : '오로라 스플렉스', damage: 63, kind: 'finisher' };
    const success = this.withActor(actor, target, () => this.capture(target, move, 'finisher'));
    if (success) { actor.meter = 0; this.banner(move.name, 1.7); }
    return success;
  }

  startHold(actor, type) {
    const target = this.opponentOf(actor);
    if (!free(actor) || !grounded(target) || !inReach(actor, target, 96) || actor.holdCooldown > 0) return this.unavailable(type, '누운 상대 가까이에서 사용할 수 있습니다.');
    const match = this.state.match;
    actor.facing = target.x >= actor.x ? 1 : -1;
    const clip = this.ringClip(`${actor.id}_${type === 'pin' ? 'cover' : 'submission'}`, actor);
    const held = sampleMotion(clip, (clip?.holdAt ?? .35) * (clip?.duration ?? 1));
    const victimX = held?.victim.x ?? .35;
    const anchor = { id: actor.id, x: target.x - victimX * 128 * actor.facing, y: target.y, facing: actor.facing };
    Object.assign(match, blankMatch(), { phase: type, type, attacker: actor, defender: target, clip, anchor,
      escapeLastAt: -10, entryX: target.x, entryY: target.y, attackerFacing: actor.facing,
      entry: { hero: { x: (actor.x - anchor.x) / (128 * anchor.facing), z: actor.z, angle: 0, facing: actor.facing },
        victim: { x: (target.x - anchor.x) / (128 * anchor.facing), z: target.z, angle: (target.releasedAngle || 0) / anchor.facing, facing: target.releasedFacing || target.facing } } });
    actor.action = type; actor.actionTime = 0; actor.submissionHeld = type === 'submission'; actor.run = actor.corner = null;
    actor.strikeHeld = false; actor.chargeReady = false; actor.chargeTime = actor.chargeAmount = actor.chargeRatio = 0;
    target.action = 'held'; target.actionTime = 0; target.vx = 0; target.escapeProgress = 0;
    target.strikeHeld = false; this.inputBuffer = []; this.aiBuffer = [];
    this.state.phase = type;
    this.state.lastMove = this.state.currentMove = { id: `${actor.id}_${type === 'pin' ? 'cover' : 'submission'}`, name: type === 'pin' ? '핀폴' : '서브미션', type };
    this.event(type === 'pin' ? 'pinStart' : 'submissionStart', { hero: actor.id, defender: target.id });
    if (this.nearRopes(target)) this.releaseHold('ropeBreak');
    else this.syncHoldPositions();
    return true;
  }

  escape() {
    if (this.state.status !== 'playing') return false;
    const defender = this.state.player;
    if (!this.captured(defender) || this.state.time - defender.escapeLastAt < RING_RULES.escapeTapInterval) return false;
    defender.escapeLastAt = this.state.time;
    const strength = .09 + this.resilience(defender) * .07;
    if (['pin', 'submission'].includes(this.state.match.phase)) {
      this.state.match.escapeProgress = Math.min(1, this.state.match.escapeProgress + strength);
      defender.escapeProgress = this.state.match.escapeProgress;
      if (this.state.match.escapeProgress >= 1) this.releaseHold('escape');
    } else {
      const attacker = this.opponentOf(defender);
      if (attacker.grapple.impacted) return false;
      defender.captureEscape = Math.min(1, defender.captureEscape + strength);
      defender.escapeProgress = defender.captureEscape;
      if (defender.captureEscape >= 1) this.breakGrapple(attacker, 'escape');
    }
    this.audio.sfx('escape'); this.event('escapeInput', { hero: defender.id, progress: defender.escapeProgress }); return true;
  }

  breakGrapple(attacker, reason) {
    const defender = attacker.grapple?.target; if (!defender) return;
    attacker.grapple = null; attacker.action = 'hurt'; attacker.actionTime = 0; attacker.actionDuration = .48;
    attacker.activeClip = null; attacker.grappleCooldown = 1.1;
    defender.action = 'idle'; defender.actionTime = 0; defender.z = defender.vx = 0;
    defender.invulnerable = .25; defender.getupProtectionUntil = this.state.time + .55;
    defender.captureEscape = defender.escapeProgress = 0;
    this.event('holdEscape', { hero: defender.id, method: 'grapple', reason });
  }

  releaseHold(reason) {
    const match = this.state.match; if (!['pin', 'submission'].includes(match.phase)) return;
    const actor = match.attacker, defender = match.defender, method = match.phase, startSample = this.holdSample();
    actor.action = 'recover'; actor.actionTime = 0; actor.actionDuration = .40;
    actor.recoveryAngle = actor.releasedAngle = 0; actor.recoveryZ = actor.z = 0;
    actor.submissionHeld = false; actor.holdCooldown = RING_RULES.holdCooldown;
    defender.action = reason === 'released' ? 'down' : 'recover'; defender.actionTime = 0;
    defender.actionDuration = reason === 'released' ? .8 : .42; defender.recoveryAngle = defender.releasedAngle = 0;
    defender.recoveryZ = defender.z = 0; defender.releasedPose = this.floorPose(defender);
    defender.getupProtectionUntil = this.state.time + 1.15; defender.invulnerable = .30;
    match.phase = 'wrestling'; match.escapeProgress = 0; match.progress = 0;
    match.count = 0;
    this.state.phase = 'wrestling'; this.state.pinCount = 0; this.state.escapeProgress = 0;
    this.event(reason === 'ropeBreak' ? 'ropeBreak' : 'holdEscape', { hero: defender.id, method, reason, message: reason === 'ropeBreak' ? '로프 브레이크' : '홀드 탈출' });
    this.audio.sfx('escape');
    this.startEscapePresentation(actor, defender, method, startSample);
  }

  updateHold(dt) {
    const match = this.state.match, attacker = match.attacker, defender = match.defender;
    match.elapsed += dt;
    const resilience = this.resilience(defender);
    // Healthy wrestlers kick out naturally; badly worn wrestlers need manual resistance.
    const autoResistance = .08 + .98 * resilience * resilience;
    match.escapeProgress = clamp(match.escapeProgress + dt * autoResistance, 0, 1);
    if (defender.id === this.controlledId) {
      match.anchor.x += this.move.x * 17 * dt;
      match.anchor.y += this.move.y * .070 * dt;
    } else if (this.nearRopes(defender) || distance(defender, this.nearestCorner(defender)) < 70) {
      const corner = this.nearestCorner(defender), vector = unit(corner.x - defender.x, (corner.y - defender.y) * 280);
      match.anchor.x += vector.x * 10 * dt;
      match.anchor.y += vector.y * .04 * dt;
    }
    this.syncHoldPositions();
    defender.escapeProgress = match.escapeProgress;
    if (this.nearRopes(defender)) { this.releaseHold('ropeBreak'); return; }
    if (match.escapeProgress >= 1) { this.releaseHold('escape'); return; }
    if (match.phase === 'pin') {
      const count = Math.min(3, Math.floor(match.elapsed / RING_RULES.pinInterval));
      if (count > match.count) { match.count = count; this.audio.sfx('count'); this.event('pinCount', { count, hero: attacker.id }); }
      match.progress = Math.min(1, match.elapsed / (RING_RULES.pinInterval * 3));
      if (match.count === 3) this.finishMatch(attacker, 'pin');
    } else {
      if (!attacker.submissionHeld) { this.releaseHold('released'); return; }
      const weakness = 1 - resilience;
      match.progress = clamp(match.progress + dt * (.08 + .34 * weakness), 0, 1);
      defender.hp = Math.max(1, defender.hp - dt * 2.1); defender.fatigue = Math.min(100, defender.fatigue + dt * 2.8);
      if (match.progress >= 1) this.finishMatch(attacker, 'submission');
    }
  }

  finishMatch(winner, method) {
    const state = this.state, match = state.match;
    if (match.phase === 'finished') return;
    match.phase = 'finished'; match.winner = winner.id; match.finishMethod = method; match.progress = 1;
    state.phase = 'finished'; state.status = winner.id === this.controlledId ? 'victory' : 'defeat';
    state.objective = `${winner.ko} ${method === 'pin' ? '핀폴' : '서브미션'} 승리`;
    state.score += winner.id === this.controlledId ? 2000 : 0;
    this.cancelStrike(); this.inputBuffer = []; this.aiBuffer = []; this.setMove(0, 0);
    this.banner(`${winner.name} WINS`, 30); this.audio.stop(); this.audio.sfx('bell');
    this.event('matchEnd', { winner: winner.id, method, score: state.score, time: state.time }); this.publish(true);
  }

  simulate(dt) {
    const state = this.state; this.currentDt = dt; state.time += dt;
    this.updateEffects(dt); this.hitstop = Math.max(0, this.hitstop - dt); this.shake = Math.max(0, this.shake - dt * 25);
    state.bannerTime = Math.max(0, state.bannerTime - dt); if (!state.bannerTime) state.banner = null;
    for (const actor of state.team) {
      for (const key of ['counterCooldown', 'grappleCooldown', 'holdCooldown', 'runCooldown', 'cornerCooldown', 'cooldown', 'facingLocked']) actor[key] = Math.max(0, actor[key] - dt);
      if (free(actor)) { actor.stamina = Math.min(100, actor.stamina + dt * 10); actor.fatigue = Math.max(0, actor.fatigue - dt * .5); }
      if (free(actor) && state.time - actor.lastDamageAt > 7) actor.hp = Math.min(actor.maxHp, actor.hp + dt * .5);
    }
    if (this.escapePresentation) this.updateEscapePresentation(dt);
    else if (['pin', 'submission'].includes(state.match.phase)) this.updateHold(dt);
    else if (this.hitstop <= 0) {
      this.updateBrain(dt);
      this.updateCombatant(state.player, dt);
      this.updateCombatant(state.opponent, dt);
      this.separateWrestlers(dt);
    }
    this.camera = 0;
    if (state.time - (this.lastHitTime ?? -10) > 2.7) state.combo = 0;
    this.refreshContext(); this.publish();
  }

  updateWalking(actor, dx, dy, dt) {
    const oldX = actor.x, oldY = actor.y;
    actor.x = clamp(actor.x, RING_RULES.left, RING_RULES.right); actor.y = clamp(actor.y, RING_RULES.top, RING_RULES.bottom);
    super.updateWalking(actor, dx ? dx + actor.x - oldX : 0, dy ? dy + actor.y - oldY : 0, dt);
  }

  separateWrestlers(dt) {
    const [a, b] = this.state.team;
    const upright = actor => free(actor) || ['strike', 'guard', 'hurt', 'rearStun'].includes(actor.action);
    if (!upright(a) || !upright(b) || Math.abs(a.y - b.y) >= .08 || Math.abs(a.x - b.x) >= 43) return;
    const sign = Math.abs(b.x - a.x) > .01 ? Math.sign(b.x - a.x) : -a.facing;
    const push = Math.min((43 - Math.abs(b.x - a.x)) / 2, dt * 70);
    a.x = clamp(a.x - sign * push, RING_RULES.left, RING_RULES.right);
    b.x = clamp(b.x + sign * push, RING_RULES.left, RING_RULES.right);
  }

  updateCombatant(actor, dt) {
    if (actor.action === 'grabbed' || actor.action === 'held') { actor.gaitMoving = false; return; }
    if (actor.run) { actor.invulnerable = Math.max(0, actor.invulnerable - dt); this.updateRun(actor, dt); return; }
    if (actor.corner) { actor.invulnerable = Math.max(0, actor.invulnerable - dt); this.updateCorner(actor, dt); return; }
    if (actor.action === 'strike' && actor.strikeDelay > 0) {
      actor.strikeDelay = Math.max(0, actor.strikeDelay - dt); actor.invulnerable = Math.max(0, actor.invulnerable - dt);
      actor.gaitMoving = false; return;
    }
    if (actor.action === 'grappleWindup' || actor.action === 'finisherWindup') {
      actor.actionTime += dt; actor.gaitMoving = false;
      if (!actor.attackHit && actor.actionTime >= actor.actionDuration) {
        actor.attackHit = true; const target = this.opponentOf(actor), move = actor.pendingMove;
        actor.action = 'idle';
        if (inReach(actor, target, 100) && standing(target) && !this.parry(target, actor)) {
          if (move.finisher) this.finisher(actor);
          else this.withActor(actor, target, () => this.capture(target, move, 'grapple'));
        }
        actor.cooldown = .9;
      }
      return;
    }
    if (['down', 'recover', 'rearStun'].includes(actor.action)) {
      actor.actionTime += dt; actor.invulnerable = Math.max(0, actor.invulnerable - dt);
      actor.x = clamp(actor.x + actor.vx * dt, RING_RULES.left, RING_RULES.right); actor.vx *= Math.exp(-dt * 9);
      actor.gaitMoving = false;
      if (actor.action === 'recover') {
        const t = clamp(actor.actionTime / actor.actionDuration, 0, 1);
        actor.z = lerp(actor.recoveryZ || 0, 0, t); actor.releasedAngle = lerp(actor.recoveryAngle || 0, 0, t);
      }
      if (actor.actionTime >= actor.actionDuration) {
        if (actor.action === 'down') {
          actor.action = 'recover'; actor.actionTime = 0; actor.actionDuration = .42;
          actor.recoveryZ = actor.z; actor.recoveryAngle = actor.releasedAngle || 0;
          actor.getupProtectionUntil = this.state.time + .75;
        } else {
          actor.action = 'idle'; actor.actionTime = 0; actor.cooldown = Math.max(actor.cooldown, .45);
          actor.z = 0; actor.releasedAngle = actor.releasedPose = actor.releasedFacing = null;
        }
      }
      return;
    }
    this.withActor(actor, this.opponentOf(actor), () => super.updatePlayer(dt));
  }

  updateBrain() {
    const ai = this.state.opponent, target = this.state.player;
    this.aiMove = { x: 0, y: 0 };
    if (!this.aiEnabled || this.captured(ai) || !free(ai)) {
      if (this.aiEnabled && ai.run && ai.action === 'run' && ai.run.rebounded && inReach(ai, target, 114)) this.runningStrike(ai);
      return;
    }
    const dx = target.x - ai.x, dy = target.y - ai.y;
    if (Math.abs(dx) > 8 && ai.facingLocked <= 0) ai.facing = Math.sign(dx);
    if (ai.aiPlanCorner) {
      const corner = this.nearestCorner(ai);
      if (distance(ai, corner) < 35) { ai.aiPlanCorner = false; this.startCorner(ai); return; }
      this.aiMove = unit(corner.x - ai.x, (corner.y - ai.y) * 280); return;
    }
    if (ai.stamina < 16) { this.aiMove = unit(-dx, -dy * 280); return; }
    if (target.action === 'strike' && !target.attackHit && ai.counterCooldown <= 0 && inReach(ai, target, 110)) {
      const contact = target.actionDuration * (target.activeClip?.contactAt ?? .4) - target.actionTime;
      if (contact > .06 && contact < .14 && ai.aiReactStrike !== target.lastInput) {
        ai.aiReactStrike = target.lastInput;
        if (this.random() < .20) { this.withActor(ai, target, () => super.beginCounter()); return; }
      }
    }
    if (inReach(ai, target, grounded(target) ? 95 : 79) && ai.cooldown <= 0) {
      if (grounded(target) && ai.holdCooldown <= 0) {
        this.startHold(ai, ai.id === 'nova' && this.random() < .45 ? 'submission' : 'pin'); return;
      }
      if (!standing(target)) return;
      ai.aiDecision++;
      if (ai.meter >= 100 && ai.grappleCooldown <= 0 && ai.stamina >= 12) {
        ai.action = 'finisherWindup'; ai.pendingMove = { finisher: true }; ai.actionDuration = .48; ai.actionTime = 0; ai.attackHit = false;
        this.event('telegraph', { enemy: ai.id, action: 'finisher', contactIn: .48 }); return;
      }
      const roll = this.random();
      if (roll < .34 && ai.grappleCooldown <= 0 && ai.stamina >= 12) {
        const direction = ['up', 'down', 'left', 'right'][ai.aiDecision % 4];
        ai.pendingMove = GRAB_MOVES[ai.id][targetSide(ai, target)][direction];
        ai.action = 'grappleWindup'; ai.actionDuration = .37; ai.actionTime = 0; ai.attackHit = false;
        this.event('telegraph', { enemy: ai.id, action: 'grab', contactIn: .37 }); return;
      }
      this.withActor(ai, target, () => this.startStrike(COMBO_STEPS[ai.aiDecision % 4].id, COMBO_STEPS[ai.aiDecision % 4]));
      ai.cooldown = .85 + this.random() * .35; return;
    }
    if (distance(ai, target) > 175 && ai.cooldown <= 0 && ai.stamina > 34) {
      const roll = this.random();
      ai.cooldown = .7;
      if (roll < .15 && ai.cornerCooldown <= 0) { ai.aiPlanCorner = true; return; }
      if (roll < .50 && ai.runCooldown <= 0) { this.startRun(ai, unit(-dx, -dy * 280)); return; }
    }
    const horizontal = Math.abs(dx) > 60 ? dx : 0, vertical = Math.abs(dy) > .04 ? dy * 280 : 0;
    this.aiMove = unit(horizontal, vertical);
  }

  refreshContext() {
    const state = this.state, p = state.player, target = state.opponent, match = state.match;
    const available = state.status === 'playing' && match.phase === 'wrestling' && free(p);
    p.grabReady = available && standing(target) && inReach(p, target, 91) && p.grappleCooldown <= 0 && p.stamina >= 12 && this.state.time >= target.getupProtectionUntil;
    p.targetSide = targetSide(p, target); p.targetDirection = directionForMove(this.move.x, this.move.y);
    state.grabContext = { ready: p.grabReady, side: p.targetSide, direction: p.targetDirection, move: GRAB_MOVES[p.id][p.targetSide][p.targetDirection] };
    state.context = { canPin: available && grounded(target) && inReach(p, target, 96) && p.holdCooldown <= 0,
      canSubmission: (available && grounded(target) && inReach(p, target, 96) && p.holdCooldown <= 0)
        || (state.status === 'playing' && match.phase === 'submission' && match.attacker === p),
      canFinisher: available && p.meter >= 100 && standing(target) && inReach(p, target, 99) && p.grappleCooldown <= 0 && p.stamina >= 12,
      canCorner: (available && p.cornerCooldown <= 0 && p.stamina >= 18 && distance(p, this.nearestCorner(p)) < 49) || p.corner?.phase === 'perched',
      canRun: available && p.runCooldown <= 0 && p.stamina >= 20,
      canEscape: this.captured(p), nearRopes: this.nearRopes(p), nearCorner: distance(p, this.nearestCorner(p)) < 49 };
    state.phase = match.phase; state.pinCount = match.count;
    state.escapeProgress = this.captured(p) ? match.defender === p && ['pin', 'submission'].includes(match.phase) ? match.escapeProgress : p.captureEscape : 0;
    state.currentMove = state.lastMove; state.counterCooldown = p.counterCooldown;
    state.charge = p.strikeHeld ? clamp((state.time - p.pressTime) / COMBAT_RULES.chargeThreshold, 0, 1) : 0;
    state.comboStep = p.comboStep; state.bufferedInputs = this.inputBuffer.length;
    state.progress = match.progress; state.kills = 0;
  }

  getRingRender(actor) {
    if (this.escapePresentation && [this.escapePresentation.attacker, this.escapePresentation.defender].includes(actor)) {
      const presentation = this.escapePresentation, sample = this.escapeSample();
      const transform = sample[actor === presentation.attacker ? 'hero' : 'victim'];
      return { transform, anchor: presentation.anchor, pose: transform.pose };
    }
    const match = this.state.match;
    if (['pin', 'submission', 'finished'].includes(match.phase) && match.attacker && [match.attacker, match.defender].includes(actor)) {
      const sample = this.holdSample(), role = actor === match.attacker ? 'hero' : 'victim';
      return { transform: sample[role], anchor: match.anchor, pose: sample[role].pose };
    }
    if (actor.corner) {
      const sampled = actor.corner.phase === 'dive' ? sampleMotion(actor.activeClip, actor.actionTime)?.hero : null;
      const transform = { ...(sampled || { angle: 0, pose: 'guard' }), x: 0, z: actor.z, facing: actor.facing };
      return { transform, anchor: actor, pose: transform.pose };
    }
    if (actor.action === 'grappleWindup' || actor.action === 'finisherWindup') return { pose: 'clinch', anchor: actor };
    if (actor.action === 'strike' && actor.strikeDelay > 0) return { pose: 'guard', anchor: actor };
    if (actor.action === 'run' && actor.run && this.state.time - actor.run.reboundAt < .35) {
      const clip = this.ringClip('ropeRebound', actor), elapsed = this.state.time - actor.run.reboundAt;
      const transform = sampleMotion(clip, elapsed / .35 * (clip?.duration ?? .35))?.hero;
      if (transform) return { transform, anchor: actor, pose: transform.pose };
    }
    return null;
  }

  holdSample() {
    const match = this.state.match;
    const held = Math.min(match.elapsed, (match.clip?.holdAt ?? (match.type === 'pin' ? .35 : .40)) * (match.clip?.duration ?? 1));
    const sample = sampleMotion(match.clip, held) || {
      hero: { x: 0, z: -.10, angle: 0, pose: 'lock', relativeFacing: 1 },
      victim: { x: .35, z: 0, angle: 0, pose: this.floorPose(match.defender), relativeFacing: -1 },
    };
    const t = clamp(match.elapsed / .16, 0, 1), ease = t * t * (3 - 2 * t);
    for (const role of ['hero', 'victim']) {
      const transform = sample[role], entry = match.entry[role];
      for (const key of ['x', 'z', 'angle']) transform[key] = lerp(entry[key], transform[key], ease);
      transform.facing = t < .5 ? entry.facing : match.anchor.facing * (transform.relativeFacing ?? 1);
    }
    return this.constrainPair(sample, match.anchor);
  }

  constrainPair(sample, anchor) {
    anchor.y = clamp(anchor.y, RING_RULES.top, RING_RULES.bottom);
    const xs = ['hero', 'victim'].map(role => anchor.x + sample[role].x * 128 * anchor.facing);
    const minimum = Math.min(...xs), maximum = Math.max(...xs);
    // Translate the whole authored pair at a rope. Independent clamping would
    // collapse a forward throw's two roots into the same spot and overlap art.
    const shift = minimum < RING_RULES.left ? RING_RULES.left - minimum
      : maximum > RING_RULES.right ? RING_RULES.right - maximum : 0;
    for (const role of ['hero', 'victim']) {
      const transform = sample[role];
      transform.x = (clamp(anchor.x + transform.x * 128 * anchor.facing + shift, RING_RULES.left, RING_RULES.right) - anchor.x) / (128 * anchor.facing);
      transform.facing ??= anchor.facing * (transform.relativeFacing ?? 1);
    }
    return sample;
  }

  syncHoldPositions() {
    const match = this.state.match, sample = this.holdSample();
    for (const [role, actor] of [['hero', match.attacker], ['victim', match.defender]]) {
      actor.x = match.anchor.x + sample[role].x * 128 * match.anchor.facing;
      actor.y = match.anchor.y; actor.z = sample[role].z;
      actor.gaitMoving = false;
    }
  }

  startEscapePresentation(attacker, defender, method, startSample) {
    const clip = this.ringClip(method === 'pin' ? 'pinEscape' : 'submissionEscape', attacker);
    if (!clip?.frames?.length) return;
    const anchor = { id: attacker.id, x: attacker.x, y: attacker.y, facing: attacker.facing };
    const first = sampleMotion(clip, 0);
    this.escapePresentation = { attacker, defender, clip, anchor, time: 0, duration: Math.min(.8, clip.duration), first,
      entry: { hero: { x: 0, z: startSample?.hero.z ?? attacker.z, angle: startSample?.hero.angle ?? 0, pose: startSample?.hero.pose },
        victim: { x: (defender.x - anchor.x) / (128 * anchor.facing), z: startSample?.victim.z ?? defender.z,
          angle: startSample?.victim.angle ?? (defender.releasedAngle || 0) / anchor.facing, pose: startSample?.victim.pose } } };
    attacker.action = defender.action = 'escape';
  }

  escapeSample() {
    const presentation = this.escapePresentation;
    const progress = presentation.time / presentation.duration;
    const sample = sampleMotion(presentation.clip, progress * presentation.clip.duration);
    if (presentation.clip.captureStartTransforms) for (const role of ['hero', 'victim']) {
      for (const key of ['x', 'z', 'angle']) sample[role][key] += (presentation.entry[role][key] - presentation.first[role][key]) * (key === 'x' ? 1 : 1 - progress);
    }
    return this.constrainPair(sample, presentation.anchor);
  }

  updateEscapePresentation(dt) {
    const presentation = this.escapePresentation; presentation.time = Math.min(presentation.duration, presentation.time + dt);
    const sample = this.escapeSample();
    for (const [role, actor] of [['hero', presentation.attacker], ['victim', presentation.defender]]) {
      actor.x = presentation.anchor.x + sample[role].x * 128 * presentation.anchor.facing;
      actor.y = presentation.anchor.y; actor.z = sample[role].z; actor.gaitMoving = false;
    }
    if (presentation.time >= presentation.duration) {
      for (const actor of [presentation.attacker, presentation.defender]) {
        actor.action = 'idle'; actor.actionTime = 0; actor.z = 0; actor.cooldown = Math.max(actor.cooldown, .4);
        actor.releasedAngle = actor.releasedPose = actor.releasedFacing = null;
      }
      presentation.defender.getupProtectionUntil = this.state.time + .45;
      this.escapePresentation = null;
    }
  }

  travelProgress(clip, elapsed) {
    if (!clip?.frames?.length || clip.frames[0].travelProgress == null) return null;
    const t = clamp(elapsed / clip.duration, 0, 1), frames = clip.frames;
    let lo = 0, hi = frames.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid; }
    const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)];
    return lerp(a.travelProgress, b.travelProgress, b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1));
  }

  drawFighter(actor, transform = null, anchor = actor, pose) {
    if (actor.action === 'escape' && this.escapePresentation?.time < .065 && pose != null) {
      const presentation = this.escapePresentation, role = actor === presentation.attacker ? 'hero' : 'victim';
      actor.renderPoseFrom = presentation.entry[role].pose || pose; actor.renderPose = pose;
      actor.renderPoseTime = this.state.time - presentation.time; actor.renderPoseDuration = .065;
      return super.drawFighter(actor, transform, anchor);
    }
    if (actor.action === 'run' && !transform && pose == null) {
      actor.action = 'walk'; try { return super.drawFighter(actor, transform, anchor, pose); }
      finally { actor.action = 'run'; }
    }
    return super.drawFighter(actor, transform, anchor, pose);
  }
}

function image(url) {
  return new Promise((resolve, reject) => { const sprite = new Image(); sprite.onload = () => resolve(sprite);
    sprite.onerror = () => reject(new Error(`스프라이트를 불러오지 못했습니다: ${url}`)); sprite.src = url; });
}

export { WrestlingGame as Game };
