#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A-678 — check-magazine-tags.py 를 **일부러 깨서** 검증한다.

브론즈 55차가 「새 검사기 셋 중 둘에 자기 시험이 없다」고 지적했다. 맞다 —
손으로 깨 보고 결과만 적었고, 그 시험이 저장소에 남지 않았다.

되돌리기를 **해시로 확인**한다. 브론즈가 같은 회차에 깨기 하네스로 파일 하나를
깨진 채 남겼다(스스로 찾아 복구했다) — 백업 칸을 파일마다 하나씩 두고 `finally`
에서 되돌린 뒤 **sha256 이 같은지**까지 봐야 한다. 그래서 여기서는 그렇게 한다.
"""
from __future__ import annotations
import atexit, glob, hashlib, io, os, re, signal, subprocess, sys

# ★ A-678: 이 시험은 진짜 파일을 깨 보므로, **죽어도 되돌려야** 한다.
#   2026-11-24 에 `timeout 100` 이 이 시험을 중간에 죽였고 `finally` 가 안 돌아
#   `magazine/agm-thermroof-...html` 이 깨진 채 남았다(문의 기본 주소가 영문
#   주소로). 검사기가 다음 실행에서 잡아 줬지만, 시험이 저장소를 더럽히는 것은
#   시험의 결함이다. 그래서 백업을 전역에 쌓고 atexit 와 SIGTERM·SIGINT 에서
#   되돌린다 — `timeout` 은 SIGTERM 을 보낸다.

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHECKER = os.path.join(HERE, 'check-magazine-tags.py')

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

def sha(p):
    return hashlib.sha256(io.open(p, 'rb').read()).hexdigest()

def trial(label, rel, old, new, want_fail=True, want_text=None):
    """rel 파일에서 old 를 new 로 한 번 바꾸고 검사기를 돌린 뒤 **반드시 되돌린다**."""
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
            if want_fail and code == 0:
                bad.append('종료 0 — 안 잡았다')
            if not want_fail and code != 0:
                bad.append('종료 %d — 잡으면 안 되는데 잡았다' % code)
            if want_text and want_text not in out:
                bad.append('나와야 할 글자 없음: %s' % want_text)
    finally:
        io.open(p, 'wb').write(before)
        _BACKUPS.pop(p, None)
    if sha(p) != h0:
        bad.append('★ 되돌리기 실패 — 파일이 바뀐 채 남았다')
    code, _ = run()
    if code != 0:
        bad.append('★ 되돌린 뒤에도 검사가 실패한다')
    if bad:
        fails += 1
        print('   ✗ ' + label)
        for b in bad: print('       ' + b)
    else:
        print('   · ' + label)

def pick():
    """문 종류별 표본 하나와 문 없는 기사 하나."""
    doorA = nodoor = None
    for p in sorted(glob.glob(os.path.join(ROOT, 'magazine', '*.html'))):
        if p.endswith('view.html'): continue
        s = io.open(p, encoding='utf-8', errors='replace').read()
        if doorA is None and 'data-door="A"' in s: doorA = os.path.relpath(p, ROOT).replace(os.sep, '/')
        if nodoor is None and 'class="mg-door"' not in s: nodoor = os.path.relpath(p, ROOT).replace(os.sep, '/')
        if doorA and nodoor: break
    return doorA, nodoor

A, B = pick()
print('표본: 문 A = %s · 문 없음 = %s\n' % (A, B))

code, _ = run()
if code != 0:
    print('시작부터 검사가 실패한다 — 먼저 그걸 고쳐라'); sys.exit(1)

print('── 사본 갈라짐')
trial('기사 국문만 바꾸면 카드와 어긋남을 잡는다', A,
      'data-ko="마감재"', 'data-ko="마감 자재"', True, '기사와 카드가 다르다')

print('\n── 어휘 일대일')
trial('영문 하나에 국문 둘이 되면 잡는다', A,
      'data-en="Finishes" data-ko="마감재"', 'data-en="Market" data-ko="마감재"', True, '영문 하나에 국문이 여럿')

print('\n── 끝 메타')
trial('메타 국문만 영문으로 되돌리면 잡는다', A,
      '카테고리: 마감재', '카테고리: Finishes', True, '메타 국문 카테고리가 태그와 다르다')

print('\n── 문')
trial('문을 떼면 잡는다', A, '<aside class="mg-door"', '<aside class="mg-door-OFF"', True, '문이 없다')
trial('문 종류가 태그와 안 맞으면 잡는다', A, 'data-door="A"', 'data-door="C"', True, '문 종류가 태그와 안 맞는다')
trial('data-en-href 를 빼면 잡는다', A, ' data-en-href=', ' data-xx-href=', True, '문 링크에 data-en-href 가 없다')
trial('기본 href 가 국문 주소와 다르면 잡는다', A,
      'href="../sourcing-inquiry.html"\n', 'href="../for-brands.html"\n', True, '기본 href 가 국문 주소와 다르다')
trial('안 달기로 한 기사에 문이 생기면 잡는다', B,
      '<div class="article-meta-foot">',
      '<aside class="mg-door" data-door="A"><p data-en="x" data-ko="ㅌ">ㅌ</p>'
      '<a class="mg-door-cta" href="../sourcing-inquiry.html" data-ko-href="../sourcing-inquiry.html" '
      'data-en-href="../for-brands.html" data-en="x" data-ko="ㅌ">ㅌ</a></aside>'
      '<div class="article-meta-foot">', True, '문을 달지 않기로 한 태그에 문이 있다')

print('\n── A-678: 브론즈 55차가 「놓친다」고 지적한 셋')
trial('태그의 보이는 글자가 영문이면 잡는다', A,
      'data-ko="마감재">마감재</span>', 'data-ko="마감재">Finishes</span>', True,
      '태그의 보이는 글자가 국문이 아니다')
trial('문이 없는 파일을 가리키면 잡는다', A,
      'data-en-href="../for-brands.html"', 'data-en-href="../for-brands-NOPE.html"', True,
      '없는 파일을 가리킨다')
trial('문의 topic 이 허용 옵션이 아니면 잡는다', 'magazine/4th-basic-architecture-policy-plan-2026-2030.html',
      '?topic=market-entry', '?topic=아무값', True, '허용 옵션이 아니다')

print('\n── 덫: 조용해야 하는 것')
trial('태그 이름을 주석에만 적으면 조용하다', A,
      '<span class="tag"', '<!-- 전에는 class="tag" data-en="Market" 였다 --><span class="tag"', False)
trial('비슷한 클래스 이름에는 조용하다', A,
      '<aside class="mg-door"', '<div class="mg-door-note"></div><aside class="mg-door"', False)

print('')
if fails:
    print('실패: %d건 / %d건 중' % (fails, ran)); sys.exit(1)
print('통과: %d건 전부' % ran)
