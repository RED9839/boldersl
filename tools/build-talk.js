// 사도 데스크의 혼잣말 대본에서 이 게임이 쓸 대사를 골라 온다.
//
// **우리가 쓴 글이다.** self-talk.json 의 머리말에 "우리가 쓴 글이며 게임 대사 원문이 아니다"라고
// 적혀 있다(v0.11.7 원칙). 게임 대사를 옮기는 것이 아니라 우리 글을 우리 게임으로 옮기는 것이다.
//
//   node tools/build-talk.js [사도데스크/prototype/data 경로]
//
// 대본은 바탕화면 마스코트용이라 상황이 다르다(아침·저녁·쓰다듬…).
// 그래서 그 상황과 감정을 전투의 순간으로 옮겨 붙인다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ARTMAP from "../js/data/artmap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || "C:/projects/사도 데스크/prototype/data";

const D = JSON.parse(fs.readFileSync(path.join(SRC, "self-talk.json"), "utf8"));
// 대본 쪽 이름은 영문(erpin)이고 우리 사도 키는 기획서의 한글이다.
// 영문 키 그대로 내보냈더니 combat.js 의 TALK.lines[heroKey] 가 언제나 빈다 — 아무도 말을 안 했다.
// 이름 표(artmap)가 한글 → 영문이니 낼 때 뒤집는다.
const KO = {};
for (const [ko, en] of Object.entries(ARTMAP.art)) KO[en] = ko;

// 손으로 고른 여덟은 아래 WROTE·PICK 이 있고, 나머지는 MOMENT 규칙만으로 고른다.
// 규칙이 느슨하면 엉뚱한 줄이 붙으니, 안 맞으면 그냥 비워 둔다 — 틀린 대사보다 없는 편이 낫다.
const HAND = ["erpin", "ner", "elena", "amelia", "ashur", "mayo", "tig", "fricle"];
const ROSTER = [...new Set([...HAND, ...Object.values(ARTMAP.art)])].filter((k) => (D.heroes[k] || []).length);

// 전투의 순간 → 어떤 줄을 고를까. w 는 대본의 상황, m 은 감정.
//
// **느슨하게 잡으면 안 된다.** 처음엔 아무거나 걸리게 뒀더니 에르핀의 전투 시작 대사로
// "놀아 줄 사람이 없네… 심심해서 몸이 배배 꼬인다구" 가 붙었다. 틀린 대사보다 없는 편이 낫다.
//
// 마스코트 대본에는 **반응**이 있고 **행동**이 없다. 맞았을 때·보살핌·쓰러짐·심심함은 그대로 쓰지만,
// 전투 시작·적 처치·승리·본색은 애초에 없는 것이라 손으로 고른 것만 쓴다.
const MOMENT = {
  hit:   { ko: "맞았을 때", want: [{ w: "poked", m: [] }, { w: "thrown", m: ["anger", "sulky"] }] },
  down:  { ko: "주말농장으로", want: [{ w: "thrown", m: ["sad", "surprise"] }, { w: "thrown", m: [] }] },
  heal:  { ko: "보살핌을 받을 때", want: [{ w: "petted", m: [] }] },
  idle:  { ko: "낼 것이 없을 때", want: [{ w: "idle", m: [] }] },
  // 아래 넷은 규칙으로 못 고른다 — PICK 에 적어 둔 것만 나간다
  start: { ko: "전투 시작", want: [] },
  kill:  { ko: "적을 쓰러뜨렸을 때", want: [] },
  ego:   { ko: "본색", want: [] },
  win:   { ko: "이겼을 때", want: [] },
};

// 대본에 없는 자리는 직접 쓴다. 말투는 사도 데스크의 talk-ko.json 프로필을 따르고,
// 내용은 bible.json 의 설정에서 끌어왔다 — 원작 대사를 옮긴 것이 아니다.
//   에르핀 반말/교주/히히·에헤헤 · 네르 존댓말/교주님/하아 · 엘레나 반말/교주/흐흥·크흠
//   아멜리아 격식체/교주님/어라~ · 에슈르 반말/교주/으음·으으 · 마요 음슴체/수집품/후후·흐응
//   티그 반말/교주/크핫·흐흐 · 프리클 반말/교주/치잇·후웃
const WROTE = {
  erpin: {
    start: ["여왕이 직접 나섰다구! 다들 물러서!"],
    kill: ["에헤헤, 봤어? 이 몸이 해냈다구!"],
    win: ["끝났으면 간식! 이건 여왕의 권리야."],
    ego: ["그래도 내가 여왕이야. 비켜!"],
  },
  ner: {
    start: ["하아… 또 여왕님을 지켜야 하는군요."],
    kill: ["책임을 모르는 자에게는 자비도 없습니다."],
    win: ["끝났습니다. 여왕님, 다치신 데는 없으시죠?"],
    ego: ["세계수의 이름으로 심판하겠습니다."],
  },
  elena: {
    start: ["흐흥, 데이터는 이미 다 뽑아 뒀어."],
    kill: ["오차 범위 안이야. 이 정도면 성공이지."],
    win: ["크흠, 물론 계획대로였어. 커피나 마시러 가자."],
    ego: ["감자 삼백만 개면 이 정도는 태울 수 있어."],
  },
  amelia: {
    start: ["좌표 확보했습니다. 시작하시죠."],
    kill: ["처리했습니다. 기록해 두겠습니다."],
    win: ["보고서는 제가 씁니다. 교주님은 쉬십시오."],
    ego: ["궤도에서 보고 있었습니다. 처음부터요."],
  },
  ashur: {
    start: ["으음… 이번 달 월세는 벌어야 하니까."],
    kill: ["이론대로야. 입자는 거짓말을 안 해."],
    win: ["으으, 가게만 안 부서졌으면 됐어."],
    ego: ["이건 빵집이 아니야! 마법 학교라고!"],
  },
  mayo: {
    start: ["값을 매기는 중임. 조용히 있으셈."],
    kill: ["후후, 이제 안 움직임. 좋은 수집품임."],
    win: ["끝났음. 남은 건 전부 제 것임."],
    ego: ["흐응. 당신도 수집품임."],
  },
  tig: {
    kill: ["크핫! 별거 아니잖아. 다음!"],
    win: ["흐흐, 오늘 기록 갱신이야. 세어 뒀어."],
  },
  fricle: {
    start: ["치잇, 계획은 이미 짜 뒀다."],
    kill: ["후웃. 함정에 걸린 건 네 쪽이다."],
    win: ["이쯤은 예정대로다. 놀랄 것 없어."],
    ego: ["가시의 왕관을 보여 주마."],
  },
};

