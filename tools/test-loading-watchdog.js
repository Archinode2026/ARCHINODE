/* A-475 — 로딩 감시견이 **거짓으로 뜨지 않는지** 지킨다 (2026-11-11)
 *
 * 왜: `firebase-config.js` 는 `const auth = ...` 로 선언한다. 최상위 `const` 는
 *     **전역 렉시컬 환경**에 들어가고 `window` 의 속성이 **되지 않는다**.
 *     그래서 `typeof window.auth` 로 보면 **멀쩡한 화면에서도 'undefined'** 가 나와
 *     감시견이 거짓 실패를 띄운다. 라이브에서 실측으로 확인했다 —
 *       typeof window.auth → "undefined"   (거짓 실패)
 *       typeof auth        → "object"      (맞다)
 *     이 시험은 그 실수가 돌아오면 잡는다.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(path.join(ROOT, 'loading-watchdog.js'), 'utf8');

let fail = 0, n = 0;
function ok(c, what, extra) { n++; if (!c) { fail++; console.log('  X ' + what + (extra ? '  → ' + extra : '')); } }

// 주석은 빼고 코드만 본다 (주석에는 설명을 위해 window.auth 가 적혀 있다)
const code = W.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

ok(!/typeof\s+window\.auth/.test(code),
   'window.auth 로 보지 않는다 (const 는 window 속성이 아니다)',
   /typeof\s+window\.auth/.test(code) ? '아직 window.auth 를 본다' : '');
ok(!/typeof\s+window\.firebase/.test(code), 'window.firebase 로 보지 않는다');
ok(/typeof\s+auth\s*===\s*['"]undefined['"]/.test(code), '맨 이름 auth 로 본다');
ok(/typeof\s+firebase\s*===\s*['"]undefined['"]/.test(code), '맨 이름 firebase 로 본다');
ok((code.match(/try\s*\{/g) || []).length >= 2, 'TDZ 때문에 typeof 도 던질 수 있어 try 로 감싼다');

// 보일 때만 손댄다 — 이미 걷힌 로딩 자리를 되살리지 않는다
ok(/if\s*\(!visible\(e\)\)\s*return/.test(code), '이미 걷힌 로딩 자리는 건드리지 않는다');
ok(/getBoundingClientRect\(\)\.height\s*>\s*0/.test(code), '높이로 보임을 판정한다 (display 만 보지 않는다)');

// 안내는 두 언어
ok(/data-en/.test(W) && /data-ko/.test(W), '안내에 data-en·data-ko 를 단다');
ok(/applyLangAgain/.test(code), '그린 뒤 한 번 칠한다');
ok(/min-height:44px/.test(W.replace(/\s/g,'')) || /min-height:\s*44px/.test(W),
   '「다시 시도」 단추가 44px 이다');

// 12개 화면이 싣고 있나
const FILES = ['auth/profile.html','brand-portal/dashboard.html','products/view.html','brands/view.html',
 'magazine/view.html','admin/dashboard.html','admin/articles.html','admin/bim-requests.html',
 'admin/consultations.html','admin/newsletter-subscribers.html','admin/notify-subscribers.html',
 'admin/trend-submissions.html'];
FILES.forEach(rel => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(/<script src="[^"]*loading-watchdog\.js/.test(s), '싣고 있다: ' + rel);
  // firebase-config.js 뒤에 와야 한다 (auth 가 선언된 뒤에 봐야 하므로)
  const iw = s.search(/<script src="[^"]*loading-watchdog\.js/);
  const ic = s.search(/<script src="[^"]*firebase-config\.js/);
  ok(ic >= 0 && iw > ic, 'firebase-config.js 뒤에 온다: ' + rel);
});

// 로딩 자리를 성공 경로에서만 걷는 두 화면이 실패도 말하는지
const prof = fs.readFileSync(path.join(ROOT, 'auth/profile.html'), 'utf8');
ok(/archinodeLoadingFailed/.test(prof), 'auth/profile.html 이 실패를 알린다');
ok(/onAuthStateChanged\(async \(user\) => \{[\s\S]{0,600}?try \{/.test(prof),
   'auth/profile.html 의 콜백이 try 로 감싸여 있다');
const bp = fs.readFileSync(path.join(ROOT, 'brand-portal/dashboard.html'), 'utf8');
ok(/archinodeLoadingFailed/.test(bp), 'brand-portal/dashboard.html 이 실패를 알린다');

console.log('로딩 감시견 — 시험 ' + n + '개, 실패 ' + fail + '개');
if (fail) process.exit(1);
console.log('통과');
