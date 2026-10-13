import './style.css';
import { ROSTER, HEROES, ENEMIES } from './roster.js';
import { WrestlingGame } from './wrestling-game.js';
import { GRAB_MOVES, DIRECTIONS, DIRECTION_LABELS, COMBAT_RULES } from './combat-moves.js';

const base = import.meta.env.BASE_URL;
const url = path => `${base}${path.replace(/^\//, '')}`;
const icon = name => `<img class="icon" src="${url(`icons/${name}.svg`)}" alt="" draggable="false">`;
const art = hero => url(hero.portrait || `assets/portraits/${hero.id}.webp`);
const $ = selector => document.querySelector(selector);
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(`night-pier-${key}`)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(`night-pier-${key}`, JSON.stringify(value)); } catch {} },
};
let selected = storage.read('hero', 'atlas');
if (!HEROES.some(hero => hero.id === selected)) selected = 'atlas';
let muted = storage.read('muted', false);
let reduced = storage.read('reduced', window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let theme = storage.read('theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
let game, loaded = false, loadError, currentScreen = 'lobby', terminalHandled = false;
let resultTimer, toastTimer, joystickPointer, helpResume = false;
const keys = new Set(), heldPointers = new Map();
const clock = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
const nameOf = move => typeof move === 'string' ? move : move?.name || move?.label || '';

function moveGuide(heroId) {
  const moves = GRAB_MOVES[heroId] || GRAB_MOVES.atlas;
  return `<div class="move-guide-heading"><span>방향 + 잡기</span><b>정면</b><b>후면</b></div>${DIRECTIONS.map(direction => `<div class="move-guide-row"><span>${DIRECTION_LABELS[direction]}</span><b>${moves.front[direction].name}</b><b>${moves.rear[direction].name}</b></div>`).join('')}`;
}
function fighterHUD(side) {
  return `<div class="fighter-hud ${side}"><img id="${side}-portrait" alt="" draggable="false"><div class="fighter-stats"><div class="hud-name"><strong id="${side}-name"></strong><span id="${side}-hp"></span></div><div class="health-track" id="${side}-health" role="meter" aria-label="${side === 'player' ? '내' : '상대'} 회복력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="${side}-health-fill"></i></div><div class="meter-row"><span>FINISH</span><div class="finish-track" id="${side}-meter" role="meter" aria-label="${side === 'player' ? '내' : '상대'} 피니시 게이지" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="${side}-meter-fill"></i></div><b id="${side}-meter-value">0</b></div></div></div>`;
}
const specials = [
  ['run', '로프 / 달리기', 'Space', '링을 달려 로프에 반동하기'],
  ['corner', '코너', 'U', '코너에 올라 공중 공격하기'],
  ['pin', '핀', 'I', '쓰러진 상대를 눌러 3카운트 노리기'],
  ['submission', '관절기', 'O', '쓰러진 상대를 붙잡고 홀드하기'],
  ['finisher', '피니셔', 'P', '피니시 게이지를 사용해 결정기 쓰기'],
];
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.reduced = String(reduced);
$('#app').innerHTML = `
<main class="shell" data-ui>
  <header class="masthead">
    <a class="wordmark" href="#" aria-label="SLAY 선수 선택">SLAY<span>RING NIGHT</span></a>
    <div class="utility"><button class="icon-button" id="sound" aria-label="${muted ? '소리 켜기' : '소리 끄기'}" aria-pressed="${!muted}">${icon(muted ? 'speaker-slash' : 'speaker-high')}</button><button class="icon-button" id="theme" aria-label="화면 테마 바꾸기">${icon(theme === 'dark' ? 'sun' : 'moon')}</button><button class="icon-button" id="help" aria-label="조작법 보기">${icon('question')}</button></div>
  </header>
  <section id="lobby" class="lobby" aria-labelledby="title">
    <div class="event-intro">
      <div class="eyebrow"><i></i> ONE RING. TWO RIVALS.</div>
      <h1 id="title">RING <span>NIGHT</span></h1>
      <p class="intro-copy">마지막 한 방보다, 마지막 3초.<br>아틀라스와 노바의 일대일 프로레슬링.</p>
      <div class="match-ticket"><span>MAIN EVENT</span><b>ATLAS <em>vs</em> NOVA</b><small>PIN FALL · SUBMISSION</small></div>
    </div>
    <div class="selection">
      <div class="select-heading"><h2>당신의 선수를 선택하세요</h2><span>1 vs 1</span></div>
      <div class="fighters">${HEROES.map((hero, index) => `
        <button class="fighter ${selected === hero.id ? 'selected' : ''}" data-hero="${hero.id}" aria-pressed="${selected === hero.id}" style="--fighter:${hero.color}">
          <span class="fighter-no">0${index + 1}</span><span class="selected-marker">YOUR SIDE</span>
          <div class="fighter-art"><span class="fighter-glow"></span><img src="${art(hero)}" alt="${hero.ko}" draggable="false"></div>
          <div class="fighter-info"><span class="fighter-en">${hero.name}</span><h3>${hero.ko}</h3><p>${hero.id === 'atlas' ? '힘으로 들어 올리는 파워 레슬러' : '흐름을 뒤집는 스플렉스 테크니션'}</p></div>
          <div class="fighter-skill">${hero.id === 'atlas' ? 'POWERBOMB' : 'SUPLEX'}<span>${hero.id === selected ? '선택됨' : '선수 선택'}</span></div>
        </button>`).join('')}</div>
      <button class="start-button" id="start" disabled><span id="start-label">링 준비 중</span>${icon('arrow-right')}</button>
      <div class="launch-meta"><span id="asset-status">선수와 링 모션을 불러오는 중</span><span>BEST <b id="best-score">${String(storage.read('best', 0)).padStart(6, '0')}</b></span></div>
    </div>
    <div class="future-roster"><div class="roster-heading"><h2>NEXT ON THE CARD</h2><span>새로운 라이벌, 준비 중</span></div><div class="roster-grid">${ENEMIES.map(hero => `<button class="future-fighter" disabled aria-label="${hero.ko}, 준비 중"><img src="${art(hero)}" alt="" draggable="false"><b>${hero.ko}</b><small>준비 중</small></button>`).join('')}</div></div>
    <footer class="lobby-footer"><span>${icon('game-controller')} 터치 · 키보드 지원</span><span>3 COUNT TO GLORY</span></footer>
  </section>
  <section id="arena" class="arena hidden" aria-label="일대일 프로레슬링 링">
    <div class="match-topline"><span class="live-label"><i></i> MAIN EVENT</span><div class="match-clock"><span id="match-phase">SINGLES MATCH</span><time id="match-time">00:00</time></div><button class="icon-button" id="pause" aria-label="일시정지">${icon('pause')}</button></div>
    <div class="match-hud">${fighterHUD('player')}<span class="versus">VS</span>${fighterHUD('opponent')}</div>
    <div class="match-context"><span id="objective">체력을 줄이고 핀 또는 관절기로 승리하세요</span><span id="move-preview"></span></div>
    <div class="viewport">
      <canvas id="game-canvas" tabindex="0" aria-label="프로레슬링 링. 방향키 또는 WASD 이동. J 타격, K 잡기, L 반격. Space 달리기, U 코너, I 핀, O 관절기, P 피니셔, E 탈출. Escape 일시정지."></canvas>
      <div class="move-callout" id="move-callout"></div>
      <div class="capture-overlay hidden" id="capture-overlay"><span id="capture-label">PIN FALL</span><b id="pin-count">1</b><div class="escape-track"><i id="escape-fill"></i></div><p id="capture-hint"></p></div>
      <div class="game-toast" id="game-toast" aria-live="polite"></div>
    </div>
    <div class="controls">
      <div class="main-controls"><div class="movement"><div class="joystick" id="joystick" role="group" aria-label="이동 조이스틱"><span class="joy-arrow joy-up">↑</span><span class="joy-arrow joy-left">←</span><span class="joy-arrow joy-right">→</span><span class="joy-arrow joy-down">↓</span><div class="joy-knob" id="joy-knob"></div></div><span class="control-caption">이동 <kbd>WASD</kbd></span></div>
        <div class="actions"><button class="action-button grab" data-action="grab" aria-label="방향과 조합해 잡기, K"><span>잡기</span><kbd>K</kbd></button><button class="action-button counter" data-action="counter" aria-label="상대 공격에 맞춰 반격, L"><span>반격</span><kbd>L</kbd></button><button class="action-button strike" data-action="strike" aria-label="타격: 연타로 콤보, 길게 누르고 놓으면 차지, J"><span>타격</span><small id="strike-hint">연타 / 홀드</small><kbd>J</kbd><i id="strike-charge"></i></button></div>
      </div>
      <div class="ring-actions">${specials.map(([action,label,key,desc]) => `<button class="ring-action" data-action="${action}" aria-label="${label}, ${desc}, ${key}"><span>${label}</span><kbd>${key}</kbd></button>`).join('')}</div>
      <button class="escape-button hidden" id="escape-button" data-action="escape"><span>연타해서 탈출</span><kbd>E</kbd></button>
    </div>
    <p class="combat-tip" id="combat-tip">회복력이 낮아질수록 핀과 관절기에서 벗어나기 어려워집니다.</p>
  </section>
  <dialog id="help-dialog" class="dialog"><button class="dialog-close icon-button" data-close aria-label="닫기">${icon('x')}</button><span class="eyebrow">RULES OF THE RING</span><h2>끝내는 건,<br>3카운트.</h2><p>상대 회복력을 줄인 뒤 핀으로 3카운트, 또는 관절기로 항복을 받아내세요. 회복력만 줄여서는 경기가 끝나지 않습니다.</p>
    <div class="help-rows"><div><b>이동 <kbd>WASD / ↑↓←→</kbd></b><span>링 안에서 거리와 방향 잡기</span></div><div><b>타격 <kbd>J</kbd></b><span>연타 콤보 / 홀드 후 차지</span></div><div><b>잡기 <kbd>K</kbd></b><span>정면·후면과 방향에 따른 기술</span></div><div><b>반격 <kbd>L</kbd></b><span>상대의 타격 직전 눌러 뒤집기</span></div><div><b>달리기 <kbd>Space</kbd></b><span>로프 반동으로 공세 이어가기</span></div><div><b>코너 <kbd>U</kbd></b><span>코너에서 공중 공격</span></div><div><b>핀 / 관절기 <kbd>I / O</kbd></b><span>쓰러진 상대 가까이에서 시도</span></div><div><b>피니셔 <kbd>P</kbd></b><span>게이지가 차면 결정기</span></div><div><b>탈출 <kbd>E / J / L</kbd></b><span>붙잡혔을 때 빠르게 연타</span></div></div>
    <div class="move-guide-tabs">${HEROES.map(hero => `<button data-guide-hero="${hero.id}" aria-pressed="${selected === hero.id}">${hero.ko}</button>`).join('')}</div><div id="move-guide" class="move-guide">${moveGuide(selected)}</div>
    <p class="help-note">관절기는 버튼을 누르고 유지하세요. 방향을 넣지 않은 잡기는 ↓ 기술입니다. 경기 중 Escape로 일시정지할 수 있습니다.</p><label class="setting-row" for="reduce-effects"><span>화면 흔들림과 섬광 줄이기</span><input type="checkbox" id="reduce-effects" ${reduced ? 'checked' : ''}></label><button class="secondary-button" data-close>링으로 돌아가기</button>
  </dialog>
  <dialog id="pause-dialog" class="dialog compact-dialog"><span class="eyebrow">TIME OUT</span><h2>잠시 숨 고르기</h2><p>링 위의 시간이 멈췄습니다.</p><button class="start-button" id="resume">계속하기 ${icon('play')}</button><button class="secondary-button" id="restart">새 경기</button><button class="text-button" id="return-home">선수 선택으로</button></dialog>
  <dialog id="result-dialog" class="dialog result-dialog"><div class="result-icon">${icon('trophy')}</div><span class="eyebrow" id="result-label">WINNER</span><h2 id="result-title"></h2><p id="result-desc"></p><div class="result-score"><span>MATCH SCORE</span><strong id="result-score">000000</strong></div><div class="result-details"><div><span>결정</span><b id="result-method"></b></div><div><span>경기 시간</span><b id="result-time"></b></div></div><button class="start-button" id="play-again">재경기 ${icon('arrow-clockwise')}</button><button class="text-button" id="result-home">선수 선택으로</button></dialog>
  <div class="announcer" id="announcer" role="status" aria-live="polite"></div>
</main>`;

// Keep native form interaction and normal browser gestures available.
const editable = target => target instanceof Element && !!target.closest('input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[data-allow-selection]');
for (const type of ['contextmenu', 'selectstart', 'dragstart']) document.addEventListener(type, event => {
  if (!editable(event.target) && event.target instanceof Element && event.target.closest('[data-ui]')) event.preventDefault();
});
function setGuideHero(id) {
  $('#move-guide').innerHTML = moveGuide(id);
  document.querySelectorAll('[data-guide-hero]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guideHero === id)));
}
function selectHero(id) {
  if (!HEROES.some(hero => hero.id === id)) return;
  selected = id; storage.write('hero', id);
  document.querySelectorAll('[data-hero]').forEach(button => {
    const active = button.dataset.hero === id;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('.fighter-skill span').textContent = active ? '선택됨' : '선수 선택';
  });
  setGuideHero(id);
}
document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => selectHero(button.dataset.hero)));
document.querySelectorAll('[data-guide-hero]').forEach(button => button.addEventListener('click', () => setGuideHero(button.dataset.guideHero)));
$('.wordmark').addEventListener('click', event => { event.preventDefault(); if (currentScreen === 'arena') pauseGame(); });
$('#theme').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; storage.write('theme', theme);
  document.documentElement.dataset.theme = theme; $('#theme').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
});
$('#sound').addEventListener('click', () => {
  muted = !muted; storage.write('muted', muted); game?.setMuted(muted);
  $('#sound').innerHTML = icon(muted ? 'speaker-slash' : 'speaker-high');
  $('#sound').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); $('#sound').setAttribute('aria-pressed', String(!muted));
});
$('#help').addEventListener('click', () => {
  helpResume = game?.state.status === 'playing';
  if (helpResume) { resetInput(); game.pause(true); }
  setGuideHero(currentScreen === 'arena' ? game.state.player.id : selected); $('#help-dialog').showModal();
});
$('#help-dialog').addEventListener('close', () => { if (helpResume) { game.pause(false); helpResume = false; $('#game-canvas').focus({preventScroll:true}); } });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#reduce-effects').addEventListener('change', event => {
  reduced = event.target.checked; storage.write('reduced', reduced); document.documentElement.dataset.reduced = String(reduced);
  if (game) game.reducedMotion = reduced;
});
function resetInput() {
  keys.clear(); heldPointers.clear(); joystickPointer = undefined;
  game?.cancelStrike?.(); game?.action('submissionUp'); game?.setMove(0, 0);
  $('#joy-knob').style.transform = ''; document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
}
function clearTransient() {
  clearTimeout(resultTimer); clearTimeout(toastTimer); $('#game-toast').textContent = ''; $('#game-toast').classList.remove('visible');
}
function start() {
  if (!loaded) return;
  clearTransient(); helpResume = false; document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); resetInput();
  currentScreen = 'arena'; terminalHandled = false; $('#lobby').classList.add('hidden'); $('#arena').classList.remove('hidden');
  document.body.classList.add('in-game'); $('.shell').classList.add('playing');
  game.reducedMotion = reduced; game.setMuted(muted); game.start(selected);
  requestAnimationFrame(() => { game.resize?.(); $('#game-canvas').focus({preventScroll:true}); });
}
function home() {
  clearTransient(); helpResume = false; resetInput(); game?.pause(true);
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  currentScreen = 'lobby'; $('#lobby').classList.remove('hidden'); $('#arena').classList.add('hidden');
  document.body.classList.remove('in-game'); $('.shell').classList.remove('playing'); $('#start').focus({preventScroll:true});
}
function pauseGame() {
  if (game?.state.status !== 'playing') return;
  resetInput(); game.pause(true); $('#pause-dialog').showModal();
}
$('#start').addEventListener('click', () => loadError ? loadGame() : start());
$('#pause').addEventListener('click', pauseGame);
$('#resume').addEventListener('click', () => { $('#pause-dialog').close(); game.pause(false); $('#game-canvas').focus({preventScroll:true}); });
$('#pause-dialog').addEventListener('cancel', event => { event.preventDefault(); $('#resume').click(); });
$('#restart').addEventListener('click', start); $('#play-again').addEventListener('click', start);
$('#return-home').addEventListener('click', home); $('#result-home').addEventListener('click', home);
$('#result-dialog').addEventListener('cancel', event => event.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => { resetInput(); pauseGame(); });

