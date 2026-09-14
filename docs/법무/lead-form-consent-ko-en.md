## 노드-네이비 검토 — 리드 폼(견적요청·문의·딜러연결) 개인정보 제3자 제공 동의 문구 (2026-09-14)

### 결론 (한 줄) · 위험도

**결론:** 방문자 연락처를 유럽 소재 브랜드에 넘기는 구조이므로 「제3자 제공 동의」만으로는 부족하고, 개인정보보호법상 **국외 이전 고지 요건**(이전받는 자·국가·일시/방법·목적·보유기간·거부권 및 불이익)까지 채운 문구가 필요하다. 아래에 KR/EN 초안(짧은 버전 + 긴 버전) 4종을 낸다.

**위험도: 높음** — 이유:
1. 4b 지시서(`docs/회의/2026-09-12-작업지시-어드민개편-4b단계-리드-공개폼.md` 10·14줄)가 이미 "동의 없이 제출되는 경로 금지"를 못 박아 놨는데, 정작 `privacy.html`·`privacy-en.html`에는 **리드 폼을 통한 제3자(브랜드) 제공이 명시돼 있지 않다.** 문구만 폼에 붙이고 방침 본문을 안 고치면 방침과 실제 처리가 어긋난 상태로 배포된다(철칙 2).
2. 받는 쪽(브랜드)이 유럽 소재라 **국외 이전**(개인정보보호법 제28조의8)에 해당할 가능성이 높다. 일반 제3자 제공 동의 문구보다 요구 항목이 많다(아래 대조표).
3. `docs/firestore-schema.md` 9절 `leads` 스키마에 **보관 기간·파기 시점이 정의돼 있지 않다.** 동의 문구에 보관 기간을 적으려면 먼저 정책 숫자가 정해져야 한다(철칙 1 — 아직 안 정한 걸 약속하지 않는다).

---

### 현행 vs 필요 (대조표)

| 항목 | 현행 | 필요 (4b 리드 폼) | 근거 |
|---|---|---|---|
| 수집 항목 고지 | `privacy.html` 104행 "문의 시: 이름, 이메일, 문의 내용"만 — 회사명·전화번호·업종 없음 | `leads` 스키마 필드(name, company, email, phone, industry, message) 전부 반영 | `docs/firestore-schema.md` 9절, `privacy.html:104` |
| 영문 방침 대응 항목 | `privacy-en.html` 545행 "General Communication: Name, email, phone, message" — company·industry 없음, 구조도 KR판과 다름(조항 수·회사 주소 상이) | 동일하게 보강 | `privacy-en.html:543-547` |
| 제3자 제공 근거 조항 | `privacy.html` 121-125행 제4조 — "딜러십 스크리닝 서비스" 1건만 예외로 명시, 견적요청/브랜드문의/딜러연결 3종 리드는 없음 | 리드 3종(`quote`·`brand-inquiry`·`dealer`)을 제3자 제공 근거로 추가 | `privacy.html:121-125`, `docs/firestore-schema.md` 9절 `type` |
| 영문 방침 제3자 조항 | `privacy-en.html` 572-580행 6절 — Firebase·법령·용역업체만 열거, "브랜드에게 제공"이 아예 없음 | 브랜드 제공 항목 추가 | `privacy-en.html:572-580` |
| 국외 이전 고지 | 없음 | 이전받는 자(브랜드명, 자동표시)·소재국·일시/방법(폼 제출 시 전자 전송)·목적·보유기간·거부권과 불이익을 문구에 명시 | 개인정보보호법 제28조의8 — **변호사 확인** |
| 보관 기간 | `privacy.html` 115-119행 제3조 — 리드/문의 카테고리 자체가 없음(계약 5년, 분쟁 3년, 방문기록 3개월만 있음) | 신설 필요. 이 문서는 잠정안만 제시 — **변호사 확인 후 확정, 확정 전엔 코드·문구에 숫자 확정 표기 금지** | `privacy.html:115-119` |
| 동의 체크박스 UI | 없음(4b 미착수) | 이 문서의 짧은 버전(체크박스 옆) + 긴 버전(모달/링크) | 4b 지시서 14줄 |
| 코드 필드 매핑 | — | 체크박스 값은 `leads` 문서에 별도 필드로 남길지(예: `consentAt`), 아니면 create 자체가 동의 증거인지 화이트·골드가 결정 | `docs/firestore-schema.md` 9절 규칙 — 현재 create 스키마엔 동의 필드가 없음 |
| KR/EN 정본 여부 | 미정 — `privacy.html`과 `privacy-en.html`이 조항 구성부터 다름(KR 5조 vs EN 8절+), 회사 주소도 다르게 적혀 있음 | 결정 필요 | 규정집 안건 후보(아래) |

