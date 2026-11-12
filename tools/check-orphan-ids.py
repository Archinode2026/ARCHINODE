#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-516 — 그 쪽에 **없는 요소**를 찾는 코드가 있는지.

왜 있는가
---------
`magazine.html` 에는 홈의 히어로 슬라이더 코드가 **통째로 복사돼** 있었다.
그런데 이 쪽에는 `.hero-slide` 마크업이 하나도 없어서 가드에 걸려 **한 번도
돌지 않았다** — 죽은 사본이다. 죽어 있는 것보다 나쁜 것은 그 사본이
**고치기 전 판**이라는 점이다(A-361 에서 고친 「한국어 화면이 5초 뒤 영어로
바뀌는」 결함이 그 안에 그대로 남아 있었다). 누군가 이 쪽에 히어로 마크업을
붙이면 고친 적 없는 결함이 되살아난다.

`document.getElementById('heroTag')` 처럼 **그 쪽 어디에도 없는 이름**을 찾는
코드는 이런 사본의 표지다. 가드가 있으면 조용히 아무 일도 안 하고, 가드가
없으면 그 줄에서 터진다 — 어느 쪽이든 아무도 모른다.

무엇을 보는가
-------------
  1. 인라인 코드의 `getElementById('x')` 중, 그 파일 어디에도 `id="x"` 가 없고
     코드가 `.id = 'x'` · `setAttribute('id','x')` 로 만들지도 않는 것
     (그래서 구매창처럼 코드가 만드는 자리는 예외에 적지 않아도 된다 — 실제로
      예외 목록을 비워 보고 **정말 필요한 넷만** 남겼다)
  2. 허수 방지 — 호출을 2,000개 밑으로 봤으면 검사가 멈춘 것으로 본다

까닭이 있는 자리는 아래 ALLOW 에 **까닭과 함께** 적는다. 까닭 없이 늘리지 마라 —
이 검사의 값은 목록이 짧다는 데 있다.

    python3 tools/check-orphan-ids.py
"""
from __future__ import annotations
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'node_modules', '.git', '__pycache__', 'archi-diary', 'docs',
             'sales', 'silvia', 'scripts', 'tools', 'downloads', 'assets'}
MIN_LOOKUPS = 2000

# (파일, 이름): 왜 없어도 되는가
ALLOW = {
    ('brands/view.html', 'likeBtn'):
        '단추 id 가 화면마다 다르다 — `likeBtn || brandLikeBtn` 로 둘 다 찾는다(A-??의 한 쌍)',
    ('products/view.html', 'brandLikeBtn'):
        '위와 같은 쌍 — products 쪽에서 brands 쪽 이름을 함께 찾는다',
    ('admin/dashboard.html', 'rvArea'):
        '검수 편집 칸을 코드가 그린 뒤 찾는다(이름을 문자열로 짓지 않아 위 규칙에 안 걸린다)',
    ('admin/dashboard.html', 'rve_area'):
        '위와 같다',
}

GET = re.compile(r"getElementById\(\s*['\"]([\w-]+)['\"]\s*\)")
SCRIPT = re.compile(r'<script([^>]*)>([\s\S]*?)</script>')


def main() -> int:
    bad = []
    looks = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
            src = io.open(path, encoding='utf-8', errors='replace').read()
            src = re.sub(r'<!--[\s\S]*?-->', '', src)

            # 마크업의 id + 코드가 만드는 id 를 모두 인정한다
            ids = set(re.findall(r'\sid="([^"]+)"', src))
            ids |= set(re.findall(r"\.id\s*=\s*['\"]([\w-]+)['\"]", src))
            ids |= set(re.findall(r"setAttribute\(\s*['\"]id['\"]\s*,\s*['\"]([\w-]+)['\"]", src))

            for m in SCRIPT.finditer(src):
                attrs, body = m.group(1), m.group(2)
                if 'src=' in attrs or 'json' in attrs.lower():
                    continue
                body = re.sub(r'/\*[\s\S]*?\*/', '', body)
                for g in GET.finditer(body):
                    looks += 1
                    name = g.group(1)
                    if name in ids:
                        continue
                    if (rel, name) in ALLOW:
                        continue
                    bad.append((rel, name))

    if looks < MIN_LOOKUPS:
        bad.append(('(검사 자체)', 'getElementById 호출을 %d개만 봤다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (looks, MIN_LOOKUPS)))

    if bad:
        print('그 쪽에 없는 요소를 찾는 자리 %d건' % len(bad))
        for rel, name in bad[:40]:
            print('  · %-34s %s' % (rel, name))
        print('')
        print('죽은 사본이거나, 코드가 만드는 요소다. 뒤쪽이면 까닭과 함께 ALLOW 에 적어라.')
        return 1

    print('떠도는 id — 호출 %d개를 봤고 없는 요소를 찾는 자리가 없다 (까닭을 적어 둔 예외 %d개)'
          % (looks, len(ALLOW)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
