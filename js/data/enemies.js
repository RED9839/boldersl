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

// 이름 · 사는 곳은 원작 도감(나무위키 「트릭컬 리바이브/몬스터」 의 교주의 기록)을 따른다 — docs/11-적.md 에 근거 표.
// 같은 몬스터의 성격마다 도감 기록이 따로 있다(엘프 돌격병-냉정 「노동반」 · 햇팽이-광기 「음흉하고 영악」 …).
// 그 기록을 한 마리의 성질로 삼아 같은 그림 · 다른 성격 스킨으로 따로 세운다 — key 는 <그림>_<갈래>, 그림은 art.
//
// 적 하나의 성질은 낱말 한두 개로 읽힌다(맨 위 「공략」 의 괄호):
//   방패(앞줄에서 막는다 · 적 전체 방어) · 저격(뒷줄을 친다) · 치유사(동료 회복) · 폭탄(체력이 떨어지면 터진다 — 한 번에 넘기면 안 터진다)
//   가시(맞으면 되찌른다) · 재생(스스로 고친다) · 강화(힘이 붙는다) · 디버퍼(약화 · 취약) · 재촉꾼(⚡3 이 잦다) · 차지꾼(⚡0 큰 수)
//   반격꾼(당기면 · 몰아 치면 단단해진다) · 느긋이(⚡8 이상 — 몰아 써도 된다) · 격노(동료가 쓰러지면)

