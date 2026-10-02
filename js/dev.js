// 시험 화면 — 내 컴퓨터(127.0.0.1 · localhost)에서만 켜진다. 공개판 주소에서는 언제나 null.
//   http://127.0.0.1:8765/?test=ult&party=에르핀,아멜리아,앨리스
// 로비를 건너뛰고 첫 싸움으로 곧장 들어가, 고학년 게이지를 늘 300% 로 채우고 적 체력을 크게 늘린다(컷인 · 이펙트 보기).
// 시험 판은 저장하지 않는다 — 이어하던 판을 덮지 않게
import { HERO_DATA } from "./cardbook.js";

export const DEV = (() => {
  try {
    const h = location.hostname;
    if (h !== "127.0.0.1" && h !== "localhost") return null;
    const q = new URLSearchParams(location.search);
    if (q.get("test") !== "ult") return null;
    const party = (q.get("party") || "에르핀,아멜리아,앨리스").split(",").map((s) => s.trim()).filter((k) => HERO_DATA[k]).slice(0, 3);
    return party.length ? { party } : null;
  } catch { return null; }
})();
