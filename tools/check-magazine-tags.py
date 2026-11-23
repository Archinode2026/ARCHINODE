#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-672 — 매거진 태그가 **두 곳에서 갈라지지 않는지** 본다.

같은 태그가 두 자리에 산다:
  · 기사 쪽 `magazine/<글>.html` 의 `class="tag"`
  · 목록 쪽 `magazine.html` 의 `class="article-card-tag"`(또는 `featured-tag`)
사본을 둘 만든 것이 좋은 설계는 아니지만, 지금 구조가 그렇다. 사본이 **조용히
갈라지는 것**이 A-348·A-367·A-393·A-409 에서 반복된 바로 그 실패다.

세 가지를 본다
--------------
① 기사와 카드의 태그가 **쌍으로 같은가**
② 영문 하나에 **국문이 둘 이상** 붙지 않았나
③ 국문 하나에 **영문이 둘 이상** 붙지 않았나

②③ 은 2026-11-24 에 실제로 어긋나 있었다 — `Industry` 에 국문이 셋(산업·업계·
업계 동향), `자재` 에 영문이 셋(Materials·Material·Finishes), `Trend`/`Trends`,
`Sustainability` 에 둘(지속가능성·지속가능), `건축` 에 둘(Architecture·Construction).
12편을 정본으로 맞췄다.

태그를 바꿀 때
--------------
**기사 쪽과 목록 쪽을 함께** 고치고 이 검사를 돌려라. 보이는 글자도 같이 고쳐야
한다(`data-en`/`data-ko` 만 고치면 토글 전까지 옛 글자가 보인다).
"""
from __future__ import annotations
import io, os, re, sys, glob
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(p):
    return io.open(p, encoding='utf-8', errors='replace').read()

def strip_comments(s):
    return re.sub(r'<!--[\s\S]*?-->', '', s)

def attrs(tag):
    en = re.search(r'data-en="([^"]*)"', tag)
    ko = re.search(r'data-ko="([^"]*)"', tag)
    return (en.group(1) if en else ''), (ko.group(1) if ko else '')

def article_tags():
    out = {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'magazine', '*.html'))):
        base = os.path.basename(p)
        if base == 'view.html':      # 틀 쪽 — 정적 태그가 없는 것이 맞다
            continue
        s = strip_comments(read(p))
        m = re.search(r'(<[^>]*class="tag"[^>]*>)([^<]*)(?=</)', s)
        if not m:
            out[base] = None
            continue
        en, ko = attrs(m.group(1))
        out[base] = (en, ko, m.group(2).strip())
    return out

def card_tags():
    s = strip_comments(read(os.path.join(ROOT, 'magazine.html')))
    starts = [(m.start(), m.group(1))
              for m in re.finditer(r'<a[^>]*href="magazine/([^"#?]+\.html)"', s)]
    out = {}
    for i, (pos, f) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(s)
        blk = s[pos:end]
        m = re.search(r'(<[^>]*class="(?:article-card-tag|featured-tag)"[^>]*>)([^<]*)(?=</)', blk)
        if not m:
            out.setdefault(f, None)
            continue
        en, ko = attrs(m.group(1))
        out.setdefault(f, (en, ko, m.group(2).strip()))
    return out

def main():
    art, card = article_tags(), card_tags()
    probs = []

    # ① 쌍으로 같은가
    for f in sorted(set(art) | set(card)):
        a, c = art.get(f), card.get(f)
        if a is None:
            probs.append('기사에 태그가 없다: magazine/%s' % f); continue
        if f not in card:
            probs.append('목록에 카드가 없다: magazine/%s' % f); continue
        if c is None:
            probs.append('카드에 태그가 없다: magazine/%s' % f); continue
        if (a[0], a[1]) != (c[0], c[1]):
            probs.append('기사와 카드가 다르다: %s — 기사 %s/%s 대 카드 %s/%s' % (f, a[0], a[1], c[0], c[1]))

    # 보이는 글자가 두 속성 중 하나와 같아야 한다
    for src, name in ((art, '기사'), (card, '목록')):
        for f, v in sorted(src.items()):
            if not v: continue
            en, ko, vis = v
            if vis and vis not in (en, ko):
                probs.append('%s 보이는 글자가 두 언어 어느 쪽도 아니다: %s — 「%s」' % (name, f, vis))

    # ②③ 하나에 하나인가
    en2ko, ko2en = defaultdict(set), defaultdict(set)
    for f, v in art.items():
        if not v: continue
        en2ko[v[0]].add(v[1]); ko2en[v[1]].add(v[0])
    for en, kos in sorted(en2ko.items()):
        if len(kos) > 1:
            probs.append('영문 하나에 국문이 여럿: %s → %s' % (en, ' · '.join(sorted(kos))))
    for ko, ens in sorted(ko2en.items()):
        if len(ens) > 1:
            probs.append('국문 하나에 영문이 여럿: %s → %s' % (ko, ' · '.join(sorted(ens))))

    print('매거진 태그 검사 (A-672)')
    print('  기사 %d편 · 카드 %d개 · 태그 %d종' % (len(art), len(card), len(en2ko)))
    inv = defaultdict(int)
    for v in art.values():
        if v: inv[(v[0], v[1])] += 1
    for (en, ko), n in sorted(inv.items(), key=lambda x: -x[1]):
        print('     %3d편  %-18s / %s' % (n, en, ko))
    if probs:
        print('')
        for x in probs: print('  ✗ ' + x)
        print('\n어긋남 %d건' % len(probs))
        return 1
    print('매거진 태그 — 어긋남 없음')
    return 0

if __name__ == '__main__':
    sys.exit(main())
