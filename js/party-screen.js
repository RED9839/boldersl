// 편성 · 도감 화면. 같이 쓰는 조각은 ui-common.js.
import { CARDS } from "./cardbook.js";
import { ENEMIES, FLOORS } from "./data/enemies.js";
import { HERO_DATA, kitOf, EQUIP, NEUTRAL_IDS } from "./cardbook.js";
import CARDART from "./data/cardart.js";
import { shortText, blessLine } from "./card-text.js";
import * as C from "./combat.js";
import * as RULES from "./rules.js";
import * as art from "./art.js";
import { speak } from "./voice.js";
import { sfx } from "./sfx.js";
import { spineView } from "./spine-view.js";
import { el, hint, screen, NTINT, uiIcon, goldLabel, mistletoeIcon, openHelp, fsButton, img, withKeywords, kwText, showCard, showPiles, bigCard, BATTLE_BG, GRADE_COLOR, emptySlotIcon, equipCard } from "./ui-common.js";
import { nameMatch } from "./ko.js";

// ── 편성 ───────────────────────────────────────────────────────────────
// 카제나의 「요원 도감 → 상세 정보」 얼개다.
//   도감   왼쪽 종족 레일 · 초상 격자(이격까지 135명) · 위에 정렬 · 아래 고른 셋
//   정보   왼쪽 갈피(능력치·카드·신탁·고학년 스킬) · 오른쪽 내용
// 카드는 실제 카드 꼴로 세워 그린다 — 코스트·이름·타입·그림·효과·태그.
// 그림은 꺼내 둔 스킬 아이콘을 쓴다(고학년 스킬=졸업, 시그니처=입학, 나머지=어사이드).

const NATURES = ["순수", "광기", "냉정", "우울", "활발", "공명"];
const ROWS_KO = { front: "전열", mid: "중열", back: "후열" };
// 찾기 — 이름(초성으로도, ko.js nameMatch) 또는 열(「전열」 · 「ㅈㅇ」 · 「후열」). 「모든 열」 사도는 어느 열로 찾아도 나온다(2026-10 사용자)
const heroMatch = (h, q) => nameMatch(h.ko, q)
  || Object.values(ROWS_KO).some((r) => nameMatch(r, q) && (h.anyRow || ROWS_KO[h.row] === r))
  || (h.anyRow && nameMatch("모든 열", q));
// 명단 · 도감에 적는 자리 — 「모든 열」 사도는 그렇게 적는다
const rowLabel = (h) => (h && h.anyRow ? "모든 열" : ROWS_KO[h && h.row] || "");
const ROLES = ["탱커", "딜러", "서포터"];
const DEX_TABS = ["사도", "교주 카드", "장비"];      // 도감의 갈피
const GRADES = ["전설", "희귀", "고급", "일반"];      // 교주 카드 · 장비의 등급(높은 것부터)

const isEcho = (k) => k.includes("_");            // 이격 — 에르핀_왕도
const baseName = (k) => k.split("_")[0];

