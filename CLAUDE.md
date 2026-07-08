# CLAUDE.md — ARCHINODE 프로젝트 안내 (AI 에이전트용)

**목적**: 새 Claude 세션이 이 리포지토리를 처음 열었을 때 5분 안에 프로젝트를 이해할 수 있게 하는 요약본. 상세는 `archi-diary/handoff-*.md` 참조.

---

## 1. 프로젝트 한 줄

**ARCHINODE** — 유럽 건축·디자인 브랜드를 한국 시장과 연결하는 정적 HTML + Firebase 플랫폼. 도메인: https://archinodekr.com

## 2. 기술 스택

- **Frontend**: 정적 HTML + CSS + Vanilla JS (모듈 없음). 194+ HTML 페이지.
- **Backend**: Firebase Firestore (9개 콜렉션) + Firebase Auth + Firebase Storage
- **Hosting**: GitHub Pages (main 브랜치 자동 배포, 5~10분 빌드)
- **다국어**: lang.js가 `data-en`/`data-ko` 속성 스캔해서 토글. `data-langs` body 속성으로 페이지별 언어 세트 지정.
- **Auth**: Firebase Auth (email/password). 어드민 화이트리스트는 `wool21wool@gmail.com`, `office@archinode.org` 두 개.

## 3. 폴더 구조

```
ARCHINODE/
├── index.html              # 메인
├── about, contact, brands, categories, magazine 등  # 랜딩·인덱스
├── admin/                  # 어드민 대시보드 (isAdmin 가드)
├── auth/                   # 로그인·회원가입·프로필
├── brand-portal/           # 브랜드 전용 대시보드 + article-editor.js
├── brands/view.html        # 브랜드 상세 페이지 라우터
├── categories/             # 10 대분류 + 69 서브카테고리
├── magazine/               # 82 매거진 글 + view.html (Firestore articles 렌더)
├── trend-report/           # 트렌드 리포트 채널 (Brand Magazine)
├── downloads/              # PDF 브로슈어
├── assets/                 # 이미지 + placeholder SVG
├── scripts/                # 자동화 스크립트 (make_sitemap, make_search_index)
├── docs/                   # 세팅 가이드
├── sales/                  # 실비아 컨택 자료 (콜드 메일, 브랜드 리스트)
├── silvia/                 # 실비아 명함 PDF
└── archi-diary/            # 개발 일지 + 인수인계 handoff
```

## 4. 핵심 파일

| 파일 | 역할 |
|---|---|
| `firebase-config.js` | Firebase 초기화 + `db`, `auth`, `storage`, `isAdmin()` 노출 |
| `lang.js` | 다국어 토글 IIFE. `window.setLang`, `window.toggleLang` 노출 |
| `firestore.rules` | 프로덕션 보안 룰 (Firebase Console에 별도 게시 필요) |
| `admin/dashboard.html` | 옵션 B (Suspend/Restore) 포함 어드민 |
| `brand-portal/article-editor.js` | 블록 에디터 (텍스트+이미지 인라인) |
| `sitemap.xml`, `search-index.json` | `scripts/make_*.py`로 재생성 |

## 5. Firestore 콜렉션

1. **brands** — 브랜드 신청·승인. status 4단계: pending/approved/suspended/rejected. 옵션 B UI로 관리.
2. **products** — 제품 카탈로그. brands와 연결.
3. **articles** — 매거진 원고. blocks 배열 (text/image 인라인). `magazine/view.html`이 렌더.
4. **users** — 국내 전문가 계정 (Phase 2B).
5. **leads** — 향후 사용 (현재 contact는 Formspree).
6. **trend-submissions** — Trend Report 원고.
7. **consultations** — 한국 시장 자문 요청.
8. **digital-products-notify** — 디지털 상품 알림 신청.
9. **newsletter-subscribers** — 뉴스레터 구독.
10. **mail** — Firebase Extensions "Trigger Email"용. 각 폼이 write, Extension이 발송.

## 6. 어드민 이메일 알림

- 4개 폼 (신규 브랜드/컨설팅/매거진 원고/뉴스레터)이 저장 후 mail 콜렉션에 알림 문서 추가
- Firebase Extension "Trigger Email from Firestore" 설치 필요 (`docs/admin-email-notification-setup.md` 참조)
- SMTP: Gmail 앱 비밀번호 사용

## 7. 사이트 스크립트 4종 (P3에서 신설)

- `cookie-consent.js` — GDPR 배너. `window.__cookieConsent` 노출
- `analytics-loader.js` — GA4 (consent gated). `GA_ID` 세팅 필요
- `sentry-loader.js` — 에러 트래킹. `DSN` 세팅 필요
- `form-throttle.js` — 폼 5초 재제출 차단

## 8. 실비아 (EU Director)

- **이름**: Silvia Vandone
- **이메일**: silviavandone@hotmail.com (SPF/DKIM 없어 스팸함 위험 — 향후 도메인 이메일로 이전 권장)
- **역할**: EU 브랜드 콜드 메일 발송, 응답 관리, 첫 컨택
- **자료**: `sales/silvia-batch-1-*`

## 9. 개발 워크플로우

**작업 요청 → 순서**:
1. 골드 (설계) — 방향·리스크·선택지 제시. 화이트 넘기기 전 필수.
2. 화이트 (구현) — 파일 수정·기능 추가.
3. 블랙 (검증) — 정적 스캔 (문법·문법·다국어·nav). CRITICAL 0건이면 통과.
4. 브론즈 (E2E) — Chrome 자동화로 실사용 테스트.

## 10. 알려진 함정

- **Edit 도구 잘림**: 큰 파일에 큰 replace 시 끝부분 자름. 200줄+ 변경은 Python `replace()` 사용.
- **Cowork git index 손상**: mount 파일시스템에서 반복 `git add` 시 index 손상. commit은 소규모(50 파일 미만) 또는 한울님 GitHub Desktop 로컬로 처리.
- **admin/dashboard.html 및 brand-portal/dashboard.html**: 큰 파일이라 Edit 특히 위험.

## 11. Firebase Console 룰 재게시 규칙

`firestore.rules` 변경 후 GitHub push만으로는 반영 안 됨. **한울님이 Firebase Console → Firestore Database → Rules 탭에 전체 복사·게시 필수**.

## 12. 다음 세션 시작 시

- `archi-diary/handoff-*.md` 최신 파일 읽기
- `git log --oneline -10`으로 최근 commit 확인
- `git status`로 미commit 변경 확인

---

작성: 2026-07-02 · 아키-화이트
