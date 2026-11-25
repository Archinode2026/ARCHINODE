#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""링크 이름이 **말하는 쪽**으로 가는지 본다 (A-709).

    python3 tools/check-link-labels.py      → 어긋나면 종료 코드 1

왜 이 검사가 필요한가
---------------------
`tools/check-links.py` 는 링크가 **존재하는지**를 본다. 그래서 「브랜드
아티클」이라고 적힌 단추가 매거진으로 가도 조용했다 — 목적지 파일은
멀쩡히 있으니까.

A-709 가 그 틈에서 나왔다. 첫 쪽 히어로의 **유일한 단추**가 「Read Brand
Articles / 브랜드 아티클 보기」라고 말하면서 `magazine.html`(한국어 편집
기사 130편)로 보냈다. 유럽 브랜드가 자기 기사가 실릴 자리를 보려고 첫 쪽에서
그 단추를 누르면 한국어 정책·자재 기사 목록이 열렸다.

정본은 내비다 — 손으로 적지 않는다
----------------------------------
처음에는 **다수결**로 지었다. 같은 `data-en` 라벨이 여러 목적지로 갈리면
소수가 틀린 것으로 보는 꼴이다. 그런데 **A-709 를 못 잡았다**: 히어로의
라벨은 `Read Brand Articles`(저장소에 **1곳**)이고, 467곳인 라벨은
`Brand Articles` 였다. 다수결은 1곳짜리를 볼 수 없다 —
**결함이 사는 자리가 바로 「하나뿐인 자리」인데 그곳을 못 보는 셈법이었다.**

그래서 질문을 바꿨다. 사이트는 자기 쪽 이름을 **내비에 선언해 둔다**:

    <a href="trend-report.html" data-en="Brand Articles" data-ko="브랜드 아티클">
    <a href="magazine.html"     data-en="Korean Articles" data-ko="매거진">

이 선언을 정본으로 읽고, **그 이름을 품은 링크가 그 쪽으로 가는지** 묻는다.
`Read Brand Articles` 는 `Brand Articles` 를 품으므로 `trend-report.html`
로 가야 한다. 명부를 손으로 적지 않으므로 쪽이 늘거나 이름이 바뀌면
검사도 따라 바뀐다.

이 검사가 **못 보는 것**(적어 둔다)
-----------------------------------
라벨이 **문장**이면 못 본다. A-709 의 둘째 자리가 그랬다 —
`submit-trend.html` 의 「Browse existing articles at the Brand Articles.」
는 쪽 이름을 품었지만 틀 낱말만 붙은 꼴이 아니므로 건너뛴다.
`FRAME` 을 늘리면 더 보지만, 늘릴 때마다 「제출하기」처럼 **목적지가 달라야
맞는** 자리를 울 위험이 커진다. 그래서 **덜 말하는 쪽**으로 뒀다 —
오탐으로 막는 검사는 결국 꺼지고(A-382), 그러면 아무것도 못 지킨다.

깨뜨리기로 확인한 것: ① 히어로 단추를 옛 목적지로 되돌리면 두 라벨을 집어
운다 ② 내비를 지우면 「정본이 없으니 셀 수 없다」로 운다 — **조용히 통과하지
않는다** ③ 멀쩡한 저장소에서 거짓 양성 0.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 내비 선언 가운데 **이름이 그 쪽을 가리키는** 것만 정본으로 쓴다.
# 'Brands'·'About' 같은 짧고 흔한 말은 다른 뜻으로도 쓰이므로 제외한다.
CANON_MIN_LEN = 7

# 이름을 품었지만 **다른 곳으로 가는 것이 맞는** 자리. 까닭을 적지 않으면 두지 않는다.
ALLOW = {
    ('submit-trend.html', 'Brand Articles', 'submit-trend.html'):
        '투고 폼 자신을 가리키는 자리라면 맞다',
}


def blank(m):
    return '\n' * m.group(0).count('\n')


def strip_comments(s):
    return re.sub(r'<!--[\s\S]*?-->', blank, s)


LINK = re.compile(r'<a\s[^>]*?>', re.I)
ATTR = re.compile(r'(\w[\w-]*)="([^"]*)"')


