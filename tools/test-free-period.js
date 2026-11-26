/* tools/test-free-period.js — A-726
   무료 기간(승인일 + 3개월)의 순수 함수를 센다.

   ★ 왜 시험이 지켜야 하나: 이 숫자는 **돈**이다. 하루 틀리면 브랜드와의
     약속이 하루 틀린다. 그런데 어드민 상세와 브랜드 포털은 둘 다 로그인이
     있어야 열려 노드가 눈으로 못 본다(A-657·A-689 와 같은 사각지대).
     그래서 판단을 전부 free-period.js 의 순수 함수에 두고 여기서 센다.

   ★ 사본이 갈라지지 않는지도 센다 — 어드민과 포털이 **둘 다** free-period.js 를
     싣고, 자기 손으로 날짜 계산을 하지 않는지 글자로 확인한다. 이 저장소가
     반복해 온 병이 그것이다(A-348·A-367·A-393·A-409·A-688·A-672).
*/
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const fp = require(path.join(ROOT, 'free-period.js'));

let pass = 0, fail = 0;
function ok(cond, name, got) {
    if (cond) { pass++; }
    else { fail++; console.log('  ◀ 실패: ' + name + (got !== undefined ? '  — 받은 값: ' + got : '')); }
}
function eq(a, b, name) { ok(String(a) === String(b), name, a); }

const D = (y, m, d, h) => new Date(y, m - 1, d, h || 0);
const txt = v => fp.fpDateText(v);

/* ── 1. 기본 계산 ── */
eq(txt(fp.fpFreeUntil(D(2026, 11, 26))), '2027-02-26', '11/26 승인 → 2/26');
eq(txt(fp.fpFreeUntil(D(2026, 1, 15))),  '2026-04-15', '1/15 승인 → 4/15');
eq(txt(fp.fpFreeUntil(D(2026, 10, 31))), '2027-01-31', '10/31 → 1/31 (31일이 있는 달)');

/* ── 2. 월말 — 다음 달에 그 날짜가 없을 때 끌어내린다 ── */
eq(txt(fp.fpFreeUntil(D(2026, 11, 30))), '2027-02-28', '11/30 → 2/28 (2월엔 30일이 없다)');
eq(txt(fp.fpFreeUntil(D(2026, 11, 29))), '2027-02-28', '11/29 → 2/28');
eq(txt(fp.fpFreeUntil(D(2027, 11, 30))), '2028-02-29', '윤년: 2027/11/30 → 2028/2/29');
eq(txt(fp.fpFreeUntil(D(2026, 12, 31))), '2027-03-31', '12/31 → 3/31 (넘김 없음)');
/* ★ 이 덫이 중요하다: setMonth 만 쓰면 11/30 이 3/2 로 넘어가 브랜드가 이틀을 더 받는다 */
ok(txt(fp.fpFreeUntil(D(2026, 11, 30))) !== '2027-03-02', '11/30 이 3월로 넘어가지 않는다');

/* ── 3. 승인일이 없거나 못 읽을 때 — 거짓말하지 않는다 ── */
eq(fp.fpStatus(null).state,       'none', '승인일 null');
eq(fp.fpStatus(undefined).state,  'none', '승인일 undefined');
eq(fp.fpStatus('').state,         'none', '승인일 빈 문자열');
eq(fp.fpStatus('아무말').state,    'none', '못 읽는 문자열');
eq(fp.fpStatus({}).state,         'none', '빈 객체');
ok(fp.fpFreeUntil(null) === null, '승인일 없으면 종료일도 null');
/* ★ 「0일 남음」으로 떨어지면 안 된다 — 승인 안 된 브랜드가 만료로 보인다 */
ok(fp.fpStatus(null).daysLeft === null, '승인일 없으면 daysLeft 는 null (0 아님)');

/* ── 4. 여러 꼴의 날짜를 받는다 ── */
eq(txt(fp.fpFreeUntil({ toDate: () => D(2026, 11, 26) })), '2027-02-26', 'Firestore Timestamp 꼴');
eq(txt(fp.fpFreeUntil({ seconds: Math.floor(D(2026, 11, 26).getTime() / 1000) })), '2027-02-26', '{seconds} 꼴');
eq(txt(fp.fpFreeUntil(D(2026, 11, 26).getTime())), '2027-02-26', '밀리초 숫자');

