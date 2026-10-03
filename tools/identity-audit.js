// 사도 정체성 점검 — 「이 사도로 바꾸면 카드를 내는 방법이 달라지는가?」 를 데이터로 가른다.
// 원작을 잘 옮겼는지는 보지 않는다. 사도마다 전용 키워드가 **어떻게 쌓이고(쌓는 길)** · **어떻게 쓰이는가(쓰는 길)** 를 뽑아
// 같은 꼴끼리 묶는다. 묶음이 크면 플레이가 겹친다는 뜻이고, 쓰는 길에 플레이어의 결정이 없으면(다 차면 저절로 터진다) 개성이 약하다.
//   node tools/identity-audit.js                 묶음 · 결정 없는 사도
//   node tools/identity-audit.js --meta 파일      meta-sim --json 결과를 붙여 승률을 같이 본다
//   node tools/identity-audit.js --hero 칸나      한 사도를 풀어 본다
import fs from "node:fs";
import { HERO_DATA as H, CARDS } from "../js/cardbook.js";
import { parsePassive, parseKeyword } from "../js/passive.js";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const meta = opt("meta") ? JSON.parse(fs.readFileSync(opt("meta"), "utf8")) : null;
const winOf = Object.fromEntries((meta ? meta.heroes : []).map((h) => [h.k, h.win]));

// 패시브가 일하는 때 — 사람 말로
const ON = {
  play: "카드를 낼 때", turnStart: "턴 시작", turnEnd: "턴 끝", kill: "처치", hurt: "맞을 때", break: "격파", lowHp: "HP 낮을 때",
  ult: "고학년", debuff: "디버프", guard: "방어 · 실드", overheal: "넘친 회복", fightStart: "전투 시작", rush: "즉시 행동", stackReach: "다 차면",
};
// 누가 낸 카드인가 — 그 사도의 것(by) · 아군 누구든(who any). 같은 「공격 카드」 라도 손이 다르다
const playKind = (w) => `${w.by ? "제 " : w.who === "any" ? "아군 " : ""}${w.type ? `${w.type} 카드` : w.every ? `카드 ${w.every}장마다` : "카드"}`;
const whenKo = (w) => (!w ? "?" : w.on === "play" ? playKind(w) : ON[w.on] || w.on);
const FX_KO = { dmg: "피해", status: "상태", ap: "AP", draw: "드로우", heal: "회복", shield: "실드", block: "방어", tough: "강인도", make: "카드 생성", gauge: "게이지", rushDown: "즉시 행동 늦춤", perStack: "1개당", stack: "쌓기" };

function profile(k) {
  const h = H[k];
  const kws = h.keyword ? [h.keyword.ko] : [];
  const kw = h.keyword ? (h.keywordRules || parseKeyword(h.keyword.ko, h.keyword.text, kws)) : null;
  const rules = h.passiveRules || parsePassive(h.passive, kws);
  const id = kw && kw.id;
  const has = (f) => id && JSON.stringify(f).includes(`"${id}"`);
  // 쌓는 길 — 패시브가 쌓는 때 + 카드가 쌓는 장수
  const gainBy = [...new Set(rules.filter((r) => r.fx.some((f) => f.k === "stack" && f.id === id)).map((r) => whenKo(r.when)))];
  const cards = Object.values(CARDS).filter((c) => c.hero === k && !c.plain);
  const cnt = (pred) => cards.filter((c) => (c.fx || []).some((f) => has(f) && pred(f))).length;
  const stackCards = cnt((f) => f.k === "stack" && f.v > 0);
  // 쓰는 길 — 플레이어가 고르는 것(소모 카드 · 1개당 카드 · 있으면 카드)과 저절로 되는 것(다 차면 · 1개당 능력치)
  const spend = cnt((f) => f.k === "spend" || (f.k === "dmg" && JSON.stringify(f).includes(id)));
  const scale = cnt((f) => f.k === "perStack");
  const cond = cards.filter((c) => (c.fx || []).some((f) => f.k === "ifStack" && has(f))).length;
  const reach = kw ? kw.rules.filter((r) => r.when && r.when.on === "stackReach").map((r) => r.fx.filter((f) => f.k !== "spend").map((f) => FX_KO[f.k] || f.k).join("+")) : [];
  const per = kw ? kw.per.map((p) => p.stat) : [];
  const choice = spend + scale + cond;                   // 언제 쓸지 플레이어가 고르는 카드 수
  const payoff = choice ? (spend || scale ? "모아 쓰기" : "있으면 강해짐") : reach.length ? "다 차면 저절로" : per.length ? "쌓일수록 강해짐" : "쓰는 길 없음";
  const gainMain = gainBy.length ? gainBy[0] : stackCards ? "카드로만" : "없음";
  return {
    k, ko: h.ko, role: h.role, carrier: kw ? kw.carrier : "-", kw: id, cap: kw && kw.cap,
    gainBy, gainMain, stackCards, spend, scale, cond, choice, reach, per, payoff,
    passiveOn: [...new Set(rules.filter((r) => !r.fx.some((f) => f.k === "stack" && f.id === id)).map((r) => whenKo(r.when)))],
    key: `${{ self: "제 주머니", enemy: "적 표식", ally: "아군 표식", "-": "키워드 없음" }[kw ? kw.carrier : "-"]} · ${gainMain} → ${payoff}`,
    win: winOf[k],
  };
}

