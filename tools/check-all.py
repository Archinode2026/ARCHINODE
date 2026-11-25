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
    ('언어·주소 규약', 'py',   'tools/check-lang-url.py',
     'A-650 — 언어가 localStorage 에만 있어 **주소가 상태를 안 들고 있었다**. 영문 화면 링크를 보내도 받는 사람은 자기 저장값대로 봤고, 구글로 온 유럽 브랜드는 한국어 메뉴를 보고 자기 입구를 못 찾았다(hreflang 0줄). `?lang=en` 읽기·쓰기와 hreflang 세 줄을 지키고, A-649 의 게이트 규약(대상은 문으로, 언어로 가르지 않기)이 되돌아가지 않게 막는다'),
    ('비공개 쪽 색인금지', 'py',   'tools/check-noindex.py',
     'A-642 — Netlify 가 저장소를 통째로 올리는데(publish=".") admin/ 7쪽과 brand-portal/dashboard 에 **noindex 가 없었다**. robots.txt 의 Disallow 는 **기어다니는 것만** 막고 색인은 못 막는다 — 링크가 걸리면 내용을 안 읽은 채로도 주소가 검색에 선다. 데이터가 새는 건 아니다(관리 쓰기는 전부 isAdmin() 를 거친다) — 막는 것은 노출이다'),
    ('건너뛰기 첫 차례', 'py',   'tools/check-skip-link-first.py',
     'A-643 — order-complete 에서 건너뛰기 링크가 **머리글 전체 뒤**에 적혀 있어 탭 차례 12번째였다(다른 쪽은 1번째). 머리글의 링크 열한 개를 지나치라고 있는 링크인데 그 열한 개를 다 지나야 닿았다. A-237 이 231쪽에 이 링크를 넣을 때 **있는가**만 셌고 **첫째인가**는 안 셌다'),
    ('검색 회귀',            'node', 'tools/test-search.js',
     'A-397 · A-401 · A-402 — 배열 category · 언어 판정 · 색인 설명'),
    ('카테고리 이름 사본',    'py',   'tools/check-category-labels.py',
     'A-407 — 세 곳의 대응표가 카테고리 페이지의 두 언어 h1 과 맞는지'),
    ('어드민 대시보드 누름', 'node', 'tools/test-modal-dismiss.js',
     'A-689/A-690 — ① 사유 입력 창이 **바깥을 눌러도 안 닫히는지**(승리님 보고: '
     '적던 글째로 사라졌다). 열어 보니 더 나쁜 것도 있었다 — X 단추와 탭 이동은 '
     '창만 숨기고 **약속을 안 풀어** `await openReasonModal(...)` 이 영영 안 '
     '돌아왔다. 어드민 눈에는 「아무 일도 안 일어난 것」으로 보인다. ② 통계 숫자 '
     '넷이 **진짜 button** 인지(div 에 onclick 만 달면 Tab·Enter·보조기기 읽기를 '
     '손으로 다시 만들어야 한다). ★ 어드민은 로그인이 있어야 열려 노드가 눈으로 '
     '못 본다 — 이 시험이 **유일한 보증**이라 규칙을 순수 함수로 떼고 '
     '`dashboard.html` 이 그걸 실제로 쓰는지까지 글자로 센다'),
    ('브랜드 문',            'py',   'tools/check-brand-gate.py',
     'A-688 — `brand-gate.js`(내려간 브랜드의 제품은 안 건다)를 **쪽 79개가 빠짐없이 '
     '싣고, category-products.js 보다 먼저 싣고, 실어 놓고 쓰기까지 하는지**. 이 '
     '저장소가 반복해 온 병이 사본 어긋남이다 — 매거진 쪽 CSS 72가지, A-218 처방이 '
     '다섯 사본 중 둘에만, A-411 이 휴대폰 폭에만. 한 곳에 두고 전부 싣기를 검사로 '
     '묶는다. ★ 세기 전에 HTML 주석을 걷어낸다 — `auth/profile.html` 은 주석에서만 '
     '언급하고 싣지 않는데, 안 걷으면 빠뜨렸다고 잘못 센다(만들면서 실제로 그랬다)'),
    ('브랜드 문 거르기', 'node', 'tools/test-brand-gate.js',
     'A-688 — 문의 순수 함수 12가지. 이 문은 **손님에게 무엇을 보일지**를 정하므로 '
     '양쪽을 다 센다: 너무 조이면 멀쩡한 브랜드의 제품이 사라지고(브랜드와의 약속을 '
     '깬다), 너무 풀면 내려간 브랜드의 제품이 계속 걸린다(A-688 그 자체). 명단을 '
     '못 받았으면(null) **아무것도 통과시키지 않는다** — 모를 때는 안 거는 쪽이 맞다'),
    ('죽은 미디어 규칙',      'py',   'tools/check-css-cascade.py',
     'A-411 — @media 안의 수정이 뒤쪽 기본 규칙에 덮여 죽지 않았는지'),
    ('죽은 미디어 규칙 검사기 자체', 'py', 'tools/test-css-cascade.py',
     'A-683 — 위 검사기를 **임시 폴더의 가짜 CSS** 로 깨 본다. 진짜 style.css 를 '
     '깨서 재다가 2026-11-23 에 timeout 에 잘려 저장소를 망가뜨렸으므로 원본을 '
     '아예 안 건드린다. 6가지: 축약형 padding 이 뒤에서 padding-top 을 죽이는 것을 '
     '잡는가(A-683 이 넣은 기능 — 그 전까지 검사기는 padding 과 padding-top 을 '
     '**다른 속성으로 보고 놓쳤다**) · margin 도 같은가 · 순서가 반대면 조용한가 · '
     '선택자가 다르면 조용한가 · 낱개끼리인 원래 꼴(A-411)도 그대로 잡는가 · '
     '메시지가 「축약형」이라고 까닭을 말하는가'),
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
    ('매거진 태그 검사기 자체', 'py', 'tools/test-magazine-tags.py',
     'A-678 — 위 매거진 검사기를 **일부러 깨서** 검증한다(13건). 브론즈 55차가 「새 검사기 셋 중 둘에 자기 시험이 없다」고 지적했다 — 손으로 깨 보고 결과만 적었고 그 시험이 저장소에 남지 않았다. 되돌리기를 **sha256 으로 확인**한다(브론즈가 같은 회차에 깨기 하네스로 파일 하나를 깨진 채 남겼다). 덫 둘 포함 — 주석에만 적힌 태그 이름과 비슷한 클래스 이름에는 조용해야 한다.'),
    ('쪽 틀 검사기 자체', 'py', 'tools/test-page-shell.py',
     'A-678 — 위 쪽 틀 검사기를 일부러 깨서 검증한다(5건). 덫 셋 — 비슷한 이름·주석 안·스크립트 문자열 안의 옛 낱말에는 조용해야 한다. 첫 판에 내 시험이 두 번 틀렸다: 옛 낱말이 7종인데 하나만 바꿔서 「안 쓴다」가 안 됐고, 그다음엔 쪽에 없는 앵커를 필수로 봤다. **시험도 깨 봐야 한다.**'),
    ('쪽 틀 세대', 'py', 'tools/check-page-shell.py',
     'A-675 — 옛 세대 쪽 틀을 쓰는 쪽을 센다. 승리님 목록에 「privacy-en 을 공용 CSS 로(13번 따로 고쳤다)」가 있었는데, 열어 보니 **CSS 중복이 아니었다** — 그 쪽은 꾸밈 전체를 다른 마크업 낱말로 든 옛 틀이다(`footer-column`·`footer-content`·`search-bar`·`scroll-to-top` 대 지금 틀의 `footer-col`·`footer-grid`·`search-box`·`scroll-top`). 마크업이 다르니 `style.css` 가 닿지 않고, 그래서 쪽 단위 CSS 20,794자로 자기 꾸밈을 따로 든다 — 변수 대신 하드코딩, 컨테이너 폭도 다르다. 전역 수정 A-206·A-630·A-641·A-648·A-652 가 **전부 이 쪽을 비껴갔다.** 고치는 일은 CSS 삭제가 아니라 **쪽을 다시 짜는 것**이고 법률 쪽이라 브라우저 실측이 필요하다. 그래서 이 검사는 ① 옛 낱말을 쓰는 쪽을 세고 ② 아는 쪽은 까닭과 함께 KNOWN 에 두어, **새로 생기는 것만** 실패로 잡는다. 깨기 2종 통과.'),
    ('값의 꼴', 'py', 'tools/check-value-vocab.py',
     'A-681 — **담는 값의 꼴**과 **읽는 쪽이 기대하는 꼴**이 같은지 본다. 네 어휘(분류·경로·유형·업종)마다 값을 담는 자리와 그 값에 이름을 붙이는 지도를 코드에서 직접 긁어 대조한다. ① 담는 값이 읽는 지도에 다 있는가(없으면 화면에 날글자가 뜬다) ② 담는 자리끼리 같은가 ③ 읽는 지도끼리 같은가 ④ 아무도 안 담는 키는 알리기만 한다. 2026-11-24 에 **두 군데가 끊겨 있었다** — 분류는 사이트가 대문자로 저장하는데 수요 지도가 소문자 키여서 **브랜드에게 보낼 한 장이 모든 품목에서 0** 이었고(A-680), 경로는 어드민 리드 화면에 `sourcing-page`(우리 주 유입 경로)가, 수요 리포트에 `admin-manual`(운영자 수동 입력)이 각각 없어 날글자로 떴다(A-681). 조각마다 시험이 있어도 안 잡혔다 — 시험 자료가 **지어낸 꼴**이었기 때문이다. 값의 꼴은 값이 사는 곳에서 읽어 와야 한다.'),
    ('값의 꼴 검사기 자체', 'py', 'tools/test-value-vocab.py',
     'A-681 — 위 검사기를 일부러 깨서 검증한다(7건). 덫 둘 — 값이 객체인 지도의 안쪽 키(`en`·`ko`)를 키로 세지 않고, 주석에만 적힌 키도 세지 않는다. 그리고 **해독기 시험**이 하나 있다: 한 줄에 키가 여럿일 때 둘째 키를 지워도 잡는지. 처음 해독기가 줄 맨 앞 하나만 읽어 멀쩡한 지도를 「어긋났다」고 보고했다 — 중괄호 깊이를 세어 고쳤다.'),
    ('매거진 태그', 'py', 'tools/check-magazine-tags.py',
     'A-672 — 같은 태그가 두 자리에 산다: 기사 쪽 `magazine/<글>.html` 의 `class="tag"` 와 목록 쪽 `magazine.html` 의 `article-card-tag`. 사본이 **조용히 갈라지는 것**이 A-348·A-367·A-393·A-409 에서 반복된 실패다. 세 가지를 본다 — ① 기사와 카드가 쌍으로 같은가 ② 영문 하나에 국문이 둘 이상 붙지 않았나 ③ 국문 하나에 영문이 둘 이상 붙지 않았나. 보이는 글자가 두 언어 속성 중 하나와 같은지도 본다(속성만 고치면 토글 전까지 옛 글자가 보인다). 2026-11-24 에 실제로 어긋나 있었다 — `Industry` 에 국문 셋(산업·업계·업계 동향) · `자재` 에 영문 셋(Materials·Material·Finishes) · `Trend`/`Trends` · `Sustainability` 에 둘 · `건축` 에 Architecture 와 Construction 둘. 기사 내용을 읽고 12편을 정본으로 맞췄다(28종 → 20종, 일대일). 깨기 5종 통과 — 주석 덫 포함.'),
    ('정의 없는 클래스', 'py', 'tools/check-css-classes.py',
     'A-668 — 마크업·JS 가 쓰는데 **어느 CSS 에도 정의가 없는** 클래스를 센다. A-667 을 만들며 `adm-btn` 이라는 클래스를 **지어냈다**(어드민은 `act-btn` 을 쓴다). 그런 클래스는 조용히 실패한다 — 오류도 안 나고 단추가 맨 글자로 뜰 뿐이다. 그래서 눈으로만 알 수 있고, 어드민 화면은 로그인이 있어야 열려 노드가 못 본다. 묻는 질문을 좁혔다: 정의가 없고 + 인라인 style 로 꾸며지지도 않고 + JS 가 선택자로 찾는 손잡이도 아닌 것. 처음 전부 세니 35개가 나왔고 거짓 양성이 쏟아져 내가 `.hp-newsletter` 를 「허니팟이 보인다」는 급한 결함으로 잘못 알렸다(부모가 인라인으로 숨기고 있었다). 좁혀서 10개로 줄이고 까닭을 적어 INERT 목록에 뒀다. 실제로 하나를 잡았다 — `.promo-half` 가 네 자리에 쓰이는데 정의 0곳이었다(보이는 결함은 아니다. 바탕 `.promo-item` 이 이미 span 3 이었다. 다만 index.html 주석이 「슬롯 크기는 세 클래스로만 정해진다」고 적어 거짓이었고, 바탕을 건드리는 날 조용히 바뀐다). 검사기 자체는 `tools/test-css-classes.py` 가 모형 디렉터리로 10건 검증한다 — 주석 덫 둘 포함.'),
    ('정의 없는 클래스 검사기 자체', 'py', 'tools/test-css-classes.py',
     'A-668 — 위 검사기를 **모형 디렉터리**로 깨 본다. 진짜 저장소를 깨서 재면 248쪽을 복사해야 하고 되돌리다 멈추면 수정을 날린다(A-481·A-483 에서 두 번 그랬다). 10건: 깨끗하면 조용 · 지어낸 클래스를 잡음 · 주석으로 막아 둔 CSS 는 정의가 아님 · **덫 둘(HTML·CSS 주석 안의 이름은 쓰임이 아니다 — 조용해야 한다)** · 인라인 style 자리는 빼고 셈 · JS 손잡이는 빼고 셈 · JS 주입 CSS 를 정의로 읽음(그리고 없으면 잡음) · 끝이 하이픈인 이어붙임 이름은 안 셈. 오늘 내가 틀린 세 가지가 각각 회귀 시험이 됐다.'),
    ('수요 집계', 'node', 'tools/test-demand-aggregate.js',
     '2026-11-23 — 어드민 「한국 수요」 리포트의 집계 함수. **이 화면은 로그인이 있어야 열려서 사람이 아니면 눈으로 못 본다**(A-657 에서 brand-portal 이 초점 요소 86개 중 4개만 닿았던 것과 같은 사각지대). 그래서 판단을 전부 `dmd_aggregate()` 순수 함수에 두고 합성 데이터로 센다. ★ 가장 중요한 검사는 **우리가 넣은 테스트 기록을 수요로 세지 않는가**다 — 허니팟·[테스트-브론즈]·우리 메일/계정. 테스트 리드를 수요로 세면 `categories.html` 의 「2,910+ 브랜드」와 같은 잘못을 리포트에서 다시 하는 것이다'),
    ('fetch 대 _redirects', 'py', 'tools/check-fetch-redirects.py',
     'A-658 — 어드민 「규정집」 화면이 `../docs/*.md` 를 fetch 하는데 `_redirects` 에 `/docs/* → 404!` 가 있다. **force 규칙**이라 실제 파일이 있어도 404 가 나간다(A-285) — 그 화면은 라이브에서 **구조적으로 작동할 수 없다**. 두 결정이 각각 맞으면서 서로를 깨뜨린 자리다(뷰어 `6cce1d40` · 보안 `6e80266e`/A-126). 검사기 51개 중 아무도 못 잡았다. ★ `fetch()` 의 상대 경로는 **스크립트가 아니라 그것을 실은 HTML 문서** 기준으로 풀린다 — 스크립트 위치로 풀면 `/admin/docs/…` 가 되어 「0개」라는 틀린 답이 나온다. ★ `<script src="…?v=…">` 의 캐시 버스터를 떼지 않으면 그 스크립트를 통째로 건너뛴다. 아는 3자리는 PENDING 에 **이유와 함께** 적어 두고 새로 생기는 것만 실패로 올린다 — 늘 빨간 검사는 사람이 무시한다'),
    ('폼 명부 완전성', 'py', 'tools/check-form-registry.py',
     'A-656 — `check-form-consent.py` 는 명부(FORMS)에 적힌 폼을 꼼꼼히 보고 **사라지면** 잡지만, **명부에 없는 폼이 새로 생기면 아무도 모른다.** 방향이 한쪽뿐이다. 이 구멍은 이미 한 번 결함을 냈다 — A-568 의 주석이 「이 명부에 auth/ 가 한 번도 오른 적이 없어서 이 검사가 통과하는 동안 그 자리는 비어 있었다」고 적고 있다. 그때 쪽을 명부에 넣고 구멍은 그대로 뒀다. 이 검사는 거꾸로 전수를 훑어 개인정보를 받는 폼을 찾고, 세 명부(FORMS·NEWSLETTER·EXEMPT) 중 어디에도 없으면 실패로 올린다. 면제는 **이유와 함께** 적는다. 이메일 한 칸짜리 폼은 A-521 승리님 결정(체크박스 대신 안내+링크)의 모양을 지키는지 본다 — 바로 digital-products.html 하나를 찾았다'),
    ('fade-in 관찰자', 'py', 'tools/check-fade-in-observer.py',
     'A-653 — `style.css` 의 `.fade-in` 은 `opacity:0` 으로 시작하고 `IntersectionObserver` 가 `.visible` 을 붙여야 열린다. 그 관찰자는 공용 js 가 아니라 **85쪽에 각자 복사**돼 있다. A-649 에서 서비스 묶음을 index 에서 for-brands 로 옮길 때 클래스만 따라오고 관찰자는 안 따라와, 제목과 카드 4장이 **영영 안 열렸다**(opacity 0.00 · 526자 · 348,000px² 가 391px 흰 띠). 유럽 브랜드가 문을 열고 들어온 쪽에서 유료 서비스 네 가지가 화면에 없었다. ★ **인쇄하면 보였다** — A-646 이 인쇄 블록에 `opacity:1 !important` 를 넣어 둬서, 종이에는 있고 화면에는 없는 상태였다. 자기 쪽에서 `.fade-in{opacity:1}` 로 덮는 쪽(brands/view·products/view)은 정당한 자리로 통과시킨다. (브론즈 51차 N51-5)'),
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
     '좁은 폭 검사는 폭만 바꾸고 높이는 늘 크게 둬서 이 자리를 한 번도 안 봤다. '
     'A-683/685 에서 **무엇이 잘리는가**를 더했다 — 그전까지는 「무엇이 가리는가」만 '
     '봐서 첫 쪽 대표 문구가 overflow:hidden 에 잘려 사라진 것을 못 봤다. '
     'A-686 에서 굴림 전후 교집합의 뜻이 뒤집혀 있던 것을 고쳤다 — 16쪽 거짓 실패'),
    ('확대 넘침 검사기 자체', 'py', 'scripts/test_zoom_reflow.py',
     'A-686 — 위 검사기를 **임시 폴더의 가짜 쪽 셋**으로 깨 본다. 진짜 저장소는 안 '
     '건드린다. ① 범위 안에서 진짜 막힌 단추를 잡는가(거짓 실패를 없애면서 입까지 '
     '막지 않았는지) ② 굴리면 닿는 단추에 조용한가(A-686 의 거짓 실패가 돌아왔는지) '
     '③ overflow:hidden 에 잘려 영영 안 보이는 글을 잡는가(A-683 의 꼴). '
     '③은 넣기 전에는 통과해 버렸다 — 그 상태가 바로 검사 62개가 첫 쪽을 '
     '통과시키던 상태다'),
    ('인쇄 대비',    'py', 'scripts/check_print_contrast.py',
     'A-630 — 인쇄하면 꼬리말이 **흰 종이 위의 흰 글자**로 남아 종이 한 장이 통째로 백지였다(대비 1.03~1.10:1, 사업자등록번호 같은 법정 표시사항까지). 브라우저는 배경을 기본으로 안 찍는데 화면용 밝은 글자색이 @media print 를 명시도로 이기고 있었다. 그 자리 주석은 「인쇄를 할 수 없어 특정도 규칙으로만 보장했다」고 적고 있었다 — 보장이 틀렸다'),
    ('인쇄-사진위글', 'py', 'scripts/check-print-over-image.py',
     'A-640 — 위 「인쇄 대비」가 글자를 전부 먹색으로 덮은 뒤, **배경은 안 찍혀도 <img> 는 찍힌다**는 것이 남았다. 띠·카드가 전부 「사진 + 그 위 흰 글자 덮개」 꼴이라 그라데이션만 사라지고 사진 위 먹글씨가 됐다(쪽 9개·34자리, 최저 1.02:1). 겸사겸사 A-474 가 넣은 히어로 사진 인쇄 숨김이 특정도에 져서 **처음부터 죽어 있던 것**도 여기서 드러났다. 색이 아니라 **겹침**으로 잰다 — 사진 픽셀은 보장할 수 없다'),
    ('인쇄-백지', 'py', 'scripts/check-print-hidden-content.py',
     'A-646 — `.fade-in` 이 opacity 0 으로 시작해 스크롤로 열리는데 **인쇄는 스크롤을 안 한다**. 높이는 차지하면서 투명하니 **빈 종이**가 됐다(about 10장 중 6장·magazine 6장 중 3장 백지, 숨은 글자 35,072자). ★ 위 인쇄 검사기 둘은 대비·겹침을 재려고 **보이는 요소만** 골라서 이 칸들이 표본에서 조용히 빠졌다 — 이 검사기는 거꾸로 **안 보이는 것만** 센다'),
    ('어두운배경 명암', 'py', 'scripts/check-dark-contrast.py',
     'A-652 — A-193·A-206 이 「밝은 배경용 토큰을 어두운 컨테이너에 올리면 2.3:1」을 **두 번** 잡았는데, A-206 은 JS가 만드는 `.lang-switch-btn` 만 고치고 마크업의 `.lang-switch` 를 빠뜨려 로그인·회원가입·비밀번호재설정·프로필·브랜드대시보드 **다섯 쪽**에 2.27:1 이 남아 있었다. 기존 「호버 대비」 검사기는 `PAGES = sys.argv[1:] or [\'index.html\']` — 기본 표본이 **한 쪽**이었고, auth/·brand-portal/·admin/ 은 색인이 안 돼 거의 모든 쓸기에서 빠져 있었다. **색인 안 되는 쪽이 사람이 안 보는 쪽은 아니다 — 로그인 창이 가장 많이 보는 쪽이다.** 이 검사기는 기본 표본이 전수이고, ★ 반투명 글자색을 **건너뛰지 않고 합성해서** 잰다(꼬리말 아랫줄이 알파 0.52 여서 가장 의심스러운 자리가 표본에서 빠져 있었다 — 233쪽 전부 4.40:1)'),
    ('배지 그늘',    'py', 'scripts/check_badge_shadow.py',
     'A-687 — 넷리파이 배지(고정, 오른쪽 아래 196x63, z-index 2147483645)에 '
     '**어떤 굴림 위치에서도** 깔려 있는 누를 거리를 찾는다. 같은 사고가 세 번 났고 '
     '세 번 다 사람이 눈으로 찾았다: A-446(「맨 위로」 75% 덮임) · A-451 · '
     'A-558(약관·처리방침 링크가 쪽의 마지막 내용이라 **영구히** 배지 아래였다). '
     '★ 굴려 보지 않고 **기하로** 푼다 — 배지는 고정이라 굴림 s 에서 벗어날 조건이 '
     'lo=max(0, cy2-by1) <= hi=min(cy1, maxScroll) 로 떨어진다. 굴림을 표본으로 찍으면 '
     '찍은 자리 사이를 놓치지만 식은 안 놓친다. ★ 로컬에는 배지가 없으니 **대역을 세워** '
     '잰다 — 「저 자리에 우리 것이 영구히 깔리는가」가 맞는 질문이고, 유료로 배지를 꺼도 '
     '(승리님 결정 ⓑ-9) 규칙은 남는다'),
    ('배지 그늘 검사기 자체', 'py', 'scripts/test_badge_shadow.py',
     'A-687 — 가짜 쪽 여섯으로 깬다. ★ **고쳐진 저장소로는 증명이 안 됐다** — A-558 의 '
     '여백을 되돌려도 법적 링크 아래에 다른 여백 210px 이 남아 재현되지 않았다. '
     '그래서 깨진 세상을 따로 만든다: 맨 아래 오른쪽은 잡고 · 왼쪽은 조용 · 63px 넘게 '
     '띄우면 조용 · 40px 만 띄우면 잡고 · 겹치는 고정 단추(A-446 꼴)는 잡고 · 올라간 '
     '것은 조용'),
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
        print('        이 열은 클라우드 컨테이너에서 돈다 — 저장소를 타르로 가져가서:')
        print('          python3 -m http.server 8321 &')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_narrow_width.py --base http://127.0.0.1:8321 --widths 360,390')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_xss_output.py http://127.0.0.1:8321')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_search_overlay.py http://127.0.0.1:8321')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_hover_contrast.py index.html brands.html ...')
        print('          ARCHINODE_ROOT=<루트> python3 scripts/check_focus_visible.py index.html list-your-brand.html ...')
        print('          python3 scripts/check_zoom_reflow.py http://127.0.0.1:8321')
        print('          python3 scripts/check_print_contrast.py http://127.0.0.1:8321')
        print('          python3 scripts/check-print-over-image.py http://127.0.0.1:8321')
        print('          python3 scripts/check-print-hidden-content.py http://127.0.0.1:8321')
        print('          python3 scripts/check-dark-contrast.py <사이트 루트>   # 파일 경로를 받는다')
        print('        (주소는 위치 인수다. --base 를 주면 27화면이 전부 열리지 않는다.)')
        print('        가장 최근 실행: 2026-11-20 · 인쇄 셋 통과 (사진위글 248쪽 0자리 · 백지 0자리 · 흰종이대비 0종)')
        print('        어두운배경 명암: 2026-11-21 · 36쪽 0자리 (고치기 전 14쪽 17자리 → 표본 35쪽으로 넓히니 +1쪽 10자리) · 부수기 6종 중 덫 2종 조용')
        print('          ※ 표본은 「쪽 단위 CSS 가 **색으로 봐서** 어두운 배경을 선언하는 쪽」 35개 + 공통 레이아웃 대표 1개.')
        print('            처음엔 클래스 이름 목록으로 골라 14쪽이었는데, 그게 표본을 깎고 있었다(A-640 과 같은 함정).')
        print('          ※ 배경이 **사진**인 자리는 색으로 못 잰다 — 그 자리는 인쇄-사진위글 검사기가 겹침으로 본다.')
        print('        초점 고리: 2026-11-21 · 15쪽 정거장 441개 0건 (고치기 전 기본 표본은 index.html **한 쪽**, 그 한 쪽도 16/88 만 쟀다)')
        print('          ※ 기본 표본이 전수가 아니다 — 쪽마다 20~40초다. 쪽 단위 <style> 이 focus·outline 을 건드리는 쪽 17개 + 폴더 대표 7개 = 24쪽을 자동으로 고른다.')
        print('          ※ 로그인이 필요한 화면(admin/dashboard · brand-portal/dashboard · auth/profile)은 Loading 에서 멈춰 **승리님만 확인할 수 있다** — brand-portal/dashboard 는 초점 요소 86개 중 4개만 닿는다.')
        print('          ※ A-669(2026-11-23) 정정: 폴더 **뿌리**(admin/ · brand-portal/ · auth/)는 멈추는 게 아니라 **404** 다 — index.html 이 아예 없다(확인함). 전에 이 줄이 뿌리까지 멈춘다고 적어 브론즈 53차를 헛짚게 했다.')
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
