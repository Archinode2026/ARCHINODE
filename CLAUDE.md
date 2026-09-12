# CLAUDE.md — ARCHINODE 프로젝트 안내 (AI 에이전트용)

**목적**: 새 Claude 세션이 이 리포지토리를 처음 열었을 때 5분 안에 프로젝트를 이해할 수 있게 하는 요약본.
**사실은 이 문서가 기준**이다. `.claude/CLAUDE.md`(2026-04-11)는 비전·로드맵·거버넌스 원칙을 볼 때만 신뢰하고, 충돌하면 이 문서가 이긴다. **결정의 정본은 `docs/ARCHINODE 규정집.md`**, **할 일의 정본은 `docs/작업일지.md`**, **결함의 정본은 `docs/검수대장.md`**다.

---

## 0. 세션을 시작하면 (2026-09-12 개정)

1. **폴더 확인** — 이 파일이 있는 최하위 폴더(`...\ARCHINODE\ARCHINODE\ARCHINODE\ARCHINODE`, `.git` 있음)가 작업 대상. 바깥 두 층은 2026-04 옛 사본이라 편집 금지. 세션도 여기서 열어야 `.claude/`가 로드된다.
2. `docs/작업일지.md` 맨 위 **"다음에 할 일"** 을 읽는다.
3. `git log --oneline -10` · `git status --short` · `git rev-list --left-right --count origin/main...main`.
4. 마지막 커밋 날짜와 작업일지 갱신 날짜를 대조한다. 작업일지가 더 오래됐으면 그 사이 "종료"를 안 밟은 것이다(`archinode` 스킬 1-3).
5. 실질 작업 요청이면 **`archinode` 스킬(지휘 창)** 규칙을 따른다 — 대화 창은 코드를 직접 고치지 않고 지시서로 실행창에 넘긴다.
6. 하루를 마칠 때 한울님이 **"종료"** 라고 하면 `archinode-shutdown` 스킬을 처음부터 끝까지 돈다.

> 기기 이전(2026-09-12) 경위와 검증은 `archi-diary/_migration/MIGRATION.md`. `verify.ps1` 26건 통과 확인됨.

## 1. 프로젝트 한 줄

**ARCHINODE** — 유럽 건축·디자인 브랜드를 한국 시장과 연결하는 정적 HTML + Firebase 플랫폼. https://archinodekr.com
운영 주체 표기: 비비들리바이브(대표 박승리). EU 영업: Silvia Vandone(밀라노). 리포: `github.com/Archinode2026/ARCHINODE`.

## 2. 기술 스택

- **Frontend**: 정적 HTML + CSS + Vanilla JS(모듈 없음). HTML 228, 매거진 기사 116, 카테고리 10+69. 공유 `style.css`. Inter + Noto Sans KR, 흑백회색 + 골드 `#C8A96E`.
- **Backend**: Firebase 프로젝트 `archinode-8ab04` — Firestore 10 콜렉션 + Auth(email/password) + Storage. 서버 코드(Cloud Functions) 없음.
- **Hosting**: GitHub Pages, `main` push = 배포(5~10분). 스테이징은 Firebase Hosting 미리보기 채널(`tools/deploy-staging.ps1`, 첫 실행 전 로그인 필요).
- **다국어**: `lang.js`가 `data-en`/`data-ko` 속성을 토글. `<body data-langs="en">`이면 영어 단일(입점 신청·브랜드 가이드). IP로 초기 언어, 사용자 선택 우선.
- **어드민**: `wool21wool@gmail.com`, `office@archinode.org` (`firebase-config.js`의 `ADMIN_EMAILS` + `firestore.rules`의 `isAdmin()`).

## 3. 폴더 구조

