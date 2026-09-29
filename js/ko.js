// 한국어 조사 — 받침에 따라 갈라 쓴다. 로그와 화면이 같이 쓴다.
const hasJong = (w) => {
  const c = String(w).trim().slice(-1).charCodeAt(0);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
};
export const 이가 = (w) => w + (hasJong(w) ? "이" : "가");
export const 을를 = (w) => w + (hasJong(w) ? "을" : "를");
export const 은는 = (w) => w + (hasJong(w) ? "은" : "는");
export const 과와 = (w) => w + (hasJong(w) ? "과" : "와");
// 사람 이름 뒤 호격/주격에 쓰는 "이" (에르핀이 · 네르가)
export const 에게 = (w) => w + "에게";
