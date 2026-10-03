// 효과음 고르기 — 어떤 일에 어떤 원작 효과음을 트는가. 소리 파일은 assets/sfx(tools/extract-sfx.py), 여기는 이름만.
// 원작 스파인의 소리 이벤트는 표 번호라 못 읽는다 — 파일 이름(과 길이)만 보고 골랐다.
//
//   SFX[갈래] = { f: [후보 …](하나를 무작위로), v 음량(기본 1), gap 같은 갈래를 다시 트는 최소 간격 ms(기본 50),
//                 max · fade 꼬리 자르기(초 — 없으면 TAIL), jitter 높이를 조금 흔든다(맞는 소리만) }
//   경로는 assets/sfx/ 아래, .ogg 를 뺀 것
//   사도 · 적의 제 소리는 폴더째 — HERO_KINDS(파일 이름 꼬리) · monsterDir(적 key → 폴더)
//   js/sfx.js 가 틀고, tools/build-deploy.js 가 여기 적힌 것만 싣는다.
//
// 크기 — 파일마다의 세기 차이는 색인의 g(tools/extract-sfx.py --measure)가 맞추고, v 는 갈래 사이의 크기만 정한다:
//   화면 0.35~0.5 · 카드 0.45~0.5 · 상태 · 회복 · 방어 0.5 · 맞는 소리 0.85 · 치명타 · 크게 맞음 0.9~1 (목소리는 따로 — js/voice.js)
// 후보는 되도록 하나 — 출처가 다른 파일을 섞으면 같은 일이 매번 다르게 들렸다(2026-10 사용자: 「깔끔하게」).
//   여럿인 것은 거의 같은 소리(휘두르는 바람 둘)뿐
export const SFX = {
  // ── 카드 ──
  "card.play":    { f: ["sfx_cardgacha_cardflying"], v: 0.5 },                     // 0.12초 — 카드가 날아간다
  "card.공격":    { f: ["scenario/sfx_swing", "scenario/sfx_swing_2"], v: 0.5 },   // 휘두르는 바람(둘이 거의 같다)
  "card.스킬":    { f: ["sfx_ingame_manausing"], v: 0.45 },
  "card.기술":    { f: ["sfx_ingame_manausing"], v: 0.45 },
  // 방어 · 회복은 카드 종류가 아니라 하는 일의 소리다 — 스킬 카드가 방어 · 실드 · 무적을 주거나 회복하면(js/sfx.js cardKey)
  "card.방어":    { f: ["sfx_ingame_battleitemuse"], v: 0.45 },
  "card.회복":    { f: ["sfx_ingame_managet"], v: 0.45 },
  "card.강화":    { f: ["sfx_ingame_artifactequip"], v: 0.45 },
  "card.draw":    { f: ["sfx_cardpack_opening"], v: 0.3, gap: 60 },
  "card.hover":   { f: ["sfx_deck_changeskillinfo"], v: 0.22, gap: 80 },
  "card.shuffle": { f: ["scenario/sfx_cardshuffle"], v: 0.45 },
  "card.cant":    { f: ["sfx_deck_wrongslot"], v: 0.5 },                           // AP 모자람 · 못 내는 카드

  // ── 맞는 소리 — 피해 종류별 ──
  // 칼 · 맞는 소리는 원작 잡몹 여럿(요정 병사 · 털복숭이 전사 · 초피 · 요정 무리)이 함께 쓰는 그 파일 하나로
  "hit.slash": { f: ["monster/elfsoldiercloserange/elfsoldiercloserange_basicattack_hit"], v: 0.85, jitter: true },
  "hit.blunt": { f: ["scenario/sfx_punch"], v: 0.85, jitter: true },
  "hit.magic": { f: ["hero/naia/naia_basicattack_hit"], v: 0.85, jitter: true },
  "hit.gun":   { f: ["monster/nururingarcher/nururingarcher_basicattack_hit"], v: 0.85, jitter: true },
  "hit.crit":  { f: ["scenario/sfx_greatswordslash"], v: 0.9, jitter: true },
  "hit.heavy": { f: ["monster/golem/golem_basicattack_hit"], gap: 120, max: 0.8 },   // land 가 0.7 을 곱한다
  "hit.small": { f: ["monster/curseddoll/curseddoll_skillhit"], v: 0.55, gap: 60, jitter: true },  // 0.43초 — 상태 피해 · 여러 번 치는 잔타
  "hurt":      { f: ["monster/fairymobcloserange/fairymobcloserange_basicattack_hit"], v: 0.85, jitter: true }, // 적이 사도를 친다(적 제 소리가 없을 때)

  // ── 방어 · 회복 · 상태 ──
  // 한 가지 소리만, 높낮이 흔들림 없이 — 전원에게 걸려도 한 번만 들리게(gap)
  "block.gain":  { f: ["sfx_urosminigame_crayonknightshield"], v: 0.5, gap: 350 },
  "block.hit":   { f: ["scenario/sfx_hitmetal"], v: 0.65 },                                // 피해를 방어가 다 받았다
  "block.break": { f: ["sfx_velaminigame_breakbarrier"], v: 0.8 },
  "heal":        { f: ["hero/asana/asana_powerattck_heal"], v: 0.5, gap: 350 },
  "buff":        { f: ["sfx_ingame_growup"], v: 0.5, gap: 250 },                           // 능력치 증감 · 이로운 상태 — 셋에게 걸려도 한 번
  "debuff":      { f: ["sfx_ingame_growdown"], v: 0.5, gap: 250 },
  "status.stun": { f: ["scenario/sfx_stun_1"], v: 0.55, gap: 250 },
  "status.burn": { f: ["scenario/sfx_velafire"], v: 0.55, gap: 250 },
  "death.enemy": { f: ["sfx_urosminigame_disappearunit"], v: 0.7 },
  "death.hero":  { f: ["scenario/sfx_falldown"], v: 0.75 },

  // ── 고학년 스킬(궁극기) ──
  "ult.ready":  { f: ["sfx_ingame_maxgrowup"], v: 0.5, gap: 400 },                 // 게이지가 찼다
  "ult.cutin":  { f: ["scenario/sfx_ingame_callhero_start"], v: 0.85, gap: 300 },   // 원작 「사도 부르기」 컷인
  "ult.impact": { f: ["scenario/sfx_shortexplosion"], v: 0.9, gap: 200 },           // 사도 제 소리가 없을 때

  // ── 전투 흐름 ──
  "turn.start":   { f: ["sfx_common_notification"], v: 0.4 },
  "turn.end":     { f: ["sfx_lobby_startbattlebuttondown"], v: 0.45 },
  // 원작 「전투 시작」 단추 소리(sfx_lobby_startbattle)는 에르핀 목소리가 섞여 있다 — 누구를 데려가도 에르핀이 말했다(2026-10 사용자).
  // 짧은 단추 소리만 남기고, 말은 파티의 사도가 한다(fight-screen openFx · party-screen 떠납니다)
  "battle.start": { f: ["sfx_lobby_startbattlebuttondown"], v: 0.6 },
  "boss.entry":   { f: ["sfx_renewabossentry"], v: 0.8 },
  "victory":      { f: ["sfx_victory"], v: 0.8, gap: 2000 },
  "victory.star": { f: ["sfx_victorystar"], v: 0.7 },
  "defeat":       { f: ["sfx_stage_fail"], v: 0.75, gap: 2000 },

  // ── 화면 ──
  "ui.click":    { f: ["sfx_common_buttontouch"], v: 0.35, gap: 40 },
  "ui.open":     { f: ["sfx_common_popupbuttontouch"], v: 0.4 },
  "ui.close":    { f: ["sfx_common_popupclose"], v: 0.4 },
  "ui.tab":      { f: ["sfx_common_tabbuttontouch"], v: 0.4 },
  "ui.toggle":   { f: ["sfx_common_radiobtntoggle"], v: 0.4 },
  "ui.error":    { f: ["sfx_deck_wrongslot"], v: 0.45 },
  "ui.select":   { f: ["sfx_deck_selecthero"], v: 0.45 },
  "ui.deselect": { f: ["sfx_deck_unselecthero"], v: 0.45 },
  "ui.confirm":  { f: ["sfx_deck_selectedcharacter"], v: 0.45 },
  "ui.start":    { f: ["sfx_lobby_startbattlebuttondown"], v: 0.55 },     // 떠납니다
  "map.step":    { f: ["sfx_selectstage"], v: 0.5 },
  "map.open":    { f: ["sfx_stage_open"], v: 0.45 },
  "reward":      { f: ["sfx_common_rewardpopup"], v: 0.6 },
  "reward.card": { f: ["sfx_ingame_getitemreward"], v: 0.55 },
  "coin":        { f: ["sfx_battlecoinupdate"], v: 0.5 },
  "shop.buy":    { f: ["sfx_ingame_artifactpopupbuy"], v: 0.55 },
  "shop.sell":   { f: ["sfx_ingame_battleitemsell"], v: 0.55 },
  "shop.reroll": { f: ["sfx_ingame_rerollcardlist"], v: 0.55 },
  "shop.remove": { f: ["scenario/sfx_clothripping"], v: 0.5 },                   // 카드를 찢어 뺀다
  "camp.train":  { f: ["sfx_card_levelup"], v: 0.6 },                            // 신탁 · 축복을 붙였다
  "event.open":  { f: ["sfx_common_opencontents"], v: 0.45 },
};
// 꼬리 자르기 — 갈래 이름(먼저) · 앞머리 → [최대 초, 줄이는 초]. 최대 0 이면 끝까지(승리 · 패배 · 보스 등장 · 컷인)
// 맞는 소리 · 상태 소리가 1.5~2.5초씩 울려 다음 소리와 겹쳤다 — 0.9~1초에서 0.2초 동안 줄여 끊는다
export const TAIL = {
  ui: [0.6, 0.1], card: [0.8, 0.15], hit: [0.9, 0.18], hurt: [0.9, 0.18],
  block: [1.0, 0.2], heal: [1.0, 0.2], buff: [1.0, 0.2], debuff: [1.0, 0.2], status: [1.0, 0.2], death: [1.2, 0.25],
  ult: [1.6, 0.3], "ult.cutin": [0, 0], turn: [0.8, 0.15], battle: [1.4, 0.3], boss: [0, 0], victory: [0, 0], defeat: [0, 0],
  map: [1.2, 0.25], reward: [1.2, 0.25], coin: [0.6, 0.12], shop: [0.9, 0.18], camp: [1.2, 0.25], event: [1.2, 0.25],
};
// 사도 · 적의 제 소리(HERO_KINDS · ENEMY_KINDS 갈래)의 꼬리 · 크기. 고학년 시전 · 터지는 소리는 끝까지(대사와 맞춘 것)
export const KIND_TAIL = {
  attack: [1.2, 0.2], attackHit: [0.9, 0.18], power: [1.4, 0.25], powerHit: [1.0, 0.2], skill: [1.4, 0.25], skillHit: [1.0, 0.2],
  ult: [0, 0], ult2: [0, 0], ultHit: [1.2, 0.25], ultBoom: [0, 0], hit: [0.9, 0.18],
};
export const KIND_V = {
  attack: 0.6, power: 0.65, skill: 0.65, ult: 0.85, ult2: 0.9, ultBoom: 0.9,
  attackHit: 0.85, powerHit: 0.85, skillHit: 0.85, ultHit: 0.9, hit: 0.85,
};
// 맞는 소리의 높이 흔들기 — ±2.5%(같은 소리가 잇달아도 기계 같지 않게, 그러나 다른 소리로 들리지는 않게)
export const JITTER = 0.025;
// 갈래 → 다른 갈래(같은 소리)
export const ALIAS = { "camp.rest": "heal", "flash": "camp.train" };

