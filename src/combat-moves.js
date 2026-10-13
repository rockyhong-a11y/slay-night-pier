// Screen directions are fixed so touch and keyboard use the same eight slots.
export const DIRECTIONS = ['up', 'down', 'left', 'right'];
export const DIRECTION_LABELS = { up: '↑', down: '↓', left: '←', right: '→' };
const names = {
  atlas: {
    front: ['파워밤', 'DDT', '백브레이커', '스파인버스터'],
    rear: ['저먼 스플렉스', '리버스 DDT', '러시안 레그 스윕', '불독'],
  },
  nova: {
    front: ['버티컬 스플렉스', '스냅메어', '암드래그', '허리케인라나'],
    rear: ['드래곤 스플렉스', '백 스플렉스', '넥브레이커', '롤링 크레이들'],
  },
};
const kinds = {
  atlas: { front: ['powerbomb', 'ddt', 'backbreaker', 'spinebuster'], rear: ['germanSuplex', 'reverseDdt', 'legSweep', 'bulldog'] },
  nova: { front: ['verticalSuplex', 'snapmare', 'armDrag', 'hurricanrana'], rear: ['dragonSuplex', 'backSuplex', 'neckbreaker', 'cradle'] },
};
export const GRAB_MOVES = Object.fromEntries(Object.entries(names).map(([hero, sides]) => [hero,
  Object.fromEntries(Object.entries(sides).map(([side, moves]) => [side,
    Object.fromEntries(DIRECTIONS.map((direction, i) => [direction, {
      id: `${hero}_${side}_${direction}`, clip: `${hero}_${side}_${direction}`,
      name: moves[i], hero, side, direction,
      damage: side === 'rear' ? [46, 43, 44, 48][i] : [38, 36, 37, 40][i],
      kind: kinds[hero][side][i],
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
