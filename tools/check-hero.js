// 사도 한 명(또는 여럿)의 기획서 글이 게임에서 **실제로 도는지** 본다.
//
//   node tools/check-hero.js 파일.md [파일2.md …]     새로 쓴 사도 글(### 로 시작)
//   node tools/check-hero.js --design                  기획서 전체 (저장소 맨 위 트릭컬_기획서_전체.md)
//   node tools/check-hero.js --design --only 네르,티그
//   node tools/check-hero.js .omc/v4/란.md --bless --v4   v4 리뉴얼 글(축복 셋 · 강화 길 하나)
//
// 패시브·키워드는 js/passive.js 가, 카드는 js/effects.js 가 읽는다. 여기서 못 읽은 말은
// 게임에서 아무 일도 안 한다 — 글로만 있는 패시브를 다시 만들지 않으려고 이 검사가 있다.
// 문법은 docs/07-스킬구성.md.
import { DESIGN_DOC } from "./lib/paths.js";
import fs from "node:fs";
import { parseHeroBlock, slug } from "./lib/hero-block.js";
import { parsePassive, parseKeyword } from "../js/passive.js";
import { parseEffect, parseBless } from "../js/effects.js";
import D from "../js/data/design.js";
import { valueOf, baseValue, flashCost, oracleRules, tagsOf } from "./lib/card-value.js";

const args = process.argv.slice(2);
const DESIGN = DESIGN_DOC;
const needBless = args.includes("--bless");   // v3 — 고유 카드마다 「✦ 축복」 이 있어야 한다
// v4 시범 여섯(docs/15) — 고유 카드마다 축복 셋
const V4_PILOT = new Set(["에르핀", "네르", "티그", "비비", "나이아", "엘레나"]);
// --v4 — 넘긴 글의 사도를 모두 v4 로 본다(전체 리뉴얼 묶음 · tools/merge-v4.js 가 .omc/v4/*.md 를 넘긴다)
// --design — 135명 모두 v4 로 들어왔다(docs/15). 기획서 전체를 볼 때는 누구나 v4 다.
const V4 = { has: (ko) => args.includes("--v4") || args.includes("--design") || V4_PILOT.has(ko) };
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] || "").split(",").filter(Boolean) : [];
const files = args.includes("--design") ? [DESIGN] : args.filter((a) => a.endsWith(".md"));
if (!files.length) { console.log("쓰는 법: node tools/check-hero.js 파일.md | --design"); process.exit(2); }

const STATUS = ["취약", "약화", "기절", "도발", "침묵", "감전", "중독", "힘"];
const ULT_COST = [150, 200, 250, 300];
const TYPES = ["공격", "스킬", "강화"];   // 카드 종류는 셋(2026-10 — 방어 · 회복 카드는 스킬)
const FLASH = ["강화", "경량", "연계", "변형", "각성"];
// 원작에 SP 회복기가 있는 사도(docs/11 §2-1 · §3-2) — 파티 SP 를 주던 사도와 자기 SP 를 채우던 사도. 이들만 0코 신탁을 둔다
const SP_HEROES = new Set(["스피키", "바리에", "캬롯", "우이", "오르", "죠안", "키샤", "뮤트", "아멜리아", "포셔", "우이(기억)",
  "오팔", "스패럿", "시저", "아라그니아", "에스피",
  // 탱커 — 이드 · 리코타 · 실비아 · 레비(졸업)는 아군 SP, 빅우드 · 셀리네 · 아사나 · 코미는 자기 SP
  "이드", "리코타", "실비아", "레비(졸업)", "빅우드", "셀리네", "아사나", "코미",
  // 딜러 — 요미 · 아르코는 아군 SP 도, 나머지는 자기 SP(처치 · 피격 · N번째 공격 · 고학년 · 전투 시작)
  "에르핀(왕도)", "에르핀", "캐시", "아야", "제이드", "니콜", "리츠", "시스트", "앨리스", "롤렛", "스키아",
  "티그", "아르코", "모모", "요미", "샤샤", "리스티",
  // 개성 점검(2026-10)에서 놓친 것 — 어사이드 「분노 정화 인형」(저학년 뒤 자기 SP 30%)
  "셰이디(역전)"]);

