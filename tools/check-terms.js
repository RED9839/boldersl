// 플레이어에게 보이는 글이 v6 용어 · 서술체 규칙을 지키는지 본다(docs/18 §11).
//
//   node tools/check-terms.js             검사
//   node tools/check-terms.js --list      걸린 곳을 전부 보인다(기본은 갈래마다 다섯 곳)
//   node tools/check-terms.js --dump 파일   모은 글을 「갈래 \t 출처 \t 글」 로 쓴다(사람이 훑어볼 때)
//
// 읽는 글 — 게임이 화면에 띄우는 것만
//   사도(설명 · 패시브 · 키워드 · 고학년) · 카드(시작 · 고유 · 신탁 · 축복) · 교주 카드 · 장비(효과 · 애착) · 골칫거리 · 선물
//   · 상태 카드 · 적(이름 · 수 · 패시브 이름) · 층 · 이벤트(이름 · 장면 · 선택지 · 결과 · 덧말) · 낱말 풀이(js/data/keywords.js)
//   · 화면 문구(js/*.js 의 문자열 — 주석 · 정규식은 빼고)
// 안 읽는 글 — 사도의 원작 대조 · 설계 메모(source — 화면에 안 나온다, js/party-screen.js), 사도 대사(talk.js),
//   저장 검사의 오류(js/save.js — 화면에 안 나온다), 개발 창(js/dev.js)
//
// 두 가지를 본다
//   1. 낡은 용어 — v6 에 없앤 것 · 이름이 바뀐 키워드 · 같은 뜻의 다른 말(표준 하나로). 카드 · 신탁 · 축복 · 패시브 · 장비 · 키워드 ·
//      고학년의 **이름**은 고유 이름이라 보지 않는다(「무적의 팽이」 · 「과전압 주의」).
//   2. 서술체 — 규칙 글(카드 · 패시브 · 키워드 · 고학년 · 장비 효과 · 풀이)은 「~한다」, 화면 안내 · 알림은 「~합니다」.
//      전투 화면(js/fight-screen.js · js/combat.js)은 전투 기록 · 상태 칩 풀이(한다)와 알림(합니다)이 섞여 있어 한 문자열 안에서만 본다.
//      이야기 글(사도 설명 · 이벤트 장면 · 선택지 · 결과 한 줄 · 적의 수)은 말투가 그 글의 몫이라 서술체를 보지 않는다.
//      문장 끝만 본다 — 괄호 안 풀이(「면역(해로운 효과 하나를 막는다)」)는 낱말 풀이라 어느 쪽이든 된다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BUILT from "../js/data/built.js";
import KW from "../js/data/keywords.js";
import { ENEMIES, FLOORS } from "../js/data/enemies.js";
import { EVENTS, CURSES, GIFTS } from "../js/data/events.js";
import { STATUS_CARDS } from "../js/data/status-cards.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const list = args.includes("--list");
const dumpTo = args.includes("--dump") ? args[args.indexOf("--dump") + 1] : null;

// ── 글 모으기 ────────────────────────────────────────────────────────
// kind: rule(규칙 글) · ui(화면 문구) · story(이야기) · name(고유 이름)
const texts = [];
const add = (where, text, kind) => { if (typeof text === "string" && /[가-힣]/.test(text)) texts.push({ where, text, kind }); };
// 「이름: 규칙 · 엘다인 「이름」: 규칙」 — 패시브 · 장비 효과의 이름은 고유 이름이라 떼어 따로 둔다
const addNamed = (where, text, kind) => {
  if (typeof text !== "string") return;
  for (const part of text.split(/\s+·\s+(?=[^:]{1,40}:)/)) {
    const m = /^([^:]{1,40}):\s*(.*)$/s.exec(part);
    if (m) { add(`${where} 이름`, m[1], "name"); add(where, m[2], kind); } else add(where, part, kind);
  }
};

