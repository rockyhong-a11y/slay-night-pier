import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// QA_URL can point to a private candidate build. This tool never rewrites assets.
// QA_ACTORS=atlas,nova and QA_DIRECTIONS=right,up shorten a prototype capture;
// all ten banks must still satisfy the whole-body contract before any capture.
const run = promisify(execFile);
const url = process.env.QA_URL || 'http://localhost:5173/';
const out = path.resolve(process.env.QA_OUTPUT || 'artifacts/wholebody-walk-qa');
const privateWalkDir = process.env.QA_PRIVATE_WALK_DIR && path.resolve(process.env.QA_PRIVATE_WALK_DIR);
const directions = [
  ['slow', [.2, 0], 1.2], ['right', [1, 0], 1.2], ['left', [-1, 0], 1.2],
  ['up', [0, -1], 1.6], ['down', [0, 1], 1.6],
  ['up-right', [Math.SQRT1_2, -Math.SQRT1_2], 1.2],
  ['up-left', [-Math.SQRT1_2, -Math.SQRT1_2], 1.2],
  ['down-right', [Math.SQRT1_2, Math.SQRT1_2], 1.2],
  ['down-left', [-Math.SQRT1_2, Math.SQRT1_2], 1.2],
];
const selectedDirections = process.env.QA_DIRECTIONS?.split(',');
const selectedActors = process.env.QA_ACTORS?.split(',');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 1, colorScheme: 'dark',
});
const page = await context.newPage();
const report = {
  status: 'RUNNING', url, started: new Date().toISOString(),
  viewport: { width: 393, height: 852, isMobile: true, hasTouch: true },
  method: 'Actual Canvas draws and real game.setMove/game.step on the mobile canvas; an additional drawFighter capture uses a 420px-wide canvas for an exact 128px standing reference. Enemy artwork is inspected using the Atlas input driver, preserving its combat catalog. Only sprite identity and initial spatial positions are staged; enemy HP, cooldown, contact timing, damage, and outcomes are untouched. Opponents are placed beyond the inspection viewport. Isolated attack pictures use the transform sampled by the actual renderer.',
  anatomy: { verdict: 'NEEDS_MANUAL_VISUAL_REVIEW',
    limitation: 'Uniform transforms, distance cadence, and one body drawing do not prove anatomical fidelity. Inspect head/neck/torso proportions, knee/boot silhouettes, left/right leg identity, walking-to-strike continuity, and costume consistency in the composites and videos. No perfect2D depth sole-lock claim or assertion is made.' },
  checks: [], errors: [], requests: [], assets: [], sequences: [], lifecycle: {}, media: {},
};
page.on('pageerror', error => report.errors.push(error.message));
page.on('requestfailed', request => report.requests.push({ url: request.url(), failure: request.failure() }));
page.on('response', response => { if (response.status() >= 400) report.requests.push({ url: response.url(), status: response.status() }); });
const check = (name, detail = {}) => {
  report.checks.push({ name, passed: true, ...detail });
  console.log(`PASS ${name}`);
};
const saveReport = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const close = (a, b, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;

async function initialize() {
  let privateWalks;
  if (privateWalkDir) {
    privateWalks = JSON.parse(await fs.readFile(path.join(privateWalkDir, 'walk-fields.json'), 'utf8'));
    const files = new Map(Object.values(privateWalks).map(walk => [path.basename(walk.image), path.join(privateWalkDir, path.basename(walk.image))]));
    await page.route('**/*-walk.webp?*', async route => {
      const file = files.get(path.basename(new URL(route.request().url()).pathname));
      if (file) await route.fulfill({ path: file, contentType: 'image/webp' });
      else await route.continue();
    });
    report.privateWalkDir = privateWalkDir;
    report.method += ' Private complete-body banks are supplied through browser-only asset routes and in-memory metadata; production files remain unchanged.';
  }
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__SLAY__?.game.loaded);
  await page.evaluate(() => document.fonts.ready);
  if (privateWalks) await page.evaluate(async walks => {
    const game = window.__SLAY__.game;
    await Promise.all(Object.entries(walks).map(async ([id, walk]) => {
      const sprite = game.sprites.get(id), image = new Image(), url = new URL(sprite.combat.src);
      url.pathname = url.pathname.replace(/[^/]+$/, walk.image.split('/').pop());
      url.search = `v=${walk.imageVersion}`;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url.href; });
      sprite.walk = image; sprite.rig = null; sprite.metadata = { ...sprite.metadata, walk };
      game.manifest[id] = { ...game.manifest[id], walk };
    }));
  }, privateWalks);
  report.bundle = await page.locator('script[type="module"]').evaluateAll(elements => elements.map(element => element.src));
  report.assets = await page.evaluate(() => [...window.__SLAY__.game.sprites].map(([id, sprite]) => ({
    id, mode: sprite.metadata.walk?.mode, image: sprite.metadata.walk?.image,
    imageVersion: sprite.metadata.walk?.imageVersion, frames: sprite.metadata.walk?.frames,
    bodyHeight: sprite.metadata.walk?.bodyHeight, combatBodyHeight: sprite.metadata.combat?.bodyHeight,
    canonicalBodyHeight: sprite.metadata.walk?.canonicalBodyHeight,
    sourceBodyHeight: sprite.metadata.walk?.sourceBodyHeight,
    sourceToRenderScale: sprite.metadata.walk?.sourceToRenderScale,
    cycleDistance: sprite.metadata.walk?.cycleDistance, loadedImage: sprite.walk?.src,
    obsoleteRigLoaded: Boolean(sprite.rig),
  })));
  assert.equal(report.assets.length, 10, 'All ten character banks must load');
  for (const asset of report.assets) {
    assert.equal(asset.mode, 'wholeBody', `${asset.id}: this tool accepts wholeBody walking only`);
    assert.ok(Number.isInteger(asset.frames?.length) && asset.frames.length >= 8 && asset.frames.length <= 32,
      `${asset.id}: expected an8- through32-frame connected body cycle`);
    assert.ok(Number.isFinite(asset.bodyHeight) && asset.bodyHeight > 0);
    assert.ok(close(asset.canonicalBodyHeight, asset.combatBodyHeight), `${asset.id}: canonical anatomy reference matches the combat bank`);
    assert.ok(Number.isFinite(asset.sourceBodyHeight) && asset.sourceBodyHeight > 0);
    if (asset.sourceToRenderScale != null) {
      assert.ok(Number.isFinite(asset.sourceToRenderScale) && asset.sourceToRenderScale > 0);
      assert.ok(close(asset.bodyHeight / asset.sourceBodyHeight, asset.sourceToRenderScale, .00001),
        `${asset.id}: uniformly resampled render pixels retain their source body reference`);
    }
    assert.ok(Number.isFinite(asset.cycleDistance) && asset.cycleDistance > 0);
    assert.ok(asset.imageVersion && new URL(asset.loadedImage).searchParams.get('v') === asset.imageVersion,
      `${asset.id}: pixels and metadata must share the bank version`);
    assert.equal(asset.obsoleteRigLoaded, false, `${asset.id}: separate limb rig is not loaded`);
    for (const frame of asset.frames) {
      assert.ok(frame.rect?.length === 4 && frame.rect.every(Number.isFinite));
      assert.ok(frame.rect[2] > 0 && frame.rect[3] > 0);
      assert.ok(frame.pivot?.length === 2 && frame.pivot.every(Number.isFinite));
      assert.ok(frame.centerPivot?.length === 2 && frame.centerPivot.every(Number.isFinite));
      assert.ok(close(frame.pivot[1] - frame.centerPivot[1], asset.bodyHeight / 2, .001),
        `${asset.id}: authored floor pivot remains at the standing-reference baseline`);
    }
  }
  check('All ten whole-body banks load with versioned pixels and one standing reference');
  await page.locator('#start').tap();
  await page.evaluate(() => {
    const game = window.__SLAY__.game;
    cancelAnimationFrame(game.raf); game.raf = null; game.setMuted(true);
    const qa = window.__wholeBodyQA = {
      originalSprites: new Map(game.sprites), originalManifest: { ...game.manifest },
      draws: [], actor: null, lastTransform: null, recording: false, isolated: false,
    };
    const drawFighter = game.drawFighter, drawImage = game.ctx.drawImage;
    game.drawFighter = function(actor, transform = null, anchor = actor, forcedPose) {
      const previous = qa.actor; qa.actor = actor;
      if (actor === this.state.player && !qa.isolated) qa.lastTransform = transform;
      try { return drawFighter.call(this, actor, transform, anchor, forcedPose); }
      finally { qa.actor = previous; }
    };
    game.ctx.drawImage = function(image, ...args) {
      if (qa.recording && !qa.isolated && qa.actor === game.state.player) {
        const actor = qa.actor, sprite = game.sprites.get(actor.id), transform = this.getTransform();
        qa.draws.push({
          kind: image === sprite.walk ? 'walk' : image === sprite.combat ? 'combat' : 'other',
          args, alpha: this.globalAlpha,
          transform: { a: transform.a, b: transform.b, c: transform.c, d: transform.d, e: transform.e, f: transform.f },
        });
      }
      return drawImage.call(this, image, ...args);
    };
    qa.isolatedPNG = () => {
      const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 320;
      const ctx = canvas.getContext('2d'), actor = game.state.player;
      const before = { ctx: game.ctx, width: game.width, height: game.height, camera: game.camera };
      const actorBefore = { ...actor };
      ctx.fillStyle = '#18231f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        Object.assign(game, { ctx, width: 420, height: 320, camera: actor.x - 210 });
        qa.isolated = true;
        game.drawFighter(actor, qa.lastTransform, actor);
        ctx.strokeStyle = '#bfa260'; ctx.beginPath();
        ctx.moveTo(15, game.floorY(actor.y)); ctx.lineTo(405, game.floorY(actor.y)); ctx.stroke();
        ctx.fillStyle = '#edece3'; ctx.font = '14px monospace';
        ctx.fillText(`${qa.identity} / ${actor.action} /128px body`, 12, 23);
      } finally { qa.isolated = false; Object.assign(game, before); Object.assign(actor, actorBefore); }
      return canvas.toDataURL('image/png');
    };
  });
}

