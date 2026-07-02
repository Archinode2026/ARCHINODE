# 어드민 이메일 알림 자동화 설정 가이드

**목적**: 신규 브랜드 신청·컨설팅 요청·매거진 원고·뉴스레터 접수 시 `office@archinode.org`에 자동 이메일.

**방식**: Firebase Extensions "Trigger Email from Firestore" + Gmail SMTP  
**비용**: 무료 (Gmail SMTP 무료 500건/일, Firestore 무료 티어)  
**소요**: 30분 (Gmail 앱 비밀번호 발급 15분 + Extension 설치 15분)

---

## 1단계: Gmail 앱 비밀번호 발급 (15분)

**주의**: 일반 Gmail 비밀번호는 SMTP에 사용 불가. **앱 비밀번호**가 별도로 필요.

### 준비: 2단계 인증 활성화 (이미 켜져 있으면 스킵)

1. https://myaccount.google.com/security 접속 (wool21wool@gmail.com으로 로그인)
2. "2단계 인증" 클릭 → 안내 따라 활성화

### 앱 비밀번호 생성

1. https://myaccount.google.com/apppasswords 접속
2. "앱 이름" 필드에 `ARCHINODE Firebase` 입력 → **만들기** 클릭
3. 16자리 비밀번호 표시됨 (예: `abcd efgh ijkl mnop`)
4. **이 비밀번호를 어딘가에 복사해 두세요** (다시 못 봅니다)

## 2단계: Firebase Extension 설치 (10분)

1. https://console.firebase.google.com/project/archinode-8ab04/extensions 접속
2. 화면 상단 검색창에 **"Trigger Email"** 입력
3. **"Trigger Email from Firestore"** (by Firebase) 카드 클릭 → **설치** 클릭
4. 프로젝트에 설치 승인
5. 설정 화면 나오면 다음 값 입력:

| 필드 | 값 |
|---|---|
| SMTP connection URI | `smtps://wool21wool@gmail.com:앱비밀번호@smtp.gmail.com:465` |
| SMTP password (별도 필드) | 위에서 발급받은 앱 비밀번호 |
| Default FROM address | `ARCHINODE Notifications <wool21wool@gmail.com>` |
| Default REPLY-TO | `office@archinode.org` |
| Email documents collection | `mail` |
| Users collection | (비워두기) |
| Cloud Functions location | `asia-northeast3` (서울) |
| Event Arc region | (기본값) |

**주의**: SMTP URI에 앱 비밀번호 넣을 때 공백 제거. `abcd efgh ijkl mnop` → `abcdefghijklmnop`

6. **"확장 프로그램 설치"** 클릭 → 3~5분 대기
7. 완료 화면에서 상태가 "Enabled"로 표시되면 성공

## 3단계: Firestore 룰 업데이트 (자동)

`firestore.rules`에 `mail` 콜렉션 룰이 이미 추가되었습니다. 다음 세션 시작 시 Firebase Console에서 재게시 필요.

## 4단계: 사이트 코드 wiring (자동)

각 폼(`list-your-brand.html`, `request-consultation.html`, `submit-trend.html`, `index.html` Newsletter)에서 제출 시 `mail` 콜렉션에 알림 문서를 자동 추가하도록 코드 삽입됨.

**알림 이메일 종류 4가지**:
1. 신규 브랜드 신청 (`[ARCHINODE] 신규 브랜드 입점 신청 — {brandName}`)
2. 컨설팅 요청 (`[ARCHINODE] 컨설팅 요청 — {companyName}`)
3. 매거진 원고 제출 (`[ARCHINODE] 매거진 원고 — {brandName}: {title}`)
4. 뉴스레터 구독 (`[ARCHINODE] 뉴스레터 구독 — {email}`)

각 이메일에는 어드민 대시보드 링크 포함.

---

## 테스트 방법

Extension 설치 완료 후 5분 뒤:

1. https://archinodekr.com/list-your-brand.html 접속
2. 테스트 데이터로 폼 제출 (본인 이메일 사용)
3. 5~10초 안에 `wool21wool@gmail.com`에 알림 이메일 도착 확인

## 문제 해결

**이메일 안 옴**
- Firebase Console → Extensions → "Trigger Email" → 로그 확인
- Gmail 발신함 확인 — 실패한 발송 시도 있는지
- Gmail 앱 비밀번호가 정확한지 재확인

**Cannot authenticate** 에러
- Gmail 2단계 인증 켜져있는지
- 앱 비밀번호에 공백 없는지
- Gmail 계정 로그인해서 "보안 문제" 없는지

## 확장

이후 필요 시:
- SendGrid로 이전 (무료 12k/월, deliverability 더 좋음)
- 알림 종류별 발신자 분리 (silvia@ / office@ / newsletter@)
- HTML 이메일 템플릿 (지금은 텍스트만)

---

작성: 2026-06-30 · 아키-화이트
