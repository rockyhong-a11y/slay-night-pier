import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { ROSTER } from '../src/roster.js';

// These checks establish shipped-file/authoring integrity. Anatomical fidelity,
// costume continuity, and natural step progression require actual visual review.
const root = new URL('../', import.meta.url);
const readJSON = relative => JSON.parse(readFileSync(new URL(relative, root)));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-7;
const positive = value => Number.isFinite(value) && value > 0;

/** Read actual WebP dimensions instead of trusting the manifest's rectangle bounds. */
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'complete RIFF payload');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + length <= bytes.length, 'complete WebP chunk');
    if (type === 'VP8X') {
      assert.ok(length >= 10);
      return { width: 1 + bytes.readUIntLE(start + 4, 3), height: 1 + bytes.readUIntLE(start + 7, 3) };
    }
    if (type === 'VP8L') {
      assert.ok(length >= 5); assert.equal(bytes[start], 0x2f);
      const packed = bytes.readUInt32LE(start + 1);
      return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >>> 14) & 0x3fff) };
    }
    if (type === 'VP8 ') {
      assert.ok(length >= 10);
      assert.equal(bytes.subarray(start + 3, start + 6).toString('hex'), '9d012a');
      return { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
    }
    offset = start + length + (length & 1);
  }
  throw new Error('WebP has no image dimension chunk');
}

test('all ten shipped walking banks have versioned pixels, bounded chronological cells, and coherent reference units', () => {
  const manifest = readJSON('public/assets/sprites/manifest.json');
  assert.deepEqual(Object.keys(manifest).sort(), ROSTER.map(actor => actor.id).sort());
  const scenes = new Map();
  for (const { id } of ROSTER) {
    const actor = manifest[id], bank = actor.walk;
    assert.equal(bank.mode, 'wholeBody', `${id}: retired limb-rig metadata cannot be shipped`);
    assert.equal(bank.rig, undefined, `${id}: no separate limb rig`);
    assert.equal(bank.upperImage, undefined, `${id}: no separate upper-body bank`);
    assert.equal(bank.frames.length, 12, `${id}: twelve chronological full-body frames`);
    assert.ok(bank.image.startsWith('/assets/sprites/') && bank.image.endsWith('.webp'));
    const bytes = readFileSync(new URL(`public${bank.image}`, root)), actual = webpSize(bytes);
    assert.equal(bank.imageVersion, sha256(bytes).slice(0, 16), `${id}: metadata cannot reference stale cached pixels`);
    assert.equal(bank.width, actual.width, `${id}: actual encoded width`);
    assert.equal(bank.height, actual.height, `${id}: actual encoded height`);
    for (const key of ['bodyHeight', 'sourceBodyHeight', 'sourceToRenderScale', 'canonicalBodyHeight', 'cycleDistance']) {
      assert.ok(positive(bank[key]), `${id}: finite positive ${key}`);
    }
    assert.ok(near(bank.bodyHeight, bank.sourceBodyHeight * bank.sourceToRenderScale), `${id}: raw/render unit conversion`);
    assert.ok(near(bank.canonicalBodyHeight, actor.combat.bodyHeight), `${id}: canonical comparison references the shipped combat art`);
    assert.ok(near(bank.cycleDistance, bank.cadenceCalibration.cycleWorldDistanceAt128), `${id}: cadence units agree`);
    const rects = new Set();
    for (const [index, frame] of bank.frames.entries()) {
      assert.ok(near(frame.phase, index / 12), `${id}:${index}: ordered complete cycle`);
      assert.equal(frame.rect.length, 4);
      assert.ok(frame.rect.every(Number.isInteger), `${id}:${index}: source pixel rectangle`);
      const [x, y, width, height] = frame.rect;
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
      assert.ok(x + width <= actual.width && y + height <= actual.height, `${id}:${index}: crop stays inside actual pixels`);
      rects.add(frame.rect.join(','));
      assert.equal(frame.pivot.length, 2); assert.equal(frame.centerPivot.length, 2);
      assert.ok([...frame.pivot, ...frame.centerPivot].every(Number.isFinite));
      assert.ok(near(frame.pivot[0], frame.centerPivot[0]), `${id}:${index}: common horizontal body/ground pivot`);
      assert.ok(near(frame.pivot[1] - frame.centerPivot[1], bank.bodyHeight / 2), `${id}:${index}: one authored standing-reference center`);
      assert.equal(frame.bodyHeight, undefined, `${id}:${index}: no pose-specific body-size normalization`);
    }
    assert.equal(rects.size, 12, `${id}: each chronological frame references its own packed cell`);
    assert.ok(bank.sourceScene.startsWith('tools/') && bank.sourceScene.endsWith('.blend'), `${id}: durable editable source path`);
    if (!scenes.has(bank.sourceScene)) {
      const scene = new URL(bank.sourceScene, root);
      assert.ok(statSync(scene).isFile());
      const bytes = readFileSync(scene);
      assert.ok(bytes.length > 128, 'authoring source is nonempty');
      const plain = bytes.toString('ascii', 0, 7) === 'BLENDER';
      const compressed = bytes.subarray(0, 2).toString('hex') === '1f8b' || bytes.subarray(0, 4).toString('hex') === '28b52ffd';
      assert.ok(plain || compressed, 'Blender source has a recognized plain/gzip/zstd file header');
      scenes.set(bank.sourceScene, true);
    }
  }
});

