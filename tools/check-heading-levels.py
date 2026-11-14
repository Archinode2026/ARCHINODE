#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-544 — 머리글 단계가 빈 채로 읽히는 쪽.

왜 있나
-------
화면 낭독기를 쓰는 손님은 쪽 전체를 읽지 않고 **머리글만 훑어** 뼈대를
잡는다. h2 다음에 h4 가 오면 그 사이 한 단계가 비어, 훑던 사람은 자기가
무엇을 건너뛴 것인지 알 수 없다.

2026-11-14 에 세어 보니 **233쪽 가운데 98쪽**이 그랬다. 거의 전부가 푸터
칸 제목을 h4 로 둔 탓이었다(본문은 h2 로 끝난다). 오래 그대로였던 이유는
간단하다 — 아무도 세지 않았다. 검사 37개 중 머리글을 보는 것이 없었다.

무엇을 보는가
-------------
  1. 머리글 단계를 건너뛰지 않는다(h2 다음 h4 같은 자리)
  2. 쪽마다 h1 이 **하나** 있다
  3. 빈 머리글이 없다
  4. 허수 방지 — 들여다본 쪽이 200개 밑이면 검사가 멈춘 것으로 본다

보지 못하는 것
--------------
이 검사는 **파일에 적힌 머리글만** 센다. 브랜드·제품 쪽처럼 자바스크립트가
내용을 꽂는 쪽은 실제로 그려진 순서가 다를 수 있다. 2026-11-14 에 라이브에서
견줘 보니 brands/view.html 은 파일에는 h1→h3 인데 그려진 뒤에는 h1→h2→h3
였다(꽂히는 h2 가 사이에 들어온다). 그러니 이 검사가 통과한다고 해서 실제
화면이 맞다는 뜻은 아니다 — 그런 쪽은 브라우저에서 따로 봐야 한다.
그 두 쪽은 아래 RUNTIME 에 적어 둔다(사람이 다시 볼 자리라는 표시일 뿐,
검사를 건너뛰지는 않는다).

    python3 tools/check-heading-levels.py
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_PAGES = 200
SKIP_DIR = {'node_modules', '.git', '__pycache__'}
SKIP_PREFIX = ('admin/', 'auth/', 'brand-portal/', 'tools/', 'scripts/')

# 자바스크립트가 머리글을 꽂는 쪽 — 그려진 뒤의 순서는 브라우저에서 봐야 한다
RUNTIME = {'brands/view.html', 'products/view.html'}


def clean(s):
    """주석과 스크립트를 **줄 수를 지키며** 지운다. 스크립트 안의 템플릿 문자열에
    든 <h1> 까지 세면 없는 결함이 보인다(실제로 그렇게 세어 헛다리를 짚었다)."""
    s = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'<script\b.*?</script>', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    return s


def script_injects_h1(raw):
    """스크립트가 h1 을 꽂는 쪽인가. 파일에 h1 이 없다고 바로 결함이라 부르면
    매거진 기사처럼 내용을 통째로 꽂는 쪽을 잘못 짚는다. 「예외로 적어 두기」
    대신 **실제로 꽂는 코드가 있는지** 본다 — 그 코드가 사라지면 다시 걸린다."""
    for m in re.finditer(r'<script\b.*?</script>', raw, re.S):
        if re.search(r'<h1[\s>]', m.group(0)):
            return True
    return False


def headings(s):
    out = []
    for m in re.finditer(r'<h([1-6])\b[^>]*>(.*?)</h\1>', s, re.S):
        line = s[:m.start()].count('\n') + 1
        text = ' '.join(re.sub(r'<[^>]+>', '', m.group(2)).split())
        out.append((int(m.group(1)), line, text))
    return out


def main() -> int:
    bad = []
    seen = 0

    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIR]
        for f in sorted(fn):
            if not f.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/')
            if rel.startswith(SKIP_PREFIX):
                continue
            raw = open(os.path.join(dp, f), encoding='utf-8').read()
            s = clean(raw)
            hs = headings(s)
            if not hs:
                continue
            seen += 1
            tail = '  (그려진 뒤의 순서는 브라우저에서 따로 봐라)' if rel in RUNTIME else ''

            # ① 단계를 건너뛰지 않는다
            prev = hs[0][0]
            for lv, line, text in hs[1:]:
                if lv > prev + 1:
                    bad.append((rel, line, 'h%d 다음에 h%d 가 온다 — 「%s」%s'
                                % (prev, lv, text[:30], tail)))
                prev = lv

            # ② h1 은 하나
            ones = [h for h in hs if h[0] == 1]
            if not ones:
                if not script_injects_h1(raw):
                    bad.append((rel, hs[0][1],
                                'h1 이 없다 — 이 쪽의 제목이 무엇인지 알 수 없다' + tail))
            elif len(ones) > 1:
                bad.append((rel, ones[1][1], 'h1 이 %d개다 — 쪽의 제목은 하나여야 한다' % len(ones)))

            # ③ 빈 머리글
            for lv, line, text in hs:
                if not text:
                    bad.append((rel, line, 'h%d 가 비어 있다' % lv))

    if seen < MIN_PAGES:
        bad.append(('(검사 자체)', 0, '쪽을 %d개만 봤다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (seen, MIN_PAGES)))

    if bad:
        print('머리글 어긋남 %d건' % len(bad))
        for rel, line, why in bad[:40]:
            print('  · %-34s %5s  %s' % (rel, line or '', why))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        print()
        print('  머리글만 훑어 뼈대를 잡는 손님은 빈 단계에서 무엇을 건너뛴 것인지 알 수 없다.')
        print('  태그를 한 단계 올리고 생김새는 클래스로 지켜라(A-542 가 푸터에서 한 방식).')
        return 1

    print('머리글 단계 — 쪽 %d개, 건너뜀 없음 · h1 하나씩' % seen)
    return 0


if __name__ == '__main__':
    sys.exit(main())