for (const [k, h] of Object.entries(BUILT.heroes)) {
  add(`사도 ${k} 설명`, h.blurb, "story");
  addNamed(`사도 ${k} 패시브`, h.passive, "rule");
  if (h.keyword) { add(`사도 ${k} 키워드 이름`, h.keyword.ko, "name"); add(`사도 ${k} 키워드`, h.keyword.text, "rule"); }
  if (h.ult) { add(`사도 ${k} 고학년 이름`, h.ult.ko, "name"); add(`사도 ${k} 고학년`, h.ult.text, "rule"); }
}
const cardTexts = (where, c) => {
  add(`${where} 이름`, c.ko, "name");
  add(where, c.text, "rule");
  add(`${where} 설명`, c.blurb, "story");
  for (const f of c.flash || []) { add(`${where} 신탁${f.n} 이름`, f.ko, "name"); add(`${where} 신탁${f.n}`, f.text, "rule"); }
  for (const [i, b] of (c.blesses || (c.bless ? [c.bless] : [])).entries()) { add(`${where} 축복${i + 1} 이름`, b.ko, "name"); add(`${where} 축복${i + 1}`, b.text, "rule"); }
};
for (const [id, c] of Object.entries(BUILT.cards)) cardTexts(`카드 ${id}`, c);
for (const [id, c] of Object.entries(BUILT.neutral || {})) cardTexts(`교주 ${id}`, c);
for (const [id, e] of Object.entries(BUILT.equip || {})) {
  add(`장비 ${id} 이름`, e.ko, "name");
  add(`장비 ${id} 설명`, e.blurb, "story");
  addNamed(`장비 ${id} 효과`, e.effect, "rule");
  addNamed(`장비 ${id} 애착`, e.affinityPassive, "rule");   // 화면은 애착 줄(affinityPassive)과 Lv.3 스탯 이름표만 띄운다(js/ui-common.js)
}
for (const [ko, c] of Object.entries(CURSES)) { add(`골칫거리 ${ko}`, c.text, "rule"); add(`골칫거리 ${ko} 설명`, c.blurb, "story"); }
for (const [ko, c] of Object.entries(GIFTS)) { add(`선물 ${ko}`, c.text, "rule"); add(`선물 ${ko} 설명`, c.blurb, "story"); }
for (const [ko, c] of Object.entries(STATUS_CARDS)) { add(`상태 카드 ${ko}`, c.text, "rule"); add(`상태 카드 ${ko} 설명`, c.blurb, "story"); }
for (const [k, e] of Object.entries(ENEMIES)) {
  add(`적 ${k} 이름`, e.ko, "name");
  const intents = [...(e.intents || []), ...((e.phase && e.phase.intents) || []), ...((e.phase2 && e.phase2.intents) || [])];
  for (const it of intents) { add(`적 ${k} 수`, it.say, "story"); if (it.next) add(`적 ${k} 수`, it.next.say, "story"); }
  for (const ph of [e.phase, e.phase2]) if (ph) add(`적 ${k} 판 바뀜`, ph.say, "story");
  for (const p of [...(e.passives || []), ...((e.phase && e.phase.passives) || [])]) add(`적 ${k} 패시브 이름`, p.name, "name");
}
for (const F of FLOORS) { add(`층 ${F.n} 이름`, F.name, "name"); add(`층 ${F.n}`, F.sub, "story"); }
// 이벤트 — 결과 낱말(out …)은 규칙 글, 이름 · 단추 · 장면 · 한 줄은 이야기
const OUT_KEYS = ["out", "win", "pass", "fail", "leaveOut"];
const walkEvent = (where, o) => {
  if (Array.isArray(o)) return o.forEach((x) => walkEvent(where, x));
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (["id", "npc", "foe", "pool", "hero", "race", "when", "by", "enemies", "kind"].includes(k)) continue;
    if (typeof v === "string") add(`${where} ${k}`, v, OUT_KEYS.includes(k) ? "rule" : k === "name" ? "name" : "story");
    else walkEvent(where, v);
  }
};
for (const ev of EVENTS) walkEvent(`이벤트 ${ev.id}`, ev);
// 낱말 풀이 — 공용 낱말. 사도 전용 키워드 풀이는 위 사도 키워드와 같은 글이다
for (const w of Object.values(KW.words)) add(`풀이 ${w.ko}`, w.text, "rule");
for (const [h, kw] of Object.entries(KW.heroes || {})) for (const [ko, t] of Object.entries(kw.subs || {})) add(`풀이 ${h} ${ko}`, t, "rule");

