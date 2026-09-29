// 유물 — 원작의 **아티팩트**를 옮긴 것.
// 원작 규칙: 한 전투 동안 장비한 사도에게만 적용 · **사도 하나당 최대 3개** · 중복 보유 시 중첩.
// 여기서도 그대로다. 골디의 가게에서 사거나 보스를 넘기면 얻는다.
//
//   at    언제 듣는가 — combat.js 가 이 키로 찾는다
//   v     수치
//   hero  true 면 사도 하나를 골라 붙인다. false 면 파티 전체에 듣는다
//
// SP 를 불리는 쪽이 중심이다 — 기력을 없애고 SP 를 모아 쓰는 게 이 게임의 축이라서다.

export const RELICS = {
  // ── SP 를 불리는 것들 ───────────────────────────────────────────────
  flag: {
    ko: "예식용 깃발", hero: true, at: "spOnPlay", v: 1,
    text: "이 사도의 카드를 낼 때 SP +1.",
    // 원작: 네르에게 쥐어 주면 애착 3레벨에 최대 체력과 SP 수급까지 보충해 준다
    from: "원작 아티팩트 '예식용 깃발'",
  },
  arrow: {
    ko: "실라의 마력 화살", hero: true, at: "discount", v: 1,
    text: "이 사도의 카드 값이 1 싸진다.",
    // 원작: 강화 평타로 SP 를 수급하는 사도에게 최우선으로 채용된다
    from: "원작 아티팩트 '실라의 마력 화살'",
  },
  dawn: {
    ko: "새벽 종", hero: false, at: "spturn", v: 1,
    text: "매 턴 SP +1.",
  },
  vault: {
    ko: "금고", hero: false, at: "spcap", v: 3,
    text: "SP 상한 +3. 더 모아 둘 수 있다.",
  },
  seed: {
    ko: "세계수 씨앗", hero: false, at: "spopen", v: 4,
    text: "전투를 시작할 때 SP +4.",
  },

  // ── 그 밖 ───────────────────────────────────────────────────────────
  whet: {
    ko: "숫돌", hero: true, at: "heroDmg", v: 3,
    text: "이 사도의 공격 +3.",
  },
  shield: {
    ko: "낡은 방패", hero: true, at: "heroBlock", v: 3,
    text: "이 사도의 방어 카드에 방어도 +3.",
  },
  ledger: {
    ko: "장부", hero: false, at: "openhand", v: 1,
    text: "전투를 시작할 때 카드를 1장 더 뽑는다.",
  },
};

for (const [id, r] of Object.entries(RELICS)) r.id = id;

// 유물 셋을 뽑는다. 이미 가진 것 중 사도별 3개 한도를 넘는 것은 빼고.
export function offerRelics(rng, have, party, n = 3) {
  const pool = Object.values(RELICS).filter((r) => {
    if (!r.hero) return true;
    // 붙일 자리가 남은 사도가 하나라도 있어야 한다
    return party.some((k) => countOn(have, k) < 3);
  });
  const out = [];
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out.map((r) => r.id);
}

export const countOn = (have, heroKey) => have.filter((x) => x.hero === heroKey).length;

// have: [{id, hero|null}] — combat.js 가 쓰기 좋은 꼴로 펴 준다
export function relicSum(have, at, heroKey) {
  let v = 0;
  for (const x of have) {
    const r = RELICS[x.id];
    if (!r || r.at !== at) continue;
    if (r.hero && x.hero !== heroKey) continue;
    v += r.v;
  }
  return v;
}