/* ── 5. 상태 경계 ── */
const a = D(2026, 11, 26);
eq(fp.fpStatus(a, D(2026, 11, 26, 1)).state, 'active',  '승인 당일은 무료 중');
eq(fp.fpStatus(a, D(2027,  2, 25)).state,    'active',  '하루 전은 무료 중');
eq(fp.fpStatus(a, D(2027,  2, 26)).state,    'expired', '종료일 당일은 만료');
eq(fp.fpStatus(a, D(2027,  3,  1)).state,    'expired', '지난 뒤는 만료');
eq(fp.fpStatus(a, D(2027,  2, 26)).daysLeft, 0,         '만료면 daysLeft 0');
eq(fp.fpStatus(a, D(2027,  2, 24)).daysLeft, 2,         '이틀 전이면 2');

/* ── 6. 문구 — 두 언어가 **둘 다** 있고 비어 있지 않다 (A-492) ── */
[fp.fpLabel(fp.fpStatus(null)),
 fp.fpLabel(fp.fpStatus(a, D(2026, 12, 1))),
 fp.fpLabel(fp.fpStatus(a, D(2027, 5, 1)))].forEach((L, i) => {
    ok(!!L.en && L.en.trim().length > 0, '문구 ' + i + ' 영문 있음');
    ok(!!L.ko && L.ko.trim().length > 0, '문구 ' + i + ' 국문 있음');
    ok(L.en !== L.ko, '문구 ' + i + ' 두 언어가 다르다');
    ok(!/undefined|NaN|null/.test(L.en + L.ko), '문구 ' + i + ' 에 undefined/NaN 이 없다');
});
ok(/2027-02-26/.test(fp.fpLabel(fp.fpStatus(a, D(2026, 12, 1))).ko), '무료 중 문구에 종료일이 들어간다');
ok(/2027-02-26/.test(fp.fpLabel(fp.fpStatus(a, D(2027, 5, 1))).ko),  '만료 문구에도 종료일이 들어간다');

/* ── 7. 날짜 글자는 현지 기준 (toISOString 은 UTC 라 한국에서 하루 밀린다) ── */
eq(txt(D(2026, 11, 26, 23)), '2026-11-26', '밤 11시도 그날로 적힌다');
eq(txt(D(2026, 1, 5)), '2026-01-05', '한 자리 달·일에 0을 채운다');

/* ── 8. 사본이 갈라지지 않는지 — 쓰는 쪽을 글자로 센다 ── */
const USERS = ['admin/dashboard.html', 'brand-portal/dashboard.html'];

/* ★ 주석을 먼저 걷어낸다. 2026-11-26 에 이 시험을 만들면서 안 걷었더니,
   「계산은 ../free-period.js 한 곳에서만 한다」는 **주석 한 줄** 때문에
   script 태그를 통째로 빼도 시험이 통과했다 — 깨뜨리기가 울지 않아서야
   알았다. A-668·A-672·A-678 이 같은 덫을 적어 뒀는데 또 밟았다. */
function stripComments(src) {
    /* ★ A-728: 두 번 틀렸다.
       ① 처음엔 HTML 에도 `/* … *\/` 를 걷었다 — **속성 안의 `image/*` 가 블록 주석
          시작으로 읽혀** brand-portal 의 680~926행 16,865자가 통째로 지워졌고,
          923행의 script 태그가 사라져 시험이 거짓으로 실패했다.
          (같은 덫이 tools/check-stale-dates.py 에도 있었다 — 그쪽은 **거짓 통과**였다.)
       ② 그래서 `<script>…</script>` 를 통째로 지웠더니 이번엔 **`<script src=…>` 태그
          자체**가 사라졌다. 찾으려던 바로 그것을 지운 꼴이다.
       답: HTML 주석을 걷고, JS 주석은 **script 블록 안에서만** 걷는다. 태그는 남는다. */
    return src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/g,
            (m, open, body, close) => open +
                body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ') +
                close);
}


