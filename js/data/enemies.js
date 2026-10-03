// 적. **이름과 종류는 게임에서 꺼낸 실제 몬스터**다 — assets/monster 에 231종이 있다.
// key 가 그 몬스터의 파일 이름이고, art.js 가 그 이름으로 그림을 찾는다.
// 수치만 우리 것이다(docs/01-규칙.md).
//
// 적도 성격을 가진다 — 게임 파일이 몬스터마다 naive/mad/cool/gloomy/jolly 다섯 벌을 들고 있다.
// nature 는 사도와 같은 성격 이름(순수·광기·냉정·우울·활발)을 쓴다 — 성격 상성용.
//
// 수(intents) — 매 턴 하나를 고르고, 적 머리 위에 미리 보여 준다.
//   attack v     앞줄부터 친다. id·n 이 있으면 맞은 사람에게 그 상태를 n 만큼 건다
//   back v       뒷줄부터 친다(id·n 같이)
//   attackAll v  파티 전체(id·n 이 있으면 맞은 사람마다)
//   multi v×n    앞줄부터 n 번 (한 번마다 새로 고른다 — 방어가 먼저 벗겨진다). id 가 있으면 한 대마다 그 상태 1(per 로 바꾼다)
//   charge       이번 턴엔 힘을 모으고 next 를 **다음 턴에 반드시** 한다. 미리 알려 주는 큰 수다.
//                기절·봉인으로 멈추게 하거나 수를 흐트러뜨리면 모은 힘이 흩어진다.
//                brk: true — 모으는 턴에 **격파하면** 흩어진다(깨는 손 · 딜러에게 주는 몫. 보스는 판마다 다르다)
//   block v      자기 방어 · guard v  적 전체 방어 · heal v  체력 비율이 가장 낮은 적을 회복
//                적이 얻는 방어도 강건(+20%) · 손상(-50%)을 받는다(combat.js foeBlock)
//   buff         자기에게 상태(사기 · 불굴 · 강건 · 취약 …) — all: true 면 적 전체(깃발). 세기 상태(사기 · 불굴 · 강건 …)는 줄지 않고 적 하나에 rules.js FOE_INT_MAX 겹까지
//   debuff       아군 전체에 상태 · jam  다음 턴 AP 를 깎는다
//   tough N      어느 수에나 붙인다 — 그 수와 함께 강인도를 N칸 되찾는다(guard · all 이면 적 전체). 격파된 동안은 안 찬다
//   적이 거는 고통은 층 피해 배율(dmgx)을 곱한다 — 방어를 뚫는 피해라 치는 수와 같은 눈금(combat.js foeStatus)
//   addCard      상태 카드(js/data/status-cards.js)를 n 장 끼워 넣는다 — to: draw(뽑을 더미에 섞는다) · discard(버린 더미) · hand(손).
//                이 전투에만 있다(판의 덱에는 안 들어간다, docs/16)
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
//       broken(이 적이 격파됨 — 「푹 꺼진다」 취약 따위, 깨는 손의 몫) · recover(격파에서 일어섬 — 다음 내 턴 시작, 「체면」 사기 따위)
//   do  수와 같은 모양 {t, v, …} 또는 thorns v(때린 사도에게) · selfHeal v
//   limit  턴당 몇 번(기본 1, 0 은 제한 없음). fightStart · lowHp 는 한 번
// weak [성격…]  약점 성격(강인도 · 격파, rules.js TOUGH) — 안 적으면 상성에서(그 성격을 이기는 성격). 성격 없는 적(누루링 · 원작 보스)은 적어 둔다
//   원작에서 이들은 모두 「성격없음」 이다(나무위키 「트릭컬 리바이브/몬스터」 누루링 시리즈 · 「트릭컬 리바이브/콘텐츠/엘리아스 프론티어」 —
//   프론티어 보스는 무속성. 사본 .omc/research/namu/_몬스터.txt · _트릭컬_리바이브_콘텐츠_엘리아스_프론티어.txt). 그래서 원작 설정에서 고른다(2026-10, docs/16):
//   누루링-요정  우울 — 교주의 기록 「단 것에 집착하고 … 힘자랑 … 찹찹 치대며 격려」: 당이 오른 들뜬 무리(활발 꼴, 이웃 고혈당 요정도 활발) → 활발을 이기는 우울
//   누루링-엘프  광기 — 「엘프 도시 근처 … 감시」: 엘프 돌격병-순수(원작 「징병제 군인」)와 같은 규율의 무리(순수 꼴) → 순수를 이기는 광기
//   누루링-마녀  순수 — 마녀의 땅을 다스리는 햇팽이 마녀가 냉정(마녀의 의식이 옮겨 간 몸) → 냉정을 이기는 순수
//   M.E.O.W     순수 — 엘레나(냉정)가 만든 기계. 차갑게 계산하는 몸(냉정 꼴) → 냉정을 이기는 순수
//   우로스      활발 — 우로스 문서의 친밀 대사 「슈로였을 때의 활발하고 개구쟁이 같던 성격이 가끔 튀어나온다」 · 슈로의 「침울한 톤」: 지금은 가라앉은 우울 꼴 → 우울을 이기는 활발
// tough N  강인도 칸 — 안 적으면 보통 3 · 엘리트 4 · 보스 5(rules.js TOUGH). 우로스만 6
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
//   가시(맞으면 되찌른다) · 재생(스스로 고친다) · 강화(사기가 붙는다) · 디버퍼(약화 · 취약) · 재촉꾼(⚡3 이 잦다) · 차지꾼(⚡0 큰 수)
//   반격꾼(당기면 · 몰아 치면 단단해진다) · 느긋이(⚡8 이상 — 몰아 써도 된다) · 격노(동료가 쓰러지면)
// 카제나 낱말(v5, docs/16):
//   굳히기(강인도를 되찾는다 · 불굴) · 깨면 끊긴다(brk 모으기) · 깨면 무른다(격파되면 취약) · 일어서면 성난다(recover 사기)
//   깃발(적 전체 사기 · 강건 · 불굴) · 고통(방어로 못 막는 피해) · 녹이기(손상 — 방어 · 실드 반) · 끼워 넣기(상태 카드)
//   당기면 손해(rushed — 신속 카드로 셈을 넘기면 피한다)
// 거북이(방어만 쌓는 손)는 고통 · 손상 · 상태 카드가, 딜러는 깨면 끊긴다 · 깨면 무른다가 반긴다 — 같은 층에 고루 섞었다