```
ARCHINODE/
├── index, about, brands, categories, magazine, for-brands, list-your-brand, contact, ...  # 공개 페이지
├── admin/            # 어드민 대시보드 (brands/products/articles 탭, 옵션 B 정지·거절·복구, 검수관리 탭 — reviewIssues, 2026-09-12, 사이드바 셸(`admin/js/admin-core.js`·`admin-nav.js`·`view-*.js`, `admin.css`) — 2026-09-12 개편 1단계, 활동 로그(`adminLogs`·`admin/js/view-logs.js`, 브랜드 `history[]`) — 2단계, 설정·규정집(`settings/config`·`view-settings.js`·`view-regulations.js` — cdnjs marked 12.0.2 + DOMPurify 3.1.6 버전 고정) — 3단계, 리드 인박스(`leads`·`view-leads.js` — 수동 등록·배정·상태·이력, 배정 시 `mail` 1통) — 4a단계, 전문가 회원(`users` 읽기 전용 `view-users.js` — 삭제·정지 없음, 좋아요 이름은 brands·products 캐시로 풀기, CSV) + 통합 검색(`admin-core.js` `searchAll`·`admRegisterCache` — 각 화면이 등록한 메모리 캐시만, 추가 읽기 없음; 사이드바 검색창은 `admin-nav.js`) — 6단계, 공지사항(`notices`·`view-notices.js` — 등록·수정·노출 토글, 삭제 없음, 본문 escapeHtml+`<br>`) + 1:1 문의(`inquiries`·`view-inquiries.js` — 답변 저장 시 `mail` 1통 + `logAdmin('inquiry.answer')`, 열린 건수 = 사이드바 배지 + 대시보드 카드 「열린 문의」) — 5단계, **PWA 설치형**(`admin/manifest.webmanifest`·`admin/sw.js` — 캐시 없음, scope `/admin/` 만, 등록은 `admin-core.js` 끝, 「앱으로 설치」 버튼은 `admin-nav.js` 사이드바 맨 아래 — 2026-09-12), **한/영 토글**(사이드바 검색창 아래 `KO | EN` → `window.toggleLang()` + 사이드바 재렌더; 초기 언어는 `admin-core.js` `admInitLang()` 이 「저장값 > 기본 ko」로 고정(저장값 없으면 `archinode-lang`=ko 저장 → lang.js IP 감지 안 탐), 별도 5페이지도 `lang.js` 로드, lang.js 떠 있는 스위처는 `admin.css` 로 숨김 — 2026-09-12 A-035))
├── auth/             # 전문가 로그인·가입·프로필   ├── brand-portal/  # 브랜드 대시보드 + article-editor.js + Inbox 탭(배정 리드, 4a — update 키 status·brandNote·history·updatedAt 4개만) + 상단 공지 배너(`notices` visible==true 만 조회, brand/all 클라이언트 필터, 고정 우선 1건 + 「전체 보기」 모달) + Support 탭(`inquiries` create — 규칙 조건과 1:1, 내 문의 `where('fromUid','==',uid)` 만 + 답변 표시, 5단계)
├── brands/view.html  # 브랜드 상세 라우터           ├── products/view.html
├── categories/       # 10 대분류 + 69 서브          ├── magazine/, trend-report/
├── downloads/ assets/ sales/ silvia/                 # 브로슈어·이미지·실비아 자료
├── scripts/          # make_sitemap.py, make_search_index.py (★ 이 PC엔 Python 없음)
├── tools/            # deploy.ps1(push+라이브 대조) · deploy-staging.ps1 · scan-test-data.js
├── docs/             # 작업일지 · 규정집 · 검수대장 · 회의/(지시서) · 스키마 · 세팅 가이드 · deferred-work
├── archi-diary/      # 개발일지·handoff·브론즈 리포트 (.gitignore — GitHub에 없음, 유일한 사본)
└── .claude/          # CLAUDE.md(비전) · skills/(archinode, archinode-shutdown, gray-benchmark, gold-cmo, trend-editor) · agents/(node-*) · settings.json
```

## 4. 핵심 파일

| 파일 | 역할 |
|---|---|
| `firebase-config.js` | Firebase 초기화, `db`·`auth`·`storage`·`isAdmin()`. ★ 28줄 `firebase.auth()` 무가드 = BUG-1(검수대장 A-001) |
| `admin/js/admin-core.js` | 어드민 공통 부품 — `escapeHtml`·**`escapeAttr`(속성용, A-011)**·`t/tAttr/tSpan`·`openModal/closeModal`·`showToast`·`fmtDate`·`safeUrl`·`logAdmin`(2단계 전 빈 함수)·`matchText`·**`downloadCSV(rows, filename)`·`admRegisterCache/admGetCache`·`searchAll`(6단계 — 뉴스레터·알림 페이지는 자기 `downloadCSV()`가 뒤 선언으로 이긴다)**. 전역 `function`만(const/let 금지 — 별도 페이지 재선언 충돌; `var`는 허용) |
| `lang.js` / `auth-ui.js` | 다국어 토글 / 헤더 로그인 상태. 모든 공개 페이지가 로드 |
| `cookie-consent.js` `analytics-loader.js` `sentry-loader.js` `form-throttle.js` | GDPR 배너 / GA4(동의 후, `GA_ID` 미설정) / Sentry(`DSN` 미설정) / 폼 5초 재제출 차단 |
| `firestore.rules` | 프로덕션 규칙. **push로 반영 안 됨 — 콘솔 게시(한울님)** |
| `admin/dashboard.html` `brand-portal/dashboard.html` `magazine.html` `lang.js` | **큰 파일 4종 — Edit 통째 치환 금지**(10절) |
| `sitemap.xml` `search-index.json` | `scripts/make_*.py`로 재생성(Python 필요) |