// 화면 문구 — js/*.js 의 문자열(주석 · 정규식 빼고). 줄 번호를 단다
function jsStrings(src) {
  const out = [];
  let i = 0, line = 1, prev = "";   // prev: 마지막 토큰 — 「/」 가 정규식인지 나누기인지 가른다
  const n = src.length;
  const regexOk = () => prev === "" || /[(,=:[!&|?{;+\-*%<>~^]$/.test(prev) || /^(return|typeof|case|in|of|delete|void|throw|new)$/.test(prev);
  const esc = () => { if (src[i + 1] === "\n") line++; const ch = src[i + 1]; i += 2; return ch; };
  function readString(q) {
    const start = line; let s = ""; i++;
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") { s += esc(); continue; }
      if (src[i] === "\n") line++;
      s += src[i++];
    }
    i++; out.push({ line: start, text: s });
  }
  function readTemplate() {
    const start = line; let s = ""; i++;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { s += esc(); continue; }
      if (src[i] === "$" && src[i + 1] === "{") {   // ${…} 안은 코드 — 그 속 문자열도 따로 모은다
        i += 2; let depth = 1; s += "…";
        while (i < n && depth) {
          const c = src[i];
          if (c === "{") depth++;
          else if (c === "}") { if (!--depth) { i++; break; } }
          else if (c === "`") { readTemplate(); continue; }
          else if (c === '"' || c === "'") { readString(c); continue; }
          else if (c === "\n") line++;
          i++;
        }
        continue;
      }
      if (src[i] === "\n") line++;
      s += src[i++];
    }
    i++; out.push({ line: start, text: s });
  }
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); line += (src.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (c === '"' || c === "'") { readString(c); prev = "str"; continue; }
    if (c === "`") { readTemplate(); prev = "str"; continue; }
    if (c === "/" && regexOk()) {   // 정규식 — 건너뛴다
      i++; let cls = false;
      while (i < n) { const d = src[i]; if (d === "\\") { i += 2; continue; } if (d === "\n") break; if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; i++; }
      if (src[i] === "/") i++;
      while (/[a-z]/.test(src[i] || "")) i++;
      prev = "re"; continue;
    }
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 40));
    if (m) { prev = m[0]; i += m[0].length; continue; }
    prev = c; i++;
  }
  return out;
}
const UI_SKIP = new Set(["dev.js", "save.js"]);
// 낱말을 읽는 쪽 — 옛 글도 읽으려고 옛 말을 품고 있다(effects · passive 의 파서, card-text 의 줄이기 규칙). 낡은 용어 · 서술체를 안 본다
const PARSERS = new Set(["effects.js", "passive.js", "card-text.js"]);
// 화면 안내 · 알림만 있는 파일 — 문장 끝이 「~합니다」
const POLITE = new Set(["ui.js", "ui-common.js", "lobby.js", "run.js", "events.js", "main.js", "settings-panel.js", "home-design.js", "party-screen.js", "map.js", "cardbook.js", "stage.js"]);
const jsDir = path.join(ROOT, "js");
for (const f of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js") && !UI_SKIP.has(f) && !PARSERS.has(f)).sort()) {
  for (const s of jsStrings(fs.readFileSync(path.join(jsDir, f), "utf8"))) {
    if (!/[가-힣]/.test(s.text)) continue;
    texts.push({ where: `js/${f}:${s.line}`, text: s.text, kind: POLITE.has(f) ? "ui" : "ui-mixed", file: f });
  }
}

if (dumpTo) {
  fs.writeFileSync(dumpTo, texts.map((t) => `${t.kind}\t${t.where}\t${t.text.replace(/\n/g, "⏎")}`).join("\n"));
  console.log(`글 ${texts.length}개를 ${dumpTo} 에 썼다`);
  process.exit(0);
}

