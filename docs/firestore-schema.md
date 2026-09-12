# ARCHINODE — Firestore Data Schema

> 이 문서는 Firestore 컬렉션 구조를 정의합니다.
> 모든 데이터 관련 작업은 이 스키마를 따릅니다.
> 최종 수정: 2026-04-11

---

## 컬렉션 구조 개요

```
firestore/
├── brands/          ← 브랜드 (문서 ID = Firebase Auth UID)
├── products/        ← 제품 (자동 생성 ID)
├── articles/        ← 매거진 기사 (자동 생성 ID)
├── users/           ← 국내 전문가 계정 (Phase 2B, 문서 ID = Auth UID)
├── adminLogs/       ← 어드민 활동 장부 (2026-09-12 개편 2단계, 어드민 전용, 덧붙이기만 — 7절)
├── settings/        ← 정책 값·사이트 정보 (2026-09-12 개편 3단계, 문서 1개 config, 읽기 공개·쓰기 어드민 — 8절)
└── leads/           ← 리드 인박스 (2026-09-12 개편 4a 활성 — 어드민 등록·배정, 브랜드 포털 Inbox — 9절)
```

---

## 1. brands 컬렉션

**문서 ID:** Firebase Auth UID (브랜드 담당자 계정의 uid)

```javascript
{
  // ── 기본 정보 (입점 신청 시 수집) ──
  brandName: "Fritz Hansen",           // 브랜드명 (수정 불가)
  slug: "fritz-hansen",                 // URL용 슬러그 (자동 생성, 소문자+하이픈)
  email: "brand@fritzhansen.com",       // 담당자 이메일
  contactName: "John Doe",             // 담당자 이름
  position: "Marketing Director",       // 직책
  phone: "+45-12345678",               // 전화번호
  country: "Denmark",                   // 본사 국가
  category: "Furniture",                // 대표 카테고리 (10개 중 택 1)
  website: "https://fritzhansen.com",   // 공식 홈페이지
  description: "...",                   // 브랜드 소개 (짧은)
  referral: "Milan Design Week",        // 가입 경로

  // ── 브랜드 페이지 편집 (브랜드 담당자가 대시보드에서 입력) ──
  tagline: "Designed for life",         // 태그라인/슬로건
  founded: "1872",                      // 설립 연도
  headquarters: "Allerød, Denmark",     // 본사 위치
  brandStory: "...",                    // 브랜드 스토리 (상세)
  logoUrl: "https://...",               // 로고 이미지 URL
  heroImage: "https://...",             // 히어로/배너 이미지 URL
  gallery1: "https://...",              // 갤러리 이미지 1
  gallery2: "https://...",              // 갤러리 이미지 2
  gallery3: "https://...",              // 갤러리 이미지 3

  // ── 소셜 미디어 ──
  instagram: "https://instagram.com/fritzhansen",
  linkedin: "https://linkedin.com/company/fritzhansen",
  pinterest: "",
  youtube: "",

  // ── 한국 딜러 정보 ──
  koreanDealer: {
    name: "Nexus Design",                // 딜러 회사명
    contact: "02-1234-5678",             // 연락처
    email: "info@nexusdesign.kr",        // 이메일
    website: "https://nexusdesign.kr",   // 웹사이트
    address: "서울특별시 강남구 논현로 123", // 주소
    showroom: "서울 쇼룸"                 // 쇼룸 위치 (선택)
  },

  // ── 시스템 필드 ──
  status: "approved",                   // pending | approved | rejected
  createdAt: Timestamp,                 // 입점 신청 시각
  approvedAt: Timestamp,                // 승인 시각
  updatedAt: Timestamp,                 // 마지막 수정 시각
  // 어드민 전용 (옵션 B 정지·거절·복구): statusReason, statusChangedAt, statusChangedBy — 공개 페이지·규칙이 참조, 그대로 둔다
  // 2026-09-12 개편 2단계 — 상태 이력. 없어도 화면이 도는 선택 필드. reviewIssues 의 history 패턴과 같다.
  history: [                            // 상태가 바뀔 때마다 arrayUnion (같은 update 호출에 동봉)
    { status: "suspended", by: "office@archinode.org", at: "2026-09-12T10:00:00.000Z", note: "사유" }   // at 은 ISO 문자열
  ],

  // ── 통계 (Phase 2B에서 추가) ──
  likeCount: 0,                         // 좋아요 수
  productCount: 0,                      // 등록 제품 수
  articleCount: 0                       // 매거진 기사 수
}
```