USERS.forEach(rel => {
    const raw  = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const code = stripComments(raw);
    /* 싣는지는 **script 태그**로 본다 — 이름이 어디 적혀 있는지가 아니라 */
    const tagRe = /<script[^>]+src=["'][^"']*free-period\.js[^"']*["']/;
    ok(tagRe.test(code), rel + ' 가 free-period.js 를 script 태그로 싣는다');
    /* ★ A-728(브론즈 59차 ①-C): 전에는 **있는지**만 봤다. 포털은 그 태그가 쓰는 자리보다
       **뒤**에 있는데, 지금은 `auth.onAuthStateChanged` 콜백(비동기)에서만 불려서 우연히
       맞는다. 누가 그 호출을 동기로 바꾸면 **시험은 통과한 채로 포털이 깨진다.**
       태그가 뒤라면, 쓰는 자리가 전부 비동기 콜백 안인지까지 본다. */
    if (tagRe.test(code)) {
        /* ★ A-728(브론즈 59차 ①-C): 전에는 태그가 **있는지**만 봤다. 포털은 그 태그가
           쓰는 자리보다 **뒤**(2512행)에 있는데 1181행에서 썼다 — 지금은 호출이
           비동기 콜백 안이라 우연히 맞았다. 누가 동기로 바꾸면 **시험은 통과한 채로
           포털이 깨진다.** 타이밍을 따지지 않고 **순서 자체**를 센다. */
        const tagAt = code.search(tagRe);
        const firstUse = code.search(/fpLabelFor\s*\(/);
        ok(firstUse === -1 || tagAt < firstUse,
           rel + ' 의 script 태그가 쓰는 자리보다 앞이다');
    }

    /* 상태까지 보는 함수를 거치는가 — `fpLabel` 만 쓰면 승인됐는데 승인일 없는
       문서에 「승인 시 시작」이 떠서 상태 딱지와 모순된다 (A-728 ③) */
    ok(/fpLabelFor\s*\(/.test(code), rel + ' 가 fpLabelFor 를 쓴다');
    ok(!/[^A-Za-z.]fpLabel\s*\(/.test(code), rel + ' 가 fpLabel 을 직접 부르지 않는다');

    /* ★ 자기 손으로 날짜를 더하지 않는다 — 그 순간 두 답이 생긴다.
       지금 두 쪽 다 setMonth 를 한 번도 안 쓴다. 날짜 산술이 필요하면
       free-period.js 에 함수를 더하는 것이 맞고 여기서 하면 안 된다. */
    ok(!/\bsetMonth\s*\(/.test(code), rel + ' 가 직접 setMonth 로 달을 더하지 않는다');
    ok(!/\bsetFullYear\s*\(/.test(code), rel + ' 가 직접 setFullYear 를 쓰지 않는다');
    ok(!/90\s*\*\s*24\s*\*\s*60/.test(code), rel + ' 가 직접 90일을 세지 않는다');
    ok(!/FP_MONTHS\s*=/.test(code), rel + ' 가 FP_MONTHS 를 다시 정하지 않는다');
});

/* ── 9. 폐기된 전역 날짜가 되살아나지 않는다 ── */
const vs = fs.readFileSync(path.join(ROOT, 'admin/js/view-settings.js'), 'utf8');
const vsCode = vs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/freeUntil\s*:/.test(vsCode), 'view-settings 에 freeUntil 기본값이 없다');
ok(!/listing\.freeUntil'/.test(vsCode), 'view-settings 에 freeUntil 입력 칸이 없다');
/* 문구 칸 둘은 남아 있어야 한다 — 없어지면 어드민이 가격 문구를 못 고친다 */
ok(/freeUntilText_en/.test(vsCode) && /freeUntilText_ko/.test(vsCode), '무료 기간 **문구** 칸은 남아 있다');

/* ── 10. 개월 수가 한 곳에만 있다 ── */
eq(fp.FP_MONTHS, 3, 'FP_MONTHS 는 3');
const fpSrc = fs.readFileSync(path.join(ROOT, 'free-period.js'), 'utf8');
const fpCode = fpSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
eq((fpCode.match(/FP_MONTHS/g) || []).length >= 2, 'true', '계산이 FP_MONTHS 를 쓴다(숫자를 박지 않는다)');
ok(!/getMonth\(\)\s*\+\s*3\b/.test(fpCode), '3 을 코드에 직접 박지 않았다');

console.log(fail === 0
    ? '통과: ' + pass + '건 전부'
    : '◀ ' + fail + '건 실패 / ' + (pass + fail) + '건');
process.exit(fail === 0 ? 0 : 1);
