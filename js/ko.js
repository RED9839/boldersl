// 한국어 조사 — 받침에 따라 갈라 쓴다. 로그와 화면이 같이 쓴다.
// 끝의 닫는 괄호 · 따옴표(「X」 · (X))는 건너뛰고 그 앞 글자를 본다. 숫자는 읽는 소리로(1 일 · 2 이 …).
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];   // 0 영 · 1 일 · 2 이 · 3 삼 · 4 사 · 5 오 · 6 육 · 7 칠 · 8 팔 · 9 구 (받침 번호, 8 = ㄹ)
const jongOf = (w) => {
  const ch = String(w).replace(/[\s」』)\]"'»]+$/, "").slice(-1);
  if (/[0-9]/.test(ch)) return DIGIT_JONG[+ch];
  const c = ch.charCodeAt(0);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return 0;
  return (c - 0xac00) % 28;
};
const hasJong = (w) => jongOf(w) !== 0;
export const 이가 = (w) => w + (hasJong(w) ? "이" : "가");
export const 을를 = (w) => w + (hasJong(w) ? "을" : "를");
export const 은는 = (w) => w + (hasJong(w) ? "은" : "는");
export const 과와 = (w) => w + (hasJong(w) ? "과" : "와");
// 받침이 없거나 ㄹ 받침이면 「로」(칼로 · 활로), 그 밖의 받침은 「으로」
export const 으로 = (w) => w + josa(w, "으로");
// 사람 이름 뒤 호격/주격에 쓰는 "이" (에르핀이 · 네르가)
export const 에게 = (w) => w + "에게";
// 조사만 — 「X」 와 조사를 띄워 쓰는 자리(「X」 을)에 쓴다. pair: "을를" · "이가" · "은는" · "과와" · "으로"
export function josa(w, pair) {
  const j = jongOf(w);
  if (pair === "으로") return j && j !== 8 ? "으로" : "로";
  return j ? pair[0] : pair[1];
}
