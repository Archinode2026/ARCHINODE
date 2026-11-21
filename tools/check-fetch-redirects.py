#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""코드가 가져오는 경로가 `_redirects` 에 **막혀 있는지** (A-658)

왜 있나
-------
어드민의 「규정집」 화면은 `../docs/ARCHINODE 규정집.md` 를 fetch 한다.
그런데 `_redirects` 에는 `/docs/* → /404.html 404!` 가 있다. **force 규칙**이라
실제 파일이 있어도 404 가 나간다(A-285). 그래서 그 화면은 **라이브에서
구조적으로 작동할 수 없다** — 세 탭(규정집·작업일지·검수대장) 전부.

두 결정이 각각 맞으면서 서로를 깨뜨린 자리다:
  · `6cce1d40` 어드민 개편 3단계 — 규정집 뷰어를 만들었다
  · `6e80266e` A-126 보안 수정 — 내부 운영 문서·도구의 공개 노출을 막았다
보안 쪽이 맞고, 뷰어의 **접근 방식**이 틀렸다(내부 문서를 공개 웹 루트에서
가져오려 했다). 그런데 **검사기 51개 중 아무도 못 잡았다** — 코드가 가져오는
경로와 `_redirects` 가 막는 경로를 맞춰 보는 검사가 없었다.

어떻게 보나
-----------
  ㄱ) `_redirects` 에서 **force 규칙**(끝이 `!`)만 모은다. force 가 아니면
      실제 파일이 이긴다(A-285) — 그건 막는 게 아니다.
  ㄴ) 코드가 가져오는 **상대 경로**를 모은다. ★ `fetch()` 의 상대 경로는
      **스크립트 파일이 아니라 그 스크립트를 실은 HTML 문서** 기준으로 풀린다.
      그래서 `admin/js/view-regulations.js` 의 `../docs/X.md` 는
      `/admin/docs/X.md` 가 아니라 `/docs/X.md` 다. 처음에 스크립트 위치로
      풀었다가 「막히는 것 0개」라는 틀린 답을 얻었다.
  ㄷ) `<script src="js/x.js?v=20261104g">` 의 **`?v=` 캐시 버스터를 뗀다.**
      안 떼면 그 파일이 없다고 보고 **그 스크립트를 통째로 건너뛴다** —
      이것 때문에도 한 번 「0개」가 나왔다.
  ㄹ) 셈 전에 주석을 걷는다. 줄 번호를 지키려고 주석을 같은 수의 줄바꿈으로
      바꾼다(check-form-consent.py 와 같은 방식).
