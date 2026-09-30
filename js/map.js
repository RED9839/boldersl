// 지도 — 층마다 갈림길이 있는 길을 골라 간다. 파티 미니미가 칸에서 칸으로 걷는다(ui.js 의 mapScreen).
//
// 한 층은 열두 칸 길이다 — 1-1 부터 1-12 까지(왼쪽 → 오른쪽). 줄마다 칸이 2~4개(최대 네 갈래), 무작위로.
//   1-1         일반 전투만 — 처음부터 2~4 갈래로 갈라져 시작한다
//   1-2 ~ 1-10  일반 · 엘리트 · 휴식 · 휴식(상점) · 이벤트 가운데 무작위
//               (엘리트 · 휴식 · 휴식(상점)은 1-4 부터. 줄마다 싸움 칸이 하나는 있다)
//   1-11        휴식(상점) — 보스 앞은 늘 이것 하나. 모두 여기로 모인다
//   1-12        보스
// 한 줄에 자리(레인)가 넷 — 칸은 그 자리에만 서고, 선은 같은 자리 · 바로 옆 자리로만 이어진다(엇갈리지 않는다).
// 모든 칸은 처음 줄에서 닿고, 모든 칸에서 보스에 닿는다.
// 싸움의 세기는 줄이 정한다 — 층의 싸움 세 벌(FLOORS[].fights) 가운데 1-1~1-3 약 · 1-4~1-6 중 · 1-7~ 강.
// 엘리트는 한 단계 센 싸움을 체력 ×ELITE_HP 로(rules.js) — 이기면 장비 하나와 신탁, 골드 더.
//
// 지도는 판의 씨앗과 층으로 정해진다 — 다시 그려도 같은 길이다. 설계는 docs/10-지도.md.
import { makeRng } from "./combat.js";
import { FLOORS } from "./data/enemies.js";

// 싸움 칸마다 그 층 · 그 세기의 싸움 가운데 하나(엘리트는 전용 두 벌). 바로 앞 칸과 같은 짝은 되도록 피한다
function pickFoes(rng, floor, node, prev) {
  const F = FLOORS[floor] || FLOORS[0];
  const pool = node.type === "elite" ? F.elites || [F.fights[2]] : (F.pools || F.fights.map((x) => [x]))[node.fight] || [F.fights[0]];
  const fresh = pool.filter((p) => !prev.some((q) => q === p));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rng() * from.length)];
}

export const ROWS = 12;
export const MAX_LANES = 4;
export const KIND_KO = { start: "출발", fight: "일반", elite: "엘리트", camp: "휴식", campshop: "휴식 · 상점", event: "이벤트", boss: "보스" };

// 1-2 ~ 1-10 에서 칸 종류를 고르는 무게 — 줄에 따라 못 나오는 것이 있다
function kindWeights(r) {
  return [
    ["fight", 46],
    ["event", 22],
    ["elite", r >= 3 ? 17 : 0],
    ["camp", r >= 3 ? 8 : 0],
    ["campshop", r >= 3 && r <= 8 ? 20 : 0],       // 1-4 ~ 1-9. 1-10 은 빼 둔다 — 바로 뒤가 휴식(상점)이다
  ];
}
const tierOf = (r) => (r < 3 ? 0 : r < 6 ? 1 : 2);

