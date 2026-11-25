#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""브랜드 문이 **모든 쪽에** 걸려 있는지 본다 — A-688.

`brand-gate.js` 는 「내려간 브랜드의 제품은 안 건다」를 정하는 한 곳이다.
그런데 그 파일을 **싣지 않은 쪽**에서는 `window.archiBrandGate` 가 없어
`category-products.js` 가 그 자리에서 터지고, 손님은 오류 화면을 본다.
쪽이 79개라 하나 빠뜨리기 쉽다 — 사람 눈으로는 못 지킨다.

이 저장소가 반복해 온 병이 바로 **사본 어긋남**이다(매거진 기사의 쪽 CSS가
72가지로 갈라진 것, A-218 처방이 다섯 사본 중 둘에 안 온 것, A-411 이
휴대폰 폭에만 온 것). 그래서 「한 곳에 두고 전부 싣기」를 검사로 묶는다.

★ **주석 안의 이름은 쓰임이 아니다.** 세기 전에 HTML 주석을 걷어낸다 —
   `auth/profile.html` 은 주석에서 `category-products.js` 를 언급할 뿐
   싣지 않는데, 걷어내지 않으면 「빠뜨렸다」고 잘못 센다. 2026-11-25 에
   이 검사기를 만들면서 내가 실제로 그렇게 셌다. 같은 함정에 일곱 번째다.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML_COMMENT = re.compile(r'<!--.*?-->', re.S)
JS_BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
JS_LINE_COMMENT = re.compile(r'(?m)^\s*//[^\n]*$')
SCRIPT_SRC = re.compile(r'<script[^>]+src="([^"]+)"', re.I)


def strip_comments(s):
    """★ A-695: HTML 주석만 걷다가 또 당했다. `auth/profile.html` 은 **JS 블록
    주석 안에서** `search.js` 를 말할 뿐인데 「검색을 싣는다」로 셌다.
    2026-11 한 달에 여덟 번째다 — 주석 걷기는 **두 꼴 다** 걷어야 한다."""
    s = HTML_COMMENT.sub('', s)
    s = JS_BLOCK_COMMENT.sub('', s)
    return JS_LINE_COMMENT.sub('', s)


def scripts_of(text):
    """실제로 싣는 스크립트의 src 목록 (주석 뺀 뒤)."""
    return SCRIPT_SRC.findall(strip_comments(text))


def html_files():
    out = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs
                   if d not in ('.git', 'node_modules', 'assets', 'docs', 'tools', 'scripts')]
        for n in names:
            if n.endswith('.html'):
                out.append(os.path.join(base, n))
    return sorted(out)


