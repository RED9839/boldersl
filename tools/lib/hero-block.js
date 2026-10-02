// 기획서의 사도 한 명(### 로 시작하는 덩어리)을 읽는다.
// tools/parse-design.js 와 tools/check-hero.js 가 같이 쓴다 — 두 곳이 따로 읽으면 언젠가 어긋난다.
//
//   ### 에르핀 (순수 · 요정 · 후열 딜러 · 태생 3성)
//   (설명 한 줄)
//   **스탯** HP 55 · 공격 15 · 방어 2 · 치명 10% · 마법
//   **패시브** 여왕의 식탐: 「간식」이 3개가 되면 「간식」 전부 소모, AP +1
//   **키워드 「간식」** …
//   **원작** …                       (나무위키에서 무엇을 가져왔는지 — 게임은 안 읽는다)
//   **시작 카드 4장** …
//   - **마력탄**(1·공격) 공격력 100% 피해
//   **고유 카드 4장**
//   - **마력탄 폭주** (1·공격, 시그니처) …
//       - ① 강화 *마력탄 대난사*: …
//   **고학년 스킬 (덱 밖 · 비용 300%)** **돌겨어어어!!! 억⋯?** — …

export const NATURES = ["순수", "광기", "냉정", "우울", "활발", "공명"];
const ROW_KO = { 전열: "front", 중열: "mid", 후열: "back" };