"""
import re
import os
import sys
import glob
import posixpath

ROOT = os.environ.get('ARCHINODE_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = ('previews/', 'assets/vendor/')


def strip_comments(s):
    """주석을 **줄 수를 지키며** 지운다 — 줄 번호를 보고해야 한다."""
    s = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'(?m)^[ \t]*//[^\n]*$', '', s)
    return s


def read(rel):
    try:
        return open(os.path.join(ROOT, rel), encoding='utf-8', errors='replace').read()
    except OSError:
        return ''


def force_rules():
    """끝이 `!` 인 규칙만. force 가 아니면 실제 파일이 이긴다(A-285)."""
    out = []
    txt = read('_redirects')
    for ln, line in enumerate(txt.splitlines(), 1):
        t = line.strip()
        if not t or t.startswith('#'):
            continue
        parts = t.split()
        if len(parts) >= 3 and parts[-1].endswith('!'):
            out.append((ln, parts[0], parts[-1]))
    return out


def blocked(path, rules):
    for ln, frm, code in rules:
        if frm.endswith('/*'):
            if path.startswith(frm[:-1]):
                return (ln, frm, code)
        elif frm == path:
            return (ln, frm, code)
    return None


# ── 결정 대기 ──────────────────────────────────────────────────────────────
# 이미 알고 있고 **승리님 결정을 기다리는** 자리. 늘 실패하는 검사는 사람이
# 무시하게 되므로, 아는 것은 「대기」로 적어 두고 **새로 생기는 것만** 실패로
# 올린다. 결정이 나면 이 항목을 지운다 — 지우지 않으면 고친 뒤에도 조용하다.
# 각 줄에 **왜 대기인지**와 대장 번호를 적는다. 이유 없는 대기는 두지 않는다.
PENDING = {
    ('admin/js/view-regulations.js', '../docs/ARCHINODE 규정집.md'):
        'A-658 — 어드민 규정집 뷰어. 보안(A-126)이 /docs/* 를 막은 것이 맞고, 뷰어의 '
        '접근 방식이 틀렸다. 화면을 뗄지, 인증 확인 함수로 서빙할지는 승리님 결정.',
    ('admin/js/view-regulations.js', '../docs/작업일지.md'):
        'A-658 — 같은 화면의 둘째 탭.',
    ('admin/js/view-regulations.js', '../docs/검수대장.md'):
        'A-658 — 같은 화면의 셋째 탭.',
}

FETCH_RE = re.compile(r"""(?:fetch|\.open)\s*\(\s*(?:[A-Za-z_$][\w$]*\(\s*)?['"]([^'"]+)['"]""")
ASSET_RE = re.compile(r"""['"](\.{1,2}/[^'"]*\.(?:md|json|csv|txt|xml))['"]""")


def urls_in(txt):
    """가져올 것으로 보이는 상대 경로와 줄 번호. 변수로 조립한 경로는
    배열·상수에 적힌 리터럴로 잡는다(REG_FILES 가 그 꼴이다)."""
    out = []
    for rx in (FETCH_RE, ASSET_RE):
        for m in rx.finditer(txt):
            url = m.group(1)
            if url.startswith(('http://', 'https://', '//', 'data:', 'blob:', 'mailto:', '#')):
                continue
            out.append((url, txt[:m.start()].count('\n') + 1))
    return out


def main() -> int:
    rules = force_rules()
    if not rules:
        print('실패: _redirects 에서 force 규칙을 하나도 못 읽었다 (파일이 비었거나 형식이 바뀌었다)')
        return 1

    pages = sorted(p.replace(os.sep, '/') for p in
                   glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True))
    pages = [os.path.relpath(os.path.join(ROOT, p), ROOT).replace(os.sep, '/') if os.path.isabs(p)
             else os.path.relpath(p, ROOT).replace(os.sep, '/') for p in pages]
    pages = [p for p in pages if not any(p.startswith(d) for d in SKIP_DIRS)]

    # 어느 쪽이 어느 스크립트를 싣나
    loaders = {}
    for p in pages:
        s = strip_comments(read(p))
        for m in re.finditer(r"""<script[^>]*src\s*=\s*['"]([^'"]+)['"]""", s):
            src = m.group(1)
            if src.startswith(('http://', 'https://', '//')):
                continue
            src = src.split('?')[0].split('#')[0]          # ㄷ) 캐시 버스터
            js = posixpath.normpath(posixpath.join(posixpath.dirname('/' + p), src)).lstrip('/')
            loaders.setdefault(js, set()).add(p)

    bad, checked = [], 0

    # ① 바깥 js — **그것을 싣는 쪽**의 위치로 푼다
    for js, hosts in sorted(loaders.items()):
        if any(js.startswith(d) for d in SKIP_DIRS) or '/node_modules/' in js:
            continue
        if not os.path.exists(os.path.join(ROOT, js)):
            continue
        txt = strip_comments(read(js))
        for url, ln in urls_in(txt):
            for host in sorted(hosts):
                res = posixpath.normpath(posixpath.join(posixpath.dirname('/' + host), url))
                checked += 1
                b = blocked(res, rules)
                if b:
                    bad.append((js, ln, url, host, res, b))

    # ② 쪽 안의 인라인 스크립트
    for p in pages:
        txt = strip_comments(read(p))
        for url, ln in urls_in(txt):
            res = posixpath.normpath(posixpath.join(posixpath.dirname('/' + p), url))
            checked += 1
            b = blocked(res, rules)
            if b:
                bad.append((p, ln, url, p, res, b))

    # 아는 것과 새로 생긴 것을 가른다
    waiting = [b for b in bad if (b[0], b[2]) in PENDING]
    fresh   = [b for b in bad if (b[0], b[2]) not in PENDING]
    # 대기 목록에 적혔는데 **이제 안 걸리는** 것 — 고쳐졌다는 뜻이니 알려 준다
    still = set((b[0], b[2]) for b in bad)
    stale = [k for k in PENDING if k not in still]

    print('force 규칙 %d개 · 가져오는 자리 %d개(싣는 쪽 조합 포함) 확인' % (len(rules), checked))
    if waiting:
        seen_w = set()
        print('')
        print('  ※ **승리님 결정 대기** %d자리 (새로 생긴 것이 아니라 아는 것):' % len(waiting))
        for js, ln, url, host, res, (rln, frm, code) in waiting:
            if (js, url) in seen_w:
                continue
            seen_w.add((js, url))
            print('     %s:%d  %s  ← _redirects:%d %s' % (js, ln, url, rln, frm))
        first = PENDING[(waiting[0][0], waiting[0][2])]
        print('     까닭: %s' % first)
    if stale:
        print('')
        print('  ※ 대기 목록에 적혔는데 이제 안 걸린다 — 고쳐졌으면 PENDING 에서 지워 주세요:')
        for js, url in stale:
            print('     %s  %s' % (js, url))
    if not fresh:
        if waiting:
            print('')
            print('통과(새로 생긴 것 없음) — 아는 %d자리는 결정 대기다.' % len(set((b[0], b[2]) for b in waiting)))
        else:
            print('통과: 막힌 경로를 가져오는 코드 0개')
        return 0
    bad = fresh

    seen, shown = set(), 0
    print('\n실패 — 이 코드는 **라이브에서 구조적으로 작동할 수 없다**:')
    for js, ln, url, host, res, (rln, frm, code) in bad:
        k = (js, url)
        if k in seen:
            continue
        seen.add(k)
        shown += 1
        print('   %s:%d' % (js, ln))
        print('      가져오려는 것 : %s' % url)
        print('      싣는 쪽       : %s' % host)
        print('      사이트 경로   : %s' % res)
        print('      막는 규칙     : _redirects:%d   %s … %s' % (rln, frm, code))
    print('\n   막힌 경로를 가져오는 자리 %d개.' % shown)
    print('   고치는 길은 둘 중 하나다 — 규칙을 푸는 것이 **아니라**:')
    print('     ㄱ) 그 화면을 뗀다 (문서는 저장소에 있다)')
    print('     ㄴ) 인증을 확인하는 함수를 통해 서빙한다 (공개 경로는 계속 막은 채로)')
    print('   force 규칙이 보안 결정일 때 그것을 푸는 것은 답이 아니다 (A-126).')
    return 1


if __name__ == '__main__':
    sys.exit(main())
