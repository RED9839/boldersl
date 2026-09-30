// 적. **이름과 종류는 게임에서 꺼낸 실제 몬스터**다 — assets/monster 에 231종이 있다.
// key 가 그 몬스터의 파일 이름이고, art.js 가 그 이름으로 그림을 찾는다.
// 수치만 우리 것이다(docs/01-규칙.md).
//
// 적도 성격을 가진다 — 게임 파일이 몬스터마다 naive/mad/cool/gloomy/jolly 다섯 벌을 들고 있다.
// nature 는 사도와 같은 성격 이름(순수·광기·냉정·우울·활발)을 쓴다 — 성격 상성용.
//
// 수(intents) — 매 턴 하나를 고르고, 적 머리 위에 미리 보여 준다.
//   attack v     앞줄부터 친다. id·n 이 있으면 맞은 사람에게 그 상태를 n 만큼 건다
//   back v       뒷줄부터 친다
//   attackAll v  파티 전체
//   multi v×n    앞줄부터 n 번 (한 번마다 새로 고른다 — 방어가 먼저 벗겨진다)
//   charge       이번 턴엔 힘을 모으고 next 를 **다음 턴에 반드시** 한다. 미리 알려 주는 큰 수다.
//                기절·봉인으로 멈추게 하거나 수를 흐트러뜨리면 모은 힘이 흩어진다
//   block v      자기 방어 · guard v  적 전체 방어 · heal v  체력 비율이 가장 낮은 적을 회복
//   buff         자기 강화 · debuff  아군 전체에 상태 · jam  다음 턴 AP 를 깎는다
//
// 고르는 법 — 전에는 모두 정해진 순서를 돌아서 두 판만 하면 다 외워졌다.
//   pick: "cycle"(기본)  적힌 순서대로. 보스는 읽히는 편이 공정하다
//   pick: "shuffle"      무작위로, 다만 같은 종류를 세 번 잇지 않는다. w 로 무게를 준다
//   open                 첫 턴에 하는 수
//   phase {at, say, intents}  체력이 at 비율 아래로 떨어지면 수가 바뀐다(한 번)
// row: front / back — 뒷줄 적은 관통(pierce)이 있어야 닿는다

