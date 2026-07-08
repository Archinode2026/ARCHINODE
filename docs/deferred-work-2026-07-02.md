# ARCHINODE 이후 작업 큐 (P3-4·P2-1·P2-4·P2-5·P1-2/3/4/5/6)

**작성**: 2026-07-02
**목적**: 런칭 검토 후 P3·P2·P1 중 코드가 아닌 인프라 세팅·의사결정·수동 작업이 필요한 항목을 정리. 각 항목별로 "무엇을·어떻게·언제" 명확히.

---

## P3-4 — Firebase Auth 계정 무한 축적 자동 정리

### 문제
`list-your-brand.html`이 신청 시 Firebase Auth 계정을 자동 생성함. 옵션 B에서 브랜드를 rejected·suspended로 처리해도 Auth 계정은 남음. 6개월 지나면 수백 개 유령 계정이 Firebase 무료 티어를 압박.

### 해결안 (선택 1)
**Option A (권장): Cloud Function 자동 삭제**
- Firestore `brands` 문서 update trigger
- status가 'rejected'로 변경되면 30일 후 admin.auth().deleteUser(brandId) 호출
- 세팅: Firebase Extensions "Delete User Data" 활용 가능

**Option B: 어드민 수동 삭제**
- admin/dashboard.html에 "Delete Auth Account" 버튼 추가 (rejected 상태에만)
- 한울님이 Firebase Console에서 삭제

### 예상 소요
- Option A: 반나절 (Firebase Functions 프로젝트 초기화 + 배포)
- Option B: 1시간 (버튼 추가 + Firebase Auth REST API 호출)

### 우선순위
브랜드 신청이 월 10건 넘어가면 Option A 필수. 그 전까지는 유예 가능.

---

## P2-1 — 파일명 유사 매거진 중복 정리 (9쌍)

### 발견된 중복 의심 파일 쌍

| # | 파일 A | 파일 B | 공통 키워드 |
|---|---|---|---|
| 1 | `auto-door-pet-door-convenipremium-2026` | `pet-durable-wallpaper-auto-door-interior-2026` | auto, door, pet, 2026 |
| 2 | `bim-construction-unit-price-h2-2026` | `construction-standard-unit-price-may-2026-shift` | construction, price, unit, 2026 |
| 3 | `cerik-h2-2026-construction-realestate-outlook-seminar` | `korea-construction-h2-2026-soc-budget-outlook` | construction, h2, outlook, 2026 |
| 4 | `hwang-yujeong-if-design-award-2026` | `woomee-elevator-if-design-award-2026` | award, design, if, 2026 |
| 5 | `interior-finishes-trend-2026-plaster-arch-functional` | `interior-materials-trend-2026-arch-tile-flat-flooring` | arch, interior, trend, 2026 |
| 6 | `uia-barcelona-2026-world-congress-becoming` | `uia-world-congress-barcelona-2026-becoming` | 이름 순서만 다름 (확률적으로 같은 글 재발행) |
| 7 | `seoulone-unstudio-10-minute-car-free-city-2026` | `unstudio-seoulone-car-free-10min-city-2026` | 이름 순서만 다름 |
| 8 | `salone-del-mobile-2026-trends` | `trend-report/salone-del-mobile-2026-trends` | 매거진/트렌드-리포트 양쪽 발행 |
| 9 | (관측 필요) | | |

### 처리 방법
1. 한울님이 각 파일 페어의 실 콘텐츠 읽기 (5분/쌍)
2. 동일 → 오래된 것 삭제 + magazine.html 카드에서 제거
3. 다름 → slug 명확화 (예: `uia-barcelona-2026-recap` vs `uia-barcelona-2026-preview`)

### 예상 소요
40~60분 (수동 판단 필수)

---

## P2-4 — VAT/부가세 처리 문구

### 시작 조건
PayPal 결제 실제 시작 시. 지금은 알림만이라 유예 가능.

### 필요한 문구
- **국내 (한국):** `terms.html`에 "결제 금액은 부가세(10%) 포함가입니다" 명시. 사업자등록번호 이미 표기됨.
- **EU B2B:** Invoice에 "VAT reverse charge — Article 44 EU VAT Directive" 명시. 구매자 VAT number 요구.
- **개인 소비자 (B2C EU):** 매출 기준 €10,000 초과 시 EU One-Stop-Shop 등록. 지금은 미해당.

### 예상 소요
1시간 (terms.html 문구 추가 + 인보이스 템플릿 준비)

---

## P2-5 — 실비아 hotmail → Google Workspace 도메인 이메일 이전

### 현황
`silviavandone@hotmail.com`. 개인 hotmail은 SPF/DKIM 없어 스팸함 착지 확률 15~30%. 실비아 콜드 메일 20통 중 3~6통이 안 열림.

### 해결안
**Option A (권장): Google Workspace**
- `silvia@archinodekr.com` 발급
- 월 US$6 (Business Starter)
- SPF/DKIM/DMARC 자동 설정 (도메인 소유 검증만 필요)
- 스팸함 착지 확률 5% 미만

**Option B: hotmail 유지 + 도메인 인증**
- hotmail은 SPF/DKIM 커스텀 설정 불가. Option A로만 해결.

