# articles 컬렉션 스키마

ARCHINODE 매거진 발행 시스템의 Firestore 데이터 모델.

## 개요

- 입점 승인된 브랜드(`brands/{uid}.status === 'approved'`)가 자체 콘텐츠를 매거진에 발행
- 본문은 **블록 배열** (텍스트/이미지 인라인) — 사진→글→사진→글 자연스러운 흐름
- 어드민 검수 후 `status: approved`로 변경되면 magazine.html에 동적 노출
- 이미지는 Firebase Storage (`articles/{brandId}/{articleId}/image-{idx}.{ext}`)에 저장, URL만 blocks에 기록

## 문서 ID

자동 생성 (Firestore `addDoc`). 슬러그는 별도 필드.

## 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `brandId` | string | ✓ | Firebase Auth uid (= brands/{brandId} 문서 ID) |
| `brandName` | string | ✓ | 카드 표시용 (denormalize, 작성 시점 brands.brandName 복사) |
| `title` | string | ✓ | 글 제목 |
| `slug` | string | ✓ | URL용 (title 기반 자동 생성, 소문자·하이픈, 중복 시 `-2` 등 suffix) |
| `tag` | string | ✓ | 카테고리 태그 — `Brand Spotlight` / `Trend` / `Project` / `Interview` / `Guide` |
| `blocks` | array | ✓ | 본문 블록 배열 (아래 블록 스키마 참조) |
| `coverImage` | string | — | 카드 대표 이미지 URL (없으면 blocks에서 첫 image 자동 추출) |
| `excerpt` | string | — | 카드 요약문 (없으면 blocks의 첫 text 블록 앞 150자 자동) |
| `lang` | string | ✓ | 원본 언어 — `'en'` (1차 출시 기본) / `'ko'` |
| `status` | string | ✓ | `'pending'` / `'reviewing'` / `'revision-requested'` / `'approved'` / `'rejected'` (생성 시 `pending` 강제, 이후 어드민만 변경) — **2026-11-04 정정(A-204)**: 문서는 3단계로 적혀 있었지만 `admin/articles.html` 은 처음부터 5단계를 썼다. 실제 데이터에 `reviewing` 이 들어 있어 문서를 코드에 맞췄다. `magazine.html` 은 `approved` 만 노출하고, 브랜드 포털은 다섯 상태를 모두 한국어·영어로 표시한다 |
| `reviewerNote` | string | — | 어드민 검수 메모. `rejected` 면 반려 사유, `revision-requested` 면 수정 요청 사유로 브랜드 포털에 그대로 보인다 — **2026-11-04 정정(A-204)**: 문서는 `reviewNote` 로 적혀 있었지만 어드민과 브랜드 포털은 둘 다 `reviewerNote` 를 쓴다. 문서가 틀렸다 |
| `createdAt` | timestamp | ✓ | `serverTimestamp()` |
| `publishedAt` | timestamp | — | 승인 시 어드민이 `serverTimestamp()` 입력 |
| `koTitle` | string | — | 한국어 제목 — **읽는 코드가 없다(A-205)** |
| `koExcerpt` | string | — | 한국어 요약 — **읽는 코드가 없다(A-205)** |
| `koBlocks` | array | — | 한국어 본문 블록 — **읽는 코드가 없다(A-205)** |
| `koreanBody` | string | — | 어드민이 입력하는 한국어 번역 **원문 텍스트**. `admin/articles.html` 이 쓰고 같은 화면만 읽는다 — 사이트 어디에도 안 나간다(A-205) |
| `englishBodyEdited` | string | — | 어드민이 손본 영어 본문. 위와 같다(A-205) |

> **A-205 (열림)** — 한국어 기사 노출 기능이 아직 없다. 어드민이 입력하는 `koreanBody`·`englishBodyEdited` 와
> 이 문서의 `koTitle`·`koExcerpt`·`koBlocks` 는 **저장소 전체에서 읽는 코드가 하나도 없다.**
> 두 갈래가 정리되어야 한다: ① 노출 화면을 만들 때 어느 필드를 정본으로 할지(`koreanBody` 평문 vs `koBlocks` 블록),
> ② 그때까지 어드민 번역란은 '게시용 초안' 임을 화면에 밝힌다(2026-11-04 적용).
> 모달의 `English` 본문 탭이 읽는 `englishBody`·`originalBody` 도 스키마에 없는 필드다 — 같은 복사 원인.

## 블록 스키마 (`blocks` 배열의 각 요소)

### 텍스트 블록
```json
{
  "type": "text",
  "content": "단락 텍스트. 줄바꿈은 \\n으로 보존. 1차는 plain text, 향후 마크다운 확장 가능."
}
```

### 이미지 블록
```json
{
  "type": "image",
  "url": "https://firebasestorage.googleapis.com/.../articles/{brandId}/{articleId}/image-0.jpg",
  "alt": "alt 텍스트 (접근성·SEO)",
  "caption": "사진 설명 (선택)"
}
```

블록 순서가 본문 흐름 순서. 사진→글→사진→글 같은 인터리브가 자연스럽게 표현됨.

## 권한 (`firestore.rules`에 이미 정의됨)

- **read**: `status === 'approved'` 누구나 / 본인(`uid === brandId`)·어드민은 모든 상태
- **create**: 인증된 사용자, `brandId === auth.uid`, `status === 'pending'` 강제, `title` 필수
- **update**: 어드민(모든 필드) / 본인(status·brandId·createdAt·publishedAt 변경 금지)
- **delete**: 어드민만

## 이미지 업로드 (Firebase Storage)

- 경로: `articles/{brandId}/{articleId}/image-{idx}.{ext}`
- 클라이언트 자동 압축: 가로 1600px 초과 시 리사이즈, JPEG 품질 85%
- 형식 제한: jpg / jpeg / png / webp
- 용량 제한: 압축 후 5MB 이내

## 자동 파생 필드 계산 규칙

- **slug**: `title.toLowerCase()` → 영숫자·공백 외 제거 → 공백을 `-`로 → 최대 80자
- **excerpt**: blocks의 첫 `text` 블록에서 `content` 앞 150자 (없으면 빈 문자열)
- **coverImage**: blocks의 첫 `image` 블록 `url` (없으면 빈 문자열, magazine 카드에선 placeholder 사용)

## magazine 노출 (동적 렌더링)

- `magazine.html`이 onSnapshot으로 `where('status', '==', 'approved')` + `orderBy('publishedAt', 'desc')` 글 카드 렌더
- 기존 정적 `magazine/*.html` 49개는 그대로 유지, 정렬 통합은 차후 (1차는 동적 카드를 상단에 노출)
- 글 상세: `magazine/view.html?id={articleId}` — 블록 순회 렌더

## 워크플로우

1. 입점 승인된 브랜드가 brand-portal/dashboard.html에서 "Write Article" 클릭
2. 블록 에디터로 본문 작성 (텍스트/이미지 블록 자유 배치)
3. "Submit for Review" → Firestore `articles` 컬렉션에 `status: pending` 저장
4. 어드민이 `admin/articles.html`에서 검수 → 승인 시 `status: approved`, `publishedAt: serverTimestamp()`
5. magazine.html에 즉시 동적 노출

작성: archi-white · 2026-05-29
