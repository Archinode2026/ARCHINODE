#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""본문 구역이 **본문을 담고 있나** (A-606, 2026-11-18)

왜 있나
------
브론즈 44차 2번. 건너뛰기 링크가 닿는 자리가 **속이 빈** `<div id="main">` 이었고
a11y-nav.js 가 그것에 `role="main"` 을 붙였다. 표지는 붙었지만 그 안이 비어서,
눈으로 못 보는 손님이 「본문으로 건너뛰기」로 들어오면 **아무것도 없는 자리에
떨어졌고**, 진짜 본문은 어느 구역에도 속하지 않은 채 바깥에 있었다.

실측(2026-11-18): 공개 쪽의 본문 안 글자 **0자**, 어느 구역에도 안 든 머리글이
매거진 **134개**·index 26개·terms 14개. 그리고 `privacy-en.html` 은 진짜
`<main>` 과 빈 표지가 겹쳐 **본문 구역이 둘**이었다(규격상 한 쪽에 하나다).

227+5쪽을 진짜 `<main>` 이 본문을 감싸도록 바꿨다. 배치는 바뀌지 않았다
(실측: 비교한 16쪽 전부 높이 동일 — body 가 보통 흐름이고, 차례에 기대는
선택자는 모두 섹션 **안**을 가리켜서 감싸도 영향이 없었다).

무엇을 보나
----------
공개 쪽마다
  ① `<main>` 이 정확히 하나인지 (둘이면 규격 위반, 없으면 표지가 없다)
  ② 그 안에 **머리글이 하나라도** 있는지 (빈 표지로 돌아가는 것을 막는다)
  ③ 속이 빈 `id="main"` 표지가 되살아나지 않았는지

    python3 tools/check-main-landmark.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', '.netlify', 'docs', 'assets'}
# 어드민·브랜드포털은 로그인 뒤 운영 도구로, 건너뛰기 링크를 두지 않았다.
# 「공개 쪽」을 이름이 아니라 **건너뛰기 링크가 있는지**로 가린다.
INTERNAL_HINT = re.compile(r'skip-link')


def blank_comments(s):
    """주석을 자리만 남겨 지운다 — 주석에 적어 둔 예시가 걸리면 잘못 읽는다
    (A-492·A-531·A-604·A-606 에서 네 번 겪었다)."""
    return re.sub(r'(?s)<!--.*?-->', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), s)


def main():
    bad = []
    checked = 0

    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in sorted(fs):
            if not f.endswith('.html'):
                continue
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, ROOT)
            raw = open(fp, encoding='utf-8', errors='replace').read()
            src = blank_comments(raw)
            if not INTERNAL_HINT.search(src):
                continue        # 운영 도구 — 이 검사의 대상이 아니다
            checked += 1

            # 본문 구역은 <main> 이 정석이지만, `<section id="main">` 처럼
            # 다른 태그가 그 일을 하고 a11y-nav.js 가 role="main" 을 붙이는 쪽도
            # 있다(order-complete.html). 실측으로 그 쪽도 본문을 담고 있었으니
            # **태그 이름이 아니라 「본문을 담은 구역이 하나 있는가」**로 본다.
            opens = list(re.finditer(r'<main\b', src))
            closes = list(re.finditer(r'</main\s*>', src))
            if len(opens) != len(closes):
                bad.append('%s: <main> %d개 / </main> %d개 — 짝이 안 맞는다'
                           % (rel, len(opens), len(closes)))
                continue
            if len(opens) > 1:
                bad.append('%s: 본문 구역이 %d개다 — 규격상 한 쪽에 하나다'
                           % (rel, len(opens)))
                continue

            if len(opens) == 1:
                inner = src[opens[0].end():closes[0].start()]
                where = '<main>'
            else:
                m2 = re.search(r'<(\w+)\s+[^>]*id="main"[^>]*>', src)
                if not m2:
                    bad.append('%s: 본문 구역이 없다 — <main> 도 id="main" 도 없다' % rel)
                    continue
                if m2.group(1).lower() == 'div' and re.search(
                        r'<div\s+[^>]*id="main"[^>]*>\s*</div>', src):
                    bad.append('%s: 속이 빈 id="main" 표지가 되살아났다 (A-606)' % rel)
                    continue
                inner = src[m2.end():]
                where = '<%s id="main">' % m2.group(1)

            if not re.search(r'<h[1-6]\b', inner):
                # 머리글을 JS 가 채우는 쪽이 있다(magazine/view.html 의 기사 제목).
                # 그런 자리는 **그릇의 id 를 스크립트가 쓰고 있는지**로 가린다.
                ids = re.findall(r'id="([^"]+)"', inner[:4000])

                def filled(x):
                    # 직접 채우는 꼴
                    if re.search(r'%s[^;\n]{0,80}\.(innerHTML|textContent|insertAdjacentHTML)'
                                 % re.escape(x), src):
                        return True
                    # ★ 변수로 받아 두고 채우는 꼴 — magazine/view.html 이 그렇다
                    #   (`const contentDiv = document.getElementById('articleContent')`
                    #    다음에 `contentDiv.innerHTML = ...`). 아이디만 찾으면 놓친다.
                    for vm in re.finditer(
                            r'(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\('
                            r'[\'"]%s[\'"]\)' % re.escape(x), src):
                        v = vm.group(1)
                        if re.search(r'\b%s\b[^;\n]{0,80}\.(innerHTML|textContent|'
                                     r'insertAdjacentHTML)' % re.escape(v), src):
                            return True
                    return False

                js_filled = any(filled(x) for x in ids)
                if not js_filled:
                    bad.append('%s: %s 안에 머리글이 없고 JS 가 채우는 그릇도 아니다 '
                               '— 속이 빈 표지로 돌아간 것이다 (A-606)' % (rel, where))

    if bad:
        print('본문 구역: 어긋난 곳 %d' % len(bad))
        for b in bad:
            print('  - ' + b)
        return 1
    if checked == 0:
        print('본문 구역: 실패 — 본 쪽이 0개다. 센 것이 없으면 통과가 아니다 (A-433).')
        return 1
    print('본문 구역: 공개 쪽 %d개 전부 <main> 하나가 본문을 담고 있다' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
