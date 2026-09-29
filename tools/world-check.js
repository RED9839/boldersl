// 이 게임의 글(카드 이름·설명, 층 이름, 사도 소개, 적의 의도)을 트릭컬 세계 규칙에 대고 훑는다.
//
// 규칙표는 사도 데스크의 docs/08-세계관-규칙.md 에서 가져왔다(나무위키 트릭컬 리바이브/설정 정리본).
// 거기 있는 tools/world-check.js 가 대사 4,498줄을 훑던 것을, 여기서는 게임 텍스트에 건다.
//
//   node tools/world-check.js          전부 훑는다
//   node tools/world-check.js --list   규칙만 보기
//
// 걸린 줄이 곧 오류는 아니다 — 예외가 많은 규칙이라 사람이 한 번 봐야 한다.
import { CARDS } from "../js/data/cards.js";
import { HEROES } from "../js/data/heroes.js";
import { ENEMIES, FLOORS } from "../js/data/enemies.js";
import { TRAITS } from "../js/data/traits.js";
import TALK from "../js/data/talk.js";
import { HERO_DATA } from "../js/cardbook.js";

const RULES = [
  {
    id: "죽음",
    why: "엘리아스에는 죽음이 지워져 있다. 죽을 자리는 '주말농장'(바다 쪽은 '주말어장')이다.",
    re: /(죽[었는을어음이일인여]|시체|송장|장례|저승|목숨|사망|영면)/,
  },
  {
    id: "남성",
    why: "지성체는 전부 여성이다. 엘프만 지구에서 산타를 겪어 남성을 안다.",
    re: /(아저씨|아빠|아버지|오라버니|오빠|사내|남자|소년|삼촌|할아버지|할아범|아들|형님)/,
    ok: (who) => ["elena", "amelia"].includes(who),
  },
  {
    id: "손가락",
    why: "엘리아스 주민은 손가락이 넷이다(교주만 다섯). 손으로 여덟까지 센다.",
    re: /(손가락 다섯|다섯 손가락|열 손가락|손가락 열)/,
  },
  {
    id: "눈·겨울",
    why: "늘 봄에 가까운 기후라 눈이 내리지 않는다. 눈은 정령산 만년설과 바깥 글레이시아 쪽 이야기다.",
    re: /(눈이 내리|첫눈|눈사람|폭설|눈보라|함박눈|겨울이 오|한겨울|얼어붙은)/,
  },
  {
    id: "지구",
    why: "지구·인터넷·지구의 지명과 물건은 모른다. 엘프(모나티엄)와 교주만 예외다.",
    re: /(지구|인터넷|스마트폰|텔레비전|자동차|비행기|화성|북두칠성|달러|엔화|유로)/,
    ok: (who) => ["elena", "amelia"].includes(who),
  },
  {
    id: "바깥세상",
    why: "엘리아스 밖(안개·황무지·바다)은 아무나 드나들지 못한다.",
    re: /(해적|항해|갑판|선장|빙하|글레이시아|볼케니카|안개 너머|황무지)/,
  },
  {
    id: "스포일러",
    why: "사도가 모르는 것은 이 게임에도 나오면 안 된다 — 세계수의 죽음, 겨우살이, 영원살이, 다른 차원.",
    re: /(세계수가 죽|겨우살이|영원살이|투구꽃|니펠|R41|일곱 그루|진명)/,
  },
  {
    id: "지명",
    why: "지명은 정해져 있다. 새로 지어내면 안 된다 — 에르피엔·벨리티엔·모나티엄·수인 부락·정령산·유령 늪·불길과 물길의 터.",
    re: /(왕도|수도|마을 광장|던전|성채|요새|폐허)/,
  },
];

