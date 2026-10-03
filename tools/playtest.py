# -*- coding: utf-8 -*-
"""한 판을 끝까지 자동으로 돌려 본다.

화면 얼개 검사(smoke)와 눈 검사(shot)가 잡지 못하는 것이 있다 —
**판이 실제로 굴러가는가**. 막히는 자리, 아무 말도 안 해 주는 자리,
누를 것이 없는 자리는 끝까지 가 봐야 나온다.

  python tools/playtest.py                한 판
  python tools/playtest.py --runs 5       다섯 판
  python tools/playtest.py --seed 3
  python tools/playtest.py --shots 어디   화면이 바뀔 때마다 사진

먼저 서버가 떠 있어야 한다: npm run serve
필요: selenium, 크롬
"""
import argparse, os, sys, time, urllib.request, collections

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 화면을 알아보는 표 — 클래스 하나로 가른다
SCREENS = [
    ("로비", ".lobby2"),
    ("팀 편성", ".teamscreen3"),
    ("사도 도감", ".dexscreen"),
    ("사도 정보", ".detailscreen"),
    ("지도", ".mapscreen"),
    ("전투", ".battle"),
    ("이벤트", ".eventscreen2"),
    ("캠프", ".campscreen2"),
    ("상점", ".shopscreen2"),
    ("보상", ".rewardscreen"),
    ("교체", ".swapscreen"),
    ("끝", ".endscreen"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--shots", default="")
    ap.add_argument("--party", default="에르핀,네르,티그")
    a = ap.parse_args()

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        sys.exit("selenium 이 필요합니다: pip install selenium")

    base = f"http://127.0.0.1:{a.port}"
    try: urllib.request.urlopen(base, timeout=3)
    except Exception: sys.exit(f"{base} 가 안 뜹니다. 먼저 켜세요: npm run serve")

    if a.shots: os.makedirs(a.shots, exist_ok=True)

    o = Options()
    for f in ("--headless=new", "--disable-gpu", "--hide-scrollbars",
              "--window-size=1500,1050", "--force-device-scale-factor=1"):
        o.add_argument(f)
    d = webdriver.Chrome(options=o)

    notes = collections.Counter()      # 겪은 것
    try:
        for r in range(a.runs):
            print(f"\n══ {r + 1}번째 판")
            play(d, By, base, a, notes, r)
    finally:
        errs = [e for e in d.get_log("browser")
                if e["level"] == "SEVERE" and "favicon" not in e["message"] and "assets/custom" not in e["message"]]
        d.quit()

    print("")
    print("겪은 것")
    for k, v in notes.most_common():
        print(f"  {v:>4}  {k}")
    if errs:
        print("")
        print(f"콘솔 오류 {len(errs)}")
        for e in errs[:5]: print("  !", e["message"][:150])


def fingerprint(d, By):
    """판이 움직였는지 보는 지문 — 턴·손패·체력·더미."""
    return d.execute_script("""
      const t = document.querySelector('.turntag');
      const hp = [...document.querySelectorAll('.hpwrap .nums')].map(n => n.textContent).join(',');
      const piles = [...document.querySelectorAll('.pile2 .pnum')].map(n => n.textContent).join(',');
      return [t ? t.textContent : '', document.querySelectorAll('.hand .card').length, hp, piles,
              document.querySelector('#screen').className].join('|');
    """)


def now(d, By):
    cls = d.execute_script("const s=document.querySelector('#screen'); return s ? s.className : '';")
    for ko, sel in SCREENS:
        if sel.lstrip(".") in cls: return ko
    return f"모르는 화면({cls})"


def play(d, By, base, a, notes, r):
    d.get(base + "/"); time.sleep(1.5)
    shot(d, a, f"{r}-1-로비")
    d.execute_script("document.querySelector('.home-primary').click()"); time.sleep(1.6)

    # 편성
    for name in a.party.split(","):
        d.execute_script("document.querySelector('.tf-slot.empty').click()"); time.sleep(0.4)   # 빈 칸 → 명단 창
        sb = d.find_element(By.CSS_SELECTOR, ".tm-fsearch"); sb.clear(); sb.send_keys(name); time.sleep(0.45)
        for c in d.find_elements(By.CSS_SELECTOR, ".tm-fcard"):
            if c.find_element(By.CSS_SELECTOR, ".tm-fcp b").text == name: c.click(); break
        time.sleep(0.35)
    shot(d, a, f"{r}-2-편성")
    d.find_element(By.CSS_SELECTOR, ".tf-go").click(); time.sleep(1.6)

    seen = set()
    last = None
    lastf = None
    stuck = 0
    for step in range(900):
        here = now(d, By)
        if here != last:
            if here not in seen:
                shot(d, a, f"{r}-{len(seen) + 3}-{here}")
                seen.add(here)
            print(f"  → {here}")
            last = here
            stuck = 0
        else:
            # 전투는 한 화면에 오래 머문다. 화면 이름이 아니라 **판이 움직였는가**로 본다.
            f = fingerprint(d, By)
            if f != lastf: stuck = 0; lastf = f
            else: stuck += 1
            if stuck > 60:
                notes[f"{here} 에서 막혔다"] += 1
                print(f"  !! {here} 에서 더 못 나간다")
                return

        # 화면은 누를 때마다 다시 그려진다 — 잡아 둔 요소가 사라지면(stale) 다음 걸음에서 다시 잡는다
        try:
            if here == "전투":
                if not step_battle(d, By, notes): time.sleep(0.12)
            elif here == "보상":
                step_reward(d, By, notes); time.sleep(0.5)
            elif here == "지도":
                step_map(d, By, notes, step); time.sleep(1.2)
            elif here == "교체":
                step_swap(d, By, notes); time.sleep(0.5)
            elif here == "이벤트":
                step_event(d, By, notes, step); time.sleep(0.4)
            elif here == "캠프":
                step_camp(d, By, notes); time.sleep(0.4)
            elif here == "상점":
                step_shop(d, By, notes); time.sleep(0.4)
            elif here == "끝":
                txt = d.find_element(By.CSS_SELECTOR, "#screen").text.replace("\n", " ")[:80]
                print(f"     {txt}")
                notes["판이 끝까지 갔다"] += 1
                return
            else:
                time.sleep(0.2)
        except Exception as e:
            if type(e).__name__ != "StaleElementReferenceException": raise
            time.sleep(0.1)
    notes["900걸음 안에 안 끝났다"] += 1


def step_map(d, By, notes, step):
    # 갈 수 있는 칸 가운데 하나 — 걸음 수로 돌려 가며 고른다(전투만 고르지 않게)
    can = d.find_elements(By.CSS_SELECTOR, ".mnode.can")
    if not can:
        notes["지도에서 갈 곳이 없다"] += 1
        return
    b = can[step % len(can)]
    kind = next((c[2:] for c in b.get_attribute("class").split() if c.startswith("t-")), "?")
    notes[f"지도에서 고른 칸 — {kind}"] += 1
    d.execute_script("arguments[0].click()", b)


def step_battle(d, By, notes):
    # 신탁 창 — 빛나는 카드를 내면 뜬다. 셋 가운데 하나를 고른다
    epi = d.find_elements(By.CSS_SELECTOR, ".epimodal .epiopt")
    if epi:
        kind = "카드 신탁"
        notes[f"{kind}이 터졌다"] += 1
        if d.find_elements(By.CSS_SELECTOR, ".epimodal .epiopt.shin"): notes["기적 선택지가 떴다"] += 1
        d.execute_script("arguments[0].click()", epi[step_battle.k % len(epi)]); step_battle.k += 1; time.sleep(0.3)
        return True
    # 버릴 카드 고르기(손패 N장 버리) — 떠 있으면 먼저. 「버리기 N/N」 이 살아날 때까지 앞에서부터 고른다
    pick = d.find_elements(By.CSS_SELECTOR, ".dcpick")
    if pick:
        for cell in d.find_elements(By.CSS_SELECTOR, ".dcpick .dccell"):
            ok = d.find_elements(By.CSS_SELECTOR, ".dcpick .dcok")
            if ok and ok[0].is_enabled(): break
            d.execute_script("arguments[0].click()", cell)
        ok = d.find_elements(By.CSS_SELECTOR, ".dcpick .dcok")
        if ok and ok[0].is_enabled():
            notes["버릴 카드를 골라 버렸다"] += 1
            d.execute_script("arguments[0].click()", ok[0])
        else:
            notes["버릴 카드 고르기가 막혔다"] += 1
            d.execute_script("arguments[0].click()", d.find_elements(By.CSS_SELECTOR, ".dcpick .dccancel")[0])
        time.sleep(0.3)
        return True
    able = [c for c in d.find_elements(By.CSS_SELECTOR, ".hand .card") if "no" not in c.get_attribute("class")]
    if able:
        d.execute_script("arguments[0].click()", able[0]); time.sleep(0.1)
        tg = [t for t in (d.find_elements(By.CSS_SELECTOR, ".foe.tgt") + d.find_elements(By.CSS_SELECTOR, ".stand.tgt"))
              if "dead" not in t.get_attribute("class")]
        if d.find_elements(By.CSS_SELECTOR, ".foe.tgt.dead") or d.find_elements(By.CSS_SELECTOR, ".stand.tgt.dead"):
            notes["쓰러진 쪽도 표적처럼 보인다"] += 1
        if tg:
            # 대상 카드는 끌어서 대상 위에 놓아야 나간다
            from selenium.webdriver.common.action_chains import ActionChains
            c = d.find_elements(By.CSS_SELECTOR, ".card.sel")[0]
            before = d.execute_script("return document.querySelectorAll('.hand .card').length")
            ActionChains(d, duration=40).move_to_element(c).click_and_hold().move_by_offset(0, -60).move_to_element(tg[0]).release().perform()
            time.sleep(0.3)
            if d.find_elements(By.CSS_SELECTOR, ".battle") and d.execute_script("return document.querySelectorAll('.hand .card').length") == before:
                notes["끌어 놓아도 안 나간 대상 카드"] += 1
                if d.find_elements(By.CSS_SELECTOR, ".card.sel"): d.execute_script("arguments[0].click()", d.find_elements(By.CSS_SELECTOR, ".card.sel")[0])
            else:
                notes["끌어 놓아 낸 대상 카드"] += 1
        elif d.find_elements(By.CSS_SELECTOR, ".card.sel"):
            # 대상이 없는 카드(방어 · 버프)는 눌러서는 안 나간다 — 손패 위로 끌어 올려 놓는다
            from selenium.webdriver.common.action_chains import ActionChains
            c = d.find_elements(By.CSS_SELECTOR, ".card.sel")[0]
            # 나갔는가는 AP 가 아니라 판의 모양으로 — 0코 카드는 AP 가 안 준다
            look = "return [...document.querySelectorAll('.hand .card')].length + '|' + ((document.querySelector('.pile2.disc .pnum')||{}).textContent||'') + '|' + ((document.querySelector('.apnum')||{}).textContent||'')"
            ap0 = d.execute_script(look)
            ActionChains(d, duration=40).move_to_element(c).click_and_hold().move_by_offset(0, -60).move_by_offset(0, -220).release().perform()
            time.sleep(0.3)
            if d.find_elements(By.CSS_SELECTOR, ".dcpick"):
                notes["버릴 카드 고르기 창이 떴다"] += 1
            elif d.find_elements(By.CSS_SELECTOR, ".battle") and d.execute_script(look) == ap0:
                notes["끌어 올려도 안 나간 카드"] += 1
                d.execute_script("arguments[0].click()", c) if c.is_displayed() else None
            else:
                notes["끌어 올려 낸 카드"] += 1
        return True
    ult = [b for b in d.find_elements(By.CSS_SELECTOR, ".ultbtn") if "no" not in b.get_attribute("class")]
    if ult:
        d.execute_script("arguments[0].click()", ult[0]); time.sleep(0.15)
        # 누르면 효과를 읽는 창이 뜬다 — 거기서 「사용합니다」
        use = d.find_elements(By.CSS_SELECTOR, ".bmodal .bmuse:not(:disabled)")
        if use: d.execute_script("arguments[0].click()", use[0]); time.sleep(0.15)
        notes["고학년 스킬을 썼다"] += 1
        return True
    e = d.find_elements(By.CSS_SELECTOR, ".endturn")
    if e:
        d.execute_script("arguments[0].click()", e[0]); time.sleep(0.25)
        return True
    notes["전투에서 누를 것이 없다"] += 1
    return False


def step_reward(d, By, notes):
    cards = d.find_elements(By.CSS_SELECTOR, ".rpick:not(.rgot) .gcard")   # rgot = 이 전투에서 이미 얻은 것(보기만)
    flashes = d.find_elements(By.CSS_SELECTOR, ".fcard, .fpick")
    # 누르면 가운데에 자세히가 뜬다 — 거기서 「덱에 넣습니다」 · 「이 신탁을 붙입니다」
    def confirm():
        time.sleep(0.2)
        use = d.find_elements(By.CSS_SELECTOR, ".bmodal .bmuse")
        if use: d.execute_script("arguments[0].click()", use[0])
        else: notes["보상 자세히 창이 안 떴다"] += 1
    if flashes:
        notes["신탁이 떴다"] += 1
        d.execute_script("arguments[0].click()", flashes[0]); confirm(); return
    if cards:
        notes["고유 카드를 얻었다"] += 1
        d.execute_script("arguments[0].click()", cards[0]); confirm(); return
    notes["보상에 고를 것이 없었다"] += 1
    skip = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text in ("그냥 갑니다", "계속합니다")]
    if skip: d.execute_script("arguments[0].click()", skip[0])


def click_text(d, By, *texts):
    b = [x for x in d.find_elements(By.CSS_SELECTOR, "button") if x.text.strip() in texts and x.is_enabled()]
    if b: d.execute_script("arguments[0].click()", b[0]); return True
    return False


def step_event(d, By, notes, step):
    # 두 단계 — 눌러 고르고(.picked) 확인 단추(.tsok)로 정한다
    def pick_then_ok(el):
        d.execute_script("arguments[0].click()", el)
        ok = [b for b in d.find_elements(By.CSS_SELECTOR, ".twostep .tsok") if b.is_enabled()]
        if ok: d.execute_script("arguments[0].click()", ok[0])
    # 고를 것이 있으면 먼저 — 카드 · 신탁 · 사도 · 골라 받기(위에 뜨는 창)
    if d.find_elements(By.CSS_SELECTOR, ".ev2-sheet"):
        for sel in (".ev2-sheet .fpick", ".ev2-sheet .fcard", ".ev2-sheet .ev2-card", ".ev2-sheet .ev2-hero", ".ev2-sheet .ev2-opt"):
            el = d.find_elements(By.CSS_SELECTOR, sel)
            if el:
                notes["이벤트: 고를 것을 골랐다"] += 1
                pick_then_ok(el[0]); return
    if click_text(d, By, "길을 떠납니다", "보스에게 갑니다"):
        return
    forks = d.find_elements(By.CSS_SELECTOR, ".ev2-fork")
    if forks:
        notes["이벤트: 지도 공개로 갈림길"] += 1
        pick_then_ok(forks[0]); return
    opts = [o for o in d.find_elements(By.CSS_SELECTOR, ".ev2-opt") if o.is_enabled() and "leave" not in o.get_attribute("class")]
    title = (d.find_elements(By.CSS_SELECTOR, ".ev2-title b") or [None])[0]
    name = title.text if title else "?"
    if opts:
        o = opts[step % len(opts)]          # 번갈아 고른다 — 여러 결과를 밟아 보려고
        notes[f"이벤트 {name} — {o.find_element(By.CSS_SELECTOR, '.ev2-label').text}"] += 1
        pick_then_ok(o); return
    leave = d.find_elements(By.CSS_SELECTOR, ".ev2-opt.leave")
    if leave:
        notes[f"이벤트 {name} — 떠났다"] += 1
        pick_then_ok(leave[0])


def step_camp(d, By, notes):
    rest = [b for b in d.find_elements(By.CSS_SELECTOR, ".cp-rest") if b.is_enabled()]
    if rest:
        notes["캠프에서 쉬었다"] += 1
        d.execute_script("arguments[0].click()", rest[0]); return
    click_text(d, By, "길을 떠납니다", "보스에게 갑니다")


def step_shop(d, By, notes):
    notes["골디의 상점에 들렀다"] += 1
    click_text(d, By, "캠프로 돌아갑니다", "보스에게 갑니다", "길을 떠납니다")   # 지도의 상점 칸은 「길을 떠납니다」


def step_swap(d, By, notes):
    notes["사도를 바꿀 기회가 왔다"] += 1
    keep = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text in ("그대로 갑니다", "그냥 갑니다", "계속합니다")]
    if keep: d.execute_script("arguments[0].click()", keep[0]); return
    outs = d.find_elements(By.CSS_SELECTOR, ".hero")
    if outs: d.execute_script("arguments[0].click()", outs[0])


def shot(d, a, name):
    if not a.shots: return
    d.save_screenshot(os.path.join(a.shots, name + ".png"))


step_battle.k = 0

if __name__ == "__main__":
    main()