// ── 낡은 용어 · 같은 뜻의 다른 말 ─────────────────────────────────────
// in: 어느 갈래의 글에서 보나(rule · ui · story). 이름(name)은 늘 뺀다
const R_U = ["rule", "ui", "ui-mixed"], ALL = ["rule", "ui", "ui-mixed", "story"];
const TERMS = [
  // v6 에 없앤 것(docs/18 §2 · §5)
  { re: /회복력/, why: "회복력은 없다 — 회복은 방어력 기준(「HP 회복(방어력 N%)」)", in: ALL },
  { re: /온정|(?:열의|강건|집중)\s*\d/, why: "열의 · 강건 · 집중 · 온정은 없다 — 능력치 올림은 사도 전용 키워드에서", in: ALL },
  { re: /무적/, why: "무적은 없다 — 「파티 피해 감소 N」 · 「파티 면역 N」", in: R_U },
  { re: /감응/, why: "감응은 영감에 합쳤다 — 「영감: …」", in: ALL },
  { re: /판\s*내내/, why: "강화 카드는 「전투 내내」 — 그 전투가 끝나면 사라진다(2026-10-04, 옛 「판 내내」)", in: ALL },
  { re: /HP\s*최저\s*아군|최저\s*아군/, why: "HP 가 하나라 「HP 최저 아군」 은 없다 — 한 사도는 「아군 1명」, 나머지는 「파티」", in: ALL },
  // 파티에 거는 버프는 대상 말 없이 「사기 1」 · 「불굴 2」(2026-10 사용자 — 글자 수를 줄인다). 「파티 · 아군 전원 X N」 은 같은 뜻의 옛 말
  { re: /(?:파티|아군\s*전원)(?:에게)?\s*(?:사기|불굴|결의|결정화|반격|잔광|피해\s*감소|면역|실드\s*유지|저장|협공|고동)\s*\d/, why: "파티에 거는 버프는 대상 말 없이 — 「사기 1」 · 「불굴 2」", in: ["rule"] },
  { re: /주말농장|부활|되살|쓰러진\s*사도|사도가\s*쓰러|주인이\s*쓰러|아군이\s*쓰러/, why: "사도는 쓰러지지 않는다 — 파티 HP 가 0 이면 판이 끝난다", in: ALL },
  // 파티 몫 — 방어 · 실드 · 회복 · 사기 밖의 상태는 파티에 하나(docs/18 §5 두 층)
  { re: /(?:아군\s*1명|아군\s*전원|아군\s*전체)\s*(?:HP\s*회복|방어력\s*\d+%\s*(?:방어|실드))/, why: "방어 · 실드 · 회복은 파티에 한 번 — 「파티 …」 또는 대상 말 없이", in: ["rule"] },
  // 사기도 파티 몫(2026-10 사용자 「다 파티 사기로 올리면 인플레 — 개인 공격력 증가로」). 사도 글(카드 · 패시브 · 키워드 · 고학년)에서 한 사도에게 거는 것은
  //   「전투 내내 자신 · 아군 1명 공격력 +15%」(사기 1겹 몫). 장비 글은 따로(at — 어느 글에서 보나)
  { re: /(?:자신|아군\s*1명)(?:에게)?\s*사기\s*\d/, why: "사도 글에 한 사도의 사기는 없다 — 파티면 대상 말 없이 「사기 N」, 한 사도면 「전투 내내 자신 · 아군 1명 공격력 +15×N%」", in: ["rule"], at: /^(?:카드|사도) / },
  { re: /(?:자신|아군\s*1명)(?:에게)?\s*(?:불굴|결의|결정화|반격|잔광|피해\s*감소|면역|실드\s*유지|저장|협공|고동)\s*\d/, why: "사기 밖의 상태는 파티 몫 — 대상 말 없이 「X N」", in: ["rule"] },
  // 이름이 바뀐 사도 키워드(v6) — 낫표를 두른 옛 이름
  { re: /「(?:MVP|전압|물총알|목소리|아우라|기록|완력|의리|호흡|약값|장서|신성|돌봄)」/, why: "이름이 바뀐 사도 키워드(환호 · 번개 자극 · 물보라 · 땅울림 · 긍정의 기운 · 원고 · 근력 강화 · 밀두유 · 볼-요가 · 부작용 · 대출 · 은총 · 목장 친구)", in: ALL },
  // 같은 뜻의 다른 말 — 표준 하나로(docs/18 §11)
  { re: /비용/, why: "「코스트」 로 — 카드 글 문법(「다음 카드 코스트 -1」 · 「코스트 N.」)과 같게", in: R_U },
  { re: /모든\s*적/, why: "「적 전체」 로 — 카드 글 문법과 같게", in: R_U },
  { re: /치유/, why: "「회복」 으로 — 카드 글 문법 「HP 회복(방어력 N%)」 과 같게", in: R_U },
  { re: /방어도|스택|턴\s*처음/, why: "「방어」 · 「겹」 · 「턴 시작」 으로", in: R_U },
  { re: /(?:^|[^가-힣])체력\s*[+\d]|사도.{0,6}체력/, why: "사도 · 파티는 「HP」(적만 「체력」)", in: R_U },
  // 만든 글에 빈 값이 샜다 — 풀이를 만드는 쪽(tools/build-*.js)이 이름이 바뀐 엔진 값을 읽으면
  { re: /undefined|NaN|\[object/, why: "빈 값이 글에 샜다 — 글을 만드는 쪽이 읽는 값을 확인", in: ["rule", "story"] },
];
// 엔진이 옛 글을 위해 남긴 몸(docs/18 §5 「엔진은 옛 글을 위해 「무적」 을 아직 읽는다」) · 결과 낱말 문법 — 지금 콘텐츠로는 화면에 안 나온다
const ALLOW = [
  { file: "combat.js", re: /^무적!$/ },
  { file: "fight-screen.js", re: /^무적 — 이번 적의 차례에 맞지 않습니다$/ },
  { file: "fx-icons.js", re: /^무적$/ },
  { file: "events.js", re: /^비용$/ },          // 이벤트 결과 낱말 「기적 카드 N (비용)」 을 읽는 말(js/events.js)
];

// ── 서술체 ───────────────────────────────────────────────────────────
const strip = (t) => { let p; do { p = t; t = t.replace(/\([^()]*\)/g, ""); } while (p !== t); return t; };
// 문장 끝 낱말 — 마침표 · 느낌표 · 물음표 앞, 또는 글 끝
const ends = (t) => [...strip(t).matchAll(/([가-힣]+)\s*(?=[.!?]+(?:\s|$|["」』])|$)/g)].map((m) => m[1]);
const polite = (w) => /(?:니다|세요|[가-힣]요)$/.test(w);
const plain = (w) => /[가-힣]다$/.test(w) && !/(?:니다|마다|보다)$/.test(w);

const fails = {};
const hit = (group, where, text, why) => (fails[group] = fails[group] || []).push({ where, text, why });

for (const t of texts) {
  if (t.kind === "name") continue;
  for (const term of TERMS) {
    if (!term.in.includes(t.kind)) continue;
    if (term.at && !term.at.test(t.where)) continue;
    const m = term.re.exec(t.text);
    if (!m) continue;
    if (ALLOW.some((a) => a.file === t.file && a.re.test(t.text))) continue;
    hit("낡은 용어", t.where, t.text, `「${m[0]}」 — ${term.why}`);
  }
  if (t.kind === "story") continue;
  const e = ends(t.text);
  if (t.kind === "rule" && e.some(polite)) hit("서술체", t.where, t.text, `규칙 글인데 「${e.filter(polite).join(", ")}」 — 「~한다」 로`);
  if (t.kind === "ui" && e.some(plain)) hit("서술체", t.where, t.text, `화면 안내인데 「${e.filter(plain).join(", ")}」 — 「~합니다」 로`);
  if (t.kind === "ui-mixed" && e.some(polite) && e.some(plain)) hit("서술체", t.where, t.text, "한 문구 안에 「~한다」 와 「~합니다」 가 섞였다");
}

// ── 알리기 ───────────────────────────────────────────────────────────
const by = (k) => texts.filter((t) => t.kind === k).length;
console.log(`읽은 글 ${texts.length} — 규칙 ${by("rule")} · 화면 ${by("ui") + by("ui-mixed")} · 이야기 ${by("story")} · 이름 ${by("name")}(낡은 용어 · 서술체를 안 본다)`);
let bad = 0;
for (const [group, label] of [["낡은 용어", "낡은 용어 · 같은 뜻의 다른 말"], ["서술체", "서술체(규칙 글 「~한다」 · 화면 안내 「~합니다」)"]]) {
  console.log("");
  console.log(label);
  const f = fails[group] || [];
  if (!f.length) { console.log(`  ok   걸린 곳 없음`); continue; }
  bad += f.length;
  console.log(`  실패 ${f.length}곳`);
  for (const x of list ? f : f.slice(0, 5)) console.log(`       ${x.where} — ${x.why}\n         ${x.text.replace(/\n/g, " ").slice(0, 120)}`);
  if (!list && f.length > 5) console.log(`       … ${f.length - 5}곳 더 (--list)`);
}
console.log("");
console.log(bad ? `문제 ${bad}개` : "플레이어에게 보이는 글이 v6 용어와 서술체 규칙을 지킨다");
process.exit(bad ? 1 : 0);
