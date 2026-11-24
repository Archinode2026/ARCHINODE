#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`tools/check-css-cascade.py` 의 음성·양성 시험.

A-683: 이 검사기에 **축약형 펼침**을 넣었다. `padding: 0 0 60px` 같은 축약형이
뒤에 오면 앞쪽 미디어 규칙의 `padding-top` 을 통째로 지우는데, 검사기는
(선택자, 속성) 짝으로만 색인해서 그 둘을 다른 속성으로 보고 **놓치고 있었다.**

시험은 **진짜 `style.css` 를 건드리지 않는다.** 임시 폴더에 가짜 CSS 를 써서
검사기의 ROOT·FILES 를 그쪽으로 돌려 돌린다 — 2026-11-23 에 내가 실제 파일을
깨뜨려 시험하다 `timeout` 에 잘려 `finally` 가 안 돌았고 저장소를 망가뜨렸다.
그 꼴이 다시 안 나오게 **원본을 아예 손대지 않는 방식**으로 짰다.
"""
import io
import os
import sys
import tempfile
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, 'check-css-cascade.py')


def load():
    spec = importlib.util.spec_from_file_location('cascade_mod', CHECKER)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def run_on(css):
    """가짜 css 한 덩이를 임시 ROOT 에 두고 검사기를 돌려 (종료코드, 출력) 을 준다."""
    m = load()
    with tempfile.TemporaryDirectory() as d:
        with io.open(os.path.join(d, 'style.css'), 'w', encoding='utf-8') as f:
            f.write(css)
        m.ROOT = d
        m.FILES = ['style.css']
        # 폭-게이트 검사(A-446)는 「진짜 style.css 에 이 선언이 있어야 한다」를
        # 보는 별개의 일이다. 가짜 CSS 에는 당연히 없으므로 여기서는 떼어 둔다 —
        # 안 떼면 모든 가짜가 그 이유로 실패해 **이 시험이 아무것도 못 가린다.**
        m.WIDTH_GATE_FORBIDDEN = []
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = m.main()
        return code, buf.getvalue()


CASES = []


def case(name, css, want_fail, must_say=None):
    CASES.append((name, css, want_fail, must_say))


# ① 축약형이 낱개를 죽이는 꼴 — A-683 이 넣은 바로 그 기능
case('축약형 padding 이 뒤에서 padding-top 을 죽인다',
     '@media (max-width: 480px) { body.home section.hero { padding-top: 24px; } }\n'
     'body.home section.hero { padding: 0 0 60px; }\n',
     True, '축약형')

# ② 같은 꼴인데 **순서가 반대** — 미디어가 뒤라 이긴다. 울리면 안 된다
case('미디어 블록이 뒤에 있으면 이긴다 (울리면 안 됨)',
     'body.home section.hero { padding: 0 0 60px; }\n'
     '@media (max-width: 480px) { body.home section.hero { padding-top: 24px; } }\n',
     False)

# ③ margin 축약형도 같다
case('축약형 margin 이 margin-top 을 죽인다',
     '@media (max-height: 480px) { body .x { margin-top: 0; } }\n'
     'body .x { margin: 10px; }\n',
     True, '축약형')

# ④ 낱개끼리 같은 속성 — 원래부터 보던 꼴 (A-411)
case('낱개끼리 — 원래 보던 꼴',
     '@media (max-width: 1100px) { body .scroll-top { bottom: 84px; } }\n'
     'body .scroll-top { bottom: 30px; }\n',
     True)

# ⑤ 선택자가 다르면 특정도 얘기가 아니다 — 울리면 안 된다
case('선택자가 다르면 안 울린다',
     '@media (max-width: 480px) { body .a { padding-top: 24px; } }\n'
     'body .b { padding: 0; }\n',
     False)

# ⑥ 한 규칙이 축약형과 낱개를 같이 적은 것 — 미디어·기본 문제가 아니다
case('한 규칙 안의 축약형+낱개는 안 울린다',
     '@media (max-width: 480px) { body .c { padding-top: 24px; } }\n'
     'body .c { padding: 0; padding-top: 24px; }\n',
     True)   # 이건 여전히 죽는다(기본이 뒤) — 울리는 것이 맞다


def main():
    bad = []
    for name, css, want_fail, must_say in CASES:
        code, out = run_on(css)
        got_fail = (code != 0)
        if got_fail != want_fail:
            bad.append('%s — %s 를 기대했는데 %s (종료 %d)\n        %s'
                       % (name, '실패' if want_fail else '통과',
                          '실패' if got_fail else '통과', code,
                          out.strip().replace('\n', '\n        ')))
            continue
        if must_say and must_say not in out:
            bad.append('%s — 실패는 맞는데 메시지에 「%s」 가 없다\n        %s'
                       % (name, must_say, out.strip().replace('\n', '\n        ')))
    if bad:
        print('캐스케이드 검사기 시험 — %d건 어긋남' % len(bad))
        for b in bad:
            print('  - ' + b)
        print('결과: 실패')
        return 1
    print('캐스케이드 검사기 시험 — %d가지 모두 뜻대로 (축약형 펼침 포함)' % len(CASES))
    print('결과: 통과')
    return 0


if __name__ == '__main__':
    sys.exit(main())
