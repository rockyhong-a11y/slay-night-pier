// One warm, painted impact family for fists, feet, counters and wrestling landings.
export const IMPACT_PROFILES = Object.freeze({
  light: { duration: .14, freeze: .028, shake: 1.8, radius: 22, rate: 1.08, gain: .31 },
  heavy: { duration: .19, freeze: .055, shake: 3.6, radius: 34, rate: .94, gain: .38 },
  ground: { duration: .23, freeze: .07, shake: 4.6, radius: 43, rate: .82, gain: .42 },
  guard: { duration: .12, freeze: .02, shake: 1.2, radius: 20, rate: 1.18, gain: .24 },
});

export function makeImpact(x, y, kind = 'light', direction = 1, seed = 0) {
  const profile = IMPACT_PROFILES[kind] || IMPACT_PROFILES.light;
  return { x, y, kind, direction, seed, age: 0, life: profile.duration, total: profile.duration };
}

const polygon = (c, points) => {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
};

function burstPoints(radius, seed, squash = 1, ground = false) {
  if (ground) return [[-radius * 1.18, 0], ...Array.from({ length: 17 }, (_, i) => {
    const angle = -Math.PI + i * Math.PI / 16;
    const length = i % 2 ? radius * .34 : radius * (.83 + ((i + seed) % 4) * .08);
    return [Math.cos(angle) * length, Math.sin(angle) * length * squash];
  }), [radius * 1.18, 0]];
  return Array.from({ length: 18 }, (_, i) => {
    const angle = i * Math.PI / 9;
    const length = i % 2 ? radius * .22 : radius * (i % 6 === 0 ? 1.18 : .69 + ((i + seed) % 5) * .075);
    return [Math.cos(angle) * length, Math.sin(angle) * length * squash];
  });
}

export function drawImpact(c, burst, x, y, scale = 1, reduced = false) {
  const profile = IMPACT_PROFILES[burst.kind] || IMPACT_PROFILES.light;
  const t = Math.min(1, burst.age / burst.total);
  const ground = burst.kind === 'ground';
  const radius = profile.radius * scale * (reduced ? .74 : 1) * (.72 + Math.min(t * 6, 1) * .3);
  const fade = t < .22 ? 1 : Math.max(0, (1 - t) / .78);
  c.save();
  c.translate(x, y);
  c.scale(burst.direction < 0 ? -1 : 1, 1);
  c.globalAlpha = fade;
  c.lineJoin = 'round';
  // A compact contact star replaces the former long-lived neon dust and rings.
  polygon(c, burstPoints(radius, burst.seed, ground ? .68 : .85, ground));
  c.fillStyle = ground || burst.kind === 'heavy' ? '#f4772b' : '#e7a33a';
  c.strokeStyle = '#925c26'; c.lineWidth = Math.max(.7, scale);
  c.fill(); c.stroke();
  polygon(c, burstPoints(radius * .72, burst.seed + 2, ground ? .55 : .82, ground));
  c.fillStyle = '#ffda70'; c.fill();
  polygon(c, burstPoints(radius * (t < .22 ? .55 : .33), burst.seed, ground ? .49 : .72, ground));
  c.fillStyle = '#fff8df'; c.fill();
  if (!reduced && t > .08) {
    // Broad, tapered slashes read like hand-drawn speed accents, not confetti.
    const rays = ground ? 5 : 4;
    for (let i = 0; i < rays; i++) {
      const angle = ground ? Math.PI * (1.09 + i * .2) : -.85 + i * .57;
      const r = radius * (1 + t * 1.1), length = radius * (.5 - t * .22);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const tip = [dx * (r + length), dy * (r + length) * (ground ? .68 : 1)];
      polygon(c, [[dx * r - dy * 2.6 * scale, dy * r + dx * 2.6 * scale], tip,
        [dx * r + dy * 2.6 * scale, dy * r - dx * 2.6 * scale]]);
      c.fillStyle = t < .45 ? '#ffe4a1' : '#dd783d'; c.fill();
    }
  }
  c.restore();
}

/** A deterministic dry crack + low body thud; every impact plays this same sample. */
export function makeHitSound(sampleRate = 44100) {
  const data = new Float32Array(Math.ceil(sampleRate * .24));
  let seed = 2463534242, slow = 0, fast = 0, phase = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    slow += (noise - slow) * Math.min(1, 950 / sampleRate);
    fast += (noise - fast) * Math.min(1, 12500 / sampleRate);
    phase += 2 * Math.PI * (58 + 130 * Math.exp(-t * 42)) / sampleRate;
    const attack = Math.min(1, t / .0015), tail = Math.max(0, 1 - t / .24);
    const crack = (fast - slow) * (Math.exp(-t * 145) * .7 + Math.exp(-t * 37) * .19);
    const body = Math.sin(phase) * Math.exp(-t * 29) * .4 + slow * Math.exp(-t * 18) * .35;
    data[i] = (crack + body) * attack * tail;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] *= .86 / peak;
  return data;
}