async function setup(id, label = 'right') {
  await page.evaluate(({ id, label }) => {
    const game = window.__SLAY__.game, qa = window.__wholeBodyQA;
    game.sprites = new Map(qa.originalSprites); game.manifest = { ...qa.originalManifest };
    game.start(id === 'nova' ? 'nova' : 'atlas'); cancelAnimationFrame(game.raf); game.raf = null;
    const actor = game.state.player, sprite = qa.originalSprites.get(id);
    game.sprites.set(actor.id, sprite); game.manifest[actor.id] = sprite.metadata;
    // All isolated views compare the same128px standing reference, including Onyx artwork.
    actor.boss = false; actor.x = label.includes('left') ? 400 : 150;
    actor.y = label.includes('up') ? .82 : label.includes('down') ? .18 : .57;
    actor.facing = label.includes('left') ? -1 : 1;
    for (const enemy of game.state.enemies) { enemy.x = 2200; enemy.y = .08; }
    game.camera = Math.max(0, actor.x - 150); game.setMove(0, 0);
    qa.identity = id; qa.draws = []; qa.recording = true; game.render(); qa.recording = false;
  }, { id, label });
}

async function snapshotFrame(name, capture = true) {
  const data = await page.evaluate(capture => {
    const game = window.__SLAY__.game, qa = window.__wholeBodyQA, actor = game.state.player;
    return { time: game.state.time, x: actor.x, y: actor.y, action: actor.action, facing: actor.facing,
      distance: actor.walkDistance, travel: actor.gaitTravel, phase: actor.gaitPhase, frame: actor.gaitFrame,
      moving: actor.gaitMoving, renderWasWalking: actor.renderWasWalking, fromWalk: actor.renderPoseFromWalk,
      draws: qa.draws, bodyHeight: game.bodyHeight(actor), viewportCanvas: [game.width, game.height],
      status: game.state.status, kills: game.state.kills,
      ...(capture ? { mobilePNG: game.canvas.toDataURL('image/png'), isolatedPNG: qa.isolatedPNG() } : {}) };
  }, capture);
  for (const draw of data.draws) {
    assert.equal(draw.args.length, 8, `${name}: a complete source rectangle is required`);
    const [, , sourceW, sourceH, , , destinationW, destinationH] = draw.args;
    assert.ok(close(Math.abs(destinationW / sourceW), Math.abs(destinationH / sourceH), 1e-9),
      `${name}: raster is uniformly scaled`);
    const t = draw.transform;
    assert.ok(close(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d), 1e-9), `${name}: Canvas transform preserves aspect`);
  }
  if (data.moving && ['walk', 'charge'].includes(data.action)) {
    assert.equal(data.draws.length, 1, `${name}: exactly one complete body drawing per walking frame`);
    assert.equal(data.draws[0].kind, 'walk', `${name}: no separate head/torso/limb or previous-pose image`);
    assert.equal(data.draws[0].alpha, 1, `${name}: adjacent walk frames cannot create double limbs`);
  }
  if (capture) {
    data.mobile = path.join(out, `${name}-mobile.png`);
    data.isolated = path.join(out, `${name}-128px.png`);
    await Promise.all([
      fs.writeFile(data.mobile, Buffer.from(data.mobilePNG.split(',')[1], 'base64')),
      fs.writeFile(data.isolated, Buffer.from(data.isolatedPNG.split(',')[1], 'base64')),
    ]);
    delete data.mobilePNG; delete data.isolatedPNG;
  }
  return data;
}