// opts.view — "도감" 이면 도감부터 연다(로비의 「사도 도감」). 그때 도감에서 나가면 로비(onBack)로 돌아간다
export function partyScreen(onStart, onBack, opts = {}) {
  const s = screen();
  s.classList.add("dexscreen");

  const roster = Object.entries(HERO_DATA);
  const RACES = [...new Set(roster.map(([, h]) => h.race))].sort();
  // 성급 — 기획서 낱말이다. 등급은 장비 희귀도(일반·고급·희귀·전설)에 쓴다.
  const SORTS = {
    성급: (a, b) => b[1].star - a[1].star || a[1].ko.localeCompare(b[1].ko),
    이름: (a, b) => a[1].ko.localeCompare(b[1].ko),
    공격: (a, b) => b[1].atk - a[1].atk,
    체력: (a, b) => b[1].hp - a[1].hp,
  };

  let picked = [];
  let view = opts.view || null;          // null 편성 · "도감" 도감 · 사도 키면 사도 정보
  let dexHome = opts.view === "도감";      // 로비에서 곧장 연 도감 — 편성으로 넘어가면 풀린다(그 뒤 도감의 ◁ 은 편성으로)
  let cameFrom = null;                   // 사도 정보에서 나가면 들어온 곳으로 돌아간다
  let tab = "능력치";                    // 사도 정보에서 먼저 뜨는 갈피
  let dexTab = "사도";                    // 도감의 갈피 — 사도 · 교주 카드 · 장비
  const book = { grade: null, slot: null, open: new Set() };   // 교주 카드 · 장비 도감의 거르개, 신탁을 펼친 카드
  // 그 카드가 받은 고유 축복이 몇 번째인가 — 이어할 판의 run.shin(opts.shin)에서. -1 이면 아직(그러면 전부 보인다)
  const blessChosen = (id) => RULES.blessIdx((opts.shin || {})[id]);
  const rows = {};
  const filter = { race: null, nature: null, role: null, q: "" };
  let sort = "성급", desc = true;

  // ── 도감 ─────────────────────────────────────────────────────────────
  // 틀은 한 번만 세우고 바뀌는 것만 다시 채운다 —
  // 한 글자 칠 때마다 통째로 다시 그리면 입력칸이 새로 생겨 커서가 날아간다.
  function dexScreen() {
    s.innerHTML = "";
    s.className = "dexscreen";
    stageBg();

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { if (dexHome && onBack) return onBack(); view = null; render(); };   // 도감에서 나가면 편성으로(로비에서 왔으면 로비로)
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", `${dexTab} 도감`));
    // 갈피 셋 — 사도 · 교주 카드 · 장비. 같은 틀(왼쪽 레일 · 오른쪽 격자 · 아래 편성으로)을 같이 쓴다
    const tabs = el("div", "dextabs");
    for (const t of DEX_TABS) {
      const b = el("button", "dextab" + (t === dexTab ? " on" : ""), t);
      b.onclick = () => { if (dexTab !== t) { dexTab = t; render(); } };
      tabs.appendChild(b);
    }
    bar.appendChild(tabs);
    bar.appendChild(fsButton("fsright"));
    if (dexTab !== "사도") { s.appendChild(bar); bookBody(); s.appendChild(dexFoot().foot); return; }

    const search = el("input", "dsearch");
    search.placeholder = "이름 · 초성 · 열";
    search.value = filter.q;
    search.oninput = () => { filter.q = search.value.trim(); fill(); };
    bar.appendChild(search);

    const sortBtn = el("button", "sortbtn");
    const sortLabel = el("span", null, sort);
    const sortArrow = el("i", "arrow", desc ? "↓" : "↑");
    sortBtn.appendChild(sortLabel);
    sortBtn.appendChild(sortArrow);
    sortBtn.onclick = () => {
      const keys = Object.keys(SORTS);
      const i = keys.indexOf(sort);
      if (desc) desc = false; else { desc = true; sort = keys[(i + 1) % keys.length]; }
      fill();
    };
    bar.appendChild(sortBtn);
    s.appendChild(bar);

    const body = el("div", "dbody");

    // 왼쪽 종족 레일 — 기획서에 세력이라는 구분은 없다. 종족 여덟이 그 자리다.
    const rail = el("nav", "rail");
    const railBtns = {};
    const mk = (label, val) => {
      const b = el("button", "railbtn");
      const emb2 = el("span", "remb");
      if (val === "ALL") emb2.textContent = "◎";
      else emb2.appendChild(uiIcon("종족", label, "rico", label.slice(0, 1)));
      b.appendChild(emb2);
      b.appendChild(el("span", "rname", label));
      b.onclick = () => { filter.race = val === "ALL" ? null : val; fill(); };
      railBtns[val] = b;
      return b;
    };
    rail.appendChild(mk("ALL", "ALL"));
    for (const r of RACES) rail.appendChild(mk(r, r));
    body.appendChild(rail);

    const right = el("div", "dright");

    // 거르개 — 성격과 역할
    const chips = el("div", "chiprow");
    const chipBtns = { nature: {}, role: {} };
    const chipGroup = (vals, key) => {
      const all = el("button", "chip", "전체");
      all.onclick = () => { filter[key] = null; fill(); };
      chipBtns[key].__all = all;
      chips.appendChild(all);
      for (const v of vals) {
        const b = el("button", "chip" + (key === "nature" ? " n" + v : ""));
        if (key === "nature") b.appendChild(uiIcon("성격", v, "cico", ""));
        b.appendChild(el("span", null, v));
        b.onclick = () => { filter[key] = filter[key] === v ? null : v; fill(); };
        chipBtns[key][v] = b;
        chips.appendChild(b);
      }
      chips.appendChild(el("span", "chipgap"));
    };
    chipGroup(NATURES, "nature");
    chipGroup(ROLES, "role");
    right.appendChild(chips);

    const head = el("div", "dhead2");
    const emb = el("span", "hemb");
    head.appendChild(emb);
    const ht = el("div");
    const hname = el("b");
    const cnt = el("span", "hcount");
    ht.appendChild(hname);
    ht.appendChild(cnt);
    head.appendChild(ht);
    right.appendChild(head);

    const grid = el("div", "dexgrid");
    right.appendChild(grid);
    body.appendChild(right);
    s.appendChild(body);

    const { foot, said } = dexFoot();
    s.appendChild(foot);

    function fill() {
      for (const [v, b] of Object.entries(railBtns)) b.classList.toggle("on", (filter.race || "ALL") === v);
      for (const key of ["nature", "role"]) {
        chipBtns[key].__all.classList.toggle("on", !filter[key]);
        for (const [v, b] of Object.entries(chipBtns[key])) if (v !== "__all") b.classList.toggle("on", filter[key] === v);
      }
      sortLabel.textContent = sort;
      sortArrow.textContent = desc ? "↓" : "↑";
      emb.innerHTML = "";
      if (filter.race) emb.appendChild(uiIcon("종족", filter.race, "rico", filter.race.slice(0, 1)));
      else emb.textContent = "◎";
      hname.textContent = filter.race || "모든 종족";

      const list = roster
        .filter(([k, h]) => {
          // 이격도 한자리에 깐다. 탭으로 갈라 두면 "에르핀" 을 찾았을 때
          // 에르핀(왕도) 가 뒤에 숨어, 찾는 사람은 그 사도가 없다고 본다.
          if (filter.race && h.race !== filter.race) return false;
          if (filter.nature && h.nature !== filter.nature) return false;
          if (filter.role && h.role !== filter.role) return false;
          if (filter.q && !heroMatch(h, filter.q)) return false;   // 이름(초성으로도) · 열
          return true;
        })
        .sort((x, y) => (desc ? 1 : -1) * SORTS[sort](x, y));

      cnt.textContent = `${list.length}/${roster.length}`;

      grid.innerHTML = "";
      for (const [k, h] of list) grid.appendChild(dexCard(k, h));
      if (!list.length) grid.appendChild(el("div", "more", "맞는 사도가 없습니다."));

      said.textContent = picked.length
        ? `${picked.map((k) => HERO_DATA[k].ko).join(" · ")} — ${picked.length}/3`
        : "아직 아무도 안 골랐습니다";
    }
    fill();
  }

  // 아래 — 고른 셋을 알려 주고 편성으로 돌아가는 길(도감 갈피 셋이 같이 쓴다)
  function dexFoot() {
    const foot = el("div", "dfoot");
    const backToForm = el("button", "go", "편성으로");
    backToForm.onclick = () => { dexHome = false; view = null; render(); };
    const said = el("span", "dsaid", picked.length
      ? `${picked.map((k) => HERO_DATA[k].ko).join(" · ")} — ${picked.length}/3`
      : "아직 아무도 안 골랐습니다");
    foot.appendChild(said);
    if (!opts.dexOnly) foot.appendChild(backToForm);   // 이어할 판이 있을 때 로비에서 연 도감 — 새 판은 「새 모험」 확인으로만
    return { foot, said };
  }

  // ── 교주 카드 · 장비 도감 ──────────────────────────────────────────────
  // 사도 도감과 같은 틀 — 왼쪽 레일(교주 카드는 등급, 장비는 칸) · 오른쪽 거르개 · 머리 · 격자.
  // 그림은 이미 있는 것을 그대로 쓴다 — 카드는 bigCard(상점 · 더미 창과 같은 카드), 장비는 equipCard(상점 · 끼기 or 팔기 창과 같은 장비 칸)
  function bookBody() {
    const isCard = dexTab === "교주 카드";
    const body = el("div", "dbody");
    const rail = el("nav", "rail");
    const railKey = isCard ? "grade" : "slot";
    const railVals = isCard ? GRADES : RULES.SLOTS;
    const mk = (val) => {
      const b = el("button", "railbtn" + ((book[railKey] || "ALL") === val ? " on" : ""));
      const emb = el("span", "remb");
      if (val === "ALL") emb.textContent = "◎";
      else if (isCard) { emb.textContent = "◆"; emb.style.color = GRADE_COLOR[val]; }
      else emb.appendChild(emptySlotIcon(val, 22));
      b.appendChild(emb);
      b.appendChild(el("span", "rname", val));
      b.onclick = () => { book[railKey] = val === "ALL" ? null : val; render(); };
      return b;
    };
    rail.appendChild(mk("ALL"));
    for (const v of railVals) rail.appendChild(mk(v));
    body.appendChild(rail);

    const right = el("div", "dright");
    // 장비는 레일이 칸이라, 등급을 위의 거르개로 고른다
    if (!isCard) {
      const chips = el("div", "chiprow");
      const all = el("button", "chip" + (book.grade ? "" : " on"), "전체");
      all.onclick = () => { book.grade = null; render(); };
      chips.appendChild(all);
      for (const g of GRADES) {
        const b = el("button", "chip bkgrade" + (book.grade === g ? " on" : ""));
        b.style.setProperty("--gc", GRADE_COLOR[g]);
        b.appendChild(el("i", "bkdot"));
        b.appendChild(el("span", null, g));
        b.onclick = () => { book.grade = book.grade === g ? null : g; render(); };
        chips.appendChild(b);
      }
      right.appendChild(chips);
    }

    const byGrade = (a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
    const list = isCard
      ? NEUTRAL_IDS.map((id) => CARDS[id]).filter((c) => c && (!book.grade || c.grade === book.grade))
        .sort((a, b) => byGrade(a, b) || a.cost - b.cost || a.name.localeCompare(b.name))
      : Object.values(EQUIP).filter((e) => (!book.slot || e.slot === book.slot) && (!book.grade || e.grade === book.grade))
        .sort((a, b) => byGrade(a, b) || RULES.SLOTS.indexOf(a.slot) - RULES.SLOTS.indexOf(b.slot) || a.ko.localeCompare(b.ko));
    const total = isCard ? NEUTRAL_IDS.length : Object.keys(EQUIP).length;

    const head = el("div", "dhead2");
    head.appendChild(el("span", "hemb", isCard ? "◈" : "⚔"));
    const ht = el("div");
    const sel = isCard ? book.grade : [book.slot, book.grade].filter(Boolean).join(" · ");
    ht.appendChild(el("b", null, `${sel || "모든"} ${dexTab}`));
    ht.appendChild(el("span", "hcount", `${list.length}/${total}`));
    head.appendChild(ht);
    head.appendChild(el("span", "bknote", isCard
      ? "골디의 상점에서 삽니다 · 어느 사도의 것도 아닙니다 · 카드를 누르면 낱말 풀이"
      : "사도마다 무기 · 방어구 · 장신구 한 칸씩 · 애착 사도가 끼면 더 셉니다"));
    right.appendChild(head);

    const grid = el("div", "dexgrid " + (isCard ? "cbgrid" : "eqgrid"));
    for (const x of list) grid.appendChild(isCard ? neutralCell(x) : equipCard(x.id));
    if (!list.length) grid.appendChild(el("div", "more", "맞는 것이 없습니다."));
    right.appendChild(grid);
    body.appendChild(right);
    s.appendChild(body);
  }

  // 교주 카드 한 칸 — 카드 그림 · 등급과 값 · 전문 · 신탁 다섯(눌러서 펼친다)
  function neutralCell(c) {
    const cell = el("div", "cbcell");
    cell.appendChild(bigCard(c, CARDART.pic[c.id] || null));
    const meta = el("div", "cbmeta");
    meta.appendChild(el("span", "sh-grade g-" + (c.grade || ""), c.grade || "교주"));
    if (c.price) meta.appendChild(goldLabel("span", "cbprice", String(c.price)));
    if (RULES.isOnly(c) && !c.unique) meta.appendChild(el("span", "cbone", "유일"));   // 유일(rules.js isOnly) — 강화 카드는 제 꼬리표가 말한다
    cell.appendChild(meta);
    cell.appendChild(withKeywords(el("p", "cbtext"), c.text, null));
    if (c.blurb) cell.appendChild(el("p", "cbblurb", c.blurb));
    if (c.flash && c.flash.length) {
      const on = book.open.has(c.id);
      const btn = el("button", "cbflashbtn" + (on ? " on" : ""), `신탁 ${c.flash.length} ${on ? "▴" : "▾"}`);
      const box = el("div", "cbflash");
      const fill = () => {
        const open = book.open.has(c.id);
        btn.className = "cbflashbtn" + (open ? " on" : "");
        btn.textContent = `신탁 ${c.flash.length} ${open ? "▴" : "▾"}`;
        box.innerHTML = "";
        if (!open) return;
        for (const f of c.flash) {
          const n = el("div", "cbf");
          n.appendChild(el("b", null, f.ko));
          n.appendChild(withKeywords(el("p"), f.text, null));
          box.appendChild(n);
        }
        // 신탁 위에 얹히는 그 카드만의 축복 — 받기 전엔 전부, 받았으면 고른 것을 밝힌다
        const chosen = blessChosen(c.id);
        RULES.blessList(c).forEach((b, i) => {
          const n = el("div", "cbf cbbless" + (chosen === i ? " on" : chosen >= 0 ? " off" : ""));
          const bn = el("b"); bn.appendChild(mistletoeIcon()); bn.appendChild(document.createTextNode(b.ko)); n.appendChild(bn);
          n.appendChild(withKeywords(el("p"), `겨우살이의 축복 — ${blessLine(b)}`, null));
          box.appendChild(n);
        });
      };
      btn.onclick = () => { if (book.open.has(c.id)) book.open.delete(c.id); else book.open.add(c.id); fill(); };
      fill();
      cell.appendChild(btn);
      cell.appendChild(box);
    }
    return cell;
  }

  // 도감 · 사도 정보도 편성과 같은 1층 싸움터를 깐다 — 흐리고 어둡게는 css 가(czn.css 끝)
  function stageBg() {
    const bg = `assets/bg/${BATTLE_BG[1].fight}.jpg`;
    s.style.setProperty("--stagebg", `url("${typeof location === "object" ? new URL(bg, location.href).href : bg}")`);
  }

  // ── 팀 편성 ──────────────────────────────────────────────────────────
  // 카제나 얼개다 — 큰 세로 카드 셋을 가운데 세우고, 오른쪽에 이번 싸움을 적는다.
  // 트릭컬 쪽을 얹는다: 카드마다 정해진 위치(전열·중열·후열)를 보여 준다. 고르는 것이 아니다.
  // 빈 자리를 누르면 사도를 고르는 서랍이 열린다.

  // ── 편성 — 위는 무대(고른 셋이 싸움터에 선다), 아래는 명단(늘 펼쳐 둔다) ─────────────
  // 전투 화면과 같은 옷: 1층 싸움터 배경 · 어두운 유리 · 금선. 사도는 전투처럼 스파인으로 같은 배율.
  // 무대의 자리는 전투와 같다 — 후열이 왼쪽, 전열이 가운데 쪽(적을 본다). 자리는 기획서가 정한 대로(고르지 않는다).
  function formScreen() {
    s.innerHTML = "";
    s.className = "teamscreen3";
    stageBg();

    // ① 머리
    const head = el("div", "tf-head");
    if (onBack) { const b = el("button", "tm-fback", "◁"); b.title = "처음으로"; b.onclick = onBack; head.appendChild(b); }
    const title = el("div", "tf-title");
    title.appendChild(el("b", null, "팀 편성"));
    const count = el("span", "tf-count");
    title.appendChild(count);
    head.appendChild(title);
    head.appendChild(fsButton());
    const helpBtn = el("button", "tm-fhelp", "도움말");
    helpBtn.onclick = () => openHelp("상성");
    head.appendChild(helpBtn);
    const dexBtn = el("button", "tm-fdex", "도감");
    dexBtn.title = "사도 · 교주 카드 · 장비 도감";
    dexBtn.onclick = () => { filter.q = ""; view = "도감"; render(); };
    head.appendChild(dexBtn);
    s.appendChild(head);

    // ② 왼쪽 — 사도 칸 셋(멈춘 스탠딩 그림). 누르면 사도 고르기 창
    const main = el("div", "tf-main");
    const slots = el("div", "tf-slots");
    main.appendChild(slots);

    // ③ 오른쪽 — 첫 층 · 파티 성격 · 시작 덱 · 떠납니다
    const side = el("aside", "tf-side");
    const floor = FLOORS[0];
    const where = el("section", "tf-floor");
    const wt = el("div", "tf-ftop");
    wt.appendChild(el("small", null, "첫 층"));
    wt.appendChild(el("b", null, `${floor.n}층 · ${floor.name}`));
    const sub = el("span", null, floor.sub);
    sub.title = "지도에서 길을 골라 10칸 끝의 보스까지";
    wt.appendChild(sub);
    where.appendChild(wt);
    const bossRow = el("div", "tf-boss");
    for (const id of floor.boss) {
      const e = ENEMIES[id]; if (!e) continue;
      const b = el("div", "tf-bossone");
      b.appendChild(art.portrait(id, { ko: e.ko, tint: e.tint, size: 0, slot: "foe", still: true }));
      const t = el("div");
      t.appendChild(el("small", null, "보스"));
      t.appendChild(el("b", null, e.ko));
      b.appendChild(t);
      bossRow.appendChild(b);
    }
    where.appendChild(bossRow);
    const foesHead = el("div", "tf-label");
    foesHead.appendChild(el("span", null, "나오는 적"));
    const foeKey = el("span", "tf-foekey");
    foeKey.appendChild(el("i", "tf-elite"));
    foeKey.appendChild(el("span", null, "엘리트"));
    foesHead.appendChild(foeKey);
    where.appendChild(foesHead);
    // 나오는 적 — 작은 그림 + 이름 칩. 그림이 없는 적(엘리트 몇)은 이름만 — 이름 앞 세 글자만 떠서 「마시멜」 같은 낱말로 읽혔다
    const foes = el("div", "tf-foes");
    const seen = new Set();
    const elites = new Set((floor.elites || []).flat());
    for (const id of [...(floor.fights || []).flat(), ...(floor.elites || []).flat()]) {
      if (seen.has(id) || !ENEMIES[id]) continue; seen.add(id);
      const f = el("div", "tf-foe" + (elites.has(id) ? " elite" : ""));
      f.title = elites.has(id) ? `엘리트 · ${ENEMIES[id].ko}` : ENEMIES[id].ko;
      const pic = art.portrait(id, { ko: ENEMIES[id].ko, tint: ENEMIES[id].tint, size: 0, slot: "foe", still: true });
      if (!pic.classList.contains("art-ph")) f.appendChild(pic);
      f.appendChild(el("span", null, ENEMIES[id].ko));
      if (elites.has(id)) f.appendChild(el("i", "tf-elite"));      // 엘리트는 이름 뒤 보랏빛 점 하나 — 뜻은 머리의 범례가
      foes.appendChild(f);
    }
    where.appendChild(foes);
    side.appendChild(where);
    const synBox = el("section", "tf-syn");
    side.appendChild(synBox);
    const deckSec = el("section", "tf-decksec");
    const deckHead = el("div", "tf-label");
    const deckBox = el("div", "tm-fdeck2");
    deckSec.appendChild(deckHead);
    deckSec.appendChild(deckBox);
    side.appendChild(deckSec);
    const go = el("button", "tm-fgo tf-go", "떠납니다");
    go.onclick = () => { sfx.play("ui.start"); if (picked.length) speak(picked[Math.floor(Math.random() * picked.length)], ["yes", "decksetting", "greeting"]); for (const k of picked) rows[k] = rows[k] || HERO_DATA[k].row; onStart(picked, rows); };
    side.appendChild(go);
    main.appendChild(side);
    s.appendChild(main);

    // 선 열 — 「모든 열」 사도는 편성에서 고른 열, 나머지는 기획서의 제 열
    const rowOf = (k) => rows[k] || HERO_DATA[k].row;
    const ROW_ORDER = [...C.ROWS].reverse();            // 후열 · 중열 · 전열 — 전투처럼 후열이 왼쪽, 전열이 적 쪽
    const add = (key) => { picked.push(key); rows[key] = rows[key] || HERO_DATA[key].row; speak(key, ["decksetting", "greeting"]); };
    const remove = (key) => { const i = picked.indexOf(key); if (i >= 0) picked.splice(i, 1); delete rows[key]; };

    // 빈 칸의 이름 — 아직 아무도 안 선 열을 전열 · 중열 · 후열 차례로 붙인다(「1번째 자리」 대신, 2026-10 사용자).
    // 열은 사도가 정하므로 이름은 안내일 뿐이다. 세 열이 다 찼으면 「남은」
    // 칸 하나 — 사도가 있으면 그 사도, 없으면 「+ 사도 넣기」
    function slotOf(key, i, row) {
      if (!key) {
        // 빈 자리 — 크게 비워 두지 않고, 열 이름과 + 하나만 얌전히
        const n = el("button", "tf-slot empty");
        n.appendChild(el("span", "tf-erow", row ? ROWS_KO[row] : "남은 자리"));
        n.appendChild(el("span", "tf-plus", "+"));
        n.appendChild(el("b", null, "사도 넣기"));
        n.appendChild(el("span", "tf-ehint", "눌러서 명단"));
        n.onclick = () => openPicker(null);
        return n;
      }
      const h = HERO_DATA[key];
      const n = el("button", "tf-slot");
      n.style.setProperty("--tint", NTINT[h.nature]);
      // 그림 — 컷인처럼 스탠딩 스파인을 머리부터 거의 발끝까지(bust). 스파인이 없거나 늦으면 그림 한 장이 그 자리를 지킨다
      const pic = el("div", "tf-art");
      pic.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      if (art.slotOf(key, "event") === "standing") {
        spineView(pic, "standing", key, { bust: 0.9, body: 0.4 }).then((v) => {
          if (!v) return;
          const st1 = pic.querySelector(":scope > .art");
          if (st1) st1.remove();
          pic.classList.add("live");
          pic.spine = v;                     // 시험 도구가 몸 가운데를 잰다
          if (!v.bodyFit) centreOnBody(pic, v);   // 몸으로 못 세운 사도(머리 본 없음)만 옛 방식으로
        }, () => {});
      }
      n.appendChild(pic);
      n.appendChild(el("span", "tf-rowtag", ROWS_KO[rowOf(key)]));
      const tools = el("div", "tf-tools");
      const info = el("span", "tf-tool tf-info", "🔍");
      info.title = "사도 정보";
      info.onclick = (e) => { e.stopPropagation(); cameFrom = null; view = key; tab = "능력치"; render(); };
      const x = el("span", "tf-tool tf-x", "✕");
      x.title = "빼기";
      x.onclick = (e) => { e.stopPropagation(); sfx.play("ui.deselect"); remove(key); fill(); };
      tools.appendChild(info); tools.appendChild(x);
      n.appendChild(tools);
      // 이름표 — 이름 · 성급, 그 밑에 알약(열 역할 · 성격 · 종족), 능력치 넷, 전용 키워드와 첫 패시브 한 줄
      const plate = el("div", "tf-plate");
      const nameRow = el("div", "tf-namerow");
      nameRow.appendChild(el("b", null, h.ko));
      nameRow.appendChild(el("span", "tf-star", "★".repeat(h.star)));
      plate.appendChild(nameRow);
      const tags = el("div", "tf-tags");
      const tag = (kind, name, text, cls) => {
        const t = el("span", "tf-tag" + (cls ? " " + cls : ""));
        t.appendChild(uiIcon(kind, name, "tf-tico", ""));
        t.appendChild(el("span", null, text));
        tags.appendChild(t);
      };
      tag("역할", h.role, `${ROWS_KO[rowOf(key)]} ${h.role}`);
      tag("성격", h.nature, h.nature, "nat");
      tag("종족", h.race, h.race);
      plate.appendChild(tags);
      // 「모든 열」 사도 — 어느 열에 설지 고른다. 선 열에 따라 패시브의 다른 줄이 켜진다
      if (h.anyRow) {
        const pick = el("div", "tf-rowpick");
        pick.appendChild(el("small", null, "모든 열"));
        for (const r of ROW_ORDER) {
          const b = el("span", "tf-rowb" + (rowOf(key) === r ? " on" : ""), ROWS_KO[r]);
          const line = (h.passive || "").split(" · ").filter((t) => t.includes(`${ROWS_KO[r]}에 서 있으면`)).join(" · ");
          b.title = line ? `${ROWS_KO[r]}에 서면 — ${line}` : `${ROWS_KO[r]}에 섭니다`;
          b.onclick = (e) => { e.stopPropagation(); rows[key] = r; fill(); };
          pick.appendChild(b);
        }
        plate.appendChild(pick);
      }
      const st = el("div", "tf-stats");
      // 방어 기반 — 방어력 210% + 공격력 30%(v6 카제나 — 반격 · 「방어 기반 피해 N%」 의 바탕). 치유는 방어력 그대로
      for (const [k, v] of [["HP", h.hp], ["공격력", h.atk], ["방어력", h.def], ["방어 기반", RULES.defDmgStat(h.atk, h.def)]]) { const d = el("span"); d.appendChild(el("small", null, k)); d.appendChild(el("b", null, String(v))); st.appendChild(d); }
      plate.appendChild(st);
      // 키워드 · 패시브 한 줄 — 패시브의 첫 줄(「이름: 효과」 의 효과)만. 다 읽으려면 🔍
      const first = [...String(h.passive || "").matchAll(/(^|\s·\s)([^·:]{1,30}):\s/g)];
      const effect = first.length ? h.passive.slice(first[0].index + first[0][0].length, first[1] ? first[1].index : undefined) : "";
      if (h.keyword || effect) {
        const kw = el("div", "tf-kw");
        if (h.keyword) kw.appendChild(el("b", null, h.keyword.ko));
        if (effect) kw.appendChild(el("span", null, shortText(effect)));
        kw.title = [h.passive, h.keyword && `${h.keyword.ko} — ${h.keyword.text}`].filter(Boolean).join("\n");
        plate.appendChild(kw);
      }
      n.appendChild(plate);
      n.title = `${h.ko} — 눌러서 다른 사도로 바꾸기`;
      n.onclick = () => openPicker(key);
      return n;
    }
    // 같은 열의 두 사도 사이 — 누르면 둘의 자리를 바꾼다(편성 순서 = 전투에서 선 순서 · 손패 순서)
    // 스탠딩을 몸 가운데에 맞춘다 — bust 는 그림 전체(도끼 · 총 · 날개 · 꼬리까지)의 가운데를 칸 가운데에 두어서
    // 큰 무기를 든 사도(디아나(왕년) · 시온더다크불릿)는 몸이 한쪽으로 쏠렸다(2026-10 사용자: 「왼쪽으로 치우쳐짐」).
    // 머리 본(없으면 골반 · 몸통 본)이 칸 가운데에 오게 캔버스를 옆으로 민다. 캔버스는 칸보다 넓게 깔려 있어(css) 무기는 칸 끝에서 잘린다.
    // 밀 거리는 캔버스 높이에 대한 몫으로 재 둔다 — bust 의 배율은 높이로만 정해지니 칸 크기가 바뀌어도 같은 몫이다
    function centreOnBody(pic, v) {
      const sk = v.skeleton;
      const bone = sk && (sk.bones.find((b) => /(^|_)Head$/i.test(b.data.name))
        || sk.bones.find((b) => /Pelvis/i.test(b.data.name)) || sk.bones.find((b) => /(^|_)Body/i.test(b.data.name)));
      if (!bone) return;
      let k = null;
      const apply = () => {
        const c = pic.querySelector(":scope > canvas");
        if (!c) return;
        if (k === null) { if (!c.height) return; k = bone.worldX / c.height; }
        c.style.transform = `translateX(${(-k * c.clientHeight).toFixed(1)}px)`;
      };
      // 그리는 고리가 한 번 돌아 본 자리가 잡힌 뒤에 잰다
      requestAnimationFrame(() => requestAnimationFrame(() => {
        apply();
        if (typeof ResizeObserver === "function") new ResizeObserver(apply).observe(pic);
      }));
    }
    function swapBtn(a, b) {
      const n = el("button", "tm-fswap tf-swap", "⇄");
      n.title = `${HERO_DATA[a].ko} ↔ ${HERO_DATA[b].ko} 자리 바꾸기 — 전투에서 선 순서와 손패 순서가 바뀝니다`;
      n.onclick = (e) => {
        e.stopPropagation();
        const i = picked.indexOf(a), j = picked.indexOf(b);
        [picked[i], picked[j]] = [picked[j], picked[i]];
        fill();
      };
      return n;
    }

    // ── 사도 고르기 창 — 칸을 누르면 뜬다. target 이 있으면 그 자리를 바꾸고, 없으면 빈 자리에 넣는다 ──
    let sheet = null, target = null, chips = null, grid = null, search = null;
    function closePicker() { if (sheet) { sheet.remove(); sheet = null; } document.removeEventListener?.("keydown", escPick); }
    function escPick(e) { if (e.key === "Escape") { e.stopPropagation(); closePicker(); } }
    function openPicker(key) {
      closePicker();
      target = key;
      sheet = el("div", "tf-pick");
      sheet.onclick = (e) => { if (e.target === sheet) closePicker(); };
      const box = el("div", "tf-pickbox");
      const hd = el("div", "tf-pickhead");
      const tt = el("div");
      tt.appendChild(el("b", null, key ? `${HERO_DATA[key].ko} 자리 — 다른 사도로 바꿉니다` : "빈 자리에 넣을 사도"));
      tt.appendChild(el("span", null, "눌러서 고릅니다 · 이미 편성한 사도를 고르면 서로 자리를 바꿉니다 · 오른쪽 클릭은 사도 정보"));
      hd.appendChild(tt);
      if (key) {
        const out = el("button", "tf-out", "이 자리 비우기");
        out.onclick = () => { sfx.play("ui.deselect"); remove(key); closePicker(); fill(); };
        hd.appendChild(out);
      }
      const x = el("button", "tf-close", "×");
      x.onclick = closePicker;
      hd.appendChild(x);
      box.appendChild(hd);
      const bar = el("div", "tm-fbar");
      chips = el("div", "tm-fchips");
      bar.appendChild(chips);
      search = el("input", "tm-fsearch");
      search.placeholder = "이름 · 초성 · 열(전열 · 중열 · 후열)로 찾기";
      search.value = filter.q;
      search.oninput = () => { filter.q = search.value.trim(); fillRoster(); };
      bar.appendChild(search);
      box.appendChild(bar);
      grid = el("div", "tm-froster tf-roster");
      box.appendChild(grid);
      sheet.appendChild(box);
      s.appendChild(sheet);
      document.addEventListener?.("keydown", escPick);
      fillChips(); fillRoster();
      search.focus && search.focus();
    }
    function choose(key) {
      if (target) {
        if (key !== target) {
          const j = picked.indexOf(key), i = picked.indexOf(target);
          if (j >= 0) [picked[i], picked[j]] = [picked[j], picked[i]];      // 이미 편성한 사도 — 둘이 자리를 바꾼다
          else { picked[i] = key; delete rows[target]; rows[key] = rows[key] || HERO_DATA[key].row; speak(key, ["decksetting", "greeting"]); }
        }
      } else if (!picked.includes(key)) {
        if (picked.length >= 3) { sfx.play("ui.error"); return hint("셋까지만 데려갈 수 있습니다 — 칸을 눌러 바꾸거나 비워 주세요"); }
        add(key);
      }
      if (filter.q) filter.q = "";
      hint("");
      sfx.play("ui.select");
      closePicker();
      fill();
    }

    // 명단 한 장
    function rosterCard(key, h) {
      const at = picked.indexOf(key);
      const n = el("button", "tm-fcard" + (at >= 0 ? " on" : "") + (key === target ? " cur" : ""));
      n.style.setProperty("--tint", NTINT[h.nature]);
      n.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
      n.appendChild(el("div", "tm-ffade"));
      const badges = el("div", "tm-fbadges");
      badges.appendChild(uiIcon("성격", h.nature, "tm-fb", h.nature.slice(0, 1)));
      badges.appendChild(uiIcon("역할", h.role, "tm-fb", h.role.slice(0, 1)));
      n.appendChild(badges);
      const plate = el("div", "tm-fcp");
      plate.appendChild(el("b", null, h.ko));
      plate.appendChild(el("span", null, `${rowLabel(h)} · ${h.race}`));
      n.appendChild(plate);
      if (at >= 0) n.appendChild(el("span", "tm-fnum", String(at + 1)));
      if (isEcho(key)) n.appendChild(el("span", "tm-fecho", "이격"));
      n.onclick = () => choose(key);
      n.oncontextmenu = (e) => { e.preventDefault(); closePicker(); cameFrom = null; view = key; tab = "능력치"; render(); };
      n.title = `${h.ko} — 눌러서 고르기 · 오른쪽 클릭으로 사도 정보`;
      return n;
    }
    function fillChips() {
      if (!chips) return;
      chips.innerHTML = "";
      const group = (vals, key, icon) => {
        const all = el("button", "tm-fchip" + (filter[key] ? "" : " on"), "전체");
        all.onclick = () => { filter[key] = null; fillChips(); fillRoster(); };
        chips.appendChild(all);
        for (const v of vals) {
          const b = el("button", "tm-fchip" + (filter[key] === v ? " on" : ""));
          b.appendChild(uiIcon(icon, v, "tm-fci", ""));
          b.appendChild(el("span", null, v));
          b.onclick = () => { filter[key] = filter[key] === v ? null : v; fillChips(); fillRoster(); };
          chips.appendChild(b);
        }
        chips.appendChild(el("span", "tm-fgap"));
      };
      group(NATURES, "nature", "성격");
      group(ROLES, "role", "역할");
    }
    function fillRoster() {
      if (!grid) return;
      grid.innerHTML = "";
      const list = roster.filter(([k, h]) => {
        if (filter.nature && h.nature !== filter.nature) return false;
        if (filter.role && h.role !== filter.role) return false;
        if (filter.q && !heroMatch(h, filter.q)) return false;   // 이름(초성으로도) · 열
        return true;
      }).sort(SORTS.성급);
      for (const [k, h] of list) grid.appendChild(rosterCard(k, h));
      if (!list.length) grid.appendChild(el("div", "tm-fnone", "맞는 사도가 없습니다."));
    }

    function fill() {
      // 칸 — 고른 사도를 열 차례(후열 → 전열)로, 같은 열은 편성 순서대로. 빈 자리는 뒤에
      slots.innerHTML = "";
      // 빈 칸은 아직 아무도 안 선 열의 자리에 끼운다 — 「전열 자리」 는 전열 쪽(오른쪽)에(2026-10 사용자: 전열 · 후열이 뒤바뀌어 보였다).
      // 열은 사도가 정하므로 이름은 안내다. 세 열이 다 찼으면 「남은 자리」 를 맨 오른쪽에
      const open = ROW_ORDER.filter((r) => !picked.some((k) => rowOf(k) === r));
      const empties = Array.from({ length: Math.max(0, 3 - picked.length) }, (_, j) => open[j] || null);
      const rank = (r) => (r ? ROW_ORDER.indexOf(r) : 99);
      const order = [...picked.map((k) => ({ k, r: rowOf(k) })), ...empties.map((r) => ({ k: null, r }))]
        .sort((a, b) => rank(a.r) - rank(b.r) || (a.k ? picked.indexOf(a.k) : 9) - (b.k ? picked.indexOf(b.k) : 9));
      order.forEach((o, i) => {
        const prev = order[i - 1];
        if (i && o.k && prev.k && prev.r === o.r) slots.appendChild(swapBtn(prev.k, o.k));
        else if (i) slots.appendChild(el("span", "tf-gap"));
        slots.appendChild(slotOf(o.k, i, o.r));
      });
      // 파티 HP 하나(docs/16 §8) — 셋의 최대 HP 를 더한 것이 이 판의 파티 HP 다
      const hpSum = picked.reduce((x, k) => x + ((HERO_DATA[k] || {}).hp || 0), 0);
      count.textContent = `${picked.length} / 3${picked.length ? ` · 파티 HP ${hpSum}` : ""}`;
      go.disabled = picked.length !== 3;
      go.textContent = picked.length === 3 ? "떠납니다" : `사도 ${3 - picked.length}명 더`;

      // 파티 성격 — 상성 보기
      synBox.innerHTML = "";
      const synHead = el("div", "tf-label");
      synHead.appendChild(el("span", null, "파티 성격"));
      const natBtn = el("button", "tm-fdkbig tm-fnatbtn", "상성 보기");
      natBtn.onclick = (e) => { e.stopPropagation(); openHelp("상성"); };
      synHead.appendChild(natBtn);
      synBox.appendChild(synHead);
      if (!picked.length) synBox.appendChild(el("p", "tm-fnote", "사도를 고르면 셋의 성격이 여기 뜹니다."));
      else {
        const nat = el("div", "tm-fnats");
        for (const k of picked) {
          const t = el("span", "tm-fnatc");
          t.style.setProperty("--tint", NTINT[HERO_DATA[k].nature]);
          t.appendChild(uiIcon("성격", HERO_DATA[k].nature, "tm-fci", ""));
          t.appendChild(el("span", null, `${HERO_DATA[k].ko} · ${HERO_DATA[k].nature}`));
          nat.appendChild(t);
        }
        synBox.appendChild(nat);
      }

      // 시작 덱
      deckBox.innerHTML = "";
      let n = 0;
      for (const k of picked) {
        const row = el("div", "tm-fdkrow");
        row.appendChild(el("span", "tm-fdkwho", HERO_DATA[k].ko));
        const cards = el("div", "tm-fdkcards");
        for (const c of kitOf(k).start) {
          const chip = el("button", "tm-fdk t" + (c.type || ""));
          chip.appendChild(el("i", null, c.xcost ? "X" : String(c.cost)));
          chip.appendChild(el("span", null, c.name));
          chip.title = `${c.text} — 눌러서 자세히`;
          chip.onclick = (e) => { e.stopPropagation(); showCard(c, k); };
          cards.appendChild(chip);
          n++;
        }
        row.appendChild(cards);
        deckBox.appendChild(row);
      }
      deckHead.innerHTML = "";
      deckHead.appendChild(el("span", null, n ? `시작 덱 ${n}장` : "시작 덱"));
      if (n) {
        const big = el("button", "tm-fdkbig", "크게 보기");
        const ids = picked.flatMap((k) => kitOf(k).start.map((c) => c.id));
        big.onclick = (e) => {
          e.stopPropagation();
          showPiles([{ key: "start", label: "시작 덱", ids, why: "사도마다 시작 카드 넉 장 — 고유 카드는 싸우며 은총으로 얻습니다." }], "start", (id) => CARDS[id], null);
        };
        deckHead.appendChild(big);
      }
      if (!n) deckBox.appendChild(el("p", "tm-fnote", "사도마다 시작 카드 넉 장. 고유 카드는 싸우며 은총으로 얻습니다."));
      if (sheet) fillRoster();
    }
    fill();
  }

  function dexCard(key, h) {
    const on = picked.includes(key);
    const b = el("button", "dex" + (on ? " on" : ""));
    b.style.setProperty("--tint", NTINT[h.nature]);
    const badges = el("div", "dbadges");
    badges.appendChild(uiIcon("역할", h.role, "brole", h.role.slice(0, 1)));
    const bn = uiIcon("성격", h.nature, "bnat n" + h.nature, h.nature.slice(0, 1));
    bn.style.setProperty("--tint", NTINT[h.nature]);
    badges.appendChild(bn);
    b.appendChild(badges);
    b.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 0, slot: "event", still: true }));
    b.appendChild(el("div", "dfade"));
    if (on) b.appendChild(el("span", "dmark", "편성"));
    const plate = el("div", "dplate");
    plate.appendChild(el("span", "dname", h.ko));
    plate.appendChild(el("span", "dsub", `${rowLabel(h)} · ${h.race}`));
    if (isEcho(key)) b.appendChild(el("span", "decho", "이격"));
    b.appendChild(plate);
    b.onclick = () => { cameFrom = "도감"; view = key; tab = "능력치"; render(); };
    return b;
  }

  // ── 사도 정보 ────────────────────────────────────────────────────────
  function detailScreen(key) {
    const h = HERO_DATA[key];
    s.innerHTML = "";
    s.className = "detailscreen";
    stageBg();
    s.style.setProperty("--tint", NTINT[h.nature]);

    const bar = el("div", "dbar2");
    const back = el("button", "iconbtn back", "◁");
    back.onclick = () => { view = cameFrom; render(); };
    bar.appendChild(back);
    bar.appendChild(el("h1", "dtitle", "사도 정보"));
    bar.appendChild(fsButton("fsright"));
    bar.appendChild(el("span", "dwho", h.ko));
    bar.appendChild(el("span", "dcount", `${picked.length}/3`));
    const on = picked.includes(key);
    const take = el("button", "takebtn" + (on ? " on" : ""), on ? "편성에서 빼기" : "편성에 넣기");
    take.onclick = () => {
      const i = picked.indexOf(key);
      if (i >= 0) { picked.splice(i, 1); sfx.play("ui.deselect"); }
      else if (picked.length < 3) { picked.push(key); sfx.play("ui.select"); speak(key, ["decksetting", "greeting"]); }
      else { sfx.play("ui.error"); return hint("셋까지만 데려갈 수 있습니다"); }
      hint("");
      render();
    };
    bar.appendChild(take);
    s.appendChild(bar);

    const body = el("div", "dbody");

    const side = el("nav", "side");
    const emb = el("div", "semb");
    emb.appendChild(uiIcon("종족", h.race, "sico", h.race.slice(0, 1)));
    emb.appendChild(el("span", null, h.race));
    emb.appendChild(el("i", null, h.nature));
    side.appendChild(emb);
    for (const t of ["능력치", "카드", "신탁", "고학년 스킬"]) {
      const b = el("button", "sidebtn" + (tab === t ? " on" : ""), t);
      b.onclick = () => { tab = t; render(); };
      side.appendChild(b);
    }
    body.appendChild(side);

    const main = el("div", "dmain");
    const kit = kitOf(key);
    // 그림은 카드 id 로 찾는다 — 자리 셈으로 맞추면 카드가 하나 늘 때 통째로 어긋난다
    const CA = { ult: CARDART.pic[key + "_ult"] || null };
    const picFor = (c) => CARDART.pic[c.id] || null;

    if (tab === "능력치") main.appendChild(statsPane(key, h));
    else if (tab === "카드") main.appendChild(cardPane(key, h, kit, CA, picFor));
    else if (tab === "신탁") main.appendChild(flashPane(kit, CA, picFor));
    else main.appendChild(ultPane(key, h, CA));

    body.appendChild(main);
    s.appendChild(body);
  }

  // 카제나 요원 화면처럼 — 왼쪽에 사도가 크게 서고(편성 무대와 같은 스파인), 오른쪽에 이름과 능력치
  function statsPane(key, h) {
    const w = el("div", "pane dt-stpane");
    const top = el("div", "sthero");
    const shot = el("div", "stshot");
    shot.appendChild(el("span", "dt-glow"));
    shot.appendChild(art.portrait(key, { ko: h.ko, tint: NTINT[h.nature], size: 200, slot: "battle", flip: true }));
    top.appendChild(shot);
    const info = el("div", "stinfo");
    const t = el("div", "sttop");
    t.appendChild(el("h2", null, h.ko));
    t.appendChild(el("span", "star", "★".repeat(h.star)));
    if (h.eldain) t.appendChild(el("span", "eldain", "엘다인"));
    info.appendChild(t);
    const meta = el("div", "stmeta");
    for (const [kind, name] of [["성격", h.nature], ["종족", h.race], ["위치", rowLabel(h)], ["역할", h.role]]) {
      const tag = el("span", "mtag");
      tag.appendChild(uiIcon(kind, name, "mico", ""));
      tag.appendChild(el("span", null, name));
      meta.appendChild(tag);
    }
    if (h.dmgType) meta.appendChild(el("span", "mtag plain", h.dmgType));
    info.appendChild(meta);
    info.appendChild(el("p", "stblurb", h.blurb));
    const g = el("div", "statgrid");
    // 방어 기반 = 방어력 210% + 공격력 30%(rules.js defDmgStat) — 반격 · 「방어 기반 피해 N%」 가 본다. 치유 · 방어 · 실드는 방어력
    for (const [ko, v] of [["HP", h.hp], ["공격력", h.atk], ["방어력", h.def], ["치명", h.crit + "%"], ["방어 기반", RULES.defDmgStat(h.atk, h.def)]]) {
      const c = el("div", "statc");
      c.appendChild(el("small", null, ko));
      c.appendChild(el("strong", null, String(v)));
      g.appendChild(c);
    }
    info.appendChild(g);
    top.appendChild(info);
    w.appendChild(top);

    // 능력 글은 오른쪽 기둥에 잇는다 — 입상은 왼쪽에 서 있고 글만 내려 읽는다
    if (h.passive) info.appendChild(line("패시브", h.passive, "", key));
    if (h.keyword) {
      // 전용 키워드 — 소개 한 줄 + 규칙 줄(최대 · 1개당 · 다 차면)
      const d = el("section", "ability key");
      d.appendChild(el("h3", null, h.keyword.ko));
      info.appendChild(kwText(d, h.keyword.text));
    }
    // 원작 대조(h.source)와 고른 사도와의 사이는 싣지 않는다 — 사이는 편성 화면 「함께 가면」에 있다
    return w;
  }

  function line(label, text, cls, heroKey) {
    const d = el("section", "ability " + (cls || ""));
    d.appendChild(el("h3", null, label));
    d.appendChild(label === "패시브" ? passiveText(el("p"), text, heroKey) : withKeywords(el("p"), shortText(text), heroKey));
    return d;
  }
  // 패시브 — 「이름: 효과 · 이름: 효과」. 이름은 밑줄 없이 굵게(「사제장의 무적권」 의 무적이 낱말로 잡히던 것), 효과만 낱말 풀이.
  // 효과 글에도 「 · 」 가 있으니(「회복 100% · 디버프 해제」) 이름은 맨 앞이나 「 · 」 바로 뒤의 「…: 」 만 본다
  function passiveText(node, text, heroKey) {
    const t = String(text || "");
    const heads = [...t.matchAll(/(^|\s·\s)([^·:]{1,30}):\s/g)];
    if (!heads.length) return withKeywords(node, shortText(t), heroKey);
    heads.forEach((m, i) => {
      const from = m.index + m[0].length;
      const to = i + 1 < heads.length ? heads[i + 1].index : t.length;
      if (i) node.appendChild(document.createTextNode(" · "));
      node.appendChild(el("b", "pname", m[2] + ": "));
      withKeywords(node, shortText(t.slice(from, to)), heroKey);
    });
    return node;
  }

  function cardPane(key, h, kit, CA, picFor) {
    const w = el("div", "pane");
    const wrap = el("div", "cardwrap");
    const left = el("div", "cardcols");

    left.appendChild(sec("◎", "시작 카드", kit.start.length));
    const g1 = el("div", "cardrow");
    kit.start.forEach((c) => g1.appendChild(bigCard(c, picFor(c))));
    left.appendChild(g1);

    left.appendChild(sec("◈", "고유 카드", kit.unique.length));
    const g2 = el("div", "cardrow");
    kit.unique.forEach((c) => g2.appendChild(bigCard(c, picFor(c))));
    left.appendChild(g2);
    wrap.appendChild(left);

    // 오른쪽 — 고학년 스킬. 인게임 고학년 스킬이고, 그 아이콘을 그대로 쓴다(기획서).
    if (h.ult) {
      const side = el("aside", "egoside");
      const hex = el("div", "hex");
      hex.appendChild(el("span", "hexcost", String(h.ult.cost) + "%"));
      if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
      side.appendChild(hex);
      side.appendChild(el("div", "egoname", h.ult.ko));
      side.appendChild(el("div", "egolabel", "고학년 스킬"));
      side.appendChild(withKeywords(el("p", "egotext"), shortText(h.ult.text), key));
      wrap.appendChild(side);
    }
    w.appendChild(wrap);
    return w;
  }

  function sec(mark, label, n) {
    const d = el("div", "csec");
    d.appendChild(el("i", null, mark));
    d.appendChild(el("b", null, label));
    d.appendChild(el("span", "csn", String(n)));
    return d;
  }

  function flashPane(kit, CA, picFor) {
    const w = el("div", "pane");
    w.appendChild(el("p", "note", "고유 카드마다 신탁이 다섯 — 싸우다 카드가 빛나면 그 가운데 셋이 뜨고, 하나를 고르면 카드가 그 글로 바뀝니다. 아래 ✦ 는 그 카드만의 겨우살이의 축복 — 받을 때 하나를 골라 신탁 위에 얹습니다."));
    kit.unique.forEach((c) => {
      const box = el("section", "flashbox");
      const head = el("div", "fhead");
      const pic = picFor(c);
      if (pic) head.appendChild(img(pic, "fpic"));
      head.appendChild(el("b", null, `${c.xcost ? "X" : c.cost}코 ${c.name}`));
      head.appendChild(el("span", "ftype", c.type));
      box.appendChild(head);
      box.appendChild(withKeywords(el("p", "ftext"), shortText(c.text), c.hero));
      const g = el("div", "flashgrid");
      for (const f of c.flash || []) {
        const n = el("div", "flash f" + f.n);
        if (f.kind) n.appendChild(el("span", "fkind", f.kind));
        n.appendChild(el("b", null, f.ko));
        n.appendChild(withKeywords(el("p"), shortText(f.text), c.hero));
        g.appendChild(n);
      }
      box.appendChild(g);
      // 그 카드만의 축복 — 따로 한 줄. 받기 전엔 전부(받을 때 하나를 고른다), 받았으면 고른 것을 밝힌다
      const bl = RULES.blessList(c);
      if (bl.length) {
        const chosen = blessChosen(c.id);
        const bg = el("div", "flashgrid blessgrid");
        bl.forEach((b, i) => {
          const n = el("div", "flash fbless" + (chosen === i ? " on" : chosen >= 0 ? " off" : ""));
          n.appendChild(el("span", "fkind", chosen === i ? "받은 축복" : bl.length > 1 ? `축복 ${i + 1}` : "축복"));
          const bn = el("b"); bn.appendChild(mistletoeIcon()); bn.appendChild(document.createTextNode(b.ko)); n.appendChild(bn);
          n.appendChild(withKeywords(el("p"), blessLine(b), c.hero));
          bg.appendChild(n);
        });
        box.appendChild(bg);
      }
      w.appendChild(box);
    });
    return w;
  }

  function ultPane(key, h, CA) {
    const w = el("div", "pane");
    if (!h.ult) { w.appendChild(el("p", "note", "이 사도는 고학년 스킬이 없습니다.")); return w; }
    const big = el("div", "ultbig");
    const hex = el("div", "hex big");
    hex.appendChild(el("span", "hexcost", h.ult.cost + "%"));
    if (CA.ult) hex.appendChild(img(CA.ult, "hexpic"));
    big.appendChild(hex);
    const info = el("div");
    info.appendChild(el("div", "egolabel", "고학년 스킬"));
    info.appendChild(el("h2", null, h.ult.ko));
    info.appendChild(withKeywords(el("p", "egotext"), shortText(h.ult.text), key));
    info.appendChild(el("p", "note", `고학년 게이지 ${h.ult.cost}% 를 씁니다. 고학년 게이지는 파티가 함께 채우고(카드에 AP 를 1 쓸 때마다 +10%), 같은 사도가 잇달아 쓸 수 없습니다.`));
    big.appendChild(info);
    w.appendChild(big);
    return w;
  }

  function render() {
    if (view && view !== "도감") detailScreen(view);
    else if (view === "도감") dexScreen();
    else formScreen();
  }
  render();
  return s;
}