function update(state) {
  if (!state.player || !state.opponent) return;
  const player = state.player, opponent = state.opponent, match = state.match || {};
  for (const [side, fighter] of [['player', player], ['opponent', opponent]]) {
    const hero = ROSTER.find(hero => hero.id === fighter.id) || fighter;
    if ($('#' + side + '-portrait').dataset.fighterId !== fighter.id) {
      $('#' + side + '-portrait').src = art(hero); $('#' + side + '-portrait').dataset.fighterId = fighter.id;
      $('#' + side + '-name').textContent = hero.name || fighter.id.toUpperCase();
    }
    const hp = Math.max(0, Math.min(100, fighter.hp / (fighter.maxHp || 100) * 100)), meter = Math.max(0, Math.min(100, fighter.meter || 0));
    $('#' + side + '-hp').textContent = Math.ceil(fighter.hp);
    $('#' + side + '-health-fill').style.width = hp + '%'; $('#' + side + '-health').setAttribute('aria-valuenow', String(Math.ceil(hp)));
    $('#' + side + '-meter-fill').style.width = meter + '%'; $('#' + side + '-meter-value').textContent = Math.floor(meter);
    $('#' + side + '-meter').setAttribute('aria-valuenow', String(Math.floor(meter)));
  }
  $('#match-time').textContent = clock(state.time || 0);
  const captured = ['pin','submission'].includes(match.phase), defending = captured && match.defender === player;
  const caughtInGrab = !captured && Boolean(state.context?.canEscape);
  $('#match-phase').textContent = match.phase === 'pin' ? 'PIN FALL' : match.phase === 'submission' ? 'SUBMISSION' : 'SINGLES MATCH';
  $('#capture-overlay').classList.toggle('hidden', !captured);
  $('#capture-label').textContent = match.phase === 'pin' ? (defending ? 'KICK OUT!' : 'PIN FALL') : (defending ? 'BREAK THE HOLD!' : 'SUBMISSION');
  $('#pin-count').textContent = match.phase === 'pin' ? String(Math.min(3, Math.floor(match.count ?? state.pinCount ?? 0))) : Math.floor((match.progress || 0) * 100) + '%';
  const escape = Math.max(0, Math.min(1, match.escapeProgress ?? state.escapeProgress ?? 0));
  $('#escape-fill').style.width = escape * 100 + '%';
  $('#capture-hint').textContent = defending ? 'E · 타격 · 반격 버튼을 연타해 탈출' : match.phase === 'pin' ? '3카운트까지 눌러 제압하세요' : '관절기 버튼을 누르고 유지하세요';
  $('#escape-button').classList.toggle('hidden', !defending && !caughtInGrab); $('.controls').classList.toggle('defending', defending || caughtInGrab);
  const charge = Math.min(1, (player.chargeTime || 0) / COMBAT_RULES.chargeMax), charged = (player.chargeTime || 0) >= COMBAT_RULES.chargeThreshold;
  $('#strike-charge').style.width = charge * 100 + '%'; $('[data-action="strike"]').classList.toggle('charged', charged);
  $('#strike-hint').textContent = defending ? '탈출 연타' : charged ? '놓아서 차지' : '연타 / 홀드';
  $('[data-action="counter"]').classList.toggle('cooldown', (player.counterCooldown || 0) > 0);
  const context = state.context || state.availability || {}, grab = state.grabContext;
  for (const button of document.querySelectorAll('.ring-action')) {
    const action = button.dataset.action;
    const available = context[action] ?? context['can' + action[0].toUpperCase() + action.slice(1)];
    const holdingSubmission = action === 'submission' && match.phase === 'submission' && match.attacker === player;
    button.disabled = state.status !== 'playing' || defending || caughtInGrab || (action === 'finisher' && player.meter < 100) || (!holdingSubmission && available === false);
    button.classList.toggle('ready', action === 'finisher' && player.meter >= 100);
  }
  const currentMove = nameOf(state.currentMove) || nameOf(player.activeMove) || nameOf(player.grapple?.move);
  $('#move-callout').textContent = currentMove; $('#move-callout').classList.toggle('visible', !!currentMove);
  $('#move-preview').textContent = !captured && grab?.ready ? nameOf(grab.move) : '';
  $('#objective').textContent = defending || caughtInGrab ? '붙잡혔습니다. 빠르게 연타해 벗어나세요!' : captured ? match.phase === 'pin' ? '핀 폴 · 3카운트로 승리' : '관절기 · 항복을 받아내세요' : state.objective || '회복력을 줄이고 핀 또는 관절기로 승리하세요';
  $('#combat-tip').textContent = defending || caughtInGrab ? '버튼 하나를 계속 연타하세요. 다른 버튼으로 바꿔도 탈출이 이어집니다.' : player.meter >= 100 ? '피니셔 준비 완료 · 가까이에서 P / 피니셔' : '회복력이 낮아질수록 핀과 관절기에서 벗어나기 어려워집니다.';
  if (['victory','defeat','gameover'].includes(state.status) && !terminalHandled) {
    terminalHandled = true; resetInput(); resultTimer = setTimeout(() => showResult(state), 650);
  }
}
function showResult(state) {
  const victory = state.status === 'victory', match = state.match || {}, winner = typeof match.winner === 'string' ? ROSTER.find(hero => hero.id === match.winner) : match.winner;
  const method = /submission|tap|항복/.test(match.finishMethod || '') ? '서브미션' : '핀 폴 · 3카운트';
  $('#result-label').textContent = victory ? 'WINNER' : 'REMATCH?'; $('#result-title').textContent = victory ? '승리는 당신의 것.' : '다음 벨을 기다려라.';
  $('#result-desc').textContent = `${winner?.ko || (victory ? ROSTER.find(hero => hero.id === selected).ko : ROSTER.find(hero => hero.id !== selected && hero.role === 'hero').ko)} · ${method}`;
  $('#result-score').textContent = String(state.score || 0).padStart(6,'0'); $('#result-method').textContent = method; $('#result-time').textContent = clock(state.time || 0);
  if (state.score > storage.read('best', 0)) { storage.write('best', state.score); $('#best-score').textContent = String(state.score).padStart(6,'0'); }
  $('#result-dialog').showModal();
}
function onEvent(event) {
  if (event.message || event.text) {
    $('#game-toast').textContent = event.message || event.text; $('#game-toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#game-toast').classList.remove('visible'), 2100);
  }
  if (event.type === 'pinCount') $('#announcer').textContent = `카운트 ${event.count}`;
  else if (['pinStart','submissionStart','holdEscape','ropeBreak','matchEnd'].includes(event.type)) $('#announcer').textContent = event.message || event.text || ({pinStart:'핀 시작',submissionStart:'관절기 시작',holdEscape:'탈출 성공',ropeBreak:'로프 브레이크',matchEnd:'경기 종료'})[event.type];
}

