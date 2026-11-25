#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTML 안에 박힌 스크립트의 **문법**을 본다 (A-713).

    python3 tools/check-inline-script-syntax.py      → 깨진 곳이 있으면 종료 코드 1

왜 이 검사가 필요한가
---------------------
이 사이트는 정적 HTML 이라 화면 로직이 거의 다 `<script>` 안에 박혀 있다.
그런데 **검사 69개 중 그 스크립트가 문법적으로 성립하는지 보는 것이 없었다.**
`.js` 파일은 `node --check` 로 지켜지는데, 정작 양이 더 많은 인라인 쪽은
아무도 안 봤다.

A-713 은 **내가 낸 사고**에서 나왔다. A-712 를 고치며 `admin/dashboard.html`
의 템플릿 문자열 안에 HTML 주석을 넣었고, 그 주석에 **역따옴표**를 썼다.
템플릿 문자열 안의 역따옴표는 **템플릿을 닫는다** — 그 한 글자로
`admin/dashboard.html` 전체가 `SyntaxError` 가 됐다. 어드민이 아예 열리지
않는 상태였고, 손으로 `node --check` 를 돌려서 겨우 잡았다.

**깨진 스크립트는 조용하지 않다 — 화면이 통째로 죽는다.** 그런데 그걸
막는 장치가 「내가 그때 수동으로 확인했는가」뿐이었다. 그건 장치가 아니다.

어떻게 보나
-----------
`<script>` 가운데 `src=` 가 없는 것만 뽑아 `node --check` 에 건다.
`type` 이 JS 가 아닌 것(`application/ld+json` 같은 것)은 JS 가 아니므로
따로 가린다 — JSON 은 `json.loads` 로 본다.
"""

import io
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.S | re.I)
ATTR = re.compile(r'(\w[\w-]*)\s*=\s*"([^"]*)"')

JS_TYPES = {'', 'text/javascript', 'application/javascript', 'module'}
JSON_TYPES = {'application/ld+json', 'application/json'}


def html_files():
    out = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'docs', 'backup')]
        for n in names:
            if n.endswith('.html'):
                out.append(os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/'))
    return sorted(out)


def main():
    files = html_files()
    problems = []
    n_js = n_json = 0

    node = None
    for cand in ('node', 'node.exe'):
        try:
            subprocess.run([cand, '--version'], capture_output=True, timeout=20)
            node = cand
            break
        except Exception:
            continue
    if node is None:
        print('x node 를 찾지 못했다 — 문법을 볼 수 없다. 이 검사는 통과로 세지 않는다')
        return 1

    for rel in files:
        src = io.open(os.path.join(ROOT, rel), encoding='utf-8', errors='replace').read()
        pieces = []
        for m in SCRIPT.finditer(src):
            at = dict(ATTR.findall(m.group(1)))
            if 'src' in at:
                continue
            body = m.group(2)
            if not body.strip():
                continue
            kind = (at.get('type') or '').strip().lower()
            line = src[:m.start()].count('\n') + 1
            if kind in JSON_TYPES:
                n_json += 1
                try:
                    json.loads(body)
                except Exception as e:
                    problems.append('%s:%d — JSON 이 깨졌다: %s' % (rel, line, e))
                continue
            if kind not in JS_TYPES:
                continue        # 템플릿 조각 등 — JS 가 아니다
            pieces.append((line, body))

        if not pieces:
            continue
        n_js += len(pieces)
        # 한 파일의 조각들을 이어 한 번에 본다. 조각 사이에 `;` 를 넣어
        # 앞 조각의 마지막 줄과 뒤 조각이 한 문장으로 붙는 것을 막는다.
        joined = '\n;\n'.join(b for _, b in pieces)
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False,
                                         encoding='utf-8') as fh:
            fh.write(joined)
            tmp = fh.name
        try:
            r = subprocess.run([node, '--check', tmp], capture_output=True,
                               text=True, timeout=60)
            if r.returncode != 0:
                msg = (r.stderr or '').strip().split('\n')
                head = ' / '.join(x.strip() for x in msg[:4] if x.strip())
                problems.append('%s — 인라인 스크립트가 문법적으로 깨졌다. %s'
                                % (rel, head[:300]))
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass

    print('인라인 스크립트 문법: HTML %d개 · JS 조각 %d개 · JSON 조각 %d개를 봤다'
          % (len(files), n_js, n_json))

    if problems:
        print()
        print('실패 %d건:' % len(problems))
        for p in problems:
            print('  x %s' % p)
        print()
        print('깨진 스크립트는 조용하지 않다 — **화면이 통째로 죽는다**')
        return 1

    print('결과: 통과 — 인라인 스크립트가 모두 문법적으로 성립한다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
