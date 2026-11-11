# -*- coding: utf-8 -*-
"""A-476 — 사이트맵이 스스로와 모순되지 않는지 본다.

왜 이 검사가 필요한가:
  2026-11-11 에 `scripts/make_sitemap.py` 를 다시 돌렸더니
  **`products/bim-download.html`(`noindex, nofollow`)이 들어갔다.** 사이트맵은
  「색인해라」, 페이지는 「하지 마라」 — 모순이고 구글 서치콘솔이 오류로 잡는다.
  또 「`view.html` 라우터는 제외」 규칙이 `priority_for` 의 **한 분기에만** 있어서
  `products/view.html` 만 들어가 있었다 — 빈 껍데기가 색인되는 자리다.
  (사본·분기가 갈려 하나만 적용되는 모양, 이 저장소에서 반복됐다.)

보는 것:
  ① 모든 `<loc>` 이 실제 파일을 가리킨다
  ② `noindex` 를 선언한 페이지가 섞여 있지 않다
  ③ `view.html` 라우터가 없다 (쿼리 없이는 빈 껍데기다)
  ④ `404.html` 이 없다
  ⑤ 중복 주소가 없다 · XML 이 파싱된다
  ⑥ 거꾸로 — 색인 가능한 공개 페이지가 빠져 있지 않다
"""
import io, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

BASE = 'https://archinodekr.com/'
NOINDEX = re.compile(r'<meta\s+name="robots"\s+content="[^"]*noindex', re.I)
# 공개가 아닌 폴더 (사이트맵 생성기의 EXCLUDE_DIRS 와 같은 뜻)
PRIVATE = ('admin/', 'auth/', 'brand-portal/', 'downloads/', 'archi-diary/',
           'docs/', 'tools/', 'scripts/', 'sales/', 'silvia/', 'node_modules/')

bad = []

try:
    tree = ET.parse('sitemap.xml')
except Exception as e:
    print('sitemap.xml 을 파싱하지 못했다: %s' % e)
    sys.exit(1)

ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
locs = [e.text.strip() for e in tree.getroot().iter('{%s}loc' % ns['s'])]

if not locs:
    bad.append('사이트맵에 <loc> 이 하나도 없다')

seen = {}
for u in locs:
    if not u.startswith(BASE):
        bad.append('주소가 %s 로 시작하지 않는다: %s' % (BASE, u)); continue
    rel = u[len(BASE):] or 'index.html'
    seen[rel] = seen.get(rel, 0) + 1
    if not os.path.exists(rel):
        bad.append('%s — 가리키는 파일이 없다' % rel); continue
    s = io.open(rel, encoding='utf-8', errors='replace').read()
    if NOINDEX.search(s):
        bad.append('%s — noindex 를 선언한 페이지가 사이트맵에 있다 (모순)' % rel)
    if os.path.basename(rel) == 'view.html':
        bad.append('%s — 라우터는 사이트맵에 넣지 않는다 (쿼리 없이는 빈 껍데기)' % rel)
    if os.path.basename(rel) == '404.html':
        bad.append('%s — 오류 화면은 사이트맵에 넣지 않는다' % rel)

for rel, n in sorted(seen.items()):
    if n > 1:
        bad.append('%s — 중복 %d번' % (rel, n))

# ⑥ 거꾸로: 색인 가능한 공개 페이지가 빠졌나
missing = []
for dp, dn, fn in os.walk('.'):
    rel_dir = os.path.relpath(dp).replace(os.sep, '/').lstrip('./')
    if rel_dir == '.':
        rel_dir = ''
    if any((rel_dir + '/').startswith(x) or ('/' + x) in ('/' + rel_dir + '/') for x in PRIVATE):
        continue
    if '.git' in dp or 'backup' in dp:
        continue
    for f in sorted(fn):
        if not f.endswith('.html'):
            continue
        rel = (rel_dir + '/' + f).lstrip('/')
        if rel in seen:
            continue
        if f in ('404.html', 'view.html'):
            continue
        s = io.open(rel, encoding='utf-8', errors='replace').read()
        if NOINDEX.search(s):
            continue
        missing.append(rel)
for m in missing:
    bad.append('%s — 색인 가능한 공개 페이지인데 사이트맵에 없다' % m)

print('검사함  사이트맵 항목 %d개 · 파일 존재·noindex·라우터·중복·누락' % len(locs))

if bad:
    print('\n어긋난 것 %d건:' % len(bad))
    for b in bad:
        print('  ' + b)
    sys.exit(1)

print('사이트맵 — 모순 없음')
