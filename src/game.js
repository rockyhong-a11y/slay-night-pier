import { ROSTER, HEROES, ENCOUNTERS, characterFor } from './roster.js';
import { AudioEngine } from './audio.js';

const ASSET_BASE = import.meta.env?.BASE_URL ?? './';
const assetUrl = path => `${ASSET_BASE}${path.replace(/^\/+/, '')}`;
const STAGE_LENGTH = 2380;
const VIEW_WIDTH = 420;
const BODY_HEIGHT = 128;
const WAVES = [
  { start: 0, trigger: 0, end: 640, spawn: [365, 495] },
  { start: 670, trigger: 850, end: 1370, spawn: [1050, 1160, 1250] },
  { start: 1430, trigger: 1590, end: 2350, spawn: [1830, 1980, 2180] },
];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const alive = fighter => fighter.hp > 0 && fighter.action !== 'dead';
const laneDistance = (a, b) => Math.abs(a.y - b.y);
const planarDistance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 330);

function seededRandom(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFighter(id, x = 150, y = 0.57) {
  const data = characterFor(id);
  return {
    ...data, x, y, hp: data.hp, maxHp: data.hp, meter: data.role === 'hero' ? 30 : 0,
    maxMeter: 100, facing: data.role === 'hero' ? 1 : -1, action: 'idle',
    actionTime: 0, actionDuration: 0, cooldown: 0, invulnerable: 0,
    vx: 0, vy: 0, z: 0, comboStep: 0, attackHit: false, walkTime: 0,
    deathTime: 0, lastAttack: -10, grapple: null, grabReady: false,
  };
}

/** Interpolates the actual 60 Hz Blender tracks, independently of rendering. */
export function sampleMotion(clip, elapsed) {
  if (!clip?.frames?.length) return null;
  const frames = clip.frames;
  const normalized = frames[frames.length - 1].t <= 1.000001;
  const t = normalized ? clamp(elapsed / clip.duration, 0, 1) : clamp(elapsed, 0, clip.duration);
  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[Math.min(lo + 1, frames.length - 1)];
  const mix = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  const result = {};
  for (const actor of ['hero', 'victim']) {
    result[actor] = {};
    for (const key of ['x', 'z', 'angle', 'scaleX', 'scaleY']) {
      const defaultValue = key.startsWith('scale') ? 1 : 0;
      result[actor][key] = lerp(a[actor]?.[key] ?? defaultValue, b[actor]?.[key] ?? defaultValue, mix);
    }
    result[actor].pose = mix < 0.5 ? a[actor]?.pose ?? 0 : b[actor]?.pose ?? 0;
  }
  return result;
}

export class Game {
  constructor({ canvas = null, onUpdate = () => {}, onEvent = () => {}, seed = 821, reducedMotion } = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: false }) ?? null;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    this.audio = new AudioEngine();
    this.seed = seed;
    this.random = seededRandom(seed);
    this.sprites = new Map();
    this.manifest = {};
    this.motion = { clips: {} };
    this.move = { x: 0, y: 0 };
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.width = 420;
    this.height = 600;
    this.camera = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.raf = null;
    this.lastFrame = null;
    this.publishTime = 0;
    this.destroyed = false;
    this.loaded = false;
    this.reducedMotion = reducedMotion ?? Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.state = {
      status: 'ready', time: 0, score: 0, combo: 0, maxCombo: 0, kills: 0,
      wave: 1, progress: 0, phase: 'fight', stageName: 'NIGHT PIER',
      objective: '두 영웅과 함께 부두를 돌파하세요.', player: makeFighter('atlas'),
      team: HEROES.map(hero => makeFighter(hero.id)), enemies: [], boss: null,
      aliveEnemies: 0, totalEnemies: 8, encountered: 0, tagCooldown: 0,
      banner: null, bannerTime: 0,
    };
    this.boundResize = () => this.resize();
    if (canvas && globalThis.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this.boundResize);
      this.resizeObserver.observe(canvas);
    } else if (canvas && globalThis.addEventListener) {
      globalThis.addEventListener('resize', this.boundResize);
    }
    this.resize();
  }

  async load() {
    if (!this.canvas) { this.loaded = true; return this; }
    const [spriteResponse, motionResponse] = await Promise.all([
      fetch(assetUrl('/assets/sprites/manifest.json')), fetch(assetUrl('/assets/motion/grapples.json')),
    ]);
    if (!spriteResponse.ok || !motionResponse.ok) throw new Error('캐릭터 또는 블렌더 모션 데이터를 불러오지 못했습니다.');
    [this.manifest, this.motion] = await Promise.all([spriteResponse.json(), motionResponse.json()]);
    if (!this.motion.clips?.powerbomb?.frames?.length || !this.motion.clips?.suplex?.frames?.length) {
      throw new Error('필수 레슬링 모션 데이터가 없습니다.');
    }
    await Promise.all(ROSTER.map(async fighter => {
      const metadata = this.manifest[fighter.id];
      if (!metadata?.frames?.length) throw new Error(`${fighter.name} 스프라이트 데이터가 없습니다.`);
      const image = await loadImage(assetUrl(metadata.image || fighter.sprite));
      const run = metadata.runImage ? await loadImage(assetUrl(metadata.runImage)) : null;
      const grapple = metadata.grappleImage ? await loadImage(assetUrl(metadata.grappleImage)) : null;
      this.sprites.set(fighter.id, { image, run, grapple, metadata });
    }));
    this.loaded = true;
    this.render();
    return this;
  }

  start(heroId = 'atlas') {
    const hero = HEROES.some(item => item.id === heroId) ? heroId : 'atlas';
    this.random = seededRandom(this.seed);
    const team = HEROES.map(item => makeFighter(item.id));
    const player = team.find(item => item.id === hero);
    this.state = {
      status: 'playing', time: 0, score: 0, combo: 0, maxCombo: 0, kills: 0,
      wave: 1, progress: 0, phase: 'fight', stageName: 'NIGHT PIER',
      objective: '적을 처치해 길을 여세요.', player, team, enemies: [], boss: null,
      aliveEnemies: 0, totalEnemies: 8, encountered: 0, tagCooldown: 0,
      banner: null, bannerTime: 0,
    };
    this.camera = 0;
    this.move = { x: 0, y: 0 };
    this.particles.length = 0;
    this.floaters.length = 0;
    this.rings.length = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.publishTime = 0;
    this.lastFrame = null;
    this.queuedAttack = false;
    this.spawnWave(0);
    this.audio.start();
    this.publish(true);
    this.startLoop();
  }

  startLoop() {
    if (this.raf !== null || !this.canvas || typeof requestAnimationFrame !== 'function' || this.destroyed) return;
    const frame = timestamp => {
      if (this.destroyed) return;
      const dt = this.lastFrame === null ? 0 : Math.min((timestamp - this.lastFrame) / 1000, 0.05);
      this.lastFrame = timestamp;
      this.step(dt);
      this.render();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  setMove(x, y) {
    if (typeof x === 'object') ({ x, y } = x);
    const length = Math.hypot(x || 0, y || 0);
    this.move = { x: (x || 0) / Math.max(1, length), y: (y || 0) / Math.max(1, length) };
  }

  setMuted(muted) { return this.audio.setMuted(muted); }

  pause(paused = true) {
    if (paused && this.state.status === 'playing') {
      this.state.status = 'paused';
      this.setMove(0, 0);
      this.audio.stop();
    } else if (!paused && this.state.status === 'paused') {
      this.state.status = 'playing';
      this.lastFrame = null;
      this.audio.start();
    }
    this.publish(true);
  }

  action(action) {
    if (this.state.status !== 'playing') return false;
    const p = this.state.player;
    this.audio.unlock();
    if (action === 'tag') return this.tag();
    if (!alive(p)) return false;
    if (!['idle', 'walk'].includes(p.action)) {
      if (action === 'attack' && p.action === 'attack' && p.actionTime > p.actionDuration * 0.38) this.queuedAttack = true;
      return false;
    }
    if (action === 'attack') {
      const target = this.nearestEnemy(115, 0.27);
      if (target) p.facing = target.x >= p.x ? 1 : -1;
      p.comboStep = this.state.time - p.lastAttack < 0.85 ? (p.comboStep % 3) + 1 : 1;
      p.lastAttack = this.state.time;
      p.action = 'attack';
      p.actionTime = 0;
      p.actionDuration = p.comboStep === 3 ? 0.39 : 0.29;
      p.attackHit = false;
      this.audio.sfx('miss');
      return true;
    }
    if (action === 'grab') {
      const target = this.nearestEnemy(84, 0.24);
      if (!target || target.action === 'grabbed') {
        this.event('outOfRange', { message: '적에게 다가가서 잡기', action: 'grab' });
        return false;
      }
      p.facing = target.x >= p.x ? 1 : -1;
      const clip = this.motion.clips[p.specialty];
      p.action = 'grapple';
      p.actionTime = 0;
      p.actionDuration = clip?.duration ?? (p.id === 'atlas' ? 1.35 : 1.2);
      p.grapple = { target, clip, originX: p.x, originY: p.y, impacted: false };
      target.action = 'grabbed';
      target.actionTime = 0;
      target.vx = 0;
      target.y = p.y;
      this.audio.sfx('grab');
      this.banner(p.id === 'atlas' ? 'POWERBOMB' : 'SUPLEX', 1.15);
      this.event('grapple', { hero: p.id, enemy: target.id, move: p.specialty, message: p.special });
      return true;
    }
    if (action === 'special') {
      if (p.meter < 45) {
        this.event('lowMeter', { message: '필살기 에너지 45 필요', required: 45, meter: p.meter });
        return false;
      }
      p.meter -= 45;
      p.action = 'special';
      p.actionTime = 0;
      p.actionDuration = 0.75;
      p.attackHit = false;
      p.invulnerable = 0.85;
      this.audio.sfx('special');
      this.banner(p.id === 'atlas' ? 'TITAN BREAKER' : 'AURORA SPIN', 1.2);
      this.event('special', { hero: p.id, message: p.id === 'atlas' ? '타이탄 브레이커' : '오로라 스핀' });
      return true;
    }
    if (action === 'jump') {
      p.action = 'jump';
      p.actionTime = 0;
      p.actionDuration = 0.65;
      p.attackHit = false;
      p.invulnerable = 0.5;
      this.audio.sfx('jump');
      return true;
    }
    return false;
  }

  tag(automatic = false) {
    const current = this.state.player;
    const partner = this.state.team.find(fighter => fighter.id !== current.id);
    if (!partner || partner.hp <= 0) {
      this.event('tagUnavailable', { message: '파트너가 쓰러졌습니다.' });
      return false;
    }
    if (!automatic && (this.state.tagCooldown > 0 || !['idle', 'walk', 'hurt'].includes(current.action))) return false;
    partner.x = current.x;
    partner.y = current.y;
    partner.facing = current.facing;
    partner.action = 'idle';
    partner.actionTime = 0;
    partner.z = 0;
    partner.vx = 0;
    partner.invulnerable = 1.25;
    current.action = current.hp > 0 ? 'idle' : 'dead';
    current.grapple = null;
    this.state.player = partner;
    this.state.tagCooldown = automatic ? 1 : 3;
    this.queuedAttack = false;
    this.audio.sfx('tag');
    this.banner(`${partner.name} / TAG IN`, 1.1);
    this.event('tag', { hero: partner.id, automatic, message: `${partner.ko} 교대` });
    this.publish(true);
    return true;
  }

  nearestEnemy(range = 100, lane = 0.25) {
    const p = this.state.player;
    return this.state.enemies.filter(enemy => alive(enemy) && laneDistance(p, enemy) < lane && planarDistance(p, enemy) < range)
      .sort((a, b) => planarDistance(p, a) - planarDistance(p, b))[0] ?? null;
  }

  spawnWave(index) {
    const wave = WAVES[index];
    const roster = ENCOUNTERS[index];
    this.state.wave = index + 1;
    this.state.phase = 'fight';
    this.state.objective = index === 2 ? '오닉스와 마지막 적들을 쓰러뜨리세요.' : '적을 처치해 길을 여세요.';
    const enemies = roster.enemies.map((id, i) => {
      const fighter = makeFighter(id, wave.spawn[i], 0.38 + i * 0.17);
      fighter.cooldown = 0.6 + i * 0.45;
      return fighter;
    });
    this.state.enemies.push(...enemies);
    this.state.encountered += enemies.length;
    this.state.boss = enemies.find(fighter => fighter.boss) ?? this.state.boss;
    this.banner(index === 2 ? 'FINAL ENCOUNTER' : `ENCOUNTER 0${index + 1}`, 2.2);
    this.event('wave', { wave: index + 1, name: roster.name, enemyIds: roster.enemies });
    this.state.aliveEnemies = enemies.length;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.state.status !== 'playing') return;
    // Simulate in bounded slices so offline tests and a delayed frame cannot skip impacts.
    let remaining = Math.min(dt, 3);
    while (remaining > 0 && this.state.status === 'playing') {
      const slice = Math.min(remaining, 1 / 60);
      this.simulate(slice);
      remaining -= slice;
    }
  }

  simulate(dt) {
    const state = this.state;
    state.time += dt;
    this.updateEffects(dt);
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.shake = Math.max(0, this.shake - dt * 25);
    state.bannerTime = Math.max(0, state.bannerTime - dt);
    if (state.bannerTime <= 0) state.banner = null;
    state.tagCooldown = Math.max(0, state.tagCooldown - dt);
    if (state.time - (this.lastHitTime ?? -10) > 2.7) state.combo = 0;
    if (this.hitstop > 0) { this.publish(); return; }
    this.updatePlayer(dt);
    for (const enemy of state.enemies) this.updateEnemy(enemy, dt);
    this.separateEnemies(dt);
    const p = state.player;
    p.grabReady = Boolean(this.nearestEnemy(84, 0.24));
    state.aliveEnemies = state.enemies.filter(alive).length;
    state.progress = clamp((state.kills / 8) * 0.72 + (p.x / STAGE_LENGTH) * 0.28, 0, 1);
    if (state.phase === 'fight' && state.aliveEnemies === 0) this.clearWave();
    if (state.phase === 'advance' && state.wave < 3 && p.x >= WAVES[state.wave].trigger) this.spawnWave(state.wave);
    const targetCamera = clamp(p.x - VIEW_WIDTH * 0.36, 0, STAGE_LENGTH - VIEW_WIDTH);
    this.camera = lerp(this.camera, targetCamera, 1 - Math.exp(-dt * 7));
    this.publish();
  }

  updatePlayer(dt) {
    const p = this.state.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.actionTime += dt;
    p.x += p.vx * dt;
    p.vx *= Math.exp(-dt * 11);
    if (p.action === 'grapple') {
      this.updateGrapple(p);
    } else if (p.action === 'attack') {
      if (!p.attackHit && p.actionTime >= 0.11) {
        p.attackHit = true;
        const reach = p.comboStep === 3 ? 115 : 98;
        const victims = this.state.enemies.filter(enemy => alive(enemy) && enemy.action !== 'grabbed' &&
          laneDistance(p, enemy) < 0.25 && Math.abs(enemy.x - p.x) < reach && (enemy.x - p.x) * p.facing > -28);
        for (const enemy of victims) this.damageEnemy(enemy, [0, 12, 15, 25][p.comboStep] + (p.id === 'atlas' ? 2 : 0), {
          knockback: p.facing * (p.comboStep === 3 ? 250 : 80), down: p.comboStep === 3, kind: 'punch',
        });
        if (victims.length) this.audio.sfx('punch');
      }
      if (p.actionTime >= p.actionDuration) this.finishPlayerAction();
    } else if (p.action === 'jump') {
      const progress = p.actionTime / p.actionDuration;
      p.z = Math.sin(clamp(progress, 0, 1) * Math.PI) * 0.73;
      p.x += this.move.x * 130 * dt;
      p.y += this.move.y * 0.4 * dt;
      if (!p.attackHit && progress >= 0.42) {
        p.attackHit = true;
        for (const enemy of this.state.enemies) {
          if (alive(enemy) && laneDistance(p, enemy) < 0.26 && Math.abs(enemy.x - p.x) < 110) {
            this.damageEnemy(enemy, 23, { knockback: p.facing * 190, down: true, kind: 'kick' });
            this.audio.sfx('punch');
          }
        }
      }
      if (progress >= 1) { p.z = 0; this.finishPlayerAction(); }
    } else if (p.action === 'special') {
      if (!p.attackHit && p.actionTime >= 0.28) {
        p.attackHit = true;
        const radius = p.id === 'atlas' ? 165 : 195;
        for (const enemy of this.state.enemies) {
          if (alive(enemy) && planarDistance(p, enemy) < radius) {
            const direction = enemy.x >= p.x ? 1 : -1;
            this.damageEnemy(enemy, p.id === 'atlas' ? 44 : 37, { knockback: direction * 330, down: true, kind: 'special' });
          }
        }
        this.impact(p.x, p.y, '#a7efff', true);
        this.audio.sfx('slam');
      }
      if (p.actionTime >= p.actionDuration) this.finishPlayerAction();
    } else if (p.action === 'hurt') {
      if (p.actionTime >= p.actionDuration) this.finishPlayerAction();
    } else if (['idle', 'walk'].includes(p.action)) {
      const moving = Math.hypot(this.move.x, this.move.y) > 0.08;
      p.action = moving ? 'walk' : 'idle';
      if (moving) {
        const speed = p.id === 'nova' ? 225 : 200;
        p.x += this.move.x * speed * dt;
        p.y += this.move.y * 0.68 * dt;
        p.walkTime += dt;
        if (Math.abs(this.move.x) > 0.15) p.facing = this.move.x > 0 ? 1 : -1;
      }
    }
    const wave = WAVES[this.state.wave - 1];
    const maxX = this.state.phase === 'fight' ? wave.end : this.state.wave < 3 ? WAVES[this.state.wave].trigger + 25 : STAGE_LENGTH - 40;
    p.x = clamp(p.x, Math.max(50, wave.start - 200), maxX);
    p.y = clamp(p.y, 0.08, 0.96);
  }

  finishPlayerAction() {
    const p = this.state.player;
    p.action = 'idle';
    p.actionTime = 0;
    p.z = 0;
    if (this.queuedAttack) {
      this.queuedAttack = false;
      this.action('attack');
    }
  }

  updateGrapple(p) {
    const grapple = p.grapple;
    if (!grapple) { this.finishPlayerAction(); return; }
    const target = grapple.target;
    target.y = p.y;
    const sampled = sampleMotion(grapple.clip, p.actionTime);
    if (sampled) target.x = p.x + sampled.victim.x * BODY_HEIGHT * p.facing;
    else target.x = p.x + 60 * p.facing;
    const normalized = grapple.clip?.frames?.at(-1)?.t <= 1.000001;
    const impactAt = grapple.clip ? grapple.clip.impactAt * (normalized ? grapple.clip.duration : 1) : (p.id === 'atlas' ? 0.99 : 0.91);
    if (!grapple.impacted && p.actionTime >= impactAt) {
      grapple.impacted = true;
      this.damageEnemy(target, p.id === 'atlas' ? 57 : 49, {
        knockback: 0, down: true, kind: p.specialty, keepGrabbed: true,
      });
      if (p.id === 'atlas') {
        for (const enemy of this.state.enemies) {
          if (enemy !== target && alive(enemy) && planarDistance(target, enemy) < 125) {
            this.damageEnemy(enemy, 18, { knockback: (enemy.x > p.x ? 1 : -1) * 170, down: true, kind: 'shockwave' });
          }
        }
      }
      this.impact(target.x, p.y, p.color, true);
      this.audio.sfx('slam');
      this.event('slam', { hero: p.id, enemy: target.id, move: p.specialty, message: p.special });
    }
    if (p.actionTime >= p.actionDuration) {
      target.x = clamp(target.x, 50, STAGE_LENGTH - 30);
      target.action = target.hp > 0 ? 'down' : 'dead';
      target.actionTime = 0;
      target.actionDuration = 0.85;
      target.vx = p.specialty === 'suplex' ? -p.facing * 55 : p.facing * 35;
      p.grapple = null;
      this.finishPlayerAction();
    }
  }

  updateEnemy(enemy, dt) {
    if (enemy.action === 'grabbed') return;
    if (!alive(enemy)) { enemy.deathTime += dt; return; }
    enemy.actionTime += dt;
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.invulnerable = Math.max(0, enemy.invulnerable - dt);
    enemy.x += enemy.vx * dt;
    enemy.vx *= Math.exp(-dt * 6);
    const p = this.state.player;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    if (Math.abs(dx) > 4) enemy.facing = dx > 0 ? 1 : -1;
    if (['hurt', 'down'].includes(enemy.action)) {
      if (enemy.actionTime >= enemy.actionDuration) {
        enemy.action = 'idle';
        enemy.actionTime = 0;
        enemy.cooldown = Math.max(enemy.cooldown, 0.28);
      }
    } else if (enemy.action === 'attack') {
      const strikeTime = enemy.boss ? 0.65 : 0.48;
      if (!enemy.attackHit && enemy.actionTime >= strikeTime) {
        enemy.attackHit = true;
        const reach = enemy.boss ? 125 : enemy.specialty === 'striker' ? 105 : 84;
        if (Math.abs(dx) < reach && Math.abs(dy) < 0.24) {
          this.damagePlayer(5 + enemy.power * 1.7 + (enemy.boss ? 5 : 0), enemy.facing);
        }
        if (enemy.boss) this.rings.push({ x: enemy.x, y: enemy.y, radius: 10, max: 125, life: 0.42, total: 0.42, color: '#f27691' });
      }
      if (enemy.actionTime >= enemy.actionDuration) {
        enemy.action = 'idle';
        enemy.actionTime = 0;
        enemy.cooldown = enemy.boss ? 0.8 : 0.72 + this.random() * 0.8;
      }
    } else {
      const range = enemy.specialty === 'striker' ? 88 : enemy.boss ? 94 : 67;
      const anotherStriking = this.state.enemies.some(other => other !== enemy && other.action === 'attack' && !other.attackHit);
      if (Math.abs(dx) < range && Math.abs(dy) < 0.16 && enemy.cooldown <= 0 && !anotherStriking) {
        enemy.action = 'attack';
        enemy.actionTime = 0;
        enemy.actionDuration = enemy.boss ? 1.04 : 0.82;
        enemy.attackHit = false;
        this.event('telegraph', { enemy: enemy.id, boss: Boolean(enemy.boss) });
      } else {
        const speed = 47 + enemy.speed * 13 + (enemy.boss ? 8 : 0);
        const desiredX = p.x + (enemy.x > p.x ? range - 8 : -range + 8);
        const horizontal = Math.abs(desiredX - enemy.x) > 8 ? Math.sign(desiredX - enemy.x) : 0;
        const vertical = Math.abs(dy) > 0.065 ? Math.sign(dy) : 0;
        enemy.x += horizontal * speed * dt;
        enemy.y += vertical * speed / 520 * dt;
        enemy.action = horizontal || vertical ? 'walk' : 'idle';
        if (enemy.action === 'walk') enemy.walkTime += dt;
      }
    }
    enemy.x = clamp(enemy.x, WAVES[this.state.wave - 1].start + 35, WAVES[this.state.wave - 1].end - 30);
    enemy.y = clamp(enemy.y, 0.1, 0.95);
  }

  separateEnemies(dt) {
    const enemies = this.state.enemies.filter(enemy => alive(enemy) && !['grabbed', 'attack', 'down'].includes(enemy.action));
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i];
        const b = enemies[j];
        if (Math.abs(a.x - b.x) < 43 && laneDistance(a, b) < 0.11) {
          const sign = a.y > b.y ? 1 : -1;
          a.y = clamp(a.y + sign * dt * 0.09, 0.1, 0.95);
          b.y = clamp(b.y - sign * dt * 0.09, 0.1, 0.95);
        }
      }
    }
  }

  damageEnemy(enemy, amount, { knockback = 0, down = false, kind = 'punch', keepGrabbed = false } = {}) {
    if (!alive(enemy) || (enemy.action === 'grabbed' && !keepGrabbed)) return false;
    const damage = Math.round(amount);
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.vx = knockback;
    enemy.actionTime = 0;
    enemy.actionDuration = down ? 0.74 : 0.3;
    if (!keepGrabbed) enemy.action = enemy.hp <= 0 ? 'dead' : down ? 'down' : 'hurt';
    this.state.score += damage * 10;
    this.state.combo++;
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
    this.lastHitTime = this.state.time;
    const p = this.state.player;
    p.meter = clamp(p.meter + (kind === 'powerbomb' || kind === 'suplex' ? 15 : kind === 'special' ? 0 : 6), 0, 100);
    this.impact(enemy.x, enemy.y, '#ffcd79', down);
    this.floaters.push({ x: enemy.x, y: enemy.y, text: String(damage), life: 0.7, total: 0.7, color: '#ffe4a3' });
    this.event('hit', { enemy: enemy.id, damage, combo: this.state.combo, kind });
    if (enemy.hp <= 0) {
      this.state.kills++;
      this.state.score += enemy.boss ? 2000 : 500;
      enemy.deathTime = 0;
      this.event('kill', { enemy: enemy.id, boss: Boolean(enemy.boss), kills: this.state.kills });
    }
    return true;
  }

  damagePlayer(amount, direction = 1) {
    const p = this.state.player;
    if (p.invulnerable > 0 || ['grapple', 'special'].includes(p.action) || !alive(p)) return false;
    const damage = Math.round(amount);
    p.hp = Math.max(0, p.hp - damage);
    p.action = p.hp <= 0 ? 'dead' : 'hurt';
    p.actionTime = 0;
    p.actionDuration = 0.28;
    p.invulnerable = 0.8;
    p.vx = direction * 145;
    this.queuedAttack = false;
    this.state.combo = 0;
    this.impact(p.x, p.y, '#ff637a', false);
    this.audio.sfx('hurt');
    this.event('hurt', { hero: p.id, damage, hp: p.hp });
    if (p.hp <= 0) {
      if (!this.tag(true)) {
        this.state.status = 'gameover';
        this.state.objective = '두 영웅이 쓰러졌습니다.';
        this.audio.stop();
        this.event('gameover', { score: this.state.score, kills: this.state.kills });
        this.publish(true);
      }
    }
    return true;
  }

  clearWave() {
    if (this.state.wave === 3) {
      this.state.status = 'victory';
      this.state.progress = 1;
      this.state.objective = 'NIGHT PIER 클리어';
      this.state.score += Math.max(0, 1200 - Math.floor(this.state.time * 3));
      this.banner('STAGE CLEAR', 10);
      this.audio.stop();
      this.audio.sfx('victory');
      this.event('victory', { score: this.state.score, time: this.state.time, maxCombo: this.state.maxCombo });
      this.publish(true);
      return;
    }
    this.state.phase = 'advance';
    this.state.objective = '오른쪽으로 이동하세요.';
    for (const hero of this.state.team) {
      if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + 13);
    }
    this.audio.sfx('clear');
    this.banner('PATH OPEN / GO →', 2.2);
    this.event('waveClear', { wave: this.state.wave, message: '길이 열렸습니다. 오른쪽으로 이동!' });
  }

  banner(text, duration) {
    this.state.banner = text;
    this.state.bannerTime = duration;
  }

  event(type, details = {}) { this.onEvent({ type, ...details }); }

  publish(force = false) {
    if (force || this.state.time - this.publishTime >= 0.095) {
      this.publishTime = this.state.time;
      this.onUpdate(this.state);
    }
  }

  impact(x, y, color, heavy) {
    this.hitstop = Math.max(this.hitstop, heavy ? 0.065 : 0.025);
    if (!this.reducedMotion) this.shake = Math.max(this.shake, heavy ? 7 : 2.5);
    const count = this.reducedMotion ? 5 : heavy ? 19 : 9;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const velocity = 65 + this.random() * (heavy ? 230 : 115);
      this.particles.push({ x, y, ox: 0, oy: -BODY_HEIGHT * 0.45, vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 30, life: 0.22 + this.random() * 0.24, color, size: 2 + this.random() * 2 });
    }
    if (heavy) this.rings.push({ x, y, radius: 7, max: 115, life: 0.4, total: 0.4, color });
  }

  updateEffects(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.ox += particle.vx * dt;
      particle.oy += particle.vy * dt;
      particle.vy += 230 * dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      ring.radius = ring.max * (1 - ring.life / ring.total);
    }
    this.rings = this.rings.filter(ring => ring.life > 0);
    for (const floater of this.floaters) floater.life -= dt;
    this.floaters = this.floaters.filter(floater => floater.life > 0);
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || 420);
    this.height = Math.max(1, rect.height || 600);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
    this.render();
  }

  worldX(x) { return (x - this.camera) * this.width / VIEW_WIDTH; }
  floorY(lane) { return this.height * 0.62 + lane * this.height * 0.27; }
  bodyHeight(actor) { return Math.min(BODY_HEIGHT * this.width / VIEW_WIDTH, this.height * 0.28) * (actor.boss ? 1.15 : 1); }

  render() {
    const c = this.ctx;
    if (!c) return;
    c.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.save();
    if (this.shake > 0 && !this.reducedMotion) {
      c.translate(Math.sin(this.state.time * 142) * this.shake, Math.cos(this.state.time * 117) * this.shake * 0.45);
    }
    this.drawBackground();
    for (const ring of this.rings) {
      c.save();
      c.globalAlpha = ring.life / ring.total * 0.65;
      c.strokeStyle = ring.color;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(this.worldX(ring.x), this.floorY(ring.y), ring.radius * this.width / VIEW_WIDTH, ring.radius * 0.28, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    const actors = [...this.state.enemies, this.state.player].filter(actor => actor === this.state.player || actor.hp > 0 || actor.deathTime < 1.2);
    actors.sort((a, b) => a.y - b.y);
    const p = this.state.player;
    const grappleTarget = p.grapple?.target;
    for (const actor of actors) {
      if (actor === grappleTarget) continue;
      if (actor === p && p.action === 'grapple') this.drawGrapple(p);
      else this.drawFighter(actor);
    }
    this.drawForeground();
    this.drawEffects();
    c.restore();
    this.drawCanvasUI();
  }

  drawBackground() {
    const c = this.ctx, W = this.width, H = this.height;
    const sky = c.createLinearGradient(0, 0, 0, H * 0.65);
    sky.addColorStop(0, '#071523');
    sky.addColorStop(0.5, '#163245');
    sky.addColorStop(1, '#2b5660');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 73 + 21 - this.camera * 0.022) % (W + 10) + W + 10) % (W + 10);
      const sy = 22 + ((i * 31) % Math.max(45, H * 0.31));
      c.globalAlpha = 0.22 + (i % 4) * 0.1;
      c.fillStyle = '#d6e8e7';
      c.fillRect(sx, sy, i % 7 === 0 ? 2 : 1, 1.4);
    }
    c.globalAlpha = 1;
    const moonX = W * 0.79 - this.camera * 0.015, moonY = H * 0.17;
    const moonRadius = Math.min(27, W * 0.065);
    const halo = c.createRadialGradient(moonX, moonY, 3, moonX, moonY, moonRadius * 3.5);
    halo.addColorStop(0, '#b8e5e829'); halo.addColorStop(1, '#b8e5e800');
    c.fillStyle = halo;
    c.fillRect(moonX - moonRadius * 4, moonY - moonRadius * 4, moonRadius * 8, moonRadius * 8);
    c.fillStyle = '#cfddd3';
    c.beginPath(); c.arc(moonX, moonY, moonRadius, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#bdcec8';
    c.beginPath(); c.arc(moonX + moonRadius * 0.25, moonY - moonRadius * 0.16, moonRadius * 0.26, 0, Math.PI * 2); c.fill();
    // Far shore: the crane and warehouse silhouettes travel slowly behind the action.
    const horizon = H * 0.365;
    c.fillStyle = '#102832';
    for (let i = -1; i < 12; i++) {
      const bx = i * 74 - (this.camera * 0.075 % 74);
      const bh = 16 + ((i + 12) * 17 % 31);
      c.fillRect(bx, horizon - bh, 64, bh + 9);
      c.fillStyle = '#bd875b';
      if (i % 3 === 0) c.fillRect(bx + 17, horizon - bh + 10, 3, 4);
      c.fillStyle = '#102832';
    }
    c.strokeStyle = '#122832'; c.lineWidth = 3;
    const craneX = W * 0.36 - this.camera * 0.045;
    c.beginPath(); c.moveTo(craneX, horizon); c.lineTo(craneX, horizon - 58); c.lineTo(craneX + 93, horizon - 80);
    c.moveTo(craneX + 90, horizon - 79); c.lineTo(craneX + 90, horizon - 24); c.stroke();
    const water = c.createLinearGradient(0, horizon, 0, H * 0.63);
    water.addColorStop(0, '#204a54'); water.addColorStop(1, '#0b2631');
    c.fillStyle = water; c.fillRect(0, horizon + 3, W, H * 0.275);
    c.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const y = horizon + 13 + i * H * 0.009;
      const phase = this.reducedMotion ? 0 : Math.sin(this.state.time * 0.7 + i * 1.2) * 8;
      c.strokeStyle = i % 3 === 0 ? '#76b2b332' : '#80abb51a';
      c.beginPath();
      const x = ((i * 77 - this.camera * 0.13 + phase) % (W + 100) + W + 100) % (W + 100) - 50;
      c.moveTo(x, y); c.lineTo(x + 30 + (i % 5) * 11, y); c.stroke();
      if (i < 17) {
        c.strokeStyle = '#c7d9c126';
        c.beginPath(); c.moveTo(moonX - 8 - i * 1.7 + phase, y); c.lineTo(moonX + 8 + i * 1.7 + phase, y); c.stroke();
      }
    }
    this.drawPierArchitecture();
    // Perspective planks. The playable depth remains visibly broad on portrait screens.
    const deckTop = H * 0.615;
    const deck = c.createLinearGradient(0, deckTop, 0, H);
    deck.addColorStop(0, '#4a463d'); deck.addColorStop(1, '#282b2b');
    c.fillStyle = deck; c.fillRect(0, deckTop, W, H - deckTop);
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const y = deckTop + t * t * (H - deckTop);
      c.strokeStyle = i % 2 ? '#75655247' : '#0e191b8a';
      c.lineWidth = i % 2 ? 1 : 2;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.strokeStyle = '#131e2180'; c.lineWidth = 1;
    for (let i = -6; i < 14; i++) {
      const x = i * 58 - (this.camera * W / VIEW_WIDTH % 58);
      c.beginPath(); c.moveTo(W / 2 + (x - W / 2) * 0.66, deckTop); c.lineTo(x, H); c.stroke();
    }
    const sheen = c.createLinearGradient(0, deckTop, 0, H);
    sheen.addColorStop(0, '#b8a47614'); sheen.addColorStop(0.65, '#a0c9c50a'); sheen.addColorStop(1, '#020b1340');
    c.fillStyle = sheen; c.fillRect(0, deckTop, W, H - deckTop);
    this.drawLamps();
  }

  drawPierArchitecture() {
    const c = this.ctx, H = this.height, s = this.width / VIEW_WIDTH;
    // Existing stage props are kept off the combat lane.
    const railY = H * 0.595;
    c.strokeStyle = '#132a2d'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, railY - 17); c.lineTo(this.width, railY - 17); c.stroke();
    c.strokeStyle = '#567378'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, railY - 20); c.lineTo(this.width, railY - 20); c.stroke();
    for (let i = -1; i < 34; i++) {
      const x = this.worldX(i * 88);
      if (x < -15 || x > this.width + 15) continue;
      c.fillStyle = '#172b2b'; c.fillRect(x, railY - 38, 8 * s, 44);
      c.fillStyle = '#6a7d75'; c.fillRect(x - 1, railY - 39, 10 * s, 3);
    }
    for (const [x, label, width] of [[680, 'FISH MARKET', 270], [1390, 'WAREHOUSE 09', 310], [2290, 'NIGHT TERMINAL', 310]]) {
      const sx = this.worldX(x), sy = H * 0.44, sw = width * s;
      if (sx < -sw - 30 || sx > this.width + 30) continue;
      const sh = H * 0.15;
      c.fillStyle = '#193236'; c.fillRect(sx, sy, sw, sh);
      c.fillStyle = '#10292e';
      c.beginPath(); c.moveTo(sx - 10, sy); c.lineTo(sx + sw / 2, sy - 22); c.lineTo(sx + sw + 10, sy); c.closePath(); c.fill();
      c.fillStyle = '#bba886'; c.fillRect(sx + 20 * s, sy + 20, 60 * s, 24);
      c.fillStyle = '#d7bd73'; c.globalAlpha = 0.4; c.fillRect(sx + 23 * s, sy + 23, 54 * s, 18); c.globalAlpha = 1;
      c.fillStyle = '#0b1e23'; c.fillRect(sx + sw * 0.56, sy + 21, sw * 0.28, sh - 20);
      c.strokeStyle = '#2a4344'; c.lineWidth = 2;
      for (let l = 0; l < 5; l++) {
        c.beginPath(); c.moveTo(sx + sw * 0.56, sy + 28 + l * 10); c.lineTo(sx + sw * 0.84, sy + 28 + l * 10); c.stroke();
      }
      c.fillStyle = '#92b9b7'; c.font = `700 ${Math.max(9, 10 * s)}px monospace`; c.fillText(label, sx + 12 * s, sy + 13);
    }
    for (const x of [295, 760, 1490, 2230]) {
      const sx = this.worldX(x);
      if (sx < -80 || sx > this.width + 80) continue;
      c.fillStyle = '#4d534c'; c.fillRect(sx, H * 0.576 - 34 * s, 46 * s, 32 * s);
      c.strokeStyle = '#8b866c'; c.lineWidth = 2;
      c.strokeRect(sx, H * 0.576 - 34 * s, 46 * s, 32 * s);
      c.beginPath(); c.moveTo(sx, H * 0.576 - 34 * s); c.lineTo(sx + 46 * s, H * 0.576 - 2 * s);
      c.moveTo(sx + 46 * s, H * 0.576 - 34 * s); c.lineTo(sx, H * 0.576 - 2 * s); c.stroke();
    }
  }

  drawLamps() {
    const c = this.ctx, H = this.height, s = this.width / VIEW_WIDTH;
    for (const x of [90, 560, 940, 1410, 1775, 2220]) {
      const sx = this.worldX(x);
      if (sx < -160 || sx > this.width + 160) continue;
      const top = H * 0.365, bottom = H * 0.64;
      const glow = c.createRadialGradient(sx + 16 * s, top + 9, 0, sx + 16 * s, top + 9, 77 * s);
      glow.addColorStop(0, '#f7c98134'); glow.addColorStop(1, '#f7c98100');
      c.fillStyle = glow; c.fillRect(sx - 70 * s, top - 70 * s, 180 * s, 180 * s);
      c.fillStyle = '#f6c77c08';
      c.beginPath(); c.moveTo(sx + 10 * s, top + 8); c.lineTo(sx - 80 * s, bottom + 100 * s); c.lineTo(sx + 105 * s, bottom + 100 * s); c.closePath(); c.fill();
      c.strokeStyle = '#172c2e'; c.lineWidth = 6 * s;
      c.beginPath(); c.moveTo(sx, bottom); c.lineTo(sx, top + 4); c.quadraticCurveTo(sx, top - 7, sx + 18 * s, top - 2); c.stroke();
      c.strokeStyle = '#607471'; c.lineWidth = 1 * s;
      c.beginPath(); c.moveTo(sx - 2 * s, bottom); c.lineTo(sx - 2 * s, top + 4); c.stroke();
      c.fillStyle = '#233c3c'; c.fillRect(sx + 7 * s, top - 3, 21 * s, 7);
      c.fillStyle = '#f8d596'; c.fillRect(sx + 10 * s, top + 4, 15 * s, 4);
      c.fillStyle = '#b69e6330';
      c.beginPath(); c.ellipse(sx + 8, bottom + H * 0.10, 74 * s, 17 * s, 0, 0, Math.PI * 2); c.fill();
    }
  }

  drawFighter(actor, transform = null, anchor = actor, forcedPose) {
    const c = this.ctx;
    const sprite = this.sprites.get(actor.id);
    if (!sprite) return;
    const s = this.width / VIEW_WIDTH;
    const height = this.bodyHeight(actor);
    const centerX = this.worldX(anchor.x) + (transform?.x ?? 0) * height * anchor.facing;
    const footY = this.floorY(anchor.y);
    const centerY = footY - height * 0.5 - (transform?.z ?? actor.z ?? 0) * height;
    if (centerX < -height || centerX > this.width + height) return;
    const dead = actor.hp <= 0 && actor.action !== 'grabbed';
    const fade = dead ? clamp(1.4 - actor.deathTime, 0, 1) : 1;
    if (fade <= 0) return;
    c.save();
    c.globalAlpha = fade;
    c.fillStyle = '#03101963';
    c.beginPath();
    c.ellipse(centerX, footY + 1, height * 0.30, height * 0.067, 0, 0, Math.PI * 2);
    c.fill();
    if (actor === this.state.player) {
      c.strokeStyle = actor.grabReady ? '#fac66eaa' : '#72d8e672';
      c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(centerX, footY + 1, height * 0.35, height * 0.085, 0, 0, Math.PI * 2); c.stroke();
    }
    const action = actor.action;
    if (action === 'attack' && actor.role === 'enemy' && !actor.attackHit) {
      const flash = 0.4 + Math.sin(this.state.time * 18) * 0.14;
      c.strokeStyle = `rgba(249,111,122,${flash})`;
      c.lineWidth = actor.boss ? 4 : 2;
      c.beginPath(); c.ellipse(centerX, footY, height * (actor.boss ? 0.58 : 0.43), height * 0.11, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ff9aa0'; c.font = `900 ${16 * s}px sans-serif`; c.textAlign = 'center';
      c.fillText('!', centerX, centerY - height * 0.57);
    }
    c.save();
    c.translate(centerX, centerY);
    const down = ['dead', 'down'].includes(action);
    let angle = transform?.angle ?? (down ? actor.facing * 1.38 : 0);
    let scaleX = transform?.scaleX ?? 1;
    let scaleY = transform?.scaleY ?? 1;
    if (!transform) {
      if (down) c.translate(0, height * 0.3);
      if (action === 'idle' && !this.reducedMotion) {
        const breath = Math.sin(this.state.time * 3.7 + actor.x) * 0.01;
        scaleY += breath; c.translate(0, -breath * height * 0.5);
      }
      if (action === 'hurt') angle = -actor.facing * 0.13;
      if (action === 'attack' && actor.role === 'hero') {
        const snap = Math.sin(clamp(actor.actionTime / actor.actionDuration, 0, 1) * Math.PI);
        c.translate(actor.facing * snap * 11 * s, 0);
        angle = actor.facing * snap * 0.12;
      }
      if (action === 'special') angle = actor.id === 'nova' ? Math.sin(actor.actionTime * 18) * 0.25 : Math.sin(actor.actionTime * 8) * 0.12;
    }
    c.rotate(angle * (transform ? anchor.facing : 1));
    c.scale((transform ? anchor.facing : actor.facing) * scaleX, scaleY);
    if (actor.invulnerable > 0 && action === 'hurt' && Math.floor(this.state.time * 20) % 2) c.globalAlpha *= 0.6;
    const walking = action === 'walk' && !transform && sprite.run && sprite.metadata.runFrames;
    if (walking) {
      const metadata = sprite.metadata;
      const frame = metadata.runFrames[Math.floor(actor.walkTime * (metadata.runFps || 10)) % metadata.runFrames.length];
      const scale = height / (metadata.runBodyHeight || 216);
      const pivot = frame.pivot || [frame.width / 2, frame.height * 0.95];
      c.drawImage(sprite.run, frame.x, frame.y, frame.width, frame.height,
        -pivot[0] * scale, height * 0.5 - pivot[1] * scale, frame.width * scale, frame.height * scale);
    } else {
      const pose = forcedPose ?? transform?.pose ?? (['attack', 'special', 'jump', 'grapple'].includes(action) ? 1 : ['hurt', 'down', 'dead', 'grabbed'].includes(action) ? 2 : 0);
      const extraPose = pose >= 3 && sprite.grapple && sprite.metadata.grappleFrames?.find(frame => frame.pose === pose);
      if (extraPose) {
        const scale = height / (sprite.metadata.grappleBodyHeight || extraPose.height);
        const pivot = extraPose.pivot || [extraPose.width / 2, extraPose.height];
        c.drawImage(sprite.grapple, extraPose.x, extraPose.y, extraPose.width, extraPose.height,
          -pivot[0] * scale, height * 0.5 - pivot[1] * scale, extraPose.width * scale, extraPose.height * scale);
      } else {
        const frame = sprite.metadata.frames[clamp(pose, 0, sprite.metadata.frames.length - 1)];
        const frameWidth = height * frame.width / frame.height;
        c.drawImage(sprite.image, frame.x, frame.y, frame.width, frame.height, -frameWidth / 2, -height / 2, frameWidth, height);
      }
    }
    c.restore();
    if (!transform && actor.hp > 0 && actor.role === 'enemy') {
      const barWidth = height * 0.52;
      const barY = centerY - height * 0.61;
      c.fillStyle = '#07131dbb'; c.fillRect(centerX - barWidth / 2 - 2, barY - 2, barWidth + 4, 7);
      c.fillStyle = actor.boss ? '#d49aec' : '#d3a779'; c.fillRect(centerX - barWidth / 2, barY, barWidth * actor.hp / actor.maxHp, 3);
      c.fillStyle = '#e9e3d2'; c.font = `700 ${Math.max(8, 9 * s)}px monospace`; c.textAlign = 'center';
      c.fillText(actor.name, centerX, barY - 6);
    }
    if (!transform && actor === this.state.player) {
      c.fillStyle = actor.color;
      c.beginPath(); c.moveTo(centerX - 5, centerY - height * 0.69); c.lineTo(centerX + 5, centerY - height * 0.69);
      c.lineTo(centerX, centerY - height * 0.61); c.closePath(); c.fill();
    }
    if (['attack', 'jump', 'special'].includes(action) && actor.role === 'hero' && !transform) this.drawAttackArc(actor, centerX, footY, height);
    c.restore();
  }

  drawGrapple(p) {
    const sampled = sampleMotion(p.grapple.clip, p.actionTime);
    const victim = p.grapple.target;
    if (!sampled) {
      this.drawFighter(victim, { x: 0.58, z: 0.6, angle: Math.PI, pose: 2 }, p);
      this.drawFighter(p, { x: 0, z: 0, angle: 0, pose: 1 }, p);
      return;
    }
    if (sampled.victim.z > 0.7) {
      this.drawFighter(p, sampled.hero, p);
      this.drawFighter(victim, sampled.victim, p);
    } else {
      this.drawFighter(victim, sampled.victim, p);
      this.drawFighter(p, sampled.hero, p);
    }
  }

  drawAttackArc(actor, x, y, height) {
    const c = this.ctx;
    const phase = clamp(actor.actionTime / actor.actionDuration, 0, 1);
    if (phase > 0.7 || phase < 0.15) return;
    c.save();
    c.translate(x, y - height * 0.55 - actor.z * height);
    c.scale(actor.facing, 1);
    c.globalAlpha *= Math.sin(phase * Math.PI) * 0.75;
    c.strokeStyle = actor.id === 'atlas' ? '#ffc87c' : '#adf5fc';
    c.shadowColor = c.strokeStyle; c.shadowBlur = 10;
    c.lineWidth = actor.action === 'special' ? 6 : 3;
    c.beginPath(); c.arc(height * 0.2, 0, height * (actor.action === 'special' ? 0.72 : 0.43), -1.1 + phase, 1 + phase); c.stroke();
    c.shadowBlur = 0;
    c.restore();
  }

  drawForeground() {
    const c = this.ctx, H = this.height;
    const shade = c.createLinearGradient(0, H * 0.8, 0, H);
    shade.addColorStop(0, '#020b1200'); shade.addColorStop(1, '#020b124f');
    c.fillStyle = shade; c.fillRect(0, H * 0.8, this.width, H * 0.2);
    c.strokeStyle = '#cbad6333'; c.lineWidth = 1;
    c.setLineDash([6, 14]);
    c.beginPath(); c.moveTo(0, H * 0.92); c.lineTo(this.width, H * 0.92); c.stroke(); c.setLineDash([]);
  }

  drawEffects() {
    const c = this.ctx, scale = this.width / VIEW_WIDTH;
    for (const particle of this.particles) {
      c.save();
      c.globalAlpha = Math.min(1, particle.life * 4);
      c.strokeStyle = particle.color;
      c.lineWidth = particle.size;
      const x = this.worldX(particle.x) + particle.ox * scale;
      const y = this.floorY(particle.y) + particle.oy * scale;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - particle.vx * 0.022 * scale, y - particle.vy * 0.022 * scale); c.stroke();
      c.restore();
    }
    c.textAlign = 'center';
    for (const floater of this.floaters) {
      c.save();
      c.globalAlpha = Math.min(1, floater.life * 3);
      c.fillStyle = floater.color;
      c.font = `900 ${Math.max(14, 19 * scale)}px monospace`;
      c.strokeStyle = '#112c32'; c.lineWidth = 3;
      const x = this.worldX(floater.x), y = this.floorY(floater.y) - BODY_HEIGHT * scale * 0.9 - (1 - floater.life / floater.total) * 40;
      c.strokeText(floater.text, x, y); c.fillText(floater.text, x, y);
      c.restore();
    }
  }

  drawCanvasUI() {
    const c = this.ctx, W = this.width, H = this.height;
    c.save();
    c.textAlign = 'left';
    c.font = '700 10px monospace';
    c.fillStyle = '#a3bebaa6'; c.fillText('SOUTH DOCK · 23:48', 15, 24);
    c.textAlign = 'right'; c.fillText(`SECTOR 0${this.state.wave}`, W - 15, 24);
    if (this.state.phase === 'advance' && this.state.status === 'playing') {
      const offset = this.reducedMotion ? 0 : Math.sin(this.state.time * 4) * 4;
      c.textAlign = 'right'; c.font = '900 23px monospace';
      c.fillStyle = '#f4d397'; c.shadowColor = '#f4d39766'; c.shadowBlur = 16;
      c.fillText('GO ››', W - 22 + offset, H * 0.49);
      c.shadowBlur = 0; c.font = '700 10px sans-serif'; c.fillStyle = '#d6ded3';
      c.fillText('오른쪽으로 이동', W - 24, H * 0.49 + 19);
    }
    const p = this.state.player;
    if (p.grabReady && this.state.status === 'playing' && ['walk', 'idle'].includes(p.action)) {
      c.textAlign = 'center'; c.font = '800 10px sans-serif'; c.fillStyle = '#f9d38c';
      c.fillText('잡기 가능', this.worldX(p.x), this.floorY(p.y) + 21);
    }
    if (this.state.banner && this.state.status === 'playing') {
      const text = this.state.banner;
      const y = H * 0.30;
      c.font = `900 ${text.length > 18 ? 17 : 23}px monospace`; c.textAlign = 'center';
      const width = Math.min(W - 30, c.measureText(text).width + 36);
      c.fillStyle = '#071b26c9'; c.fillRect((W - width) / 2, y - 25, width, 45);
      c.fillStyle = '#dfb779'; c.fillRect((W - width) / 2, y - 25, 3, 45);
      c.fillStyle = '#eee4cc'; c.fillText(text, W / 2, y + 4);
    }
    if (this.state.status === 'ready') {
      c.fillStyle = '#08172728'; c.fillRect(0, 0, W, H);
    }
    c.restore();
  }

  destroy() {
    this.destroyed = true;
    if (this.raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObserver?.disconnect();
    globalThis.removeEventListener?.('resize', this.boundResize);
    this.audio.destroy();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`캐릭터 이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

export const GAME_CONSTANTS = { stageLength: STAGE_LENGTH, viewWidth: VIEW_WIDTH, bodyHeight: BODY_HEIGHT, waves: WAVES };