export const ENEMIES = {
  // ── 에르피엔 (요정 왕국) ────────────────────────────────────────────
  fairymobcloserange: {
    ko: "요정 무리", hp: 41, row: "front", nature: "순수", tint: "#8ec98a",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 11, say: "달려든다", w: 2 },
      { t: "multi", v: 4, n: 3, say: "우르르 몰려든다" },
      { t: "block", v: 8, say: "웅크린다" },
    ],
  },
  fairymoblongrange: {
    ko: "요정 무리(뒤)", hp: 27, row: "back", nature: "활발", tint: "#7b9c8a",
    pick: "shuffle",
    open: { t: "jam", v: 2, say: "왁자지껄 떠든다" },
    intents: [
      { t: "back", v: 7, say: "뒤로 파고든다", w: 2 },
      { t: "jam", v: 2, say: "왁자지껄 떠든다" },
      { t: "attack", v: 6, say: "스쳐 지나간다" },
      { t: "debuff", id: "약화", v: 2, say: "장난을 친다" },
    ],
  },
  ginseng: {
    ko: "인삼", hp: 30, row: "back", nature: "우울", tint: "#c0b07a",
    intents: [
      { t: "block", v: 10, say: "땅에 박힌다" },
      { t: "heal", v: 10, say: "뿌리에서 즙이 돈다" },
      { t: "debuff", id: "약화", v: 2, say: "쓴 냄새" },
      { t: "back", v: 9, say: "뿌리를 뻗는다" },
    ],
  },
  gluttonbear: {
    ko: "먹보곰", hp: 67, row: "front", nature: "광기", tint: "#b07f5a",
    intents: [
      { t: "attack", v: 16, say: "앞발을 든다" },
      { t: "block", v: 10, say: "몸을 웅크린다" },
      { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attack", v: 26, say: "덮친다" } },
      { t: "jam", v: 2, say: "으르렁댄다" },
      { t: "buff", id: "힘", v: 3, say: "배를 채운다" },
    ],
    phase: {
      at: 0.4, say: "배가 고파 사나워졌다",
      intents: [
        { t: "multi", v: 8, n: 2, say: "마구 할퀸다" },
        { t: "attack", v: 16, say: "앞발을 든다" },
        { t: "buff", id: "힘", v: 2, say: "허겁지겁 먹는다" },
      ],
    },
  },

  // ── 모나티엄 (엘프 도시) ────────────────────────────────────────────
  elfsoldiercloserange: {
    ko: "엘프 병사", hp: 51, row: "front", nature: "냉정", tint: "#6fa2c0",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 13, say: "대열을 맞춘다", w: 2 },
      { t: "attack", v: 8, id: "취약", n: 1, say: "창끝으로 찌른다" },
      { t: "guard", v: 8, say: "대열을 좁힌다" },
      { t: "jam", v: 1, say: "창끝을 겨눈다" },
    ],
  },
  drones: {
    ko: "경비 드론", hp: 51, row: "back", nature: "냉정", tint: "#7fb6d9",
    intents: [
      { t: "attackAll", v: 10, say: "전방위 사격" },
      { t: "jam", v: 1, say: "경보음" },
      { t: "block", v: 12, say: "장갑 전개" },
      { t: "multi", v: 5, n: 3, say: "조준 연사" },
    ],
  },
  elfcurseddolldealer: {
    ko: "엘프 저주 인형 · 딜러", hp: 46, row: "back", nature: "광기", tint: "#a08ec0",
    open: { t: "jam", v: 2, say: "빈 눈으로 본다" },
    intents: [
      { t: "back", v: 14, say: "뒤를 노린다" },
      { t: "debuff", id: "취약", v: 2, say: "실이 당겨진다" },
      { t: "charge", say: "실을 감는다", next: { t: "back", v: 24, say: "실을 끊어 날린다" } },
    ],
  },
  elfcurseddolltanker: {
    ko: "엘프 저주 인형 · 방패", hp: 73, row: "front", nature: "우울", tint: "#8f8fa8",
    intents: [
      { t: "guard", v: 10, say: "앞을 막는다" },
      { t: "attack", v: 12, say: "둔하게 휘두른다" },
      { t: "jam", v: 2, say: "실이 끊어지는 소리" },
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다" },
    ],
    phase: {
      at: 0.5, say: "실이 풀려 막는 법을 잊었다",
      intents: [
        { t: "attack", v: 15, say: "마구 휘두른다" },
        { t: "attack", v: 15, say: "마구 휘두른다" },
        { t: "block", v: 14, say: "제 몸만 가린다" },
      ],
    },
  },

  // ── 벨리티엔 (마녀 왕국 · 세계수 뿌리) ──────────────────────────────
  witchcurseddollwizard: {
    ko: "마녀 저주 인형 · 술사", hp: 57, row: "back", nature: "냉정", tint: "#b08fc0",
    intents: [
      { t: "jam", v: 2, say: "주문을 읊는다" },
      { t: "debuff", id: "취약", v: 2, say: "손끝을 겨눈다" },
      { t: "back", v: 17, say: "뿌리째 끌어당긴다" },
      { t: "heal", v: 12, say: "결계로 상처를 덮는다" },
    ],
  },
  oldtree: {
    ko: "늙은 나무", hp: 73, row: "front", nature: "우울", tint: "#7fa06a",
    intents: [
      { t: "attack", v: 11, say: "가지를 뻗는다" },
      { t: "buff", id: "힘", v: 3, say: "뿌리를 내린다" },
      { t: "charge", say: "가지를 뒤로 젖힌다", next: { t: "attack", v: 22, say: "크게 후려친다" } },
      { t: "heal", v: 10, say: "수액이 돈다" },
    ],
  },
  wisps: {
    ko: "위습", hp: 30, row: "back", nature: "순수", tint: "#9aa8d9",
    pick: "shuffle",
    intents: [
      { t: "jam", v: 2, say: "흩어졌다 모인다" },
      { t: "back", v: 9, say: "스며든다" },
      { t: "debuff", id: "약화", v: 2, say: "빛이 흔들린다" },
      { t: "multi", v: 3, n: 3, say: "여럿으로 갈라진다" },
    ],
  },

  // ── 층의 끝 ─────────────────────────────────────────────────────────
  // 보스는 순서대로 돈다(읽히는 편이 공정하다). 대신 체력이 절반 아래로 가면 수가 바뀐다.
  // 바뀐 뒤에도 한 바퀴 동안 들어오는 피해는 전과 비슷하게 맞췄다 — 더 세게가 아니라 다르게.
  curburus: {
    ko: "커버러스", hp: 242, row: "front", boss: true, nature: "광기", tint: "#c07f7f",
    intents: [
      { t: "attackAll", v: 11, say: "세 머리가 짖는다" },
      { t: "back", v: 24, say: "뒤를 물어뜯는다" },
      { t: "block", v: 16, say: "웅크린다" },
      { t: "jam", v: 3, say: "울부짖는다" },
      { t: "buff", id: "힘", v: 3, say: "털을 세운다" },
      { t: "attackAll", v: 17, say: "세 머리가 짖는다" },
    ],
    phase: {
      at: 0.5, say: "세 머리가 모두 깨어났다",
      intents: [
        { t: "multi", v: 9, n: 3, say: "세 머리가 물어뜯는다" },
        { t: "jam", v: 2, say: "울부짖는다" },
        { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attackAll", v: 20, say: "불길을 뿜는다" } },
        { t: "back", v: 22, say: "뒤를 물어뜯는다" },
      ],
    },
  },
  golem: {
    ko: "골렘", hp: 242, row: "front", boss: true, nature: "냉정", tint: "#9a9a8c",
    intents: [
      { t: "block", v: 20, say: "굳는다" },
      { t: "attack", v: 26, say: "팔을 들어 올린다" },
      { t: "attackAll", v: 13, say: "땅을 내려친다" },
      { t: "jam", v: 2, say: "그림자가 덮친다" },
      { t: "buff", id: "힘", v: 4, say: "돌이 붙는다" },
    ],
    phase: {
      at: 0.5, say: "몸에 금이 가 돌조각이 튄다",
      intents: [
        { t: "multi", v: 7, n: 3, say: "돌조각이 튄다" },
        { t: "charge", say: "팔을 끝까지 들어 올린다", next: { t: "attack", v: 38, say: "내려찍는다" } },
        { t: "guard", v: 18, say: "돌을 끌어모은다" },
        { t: "attackAll", v: 13, say: "땅을 내려친다" },
      ],
    },
  },
  imoogi: {
    ko: "이무기", hp: 242, row: "front", boss: true, nature: "우울", tint: "#7f9dc0",
    intents: [
      { t: "attackAll", v: 14, say: "몸을 휘감는다" },
      { t: "back", v: 26, say: "뒤를 삼킨다" },
      { t: "jam", v: 3, say: "못 오른 눈으로 본다" },
      { t: "debuff", id: "취약", v: 3, say: "비늘이 곤두선다" },
      { t: "block", v: 18, say: "똬리를 튼다" },
      { t: "attackAll", v: 18, say: "몸을 휘감는다" },
    ],
    phase: {
      at: 0.5, say: "여의주를 향해 몸부림친다",
      intents: [
        { t: "charge", say: "물을 머금는다", next: { t: "attackAll", v: 22, say: "물줄기를 뿜는다" } },
        { t: "heal", v: 18, say: "비늘을 새로 돋운다" },
        { t: "back", v: 24, say: "뒤를 삼킨다" },
        { t: "attack", v: 14, id: "취약", n: 2, say: "꼬리로 후려친다" },
      ],
    },
  },
};

