#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-681 — check-value-vocab.py 를 일부러 깨서 검증한다.

되돌리기는 sha256 으로 확인하고, **죽어도 되돌린다**(atexit · SIGTERM · SIGINT).
까닭은 tools/test-magazine-tags.py 머리말에 있다 — 2026-11-24 에 `timeout` 이
시험을 중간에 죽여 파일이 깨진 채 남은 일이 있었다.
"""
from __future__ import annotations
import atexit, hashlib, io, os, signal, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHECKER = os.path.join(HERE, 'check-value-vocab.py')
ran = fails = 0
_BACKUPS = {}

def _restore_all(*_a):
    for path, data in list(_BACKUPS.items()):
        try:
            io.open(path, 'wb').write(data)
        except Exception:
            pass
    _BACKUPS.clear()

atexit.register(_restore_all)
for _sig in (signal.SIGTERM, signal.SIGINT):
    try:
        signal.signal(_sig, lambda *_a: (_restore_all(), sys.exit(143)))
    except Exception:
        pass

def run():
    r = subprocess.run([sys.executable, '-I', CHECKER], capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout

def trial(label, rel, old, new, want_fail=True, want_text=None):
    global ran, fails
    ran += 1
    p = os.path.join(ROOT, rel)
    before = io.open(p, 'rb').read()
    _BACKUPS[p] = before
    h0 = hashlib.sha256(before).hexdigest()
    bad = []
    try:
        s = before.decode('utf-8')
        if s.count(old) < 1:
            bad.append('앵커를 못 찾음: %r' % old[:50])
        else:
            io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
            code, out = run()
            if want_fail and code == 0: bad.append('종료 0 — 안 잡았다')
            if not want_fail and code != 0: bad.append('종료 %d — 잡으면 안 되는데 잡았다' % code)
            if want_text and want_text not in out: bad.append('나와야 할 글자 없음: %s' % want_text)
    finally:
        io.open(p, 'wb').write(before)
        _BACKUPS.pop(p, None)
    if hashlib.sha256(io.open(p, 'rb').read()).hexdigest() != h0:
        bad.append('★ 되돌리기 실패')
    if run()[0] != 0:
        bad.append('★ 되돌린 뒤에도 검사가 실패한다')
    if bad:
        fails += 1; print('   ✗ ' + label)
        for b in bad: print('       ' + b)
    else:
        print('   · ' + label)

if run()[0] != 0:
    print('시작부터 검사가 실패한다 — 먼저 그걸 고쳐라'); sys.exit(1)

print('── 담는 값이 읽는 쪽에 없을 때')
trial('분류 지도를 소문자로 되돌리면 잡는다', 'admin/js/view-demand.js',
      "Furniture: '가구'", "furniture: '가구'", True, '담는 값이 「DMD_CAT_KO」에 없다')
trial('어드민 경로 지도에서 소싱을 빼면 잡는다', 'admin/js/view-leads.js',
      "    'sourcing-page': { en: 'Sourcing enquiry', ko: '소싱 문의' },\n", "",
      True, '담는 값이 「LEAD_SOURCES」에 없다')

print('\n── 담는 자리끼리 갈라질 때')
trial('업종 선택지를 한 폼만 바꾸면 잡는다', 'sourcing-inquiry.html',
      '<option value="dealer" data-en="Dealer / Distributor"',
      '<option value="reseller" data-en="Dealer / Distributor"', True, '담는 자리가 갈라졌다')

print('\n── 읽는 지도끼리 갈라질 때')
trial('추측 키가 한쪽만 다르면 잡는다', 'admin/js/view-demand.js',
      "'contact-page': '문의 폼', unknown", "'contact': '문의 폼', unknown",
      True, '읽는 지도가 갈라졌다')

print('\n── 해독기: 한 줄에 키가 여럿이어도 다 읽는가')
trial('한 줄의 둘째 키를 지워도 잡는다 (줄 맨 앞만 읽으면 못 잡는다)', 'admin/js/view-demand.js',
      "Furniture: '가구', Bathroom: '욕실'", "Furniture: '가구'", True,
      '담는 값이 「DMD_CAT_KO」에 없다')

print('\n── 덫: 조용해야 하는 것')
trial('값이 객체인 지도의 안쪽 키(en·ko)는 키로 세지 않는다', 'admin/js/view-leads.js',
      "{ en: 'Brand page',       ko: '브랜드 페이지' }",
      "{ en: 'Brand page', ko: '브랜드 페이지', note: 'x' }", False)
trial('주석에만 적힌 키는 세지 않는다', 'admin/js/view-demand.js',
      "var DMD_SRC_KO = {", "/* Spaceship: '우주선' */\nvar DMD_SRC_KO = {", False)

print('')
if fails:
    print('실패: %d건 / %d건 중' % (fails, ran)); sys.exit(1)
print('통과: %d건 전부' % ran)
