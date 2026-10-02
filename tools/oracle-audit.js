// 신탁이 기본 카드보다 나은지 센다 — 사도 고유 카드 2,700개 + 교주 카드 215개.
//
//   node tools/oracle-audit.js            숫자만
//   node tools/oracle-audit.js --list     어기는 신탁을 하나씩
//   node tools/oracle-audit.js --json 파일  어기는 신탁을 JSON 으로(고치는 스크립트가 읽는다)
//   node tools/oracle-audit.js --doc 파일   다른 기획서(옛 사본)를 센다
//
// 값은 tools/lib/card-value.js cardValue — 규칙은 oracleRules(check-hero · check-gear 와 같은 것).
//   손해     코스트 기준 값어치가 기본 이하(r ≤ 1)
//   하나 마나 1 < r < 1.1
//   소멸     기본에 없는 소멸을 붙인 신탁
import fs from "node:fs";
import { DESIGN_DOC } from "./lib/paths.js";
import { parseHeroBlock } from "./lib/hero-block.js";
import { parseNeutral } from "./lib/neutral-block.js";
import { parseEffect } from "../js/effects.js";
import { oracleVs, oracleRules, tagsOf } from "./lib/card-value.js";

const args = process.argv.slice(2);
const text = fs.readFileSync(args.includes("--doc") ? args[args.indexOf("--doc") + 1] : DESIGN_DOC, "utf8").replace(/\r\n/g, "\n");

const cards = [];   // {who, ko, base:{fx,cost,tags}, oracles:[{n, ko, text, fx}]}
for (const raw of text.split(/^### /m).slice(1)) {
  const h = parseHeroBlock(raw);
  if (!h) continue;
  const kws = h.keyword ? [h.keyword.ko] : [];
  for (const u of h.unique) {
    const fx = parseEffect(u.text, { keywords: kws }).fx;
    cards.push({ who: h.ko, ko: u.ko, base: { fx, cost: u.cost, tags: [...u.tags, ...tagsOf(fx)] },
      oracles: u.flash.map((f) => ({ n: f.n, ko: f.ko, text: f.text, fx: parseEffect(f.text, { keywords: kws }).fx })) });
  }
}
for (const c of Object.values(parseNeutral(text))) {
  const fx = parseEffect(c.text).fx;
  cards.push({ who: "교주", ko: c.ko, zero: c.cost === 0, base: { fx, cost: c.cost, tags: [...c.tags, ...tagsOf(fx)] },
    oracles: c.flash.map((f) => ({ n: f.n, ko: f.ko, text: f.text, fx: parseEffect(f.text).fx })) });
}

const tally = (list) => {
  const t = { all: 0, loss: 0, trivial: 0, gone: 0, goneAdded: 0, up: 0, upWeak: 0, bad: 0, cardsBad: 0 };
  for (const c of list) {
    const errs = oracleRules(c.base, c.oracles.map((o) => ({ fx: o.fx, at: o.ko })));
    if (errs.length) t.cardsBad++;
    for (const o of c.oracles) {
      const v = oracleVs(c.base, o.fx);
      t.all++;
      if (v.r <= 1) t.loss++; else if (v.r < 1.1) t.trivial++;
      if (v.gone) t.gone++;
      if (v.gone && !v.baseGone) t.goneAdded++;
      if (v.up) { t.up++; if (v.total < 1.6) t.upWeak++; }
    }
    t.bad += errs.filter((e) => !/^소멸 신탁이/.test(e)).length + errs.filter((e) => /^소멸 신탁이/.test(e)).length;
  }
  return t;
};
const show = (name, t) => console.log(`${name}: 신탁 ${t.all} — 손해 ${t.loss} · 하나 마나 ${t.trivial} · 소멸 ${t.gone}(기본에 없던 것 ${t.goneAdded}) · 코스트 올림 ${t.up}(1.6배 밑 ${t.upWeak}) · 규칙 어김 ${t.bad}건 / 카드 ${t.cardsBad}장`);
show("사도", tally(cards.filter((c) => c.who !== "교주")));
show("교주", tally(cards.filter((c) => c.who === "교주")));

const out = [];
for (const c of cards) {
  const errs = oracleRules(c.base, c.oracles.map((o) => ({ fx: o.fx, at: `${"①②③④⑤"[o.n - 1]} ${o.ko}` })));
  if (!errs.length) continue;
  out.push({ who: c.who, ko: c.ko, cost: c.base.cost, errs,
    oracles: c.oracles.map((o) => { const v = oracleVs(c.base, o.fx); return { n: o.n, ko: o.ko, text: o.text, r: +v.r.toFixed(2), total: +v.total.toFixed(2), raw: +v.raw.toFixed(2), co: v.co, gone: v.gone }; }) });
}
if (args.includes("--list")) for (const c of out) {
  console.log(`\n${c.who} 「${c.ko}」 (${c.cost}코)`);
  for (const e of c.errs) console.log(`  ! ${e}`);
}
if (args.includes("--json")) fs.writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(out, null, 1));
