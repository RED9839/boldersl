# -*- coding: utf-8 -*-
"""진짜 브라우저로 화면을 띄워 사진을 찍고, 눈에 보이는 것을 데이터와 대조한다.

가짜 DOM(tools/smoke.js)은 얼개를 보지만 **눈에 어떻게 보이는지**는 못 본다.
실제로 이런 일이 있었다 — 문서에 안 붙은 <img> 에 loading="lazy" 를 걸어 두는 바람에
브라우저가 그림을 아예 받아 오지 않아 아이콘이 한 장도 안 떴는데,
smoke 는 검사 백 몇 개를 전부 통과했다. 그래서 이 도구가 따로 있다.

  python tools/shot.py                  로비 · 도감 · 사도 정보 네 갈피를 찍고 대조한다
  python tools/shot.py --hero 네르
  python tools/shot.py --no-check       사진만
  python tools/shot.py --out 어디

먼저 서버가 떠 있어야 한다: npm run serve
필요: selenium, 크롬
"""
import argparse, json, os, sys, time, urllib.request

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

fails = 0
def check(cond, what):
    global fails
    print(("  ok   " if cond else "  실패 ") + what)
    if not cond: fails += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, ".shots"))
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--hero", default="에르핀")
    ap.add_argument("--width", type=int, default=1500)
    ap.add_argument("--height", type=int, default=1050)
    ap.add_argument("--no-check", action="store_true")
    # --webgl — 소프트웨어 WebGL(SwiftShader)로 띄운다. 헤드리스는 GPU 가 없어 스파인이 그림 한 장으로 떨어진다
    ap.add_argument("--webgl", action="store_true")
    # --phone — 휴대폰 흉내(터치 · 모바일 UA). 휴대폰 판정이 「터치 + 짧은 변 600px 이하」 라서
    # 마우스만 있는 검사 브라우저는 창을 좁혀도 PC 로 친다. --width/--height 가 그대로 폰 화면 크기가 된다
    ap.add_argument("--phone", action="store_true")
    a = ap.parse_args()

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        sys.exit("selenium 이 필요합니다: pip install selenium")

    base = f"http://127.0.0.1:{a.port}"
    try:
        urllib.request.urlopen(base, timeout=3)
    except Exception:
        sys.exit(f"{base} 가 안 뜹니다. 먼저 서버를 켜세요: npm run serve")

    os.makedirs(a.out, exist_ok=True)
    o = Options()
    gpu = ("--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist") if a.webgl else ("--disable-gpu",)
    for f in ("--headless=new", *gpu, "--hide-scrollbars",
              f"--window-size={a.width},{a.height}", "--force-device-scale-factor=1"):
        o.add_argument(f)
    if a.phone:
        o.add_experimental_option("mobileEmulation", {
            "deviceMetrics": {"width": a.width, "height": a.height, "pixelRatio": 3, "touch": True},
            "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36"})
    d = webdriver.Chrome(options=o)
    try:
        print("사진")
        d.get(base + "/"); time.sleep(1.5)
        shot(d, a.out, "1-로비")

        d.execute_script("document.querySelector('.home-primary').click()"); time.sleep(2.0)
        shot(d, a.out, "2-팀편성")
        d.find_element(By.CSS_SELECTOR, ".dexbtn").click(); time.sleep(1.2)
        shot(d, a.out, "3-도감")

        box = d.find_element(By.CSS_SELECTOR, ".dsearch")
        box.send_keys(a.hero); time.sleep(0.8)
        cards = d.find_elements(By.CSS_SELECTOR, ".dex")
        for c in cards:
            if c.find_element(By.CSS_SELECTOR, ".dname").text == a.hero:
                c.click(); break
        else:
            if cards: cards[0].click()
        time.sleep(1.5)
        shot(d, a.out, "4-사도정보-능력치")   # 들어가면 능력치가 먼저 뜬다
        for tab in ("카드", "신탁", "고학년 스킬"):
            for b in d.find_elements(By.CSS_SELECTOR, ".sidebtn"):
                if b.text == tab:
                    b.click(); time.sleep(1.0); shot(d, a.out, f"5-사도정보-{tab}"); break

        # ── 전투까지 걸어 들어간다 ──────────────────────────────────
        d.find_element(By.CSS_SELECTOR, ".back").click(); time.sleep(0.9)   # 사도 정보 → 도감
        d.find_element(By.CSS_SELECTOR, ".back").click(); time.sleep(0.9)   # 도감 → 편성
        for name in ("에르핀", "네르", "티그"):
            d.find_elements(By.CSS_SELECTOR, ".tcard.empty")[0].click(); time.sleep(0.5)
            sb = d.find_element(By.CSS_SELECTOR, ".tdrawer .dsearch")
            sb.clear(); sb.send_keys(name); time.sleep(0.6)
            for c in d.find_elements(By.CSS_SELECTOR, ".tdrawer .pcard"):
                if c.find_element(By.CSS_SELECTOR, ".dname").text == name:
                    c.click(); break
            time.sleep(0.6)
        go = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if b.text == "떠납니다"]
        if go:
            go[0].click(); time.sleep(2.0)
            # 떠나면 지도가 먼저 뜬다 — 찍고, 첫 칸(전투)을 눌러 들어간다
            if d.find_elements(By.CSS_SELECTOR, ".mapscreen"):
                shot(d, a.out, "5z-지도")
                if not a.no_check:
                    m = d.execute_script("""return { nodes: document.querySelectorAll('.mnode').length, can: document.querySelectorAll('.mnode.can').length,
                      boss: document.querySelectorAll('.mnode.t-boss').length, edges: document.querySelectorAll('.medges path').length,
                      walkers: document.querySelectorAll('.mwalkers .art').length };""")
                    print("지도에 보이는 것")
                    check(m["nodes"] >= 10, f"칸이 깔린다 ({m['nodes']})")
                    check(2 <= m["can"] <= 4, f"처음엔 첫 줄 2~4 갈래에서 고른다 ({m['can']})")
                    check(m["boss"] == 1, "보스 칸이 하나")
                    check(m["edges"] >= m["nodes"] - 1, f"칸이 길로 이어진다 ({m['edges']})")
                    check(m["walkers"] == 3, f"파티 미니미 셋이 선다 ({m['walkers']})")
                d.find_element(By.CSS_SELECTOR, ".mnode.can").click(); time.sleep(2.4)
            shot(d, a.out, "6-전투")
            if not a.no_check: verifyBattle(d, a.out)
            # 이길 때까지 눌러 보고 보상 화면을 찍는다
            from selenium.common.exceptions import StaleElementReferenceException
            for _ in range(160):
                if d.find_elements(By.CSS_SELECTOR, ".lootbox.done"):
                    time.sleep(0.6); shot(d, a.out, "7-승리"); break
                if d.find_elements(By.CSS_SELECTOR, ".rewardscreen, .mapscreen, .endscreen"): break
                if d.find_elements(By.CSS_SELECTOR, ".epimodal .epiopt"):
                    d.execute_script("document.querySelector('.epimodal .epiopt').click()"); time.sleep(0.3); continue
                # 손패는 낼 때마다 다시 그려진다 — 잡고 있던 요소가 사라지면 다시 잡는다
                try:
                    hand = [c for c in d.find_elements(By.CSS_SELECTOR, ".hand .card") if "no" not in c.get_attribute("class")]
                    if hand:
                        # 카드는 끌어서만 낸다 — 끌기가 끝날 때 부르는 dropCard 로 첫 적(아군 카드면 첫 아군)에게 놓는다
                        d.execute_script("""const c = arguments[0], sc = document.querySelector("#screen");
                          const f = document.querySelector(".foe:not(.dead)");
                          sc.dropCard(Number(c.dataset.i), f ? Number(f.dataset.idx) : 0);""", hand[0]); time.sleep(0.15)
                    else:
                        e = d.find_elements(By.CSS_SELECTOR, ".endturn")
                        if not e: break
                        d.execute_script("arguments[0].click()", e[0]); time.sleep(0.25)
                except StaleElementReferenceException:
                    time.sleep(0.1)
            if d.find_elements(By.CSS_SELECTOR, ".rewardscreen"):
                shot(d, a.out, "7-보상")

        if not a.no_check:
            d.get(base + "/"); time.sleep(1.5)
            d.execute_script("document.querySelector('.home-primary').click()"); time.sleep(2.0)
            d.find_element(By.CSS_SELECTOR, ".dexbtn").click(); time.sleep(1.4)
            # 찾던 이름이 남아 있으면 두 장만 깔린다. 지우고 봐야 전체가 보인다.
            d.execute_script("""
              const s = document.querySelector('.dsearch');
              if (s) { s.value = ''; s.oninput(); }
            """); time.sleep(1.0)
            verify(d, base)

        # 콘솔 오류. 일부러 두드려 보는 것은 뺀다 —
        #   favicon              없어도 그만
        #   assets/custom/…      art.js 가 '있으면 쓴다'고 물어보는 자리(js/art.js loadManifest)
        SKIP = ("favicon", "assets/custom/manifest.json")
        errs = [e for e in d.get_log("browser")
                if e["level"] == "SEVERE" and not any(k in e["message"] for k in SKIP)]
        print("")
        print("콘솔")
        check(not errs, f"오류 없음" if not errs else f"오류 {len(errs)}개: " + errs[0]["message"][:140])
    finally:
        d.quit()

    print("")
    print(f"문제 {fails}개" if fails else "화면에 보이는 것이 데이터와 맞는다")
    sys.exit(1 if fails else 0)


