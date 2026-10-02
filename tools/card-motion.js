// 카드 동작 표 — 사도마다 여덟 장이 어떤 SD 동작 · 소리 갈래로 나가는지(js/data/card-motion.js), 그 동작의 스파인 SFX 칸이
// 사도 소리 파일과 맞는지(js/data/sfx-map.js 의 slotMap — 맞으면 이벤트 시각에, 안 맞으면 시작 · 첫 마루 맞추기로).
//   node tools/card-motion.js 에르핀,티그,네르     (사도를 안 주면 모두 — 끝에 동작 · 갈래 수만 센다)
//   node tools/card-motion.js --ult 에르핀,아멜리아  고학년 동작의 SFX 칸 ↔ 파일
// 스파인 런타임(vendor/spine-webgl.min.js)과 assets/spine · assets/sfx 가 있어야 한다. 없으면 그렇다고만 말하고 끝난다.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { CARDS, HERO_DATA } from "../js/cardbook.js";
import { cardMotion, cardPower } from "../js/data/card-motion.js";
import { slotsIn, slotMap } from "../js/data/sfx-map.js";
import ARTMAP from "../js/data/artmap.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RT = path.join(ROOT, "vendor", "spine-webgl.min.js"), MAN = path.join(ROOT, "assets", "spine", "manifest.json");
const SFXI = path.join(ROOT, "assets", "sfx", "index.json");
if (!fs.existsSync(RT) || !fs.existsSync(MAN)) { console.log("스파인 런타임 · 자료가 없습니다(vendor/spine-webgl.min.js · assets/spine)"); process.exit(0); }
const ctx = { console, navigator: { userAgent: "" }, document: { createElement: () => ({ getContext: () => null }) } };
ctx.globalThis = ctx.window = ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(RT, "utf8"), ctx);
const sp = ctx.spine, man = JSON.parse(fs.readFileSync(MAN, "utf8"));
const keys = fs.existsSync(SFXI) ? Object.keys(JSON.parse(fs.readFileSync(SFXI, "utf8"))) : [];

// 사도 SD 의 동작 → { d 길이, sfx [칸 번호 …] }
function anims(k) {
  const set = man.ingame && man.ingame[k], base = path.join(ROOT, "assets", "spine", "ingame", k);
  if (!set || !fs.existsSync(path.join(base, set.skel))) return null;
  const atlas = new sp.TextureAtlas(fs.readFileSync(path.join(base, set.atlas), "utf8"));
  for (const p of atlas.pages) p.setTexture({ setFilters() {}, setWraps() {}, getImage: () => ({ width: p.width, height: p.height }) });
  const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(fs.readFileSync(path.join(base, set.skel))));
  const out = {};
  for (const a of data.animations) {
    const sfx = [];
    for (const tl of a.timelines) if (tl.events) for (const e of tl.events) if (e.data.name === "SFX") sfx.push([+e.stringValue || e.intValue, e.time]);
    out[a.name] = { d: a.duration, sfx: sfx.sort((x, y) => x[1] - y[1]) };
  }
  return out;
}
const dirOf = (k) => ARTMAP.art[k] && String(ARTMAP.art[k]).toLowerCase();
// 그 동작 소리가 이벤트로 나가나 — "events"(칸 = 파일) · "start"(안 맞아 동작 시작에 그 갈래 소리 하나) · "-"(소리 갈래 없음 — 카드 종류 소리)
function sound(k, A, anim, group) {
  if (!group || !anim || !A[anim]) return "-";
  const m = slotMap(slotsIn(keys, dirOf(k), group), A[anim].sfx.map((x) => x[0]));
  return m ? "events" : "start";
}

const args = process.argv.slice(2);
const ult = args[0] === "--ult";
const who = (ult ? args[1] : args[0]) ? (ult ? args[1] : args[0]).split(",") : Object.keys(HERO_DATA);
const count = {};
for (const k of who) {
  const h = HERO_DATA[k];
  if (!h) { console.log(k, "— 그런 사도가 없다"); continue; }
  const A = anims(k);
  if (!A) { console.log(k, "— SD 스파인이 없다"); continue; }
  if (ult) {
    const parts = Object.keys(A).filter((n) => /^Ultimate1_\d+(_Loop)?$/.test(n)).sort((a, b) => +a.split("_")[1] - +b.split("_")[1]);
    const ns = parts.flatMap((n) => A[n].sfx.map((x) => x[0]));
    const s = slotsIn(keys, dirOf(k), "ult"), m = slotMap(s, ns);
    const sh = (p) => (p === "hit" ? "(맞는 소리 → land)" : p.split("/").pop());
    console.log(`${k}\t칸 ${new Set(ns).size} · 파일 ${s.list.length}${s.hit.length ? "+맞는 소리" : ""}\t${m ? "이벤트" : "첫 마루"}\t` +
      parts.map((n) => n.replace("Ultimate1_", "U") + ":" + A[n].sfx.map((x) => `${x[0]}@${x[1].toFixed(2)}`).join(",")).join(" ") + "\t" +
      (m ? [...m].map(([n, p]) => `${n}→${sh(p)}`).join(" ") : s.list.map(sh).join(" ")));
    continue;
  }
  const has = (n) => !!A[n];
  const ids = Object.keys(CARDS).filter((id) => CARDS[id].hero === k && /_[su]\d$/.test(id));
  if (args.length) console.log(`\n${k} (${h.role} · Attack2_1 ${has("Attack2_1") ? "있음" : "없음"})`);
  for (const id of ids) {
    const c = CARDS[id], p = cardPower(c), m = cardMotion(c, { role: h.role, key: k, has });
    const tag = `${m.anim || "(제자리)"}${m.cut ? `·${m.cut}ms` : ""}`;
    count[m.tier + " " + (m.anim || "-")] = (count[m.tier + " " + (m.anim || "-")] || 0) + 1;
    if (args.length) console.log(`  ${id.padEnd(9)} ${c.type}  ${(c.name || "").padEnd(14)} ${p.any ? `${Math.round(p.total * 100)}%${p.hits > 1 ? `×${p.hits}타` : ""}${p.aoe ? " 전체" : ""}` : "-"}`.padEnd(48) +
      ` → ${tag.padEnd(14)} ${m.group || "종류 소리"}  [${m.tier}${c.signature ? " · 시그니처" : ""}] 소리 ${sound(k, A, m.anim, m.group)}`);
  }
}
if (!args.length && !ult) for (const [k, n] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(22)} ${n}`);