for (const [id, e] of Object.entries(ENEMIES)) e.id = id;

// 층 — 지어낸 곳이 아니라 엘리아스의 실제 지도에서 온다(docs/03-세계관.md).
// 요정 왕국에서 시작해 엘프 도시를 지나 세계수 뿌리까지 내려간다.
export const FLOORS = [
  {
    n: 1, name: "에르피엔", sub: "요정 왕국 · 세계수 주변",
    fights: [
      ["fairymobcloserange", "fairymoblongrange"],
      ["fairymoblongrange", "ginseng", "fairymobcloserange"],
      ["gluttonbear", "ginseng"],
    ],
    boss: ["curburus"],
  },
  {
    n: 2, name: "모나티엄", sub: "엘프 도시 · 동부",
    fights: [
      ["elfsoldiercloserange", "drones"],
      ["elfcurseddolldealer", "elfsoldiercloserange"],
      ["elfcurseddolltanker", "drones", "elfcurseddolldealer"],
    ],
    boss: ["golem", "drones"],
  },
  {
    n: 3, name: "벨리티엔", sub: "마녀 왕국 · 세계수 뿌리",
    fights: [
      ["oldtree", "wisps"],
      ["witchcurseddollwizard", "oldtree"],
      ["witchcurseddollwizard", "wisps", "oldtree"],
    ],
    boss: ["imoogi", "witchcurseddollwizard"],
  },
];