async function tick(move, frames = 1) {
  await page.evaluate(({ move, frames }) => {
    const game = window.__SLAY__.game, qa = window.__wholeBodyQA;
    if (move) game.setMove(...move);
    for (let i = 0; i < frames; i++) {
      game.step(1 / 60); qa.draws = []; qa.recording = true; game.render(); qa.recording = false;
    }
  }, { move, frames });
}

async function renderCurrent() {
  await page.evaluate(() => {
    const game = window.__SLAY__.game, qa = window.__wholeBodyQA;
    qa.draws = []; qa.recording = true; game.render(); qa.recording = false;
  });
}

async function sequence(id, label, move, duration) {
  await setup(id, label);
  const seq = { id, label, input: move, duration, fps: 30, frames: [], samples: [] };
  seq.frames.push(await snapshotFrame(`${id}-${label}-000`));
  for (let i = 0; i < Math.round(duration * 60); i++) {
    await tick(move);
    const frame = await snapshotFrame(`${id}-${label}-${String(i + 1).padStart(3, '0')}`, i % 2 === 1);
    if (frame.isolated) seq.frames.push(frame);
    seq.samples.push({ ...frame, draws: undefined, mobile: undefined, isolated: undefined });
  }
  const end = seq.samples.at(-1);
  assert.ok(end.distance > 0, `${id}-${label}: real locomotion advances distance`);
  assert.equal(end.kills, 0, 'Inspection must not manufacture a combat outcome');
  assert.equal(end.status, 'playing');
  seq.distance = end.distance; seq.travel = end.travel;
  seq.frameIndices = [...new Set(seq.samples.filter(sample => sample.moving).map(sample => sample.frame))];
  report.sequences.push(seq);
  check(`${id}-${label}: one uniform body draw and input-driven distance`, { distance: seq.distance, frameIndices: seq.frameIndices });
  await saveReport();
  return seq;
}

