/* 사유 입력 창을 **언제 닫아도 되는가** — A-689
 *
 * 승리님 보고(2026-11-25): 「삭제할 때 쓰는 창이 다른 화면 누르면 그냥 꺼진다.
 * 메시지를 다 입력하고 컨펌을 누르기 전까지는 안 꺼지게 해 달라」
 *
 * ★ 이 시험이 **유일한 보증**이다. 어드민 화면은 로그인이 있어야 열려
 *   노드가 눈으로 못 본다. 그래서 판단을 순수 함수로 떼어 두고 여기서 센다.
 *   동시에 `admin/dashboard.html` 이 그 규칙을 **실제로 쓰고 있는지**도
 *   글자로 확인한다 — 규칙만 맞고 안 쓰면 아무 값이 없다(A-688 에서 같은
 *   꼴을 검사기에 넣었다).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { reasonDismiss } = require(path.join(ROOT, 'admin', 'js', 'modal-dismiss.js'));

let bad = [];
function eq(label, got, want) {
    if (got !== want) bad.push(label + '  → 받은 것 「' + got + '」, 바란 것 「' + want + '」');
}

// ── 승리님이 말씀하신 바로 그 자리 ────────────────────────────────────────
eq('① 바깥을 눌러도 — 적은 글이 있으면 안 닫는다', reasonDismiss('backdrop', true), 'ignore');
eq('② 바깥을 눌러도 — 적은 글이 없어도 안 닫는다', reasonDismiss('backdrop', false), 'ignore');

// ── 적던 글을 저 때문에 잃지 않는다 ───────────────────────────────────────
eq('③ 탭이 바뀌어도 안 닫는다(글 있음)', reasonDismiss('hash', true), 'ignore');
eq('④ 탭이 바뀌어도 안 닫는다(글 없음)', reasonDismiss('hash', false), 'ignore');

// ── 나갈 길은 남겨 둔다 — 하나도 없으면 그게 갇힘이다 ─────────────────────
eq('⑤ 취소는 늘 듣는다(글 있음)', reasonDismiss('cancel', true), 'cancel');
eq('⑥ X 단추는 취소로 친다 — 분명한 의사표시다', reasonDismiss('x', true), 'cancel');
eq('⑦ 확인은 확인이다', reasonDismiss('confirm', true), 'confirm');

// ── Esc 는 적은 것이 없을 때만 ────────────────────────────────────────────
eq('⑧ Esc — 적은 글이 있으면 무시(200자가 한 번에 날아가지 않게)',
   reasonDismiss('escape', true), 'ignore');
eq('⑨ Esc — 적은 글이 없으면 취소(키보드만 쓰는 사람의 길을 막지 않게)',
   reasonDismiss('escape', false), 'cancel');

// ── 모르는 길은 닫지 않는다 ───────────────────────────────────────────────
eq('⑩ 모르는 길은 무시한다', reasonDismiss('something-new', false), 'ignore');
eq('⑪ 빈 값도 무시한다', reasonDismiss('', true), 'ignore');

// ── 규칙을 **실제로 쓰고 있는지** ─────────────────────────────────────────
const DASH = fs.readFileSync(path.join(ROOT, 'admin', 'dashboard.html'), 'utf8');
const strip = DASH.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

function has(label, re) { if (!re.test(strip)) bad.push(label); }
function hasnt(label, re) { if (re.test(strip)) bad.push(label); }

if (!/<script src="js\/modal-dismiss\.js/.test(DASH)) bad.push('⑫ 규칙 파일을 싣지 않는다');
has('⑬ 바깥 클릭이 closeModal("backdrop") 으로 간다', /closeModal\('backdrop'\)/);
has('⑭ X 단추가 closeModal("x") 으로 간다', /closeModal\('x'\)/);
has('⑮ 탭 이동이 closeModal("hash") 로 간다', /closeModal\('hash'\)/);
has('⑯ closeModal 이 reasonDismiss 에 물어본다', /window\.reasonDismiss\(/);
has('⑰ 사유 창이 떠 있는 동안 guard 를 세운다', /reasonModalGuard = safeResolve/);
has('⑱ 닫을 때 guard 를 거둔다', /reasonModalGuard = null/);

/* ★ 되돌아오면 안 되는 것들 — 예전 코드가 그랬다 */
hasnt('⑲ 사유 창 자체의 바깥클릭 닫기가 되살아났다',
      /modal\.addEventListener\('click', onOverlayClick/);
hasnt('⑳ X 단추가 약속을 안 풀고 닫는 옛 길이 되살아났다',
      /getElementById\('closeModal'\)\.addEventListener\('click', closeModal\)/);
hasnt('㉑ hashchange 가 약속을 안 풀고 닫는 옛 길이 되살아났다',
      /addEventListener\('hashchange', closeModal\)/);

has('㉒ 초점을 창 안에 가둔다', /e\.key !== 'Tab'/);
has('㉓ 창에 role=dialog 를 준다', /setAttribute\('role', 'dialog'\)/);

/* ── A-690: 통계 숫자를 눌러 그 목록으로 가는가 ──────────────────────────
   승리님: 「숫자 누르면 해당 카테고리로 바로 가게. 메뉴로 클릭하니 불편하다」
   div 에 onclick 만 달면 Tab 으로 닿지도, Enter 로 눌리지도, 보조기기가
   「단추」라고 읽지도 않는다. 진짜 <button> 인지를 센다. */
const cards = (DASH.match(/<button type="button" class="stat-card" data-go="[a-z]+">/g) || []);
if (cards.length !== 4) bad.push('㉔ 통계 카드 넷이 모두 button 이 아니다 (실제 ' + cards.length + ')');
['brands', 'products', 'articles'].forEach(function (t) {
    if (DASH.indexOf('data-go="' + t + '"') < 0) bad.push('㉕ data-go="' + t + '" 가 없다');
});
if (!/\.stats-row'\)\.addEventListener\('click'/.test(strip)) bad.push('㉖ 카드 누름을 듣지 않는다');
if (!/button\.stat-card:focus-visible/.test(DASH)) bad.push('㉗ 카드에 초점 고리가 없다');
if (!/button\.stat-card \{[^}]*text-align: left/.test(DASH)) bad.push('㉘ 단추 기본 꼴을 안 되돌렸다(글자가 가운데로 간다)');
/* 눌러서 갈 곳이 실제로 있는지 — data-go 가 가리키는 탭이 마크업에 있어야 한다 */
['brands', 'products', 'articles'].forEach(function (t) {
    if (DASH.indexOf('data-tab="' + t + '"') < 0) bad.push('㉙ data-go="' + t + '" 가 가리키는 탭이 없다');
});

/* ── A-691: 「총 브랜드」가 공개 수를 같이 말하는가 ──────────────────────
   총계는 상태와 무관하게 전부 센다. 브랜드 셋이 모두 거절이던 날, 공개
   사이트의 브랜드는 0인데 대시보드는 3 이라고 말했다. 거짓은 아니지만
   한눈에 읽으면 틀린 그림이다 — categories.html 의 「2,910+ 브랜드」와
   같은 계열. 총계는 두고 **손님이 실제로 보는 수**를 옆에 적는다. */
if (!/id="statApprovedBrands"/.test(DASH)) bad.push('㉚ 공개 수를 적을 자리가 없다');
if (!/data-ko="총 브랜드">[\s\S]{0,120}id="statApprovedBrands"/.test(DASH))
    bad.push('㉛ 공개 수가 「총 브랜드」 카드 안에 있지 않다');
if (!/if \(b\.status === 'approved'\) approved\+\+/.test(strip)) bad.push('㉜ 승인 수를 세지 않는다');
if (!/setAttribute\('data-ko', ko\)/.test(strip) || !/setAttribute\('data-en', en\)/.test(strip))
    bad.push('㉝ 두 언어 속성을 안 달았다 — 언어를 바꾸면 안 바뀐다 (A-062)');
if (!/approved !== total/.test(strip)) bad.push('㉞ 총계와 공개 수가 어긋날 때 짚지 않는다');
if (!/\.stat-card \.sub/.test(DASH)) bad.push('㉟ 공개 수 줄의 꼴이 없다');

if (bad.length) {
    console.log('사유 창 닫기 규칙 — ' + bad.length + '건 어긋남');
    bad.forEach(b => console.log('  - ' + b));
    console.log('결과: 실패');
    process.exit(1);
}
console.log('어드민 대시보드 — 35가지 모두 뜻대로');
console.log('  바깥·탭이동은 안 닫고 · 취소와 X 는 닫고 · Esc 는 적은 글이 없을 때만');
console.log('  그리고 dashboard.html 이 그 규칙을 실제로 쓰고 있다');
console.log('  통계 숫자 넷이 진짜 button 이고 각자 갈 탭이 있다 (A-690)');
console.log('  「총 브랜드」가 공개 중인 수를 같이 말한다 (A-691)');
console.log('결과: 통과');