const all = Object.keys(H).map(profile);

if (opt("hero")) {
  const p = all.find((x) => x.ko === opt("hero") || x.k === opt("hero"));
  if (!p) { console.log("그런 사도가 없다"); process.exit(1); }
  console.log(JSON.stringify(p, null, 1));
  process.exit(0);
}

const w = (p) => (p.win == null ? "" : ` ${Math.round(p.win)}%`);
const groups = {};
for (const p of all) (groups[p.key] = groups[p.key] || []).push(p);
const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

console.log(`사도 정체성 점검 — ${all.length}명 · 꼴 ${sorted.length}가지${meta ? ` · 승률은 meta-sim ${meta.runs}판` : ""}\n`);
console.log("쓰는 길(플레이어가 언제 쓸지 고르는가)");
const byPay = {};
for (const p of all) (byPay[p.payoff] = byPay[p.payoff] || []).push(p);
for (const [k, v] of Object.entries(byPay).sort((a, b) => b[1].length - a[1].length)) {
  const avg = v.filter((p) => p.win != null);
  console.log(`  ${k.padEnd(10)} ${String(v.length).padStart(3)}명${avg.length ? ` · 평균 ${Math.round(avg.reduce((a, p) => a + p.win, 0) / avg.length)}%` : ""}`);
}

console.log("\n꼴이 같은 묶음(셋 이상) — 묶음이 클수록 플레이가 겹친다");
for (const [key, ps] of sorted.filter(([, ps]) => ps.length >= 3)) {
  console.log(`\n■ ${key} — ${ps.length}명`);
  const byRole = {};
  for (const p of ps) (byRole[p.role] = byRole[p.role] || []).push(p);
  for (const [role, rs] of Object.entries(byRole)) console.log(`   ${role}: ${rs.sort((a, b) => (b.win ?? 0) - (a.win ?? 0)).map((p) => `${p.ko}${w(p)}`).join(" · ")}`);
}

// 다시 볼 사도 — 쓰는 길이 저절로(다 차면 · 쌓일수록)이고, 같은 꼴이 다섯 넘게 겹친다.
// 쓰는 길에 결정이 없는 사도는 훨씬 많지만(패시브 조건 · 자리 · AP 남기기 같은 결정은 이 도구가 못 본다) 겹치지 않으면 개성은 있다
const AUTO = new Set(["다 차면 저절로", "쌓일수록 강해짐"]);
const redo = all.filter((p) => AUTO.has(p.payoff) && groups[p.key].length >= 5).map((p) => ({ ...p, crowd: groups[p.key].length }));
redo.sort((a, b) => b.crowd - a.crowd || (a.win ?? 50) - (b.win ?? 50));
const auto = all.filter((p) => AUTO.has(p.payoff)).length;
console.log(`\n다시 볼 사도 ${redo.length}명 — 쓰는 길이 저절로이고 같은 꼴이 다섯 넘게 겹친다(저절로인 사도는 모두 ${auto}명)`);
for (const role of ["탱커", "서포터", "딜러"]) {
  const rs = redo.filter((p) => p.role === role);
  console.log(`  ${role} ${rs.length}명: ${rs.map((p) => `${p.ko}${w(p)}`).join(" · ")}`);
}