def verify(d, base):
    """화면에 실제로 붙은 아이콘이 그 사도의 것인지 본다."""
    print("")
    print("도감에 보이는 것")

    raw = urllib.request.urlopen(base + "/js/data/built.js").read().decode("utf-8")
    HERO = json.loads(raw.split("export default ", 1)[1].rstrip().rstrip(";\n"))["heroes"]
    byko = {v["ko"]: v for v in HERO.values()}

    rows = d.execute_script("""
      return [...document.querySelectorAll('.dex')].map(c => [
        c.querySelector('.dname').textContent,
        [...c.querySelectorAll('.dbadges img')].map(i => decodeURIComponent(i.getAttribute('src'))),
      ]);
    """)
    check(len(rows) > 100, f"카드가 깔린다 ({len(rows)}장)")

    thin = [n for n, imgs in rows if len(imgs) != 2]
    check(not thin, f"카드마다 아이콘 둘이 붙는다"
          if not thin else f"아이콘이 덜 붙은 카드 {len(thin)}: {', '.join(thin[:5])} — 글자로 떨어졌다")

    bad = []
    for name, imgs in rows:
        h = byko.get(name)
        if not h or len(imgs) != 2: continue
        want = [f"assets/uiicons/역할_{h['role']}.png", f"assets/uiicons/성격_{h['nature']}.png"]
        if imgs != want: bad.append(f"{name}({h['role']}·{h['nature']})")
    check(not bad, "역할·성격 아이콘이 데이터와 맞는다"
          if not bad else f"짝이 어긋난 카드 {len(bad)}: {', '.join(bad[:5])}")

    rail = d.execute_script("""
      return [...document.querySelectorAll('.railbtn')].map(b => [
        b.querySelector('.rname').textContent,
        b.querySelector('img') ? decodeURIComponent(b.querySelector('img').getAttribute('src')) : null,
      ]);
    """)
    railbad = [n for n, src in rail if n != "ALL" and src != f"assets/uiicons/종족_{n}.png"]
    check(not railbad, f"종족 레일 {len(rail) - 1}개가 종족 이름과 맞는다"
          if not railbad else f"어긋난 레일: {', '.join(railbad)}")

    # 그림이 실제로 그려졌는가 — 받아 왔지만 0×0 이면 안 뜬 것이다
    blank = d.execute_script("""
      return [...document.querySelectorAll('.dbadges img, .railbtn img, .chip img')]
        .filter(i => !i.complete || !i.naturalWidth)
        .map(i => decodeURIComponent(i.getAttribute('src')));
    """)
    check(not blank, "붙은 그림이 모두 실제로 그려졌다"
          if not blank else f"빈 그림 {len(blank)}: {', '.join(blank[:4])}")


