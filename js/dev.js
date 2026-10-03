// 시험 화면 — 내 컴퓨터(127.0.0.1 · localhost)에서만 켜진다. 공개판 주소에서는 언제나 null.
//   http://127.0.0.1:8765/?test=ult&party=에르핀,아멜리아,앨리스
// 로비를 건너뛰고 첫 싸움으로 곧장 들어가, 고학년 게이지를 늘 300% 로 채우고 적 체력을 크게 늘린다(컷인 · 이펙트 보기).
//   &hp=0.2 — 적 체력 배율(기본 20). 낮추면 쓰러뜨리는 한 방 · 처치 연출을 본다 · &foes=curburus — 맞설 적 · &gear=1 — 장비를 껴 둔다 · &drop=1 — 적이 장비를 반드시 떨군다
// 시험 판은 저장하지 않는다 — 이어하던 판을 덮지 않게
import { HERO_DATA } from "./cardbook.js";

export const DEV = (() => {
  try {
    const h = location.hostname;
    if (h !== "127.0.0.1" && h !== "localhost") return null;
    const q = new URLSearchParams(location.search);
    if (q.get("test") !== "ult") return null;
    const party = (q.get("party") || "에르핀,아멜리아,앨리스").split(",").map((s) => s.trim()).filter((k) => HERO_DATA[k]).slice(0, 3);
    // hp — 적 체력 배율(기본 20 — 컷인 · 이펙트를 오래 보려고). 0.2 처럼 낮추면 쓰러뜨리는 한 방을 본다
    const hp = Number(q.get("hp")) > 0 ? Number(q.get("hp")) : 20;
    // foes — 맞설 적 id(쉼표). 보스 등장 · 단계 띠를 볼 때 &foes=curburus
    const foes = (q.get("foes") || "").split(",").map((s) => s.trim()).filter(Boolean);
    // gear — 1 이면 사도마다 무기 · 방어구 · 장신구를 하나씩 껴 둔다(애착 장비가 있으면 그것). 장비 보기 시험
    const gear = q.get("gear") === "1";
    // drop — 1 이면 이 싸움의 적이 장비를 반드시 떨군다(떨어진 장비 줍기 · 장비 창 시험)
    const drop = q.get("drop") === "1";
    return party.length ? { party, hp, foes, gear, drop } : null;
  } catch { return null; }
})();
