// 번뜩임 — 판을 도는 동안 덱 전체에 붙는 성질. 카제나의 '번뜩임'에서 가져왔다.
// 카드를 한 장 더 받는 것과 달리, 이건 덱이 무엇을 하는 덱인지를 정한다.
// 전투가 끝날 때마다 카드 한 장 / 번뜩임 하나 중에 고른다.
//
//   at  언제 듣는가 — combat.js 가 이 키로 찾는다
//   v   수치
//   once true 면 한 판에 한 번만 고를 수 있다 (기본은 겹쳐 쌓인다)
//   also 같은 번뜩임이 들고 있는 다른 효과 (성급한 손의 '손패 한 장 적게')

export const TRAITS = {
  edge: { ko: "날 선 손끝", at: "attack", v: 1, text: "공격 카드의 피해 +1." },
  wall: { ko: "든든한 뒷배", at: "block", v: 2, text: "방어 카드의 방어도 +2." },
  venom: { ko: "독한 마음", at: "poison", v: 2, text: "중독을 줄 때 +2." },
  talk: { ko: "말이 통한다", at: "combo", v: 1, text: "연계가 터지면 카드를 1장 더 뽑는다." },
  eye: { ko: "눈치", at: "opening", v: 1, text: "전투를 시작할 때 카드를 1장 더 뽑는다." },

  // ── SP 를 다루는 것들 — 기력을 없앤 자리를 이쪽이 메운다 ─────────────
  coffer: { ko: "곳간", at: "snacksp", v: 1, text: "간식 카드를 내면 SP +1." },
  deep: { ko: "깊은 숨", at: "spopen", v: 4, text: "전투를 시작할 때 SP +4.", once: true },
  thrift: { ko: "여축", at: "spcap", v: 3, text: "SP 상한 +3. 더 모아 둘 수 있다.", once: true },

  // ── 값을 치르는 것들 — 이게 있어야 고르는 재미가 난다 ────────────────
  rush: { ko: "성급한 손", at: "spturn", v: 1, text: "매 턴 SP +1. 대신 손패가 한 장 적다.", once: true, also: { handdown: 1 } },
  brink: { ko: "막판 힘", at: "brink", v: 5, text: "SP가 2 이하일 때 모든 피해 +5.", once: true },
};

for (const [id, t] of Object.entries(TRAITS)) t.id = id;

// 고를 수 있는 것 셋을 뽑는다. 이미 가진 once 는 빼고.
export function offerTraits(rng, have, n = 3) {
  const pool = Object.values(TRAITS).filter((t) => !(t.once && have.includes(t.id)));
  const out = [];
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out.map((t) => t.id);
}

// have 안에 그 번뜩임이 몇 개인지 — 겹쳐 쌓이는 것들 때문에 필요하다.
export function traitSum(have, at) {
  let v = 0;
  for (const id of have) {
    const t = TRAITS[id];
    if (!t) continue;
    if (t.at === at) v += t.v;
    if (t.also && t.also[at]) v += t.also[at];
  }
  return v;
}