**카테고리 허용 값:** Furniture, Bathroom, Outdoor, Lighting, Kitchen, Office, Finishes, Wellness, Decor, Construction

---

## 2. products 컬렉션

**문서 ID:** 자동 생성

```javascript
{
  // ── 브랜드 연결 ──
  brandId: "uid-12345",                 // brands 문서 ID (= Auth UID)
  brandName: "Fritz Hansen",            // 비정규화 (목록 표시용)
  brandSlug: "fritz-hansen",            // 비정규화 (URL 생성용)

  // ── 제품 기본 정보 ──
  name: "Series 7 Chair",              // 제품명
  slug: "series-7-chair",              // URL용 슬러그
  collection: "Series 7",              // 컬렉션/시리즈명
  description: "...",                   // 제품 설명
  designer: "Arne Jacobsen",           // 디자이너명

  // ── 카테고리 분류 ──
  category: "Furniture",                // 대분류 (10개 중 택 1)
  subcategory: "chairs-stools",         // 소분류 (서브카테고리 slug)

  // ── 스펙 ──
  materials: "Lacquered veneer",        // 소재
  dimensions: "W50 × D52 × H82 cm",    // 치수
  weight: "3.2 kg",                     // 무게 (선택)
  colors: ["Black", "White", "Walnut"], // 컬러 옵션 (배열)
  finishes: ["Matte", "Glossy"],        // 마감 옵션 (배열)

  // ── 가격 ──
  priceRange: "$$",                     // 가격대 ($, $$, $$$, $$$$, Contact)

  // ── 이미지 ──
  imageUrl: "https://...",              // 대표 이미지
  images: [                             // 추가 이미지 (배열)
    "https://...",
    "https://..."
  ],

  // ── 문서/파일 (Phase 3+) ──
  catalogPdf: "",                       // PDF 카탈로그 URL
  bimFile: "",                          // BIM 파일 URL (Phase 4)
  model3d: "",                          // 3D 모델 URL (Phase 4)

  // ── 시스템 필드 ──
  status: "pending",                    // pending | approved | rejected
  createdAt: Timestamp,
  approvedAt: Timestamp,
  updatedAt: Timestamp,

  // ── 통계 (Phase 2B) ──
  likeCount: 0,                         // 좋아요 수
  viewCount: 0                          // 조회 수
}
```

**서브카테고리 slug 매핑 (category → subcategory 허용값):**

| Category | Subcategories |
|----------|--------------|
| Furniture | sofas-armchairs, tables-desks, chairs-stools, storage-shelving, beds-bedroom, kids-furniture, cabinets-sideboards, modular-systems |
| Bathroom | bathtubs, washbasins-vanities, showers, bathroom-taps, bathroom-furniture, bathroom-accessories, mirrors, toilets-bidets, steam-rooms |
| Outdoor | outdoor-furniture, pergolas-canopies, outdoor-lighting, planters-pots, outdoor-kitchens, fire-pits-heaters, swimming-pools, garden-decor |
| Lighting | pendant-lights, floor-lamps, table-lamps, wall-lights, ceiling-lights, architectural-lighting, outdoor-lighting, smart-lighting |
| Kitchen | kitchen-systems, kitchen-appliances, sinks-taps, countertops, kitchen-storage, tableware |
| Office | desks-workstations, office-chairs, meeting-conference, acoustic-solutions, office-storage, lounge-reception |
| Finishes | tiles-ceramics, wood-flooring, natural-stone, wallcoverings, decorative-panels, metal-finishes |
| Wellness | saunas, steam-rooms, spa-hot-tubs, pools-whirlpools, fitness-equipment, wellness-showers |
| Decor | vases-planters, rugs-carpets, textiles-cushions, art-wall-decor, mirrors-frames, clocks-objects |
| Construction | windows-doors, facades-cladding, roofing-systems, stairs-railings, insulation, building-automation |

---

## 3. articles 컬렉션

**문서 ID:** 자동 생성