// 사도 제 소리 — assets/sfx/hero/<원작 이름>/<원작 이름>_<꼬리>. 꼬리로 갈래를 가른다.
// 1 · 01 · _1 은 이어지는 소리의 첫 토막(ultimate1 → ultimate2) — 처음 토막만 「시작」 갈래로, 나머지 토막은 ult2 로.
// 첫 토막 이름이 제각각인 사도(_casting · _charge · _normal · _crew1 · 1-1 …)도 ult 로 받는다. powerattck 는 원작 오타
export const HERO_KINDS = {
  attack:    /^basicattack(?:_?0?1)?$/,
  attackHit: /^basicattack_?hit(?:_?\d+)?$/,
  power:     /^power(?:attack|attck)(?:_?0?1)?$/,
  powerHit:  /^power(?:attack|attck)\d*_?hit(?:_?\d+)?$/,
  skill:     /^(?:skillcast|spskill)(?:_?0?1|_cast)?$/,
  skillHit:  /^(?:skill_?hit|spskill\d*_hit)(?:_?\d+)?$/,
  ult:       /^ultimate(?:_?0?1|1-1|_cast(?:ing)?|_charge|_normal|_crew1|_crowd)?$/,
  ult2:      /^ultimate_?0?2$/,
  ultHit:    /^ultimate[\d_-]*_?hit(?:_?\d+)?$/,
  ultBoom:   /^ultimate_?(?:explosion|finalexplosion|laserexplosion|bombing)\d*$/,   // 터지는 소리 — ult2 가 없는 사도(에르핀_왕도 explosion1 …)의 터지는 순간
};
// 적 제 소리 — assets/sfx/monster/<폴더>/<폴더>_basicattack(_hit) · skillcast · skillhit
export const ENEMY_KINDS = {
  attack: /^basicattack(?:_?0?1)?$/,
  hit:    /^basicattack_?hit(?:_?\d+)?$/,
  skill:  /^skillcast(?:_?0?1)?$/,
  skillHit: /^skill_?hit(?:_?\d+)?$/,
};
// 사도 · 적의 제 소리가 없을 때 대신 트는 공용 갈래
export const FALLBACK = {
  attack: "card.공격", attackHit: "hit.slash", power: "card.공격", powerHit: "hit.heavy",
  skill: "card.스킬", skillHit: "hit.magic", ult: "ult.cutin", ult2: "ult.impact", ultHit: "ult.impact",
  hit: "hurt",
};

