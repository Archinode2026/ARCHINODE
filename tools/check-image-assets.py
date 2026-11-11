# -*- coding: utf-8 -*-
"""A-469 — 화면이 요구하는 그림 파일이 **배포에 실제로 들어가는지** 본다.

왜 이 검사가 필요한가:
  A-462 에서 히어로 사진에 `srcset` 3단(600 · 1600 · 1800w)을 넣었다. 그런데
  `.gitignore` 44행이 `assets/photos/*-1800.jpg` 를 **일부러 제외**한다 —
  1800px 는 로컬 마스터이고 커밋하지 않는다는 결정이다. 그래서 라이브에서
  1800w 후보가 전부 404 였고, 넓은 화면(실효폭 1600px 초과 — 1133px·DPR 1.5
  노트북, 1920px 데스크톱, DPR 2 맥북 대부분)에서 **히어로 사진이 통째로 안 떴다**.
  srcset 후보가 404 면 브라우저는 다른 후보로 **물러나지 않는다** — 그 img 는 깨진다.
  파일은 디스크에 **있었다**. 그래서 「파일이 있나」만 보는 검사로는 절대 안 잡힌다.
  **git 이 추적하는가**를 봐야 한다. 그게 배포되는 것의 기준이다.

무엇을 보는가: 공개 HTML 의 `src` · `srcset`, style.css 의 `url(...)` 가 가리키는
저장소 안의 그림 파일이 전부 `git ls-files` 에 있는지.
"""
import io, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

tracked = set(
    subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split('\n')
)

EXT = ('.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif', '.ico')
want = {}        # 저장소 상대 경로 → 그걸 요구하는 파일들
checked_refs = 0


def note(url, where):
    global checked_refs
    u = url.split('?')[0].split('#')[0].strip()
    if not u or u.startswith(('http://', 'https://', 'data:', '//', 'mailto:')):
        return
    if not u.lower().endswith(EXT):
        return
    checked_refs += 1
    # 페이지가 있는 폴더 기준으로 푼다
    base = os.path.dirname(where)
    p = os.path.normpath(os.path.join(base, u.lstrip('/'))) if u.startswith('/') \
        else os.path.normpath(os.path.join(base, u))
    p = p.replace(os.sep, '/')
    if p.startswith('../'):      # 저장소 밖을 가리키면 그건 따로 결함이다
        want.setdefault('(저장소 밖) ' + u, set()).add(where)
        return
    want.setdefault(p, set()).add(where)


for dp, dn, fn in os.walk('.'):
    if any(x in dp for x in ('/.git', 'node_modules', './.git')):
        continue
    for f in sorted(fn):
        p = os.path.join(dp, f).replace(os.sep, '/').lstrip('./')
        if f.endswith('.html'):
            s = io.open(p, encoding='utf-8', errors='replace').read()
            for m in re.finditer(r'\ssrc="([^"]+)"', s):
                note(m.group(1), p)
            for m in re.finditer(r'\ssrcset="([^"]+)"', s):
                for part in m.group(1).split(','):
                    bits = part.strip().split()
                    if bits:
                        note(bits[0], p)
        elif f == 'style.css':
            s = io.open(p, encoding='utf-8', errors='replace').read()
            for m in re.finditer(r'url\(\s*[\'"]?([^\'")]+)', s):
                note(m.group(1), p)

missing = {k: v for k, v in want.items() if k not in tracked}

print('검사함  그림 참조 %d건 · 가리키는 파일 %d개 (git 추적 기준)'
      % (checked_refs, len(want)))

if missing:
    print('\n배포에 없는 그림 %d개:' % len(missing))
    for k, v in sorted(missing.items()):
        on_disk = os.path.exists(k)
        why = '디스크에는 있지만 git 이 추적하지 않는다 (.gitignore 확인)' if on_disk else '파일 자체가 없다'
        print('  %s' % k)
        print('     %s · %d개 화면에서 요구: %s' %
              (why, len(v), ', '.join(sorted(v)[:3])))
    sys.exit(1)

print('그림 자산 검사 — 전부 배포에 들어간다')