```javascript
{
  // ── 브랜드 연결 ──
  brandId: "uid-12345",
  brandName: "Fritz Hansen",
  brandSlug: "fritz-hansen",

  // ── 기사 정보 ──
  title: "How Danish Design Shapes Modern Korean Interiors",
  slug: "how-danish-design-shapes-modern-korean-interiors",
  tag: "Brand Spotlight",               // Brand Spotlight | Trend | Project | Interview | Guide | Market Report | Exhibition
  content: "...",                        // 기사 본문 (HTML 또는 plain text)
  excerpt: "...",                        // 요약 (목록 표시용, 자동 생성 가능)

  // ── 이미지 ──
  imageUrl: "https://...",              // 커버 이미지

  // ── 시스템 필드 ──
  status: "pending",                    // pending | approved | rejected
  createdAt: Timestamp,
  approvedAt: Timestamp,
  publishedAt: Timestamp,               // 공개 시각 (승인 시 설정)

  // ── 통계 ──
  viewCount: 0,
  likeCount: 0
}
```

---

## 4. users 컬렉션 (Phase 2B — 구현 완료)

**문서 ID:** Firebase Auth UID (국내 전문가 계정)

```javascript
{
  // ── 기본 정보 ──
  displayName: "김설계",
  email: "kim@design.kr",
  phone: "010-1234-5678",
  company: "㈜디자인스튜디오",          // 회사 / 사무소
  jobTitle: "선임 건축가",              // 직책
  industry: "architect",                // architect | interior | landscape | furniture | construction | dealer | developer | student | other
  role: "professional",                 // professional (고정값 — 브랜드 계정과 구분용)

  // ── 좋아요 목록 ──
  likedProducts: ["productDocId1", "productDocId2"],  // 좋아요한 제품 문서 ID 배열
  likedBrands: ["brandDocId1"],                        // 좋아요한 브랜드 문서 ID 배열

  // ── 시스템 필드 ──
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**industry 허용 값:** architect, interior, landscape, furniture, construction, dealer, developer, student, other

**어드민 화면(2026-09-12 개편 6단계)**: `admin/js/view-users.js` 읽기 전용 — `orderBy('createdAt','desc')` 단일 필드 200건씩(「더 보기」). 위 필드 목록은 `auth/signup.html` 263행 `set()`·`auth/profile.html` 279·422행과 대조해 **일치 확인(정정 없음)**. 규칙 `read: isOwner(userId) || isAdmin()` 그대로(변경 없음). 삭제·정지 화면 없음(Auth 계정 삭제는 서버 코드 필요).

---

## 5. Firestore 보안 규칙 (권장)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 브랜드: 본인 문서만 수정 가능, 누구나 approved 문서 읽기 가능
    match /brands/{brandId} {
      allow read: if resource.data.status == 'approved' || request.auth.uid == brandId || isAdmin();
      allow create: if request.auth != null;
      allow update: if request.auth.uid == brandId || isAdmin();
    }

    // 제품: 브랜드 소유자만 생성/수정, approved 제품은 누구나 읽기
    match /products/{productId} {
      allow read: if resource.data.status == 'approved' || request.auth.uid == resource.data.brandId || isAdmin();
      allow create: if request.auth != null && request.resource.data.brandId == request.auth.uid;
      allow update: if request.auth.uid == resource.data.brandId || isAdmin();
    }

    // 기사: 제품과 동일한 규칙
    match /articles/{articleId} {
      allow read: if resource.data.status == 'approved' || request.auth.uid == resource.data.brandId || isAdmin();
      allow create: if request.auth != null && request.resource.data.brandId == request.auth.uid;
      allow update: if request.auth.uid == resource.data.brandId || isAdmin();
    }

    // 유저 (Phase 2B): 본인 문서만 수정, 본인만 읽기
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    function isAdmin() {
      return request.auth != null &&
        (request.auth.token.email == 'office@archinode.org' ||
         request.auth.token.email == 'wool21wool@gmail.com');
    }
  }
}
```

---

## 6. 인덱스 (Firestore Composite Indexes)

```
products: brandId ASC, createdAt DESC
products: category ASC, status ASC, createdAt DESC
products: subcategory ASC, status ASC, createdAt DESC
articles: brandId ASC, createdAt DESC
articles: status ASC, createdAt DESC
```

---

## 7. adminLogs 컬렉션 (2026-09-12 어드민 개편 2단계 — 어드민 전용, 덧붙이기만)