## 5. Firestore 콜렉션

brands(입점, status pending/approved/suspended/rejected + 사유) · products · articles(blocks 배열) · users(전문가) · **leads**(2026-09-12 개편 **4a 활성** — 어드민 리드 인박스 `admin/js/view-leads.js` + 브랜드 포털 Inbox 탭. create 누구나(type·status 'new'·name·email·message·createdAt 검사) / read 어드민 ∪ 배정 브랜드 본인 / update 어드민 전부, 브랜드는 `status·brandNote·history·updatedAt` 4키만(`affectedKeys().hasOnly`) + status assigned·contacted·closed / delete 어드민. 필드는 `docs/firestore-schema.md` 9절. **공개 폼은 4b(복귀 후)** — 지금 입구는 어드민 수동 등록뿐. 포털 조회는 `where('brandId','==',uid)` 만(복합 색인 회피)) · trend-submissions · consultations · digital-products-notify · newsletter-subscribers · mail(Trigger Email Extension용 — **설치 여부 미확인**, `docs/admin-email-notification-setup.md`) · **reviewIssues**(검수관리 게시판, 어드민 전용 read/write, 2026-09-12 신설 — 오픈 전 임시 도구, 필드는 `docs/회의/2026-09-12-작업지시-검수관리탭.md` 1절) · **adminLogs**(어드민 활동 장부, 2026-09-12 개편 2단계 — create·read 어드민, update·delete 전면 금지(덧붙이기만), 필드는 `docs/firestore-schema.md` 7절; `brands.history[]` 도 같은 단계) · **settings**(`settings/config` 1문서 — 정책 값 listing.*·사이트 정보 site.*·adminNotice, **read 공개·write 어드민**, 2026-09-12 개편 3단계, 필드는 `docs/firestore-schema.md` 8절. 값은 for-brands.html 문구를 옮긴 것이라 공개 페이지 연동은 안건 1 결정·복귀 후) · **notices**(공지사항, 2026-09-12 개편 5단계 — read 어드민 ∪ (로그인 ∧ `visible==true`), write 어드민. 필드 `title_en/ko`·`body_en/ko`(평문, 표시 시 escapeHtml+`<br>`)·`audience` brand/site/all·`visible`·`pinned`·`order`·`createdAt/By`·`updatedAt/By` — `docs/firestore-schema.md` 10절. 포털 배너는 `where('visible','==',true)` 만 + audience 클라이언트 필터. **사이트 공개 공지(비로그인)는 복귀 후** — 그때 read 를 `|| audience in ['site','all']` 로 한 번 더 넓힌다) · **inquiries**(1:1 문의, 5단계 — create 로그인 본인(`fromUid==auth.uid`·`status=='open'`·subject 1~199자·body 1~4999자·`createdAt==request.time`) / read 본인 ∪ 어드민 / update·delete 어드민. 필드 11절. 포털 Support 탭이 create, 어드민 `view-inquiries.js` 가 답변(update) + `mail` 1통 "Re: <subject> — ARCHINODE"(제목 190자 컷). 포털 조회 `where('fromUid','==',uid)` 만. **전문가(auth/profile) 문의 폼은 복귀 후**). 스키마 `docs/firestore-schema.md`, `docs/articles-schema.md`.

## 6. 팀 — 지휘 창 · 스킬 · 에이전트 (2026-09-12, 엑사·단번 체계 이식)

**스킬**(지금 대화창의 행동 규칙, `.claude/skills/`): `archinode`(지휘 창, 트리거 "아키노드") · `archinode-shutdown`("종료") · `gray-benchmark`(아키프로덕트 조사) · `gold-cmo`(마케팅) · `trend-editor`.
**에이전트 12명**(실행창이 부르는 별도 일꾼, `.claude/agents/`, 단번 12명 체계 이식 2026-09-12 저녁): 개발 축 `node-gold`(설계·구현 계약서) → `node-white`(구현) → `node-black`(정적 검증, CRITICAL 0) → `node-bronze`(실브라우저 E2E, 2모드 마라톤, 로그인 필요한 확인 전담) / `node-silver`(PM·우선순위·두 갈래 목록) / 지원 축 `node-gray`(벤치마크) · `node-purple`(디자인 판정) · `node-navy`(법무·개인정보) · `node-orange`(데이터·재무) · `node-green`(B2B 브랜드 유치) · `node-pink`(B2C 전문가 모집) · `node-beige`(CS·운영·가이드). 산출물 폴더 `docs/리서치·디자인·법무·재무·영업·마케팅·운영/`.
**계정 스킬**(Cowork 동기화, 폴더 밖): `archi-white/black/gray/gold/bronze`, 매거진 편집팀 `mag-*` 8종. 이름이 비슷해도 **프로젝트 에이전트(`node-*`)와 별개**. 옛 프로젝트 스킬 `white-pm`·`black-qa`는 `.claude/skills-백업-2026-09-12/`.

