import './style.css';
import { ROSTER, HEROES, ENEMIES } from './roster.js';
import { Game } from './game.js';

const base = import.meta.env.BASE_URL;
const url = path => `${base}${path.replace(/^\//, '')}`;
const icon = (name, cls = '') => `<img class="icon ${cls}" src="${url(`icons/${name}.svg`)}" alt="" draggable="false">`;
const art = hero => url(hero.portrait || `assets/portraits/${hero.id}.webp`);
const $ = selector => document.querySelector(selector);
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(`night-pier-${key}`)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(`night-pier-${key}`, JSON.stringify(value)); } catch {} },
};
let selected = storage.read('hero', 'atlas');
if (!HEROES.some(hero => hero.id === selected)) selected = HEROES[0].id;
let muted = storage.read('muted', false);
let reduced = storage.read('reduced', window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let theme = storage.read('theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
let game, loaded = false, loadError, currentScreen = 'lobby', terminalHandled = false;
const held = new Set(), keys = new Set();
let repeatTimer, actionPointer;

document.documentElement.dataset.theme = theme;
document.documentElement.dataset.reduced = String(reduced);
$('#app').innerHTML = `
  <main class="shell" data-ui>
    <header class="masthead">
      <a class="wordmark" href="#" aria-label="SLAY 홈">SLAY<span>ARCADE</span></a>
      <div class="utility">
        <button class="icon-button" id="sound" aria-label="${muted ? '소리 켜기' : '소리 끄기'}" aria-pressed="${!muted}">${icon(muted ? 'speaker-slash' : 'speaker-high')}</button>
        <button class="icon-button" id="theme" aria-label="화면 테마 바꾸기">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="icon-button" id="help" aria-label="조작법 보기">${icon('question')}</button>
      </div>
    </header>

    <section id="lobby" class="lobby" aria-labelledby="title">
      <div class="intro">
        <div class="stage-label"><span class="line"></span> 벨트스크롤 액션</div>
        <h1 id="title">NIGHT<br><span>PIER</span><i>밤의 부두</i></h1>
        <p class="intro-copy">한밤의 부두. 두 명의 파이터.<br>붙잡고, 들어 올리고, 끝내라.</p>
        <div class="stage-summary"><span>STAGE 01</span><strong>부두의 마지막 불빛</strong><span class="enemy-count">8 ENEMIES</span></div>
        <div class="stage-route" aria-label="스테이지 진행 구간"><span>진입로</span><i></i><span>하역장</span><i></i><span>끝 부두</span></div>
      </div>

      <div class="selection">
        <div class="select-heading"><h2>선봉을 선택하세요</h2><span>전투 중 교대 가능</span></div>
        <div class="fighters">${HEROES.map((hero, index) => `
          <button class="fighter ${hero.id === selected ? 'selected' : ''}" data-hero="${hero.id}" aria-pressed="${hero.id === selected}" style="--fighter:${hero.color}">
            <span class="fighter-no">0${index + 1}</span><span class="selected-marker">${icon('lightning')}선봉</span>
            <div class="fighter-art"><div class="fighter-backdrop"></div><img src="${art(hero)}" alt="${hero.ko}" draggable="false"></div>
            <div class="fighter-info"><span class="fighter-en">${hero.name}</span><h3>${hero.ko}</h3><span class="fighter-role">${hero.id === 'atlas' ? '파워밤 스페셜리스트' : '스플렉스 스페셜리스트'}</span></div>
            <div class="fighter-skill">${hero.id === 'atlas' ? '들어 올려, 내려꽂는다' : '뒤로 넘겨, 제압한다'}</div>
          </button>`).join('')}
        </div>
        <button class="start-button" id="start" disabled><span id="start-label">캐릭터 준비 중</span>${icon('arrow-right')}</button>
        <div class="launch-meta"><span id="asset-status">SD 캐릭터와 모션을 불러오는 중</span><span>BEST <b id="best-score">${String(storage.read('best', 0)).padStart(6, '0')}</b></span></div>
      </div>
      <div class="enemy-roster"><span>오늘 밤의 상대</span><div>${ENEMIES.map(enemy => `<figure><img src="${art(enemy)}" alt="${enemy.ko}" draggable="false"><figcaption>${enemy.ko}${enemy.id === 'onyx' ? '<small>BOSS</small>' : ''}</figcaption></figure>`).join('')}</div></div>
      <footer class="lobby-footer"><span>${icon('game-controller')} 터치 · 키보드 지원</span><span>POWERBOMB / SUPLEX</span></footer>
    </section>

    <section id="arena" class="arena hidden" aria-label="밤의 부두 게임">
      <div class="hud">
        <div class="player-hud"><img id="hud-portrait" alt="" draggable="false"><div class="player-stats"><div class="hud-name"><strong id="hud-name">ATLAS</strong><span id="health-number">100</span></div><div class="health-track" role="meter" aria-label="체력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="health-fill"></i></div><div class="meter-row"><span>SPECIAL</span><div class="special-track"><i id="special-fill"></i></div></div></div></div>
        <div class="score-hud"><small>SCORE</small><strong id="score">000000</strong><button class="icon-button" id="pause" aria-label="일시정지">${icon('pause')}</button></div>
      </div>
      <div class="stage-bar"><span id="objective">진입로를 정리하세요</span><span><b id="kills">0</b> / 8</span></div>
      <div class="viewport"><canvas id="game-canvas" tabindex="0" aria-label="이동은 방향키 또는 WASD. J 공격, K 잡기, L 필살기, 스페이스 점프, Q 교대, Escape 일시정지."></canvas><div class="game-toast" id="game-toast" aria-live="polite"></div><div class="combo-display" id="combo-display"><b id="combo">0</b><span>HITS</span></div><div class="stage-progress"><i id="progress-fill"></i></div></div>
      <div class="controls">
        <div class="movement"><div class="joystick" id="joystick" role="group" aria-label="이동 조이스틱"><span class="joy-arrow joy-up">↑</span><span class="joy-arrow joy-left">←</span><span class="joy-arrow joy-right">→</span><span class="joy-arrow joy-down">↓</span><div class="joy-knob" id="joy-knob"></div></div><span class="control-caption">이동 <kbd>WASD</kbd></span></div>
        <div class="actions"><button class="action-button jump" data-action="jump" aria-label="점프, 스페이스"><span>점프</span><kbd>SPACE</kbd></button><button class="action-button grab" data-action="grab" aria-label="잡기 기술, K"><span>잡기</span><kbd>K</kbd></button><button class="action-button special" data-action="special" aria-label="필살기, L"><span>필살기</span><kbd>L</kbd></button><button class="action-button attack" data-action="attack" aria-label="공격, J"><span>공격</span><kbd>J</kbd></button></div>
        <button class="tag-button" data-action="tag" aria-label="파트너 교대, Q"><img id="partner-portrait" alt="" draggable="false"><span>교대 <kbd>Q</kbd></span><i id="partner-health"></i></button>
      </div>
      <div class="combat-tip" id="combat-tip">가까이 붙어서 잡기 버튼을 누르세요</div>
    </section>

    <dialog id="help-dialog" class="dialog">
      <button class="dialog-close icon-button" data-close aria-label="닫기">${icon('x')}</button><span class="dialog-label">HOW TO PLAY</span><h2>거리 좁히고,<br>크게 한 방.</h2>
      <p>조이스틱으로 좌우·위아래 이동하세요. 적과 같은 높이에서 공격이 맞습니다.</p>
      <div class="help-rows"><div><b>공격 <kbd>J</kbd></b><span>길게 눌러 3단 콤보</span></div><div><b>잡기 <kbd>K</kbd></b><span>근접한 적에게 파워밤 / 스플렉스</span></div><div><b>필살기 <kbd>L</kbd></b><span>게이지를 모아 강력한 광역 기술</span></div><div><b>점프 <kbd>SPACE</kbd></b><span>공격을 피해 점프 킥</span></div><div><b>교대 <kbd>Q</kbd></b><span>아틀라스와 노바를 즉시 교대</span></div></div>
      <p class="help-note">파트너마다 체력이 따로 있습니다. 두 명 모두 쓰러지면 게임 오버. 적 8명을 전부 제압하면 클리어!</p>
      <label class="setting-row" for="reduce-effects"><span>화면 흔들림과 섬광 줄이기</span><input type="checkbox" id="reduce-effects" ${reduced ? 'checked' : ''}></label>
      <button class="secondary-button" data-close>준비 완료</button>
    </dialog>

    <dialog id="pause-dialog" class="dialog compact-dialog"><span class="dialog-label">PAUSED</span><h2>잠시 숨 고르기</h2><p>밤의 부두가 기다리고 있습니다.</p><button class="start-button" id="resume">계속하기 ${icon('play')}</button><button class="secondary-button" id="restart">처음부터 다시</button><button class="text-button" id="return-home">캐릭터 선택으로</button></dialog>
    <dialog id="result-dialog" class="dialog result-dialog"><div class="result-icon">${icon('trophy')}</div><span class="dialog-label" id="result-label">STAGE CLEAR</span><h2 id="result-title">부두를 되찾았다.</h2><p id="result-desc"></p><div class="result-score"><span>FINAL SCORE</span><strong id="result-score">000000</strong></div><div class="result-details"><div><span>제압</span><b id="result-kills">8 / 8</b></div><div><span>최대 콤보</span><b id="result-combo">0 HITS</b></div><div><span>시간</span><b id="result-time">00:00</b></div></div><button class="start-button" id="play-again">한 번 더 ${icon('arrow-clockwise')}</button><button class="text-button" id="result-home">캐릭터 선택으로</button></dialog>
    <div class="announcer" id="announcer" role="status" aria-live="polite"></div>
  </main>`;

// Suppress selection/callouts on non-editable UI without cancelling taps,
// scrolling, pinch zoom, pointer capture, keyboard access, or native controls.
const editable = target => target instanceof Element && !!target.closest('input,textarea,select,option,[contenteditable=""],[contenteditable="true"],[data-allow-selection]');
for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(type, event => {
    if (!editable(event.target) && event.target instanceof Element && event.target.closest('[data-ui]')) event.preventDefault();
  });
}

function selectHero(id) {
  selected = id; storage.write('hero', id);
  document.querySelectorAll('[data-hero]').forEach(button => {
    const active = button.dataset.hero === id;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => selectHero(button.dataset.hero)));
$('.wordmark').addEventListener('click', event => { event.preventDefault(); if (currentScreen === 'lobby') return; pauseGame(); });
$('#theme').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; storage.write('theme', theme);
  document.documentElement.dataset.theme = theme; $('#theme').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
});
$('#sound').addEventListener('click', () => {
  muted = !muted; storage.write('muted', muted); game?.setMuted(muted);
  $('#sound').innerHTML = icon(muted ? 'speaker-slash' : 'speaker-high');
  $('#sound').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); $('#sound').setAttribute('aria-pressed', String(!muted));
});