// raw 는 「### 」 를 뗀 덩어리. 사도가 아니면 null. warn(메시지) 로 문제를 알린다.
export function parseHeroBlock(raw, warn = () => {}) {
  const nl = raw.indexOf("\n");
  const head = raw.slice(0, nl).trim();
  const body = raw.slice(nl + 1);

  const m = head.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!m) return null;
  const tags = m[2].split("·").map((t) => t.trim());
  if (!NATURES.includes(tags[0])) return null;      // 장비 표제 등은 건너뛴다

  const name = m[1].trim();
  const [nature, race, roleRaw, starRaw] = tags;
  const eldain = tags.includes("엘다인");
  // 「모든 열 딜러 · … · 기본 전열」 — 원작에서 어느 열에나 서는 사도(티그(영웅) · 죠안). 편성에서 열을 고른다
  const anyM = (roleRaw || "").match(/^모든\s*열\s+(\S+)$/);
  const home = (tags.map((t) => t.match(/^기본\s*(전열|중열|후열)$/)).find(Boolean) || [])[1] || "중열";
  const any = anyM ? [roleRaw, home, anyM[1]] : null;
  const rm = any || (roleRaw || "").match(/^(전열|중열|후열)\s+(\S+)$/);
  if (!rm) { warn(`${name} — 위치·역할을 못 읽었다: ${roleRaw}`); return null; }

  const h = {
    ko: name, nature, race,
    row: ROW_KO[rm[1]], rowKo: rm[1], role: rm[2], anyRow: !!any,
    star: Number(((starRaw || "").match(/(\d)성/) || [])[1] || 3),
    eldain,
    blurb: (body.split("\n")[0] || "").trim(),
  };

  const st = body.match(/\*\*스탯\*\*\s*(.+)/);
  if (!st) warn(`${name} — 스탯이 없다`);
  else {
    const s = st[1];
    h.hp = num(s, /HP\s*(\d+)/);
    h.atk = num(s, /공격\s*(\d+)/);
    h.def = num(s, /방어\s*(\d+)/);
    h.crit = num(s, /치명\s*(\d+)%/);
    h.dmgType = /마법/.test(s) ? "마법" : /물리/.test(s) ? "물리" : null;
    for (const [k, v] of Object.entries({ hp: h.hp, atk: h.atk, def: h.def, crit: h.crit }))
      if (v == null) warn(`${name} — 스탯에 ${k} 가 없다: ${s}`);
  }

  const pa = body.match(/\*\*패시브\*\*\s*(.+)/);
  if (pa) h.passive = pa[1].trim(); else warn(`${name} — 패시브가 없다`);
  const kw = body.match(/\*\*키워드\s*「(.+?)」\*\*\s*(.+)/);
  if (kw) h.keyword = { ko: kw[1], text: kw[2].trim() };
  const src = body.match(/\*\*원작\*\*\s*(.+)/);
  if (src) h.source = src[1].trim();

  h.start = [];
  for (const line of section(body, /\*\*시작 카드[^\n]*\n/)) {
    const c = line.match(/^-\s*\*\*(.+?)\*\*\s*\((\d+|X)·(\S+?)\)\s*(.*)$/);
    if (!c) { if (line.startsWith("-")) warn(`${name} 시작 카드 — 못 읽은 줄: ${line.slice(0, 40)}`); continue; }
    h.start.push({ ko: c[1].trim(), cost: c[2] === "X" ? "X" : Number(c[2]), type: c[3].trim(), text: c[4].trim() });
  }
  if (h.start.length !== 4) warn(`${name} — 시작 카드가 ${h.start.length}장 (넷이어야 한다)`);

  h.unique = [];
  let cur = null;
  for (const line of section(body, /\*\*고유 카드[^\n]*\n/)) {
    const c = line.match(/^-\s*\*\*(.+?)\*\*\s*\((\d+|X)·([^)]+)\)\s*(.*)$/);
    if (c) {
      const meta = c[3].split(",").map((x) => x.trim());
      cur = { ko: c[1].trim(), cost: c[2] === "X" ? "X" : Number(c[2]), type: meta[0], tags: meta.slice(1), text: strip(c[4]), flash: [] };
      h.unique.push(cur);
      continue;
    }
    // 「① 강화 *이름*: …」(옛 틀) 또는 「① *이름*: …」(자유 신탁 — 분류 없이 카드마다 다른 다섯 갈래)
    const f = line.match(/^\s+-\s*([①②③④⑤])\s*(?:([^\s*]+)\s+)?\*(.+?)\*:\s*(.+)$/);
    if (f) {
      if (!cur) { warn(`${name} — 카드 없이 신탁이 나왔다`); continue; }
      cur.flash.push({ n: "①②③④⑤".indexOf(f[1]) + 1, kind: f[2] || "", ko: f[3].trim(), text: strip(f[4]) });
      continue;
    }
    // 「✦ *이름*: …」 — 그 카드만의 겨우살이의 축복(사도 고유, v3). 카드당 하나
    const b = line.match(/^\s+-\s*✦\s*\*(.+?)\*:\s*(.+)$/);
    if (b) {
      if (!cur) { warn(`${name} — 카드 없이 축복이 나왔다`); continue; }
      if (cur.bless) warn(`${name}/${cur.ko} — 축복이 둘이다`);
      cur.bless = { ko: b[1].trim(), text: strip(b[2]) };
      continue;
    }
    if (/^\s*-/.test(line)) warn(`${name} 고유 카드 — 못 읽은 줄: ${line.trim().slice(0, 40)}`);
  }
  if (h.unique.length !== 4) warn(`${name} — 고유 카드가 ${h.unique.length}장 (넷이어야 한다)`);
  for (const u of h.unique) if (u.flash.length !== 5) warn(`${name}/${u.ko} — 신탁이 ${u.flash.length}개 (다섯이어야 한다)`);

  const ult = body.match(/\*\*(?:고학년 스킬|궁극기)[^*]*비용\s*(\d+)%\)\*\*\s*\*\*(.+?)\*\*\s*—\s*(.+)/);
  if (ult) h.ult = { cost: Number(ult[1]), ko: ult[2].trim(), text: ult[3].trim() };
  else warn(`${name} — 고학년 스킬을 못 읽었다`);
  return h;
}

function num(s, re) { const m = s.match(re); return m ? Number(m[1]) : null; }
// 끝의 「 — 설명 주석」 을 뗀다(효과가 아니라 사람이 읽는 말)
function strip(s) { return s.replace(/\s*—\s*[^—]*$/, "").trim(); }
function section(body, startRe) {
  const m = body.match(startRe);
  if (!m) return [];
  const rest = body.slice(m.index + m[0].length);
  const end = rest.search(/^\*\*/m);
  return (end < 0 ? rest : rest.slice(0, end)).split("\n").filter((l) => l.trim());
}
// 이름 → 키. 이격은 괄호가 붙는다(에르핀(왕도)) — 괄호를 살려 구분한다.
export function slug(name) {
  return name.replace(/\s+/g, "").replace(/[()]/g, "_").replace(/_$/, "");
}
