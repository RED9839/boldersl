// 카드. 사도마다 여덟 장 + 본색 하나, 거기에 교주 공용과 임시 카드.
//
// **사도의 카드는 나무위키의 원작 스킬에서 나온다.** 이름과 효과의 근거를 사도마다 주석에 적어 둔다.
// 수치만 우리 것이다 — 원작은 9명 실시간 자동 전투라 계수를 옮길 수 없다(docs/01-규칙.md).
//
// cost 기력 · type 공격/방어/기술 · target 적/전체/아군/자신/없음
// fx: [{k, v, ...}]  — k 는 combat.js 의 효과 키
// need: {row}  그 줄에 서 있어야 낼 수 있다 · pierce 뒷줄에도 닿는다

const A = (v) => ({ k: "damage", v });           // 대상 하나
const AOE = (v) => ({ k: "aoe", v });            // 적 전체
const B = (v) => ({ k: "block", v });            // 자신에게 방어도
const HEAL = (v) => ({ k: "heal", v });
const DRAW = (v) => ({ k: "draw", v });
const SP = (v) => ({ k: "sp", v });
const ST = (id, v, who = "enemy") => ({ k: "status", id, v, who });

export const CARDS = {
  // ── 에르핀 · 후열 마법 ────────────────────────────────────────────────
  // 원작: 강화 평타로 SP를 수급하는 사도 · 고학년은 쓰는 동안 무적이고 적중한 적의 피해량을 줄인다
  //       리더 스킬은 후열 아군의 피해량을 올리고 받는 피해를 줄인다
  erpin_tap:    { hero: "erpin", name: "평타", cost: 0, type: "공격", target: "적", pierce: true, fx: [A(5)], text: "피해 5. 자주 나간다 — 에르핀은 이걸로 SP를 번다." },
  erpin_charge: { hero: "erpin", name: "강화 평타", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(10)], text: "피해 10." },
  erpin_god:    { hero: "erpin", name: "무적", cost: 2, type: "스킬", target: "자신", fx: [{ k: "invuln" }, DRAW(1)], text: "이번 턴 에르핀이 받는 피해를 전부 무시한다. 1장 뽑기." },
  erpin_crown:  { hero: "erpin", name: "여왕의 위엄", cost: 2, type: "공격", target: "전체", pierce: true, fx: [AOE(6), ST("약화", 1)], text: "적 전체에 피해 6, 약화 1." },
  erpin_rear:   { hero: "erpin", name: "뒷줄에 호령", cost: 2, type: "기술", target: "없음", fx: [{ k: "rearBuff", v: 2 }], text: "이번 전투 동안 뒷줄 아군의 공격 +2." },
  erpin_cake:   { hero: "erpin", name: "아이스크림 케이크", cost: 1, type: "기술", target: "자신", snack: true, fx: [HEAL(5), ST("힘", 1, "self")], text: "체력 5 회복. 힘 +1. (간식)" },
  erpin_royal:  { hero: "erpin", name: "여왕의 명령", cost: 2, type: "기술", target: "없음", fx: [DRAW(3), SP(1)], text: "카드 3장을 뽑고 SP +1." },
  erpin_feast:  { hero: "erpin", name: "열두 끼째", cost: 3, type: "기술", target: "자신", snack: true, fx: [HEAL(12), ST("힘", 2, "self")], text: "체력 12 회복. 힘 +2. (간식)" },

  // ── 네르 · 전열 마법 서포터 ───────────────────────────────────────────
  // 원작: 게임에서 하나뿐인 딜링 버프 서포터 · 저학년은 아군의 피해량을 대폭 올린다
  //       고학년은 화면 전체에 마법 피해를 넣으면서 치명 피해량을 올린다
  ner_bless:    { hero: "ner", name: "사제장의 축복", cost: 2, type: "기술", target: "없음", fx: [{ k: "partyDmg", v: 2 }], text: "이번 전투 동안 아군 전체의 공격 +2. 겹쳐 쌓인다." },
  ner_crit:     { hero: "ner", name: "치명의 기도", cost: 2, type: "기술", target: "없음", fx: [{ k: "crit", v: 35 }], text: "이번 전투 동안 아군 전체의 피해 +35%." },
  ner_axe:      { hero: "ner", name: "세계수의 도끼", cost: 2, type: "공격", target: "적", need: { row: "front" }, fx: [A(20)], text: "피해 20. 앞줄에서만." },
  ner_judge:    { hero: "ner", name: "심판의 빛", cost: 3, type: "공격", target: "전체", pierce: true, fx: [AOE(9), { k: "crit", v: 10 }], text: "적 전체에 마법 피해 9. 아군 피해 +10%." },
  ner_guard:    { hero: "ner", name: "사제장의 벽", cost: 1, type: "스킬", target: "자신", fx: [B(9)], text: "방어도 9." },
  ner_cover:    { hero: "ner", name: "감싸기", cost: 1, type: "스킬", target: "아군", fx: [{ k: "blockAlly", v: 10 }], text: "아군 하나에게 방어도 10." },
  ner_candy:    { hero: "ner", name: "숨겨 둔 사탕", cost: 0, type: "기술", target: "자신", snack: true, fx: [HEAL(2), DRAW(1)], text: "체력 2 회복, 1장 뽑기. 못 본 걸로 해 주세요. (간식)" },
  ner_pledge:   { hero: "ner", name: "각서 한 장", cost: 1, type: "기술", target: "없음", fx: [DRAW(2), { k: "nextCheaper", v: 1 }], text: "2장 뽑기. 다음 카드 값 -1. 어디 서명하셨더라." },

  // ── 엘레나 · 후열 마법 ────────────────────────────────────────────────
  // 원작: 저학년은 직선 관통 범위 공격에 감전(공격·이동속도 감소)을 건다 · 고학년은 범위 폭발형
  elena_line:   { hero: "elena", name: "직선 관통", cost: 2, type: "공격", target: "전체", pierce: true, fx: [AOE(5), ST("감전", 1)], text: "적 전체에 피해 5, 감전 1." },
  elena_shock:  { hero: "elena", name: "감전", cost: 1, type: "기술", target: "적", pierce: true, fx: [ST("감전", 3)], text: "감전 3. 손도 발도 느려진다." },
  elena_blast:  { hero: "elena", name: "범위 폭발", cost: 2, type: "공격", target: "전체", pierce: true, fx: [AOE(9)], text: "적 전체에 피해 9." },
  elena_arc:    { hero: "elena", name: "감전 확산", cost: 2, type: "공격", target: "전체", pierce: true, fx: [{ k: "shockBurst", v: 4 }], text: "감전된 적마다 감전 수치 ×4 만큼 피해." },
  elena_laser:  { hero: "elena", name: "시제품 사격", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(9)], text: "피해 9. 뒷줄도 닿는다." },
  elena_coffee: { hero: "elena", name: "진한 커피", cost: 0, type: "기술", target: "자신", fx: [SP(1), { k: "selfHurt", v: 2 }], text: "SP +1. 체력 2를 잃는다." },
  elena_debug:  { hero: "elena", name: "디버깅", cost: 1, type: "기술", target: "자신", fx: [{ k: "cleanse", v: 1 }, B(7)], text: "나쁜 상태 하나를 지우고 방어도 7." },
  elena_boom:   { hero: "elena", name: "불필요한 자폭 기능", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(16), { k: "selfHurt", v: 5 }], text: "피해 16. 체력 5를 잃는다. 디버깅은 안 했다." },

  // ── 아멜리아 · 후열 물리 ──────────────────────────────────────────────
  // 원작: 고학년은 높은 물리 계수로 전체를 때리고 감전된 적을 기절시킨다
  //       애착 아티팩트 '새틀라이트 오버히트'는 Mk.2 폭격으로 4회 범위 물리 피해 + 감전
  //       엘레나의 감전 시간을 4초에서 8초로 늘린다
  amelia_mark:  { hero: "amelia", name: "좌표 지정", cost: 0, type: "기술", target: "적", fx: [ST("취약", 2)], text: "취약 2." },
  amelia_orbit: { hero: "amelia", name: "위성 사격", cost: 2, type: "공격", target: "적", pierce: true, need: { row: "back" }, fx: [A(18)], text: "피해 18. 뒷줄에서만." },
  amelia_mk2:   { hero: "amelia", name: "새틀라이트 Mk.2", cost: 3, type: "공격", target: "전체", pierce: true, fx: [AOE(3), AOE(3), AOE(3), ST("감전", 1)], text: "적 전체에 피해 3을 세 번, 감전 1." },
  amelia_stun:  { hero: "amelia", name: "과부하", cost: 1, type: "기술", target: "전체", pierce: true, fx: [{ k: "shockStun" }], text: "감전된 적을 전부 기절시킨다." },
  amelia_memo:  { hero: "amelia", name: "결재 서류", cost: 1, type: "기술", target: "없음", fx: [DRAW(3)], text: "3장 뽑기." },
  amelia_shift: { hero: "amelia", name: "야근", cost: 1, type: "기술", target: "자신", fx: [{ k: "selfHurt", v: 3 }, DRAW(2), SP(1)], text: "체력 3을 잃고 2장 뽑기, SP +1." },
  amelia_camera:{ hero: "amelia", name: "감시 카메라", cost: 1, type: "기술", target: "적", fx: [{ k: "foresee", v: 1 }, B(6)], text: "적 하나의 다음 수를 흐트러뜨리고 방어도 6." },
  amelia_hack:  { hero: "amelia", name: "무단 접속", cost: 2, type: "기술", target: "적", pierce: true, fx: [ST("취약", 3), ST("약화", 3), DRAW(1)], text: "취약 3, 약화 3, 1장 뽑기." },

  // ── 에슈르 · 저격형 마법 ──────────────────────────────────────────────
  // 원작: 상대 위치에 구애받지 않는 저격형 딜러 · 고학년은 기절 4초짜리 광역
  //       한 방은 세지만 저학년 쿨이 길어 지속 DPM 은 낮다
  ashur_snipe:  { hero: "ashur", name: "저격", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(10)], text: "피해 10. 어디에 서 있든 닿는다." },
  ashur_burst:  { hero: "ashur", name: "입자 폭발", cost: 3, type: "공격", target: "전체", pierce: true, fx: [AOE(5), { k: "stunAll" }], text: "적 전체에 피해 5, 기절." },
  ashur_theory: { hero: "ashur", name: "입자 이론", cost: 1, type: "기술", target: "없음", fx: [DRAW(3)], text: "3장 뽑기. 아무도 안 듣는다." },
  ashur_oven:   { hero: "ashur", name: "화덕 열기", cost: 1, type: "기술", target: "없음", fx: [{ k: "addCard", id: "bread", v: 2 }], text: "갓 구운 빵 2장을 손에 넣는다." },
  ashur_sigh:   { hero: "ashur", name: "한숨", cost: 0, type: "스킬", target: "자신", fx: [B(3), DRAW(1)], text: "방어도 3, 1장 뽑기." },
  ashur_school: { hero: "ashur", name: "마법 학교 간판", cost: 2, type: "기술", target: "없음", fx: [{ k: "blockAll", v: 8 }], text: "아군 전체 방어도 8. 빵집 아니다." },
  ashur_field:  { hero: "ashur", name: "입자 결계", cost: 2, type: "스킬", target: "없음", fx: [{ k: "blockAll", v: 8 }], text: "아군 전체 방어도 8." },
  ashur_bill:   { hero: "ashur", name: "이번 달 월세", cost: 1, type: "공격", target: "적", pierce: true, fx: [{ k: "rentDue", v: 6 }], text: "피해 6. 이 카드를 낼 때마다 값이 3씩 오른다." },

  // ── 마요 · 후열 물리 ──────────────────────────────────────────────────
  // 원작: 공격력 감소 효과를 가진 중독 디버프 — 일반 공격과 저학년 스킬에 달려 있다
  //       저학년은 공격력이 가장 높은 대상을 우선한다 · 평타가 빠르다
  mayo_dart:    { hero: "mayo", name: "마취 독침", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(4), ST("중독", 3)], text: "피해 4, 중독 3." },
  mayo_appraise:{ hero: "mayo", name: "감정", cost: 0, type: "기술", target: "적", pierce: true, fx: [ST("중독", 2)], text: "중독 2. 값은 제가 매김." },
  mayo_quick:   { hero: "mayo", name: "빠른 손놀림", cost: 1, type: "공격", target: "적", pierce: true, fx: [A(4), A(4), ST("중독", 1)], text: "피해 4를 두 번, 중독 1." },
  mayo_price:   { hero: "mayo", name: "값은 제가 매김", cost: 2, type: "기술", target: "없음", fx: [{ k: "poisonTop", v: 7 }], text: "가장 센 적에게 중독 7. 값은 제가 매김." },
  mayo_spread:  { hero: "mayo", name: "풀어 놓기", cost: 2, type: "기술", target: "전체", fx: [ST("중독", 6)], text: "적 전체에 중독 6." },
  mayo_stuff:   { hero: "mayo", name: "박제", cost: 2, type: "공격", target: "적", pierce: true, fx: [{ k: "poisonBurst" }], text: "대상의 중독 ×2 만큼 피해. 중독은 그대로." },
  mayo_pawn:    { hero: "mayo", name: "전당포임", cost: 0, type: "기술", target: "자신", fx: [DRAW(2), { k: "selfHurt", v: 2 }], text: "2장 뽑기. 체력 2를 맡긴다." },
  mayo_read:    { hero: "mayo", name: "손끝이 떨렸음", cost: 0, type: "기술", target: "적", fx: [{ k: "foresee", v: 1 }], text: "그 적의 다음 수를 흐트러뜨린다. 말더듬 하나면 충분함." },

  // ── 티그 · 전열 물리 ──────────────────────────────────────────────────
  // 원작: 일반 공격이 한 번에 2회 들어가고 공격 속도가 매우 빠르다
  //       고학년 '오버드라이브'가 평타 계수를 바꾸고 공속을 대폭 올린다 — 최고의 버프기로 꼽힌다
  tig_flurry:   { hero: "tig", name: "연참", cost: 1, type: "공격", target: "적", fx: [A(5), A(5)], text: "피해 5를 두 번. 원래 한 번에 두 번 벤다." },
  tig_over:     { hero: "tig", name: "오버드라이브", cost: 2, type: "기술", target: "없음", fx: [{ k: "overdrive" }], text: "이번 전투 동안 티그의 공격 카드가 한 번 더 들어간다." },
  tig_slash:    { hero: "tig", name: "가르기", cost: 1, type: "공격", target: "적", need: { row: "front" }, fx: [A(12)], text: "피해 12. 앞줄에서만." },
  tig_gale:     { hero: "tig", name: "검풍", cost: 2, type: "공격", target: "전체", pierce: true, fx: [AOE(8)], text: "적 전체에 피해 8." },
  tig_taunt:    { hero: "tig", name: "시비 걸기", cost: 0, type: "기술", target: "적", fx: [ST("취약", 1), { k: "taunt" }], text: "취약 1. 이쪽을 보게 만든다." },
  tig_stance:   { hero: "tig", name: "기척 읽기", cost: 1, type: "스킬", target: "자신", fx: [B(5), ST("힘", 1, "self")], text: "방어도 5, 힘 +1." },
  tig_finish:   { hero: "tig", name: "검성의 일격", cost: 3, type: "공격", target: "적", need: { row: "front" }, fx: [A(28)], text: "피해 28. 앞줄에서만." },
  tig_doubt:    { hero: "tig", name: "그거 거짓 아니냐", cost: 1, type: "기술", target: "적", fx: [{ k: "purge" }, ST("취약", 2)], text: "그 적이 쌓아 둔 좋은 것을 지우고 취약 2." },

  // ── 프리클 · 중열 마법 소환사 ─────────────────────────────────────────
  // 원작: 가시 촉수를 소환해 지속 피해를 넣는 소환사형
  //       촉수는 소멸 전까지 근처의 적을 치고, 소멸할 때 앞뒤로 범위 공격을 한다
  fricle_vine:  { hero: "fricle", name: "가시 촉수", cost: 1, type: "기술", target: "없음", fx: [{ k: "tentacle", v: 1 }, B(4)], text: "촉수 +1, 방어도 4. 턴이 끝날 때 촉수마다 피해 4." },
  fricle_grove: { hero: "fricle", name: "촉수밭", cost: 2, type: "기술", target: "없음", fx: [{ k: "tentacle", v: 3 }], text: "촉수 +3." },
  fricle_wither:{ hero: "fricle", name: "소멸", cost: 1, type: "공격", target: "전체", fx: [{ k: "tentacleBurst", v: 7 }], text: "촉수를 전부 터뜨린다. 촉수 하나당 적 전체에 피해 7." },
  fricle_lash:  { hero: "fricle", name: "가시덩굴", cost: 1, type: "공격", target: "적", fx: [A(8), ST("약화", 1)], text: "피해 8, 약화 1." },
  fricle_plan:  { hero: "fricle", name: "참모의 계획", cost: 1, type: "기술", target: "없음", fx: [DRAW(2), { k: "nextCheaper", v: 1 }], text: "2장 뽑기. 다음 카드 소모 -1." },
  fricle_trap:  { hero: "fricle", name: "함정으로 몰기", cost: 2, type: "기술", target: "전체", fx: [ST("취약", 2), ST("약화", 2)], text: "적 전체에 취약 2, 약화 2." },
  fricle_seal:  { hero: "fricle", name: "봉인해 두마", cost: 2, type: "기술", target: "적", fx: [{ k: "seal" }, ST("취약", 2)], text: "그 적이 다음 턴에 아무것도 못 하게 한다. 취약 2." },
  fricle_fry:   { hero: "fricle", name: "열두 봉지", cost: 0, type: "기술", target: "자신", snack: true, fx: [DRAW(1)], text: "1장 뽑기. 단것은 아니니까. (간식)" },

  // ── 교주(공용) · 임시 카드 ────────────────────────────────────────────
  cult_strike:  { hero: null, name: "교주의 지시", cost: 1, type: "공격", target: "적", fx: [A(9)], text: "피해 9." },
  cult_guard:   { hero: null, name: "교주의 비호", cost: 1, type: "스킬", target: "아군", fx: [{ k: "blockAlly", v: 10 }], text: "아군 하나에게 방어도 10." },
  cult_rally:   { hero: null, name: "호령", cost: 1, type: "기술", target: "없음", fx: [DRAW(3)], text: "3장 뽑기." },
  bread:        { hero: "ashur", name: "갓 구운 빵", cost: 0, type: "기술", target: "아군", temp: true, snack: true, fx: [{ k: "healAlly", v: 5 }], text: "아군 하나가 체력 5 회복. 쓰면 사라진다. (간식)" },

  // ── 본색 — 무너졌다가 추스르고 일어선 사도가 한 번 쓰는 카드 ───────────
  // 자(tools/balance.js)로 재지 않는다. 무너지는 값을 치르고 얻는 것이라 기준이 다르다.

  erpin_ego:  { hero: "erpin", name: "그래도 내가 여왕이야", cost: 6, type: "공격", target: "전체", pierce: true, ego: true,
    text: "적 전체에 피해 26.", fx: [AOE(26)] },
  ner_ego:    { hero: "ner", name: "사제장의 심판", cost: 6, type: "공격", target: "적", ego: true,
    text: "피해 30. 아군 전체 방어도 10.", fx: [A(30), { k: "blockAll", v: 10 }] },
  elena_ego:  { hero: "elena", name: "감자 삼백만 개", cost: 6, type: "공격", target: "전체", pierce: true, ego: true,
    text: "적 전체에 피해 16, 감전 4. 카드 2장 뽑기.", fx: [AOE(16), ST("감전", 4), DRAW(2)] },
  amelia_ego: { hero: "amelia", name: "궤도에서 보고 있었습니다", cost: 6, type: "공격", target: "전체", pierce: true, ego: true,
    text: "적 전체에 피해 26.", fx: [AOE(26)] },
  ashur_ego:  { hero: "ashur", name: "이건 빵집이 아니야", cost: 6, type: "공격", target: "전체", pierce: true, ego: true,
    text: "적 전체에 피해 20, 기절. 아군 전체 체력 10 회복.", fx: [AOE(20), { k: "stunAll" }, { k: "healAll", v: 10 }] },
  mayo_ego:   { hero: "mayo", name: "당신도 수집품임", cost: 6, type: "기술", target: "전체", ego: true,
    text: "적 전체에 중독 12, 취약 3.", fx: [ST("중독", 12), ST("취약", 3)] },
  tig_ego:    { hero: "tig", name: "이번엔 안 도망가", cost: 6, type: "공격", target: "적", ego: true,
    text: "피해 48.", fx: [A(48)] },
  fricle_ego: { hero: "fricle", name: "가시의 왕관", cost: 6, type: "기술", target: "없음", ego: true,
    text: "촉수 +6. 아군 전체 방어도 10.", fx: [{ k: "tentacle", v: 6 }, { k: "blockAll", v: 10 }] },
};