test('shipped walk-source provenance matches the selected source files and global calibration records', () => {
  const manifest = readJSON('public/assets/sprites/manifest.json');
  const provenance = readJSON('tools/walk-source/provenance.json');
  const calibration = readJSON('tools/walk-source/calibration.json');
  for (const { id } of ROSTER) {
    const bank = manifest[id].walk;
    if (bank.sourceSHA256) {
      const selected = provenance.otherCharacters[id];
      assert.ok(selected, `${id}: selected source record exists`);
      assert.equal(bank.sourceSHA256, selected.sha256, `${id}: pack uses the selected source revision`);
      assert.equal(sha256(readFileSync(new URL(selected.path, root))), selected.sha256, `${id}: retained source pixels match their provenance`);
      assert.ok(near(bank.sourceBodyHeight, calibration[id].rawBodyHeight), `${id}: exactly one selected character calibration`);
      const expectedOrder = calibration[id].frameOrder ?? Array.from({ length: 12 }, (_, index) => index);
      assert.equal(expectedOrder.length, 12, `${id}: selected cycle includes twelve whole source bodies`);
      assert.ok(expectedOrder.every(Number.isInteger), `${id}: source order uses integer cell indices`);
      assert.deepEqual([...expectedOrder].sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index), `${id}: selected chronology is a whole-frame permutation`);
      assert.deepEqual(bank.frameOrder, expectedOrder, `${id}: packed bank preserves the visually selected chronology`);
      assert.deepEqual(bank.frames.map(frame => frame.sourceCellIndex), expectedOrder, `${id}: each packed complete body traces to its selected source cell`);
    } else {
      assert.equal(id, 'atlas', `${id}: generated character source checksum is required`);
      assert.equal(bank.sourceJob, provenance.atlas.jobId);
      assert.ok(near(bank.sourceBodyHeight, provenance.atlas.sourceBodyReference));
      assert.equal(bank.sourceIndices.length, 12);
      assert.equal(provenance.atlas.sourceFrames.length, 12);
      for (const [index, source] of provenance.atlas.sourceFrames.entries()) {
        assert.ok(source.path.endsWith(`frame-${String(bank.sourceIndices[index]).padStart(3, '0')}.png`));
        assert.equal(sha256(readFileSync(new URL(source.path, root))), source.sha256, 'retained Higgsfield frame matches provenance');
      }
    }
  }
});
