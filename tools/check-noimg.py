# -*- coding: utf-8 -*-
"""A-466 — 「사진 없음」 자리의 사본 6개가 갈리지 않는지 본다.

왜 검사가 필요한가: 이 조각은 공유 모듈이 없는 다섯 파일에 각각 박혀 있다.
전에는 여섯 자리가 전부 **아이콘만 있고 글자가 없었고**, 포털 한 자리는
영어 'No image' 였다(번역조차 없었다). 사본이 갈리면 하나만 고쳐진다 —
그게 이 저장소에서 반복된 실패다(A-458 · A-460).
"""
import io, os, sys, re

SNIP = ('<span class="noimg"><i class="fas fa-image" aria-hidden="true"></i>'
        '<span data-en="Photo coming soon" data-ko="사진 준비 중">'
        'Photo coming soon</span></span>')

EXPECT = {                     # 파일: 이 조각이 몇 번 나와야 하나
    'products/view.html': 2,   # 대표 사진 · 관련 제품 카드
    'brands/view.html': 1,     # 브랜드 페이지의 제품 카드
    'auth/profile.html': 1,    # 저장한 제품 카드
    'category-products.js': 1, # 카테고리 제품 격자
    'brand-portal/dashboard.html': 1,  # 포털 내 제품 목록
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = []

for rel, want in sorted(EXPECT.items()):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    got = s.count(SNIP)
    if got != want:
        bad.append('%s — 조각 %d개 (%d개여야 한다)' % (rel, got, want))
        # 갈린 사본을 찾아 준다
        for m in re.finditer(r"""'<(?:div|span|i)[^']*fa-(?:cube|image)[^']*'""", s):
            if SNIP not in m.group(0):
                bad.append('    갈린 사본: %s' % m.group(0)[:110])
    # 글자 없이 아이콘만 남은 자리
    for m in re.finditer(r"""'<(?:div|span|i)[^']*fa-(?:cube|image)[^']*'""", s):
        g = m.group(0)
        if 'data-ko=' not in g:
            bad.append('%s — 글자 없는 아이콘 자리: %s' % (rel, g[:110]))

# style.css 의 규칙이 살아 있나
css = io.open(os.path.join(ROOT, 'style.css'), encoding='utf-8').read()
for sel in ('body .noimg, body .cp-noimg {', 'body .noimg > span, body .cp-noimg > span {'):
    if sel not in css:
        bad.append('style.css — 규칙이 없다: %s' % sel)

print('검사함  「사진 없음」 자리 사본 %d개 · style.css 규칙 2개'
      % sum(EXPECT.values()))
if bad:
    print('\n어긋난 것 %d건:' % len(bad))
    for b in bad:
        print('  ' + b)
    sys.exit(1)
print('「사진 없음」 자리 검사 — 어긋난 것 없음')
