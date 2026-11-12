#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-514 — 목록 카드의 그림 대체글이 바로 옆 제목과 똑같은지.

왜 있는가
---------
`magazine.html` 의 카드 129장 중 **18장**이 `alt` 와 바로 아래 `<h3>` 가
**글자까지 같았다**(브론즈 35차 N35-5). 한 고리(`<a>`) 안에 이름이 이미 있으면
읽어 주는 도구는 **제목을 두 번 말한다** — 「여섯 번째 사면, 이번엔 마지막일까,
여섯 번째 사면, 이번엔 마지막일까, 링크」.

눈으로는 아무 문제가 없다. 그림도 제대로 뜨고 글자도 맞다. **듣는 사람에게만
틀린** 자리라서 화면을 아무리 봐도 안 보인다.

같은 모양이 **코드가 그리는 카드**에도 있었다 — 글 목록·제품 목록·브랜드
목록·저장한 목록·관련 제품 일곱 자리가 전부 `alt` 에 이름을 다시 넣고 있었다.

무엇을 보는가
-------------
  1. 정적 HTML — `<a>` 안에 `<img alt="X">` 와 제목 「X」가 함께 있는 자리
  2. 코드가 그리는 카드 — 알려진 일곱 자리가 빈 `alt` 를 쓰는지(주석은 벗기고 본다)
  3. 허수 방지 — 들여다본 카드가 100장 밑이면 검사가 멈춘 것으로 본다

※ 본문 그림·히어로 그림은 보지 않는다 — 거기서는 설명이 값을 한다.
   이 검사는 **이름이 바로 옆에 있는 목록 카드**만 본다.

    python3 tools/check-alt-duplication.py
"""
from __future__ import annotations
import html as htmlmod
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'node_modules', '.git', '__pycache__', 'archi-diary', 'docs',
             'sales', 'silvia', 'scripts', 'tools', 'downloads', 'assets'}
MIN_CARDS = 100

LINK = re.compile(r'<a\b[^>]*class="[^"]*(?:article-card|featured-card|cp-card|brand-card)[^"]*"[^>]*>(.*?)</a>', re.S)
IMG = re.compile(r'<img[^>]*>')
ALT = re.compile(r'alt="([^"]*)"')
# ★ 처음에는 `<(h[1-6]|div)…</\\1>` 한 무늬로 둘을 같이 봤는데, **바깥 `div` 가
#   제목을 통째로 삼켜** 제목이 따로 검사되지 않았다 — 음성 시험이 통과해 버렸다.
#   담는 상자와 제목을 **다른 무늬로** 본다.
HEAD = re.compile(r'<(h[1-6])[^>]*>(.*?)</\1>', re.S)
NAME = re.compile(r'<div[^>]*class="[^"]*(?:cp-name|card-title|brand-card-name)[^"]*"[^>]*>(.*?)</div>', re.S)

# 코드가 그리는 카드 — (파일, 그 자리를 가리키는 조각, 빈 alt 여야 한다)
GENERATED = [
    ('trend-report.html',    r"esc\(img\) \+ '\" alt=\"\" loading"),
    ('category-products.js', r'src="\$\{pImageUrl\}" alt=""'),
    ('brands.html',          r'src="\$\{escapeHtml\(logo\)\}" alt=""'),
    ('brands/view.html',     r'src="\$\{pImageUrl\}" alt=""'),
    ('brands/view.html',     r'src="\$\{aImg\}" alt=""'),
    ('products/view.html',   r'src="\$\{rImageUrl\}" alt=""'),
    ('auth/profile.html',    r'src="\$\{pImageUrl\}" alt=""'),
    ('auth/profile.html',    r'src="\$\{bLogoUrl\}" alt=""'),
]


def strip_comments(t: str) -> str:
    t = re.sub(r'/\*[\s\S]*?\*/', '', t)
    t = re.sub(r'<!--[\s\S]*?-->', '', t)
    return t


def main() -> int:
    bad = []
    cards = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
            src = strip_comments(io.open(path, encoding='utf-8', errors='replace').read())
            for m in LINK.finditer(src):
                body = m.group(1)
                im = IMG.search(body)
                if not im:
                    continue
                cards += 1
                am = ALT.search(im.group(0))
                if not am:
                    bad.append((rel, '카드 그림에 alt 속성이 아예 없다'))
                    continue
                alt = htmlmod.unescape(am.group(1)).strip()
                if not alt:
                    continue
                titles = [hm.group(2) for hm in HEAD.finditer(body)]
                titles += [nm.group(1) for nm in NAME.finditer(body)]
                for raw in titles:
                    title = htmlmod.unescape(re.sub(r'<[^>]+>', '', raw)).strip()
                    if title and title == alt:
                        bad.append((rel, '대체글이 카드 제목과 똑같다 — 제목을 두 번 읽는다: 「%s」'
                                    % alt[:40]))
                        break

    for rel, pat in GENERATED:
        p = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.exists(p):
            bad.append((rel, '파일이 없다 — 검사기를 손봐야 한다'))
            continue
        t = strip_comments(io.open(p, encoding='utf-8', errors='replace').read())
        if not re.search(pat, t):
            bad.append((rel, '코드가 그리는 카드의 대체글이 비어 있지 않다 (%s)' % pat[:46]))

    if cards < MIN_CARDS:
        bad.append(('(검사 자체)', '카드를 %d장만 봤다 — %d장 밑이면 검사가 멈춘 것으로 본다'
                    % (cards, MIN_CARDS)))

    if bad:
        print('어긋남 %d건' % len(bad))
        for rel, why in bad[:40]:
            print('  · %-26s %s' % (rel, why))
        if len(bad) > 40:
            print('  … 그리고 %d건 더' % (len(bad) - 40))
        return 1

    print('목록 카드 대체글 — 카드 %d장, 제목을 두 번 말하는 자리 없음' % cards)
    return 0


if __name__ == '__main__':
    sys.exit(main())
