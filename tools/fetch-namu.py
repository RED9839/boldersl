# -*- coding: utf-8 -*-
"""사도마다 나무위키 문서를 받아 글자만 남겨 둔다 — 스킬 재구성을 할 때 읽는 자료.

  python tools/fetch-namu.py            없는 것만 받는다
  python tools/fetch-namu.py --all      다시 받는다
  python tools/fetch-namu.py 네르 티그   몇 명만

나온 것: .omc/research/namu/<키>.txt  (전문) · <키>.skill.txt (인게임 정보 — 스킬·어사이드·애착 아티팩트)
나무위키는 CC BY-NC-SA 2.0 KR 이다. 여기 받은 글은 읽는 자료이고, 기획서에는 우리 말로 다시 쓴다.
이격(에르핀(왕도) 따위)은 제 문서가 있으면 그것을, 없으면 기본 사도 문서를 읽는다.
"""
import html, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".omc", "research", "namu")
os.makedirs(OUT, exist_ok=True)

def heroes():
    js = "import('file:///' + process.argv[1].replace(/\\\\/g,'/')).then(m=>{const h=(m.default||m).heroes;console.log(JSON.stringify(Object.fromEntries(Object.entries(h).map(([k,v])=>[k,v.ko]))))})"
    out = subprocess.run(["node", "-e", js, os.path.join(ROOT, "js", "data", "design.js")], capture_output=True, text=True, encoding="utf-8").stdout
    return json.loads(out)

def get(title):
    u = "https://namu.wiki/w/" + urllib.parse.quote(title)
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    s = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S)
    s = re.sub(r"<(br|/p|/div|/h\d|/li|/tr|/td|/th)[^>]*>", "\n", s)
    t = html.unescape(re.sub(r"<[^>]+>", " ", s))
    t = "\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n"))
    return "\n".join(l for l in t.split("\n") if l)

def skill_part(t):
    # 「N. 인게임 정보 [편집]」 부터 그다음 같은 깊이 머리까지
    m = re.search(r"^(\d+)\. 인게임 정보 \[편집\]$", t, flags=re.M)
    if not m: return ""
    n = int(m.group(1))
    end = re.search(rf"^{n + 1}\. .+ \[편집\]$", t[m.end():], flags=re.M)
    return t[m.start(): m.end() + (end.start() if end else len(t) - m.end())]

# 문서 이름은 분류 문서의 링크에서 그대로 가져온다 — 「엘레나」 는 동음이의어 문서라서
# 이름만으로 찾으면 엉뚱한 곳에 간다(실제로 여섯 명이 그랬다). 이격은 하위 문서다(에르핀/왕도).
CATEGORY = "분류:트릭컬 리바이브/캐릭터"
_known = None
def known():
    global _known
    if _known is None:
        u = "https://namu.wiki/w/" + urllib.parse.quote(CATEGORY)
        s = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read().decode("utf-8", "ignore")
        _known = set(t for t in re.findall(r"title='([^']+)'", s) if not t.startswith("분류:"))
    return _known

def titles(key, ko):
    m = re.match(r"^(.+?)\((.+)\)$", ko)
    base, var = (m.group(1), m.group(2)) if m else (ko, None)
    cands = []
    if var: cands += [f"{base}(트릭컬 리바이브)/{var}", f"{base}/{var}"]
    cands += [f"{base}(트릭컬 리바이브)", base]
    k = known()
    hit = [c for c in cands if c in k]
    for c in hit: yield c
    if not hit: yield from cands

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    again = "--all" in sys.argv
    hs = heroes()
    todo = {k: v for k, v in hs.items() if (not args or v in args or k in args)}
    got = miss = 0
    for key, ko in todo.items():
        path = os.path.join(OUT, key + ".txt")
        if os.path.exists(path) and not again: continue
        for title in titles(key, ko):
            try:
                t = get(title)
            except Exception as e:
                print(f"  {ko} — 「{title}」 {e}")
                time.sleep(1.0)
                continue
            if "트릭컬" not in t[:4000] or ("동음이의어" in t[:3000] and "인게임 정보" not in t):
                print(f"  {ko} — 「{title}」 는 다른 문서다")
                continue
            open(path, "w", encoding="utf-8").write(f"# 출처: 나무위키 「{title}」 (CC BY-NC-SA 2.0 KR)\n" + t)
            sk = skill_part(t)
            open(os.path.join(OUT, key + ".skill.txt"), "w", encoding="utf-8").write(sk)
            print(f"  {ko} ← 「{title}」 {len(t)//1000}k · 인게임 {len(sk)//1000}k")
            got += 1
            break
        else:
            miss += 1
        time.sleep(1.2)
    print(f"받음 {got} · 못 받음 {miss} · 전체 {len(hs)}")

main()