**문서 ID:** 자동 생성 · **규칙:** `allow create, read: if isAdmin(); allow update, delete: if false;` (어드민이라도 수정·삭제 불가)
**쓰는 곳:** `admin/js/admin-core.js` `logAdmin(entry)` — 어드민의 모든 상태 변경 뒤 한 줄. 실패해도 화면 흐름을 막지 않는다(콘솔 warn + 토스트).
**읽는 곳:** `admin/js/view-logs.js`(운영 > 활동 로그, 100건씩 「더 보기」) · `view-dashboard.js`(최근 활동 20건).

```javascript
{
  at:     Timestamp,                    // serverTimestamp — orderBy('at','desc') 단일 필드만 (복합 색인 금지)
  by:     "office@archinode.org",       // 어드민 이메일
  action: "brand.status",               // 'brand.status' | 'product.status' | 'article.status' | 'review.status'
                                        // | 'consultation.status' | 'trend.status' | 'newsletter.status' | 'notify.status'
                                        // (계약서 4-1 예약: 'lead.status' | 'lead.assign' | 'inquiry.answer' | 'notice.save' | 'settings.save' | 'prospect.status' | 'prospect.import')
  target: { col: "brands", id: "docId", label: "Fritz Hansen" },   // label 은 사람이 읽는 이름
  from:   "approved",                   // 이전 값 (문자열, 없으면 '')
  to:     "suspended",                  // 새 값
  note:   "사유·메모",                   // updateBrand 의 reason 등
  page:   "dashboard"                   // 어느 화면에서 — 파일명에서 .html 을 뗀 것 ('dashboard' | 'consultations' | …)
}
```

기간·종류 필터는 클라이언트에서. 뉴스레터·디지털 알림은 상태가 아니라 삭제라 `from:'subscribed', to:'deleted'` 로 적는다.

---

## 8. settings 컬렉션 (2026-09-12 어드민 개편 3단계 — 읽기 공개·쓰기 어드민, 문서 1개)

**문서 ID:** `config` (고정, 1개) · **규칙:** `allow read: if true; allow write: if isAdmin();` — 개인정보 없음. 읽기를 공개로 두는 이유: 복귀 후 단계에서 공개 페이지가 읽게 하려면 어차피 필요(계약서 3장 3단계).
**쓰는 곳:** `admin/js/view-settings.js`(운영 > 설정) — 「기본값 채우기」(문서 없을 때만, for-brands.html 752·757·501줄 문구) → 「저장」 `set(…, {merge:true})` + `logAdmin('settings.save')`.
**읽는 곳:** `view-settings.js` · `view-dashboard.js`(adminNotice 상단 박스). **공개 페이지는 아직 읽지 않는다**(규정집 안건 1 결정 + 복귀 후 별도 단계).

```javascript
{
  listing: {
    freeUntilText_en: 'Free until Dec 2026, then EUR 10 / month',   // for-brands.html 752줄 그대로
    freeUntilText_ko: '2026년 12월까지 무료, 이후 월 EUR 10',
    founderText_en:   'Same EUR 10 / month, no upsell',              // 757줄 그대로
    founderText_ko:   '동일 월 EUR 10, 추가 요금 없음',
    freeUntil:        '2026-12-31',                                   // 501줄 "Free through December 2026" 에서 유추 — 규정집 안건 1 ④
    pendingIssue:     '안건 1'                                        // 비어 있지 않으면 설정 화면이 각 칸 옆에 빨간 「안건 1 결정 대기」 표시. 결정 뒤 비운다
  },
  site: { operator: '비비들리바이브', ceo: '박승리', bizNo: '640-03-02879', email: 'office@archinode.org',
          euDirector: 'Silvia Vandone', euEmail: 'silviavandone@hotmail.com', domain: 'archinodekr.com' },
  adminNotice: '',          // 어드민끼리 보는 메모 한 칸 — 대시보드 상단 회색 박스(escapeHtml)
  updatedAt: Timestamp,     // serverTimestamp
  updatedBy: 'office@archinode.org'
}
```

카테고리(10+69)·어드민 이메일(2개)은 **넣지 않는다** — 카테고리는 정적 페이지 79개와 1:1(브랜드 포털 `SUBCATEGORIES` 가 정본), 어드민 이메일은 `firestore.rules` `isAdmin()` 문자열 고정. 설정 화면 ③ 탭은 둘을 읽기 전용으로 보여만 준다(계약서 2-3).