let helpResume = false;
$('#help').addEventListener('click', () => {
  helpResume = game?.state.status === 'playing';
  if (helpResume) { resetInput(); game.pause(true); }
  $('#help-dialog').showModal();
});
$('#help-dialog').addEventListener('close', () => { if (helpResume) { game.pause(false); helpResume = false; } });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#reduce-effects').addEventListener('change', event => {
  reduced = event.target.checked; storage.write('reduced', reduced);
  document.documentElement.dataset.reduced = String(reduced); if (game) game.reducedMotion = reduced;
});

function resetInput() {
  held.clear(); keys.clear(); clearInterval(repeatTimer); repeatTimer = undefined; actionPointer = undefined;
  game?.setMove(0, 0); $('#joy-knob').style.transform = ''; joystickPointer = undefined;
  document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
}
function start() {
  if (!loaded) return;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); resetInput();
  currentScreen = 'arena'; terminalHandled = false;
  $('#lobby').classList.add('hidden'); $('#arena').classList.remove('hidden');
  document.body.classList.add('in-game'); $('.shell').classList.add('playing');
  game.reducedMotion = reduced; game.setMuted(muted); game.start(selected);
  requestAnimationFrame(() => { game.resize?.(); $('#game-canvas').focus({ preventScroll: true }); });
}
function home() {
  helpResume = false; resetInput(); game.pause(true);
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  currentScreen = 'lobby'; $('#lobby').classList.remove('hidden'); $('#arena').classList.add('hidden');
  document.body.classList.remove('in-game'); $('.shell').classList.remove('playing');
  $('#start').focus({ preventScroll: true });
}
function pauseGame() {
  if (game?.state.status !== 'playing') return;
  resetInput(); game.pause(true); $('#pause-dialog').showModal();
}
$('#start').addEventListener('click', () => loadError ? loadGame() : start());
$('#pause').addEventListener('click', pauseGame);
$('#resume').addEventListener('click', () => { $('#pause-dialog').close(); game.pause(false); $('#game-canvas').focus(); });
$('#pause-dialog').addEventListener('cancel', event => { event.preventDefault(); $('#resume').click(); });
$('#restart').addEventListener('click', start); $('#play-again').addEventListener('click', start);
$('#return-home').addEventListener('click', home); $('#result-home').addEventListener('click', home);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => { resetInput(); pauseGame(); });