export const ENEMIES = {
  // ── 에르피엔 (요정 왕국) — 요정 주민 · 요정의 농기구 · 에슈르 빵집의 실패작 · 마시멜로 · 누루링-요정 ──────────
  fairymobcloserange: {
    // 원작 「저혈당 요정」 — 당분이 부족해져 눈이 돌아간 요정 왕국 주민(손에 든 것이 빵 · 거울)
    // 공략: 굼뜬 무리 — 수가 다 ⚡9 이상이라 몰아 써도 안 움직인다. 웅크림은 안 당겨진다. 카드를 아끼지 말고 빨리 치워라 (느긋이)
    ko: "저혈당 요정", hp: 41, row: "front", nature: "순수", tint: "#8ec98a",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 11, say: "달려든다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "우르르 몰려든다", rush: 10 },
      { t: "block", v: 8, say: "웅크린다", rush: 0 },
    ],
  },
  fairymoblongrange: {
    // 원작 「고혈당 요정」 — 빵 대신 채소에 맛을 들인 요정 왕국 주민(손에 든 것이 푸성귀)
    // 공략: 떠들기·장난은 ⚡3 — 그 수가 보이면 두 장까지, 큰 한 장이나 관통으로 먼저. 공격 수는 ⚡4~5라 한 장 더 내도 된다 (재촉꾼)
    ko: "고혈당 요정", hp: 27, row: "back", nature: "활발", tint: "#7b9c8a",
    pick: "shuffle",
    open: { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
    intents: [
      { t: "back", v: 7, say: "뒤로 파고든다", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
      { t: "attack", v: 6, say: "스쳐 지나간다", rush: 4 },
      { t: "debuff", id: "약화", v: 1, say: "장난을 친다", rush: 3 },
    ],
  },
  magicfork: {
    // 원작 「불효자손」 — 요정들의 마법 농기구(괭이). 갈 밭이 없으면 목적을 잃고 방황한다. 높은 공격력 · 낮은 HP
    // 공략: 28 체력 유리 대포 — 날을 세우면(⚡3) 그 턴에 쓰러뜨려라. 내리찍기는 ⚡6 (강화)
    ko: "불효자손", hp: 28, row: "front", nature: "순수", tint: "#e0a0b0",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 10, say: "밭을 갈듯 내리찍는다", w: 2, rush: 6 },
      { t: "multi", v: 4, n: 2, say: "두 번 긁는다", rush: 5 },
      { t: "buff", id: "힘", v: 2, say: "날을 세운다", rush: 3 },
    ],
  },
  ginseng: {
    // 원작 「산사모」 — 세계수 근처에서 양분을 너무 먹어 움직이게 된 산삼. 주로 요정 왕국 근처, 쓴맛으로 몸을 지킨다
    // 공략: 즙·박힘이 ⚡3이라 두면 동료가 낫는다 — 먼저 뽑되, 절반에서 한 번 땅에 숨으니(방어) 절반을 넘기는 턴엔 한 번에 몰아 뽑아라 (치유사)
    ko: "산사모", hp: 30, row: "back", nature: "우울", tint: "#c0b07a",
    passives: [
      { name: "땅속으로", on: "lowHp", at: 0.5, do: { t: "block", v: 8 } },
    ],
    intents: [
      { t: "heal", v: 8, say: "뿌리에서 즙이 돈다", rush: 3 },
      { t: "guard", v: 6, say: "땅에 박힌다", rush: 3 },
      { t: "debuff", id: "약화", v: 2, say: "쓴 냄새", rush: 4 },
      { t: "back", v: 9, say: "뿌리를 뻗는다", rush: 6 },
    ],
  },
  mogmaekim: {
    // 원작 「목매킴」 — 에슈르(요정 왕국 빵집 겸 마법 학교)가 잘못 구운 빵. 원작 특징 「물량 · 자폭 주의」
    // 공략: 체력이 35% 아래로 떨어지면 부풀어 터져 파티 전체를 친다 — 30 체력을 한 번에 넘겨 쓰러뜨리면 안 터진다. 굳기 ⚡3 (폭탄)
    ko: "목매킴", hp: 30, row: "front", nature: "활발", tint: "#d8b070",
    pick: "shuffle",
    passives: [
      { name: "부풀어 터진다", on: "lowHp", at: 0.35, do: { t: "attackAll", v: 6 } },
    ],
    intents: [
      { t: "attack", v: 8, say: "제작자를 원망하며 달려든다", w: 2, rush: 5 },
      { t: "debuff", id: "약화", v: 1, say: "밀가루가 휘날린다", rush: 4 },
      { t: "block", v: 6, say: "뻑뻑하게 굳는다", rush: 3 },
    ],
  },
  buseuleogi: {
    // 원작 「부스러기」 — 에슈르가 잘못 만든 컵케이크. 원작 특징 「물량 주의 · 낮은 HP」
    // 공략: 와작 ⚡3으로 작게 자주 문다 — 카드를 흘리지 말고 20 체력을 큰 한 장으로. 하나가 쓰러지면 남은 것이 설탕을 핥으니 둘을 같은 턴에 (재촉꾼 · 격노)
    ko: "부스러기", hp: 20, row: "front", nature: "광기", tint: "#c08a5a",
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
  marshmallowtanker: {
    // 원작 「탱탱 멜로」 — 마시멜로 골렘. 너무 많이 얻어맞으면 분노한다(그래도 마시멜로다)
    // 공략: 부풀기·줄 맞추기 ⚡3 — 그 수 앞에선 한 턴에 두세 장, 센 카드로. 절반에서 한 번 분노해 힘 +2 — 절반을 넘기는 턴엔 끝까지 (방패)
    ko: "탱탱 멜로", hp: 48, row: "front", nature: "순수", tint: "#f0e6d8",
    passives: [
      { name: "얻어맞아 분노", on: "lowHp", at: 0.5, do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "block", v: 10, say: "말랑하게 부푼다", rush: 3 },
      { t: "attack", v: 8, say: "몸으로 민다", rush: 5 },
      { t: "guard", v: 6, say: "줄을 맞춘다", rush: 3 },
      { t: "attack", v: 11, say: "통통 튀어 부딪힌다", rush: 7 },
    ],
  },
  marshmallowdealer: {
    // 원작 「말랑 멜로」 — 장난기 많은 마법사가 깨운 간식. 높은 공격력 · 낮은 HP
    // 공략: 꼬치는 ⚡9 이상이라 늦게 온다 — 마음껏 몰아 써라. 절반에서 한 번 녹아내리며 찌르니 28 체력을 한 턴에 넘겨 버려라 (저격 · 느긋이)
    ko: "말랑 멜로", hp: 28, row: "back", nature: "활발", tint: "#e8f0d8",
    pick: "shuffle",
    passives: [
      { name: "녹아내리며 찌른다", on: "lowHp", at: 0.5, do: { t: "back", v: 8 } },
    ],
    intents: [
      { t: "back", v: 7, say: "꼬치를 찌른다", w: 2, rush: 9 },
      { t: "multi", v: 3, n: 3, say: "꼬치를 연달아 찌른다", rush: 10 },
      { t: "attack", v: 7, say: "앞으로 달려든다", rush: 9 },
    ],
  },
  marshmallowsupporter: {
    // 원작 「쫀득 멜로」 — 회복 주의. 다른 멜로와 달리 먹히길 바란다
    // 공략: 덧바르기·깃발 ⚡3 — 먼저 잡아라. 디버프가 걸리면 설탕을 덧발라 스스로 메우니 약화·취약 말고 공격으로 잡아라 (치유사)
    ko: "쫀득 멜로", hp: 26, row: "back", nature: "활발", tint: "#d8f0e0",
    pick: "shuffle",
    passives: [
      { name: "설탕 코팅", on: "debuffed", do: { t: "selfHeal", v: 5 } },
    ],
    intents: [
      { t: "heal", v: 6, say: "설탕을 덧바른다", rush: 3 },
      { t: "guard", v: 5, say: "꽃 깃발을 흔든다", rush: 3 },
      { t: "debuff", id: "약화", v: 1, say: "달콤한 냄새", rush: 5 },
    ],
  },
  lupalu: {
    // 원작 「루파루」-광기 — 물가의 정령. 요정들에게 받은 사탕을 음료에 섞어 당분 중독이 됐다
    // 공략: 디버프가 걸리면 사탕 음료를 들이켜 힘 +1 — 약화로 묶지 말고 공격으로 잡아라. 병이 출렁이면(⚡3) 두 장까지 (강화 · 방해)
    ko: "루파루", hp: 34, row: "back", nature: "광기", tint: "#f0b0c0",
    passives: [
      { name: "당분 중독", on: "debuffed", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "back", v: 10, say: "음료병을 휘두른다", rush: 6 },
      { t: "jam", v: 1, say: "병이 출렁인다", rush: 3 },
      { t: "heal", v: 8, say: "사탕 음료를 나눠 마신다", rush: 4 },
      { t: "debuff", id: "약화", v: 1, say: "단내를 풍긴다", rush: 5 },
    ],
  },
  // 누루링 시리즈 — 살아 움직이는 세계수 수액. 종족 땅마다 그 영향을 받아 모습이 다르다(원작 「누루링-요정 탱커」 …).
  // 스파인 한 벌(nururingtanker 따위)이 종족 스킨 여덟 벌을 든다 — 요정 땅은 Skin_Fairy. 성격은 없다(원작 성격없음)
  nururingtanker_fairy: {
    // 「요정 왕국 근처에서 영향을 받아 단 것에 집착 · 통통하게 젤리가 올라서 고통에 둔감하다」
    // 공략: 맞을 때마다(턴 두 번) 방어 +3 — 작은 카드로 쪼개 치면 젤리만 두꺼워진다, 큰 카드로. 감싸기 ⚡3 (방패)
    ko: "누루링-요정 탱커", hp: 50, row: "front", art: "nururingtanker", skin: "Skin_Fairy", tint: "#f0c890",
    passives: [
      { name: "통통한 젤리", on: "hurt", limit: 2, do: { t: "block", v: 3 } },
    ],
    intents: [
      { t: "guard", v: 6, say: "젤리로 감싼다", rush: 3 },
      { t: "attack", v: 9, say: "통통 부딪힌다", rush: 5 },
      { t: "block", v: 10, say: "젤리가 오른다", rush: 4 },
      { t: "attack", v: 12, say: "깔고 앉는다", rush: 6 },
    ],
  },
  nururingwarrior_fairy: {
    // 「젤리 살이 아니라 근육이라 주장하며 힘자랑을 한다」
    // 공략: 힘자랑 ⚡3 — 그 턴엔 두 장까지. 팔을 걷으면(⚡0) 다음 턴 16 — 끊거나 막아라 (강화 · 차지꾼)
    ko: "누루링-요정 전사", hp: 36, row: "front", art: "nururingwarrior", skin: "Skin_Fairy", tint: "#f0b878",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 9, say: "젤리 주먹", w: 2, rush: 5 },
      { t: "buff", id: "힘", v: 2, say: "근육이라고 우긴다", rush: 3 },
      { t: "charge", say: "팔을 걷어붙인다", next: { t: "attack", v: 16, say: "힘자랑 한 방" } },
    ],
  },
  nururingarcher_fairy: {
    // 원작 「누루링-요정 마법사」(파일은 archer) — 「마력이 깃든 빵을 먹은 듯하다」
    // 공략: 약화 · 취약을 번갈아 건다 — 빵 마법(⚡3)이 보이면 두 장까지, 28 체력이니 관통으로 먼저 (디버퍼)
    ko: "누루링-요정 마법사", hp: 28, row: "back", art: "nururingarcher", skin: "Skin_Fairy", tint: "#e8b0a0",
    pick: "shuffle",
    intents: [
      { t: "debuff", id: "약화", v: 1, say: "빵 부스러기 마법", rush: 3 },
      { t: "back", v: 8, say: "마력 빵을 던진다", w: 2, rush: 5 },
      { t: "debuff", id: "취약", v: 1, say: "달콤한 주문", rush: 4 },
    ],
  },
  nururingsupporter_fairy: {
    // 「다른 누루링들의 젤리층을 찹찹 치대며 격려해준다」
    // 공략: 치대기 · 격려 ⚡3 — 두면 동료를 메운다, 먼저 잡아라. 톡 치기는 ⚡5라 잡는 동안은 몰아 써도 된다 (치유사)
    ko: "누루링-요정 서포터", hp: 30, row: "back", art: "nururingsupporter", skin: "Skin_Fairy", tint: "#f0d0a0",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 7, say: "젤리층을 찹찹 치댄다", rush: 3 },
      { t: "guard", v: 5, say: "격려한다", rush: 3 },
      { t: "back", v: 5, say: "톡 친다", w: 2, rush: 5 },
    ],
  },
  // 1층 엘리트의 머리 — 도감의 광기 기록에서
  goldring: {
    // 원작 「새마음금고」 — 요정 왕국의 금고를 노리고 들어온 슬라임(나무위키 몬스터 문서). 1층 엘리트
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
  magicfork_mad: {
    // 원작 「불효자손」-광기 — 「더 이상 갈아버릴 밭이 없는 상태로 너무 오랫동안 방황하면, 근처의 무엇이든 갈아버리려고 한다」. 1층 엘리트
    // 공략: 맞을 때마다(턴 한 번) 힘 +1 — 오래 끌수록 세진다, 몰아 쳐 빨리. 자루를 높이 들면(⚡0) 다음 턴 파티 전체 — 끊어라. 날 갈기 ⚡3 (강화 · 차지꾼)
    ko: "불효자손 · 폭주", hp: 56, row: "front", nature: "광기", art: "magicfork", tint: "#c87090",
    passives: [
      { name: "무엇이든 간다", on: "hurt", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "갈아엎는다", rush: 6 },
      { t: "multi", v: 4, n: 3, say: "마구 긁는다", rush: 6 },
      { t: "charge", say: "자루를 높이 든다", next: { t: "attackAll", v: 11, say: "밭째 갈아엎는다" } },
      { t: "buff", id: "힘", v: 2, say: "날을 간다", rush: 3 },
    ],
  },
  ginseng_mad: {
    // 원작 「산사모」-광기 — 「너무 오랫동안 성장하면 불안정한 상태에 도달한다. 영양분의 과잉으로 제정신이 아니다」. 1층 엘리트
    // 공략: 턴마다 넘치는 양분이 다친 동료를 메우고, 40% 아래로 떨어지면 양분이 터진다(파티 전체 8) — 먼저 잡되 40% 를 한 번에 넘겨라 (치유사 · 폭탄)
    ko: "산사모 · 웃자람", hp: 44, row: "back", nature: "광기", art: "ginseng", tint: "#b0a050",
    passives: [
      { name: "넘치는 양분", on: "turnStart", do: { t: "heal", v: 4 } },
      { name: "양분이 터진다", on: "lowHp", at: 0.4, do: { t: "attackAll", v: 8 } },
    ],
    intents: [
      { t: "heal", v: 10, say: "양분을 뿜는다", rush: 3 },
      { t: "guard", v: 7, say: "뿌리를 얽는다", rush: 3 },
      { t: "back", v: 10, say: "쓴 즙을 뿌린다", rush: 6 },
      { t: "debuff", id: "약화", v: 2, say: "쓴맛이 번진다", rush: 4 },
    ],
  },

  // ── 모나티엄 (엘프 도시) — 엘프 군인 · 엘프 드론 · 누루링-엘프 · 폐수 먹은 한입초 ───────────────────
  elfsoldiercloserange: {
    // 원작 「엘프 돌격병」-순수 — 「엘프 도시 모나티엄의 기반을 담당하는 군인. 징병제 시스템 때문인지 엘프들은 대부분이 군인이다」
    // 공략: 대열 좁히기 ⚡3 — 그 턴엔 적게 세게. 전우가 쓰러지면 힘이 붙으니 병사부터, 아니면 같은 턴에 같이 쓰러뜨려라 (반격꾼 · 격노)
    ko: "엘프 돌격병", hp: 51, row: "front", nature: "순수", tint: "#6fa2c0",
    pick: "shuffle",
    passives: [
      { name: "전우의 복수", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "대열을 맞춘다", w: 2, rush: 6 },
      { t: "attack", v: 8, id: "취약", n: 1, say: "창끝으로 찌른다", rush: 5 },
      { t: "guard", v: 8, say: "대열을 좁힌다", rush: 3 },
      { t: "jam", v: 1, say: "창끝을 겨눈다", rush: 4 },
    ],
  },
  elfsoldiercloserange_worker: {
    // 원작 「엘프 돌격병」-냉정 — 「통칭 '노동반'. 엘프들의 공병이다. 제일 힘들다. 귀찮게 하지 말자」
    // 공략: 당기면 귀찮아서 바리케이드(적 전체 방어 +6) — 이 녀석 앞에선 몰아 쓰지 마라. 바리케이드 ⚡3 (방패 · 반격꾼)
    ko: "엘프 돌격병 · 노동반", hp: 58, row: "front", nature: "냉정", art: "elfsoldiercloserange", tint: "#5f8fa8",
    passives: [
      { name: "귀찮게 하지 마", on: "rushed", do: { t: "guard", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, say: "바리케이드를 세운다", rush: 3 },
      { t: "attack", v: 11, say: "공구로 내려친다", rush: 5 },
      { t: "block", v: 12, say: "자재 더미 뒤에 숨는다", rush: 4 },
      { t: "attack", v: 14, say: "삽으로 퍼붓는다", rush: 6 },
    ],
  },
  elfsoldiercloserange_honor: {
    // 원작 「엘프 돌격병」-우울 — 「엘프 군인들 중 의장대에 속하는 자들이다. 엘프 군인들의 이미지를 담당한다」
    // 공략: 디버프를 걸면 자존심이 상해 힘 +1 — 디버프 덱은 피하고 공격으로. 검을 세우면(⚡0) 다음 턴 22 — 끊어라. 자세 가다듬기 ⚡3 (차지꾼)
    ko: "엘프 돌격병 · 의장대", hp: 50, row: "front", nature: "우울", art: "elfsoldiercloserange", tint: "#7f98c8",
    passives: [
      { name: "의장대의 자존심", on: "debuffed", do: { t: "buff", id: "힘", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "의장검을 휘두른다", rush: 6 },
      { t: "block", v: 10, say: "자세를 가다듬는다", rush: 3 },
      { t: "charge", say: "의장검을 높이 세운다", next: { t: "attack", v: 22, say: "예식처럼 내리친다" } },
      { t: "debuff", id: "취약", v: 1, say: "날 선 눈빛", rush: 4 },
    ],
  },
  elfsoldierlongrange: {
    // 원작 「엘프 명사수」-순수 — 「모나티엄 적성 검별 시스템에서 원거리 병과로 선택받은 군인. 온 몸을 감싸는 답답한 장비 때문에 더위를 자주 먹는다」
    // 공략: 시위를 천천히 당긴다 — 수가 다 ⚡8 이상이라 몰아 써도 되니 그 사이 관통으로 먼저 잡거나 뒷줄을 막아라 (저격 · 느긋이)
    ko: "엘프 명사수", hp: 38, row: "back", nature: "순수", tint: "#7fa8c8",
    pick: "shuffle",
    intents: [
      { t: "back", v: 11, say: "뒷줄을 겨눈다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "화살을 잇달아 쏜다", rush: 10 },
      { t: "debuff", id: "취약", v: 1, say: "표식을 쏜다", rush: 8 },
    ],
  },
  elfsoldierlongrange_escort: {
    // 원작 「엘프 명사수」-광기 — 「모나티엄 외부의 유지 보수 작업에 나갈 시 동료들을 호위한다」
    // 공략: 동료가 쓰러지면 뒷줄을 쏜다(7) — 이 녀석부터 잡거나 마지막 둘을 같은 턴에. 막아서기 ⚡3 (저격 · 엄호)
    ko: "엘프 명사수 · 호위", hp: 36, row: "back", nature: "광기", art: "elfsoldierlongrange", tint: "#6f98b8",
    pick: "shuffle",
    passives: [
      { name: "호위 사격", on: "allyDown", do: { t: "back", v: 7 } },
    ],
    intents: [
      { t: "back", v: 10, say: "엄호 사격", w: 2, rush: 6 },
      { t: "guard", v: 6, say: "동료 앞을 막아선다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "견제 사격", rush: 5 },
    ],
  },
  elfsoldierlongrange_honor: {
    // 원작 「엘프 명사수」-우울 — 「의장대에 소속이라 그런지 자존심이 매우 강하다」
    // 공략: 총을 겨누면(⚡0) 다음 턴 뒷줄에 22 — 관통으로 먼저 잡거나 봉인 · 기절로 끊어라. 나머지는 ⚡6~8 이라 느긋하다 (저격 · 차지꾼)
    ko: "엘프 명사수 · 의장대", hp: 34, row: "back", nature: "우울", art: "elfsoldierlongrange", tint: "#8fa0c8",
    intents: [
      { t: "charge", say: "의장 총을 겨눈다", next: { t: "back", v: 22, say: "한 치 어긋남 없이 쏜다" } },
      { t: "back", v: 9, say: "예포를 쏜다", rush: 8 },
      { t: "debuff", id: "약화", v: 1, say: "고개를 쳐든다", rush: 6 },
    ],
  },
  drones: {
    // 원작 「드론 S형」-냉정 — 엘프들의 비행형 드론. 「잘못 기입된 명령어 한 줄로 인해 생명체에 대한 공격성이 지대하게 늘어난 모델」
    // 공략: 경보 ⚡3 — 경보가 보이면 두 장까지, 나머지 수는 ⚡5~6. 절반에서 한 번 비상 경보(AP)를 울리니 절반을 넘기는 턴엔 끝까지 부숴라 (재촉꾼 · 방해)
    ko: "드론 S형", hp: 51, row: "back", nature: "냉정", tint: "#7fb6d9",
    passives: [
      { name: "비상 경보", on: "lowHp", at: 0.5, do: { t: "jam", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 6, say: "전방위 사격", rush: 6 },
      { t: "jam", v: 1, say: "경보음", rush: 3 },
      { t: "block", v: 12, say: "장갑 전개", rush: 5 },
      { t: "multi", v: 3, n: 3, say: "조준 연사", rush: 5 },
    ],
  },
  drones_scrap: {
    // 원작 「드론 S형」-광기 — 「기술 발달 속도를 따라잡지 못하고 폐기된 드론 모델이며, 옛 부품들을 쓰기 때문에 수리가 불가능하다」
    // 공략: 40% 아래로 떨어지면 과열해 터진다(파티 전체 7) — 30 체력을 한 번에 넘겨라. 잡음 ⚡3 (폭탄)
    ko: "드론 S형 · 폐기형", hp: 30, row: "back", nature: "광기", art: "drones", tint: "#a89a7f",
    pick: "shuffle",
    passives: [
      { name: "과열 폭발", on: "lowHp", at: 0.4, do: { t: "attackAll", v: 7 } },
    ],
    intents: [
      { t: "multi", v: 3, n: 3, say: "고장 난 연사", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "잡음을 낸다", rush: 3 },
      { t: "back", v: 9, say: "부품을 쏘아 낸다", rush: 5 },
    ],
  },
  droneg: {
    // 원작 「드론 G형」-순수 — 「시민들의 안전과 통제를 담당하는 보행형 드론. 때에 따라서 다수의 개체가 모여 방어벽을 형성하기도 한다」
    // 공략: 방어벽 ⚡3 — 큰 카드 한두 장으로. 동료가 쓰러지면 남은 것을 감싸니(적 전체 방어 +6) 그 턴엔 남은 카드로 벗길 각오를 (방패)
    ko: "드론 G형", hp: 58, row: "front", nature: "순수", tint: "#8a9aa8",
    passives: [
      { name: "방어벽", on: "allyDown", do: { t: "guard", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, say: "방어벽을 세운다", rush: 3 },
      { t: "attack", v: 12, say: "다리로 걷어찬다", rush: 5 },
      { t: "jam", v: 1, say: "통제 신호", rush: 4 },
      { t: "attack", v: 14, say: "돌진한다", rush: 6 },
    ],
  },
  droneg_repair: {
    // 원작 「드론 G형」-광기 — 「자신이 미래에서 넘어왔다고 생각하는 이상한 오류가 생긴 드론들. 자가 수리가 된다며 수리를 거부한다」
    // 공략: 턴 끝마다 5씩 스스로 고친다 — 나눠 치면 손해, 한두 턴에 몰아 부숴라. 장갑 ⚡3 (재생)
    ko: "드론 G형 · 자가 수리", hp: 54, row: "front", nature: "광기", art: "droneg", tint: "#9a8a98",
    passives: [
      { name: "자가 수리", on: "turnEnd", do: { t: "selfHeal", v: 5 } },
    ],
    intents: [
      { t: "attack", v: 11, say: "걷어찬다", rush: 5 },
      { t: "block", v: 10, say: "장갑을 덧댄다", rush: 3 },
      { t: "multi", v: 5, n: 2, say: "두 번 짓밟는다", rush: 6 },
    ],
  },
  // 누루링-엘프 — 「엘프 도시 근처에서 그 영향을 크게 받아 다른 누루링들과 사이가 안 좋다. 기름이 발라져 있어 고소하다」. Skin_Elf
  nururingtanker: {
    // 공략: 방패·굳기 ⚡3 — 한 턴에 적게 세게. 디버프가 걸리면 주워 온 장비로 막으니 약화·취약은 아끼고 공격으로 벗겨라 (방패 · 반격꾼)
    ko: "누루링-엘프 탱커", hp: 64, row: "front", skin: "Skin_Elf", tint: "#c8b878",
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
    ko: "누루링-엘프 전사", hp: 44, row: "front", skin: "Skin_Elf", tint: "#d0a868",
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
    // 공략: 웅얼거림·기름 연기 ⚡3 — 그 수 앞에선 카드를 아끼고 32 체력을 관통 큰 한 장으로. 쏘기·튀기기는 ⚡5 (재촉꾼 · 디버퍼)
    ko: "누루링-엘프 마법사", hp: 32, row: "back", skin: "Skin_Elf", tint: "#b8a070",
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
    //       다른 누루링과 사이가 나빠 동료가 쓰러지면 오히려 신이 나 힘이 붙는다 — 이 녀석부터 (치유사 · 격노)
    ko: "누루링-엘프 서포터", hp: 34, row: "back", skin: "Skin_Elf", tint: "#c0b080",
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
  nependers: {
    // 원작 「한입초」-냉정 — 「엘프들이 흘린 폐수를 빨아들이고 어딘가 많이 뒤틀린 한입초」. 원작 특징 「삼키기 주의」 —
    // 가까이 있는 하나를 삼켜 크게 다치게 하고 뱉는다
    // 공략: 입을 벌리면(⚡0) 다음 턴 앞줄 하나를 삼켜 22 — 끊거나 막아라. 당겨질 때마다 꿀꺽 회복하니 잎 닫기 ⚡3 앞에선 적게 (차지꾼 · 반격꾼)
    ko: "한입초", hp: 50, row: "back", nature: "냉정", tint: "#7a9a60",
    passives: [
      { name: "꿀꺽", on: "rushed", do: { t: "selfHeal", v: 6 } },
    ],
    intents: [
      { t: "back", v: 12, say: "덥석 문다", rush: 6 },
      { t: "block", v: 10, say: "잎을 닫는다", rush: 3 },
      { t: "charge", say: "입을 크게 벌린다", next: { t: "attack", v: 22, say: "삼켰다가 뱉는다" } },
      { t: "debuff", id: "취약", v: 2, say: "폐수 냄새를 풍긴다", rush: 4 },
    ],
  },
  droneg_sentry: {
    // 원작 「드론 G형」-냉정 — 「관리가 중요한 시설에 항상 상주하여 주변을 지키는 모델이다」. 2층 엘리트
    // 공략: 첫 턴부터 방어벽(적 전체 10) — 동료를 먼저 잡으면 벽이 더 두꺼워진다(+8), 경비부터 부수거나 같은 턴에. 경보(⚡0)는 끊어라 (방패 · 차지꾼)
    ko: "드론 G형 · 시설 경비", hp: 78, row: "front", nature: "냉정", art: "droneg", tint: "#6a7a90",
    passives: [
      { name: "상주 경비", on: "fightStart", do: { t: "guard", v: 10 } },
      { name: "방어벽", on: "allyDown", do: { t: "guard", v: 8 } },
    ],
    intents: [
      { t: "guard", v: 10, say: "방어벽을 겹친다", rush: 3 },
      { t: "attack", v: 15, say: "진압봉을 내리친다", rush: 6 },
      { t: "charge", say: "경보를 울린다", next: { t: "attackAll", v: 13, say: "진압 사격" } },
      { t: "jam", v: 2, say: "출입을 통제한다", rush: 4 },
    ],
  },

  // ── 벨리티엔 (마녀 왕국 · 세계수 뿌리) — 누루링-마녀 · 마녀가 만든 인형 「누루링」 · 마녀 모자의 햇팽이 ───────
  // 누루링-마녀 — 「마녀 왕국 근처에서 그 영향을 크게 받아 음험하며, 건강한 맛이 난다」. Skin_Witch
  nururingtanker_witch: {
    // 「간사한 말로 주변을 도발한다」
    // 공략: 당기면 간사한 말로 파티 전체 취약 — 몰아 쓰지 말고 적게 세게. 꼬드기기 · 약 올리기 ⚡3 (방패 · 반격꾼)
    ko: "누루링-마녀 탱커", hp: 70, row: "front", art: "nururingtanker", skin: "Skin_Witch", tint: "#a080b0",
    passives: [
      { name: "간사한 말", on: "rushed", do: { t: "debuff", id: "취약", v: 1 } },
    ],
    intents: [
      { t: "guard", v: 10, say: "간사하게 꼬드긴다", rush: 3 },
      { t: "block", v: 14, say: "약초 젤리를 굳힌다", rush: 4 },
      { t: "attack", v: 12, say: "몸으로 누른다", rush: 5 },
      { t: "debuff", id: "약화", v: 1, say: "약을 올린다", rush: 3 },
    ],
  },
  nururingwarrior_witch: {
    // 「의외로 힘이 강한 것 같다」
    // 공략: 젤리 근육을 부풀리면(⚡0) 다음 턴 26 — 기절 · 봉인으로 끊어라. 약초 씹기 ⚡3 (강화 · 차지꾼)
    ko: "누루링-마녀 전사", hp: 50, row: "front", art: "nururingwarrior", skin: "Skin_Witch", tint: "#9070a0",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 13, say: "의외로 센 주먹", w: 2, rush: 6 },
      { t: "charge", say: "젤리 근육을 부풀린다", next: { t: "attack", v: 26, say: "내리꽂는다" } },
      { t: "buff", id: "힘", v: 2, say: "약초를 씹는다", rush: 3 },
    ],
  },
  nururingarcher_witch: {
    // 원작 「누루링-마녀 마법사」 — 「재채기를 하려고 노력한다」
    // 공략: 코끝이 간질거리면(⚡0) 다음 턴 재채기 마법이 파티 전체에 12 — 관통으로 먼저 잡거나 끊어라. 재채기 참기 ⚡3 (차지꾼 · 디버퍼)
    ko: "누루링-마녀 마법사", hp: 40, row: "back", art: "nururingarcher", skin: "Skin_Witch", tint: "#b090c0",
    intents: [
      { t: "back", v: 12, say: "주문을 쏜다", rush: 6 },
      { t: "debuff", id: "약화", v: 2, say: "재채기를 참는다", rush: 3 },
      { t: "charge", say: "코끝이 간질간질하다", next: { t: "attackAll", v: 12, say: "에취! 마법이 터진다" } },
    ],
  },
  nururingsupporter_witch: {
    // 「다른 누루링들을 가르친다」
    // 공략: 약초 바르기 · 훈계 ⚡3 — 두면 동료를 메운다, 먼저 잡아라. 동료를 먼저 잡으면 남은 것을 감싼다(적 전체 방어 +8) (치유사)
    ko: "누루링-마녀 서포터", hp: 42, row: "back", art: "nururingsupporter", skin: "Skin_Witch", tint: "#c0a0c8",
    pick: "shuffle",
    passives: [
      { name: "가르치는 누루링", on: "allyDown", do: { t: "guard", v: 8 } },
    ],
    intents: [
      { t: "heal", v: 11, say: "약초 젤리를 발라 준다", rush: 3 },
      { t: "guard", v: 7, say: "훈계한다", rush: 3 },
      { t: "back", v: 9, say: "회초리를 휘두른다", w: 2, rush: 6 },
    ],
  },
  // 원작 「누루링」(인형) — 「마녀들의 뒤틀린 마법으로 생겨난 소름끼치는 인형 괴물」. 누루링 버스터의 누루링을 본떠 마녀가 만들어 팔다 유행이
  // 지나 버려진 인형이다(세계수 수액인 누루링 시리즈와 다른 것). 스파인 curseddoll 한 벌을 성격 스킨으로 나눠 입는다
  curseddoll_naive: {
    // 순수 — 「마녀가 스스로 움직이는 인형을 만들어 팔던 것이 유행이 지나버렸다」
    // 공략: 무겁고 느리다 — 수가 ⚡8 이상이니 마음껏 몰아 쳐 먼저 쓰러뜨려라. 동료부터 잡으면 끊긴 실을 이어 힘 +3 (방패 · 느긋이)
    ko: "누루링 인형", hp: 76, row: "front", nature: "순수", art: "curseddoll", tint: "#8f7fa8",
    passives: [
      { name: "이어 붙인 실", on: "allyDown", do: { t: "buff", id: "힘", v: 3 } },
    ],
    intents: [
      { t: "guard", v: 12, say: "팔리던 천을 두른다", rush: 8 },
      { t: "attack", v: 12, say: "무겁게 내려친다", rush: 9 },
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다", rush: 0 },
      { t: "attack", v: 14, say: "밀어붙인다", rush: 10 },
    ],
  },
  curseddoll_mad: {
    // 광기 — 「애착인형으로 오랫동안 사랑을 받았지만, 버려지는 것은 한 순간이었다. 이 누루링에게 남은 것이라고는 '악'밖에 없다」
    // 공략: 팽팽·몸 감기 ⚡3 — 몰아 치면 힘이 붙고 몸을 감는다, 한 턴에 적게. 맞으면 실가시로 되찌르니(턴에 두 번) 관통 큰 한 장 (가시 · 저격)
    ko: "누루링 인형 · 버림받은", hp: 48, row: "back", nature: "광기", art: "curseddoll", tint: "#b07fb0",
    passives: [
      { name: "실가시", on: "hurt", limit: 2, do: { t: "thorns", v: 2 } },
    ],
    open: { t: "debuff", id: "취약", v: 1, say: "눈이 붉게 빛난다", rush: 4 },
    intents: [
      { t: "back", v: 14, say: "그림자 바늘", rush: 6 },
      { t: "buff", id: "힘", v: 2, say: "실이 팽팽해진다", rush: 3 },
      { t: "multi", v: 4, n: 3, say: "실이 춤춘다", rush: 6 },
      { t: "block", v: 10, say: "실로 몸을 감는다", rush: 3 },
    ],
  },
  curseddoll_jolly: {
    // 활발 — 「자신만의 삶을 찾아 여기저기를 떠도는 종. 칙칙한 마녀 공동에서 벗어나 생활하며 성격이 좀 밝아졌다」
    // 공략: 결계 ⚡3 — 두면 동료의 상처를 덮는다, 관통으로 먼저 잡아라. 빛 끌어당기기는 ⚡7이라 서두를 것 없다 (치유사 · 방해)
    ko: "누루링 인형 · 떠돌이", hp: 52, row: "back", nature: "활발", art: "curseddoll", tint: "#c0a0d0",
    intents: [
      { t: "heal", v: 12, say: "결계로 상처를 덮는다", rush: 3 },
      { t: "jam", v: 2, say: "떠돌며 배운 주문", rush: 5 },
      { t: "debuff", id: "취약", v: 2, say: "손끝을 겨눈다", rush: 4 },
      { t: "back", v: 16, say: "뿌리째 끌어당긴다", rush: 7 },
    ],
  },
  // 원작 「햇팽이」 — 「마녀들의 모자를 집 삼아 움직이는 달팽이」. 성격마다 기록이 다르다
  hatsnail: {
    // 우울 — 「모자가 아닌 진짜 껍질 집에 살고 싶어하는 햇팽이」
    // 공략: 느릿느릿 — 수가 ⚡8 이상이니 마음껏 몰아 써라. 다만 첫 대를 맞으면 모자에 숨으니(턴에 한 번) 작은 카드로 먼저 두드리고 큰 카드는 그다음 (느긋이)
    ko: "햇팽이", hp: 56, row: "front", nature: "우울", tint: "#a07860",
    passives: [
      { name: "모자 속으로", on: "hurt", do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "block", v: 16, say: "모자 속으로 숨는다", rush: 0 },
      { t: "attack", v: 11, say: "느릿느릿 들이받는다", rush: 9 },
      { t: "debuff", id: "약화", v: 1, say: "끈적한 길을 남긴다", rush: 8 },
      { t: "attack", v: 13, say: "껍질 대신 모자로 굴러든다", rush: 10 },
    ],
  },
  hatsnail_mad: {
    // 광기 — 「사악한 성격을 가진 마녀 모자에 들러붙은 햇팽이는 굉장히 음흉하고 영악하다」
    // 공략: 디버프를 걸면 모자가 웃으며 약화를 돌려준다 — 디버프는 아끼고 기절 한 번으로. 저주가 끓으면(⚡0) 다음 턴 파티 전체 12 — 끊거나 전체를 막아라 (차지꾼 · 디버퍼)
    ko: "햇팽이 · 음흉", hp: 58, row: "front", nature: "광기", art: "hatsnail", tint: "#8a5a70",
    passives: [
      { name: "영악한 모자", on: "debuffed", do: { t: "debuff", id: "약화", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "모자챙으로 후린다", rush: 5 },
      { t: "debuff", id: "취약", v: 2, say: "음흉하게 웃는다", rush: 4 },
      { t: "charge", say: "모자 속 저주가 끓는다", next: { t: "attackAll", v: 12, say: "저주를 쏟는다" } },
      { t: "block", v: 12, say: "모자 깊이 숨는다", rush: 5 },
    ],
  },
  hatsnail_jolly: {
    // 활발 — 「처음 마녀 모자를 집으로 선택한 햇팽이의 머릿속은 밝은 미래에 대한 꿈으로 가득하다」
    // 공략: 통통 튕기기 · 떠들기가 ⚡3으로 잦다 — 카드를 흘리지 말고 34 체력을 관통 큰 한 장으로 먼저 (재촉꾼)
    ko: "햇팽이 · 꿈꾸는", hp: 34, row: "back", nature: "활발", art: "hatsnail", tint: "#c09060",
    pick: "shuffle",
    intents: [
      { t: "multi", v: 3, n: 3, say: "모자를 통통 튕긴다", w: 2, rush: 3 },
      { t: "jam", v: 1, say: "신나서 떠든다", rush: 3 },
      { t: "back", v: 9, say: "모자째 굴러든다", rush: 5 },
    ],
  },

  // ── 층 밖 — 지금 세 층 어디의 것도 아니어서 지도에 안 나온다. 검사 도구(tools/check-fx · check-passive …)가 싸움 예로 쓴다 ──
  gluttonbear: {
    // 원작 「머곰」 — 「엘리아스의 숲을 돌아다니다보면 만날 수 있는 듬직한 인상의 수인」. 수인 땅의 것이라 지도에서 뺐다
    // 공략: 웅크림 ⚡3 — 그 턴엔 적게 세게. 숨을 들이쉬면 끊어라. 동료가 쓰러지면 격노하니 곰을 먼저 (반격꾼 + 차지꾼)
    ko: "머곰", hp: 67, row: "front", nature: "광기", tint: "#b07f5a",
    passives: [
      { name: "격노", on: "allyDown", do: { t: "buff", id: "힘", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 16, say: "앞발을 든다", rush: 6 },
      { t: "block", v: 10, say: "몸을 웅크린다", rush: 3 },
      { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attack", v: 24, say: "덮친다" } },
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
  wisps: {
    // 원작 「위스프」 — 「순수한 에너지에 가까운 불 정령」. 정령산의 것이라 지도에서 뺐다
    // 공략: 흩어졌다 모이기·빛 흔들기 ⚡3 — 그 수 앞에선 카드를 아끼고, 30 체력이니 큰 한 장으로 (재촉꾼)
    ko: "위스프", hp: 30, row: "back", nature: "순수", tint: "#9aa8d9",
    pick: "shuffle",
    intents: [
      { t: "jam", v: 1, say: "흩어졌다 모인다", rush: 3 },
      { t: "back", v: 9, say: "스며든다", rush: 5 },
      { t: "debuff", id: "약화", v: 2, say: "빛이 흔들린다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "여럿으로 갈라진다", rush: 5 },
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
    // 냉정 기록이 바로 그 개체다 — 그림은 햇팽이 그대로(art) · 냉정 스킨, 크게(scale). 모자에 깃든 마녀가 떠도는 인형(누루링 인형 · 떠돌이)을 부린다.
    // 공략: 저주를 견디는 손 — 한 턴 세 장째 스킬마다 모자가 주문을 되받아 약화를 건다(스킬은 두 장까지), 절반에서 한 번 모자 속에 숨는다(방어).
    //       솥이 끓으면(⚡0) 다음 턴 파티 전체 — 끊어라. 주문 웅얼거림 ⚡3 앞에선 카드를 아껴라. 인형이 쓰러지면 실이 끊겨 힘이 붙으니
    //       인형(회복)을 먼저 잡되 그 턴엔 막을 준비를. 60% 아래 — 마녀의 의식이 깨어 번개(⚡0) · 저주 번짐, 25% 아래 — 모자만 남아 날뛰고 점액으로 메운다(⚡3)
    ko: "햇팽이 마녀", hp: 262, row: "front", boss: true, nature: "냉정", art: "hatsnail", tint: "#8a5aa8",
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
// 적은 **원작에서 그 땅에 사는 것만**(docs/11-적.md 의 근거 표 — 도감의 교주의 기록 · 메인 스토리 시즌 1 의 종족 차례):
//   에르피엔  요정 주민(저혈당 · 고혈당 요정) · 요정의 농기구(불효자손) · 요정 왕국 근처의 산사모 · 에슈르 빵집의 실패작(목매킴 · 부스러기) ·
//             멜로 셋 · 요정에게 사탕을 받은 루파루 · 누루링-요정 넷 · 요정 금고를 노린 새마음금고
//   모나티엄  엘프 돌격병 · 엘프 명사수(의장대 · 노동반 · 호위) · 드론 S형 · G형 · 누루링-엘프 넷 · 엘프 폐수를 먹은 한입초
//   벨리티엔  누루링-마녀 넷 · 마녀가 만든 인형 누루링 · 마녀 모자의 햇팽이
// 보스는 1층 커버러스, 2층 M.E.O.W(엘프 도시의 고양이 로봇) + 드론 둘, 3층 햇팽이 마녀 + 떠돌이 인형,
// 그리고 3층 너머 뿌리 깊은 곳의 우로스(엘리아스 프론티어 보스 — 판의 마지막, final).
//   pools[세기]  약(1-1~1-3) · 중(1-4~1-6) · 강(1-7~1-10) 싸움이 다섯 벌씩 — 지도의 칸마다 하나를 고른다
//   elites       엘리트 칸 전용 넷 — 그 층에서 가장 사나운 짝(머리는 도감의 광기 · 냉정 기록에서 온 엘리트 몸)
//   fights       옛 도구(tools/sim.js · 로비 미리보기)가 보는 대표 셋 — pools 의 첫 벌
const FLOOR_DEFS = [
  {
    n: 1, name: "에르피엔", sub: "요정 왕국 · 세계수 주변",
    pools: [
      [
        ["fairymobcloserange", "fairymoblongrange"],
        ["buseuleogi", "buseuleogi", "nururingarcher_fairy"],
        ["mogmaekim", "fairymoblongrange"],
        ["nururingwarrior_fairy", "nururingsupporter_fairy"],
        ["magicfork", "marshmallowdealer"],
      ],
      [
        ["fairymoblongrange", "ginseng", "fairymobcloserange"],
        ["marshmallowtanker", "marshmallowdealer", "marshmallowsupporter"],
        ["nururingtanker_fairy", "lupalu"],
        ["mogmaekim", "mogmaekim", "buseuleogi"],
        ["magicfork", "nururingarcher_fairy", "ginseng"],
      ],
      [
        ["nururingtanker_fairy", "nururingwarrior_fairy", "nururingsupporter_fairy"],
        ["marshmallowtanker", "magicfork", "ginseng"],
        ["fairymobcloserange", "mogmaekim", "lupalu"],
        ["buseuleogi", "buseuleogi", "nururingarcher_fairy", "marshmallowsupporter"],
        ["fairymobcloserange", "fairymobcloserange", "fairymoblongrange"],
      ],
    ],
    elites: [
      ["goldring", "buseuleogi", "fairymoblongrange"],
      ["magicfork_mad", "nururingsupporter_fairy", "marshmallowdealer"],
      ["marshmallowtanker", "ginseng_mad", "mogmaekim", "mogmaekim"],
      ["nururingtanker_fairy", "nururingwarrior_fairy", "nururingarcher_fairy", "nururingsupporter_fairy"],
    ],
    boss: ["curburus"],
  },
  {
    n: 2, name: "모나티엄", sub: "엘프 도시 · 동부",
    pools: [
      [
        ["elfsoldiercloserange", "elfsoldierlongrange"],
        ["droneg", "elfsoldierlongrange"],
        ["nururingwarrior", "nururingsupporter"],
        ["elfsoldiercloserange_worker", "drones_scrap"],
        ["nependers", "drones_scrap"],
      ],
      [
        ["elfsoldiercloserange_worker", "elfsoldierlongrange_escort"],
        ["nururingtanker", "nururingarcher"],
        ["droneg_repair", "drones"],
        ["elfsoldiercloserange_honor", "nururingarcher"],
        ["elfsoldiercloserange", "nependers", "drones_scrap"],
      ],
      [
        ["elfsoldiercloserange_worker", "drones", "elfsoldierlongrange_honor"],
        ["nururingtanker", "nururingwarrior", "nururingsupporter"],
        ["droneg", "droneg_repair", "elfsoldierlongrange_escort"],
        ["elfsoldiercloserange", "elfsoldiercloserange_honor", "elfsoldierlongrange", "drones_scrap"],
        ["nururingtanker", "nependers", "drones"],
      ],
    ],
    elites: [
      ["droneg_sentry", "drones", "elfsoldierlongrange_escort"],
      ["nururingtanker", "nururingwarrior", "nururingarcher", "nururingsupporter"],
      ["elfsoldiercloserange_honor", "elfsoldiercloserange", "elfsoldierlongrange_honor"],
      ["droneg_repair", "nependers", "drones_scrap", "drones_scrap"],
    ],
    boss: ["meow", "drones", "droneg"],
  },
  {
    n: 3, name: "벨리티엔", sub: "마녀 왕국 · 세계수 뿌리",
    pools: [
      [
        ["hatsnail", "hatsnail_jolly"],
        ["nururingwarrior_witch", "nururingarcher_witch"],
        ["hatsnail_mad", "hatsnail_jolly"],
        ["nururingwarrior_witch", "curseddoll_mad"],
      ],
      [
        ["nururingtanker_witch", "curseddoll_jolly"],
        ["hatsnail", "curseddoll_mad", "hatsnail_jolly"],
        ["curseddoll_naive", "curseddoll_mad"],
        ["nururingtanker_witch", "nururingsupporter_witch"],
        ["hatsnail_mad", "nururingarcher_witch", "hatsnail_jolly"],
      ],
      [
        ["curseddoll_naive", "curseddoll_jolly", "curseddoll_mad"],
        ["nururingtanker_witch", "nururingwarrior_witch", "nururingsupporter_witch"],
        ["hatsnail", "hatsnail_mad", "nururingarcher_witch"],
        ["nururingwarrior_witch", "hatsnail_jolly", "curseddoll_mad", "nururingarcher_witch"],
        ["curseddoll_naive", "hatsnail_mad", "nururingsupporter_witch"],
      ],
    ],
    elites: [
      ["nururingtanker_witch", "nururingarcher_witch", "curseddoll_mad"],
      ["curseddoll_naive", "curseddoll_jolly", "hatsnail_mad"],
      ["hatsnail", "hatsnail_mad", "nururingsupporter_witch", "hatsnail_jolly"],
      ["nururingwarrior_witch", "nururingsupporter_witch", "curseddoll_mad"],
    ],
    boss: ["hatsnailwitch", "curseddoll_jolly"],
    // 판의 마지막 — 3층 보스를 넘으면 상점 없이 캠프 한 번을 거쳐 뿌리 깊은 곳의 우로스와 싸운다(run.js isFinal · main.js finalCamp).
    // 우로스를 이겨야 판을 깬다
    final: { name: "세계수 뿌리 깊은 곳", sub: "벨리티엔 아래 · 판의 마지막", boss: ["e0_uros"] },
  },
];
export const FLOORS = FLOOR_DEFS.map((f) => ({ ...f, fights: f.pools.map((p) => p[0]) }));
