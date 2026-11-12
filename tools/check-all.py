#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ARCHINODE 검사 모음 — 있는 검사를 한 번에 돌린다.

    python3 tools/check-all.py          → 어긋난 것이 있으면 종료 코드 1
    python3 tools/check-all.py --list   → 무엇을 돌리는지만 보여 준다

왜 필요한가 (A-406)
-------------------
2026-11-09 에 세어 보니 검사·시험 도구가 **여덟 개**였고 두 폴더에
흩어져 있었다(`scripts/` 넷, `tools/` 넷). 그런데 **배포 경로(`tools/deploy.ps1`)에
묶여 있던 것은 `check_escaping.py` 하나**였다. 나머지 일곱은 **사람이
기억해야** 돌았다.

A-329 → A-385 에서 이미 같은 실패를 겪었다: 사각지대를 적어 두고
「다음부터 확인하자」로 남기면 그 사각지대는 그대로 있다. 검사를 만들어도
**부르는 자리가 없으면 똑같다.**

그리고 그날 돌려 보니 **`check_escaping.py` 가 실제로 어긋나 있었다** —
주석 한 줄 때문에 오탐이었고(A-405 에서 고쳤다), `deploy.ps1` 로 배포하면
멀쩡한 저장소에서 push 가 막히는 상태였다. 아무도 몰랐던 이유는
승리님이 `git push` 로 직접 밀기 때문이다. **부르지 않는 검사는 틀린 채로
썩는다.**

