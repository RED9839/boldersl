// 기획서 「아티팩트 → 장비」 탭을 읽는다.
//
// 한 개는 이렇게 생겼다 — 103종 모두 같은 꼴이다.
//
//   #### 벨리타의 지팡이
//   전설 · 무기 · 애착: 벨리타 · 원작: … — 한 줄 설명
//   - **스탯** 공격 +2 · 치명 +6%
//   - **효과** 이 사도가 주는 피해 +10% [주는 피해]
//   - **애착 (벨리타)** 시그니처 「…」가 *…*로 강화: … Lv.3: 공격 +1 · 방어 +1 · 치명 +3%.
//
// 칸은 사도마다 무기 · 방어구 · 장신구 하나씩. 스탯 줄은 사도 스탯에 그대로 더하는 고정치다.
// 효과와 애착은 글을 그대로 들고 간다 — 무엇이 읽히는지는 build-cards 가 가른다.

const GRADES = ["전설", "희귀", "고급", "일반"];
const SLOTS = ["무기", "방어구", "장신구"];
const STAT = { HP: "hp", 공격: "atk", 방어: "def", 치명: "crit", 회복력: "heal" };

export function parseStats(line) {
  const out = { hp: 0, atk: 0, def: 0, crit: 0, heal: 0 };
  // 「회복력 +N」 — 회복력(공격력 + 역할 몫)에 따로 더하는 몫. 공격력은 안 오른다
  for (const m of line.matchAll(/(HP|공격|방어|치명|회복력)\s*\+\s*(\d+)\s*%?/g)) out[STAT[m[1]]] += +m[2];
  return out;
}

export function parseEquip(text, warn = () => {}) {
  const from = text.indexOf("## 아티팩트 → 장비");
  if (from < 0) { warn("장비 탭이 없다"); return {}; }
  const to = text.indexOf("\n## ", from + 5);
  const sec = text.slice(from, to < 0 ? undefined : to);
  const out = {};
  for (const raw of sec.split(/^#### /m).slice(1)) {
    const L = raw.split("\n").map((l) => l.replace(/\s+$/, ""));
    const ko = L[0].trim();
    const meta = L[1] || "";
    const grade = GRADES.find((g) => meta.startsWith(g)) || null;
    const global = /^전설\(글로벌\)/.test(meta);
    const slot = SLOTS.find((s) => meta.includes(`· ${s} ·`) || meta.includes(`· ${s}`)) || null;
    const affinity = ((meta.match(/애착:\s*([^·]+?)\s*·/) || [])[1] || "").trim() || null;
    const blurb = (meta.split(" — ")[1] || "").trim() || null;
    const statLine = L.find((l) => l.startsWith("- **스탯**"));
    const effLine = L.find((l) => l.startsWith("- **효과**"));
    const affLine = L.find((l) => l.startsWith("- **애착"));
    if (!grade || !slot || !statLine) { warn(`장비를 못 읽었다: ${ko}`); continue; }
    const aff = affLine ? affLine.replace(/^- \*\*애착[^*]*\*\*\s*/, "") : null;
    const lv3 = aff ? (aff.match(/Lv\.3:\s*([^.]+)/) || [])[1] || null : null;
    out[ko] = {
      ko, grade, global, slot, affinity, blurb,
      stats: parseStats(statLine),
      effect: effLine ? effLine.replace(/^- \*\*효과\*\*\s*/, "").trim() : null,
      affinityText: aff,
      affinityLv3: lv3 ? parseStats(lv3) : null,
    };
  }
  return out;
}