export const ENEMIES = {
  // ── 에르피엔 (요정 왕국) — 요정 주민 · 요정의 농기구 · 에슈르 빵집의 실패작 · 마시멜로 · 누루링-요정 ──────────
  // 1층은 새 체계를 하나씩 가르친다 — 상태 카드(어지럼 · 왁자지껄 · 설탕 범벅) · 사기 · 강인도 되찾기 · 격파하면 흩어지는 모으기
  fairymobcloserange: {
    // 원작 「저혈당 요정」 — 당분이 부족해져 눈이 돌아간 요정 왕국 주민(손에 든 것이 빵 · 거울)
    // 공략: 굼뜬 무리 — 수가 다 ⚡9 이상이라 몰아 써도 안 움직인다. 웅크리면(안 당겨짐) 강인도를 1칸 되찾으니 웅크리기 전에 몰아 깨라.
    //       비틀거리면 「어지럼」 이 뽑을 더미에 든다(뽑히면 AP -1) — 빨리 치울수록 덜 섞인다 (느긋이 · 끼워 넣기)
    ko: "저혈당 요정", hp: 41, row: "front", nature: "순수", tint: "#8ec98a",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 11, say: "달려든다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "우르르 몰려든다", rush: 10 },
      { t: "block", v: 8, tough: 1, say: "웅크린다", rush: 0 },
      { t: "addCard", id: "어지럼", n: 1, to: "draw", say: "당이 떨어져 비틀거린다", rush: 9 },   // 상태 카드 — 뽑히면 AP -1
    ],
  },
  fairymoblongrange: {
    // 원작 「고혈당 요정」 — 빵 대신 채소에 맛을 들인 요정 왕국 주민(손에 든 것이 푸성귀)
    // 공략: 떠들기 · 장난 · 수다가 ⚡3 — 그 수가 보이면 두 장까지. 당기면 수다가 번져 손에 「왁자지껄」 이 하나 더 끼니
    //       세 장째는 신속 카드로 셈을 넘기거나, 27 체력을 관통 큰 한 장으로 먼저 (재촉꾼 · 당기면 손해)
    ko: "고혈당 요정", hp: 27, row: "back", nature: "활발", tint: "#7b9c8a",
    pick: "shuffle",
    passives: [
      { name: "수다 전염", on: "rushed", do: { t: "addCard", id: "왁자지껄", n: 1, to: "hand" } },
    ],
    open: { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
    intents: [
      { t: "back", v: 7, say: "뒤로 파고든다", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "왁자지껄 떠든다", rush: 3 },
      { t: "debuff", id: "약화", v: 1, say: "장난을 친다", rush: 3 },
      { t: "addCard", id: "왁자지껄", n: 1, to: "hand", say: "수다를 퍼뜨린다", rush: 3 },   // 상태 카드 — 손 한 칸을 막고 턴 끝에 흩어진다
    ],
  },
  magicfork: {
    // 원작 「불효자손」 — 요정들의 마법 농기구(괭이). 갈 밭이 없으면 목적을 잃고 방황한다. 높은 공격력 · 낮은 HP
    // 공략: 28 체력 유리 대포 — 날을 세우면(⚡3) 사기 1, 남은 전투 내내 세진다(사기는 줄지 않는다). 녹슨 날로 긁으면 고통이 남으니(방어로 못 막는다) 날을 세운 턴에 쓰러뜨려라 (강화 · 고통)
    ko: "불효자손", hp: 28, row: "front", nature: "순수", tint: "#e0a0b0",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 10, say: "밭을 갈듯 내리찍는다", w: 2, rush: 6 },
      { t: "multi", v: 4, n: 2, id: "고통", say: "녹슨 날로 두 번 긁는다", rush: 5 },
      { t: "buff", id: "사기", v: 1, say: "날을 세운다", rush: 3 },
    ],
  },
  ginseng: {
    // 원작 「산사모」 — 세계수 근처에서 양분을 너무 먹어 움직이게 된 산삼. 주로 요정 왕국 근처, 쓴맛으로 몸을 지킨다
    // 공략: 즙 · 박힘이 ⚡3이라 두면 동료가 낫는다 — 먼저 뽑아라. 땅에 박히면 적 전체 방어에 강인도도 1칸씩 되찾으니 박히기 전에 깨라.
    //       절반에서 한 번 땅속으로 숨는다(방어 · 강인도 2) — 절반을 넘기는 턴엔 한 번에 몰아 뽑아라 (치유사 · 굳히기)
    ko: "산사모", hp: 30, row: "back", nature: "우울", tint: "#c0b07a",
    passives: [
      { name: "땅속으로", on: "lowHp", at: 0.5, do: { t: "block", v: 8, tough: 2 } },
    ],
    intents: [
      { t: "heal", v: 8, say: "뿌리에서 즙이 돈다", rush: 3 },
      { t: "guard", v: 6, tough: 1, say: "땅에 박힌다", rush: 3 },
      { t: "debuff", id: "약화", v: 2, say: "쓴 냄새", rush: 4 },
      { t: "back", v: 9, say: "뿌리를 뻗는다", rush: 6 },
    ],
  },
  mogmaekim: {
    // 원작 「목매킴」 — 에슈르(요정 왕국 빵집 겸 마법 학교)가 잘못 구운 빵. 원작 특징 「물량 · 자폭 주의」
    // 공략: 체력이 35% 아래로 떨어지면 부풀어 터져 파티 전체를 치고 뜨거운 반죽이 고통 2 로 남는다 — 30 체력을 한 번에 넘겨 쓰러뜨리면 안 터진다. 굳기 ⚡3 (폭탄)
    ko: "목매킴", hp: 30, row: "front", nature: "활발", tint: "#d8b070",
    pick: "shuffle",
    passives: [
      { name: "부풀어 터진다", on: "lowHp", at: 0.35, do: { t: "attackAll", v: 5, id: "고통", n: 2 } },
    ],
    intents: [
      { t: "attack", v: 8, say: "제작자를 원망하며 달려든다", w: 2, rush: 5 },
      { t: "debuff", id: "약화", v: 1, say: "밀가루가 휘날린다", rush: 4 },
      { t: "block", v: 6, say: "뻑뻑하게 굳는다", rush: 3 },
    ],
  },
  buseuleogi: {
    // 원작 「부스러기」 — 에슈르가 잘못 만든 컵케이크. 원작 특징 「물량 주의 · 낮은 HP」
    // 공략: 와작 ⚡3으로 작게 자주 문다 — 카드를 흘리지 말고 20 체력을 큰 한 장으로. 설탕 가루를 흩뿌리면 「설탕 범벅」(손에 든 채 넘기면 손상 2)이
    //       버린 더미에 든다 — 방어만 쌓는 손일수록 털어 내라. 하나가 쓰러지면 남은 것이 사기를 얻으니 둘을 같은 턴에 (재촉꾼 · 격노 · 끼워 넣기)
    ko: "부스러기", hp: 20, row: "front", nature: "광기", tint: "#c08a5a",
    pick: "shuffle",
    passives: [
      { name: "남은 부스러기", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 5, say: "와작 문다", w: 2, rush: 3 },
      { t: "multi", v: 2, n: 3, say: "부스러기가 튄다", rush: 5 },
      { t: "addCard", id: "설탕 범벅", n: 1, to: "discard", say: "설탕 가루를 흩뿌린다", rush: 4 },
      { t: "buff", id: "사기", v: 1, say: "설탕을 핥는다", rush: 6 },
    ],
  },
  marshmallowtanker: {
    // 원작 「탱탱 멜로」 — 마시멜로 골렘. 너무 많이 얻어맞으면 분노한다(그래도 마시멜로다)
    // 공략: 부풀기 · 줄 맞추기 ⚡3 — 부풀면 강인도를 1칸 되찾는다, 그 수 앞에선 한 턴에 몰아 깨라. 격파되면 푹 꺼져 취약 2 —
    //       깬 턴에 딜러로 몰아 쳐라. 절반에서 한 번 분노해 사기 1 (방패 · 깨면 무른다)
    ko: "탱탱 멜로", hp: 48, row: "front", nature: "순수", tint: "#f0e6d8",
    passives: [
      { name: "얻어맞아 분노", on: "lowHp", at: 0.5, do: { t: "buff", id: "사기", v: 1 } },
      { name: "푹 꺼진다", on: "broken", do: { t: "buff", id: "취약", v: 2 } },
    ],
    intents: [
      { t: "block", v: 10, tough: 1, say: "말랑하게 부푼다", rush: 3 },
      { t: "attack", v: 8, say: "몸으로 민다", rush: 5 },
      { t: "guard", v: 6, say: "줄을 맞춘다", rush: 3 },
      { t: "attack", v: 11, say: "통통 튀어 부딪힌다", rush: 7 },
    ],
  },
  marshmallowdealer: {
    // 원작 「말랑 멜로」 — 장난기 많은 마법사가 깨운 간식. 높은 공격력 · 낮은 HP
    // 공략: 꼬치는 ⚡9 이상이라 늦게 온다 — 마음껏 몰아 써라. 꼬치에 찔리면 고통 2(방어로 못 막는다), 절반에서 한 번 녹아내리며 찌르니 28 체력을 한 턴에 넘겨 버려라 (저격 · 느긋이 · 고통)
    ko: "말랑 멜로", hp: 28, row: "back", nature: "활발", tint: "#e8f0d8",
    pick: "shuffle",
    passives: [
      { name: "녹아내리며 찌른다", on: "lowHp", at: 0.5, do: { t: "back", v: 8 } },
    ],
    intents: [
      { t: "back", v: 7, id: "고통", n: 2, say: "꼬치를 찌른다", w: 2, rush: 9 },
      { t: "multi", v: 3, n: 3, say: "꼬치를 연달아 찌른다", rush: 10 },
      { t: "attack", v: 7, say: "앞으로 달려든다", rush: 9 },
    ],
  },
  marshmallowsupporter: {
    // 원작 「쫀득 멜로」 — 회복 주의. 다른 멜로와 달리 먹히길 바란다
    // 공략: 덧바르기 · 깃발 ⚡3 — 깃발을 흔들면 적 전체 사기 1, 먼저 잡아라. 들러붙으면 「설탕 범벅」 이 뽑을 더미에 든다.
    //       디버프가 걸리면 설탕을 덧발라 스스로 메우니 약화 · 취약 말고 공격으로 잡아라 (치유사 · 깃발)
    ko: "쫀득 멜로", hp: 26, row: "back", nature: "활발", tint: "#d8f0e0",
    pick: "shuffle",
    passives: [
      { name: "설탕 코팅", on: "debuffed", do: { t: "selfHeal", v: 5 } },
    ],
    intents: [
      { t: "heal", v: 6, say: "설탕을 덧바른다", rush: 3 },
      { t: "buff", id: "사기", v: 1, all: true, say: "꽃 깃발을 흔든다", rush: 3 },
      { t: "addCard", id: "설탕 범벅", n: 1, to: "draw", say: "쫀득하게 들러붙는다", rush: 4 },
      { t: "debuff", id: "약화", v: 1, say: "달콤한 냄새", rush: 5 },
    ],
  },
  lupalu: {
    // 원작 「루파루」-광기 — 물가의 정령. 요정들에게 받은 사탕을 음료에 섞어 당분 중독이 됐다
    // 공략: 디버프가 걸리면 사탕 음료를 들이켜 사기 1 — 약화로 묶지 말고 공격으로 잡아라. 병이 출렁이면(⚡3) 두 장까지 (강화 · 방해)
    ko: "루파루", hp: 34, row: "back", nature: "광기", tint: "#f0b0c0",
    passives: [
      { name: "당분 중독", on: "debuffed", do: { t: "buff", id: "사기", v: 1 } },
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
    // 공략: 맞을 때마다(턴 두 번) 방어 +3 — 작은 카드로 쪼개 치면 젤리만 두꺼워진다, 큰 카드로. 감싸기 ⚡3 는 적 전체 방어에 강인도 1칸씩 —
    //       그 전에 깨라. 고통에 둔감해지면 불굴 1 (방패 · 굳히기)
    ko: "누루링-요정 탱커", hp: 50, row: "front", art: "nururingtanker", skin: "Skin_Fairy", weak: ["우울"], tint: "#f0c890",
    passives: [
      { name: "통통한 젤리", on: "hurt", limit: 2, do: { t: "block", v: 3 } },
    ],
    intents: [
      { t: "guard", v: 6, tough: 1, say: "젤리로 감싼다", rush: 3 },
      { t: "attack", v: 9, say: "통통 부딪힌다", rush: 5 },
      { t: "buff", id: "불굴", v: 1, say: "고통에 둔감해진다", rush: 4 },
      { t: "attack", v: 12, say: "깔고 앉는다", rush: 6 },
    ],
  },
  nururingwarrior_fairy: {
    // 「젤리 살이 아니라 근육이라 주장하며 힘자랑을 한다」
    // 공략: 힘자랑 ⚡3 — 사기 1 이 붙는다(줄지 않는다), 그 턴엔 두 장까지. 팔을 걷으면(⚡0) 다음 턴 16 — 그 턴에 격파하면 힘이 흩어진다(기절 · 봉인도) (강화 · 깨면 끊긴다)
    ko: "누루링-요정 전사", hp: 36, row: "front", art: "nururingwarrior", skin: "Skin_Fairy", weak: ["우울"], tint: "#f0b878",
    pick: "shuffle",
    intents: [
      { t: "attack", v: 9, say: "젤리 주먹", w: 2, rush: 5 },
      { t: "buff", id: "사기", v: 1, say: "근육이라고 우긴다", rush: 3 },
      { t: "charge", brk: true, say: "팔을 걷어붙인다", next: { t: "attack", v: 16, say: "힘자랑 한 방" } },
    ],
  },
  nururingarcher_fairy: {
    // 원작 「누루링-요정 마법사」(파일은 archer) — 「마력이 깃든 빵을 먹은 듯하다」
    // 공략: 약화 · 취약을 번갈아 걸고, 마력 빵에 맞으면 고통 2 — 빵 마법(⚡3)이 보이면 두 장까지, 28 체력이니 관통으로 먼저 (디버퍼)
    ko: "누루링-요정 마법사", hp: 28, row: "back", art: "nururingarcher", skin: "Skin_Fairy", weak: ["우울"], tint: "#e8b0a0",
    pick: "shuffle",
    intents: [
      { t: "debuff", id: "약화", v: 1, say: "빵 부스러기 마법", rush: 3 },
      { t: "back", v: 8, id: "고통", n: 2, say: "마력 빵을 던진다", w: 2, rush: 5 },
      { t: "debuff", id: "취약", v: 1, say: "달콤한 주문", rush: 4 },
    ],
  },
  nururingsupporter_fairy: {
    // 「다른 누루링들의 젤리층을 찹찹 치대며 격려해준다」
    // 공략: 치대기 · 격려 ⚡3 — 격려하면 적 전체 사기 1, 두면 동료를 메운다, 먼저 잡아라. 톡 치기는 ⚡5라 잡는 동안은 몰아 써도 된다 (치유사 · 깃발)
    ko: "누루링-요정 서포터", hp: 30, row: "back", art: "nururingsupporter", skin: "Skin_Fairy", weak: ["우울"], tint: "#f0d0a0",
    pick: "shuffle",
    intents: [
      { t: "heal", v: 7, say: "젤리층을 찹찹 치댄다", rush: 3 },
      { t: "buff", id: "사기", v: 1, all: true, say: "찹찹 격려한다", rush: 3 },
      { t: "back", v: 5, say: "톡 친다", w: 2, rush: 5 },
    ],
  },
  // 1층 엘리트의 머리 — 도감의 광기 기록에서
  goldring: {
    // 원작 「새마음금고」 — 요정 왕국의 금고를 노리고 들어온 슬라임(나무위키 몬스터 문서). 1층 엘리트
    // 공략: 금화 ⚡3 — 카드를 아껴라. 한 턴 세 장째가 공격이면 뚜껑을 닫으니 세 번째는 공격 말고. 뚜껑을 닫는 수(⚡6)는 강인도 2칸을 되찾는다.
    //       격파되면 뚜껑이 열려 취약 2 — 그 턴에 몰아 쳐라. 삐걱이면 입을 벌릴 때(⚡0) 격파 · 기절로 끊어라 (재촉꾼 · 깨면 무른다)
    ko: "새마음금고", hp: 70, row: "front", nature: "활발", tint: "#d8c060",
    passives: [
      { name: "뚜껑 닫기", on: "card", type: "공격", every: 3, do: { t: "block", v: 6 } },
      { name: "뚜껑이 열린다", on: "broken", do: { t: "buff", id: "취약", v: 2 } },
    ],
    intents: [
      { t: "block", v: 12, tough: 2, say: "뚜껑을 닫는다", rush: 6 },
      { t: "attack", v: 14, say: "와락 문다", rush: 6 },
      { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
      { t: "buff", id: "사기", v: 1, say: "보석을 삼킨다", rush: 5 },
    ],
    phase: {
      at: 0.5, say: "뚜껑이 삐걱거린다",
      intents: [
        { t: "charge", brk: true, say: "크게 입을 벌린다", next: { t: "attack", v: 24, say: "통째로 삼킨다" } },
        { t: "multi", v: 4, n: 3, say: "금화를 뱉는다", rush: 3 },
        { t: "attack", v: 14, say: "와락 문다", rush: 6 },
      ],
    },
  },
  magicfork_mad: {
    // 원작 「불효자손」-광기 — 「더 이상 갈아버릴 밭이 없는 상태로 너무 오랫동안 방황하면, 근처의 무엇이든 갈아버리려고 한다」. 1층 엘리트
    // 공략: 맞을 때마다(턴 한 번) 사기 +1 — 오래 끌수록 세진다, 몰아 쳐 빨리. 마구 긁으면 한 대마다 고통.
    //       자루를 높이 들면(⚡0) 다음 턴 파티 전체 — 그 턴에 격파하면 흩어진다. 날 갈기 ⚡3 (강화 · 고통 · 깨면 끊긴다)
    ko: "불효자손 · 폭주", hp: 56, row: "front", nature: "광기", art: "magicfork", tint: "#c87090",
    passives: [
      { name: "무엇이든 간다", on: "hurt", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "갈아엎는다", rush: 6 },
      { t: "multi", v: 4, n: 3, id: "고통", say: "마구 긁는다", rush: 6 },
      { t: "charge", brk: true, say: "자루를 높이 든다", next: { t: "attackAll", v: 11, say: "밭째 갈아엎는다" } },
      { t: "buff", id: "사기", v: 1, say: "날을 간다", rush: 3 },
    ],
  },
  ginseng_mad: {
    // 원작 「산사모」-광기 — 「너무 오랫동안 성장하면 불안정한 상태에 도달한다. 영양분의 과잉으로 제정신이 아니다」. 1층 엘리트
    // 공략: 턴마다 넘치는 양분이 다친 동료를 메우고, 쓴 즙이 번지면 파티 전체 고통 2(방어로 못 막는다). 40% 아래로 떨어지면 양분이 터진다(파티 전체 8 · 고통 2) —
    //       먼저 잡되 40% 를 한 번에 넘겨라. 뿌리를 얽으면 적 전체 강인도 1칸씩 (치유사 · 폭탄 · 고통)
    ko: "산사모 · 웃자람", hp: 44, row: "back", nature: "광기", art: "ginseng", tint: "#b0a050",
    passives: [
      { name: "넘치는 양분", on: "turnStart", do: { t: "heal", v: 4 } },
      { name: "양분이 터진다", on: "lowHp", at: 0.4, do: { t: "attackAll", v: 8, id: "고통", n: 2 } },
    ],
    intents: [
      { t: "heal", v: 10, say: "양분을 뿜는다", rush: 3 },
      { t: "guard", v: 7, tough: 1, say: "뿌리를 얽는다", rush: 3 },
      { t: "back", v: 10, say: "쓴 즙을 뿌린다", rush: 6 },
      { t: "debuff", id: "고통", v: 2, say: "쓴맛이 번진다", rush: 4 },
    ],
  },

  // ── 모나티엄 (엘프 도시) — 엘프 군인 · 엘프 드론 · 누루링-엘프 · 폐수 먹은 한입초 ───────────────────
  // 2층은 군대다 — 대열(강건 · 불굴 · 사기)로 서로를 북돋고, 드론이 「통제 신호」 를 끼워 넣고, 기름 · 공구가 방어를 녹인다(손상)
  elfsoldiercloserange: {
    // 원작 「엘프 돌격병」-순수 — 「엘프 도시 모나티엄의 기반을 담당하는 군인. 징병제 시스템 때문인지 엘프들은 대부분이 군인이다」
    // 공략: 대열 좁히기 ⚡3 — 적 전체 방어에 강인도 1칸씩, 그 턴엔 적게 세게. 창끝에 찔리면 취약.
    //       전우가 쓰러지면 사기가 붙으니 병사부터, 아니면 같은 턴에 같이 쓰러뜨려라 (굳히기 · 격노)
    ko: "엘프 돌격병", hp: 51, row: "front", nature: "순수", tint: "#6fa2c0",
    pick: "shuffle",
    passives: [
      { name: "전우의 복수", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "대열을 맞춘다", w: 2, rush: 6 },
      { t: "attack", v: 8, id: "취약", n: 1, say: "창끝으로 찌른다", rush: 5 },
      { t: "guard", v: 8, tough: 1, say: "대열을 좁힌다", rush: 3 },
      { t: "jam", v: 1, say: "창끝을 겨눈다", rush: 4 },
    ],
  },
  elfsoldiercloserange_worker: {
    // 원작 「엘프 돌격병」-냉정 — 「통칭 '노동반'. 엘프들의 공병이다. 제일 힘들다. 귀찮게 하지 말자」
    // 공략: 당기면 귀찮아서 바리케이드(적 전체 방어 +6) — 이 녀석 앞에선 신속 카드로 셈을 넘겨라. 보강 자재를 나눠 주면 적 전체 강건 1(방어 수 +20%),
    //       공구에 맞으면 손상(방어 · 실드 반) — 방어만 쌓는 손은 공구를 맞기 전에 쌓아 둬라. 바리케이드 ⚡3 (방패 · 당기면 손해 · 녹이기)
    ko: "엘프 돌격병 · 노동반", hp: 58, row: "front", nature: "냉정", art: "elfsoldiercloserange", tint: "#5f8fa8",
    passives: [
      { name: "귀찮게 하지 마", on: "rushed", do: { t: "guard", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, say: "바리케이드를 세운다", rush: 3 },
      { t: "attack", v: 11, id: "손상", n: 1, say: "공구로 내려친다", rush: 5 },
      { t: "buff", id: "강건", v: 1, all: true, say: "보강 자재를 나눠 준다", rush: 4 },
      { t: "attack", v: 14, say: "삽으로 퍼붓는다", rush: 6 },
    ],
  },
  elfsoldiercloserange_honor: {
    // 원작 「엘프 돌격병」-우울 — 「엘프 군인들 중 의장대에 속하는 자들이다. 엘프 군인들의 이미지를 담당한다」
    // 공략: 디버프를 걸면 자존심이 상해 사기 +1 — 디버프 덱은 피하고 공격으로. 자세 가다듬기 ⚡3 는 강인도 2칸을 되찾는다.
    //       검을 세우면(⚡0) 다음 턴 22 — 그 턴에 격파하면 흩어진다. 다만 격파에서 일어서면 체면을 세우려 사기 1 — 깬 턴에 끝장내라 (차지꾼 · 일어서면 성난다)
    ko: "엘프 돌격병 · 의장대", hp: 50, row: "front", nature: "우울", art: "elfsoldiercloserange", tint: "#7f98c8",
    passives: [
      { name: "의장대의 자존심", on: "debuffed", do: { t: "buff", id: "사기", v: 1 } },
      { name: "의장대의 체면", on: "recover", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "의장검을 휘두른다", rush: 6 },
      { t: "block", v: 10, tough: 2, say: "자세를 가다듬는다", rush: 3 },
      { t: "charge", brk: true, say: "의장검을 높이 세운다", next: { t: "attack", v: 22, say: "예식처럼 내리친다" } },
      { t: "debuff", id: "취약", v: 1, say: "날 선 눈빛", rush: 4 },
    ],
  },
  elfsoldierlongrange: {
    // 원작 「엘프 명사수」-순수 — 「모나티엄 적성 검별 시스템에서 원거리 병과로 선택받은 군인. 온 몸을 감싸는 답답한 장비 때문에 더위를 자주 먹는다」
    // 공략: 시위를 천천히 당긴다 — 수가 다 ⚡8 이상이라 몰아 써도 된다. 표식 화살에 맞은 사도는 취약 2 — 그 사이 관통으로 먼저 잡거나 뒷줄을 막아라 (저격 · 느긋이)
    ko: "엘프 명사수", hp: 38, row: "back", nature: "순수", tint: "#7fa8c8",
    pick: "shuffle",
    intents: [
      { t: "back", v: 11, say: "뒷줄을 겨눈다", w: 2, rush: 9 },
      { t: "multi", v: 4, n: 3, say: "화살을 잇달아 쏜다", rush: 10 },
      { t: "back", v: 6, id: "취약", n: 2, say: "표식 화살을 쏜다", rush: 8 },
    ],
  },
  elfsoldierlongrange_escort: {
    // 원작 「엘프 명사수」-광기 — 「모나티엄 외부의 유지 보수 작업에 나갈 시 동료들을 호위한다」
    // 공략: 막아서기 ⚡3 — 적 전체 불굴 1(받는 피해 -20%, 줄지 않는다). 쌓이기 전에 먼저 잡아라.
    //       동료가 쓰러지면 뒷줄을 쏜다(7) — 이 녀석부터 잡거나 마지막 둘을 같은 턴에 (저격 · 엄호)
    ko: "엘프 명사수 · 호위", hp: 36, row: "back", nature: "광기", art: "elfsoldierlongrange", tint: "#6f98b8",
    pick: "shuffle",
    passives: [
      { name: "호위 사격", on: "allyDown", do: { t: "back", v: 7 } },
    ],
    intents: [
      { t: "back", v: 10, say: "엄호 사격", w: 2, rush: 6 },
      { t: "buff", id: "불굴", v: 1, all: true, say: "동료 앞을 막아선다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "견제 사격", rush: 5 },
    ],
  },
  elfsoldierlongrange_honor: {
    // 원작 「엘프 명사수」-우울 — 「의장대에 소속이라 그런지 자존심이 매우 강하다」
    // 공략: 총을 겨누면(⚡0) 다음 턴 뒷줄에 22 — 그 턴에 격파하거나 봉인 · 기절로 끊어라. 관통으로 먼저 잡아도 된다.
    //       고개를 쳐들면 자신에게 불굴 1 — 줄지 않으니 쳐들기 전에 몰아 쳐라. 나머지는 ⚡6~8 이라 느긋하다 (저격 · 깨면 끊긴다)
    ko: "엘프 명사수 · 의장대", hp: 34, row: "back", nature: "우울", art: "elfsoldierlongrange", tint: "#8fa0c8",
    intents: [
      { t: "charge", brk: true, say: "의장 총을 겨눈다", next: { t: "back", v: 22, say: "한 치 어긋남 없이 쏜다" } },
      { t: "back", v: 9, say: "예포를 쏜다", rush: 8 },
      { t: "buff", id: "불굴", v: 1, say: "고개를 쳐든다", rush: 6 },
    ],
  },
  drones: {
    // 원작 「드론 S형」-냉정 — 엘프들의 비행형 드론. 「잘못 기입된 명령어 한 줄로 인해 생명체에 대한 공격성이 지대하게 늘어난 모델」
    // 공략: 경보 ⚡3 — 경보가 보이면 두 장까지, 나머지 수는 ⚡5~6. 장갑을 펴면 강인도 1칸을 되찾는다.
    //       절반에서 한 번 비상 경보(AP)를 울리니 절반을 넘기는 턴엔 끝까지 부숴라 (재촉꾼 · 방해)
    ko: "드론 S형", hp: 51, row: "back", nature: "냉정", tint: "#7fb6d9",
    passives: [
      { name: "비상 경보", on: "lowHp", at: 0.5, do: { t: "jam", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 6, say: "전방위 사격", rush: 6 },
      { t: "jam", v: 1, say: "경보음", rush: 3 },
      { t: "block", v: 12, tough: 1, say: "장갑 전개", rush: 5 },
      { t: "multi", v: 3, n: 3, say: "조준 연사", rush: 5 },
    ],
  },
  drones_scrap: {
    // 원작 「드론 S형」-광기 — 「기술 발달 속도를 따라잡지 못하고 폐기된 드론 모델이며, 옛 부품들을 쓰기 때문에 수리가 불가능하다」
    // 공략: 40% 아래로 떨어지면 과열해 터진다(파티 전체 7 · 고통 2) — 30 체력을 한 번에 넘겨라. 부품에 맞으면 고통. 잡음 ⚡3 (폭탄 · 고통)
    ko: "드론 S형 · 폐기형", hp: 30, row: "back", nature: "광기", art: "drones", tint: "#a89a7f",
    pick: "shuffle",
    passives: [
      { name: "과열 폭발", on: "lowHp", at: 0.4, do: { t: "attackAll", v: 7, id: "고통", n: 2 } },
    ],
    intents: [
      { t: "multi", v: 3, n: 3, say: "고장 난 연사", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "잡음을 낸다", rush: 3 },
      { t: "back", v: 9, id: "고통", n: 2, say: "달군 부품을 쏘아 낸다", rush: 5 },
    ],
  },
  droneg: {
    // 원작 「드론 G형」-순수 — 「시민들의 안전과 통제를 담당하는 보행형 드론. 때에 따라서 다수의 개체가 모여 방어벽을 형성하기도 한다」
    // 공략: 방어벽 ⚡3 — 적 전체 방어에 강인도 1칸씩, 큰 카드 한두 장으로 벗겨라. 통제 신호를 보내면 「통제 신호」 가 뽑을 더미에 든다(뽑히면 아군 전원 취약 1 · 손 한 칸).
    //       동료가 쓰러지면 남은 것을 감싸니(적 전체 방어 +6) 그 턴엔 남은 카드로 벗길 각오를 (방패 · 끼워 넣기)
    ko: "드론 G형", hp: 58, row: "front", nature: "순수", tint: "#8a9aa8",
    passives: [
      { name: "방어벽", on: "allyDown", do: { t: "guard", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, tough: 1, say: "방어벽을 세운다", rush: 3 },
      { t: "attack", v: 12, say: "다리로 걷어찬다", rush: 5 },
      { t: "addCard", id: "통제 신호", n: 1, to: "draw", say: "통제 신호를 보낸다", rush: 4 },
      { t: "attack", v: 14, say: "돌진한다", rush: 6 },
    ],
  },
  droneg_repair: {
    // 원작 「드론 G형」-광기 — 「자신이 미래에서 넘어왔다고 생각하는 이상한 오류가 생긴 드론들. 자가 수리가 된다며 수리를 거부한다」
    // 공략: 턴 끝마다 5씩 스스로 고친다 — 나눠 치면 손해, 한두 턴에 몰아 부숴라. 장갑 ⚡3 은 강인도 1칸. 격파되면 수리 회로가 멎어 취약 2 —
    //       깬 턴이 몰아 칠 때다 (재생 · 깨면 무른다)
    ko: "드론 G형 · 자가 수리", hp: 54, row: "front", nature: "광기", art: "droneg", tint: "#9a8a98",
    passives: [
      { name: "자가 수리", on: "turnEnd", do: { t: "selfHeal", v: 5 } },
      { name: "회로 정지", on: "broken", do: { t: "buff", id: "취약", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 11, say: "걷어찬다", rush: 5 },
      { t: "block", v: 10, tough: 1, say: "장갑을 덧댄다", rush: 3 },
      { t: "multi", v: 5, n: 2, say: "두 번 짓밟는다", rush: 6 },
    ],
  },
  // 누루링-엘프 — 「엘프 도시 근처에서 그 영향을 크게 받아 다른 누루링들과 사이가 안 좋다. 기름이 발라져 있어 고소하다」. Skin_Elf
  nururingtanker: {
    // 공략: 방패 · 굳기 ⚡3 — 강인도 1칸씩 되찾는다, 한 턴에 몰아 깨라. 방패로 내려찍으면 손상(방어 · 실드 반).
    //       디버프가 걸리면 주워 온 장비로 막으니 약화 · 취약은 아끼고 공격으로 벗겨라 (방패 · 굳히기 · 녹이기)
    ko: "누루링-엘프 탱커", hp: 64, row: "front", skin: "Skin_Elf", weak: ["광기"], tint: "#c8b878",
    passives: [
      { name: "주워 온 장비", on: "debuffed", do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "guard", v: 8, tough: 1, say: "주워 온 방패를 세운다", rush: 3 },
      { t: "attack", v: 10, say: "몸으로 밀어낸다", rush: 5 },
      { t: "block", v: 12, tough: 1, say: "기름 바른 몸을 굳힌다", rush: 3 },
      { t: "attack", v: 13, id: "손상", n: 1, say: "방패로 내려찍는다", rush: 6 },
    ],
  },
  nururingwarrior: {
    // 공략: 창을 젖히면(⚡0) 다음 턴 큰 한 방 — 그 턴에 격파하면 흩어진다. 두 장째 · 네 장째로 스킬을 내면 감시하던 눈이 찌르니 스킬은 첫 장 · 셋째 장에 (깨면 끊긴다)
    ko: "누루링-엘프 전사", hp: 44, row: "front", skin: "Skin_Elf", weak: ["광기"], tint: "#d0a868",
    pick: "shuffle",
    passives: [
      { name: "감시하는 눈", on: "card", type: "스킬", every: 2, do: { t: "attack", v: 5 } },
    ],
    intents: [
      { t: "attack", v: 11, say: "기름칠한 창으로 찌른다", w: 2, rush: 6 },
      { t: "multi", v: 5, n: 2, say: "두 번 찌른다", rush: 5 },
      { t: "charge", brk: true, say: "창을 크게 젖힌다", next: { t: "attack", v: 20, say: "온몸으로 꿰뚫는다" } },
    ],
  },
  nururingarcher: {
    // 원작 이름은 「누루링-엘프 마법사」 — 그런데 쓰는 것이 마법이 아닌 것 같다(나무위키). 파일 이름은 archer
    // 공략: 웅얼거림 · 기름 연기 ⚡3 — 기름 연기는 아군 전원 손상 1(방어 · 실드 반), 기름방울은 한 방울마다 고통. 그 수 앞에선 카드를 아끼고
    //       32 체력을 관통 큰 한 장으로. 쏘기 · 튀기기는 ⚡5 (재촉꾼 · 녹이기)
    ko: "누루링-엘프 마법사", hp: 32, row: "back", skin: "Skin_Elf", weak: ["광기"], tint: "#b8a070",
    pick: "shuffle",
    intents: [
      { t: "back", v: 10, say: "마법 같은 것을 쏜다", w: 2, rush: 5 },
      { t: "jam", v: 1, say: "주문 비슷한 것을 웅얼거린다", rush: 3 },
      { t: "debuff", id: "손상", v: 1, say: "기름 연기를 피운다", rush: 3 },
      { t: "multi", v: 3, n: 3, id: "고통", say: "뜨거운 기름방울을 튀긴다", rush: 5 },
    ],
  },
  nururingsupporter: {
    // 공략: 기름 덧바르기 · 연설 ⚡3 — 연설하면 적 전체 사기 1, 두면 동료를 메운다, 먼저 잡아라. 깃대 찌르기는 ⚡5 라 잡는 동안은 몰아 써도 된다.
    //       다른 누루링과 사이가 나빠 동료가 쓰러지면 오히려 신이 나 사기가 붙는다 — 이 녀석부터 (치유사 · 깃발 · 격노)
    ko: "누루링-엘프 서포터", hp: 34, row: "back", skin: "Skin_Elf", weak: ["광기"], tint: "#c0b080",
    pick: "shuffle",
    passives: [
      { name: "사이 나쁜 동료", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "heal", v: 9, say: "기름을 덧발라 준다", rush: 3 },
      { t: "buff", id: "사기", v: 1, all: true, say: "누루링 말로 연설한다", rush: 3 },
      { t: "back", v: 7, say: "깃대로 콕 찌른다", w: 2, rush: 5 },
    ],
  },
  nependers: {
    // 원작 「한입초」-냉정 — 「엘프들이 흘린 폐수를 빨아들이고 어딘가 많이 뒤틀린 한입초」. 원작 특징 「삼키기 주의」 —
    // 가까이 있는 하나를 삼켜 크게 다치게 하고 뱉는다
    // 공략: 입을 벌리면(⚡0) 다음 턴 앞줄 하나를 삼켜 22 — 그 턴에 격파하거나 막아라. 폐수를 뱉으면 「폐수 얼룩」(손에 든 채 넘기면 아군 전원 고통 4)이
    //       뽑을 더미에 든다 — AP 1 로 닦아라. 당겨질 때마다 꿀꺽 회복하니 신속 카드로 셈을 넘겨라 (깨면 끊긴다 · 끼워 넣기 · 당기면 손해)
    ko: "한입초", hp: 50, row: "back", nature: "냉정", tint: "#7a9a60",
    passives: [
      { name: "꿀꺽", on: "rushed", do: { t: "selfHeal", v: 6 } },
    ],
    intents: [
      { t: "back", v: 12, say: "덥석 문다", rush: 6 },
      { t: "block", v: 10, say: "잎을 닫는다", rush: 3 },
      { t: "charge", brk: true, say: "입을 크게 벌린다", next: { t: "attack", v: 22, say: "삼켰다가 뱉는다" } },
      { t: "addCard", id: "폐수 얼룩", n: 1, to: "draw", say: "폐수를 뱉어 낸다", rush: 4 },
    ],
  },
  droneg_sentry: {
    // 원작 「드론 G형」-냉정 — 「관리가 중요한 시설에 항상 상주하여 주변을 지키는 모델이다」. 2층 엘리트
    // 공략: 첫 턴부터 방어벽(적 전체 10) — 동료를 먼저 잡으면 벽이 더 두꺼워진다(+8), 경비부터 부수거나 같은 턴에. 방어벽을 겹치면 강인도 1칸씩.
    //       출입을 통제하면 「통제 신호」 둘이 뽑을 더미에 든다. 경보(⚡0)는 기절 · 봉인으로 끊어라 — 격파로는 안 끊긴다 (방패 · 차지꾼 · 끼워 넣기)
    ko: "드론 G형 · 시설 경비", hp: 78, row: "front", nature: "냉정", art: "droneg", tint: "#6a7a90",
    passives: [
      { name: "상주 경비", on: "fightStart", do: { t: "guard", v: 10 } },
      { name: "방어벽", on: "allyDown", do: { t: "guard", v: 8 } },
    ],
    intents: [
      { t: "guard", v: 10, tough: 1, say: "방어벽을 겹친다", rush: 3 },
      { t: "attack", v: 15, say: "진압봉을 내리친다", rush: 6 },
      { t: "charge", say: "경보를 울린다", next: { t: "attackAll", v: 13, say: "진압 사격" } },
      { t: "addCard", id: "통제 신호", n: 2, to: "draw", say: "출입을 통제한다", rush: 4 },
    ],
  },

  // ── 벨리티엔 (마녀 왕국 · 세계수 뿌리) — 누루링-마녀 · 마녀가 만든 인형 「누루링」 · 마녀 모자의 햇팽이 ───────
  // 3층은 저주다 — 고통 · 손상 · 약화가 방어를 우회하고, 실 · 가루 · 점액 · 쪽지가 손을 괴롭히고, 깬 뒤 일어서면 성난다
  // 누루링-마녀 — 「마녀 왕국 근처에서 그 영향을 크게 받아 음험하며, 건강한 맛이 난다」. Skin_Witch
  nururingtanker_witch: {
    // 「간사한 말로 주변을 도발한다」
    // 공략: 당기면 간사한 말로 파티 전체 취약 — 신속 카드로 셈을 넘기고 적게 세게. 꼬드기기 ⚡3 는 적 전체 방어에 강인도 1칸씩, 약 올리기 ⚡3 (방패 · 당기면 손해)
    ko: "누루링-마녀 탱커", hp: 70, row: "front", art: "nururingtanker", skin: "Skin_Witch", weak: ["순수"], tint: "#a080b0",
    passives: [
      { name: "간사한 말", on: "rushed", do: { t: "debuff", id: "취약", v: 1 } },
    ],
    intents: [
      { t: "guard", v: 10, tough: 1, say: "간사하게 꼬드긴다", rush: 3 },
      { t: "block", v: 14, say: "약초 젤리를 굳힌다", rush: 4 },
      { t: "attack", v: 12, say: "몸으로 누른다", rush: 5 },
      { t: "debuff", id: "약화", v: 1, say: "약을 올린다", rush: 3 },
    ],
  },
  nururingwarrior_witch: {
    // 「의외로 힘이 강한 것 같다」
    // 공략: 젤리 근육을 부풀리면(⚡0) 다음 턴 26 — 그 턴에 격파하거나 기절 · 봉인으로 끊어라. 다만 격파에서 일어서면 약이 올라 사기 1 —
    //       깨는 턴에 끝까지 밀든지, 큰 수 앞에서만 깨라. 약초 씹기 ⚡3 (강화 · 깨면 끊긴다 · 일어서면 성난다)
    ko: "누루링-마녀 전사", hp: 50, row: "front", art: "nururingwarrior", skin: "Skin_Witch", weak: ["순수"], tint: "#9070a0",
    pick: "shuffle",
    passives: [
      { name: "약이 오른다", on: "recover", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 13, say: "의외로 센 주먹", w: 2, rush: 6 },
      { t: "charge", brk: true, say: "젤리 근육을 부풀린다", next: { t: "attack", v: 26, say: "내리꽂는다" } },
      { t: "buff", id: "사기", v: 1, say: "약초를 씹는다", rush: 3 },
    ],
  },
  nururingarcher_witch: {
    // 원작 「누루링-마녀 마법사」 — 「재채기를 하려고 노력한다」
    // 공략: 재채기를 참으면(⚡3) 「약초 가루」 가 뽑을 더미에 든다(뽑히면 아군 전원 약화 1 · 손 한 칸). 코끝이 간질거리면(⚡0)
    //       다음 턴 재채기 마법이 파티 전체에 12 · 약화 1 — 그 턴에 격파하거나 관통으로 먼저 잡아라 (깨면 끊긴다 · 끼워 넣기)
    ko: "누루링-마녀 마법사", hp: 40, row: "back", art: "nururingarcher", skin: "Skin_Witch", weak: ["순수"], tint: "#b090c0",
    intents: [
      { t: "back", v: 12, say: "주문을 쏜다", rush: 6 },
      { t: "addCard", id: "약초 가루", n: 1, to: "draw", say: "재채기를 참는다", rush: 3 },
      { t: "charge", brk: true, say: "코끝이 간질간질하다", next: { t: "attackAll", v: 12, id: "약화", n: 1, say: "에취! 마법이 터진다" } },
    ],
  },
  nururingsupporter_witch: {
    // 「다른 누루링들을 가르친다」
    // 공략: 약초 바르기 · 훈계 ⚡3 — 훈계하면 적 전체 방어에 강인도 1칸씩, 두면 동료를 메우고 굳힌다, 먼저 잡아라.
    //       동료를 먼저 잡으면 남은 것을 감싼다(적 전체 방어 +8) (치유사 · 굳히기)
    ko: "누루링-마녀 서포터", hp: 42, row: "back", art: "nururingsupporter", skin: "Skin_Witch", weak: ["순수"], tint: "#c0a0c8",
    pick: "shuffle",
    passives: [
      { name: "가르치는 누루링", on: "allyDown", do: { t: "guard", v: 8 } },
    ],
    intents: [
      { t: "heal", v: 11, say: "약초 젤리를 발라 준다", rush: 3 },
      { t: "guard", v: 7, tough: 1, say: "훈계한다", rush: 3 },
      { t: "back", v: 9, say: "회초리를 휘두른다", w: 2, rush: 6 },
    ],
  },
  // 원작 「누루링」(인형) — 「마녀들의 뒤틀린 마법으로 생겨난 소름끼치는 인형 괴물」. 누루링 버스터의 누루링을 본떠 마녀가 만들어 팔다 유행이
  // 지나 버려진 인형이다(세계수 수액인 누루링 시리즈와 다른 것). 스파인 curseddoll 한 벌을 성격 스킨으로 나눠 입는다
  curseddoll_naive: {
    // 순수 — 「마녀가 스스로 움직이는 인형을 만들어 팔던 것이 유행이 지나버렸다」
    // 공략: 무겁고 느리다 — 수가 ⚡8 이상이니 마음껏 몰아 쳐 먼저 쓰러뜨려라. 실밥이 풀리면 「엉킨 실」(손에 든 채 넘기면 손상 2)이 뽑을 더미에 든다.
    //       동료부터 잡으면 끊긴 실을 이어 사기 1 (방패 · 느긋이 · 끼워 넣기)
    ko: "누루링 인형", hp: 76, row: "front", nature: "순수", art: "curseddoll", tint: "#8f7fa8",
    passives: [
      { name: "이어 붙인 실", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "guard", v: 12, say: "팔리던 천을 두른다", rush: 8 },
      { t: "attack", v: 12, say: "무겁게 내려친다", rush: 9 },
      { t: "addCard", id: "엉킨 실", n: 1, to: "draw", say: "실밥이 풀린다", rush: 8 },
      { t: "buff", id: "사기", v: 1, say: "실이 팽팽해진다", rush: 0 },
      { t: "attack", v: 14, say: "밀어붙인다", rush: 10 },
    ],
  },
  curseddoll_mad: {
    // 광기 — 「애착인형으로 오랫동안 사랑을 받았지만, 버려지는 것은 한 순간이었다. 이 누루링에게 남은 것이라고는 '악'밖에 없다」
    // 공략: 팽팽 · 몸 감기 ⚡3 — 몰아 치면 사기가 붙고 몸을 감는다, 한 턴에 적게. 그림자 바늘은 고통 2, 맞으면 실가시로 되찌르니(턴에 두 번) 관통 큰 한 장 (가시 · 저격 · 고통)
    ko: "누루링 인형 · 버림받은", hp: 48, row: "back", nature: "광기", art: "curseddoll", tint: "#b07fb0",
    passives: [
      { name: "실가시", on: "hurt", limit: 2, do: { t: "thorns", v: 2 } },
    ],
    open: { t: "debuff", id: "취약", v: 1, say: "눈이 붉게 빛난다", rush: 4 },
    intents: [
      { t: "back", v: 14, id: "고통", n: 2, say: "그림자 바늘", rush: 6 },
      { t: "buff", id: "사기", v: 1, say: "실이 팽팽해진다", rush: 3 },
      { t: "multi", v: 4, n: 3, say: "실이 춤춘다", rush: 6 },
      { t: "block", v: 10, say: "실로 몸을 감는다", rush: 3 },
    ],
  },
  curseddoll_jolly: {
    // 활발 — 「자신만의 삶을 찾아 여기저기를 떠도는 종. 칙칙한 마녀 공동에서 벗어나 생활하며 성격이 좀 밝아졌다」
    // 공략: 결계 ⚡3 — 두면 동료의 상처를 덮는다, 관통으로 먼저 잡아라. 실로 손을 묶으면 아군 전원 손상 2(방어 · 실드 반) —
    //       방어는 묶이기 전에 쌓아라. 빛 끌어당기기는 ⚡7이라 서두를 것 없다 (치유사 · 녹이기)
    ko: "누루링 인형 · 떠돌이", hp: 52, row: "back", nature: "활발", art: "curseddoll", tint: "#c0a0d0",
    intents: [
      { t: "heal", v: 12, say: "결계로 상처를 덮는다", rush: 3 },
      { t: "jam", v: 2, say: "떠돌며 배운 주문", rush: 5 },
      { t: "debuff", id: "손상", v: 2, say: "실로 손을 묶는다", rush: 4 },
      { t: "back", v: 16, say: "뿌리째 끌어당긴다", rush: 7 },
    ],
  },
  // 원작 「햇팽이」 — 「마녀들의 모자를 집 삼아 움직이는 달팽이」. 성격마다 기록이 다르다
  hatsnail: {
    // 우울 — 「모자가 아닌 진짜 껍질 집에 살고 싶어하는 햇팽이」
    // 공략: 느릿느릿 — 수가 ⚡8 이상이니 마음껏 몰아 써라. 첫 대를 맞으면 모자에 숨고(턴에 한 번), 모자 속으로 숨는 수(안 당겨짐)는 강인도 2칸을 되찾는다 —
    //       작은 카드로 먼저 두드리고 큰 카드는 그다음, 숨기 전 턴에 깨라. 기어간 자리엔 「끈적한 점액」 둘 (느긋이 · 굳히기 · 끼워 넣기)
    ko: "햇팽이", hp: 56, row: "front", nature: "우울", tint: "#a07860",
    passives: [
      { name: "모자 속으로", on: "hurt", do: { t: "block", v: 6 } },
    ],
    intents: [
      { t: "block", v: 16, tough: 2, say: "모자 속으로 숨는다", rush: 0 },
      { t: "attack", v: 11, say: "느릿느릿 들이받는다", rush: 9 },
      { t: "addCard", id: "끈적한 점액", n: 2, to: "discard", say: "끈적한 길을 남긴다", rush: 8 },   // 상태 카드(docs/16) — 기어간 자리의 점액
      { t: "attack", v: 13, say: "껍질 대신 모자로 굴러든다", rush: 10 },
    ],
  },
  hatsnail_mad: {
    // 광기 — 「사악한 성격을 가진 마녀 모자에 들러붙은 햇팽이는 굉장히 음흉하고 영악하다」
    // 공략: 디버프를 걸면 모자가 웃으며 약화를 돌려준다 — 디버프는 아끼고 기절 한 번으로. 음흉하게 웃으면 아군 전원 고통 2(방어로 못 막는다),
    //       쪽지를 흘리면 「모자 속 쪽지」 — AP 1 로 치워라. 저주가 끓으면(⚡0) 다음 턴 파티 전체 12 — 그 턴에 격파하거나 끊어라 (깨면 끊긴다 · 디버퍼 · 고통)
    ko: "햇팽이 · 음흉", hp: 58, row: "front", nature: "광기", art: "hatsnail", tint: "#8a5a70",
    passives: [
      { name: "영악한 모자", on: "debuffed", do: { t: "debuff", id: "약화", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 12, say: "모자챙으로 후린다", rush: 5 },
      { t: "debuff", id: "고통", v: 2, say: "음흉하게 웃는다", rush: 4 },
      { t: "charge", brk: true, say: "모자 속 저주가 끓는다", next: { t: "attackAll", v: 12, say: "저주를 쏟는다" } },
      { t: "block", v: 12, say: "모자 깊이 숨는다", rush: 5 },
      { t: "addCard", id: "모자 속 쪽지", n: 1, to: "draw", say: "모자 속 쪽지를 흘린다", rush: 4 },   // 상태 카드 — 손에 든 채 넘기면 파티가 아프다
    ],
  },
  hatsnail_jolly: {
    // 활발 — 「처음 마녀 모자를 집으로 선택한 햇팽이의 머릿속은 밝은 미래에 대한 꿈으로 가득하다」
    // 공략: 통통 튕기기 · 떠들기가 ⚡3으로 잦다 — 당길 때마다 신이 나 사기 1 이 붙으니(줄지 않는다) 신속 카드로 셈을 넘기거나, 34 체력을 관통 큰 한 장으로 먼저 (재촉꾼 · 당기면 손해)
    ko: "햇팽이 · 꿈꾸는", hp: 34, row: "back", nature: "활발", art: "hatsnail", tint: "#c09060",
    pick: "shuffle",
    passives: [
      { name: "신나는 꿈", on: "rushed", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "multi", v: 3, n: 3, say: "모자를 통통 튕긴다", w: 2, rush: 3 },
      { t: "jam", v: 1, say: "신나서 떠든다", rush: 3 },
      { t: "back", v: 9, say: "모자째 굴러든다", rush: 5 },
    ],
  },

  // ── 층 밖 — 지금 세 층 어디의 것도 아니어서 지도에 안 나온다. 검사 도구(tools/check-fx · check-passive …)가 싸움 예로 쓴다 ──
  gluttonbear: {
    // 원작 「머곰」 — 「엘리아스의 숲을 돌아다니다보면 만날 수 있는 듬직한 인상의 수인」. 수인 땅의 것이라 지도에서 뺐다
    // 공략: 웅크림 ⚡3 — 그 턴엔 적게 세게. 숨을 들이쉬면 그 턴에 격파하거나 끊어라. 동료가 쓰러지면 격노하니 곰을 먼저 (반격꾼 + 깨면 끊긴다)
    ko: "머곰", hp: 67, row: "front", nature: "광기", tint: "#b07f5a",
    passives: [
      { name: "격노", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attack", v: 16, say: "앞발을 든다", rush: 6 },
      { t: "block", v: 10, tough: 1, say: "몸을 웅크린다", rush: 3 },
      { t: "charge", brk: true, say: "숨을 크게 들이쉰다", next: { t: "attack", v: 24, say: "덮친다" } },
      { t: "buff", id: "사기", v: 1, say: "배를 채운다", rush: 4 },
    ],
    phase: {
      at: 0.4, say: "배가 고파 사나워졌다",
      intents: [
        { t: "multi", v: 8, n: 2, say: "마구 할퀸다", rush: 6 },
        { t: "charge", brk: true, say: "숨을 크게 들이쉰다", next: { t: "attack", v: 22, say: "덮친다" } },
        { t: "buff", id: "사기", v: 1, say: "허겁지겁 먹는다", rush: 3 },
      ],
    },
  },
  wisps: {
    // 원작 「위스프」 — 「순수한 에너지에 가까운 불 정령」. 정령산의 것이라 지도에서 뺐다
    // 공략: 흩어졌다 모이기 · 빛 흔들기 ⚡3 — 그 수 앞에선 카드를 아끼고, 30 체력이니 큰 한 장으로. 스며들면 고통 2 (재촉꾼 · 고통)
    ko: "위스프", hp: 30, row: "back", nature: "순수", tint: "#9aa8d9",
    pick: "shuffle",
    intents: [
      { t: "jam", v: 1, say: "흩어졌다 모인다", rush: 3 },
      { t: "back", v: 9, id: "고통", n: 2, say: "스며든다", rush: 5 },
      { t: "debuff", id: "약화", v: 2, say: "빛이 흔들린다", rush: 3 },
      { t: "multi", v: 3, n: 3, say: "여럿으로 갈라진다", rush: 5 },
    ],
  },
  // ── 층의 끝 ─────────────────────────────────────────────────────────
  // 보스는 순서대로 돈다(읽히는 편이 공정하다). 체력이 떨어지면 판이 바뀌고(phase), 끝에 한 번 더 바뀐다(phase2) —
  // 판마다 공략이 다르다(docs/12). 판마다 안 당겨지는 큰 수(charge)가 하나 있고, 판마다 그것을 **격파로 끊을 수 있는지(brk)** 가 다르다.
  // 보스마다 덱을 시험하는 장치가 하나 있다: 커버러스는 몰아 치는 손(세 장째 공격) · M.E.O.W 는 큰 손(네 장째)과 호위 드론 ·
  // 햇팽이 마녀는 저주를 견디는 손(스킬 셋째 장 · 쪽지 · 점액) · 우로스는 버티는 힘(고통 · 불씨)과 격파 · 기절.
  curburus: {
    // 원작 「크르브르스」 — 차원 대충돌의 보스(나무위키 몬스터 문서). 1층 끝을 지킨다.
    // 공략: 앞판 — 웅크림 · 털 ⚡3. 웅크리면 강인도 2칸을 되찾으니 웅크리기 전에 깨라. 숨을 모으면(⚡0) 그 턴에 격파하면 흩어진다 — 1층의 격파 수업.
    //       세 머리가 깨면(55%) 물어뜯기 한 번마다 고통, 울부짖음 ⚡3 — 카드를 아껴라. 이 판의 불길은 격파로 안 끊긴다(기절 · 봉인).
    //       격파에서 일어서면 깨어난 머리가 성나 사기 1 — 깨는 턴에 끝까지 밀 수 있을 때 깨라.
    //       한 턴 세 장째가 공격이면 한 머리가 뒤를 무니 세 번째는 스킬 · 방어로. 디버프가 걸리면 털을 세워 사기 — 디버프는 한 턴에 몰아 걸어라.
    //       4분의 1 아래로 가면 세 머리가 한꺼번에 날뛴다 — 세 갈래 불길(⚡0)은 다시 격파로 끊긴다, 남은 체력을 두 턴 안에 밀어라
    ko: "커버러스", hp: 244, row: "front", boss: true, nature: "광기", tint: "#c07f7f",
    passives: [
      { name: "셋째 머리", on: "card", type: "공격", every: 3, do: { t: "back", v: 5 } },
      { name: "곤두선 털", on: "debuffed", do: { t: "buff", id: "사기", v: 1 } },
      { name: "깨어난 머리", on: "recover", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "attackAll", v: 11, say: "세 머리가 짖는다", rush: 7 },
      { t: "block", v: 16, tough: 2, say: "웅크린다", rush: 3 },
      { t: "back", v: 24, say: "뒤를 물어뜯는다", rush: 8 },
      { t: "buff", id: "사기", v: 1, say: "털을 세운다", rush: 3 },
      { t: "charge", brk: true, say: "세 머리가 숨을 모은다", next: { t: "attackAll", v: 19, say: "세 머리가 함께 짖는다" } },
    ],
    phase: {
      at: 0.55, say: "세 머리가 모두 깨어났다",
      intents: [
        { t: "multi", v: 10, n: 3, id: "고통", say: "세 머리가 물어뜯는다", rush: 7 },
        { t: "jam", v: 2, say: "울부짖는다", rush: 3 },
        { t: "charge", say: "숨을 크게 들이쉰다", next: { t: "attackAll", v: 22, id: "고통", n: 2, say: "불길을 뿜는다" } },
        { t: "back", v: 22, say: "뒤를 물어뜯는다", rush: 6 },
      ],
    },
    phase2: {
      at: 0.25, say: "세 머리가 한꺼번에 날뛴다",
      intents: [
        { t: "charge", brk: true, say: "세 머리가 한꺼번에 숨을 모은다", next: { t: "attackAll", v: 25, id: "고통", n: 3, say: "세 갈래 불길을 뿜는다" } },
        { t: "multi", v: 11, n: 3, say: "세 머리가 번갈아 문다", rush: 7 },
        { t: "buff", id: "사기", v: 1, tough: 2, say: "털을 곤두세운다", rush: 3 },
      ],
    },
  },
  meow: {
    // 원작 「M.E.O.W」 — 엘레나가 만든 고양이 로봇 병기. 메인 스토리에서 교주 일행과 맞붙었고(사족보행 병기),
    // 엘리아스 프론티어의 첫 보스다. 졸개 드론을 부르고, 침묵에 걸리면 화염 방사를 못 하고, 입에서 거대한 레이저를 쏜다(나무위키).
    // 엘프 도시의 기계라 2층 끝을 지킨다 — 전에 있던 골렘(원작 「동석」)은 용족 동굴의 수호 골렘이라 뺐다. 성격 없음(Skin_None).
    // 공략: 앞판 — 화염 방사기를 데우면(⚡0) 격파 · 침묵 · 기절로 끊어라(침묵이면 화염을 못 뿜는다, 뿜으면 고통 2). 음파 ⚡3 앞에선 카드를 아껴라.
    //       한 턴 네 장째마다 관측 AI 가 기관총을 긁으니 큰 손은 세 장에서 끊어라. 드론을 부수면 남은 것을 방패로 감싸니
    //       드론은 같은 턴에 둘 다, 아니면 본체만. 격파되면 냉각이 멎어 취약 2 — 딜러가 몰아 칠 때다.
    //       튜브를 꽂으면(60%) 드론을 둘러쳐 적 전체 강인도 2칸 · 「통제 신호」 둘 · 레이저(⚡0 — 격파로 안 끊긴다, 기절 · 봉인).
    //       4분의 1 아래로 가면 폭주 — 출력 올리기 ⚡3 이 잦고, 마지막 레이저는 다시 격파로 끊긴다. 남은 체력을 몰아 밀어라
    ko: "M.E.O.W", hp: 232, row: "front", boss: true, skin: "Skin_None", weak: ["순수"], tint: "#8fa8c8",
    scale: 0.58,         // 원작 그림이 화면을 꽉 채운다 — 커버러스만 하게(머리가 싸움터 안에, 옆 사도를 안 덮게)
    passives: [
      { name: "관측 AI", on: "card", every: 4, do: { t: "multi", v: 4, n: 3 } },
      { name: "드론 호위", on: "allyDown", do: { t: "guard", v: 12 } },
      { name: "냉각 정지", on: "broken", do: { t: "buff", id: "취약", v: 2 } },
    ],
    intents: [
      { t: "attack", v: 14, say: "앞발로 후려친다", rush: 6 },
      { t: "multi", v: 5, n: 3, say: "소형 미사일을 쏜다", rush: 5 },
      { t: "debuff", id: "약화", v: 2, say: "음파를 내지른다", rush: 3 },
      { t: "charge", brk: true, say: "화염 방사기를 데운다", next: { t: "attackAll", v: 18, id: "고통", n: 2, say: "화염을 뿜는다" } },
    ],
    phase: {
      at: 0.6, say: "에너지 튜브를 세계수 뿌리에 꽂는다",
      intents: [
        { t: "guard", v: 12, tough: 2, say: "드론을 둘러친다", rush: 3 },
        { t: "attackAll", v: 14, say: "등에서 미사일을 쏟아붓는다", rush: 7 },
        { t: "charge", say: "입에 빛을 모은다", next: { t: "attackAll", v: 27, say: "거대한 레이저를 쏜다" } },
        { t: "addCard", id: "통제 신호", n: 2, to: "draw", say: "회로가 윙윙 돈다", rush: 3 },
      ],
    },
    phase2: {
      at: 0.25, say: "출고를 취소당한 회로가 폭주한다",
      intents: [
        { t: "multi", v: 7, n: 4, say: "기관총을 마구 쏜다", rush: 6 },
        { t: "charge", brk: true, say: "입에 빛을 모은다", next: { t: "attackAll", v: 29, say: "거대한 레이저를 쏜다" } },
        { t: "buff", id: "사기", v: 1, say: "출력을 한계까지 올린다", rush: 3 },
      ],
    },
  },
  hatsnailwitch: {
    // 3층 끝 — 마녀 왕국의 보스. 원작에는 마녀 왕국 보스가 없다(나무위키 「트릭컬 리바이브/몬스터」 의 보스는 릴1리 · 크르브르스 · M.E.O.W ·
    // 크레용사용 · R41 리뉴아 · 우로스 — 마녀 땅 것이 없고, 기기에 있는 보스 스파인도 커버러스 · M.E.O.W · 우로스뿐).
    // 그래서 마녀 왕국 몬스터 가운데 이야기가 있는 것을 키웠다 — 햇팽이(마녀 모자를 집 삼은 달팽이)의 원작 기록
    // 「햇팽이들 중에 마녀의 의식이 옮겨진 듯이 행동하는 개체들이 있다고 한다」 · 「사악한 마녀 모자에 들러붙은 햇팽이는 굉장히 음흉하고 영악하다」.
    // 냉정 기록이 바로 그 개체다 — 그림은 햇팽이 그대로(art) · 냉정 스킨, 크게(scale). 모자에 깃든 마녀가 떠도는 인형(누루링 인형 · 떠돌이)을 부린다.
    // 공략: 저주를 견디는 손 — 한 턴 세 장째 스킬마다 모자가 주문을 되받아 약화를 건다(스킬은 두 장까지). 주문을 웅얼거리면 「모자 속 쪽지」 둘 —
    //       AP 를 남겨 치워라. 솥이 끓으면(⚡0) 다음 턴 파티 전체 · 고통 2 — 그 턴에 격파하면 흩어진다. 점액 방울은 한 방울마다 손상.
    //       절반에서 한 번 모자 속에 숨는다(방어 · 강인도 다 참). 인형이 쓰러지면 실이 끊겨 사기가 붙으니 인형(회복)을 먼저 잡되 그 턴엔 막을 준비를.
    //       60% 아래 — 마녀의 의식이 깨어 저주가 번지고(고통) 인형에 실을 꿰어 적 전체 사기 1, 번개(⚡0)는 격파로 안 끊긴다.
    //       25% 아래 — 모자만 남아 날뛰고 점액으로 메우며 강인도를 되찾는다(⚡3), 마지막 솥은 다시 격파로 끊긴다
    ko: "햇팽이 마녀", hp: 262, row: "front", boss: true, nature: "냉정", art: "hatsnail", tint: "#8a5aa8",
    scale: 1.5,          // 보통 달팽이(그림 그대로)보다 크게 — 커버러스만 하게
    passives: [
      { name: "되받는 주문", on: "card", type: "스킬", every: 3, do: { t: "debuff", id: "약화", v: 1 } },
      { name: "모자 속으로", on: "lowHp", at: 0.5, do: { t: "block", v: 18, tough: 5 } },
      { name: "끊긴 실", on: "allyDown", do: { t: "buff", id: "사기", v: 1 } },
    ],
    intents: [
      { t: "back", v: 17, say: "모자챙으로 뒤를 후린다", rush: 6 },
      { t: "addCard", id: "모자 속 쪽지", n: 2, to: "draw", say: "마녀의 주문을 웅얼거린다", rush: 3 },
      { t: "charge", brk: true, say: "모자 속 솥이 끓는다", next: { t: "attackAll", v: 19, id: "고통", n: 2, say: "끓는 물약을 쏟는다" } },
      { t: "multi", v: 5, n: 3, id: "손상", say: "점액 방울을 튀긴다", rush: 5 },
    ],
    phase: {
      at: 0.6, say: "모자 속 마녀의 의식이 깨어난다",
      intents: [
        { t: "jam", v: 2, say: "모자가 혼자 주문을 외운다", rush: 3 },
        { t: "attackAll", v: 12, id: "고통", n: 2, say: "보랏빛 저주가 번진다", rush: 7 },
        { t: "charge", say: "모자 끝에 번개를 모은다", next: { t: "attackAll", v: 23, say: "마녀의 번개가 떨어진다" } },
        { t: "buff", id: "사기", v: 1, all: true, say: "인형에게 실을 꿴다", rush: 3 },
      ],
    },
    phase2: {
      at: 0.25, say: "껍질을 버리고 모자만 남아 날뛴다",
      intents: [
        { t: "multi", v: 9, n: 3, say: "모자가 날뛴다", rush: 6 },
        { t: "charge", brk: true, say: "마지막 주문을 끓인다", next: { t: "attackAll", v: 25, say: "솥을 뒤엎는다" } },
        { t: "heal", v: 14, tough: 2, say: "점액으로 껍질을 메운다", rush: 3 },
        { t: "addCard", id: "끈적한 점액", n: 2, to: "hand", say: "점액을 끼얹는다", rush: 4 },
      ],
    },
  },
  e0_uros: {
    // 원작 「우로스」 — 엘리아스 프론티어의 보스. 세계수의 힘을 삼킨 불꽃, 허물을 벗고 열반에 들며, 행동불가에 약하고,
    // 맵 전체를 태우는 「파멸의 운명」, 시간을 멈추고 긋는 「일섬」, 붉은 밧줄 · 검의 결계 · 땅속에서 솟구치기(나무위키).
    // 쓰러지면 그 자리에서 세계수 새싹이 핀다 — 세계수 뿌리 밑, 판의 마지막을 지킨다. 졸개는 부르지 않는다(원작 그대로). 성격 없음(Skin_None).
    // 공략: 버티는 힘과 격파 — 파멸의 운명이 매 턴 끝 파티 전체에 고통을 얹는다(방어로 못 막는다) — 웅크려 버티는 손일수록 오래 끌면 진다.
    //       첫 턴엔 열반의 허물(방어)이 두껍다 — 몰아 치지 말고 갖추는 턴으로. 검의 결계 ⚡3 은 강인도 2칸을 되찾으니 결계 전에 깨라.
    //       검에 불꽃을 모으면(⚡0) 그 턴에 격파하거나 기절 · 봉인으로 끊어라(행동불가에 약하다). 격파되면 허물이 갈라져 취약 2.
    //       60% 아래 — 땅속으로 파고들면(⚡0) 솟구치기 · 고통 2, 이 판은 격파로 안 끊긴다. 불씨가 튀면 「불씨」 둘(쥔 채 넘기면 아군 전원 고통 6).
    //       30% 아래 — 다시 열반(방어 · 강인도 다 참)에 들고 뿌리의 불씨를 빨아 회복(⚡3), 「불씨」 를 손에 쥐여 준다 — 일섬과 회복 사이에 몰아 밀어라
    ko: "우로스", hp: 332, row: "front", boss: true, skin: "Skin_None", weak: ["활발"], tough: 6, tint: "#c8504a",
    scale: 0.66,         // 원작 그림이 화면을 꽉 채운다 — 커버러스만 하게
    passives: [
      { name: "열반", on: "fightStart", do: { t: "block", v: 30 } },
      { name: "파멸의 운명", on: "turnEnd", do: { t: "debuff", id: "고통", v: 1 } },
      { name: "다시 열반", on: "lowHp", at: 0.3, do: { t: "block", v: 24, tough: 6 } },
      { name: "갈라진 허물", on: "broken", do: { t: "buff", id: "취약", v: 2 } },
    ],
    open: { t: "debuff", id: "약화", v: 1, say: "허물을 벗고 열반에 든다", rush: 3 },
    intents: [
      { t: "multi", v: 10, n: 2, say: "칼을 두 번 휘두른다", rush: 5 },
      { t: "back", v: 20, say: "지팡이를 내던진다", rush: 6 },
      { t: "block", v: 20, tough: 2, say: "검을 꽂아 결계를 친다", rush: 3 },
      { t: "charge", brk: true, say: "검에 불꽃을 모은다", next: { t: "attackAll", v: 24, say: "시간을 멈추고 일섬" } },
      { t: "attack", v: 21, id: "취약", n: 2, say: "붉은 밧줄을 던진다", rush: 6 },
    ],
    phase: {
      at: 0.6, say: "열반이 깨지고 불꽃이 길을 잃는다",
      intents: [
        { t: "multi", v: 11, n: 2, say: "칼을 두 번 휘두른다", rush: 5 },
        { t: "charge", say: "땅속으로 파고든다", next: { t: "attackAll", v: 26, id: "고통", n: 2, say: "땅을 가르고 솟구친다" } },
        { t: "multi", v: 5, n: 4, say: "결계의 검이 날아든다", rush: 6 },
        { t: "addCard", id: "불씨", n: 2, to: "draw", say: "불씨가 튄다", rush: 3 },
        { t: "buff", id: "사기", v: 1, say: "불꽃이 거세진다", rush: 3 },
        { t: "back", v: 21, say: "지팡이를 내던진다", rush: 6 },
      ],
    },
    phase2: {
      at: 0.3, say: "뿌리에 남은 세계수의 불씨를 삼키려 한다",
      intents: [
        { t: "heal", v: 18, say: "뿌리에서 불씨를 들이켠다", rush: 3 },
        { t: "charge", brk: true, say: "검에 불꽃을 모은다", next: { t: "attackAll", v: 28, say: "시간을 멈추고 일섬" } },
        { t: "attack", v: 25, id: "취약", n: 2, say: "붉은 밧줄을 던진다", rush: 6 },
        { t: "addCard", id: "불씨", n: 1, to: "hand", say: "불씨를 쥐여 준다", rush: 3 },
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