검사를 새로 만들면
------------------
아래 CHECKS 에 한 줄 더해라. 그게 작업의 일부다.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (이름, 실행기, 경로, 왜 있는가)
#   실행기: 'py' = 이 파이썬, 'node' = node
CHECKS = [
    ('이스케이프 계약',      'py',   'scripts/check_escaping.py',
     'A-167 · A-405 — 두 번 이스케이프된 엔티티, 평문 JSON 에 섞인 엔티티'),
    ('언어 규약',            'py',   'tools/check-lang-contract.py',
     'A-362 ~ A-402 — 다시 칠하기 · 짝 · 돈·딜러 문구 · 막다른 링크 (검사 8종)'),
    ('독립 CSS 페이지',      'py',   'tools/check-standalone-css.py',
     'A-385 — style.css 를 안 싣는 페이지가 공용 처방을 놓쳤는지'),
    ('검색 회귀',            'node', 'tools/test-search.js',
     'A-397 · A-401 · A-402 — 배열 category · 언어 판정 · 색인 설명'),
    ('카테고리 이름 사본',    'py',   'tools/check-category-labels.py',
     'A-407 — 세 곳의 대응표가 카테고리 페이지의 두 언어 h1 과 맞는지'),
    ('죽은 미디어 규칙',      'py',   'tools/check-css-cascade.py',
     'A-411 — @media 안의 수정이 뒤쪽 기본 규칙에 덮여 죽지 않았는지'),
    ('포털 카테고리 왕복',    'node', 'tools/test-bp-category.js',
     'A-415 — brands.category 는 배열이다. 저장이 그걸 지우지 않는지'),
    ('로그인 갈림길',        'node', 'tools/test-login-gate.js',
     'A-422 — 방금 로그인한 사람은 안내 화면이 아니라 목적지로 간다'),
    ('규칙 불변 비교',        'py',   'scripts/check_rules_immutable.py',
     'A-441 — 없는 필드를 비교하는 불변 검사(문서에 그 필드가 없으면 소유자가 아무것도 못 고친다)'),
    ('브랜드 머리글자',       'node', 'tools/test-brand-initial.js',
     'A-444 — 사본 둘이 같은 답을 내는지 · 호출부가 원시 이름을 주는지(&Tradition 이 & 로 찍혔다)'),
    ('「사진 없음」 자리',     'py',   'tools/check-noimg.py',
     'A-466 — 사진 없는 자리의 사본 6개가 같은 글자를 말하는지(전에는 여섯 다 글자가 없었다)'),
    ('포털 제품 수정',        'node', 'tools/test-bp-product-edit.js',
     'A-467 — 채우기 순서(카테고리→하위) · 폼 비우기 15칸 · 사진 URL 스킴'),
    ('basePath 사본',        'node', 'tools/test-basepath.js',
     'A-468 — 폴더를 나열하지 않고 세는지. 사본 둘(search.js · category-products.js)이 같은 답인지'),
    ('그림 자산 배포',        'py',   'tools/check-image-assets.py',
     'A-469 — src·srcset·url() 이 가리키는 그림이 git 에 있는지(디스크에 있어도 .gitignore 면 배포 안 된다)'),
    ('소분류 이름 여섯 자리',  'py',   'tools/check-subcategory-names.py',
     'A-470 — 한 페이지 안의 title·og:title·JSON-LD·빵부스러기 + 부모 카드 + 색인이 h1 과 같은지(&amp; 무관)'),
    ('날값 꽂기(출력 XSS)',   'py',   'tools/check-raw-interpolation.py',
     'A-471 — 자료를 그리는 사본 6개가 브랜드 입력을 이스케이프 없이 innerHTML 에 꽂지 않는지. Playwright 불필요'),
    ('로딩 감시견',          'node', 'tools/test-loading-watchdog.js',
     'A-475 — window.auth 로 보면 멀쩡한 화면에서 거짓 실패를 띄운다(const 는 window 속성이 아니다) · 12화면이 싣는지'),
    ('사이트맵 모순',        'py',   'tools/check-sitemap.py',
     'A-476 — noindex 페이지·view.html 라우터가 섞였나 · 색인 가능한 페이지가 빠졌나 · 중복'),
    ('임시 비밀번호',        'node', 'tools/test-temp-password.js',
     'A-477 — 공개 정보(브랜드명·날짜)에서 유도되지 않는지 · Math.random 이 아닌 crypto 인지'),
    ('담당자 개인정보 분리',  'py',   'tools/check-brand-contact.py',
     'A-480 — 공개 brands 문서에 담당자 이름·이메일·전화가 되돌아오거나, 병합 없이 읽어 화면이 조용히 비는지'),
    ('리드 내부기록 분리',    'py',   'tools/check-lead-internal.py',
     'A-481 — 어드민 메모·어드민 이메일이 배정된 브랜드가 읽는 리드 문서로 되돌아오는지 · history 축소 금지'),
    ('좋아요 카운터',        'py',   'tools/check-like-toggle.py',
     'A-482 — 카운터가 내 목록의 변화에 묶여 있는지(규칙의 getAfter + 클라이언트의 한 묶음 쓰기)'),
    ('자료 파일 분리',       'py',   'tools/check-product-files.py',
     'A-483 — 카탈로그·BIM·3D 의 다운로드 URL 이 공개 제품 문서로 돌아오는지 · Storage 경로 훑기'),
    ('업로드 형식 통제',      'py',   'tools/check-upload-types.py',
     'A-484 — 인증서는 PDF·사진만 · 자료 파일은 다운로드 강제(제품 사진에는 붙지 않게)'),
    ('공개 쓰기 울타리',      'py',   'tools/check-public-write-limits.py',
     'A-485~488 — 공개 폼의 키 목록·길이 상한(규칙과 폼 대조) · 없는 필드 읽기 · 기본 confirm · 검색 주소'),
    ('안내문 이중언어',      'py',   'tools/check-bilingual-messages.py',
     'A-492 — 공개 페이지의 손님용 안내가 영어로만 심기는지(data-en/data-ko 를 함께 다는지)'),
    ('디지털 상품 구매',     'node', 'tools/test-digital-products.js',
     'A-501 · A-504 — 결제 주소가 PayPal 인지 · 상품 글 이스케이프 · 동의 전 결제 단추 잠김 · 맛보기 없는 상품은 팔지 않는지 · 복귀 페이지가 결제를 단정하지 않는지'),
    ('목록 카드 대체글',      'py',   'tools/check-alt-duplication.py',
     'A-514 — 그림 대체글이 바로 옆 제목과 글자까지 같으면 읽어 주는 도구가 제목을 두 번 말한다. 눈으로는 안 보인다'),
    ('키보드 길잡이',        'node', 'tools/test-a11y-nav.js',
     'A-513 — 모바일 메뉴가 열려도 Tab 이 안으로 못 들어갔다(차례가 거꾸로다) · 초점 고리가 어두운 사진 위에서 묻혔다'),
    ('죽은 단추',            'py',   'tools/check-dead-buttons.py',
     'A-512 — onclick 이 부르는 이름이 그 페이지에서 닿는지. 머리글은 240벌로 복사되는데 손잡이는 안 따라올 수 있다'),
    ('검색 색인 묵음',        'py',   'tools/check-search-index.py',
     'A-508 — 만들어 두고 커밋하는 물건이라 안 돌리면 조용히 묵는다. 사이트맵의 공개 페이지를 빠뜨렸는지도 본다'),
    ('목록 끊김',            'node', 'tools/test-list-paging.js',
     'A-506 — 카테고리 69페이지와 글 목록이 24개에서 아무 말 없이 끊기던 자리. 한 개를 더 불러 다음 쪽이 있는지 알아내고, 넘친 한 개를 그리지 않는지'),
    ('사업자 신원 표시',      'py',   'tools/check-biz-info.py',
     'A-503 — 234벌로 복사된 푸터에 상호·사업자등록번호·통신판매업 신고번호·주소·이메일이 **같은 값으로** 다 있는지(전자상거래법 제13조)'),
]