const joystick = $('#joystick');
function joystickMove(event) {
  if (event.pointerId !== joystickPointer || game?.state.status !== 'playing') return;
  const rect = joystick.getBoundingClientRect(), radius = rect.width * .33;
  let x = (event.clientX - rect.left - rect.width / 2) / radius, y = (event.clientY - rect.top - rect.height / 2) / radius;
  const magnitude = Math.hypot(x,y); if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  $('#joy-knob').style.transform = `translate(${x*radius}px,${y*radius}px)`;
  game.setMove(Math.abs(x) > .1 ? x : 0, Math.abs(y) > .1 ? y : 0);
}
joystick.addEventListener('pointerdown', event => {
  if (joystickPointer !== undefined || game?.state.status !== 'playing') return;
  joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); joystickMove(event);
});
joystick.addEventListener('pointermove', joystickMove);
for (const type of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(type,event => {
  if (event.pointerId === joystickPointer) { joystickPointer = undefined; $('#joy-knob').style.transform = ''; game?.setMove(0,0); }
});
function perform(action, down) {
  if (action === 'strike') { if (down) game.beginStrike(); else game.endStrike(); }
  else if (action === 'submission') game.action(down ? 'submissionDown' : 'submissionUp');
  else if (down) game.action(action);
}
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (button.disabled || game?.state.status !== 'playing' || heldPointers.has(button)) return;
    heldPointers.set(button,event.pointerId); button.setPointerCapture(event.pointerId); button.classList.add('pressed'); perform(button.dataset.action,true);
  });
  const release = (event,cancel) => {
    if (heldPointers.get(button) !== event.pointerId) return;
    heldPointers.delete(button); button.classList.remove('pressed');
    if (cancel && button.dataset.action === 'strike') game?.cancelStrike?.();
    else perform(button.dataset.action,false);
  };
  button.addEventListener('pointerup',event=>release(event,false));
  for (const type of ['pointercancel','lostpointercapture']) button.addEventListener(type,event=>release(event,true));
  button.addEventListener('click',event=>{
    if (event.detail !== 0 || button.disabled || game?.state.status !== 'playing') return;
    if (button.dataset.action === 'submission') game.action('submission');
    else { perform(button.dataset.action,true); perform(button.dataset.action,false); }
  });
});
const movementKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'];
const actionKeys = {KeyJ:'strike',KeyK:'grab',KeyL:'counter',Space:'run',KeyU:'corner',KeyI:'pin',KeyO:'submission',KeyP:'finisher',KeyE:'escape'};
function keyboardMove() {
  const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const y = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const length = Math.hypot(x,y) || 1; game?.setMove(x/length,y/length);
}
window.addEventListener('keydown',event=>{
  if (editable(event.target) || currentScreen !== 'arena' || $('dialog[open]')) return;
  if (event.code === 'Escape') { event.preventDefault(); pauseGame(); return; }
  if (movementKeys.includes(event.code)) { event.preventDefault(); keys.add(event.code); keyboardMove(); }
  if (actionKeys[event.code]) {
    event.preventDefault(); if (event.repeat || keys.has(event.code) || game?.state.status !== 'playing') return;
    keys.add(event.code); perform(actionKeys[event.code],true);
  }
});
window.addEventListener('keyup',event=>{
  const held = keys.has(event.code); keys.delete(event.code);
  if (movementKeys.includes(event.code)) keyboardMove();
  if (held && ['KeyJ','KeyO'].includes(event.code)) perform(actionKeys[event.code],false);
});
async function loadGame() {
  loaded = false; loadError = undefined; $('#start').disabled = true; $('#start-label').textContent = '링 준비 중';
  try {
    game?.destroy(); game = new WrestlingGame({canvas:$('#game-canvas'),onUpdate:update,onEvent});
    game.setMuted(muted); game.reducedMotion = reduced; await game.load(); loaded = true;
    $('#start-label').textContent = '링에 입장'; $('#asset-status').textContent = 'ATLAS vs NOVA · 1대1 경기'; $('#start').disabled = false;
    window.__SLAY__ = {game,start,home,selectHero,get selected(){return selected;}};
  } catch(error) {
    loadError = error; $('#start-label').textContent = '다시 불러오기'; $('#asset-status').textContent = '링을 불러오지 못했습니다. 다시 시도하세요.'; $('#start').disabled = false;
    console.error('Ring asset loading failed',error);
  }
}
loadGame();
