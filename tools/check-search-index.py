#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-508 — 검색 색인이 묵지 않았는지, 공개 페이지를 빠뜨리지 않았는지.

왜 있는가
---------
`search-index.json` 은 **만들어 두고 커밋하는 물건**이다(`scripts/make_search_index.py`).
그래서 페이지를 고치고 스크립트를 다시 돌리지 않으면 **조용히 묵는다** —
검색 결과만 옛 글자를 말하고, 아무도 틀렸다고 말해 주지 않는다.
A-406 의 교훈 그대로다: **부르지 않는 것은 틀린 채로 썩는다.**

그리고 들어갈 페이지 목록이 스크립트 안에 **손으로 적혀** 있었다. 그 목록이
사이트맵보다 뒤처져 `sourcing-inquiry`·`categories`·`terms`·`privacy`·
`brand-guide`·`submit-trend` 여섯 쪽이 색인에 아예 없었다(브론즈 34차 N34-2).
손님이 「소싱 문의」를 쳐도 안 나온다.

무엇을 보는가
-------------
  1. 묵음 — 지금 HTML 로 다시 만든 색인이 커밋된 파일과 **한 글자까지** 같은지
  2. 빠짐 — 사이트맵의 뿌리 페이지가 전부 색인에 있는지(일부러 뺀 쪽만 예외)
  3. 언어 — `name_en` 에 한글이 남았는지. 단, 페이지 자체가 한 언어로만 쓰인
     쪽은 면제다 — 내용이 한국어인데 이름만 영어로 적는 것은 거짓말이다
  4. 허수 방지 — 항목이 200개 밑이면 검사가 멈춘 것으로 본다

    python3 tools/check-search-index.py
"""
from __future__ import annotations
import importlib.util
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KO = re.compile(r'[가-힣]')
MIN_ITEMS = 200


def load_builder():
    path = os.path.join(ROOT, 'scripts', 'make_search_index.py')
    spec = importlib.util.spec_from_file_location('make_search_index', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    bad = []
    mod = load_builder()
    if not hasattr(mod, 'build_items') or not hasattr(mod, 'serialize'):
        print('make_search_index.py 에 build_items/serialize 가 없다 — 검사기를 손봐야 한다')
        return 2

    cur_path = os.path.join(ROOT, 'search-index.json')
    cur_text = io.open(cur_path, encoding='utf-8').read()
    items = mod.build_items(quiet=True)
    fresh_text = mod.serialize(items)

    # 1) 묵음
    if cur_text != fresh_text:
        try:
            a = json.loads(cur_text)
            b = json.loads(fresh_text)
            byurl_a = {x['url']: x for x in a}
            byurl_b = {x['url']: x for x in b}
            gone = sorted(set(byurl_a) - set(byurl_b))
            new = sorted(set(byurl_b) - set(byurl_a))
            changed = [u for u in set(byurl_a) & set(byurl_b) if byurl_a[u] != byurl_b[u]]
            why = []
            if new: why.append('들어와야 할 항목 %d개(예: %s)' % (len(new), new[0]))
            if gone: why.append('빠져야 할 항목 %d개(예: %s)' % (len(gone), gone[0]))
            if changed: why.append('내용이 달라진 항목 %d개(예: %s)' % (len(changed), sorted(changed)[0]))
            detail = ' · '.join(why) or '줄바꿈·정렬만 다르다'
        except Exception:
            detail = 'JSON 으로 읽히지 않는다'
        bad.append(('search-index.json',
                    '커밋된 색인이 지금 HTML 과 다르다 — %s. '
                    '`python3 scripts/make_search_index.py` 를 돌려라' % detail))

    # 2) 빠짐 — 사이트맵이 정본이다
    sm_path = os.path.join(ROOT, 'sitemap.xml')
    if os.path.exists(sm_path):
        urls = re.findall(r'<loc>([^<]+)</loc>', io.open(sm_path, encoding='utf-8').read())
        roots = set()
        for u in urls:
            rel = re.sub(r'^https?://[^/]+/', '', u).strip() or 'index.html'
            if '/' not in rel:
                roots.add(rel)
        have = {x['url'] for x in items}
        exclude = getattr(mod, 'PAGE_EXCLUDE', set())
        for u in sorted(roots - have - set(exclude)):
            bad.append((u, '사이트맵에는 있는데 검색 색인에 없다 — 손님이 쳐도 안 나온다'))
    else:
        bad.append(('sitemap.xml', '없다 — 공개 페이지 목록의 정본이다'))

    # 3) 언어 — 두 언어 원본이 있는데 영어 칸에 한글이 남았나
    exempt = 0
    for it in items:
        en, ko = it.get('name_en', ''), it.get('name_ko', '')
        if not KO.search(en):
            continue
        src = os.path.join(ROOT, it['url'].replace('/', os.sep))
        html = io.open(src, encoding='utf-8', errors='replace').read() if os.path.exists(src) else ''
        has_en_src = bool(re.search(r'<h1[^>]*data-en(?:-html)?\s*=\s*"[^"]+"', html)) \
            or bool(re.search(r'<title[^>]*data-en\s*=\s*"[^"]+"', html))
        if has_en_src:
            bad.append((it['url'], '영문 이름 원본이 페이지에 있는데 색인의 name_en 이 한글이다'))
        else:
            exempt += 1

    # 4) 허수 방지
    if len(items) < MIN_ITEMS:
        bad.append(('(검사 자체)', '색인 항목을 %d개만 만들었다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (len(items), MIN_ITEMS)))

    if bad:
        print('어긋남 %d건' % len(bad))
        for u, why in bad[:40]:
            print('  · %-46s %s' % (u, why))
        return 1

    print('검색 색인 — 항목 %d개, 묵지 않았고 사이트맵의 뿌리 페이지를 다 담았다'
          '%s' % (len(items), (' (한 언어로만 쓰인 %d쪽은 면제)' % exempt) if exempt else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
