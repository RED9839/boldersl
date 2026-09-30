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
      { t: "attackAll", v: 7, say: "전방위 사격" },   // 10 → 7 — 2층 싸움 셋에 다 끼어 2층이 3층보다 셌다
      { t: "jam", v: 1, say: "경보음" },
      { t: "block", v: 12, say: "장갑 전개" },
      { t: "multi", v: 4, n: 3, say: "조준 연사" },
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

  // ── 에르피엔 · 새 얼굴 — 요정 저주 인형 · 과자 병정 · 숲의 작은 것들 ──────────
  // 요정 왕국은 과자와 꽃의 나라다. 에르핀이 몰래 챙기는 간식이 거꾸로 덤빈다.
  fairycurseddolldealer: {
    ko: "요정 저주 인형 · 딜러", hp: 34, row: "back", nature: "활발", tint: "#e0a0c0",
    pick: "shuffle",
    intents: [
      { t: "back", v: 9, say: "날개 실로 찌른다", w: 2 },
      { t: "debuff", id: "약화", v: 1, say: "가루를 흩뿌린다" },
      { t: "charge", say: "실을 감는다", next: { t: "back", v: 16, say: "실을 끊어 날린다" } },
    ],
  },
  fairycurseddolltanker: {
    ko: "요정 저주 인형 · 방패", hp: 52, row: "front", nature: "순수", tint: "#c0a0d8",
    intents: [
      { t: "guard", v: 7, say: "날개로 가린다" },
      { t: "attack", v: 9, say: "둔하게 부딪힌다" },
      { t: "block", v: 9, say: "몸을 만다" },
      { t: "attack", v: 11, say: "굴러 온다" },
    ],
  },
  fairycurseddollsupporter: {
    ko: "요정 저주 인형 · 응원", hp: 30, row: "back", nature: "순수", tint: "#f0c0d8",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 8, say: "반짝이 가루를 뿌린다" },
      { t: "buff", id: "힘", v: 1, say: "실을 팽팽히 당긴다" },
      { t: "back", v: 6, say: "톡 쏜다", w: 2 },
    ],
  },
  marshmallowtanker: {
    ko: "마시멜로 방패병", hp: 48, row: "front", nature: "순수", tint: "#f0e6d8",
    intents: [
      { t: "block", v: 10, say: "말랑하게 부푼다" },
      { t: "attack", v: 8, say: "몸으로 민다" },
      { t: "guard", v: 6, say: "줄을 맞춘다" },
      { t: "attack", v: 12, say: "통통 튀어 부딪힌다" },
    ],
  },
  marshmallowdealer: {
    ko: "마시멜로 창병", hp: 28, row: "back", nature: "활발", tint: "#e8f0d8",
    pick: "shuffle",
    intents: [
      { t: "back", v: 8, say: "꼬치를 찌른다", w: 2 },
      { t: "multi", v: 3, n: 3, say: "꼬치를 연달아 찌른다" },
      { t: "attack", v: 7, say: "앞으로 달려든다" },
    ],
  },
  marshmallowsupporter: {
    ko: "마시멜로 응원단", hp: 26, row: "back", nature: "활발", tint: "#d8f0e0",
    pick: "shuffle",
    intents: [
      { t: "buff", id: "힘", v: 2, say: "꽃 깃발을 흔든다" },
      { t: "heal", v: 7, say: "설탕을 덧바른다" },
      { t: "debuff", id: "약화", v: 1, say: "달콤한 냄새" },
    ],
  },
  buseuleogi: {
    ko: "과자 부스러기", hp: 20, row: "front", nature: "광기", tint: "#c08a5a",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 6, say: "와작 문다", w: 2 },
      { t: "multi", v: 2, n: 3, say: "부스러기가 튄다" },
      { t: "buff", id: "힘", v: 1, say: "설탕을 핥는다" },
    ],
  },
  lupalu: {
    ko: "꽃방울 요정", hp: 38, row: "back", nature: "우울", tint: "#f0b0c0",
    intents: [
      { t: "debuff", id: "약화", v: 2, say: "꽃가루가 날린다" },
      { t: "back", v: 10, say: "방울을 굴린다" },
      { t: "heal", v: 9, say: "꽃잎이 덮는다" },
      { t: "jam", v: 1, say: "방울이 딸랑인다" },
    ],
  },
  mogmaekim: {
    ko: "젤리 토끼", hp: 32, row: "front", nature: "활발", tint: "#b0d870",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 8, say: "폴짝 뛰어든다", w: 2 },
      { t: "block", v: 8, say: "말랑하게 굳는다" },
      { t: "multi", v: 4, n: 2, say: "통통 두 번 튄다" },
    ],
  },

  // ── 모나티엄 · 새 얼굴 — 엘프 도시의 병사 · 기계 · 저주 인형 ─────────────────
  elfsoldierlongrange: {
    ko: "엘프 궁수", hp: 38, row: "back", nature: "냉정", tint: "#7fa8c8",
    pick: "shuffle",
    intents: [
      { t: "back", v: 11, say: "뒷줄을 겨눈다", w: 2 },
      { t: "multi", v: 4, n: 3, say: "화살을 잇달아 쏜다" },
      { t: "debuff", id: "취약", v: 1, say: "표식을 쏜다" },
    ],
  },
  droneg: {
    ko: "지상 드론", hp: 58, row: "front", nature: "냉정", tint: "#8a9aa8",
    intents: [
      { t: "block", v: 12, say: "장갑을 내린다" },
      { t: "attack", v: 12, say: "다리로 걷어찬다" },
      { t: "jam", v: 1, say: "소음을 낸다" },
      { t: "attack", v: 14, say: "돌진한다" },
    ],
  },
  cranker: {
    ko: "크랭커", hp: 84, row: "front", nature: "광기", tint: "#6fb0b8",
    intents: [
      { t: "buff", id: "힘", v: 2, say: "태엽을 감는다" },
      { t: "attack", v: 14, say: "집게팔을 휘두른다" },
      { t: "charge", say: "증기를 뿜는다", next: { t: "attackAll", v: 12, say: "주위를 쓸어 버린다" } },
      { t: "block", v: 14, say: "몸통을 닫는다" },
    ],
    phase: {
      at: 0.4, say: "태엽이 헛돈다",
      intents: [
        { t: "multi", v: 6, n: 3, say: "마구 두드린다" },
        { t: "attack", v: 14, say: "집게팔을 휘두른다" },
        { t: "jam", v: 2, say: "증기가 샌다" },
      ],
    },
  },
  elfcurseddollsupporter: {
    ko: "엘프 저주 인형 · 응원", hp: 42, row: "back", nature: "우울", tint: "#9aa0c8",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 10, say: "실로 꿰맨다" },
      { t: "guard", v: 8, say: "실을 둘러친다" },
      { t: "back", v: 8, say: "실바늘을 던진다", w: 2 },
    ],
  },
  elfcurseddollwizard: {
    ko: "엘프 저주 인형 · 술사", hp: 44, row: "back", nature: "냉정", tint: "#a0b0d8",
    intents: [
      { t: "debuff", id: "취약", v: 2, say: "문양이 빛난다" },
      { t: "back", v: 13, say: "빛줄기를 쏜다" },
      { t: "jam", v: 1, say: "주문을 읊는다" },
      { t: "attackAll", v: 7, say: "빛이 번진다" },
    ],
  },
  goldring: {
    ko: "보물 상자 왕", hp: 96, row: "front", nature: "활발", tint: "#d8c060",
    intents: [
      { t: "block", v: 16, say: "뚜껑을 닫는다" },
      { t: "attack", v: 16, say: "와락 문다" },
      { t: "buff", id: "힘", v: 3, say: "보석을 삼킨다" },
      { t: "multi", v: 6, n: 3, say: "금화를 뱉는다" },
    ],
    phase: {
      at: 0.5, say: "뚜껑이 삐걱거린다",
      intents: [
        { t: "charge", say: "크게 입을 벌린다", next: { t: "attack", v: 28, say: "통째로 삼킨다" } },
        { t: "multi", v: 6, n: 3, say: "금화를 뱉는다" },
      ],
    },
  },

  // ── 벨리티엔 · 새 얼굴 — 마녀 저주 인형 · 뿌리 밑의 마법 것들 ───────────────
  witchcurseddolldealer: {
    ko: "마녀 저주 인형 · 딜러", hp: 50, row: "back", nature: "광기", tint: "#b07fb0",
    open: { t: "debuff", id: "취약", v: 1, say: "눈이 붉게 빛난다" },
    intents: [
      { t: "back", v: 15, say: "그림자 바늘" },
      { t: "multi", v: 5, n: 3, say: "실이 춤춘다" },
      { t: "charge", say: "실을 감는다", next: { t: "back", v: 26, say: "실을 끊어 날린다" } },
    ],
  },
  witchcurseddolltanker: {
    ko: "마녀 저주 인형 · 방패", hp: 80, row: "front", nature: "우울", tint: "#8f7fa8",
    intents: [
      { t: "guard", v: 12, say: "검은 천을 두른다" },
      { t: "attack", v: 13, say: "무겁게 내려친다" },
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다" },
      { t: "attack", v: 15, say: "밀어붙인다" },
    ],
  },
  witchcurseddollsupporter: {
    ko: "마녀 저주 인형 · 응원", hp: 46, row: "back", nature: "냉정", tint: "#c0a0d0",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 13, say: "약초를 달인다" },
      { t: "debuff", id: "약화", v: 2, say: "쓴 연기" },
      { t: "back", v: 10, say: "빗자루로 찌른다", w: 2 },
    ],
  },
  pumpkin: {
    ko: "호박 머리", hp: 64, row: "front", nature: "광기", tint: "#d89040",
    intents: [
      { t: "attack", v: 13, say: "덩굴로 후린다" },
      { t: "debuff", id: "약화", v: 2, say: "빙글빙글 웃는다" },
      { t: "charge", say: "불빛이 커진다", next: { t: "attackAll", v: 13, say: "불똥을 뿌린다" } },
      { t: "block", v: 12, say: "껍질을 굳힌다" },
    ],
  },
  hatsnail: {
    ko: "모자 달팽이", hp: 56, row: "front", nature: "우울", tint: "#a07860",
    intents: [
      { t: "block", v: 16, say: "모자 속으로 숨는다" },
      { t: "attack", v: 11, say: "느릿느릿 들이받는다" },
      { t: "debuff", id: "약화", v: 1, say: "끈적한 길을 남긴다" },
      { t: "attack", v: 14, say: "껍질로 굴러든다" },
    ],
  },
  nependers: {
    ko: "식충 화분", hp: 52, row: "back", nature: "광기", tint: "#c06060",
    intents: [
      { t: "back", v: 14, say: "덥석 문다" },
      { t: "heal", v: 10, say: "꿀꺽 삼킨다" },
      { t: "debuff", id: "취약", v: 2, say: "단 향을 풍긴다" },
      { t: "multi", v: 5, n: 2, say: "잎으로 두 번 문다" },
    ],
  },
  magicfork: {
    ko: "마법 포크", hp: 30, row: "back", nature: "활발", tint: "#c08090",
    pick: "shuffle",
    intents: [
      { t: "multi", v: 4, n: 3, say: "콕콕콕 찌른다", w: 2 },
      { t: "back", v: 9, say: "날아서 찌른다" },
      { t: "jam", v: 1, say: "리본이 나풀댄다" },
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
// 적은 그 층의 것만 — 에르피엔은 요정 · 과자 · 숲, 모나티엄은 엘프 병사 · 기계 · 엘프 저주 인형,
// 벨리티엔은 마녀 저주 인형 · 뿌리 밑의 마법 것들(docs/11-적.md).
//   pools[세기]  약(1-1~1-3) · 중(1-4~1-6) · 강(1-7~1-10) 싸움이 세 벌씩 — 지도의 칸마다 하나를 고른다
//   elites       엘리트 칸 전용 두 벌 — 그 층에서 가장 사나운 짝
//   fights       옛 도구(tools/sim.js · 로비 미리보기)가 보는 대표 셋 — pools 의 첫 벌
const FLOOR_DEFS = [
  {
    n: 1, name: "에르피엔", sub: "요정 왕국 · 세계수 주변",
    pools: [
      [["fairymobcloserange", "fairymoblongrange"], ["buseuleogi", "buseuleogi", "marshmallowdealer"], ["mogmaekim", "fairymoblongrange"]],
      [["fairymoblongrange", "ginseng", "fairymobcloserange"], ["marshmallowtanker", "marshmallowdealer", "marshmallowsupporter"], ["fairycurseddolltanker", "lupalu"]],
      [["gluttonbear", "ginseng"], ["fairycurseddolltanker", "fairycurseddolldealer", "fairycurseddollsupporter"], ["marshmallowtanker", "marshmallowdealer", "lupalu"]],
    ],
    elites: [["gluttonbear", "fairycurseddolldealer", "marshmallowdealer"], ["fairycurseddolltanker", "fairycurseddolldealer", "marshmallowsupporter", "fairycurseddolldealer"]],
    boss: ["curburus"],
  },
  {
    n: 2, name: "모나티엄", sub: "엘프 도시 · 동부",
    pools: [
      [["elfsoldiercloserange", "elfsoldierlongrange"], ["droneg", "elfsoldierlongrange"], ["elfsoldiercloserange", "drones"]],
      [["elfcurseddolldealer", "elfsoldiercloserange"], ["elfsoldiercloserange", "elfsoldierlongrange", "elfsoldierlongrange"], ["droneg", "elfcurseddollwizard"]],
      [["elfcurseddolltanker", "drones", "elfcurseddolldealer"], ["cranker", "elfsoldierlongrange", "elfsoldierlongrange"], ["elfcurseddolltanker", "elfcurseddollsupporter", "elfcurseddollwizard"]],
    ],
    elites: [["cranker", "drones"], ["goldring", "elfsoldiercloserange"]],
    boss: ["golem", "drones"],
  },
  {
    n: 3, name: "벨리티엔", sub: "마녀 왕국 · 세계수 뿌리",
    pools: [
      [["oldtree", "wisps"], ["hatsnail", "magicfork"], ["pumpkin", "wisps"]],
      [["witchcurseddollwizard", "oldtree"], ["nependers", "hatsnail", "wisps"], ["witchcurseddolltanker", "witchcurseddolldealer"]],
      [["witchcurseddollwizard", "wisps", "oldtree"], ["pumpkin", "nependers", "magicfork"], ["witchcurseddolltanker", "witchcurseddollsupporter", "witchcurseddolldealer"]],
    ],
    elites: [["oldtree", "nependers", "magicfork"], ["pumpkin", "witchcurseddolldealer", "magicfork"]],
    boss: ["imoogi", "witchcurseddollwizard"],
  },
];
export const FLOORS = FLOOR_DEFS.map((f) => ({ ...f, fights: f.pools.map((p) => p[0]) }));