let heroes = 0, bad = 0, pieces = 0, read = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  for (const raw of text.split(/^### /m).slice(1)) {
    const errs = [], notes = [];
    const h = parseHeroBlock(raw, (m) => errs.push(m));
    if (!h) continue;
    if (only.length && !only.includes(h.ko) && !only.includes(slug(h.ko))) continue;
    heroes++;
    const kwName = h.keyword ? h.keyword.ko : null;
    const kws = kwName ? [kwName] : [];

    // ── 스탯은 그대로여야 한다(위치·역할에서 나온다) ──
    const old = D.heroes[slug(h.ko)];
    if (old) for (const k of ["hp", "atk", "def", "crit"]) if (old[k] !== h[k]) errs.push(`스탯 ${k} 가 바뀌었다 (${old[k]} → ${h[k]}) — 스탯은 건드리지 않는다`);
    if (!old && files[0] !== DESIGN) notes.push("기획서에 없는 이름이다 — 이름을 기획서와 똑같이 적는다");

    // ── 패시브 ──
    const rules = parsePassive(h.passive || "", kws);
    if (!rules.length) errs.push("패시브가 없다");
    // 패시브는 둘까지(엘다인 패시브도 센다 · docs/14 §2) — 이름 하나에 문장이 여럿이어도 하나다
    { const names = [...new Set(rules.map((r) => r.name))]; if (needBless && names.length > 2) errs.push(`패시브가 ${names.length}개 — 둘까지(${names.join(" · ")}). 열마다 다른 줄은 한 패시브의 문장으로`); }
    let passiveDoes = 0;
    for (const r of rules) {
      pieces++;
      const what = r.fx.map(fxLabel).join(", ");
      if (!r.fx.length) errs.push(`패시브 「${r.name}」 — 효과를 하나도 못 읽었다: ${r.text}`);
      else { read++; passiveDoes++; }
      if (r.left) errs.push(`패시브 「${r.name}」 — 못 읽은 말: 「${r.left}」 (${r.text})`);
      for (const c of r.conds) if (c.c === "stack" && c.id !== kwName && !STATUS.includes(c.id)) errs.push(`패시브 조건의 「${c.id}」 는 이 사도의 키워드가 아니다`);
      if (r.when.on === "stackReach" && r.when.id !== kwName) errs.push(`패시브 「${r.name}」 — 「${r.when.id}」 는 이 사도의 키워드가 아니다`);
      notes.push(`패시브 ${r.name}: [${whenLabel(r.when)}${r.conds.length ? " · " + r.conds.map(condLabel).join(" · ") : ""}${r.limit ? ` · ${r.limit.per === "turn" ? "턴당" : "전투당"} ${r.limit.n}회` : ""}] → ${what || "없음"}`);
      for (const f of r.fx) sane(f, `패시브 「${r.name}」`, errs, r.when.on === "always");
      capRule(r, `패시브 「${r.name}」`, errs);
      // 조건은 한 겹까지 — 장수 거르개(「스킬」 · 「1코 이상」) · 「한 턴에」 · 조건(「X」가 N개 이상이면 …)을 겹으로 센다.
      // 선 열(「전열에 서 있으면」)은 편성에서 정해지는 갈래라 세지 않는다(docs/14 §2)
      if (needBless) { const ly = layers(r); if (ly.length > 1) errs.push(`패시브 「${r.name}」 — 조건이 ${ly.length}겹(${ly.join(" + ")}). 하나만 남긴다: ${r.text}`); }
      // 늘 켜진 % 증감만 하는 패시브 — 원작 어사이드 「모든 아군 피해량 증가」 를 그대로 옮긴 꼴이다.
      // 전투에서 보이지도 않고 누구 것인지도 모른다. 조건(언제·「X」가 있으면)이나 키워드와 엮는다.
      const MODS = ["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"];
      if (r.when.on === "always" && !r.conds.length && r.fx.length && r.fx.every((f) => MODS.includes(f.k)))
        errs.push(`패시브 「${r.name}」 — 늘 켜진 % 증감뿐이다. 언제 발동하는지(카드 N장마다·처치하면·맞으면…)나 키워드와 엮어 덱빌딩답게`);
      if (r.when.on === "fightStart" && r.fx.length && r.fx.every((f) => MODS.includes(f.k) && (f.turns || 1) >= 999))
        errs.push(`패시브 「${r.name}」 — 「전투 시작 시 이번 전투 동안 ~%」 는 늘 켜진 % 와 같다. 덱빌딩답게 바꾼다`);
    }

    // ── 키워드 ──
    let kw = null;
    if (h.keyword) {
      kw = parseKeyword(kwName, h.keyword.text, kws);
      for (const l of kw.left) errs.push(`키워드 「${kwName}」 — 못 읽은 문장: 「${l}」`);
      for (const r of kw.rules) capRule(r, `키워드 「${kwName}」 규칙`, errs);
      notes.push(`키워드 ${kwName}: ${kw.carrier === "self" ? "자기 것" : kw.carrier === "enemy" ? "적에게 거는 표식" : "아군에게 씌우는 것"}`
        + `${kw.cap != null ? ` · 최대 ${kw.cap}` : ""}${kw.decay ? ` · 턴마다 ${kw.decay === "all" ? "전부" : "-" + kw.decay}` : ""}`
        + `${kw.per.length ? " · 1개당 " + kw.per.map(perLabel).join(", ") : ""}${kw.rules.length ? ` · 규칙 ${kw.rules.length}` : ""}`);
      for (const p of kw.per) if (p.v && kw.cap && Math.abs(p.v * kw.cap) > 0.4) errs.push(`키워드 1개당 ${perLabel(p)} × 최대 ${kw.cap} = ${Math.round(p.v * kw.cap * 100)}% — 너무 크다(40% 까지)`);
      if (!kw.per.length && !kw.rules.length) {
        // 카드가 스택을 소모·조건으로 쓰면 그걸로 충분하다 — 아래에서 센다
      }
    }

    // ── 카드 ──
    const cards = [
      ...h.start.map((c) => ({ ...c, where: `시작 「${c.ko}」` })),
      ...h.unique.flatMap((u) => [{ ...u, where: `고유 「${u.ko}」` }, ...u.flash.map((f) => ({ ...f, where: `「${u.ko}」 ${f.kind} 「${f.ko}」` }))]),
      ...(h.ult ? [{ ...h.ult, where: `고학년 스킬 「${h.ult.ko}」` }] : []),
    ];
    let makes = 0, uses = 0;
    for (const c of cards) {
      pieces++;
      const { fx, left } = parseEffect(c.text, { keywords: kws });
      // 효과 셋까지(docs/14 §2) — 고유 카드와 신탁. 시작 카드 · 고학년 스킬은 세지 않는다
      if (needBless && !c.where.startsWith("시작") && !c.where.startsWith("고학년")) { const n = effCount(fx); if (n > 3) errs.push(`${c.where} — 효과가 ${n}개(셋까지). 「「X」가 있으면 …」 덤은 신탁 ⑤ · 축복으로 옮기거나 한 마디를 덜어낸다`); }
      if (!fx.length) errs.push(`${c.where} — 효과를 하나도 못 읽었다: ${c.text}`);
      else read++;
      if (left) errs.push(`${c.where} — 못 읽은 말: 「${left}」`);
      for (const f of fx) {
        sane(f, c.where, errs, false);
        if (f.k === "stack" && f.id === kwName && f.v > 0) makes++;
        if ((f.k === "spend" || f.k === "ifStack" || f.k === "perStack" || (f.xStack === kwName)) && f.id === kwName) uses++;
        if (f.xStack === kwName) uses++;
      }
    }
    for (const r of rules) for (const f of r.fx) { if (f.k === "stack" && f.id === kwName && f.v > 0) makes++; if (f.k === "spend" && f.id === kwName) uses++; }
    if (kw) {
      for (const r of kw.rules) for (const f of r.fx) if (f.k === "stack" && f.id === kwName && f.v > 0) makes++;
      if (!makes) errs.push(`키워드 「${kwName}」 를 쌓는 곳이 없다 (카드·패시브에 「${kwName}」 +N)`);
      if (!uses && !kw.per.length && !kw.rules.length && !rules.some((r) => r.conds.some((c) => c.id === kwName) || r.when.id === kwName))
        errs.push(`키워드 「${kwName}」 가 하는 일이 없다 — 1개당 효과, 「${kwName}」가 N개가 되면, 카드의 소모·조건 가운데 하나는 있어야 한다`);
    }

    // ── 코스트 (docs/07-스킬구성.md §7) ──
    // 기본 0코는 없다 — 0코는 신탁 ② 경량으로 얻는 보상이다. 3코는 사도당 한 장까지.
    // 값어치가 코스트에 비해 너무 크면(1.5배 넘게) 싸다. 너무 작으면(0.6배 밑) 참고로만 알린다.
    {
      const pe = (t) => parseEffect(t, { keywords: kws }).fx;
      let three = 0, zero = 0;
      const ratios = [];
      h.unique.forEach((u, i) => {
        const fx = pe(u.text);
        if (u.cost === 0) errs.push(`고유 「${u.ko}」 — 기본 0코는 없다. 1코로 올리고 효과를 1코 값어치로(0코는 ② 경량으로)`);
        if (u.cost === 3) three++;
        // 시그니처 코스트는 원작 저학년 주기(SP 총량 ÷ 초당 SP)에서 — 자주 쓰면 1코, 보통 2코, 드물고 큰 기술 3코(docs/11 §3-3)
        if (i === 0 && !(u.cost === 1 || u.cost === 2 || u.cost === 3 || u.cost === "X")) errs.push(`시그니처 「${u.ko}」 — 1~3코 또는 X (${u.cost}코)`);
        if (typeof u.cost === "number" && u.cost >= 1) {
          const r = valueOf(fx) / baseValue(u.cost);
          ratios.push(r);
          const cap = h.eldain ? 1.75 : 1.5;     // 엘다인은 체급이 한 단계 위다
          if (r > cap) errs.push(`고유 「${u.ko}」 — ${u.cost}코에 비해 너무 세다 (값어치 ${r.toFixed(1)}배 · ${cap}배까지)`);
          if (u.cost === 3 && r < 0.8) errs.push(`고유 「${u.ko}」 — 3코인데 약하다 (값어치 ${r.toFixed(1)}배 · 한 턴을 다 쓰는 값을 해야 한다)`);
          if (r < 0.6 && u.cost < 3) notes.push(`참고 「${u.ko}」 ${u.cost}코 값어치 ${r.toFixed(1)}배 — 키워드 값이면 괜찮다`);
        }
        // 신탁
        // 옛 틀(① 강화 ② 경량 …)만 ② 가 코스트를 내린다. 자유 신탁(분류 없음)은 자리마다 정해진 일이 없다
        const light = u.flash.some((f) => f.kind) ? u.flash[1] : null;
        if (light) {
          const lfx = pe(light.text);
          const lc = flashCost(u.cost, lfx);
          const givesAp = fx.some((f) => f.k === "ap" && f.v > 0) || lfx.some((f) => f.k === "ap" && f.v > 0);
          const tagged = lfx.some((f) => f.k === "tag" && (f.id === "보존" || f.id === "개전"));
          if (givesAp) {
            if (lc === 0) errs.push(`「${u.ko}」 ② 경량 — AP 를 주는 카드는 0코가 되면 안 된다(무한 고리). 보존·개전으로`);
          } else if (typeof u.cost === "number" && lc !== u.cost - 1)
            errs.push(`「${u.ko}」 ② 경량 — 코스트를 1 내린다(\`코스트 ${u.cost - 1}.\` 로 시작) (지금 ${lc}코)`);
        }
        u.flash.forEach((f) => {
          const ffx = pe(f.text);
          const c = flashCost(u.cost, ffx);
          const nm = f.kind || `「${f.ko}」`;
          // 코스트를 올려 크게 만든 신탁에 소멸까지 붙이지 않는다 — 비싸게 사서 한 번 쓰고 버리는 꼴(사용자 기준)
          if (!f.kind && typeof u.cost === "number" && c > u.cost && ffx.some((x) => x.k === "tag" && x.id === "소멸")) errs.push(`「${u.ko}」 ${nm} — 코스트를 올린 신탁에 소멸을 같이 붙이지 않는다`);
          // 새 틀 신탁(분류 없음)은 0코로 내리지 않는다 — 거의 모든 1코 카드에 0코 신탁이 있어 어디서나 독식했다(docs/11 §3-2).
          // 템포는 AP 회복(원작 SP 사도)으로 굴린다. 기본 카드가 0코면 그대로 둔다
          // 원작에 SP 회복기가 있는 사도만 0코 신탁을 둔다 — SP 는 AP 또는 패 순환. 0코는 드로우 · 버리기로 패를 굴린다(사도당 둘까지)
          if (!f.kind && c === 0 && u.cost !== 0) {
            if (!SP_HEROES.has(h.ko)) errs.push(`「${u.ko}」 ${nm} — 신탁을 0코로 내리지 않는다(원작 SP 회복기 사도만 · 1코까지만)`);
            else {
              zero++;
              if (!ffx.some((x) => x.k === "draw" || x.k === "discard")) errs.push(`「${u.ko}」 ${nm} — 0코 신탁은 패를 굴린다(드로우 · 버리기)`);
            }
          }
          if (c === 0) {
            if (ffx.some((x) => x.k === "ap" && x.v > 0)) errs.push(`「${u.ko}」 ${nm} — 0코 카드가 AP 를 주면 끝없이 이어진다`);
            const dr = ffx.filter((x) => x.k === "draw").reduce((a, x) => a + x.v, 0);
            if (dr >= 2 && !ffx.some((x) => x.k === "tag" && x.id === "소멸")) errs.push(`「${u.ko}」 ${nm} — 0코에 드로우 ${dr} 은 소멸을 붙인다`);
            // 공짜 카드가 크면 한 번만 — 에슈르 「고대 마법서 필사본」 ⑤ 가 0코에 전투 내내 공격력 +20% 였다
            // ② 경량은 같은 카드를 공짜로 만드는 보상이다 — 기본 카드보다 세지만 않으면 된다
            if (f.kind === "경량") { if (valueOf(ffx) > valueOf(fx) * 1.05) errs.push(`「${u.ko}」 경량 — 0코판이 기본 카드보다 세다`); }
            else if (valueOf(ffx) > 1.0 && !ffx.some((x) => x.k === "tag" && x.id === "소멸"))
              errs.push(`「${u.ko}」 ${nm} — 0코인데 효과가 크다(값어치 ${valueOf(ffx).toFixed(1)}) — 줄이거나 소멸을 붙인다`);
          }
          if (c === 3 && u.cost !== 3) three++;
        });
        // 신탁은 기본보다 나아야 한다 — 손해 · 하나 마나 · 소멸 남발 금지(tools/lib/card-value.js oracleRules · docs/12-신탁.md)
        for (const e of oracleRules({ fx, cost: u.cost, tags: [...u.tags, ...tagsOf(fx)] }, u.flash.map((f) => ({ fx: pe(f.text), at: `「${u.ko}」 ${f.kind || `「${f.ko}」`}` }))))
          errs.push(e.startsWith("「") ? e : `「${u.ko}」 ${e}`);
      });
      // 엘다인 — 세계수의 힘을 받은 사도. 원작에서도 기본 스펙이 높다. 고유 카드가 코스트 값어치의 평균 1.1배는 된다
      // (다른 사도는 평균 0.85배 안팎)
      if (h.eldain && ratios.length) {
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        if (avg < 1.1) errs.push(`엘다인인데 고유 카드 체급이 보통 사도와 같다 (평균 ${avg.toFixed(2)}배 · 1.1배 이상)`);
        notes.push(`엘다인 체급 평균 ${avg.toFixed(2)}배`);
      }
      // 전부 1코는 이제 된다 — 원작 저학년이 잦은 가벼운 덱(합 4)
      if (zero > 2) errs.push(`0코 신탁은 사도당 둘까지 (${zero}개)`);
      if (h.unique.filter((u) => u.cost === 3).length > 2) errs.push(`3코 고유 카드는 사도당 두 장까지 (${h.unique.filter((u) => u.cost === 3).length}장)`);
      // 덱 무게 — 고유 카드 넷 코스트 합(X 는 2): 가벼움 4~5 · 보통 6~7 · 무거움 8~9
      { const sum = h.unique.reduce((a, u) => a + (u.cost === "X" ? 2 : u.cost), 0); if (sum < 4 || sum > 9) errs.push(`고유 카드 넷 코스트 합 ${sum} — 4~9 안으로(가벼움 4~5 · 보통 6~7 · 무거움 8~9)`); }
    }

    // ── 모양 ──
    if (h.ult && !ULT_COST.includes(h.ult.cost)) errs.push(`고학년 스킬 비용 ${h.ult.cost}% — 150·200·250·300 가운데 하나`);
    for (const c of h.start) if (!TYPES.includes(c.type)) errs.push(`시작 「${c.ko}」 타입 「${c.type}」 — 공격·스킬·강화 가운데 하나(방어 · 회복은 스킬)`);
    for (const u of h.unique) {
      if (!TYPES.includes(u.type)) errs.push(`고유 「${u.ko}」 타입 「${u.type}」 — 공격·스킬·강화 가운데 하나`);
      // 자유 신탁(분류 없음 — 카드마다 다른 다섯 갈래)이면 다섯 모두 자유여야 한다. 아니면 옛 틀의 차례대로
      const free = u.flash.every((f) => !f.kind);
      if (!free) u.flash.forEach((f, i) => { if (f.kind !== FLASH[i]) errs.push(`「${u.ko}」 신탁 ${i + 1}번이 「${f.kind || "(분류 없음)"}」 — 「${FLASH[i]}」 여야 한다(자유 신탁이면 다섯 모두 분류 없이)`); });
    }
    // ── 겨우살이의 축복(사도 고유, v3) — 「✦ *이름*: 효과」, 카드당 셋까지(받을 때 하나를 고른다) ──
    // v4 사도(docs/15)는 카드마다 셋. 셋은 서로 다른 꼴이어야 고르는 맛이 난다(배율 · 태그/코스트 · 그 사도다운 덤)
    {
      const anyBless = h.unique.some((u) => u.bless);
      for (const u of h.unique) {
        const list = u.blesses || (u.bless ? [u.bless] : []);
        if (!list.length) { if (needBless || anyBless) errs.push(`「${u.ko}」 — 축복 줄(「✦ *이름*: 효과」)이 없다`); continue; }
        if (list.length > 3) errs.push(`「${u.ko}」 — 축복이 ${list.length}개(셋까지)`);
        if (needBless && V4.has(h.ko) && list.length !== 3) errs.push(`「${u.ko}」 — v4 사도는 축복이 셋이어야 한다 (${list.length}개)`);
        const shapes = new Set(), names = new Set();
        for (const bl of list) {
          pieces++;
          if (names.has(bl.ko)) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 같은 카드에 같은 이름이 둘`);
          names.add(bl.ko);
          const b = parseBless(bl.text, { keywords: kws });
          if (!b.kind && !b.fx.length) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 효과를 못 읽었다: ${bl.text}`); else read++;
          if (b.left) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 못 읽은 말: 「${b.left}」`);
          if (b.kind === "cost" && !(typeof u.cost === "number" && u.cost >= 2)) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 코스트 -1 은 2코 이상 카드만(0코가 되면 안 된다)`);
          const base = valueOf(parseEffect(u.text, { keywords: kws }).fx) || 0.5;
          // 축복의 보존 · 개전 — 그 카드가 손에 남는다 · 첫 손패에 든다(js/combat.js blessTag). 덤 0.3 으로 친다
          const extra = valueOf(b.fx) + b.fx.filter((f) => f.k === "tag" && (f.id === "보존" || f.id === "개전")).length * 0.3;
          if (b.fx.some((f) => f.k === "tag" && f.id === "소멸")) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 소멸은 축복에 붙이지 않는다`);
          // 공용 풀이 ×1.3 이다 — 고유 축복도 그 언저리: 덤은 기본 카드 값의 15~60%, 배율과 덤을 같이 쓰면 덤은 30% 까지
          const cap = b.kind ? 0.3 : 0.6;
          if (extra > base * cap + 0.05) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 덤이 너무 크다 (값어치 ${extra.toFixed(2)} · 기본의 ${Math.round(cap * 100)}% = ${(base * cap).toFixed(2)} 까지)`);
          if (!b.kind && extra < base * 0.1 - 0.05) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 덤이 너무 작다 (값어치 ${extra.toFixed(2)} · 기본의 10% 이상)`);
          for (const f of b.fx) { sane(f, `「${u.ko}」 축복`, errs, false); if (f.k === "ap" && f.v > 0 && !(typeof u.cost === "number" && u.cost >= 1)) errs.push(`「${u.ko}」 축복 — 0코 카드에 AP 금지`); }
          // 꼴 — 배율 + 덤 종류. 한 카드의 축복끼리 같은 꼴이면 고를 까닭이 없다
          const shape = `${b.kind || "-"}|${b.fx.map((f) => f.k === "tag" ? "tag:" + f.id : f.k).sort().join(",")}`;
          if (shapes.has(shape)) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 같은 카드의 다른 축복과 꼴이 같다(${shape})`);
          shapes.add(shape);
          notes.push(`축복 ${u.ko} → ${bl.ko}: ${b.kind || "-"}${b.fx.length ? " + " + b.fx.map(fxLabel).join(", ") : ""}`);
        }
      }
    }
    // ── 강화 카드(js/rules.js isPower · docs/15 §7) — 사도마다 한 장까지, 버프는 「판 내내」 ──
    // 한 장만 · 쓰면 사라짐(판의 덱에서도) · 판 내내. 그래서 기본 카드와 신탁 다섯이 모두 「판 내내 …」 증감을 하나는 든다.
    // 「판 내내」 는 강화 카드에만 쓴다 — 다른 카드 · 패시브 · 고학년 · 축복에 쓰면 판에 쌓인다
    {
      const pe = (t) => parseEffect(t, { keywords: kws }).fx;
      const MODS = ["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"];
      const boons = (fx) => fx.filter((f) => MODS.includes(f.k) && f.run);
      // 강화 길 — 기본이 강화인 고유 카드, 또는 신탁 하나가 「강화 카드.」 로 시작하는 고유 카드(그 신탁을 고르면 강화 카드가 된다)
      const marked = (t) => pe(t).some((f) => f.k === "tag" && f.id === "강화");
      const paths = [...h.unique.filter((u) => u.type === "강화").map((u) => `「${u.ko}」`),
        ...h.unique.filter((u) => u.type !== "강화").flatMap((u) => u.flash.filter((f) => marked(f.text)).map((f) => `「${u.ko}」 신탁 「${f.ko}」`))];
      if (paths.length > 1) errs.push(`강화 길이 ${paths.length}개(${paths.join(" · ")}) — 사도마다 하나까지(기본 카드 하나 또는 신탁 하나)`);
      if (paths.length) notes.push(`강화 카드: ${paths[0]}`);
      for (const u of h.unique) {
        const list = [{ text: u.text, at: `고유 「${u.ko}」`, power: u.type === "강화" }, ...u.flash.map((f) => ({ text: f.text, at: `「${u.ko}」 「${f.ko}」`, power: u.type === "강화" || marked(f.text) }))];
        for (const x of list) {
          const b = boons(pe(x.text));
          if (u.type === "강화" && marked(x.text)) errs.push(`${x.at} — 이미 강화 카드다. 「강화 카드.」 를 적지 않는다`);
          if (!x.power) { if (b.length || /판\s*내내/.test(x.text)) errs.push(`${x.at} — 「판 내내」 는 강화 카드에만`); continue; }
          if (!b.length) errs.push(`${x.at} — 강화 카드는 「판 내내 자신 …+N%」 증감을 하나 든다(신탁도)`);
          if (b.length > 2) errs.push(`${x.at} — 판 내내 증감이 ${b.length}개(둘까지)`);
          for (const f of b) {
            // 강화 카드는 자기 자신만 강화한다(2026-10 사용자) — 아군 전원 · 다른 아군에게 거는 판 내내는 안 된다
            const cap = 0.2;
            if (f.v < 0 ? f.k !== "takenMod" : f.k === "takenMod") errs.push(`${x.at} — 판 내내는 제 편에 좋은 것만(${fxLabel(f)})`);
            if (Math.abs(f.v) > cap + 1e-9) errs.push(`${x.at} — 판 내내 ${fxLabel(f)} 는 크다(자신 20% 까지 — 판 끝까지 쌓인다)`);
            if (f.target !== "self") errs.push(`${x.at} — 강화 카드의 판 내내는 자신에게만(${f.target})`);
          }
          if (pe(x.text).some((f) => f.k === "tag" && f.id === "소멸") || (u.type === "강화" && u.tags.includes("소멸"))) errs.push(`${x.at} — 강화 카드는 쓰면 사라진다. 「소멸」 을 따로 적지 않는다`);
        }
        if (u.type === "강화") for (const bl of u.blesses || (u.bless ? [u.bless] : [])) if (/판\s*내내/.test(bl.text)) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 축복에는 「판 내내」 를 쓰지 않는다(덤은 이번 전투 것)`);
      }
      for (const c of [...h.start, ...(h.ult ? [h.ult] : [])]) if (/판\s*내내/.test(c.text || "")) errs.push(`「${c.ko}」 — 「판 내내」 는 강화 카드에만`);
      if (/판\s*내내/.test(h.passive || "") || /판\s*내내/.test((h.keyword && h.keyword.text) || "")) errs.push("패시브 · 키워드 — 「판 내내」 는 강화 카드에만");
      for (const u of h.unique) if (u.type !== "강화") for (const bl of u.blesses || (u.bless ? [u.bless] : [])) if (/판\s*내내/.test(bl.text)) errs.push(`「${u.ko}」 축복 「${bl.ko}」 — 「판 내내」 는 강화 카드에만`);
    }
    // 「(턴당 N회)」 는 카드 · 고학년 스킬 글에도 쓰지 않는다(2026-10 사용자)
    for (const c of cards) if (/턴당\s*\d+\s*회/.test(c.text || "")) errs.push(`${c.where} — 「턴당 N회」 를 쓰지 않는다`);
    if (/턴당\s*\d+\s*회/.test((h.keyword && h.keyword.text) || "")) errs.push(`키워드 — 「턴당 N회」 를 쓰지 않는다`);
    if (h.unique[0] && !h.unique[0].tags.includes("시그니처")) errs.push(`첫 고유 카드에 「시그니처」 표시가 없다`);
    if (!h.source) errs.push("**원작** 줄이 없다 — 나무위키에서 무엇을 가져왔는지 한 줄");
    else if (needBless && !/^포지션\s*:/.test(h.source)) errs.push("**원작** 줄은 「포지션: …」 으로 시작한다(docs/14 §1)");

    if (errs.length) bad++;
    console.log(`\n${errs.length ? "✗" : "✓"} ${h.ko}`);
    for (const n of notes) console.log(`    ${n}`);
    for (const e of errs) console.log(`  ! ${e}`);
  }
}

console.log(`\n사도 ${heroes}명 · 문제 있는 사도 ${bad}명 · 효과 조각 ${read}/${pieces} 읽음`);
process.exit(bad ? 1 : 0);

// ── 도우미 ──
// 효과 수(docs/14 §2 「효과 셋까지」) — 읽은 조각을 센다. 쉼표 수가 아니다.
//   안 센다: 태그(보존 · 개전 · 소멸 …) · 코스트 · 대상 범위 · 「「X」 1개당」(뒤 피해의 배율)
//   하나로 센다: 「방어·실드 전부 파괴 후 N% 피해」(파괴 + 피해) · 「손패 N장 버리고 드로우 M」(버리기 + 드로우)
//   따로 센다: 「「X」가 있으면」(조건 하나) · 「「X」 N 소모」 · 그 뒤 덤 효과 하나하나 — 조건 덤도 효과다.
//   그래서 「X. 「K」가 있으면 「K」 N 소모, Y」 는 넷이다
function effCount(fx) {
  let n = 0;
  for (let i = 0; i < (fx || []).length; i++) {
    const f = fx[i];
    if (["tag", "costSet", "costDelta", "scope", "perStack"].includes(f.k)) continue;
    if (f.k === "strip" && fx[i + 1] && fx[i + 1].k === "dmg") continue;
    if (f.k === "discard" && fx[i + 1] && fx[i + 1].k === "draw") continue;
    n++;
  }
  return n;
}
// 패시브 한 줄의 조건 겹 — 장수 거르개 · 한 턴에 · 조건(선 열은 빼고)
function layers(r) {
  const w = r.when, out = [];
  if (w.every && (w.type || w.minCost)) out.push(`${w.type ? w.type + " " : ""}${w.minCost ? w.minCost + "코 이상 " : ""}카드만 셈`);
  if (w.perTurn) out.push("한 턴에");
  for (const c of r.conds) if (c.c !== "row") out.push(condLabel(c));
  return out;
}
// 횟수 제한(docs/07 §4, 2026-10 사용자 「패시브에 턴당 최대 조건 없애라」) —
//   「(턴당 N회)」 는 쓰지 않는다. 「(전투당 N회)」 는 위급할 때 한 번(HP가 N% 이하가 되면 · 처음 맞으면 · 아군이 쓰러지면)만.
//   AP · 드로우는 언제 자체가 막는 것에만 — 턴 시작 · 턴 종료 · 전투 시작 · 파티가 이번 턴 N장째 · 「X」가 N개가 되면 ·
//   이름의 1코 이상 카드를 N장(N ≥ 2 — 쓴 AP 보다 돌려받는 AP 가 늘 적다) · HP N% 이하 · 고학년 스킬. 드로우는 처치도(적 수만큼)
function STRUCT(w) {
  return ["turnStart", "turnEnd", "fightStart", "stackReach", "lowHp", "ult"].includes(w.on)
    || (w.on === "play" && !!(w.nth || (w.every >= 2 && w.minCost >= 1)));
}
function capRule(r, where, errs) {
  if (r.limit && r.limit.per === "turn") errs.push(`${where} — 「(턴당 ${r.limit.n}회)」 는 쓰지 않는다. 턴에 한 번 도는 언제(턴 시작 시 · 파티가 이번 턴 N장째 …)나 값으로 막는다`);
  if (r.limit && r.limit.per === "fight" && !["lowHp", "hurt", "allyDown"].includes(r.when.on))
    errs.push(`${where} — 「(전투당 N회)」 는 위급할 때 한 번(HP가 N% 이하가 되면 · 맞으면 · 아군이 쓰러지면)만. 여는 한 번은 「턴 시작 시 첫 턴이면」`);
  if (r.fx.some((f) => f.k === "ap" && f.v > 0) && !STRUCT(r.when)) errs.push(`${where} — AP 는 턴에 한 번 도는 언제에만(${r.text})`);
  if (r.fx.some((f) => f.k === "draw" && f.v > 0) && !STRUCT(r.when) && r.when.on !== "kill") errs.push(`${where} — 드로우는 턴에 한 번 도는 언제 · 처치에만(${r.text})`);
}
function sane(f, where, errs, always) {
  const pct = (v) => Math.round(v * 100);
  if (["dealtMod", "takenMod", "atkMod", "defMod", "critMod", "healMod"].includes(f.k)) {
    const cap = always ? 0.15 : 0.5;
    if (Math.abs(f.v) > cap) errs.push(`${where} — ${fxLabel(f)} 는 너무 크다 (${always ? "항상 걸린 것은 15%" : "50%"} 까지)`);
  }
  if (f.k === "dmg" && f.ratio > 6) errs.push(`${where} — 공격력 ${pct(f.ratio)}% 는 너무 크다`);
  if (f.k === "ap" && f.v > 3) errs.push(`${where} — AP +${f.v} 는 너무 크다`);
}
function fxLabel(f) {
  const t = f.target && f.target !== "self" ? `(${f.target})` : "";
  switch (f.k) {
    case "dmg": return `피해 ${Math.round(f.ratio * 100)}%${f.hits > 1 ? "×" + f.hits : ""}${t}`;
    case "block": return `방어 ${Math.round(f.ratio * 100)}%${t}`;
    case "shield": return `실드 ${Math.round(f.ratio * 100)}%${t}`;
    case "heal": return `회복 ${Math.round(f.ratio * 100)}%${t}`;
    case "stack": return `${f.id} ${f.v > 0 ? "+" : ""}${f.v}${t}`;
    case "spend": return `${f.id} ${f.v === "all" ? "전부" : f.v} 소모`;
    case "status": return `${f.id} ${f.turns}턴${t}`;
    case "dealtMod": case "takenMod": case "atkMod": case "defMod": case "critMod": case "healMod":
      return `${{ dealtMod: "주는 피해", takenMod: "받는 피해", atkMod: "공격력", defMod: "방어력", critMod: "치명", healMod: "회복력" }[f.k]} ${f.v > 0 ? "+" : ""}${Math.round(f.v * 100)}%${f.run ? " 판 내내" : f.turns >= 999 ? " 전투 내내" : f.turns > 1 ? ` ${f.turns}턴` : ""}${t}`;
    default: return f.k + (f.v != null ? " " + f.v : "");
  }
}
function whenLabel(w) {
  return { fightStart: "전투 시작", turnStart: "턴 시작", turnEnd: "턴 끝", play: `${w.sig ? "시그니처 " : ""}카드${w.type ? "(" + w.type + ")" : ""}${w.who === "any" ? "(파티)" : w.every ? "(자기)" : ""}${w.minCost ? ` ${w.minCost}코 이상` : ""}${w.every ? ` ${w.every}장마다` : ""}${w.nth ? ` ${w.nth}장째` : ""}`, kill: w.mine ? "처치" : "적 쓰러짐", hurt: w.who === "any" ? "아군 피격" : "피격", lowHp: `HP ${Math.round(w.pct * 100)}% 이하`, allyDown: "아군 쓰러짐", ult: "고학년 스킬", combo: "연계", rush: "적 즉시 행동", guard: `${w.who === "any" ? "아군 " : ""}${w.kind === "block" ? "방어" : w.kind === "shield" ? "실드" : "방어·실드"} 얻음`, debuff: "디버프 걺", overheal: "회복량 초과", stackReach: `${w.id} ${w.n}개`, always: "항상" }[w.on] || w.on;
}
function condLabel(c) {
  return c.c === "stack" ? `${c.id} ${c.n}+` : c.c === "hp" ? `HP ${Math.round(c.pct * 100)}% 이하` : c.c === "hpMin" ? `HP ${Math.round(c.pct * 100)}% 이상` : c.c === "foes" ? `적 ${c.n}명+`
    : c.c === "foesMax" ? `적 ${c.n}명 이하` : c.c === "playedMax" ? `파티 ${c.n}장 이하` : c.c === "playedMin" ? `파티 ${c.n}장 이상` : c.c === "ownNone" ? "자기 카드 안 냄"
    : c.c === "apLeft" ? `AP ${c.n} 남음` : c.c === "gauge" ? `게이지 ${c.n}%+` : c.c === "guarded" ? "방어·실드 있음" : c.c === "rushed" ? "적 즉시 행동했음" : c.c;
}
function perLabel(p) { return p.stat === "dot" ? `턴 끝 피해 ${Math.round(p.ratio * 100)}%` : p.stat === "hot" ? `턴 끝 회복 ${Math.round(p.ratio * 100)}%` : `${{ dealt: "주는 피해", taken: "받는 피해", atk: "공격력", def: "방어력", crit: "치명" }[p.stat]} ${p.v > 0 ? "+" : ""}${Math.round(p.v * 100)}%${p.who === "allies" ? "(아군 전원)" : ""}`; }