export function genMap(seed, floor) {
  const rng = makeRng(((seed >>> 0) ^ Math.imul(floor + 1, 2654435761)) >>> 0);
  const weighted = (ws) => {
    const tot = ws.reduce((a, [, w]) => a + w, 0);
    let x = rng() * tot;
    for (const [k, w] of ws) { if ((x -= w) < 0) return k; }
    return ws[0][0];
  };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // ① 길의 뼈대 — 한 줄에 자리(레인)가 넷. 칸은 그 자리에만 선다.
  //   잇는 선은 같은 자리 또는 바로 옆 자리로만 가고, 서로 엇갈리지 않는다(i → i+1 이 있으면 i+1 → i 는 없다).
  //   선이 곧고 겹치지 않아서 어디로 갈 수 있는지가 한눈에 읽힌다. (전에는 먼 칸끼리도 곡선으로 이어 뒤엉켰다)
  const lanesOf = [];
  const links = [];                               // links[r] = [[fromLane, toLane], ...]
  lanesOf[0] = shuffle([0, 1, 2, 3]).slice(0, 2 + Math.floor(rng() * (MAX_LANES - 1))).sort((x, y) => x - y);
  for (let r = 0; r < ROWS - 3; r++) {            // 1-1 → … → 1-10 (1-11 · 1-12 는 하나로 모인다)
    const from = lanesOf[r], L = [];
    const crosses = (i, j) => L.some(([a, b]) => (a < i && b > j) || (a > i && b < j));
    for (const i of from) {
      const opts = shuffle([i - 1, i, i + 1].filter((j) => j >= 0 && j < MAX_LANES));
      let made = 0;
      const want = rng() < 0.38 ? 2 : 1;
      for (const j of opts) {
        if (made >= want) break;
        if (crosses(i, j)) continue;
        L.push([i, j]); made++;
      }
      if (!made) L.push([i, i]);                  // 곧장 앞으로는 언제나 엇갈리지 않는다
    }
    let to = [...new Set(L.map(([, j]) => j))];
    // 다음 줄이 한 칸뿐이면 갈래가 사라진다 — 옆 자리로 한 가닥 더 낸다(2칸 이상)
    if (to.length < 2) {
      for (const i of shuffle(from.slice())) {
        const j = [i - 1, i + 1].find((j) => j >= 0 && j < MAX_LANES && !to.includes(j) && !crosses(i, j));
        if (j != null) { L.push([i, j]); to.push(j); break; }
      }
    }
    lanesOf[r + 1] = to.sort((x, y) => x - y);
    links[r] = L;
  }

  // ② 칸 종류 — 뼈대 위에 앉힌다
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const last = r === ROWS - 1, beforeBoss = r === ROWS - 2;
    const lanes = last || beforeBoss ? [null] : lanesOf[r];
    const kinds = lanes.map(() => (last ? "boss" : beforeBoss ? "campshop" : r === 0 ? "fight" : weighted(kindWeights(r))));
    // 줄마다 싸움 칸(일반 · 엘리트)이 하나는 — 싸움을 아예 못 고르는 줄이 없게
    if (!last && !beforeBoss && !kinds.some((k) => k === "fight" || k === "elite")) kinds[Math.floor(rng() * kinds.length)] = "fight";
    rows.push(lanes.map((lane, c) => {
      const node = { id: `r${r}c${c}`, row: r, col: c, lane, x: lane == null ? 0.5 : lane / (MAX_LANES - 1), type: kinds[c], next: [] };
      if (node.type === "fight") node.fight = tierOf(r);
      if (node.type === "elite") node.fight = Math.min(2, tierOf(r) + 1);
      return node;
    }));
  }
  // ③ 잇기 — 뼈대의 선을 칸 id 로. 1-10 의 모든 칸 → 1-11 휴식(상점) → 1-12 보스
  for (let r = 0; r < ROWS - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    if (b.length === 1) { for (const n of a) n.next = [b[0].id]; continue; }
    const byLane = (lane) => b.find((z) => z.lane === lane);
    for (const [i, j] of links[r]) {
      const n = a.find((z) => z.lane === i), t = byLane(j);
      if (n && t && !n.next.includes(t.id)) n.next.push(t.id);
    }
    const colOf = (id) => b.find((z) => z.id === id).col;
    for (const n of a) n.next.sort((p, q) => colOf(p) - colOf(q));
  }
  // ③½ 적 — 칸마다 미리 정해 둔다(지도에 누가 나오는지 보인다). 들어오는 칸들의 짝과 겹치지 않게
  for (let r = 0; r < rows.length; r++) for (const n of rows[r]) {
    if (n.type !== "fight" && n.type !== "elite") continue;
    const prev = r ? rows[r - 1].filter((p) => p.next.includes(n.id) && p.foes).map((p) => p.foes) : [];
    n.foes = pickFoes(rng, floor, n, prev);
  }
  // ④ 출발 칸(1-0) — 맨 앞에 하나. 파티가 여기 서서 시작하고, 1-1 의 칸 모두로 이어진다
  const rename = {};
  for (const row of rows) for (const n of row) { n.row += 1; const id = `r${n.row}c${n.col}`; rename[n.id] = id; n.id = id; }
  for (const row of rows) for (const n of row) n.next = n.next.map((x) => rename[x]);
  const start = { id: "r0c0", row: 0, col: 0, lane: null, x: 0.5, type: "start", next: rows[0].map((n) => n.id) };
  rows.unshift([start]);
  return { floor, rows, at: start.id, seen: [start.id] };
}

// 지금 칸에서 앞으로 닿을 수 있는 칸 전부 — 화면이 이 밖의 칸 · 길을 흐리게 한다
export function aheadOf(run) {
  const map = mapOf(run);
  const out = new Set(reachable(run));
  for (const row of map.rows) for (const n of row) if (out.has(n.id)) n.next.forEach((x) => out.add(x));
  return out;
}

// 이 판의 지금 층 지도 — 없거나 층이 바뀌었으면 새로 그린다
export function mapOf(run) {
  if (!run.map || run.map.floor !== run.floor) run.map = genMap(run.seed, run.floor);
  return run.map;
}
export const nodeById = (map, id) => map.rows.flat().find((n) => n.id === id) || null;
export const currentNode = (run) => (run.map && run.map.at ? nodeById(run.map, run.map.at) : null);
// 칸 이름 — 「1-5」
export const stageName = (run, node) => `${run.floor + 1}-${node.row}`;        // 1-0 출발 · 1-1 … 1-12 보스

// 지금 고를 수 있는 칸 — 지금 칸에서 이어진 칸(출발 칸이면 1-1 의 2~4 갈래)
export function reachable(run) {
  const map = mapOf(run);
  if (!map.at) return map.rows[1].map((n) => n.id);
  const here = nodeById(map, map.at);
  return here ? here.next.slice() : [];
}

// 칸에 들어간다 — 싸움 칸이면 어느 싸움인지(run.node), 엘리트인지(run.elite) 정한다. 보스는 node 3(run.js 의 isBoss)
export function enterNode(run, id) {
  const map = mapOf(run);
  if (!reachable(run).includes(id)) return null;
  const node = nodeById(map, id);
  map.at = id;
  map.seen.push(id);
  run.step = (run.step || 0) + 1;              // 싸움마다 다른 씨앗 — 같은 세기 싸움이 똑같이 흘러가지 않게
  run.elite = node.type === "elite";
  if (node.type === "fight" || node.type === "elite") run.node = node.fight;
  if (node.type === "boss") run.node = 3;
  return node;
}

// 이 칸에서 만나는 적 — 지도에 미리 보여 준다
export function enemiesAt(run, node) {
  const f = FLOORS[run.floor];
  if (node.type === "boss") return f.boss;
  if (node.type === "fight" || node.type === "elite") return node.foes || f.fights[node.fight] || [];
  return [];
}