async function attackTransition(id, walk) {
  // Continue the real walking case into a released quick tap; there is no staged hit.
  await page.evaluate(() => { const game = window.__SLAY__.game; game.setMove(0, 0); game.beginStrike(); game.endStrike(); });
  const seq = { id, label: 'transition', fps: 30,
    frames: [...Array(9).fill(walk.frames[0]), ...walk.frames.slice(1)], samples: [] };
  for (let i = 0; i < 36; i++) {
    await tick(null);
    const frame = await snapshotFrame(`${id}-strike-${String(i).padStart(3, '0')}`, i % 2 === 1);
    if (frame.isolated) seq.frames.push(frame);
    seq.samples.push({ ...frame, draws: undefined, mobile: undefined, isolated: undefined });
    assert.ok(!frame.draws.some(draw => draw.kind === 'walk'), `${id}: stopped strike/idle cannot retain walking art`);
  }
  assert.ok(seq.samples.some(sample => sample.action === 'strike'), `${id}: actual tap must start a strike`);
  assert.equal(seq.samples.at(-1).kills, 0);
  report.sequences.push(seq);
  check(`${id}: real walk-to-strike transition clears old walking art`);
}

async function lifecycle() {
  await setup('atlas'); await tick([1, 0], 12);
  const moved = await snapshotFrame('lifecycle-moving');
  await tick([0, 0], 12);
  const stopped = await snapshotFrame('lifecycle-stopped');
  assert.equal(stopped.travel, moved.travel); assert.equal(stopped.phase, moved.phase);
  assert.equal(stopped.moving, false); assert.equal(stopped.fromWalk, false);
  await page.evaluate(() => window.__SLAY__.game.pause(true));
  await tick([1, 0], 60);
  const paused = await snapshotFrame('lifecycle-paused');
  assert.equal(paused.travel, stopped.travel); assert.equal(paused.phase, stopped.phase);
  await page.evaluate(() => window.__SLAY__.game.pause(false));
  await tick([1, 0], 12);
  const resumed = await snapshotFrame('lifecycle-resumed');
  assert.ok(resumed.travel > paused.travel);
  // Both tag calls use the public action with its actual three-second cooldown.
  assert.equal(await page.evaluate(() => window.__SLAY__.game.action('tag')), true);
  await renderCurrent();
  const arrival = await snapshotFrame('lifecycle-tag-nova');
  assert.equal(arrival.travel, 0); assert.equal(arrival.phase, 0);
  await tick([.2, 0], 192);
  assert.equal(await page.evaluate(() => window.__SLAY__.game.action('tag')), true);
  await renderCurrent();
  const returning = await snapshotFrame('lifecycle-tag-atlas');
  assert.equal(returning.travel, 0); assert.equal(returning.phase, 0);
  assert.equal(returning.renderWasWalking, false); assert.equal(returning.fromWalk, false);
  await tick([-1, 0]);
  const turned = await snapshotFrame('lifecycle-turn-left');
  assert.equal(turned.facing, -1); assert.ok(turned.phase > 0 && turned.phase < .1);
  await setup('atlas');
  await page.evaluate(() => { const game = window.__SLAY__.game; game.state.player.x = 640; game.camera = 400; });
  const before = await snapshotFrame('lifecycle-gate-before');
  await tick([1, 0], 30);
  const blocked = await snapshotFrame('lifecycle-gate-blocked');
  assert.equal(blocked.travel, before.travel); assert.equal(blocked.phase, before.phase); assert.equal(blocked.moving, false);
  report.lifecycle = { moved, stopped, paused, resumed, arrival, returning, turned, before, blocked };
  check('Stop, pause, public cooldown tag, left turn, and encounter gate preserve/reset gait correctly');
}