---

## 9. leads 컬렉션 (2026-09-12 어드민 개편 4a — 규칙에 "선언만" 있던 컬렉션을 활성. 계약서 4-3)

**문서 ID:** 자동 생성 · **규칙:** create 누구나(4b 공개 폼 대비 — `type in ['quote','brand-inquiry','dealer']`·`status=='new'`·`name`·`email.size()>5`·`message`·`createdAt==request.time`) / read `isAdmin() || (isSignedIn() && resource.data.brandId == request.auth.uid && resource.data.status in ['assigned','contacted','closed'])` — 브랜드는 배정된 건만(2026-09-12 블랙 지적: 위조 brandId create·spam 되돌림이 포털에 노출되지 않게) / update 어드민 전부, 브랜드는 변경 전 `resource.data.status in ['assigned','contacted','closed']` + `diff().affectedKeys().hasOnly(['status','brandNote','history','updatedAt'])` + 변경 후 `status in ['assigned','contacted','closed']` / delete 어드민.
**쓰는 곳:** `admin/js/view-leads.js`(고객 > 리드 인박스 — 「+ 수동 등록」 create, 배정·상태·adminNote update, `logAdmin('lead.create'|'lead.assign'|'lead.status')`, 배정 시 `mail` 1통 "New lead assigned — ARCHINODE") · `brand-portal/dashboard.html` Inbox 탭(브랜드 — status·brandNote·history·updatedAt **4키만** update). 공개 폼(brands/view·products/view·contact)은 **4b, 한울님 복귀 후**.
**읽는 곳:** 어드민 `orderBy('createdAt','desc').limit(200)` 단일 필드 / 포털 `where('brandId','==',uid).where('status','in',['assigned','contacted','closed'])` **orderBy 없이** 클라이언트 정렬(등식+in 조합은 단일 필드 색인 병합 — `brandId+createdAt` 복합 색인 회피). 규칙 read 분기와 두 조건이 정확히 같아야 list 판정이 통과한다.

```javascript
{
  type:        'quote',                 // 'quote' | 'brand-inquiry' | 'dealer'
  status:      'new',                   // 'new' → 'assigned' → 'contacted' → 'closed' | 'spam' (포털은 assigned→contacted→closed 만)
  brandId:     '',                      // 배정 브랜드 uid ('' = 미배정)      brandName: ''   비정규화
  productId:   '',                      // 견적요청이면 제품 문서 id ('')     productName: '' 비정규화
  name: '', company: '', email: '', phone: '', industry: '',   // industry 는 users.industry 와 같은 값(auth/signup.html 목록)
  message:     '',                      // 본문 — 외부 입력. 표시 시 escapeHtml(저장 시 이스케이프 아님)
  source:      'admin-manual',          // 'admin-manual' | 'brand-page' | 'product-page' | 'contact'
  userId:      '',                      // 로그인한 전문가면 uid, 아니면 ''
  adminNote:   '',                      // 어드민 메모      brandNote: ''   브랜드 메모(포털 한 줄)
  createdAt:   Timestamp,               // serverTimestamp (= request.time, 규칙 검사)
  updatedAt:   Timestamp,  assignedAt: Timestamp | null,
  history:     [{ status: 'new', by: 'office@archinode.org', byRole: 'admin', at: '2026-09-12T…Z', note: 'manual entry' }]   // byRole 'admin' | 'brand', at 은 ISO 문자열(arrayUnion 이라 serverTimestamp 불가)
}
```

---

## 10. notices 컬렉션 (2026-09-12 어드민 개편 5단계 — 공지사항. 계약서 4-4)

**문서 ID:** 자동 생성 · **규칙:** `allow read: if isAdmin() || (isSignedIn() && resource.data.visible == true); allow create, update, delete: if isAdmin();` — 로그인 사용자는 노출 중인 공지만(넓히기). **사이트 공개 공지(비로그인)는 복귀 후** read 에 `|| resource.data.audience in ['site','all']` 를 더한다.
**쓰는 곳:** `admin/js/view-notices.js`(운영 > 공지사항 — 「+ 공지 등록」 add, 수정·노출 토글 update, `logAdmin('notice.save')`). 삭제 없음(노출 off 로 숨긴다 — 확인창을 쓰지 않는다).
**읽는 곳:** 어드민 `orderBy('createdAt','desc').limit(200)` 단일 필드 → 클라이언트 정렬(고정 → order → 최신) / 브랜드 포털 상단 배너 `where('visible','==',true)` **만**(규칙 read 분기와 동일 — orderBy·audience where 를 붙이면 복합 색인 필요) → 클라이언트에서 `audience in ['brand','all']` 필터·같은 정렬 → 1건 표시 + 「전체 보기」 모달.

