#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-672 — 매거진 태그가 **두 곳에서 갈라지지 않는지** 본다.

같은 태그가 두 자리에 산다:
  · 기사 쪽 `magazine/<글>.html` 의 `class="tag"`
  · 목록 쪽 `magazine.html` 의 `class="article-card-tag"`(또는 `featured-tag`)
사본을 둘 만든 것이 좋은 설계는 아니지만, 지금 구조가 그렇다. 사본이 **조용히
갈라지는 것**이 A-348·A-367·A-393·A-409 에서 반복된 바로 그 실패다.

네 가지를 본다
--------------
① 기사와 카드의 태그가 **쌍으로 같은가**
② 영문 하나에 **국문이 둘 이상** 붙지 않았나
③ 국문 하나에 **영문이 둘 이상** 붙지 않았나
④ 기사 끝 메타의 「카테고리: X」 가 태그와 같은가 — 2026-11-24 에 **130편 중
   91편**이 한국어 화면에서 영문 이름을 보여 주고 있었다
⑤ 태그 성격에 맞는 **문(mg-door)** 이 달렸는가 (A-673). 안 달기로 한 39편에
   문이 생기는 것도 잡는다 — 그건 결정이지 실수가 아니다
⑥ 태그의 **보이는 글자**가 국문인가 (A-678) — 103편이 영문 폴백이었다
⑦ 문이 가리키는 **파일이 실제로 있는가** (A-678)
⑧ 문의 `?topic=` 이 `request-consultation.html` 의 **허용 옵션**인가 (A-678)

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

    # ④ 기사 끝 메타의 「카테고리: X」 가 태그와 같은가
    #    2026-11-24: **130편 중 91편**이 한국어 화면에서 영문 이름을 보여 주고 있었다
    #    — 「카테고리: Sustainability · 작성: ARCHINODE 편집국」. 태그에는 국문이
    #    제대로 있는데 메타만 영문이었다. 같은 사실이 한 쪽에 두 번 적히면 한쪽이
    #    낡는다. 태그를 정본으로 본다.
    for f, v in sorted(art.items()):
        if not v: continue
        en, ko, _ = v
        s2 = strip_comments(read(os.path.join(ROOT, 'magazine', f)))
        m = re.search(r'class="article-meta-foot">\s*<span data-en="([^"]*)"\s+data-ko="([^"]*)"', s2)
        if not m:
            probs.append('기사 끝 메타를 못 읽었다: %s' % f); continue
        cen = re.search(r'Category:\s*([^·&]+)', m.group(1))
        cko = re.search(r'카테고리:\s*([^·&]+)', m.group(2))
        cen = cen.group(1).strip() if cen else ''
        cko = cko.group(1).strip() if cko else ''
        if cen != en:
            probs.append('메타 영문 카테고리가 태그와 다르다: %s — 태그 %s 대 메타 %s' % (f, en, cen))
        if cko != ko:
            probs.append('메타 국문 카테고리가 태그와 다르다: %s — 태그 %s 대 메타 %s' % (f, ko, cko))

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

    # ⑤ 문(mg-door) — A-673
    #    태그 성격별로 문 하나. 달기로 한 태그에 문이 없으면 잡고, **안 달기로 한
    #    태그에 문이 생기면** 그것도 잡는다. 39편(문화·디자인 등)에 문을 안 단 것은
    #    실수가 아니라 결정이다 — 그 결정이 조용히 뒤집히지 않게 한다.
    DOOR_TAGS = {
        'A': {'Materials', 'Finishes', 'Furniture', 'Interior'},
        'B': {'Policy', 'Construction', 'Safety', 'Technology', 'Sustainability'},
        'C': {'Market', 'Industry', 'Global', 'Trend', 'Urban'},
    }
    NO_DOOR = {'Culture', 'Design', 'Lifestyle', 'Project', 'Architecture', 'Award'}
    want = {}
    for k, ts in DOOR_TAGS.items():
        for t in ts:
            want[t] = k
    for f, v in sorted(art.items()):
        if not v:
            continue
        en = v[0]
        s2 = strip_comments(read(os.path.join(ROOT, 'magazine', f)))
        m = re.search(r'<aside class="mg-door"[^>]*data-door="([A-C])"[\s\S]*?</aside>', s2)
        if en in NO_DOOR:
            if m:
                probs.append('문을 달지 않기로 한 태그에 문이 있다: %s (태그 %s)' % (f, en))
            continue
        if en not in want:
            probs.append('문 매핑에 없는 태그다: %s — %s (검사기의 DOOR_TAGS 와 NO_DOOR 에 넣어라)' % (f, en))
            continue
        if not m:
            probs.append('문이 없다: %s (태그 %s → 문 %s)' % (f, en, want[en]))
            continue
        if m.group(1) != want[en]:
            probs.append('문 종류가 태그와 안 맞는다: %s — 태그 %s 는 문 %s 인데 문 %s 가 붙었다'
                         % (f, en, want[en], m.group(1)))
        blk = m.group(0)
        a = re.search(r'<a[^>]*class="mg-door-cta"[^>]*>([^<]*)</a>', blk)
        if not a:
            probs.append('문에 링크가 없다: %s' % f); continue
        atag = a.group(0)
        for need in ('data-ko-href', 'data-en-href', 'data-en=', 'data-ko='):
            if need not in atag:
                probs.append('문 링크에 %s 가 없다: %s — 한쪽만 적으면 토글해 돌아올 때 주소가 안 돌아온다' % (need, f))
        ko = re.search(r'data-ko="([^"]*)"', atag)
        if ko and a.group(1).strip() != ko.group(1):
            probs.append('문 링크의 보이는 글자가 국문 속성과 다르다: %s — 이 쪽은 lang="ko" 다' % f)
        kh = re.search(r'data-ko-href="([^"]*)"', atag)
        h = re.search(r'\shref="([^"]*)"', atag)
        if kh and h and kh.group(1) != h.group(1):
            probs.append('문 링크의 기본 href 가 국문 주소와 다르다: %s — 첫 그림에서 엉뚱한 데로 간다' % f)

    # ⑥ 태그의 **보이는 글자**도 국문이어야 한다 (A-678, 브론즈 55차)
    #    전에는 문 CTA 에만 「이 쪽은 lang="ko" 다」를 강제했고 class="tag" 는
    #    두 속성 중 하나면 통과시켰다 — 그래서 **130편 중 103편이 영문 폴백**인
    #    채로 통과했다. `lang.js` 가 DOMContentLoaded 에 다시 칠하므로 평소에는
    #    안 보이지만, **JS 가 실패하면 그 글자가 남는다.** 같은 쪽·같은 lang 인데
    #    한쪽만 강제하는 것은 기준을 반만 적용하는 것이다. 103편을 국문으로 맞췄다.
    for f, v in sorted(art.items()):
        if not v: continue
        en, ko, vis = v
        if vis and ko and vis != ko:
            probs.append('태그의 보이는 글자가 국문이 아니다: %s — 「%s」 (국문 「%s」) · 이 쪽은 lang="ko" 다' % (f, vis, ko))

    # ⑦ 문이 가리키는 **파일이 실제로 있는가** (A-678, 브론즈 55차)
    #    전에는 주소를 없는 파일로 바꿔도 통과했다. 손으로 세 파일을 확인했을
    #    뿐이고, 검사가 그걸 지키지 않았다.
    ALLOWED_TOPICS = None
    rc = os.path.join(ROOT, 'request-consultation.html')
    if os.path.exists(rc):
        s3 = read(rc)
        m3 = re.search(r'id="category"[\s\S]*?</select>', s3)
        if m3:
            ALLOWED_TOPICS = set(v for v in re.findall(r'<option[^>]*value="([^"]*)"', m3.group(0)) if v)
    for f, v in sorted(art.items()):
        if not v: continue
        s2 = strip_comments(read(os.path.join(ROOT, 'magazine', f)))
        m = re.search(r'<a[^>]*class="mg-door-cta"[^>]*>', s2)
        if not m: continue
        for attr in ('href', 'data-ko-href', 'data-en-href'):
            mm = re.search(r'(?:^|\s)' + attr + r'="([^"]*)"', m.group(0))
            if not mm: continue
            url = mm.group(1)
            path, _, query = url.partition('?')
            # 기사는 magazine/ 안에 있으므로 ../ 로 시작해야 한다
            target = os.path.normpath(os.path.join(ROOT, 'magazine', path))
            if not os.path.exists(target):
                probs.append('문의 %s 가 없는 파일을 가리킨다: %s → %s' % (attr, f, url))
                continue
            # ⑧ ?topic= 값이 request-consultation 의 허용 옵션인가
            if query and ALLOWED_TOPICS is not None:
                for kv in query.split('&'):
                    k, _, val = kv.partition('=')
                    if k == 'topic' and val not in ALLOWED_TOPICS:
                        probs.append('문의 ?topic= 가 허용 옵션이 아니다: %s → %s (허용: %s)'
                                     % (f, val, ' · '.join(sorted(ALLOWED_TOPICS))))

    print('매거진 태그·문 검사 (A-672 · A-673 · A-678)')
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