async function ffmpegPath() {
  if (process.env.QA_FFMPEG) return process.env.QA_FFMPEG;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/private/tmp/slay-playwright',
    path.join(process.env.HOME || '', 'Library/Caches/ms-playwright')].filter(Boolean);
  for (const root of roots) {
    let entries; try { entries = await fs.readdir(root); } catch { continue; }
    for (const entry of entries.filter(name => name.startsWith('ffmpeg-')).sort().reverse()) {
      for (const binary of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-win64.exe']) {
        const file = path.join(root, entry, binary); try { await fs.access(file); return file; } catch {}
      }
    }
  }
  return 'ffmpeg';
}

async function media() {
  if (process.env.QA_MEDIA === '0') { report.media.skipped = true; return; }
  const ffmpeg = await ffmpegPath();
  const script = `from PIL import Image, ImageDraw
import io,json,os,subprocess,sys
report=json.load(open(sys.argv[1])); out=sys.argv[2]; ffmpeg=sys.argv[3]
media={'sequences':[],'composite':None}
transitions=[s for s in report['sequences'] if s['label']=='transition']
for seq in report['sequences']:
 files=[f['isolated'] for f in seq['frames']]; name=seq['id']+'-'+seq['label']
 images=[Image.open(f).convert('RGB') for f in files]
 selected=[images[round((len(images)-1)*q)] for q in [0,.25,.5,.75,1]]
 sheet=Image.new('RGB',(420*5,348),'#101714'); draw=ImageDraw.Draw(sheet)
 for i,im in enumerate(selected):sheet.paste(im,(420*i,28));draw.text((420*i+10,9),name+' / '+str(i+1),fill='#eeeade')
 sheetfile=os.path.join(out,name+'-sequence.png');sheet.save(sheetfile)
 gif=os.path.join(out,name+'.gif'); images[0].save(gif,save_all=True,append_images=images[1:],duration=round(1000/seq['fps']),loop=0,optimize=False)
 item={'name':name,'gif':gif,'sheet':sheetfile}
 if seq['label']=='transition':
  mobile=[Image.open(f['mobile']).convert('RGB') for f in seq['frames']]; jpeg=[]
  for im in mobile:b=io.BytesIO();im.save(b,format='JPEG',quality=90);jpeg.append(b.getvalue())
  video=os.path.join(out,name+'.webm')
  try:
   p=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-f','image2pipe','-r',str(seq['fps']),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-y',video],input=b''.join(jpeg),capture_output=True)
   if p.returncode:raise RuntimeError(p.stderr.decode())
   item['video']=video
  except Exception as e:item['videoError']=str(e)
 media['sequences'].append(item)
if transitions:
 composite=Image.new('RGB',(420*6,348*len(transitions)),'#101714');draw=ImageDraw.Draw(composite)
 for row,seq in enumerate(transitions):
  walk=next(s for s in report['sequences'] if s['id']==seq['id'] and s['label']=='right')
  unique=[]; seen=set()
  for f in walk['frames'][1:]:
   if f.get('frame') not in seen:seen.add(f.get('frame'));unique.append(f)
  picks=[walk['frames'][0]]+[unique[min(len(unique)-1,round((len(unique)-1)*q))] for q in [0,.33,.67,1]]
  striking=[f for f in seq['frames'] if f['action']=='strike'];picks.append(striking[len(striking)//2])
  for col,f in enumerate(picks):
   im=Image.open(f['isolated']).convert('RGB');composite.paste(im,(420*col,348*row+28));draw.text((420*col+10,348*row+9),seq['id']+' / '+('idle' if col==0 else 'strike' if col==5 else 'walk'+str(col)),fill='#eeeade')
 filename=os.path.join(out,'all10-idle-walk-strike-grid.png');composite.save(filename);media['composite']=filename
json.dump(media,open(os.path.join(out,'media.json'),'w'),indent=2)
`;
  await saveReport();
  await run(process.env.QA_PYTHON || 'python3', ['-c', script, path.join(out, 'report.json'), out, ffmpeg],
    { maxBuffer: 4 * 1024 * 1024 });
  report.media = JSON.parse(await fs.readFile(path.join(out, 'media.json'), 'utf8'));
  const videoErrors = report.media.sequences.filter(seq => seq.videoError);
  assert.equal(videoErrors.length, 0, `WebM generation failed: ${JSON.stringify(videoErrors)}`);
}

