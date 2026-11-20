#!/usr/bin/env python3
"""`.fade-in` 을 쓰면서 그것을 **열어 줄 것이 없는** 쪽 (A-653)

왜 만들었나
-----------
`style.css` 의 `.fade-in` 은 `opacity: 0` 으로 시작하고, 스크롤할 때
`IntersectionObserver` 가 `.visible` 을 붙여야 열린다. 그 관찰자는 공용 js 가
아니라 **각 쪽의 인라인 스크립트에 85벌 복사**돼 있다.

A-649 에서 index.html 의 브랜드 서비스 묶음을 for-brands.html 로 옮길 때
`fade-in` 클래스가 함께 왔는데, **for-brands.html 에는 그 관찰자가 없었다.**
결과: 제목과 카드 4장이 **영영 안 열렸다** — opacity 0.00 · 글자 526자 ·
348,000px² 가 391px 짜리 흰 띠로 남았다. 유럽 브랜드가 문을 열고 들어온 바로
그 쪽에서 **돈 내고 살 서비스 네 가지가 화면에 없었다.**
얄궂게도 **인쇄하면 보였다** — A-646 이 인쇄 블록에 `opacity:1 !important` 를
넣어 뒀기 때문이다. 종이에는 있고 화면에는 없는 상태였다. (브론즈 51차 N51-5)

무엇을 보나
-----------
쪽마다 세 가지를 보고, **셋 다 없으면** 실패로 올린다:
  ㄱ) 자기 쪽에서 `.fade-in` 의 `opacity` 를 1로 덮는가
      (brands/view.html·products/view.html 이 이렇게 한다 — 관찰자 없이
       순수 CSS 애니메이션. **정당한 자리다**)
  ㄴ) 인라인 `IntersectionObserver` 로 `visible` 을 붙이는가
  ㄷ) 그 일을 하는 공용 js 를 싣는가

★ 셈 전에 **HTML 주석과 CSS 주석을 둘 다 걷는다.** 안 걷으면 주석 속
  설명이 클래스로, 주석 처리된 덮어쓰기가 살아 있는 규칙으로 잡힌다.
  (A-619·A-641·A-651·A-652 에서 네 번 당했다)
★ JS 템플릿 문자열 안의 `fade-in` 도 센다 — 나중에 DOM 에 심어지면 같은 일이
  벌어지고, 그때는 데이터가 있어야 재현되니 브라우저로 잡기가 더 어렵다.
"""
import re, sys, os, glob

def strip_comments(t):
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return t

def styles_of(html):
    return '\n'.join(m.group(1) for m in re.finditer(r'<style[^>]*>(.*?)</style>', html, re.S))

def has_local_open(css):
    """자기 쪽에서 .fade-in 의 opacity 를 1(또는 0 아닌 값)로 두는가"""
    for m in re.finditer(r'([^{}]*\.fade-in[^{}]*)\{([^}]*)\}', css):
        op = re.search(r'opacity\s*:\s*([\d.]+)', m.group(2))
        if op and float(op.group(1)) > 0.05:
            return True
    return False

def has_observer(text):
    return bool(re.search(r'IntersectionObserver', text)) and bool(re.search(r'''['"]visible['"]''', text))

def main():
    root = os.environ.get('ARCHINODE_ROOT') or (sys.argv[1] if len(sys.argv) > 1 else '.')
    root = os.path.abspath(root)
    pages = sys.argv[2:] if len(sys.argv) > 2 else None
    if not pages:
        pages = sorted(os.path.relpath(p, root)
                       for p in glob.glob(os.path.join(root, '**', '*.html'), recursive=True))
        pages = [p for p in pages if not p.startswith('previews' + os.sep)]

    # 관찰자를 가진 공용 js
    shared = set()
    for j in glob.glob(os.path.join(root, '*.js')) + glob.glob(os.path.join(root, '*', '*.js')):
        try: t = strip_comments(open(j, encoding='utf-8', errors='replace').read())
        except OSError: continue
        if has_observer(t):
            shared.add(os.path.basename(j))

    bad, used = [], 0
    for rel in pages:
        try: raw = open(os.path.join(root, rel), encoding='utf-8', errors='replace').read()
        except OSError: continue
        s = strip_comments(raw)
        n = len(re.findall(r'\bfade-in\b', s))
        if not n:
            continue
        # 클래스로 쓰는지(규칙 선언만 있는 쪽은 제외)
        as_class = len(re.findall(r'''class\s*=\s*["'][^"']*\bfade-in\b''', s)) \
                 + len(re.findall(r'''fade-in[^"'{};]*["'`]''', s)) if False else \
                   len(re.findall(r'''class\s*=\s*["'`][^"'`]*\bfade-in\b''', s))
        if as_class == 0:
            continue
        used += 1
        if has_local_open(styles_of(s)):      continue   # ㄱ
        if has_observer(s):                   continue   # ㄴ
        if any(re.search(r'''src\s*=\s*["'][^"']*''' + re.escape(j), s) for j in shared):
            continue                                     # ㄷ
        bad.append((rel, as_class))

    print('fade-in 을 클래스로 쓰는 쪽 %d개 / 검사한 쪽 %d개' % (used, len(pages)))
    if shared:
        print('   관찰자를 가진 공용 js: %s' % ', '.join(sorted(shared)))
    if not bad:
        print('통과: 열어 줄 것이 없는 쪽 0개')
        return 0
    print('\n실패 — 이 쪽들의 fade-in 은 **영영 안 열린다**:')
    for rel, n in bad:
        print('   %-46s fade-in %d곳' % (rel, n))
    print('\n고치는 길 셋 중 하나:')
    print('   ㄱ) 그 쪽에서 fade-in 클래스를 뺀다 (A-653 에서 택한 길 — 내용이 바로 보인다)')
    print('   ㄴ) 그 쪽에 `.fade-in { opacity: 1; animation: fadeIn .6s ease-in; }` 를 둔다')
    print('      (brands/view.html·products/view.html 이 쓰는 방식)')
    print('   ㄷ) 관찰자를 싣는다 — 85쪽이 각자 복사해 둔 코드를 또 늘리는 길이라 권하지 않는다')
    return 1

if __name__ == '__main__':
    sys.exit(main())