// 손으로 고른 것 — 규칙으로는 못 잡는 자리가 있다.
// 티그가 지면 변명하며 달아나는 것은 원작 설정이라 그 줄이 꼭 여기 와야 한다.
const PICK = {
  tig:   { down: "…어, 어라. 잠깐만. 나 먼저 간다!", start: "자, 누구든 덤벼 보시지. 내가 상대해 줄게!", ego: "검성이 될 사람이 바로 나야. 이름은 기억해 두라고." },
  erpin: { down: "뿌에엥! 여왕을 던지는 게 어디 있어!", win: "에헤헤, 이 몸이 또 대단한 걸 해내고 말았지 뭐야." },
};

const out = {
  _meta: {
    source: "사도 데스크 self-talk.json(우리가 쓴 혼잣말 대본)에서 고른 것 + 이 게임을 위해 직접 쓴 것. 게임 대사 원문이 아니다(v0.11.7 원칙).",
    tool: "tools/build-talk.js",
    built: new Date().toISOString().slice(0, 10),
  },
  lines: {},
};

let total = 0;
const thin = [];

for (const key of ROSTER) {
  const all = D.heroes[key] || [];
  if (!all.length) { thin.push(`${key} — 대본이 없다`); continue; }
  const used = new Set();
  const forHero = {};

  // 직접 쓴 줄 — 대본에 없는 자리
  for (const [moment, texts] of Object.entries(WROTE[key] || {})) {
    forHero[moment] = texts.slice();
    total += texts.length;
  }

  // 손으로 고른 것 — 대본 안에서 이 자리에 꼭 와야 하는 줄
  for (const [moment, text] of Object.entries(PICK[key] || {})) {
    const hit = all.find((l) => l.t === text);
    if (!hit) { thin.push(`${key}/${moment} — 손으로 고른 줄을 대본에서 못 찾았다: ${text.slice(0, 20)}…`); continue; }
    forHero[moment] = [hit.t];
    used.add(hit.t);
  }

  for (const [moment, spec] of Object.entries(MOMENT)) {
    const got = forHero[moment] || [];
    for (const rule of spec.want) {
      if (got.length >= 2) break;
      for (const l of all) {
        if (got.length >= 2) break;
        if (used.has(l.t)) continue;
        if (l.w !== rule.w) continue;
        if (rule.m.length && !rule.m.includes(l.m || "")) continue;
        got.push(l.t);
        used.add(l.t);
      }
    }
    if (!got.length) { if (spec.want.length) thin.push(`${key}/${moment} — 맞는 줄이 없다`); continue; }
    forHero[moment] = got; total += got.length;
  }
  out.lines[KO[key] || key] = forHero;
}

const dst = path.join(__dirname, "..", "js", "data", "talk.js");
fs.writeFileSync(dst, [
  "// 자동 생성 — tools/build-talk.js. 손으로 고치지 말 것.",
  "// 사도 데스크의 혼잣말 대본에서 골라 온 것이다. 우리가 쓴 글이고 게임 대사 원문이 아니다.",
  "export default " + JSON.stringify(out, null, 1) + ";",
  "",
].join("\n"));

const L = (k) => out.lines[KO[k] || k] || {};
const per = ROSTER.map((k) => Object.keys(L(k)).length);
console.log(`대사 ${total}줄 · 사도 ${ROSTER.length}명 · 순간 ${Math.min(...per)}~${Math.max(...per)}개씩 → js/data/talk.js`);
// 어느 순간이 비었는지 — 여기가 곧 "직접 써야 할 자리"다
const MOMENTS = Object.keys(MOMENT);
const empty = MOMENTS.filter((m) => ROSTER.every((k) => !L(k)[m]));
const partial = MOMENTS.filter((m) => !empty.includes(m) && ROSTER.some((k) => !L(k)[m]));
if (empty.length) console.log(`  아무도 없는 순간: ${empty.map((m) => MOMENT[m].ko).join(", ")} — 직접 써야 한다`);
if (partial.length) for (const m of partial) {
  const miss = ROSTER.filter((k) => !L(k)[m]);
  console.log(`  ${MOMENT[m].ko}: ${miss.length}명 비었다 (${miss.slice(0, 6).map((k) => KO[k] || k).join(", ")}${miss.length > 6 ? " 외" : ""})`);
}
for (const t of thin) console.log(`  ! ${t}`);
