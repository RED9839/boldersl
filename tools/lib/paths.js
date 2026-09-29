// 기획서가 있는 곳 — 한곳에만 적는다.
// 예전에는 바탕화면(C:/Users/User/Desktop/볼더슬)에 있어서 도구마다 그 경로를 따로 적었다.
// 저장소 안으로 옮기면서 여기 하나로 모았다.
import { fileURLToPath } from "node:url";

export const DESIGN_DOC = fileURLToPath(new URL("../../트릭컬_기획서_전체.md", import.meta.url));
