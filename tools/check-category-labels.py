#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""카테고리·하위 카테고리 이름의 **사본들이 정본과 맞는지** 본다 (A-407).

    python3 tools/check-category-labels.py      → 어긋나면 종료 코드 1

정본은 페이지다
---------------
카테고리 이름의 정본은 **그 페이지의 `<h1 data-en data-ko>`** 다
(상위 10개 · 하위 67개 슬러그). 그런데 같은 내용을 **세 곳이 따로** 들고 있다:

  · `brands/view.html`          CAT_KO            (상위 10)
  · `products/view.html`        CAT_KO · SUBCAT   (상위 10 · 하위 67)
  · `brand-portal/dashboard.html` SUBCATEGORIES   (카테고리별 하위 목록)

사본을 셋 만든 것이 좋은 설계는 아니다. 한 파일로 합치는 것이 맞지만
그건 세 화면을 같이 손대는 일이라 승리님 판단이 필요하다(대장 A-407).
**합치기 전까지는 어긋남을 검사가 잡는다** — 사본이 조용히 갈라지는 것이
A-348·A-367·A-393 에서 반복된 바로 그 실패다.

이름을 바꿀 때
--------------
페이지의 `<h1>` 을 바꾸고 이 검사를 돌려라. 어긋난 사본을 알려 준다.
"""
from __future__ import annotations
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── A-409: 결정 대기 ──────────────────────────────────────────────────────────
# 브랜드 포털의 하위 카테고리 한국어 이름 **23개가 공개 사이트와 다르다.**
# 오타가 아니라 **같은 것을 두 곳에서 다르게 번역한 것**이다 —
# 「음향 솔루션」 vs 「방음 솔루션」 · 「벽지」 vs 「벽면 마감」 ·
# 「욕실 수전」 vs 「수전」 · 「원목 마루」 vs 「목재 바닥」 …
#
# 어느 쪽이 맞는지는 **원고 결정**이라 내가 고르지 않는다(대장 A-409).
# 그래서 지금 어긋나는 23개는 **통과시키되 보류로 알린다** — 그러면
# **새로 생기는 어긋남만** 실패로 잡힌다. 결정이 나면 한쪽을 고치고
# 이 목록에서 지운다.
PENDING_PORTAL = ['acoustic-solutions', 'art-wall-decor', 'bathroom-taps', 'countertops', 'decorative-panels', 'desks-workstations', 'fire-pits-heaters', 'meeting-conference', 'metal-finishes', 'office-chairs', 'office-storage', 'outdoor-kitchens', 'planters-pots', 'pools-whirlpools', 'spa-hot-tubs', 'tables-desks', 'tableware', 'vases-planters', 'wall-lights', 'wallcoverings', 'washbasins-vanities', 'windows-doors', 'wood-flooring']



def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8', errors='replace').read()


def truth():
    """정본 — 카테고리 페이지의 두 언어 h1."""
    cats, subs = {}, {}
    cdir = os.path.join(ROOT, 'categories')
    for name in sorted(os.listdir(cdir)):
        p = os.path.join(cdir, name)
        if name.endswith('.html'):
            s = io.open(p, encoding='utf-8', errors='replace').read()
            m = re.search(r'<h1[^>]*data-en="([^"]*)"[^>]*data-ko="([^"]*)"', s)
            if m:
                cats[m.group(1)] = m.group(2)
        elif os.path.isdir(p):
            for sub in sorted(os.listdir(p)):
                if not sub.endswith('.html'):
                    continue
                s = io.open(os.path.join(p, sub), encoding='utf-8', errors='replace').read()
                m = re.search(r'<h1[^>]*data-en="([^"]*)"[^>]*data-ko="([^"]*)"', s)
                if m:
                    slug = sub[:-5]
                    prev = subs.get(slug)
                    if prev and prev != (m.group(1), m.group(2)):
                        # 같은 슬러그가 두 부모 아래 있는데 라벨이 다르면 정본 자체가 갈렸다
                        subs[slug] = ('__갈림__', '__갈림__')
                    else:
                        subs[slug] = (m.group(1), m.group(2))
    return cats, subs


def parse_cat_ko(src, label):
    """'Furniture': '가구' 꼴을 읽는다."""
    m = re.search(r'const CAT_KO = \{(.*?)\n\s*\};', src, re.S)
    if not m:
        return None
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']*)'", m.group(1)))


def parse_subcat_pairs(src):
    """'slug': ['En', '한글'] 꼴을 읽는다 (products/view.html)."""
    m = re.search(r'const SUBCAT = \{(.*?)\n\s*\};', src, re.S)
    if not m:
        return None
    return {k: (a, b) for k, a, b in
            re.findall(r"'([^']+)'\s*:\s*\['([^']*)',\s*'([^']*)'\]", m.group(1))}


def parse_portal(src):
    """{ slug: 'x', en: 'X', ko: '한글' } 꼴을 읽는다 (brand-portal)."""
    m = re.search(r'const SUBCATEGORIES = \{(.*?)\n\};', src, re.S)
    if not m:
        return None
    out = {}
    for slug, en, ko in re.findall(
            r"\{\s*slug:\s*'([^']+)',\s*en:\s*'([^']*)',\s*ko:\s*'([^']*)'\s*\}", m.group(1)):
        out[slug] = (en, ko)
    return out


def compare(name, copy, tru, kind):
    """사본과 정본을 맞춰 본다. 사본에 없는 것은 넘어간다 — 사본이 일부만 담는 것은 정상."""
    bad = []
    for k, v in sorted(copy.items()):
        if k not in tru:
            bad.append('%s: 정본에 없는 항목 「%s」' % (name, k))
            continue
        if tru[k] == ('__갈림__', '__갈림__'):
            bad.append('%s: 정본이 갈려 있다 「%s」 — 같은 슬러그가 두 부모 아래 다른 이름이다' % (name, k))
            continue
        if v != tru[k]:
            bad.append('%s: 「%s」 사본 %r ≠ 정본 %r' % (name, k, v, tru[k]))
    missing = [k for k in tru if k not in copy]
    return bad, missing


def main():
    cats, subs = truth()
    print('정본 — 상위 %d개 · 하위 %d개 (카테고리 페이지의 두 언어 h1)' % (len(cats), len(subs)))
    split = [k for k, v in subs.items() if v == ('__갈림__', '__갈림__')]
    if split:
        print('  ⚠ 같은 슬러그가 두 부모 아래 다른 이름: %s' % ', '.join(split))

    problems = []

    src = read('brands/view.html')
    if src:
        c = parse_cat_ko(src, 'brands/view.html')
        if c is None:
            problems.append('brands/view.html: CAT_KO 를 읽지 못했다 — 모양이 바뀌었나')
        else:
            bad, miss = compare('brands/view.html CAT_KO', c, cats, '상위')
            problems += bad
            print('검사함  brands/view.html CAT_KO — %d개 (정본과 어긋남 %d)' % (len(c), len(bad)))

    src = read('products/view.html')
    if src:
        c = parse_cat_ko(src, 'products/view.html')
        sc = parse_subcat_pairs(src)
        if c is None or sc is None:
            problems.append('products/view.html: CAT_KO 또는 SUBCAT 를 읽지 못했다 — 모양이 바뀌었나')
        else:
            b1, m1 = compare('products/view.html CAT_KO', c, cats, '상위')
            b2, m2 = compare('products/view.html SUBCAT',
                             {k: v for k, v in sc.items()}, subs, '하위')
            problems += b1 + b2
            print('검사함  products/view.html CAT_KO %d개 · SUBCAT %d개 (어긋남 %d)'
                  % (len(c), len(sc), len(b1) + len(b2)))
            if m2:
                print('        (정본에만 있는 하위 %d개 — 사본에 없어도 모르는 값은 영어로 보여 준다)' % len(m2))

    src = read('brand-portal/dashboard.html')
    if src:
        pc = parse_portal(src)
        if pc is None:
            problems.append('brand-portal/dashboard.html: SUBCATEGORIES 를 읽지 못했다 — 모양이 바뀌었나')
        else:
            bad, miss = compare('brand-portal SUBCATEGORIES', pc, subs, '하위')
            held = [b for b in bad if any('「%s」' % k in b for k in PENDING_PORTAL)]
            bad = [b for b in bad if b not in held]
            problems += bad
            print('검사함  brand-portal SUBCATEGORIES — %d개 (어긋남 %d · 결정 대기 %d)'
                  % (len(pc), len(bad), len(held)))
            if held:
                print('보류    공개 사이트와 한국어 이름이 다른 %d개는 **원고 결정 대기**다 (A-409)' % len(held))
                for b in held[:4]:
                    print('          %s' % b.split(': ', 1)[1])
                if len(held) > 4:
                    print('          … 그리고 %d개 더. 전부 보려면 PENDING_PORTAL 을 비우고 돌려라' % (len(held) - 4))

    print('')
    if problems:
        for p in problems:
            print('어긋남  %s' % p)
        print('')
        print('정본은 카테고리 페이지의 <h1 data-en data-ko> 다. 사본을 그쪽에 맞춰라.')
        return 1
    print('카테고리 이름 사본 검사 — 어긋난 것 없음')
    return 0


if __name__ == '__main__':
    sys.exit(main())