let lastHero, toastTimer;
function update(state) {
  if (!state.player) return;
  const player = state.player, partner = state.team?.find(hero => hero.id !== player.id);
  if (lastHero !== player.id) {
    const hero = ROSTER.find(hero => hero.id === player.id); lastHero = player.id;
    $('#hud-name').textContent = hero?.name || player.id.toUpperCase(); $('#hud-portrait').src = art(hero || player);
    $('#partner-portrait').src = art(ROSTER.find(hero => hero.id === partner?.id) || HEROES.find(hero => hero.id !== player.id));
    $('#combat-tip').textContent = player.id === 'atlas' ? '가까이 붙어서 잡기: 파워밤' : '가까이 붙어서 잡기: 저먼 스플렉스';
  }
  const hp = Math.max(0, player.hp / (player.maxHp || 100) * 100);
  $('#health-fill').style.width = `${hp}%`; $('#health-number').textContent = Math.ceil(player.hp);
  $('.health-track').setAttribute('aria-valuenow', String(Math.ceil(hp)));
  const meter = Math.max(0, Math.min(100, player.meter / (player.maxMeter || 100) * 100));
  $('#special-fill').style.width = `${meter}%`; $('[data-action="special"]').classList.toggle('charged', meter >= 45);
  $('#partner-health').style.width = `${Math.max(0, (partner?.hp || 0) / (partner?.maxHp || 100) * 100)}%`;
  $('[data-action="tag"]').classList.toggle('unavailable', !partner?.hp);
  $('#score').textContent = String(state.score || 0).padStart(6, '0'); $('#kills').textContent = state.kills || 0;
  $('#objective').textContent = state.objective || '부두의 적을 제압하세요';
  $('#progress-fill').style.width = `${(state.progress || 0) * 100}%`;
  $('#combo').textContent = state.combo || 0; $('#combo-display').classList.toggle('visible', state.combo >= 2);
  if (['victory', 'gameover'].includes(state.status) && !terminalHandled) {
    terminalHandled = true; resetInput(); setTimeout(() => showResult(state), 650);
  }
}
function showResult(state) {
  const victory = state.status === 'victory';
  $('#result-label').textContent = victory ? 'STAGE CLEAR' : 'GAME OVER';
  $('#result-title').textContent = victory ? '부두를 되찾았다.' : '아직 끝이 아니다.';
  $('#result-desc').textContent = victory ? '여덟 명을 제압했습니다. 오늘 밤의 승자는 당신입니다.' : '두 파이터가 모두 쓰러졌습니다. 교대를 활용해 다시 도전하세요.';
  $('#result-score').textContent = String(state.score || 0).padStart(6, '0');
  $('#result-kills').textContent = `${state.kills || 0} / 8`; $('#result-combo').textContent = `${state.maxCombo || state.bestCombo || 0} HITS`;
  const seconds = Math.floor(state.time || 0); $('#result-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (state.score > storage.read('best', 0)) { storage.write('best', state.score); $('#best-score').textContent = String(state.score).padStart(6, '0'); }
  $('#result-dialog').showModal();
}
function onEvent(event) {
  if (event.message || event.text) {
    $('#game-toast').textContent = event.message || event.text; $('#game-toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#game-toast').classList.remove('visible'), 2100);
  }
  if (['wave', 'tag', 'victory', 'gameover'].includes(event.type)) $('#announcer').textContent = event.message || event.text || event.type;
}