try {
  await initialize();
  const ids = selectedActors || report.assets.map(asset => asset.id);
  for (const id of ids) assert.ok(report.assets.some(asset => asset.id === id), `Unknown actor${id}`);
  const cases = directions.filter(([label]) => !selectedDirections || selectedDirections.includes(label));
  for (const id of ids) {
    for (const [label, move, duration] of cases) {
      const walk = await sequence(id, label, move, duration);
      if (label === 'right') {
        await page.screenshot({ path: path.join(out, `${id}-mobile-context.png`) });
        await attackTransition(id, walk);
      }
    }
    const slow = report.sequences.find(seq => seq.id === id && seq.label === 'slow');
    const full = report.sequences.find(seq => seq.id === id && seq.label === 'right');
    if (slow && full) {
      assert.ok(close(slow.distance / full.distance, .2, .00001), `${id}:20% stick advances20% actual distance`);
      check(`${id}:20% stick slows distance cadence to20%`, { ratio: slow.distance / full.distance });
    }
  }
  await lifecycle();
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.requests.length, 0, JSON.stringify(report.requests));
  check('No runtime exceptions or failed assets');
  await media();
  report.status = 'CAPTURED_FOR_VISUAL_REVIEW';
  console.log('CAPTURED_FOR_VISUAL_REVIEW: anatomical fidelity requires manual inspection.');
} catch (error) {
  report.status = report.assets.some(asset => asset.mode !== 'wholeBody') ? 'REJECTED_NOT_WHOLE_BODY' : 'FAILED_RUNTIME_CHECK';
  report.failure = { message: error.message, stack: error.stack };
  await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString(); await saveReport();
  await context.close(); await browser.close();
  console.log(`Report: ${path.join(out, 'report.json')}`);
}
