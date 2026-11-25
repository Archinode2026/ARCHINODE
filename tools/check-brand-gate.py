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
SCRIPT_SRC = re.compile(r'<script[^>]+src="([^"]+)"', re.I)


def strip_comments(s):
    return HTML_COMMENT.sub('', s)


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
    for f in html_files():
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        try:
            s = io.open(f, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        checked += 1
        srcs = scripts_of(s)
        loads_cp = any('category-products.js' in x for x in srcs)
        loads_gate = any('brand-gate.js' in x for x in srcs)
        if not loads_cp:
            # 제품 상세는 category-products.js 를 안 싣지만 문은 써야 한다
            if rel.endswith('products/view.html'):
                if not loads_gate:
                    problems.append('%s — 제품 상세인데 brand-gate.js 를 안 싣는다' % rel)
                else:
                    users += 1
            continue
        users += 1
        if not loads_gate:
            problems.append('%s — category-products.js 를 싣는데 brand-gate.js 가 없다' % rel)
            continue
        # 순서: 문이 먼저 내려와야 한다
        gi = next(i for i, x in enumerate(srcs) if 'brand-gate.js' in x)
        ci = next(i for i, x in enumerate(srcs) if 'category-products.js' in x)
        if gi > ci:
            problems.append('%s — brand-gate.js 가 category-products.js **뒤**에 있다 '
                            '(먼저 내려와야 한다)' % rel)

    # 실어 놓고 **안 쓰면** 아무 값이 없다
    for rel in ('category-products.js', 'products/view.html'):
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

    print('브랜드 문: HTML %d개를 보고, 문이 필요한 쪽 %d개를 쟀다' % (checked, users))
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
