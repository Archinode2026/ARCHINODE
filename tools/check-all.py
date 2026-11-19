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
    ('비공개 쪽 색인금지', 'py',   'tools/check-noindex.py',
     'A-642 — Netlify 가 저장소를 통째로 올리는데(publish=".") admin/ 7쪽과 brand-portal/dashboard 에 **noindex 가 없었다**. robots.txt 의 Disallow 는 **기어다니는 것만** 막고 색인은 못 막는다 — 링크가 걸리면 내용을 안 읽은 채로도 주소가 검색에 선다. 데이터가 새는 건 아니다(관리 쓰기는 전부 isAdmin() 를 거친다) — 막는 것은 노출이다'),
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
    ('폼 경고 말',           'node', 'tools/test-form-messages.js',
     'A-517 — 빈 칸·잘못된 이메일 경고가 브라우저 언어로 나왔다(우리가 한 번도 말한 적이 없다). 폼 있는 쪽이 그 코드를 싣는지도 본다'),
    ('떠도는 id',            'py',   'tools/check-orphan-ids.py',
     'A-516 — 그 쪽에 없는 요소를 찾는 코드는 죽은 사본의 표지다. 그 사본이 고치기 전 판이면 언젠가 되살아난다'),
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
     'A-503·A-530 — 234벌로 복사된 푸터에 상호·사업자등록번호·통신판매업 신고번호·주소·이메일이 **같은 값으로** 다 있는지(전자상거래법 제13조). A-530 부터 **어느 언어로 읽히는지**까지 본다'),
    ('안쪽 링크',            'py',   'tools/check-links.py',
     'A-552 — href·src 가 실제로 있는 곳을 가리키는지 전수. 브론즈 39차가 찾은 404 셋(동의 고지의 처리방침 링크)을 검사 38개가 전부 통과시켰다 — 링크를 따라가 보는 검사가 없었다'),
    ('머리글 단계',          'py',   'tools/check-heading-levels.py',
     'A-544 — 머리글만 훑어 뼈대를 잡는 손님이 빈 단계에서 길을 잃는다. 2026-11-14 에 233쪽 중 98쪽이 그랬고 검사 37개 중 머리글을 보는 것이 없었다'),
    ('폼 동의',              'py',   'tools/check-form-consent.py',
     'A-540 — 개인정보를 받는 폼마다 고지·동의·기록이 있는지. 브론즈 38차가 찾은 네 가지를 검사 36개가 하나도 못 잡았다 — required 하나에 기대던 자리, 동의를 버리던 자리, 고지가 아예 없던 폼 넷'),
    ('reCAPTCHA 늦게 싣기',   'py',   'tools/check-recaptcha-lazy.py',
     'A-584 — api.js 를 머리에서 바로 실어 폼을 건드리지도 않은 손님에게 354.8KB(첫 화면 실측)를 보내고 동의 전에 localStorage 에 _grecaptcha 를 쓰던 자리. 바로 싣기로 되돌아가는 것과, 늦게 싣는 길을 비껴가는 직접 호출을 막는다'),
    ('안내 들림',            'py',   'tools/check-live-regions.py',
     'A-591 — 폼의 결과 안내가 화면 읽기 프로그램에 들리는지. 248쪽 전체에 aria-live·role=alert 가 한 번도 없었다 — 눈으로 못 보는 손님은 보내기가 막혔는지 들어갔는지 소식을 못 들었다(WCAG 4.1.3)'),
    ('입력칸 이름',          'py',   'tools/check-field-labels.py',
     'A-595·A-596 — 보이는 입력칸마다 이름의 출처가 있는지(label[for]·aria-label 등). placeholder 하나만 있는 것은 이름이 아니다. 입점신청 13칸 중 7칸이 화면에는 글자가 있는데 for= 가 없어 칸과 남남이었다. autocomplete 값이 표준 이름인지도 본다 — 틀린 값은 없는 것보다 나쁘다'),
    ('움직임 줄이기',        'py',   'tools/check-reduced-motion.py',
     'A-603 — 「맨 위로」가 JS 에 smooth 를 박아 둬서 움직임 줄이기 설정을 무시했다(실측 끔 1446ms / 켬 1446ms). 같은 자리가 228쪽에 복사돼 있었다. JS 의 behavior 는 CSS 의 scroll-behavior 를 이긴다'),
    ('본문 구역',            'py',   'tools/check-main-landmark.py',
     'A-606 — 건너뛰기 링크가 닿는 자리가 **속이 빈** 표지였다. 표지는 붙었지만 그 안이 비어서, 건너뛰면 아무것도 없는 자리에 떨어지고 진짜 본문은 어느 구역에도 속하지 않았다(실측: 본문 안 글자 0자, 구역 밖 머리글 매거진 134개)'),
    ('겹칩 층 규약',          'py',   'tools/check-overlay-layers.py',
     'A-619 — 손님이 직접 연 창(문의·검색·사진 확대)이 쿠키 고지(99999)보다 아래에 있었다. 그러면 창 아래쪽이 고지에 덮이고 그 자리를 누른 손가락이 고지의 「필수만」을 누른다 — 문의는 사라지고 개인정보 설정만 바뀐다(라이브 실측: 검색 결과 76개 중 19개가 덮임). A-610 의 body 여백은 position:fixed 에 닿지 않는다'),
    ('파이어베이스 TDZ',      'py',   'tools/check-firebase-tdz.py',
     'A-609 — 전역 auth·db·storage 가 const 여서, firebase 가 안 내려오면 선언만 되고 초기화 안 된 상태로 남았다. 그러면 다른 81군데의 `typeof db` 방어조차 ReferenceError 를 던져 손님 화면이 조용히 멈춘다(실측: 30초 빈칸, 안내문 0)'),
    ('한국어가 새는 자리',     'py',   'tools/check-lang-leak.py',
     'A-534 — 두 언어 속성이 **아예 없는** 한국어 글자. 짝이 한쪽만 있는 것(언어 규약)도, 영어만 나오는 안내(두 언어 안내)도 아닌 세 번째 틈 — A-526·A-529·A-532 가 이리로 지나갔다'),
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
#
#   2026-11-17 재실행(A-584 뒤, 컨테이너 + 로컬 http.server). 승리님 기계에서
#   다시 확인: `cdn.playwright.dev` 가 403 Connection blocked by network allowlist,
#   시스템 크롬도 없고 root 도 없어 apt 도 안 된다 — 그러니 컨테이너에서 도는 것이
#   임시방편이 아니라 **이 넷의 정식 실행 경로다.**
#     좁은 폭        27페이지 × 360·390px — 넘치는 페이지 0
#     XSS 출력      18화면 — 실행0 · 주입요소0 · 핸들러0 · 나쁜URL0
#     검색 오버레이  결과 줄 99개(페이지 3 × 폭 3) — 눌린 글자칸 0
#     호버 대비      A-587 로 고친 뒤 요소 508개(전 365개) — 미달 0
#   네 개 전부 통과.
BROWSER_CHECKS = [
    ('호버 대비',  'py', 'scripts/check_hover_contrast.py', '호버 상태의 글자 대비'),
    ('좁은 폭',    'py', 'scripts/check_narrow_width.py',   '좁은 화면에서 넘침'),
    ('XSS 출력',   'py', 'scripts/check_xss_output.py',     '출력 이스케이프'),
    ('검색 오버레이', 'py', 'scripts/check_search_overlay.py', 'A-445 — 결과가 검색창 옆에 깔려 글자칸이 0px 이 되는지'),
    ('확대 넘침',    'py', 'scripts/check_zoom_reflow.py',
     'A-593 — 400%·300% 확대 크기에서 고정 요소가 화면을 넘어 내용이 영영 안 보이는지. '
     '좁은 폭 검사는 폭만 바꾸고 높이는 늘 크게 둬서 이 자리를 한 번도 안 봤다'),
    ('인쇄 대비',    'py', 'scripts/check_print_contrast.py',
     'A-630 — 인쇄하면 꼬리말이 **흰 종이 위의 흰 글자**로 남아 종이 한 장이 통째로 백지였다(대비 1.03~1.10:1, 사업자등록번호 같은 법정 표시사항까지). 브라우저는 배경을 기본으로 안 찍는데 화면용 밝은 글자색이 @media print 를 명시도로 이기고 있었다. 그 자리 주석은 「인쇄를 할 수 없어 특정도 규칙으로만 보장했다」고 적고 있었다 — 보장이 틀렸다'),
    ('인쇄-사진위글', 'py', 'scripts/check-print-over-image.py',
     'A-640 — 위 「인쇄 대비」가 글자를 전부 먹색으로 덮은 뒤, **배경은 안 찍혀도 <img> 는 찍힌다**는 것이 남았다. 띠·카드가 전부 「사진 + 그 위 흰 글자 덮개」 꼴이라 그라데이션만 사라지고 사진 위 먹글씨가 됐다(쪽 9개·34자리, 최저 1.02:1). 겸사겸사 A-474 가 넣은 히어로 사진 인쇄 숨김이 특정도에 져서 **처음부터 죽어 있던 것**도 여기서 드러났다. 색이 아니라 **겹침**으로 잰다 — 사진 픽셀은 보장할 수 없다'),
    ('초점 고리',    'py', 'scripts/check_focus_visible.py',
     'A-589 — Tab 으로 초점이 가는 자리마다 고리가 **실제로 보이는지**(WCAG 1.4.11 비텍스트 대비 3:1). '
     'A-587 과 같은 모양의 사각지대였다 — 두 겹 고리를 설계해 놓고 한 번도 재지 않았다'),
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
        print('건너뜀  %s — 이 기계에서는 크로미움을 못 받는다' % ' · '.join(skipped_browser))
        # A-587(2026-11-17): 전에는 여기서 `pip install playwright && playwright install
        # chromium` 을 안내했다. 그런데 이 기계에서는 **그 명령이 될 수 없다** —
        # cdn.playwright.dev 가 403(망 허용목록), 시스템 크롬 없음, root 없음(apt 불가).
        # 될 수 없는 명령을 안내하면 읽는 사람이 자기 탓인 줄 알고 시간을 버린다.
        print('        이 여덟은 클라우드 컨테이너에서 돈다 — 저장소를 타르로 가져가서:')
        print('          python3 -m http.server 8321 &')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_narrow_width.py --base http://127.0.0.1:8321 --widths 360,390')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_xss_output.py http://127.0.0.1:8321')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_search_overlay.py http://127.0.0.1:8321')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_hover_contrast.py index.html brands.html ...')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_focus_visible.py index.html list-your-brand.html ...')
        print('          python3 scripts/check_zoom_reflow.py http://127.0.0.1:8321')
        print('          python3 scripts/check_print_contrast.py http://127.0.0.1:8321')
        print('          python3 scripts/check-print-over-image.py http://127.0.0.1:8321')
        print('        (주소는 위치 인수다. --base 를 주면 27화면이 전부 열리지 않는다.)')
        print('        가장 최근 실행: 2026-11-20 · 인쇄 둘 통과 (사진위글 0자리 · 흰종이대비 0종)')
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