def main():
    problems = []
    gate_path = os.path.join(ROOT, 'brand-gate.js')
    if not os.path.exists(gate_path):
        print('brand-gate.js 가 없다 — 지웠나?')
        print('결과: 실패')
        return 1

    gate_src = io.open(gate_path, encoding='utf-8').read()
    for need in ('approvedBrandIds', 'keepLive', 'archiBrandGate'):
        if need not in gate_src:
            problems.append('brand-gate.js 에 `%s` 가 없다' % need)

    users, checked = 0, 0
    cp_pages, search_pages, readers = 0, 0, 0
    for f in html_files():
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        try:
            s = io.open(f, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        checked += 1
        srcs = scripts_of(s)
        loads_cp = any('category-products.js' in x for x in srcs)
        loads_search = any('search.js' in x for x in srcs)
        loads_gate = any('brand-gate.js' in x for x in srcs)
        # A-695: search.js 가 이제 문을 **필요로 한다**(제품 색인을 거른다).
        #        안 실린 쪽에서는 제품 검색 결과가 통째로 꺼진다.
        if loads_search or loads_cp:
            users += 1            # 문이 필요한 쪽 = 분류든 검색이든 제품을 보이는 쪽
        if loads_search:
            search_pages += 1
        if loads_cp:
            cp_pages += 1
        if loads_search and not loads_gate:
            problems.append('%s — search.js 를 싣는데 brand-gate.js 가 없다. '
                            '그 쪽에서는 제품 검색이 꺼진다' % rel)
        if not loads_cp:
            # 제품 상세는 category-products.js 를 안 싣지만 문은 써야 한다
            if rel.endswith('products/view.html'):
                if not loads_gate:
                    problems.append('%s — 제품 상세인데 brand-gate.js 를 안 싣는다' % rel)
                continue
            continue
        if not loads_gate:
            problems.append('%s — category-products.js 를 싣는데 brand-gate.js 가 없다' % rel)
            continue
        # 순서: 문이 먼저 내려와야 한다
        gi = next(i for i, x in enumerate(srcs) if 'brand-gate.js' in x)
        ci = next(i for i, x in enumerate(srcs) if 'category-products.js' in x)
        if gi > ci:
            problems.append('%s — brand-gate.js 가 category-products.js **뒤**에 있다 '
                            '(먼저 내려와야 한다)' % rel)

    # ★ A-695: 여기가 이 검사의 **본래 질문**이다.
    #   전에는 「문을 단 두 파일이 잘 배급됐나」만 물었다. 그래서 `search.js` 가
    #   표본 밖이었고, 내려간 브랜드의 제품이 **235쪽의 검색창**에 그대로 걸렸다.
    #   물어야 할 것은 「**제품을 공개로 그리는 자리가 전부 문을 지나는가**」다.
    #   그래서 제품을 읽는 공개 코드를 **전수로 훑어** 문을 안 부르는 것을 찾는다.
    PRODUCT_READ = re.compile(r"collection\(\s*['\"]products['\"]\s*\)")
    # 문을 안 지나도 되는 자리와 그 까닭 — 비워 두지 말고 **적어 둔다**
    GATE_EXEMPT = {
        'brands/view.html':
            '브랜드 쪽 자신이 먼저 status==approved 로 걸러진 뒤에만 제품을 읽는다',
    }
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs
                   if d not in ('.git', 'node_modules', 'assets', 'docs', 'tools',
                                'scripts', 'admin', 'brand-portal')]
        for n in sorted(names):
            if not (n.endswith('.html') or n.endswith('.js')):
                continue
            f = os.path.join(base, n)
            rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
            if rel == 'brand-gate.js':
                continue
            body = strip_comments(io.open(f, encoding='utf-8', errors='replace').read())
            if not PRODUCT_READ.search(body):
                continue
            if rel in GATE_EXEMPT:
                continue
            readers += 1
            if 'archiBrandGate' not in body:
                problems.append('%s — 제품을 공개로 읽는데 **문을 안 지난다**. '
                                '내려간 브랜드의 물건이 여기로 샌다' % rel)

    # 실어 놓고 **안 쓰면** 아무 값이 없다
    # ☆ 아는 구멍: `auth/profile.html` 은 컬렉션 이름을 **변수로** 넘긴다
    #   (`fetchSavedDocs('products', ids)` → `db.collection(collection).doc(id)`).
    #   그래서 위의 전수 훑기(글자 `collection('products')`)에 안 걸린다.
    #   지금은 아래 명단으로 묶어 두지만, **명단은 낡는다** — 같은 수법을 쓰는
    #   파일이 새로 생기면 또 샌다. 변수로 부르는 자리까지 보려면 이 검사가
    #   아니라 자료 흐름을 봐야 하고, 그건 아직 안 했다.
    for rel in ('category-products.js', 'products/view.html', 'search.js',
                'auth/profile.html'):
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            problems.append('%s 가 없다' % rel)
            continue
        t = io.open(p, encoding='utf-8', errors='replace').read()
        if 'archiBrandGate' not in t:
            problems.append('%s — 문을 싣기만 하고 **쓰지 않는다**' % rel)

    if users == 0:
        print('결과: 실패 — 문을 쓰는 쪽이 0개다. 센 것이 없으면 통과가 아니다 (A-433)')
        return 1

    print('브랜드 문: HTML %d개를 보고, 문이 필요한 쪽 %d개를 쟀다 '
          '(분류 %d · 검색 %d · 제품을 공개로 읽는 코드 %d)'
          % (checked, users, cp_pages, search_pages, readers))
    if problems:
        print('')
        for x in problems:
            print('  - ' + x)
        print('결과: 실패 — 내려간 브랜드의 제품이 새어 나갈 수 있다')
        return 1
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