# Playwright 가 있어야 도는 것들 — 없으면 건너뛴다(실패가 아니다)
#
# ★ 2026-11-09: 이 셋은 **만들어진 뒤 한 번도 실제로 돌아간 적이 없었다.**
#   승리님 기계에서는 `cdn.playwright.dev` 가 막혀 크로미움을 못 받는다.
#   돌리는 법 — 클라우드 컨테이너 쪽에 크로미움이 있으므로 저장소를 타르로 가져가서:
#
#     (사이트 루트에서) python3 -m http.server 8321 &
#     ARCHINODE_ROOT=<루트> python3 scripts/check_narrow_width.py --base http://127.0.0.1:8321 --widths 360,390
#     ARCHINODE_ROOT=<루트> python3 scripts/check_xss_output.py http://127.0.0.1:8321
#       ↑ 주소를 **위치 인수**로 받는다(`--base` 가 아니다). `--base` 를 주면 그 글자가
#         주소가 되어 27화면이 전부 `Protocol error: Cannot navigate` 로 열리지 않는다.
#         2026-11-10 에 내가 그렇게 돌려서 한 번 헛돌았다.
#     ARCHINODE_ROOT=<루트> python3 scripts/check_hover_contrast.py index.html brands.html ...
#     ARCHINODE_ROOT=<루트> python3 scripts/check_search_overlay.py http://127.0.0.1:8321
#       ↑ 이것도 주소를 위치 인수로 받는다. 오버레이를 **열어야** 보이는 결함이라
#         좁은 폭 검사와 따로 있다(좁은 폭 검사는 오버레이를 열지 않는다).
#
#   `check_narrow_width.py` 는 **로컬 HTTP 서버가 필요하다**(file:// 아님).
#   처음 돌린 결과(2026-11-09): 좁은 폭 27페이지 × 360·390px **통과**,
#   XSS 17화면 **통과**, 호버 대비 8페이지 **0건**.
#
#   2026-11-11 재실행(A-471~A-473 뒤, 클라우드 컨테이너 + 로컬 http.server):
#     XSS 출력      18화면(카테고리 하위 1장 추가) — 실행0 · 주입요소0 · 핸들러0 · 나쁜URL0
#     검색 오버레이  결과 줄 99개(페이지 3 × 폭 3) — 눌린 글자칸 0
#     좁은 폭        27페이지 × 360·390px — 넘치는 페이지 0
#     호버 대비      요소 361개(8페이지) — 미달 0
#   네 개 전부 통과. 승리님 기계에서는 크로미움을 못 받으니 이 넷은 컨테이너에서 돈다.
BROWSER_CHECKS = [
    ('호버 대비',  'py', 'scripts/check_hover_contrast.py', '호버 상태의 글자 대비'),
    ('좁은 폭',    'py', 'scripts/check_narrow_width.py',   '좁은 화면에서 넘침'),
    ('XSS 출력',   'py', 'scripts/check_xss_output.py',     '출력 이스케이프'),
    ('검색 오버레이', 'py', 'scripts/check_search_overlay.py', 'A-445 — 결과가 검색창 옆에 깔려 글자칸이 0px 이 되는지'),
]