// 검사기가 실제로 잡는지 — 안 잡히는 검사기는 없는 것과 같다.
// 실제로 '죽일'을 놓친 적이 있어서(죽이 패턴이 죽일을 못 잡았다) 붙박이로 둔다.
const SELFTEST = [
  ["죽음", "죽일 듯이 달려든다", true], ["죽음", "죽었다", true], ["죽음", "장례식", true],
  ["죽음", "반죽 치기", false], ["죽음", "뒤죽박죽", false], ["죽음", "주말농장으로", false],
  ["눈·겨울", "눈보라가 친다", true], ["눈·겨울", "눈을 감는다", false],
  ["지명", "무너진 요새", true], ["지명", "에르피엔", false],
  ["남성", "아저씨", true], ["지구", "인터넷", true],
  ["스포일러", "겨우살이", true],
];
{
  let bad = 0;
  for (const [id, text, want] of SELFTEST) {
    const r = RULES.find((x) => x.id === id);
    if (!r) { console.log(`  검사기 오류: ${id} 규칙이 없다`); bad++; continue; }
    if (r.re.test(text) !== want) { console.log(`  검사기 오류: "${text}" 는 ${want ? "걸려야" : "통과해야"} 한다 (${id})`); bad++; }
  }
  if (bad) { console.log(`검사기 자체가 틀렸다 — 규칙 ${bad}개`); process.exit(1); }
}

if (process.argv.includes("--list")) {
  for (const r of RULES) console.log(`[${r.id}] ${r.why}`);
  process.exit(0);
}

// 훑을 글 모으기 — [어디, 누구(있으면), 글]
const LINES = [];
for (const c of Object.values(CARDS)) {
  LINES.push([`카드 ${c.name}`, c.hero, c.name]);
  LINES.push([`카드 ${c.name}`, c.hero, c.text || ""]);
}
for (const [k, h] of Object.entries(HEROES)) {
  LINES.push([`사도 ${h.ko}`, k, h.blurb]);
  LINES.push([`사도 ${h.ko}`, k, h.kit]);
  LINES.push([`사도 ${h.ko}`, k, h.broken]);
  LINES.push([`사도 ${h.ko} 성질`, k, h.trait.text]);
}
for (const e of Object.values(ENEMIES)) {
  LINES.push([`적 ${e.ko}`, null, e.ko]);
  // 첫 수 · 체력이 떨어진 뒤의 수 · 힘을 모은 뒤의 수까지
  const all = [...e.intents, ...(e.open ? [e.open] : []), ...((e.phase || {}).intents || [])];
  for (const it of all) for (const x of [it, ...(it.next ? [it.next] : [])]) LINES.push([`적 ${e.ko}`, null, x.say]);
  if (e.phase) LINES.push([`적 ${e.ko}`, null, e.phase.say]);
}
for (const f of FLOORS) LINES.push([`${f.n}층`, null, `${f.name} ${f.sub}`]);
for (const t of Object.values(TRAITS)) LINES.push([`번뜩임 ${t.ko}`, null, `${t.ko} ${t.text}`]);
// 사도의 말 — 여기가 세계 규칙에 가장 잘 걸리는 자리다(사도가 직접 하는 말이라서)
for (const [hero, moments] of Object.entries(TALK.lines || {}))
  for (const [m, texts] of Object.entries(moments))
    // 대본의 키는 기획서의 한글 이름이다. 옛 heroes.js 를 보면 undefined 가 나온다.
    for (const t of texts) LINES.push([`${(HERO_DATA[hero] || HEROES[hero] || { ko: hero }).ko} ${m}`, hero, t]);

let hits = 0;
for (const r of RULES) {
  const caught = LINES.filter(([, who, text]) => r.re.test(text) && !(r.ok && r.ok(who)));
  if (!caught.length) continue;
  hits += caught.length;
  console.log(`\n[${r.id}] ${r.why}`);
  for (const [where, , text] of caught) console.log(`  ${where}: ${text}`);
}

console.log("");
console.log(hits
  ? `${LINES.length}줄 중 ${hits}줄이 걸렸다 — 예외가 있는 규칙이라 사람이 한 번 봐야 한다.`
  : `${LINES.length}줄을 훑었다. 걸린 줄 없음.`);
process.exit(0);
