#!/usr/bin/env python3
"""A-609: firebase 가 안 내려온 쪽에서 auth·db·storage 가 TDZ 에 갇히지 않는지 본다.

갇히면 다른 파일의 `typeof db === 'undefined'` 방어조차 ReferenceError 를 던져
손님 화면이 조용히 멈춘다(실측: 30초 빈칸). 그래서 두 가지를 센다.
  1) 전역 auth·db·storage 가 const/let 으로 선언돼 있지 않은가 (var 여야 호이스팅된다)
  2) initializeApp 호출이 try 안에 있는가
"""
import os, re, sys

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(SRC, 'firebase-config.js')

def strip_comments(s):
    # 제 설명문이 검사에 걸리지 않게 줄 수를 지키며 지운다 (A-492·A-531·A-604·A-606 의 함정)
    s = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)

def main():
    if not os.path.exists(P):
        print('검사 못함  firebase-config.js 가 없다'); return 1
    raw = open(P, encoding='utf-8').read()
    src = strip_comments(raw)
    bad = []

    for name in ('auth', 'db', 'storage'):
        m = re.search(r'^\s*(const|let)\s+[^;\n]*\b%s\b' % name, src, re.M)
        if m:
            bad.append('전역 %s 가 %s 로 선언돼 있다 — firebase 가 안 내려오면 TDZ 에 갇힌다' % (name, m.group(1)))

    decl = re.search(r'^\s*var\s+([^;\n]+);', src, re.M)
    declared = set(re.findall(r'\b(auth|db|storage)\b', decl.group(1))) if decl else set()
    missing = {'auth', 'db', 'storage'} - declared
    if missing:
        bad.append('var 선언에 빠진 것: %s' % ', '.join(sorted(missing)))

    init = src.find('initializeApp(')
    if init < 0:
        bad.append('initializeApp 호출을 못 찾았다')
    else:
        before = src[:init]
        if before.count('try') <= before.count('catch'):
            bad.append('initializeApp 이 try 밖에 있다 — 던지면 스크립트가 끊긴다')

    print('검사함  전역 선언 3개(auth·db·storage) · initializeApp 1곳')
    if bad:
        for b in bad: print('  결함 —', b)
        return 1
    print('TDZ 위험 — 없음')
    return 0

sys.exit(main())
