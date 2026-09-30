// 기획서 「스펠 → 중립 카드」 탭을 읽는다.
//
// 한 장은 이렇게 생겼다 — 43장 모두 같은 꼴이다.
//
//   #### 전술 교본
//   전설 · 가격 190골드 · 원작: … — 한 줄 설명
//   **전술 교본** (1·강화, 소멸) 덱에 1장만. 이번 전투 동안 아군 전원 주는 피해 +10% [주는 피해].
//   - ① 강화 *정독*: 코스트 1→0
//   - ④ 변형 *요점 정리*: 0코 스킬, 소멸 — 이번 턴만 …
//
// 중립 카드는 어느 사도에도 속하지 않는다. 골디의 상점에서 골드로 산다.
// 신탁은 ① 강화 · ④ 변형 두 가지뿐이고, 글이 사도 카드와 달라(「코스트 1→0」) 지금은 읽어 두기만 한다.

const GRADES = ["전설", "희귀", "고급", "일반"];

export function parseNeutral(text, warn = () => {}) {
  const from = text.indexOf("## 스펠 → 중립 카드");
  if (from < 0) { warn("중립 카드 탭이 없다"); return {}; }
  const to = text.indexOf("\n## ", from + 5);
  const sec = text.slice(from, to < 0 ? undefined : to);
  const out = {};
  for (const raw of sec.split(/^#### /m).slice(1)) {
    const L = raw.split("\n").map((l) => l.replace(/\s+$/, ""));
    const ko = L[0].trim();
    const meta = L[1] || "";
    const grade = GRADES.find((g) => meta.startsWith(g)) || null;
    const price = +((meta.match(/가격\s*(\d+)\s*골드/) || [])[1] || 0);
    const blurb = (meta.split(" — ")[1] || "").trim() || null;
    const line = L.find((l) => l.startsWith(`**${ko}**`));
    if (!grade || !price || !line) { warn(`중립 카드를 못 읽었다: ${ko}`); continue; }
    const m = line.match(/^\*\*.+?\*\*\s*\((\d+|X)·([가-힣]+)((?:,\s*[가-힣 ]+)*)\)\s*(.*)$/);
    if (!m) { warn(`중립 카드 머리를 못 읽었다: ${ko}`); continue; }
    const tags = m[3].split(",").map((t) => t.trim()).filter(Boolean);
    let body = m[4];
    const oneOnly = /덱에 1장만\./.test(body);
    body = body.replace(/덱에 1장만\.\s*/, "");
    const shown = body.replace(/\s*\[[^\]]+\]/g, "").trim();   // [주는 피해] 는 전역 증가의 종류 표시 — 효과가 아니다
    const flash = [];
    for (const l of L) {
      const f = l.match(/^-\s*([①④])\s*(강화|변형)\s*\*(.+?)\*\s*:\s*(.*)$/);
      if (f) flash.push({ n: f[1] === "①" ? 1 : 4, kind: f[2], ko: f[3], text: f[4].replace(/\s*\[[^\]]+\]/g, "") });
    }
    out[ko] = {
      ko, grade, price, oneOnly, blurb,
      cost: m[1] === "X" ? "X" : +m[1], type: m[2], tags,
      text: shown, flash,
    };
  }
  return out;
}
