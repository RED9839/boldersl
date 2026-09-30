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
    ("로비", ".journey-home"),
    ("팀 편성", ".teamscreen"),
    ("사도 도감", ".dexscreen"),
    ("사도 정보", ".detailscreen"),
    ("전투", ".battle"),
    ("이벤트", ".eventscreen"),
    ("캠프", ".campscreen"),
    ("상점", ".shopscreen"),
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
        d.find_elements(By.CSS_SELECTOR, ".tcard.empty")[0].click(); time.sleep(0.35)
        sb = d.find_element(By.CSS_SELECTOR, ".tdrawer .dsearch"); sb.clear(); sb.send_keys(name); time.sleep(0.45)
        for c in d.find_elements(By.CSS_SELECTOR, ".tdrawer .pcard"):
            if c.find_element(By.CSS_SELECTOR, ".dname").text == name: c.click(); break
        time.sleep(0.35)
    shot(d, a, f"{r}-2-편성")
    [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text == "떠난다"][0].click(); time.sleep(1.6)

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


def step_battle(d, By, notes):
    able = [c for c in d.find_elements(By.CSS_SELECTOR, ".hand .card") if "no" not in c.get_attribute("class")]
    if able:
        d.execute_script("arguments[0].click()", able[0]); time.sleep(0.1)
        tg = [t for t in (d.find_elements(By.CSS_SELECTOR, ".foe.tgt") + d.find_elements(By.CSS_SELECTOR, ".stand.tgt"))
              if "dead" not in t.get_attribute("class")]
        if d.find_elements(By.CSS_SELECTOR, ".foe.tgt.dead") or d.find_elements(By.CSS_SELECTOR, ".stand.tgt.dead"):
            notes["쓰러진 쪽도 표적처럼 보인다"] += 1
        if d.find_elements(By.CSS_SELECTOR, ".card.sel") and not tg:
            notes["카드를 골랐는데 고를 대상이 없다"] += 1
        if tg:
            d.execute_script("arguments[0].click()", tg[0]); time.sleep(0.1)
        elif d.find_elements(By.CSS_SELECTOR, ".card.sel"):
            # 고르긴 했는데 고를 대상이 없다 — 이건 막히는 자리다
            notes["카드를 골랐는데 고를 대상이 없다"] += 1
            d.execute_script("arguments[0].click()", d.find_elements(By.CSS_SELECTOR, ".card.sel")[0])
        return True
    ult = [b for b in d.find_elements(By.CSS_SELECTOR, ".ultbtn") if "no" not in b.get_attribute("class")]
    if ult:
        d.execute_script("arguments[0].click()", ult[0]); time.sleep(0.15)
        notes["궁극기를 썼다"] += 1
        return True
    e = d.find_elements(By.CSS_SELECTOR, ".endturn")
    if e:
        d.execute_script("arguments[0].click()", e[0]); time.sleep(0.25)
        return True
    notes["전투에서 누를 것이 없다"] += 1
    return False


def step_reward(d, By, notes):
    cards = d.find_elements(By.CSS_SELECTOR, ".rpick .gcard")
    flashes = d.find_elements(By.CSS_SELECTOR, ".fcard")
    if flashes:
        notes["번뜩임이 떴다"] += 1
        d.execute_script("arguments[0].click()", flashes[0]); return
    if cards:
        notes["고유 카드를 얻었다"] += 1
        d.execute_script("arguments[0].click()", cards[0]); return
    notes["보상에 고를 것이 없었다"] += 1
    skip = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text == "그냥 간다"]
    if skip: d.execute_script("arguments[0].click()", skip[0])


def click_text(d, By, *texts):
    b = [x for x in d.find_elements(By.CSS_SELECTOR, "button") if x.text.strip() in texts and x.is_enabled()]
    if b: d.execute_script("arguments[0].click()", b[0]); return True
    return False


def step_event(d, By, notes, step):
    # 고를 것이 있으면 먼저 — 카드 · 번뜩임 · 사도 · 골라 받기
    pick = d.find_elements(By.CSS_SELECTOR, ".evpick")
    if pick:
        for sel in (".evpick .fcard", ".evpick .rpick .gcard", ".evpick .evpickhero", ".evpick .evopt"):
            el = d.find_elements(By.CSS_SELECTOR, sel)
            if el:
                notes["이벤트: 고를 것을 골랐다"] += 1
                d.execute_script("arguments[0].click()", el[0]); return
    if click_text(d, By, "길을 떠난다"):
        return
    forks = d.find_elements(By.CSS_SELECTOR, ".evfork")
    if forks:
        notes["이벤트: 지도 공개로 갈림길"] += 1
        d.execute_script("arguments[0].click()", forks[0]); return
    opts = [o for o in d.find_elements(By.CSS_SELECTOR, ".evopt") if o.is_enabled() and "leave" not in o.get_attribute("class")]
    title = (d.find_elements(By.CSS_SELECTOR, ".dtitle") or [None])[0]
    name = title.text if title else "?"
    if opts:
        o = opts[step % len(opts)]          # 번갈아 고른다 — 여러 결과를 밟아 보려고
        notes[f"이벤트 {name} — {o.find_element(By.CSS_SELECTOR, '.evlabel').text}"] += 1
        d.execute_script("arguments[0].click()", o); return
    leave = d.find_elements(By.CSS_SELECTOR, ".evopt.leave")
    if leave:
        notes[f"이벤트 {name} — 떠났다"] += 1
        d.execute_script("arguments[0].click()", leave[0])


def step_camp(d, By, notes):
    rest = [b for b in d.find_elements(By.CSS_SELECTOR, ".cact") if b.is_enabled()]
    if rest:
        notes["캠프에서 쉬었다"] += 1
        d.execute_script("arguments[0].click()", rest[0]); return
    click_text(d, By, "길을 떠난다", "보스에게 간다")


def step_shop(d, By, notes):
    notes["골디의 상점에 들렀다"] += 1
    click_text(d, By, "캠프로 돌아간다", "보스에게 간다")


def step_swap(d, By, notes):
    notes["사도를 바꿀 기회가 왔다"] += 1
    keep = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text in ("그대로 간다", "그냥 간다")]
    if keep: d.execute_script("arguments[0].click()", keep[0]); return
    outs = d.find_elements(By.CSS_SELECTOR, ".hero")
    if outs: d.execute_script("arguments[0].click()", outs[0])


def shot(d, a, name):
    if not a.shots: return
    d.save_screenshot(os.path.join(a.shots, name + ".png"))


if __name__ == "__main__":
    main()