for (const [id, c] of Object.entries(CARDS)) c.id = id;

// 편성하면 덱에 들어가는 기본 4장. 나머지 넷은 전투 보상으로 얻는다.
// 정의 순서에 기대지 않고 적어 둔다 — 카드를 새로 끼워 넣을 때마다 시작덱이 바뀌면 안 된다.
const HERO_EGO = { erpin: "erpin_ego", ner: "ner_ego", elena: "elena_ego", amelia: "amelia_ego",
                   ashur: "ashur_ego", mayo: "mayo_ego", tig: "tig_ego", fricle: "fricle_ego" };

export const STARTER = {
  erpin:  ["erpin_tap", "erpin_charge", "erpin_god", "erpin_cake"],
  ner:    ["ner_bless", "ner_axe", "ner_guard", "ner_cover"],
  elena:  ["elena_shock", "elena_laser", "elena_line", "elena_debug"],
  amelia: ["amelia_mark", "amelia_orbit", "amelia_memo", "amelia_camera"],
  ashur:  ["ashur_snipe", "ashur_oven", "ashur_theory", "ashur_sigh"],
  mayo:   ["mayo_dart", "mayo_appraise", "mayo_quick", "mayo_pawn"],
  tig:    ["tig_flurry", "tig_slash", "tig_taunt", "tig_stance"],
  fricle: ["fricle_vine", "fricle_lash", "fricle_plan", "fricle_fry"],
};