let joystickPointer;
const joystick = $('#joystick');
function joystickMove(event) {
  if (event.pointerId !== joystickPointer) return;
  const rect = joystick.getBoundingClientRect(), radius = rect.width * .33;
  let x = (event.clientX - rect.left - rect.width / 2) / radius;
  let y = (event.clientY - rect.top - rect.height / 2) / radius;
  const magnitude = Math.hypot(x, y); if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  $('#joy-knob').style.transform = `translate(${x * radius}px,${y * radius}px)`;
  game?.setMove(Math.abs(x) > .1 ? x : 0, Math.abs(y) > .1 ? y : 0);
}
joystick.addEventListener('pointerdown', event => { if (joystickPointer !== undefined) return; joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); joystickMove(event); });
joystick.addEventListener('pointermove', joystickMove);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, event => {
  if (event.pointerId === joystickPointer) { joystickPointer = undefined; $('#joy-knob').style.transform = ''; game?.setMove(0, 0); }
});
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (game?.state.status !== 'playing') return;
    button.setPointerCapture(event.pointerId); button.classList.add('pressed'); game.action(button.dataset.action);
    if (button.dataset.action === 'attack') { clearInterval(repeatTimer); actionPointer = event.pointerId; repeatTimer = setInterval(() => game.action('attack'), 160); }
  });
  const release = event => {
    button.classList.remove('pressed');
    if (event.pointerId === actionPointer) { clearInterval(repeatTimer); actionPointer = undefined; }
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
  button.addEventListener('click', event => { if (event.detail === 0) game?.action(button.dataset.action); });
});
const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const actionKeys = { KeyJ: 'attack', KeyK: 'grab', KeyL: 'special', Space: 'jump', KeyQ: 'tag' };
function keyboardMove() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const length = Math.hypot(x, y) || 1; game?.setMove(x / length, y / length);
}
window.addEventListener('keydown', event => {
  if (editable(event.target) || currentScreen !== 'arena' || $('dialog[open]')) return;
  if (event.code === 'Escape') { event.preventDefault(); pauseGame(); return; }
  if (movementKeys.includes(event.code)) { event.preventDefault(); keys.add(event.code); keyboardMove(); }
  if (actionKeys[event.code]) { event.preventDefault(); if (!event.repeat || event.code === 'KeyJ') game?.action(actionKeys[event.code]); }
});
window.addEventListener('keyup', event => { if (movementKeys.includes(event.code)) { keys.delete(event.code); keyboardMove(); } });

async function loadGame() {
  loaded = false; loadError = undefined; $('#start').disabled = true; $('#start-label').textContent = '캐릭터 준비 중';
  try {
    game?.destroy(); game = new Game({ canvas: $('#game-canvas'), onUpdate: update, onEvent });
    game.setMuted(muted); game.reducedMotion = reduced; await game.load(); loaded = true;
    $('#start-label').textContent = '부두로 출격'; $('#asset-status').textContent = '아틀라스 + 노바'; $('#start').disabled = false;
    // Read-only browser QA access and deterministic simulation API.
    window.__SLAY__ = { game, start, home, get selected() { return selected; } };
  } catch (error) {
    loadError = error; $('#start-label').textContent = '다시 불러오기'; $('#asset-status').textContent = '캐릭터를 불러오지 못했습니다. 다시 시도하세요.'; $('#start').disabled = false;
    console.error('Game asset loading failed', error);
  }
}
loadGame();
