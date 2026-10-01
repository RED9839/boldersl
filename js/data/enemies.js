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
//   rush N               즉시 행동 장수 — 이 수가 예고된 뒤 카드 N장이면 당겨서 한다(0 은 안 당겨짐).
//                        안 적으면 값어치로 자동(combat.js intentRush). 적마다 맨 위 「공략」 한 줄이 rush 를 정한다(docs/12)
// passives [{name, on, do, ...}]  적 패시브 — 몸에 붙은 성질. 침묵에 막히지 않는다(combat.js foePassives)
//   on  fightStart · turnStart · turnEnd · hurt · lowHp(at) · allyDown · card(type · every) · rushed · debuffed
//   do  수와 같은 모양 {t, v, …} 또는 thorns v(때린 사도에게) · selfHeal v
//   limit  턴당 몇 번(기본 1, 0 은 제한 없음). fightStart · lowHp 는 한 번
// row: front / back — 뒷줄 적은 관통(pierce)이 있어야 닿는다

export const ENEMIES = {
  // ── 에르피엔 (요정 왕국) ────────────────────────────────────────────
  fairymobcloserange: {
    // 공략: 굼뜬 무리 — 수가 다 ⚡9 이상이라 몰아 써도 안 움직인다. 웅크림은 안 당겨진다. 카드를 아끼지 말고 빨리 치워라 (느긋이)
    ko: "요정 무리", hp: 41, row: "front", nature: "순수", tint: "#8ec98a",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 11, say: "달려든다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "우르르 몰려든다", rush: 10 },
      { t: "block", v: 8, say: "웅크린다", rush: 0 },
    ],
  },
  fairymoblongrange: {
    // 공략: 떠들기·장난은 ⚡3 — 그 수가 보이면 두 장까지, 큰 한 장이나 관통으로 먼저. 공격 수는 ⚡4~5라 한 장 더 내도 된다 (재촉꾼)
    ko: "요정 무리(뒤)", hp: 27, row: "back", nature: "활발", tint: "#7b9c8a",
    pick: "shuffle",
    open: { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
    intents: [
      { t: "back", v: 7, say: "뒤로 파고든다", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
      { t: "attack", v: 6, say: "스쳐 지나간다", rush: 4 },
      { t: "debuff", id: "약화", v: 1, say: "장난을 친다", rush: 3 },
    ],
  },
  ginseng: {
    // 공략: 즙·박힘이 ⚡3이라 두면 동료가 낫는다 — 먼저 뽑되, 절반에서 한 번 땅에 숨으니(방어) 절반을 넘기는 턴엔 한 번에 몰아 뽑아라 (약한 고리)
    ko: "인삼", hp: 30, row: "back", nature: "우울", tint: "#c0b07a",
    passives: [
      { name: "땅속으로", on: "lowHp", at: 0.5, do: { t: "block", v: 8 } },
    ],
    intents: [
      { t: "heal", v: 8, say: "뿌리에서 즙이 돈다", rush: 3 },     // 10 → 8 — 땅속으로 숨는 몫
      { t: "guard", v: 6, say: "땅에 박힌다", rush: 3 },
      { t: "debuff", id: "약화", v: 2, say: "쓴 냄새", rush: 4 },
      { t: "back", v: 9, say: "뿌리를 뻗는다", rush: 6 },
    ],
  },
  gluttonbear: {
    // 공략: 웅크림 ⚡3 — 그 턴엔 적게 세게. 숨을 들이쉬면 끊어라. 동료가 쓰러지면 격노하니 곰을 먼저, 아니면 들이쉬는 턴엔 동료를 잡지 마라 (반격꾼 + 차지꾼)
    ko: "먹보곰", hp: 67, row: "front", nature: "광기", tint: "#b07f5a",
    passives: [
      { name: "격노", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 16, say: "앞발을 든다", rush: 6 },
      { t: "block", v: 10, say: "몸을 웅크린다", rush: 3 },
      { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attack", v: 24, say: "덮친다" } },   // 26 → 24 — 격노 몫
      { t: "buff", id: "힘", v: 2, say: "배를 채운다", rush: 4 },
    ],
    phase: {
      at: 0.4, say: "배가 고파 사나워졌다",
      intents: [
        { t: "multi", v: 8, n: 2, say: "마구 할퀸다", rush: 6 },
        { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attack", v: 22, say: "덮친다" } },
        { t: "buff", id: "힘", v: 2, say: "허겁지겁 먹는다", rush: 3 },
      ],
    },
  },

  // ── 모나티엄 (엘프 도시) ────────────────────────────────────────────
  elfsoldiercloserange: {
    // 공략: 대열 좁히기 ⚡3 — 그 턴엔 적게 세게. 전우가 쓰러지면 힘이 붙으니 병사부터, 아니면 같은 턴에 같이 쓰러뜨려라 (반격꾼)
    ko: "엘프 병사", hp: 51, row: "front", nature: "냉정", tint: "#6fa2c0",
    pick: "shuffle",
    passives: [
      { name: "전우의 복수", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "대열을 맞춘다", w: 2, rush: 6 },   // 13 → 12 — 전우의 복수 몫
      { t: "attack", v: 8, id: "취약", n: 1, say: "창끝으로 찌른다", rush: 5 },
      { t: "guard", v: 8, say: "대열을 좁힌다", rush: 3 },
      { t: "jam", v: 1, say: "창끝을 겨눈다", rush: 4 },
    ],
  },
  drones: {
    // 공략: 경보 ⚡3 — 경보가 보이면 두 장까지, 나머지 수는 ⚡5~6. 절반에서 한 번 비상 경보(AP)를 울리니 절반을 넘기는 턴엔 끝까지 부숴라 (재촉꾼)
    ko: "경비 드론", hp: 51, row: "back", nature: "냉정", tint: "#7fb6d9",
    passives: [
      { name: "비상 경보", on: "lowHp", at: 0.5, do: { t: "jam", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 6, say: "전방위 사격", rush: 6 },   // 10 → 7 — 2층 싸움 셋에 다 끼어 2층이 3층보다 셌다. 7 → 6 비상 경보 몫
      { t: "jam", v: 1, say: "경보음", rush: 3 },
      { t: "block", v: 12, say: "장갑 전개", rush: 5 },
      { t: "multi", v: 3, n: 3, say: "조준 연사", rush: 5 },    // 4 → 3 — 비상 경보 몫
    ],
  },
  elfcurseddolldealer: {
    // 공략: 실을 감으면(⚡0) 다음 턴 뒷줄에 큰 한 방 — 봉인·기절로 끊거나 뒷줄을 막아라. 다른 수는 ⚡4~6이라 끊는 데 카드를 몰아 써도 된다 (차지꾼)
    ko: "엘프 저주 인형 · 딜러", hp: 46, row: "back", nature: "광기", tint: "#a08ec0",
    open: { t: "jam", v: 2, say: "빈 눈으로 본다", rush: 4 },
    intents: [
      { t: "back", v: 14, say: "뒤를 노린다", rush: 6 },
      { t: "debuff", id: "취약", v: 2, say: "실이 당겨진다", rush: 4 },
      { t: "charge", say: "실을 감는다", next: { t: "back", v: 24, say: "실을 끊어 날린다" } },
    ],
  },
  elfcurseddolltanker: {
    // 공략: 막기·팽팽 ⚡3 — 적게 세게. 실이 풀리면(절반) 휘두르기가 ⚡9라 그때 몰아쳐라 (반격꾼 → 느긋이)
    ko: "엘프 저주 인형 · 방패", hp: 73, row: "front", nature: "우울", tint: "#8f8fa8",
    intents: [
      { t: "guard", v: 10, say: "앞을 막는다", rush: 3 },
      { t: "attack", v: 12, say: "둔하게 휘두른다", rush: 5 },
      { t: "jam", v: 2, say: "실이 끊어지는 소리", rush: 5 },
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다", rush: 3 },
    ],
    phase: {
      at: 0.5, say: "실이 풀려 막는 법을 잊었다",
      intents: [
        { t: "attack", v: 15, say: "마구 휘두른다", rush: 9 },
        { t: "attack", v: 15, say: "마구 휘두른다", rush: 9 },
        { t: "block", v: 14, say: "제 몸만 가린다", rush: 0 },
      ],
    },
  },

  // ── 벨리티엔 (마녀 왕국 · 세계수 뿌리) ──────────────────────────────
  witchcurseddollwizard: {
    // 공략: 결계 ⚡3 — 두면 동료의 상처를 덮는다, 관통으로 먼저 잡아라. 빛 끌어당기기는 ⚡7이라 서두를 것 없다 (약한 고리)
    ko: "마녀 저주 인형 · 술사", hp: 57, row: "back", nature: "냉정", tint: "#b08fc0",
    intents: [
      { t: "heal", v: 12, say: "결계로 상처를 덮는다", rush: 3 },
      { t: "jam", v: 2, say: "주문을 읊는다", rush: 5 },
      { t: "debuff", id: "취약", v: 2, say: "손끝을 겨눈다", rush: 4 },
      { t: "back", v: 17, say: "뿌리째 끌어당긴다", rush: 7 },
    ],
  },
  oldtree: {
    // 공략: 가지를 젖히면(⚡0) 다음 턴 크게 후려친다 — 끊어라. 가시 껍질이 맞을 때마다(턴에 두 번) 되찌르니 쪼개 치지 말고 큰 카드로 (차지꾼)
    ko: "늙은 나무", hp: 73, row: "front", nature: "우울", tint: "#7fa06a",
    passives: [
      { name: "가시 껍질", on: "hurt", limit: 2, do: { t: "thorns", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 10, say: "가지를 뻗는다", rush: 5 },   // 11 → 10 — 가시 껍질 몫
      { t: "buff", id: "힘", v: 2, say: "뿌리를 내린다", rush: 4 },
      { t: "charge", say: "가지를 뒤로 젖힌다", next: { t: "attack", v: 20, say: "크게 후려친다" } },   // 22 → 20
      { t: "heal", v: 8, say: "수액이 돈다", rush: 4 },      // 10 → 8
    ],
  },
  wisps: {
    // 공략: 흩어졌다 모이기·빛 흔들기 ⚡3 — 그 수 앞에선 카드를 아끼고, 30 체력이니 큰 한 장으로. 공격 수는 ⚡5라 덜 급하다 (재촉꾼)
    ko: "위습", hp: 30, row: "back", nature: "순수", tint: "#9aa8d9",
    pick: "shuffle",
    intents: [
      { t: "jam", v: 1, say: "흩어졌다 모인다", rush: 3 },
      { t: "back", v: 9, say: "스며든다", rush: 5 },
      { t: "debuff", id: "약화", v: 2, say: "빛이 흔들린다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "여럿으로 갈라진다", rush: 5 },
    ],
  },

  // ── 에르피엔 · 새 얼굴 — 요정 저주 인형 · 과자 병정 · 숲의 작은 것들 ──────────
  // 요정 왕국은 과자와 꽃의 나라다. 에르핀이 몰래 챙기는 간식이 거꾸로 덤빈다.
  fairycurseddolldealer: {
    // 공략: 실바늘·가루가 ⚡3으로 잦고, 맞으면 실가시로 되찌른다(턴에 두 번) — 쪼개 치지 말고 34 체력을 관통 큰 한 장으로 끝내라 (재촉꾼)
    ko: "요정 저주 인형 · 딜러", hp: 34, row: "back", nature: "활발", tint: "#e0a0c0",
    pick: "shuffle",
    passives: [
      { name: "실가시", on: "hurt", limit: 2, do: { t: "thorns", v: 2 } },
    ],
    intents: [
      { t: "back", v: 6, say: "날개 실로 찌른다", w: 2, rush: 3 },    // 7 → 6 — 실가시 몫
      { t: "debuff", id: "약화", v: 1, say: "가루를 흩뿌린다", rush: 3 },
      { t: "back", v: 10, say: "실을 끊어 날린다", rush: 6 },          // 11 → 10
    ],
  },
  fairycurseddolltanker: {
    // 공략: 몸을 말면(⚡0) 다음 턴 굴러 온다 — 끊어라. 동료가 쓰러지면 날개로 적 전체를 가리니, 응원을 잡는 턴엔 남은 카드로 그 방어를 벗길 각오를 (차지꾼)
    ko: "요정 저주 인형 · 방패", hp: 52, row: "front", nature: "순수", tint: "#c0a0d8",
    passives: [
      { name: "날개 감싸기", on: "allyDown", do: { t: "guard", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 7, say: "날개로 가린다", rush: 4 },
      { t: "attack", v: 9, say: "둔하게 부딪힌다", rush: 5 },
      { t: "charge", say: "몸을 동그랗게 만다", next: { t: "attack", v: 16, say: "굴러 온다" } },   // 18 → 16 — 날개 감싸기 몫
      { t: "block", v: 9, say: "몸을 만다", rush: 4 },
    ],
  },
  fairycurseddollsupporter: {
    // 공략: 반짝이·실 두르기 ⚡3 — 두면 세 장마다 동료를 메운다, 먼저 잡아라. 톡 쏘기는 ⚡5라 신경 끄고 몰아 잡아도 된다 (약한 고리)
    ko: "요정 저주 인형 · 응원", hp: 30, row: "back", nature: "순수", tint: "#f0c0d8",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 8, say: "반짝이 가루를 뿌린다", rush: 3 },
      { t: "guard", v: 5, say: "실을 팽팽히 둘러친다", rush: 3 },
      { t: "back", v: 6, say: "톡 쏜다", w: 2, rush: 5 },
    ],
  },
  marshmallowtanker: {
    // 공략: 부풀기·줄 맞추기 ⚡3 — 그 수 앞에선 한 턴에 두세 장, 센 카드로. 부딪히기는 ⚡5~7이라 그 턴엔 마음껏 (반격꾼)
    ko: "마시멜로 방패병", hp: 48, row: "front", nature: "순수", tint: "#f0e6d8",
    intents: [
      { t: "block", v: 10, say: "말랑하게 부푼다", rush: 3 },
      { t: "attack", v: 8, say: "몸으로 민다", rush: 5 },
      { t: "guard", v: 6, say: "줄을 맞춘다", rush: 3 },
      { t: "attack", v: 12, say: "통통 튀어 부딪힌다", rush: 7 },
    ],
  },
  marshmallowdealer: {
    // 공략: 꼬치는 ⚡9 이상이라 늦게 온다 — 마음껏 몰아 써라. 절반에서 한 번 녹아내리며 찌르니 28 체력을 한 턴에 넘겨 버려라 (느긋이)
    ko: "마시멜로 창병", hp: 28, row: "back", nature: "활발", tint: "#e8f0d8",
    pick: "shuffle",
    passives: [
      { name: "녹아내리며 찌른다", on: "lowHp", at: 0.5, do: { t: "back", v: 8 } },
    ],
    intents: [
      { t: "back", v: 7, say: "꼬치를 찌른다", w: 2, rush: 9 },       // 8 → 7 — 녹아내리며 찌르는 몫
      { t: "multi", v: 3, n: 3, say: "꼬치를 연달아 찌른다", rush: 10 },
      { t: "attack", v: 7, say: "앞으로 달려든다", rush: 9 },
    ],
  },
  marshmallowsupporter: {
    // 공략: 덧바르기·깃발 ⚡3 — 먼저 잡아라. 디버프가 걸리면 설탕을 덧발라 스스로 메우니 약화·취약 말고 공격으로 잡아라 (약한 고리)
    ko: "마시멜로 응원단", hp: 26, row: "back", nature: "활발", tint: "#d8f0e0",
    pick: "shuffle",
    passives: [
      { name: "설탕 코팅", on: "debuffed", do: { t: "selfHeal", v: 5 } },
    ],
    intents: [
      { t: "heal", v: 6, say: "설탕을 덧바른다", rush: 3 },   // 7 → 6 — 설탕 코팅 몫
      { t: "guard", v: 5, say: "꽃 깃발을 흔든다", rush: 3 },
      { t: "debuff", id: "약화", v: 1, say: "달콤한 냄새", rush: 5 },
    ],
  },
  buseuleogi: {
    // 공략: 와작 ⚡3으로 작게 자주 문다 — 카드를 흘리지 말고 20 체력을 큰 한 장으로. 하나가 쓰러지면 남은 것이 설탕을 핥으니 둘을 같은 턴에 (재촉꾼)
    ko: "과자 부스러기", hp: 20, row: "front", nature: "광기", tint: "#c08a5a",
    pick: "shuffle",
    passives: [
      { name: "남은 부스러기", on: "allyDown", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 5, say: "와작 문다", w: 2, rush: 3 },
      { t: "multi", v: 2, n: 3, say: "부스러기가 튄다", rush: 5 },
      { t: "buff", id: "힘", v: 1, say: "설탕을 핥는다", rush: 6 },
    ],
  },
  lupalu: {
    // 공략: 방울(⚡3)만 피하라 — 방울이 예고된 턴엔 두 장까지, 다른 수는 ⚡5~7이라 그 턴엔 마음껏 (재촉꾼)
    ko: "꽃방울 요정", hp: 38, row: "back", nature: "우울", tint: "#f0b0c0",
    intents: [
      { t: "debuff", id: "약화", v: 1, say: "꽃가루가 날린다", rush: 5 },
      { t: "back", v: 10, say: "방울을 굴린다", rush: 6 },
      { t: "jam", v: 1, say: "방울이 딸랑인다", rush: 3 },
      { t: "heal", v: 9, say: "꽃잎이 덮는다", rush: 7 },
    ],
  },
  mogmaekim: {
    // 공략: 굳기 ⚡3 — 굳기가 보이면 한두 장씩 세게. 뛰어들기는 ⚡5라 그 턴엔 한 장 더 (반격꾼)
    ko: "젤리 토끼", hp: 32, row: "front", nature: "활발", tint: "#b0d870",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 8, say: "폴짝 뛰어든다", w: 2, rush: 5 },
      { t: "block", v: 8, say: "말랑하게 굳는다", rush: 3 },
      { t: "multi", v: 4, n: 2, say: "통통 두 번 튄다", rush: 6 },
    ],
  },

  // ── 모나티엄 · 새 얼굴 — 엘프 도시의 병사 · 기계 · 저주 인형 ─────────────────
  elfsoldierlongrange: {
    // 공략: 시위를 천천히 당긴다 — 수가 다 ⚡8 이상이라 몰아 써도 되니 그 사이 관통으로 먼저 잡거나 뒷줄을 막아라 (느긋이)
    ko: "엘프 궁수", hp: 38, row: "back", nature: "냉정", tint: "#7fa8c8",
    pick: "shuffle",
    intents: [
      { t: "back", v: 11, say: "뒷줄을 겨눈다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "화살을 잇달아 쏜다", rush: 10 },
      { t: "debuff", id: "취약", v: 1, say: "표식을 쏜다", rush: 8 },
    ],
  },
  droneg: {
    // 공략: 장갑 ⚡3 — 작은 카드 여럿 말고 큰 카드 한두 장. 걷어차기·돌진은 ⚡5~6, 소음은 ⚡4 (반격꾼)
    ko: "지상 드론", hp: 58, row: "front", nature: "냉정", tint: "#8a9aa8",
    intents: [
      { t: "block", v: 12, say: "장갑을 내린다", rush: 3 },
      { t: "attack", v: 12, say: "다리로 걷어찬다", rush: 5 },
      { t: "jam", v: 1, say: "소음을 낸다", rush: 4 },
      { t: "attack", v: 14, say: "돌진한다", rush: 6 },
    ],
  },
  cranker: {
    // 공략: 태엽·몸통 ⚡3에 당겨질 때마다 몸통을 또 닫으니 한 턴에 적게 세게. 증기(⚡0)는 끊어라. 헛돌면 증기 새기 ⚡3, 두드리기는 ⚡7 (반격꾼 + 차지꾼 → 재촉꾼)
    ko: "크랭커", hp: 84, row: "front", nature: "광기", tint: "#6fb0b8",
    passives: [
      { name: "몸통 잠금", on: "rushed", do: { t: "block", v: 8 } },
    ],
    intents: [
      { t: "buff", id: "힘", v: 2, say: "태엽을 감는다", rush: 3 },
      { t: "attack", v: 13, say: "집게팔을 휘두른다", rush: 6 },   // 14 → 13 — 몸통 잠금 몫
      { t: "charge", say: "증기를 뿜는다", next: { t: "attackAll", v: 12, say: "주위를 쓸어 버린다" } },
      { t: "block", v: 14, say: "몸통을 닫는다", rush: 3 },
    ],
    phase: {
      at: 0.4, say: "태엽이 헛돈다",
      intents: [
        { t: "multi", v: 6, n: 3, say: "마구 두드린다", rush: 7 },
        { t: "attack", v: 13, say: "집게팔을 휘두른다", rush: 6 },
        { t: "jam", v: 1, say: "증기가 샌다", rush: 3 },
      ],
    },
  },
  elfcurseddollsupporter: {
    // 공략: 꿰매기·둘러치기 ⚡3 — 세 장마다 동료를 메우니 먼저 잡아라. 실바늘은 ⚡6이라 잡는 동안은 걱정 말고 몰아 써라 (약한 고리)
    ko: "엘프 저주 인형 · 응원", hp: 42, row: "back", nature: "우울", tint: "#9aa0c8",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 10, say: "실로 꿰맨다", rush: 3 },
      { t: "guard", v: 8, say: "실을 둘러친다", rush: 3 },
      { t: "back", v: 8, say: "실바늘을 던진다", w: 2, rush: 6 },
    ],
  },
  elfcurseddollwizard: {
    // 공략: 문양·주문 ⚡3 — 카드를 아끼고 값진 한 장으로. 두 장째·네 장째로 방어 카드를 내면 방패 틈에 문양을 새기니 방어는 첫 장에 (재촉꾼)
    ko: "엘프 저주 인형 · 술사", hp: 44, row: "back", nature: "냉정", tint: "#a0b0d8",
    passives: [
      { name: "맞받는 문양", on: "card", type: "방어", every: 2, do: { t: "debuff", id: "취약", v: 1 } },
    ],
    intents: [
      { t: "debuff", id: "취약", v: 1, say: "문양이 빛난다", rush: 3 },
      { t: "back", v: 12, say: "빛줄기를 쏜다", rush: 6 },     // 13 → 12 — 맞받는 문양 몫
      { t: "jam", v: 1, say: "주문을 읊는다", rush: 3 },
      { t: "attackAll", v: 6, say: "빛이 번진다", rush: 6 },   // 7 → 6
    ],
  },
  goldring: {
    // 공략: 금화 ⚡3 — 카드를 아껴라. 한 턴 세 장째가 공격이면 뚜껑을 닫으니 세 번째는 공격 말고. 삐걱이면 입을 벌릴 때(⚡0) 끊어라 (재촉꾼 + 차지꾼)
    ko: "보물 상자 왕", hp: 96, row: "front", nature: "활발", tint: "#d8c060",
    passives: [
      { name: "뚜껑 닫기", on: "card", type: "공격", every: 3, do: { t: "block", v: 8 } },
    ],
    intents: [
      { t: "block", v: 16, say: "뚜껑을 닫는다", rush: 6 },
      { t: "attack", v: 15, say: "와락 문다", rush: 6 },      // 16 → 15 — 뚜껑 닫기 몫
      { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
      { t: "buff", id: "힘", v: 2, say: "보석을 삼킨다", rush: 5 },
    ],
    phase: {
      at: 0.5, say: "뚜껑이 삐걱거린다",
      intents: [
        { t: "charge", say: "크게 입을 벌린다", next: { t: "attack", v: 26, say: "통째로 삼킨다" } },   // 28 → 26
        { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
        { t: "attack", v: 15, say: "와락 문다", rush: 6 },
      ],
    },
  },

  // ── 벨리티엔 · 새 얼굴 — 마녀 저주 인형 · 뿌리 밑의 마법 것들 ───────────────
  witchcurseddolldealer: {
    // 공략: 팽팽·몸 감기 ⚡3 — 몰아 치면 힘이 붙고 몸을 감는다, 한 턴에 적게. 맞으면 실가시로 되찌르니(턴에 두 번) 관통 큰 한 장 (반격꾼)
    ko: "마녀 저주 인형 · 딜러", hp: 50, row: "back", nature: "광기", tint: "#b07fb0",
    passives: [
      { name: "실가시", on: "hurt", limit: 2, do: { t: "thorns", v: 2 } },
    ],
    open: { t: "debuff", id: "취약", v: 1, say: "눈이 붉게 빛난다", rush: 4 },
    intents: [
      { t: "back", v: 14, say: "그림자 바늘", rush: 6 },        // 15 → 14 — 실가시 몫
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다", rush: 3 },
      { t: "multi", v: 4, n: 3, say: "실이 춤춘다", rush: 6 },   // 5 → 4
      { t: "block", v: 10, say: "실로 몸을 감는다", rush: 3 },
    ],
  },
  witchcurseddolltanker: {
    // 공략: 무겁고 느리다 — 수가 ⚡8 이상이니 마음껏 몰아 쳐 먼저 쓰러뜨려라. 동료부터 잡으면 끊긴 실을 이어 힘이 붙는다 (느긋이)
    ko: "마녀 저주 인형 · 방패", hp: 80, row: "front", nature: "우울", tint: "#8f7fa8",
    passives: [
      { name: "이어 붙인 실", on: "allyDown", do: { t: "buff", id: "힘", v: 3 } },
    ],
    intents: [
      { t: "guard", v: 12, say: "검은 천을 두른다", rush: 8 },
      { t: "attack", v: 12, say: "무겁게 내려친다", rush: 9 },   // 13 → 12 — 이어 붙인 실 몫
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다", rush: 0 },
      { t: "attack", v: 14, say: "밀어붙인다", rush: 10 },        // 15 → 14
    ],
  },
  witchcurseddollsupporter: {
    // 공략: 약초·빗자루 젓기 ⚡3 — 두면 동료를 메운다, 먼저 잡아라. 연기·찌르기는 ⚡5~6 (약한 고리)
    ko: "마녀 저주 인형 · 응원", hp: 46, row: "back", nature: "냉정", tint: "#c0a0d0",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 13, say: "약초를 달인다", rush: 3 },
      { t: "guard", v: 8, say: "빗자루를 휘휘 젓는다", rush: 3 },
      { t: "debuff", id: "약화", v: 2, say: "쓴 연기", rush: 5 },
      { t: "back", v: 10, say: "빗자루로 찌른다", w: 2, rush: 6 },
    ],
  },
  pumpkin: {
    // 공략: 불빛이 커지면(⚡0) 다음 턴 불똥이 파티 전체에 — 끊거나 전체를 막아라. 디버프가 걸리면 웃으며 약화를 돌려주니 기절 한 번으로 끊고 디버프는 아껴라 (차지꾼)
    ko: "호박 머리", hp: 64, row: "front", nature: "광기", tint: "#d89040",
    passives: [
      { name: "빙글빙글", on: "debuffed", do: { t: "debuff", id: "약화", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "덩굴로 후린다", rush: 5 },    // 13 → 12 — 빙글빙글 몫
      { t: "debuff", id: "약화", v: 2, say: "빙글빙글 웃는다", rush: 4 },
      { t: "charge", say: "불빛이 커진다", next: { t: "attackAll", v: 12, say: "불똥을 뿌린다" } },   // 13 → 12
      { t: "block", v: 12, say: "껍질을 굳힌다", rush: 5 },
    ],
  },
  hatsnail: {
    // 공략: 느릿느릿 — 수가 ⚡8 이상이니 마음껏 몰아 써라. 다만 첫 대를 맞으면 모자에 숨으니(턴에 한 번) 작은 카드로 먼저 두드리고 큰 카드는 그다음 (느긋이)
    ko: "모자 달팽이", hp: 56, row: "front", nature: "우울", tint: "#a07860",
    passives: [
      { name: "모자 속으로", on: "hurt", do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "block", v: 16, say: "모자 속으로 숨는다", rush: 0 },
      { t: "attack", v: 11, say: "느릿느릿 들이받는다", rush: 9 },
      { t: "debuff", id: "약화", v: 1, say: "끈적한 길을 남긴다", rush: 8 },
      { t: "attack", v: 13, say: "껍질로 굴러든다", rush: 10 },   // 14 → 13 — 모자 속으로 몫
    ],
  },
  nependers: {
    // 공략: 잎 닫기·삼키기 ⚡3, 당겨질 때마다 꿀꺽 삼켜 회복한다 — 한 턴에 적게, 세게. 무는 수는 ⚡5~6 (반격꾼)
    ko: "식충 화분", hp: 52, row: "back", nature: "광기", tint: "#c06060",
    passives: [
      { name: "꿀꺽", on: "rushed", do: { t: "selfHeal", v: 6 } },
    ],
    intents: [
      { t: "back", v: 13, say: "덥석 문다", rush: 6 },          // 14 → 13 — 꿀꺽 몫
      { t: "block", v: 10, say: "잎을 닫는다", rush: 3 },
      { t: "debuff", id: "취약", v: 2, say: "단 향을 풍긴다", rush: 4 },
      { t: "heal", v: 8, say: "꿀꺽 삼킨다", rush: 3 },         // 10 → 8
      { t: "multi", v: 5, n: 2, say: "잎으로 두 번 문다", rush: 5 },
    ],
  },
  magicfork: {
    // 공략: 콕콕·리본 ⚡3으로 잦다 — 카드를 흘리지 말고 30 체력을 관통 큰 한 장으로 먼저. 동료가 쓰러지면 날이 서니 남겨 두지 마라 (재촉꾼)
    ko: "마법 포크", hp: 30, row: "back", nature: "활발", tint: "#c08090",
    pick: "shuffle",
    passives: [
      { name: "날 세우기", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "multi", v: 3, n: 3, say: "콕콕콕 찌른다", w: 2, rush: 3 },
      { t: "back", v: 8, say: "날아서 찌른다", rush: 5 },       // 9 → 8 — 날 세우기 몫
      { t: "jam", v: 1, say: "리본이 나풀댄다", rush: 3 },
    ],
  },

  // ── 층의 끝 ─────────────────────────────────────────────────────────
  // 보스는 순서대로 돈다(읽히는 편이 공정하다). 대신 체력이 절반 아래로 가면 판이 바뀐다 —
  // 앞판과 뒤판의 공략이 다르다(docs/12). 판마다 안 당겨지는 큰 수(charge)가 하나 있다.
  curburus: {
    // 공략: 앞판은 웅크림·털 ⚡3 — 적게 세게(반격꾼), 짖기·물기는 ⚡7~8. 세 머리가 깨면 울부짖음 ⚡3 — 카드를 아껴라(재촉꾼). 숨을 모으면 끊어라.
    //       한 턴 세 장째가 공격이면 한 머리가 뒤를 무니 세 번째는 스킬·방어로. 디버프가 걸리면 털을 세워 힘 — 디버프는 한 턴에 몰아 걸어라
    ko: "커버러스", hp: 242, row: "front", boss: true, nature: "광기", tint: "#c07f7f",
    passives: [
      { name: "셋째 머리", on: "card", type: "공격", every: 3, do: { t: "back", v: 4 } },
      { name: "곤두선 털", on: "debuffed", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 10, say: "세 머리가 짖는다", rush: 7 },   // 11 → 10 — 패시브 몫
      { t: "block", v: 16, say: "웅크린다", rush: 3 },
      { t: "back", v: 22, say: "뒤를 물어뜯는다", rush: 8 },          // 24 → 22
      { t: "buff", id: "힘", v: 2, say: "털을 세운다", rush: 3 },   // 3 → 2 — 곤두선 털 몫
      { t: "charge", say: "세 머리가 숨을 모은다", next: { t: "attackAll", v: 16, say: "세 머리가 함께 짖는다" } },   // 17 → 16
    ],
    phase: {
      at: 0.5, say: "세 머리가 모두 깨어났다",
      intents: [
        { t: "multi", v: 9, n: 3, say: "세 머리가 물어뜯는다", rush: 7 },
        { t: "jam", v: 2, say: "울부짖는다", rush: 3 },
        { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attackAll", v: 19, say: "불길을 뿜는다" } },   // 20 → 19
        { t: "back", v: 20, say: "뒤를 물어뜯는다", rush: 6 },          // 22 → 20
      ],
    },
  },
  golem: {
    // 공략: 굳은 몸은 ⚡9 이상·⚡0이라 마음껏 몰아 쳐 금을 내라(느긋이). 절반을 넘기는 한 방에 돌을 끌어모으니(방어) 그 턴엔 카드를 남겨 벗겨라.
    //       금이 가면 끌어모으기 ⚡3 — 적게 세게(반격꾼). 팔을 끝까지 들면 끊어라. 드론을 부수면 힘이 붙으니 드론은 골렘이 팔을 드는 턴을 피해 부숴라
    ko: "골렘", hp: 242, row: "front", boss: true, nature: "냉정", tint: "#9a9a8c",
    passives: [
      { name: "돌껍질", on: "lowHp", at: 0.5, do: { t: "block", v: 12 } },
      { name: "부서진 동료", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "block", v: 20, say: "굳는다", rush: 0 },
      { t: "attack", v: 24, say: "팔을 들어 올린다", rush: 9 },     // 26 → 24 — 패시브 몫
      { t: "attackAll", v: 12, say: "땅을 내려친다", rush: 10 },   // 13 → 12
      { t: "jam", v: 2, say: "그림자가 덮친다", rush: 9 },
      { t: "buff", id: "힘", v: 4, say: "돌이 붙는다", rush: 0 },
    ],
    phase: {
      at: 0.5, say: "몸에 금이 가 돌조각이 튄다",
      intents: [
        { t: "multi", v: 6, n: 3, say: "돌조각이 튄다", rush: 6 },     // 7 → 6
        { t: "guard", v: 18, say: "돌을 끌어모은다", rush: 3 },
        { t: "charge", say: "팔을 끝까지 들어 올린다", next: { t: "attack", v: 34, say: "내려찍는다" } },   // 38 → 34
        { t: "buff", id: "힘", v: 2, say: "돌이 다시 붙는다", rush: 3 },
        { t: "attackAll", v: 12, say: "땅을 내려친다", rush: 7 },  // 13 → 12
      ],
    },
  },
  imoogi: {
    // 공략: 물을 머금으면(⚡0) 다음 턴 파티 전체에 — 끊어라(차지꾼). 앞판은 ⚡5~8로 몰아 써도 된다. 여의주를 향하면 비늘·노려보기 ⚡3 — 카드를 아껴라(재촉꾼).
    //       한 턴 네 장째엔 뒤를 휘감고, 술사가 쓰러지면 힘이 붙고, 디버프가 걸리면 비늘을 세운다 — 술사를 언제 잡을지 고르라
    ko: "이무기", hp: 242, row: "front", boss: true, nature: "우울", tint: "#7f9dc0",
    passives: [
      { name: "꼬리 휘감기", on: "card", every: 4, do: { t: "back", v: 6 } },
      { name: "승천 욕심", on: "allyDown", do: { t: "buff", id: "힘", v: 3 } },
      { name: "비늘 세우기", on: "debuffed", do: { t: "block", v: 8 } },
    ],
    intents: [
      { t: "attackAll", v: 12, say: "몸을 휘감는다", rush: 8 },     // 14 → 12 — 패시브 몫
      { t: "debuff", id: "취약", v: 2, say: "비늘이 곤두선다", rush: 5 },
      { t: "charge", say: "물을 머금는다", next: { t: "attackAll", v: 19, say: "물줄기를 뿜는다" } },   // 20 → 19
      { t: "back", v: 24, say: "뒤를 삼킨다", rush: 7 },              // 26 → 24
      { t: "jam", v: 3, say: "못 오른 눈으로 본다", rush: 5 },
      { t: "block", v: 18, say: "똬리를 튼다", rush: 6 },
    ],
    phase: {
      at: 0.5, say: "여의주를 향해 몸부림친다",
      intents: [
        { t: "charge", say: "물을 머금는다", next: { t: "attackAll", v: 20, say: "물줄기를 뿜는다" } },   // 22 → 20
        { t: "heal", v: 14, say: "비늘을 새로 돋운다", rush: 3 },
        { t: "back", v: 22, say: "뒤를 삼킨다", rush: 6 },              // 24 → 22
        { t: "attack", v: 14, id: "취약", n: 2, say: "꼬리로 후려친다", rush: 5 },
        { t: "jam", v: 1, say: "여의주를 노려본다", rush: 3 },
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