// 고학년 스킬는 **덱 밖**이다(기획서). 게이지를 비용만큼 써서 AP 없이 쓴다 —
// combat.js 의 ultOf/useUlt 가 기획서에서 직접 읽는다. 여기 ego 카드는 그때까지의 자취다.

// 나머지 — 전투 보상으로만 나온다
export const EXTRA = {};
for (const c of Object.values(CARDS)) {
  if (!c.hero || c.temp || c.ego || c.steady) continue;
  if (STARTER[c.hero] && !STARTER[c.hero].includes(c.id)) (EXTRA[c.hero] = EXTRA[c.hero] || []).push(c.id);
}

// 적어 둔 것이 실제로 있는 카드인지 — 오타 한 글자에 시작덱이 조용히 비면 안 된다
for (const [h, ids] of Object.entries(STARTER))
  for (const id of ids) if (!CARDS[id]) throw new Error(`시작덱에 없는 카드: ${h} → ${id}`);

// 교주 카드는 시작 덱에서 뺐다 — 기획서에 없고, 세계관 규칙에도
// "교주는 카드를 내는 사람이지 싸우는 사람이 아니다" 라고 적혀 있다.
// 카드 자체는 남겨 둔다. 나중에 유물이나 이벤트 보상으로 쓸 자리가 있을 수 있다.
export const CULT_DECK = [];
