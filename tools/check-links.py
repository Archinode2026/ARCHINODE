#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-552 — 안쪽 링크가 실제로 있는 곳을 가리키는지.

왜 있나
-------
2026-11-15 브론즈 39차가 찾은 404 셋은, 전날 내가 넣은 **동의 고지 안의
개인정보 처리방침 링크**였다. 뿌리에서 만든 조각을 서브폴더 쪽에 그대로
복사하는 바람에 `brands/privacy.html` 로 풀렸다. 손님이 개인정보를 적기
직전에 「무엇에 동의하는지」 보려고 누르는 바로 그 링크였다.

그때 검사 38개가 **전부 통과**했다. 사이트맵은 사이트맵만 보고, 폼 검사는
링크를 글자로만 봤다. **링크 전체를 따라가 보는 검사가 하나도 없었다.**

무엇을 보는가
-------------
공개 HTML 의 `href`·`src`·`data-en-href`·`data-ko-href` 가 가리키는
**우리 쪽 경로**가 저장소에 실재하는지. 바깥 주소·앵커·mailto·tel 은 보지 않는다.

  · `<base href="/">` 를 쓰는 쪽은 뿌리에서 푼다
  · `?` 와 `#` 뒤는 떼고 본다
  · 디렉터리로 끝나면 그 안의 index.html 을 본다

보지 않는 것
------------
자바스크립트가 만들어 넣는 주소(`${...}`, `' + x + '`)는 값을 모르니 센 뒤
건너뛴다. 그 수를 끝에 적어, 어느 날 그 수가 확 늘면 사람이 보게 한다.
리다이렉트로 살려 둔 주소도 보지 않는다 — `_redirects` 와 `netlify.toml` 에
적힌 자리는 파일이 없어도 맞다.

    python3 tools/check-links.py
"""
from __future__ import annotations
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIR = {'node_modules', '.git', '__pycache__'}
ATTRS = ('href', 'src', 'data-en-href', 'data-ko-href')
MIN_LINKS = 5000          # 허수 방지 — 이보다 적게 봤으면 검사가 멈춘 것이다

# 값을 알 수 없는 주소 — 자바스크립트가 만들어 넣는다
DYNAMIC = re.compile(r'\$\{|\'\s*\+|\+\s*\'|`|<%')
EXTERNAL = ('http://', 'https://', '//', '#', 'mailto:', 'tel:', 'data:', 'javascript:')


def redirect_targets():
    """리다이렉트로 살려 둔 주소는 파일이 없어도 맞다."""
    out = set()
    for name in ('_redirects', 'netlify.toml'):
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding='utf-8'):
            for m in re.finditer(r'(/[^\s"\']+)', line):
                out.add(m.group(1).split('?')[0].rstrip('/'))
    return out


def main() -> int:
    bad = []
    seen_links = 0
    dynamic = 0
    pages = 0
    redirects = redirect_targets()

    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIR]
        for f in sorted(fn):
            if not f.endswith('.html'):
                continue
            path = os.path.join(dp, f)
            rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
            s = open(path, encoding='utf-8').read()
            s = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
            pages += 1
            has_base = bool(re.search(r'<base[^>]*href="/"', s))
            base_dir = os.path.dirname(rel)

            for attr in ATTRS:
                for m in re.finditer(r'\b%s="([^"]*)"' % re.escape(attr), s):
                    url = m.group(1).strip()
                    if not url or url.startswith(EXTERNAL):
                        continue
                    if DYNAMIC.search(url):
                        dynamic += 1
                        continue
                    seen_links += 1
                    clean = url.split('#')[0].split('?')[0]
                    if not clean:
                        continue
                    if clean.startswith('/') or has_base:
                        target = clean.lstrip('/')
                    else:
                        target = os.path.normpath(os.path.join(base_dir, clean)).replace(os.sep, '/')
                    if target.startswith('..'):
                        bad.append((rel, s[:m.start()].count('\n') + 1,
                                    '%s="%s" 가 저장소 밖을 가리킨다' % (attr, url)))
                        continue
                    if ('/' + target.rstrip('/')) in redirects:
                        continue
                    full = os.path.join(ROOT, target.replace('/', os.sep))
                    if os.path.isdir(full):
                        full = os.path.join(full, 'index.html')
                    if not os.path.exists(full):
                        bad.append((rel, s[:m.start()].count('\n') + 1,
                                    '%s="%s" 가 없는 곳을 가리킨다 (→ %s)' % (attr, url, target)))

    if seen_links < MIN_LINKS:
        bad.append(('(검사 자체)', 0, '링크를 %d개만 봤다 — %d개 밑이면 검사가 멈춘 것으로 본다'
                    % (seen_links, MIN_LINKS)))

    if bad:
        print('닿지 않는 링크 %d건' % len(bad))
        for rel, line, why in bad[:40]:
            print('  · %-30s %5s  %s' % (rel, line or '', why))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        print()
        print('  손님이 누르면 404 를 맞는다. 서브폴더 쪽이면 ../ 가 빠졌는지 먼저 보라')
        print('  — 뿌리에서 만든 조각을 그대로 복사하면 이렇게 된다(A-547).')
        return 1

    print('안쪽 링크 — 쪽 %d개, 링크 %d개 전부 닿는다 (값을 모르는 동적 주소 %d개는 건너뜀)'
          % (pages, seen_links, dynamic))
    return 0


if __name__ == '__main__':
    sys.exit(main())
