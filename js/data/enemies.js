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
//   phase2 {at, say, intents} 판이 바뀐 뒤 더 떨어지면 한 번 더 — 층 끝 보스의 셋째 판
//   rush N               즉시 행동 장수 — 이 수가 예고된 뒤 카드 N장이면 당겨서 한다(0 은 안 당겨짐).
//                        안 적으면 값어치로 자동(combat.js intentRush). 적마다 맨 위 「공략」 한 줄이 rush 를 정한다(docs/12)
// passives [{name, on, do, ...}]  적 패시브 — 몸에 붙은 성질. 침묵에 막히지 않는다(combat.js foePassives)
//   on  fightStart · turnStart · turnEnd · hurt · lowHp(at) · allyDown · card(type · every) · rushed · debuffed
//   do  수와 같은 모양 {t, v, …} 또는 thorns v(때린 사도에게) · selfHeal v
//   limit  턴당 몇 번(기본 1, 0 은 제한 없음). fightStart · lowHp 는 한 번
// row: front / back — 뒷줄 적은 관통(pierce)이 있어야 닿는다
// skin  스파인 스킨을 직접 고른다(art.js) — 성격이 없는 원작 보스는 Skin_None, 누루링은 종족 스킨(Skin_Elf).
//       nature 를 안 적으면 성격 없음 — 성격 스킨 · 성격별 동작 없이 선다. 공격 동작도 스킨 끝말(Attack1_1_Elf · _None)을 먼저 찾는다
// art  그림(스파인 · 아이콘)을 다른 적의 것으로 — 같은 몬스터를 키운 보스(햇팽이 마녀 → hatsnail)
// scale  싸움터에 그릴 배율(기본 1) — 원작이 화면을 꽉 채우게 그린 보스는 줄여야 머리가 싸움터 안에 든다(art.js)

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
  goldring: {
    // 원작 「새마음금고」 — 요정 왕국의 금고를 노리고 들어온 슬라임(나무위키 몬스터 문서). 엘프 도시 것이 아니라 1층 엘리트로 옮겼다.
    // 공략: 금화 ⚡3 — 카드를 아껴라. 한 턴 세 장째가 공격이면 뚜껑을 닫으니 세 번째는 공격 말고. 삐걱이면 입을 벌릴 때(⚡0) 끊어라 (재촉꾼 + 차지꾼)
    ko: "새마음금고", hp: 70, row: "front", nature: "활발", tint: "#d8c060",
    passives: [
      { name: "뚜껑 닫기", on: "card", type: "공격", every: 3, do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "block", v: 12, say: "뚜껑을 닫는다", rush: 6 },
      { t: "attack", v: 14, say: "와락 문다", rush: 6 },
      { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
      { t: "buff", id: "힘", v: 2, say: "보석을 삼킨다", rush: 5 },
    ],
    phase: {
      at: 0.5, say: "뚜껑이 삐걱거린다",
      intents: [
        { t: "charge", say: "크게 입을 벌린다", next: { t: "attack", v: 24, say: "통째로 삼킨다" } },
        { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
        { t: "attack", v: 14, say: "와락 문다", rush: 6 },
      ],
    },
  },

  // ── 모나티엄 · 새 얼굴 — 엘프 도시의 병사 · 드론 · 저주 인형 · 누루링 ───────────
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
  // 누루링 — 살아 움직이는 세계수 수액. 종족 땅마다 그 영향을 받아 모습이 다르고(나무위키 「누루링 시리즈」),
  // 스파인 한 벌(nururingtanker 따위)이 종족 스킨 여덟 벌을 든다. 여기 것은 「엘프 도시 근처」 — Skin_Elf.
  // 기름을 발라 고소하고, 다른 누루링들과 사이가 안 좋고, 어디서 주운 장비를 걸쳤다. 성격은 없다(원작 성격없음)
  nururingtanker: {
    // 공략: 방패·굳기 ⚡3 — 한 턴에 적게 세게. 디버프가 걸리면 주워 온 장비로 막으니 약화·취약은 아끼고 공격으로 벗겨라 (반격꾼)
    ko: "누루링 · 엘프 탱커", hp: 64, row: "front", skin: "Skin_Elf", tint: "#c8b878",
    passives: [
      { name: "주워 온 장비", on: "debuffed", do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, say: "주워 온 방패를 세운다", rush: 3 },
      { t: "attack", v: 10, say: "몸으로 밀어낸다", rush: 5 },
      { t: "block", v: 12, say: "기름 바른 몸을 굳힌다", rush: 3 },
      { t: "attack", v: 13, say: "방패로 내려찍는다", rush: 6 },
    ],
  },
  nururingwarrior: {
    // 공략: 창을 젖히면(⚡0) 다음 턴 큰 한 방 — 끊어라. 두 장째·네 장째로 스킬을 내면 감시하던 눈이 찌르니 스킬은 첫 장·셋째 장에 (차지꾼)
    ko: "누루링 · 엘프 전사", hp: 44, row: "front", skin: "Skin_Elf", tint: "#d0a868",
    pick: "shuffle",
    passives: [
      { name: "감시하는 눈", on: "card", type: "스킬", every: 2, do: { t: "attack", v: 5 } },
    ],
    intents: [
      { t: "attack", v: 11, say: "기름칠한 창으로 찌른다", w: 2, rush: 6 },
      { t: "multi", v: 5, n: 2, say: "두 번 찌른다", rush: 5 },
      { t: "charge", say: "창을 크게 젖힌다", next: { t: "attack", v: 20, say: "온몸으로 꿰뚫는다" } },
    ],
  },
  nururingarcher: {
    // 원작 이름은 「누루링-엘프 마법사」 — 그런데 쓰는 것이 마법이 아닌 것 같다(나무위키). 파일 이름은 archer
    // 공략: 웅얼거림·기름 연기 ⚡3 — 그 수 앞에선 카드를 아끼고 32 체력을 관통 큰 한 장으로. 쏘기·튀기기는 ⚡5 (재촉꾼)
    ko: "누루링 · 엘프 마법사", hp: 32, row: "back", skin: "Skin_Elf", tint: "#b8a070",
    pick: "shuffle",
    intents: [
      { t: "back", v: 10, say: "마법 같은 것을 쏜다", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "주문 비슷한 것을 웅얼거린다", rush: 3 },
      { t: "debuff", id: "취약", v: 1, say: "기름 연기를 피운다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "기름방울을 튀긴다", rush: 5 },
    ],
  },
  nururingsupporter: {
    // 공략: 기름 덧바르기·연설 ⚡3 — 두면 동료를 메우고 AP 를 깎는다, 먼저 잡아라. 깃대 찌르기는 ⚡5 라 잡는 동안은 몰아 써도 된다.
    //       다른 누루링과 사이가 나빠 동료가 쓰러지면 오히려 신이 나 힘이 붙는다 — 이 녀석부터 (약한 고리)
    ko: "누루링 · 엘프 서포터", hp: 34, row: "back", skin: "Skin_Elf", tint: "#c0b080",
    pick: "shuffle",
    passives: [
      { name: "사이 나쁜 동료", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "heal", v: 9, say: "기름을 덧발라 준다", rush: 3 },
      { t: "jam", v: 1, say: "누루링 말로 연설한다", rush: 3 },
      { t: "back", v: 7, say: "깃대로 콕 찌른다", w: 2, rush: 5 },
    ],
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
  // 보스는 순서대로 돈다(읽히는 편이 공정하다). 체력이 떨어지면 판이 바뀌고(phase), 끝에 한 번 더 바뀐다(phase2) —
  // 판마다 공략이 다르다(docs/12). 판마다 안 당겨지는 큰 수(charge)가 하나 있고, 보스마다 덱을 시험하는 장치가 하나 있다:
  // 커버러스는 몰아 치는 손(세 장째 공격) · M.E.O.W 는 큰 손(네 장째)과 호위 드론 · 우로스는 기절과 버티는 힘.
  curburus: {
    // 원작 「크르브르스」 — 차원 대충돌의 보스(나무위키 몬스터 문서). 1층 끝을 지킨다.
    // 공략: 앞판은 웅크림·털 ⚡3 — 적게 세게(반격꾼), 짖기·물기는 ⚡7~8. 세 머리가 깨면 울부짖음 ⚡3 — 카드를 아껴라(재촉꾼). 숨을 모으면 끊어라.
    //       한 턴 세 장째가 공격이면 한 머리가 뒤를 무니 세 번째는 스킬·방어로. 디버프가 걸리면 털을 세워 힘 — 디버프는 한 턴에 몰아 걸어라.
    //       4분의 1 아래로 가면 세 머리가 한꺼번에 날뛴다 — 불길(⚡0)을 끊을 기절을 아껴 두고, 남은 체력을 두 턴 안에 밀어라
    ko: "커버러스", hp: 244, row: "front", boss: true, nature: "광기", tint: "#c07f7f",
    passives: [
      { name: "셋째 머리", on: "card", type: "공격", every: 3, do: { t: "back", v: 5 } },
      { name: "곤두선 털", on: "debuffed", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 11, say: "세 머리가 짖는다", rush: 7 },
      { t: "block", v: 16, say: "웅크린다", rush: 3 },
      { t: "back", v: 24, say: "뒤를 물어뜯는다", rush: 8 },
      { t: "buff", id: "힘", v: 2, say: "털을 세운다", rush: 3 },
      { t: "charge", say: "세 머리가 숨을 모은다", next: { t: "attackAll", v: 19, say: "세 머리가 함께 짖는다" } },
    ],
    phase: {
      at: 0.55, say: "세 머리가 모두 깨어났다",
      intents: [
        { t: "multi", v: 10, n: 3, say: "세 머리가 물어뜯는다", rush: 7 },
        { t: "jam", v: 2, say: "울부짖는다", rush: 3 },
        { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attackAll", v: 22, say: "불길을 뿜는다" } },
        { t: "back", v: 22, say: "뒤를 물어뜯는다", rush: 6 },
      ],
    },
    phase2: {
      at: 0.25, say: "세 머리가 한꺼번에 날뛴다",
      intents: [
        { t: "charge", say: "세 머리가 한꺼번에 숨을 모은다", next: { t: "attackAll", v: 25, say: "세 갈래 불길을 뿜는다" } },
        { t: "multi", v: 11, n: 3, say: "세 머리가 번갈아 문다", rush: 7 },
        { t: "buff", id: "힘", v: 3, say: "털을 곤두세운다", rush: 3 },
      ],
    },
  },
  meow: {
    // 원작 「M.E.O.W」 — 엘레나가 만든 고양이 로봇 병기. 메인 스토리에서 교주 일행과 맞붙었고(사족보행 병기),
    // 엘리아스 프론티어의 첫 보스다. 졸개 드론을 부르고, 침묵에 걸리면 화염 방사를 못 하고, 입에서 거대한 레이저를 쏜다(나무위키).
    // 엘프 도시의 기계라 2층 끝을 지킨다 — 전에 있던 골렘(원작 「동석」)은 용족 동굴의 수호 골렘이라 뺐다. 성격 없음(Skin_None).
    // 공략: 앞판 — 화염 방사기를 데우면(⚡0) 침묵이나 기절로 끊어라(침묵이면 화염을 못 뿜는다). 음파 ⚡3 앞에선 카드를 아껴라.
    //       한 턴 네 장째마다 관측 AI 가 기관총을 긁으니 큰 손은 세 장에서 끊어라. 드론을 부수면 남은 것을 방패로 감싸니
    //       드론은 같은 턴에 둘 다, 아니면 본체만. 튜브를 꽂으면(60%) 레이저(⚡0)와 미사일 폭격 — 둘러치기 ⚡3 은 적게 세게 벗겨라.
    //       4분의 1 아래로 가면 폭주 — 출력 올리기 ⚡3 이 잦으니 남은 체력을 몰아 밀어라
    ko: "M.E.O.W", hp: 232, row: "front", boss: true, skin: "Skin_None", tint: "#8fa8c8",
    scale: 0.58,         // 원작 그림이 화면을 꽉 채운다 — 커버러스만 하게(머리가 싸움터 안에, 옆 사도를 안 덮게)
    passives: [
      { name: "관측 AI", on: "card", every: 4, do: { t: "multi", v: 4, n: 3 } },
      { name: "드론 호위", on: "allyDown", do: { t: "guard", v: 12 } },
    ],
    intents: [
      { t: "attack", v: 14, say: "앞발로 후려친다", rush: 6 },
      { t: "multi", v: 5, n: 3, say: "소형 미사일을 쏜다", rush: 5 },
      { t: "debuff", id: "약화", v: 2, say: "음파를 내지른다", rush: 3 },
      { t: "charge", say: "화염 방사기를 데운다", next: { t: "attackAll", v: 18, say: "화염을 뿜는다" } },
    ],
    phase: {
      at: 0.6, say: "에너지 튜브를 세계수 뿌리에 꽂는다",
      intents: [
        { t: "guard", v: 12, say: "드론을 둘러친다", rush: 3 },
        { t: "attackAll", v: 14, say: "등에서 미사일을 쏟아붓는다", rush: 7 },
        { t: "charge", say: "입에 빛을 모은다", next: { t: "attackAll", v: 27, say: "거대한 레이저를 쏜다" } },
        { t: "jam", v: 2, say: "회로가 윙윙 돈다", rush: 3 },
      ],
    },
    phase2: {
      at: 0.25, say: "출고를 취소당한 회로가 폭주한다",
      intents: [
        { t: "multi", v: 7, n: 4, say: "기관총을 마구 쏜다", rush: 6 },
        { t: "charge", say: "입에 빛을 모은다", next: { t: "attackAll", v: 29, say: "거대한 레이저를 쏜다" } },
        { t: "buff", id: "힘", v: 3, say: "출력을 한계까지 올린다", rush: 3 },
      ],
    },
  },
  hatsnailwitch: {
    // 3층 끝 — 마녀 왕국의 보스. 원작에는 마녀 왕국 보스가 없다(나무위키 「트릭컬 리바이브/몬스터」 의 보스는 릴1리 · 크르브르스 · M.E.O.W ·
    // 크레용사용 · R41 리뉴아 · 우로스 — 마녀 땅 것이 없고, 기기에 있는 보스 스파인도 커버러스 · M.E.O.W · 우로스뿐).
    // 그래서 마녀 왕국 몬스터 가운데 이야기가 있는 것을 키웠다 — 햇팽이(마녀 모자를 집 삼은 달팽이)의 원작 기록
    // 「햇팽이들 중에 마녀의 의식이 옮겨진 듯이 행동하는 개체들이 있다고 한다」 · 「사악한 마녀 모자에 들러붙은 햇팽이는 굉장히 음흉하고 영악하다」.
    // 그 모자에 깃든 마녀가 저주 인형 술사를 부린다. 그림은 햇팽이 그대로(art) · 광기 스킨, 크게(scale).
    // 공략: 저주를 견디는 손 — 한 턴 세 장째 스킬마다 모자가 주문을 되받아 약화를 건다(스킬은 두 장까지), 절반에서 한 번 모자 속에 숨는다(방어).
    //       솥이 끓으면(⚡0) 다음 턴 파티 전체 — 끊어라. 주문 웅얼거림 ⚡3 앞에선 카드를 아껴라. 술사가 쓰러지면 실이 끊겨 힘이 붙으니
    //       술사(회복)를 먼저 잡되 그 턴엔 막을 준비를. 60% 아래 — 마녀의 의식이 깨어 번개(⚡0) · 저주 번짐, 25% 아래 — 모자만 남아 날뛰고 점액으로 메운다(⚡3)
    ko: "햇팽이 마녀", hp: 262, row: "front", boss: true, nature: "광기", art: "hatsnail", tint: "#8a5aa8",
    scale: 1.5,          // 보통 달팽이(그림 그대로)보다 크게 — 커버러스만 하게
    passives: [
      { name: "되받는 주문", on: "card", type: "스킬", every: 3, do: { t: "debuff", id: "약화", v: 1 } },
      { name: "모자 속으로", on: "lowHp", at: 0.5, do: { t: "block", v: 18 } },
      { name: "끊긴 실", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "back", v: 17, say: "모자챙으로 뒤를 후린다", rush: 6 },
      { t: "debuff", id: "약화", v: 2, say: "마녀의 주문을 웅얼거린다", rush: 3 },
      { t: "charge", say: "모자 속 솥이 끓는다", next: { t: "attackAll", v: 19, say: "끓는 물약을 쏟는다" } },
      { t: "multi", v: 5, n: 3, say: "점액 방울을 튀긴다", rush: 5 },
    ],
    phase: {
      at: 0.6, say: "모자 속 마녀의 의식이 깨어난다",
      intents: [
        { t: "jam", v: 2, say: "모자가 혼자 주문을 외운다", rush: 3 },
        { t: "attackAll", v: 12, say: "보랏빛 저주가 번진다", rush: 7 },
        { t: "charge", say: "모자 끝에 번개를 모은다", next: { t: "attackAll", v: 23, say: "마녀의 번개가 떨어진다" } },
        { t: "debuff", id: "취약", v: 2, say: "인형에게 실을 꿴다", rush: 3 },
      ],
    },
    phase2: {
      at: 0.25, say: "껍질을 버리고 모자만 남아 날뛴다",
      intents: [
        { t: "multi", v: 9, n: 3, say: "모자가 날뛴다", rush: 6 },
        { t: "charge", say: "마지막 주문을 끓인다", next: { t: "attackAll", v: 25, say: "솥을 뒤엎는다" } },
        { t: "heal", v: 14, say: "점액으로 껍질을 메운다", rush: 3 },
      ],
    },
  },
  e0_uros: {
    // 원작 「우로스」 — 엘리아스 프론티어의 보스. 세계수의 힘을 삼킨 불꽃, 허물을 벗고 열반에 들며, 행동불가에 약하고,
    // 맵 전체를 태우는 「파멸의 운명」, 시간을 멈추고 긋는 「일섬」, 붉은 밧줄 · 검의 결계 · 땅속에서 솟구치기(나무위키).
    // 쓰러지면 그 자리에서 세계수 새싹이 핀다 — 세계수 뿌리 밑, 판의 마지막을 지킨다. 졸개는 부르지 않는다(원작 그대로). 성격 없음(Skin_None).
    // 공략: 첫 턴엔 열반의 허물(방어)이 두껍다 — 몰아 치지 말고 갖추는 턴으로. 불길이 매 턴 파티 전체를 그슬리니 오래 끌수록 손해(버티는 힘).
    //       검에 불꽃을 모으면(⚡0) 다음 턴 일섬 — 기절·봉인으로 끊어라(행동불가에 약하다). 결계 ⚡3 앞에선 카드를 아껴라.
    //       60% 아래 — 땅속으로 파고들면(⚡0) 솟구치기, 불꽃 거세지기 ⚡3. 30% 아래 — 다시 열반(방어)에 들고 뿌리의 불씨를 빨아 회복(⚡3) —
    //       일섬과 회복 사이에 몰아 밀어라
    ko: "우로스", hp: 332, row: "front", boss: true, skin: "Skin_None", tint: "#c8504a",
    scale: 0.66,         // 원작 그림이 화면을 꽉 채운다 — 커버러스만 하게
    passives: [
      { name: "열반", on: "fightStart", do: { t: "block", v: 30 } },
      { name: "파멸의 운명", on: "turnEnd", do: { t: "attackAll", v: 3 } },
      { name: "다시 열반", on: "lowHp", at: 0.3, do: { t: "block", v: 24 } },
    ],
    open: { t: "debuff", id: "약화", v: 1, say: "허물을 벗고 열반에 든다", rush: 3 },
    intents: [
      { t: "multi", v: 10, n: 2, say: "칼을 두 번 휘두른다", rush: 5 },
      { t: "back", v: 20, say: "지팡이를 내던진다", rush: 6 },
      { t: "debuff", id: "약화", v: 2, say: "검을 꽂아 결계를 친다", rush: 3 },
      { t: "charge", say: "검에 불꽃을 모은다", next: { t: "attackAll", v: 24, say: "시간을 멈추고 일섬" } },
      { t: "attack", v: 21, id: "취약", n: 2, say: "붉은 밧줄을 던진다", rush: 6 },
    ],
    phase: {
      at: 0.6, say: "열반이 깨지고 불꽃이 길을 잃는다",
      intents: [
        { t: "multi", v: 11, n: 2, say: "칼을 두 번 휘두른다", rush: 5 },
        { t: "charge", say: "땅속으로 파고든다", next: { t: "attackAll", v: 26, say: "땅을 가르고 솟구친다" } },
        { t: "multi", v: 5, n: 4, say: "결계의 검이 날아든다", rush: 6 },
        { t: "buff", id: "힘", v: 2, say: "불꽃이 거세진다", rush: 3 },
        { t: "back", v: 21, say: "지팡이를 내던진다", rush: 6 },
      ],
    },
    phase2: {
      at: 0.3, say: "뿌리에 남은 세계수의 불씨를 삼키려 한다",
      intents: [
        { t: "heal", v: 18, say: "뿌리에서 불씨를 들이켠다", rush: 3 },
        { t: "charge", say: "검에 불꽃을 모은다", next: { t: "attackAll", v: 28, say: "시간을 멈추고 일섬" } },
        { t: "attack", v: 25, id: "취약", n: 2, say: "붉은 밧줄을 던진다", rush: 6 },
        { t: "multi", v: 12, n: 2, say: "칼을 두 번 휘두른다", rush: 5 },
      ],
    },
  },
};

for (const [id, e] of Object.entries(ENEMIES)) e.id = id;

// 싸움터에 서는 모습 — 어느 스파인(art)에 어느 스킨을 입히나. 전투(art.js) · 아이콘(tools/build-art.js) · 검사가 모두 이것을 본다.
// 스킨은 적어 둔 것(skin) → 성격 스킨(Skin_Mad …) → 없음
const NATURE_SKIN = { 순수: "Skin_Naive", 광기: "Skin_Mad", 냉정: "Skin_Cool", 우울: "Skin_Gloomy", 활발: "Skin_Jolly" };
export function foeLook(id) {
  const e = ENEMIES[id];
  if (!e) return null;
  return { art: e.art || id, skin: e.skin || NATURE_SKIN[e.nature] || null };
}

// 층 — 지어낸 곳이 아니라 엘리아스의 실제 지도에서 온다(docs/03-세계관.md).
// 요정 왕국에서 시작해 엘프 도시를 지나 세계수 뿌리까지 내려간다.
// 적은 그 층의 것만 — 에르피엔은 요정 · 과자 · 숲(새마음금고는 요정 왕국 금고를 노린 슬라임),
// 모나티엄은 엘프 병사 · 엘프 드론(S · G형) · 엘프 저주 인형 · 엘프 누루링, 벨리티엔은 마녀 저주 인형 · 뿌리 밑의 마법 것들(docs/11-적.md).
// 보스는 1층 커버러스, 2층 M.E.O.W(엘프 도시의 고양이 로봇) + 드론 둘, 3층 햇팽이 마녀 + 술사,
// 그리고 3층 너머 뿌리 깊은 곳의 우로스(엘리아스 프론티어 보스 — 판의 마지막, final).
//   pools[세기]  약(1-1~1-3) · 중(1-4~1-6) · 강(1-7~1-10) 싸움이 세 벌씩 — 지도의 칸마다 하나를 고른다
//   elites       엘리트 칸 전용 — 그 층에서 가장 사나운 짝
//   fights       옛 도구(tools/sim.js · 로비 미리보기)가 보는 대표 셋 — pools 의 첫 벌
const FLOOR_DEFS = [
  {
    n: 1, name: "에르피엔", sub: "요정 왕국 · 세계수 주변",
    pools: [
      [["fairymobcloserange", "fairymoblongrange"], ["buseuleogi", "buseuleogi", "marshmallowdealer"], ["mogmaekim", "fairymoblongrange"]],
      [["fairymoblongrange", "ginseng", "fairymobcloserange"], ["marshmallowtanker", "marshmallowdealer", "marshmallowsupporter"], ["fairycurseddolltanker", "lupalu"]],
      [["gluttonbear", "ginseng"], ["fairycurseddolltanker", "fairycurseddolldealer", "fairycurseddollsupporter"], ["marshmallowtanker", "marshmallowdealer", "lupalu"]],
    ],
    elites: [["gluttonbear", "fairycurseddolldealer", "marshmallowdealer"], ["fairycurseddolltanker", "fairycurseddolldealer", "marshmallowsupporter", "fairycurseddolldealer"], ["goldring", "fairycurseddolldealer", "lupalu"]],
    boss: ["curburus"],
  },
  {
    n: 2, name: "모나티엄", sub: "엘프 도시 · 동부",
    pools: [
      [["elfsoldiercloserange", "elfsoldierlongrange"], ["droneg", "elfsoldierlongrange"], ["nururingwarrior", "nururingsupporter"]],
      [["elfcurseddolldealer", "elfsoldiercloserange"], ["nururingtanker", "nururingarcher"], ["droneg", "elfcurseddollwizard"]],
      [["elfcurseddolltanker", "drones", "elfcurseddolldealer"], ["nururingtanker", "nururingwarrior", "nururingsupporter"], ["elfcurseddolltanker", "elfcurseddollsupporter", "elfcurseddollwizard"]],
    ],
    elites: [["droneg", "drones", "elfsoldiercloserange"], ["nururingtanker", "nururingsupporter", "elfsoldierlongrange"]],
    boss: ["meow", "drones", "droneg"],
  },
  {
    n: 3, name: "벨리티엔", sub: "마녀 왕국 · 세계수 뿌리",
    pools: [
      [["oldtree", "wisps"], ["hatsnail", "magicfork"], ["pumpkin", "wisps"]],
      [["witchcurseddollwizard", "oldtree"], ["nependers", "hatsnail", "wisps"], ["witchcurseddolltanker", "witchcurseddolldealer"]],
      [["witchcurseddollwizard", "wisps", "oldtree"], ["pumpkin", "nependers", "magicfork"], ["witchcurseddolltanker", "witchcurseddollsupporter", "witchcurseddolldealer"]],
    ],
    elites: [["oldtree", "nependers", "magicfork"], ["pumpkin", "witchcurseddolldealer", "magicfork"]],
    boss: ["hatsnailwitch", "witchcurseddollwizard"],
    // 판의 마지막 — 3층 보스를 넘으면 상점 없이 캠프 한 번을 거쳐 뿌리 깊은 곳의 우로스와 싸운다(run.js isFinal · main.js finalCamp).
    // 우로스를 이겨야 판을 깬다
    final: { name: "세계수 뿌리 깊은 곳", sub: "벨리티엔 아래 · 판의 마지막", boss: ["e0_uros"] },
  },
];
export const FLOORS = FLOOR_DEFS.map((f) => ({ ...f, fights: f.pools.map((p) => p[0]) }));