// 파일 이름에서 꼬리 — 「lion_ultimate_hit」 → 「ultimate_hit」. 폴더 이름과 머리가 다르면(storybattle 따위) 첫 토막만 뗀다
export function tailOf(dir, stem) {
  return stem.startsWith(dir + "_") ? stem.slice(dir.length + 1) : stem.replace(/^[a-z0-9]+_/, "");
}
// 색인(assets/sfx/index.json 의 열쇠 목록)에서 폴더 하나의 갈래별 파일 — { ult: ["hero/lion/lion_ultimate"], … }
export function kindsIn(keys, top, dir, kinds) {
  const pre = `${top}/${dir}/`, out = {};
  for (const k of keys) {
    if (!k.startsWith(pre) || k.indexOf("/", pre.length) >= 0) continue;
    const t = tailOf(dir, k.slice(pre.length));
    for (const [kind, re] of Object.entries(kinds)) if (re.test(t)) (out[kind] = out[kind] || []).push(k);
  }
  return out;
}
// 적 key → 효과음 폴더. 같은 이름이 있으면 그것, 없으면 key 안에 든 가장 긴 폴더 이름(elfcurseddolldealer → curseddoll)
export function monsterDir(key, dirs) {
  if (!key) return null;
  const k = String(key).toLowerCase();
  if (dirs.has(k)) return k;
  let best = null;
  for (const d of dirs) if (d.length >= 4 && k.includes(d) && (!best || d.length > best.length)) best = d;
  return best;
}

