#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reCAPTCHA 를 늦게 싣고 있나 (A-584, 2026-11-17)

왜 있나:
  브론즈 42차 결함 C+H. 6쪽이 api.js 를 머리에서 바로 실어서, 폼을 건드리지도 않은
  손님에게 354.8KB(첫 화면 실측)를 보내고 localStorage 에 `_grecaptcha` 를 썼다.
  A-584 가 recaptcha-lazy.js(window.archiCaptcha)로 바꿨다.

  이 검사가 막는 되돌아감 세 가지:
    1) 어느 쪽이 api.js 를 다시 머리에 박는 것
    2) grecaptcha.execute 를 직접 부르는 것(늦게 싣는 길을 비껴간다)
    3) archiCaptcha 를 부르면서 recaptcha-lazy.js 를 안 싣는 것(폼이 조용히 죽는다)

    python3 tools/check-recaptcha-lazy.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'.git', 'node_modules', '.netlify', 'docs'}

EAGER = re.compile(r'<script[^>]+src=["\'][^"\']*recaptcha/api\.js', re.I)
DIRECT = re.compile(r'grecaptcha\s*\.\s*execute\s*\(')
CALLS = re.compile(r'\barchiCaptcha\s*\(')
LOADER = re.compile(r'<script[^>]+src=["\'][^"\']*recaptcha-lazy\.js', re.I)

def html_files():
    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in fs:
            if f.endswith('.html'):
                yield os.path.join(root, f)

def main():
    bad = []

    loader = os.path.join(ROOT, 'recaptcha-lazy.js')
    if not os.path.exists(loader):
        bad.append('recaptcha-lazy.js 가 없다 — 늦게 싣는 길 자체가 사라졌다')
    else:
        src = open(loader, encoding='utf-8').read()
        if 'window.archiCaptcha' not in src:
            bad.append('recaptcha-lazy.js 가 window.archiCaptcha 를 내놓지 않는다')
        if not re.search(r"addEventListener\(\s*'(focusin|input)'", src):
            bad.append('recaptcha-lazy.js 가 폼에 손이 닿는 것을 더는 안 듣는다 '
                       '— 그러면 보내기 단추에서 처음 싣느라 느려진다')

    n = 0
    for p in html_files():
        rel = os.path.relpath(p, ROOT)
        t = open(p, encoding='utf-8', errors='replace').read()
        n += 1
        if EAGER.search(t):
            bad.append('%s: api.js 를 바로 싣는다 — recaptcha-lazy.js 로 가야 한다' % rel)
        if DIRECT.search(t):
            bad.append('%s: grecaptcha.execute 를 직접 부른다 — archiCaptcha() 로 가야 한다' % rel)
        if CALLS.search(t) and not LOADER.search(t):
            bad.append('%s: archiCaptcha 를 부르는데 recaptcha-lazy.js 를 안 싣는다 '
                       '— 폼이 보낼 때 죽는다' % rel)

    # js 파일에서도 직접 호출을 본다(폼 로직이 js 로 빠질 수 있다)
    for root, dirs, fs in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in fs:
            if not f.endswith('.js') or f in ('recaptcha-lazy.js',):
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, ROOT)
            if rel.startswith('netlify' + os.sep):   # 서버쪽은 비밀키로 검증한다, 별개
                continue
            t = open(p, encoding='utf-8', errors='replace').read()
            if DIRECT.search(t):
                bad.append('%s: grecaptcha.execute 를 직접 부른다 — archiCaptcha() 로 가야 한다' % rel)
            if EAGER.search(t):
                bad.append('%s: api.js 를 바로 싣는다' % rel)

    if bad:
        print('reCAPTCHA 늦게 싣기: 어긋난 곳 %d' % len(bad))
        for b in bad:
            print('  - ' + b)
        return 1
    print('reCAPTCHA 늦게 싣기: html %d쪽 이상 없음' % n)
    return 0

if __name__ == '__main__':
    sys.exit(main())
