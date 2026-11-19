# -*- coding: utf-8 -*-
"""
공용 style.css 를 싣지 않는 페이지가 공용 처방을 놓쳤는지 본다.

왜 필요한가
-----------
`privacy-en.html` 은 사이트 머리띠·푸터 마크업을 그대로 쓰면서 `style.css` 를
싣지 않고 자체 `<style>` 로 선다. 그래서 공용으로 올린 처방이 **구조상 닿지
않는다.** 지금까지 다섯 번 따로 고쳐야 했다:

  A-312  푸터 체계
  A-321  푸터 내용 쓸기
  A-327  메뉴 분기 1100px + 햄버거 44x44
  A-340  푸터 접기
  A-385  머리띠 줄바꿈 (A-366·A-377 이 안 닿았다)

다섯 번 같은 자리에서 걸렸으면 여섯 번째가 있다. 눈으로 찾지 말고 이걸 돌린다.

A-382 와 같은 꼴의 결함이다 — 규칙을 세우고도 그 규칙이 닿지 않는 모양을
세지 않은 것. 그래서 이 검사는 「공용 처방 목록」을 들고 다닌다.

새 처방을 style.css 에 올릴 때
------------------------------
머리띠·푸터·메뉴처럼 모든 페이지가 공유하는 것을 고쳤다면 아래 RULES 에
한 줄 더해라. 그러면 다음 사람이 이 페이지를 잊어도 검사가 잡는다.

RULES 의 정규식은 반드시 실제 파일에 걸어 보고 넣어라. 이 도구를 처음
쓸 때 `.mobile-toggle` 을 `.menu-toggle` 로 적어 있지도 않은 결함을
보고했다 — 검사기의 오탐은 결함보다 나쁘다.

쓰기: python3 tools/check-standalone-css.py
      (어긋난 것이 있으면 종료 코드 1)
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 공용 처방 목록 — (라벨, CSS 에서 찾을 정규식, 이 마크업이 있을 때만 본다).
# 세 번째가 None 이면 늘 본다. 마크업이 없는 페이지에 처방을 요구하면
# **없는 결함을 보고하는 검사기**가 된다 — 그건 결함보다 나쁘다.
RULES = [
    ('메뉴 분기 1100px (A-275·A-327)',
     r'@media[^{]*max-width:\s*1100px', None),
    ('햄버거 최소 타깃 44px (A-286·A-327)',
     r'\.mobile-toggle\s*\{[^}]*min-width\s*:\s*44px', 'mobile-toggle'),
    ('머리띠 줄바꿈 (A-366·A-385)',
     r'\.header \.container\s*\{[^}]*flex-wrap\s*:\s*wrap', None),
    ('머리띠 높이 가변 (A-366·A-385)',
     r'\.header \.container\s*\{[^}]*height\s*:\s*auto', None),
    ('단추 묶음 오른쪽 (A-377)',
     r'\.header-actions\s*\{[^}]*margin-left\s*:\s*auto', None),
    ('푸터 접기 (A-340)',
     r'(?:details|summary)\s*[,{]', None),
    ('드롭다운 메뉴 (A-282 이후)',
     r'\.nav-dropdown-menu\s*\{', 'nav-dropdown-menu'),
    ('띠 링크 터치 타깃 44px (A-393)',
     r'\.announcement-bar a::after', 'announcement-bar'),
    ('「맨 위로」를 Netlify 배지 위로 (A-394)',
     r'\.scroll-top\s*\{[^}]*bottom\s*:\s*84px', 'scroll-top'),
    # A-513: 초점 고리는 두 겹이어야 어두운 사진 위에서도 보인다. style.css 를
    # 안 싣는 쪽은 브라우저 기본(검은 실선 하나)만 남아 그 자리가 다시 묻힌다.
    ('초점 고리 두 겹 (A-513)',
     r':focus-visible\s*\{[^}]*box-shadow', None),
    # A-641(브론즈 49차 N49-4): 이 쪽에는 `.skip-link:focus-visible` 만 있고
    # **바탕 규칙이 통째로 없어서** 「Skip to content」가 평상시에도 왼쪽 위에
    # 글자로 떠 있었다(실측 114x20 @ 0,2 — 1280·390 둘 다). 건너뛰기 링크는
    # 초점을 받기 전에는 안 보이는 것이 규약이다. `left:-9999px` 로 본다.
    ('건너뛰기 링크 숨김 (A-641)',
     r'\.skip-link\s*\{[^}]*left\s*:\s*-9999px', 'skip-link'),
    # A-641(N49-3): 이 쪽만 움직임 줄이기 설정을 안 들었다 — 자체 <style> 에
    # transition·animation 이 8개인데 reduce 블록은 0개였다. A-603 의 검사기는
    # **JS 의 smooth** 만 보므로 이 자리를 지나쳤다. CSS 쪽은 여기서 본다.
    ('움직임 줄이기 블록 (A-603·A-641)',
     r'@media[^{]*prefers-reduced-motion\s*:\s*reduce', None),
]

# 머리띠를 가졌다고 보는 표시
HEADER_MARKS = ('main-nav', 'header-actions')


def pages():
    out = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs
                   if d not in ('.git', 'node_modules', 'admin', 'assets', 'docs', 'tools')]
        for n in names:
            if n.endswith('.html'):
                out.append(os.path.join(base, n))
    return sorted(out)


def main():
    problems = []
    skipped = []
    checked = []

    for path in pages():
        rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
        try:
            src = io.open(path, encoding='utf-8', errors='replace').read()
            # 마크업 유무를 보는 gate 도 같은 이유로 HTML 주석을 걷는다
            src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
        except OSError:
            continue

        if re.search(r'<link[^>]+style\.css', src):
            continue  # 공용 CSS 를 싣는다 — 처방이 자동으로 닿는다

        # 리다이렉트 껍데기는 머리띠가 없다. 내용으로 판정한다.
        if re.search(r'http-equiv=["\']refresh|location\.replace', src):
            skipped.append((rel, '리다이렉트 껍데기'))
            continue

        if not any(m in src for m in HEADER_MARKS):
            skipped.append((rel, '공용 머리띠를 쓰지 않는다'))
            continue

        blocks = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
        if not blocks:
            problems.append((rel, 'style.css 도 안 싣고 자체 <style> 도 없다'))
            continue
        css = '\n'.join(blocks)
        # ★ A-641(2026-11-20): 여기서 **주석 덫**에 걸렸다. 처방 블록을 통째로
        #   `/* */` 안에 넣어 두고 검사를 돌렸더니 **통과했다** — 주석에 적힌
        #   규칙은 브라우저가 안 읽는데 검사기는 읽은 것이다. 처방 12종 전부가
        #   같은 구멍이었다. (A-619 에서도 같은 함정에 걸렸다: privacy-en.html 의
        #   HTML 주석에 적힌 「style.css」를 「싣는다」로 읽었다. 두 번째다 —
        #   **문자열로 세는 검사기는 반드시 주석을 먼저 걷어내라.**)
        css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

        missing = [label for label, pat, needs in RULES
                   if (needs is None or needs in src)
                   and not re.search(pat, css, re.S | re.I)]
        applies = sum(1 for _, _, needs in RULES if needs is None or needs in src)
        checked.append((rel, applies - len(missing), applies))
        for label in missing:
            problems.append((rel, '공용 처방 누락 — ' + label))

    for rel, reason in skipped:
        print('건너뜀  %s — %s' % (rel, reason))
    for rel, ok, total in checked:
        print('검사함  %s — 공용 처방 %d/%d' % (rel, ok, total))

    if problems:
        print('')
        for rel, what in problems:
            print('어긋남  %s' % rel)
            print('        %s' % what)
        print('')
        print('style.css 를 안 싣는 페이지다. 공용으로 올린 처방이 여기엔 닿지')
        print('않으므로 이 파일의 <style> 안에 같은 규칙을 따로 넣어야 한다.')
        return 1

    print('')
    print('독립 CSS 페이지 검사 — 어긋난 것 없음 (처방 %d종)' % len(RULES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
