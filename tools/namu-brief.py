# -*- coding: utf-8 -*-
"""받아 둔 나무위키 글(.omc/research/namu/<키>.txt)을 스킬 재구성에 쓸 만큼만 추린다.

  python tools/namu-brief.py            135명 전부
  python tools/namu-brief.py 네르

나온 것: .omc/research/namu/<키>.brief.md
  - 스킬(저학년 · 애착 아티팩트 저학년 · 고학년 · 일반 공격) — 수치는 가장 높은 레벨 것만
  - 어사이드(패시브 셋)
  - 문서의 「특징」「성격」「평가」 같은 절 — 앞부분만
나무위키는 CC BY-NC-SA 2.0 KR 이다. 읽는 자료이고, 기획서에는 우리 말로 다시 쓴다.
"""
import os, re, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, ".omc", "research", "namu")

HEAD = re.compile(r"^(\d+(?:\.\d+)*)\. (.+?) \[편집\]$", re.M)

def sections(t):
    hs = list(HEAD.finditer(t))
    out = []
    for i, m in enumerate(hs):
        end = hs[i + 1].start() if i + 1 < len(hs) else len(t)
        out.append((m.group(1), m.group(2), t[m.end():end].strip()))
    return out

def squeeze_levels(body):
    """Lv.1 … Lv.10 … Lv.13 블록 가운데 마지막 것만 남긴다."""
    lines = body.split("\n")
    out, i = [], 0
    while i < len(lines):
        l = lines[i]
        if re.match(r"^Lv\.\s*\d+", l):
            # 연속된 레벨 블록을 모아 마지막 것만
            blocks, cur = [], []
            while i < len(lines) and not re.match(r"^(저학년|고학년|애착 아티팩트|일반 공격|기본$|강화$|재사용)", lines[i]):
                if re.match(r"^Lv\.\s*\d+", lines[i]) and cur:
                    blocks.append(cur); cur = []
                cur.append(lines[i]); i += 1
            if cur: blocks.append(cur)
            last = blocks[-1]
            out.append("(최고 레벨) " + " · ".join(x for x in last[1:] if x and not x.startswith("[")))
            continue
        out.append(l); i += 1
    return "\n".join(out)

def clip(s, n):
    s = re.sub(r"\n{2,}", "\n", s)
    return s if len(s) <= n else s[:n] + " …(줄임)"

def brief(key):
    full = os.path.join(DIR, key + ".txt")
    if not os.path.exists(full): return None
    t = open(full, encoding="utf-8").read()
    src = t.split("\n", 1)[0]
    secs = sections(t)
    out = [f"# {key} — 나무위키 요약", src.lstrip("# "), ""]
    for num, title, body in secs:
        if title in ("스킬",):
            out += ["## 스킬 (원작)", clip(squeeze_levels(body), 3500), ""]
        elif title == "어사이드":
            b = re.split(r"\n어사이드 스토리", body)[0]
            b = re.sub(r"\n(사도 전체 능력치[\s\S]*)$", "", b)
            out += ["## 어사이드 (원작 패시브)", clip(b, 1800), ""]
    for num, title, body in secs:
        if re.search(r"특징|성격|평가|성능|장점|단점|운용|개요", title) and not re.search(r"테마|스토리|대사|사복|모험회|연회장", title):
            out += [f"## {title}", clip(body, 1600), ""]
    return "\n".join(out)

def main():
    args = sys.argv[1:]
    keys = [f[:-4] for f in os.listdir(DIR) if f.endswith(".txt") and not f.endswith(".skill.txt") and not f.startswith("_")]
    if args: keys = [k for k in keys if k in args]
    n = 0
    for k in sorted(keys):
        b = brief(k)
        if not b: continue
        open(os.path.join(DIR, k + ".brief.md"), "w", encoding="utf-8").write(b)
        n += 1
    print(f"요약 {n}명 → .omc/research/namu/*.brief.md")

main()
