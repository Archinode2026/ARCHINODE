#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-678 — check-page-shell.py 를 일부러 깨서 검증한다 (브론즈 55차 지적).

되돌리기를 sha256 으로 확인한다. 자세한 까닭은 tools/test-magazine-tags.py 머리말.
"""
from __future__ import annotations
import atexit, hashlib, io, os, signal, subprocess, sys

# ★ A-678: 이 시험은 진짜 파일을 깨 보므로, **죽어도 되돌려야** 한다.
#   2026-11-24 에 `timeout 100` 이 이 시험을 중간에 죽였고 `finally` 가 안 돌아
#   `magazine/agm-thermroof-...html` 이 깨진 채 남았다(문의 기본 주소가 영문
#   주소로). 검사기가 다음 실행에서 잡아 줬지만, 시험이 저장소를 더럽히는 것은
#   시험의 결함이다. 그래서 백업을 전역에 쌓고 atexit 와 SIGTERM·SIGINT 에서
#   되돌린다 — `timeout` 은 SIGTERM 을 보낸다.

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHECKER = os.path.join(HERE, 'check-page-shell.py')
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

def trial(label, rel, pairs, want_fail, want_text=None):
    """pairs: (old, new) 한 쌍이거나 쌍의 목록. 옛 낱말은 7종이므로 하나만
       바꾸면 나머지가 남아 「안 쓴다」가 안 된다 — 첫 시험에서 그걸로 틀렸다."""
    if isinstance(pairs, tuple):
        pairs = [pairs]
    global ran, fails
    ran += 1
    p = os.path.join(ROOT, rel)
    before = io.open(p, 'rb').read()
    _BACKUPS[p] = before
    h0 = hashlib.sha256(before).hexdigest()
    bad = []
    try:
        s = before.decode('utf-8')
        # 없는 쌍은 건너뛴다 — 「여러 클래스가 함께 적힌 꼴」은 쪽마다 있을 수도
        # 없을 수도 있다. 하나도 안 맞으면 그때 실패로 본다.
        hit = [(o, n) for o, n in pairs if s.count(o) >= 1]
        if not hit:
            bad.append('앵커를 하나도 못 찾음: %r …' % pairs[0][0][:40])
        else:
            t = s
            for o, n in hit:
                t = t.replace(o, n)
            io.open(p, 'w', encoding='utf-8').write(t)
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

code, _ = run()
if code != 0:
    print('시작부터 검사가 실패한다'); sys.exit(1)

print('── 옛 틀 낱말')
trial('다른 쪽에 옛 낱말을 넣으면 잡는다', 'terms.html',
      ('<footer', '<div class="footer-column"></div><footer'), True, '옛 틀로 만든 쪽이다: terms.html')
OLD7 = ['footer-column', 'footer-content', 'footer-copyright', 'footer-bottom-left',
        'search-bar', 'search-input', 'scroll-to-top']
trial('아는 쪽이 옛 낱말 **전부**를 버리면 묵은 명부로 알린다', 'privacy-en.html',
      [('class="%s"' % w, 'class="zz-%s"' % w) for w in OLD7]
      + [('class="%s ' % w, 'class="zz-%s ' % w) for w in OLD7], False, 'KNOWN 에서 치울 것')

print('\n── 덫: 조용해야 하는 것')
trial('비슷한 이름(my-footer-column)에는 조용하다', 'terms.html',
      ('<footer', '<div class="my-footer-column"></div><footer'), False)
trial('옛 낱말을 주석에만 적으면 조용하다', 'terms.html',
      ('<footer', '<!-- 전에는 class="footer-column" 이었다 --><footer'), False)
trial('스크립트 안 문자열의 옛 낱말에는 조용하다', 'terms.html',
      ('</body>', '<script>var x = \'class="footer-column"\';</script></body>'), False)

print('')
if fails:
    print('실패: %d건 / %d건 중' % (fails, ran)); sys.exit(1)
print('통과: %d건 전부' % ran)