---

### 문안 초안 (KR / EN)

#### 1. 체크박스 옆 짧은 버전

**KR**
> [필수] 입력한 이름·회사명·이메일·전화번호·업종·문의 내용을 문의 대상 브랜드(유럽 소재, 제3자)에게 제공하는 데 동의합니다. [자세히 보기]

**EN**
> [Required] I agree that my name, company, email, phone number, industry, and message will be shared with the brand I am contacting (a third party based in Europe). [See details]

체크박스는 기본 미선택(옵트인), 선택해야 제출 버튼이 활성화되도록 — 4b 지시서 20줄 "동의 없이 제출되는 경로 금지"와 일치시킨다.

#### 2. 자세히 보기(모달/링크)용 긴 버전

**KR**
> **개인정보 제3자 제공 동의 (국외 이전 포함)**
>
> ARCHINODE(운영: 비비들리바이브)는 견적요청·브랜드 문의·딜러 연결 신청을 처리하기 위해 아래와 같이 귀하의 개인정보를 문의 대상 브랜드에게 제공합니다.
>
> 1. **제공받는 자**: 귀하가 문의한 브랜드 — [브랜드명 자동 표시] (유럽 소재)
> 2. **제공 항목**: 이름, 회사명, 이메일, 전화번호, 업종, 문의(메시지) 내용
> 3. **제공 목적**: 견적 회신, 제품 문의 응대, 딜러십 연결 검토
> 4. **이전 국가 및 방법**: 유럽(브랜드 소재국) · 폼 제출 시 전자적 방식으로 즉시 전송
> 5. **보유·이용 기간**: [보관 기간 확정 전 — 변호사 확인 항목. 잠정안: 문의 처리 종료 후 O년 또는 브랜드 요청 시 즉시 파기]
> 6. **동의 거부 권리 및 불이익**: 동의를 거부할 권리가 있으며, 거부 시 견적요청·문의·딜러 연결 신청을 제출할 수 없습니다(다른 서비스 이용에는 영향이 없습니다).
> 7. **철회 방법**: office@archinode.org 로 요청 시 제공을 중단하거나, 이미 제공된 정보의 열람·정정·삭제를 요청할 수 있습니다. 처리에는 영업일 기준 일정 기간이 소요될 수 있습니다.
>
> 자세한 내용은 [개인정보처리방침]을 참고하십시오.