```javascript
{
  title_en: '', title_ko: '',           // 둘 다 필수(규정: 이중 언어)
  body_en: '',  body_ko: '',            // 평문 — 줄바꿈만. HTML 아님: 표시는 escapeHtml + <br> (ntc_bodyHtml · 포털 pn_bodyHtml)
  audience:  'brand',                   // 'brand' | 'site' | 'all' — 포털은 brand·all 만 보여준다. site 는 복귀 후 사이트 공지용
  visible:   false,  pinned: false,     // 노출 / 고정(맨 위)
  order:     0,                         // 작은 수 먼저 (같은 고정 여부 안에서)
  createdAt: Timestamp, createdBy: 'office@archinode.org',   // serverTimestamp
  updatedAt: Timestamp, updatedBy: 'office@archinode.org'
}
```

---

## 11. inquiries 컬렉션 (2026-09-12 어드민 개편 5단계 — 1:1 문의. 계약서 4-5)

**문서 ID:** 자동 생성 · **규칙:** create `isSignedIn() && fromUid == request.auth.uid && status == 'open' && subject is string(1~199자) && body is string(1~4999자) && createdAt == request.time` / read `isAdmin() || (isSignedIn() && resource.data.fromUid == request.auth.uid)` / update·delete 어드민. `hasOnly` 없음 — create 에 다른 키(answer 빈 값 등)를 같이 보내도 된다.
**쓰는 곳:** `brand-portal/dashboard.html` Support 탭 `sup_send()`(create — 보내는 키는 아래 전부, `fromRole:'brand'`, `fromName` = 브랜드명) · `admin/js/view-inquiries.js`(고객 > 1:1 문의 — 답변 저장 update: `status·answer·answeredAt·answeredBy·updatedAt·history` + `logAdmin('inquiry.answer')` + `mail` 1통 to `fromEmail`, 제목 `"Re: <subject> — ARCHINODE"`(190자 컷 — mail 규칙 subject < 200), 본문 답변 + 원문 인용 300자 + 포털 링크). 전문가(auth/profile) 문의 폼은 **복귀 후**(`fromRole:'professional'` 예약).
**읽는 곳:** 어드민 `orderBy('createdAt','desc').limit(200)` 단일 필드 → 클라이언트 정렬(open 먼저 → 최신)·상태 필터 / 열린 건수 `where('status','==','open')` 한 번(`inq_loadOpenCount` — 사이드바 배지 + 대시보드 카드 「열린 문의」) / 포털 `where('fromUid','==',uid)` **만** → 클라이언트 정렬(규칙 read 분기와 동일).

```javascript
{
  fromUid:   'uid',                     // == request.auth.uid (규칙)
  fromRole:  'brand',                   // 'brand' | 'professional'(복귀 후)
  fromEmail: 'name@brand.com',          // 답변 메일 수신자
  fromName:  'Fritz Hansen',            // 브랜드명(또는 전문가 표시 이름)
  subject:   '',                        // 1~199자 (규칙 size() < 200)
  body:      '',                        // 1~4999자 (규칙 size() < 5000) — 외부 입력. 표시 시 escapeHtml + <br>
  status:    'open',                    // 'open' → 'answered' (create 는 'open' 만)
  answer:    '',  answeredAt: null,  answeredBy: '',   // 어드민 답변 (표시 시 escapeHtml + <br>)
  createdAt: Timestamp,                 // serverTimestamp (= request.time, 규칙 검사)
  updatedAt: Timestamp,
  history:   [{ status: 'open', by: 'uid', byRole: 'brand', at: '2026-09-12T…Z', note: '등록' },
              { status: 'answered', by: 'office@archinode.org', byRole: 'admin', at: '…', note: 'answered' }]   // at 은 ISO 문자열(arrayUnion 이라 serverTimestamp 불가)
}
```
