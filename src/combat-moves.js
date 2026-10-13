// Screen directions are fixed so touch and keyboard use the same eight slots.
export const DIRECTIONS = ['up', 'down', 'left', 'right'];
export const DIRECTION_LABELS = { up: '↑', down: '↓', left: '←', right: '→' };
const names = {
  atlas: {
    front: ['하이 리프트 파워밤', '싯아웃 파워밤', '스핀 파워밤', '러닝 파워밤'],
    rear: ['리버스 파워밤', '백클린치 슬램', '턴오버 파워밤', '백 리프트밤'],
  },
  nova: {
    front: ['버티컬 스플렉스', '벨리 투 벨리', '피셔맨 스플렉스', '스냅 스플렉스'],
    rear: ['저먼 스플렉스', '드래곤 스플렉스', '사이드 스플렉스', '롤링 저먼'],
  },
};
export const GRAB_MOVES = Object.fromEntries(Object.entries(names).map(([hero, sides]) => [hero,
  Object.fromEntries(Object.entries(sides).map(([side, moves]) => [side,
    Object.fromEntries(DIRECTIONS.map((direction, i) => [direction, {
      id: `${hero}_${side}_${direction}`, clip: `${hero}_${side}_${direction}`,
      name: moves[i], hero, side, direction,
      damage: side === 'rear' ? [46, 43, 44, 48][i] : [38, 36, 37, 40][i],
      kind: hero === 'atlas' ? 'powerbomb' : 'suplex',
    }]))
  ]))
]));
export const COMBO_STEPS = [
  { id: 'jab', name: '잽', damage: 8, range: 91 },
  { id: 'cross', name: '스트레이트', damage: 11, range: 100 },
  { id: 'lowKick', name: '로우 킥', damage: 10, range: 111 },
  { id: 'roundhouse', name: '라운드 킥', damage: 14, range: 121 },
];
export const CHAIN_MOVES = {
  atlas: { id: 'atlas_chain', clip: 'atlas_chain', name: '킹 오브 부두', damage: 50, kind: 'powerbomb' },
  nova: { id: 'nova_chain', clip: 'nova_chain', name: '롤링 스플렉스 체인', damage: 46, kind: 'suplex' },
};
export const COUNTER_MOVES = Object.fromEntries(['atlas', 'nova'].map(hero => [hero, {
  slam: { id: `${hero}_counter_slam`, clip: `${hero}_counter_slam`, name: hero === 'atlas' ? '캐치 파워슬램' : '리버설 스플렉스', damage: 42, kind: 'counter' },
  armLock: { id: `${hero}_counter_armLock`, clip: `${hero}_counter_armLock`, name: hero === 'atlas' ? '숄더 록 슬램' : '스탠딩 암브레이커', damage: 36, kind: 'counter' },
}]));
export const COMBAT_RULES = Object.freeze({
  chargeThreshold: 0.42, chargeMax: 1.15, rearDuration: 2.3,
  bufferLifetime: 0.55, comboTimeout: 1.35,
  counterWindow: 0.18, counterCooldown: 0.8,
});
export function directionForMove(x = 0, y = 0, fallback = 'down') {
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.2) return fallback;
  return Math.abs(y) >= Math.abs(x) ? y < 0 ? 'up' : 'down' : x < 0 ? 'left' : 'right';
}