def verifyBattle(d, out=None):
    """전투 화면이 눈에 어떻게 보이는지 본다."""
    from selenium.webdriver.common.by import By
    print("")
    print("전투에 보이는 것")
    n = d.execute_script("""
      const cards = [...document.querySelectorAll('.hand .card')];
      return {
        hand: cards.length,
        cost: cards.filter(c => c.querySelector('.gcost')).length,
        face: cards.filter(c => c.querySelector('.gpic') || c.querySelector('.gglyph') || c.querySelector('.heroart')).length,
        own:  cards.filter(c => c.querySelector('.cown')).length,
        pips: document.querySelectorAll('.appips i').length,
        lit:  document.querySelectorAll('.appips i.on').length,
        ap:   parseInt((document.querySelector('.apnum')||{}).textContent || '0', 10),
        ticks: document.querySelectorAll('.gbar .tick').length,
        allies: document.querySelectorAll('.ally').length,
        foes: document.querySelectorAll('.foe').length,
        blank: [...document.querySelectorAll('.hand img')].filter(i => !i.complete || !i.naturalWidth).length,
        tilt: cards.filter(c => c.style.getPropertyValue('--tilt') !== '').length,
        piles: document.querySelectorAll('.pile2').length,
      };
    """)
    check(n["hand"] > 0, f"손패가 그려진다 ({n['hand']}장)")
    check(n["cost"] == n["hand"], "카드마다 코스트가 있다")
    check(n["face"] == n["hand"], "카드마다 그림이나 무늬가 있다")
    check(n["own"] == n["hand"], "카드마다 누구 것인지 띠가 있다")
    check(n["lit"] == n["ap"] and n["pips"] >= n["ap"], f"AP 눈금이 숫자와 맞는다 ({n['lit']}/{n['pips']} · {n['ap']})")
    check(n["ticks"] == 4, f"고학년 게이지에 비용 눈금 넷 ({n['ticks']})")
    check(n["allies"] == 3 and n["foes"] > 0, f"아군 {n['allies']} · 적 {n['foes']}")
    check(not n["blank"], "손패 그림이 모두 그려졌다" if not n["blank"] else f"빈 그림 {n['blank']}")
    check(n["tilt"] == n["hand"], f"손패가 손에 든 것처럼 펼쳐진다 ({n['tilt']}/{n['hand']})")
    check(n["piles"] == 2, f"덱·버린 더미를 열어 볼 수 있다 ({n['piles']})")
    # 인게임 모델 — 칸마다 스파인 캔버스로 그려졌는가, 그림 한 장으로 떨어졌는가.
    # WebGL 이 없으면(--webgl 없이 헤드리스) 그림으로 떨어지는 게 맞다 — 그때는 알리기만 한다
    sp = d.execute_script("""
      const gl = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } })();
      const cells = (sel) => [...document.querySelectorAll(sel)].map((n) => n.querySelector('canvas') ? 'spine' : (n.querySelector('img') ? 'img' : 'none'));
      return { gl, runtime: !!globalThis.spine, allies: cells('.stand'), foes: cells('.foe') };
    """)
    print(f"  참고 WebGL {'있음' if sp['gl'] else '없음'} · 스파인 런타임 {'있음' if sp['runtime'] else '없음'} · 아군 {sp['allies']} · 적 {sp['foes']}")
    # 한 화면에 다 들어오는가 — 휴대폰 가로에서 손패가 아래로, 적 의도가 위로 잘리고 이름이 두 줄로 꺾였다.
    # 좌표는 화면(viewport) 기준이다(zoom 이 걸려 있어도 getBoundingClientRect 는 실제 화면 좌표를 준다).
    g = d.execute_script("""
      const H = innerHeight, W = innerWidth;
      const r = (n) => n.getBoundingClientRect();
      const field = document.querySelector('.field');
      const fr = field ? r(field) : null;
      const cards = [...document.querySelectorAll('.hand .card')].map(r);
      const intents = [...document.querySelectorAll('.foe .intent')].map(r);
      const lines = (n) => { if (!n) return 0; const lh = parseFloat(getComputedStyle(n).lineHeight) || 16; return Math.round(r(n).height / lh); };
      const names = [...document.querySelectorAll('.foe .fname')].map((n) => { const fs = parseFloat(getComputedStyle(n).fontSize) || 12; const z = r(n).height / (n.offsetHeight || 1); return { t: n.textContent, h: n.offsetHeight, one: Math.max(fs * 1.9, 22) }; });
      const badges = [...document.querySelectorAll('.foe .fname .nature')].map((n) => ({ w: r(n).width, h: r(n).height }));
      return { H, W, hand: cards.length ? Math.max(...cards.map((c) => c.bottom)) : 0,
               field: fr ? [fr.top, fr.bottom] : null,
               intentTop: intents.length ? Math.min(...intents.map((c) => c.top)) : null,
               names, badges };
    """)
    check(g["hand"] <= g["H"] + 1, f"손패가 화면 안에 다 들어온다 (카드 아래 {g['hand']:.0f} / 화면 {g['H']})")
    if g["field"] and g["intentTop"] is not None:
        check(g["intentTop"] >= g["field"][0] - 1, f"적 머리 위 의도가 싸움터 안에 있다 (의도 위 {g['intentTop']:.0f} / 싸움터 위 {g['field'][0]:.0f})")
    tall = [n["t"] for n in g["names"] if n["h"] > n["one"] * 1.6]
    bad = [b for b in g["badges"] if b["h"] > b["w"]]
    check(not tall and not bad, "적 이름과 성격 표시가 한 줄에 선다" if not tall and not bad else f"꺾인 이름 {tall} · 세로로 찢어진 성격 표시 {len(bad)}")
    if sp["gl"] and sp["runtime"]:
        check(all(x == "spine" for x in sp["allies"] + sp["foes"]), f"WebGL 이 있으면 아군·적 모두 스파인으로 그린다")
    from selenium.webdriver.common.by import By as _B
    d.find_element(_B.CSS_SELECTOR, ".pile2.draw").click(); time.sleep(0.6)
    pv = d.execute_script("""
      return { tabs: document.querySelectorAll('.ptab').length,
               cards: document.querySelectorAll('.pilegrid .gcard').length,
               full: document.querySelectorAll('.pilegrid .pfull').length,
               dup: (() => { const n=[...document.querySelectorAll('.pilegrid .gcard .gtitle b')].map(b=>b.textContent); return n.length - new Set(n).size; })() };
    """)
    check(pv["tabs"] == 4, f"더미를 열면 네 칸을 오간다 (뽑을·버린·사라진·전체) ({pv['tabs']})")
    check(pv["cards"] > 0 and pv["cards"] == pv["full"], f"카드 모양과 전문이 함께 보인다 ({pv['cards']}장)")
    check(pv["dup"] == 0, f"같은 카드는 한 장으로 묶는다 (겹침 {pv['dup']})")
    d.find_element(_B.CSS_SELECTOR, ".pilehead .kwclose").click(); time.sleep(0.3)

    # 피해 미리보기 — 한 명을 치는 카드를 고르면 적마다 얼마나 깎이는지 뜬다
    from selenium.webdriver.common.action_chains import ActionChains
    # 손패는 낼 때마다 다시 그려진다 — 파이썬이 잡은 요소는 금세 낡으니 브라우저 안에서 고른다
    picked = d.execute_script("""
      // 아군을 고르는 카드면 다시 눌러 풀고 다음 카드로 — 적을 고르지 않는 카드는 누르는 즉시 나간다
      for (let k = 0; k < 12; k++) {
        const c = [...document.querySelectorAll('.hand .card')].filter(x => !x.classList.contains('no'))[k];
        if (!c) return false;
        c.click();
        if (document.querySelector('.foe.tgt')) return true;
        const sel = document.querySelector('.hand .card.sel');
        if (sel) sel.click();
      }
      return false;
    """); time.sleep(0.3)
    if picked:
        pv = d.execute_script("""
          const on = [...document.querySelectorAll('.foe.pvon')];
          return { on: on.length, alive: document.querySelectorAll('.foe:not(.dead)').length,
                   text: on.map(n => n.querySelector('.pv').textContent),
                   ghost: on.filter(n => parseFloat(n.querySelector('.ghost').style.width) > 0).length };
        """)
        check(pv["on"] > 0, f"카드를 고르면 적 위에 피해가 뜬다 ({pv['on']}/{pv['alive']} · {', '.join(pv['text'])})")
        check(all(("처치" in t) or ("-" in t) for t in pv["text"]), "뜨는 값이 피해 모양이다 (-N · 처치)")
        check(pv["ghost"] == pv["on"], f"체력 막대에 깎일 만큼 그림자가 진다 ({pv['ghost']})")
        if out: shot(d, out, "6b-미리보기")
        foe = d.find_elements(_B.CSS_SELECTOR, ".foe.tgt")[0]
        ActionChains(d).move_to_element(foe).perform(); time.sleep(0.3)
        check(len(d.find_elements(_B.CSS_SELECTOR, ".foe.pvon")) > 0, "적에 올려도 미리보기가 남는다")
        # 고른 것을 푼다
        sel = d.find_elements(_B.CSS_SELECTOR, ".hand .card.sel")
        if sel: d.execute_script("arguments[0].click()", sel[0]); time.sleep(0.3)
        check(not d.find_elements(_B.CSS_SELECTOR, ".foe.pvon"), "고른 것을 풀면 미리보기가 사라진다")
    else:
        check(False, "적을 고르는 카드를 손패에서 찾지 못했다")
    it = d.execute_script("return [...document.querySelectorAll('.intent .igem b')].map(b => b.textContent)")
    check(len(it) > 0 and all(t.strip() for t in it), f"적 머리 위에 수가 보인다 ({', '.join(it)})")


def shot(d, out, name):
    p = os.path.join(out, name + ".png")
    d.save_screenshot(p)
    print(f"  {name}  {os.path.getsize(p) // 1024}KB")


if __name__ == "__main__":
    main()
