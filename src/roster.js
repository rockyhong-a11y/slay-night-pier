// Original character identities and SD artwork: rockyhong-a11y/slay and slay-beach-volley.
// Combat roles and wrestling move sets are specific to this one-stage action game.
const fighter = (id, name, ko, color, role, specialty, archetype, special, description, stats) => ({
  id, name, ko, color, role, specialty, archetype, special, description, ...stats,
  sprite: `/assets/sprites/${id}.webp`, portrait: `/assets/portraits/${id}.webp`,
});

export const ROSTER = [
  fighter('atlas', 'ATLAS', '아틀라스', '#f18a48', 'hero', 'powerbomb', '파워밤 스페셜리스트', '타이탄 파워밤', '적을 높이 들어 올려 지면에 꽂는 파워 타입. 묵직한 파워밤으로 거리를 지배한다.', { power: 5, speed: 3, technique: 4, hp: 160 }),
  fighter('nova', 'NOVA', '노바', '#73bff3', 'hero', 'suplex', '스플렉스 스페셜리스트', '오로라 스플렉스', '빠르게 파고들어 뒤로 넘기는 테크니션. 저먼 스플렉스로 접근한 적을 제압한다.', { power: 3, speed: 5, technique: 5, hp: 140 }),
  fighter('viper', 'VIPER', '바이퍼', '#aad77d', 'enemy', 'rush', '부두의 기습가', '바이퍼 러시', '옆으로 돌아들어 빠르게 치고 빠지는 적.', { power: 2, speed: 5, technique: 3, hp: 64 }),
  fighter('lynx', 'LYNX', '링스', '#c6a0ee', 'enemy', 'rush', '재빠른 추격자', '퀵 클로', '짧은 연속 공격으로 빈틈을 노린다.', { power: 2, speed: 5, technique: 4, hp: 64 }),
  fighter('raven', 'RAVEN', '레이븐', '#f16e7d', 'enemy', 'brawler', '레드라인 브롤러', '레드 훅', '직선으로 접근해 묵직한 훅을 날린다.', { power: 4, speed: 3, technique: 3, hp: 82 }),
  fighter('seraph', 'SERAPH', '세라프', '#a3d7f6', 'enemy', 'striker', '스카이 스트라이커', '스카이 킥', '긴 사거리의 킥으로 접근을 막는다.', { power: 3, speed: 4, technique: 4, hp: 72 }),
  fighter('tempest', 'TEMPEST', '템페스트', '#7bddbd', 'enemy', 'striker', '폭풍의 콤비네이터', '스톰 러시', '리듬을 바꾸며 연속 공격을 건다.', { power: 3, speed: 4, technique: 4, hp: 80 }),
  fighter('ember', 'EMBER', '엠버', '#f8bd69', 'enemy', 'heavy', '불꽃의 헤비히터', '버닝 엘보', '강한 체력과 타격으로 밀어붙인다.', { power: 5, speed: 2, technique: 3, hp: 104 }),
  fighter('valkyrie', 'VALKYRIE', '발키리', '#e5cd89', 'enemy', 'guard', '아이언 가드', '아이언 슬램', '공격을 견디고 근거리에서 반격한다.', { power: 4, speed: 2, technique: 4, hp: 106 }),
  fighter('onyx', 'ONYX', '오닉스', '#b0a0f4', 'enemy', 'boss', '마지막 수문장 · BOSS', '미드나이트 브레이커', '끝 부두의 마지막 상대. 넓은 공격과 잡기로 길을 지킨다.', { power: 5, speed: 3, technique: 5, hp: 230, boss: true }),
];

export const HEROES = ROSTER.filter(fighter => fighter.role === 'hero');
export const ENEMIES = ROSTER.filter(fighter => fighter.role === 'enemy');
export const characterFor = id => ROSTER.find(fighter => fighter.id === id) || HEROES[0];
export const ENCOUNTERS = [
  { name: '진입로', enemies: ['viper', 'lynx'] },
  { name: '하역장', enemies: ['raven', 'seraph', 'tempest'] },
  { name: '끝 부두', enemies: ['ember', 'valkyrie', 'onyx'] },
];
