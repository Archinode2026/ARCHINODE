/* ───────────────────────────────────────
   free-period.js — 무료 기간 계산 (2026-11-26 A-726)

   승리님 결정(2026-11-26): 무료 기간은 **승인한 날부터 3개월**이다.
   그 전까지는 listing.freeUntil = '2026-12-31' 이라는 전역 고정일 하나를
   모든 브랜드가 나눠 쓰고 있었다 — 12월에 들어온 브랜드는 무료가 며칠뿐이고,
   그 날짜가 지나면 전원이 한꺼번에 유료가 된다. A-281 이 「전역 날짜 하나로
   표현할 수 없다」고 적어 두고 값은 그대로 뒀는데, 그 날짜가 이미 어긋났다.

   ★ 왜 승인일인가: 신청서를 낸 날로 잡으면 심사에 걸린 날이 무료 기간에서
     깎인다. 승인일은 브랜드가 실제로 포털을 쓸 수 있게 된 날이라 설명하기도
     쉽다(승리님 결정).

   ★ 왜 파일 하나인가: 이 저장소가 반복해 온 병이 사본 어긋남이다
     (A-348 · A-367 · A-393 · A-409 · A-688 · A-672). 어드민과 포털이 각자
     날짜를 계산하면 언젠가 다른 답을 낸다. 판단은 전부 여기 순수 함수에 두고
     양쪽이 이 파일을 싣는다. 시험(tools/test-free-period.js)이 여기를 센다.

   ★ 선언 규칙: 전역 function 선언만 쓴다 (admin-core.js 와 같은 까닭).
   ─────────────────────────────────────── */

/* 무료 개월 수. 바꾸려면 여기 한 곳. */
var FP_MONTHS = 3;

/* Firestore Timestamp · Date · ISO 문자열 · {seconds} 를 Date 로.
   못 읽으면 null — 「0일 남음」 같은 거짓말을 하지 않기 위해서다. */
function fpToDate(v) {
    if (!v) return null;
    try {
        if (typeof v.toDate === 'function') { var d0 = v.toDate(); return isNaN(d0.getTime()) ? null : d0; }
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        if (typeof v === 'object' && typeof v.seconds === 'number') {
            var d1 = new Date(v.seconds * 1000); return isNaN(d1.getTime()) ? null : d1;
        }
        if (typeof v === 'string' || typeof v === 'number') {
            var d2 = new Date(v); return isNaN(d2.getTime()) ? null : d2;
        }
    } catch (e) { return null; }
    return null;
}

/* 승인일 + FP_MONTHS 개월.
   ★ 월말 처리: 11월 30일 승인 → 2월 30일은 없다. setMonth 는 3월 2일로 넘겨
     버리는데, 그러면 브랜드가 이틀을 더 받는다(작지만 설명할 수 없는 차이다).
     넘어가면 그 달의 마지막 날로 끌어내린다. */
function fpFreeUntil(approvedAt) {
    var start = fpToDate(approvedAt);
    if (!start) return null;
    var day = start.getDate();
    var end = new Date(start.getTime());
    end.setMonth(end.getMonth() + FP_MONTHS);
    if (end.getDate() !== day) end.setDate(0);
    return end;
}

/* 지금 상태.
   state: 'none'    — 승인된 적 없다(승인일이 없다). 무료 기간이 시작되지 않았다
          'active'  — 무료 기간 중
          'expired' — 무료 기간이 끝났다
   daysLeft: active 일 때 남은 날(올림). expired 면 0. none 이면 null */
function fpStatus(approvedAt, now) {
    var until = fpFreeUntil(approvedAt);
    if (!until) return { state: 'none', until: null, daysLeft: null };
    var t = fpToDate(now) || new Date();
    if (t.getTime() >= until.getTime()) return { state: 'expired', until: until, daysLeft: 0 };
    var ms = until.getTime() - t.getTime();
    return { state: 'active', until: until, daysLeft: Math.ceil(ms / 86400000) };
}

/* YYYY-MM-DD (현지 시각 기준 — toISOString 은 UTC 라 한국에서 하루 밀린다) */
function fpDateText(d) {
    if (!d) return '';
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
}

/* 화면에 쓸 두 언어 문구. {en, ko, state} 를 돌려준다 —
   심는 쪽이 data-en/data-ko 로 달 수 있게(A-492 두 언어 안내 규약). */
function fpLabel(st) {
    if (!st || st.state === 'none') {
        return { state: 'none',
                 en: 'Free period starts on approval',
                 ko: '승인 시 무료 기간 시작' };
    }
    var ds = fpDateText(st.until);
    if (st.state === 'expired') {
        return { state: 'expired',
                 en: 'Free period ended ' + ds,
                 ko: '무료 기간 종료 ' + ds };
    }
    return { state: 'active',
             en: 'Free until ' + ds + ' (' + st.daysLeft + ' days left)',
             ko: ds + '까지 무료 (' + st.daysLeft + '일 남음)' };
}

/* 브랜드 상태까지 보고 문구를 고른다.
   ★ A-728(브론즈 59차 ③): `fpLabel` 만 쓰면 **승인됐는데 `approvedAt` 이 없는 문서**에
     「승인 시 무료 기간 시작」이 뜬다 — 상태 딱지는 「승인됨」인데 바로 밑줄이
     「승인 시 시작」이라 **스스로 모순되는 두 줄**이 붙는다. 그런 문서가 실제로 있다:
     `tools/make-qa-user.js` 가 만드는 QA 브랜드가 `status:'approved'` 인데 승인일이 없다.
     옛 문서도 마찬가지다(A-726 전에는 그 필드를 안 찍은 길이 있었다).
   ★ 메우는 길: 어드민에서 그 브랜드를 **한 번 더 승인**하면 승인일이 찍힌다
     (`admin/dashboard.html` 의 `prevRead && !prevApprovedAt`). 그때까지는
     **모른다고 말한다** — 날짜를 지어내지 않는다. */
function fpLabelFor(status, approvedAt, now) {
    var st = fpStatus(approvedAt, now);
    if (st.state === 'none' && String(status || '').toLowerCase() === 'approved') {
        return { state: 'unknown',
                 en: 'Free period start date missing — please contact us',
                 ko: '무료 기간 시작일이 기록되지 않았습니다 — 문의해 주세요' };
    }
    return fpLabel(st);
}

/* 시험에서도 쓰도록 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FP_MONTHS: FP_MONTHS, fpToDate: fpToDate, fpFreeUntil: fpFreeUntil,
                       fpStatus: fpStatus, fpDateText: fpDateText, fpLabel: fpLabel,
                       fpLabelFor: fpLabelFor };
}