### 세팅 절차
1. https://workspace.google.com 접속 → Business Starter 가입
2. 도메인 소유 검증 (Netim 또는 GitHub Pages DNS TXT 레코드 추가)
3. `silvia@archinodekr.com` 사용자 추가
4. MX 레코드 Google 값으로 변경
5. Gmail 앱으로 접속 → 실비아 서명 삽입
6. 콜드 메일 발신 이메일 교체

### 예상 소요
2~3시간 (Google Workspace 세팅 + DNS 전파 대기)

### 우선순위
실비아 첫 라운드 응답률 확인 후 결정. <5% 응답률이면 즉시 이전.

---

## P1-2 — 이탈리아어(data-it) 지원 확장

### 현황
`lang.js` 이미 다국어 배열 지원. `<body data-langs="en,ko,it">`로 설정하면 IT 토글 자동 표시.

### 필요한 작업
1. 이탈리아어 번역이 있어야 할 페이지 선정 (실비아 브랜드 타겟 페이지):
   - `index.html`
   - `for-brands.html`
   - `list-your-brand.html`
   - `about.html`
2. 각 페이지 `<body data-langs="en,ko,it">` 설정
3. `data-it="이탈리아어 텍스트"` 속성 추가 (모든 텍스트 노드에)

### 예상 소요
페이지당 2~4시간 (실비아 검수 포함). 4페이지 → 총 1.5~2일.

### 우선순위
실비아가 이탈리아 브랜드 응답 시 이탈리아어 자료 요청받는 순간 시작.

---

## P1-3 — aria-* 접근성 개선

### 현황
194개 페이지에 aria-* 속성 979개 (개당 5개 평균). WCAG AA 미충족.

### 우선 개선
1. **모든 인터랙션 버튼**에 `aria-label` 부여 (검색·언어 토글·메뉴 등)
2. **폼 필드**에 `aria-required`, `aria-invalid` 추가
3. **모달**에 `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
4. **드롭다운**에 `aria-expanded`

### 예상 소요
Python 스크립트로 일괄 (반나절) + 수동 검증 (반나절).

### 우선순위
법적 요구사항이 발생하면 즉시. 그렇지 않으면 후순위.

---

## P1-4 — Firebase Cloud Functions 도입

### 필요 시점
- P3-4 Auth 자동 삭제 시
- 매거진 원고 승인 후 자동 SEO 처리 시
- 브랜드 승인 후 자동 이메일 (환영 메일 등)

### 프로젝트 초기화 (한 번만)
```bash
cd C:\Users\songb\Desktop\아키노드\ARCHINODE\ARCHINODE\ARCHINODE
npm install -g firebase-tools
firebase login
firebase init functions  # TypeScript 권장, ESLint yes
```

### 첫 함수 예시
- `functions/src/index.ts`에 `onBrandRejected` 트리거 작성
- `firebase deploy --only functions` 로 배포

### 예상 소요
초기 세팅 2시간 + 첫 함수 4시간.

---

## P1-5 — Firestore 백업 스크립트

### 방법 1: Google Cloud Scheduled Backup (권장)
- Firebase Console → Firestore Database → Backups 탭
- Backup schedule 활성화 (daily, retention 7 days)
- Blaze plan 필요 (무료 티어 초과 시 소액 과금)

### 방법 2: `gcloud` CLI 수동 export
```bash
gcloud firestore export gs://archinode-8ab04.appspot.com/backups/$(date +%Y%m%d)
```
로컬 cron으로 매일 실행 가능.

### 예상 소요
방법 1: 15분. 방법 2: 1시간 (GCP 인증 세팅 + cron).

---

## P1-6 — CSP/HSTS 등 보안 헤더

### GitHub Pages 제약
- CSP: `<meta http-equiv="Content-Security-Policy">` 로 페이지 단위 설정 가능 (헤더 대신).
- HSTS: GitHub Pages 미지원. Cloudflare 프록시 앞단 필요.
- X-Frame-Options: 상동.

### Cloudflare 도입 (권장)
1. Cloudflare 계정 생성 (무료 플랜)
2. archinodekr.com DNS를 Cloudflare로 이전
3. Rules 탭에서 HSTS·X-Frame-Options·X-Content-Type-Options 설정
4. Origin (GitHub Pages) 앞단에 Cloudflare CDN

### 예상 소요
Cloudflare 세팅 2시간 + DNS 전파 24시간.

### 우선순위
매출·데이터 규모 커진 후. 현재는 후순위.

---

## 요약 — 시작 순서 권장

| 시점 | 항목 | 이유 |
|---|---|---|
| 이번 주 | P2-5 실비아 hotmail 이전 | 첫 콜드 메일 응답률 결정 |
| 이번 주 | P2-1 매거진 중복 정리 | SEO·사용자 혼란 방지 |
| 실비아 응답 오면 | P3-1 PayPal Payment Link 세팅 | 실 매출 발생 |
| 브랜드 5+ 신청 후 | P3-4 Auth 자동 삭제 (Option A) | Firebase 무료 티어 보호 |
| 브랜드 20+ 승인 후 | P1-2 이탈리아어 확장 | 실비아 EU 유치 |
| PayPal 결제 시작 후 | P2-4 VAT 문구 | 법적 요건 |
| 매출 월 €500+ 후 | P1-5 백업 + P1-4 Cloud Functions + P1-6 Cloudflare | 인프라 강화 |
| 언제든 | P1-3 aria-* 개선 | 접근성 |

---

작성: 2026-07-02 · 아키-화이트
