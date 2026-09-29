// 사도 전용 키워드 이름이 서로 겹치거나 엔진의 상태 이름과 겹치지 않는지 본다.
//
//   node tools/check-keyword-names.js [기획서.md]      기본: .omc/redesign/_기획서.md (없으면 바탕화면 기획서)
//
// 키워드는 이름으로 쌓인다. 두 사도가 같은 이름을 쓰면 한 파티에서 스택 칸을 같이 쓰고,
// 「감전」 처럼 엔진이 이미 아는 상태 이름이면 그 상태의 규칙(공격력 -10%·턴마다 1 감소)까지 섞인다.
import fs from "node:fs";
import { parseHeroBlock } from "./lib/hero-block.js";

const VOCAB = ["피해", "방어", "방어력", "실드", "회복", "공격력", "치명", "확률", "기절", "도발", "침묵", "취약", "약화", "무적", "드로우", "게이지", "코스트", "소모", "손패", "버리고", "파괴", "해제", "디버프", "아군", "전원", "전체", "무작위", "자신", "최대", "최저", "감소", "보존", "소멸", "개전", "이번", "전투", "턴간", "시작", "종료", "처치", "쓰러지면", "받으면", "궁극기", "연계"];
const STATUS = ["취약", "약화", "기절", "도발", "침묵", "감전", "중독", "힘", "가시"];
const file = process.argv[2] || (fs.existsSync(".omc/redesign/_기획서.md") ? ".omc/redesign/_기획서.md" : "C:/Users/User/Desktop/볼더슬/트릭컬_기획서_전체.md");
const text = fs.readFileSync(file, "utf8");
const by = new Map();
for (const raw of text.split(/^### /m).slice(1)) {
  const h = parseHeroBlock(raw);
  if (!h || !h.keyword) continue;
  if (!by.has(h.keyword.ko)) by.set(h.keyword.ko, []);
  by.get(h.keyword.ko).push(h.ko);
}
let bad = 0;
for (const [k, who] of by) {
  if (who.length > 1) { console.log(`  겹침 「${k}」: ${who.join(", ")}`); bad++; }
  if (STATUS.includes(k)) { console.log(`  상태 이름과 같다 「${k}」: ${who.join(", ")}`); bad++; }
  // 키워드는 글 어디서든 낱말로 찾는다 — 「기」 가 「기절」 안에서 잡혀 기절이 못 읽힌 적이 있다
  const inside = VOCAB.filter((w) => w !== k && w.includes(k));
  if (inside.length) { console.log(`  다른 낱말 안에 든다 「${k}」(${who.join(", ")}): ${inside.join(" · ")}`); bad++; }
  const other = [...by.keys()].filter((x) => x !== k && x.includes(k));
  // 카드는 제 키워드로만 읽고 스택은 이름 전체로 쌓이니 서로 섞이지 않는다 — 알리기만 한다
  if (other.length) console.log(`  참고 다른 키워드 안에 든다 「${k}」: ${other.join(" · ")}`);
}
console.log(bad ? `키워드 이름 문제 ${bad}` : `키워드 ${by.size}개 — 겹치는 이름 없음`);
process.exit(bad ? 1 : 0);