**EN**
> **Consent to Third-Party Disclosure (Including Overseas Transfer)**
>
> ARCHINODE (operated by VIVIDELIVIBE) shares the information you submit with the brand you are contacting, in order to process your quote request, brand inquiry, or dealer-connection request, as follows:
>
> 1. **Recipient**: the brand you are contacting — [brand name shown automatically] (based in Europe)
> 2. **Items shared**: name, company, email, phone number, industry, and your message
> 3. **Purpose**: to respond to your quote request, answer your product inquiry, or review a dealer connection
> 4. **Destination country and method**: Europe (the brand's home country) · sent electronically at the moment you submit the form
> 5. **Retention period**: [pending legal confirmation — see draft note below. Provisional: deleted N years after the inquiry is closed, or immediately upon the brand's deletion request]
> 6. **Right to refuse and consequence**: You may refuse to consent. If you refuse, you will not be able to submit this request (this does not affect your use of any other part of the site).
> 7. **How to withdraw**: Contact office@archinode.org to stop future sharing, or to request access to, correction of, or deletion of information already shared. Processing may take a number of business days.
>
> See our [Privacy Policy] for details.

---

### 코드에 반영할 것 (파일:줄, 화이트 몫) · 규정집 안건으로 올릴 것

**화이트에게 (4b 지시서 대상 파일)**
- `lead-form.js`(신규) — 위 짧은 버전을 체크박스 라벨로, 긴 버전을 모달 또는 별도 앵커(`#lead-consent`)로 삽입. `data-en`/`data-ko` 짝 필수(CLAUDE.md 7절).
- `brands/view.html` 520·592행, `products/view.html` 376행 — 기존 Contact/Request Info 버튼이 여는 모달에 동의 체크박스가 기본 미선택 상태로 들어가는지 확인.
- 체크박스 상태를 `leads` 문서에 남길지 여부(예: `consentGiven: true`, `consentAt`)는 **골드가 먼저 결정** — 현재 `docs/firestore-schema.md` 9절 create 규칙(`type`·`status`·`name`·`email.size()>5`·`message`·`createdAt==request.time`)에는 동의 필드가 없다. 필드를 추가하면 `firestore.rules`도 같이 고쳐야 하고(규칙 게시는 한울님), 4b 지시서 5줄 "규칙 변경 없음"과 충돌하니 **지휘 창에 먼저 보고**할 것.
- `privacy.html`·`privacy-en.html` — 아래 규정집 안건 결정 후, 제1조/제4조(KR) 및 3절/6절(EN)에 리드 폼 수집·제3자 제공 항목 추가. 이건 4b 코드 작업이 아니라 **별도 개정 공지 절차**(시행 전 고지 기간, 아래 변호사 확인)를 밟아야 한다.

**규정집 안건 후보**
1. **KR/EN 정본 지정** — 현재 `privacy.html`과 `privacy-en.html`이 조항 수·회사 주소까지 다르게 적혀 있어 둘 중 뭐가 기준인지 없음. 리드 폼 동의 문구도 두 언어로 나가는 이상 정본을 정해야 분쟁 시 해석 기준이 선다.
2. **리드 데이터 보관 기간 확정** — `leads` 스키마에 파기 시점이 없다. 이 문서의 "[보관 기간 확정 전]" 자리를 채울 숫자를 한울님이 정하고, 변호사 확인 후 `privacy.html` 제3조에 카테고리 추가.
3. **개인정보처리방침 개정 시 시행 전 고지 기간** — 몇 일(7일/30일 등)로 할지 미정(변호사 확인). 4b가 방침 개정과 같이 배포되면 개정 공지 없이 시행되는 상태가 될 수 있다 — 코드(리드 폼)가 방침보다 먼저 나가지 않도록 순서를 지휘 창이 관리해야 한다.
4. **국외 이전 형식 요건 충족 여부** — 위 긴 버전 문구가 개인정보보호법 제28조의8이 요구하는 6개 항목(이전받는 자, 이전되는 국가/일시/방법, 이용목적/보유이용기간, 거부권/불이익)을 실제로 만족하는지, 그리고 일반 제3자 제공 동의와 **별도 체크박스로 분리해야 하는지**는 변호사 확인 필요.

---

### 확인한 것 / 확인 못 한 것 / 변호사 확인 항목

**확인한 것**
- `docs/firestore-schema.md` 9절 `leads` 스키마의 수집 필드(name, company, email, phone, industry, message)와 4b 지시서가 요구하는 항목이 일치함을 확인했다.
- `privacy.html` 제4조(121-125행)에 "사전 동의한 경우" 제3자 제공이 이미 원칙으로 있어, 리드 폼 동의 체크박스가 그 원칙의 실제 구현이라는 점을 확인했다.
- `privacy.html`(KR)과 `privacy-en.html`(EN)이 조항 구성·회사 주소까지 서로 다르다는 것을 실측 대조로 확인했다(위 대조표).
- 현재 `leads` 컬렉션 create 규칙에 동의 여부를 기록하는 필드가 없다는 것을 확인했다.

**확인 못 한 것**
- 리드가 실제로 어느 유럽 국가의 브랜드로 가는지(브랜드마다 다름) — 문구에 "유럽"으로 일반화했는데 국가명을 브랜드별로 표시해야 하는지는 화이트·골드와 협의 필요.
- `leads` 데이터의 실제 파기 절차(수동/자동)가 있는지 — 없다면 보관 기간을 적어도 지켜지지 않는다.
- 동의 이력을 나중에 감사할 수단(체크 시각·IP 등 기록 여부)이 필요한지.

**변호사 확인 항목**
1. 위 긴 버전 문구가 개인정보보호법 제28조의8(국외 이전) 형식 요건을 만족하는지, 일반 제3자 제공 동의와 별개 체크박스가 필요한지.
2. 브랜드가 EU 소재 컨트롤러로서 이 정보를 처리할 때 GDPR이 적용되는지(데이터주체는 한국인 전문가이지만 처리자가 EU에 있는 경우의 역외 적용) — 적용된다면 ARCHINODE 쪽 고지 문구에 추가할 내용이 있는지.
3. 보관 기간 숫자(잠정안 "O년") 확정.
4. 방침 개정 시행 전 고지 기간(7일/30일 등) 확정.
5. 동의 거부 시 "다른 서비스 이용에는 영향 없음" 문구가 실제로 맞는지 — 리드 폼이 로그인 여부와 무관하게 완전히 별도 기능인지 재확인.

---

문서 위치: `docs/법무/lead-form-consent-ko-en.md`