def html_files():
    out = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'docs')]
        for n in names:
            if n.endswith('.html'):
                out.append(os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/'))
    return sorted(out)


def resolve(href, rel):
    h = href.split('#')[0].split('?')[0].strip()
    if not h or h.startswith(('http', 'mailto:', 'tel:', '//', 'javascript:')):
        return None
    if h.startswith('/'):
        return h.lstrip('/')
    return os.path.normpath(os.path.join(os.path.dirname(rel), h)).replace(os.sep, '/')


def links_of(rel):
    src = strip_comments(io.open(os.path.join(ROOT, rel), encoding='utf-8',
                                 errors='replace').read())
    for m in LINK.finditer(src):
        at = dict(ATTR.findall(m.group(0)))
        if 'href' not in at:
            continue
        yield (src[:m.start()].count('\n') + 1, at)


def canon():
    """index.html 의 내비에서 쪽 이름 → 목적지 를 읽는다."""
    src = strip_comments(io.open(os.path.join(ROOT, 'index.html'),
                                 encoding='utf-8', errors='replace').read())
    m = re.search(r'<nav\b.*?</nav>', src, re.S | re.I)
    if not m:
        return None
    out = {}
    for lm in LINK.finditer(m.group(0)):
        at = dict(ATTR.findall(lm.group(0)))
        t = resolve(at.get('href', ''), 'index.html')
        if not t or not t.endswith('.html'):
            continue
        for key in ('data-en', 'data-ko'):
            name = (at.get(key) or '').strip()
            if len(name) >= CANON_MIN_LEN:
                out[name] = t
    return out


# 라벨을 **쪽 이름으로 되돌리는** 틀 낱말들. 「보러 간다」는 뜻만 더하는 말이다.
# ★ 「제출」·「Submit」 은 **일부러 넣지 않는다** — 그 말이 붙으면 목적지가
#   투고 쪽인 것이 맞다. 처음에 이 구분을 안 두어 멀쩡한 5자리를 울었다.
#   이 목록이 모자라면 검사는 **덜 말할 뿐**(놓칠 뿐) 헛소리하지 않는다 —
#   오탐으로 막는 검사는 결국 꺼진다(A-382·A-405 의 교훈).
FRAME = ['read', 'view', 'browse', 'see', 'all', 'the', 'go', 'to', 'explore',
         '보기', '둘러보기', '전체', '보러', '가기', '읽기', '읽어', '보세요']


def is_essentially(label, name):
    """라벨이 **그 쪽 이름 자체**인가 — 틀 낱말만 더 붙은 꼴인가."""
    if name not in label:
        return False
    rest = label.replace(name, ' ')
    rest = re.sub(r'[^0-9A-Za-z가-힣]+', ' ', rest)
    for w in rest.split():
        if w.lower() not in FRAME:
            return False
    return True


def main():
    names = canon()
    if not names:
        print('x index.html 의 내비를 읽지 못했다 — 정본이 없으니 셀 수 없다')
        return 1

    pages = sorted(set(names.values()))
    print('링크 이름표: 내비에서 쪽 이름 %d개(쪽 %d개)를 정본으로 읽었다'
          % (len(names), len(pages)))
    for n in sorted(names):
        print('    「%s」 → %s' % (n, names[n]))

    problems, notes = [], []
    files = html_files()
    for rel in files:
        for line, at in links_of(rel):
            t = resolve(at.get('href', ''), rel)
            if not t:
                continue
            for key in ('data-en', 'data-ko'):
                label = (at.get(key) or '').strip()
                if not label:
                    continue
                for name, want in names.items():
                    if not is_essentially(label, name):
                        continue
                    if t == want:
                        continue
                    k = (rel, name, t)
                    if k in ALLOW:
                        notes.append('일부러 허용: %s 「%s」 → %s — %s'
                                     % (rel, name, t, ALLOW[k]))
                        continue
                    problems.append(
                        '%s:%d — 「%s」 라고 말하면서 %s 로 간다. '
                        '그 이름의 쪽은 %s 다' % (rel, line, label, t, want))

    print('  링크를 가진 파일 %d개를 봤다' % len(files))
    for n in sorted(set(notes)):
        print('  (%s)' % n)

    if problems:
        print()
        print('실패 %d건:' % len(set(problems)))
        for p in sorted(set(problems)):
            print('  x %s' % p)
        print()
        print('이름이 말하는 곳과 실제 가는 곳이 다르면 손님은 **우리가 거짓말했다고** 느낀다')
        return 1

    print('결과: 통과 — 링크 이름이 말하는 쪽으로 간다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
