#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-512 — 눌러도 아무 일도 안 일어나는 단추가 있는지.

왜 있는가
---------
`order-complete.html` 의 머리글 단추 셋(`toggleSearch`·`toggleCatMenu`·`toggleMobile`)은
**어디에도 정의돼 있지 않았다.** 다른 243쪽은 페이지마다 인라인으로 들고 있는데
그 쪽만 빠졌다 — A-501 로 새로 만들면서 머리글 생김새만 복사하고 손잡이를 안 가져왔다.
검색 단추는 **열 가리개조차 없었다.**

눌러도 **오류도 안 나고 아무 일도 안 일어난다.** 콘솔에 `ReferenceError` 가 한 줄
남지만 아무도 안 본다. 브론즈 철칙 6 의 그 모양이다 — 화면은 성공이라고 말하지도
실패라고 말하지도 않는다.

그리고 이 저장소는 머리글·푸터를 **파일마다 복사해 둔다**(240벌 남짓). 생김새는
복사되는데 손잡이는 따라오지 않을 수 있다 — 그 틈이 이 검사의 자리다.

무엇을 보는가
-------------
  1. `onclick` 이 부르는 이름이 그 페이지에서 **닿을 수 있는지**
     (같은 페이지 인라인 스크립트 + 그 페이지가 싣는 우리 .js 파일)
  2. 허수 방지 — `onclick` 을 가진 페이지가 200쪽 밑이면 검사가 멈춘 것으로 본다

    python3 tools/check-dead-buttons.py
"""
from __future__ import annotations
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'node_modules', '.git', '__pycache__', 'archi-diary', 'docs',
             'sales', 'silvia', 'scripts', 'tools', 'downloads'}

# 자바스크립트가 본래 갖고 있거나, 값 꺼내기라 단추와 무관한 이름
BUILTIN = {'scrollTo', 'scrollBy', 'getElementById', 'querySelector', 'alert',
           'confirm', 'prompt', 'open', 'setTimeout', 'print', 'escapeHtml', 'fn',
           'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Date'}
KEYWORD = {'if', 'for', 'while', 'return', 'function', 'typeof', 'new',
           'catch', 'switch', 'do', 'else', 'delete', 'void', 'in', 'of'}

DEF = re.compile(
    r'(?:function\s+([A-Za-z_$][\w$]*)'
    r'|window\.([A-Za-z_$][\w$]*)\s*='
    r'|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\())')
SCRIPT = re.compile(r'<script([^>]*)>(.*?)</script>', re.S)
ONCLICK = re.compile(r'on(?:click|change|submit|input)\s*=\s*"([^"]*)"')
CALL = re.compile(r'\b([A-Za-z_$][\w$]*)\s*\(')

MIN_PAGES = 200
_jscache: dict = {}


def defs_in_file(path: str) -> set:
    if path in _jscache:
        return _jscache[path]
    out = set()
    try:
        src = io.open(path, encoding='utf-8', errors='replace').read()
    except Exception:
        src = ''
    for m in DEF.finditer(src):
        out.add(m.group(1) or m.group(2) or m.group(3))
    _jscache[path] = out
    return out


def main() -> int:
    bad = []
    seen = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
            src = io.open(path, encoding='utf-8', errors='replace').read()

            wanted = set()
            for m in ONCLICK.finditer(src):
                for cm in CALL.finditer(m.group(1)):
                    n = cm.group(1)
                    if n in KEYWORD or n in BUILTIN:
                        continue
                    wanted.add(n)
            if not wanted:
                continue
            seen += 1

            have = set()
            for m in SCRIPT.finditer(src):
                attrs, body = m.group(1), m.group(2)
                ms = re.search(r'src\s*=\s*"([^"]+)"', attrs)
                if ms:
                    s = ms.group(1).split('?')[0]
                    if s.startswith('http://') or s.startswith('https://') or s.startswith('//'):
                        continue           # 남의 코드 — 우리가 보증할 수 없다
                    have |= defs_in_file(os.path.normpath(os.path.join(dirpath, s)))
                else:
                    if 'json' in attrs.lower():
                        continue
                    for dm in DEF.finditer(body):
                        have.add(dm.group(1) or dm.group(2) or dm.group(3))

            for n in sorted(wanted - have):
                bad.append((rel, n))

    if seen < MIN_PAGES:
        bad.append(('(검사 자체)', 'onclick 을 가진 페이지를 %d쪽만 봤다 — %d쪽 밑이면 검사가 멈춘 것으로 본다'
                    % (seen, MIN_PAGES)))

    if bad:
        print('눌러도 아무 일도 안 일어나는 자리 %d건' % len(bad))
        for rel, n in bad[:40]:
            print('  · %-42s %s' % (rel, n))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        return 1

    print('죽은 단추 — %d쪽을 봤고 닿지 않는 손잡이가 없다' % seen)
    return 0


if __name__ == '__main__':
    sys.exit(main())