// ── 동작의 소리 칸 ──
// 원작 스파인의 SFX(n) 이벤트는 그 동작이 쓰는 소리 목록의 n 번째 칸이다(목록은 게임 표라 못 읽는다). 목록은 파일 이름으로 짐작한다 —
// 갈래 머리(SLOT_GROUPS)로 모아 SLOT 차례로 줄 세우고, 맞는 소리(_hit)가 있으면 맨 끝 한 칸. 135명에 대어 본 것(동작의 SFX 칸 수 = 파일 수):
//   평타(Attack1_1) 117/134 · 강화 평타(Attack2_1) 68/97 · 고학년(Ultimate1_*) 75/121 · 스킬(Skill1_1) 66/134 — 칸 수가 안 맞으면 안 쓴다(js/sfx.js 의 action)
export const SLOT_GROUPS = { attack: /^basicattack/, power: /^power(?:attack|attck)/, skill: /^(?:skillcast|spskill|skill_?hit)/, ult: /^ultimate/ };
const SLOT_HIT = /hit|heal/;
// 이름 붙은 토막의 차례 — 앞(모으기 · 준비) · 가운데(모르는 이름) · 뒤(터짐 · 끝)
const SLOT_EARLY = /^(cast|casting|ready|charge|start|normal|spawn|swing|jump|magiccircle|holypower|upgrade|mark|crew|crowd)$/;
const SLOT_LATE = /^(explosion|laserexplosion|finalexplosion|end|revival)$/;
// 줄 세우는 열쇠 — [머리(스킬은 skillcast 먼저 · spskill 뒤), 꼴(맨이름 0 · 번호 1 · 이름 2), 이름 차례, 번호, 버금 번호]
//   ultimate · ultimate1 · ultimate_02 · ultimate1-2 · ultimate_casting · ultimate_explosion2
export function slotKey(group, tail) {
  const head = tail.match(SLOT_GROUPS[group])[0];
  const r = tail.slice(head.length).replace(/^[_-]+/, "");
  const h = head === "spskill" ? 1 : 0;
  if (!r) return [h, 0, 0, 0, 0];
  let m = /^0*(\d+)(?:-(\d+))?$/.exec(r);
  if (m) return [h, 1, 0, +m[1], +(m[2] || 0)];
  m = /^([a-z]+)_?0*(\d*)/.exec(r);
  const w = m ? m[1] : r;
  return [h, 2, SLOT_EARLY.test(w) ? 0 : SLOT_LATE.test(w) ? 2 : 1, m && m[2] ? +m[2] : 0, 0];
}
// 폴더 하나의 그 갈래 소리 — { list: [칸 차례 경로 …](맞는 소리 뺌), hit: [맞는 소리 경로 …] }
export function slotsIn(keys, dir, group) {
  const pre = `hero/${dir}/`, list = [], hit = [];
  for (const k of keys) {
    if (!k.startsWith(pre) || k.indexOf("/", pre.length) >= 0) continue;
    const t = tailOf(dir, k.slice(pre.length));
    if (!SLOT_GROUPS[group].test(t)) continue;
    (SLOT_HIT.test(t) ? hit : list).push([slotKey(group, t), t, k]);
  }
  const cmp = (a, b) => { for (let i = 0; i < 5; i++) if (a[0][i] !== b[0][i]) return a[0][i] - b[0][i]; return a[1] < b[1] ? -1 : 1; };
  return { list: list.sort(cmp).map((x) => x[2]), hit: hit.sort(cmp).map((x) => x[2]) };
}
// SFX 칸 번호들(ns) → 칸마다 경로 · "hit"(맞는 소리 칸 — 맞는 순간에 land 가 낸다). 칸 수가 안 맞으면 null
//   칸 수 = 파일 수 → 차례대로 · 칸 수 = 파일 수 + 1 이고 맞는 소리가 있으면 → 마지막 칸이 맞는 소리
export function slotMap(slots, ns) {
  const u = [...new Set(ns)].sort((a, b) => a - b), L = slots.list.length;
  if (!L || !u.length) return null;
  if (u.length === L) return new Map(u.map((n, i) => [n, slots.list[i]]));
  if (u.length === L + 1 && slots.hit.length) return new Map(u.map((n, i) => [n, i < L ? slots.list[i] : "hit"]));
  return null;
}