**흐름**: 한울님 → 지휘 창(지시서 `docs/회의/`) → 실행창 → 골드·화이트·블랙·브론즈 → 「배포 준비됨」 → 지휘 창 「배포할까요?」 → `tools/deploy.ps1`. 작은 수정은 화이트→블랙만.

## 7. 지키는 것

- **검수 없이 배포 없음.** 코드가 바뀌면 node-black CRITICAL 0, 화면이 바뀌면 node-bronze.
- **지휘 창은 코드를 안 고친다.** 배포(push)·라이브 대조·백업만 직접. 배포 전 **「배포할까요?」**(실방문자가 있는 사이트).
- **`firestore.rules`는 콘솔 게시가 배포다.** `deploy.ps1`이 경고를 낸다. 보고 맨 위에 적는다.
- **테스트 데이터는 `[테스트-○○]` 표시만 달고 지우지 않는다.** 정리는 한울님이 정한 때 한 번에(`tools/scan-test-data.js`로 목록).
- **결함은 `docs/검수대장.md`에.** 사람이 판정한 것만 고친다. 보류 영역(작업일지 B·C)은 발견해도 `보류`로만.
- **결정은 규정집 먼저, 코드는 그 다음.** 정책 숫자(요금·날짜)를 코드에 새로 박지 않는다.
- **이중 언어 필수**, 공유 `style.css`, 디자인 시스템 준수.
- 한울님은 반말로 지시하지만 답은 존댓말. 비전문가 — 선택지+추천+이유+잃는 것.

## 8. 알려진 함정 (실제 사고)

- **Edit 도구 잘림** — `magazine.html`·`lang.js` 끝이 잘려 사이트 다운(커밋 `8d0931e`, `639303c`). 200줄+ 변경은 Node 줄 단위 치환, 끝나면 `</html>` 확인.
- **대량 `git add` → index 손상**(Cowork mount). `git add -A` 금지, 경로 지정. 50 파일 이상은 GitHub Desktop.
- **`firebase-auth-compat.js` 없는 페이지에서 `firebase-config.js`가 throw**(BUG-1). Firestore 쓰는 페이지는 auth-compat까지 싣는다.
- **카테고리 nav `../` 404**(2026-07-02) — 깊이별 상대경로 검사.
- **매거진 자동 발행 스케줄**(Cowork, 편집팀 8인)이 옛 PC 절대경로로 돌고 있다 — 작업일지 A-⑤.
- **매거진 자동 발행 템플릿이 `<style>` 잘린 채 복제**(A-013, 2026-09-12 브론즈 실측 41편 백지 → 화이트 `tools/fix-magazine-blank.js`로 복구) — 새 기사는 `</head><body>` 존재를 블랙이 검사. 파이프라인 템플릿(리포 밖)은 한울님.
- **바깥 폴더 메모 docx에 평문 자격정보** — 옮겨 적지 말 것. 작업일지 A-⑦.
- **`.ps1`은 UTF-8 BOM 필수** — PowerShell 5.1이 BOM 없는 한글 파일을 CP949로 읽어 따옴표·괄호를 삼킨다(2026-09-12 `deploy.ps1` 실측). Write 도구는 BOM 없이 쓰므로 저장 후 BOM으로 재저장.
- **서비스워커는 정식 오픈 전까지 캐시 금지(엑사 규칙)** — `admin/sw.js`는 설치 조건용으로만 두고 `fetch`를 가로채지 않는다(`respondWith` 없음). 캐시를 넣으면 배포해도 옛 화면이 남아 "새로고침해도 안 바뀐다"가 된다. 공개 페이지에는 manifest·sw를 붙이지 않는다(scope `/admin/`).

## 9. 실비아 (EU Director)

Silvia Vandone · silviavandone@hotmail.com(스팸함 위험, 응답률<5%면 도메인 메일로) · 1차 20개 브랜드 자료 `sales/silvia-batch-1-*`, 브로슈어 `downloads/`. 1차 발송 여부·응답률은 **확인 못 함**(규정집 안건 7).

---

개정: 2026-09-12 · 아키노드 지휘 창 (운영 체계 이식) / 원본: 2026-07-02 · 아키-화이트