def have_playwright():
    """playwright 가 **실제로 브라우저를 띄울 수 있는지**까지 본다.

    ★ 2026-11-09: 전에는 `import playwright` 만 봤다. 모듈만 깔고 브라우저는
      못 받은 기계(망에서 cdn.playwright.dev 가 막힌 곳)에서 이 함수가 True 를
      돌려주는 바람에, **건너뛰어야 할 검사 3종이 실행되어 전부 실패했다** —
      배포 경로가 통째로 빨개졌다. 내가 직접 만든 회귀다.
      「있나」가 아니라 「되나」를 물어야 한다.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return False
    try:
        with sync_playwright() as pw:
            path = pw.chromium.executable_path
    except Exception:
        return False
    return bool(path) and os.path.exists(path)


def runner_for(kind):
    if kind == 'py':
        return [sys.executable]
    exe = shutil.which('node')
    return [exe] if exe else None


def run_one(name, kind, rel, why, verbose):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        return ('없음', '파일이 없다: ' + rel)
    cmd = runner_for(kind)
    if not cmd:
        return ('건너뜀', 'node 를 찾지 못했다')
    try:
        p = subprocess.run(cmd + [path], cwd=ROOT, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=600)
    except subprocess.TimeoutExpired:
        return ('시간초과', '600초를 넘겼다')
    out = (p.stdout or '') + (p.stderr or '')
    tail = [l for l in out.strip().split('\n') if l.strip()]
    if verbose:
        for l in tail:
            print('      ' + l)
    elif p.returncode != 0:
        for l in tail[-12:]:
            print('      ' + l)
    # 어긋났을 때는 바로 위에 출력 꼬리를 이미 찍었으므로 요약을 붙이지 않는다.
    # (스택 트레이스의 마지막 줄이 요약으로 잡혀 「Node.js v22」 같은 것이 뜬다.)
    return ('통과' if p.returncode == 0 else '어긋남', '')


def main():
    if '--list' in sys.argv:
        print('늘 도는 검사:')
        for name, kind, rel, why in CHECKS:
            print('  %-18s %-36s %s' % (name, rel, why))
        print('\nPlaywright 가 있을 때만 도는 검사:')
        for name, kind, rel, why in BROWSER_CHECKS:
            print('  %-18s %-36s %s' % (name, rel, why))
        return 0

    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    pw = have_playwright()
    todo = list(CHECKS)
    skipped_browser = []
    if pw:
        todo += BROWSER_CHECKS
    else:
        skipped_browser = [c[0] for c in BROWSER_CHECKS]

    results = []
    for name, kind, rel, why in todo:
        print('[검사] %s  (%s)' % (name, rel))
        state, note = run_one(name, kind, rel, why, verbose)
        print('   → %s%s' % (state, ('  · ' + note) if note and state != '통과' else ''))
        results.append((name, state, rel))

    print('')
    print('─' * 60)
    bad = [r for r in results if r[1] not in ('통과', '건너뜀')]
    okn = sum(1 for r in results if r[1] == '통과')
    if skipped_browser:
        print('건너뜀  %s — Playwright 가 없다' % ' · '.join(skipped_browser))
        print('        pip install playwright && playwright install chromium')
    if bad:
        print('어긋난 검사 %d개 / 통과 %d개' % (len(bad), okn))
        for name, state, rel in bad:
            print('   · %-18s %s  (%s)' % (name, state, rel))
        print('')
        print('고치고 다시 돌려라. 하나씩 보려면:')
        for name, state, rel in bad:
            print('   python3 %s' % rel if rel.endswith('.py') else '   node %s' % rel)
        return 1
    print('검사 %d개 전부 통과' % okn)
    return 0


if __name__ == '__main__':
    sys.exit(main())
