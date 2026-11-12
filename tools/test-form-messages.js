/* A-517 — 폼 경고가 **손님의 언어**로 나오는지.
 *
 * 왜 있는가
 * ---------
 * 빈 칸이나 잘못된 이메일을 두고 제출하면 나오는 말은 **브라우저 기본 문구**다.
 * 그 언어를 정하는 것은 우리 사이트가 아니라 **손님 브라우저의 설정**이라,
 * 영어로 보는 손님에게도 한국어 경고가 떴다(브론즈 36차 N36-2 실측).
 * 저장소 전체에 `setCustomValidity` 가 **0건**이었다 — 한 번도 우리가 말한 적이 없다.
 *
 *   node tools/test-form-messages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'form-throttle.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  x ' + name + (extra ? '  → ' + extra : '')); }
}

/* 고르는 함수만 떼어 낸다 — 브라우저 없이 돌린다 */
function grab(sig, endMark) {
  const i = SRC.indexOf(sig);
  if (i < 0) throw new Error('못 찾음: ' + sig + ' — 이름이 바뀌었나?');
  const j = SRC.indexOf(endMark, i) + endMark.length;
  return SRC.slice(i, j);
}
const code = [grab('var V_MSG = {', '\n  };'), grab('function archiPickMessage', '\n  }')].join('\n');
eval(code + '\n;globalThis.__fm = { archiPickMessage, V_MSG };');
const { archiPickMessage, V_MSG } = globalThis.__fm;

function V(flag) {
  const v = { valid: false, valueMissing: false, typeMismatch: false, patternMismatch: false,
              tooShort: false, tooLong: false, rangeUnderflow: false, rangeOverflow: false,
              stepMismatch: false, badInput: false };
  if (flag) v[flag] = true; else v.valid = true;
  return v;
}

// ── 1) 두 언어가 다 있고, 서로 다른 글자다 ─────────────────────────────
const keys = Object.keys(V_MSG.ko);
ok('한국어·영어 열쇠가 같다', keys.sort().join() === Object.keys(V_MSG.en).sort().join());
ok('한국어 문구에 한글이 있다', keys.every(k => /[가-힣]/.test(V_MSG.ko[k])));
ok('영어 문구에 한글이 없다', keys.every(k => !/[가-힣]/.test(V_MSG.en[k])), 
   keys.filter(k => /[가-힣]/.test(V_MSG.en[k])).join());
ok('두 언어 문구가 서로 다르다', keys.every(k => V_MSG.ko[k] !== V_MSG.en[k]));

// ── 2) 상태마다 맞는 말을 고른다 ───────────────────────────────────────
ok('성한 칸에는 아무 말도 안 한다', archiPickMessage(V(null), 'text', 'ko') === '');
ok('빈 필수 칸 — 한국어', archiPickMessage(V('valueMissing'), 'text', 'ko') === V_MSG.ko.valueMissing);
ok('빈 필수 칸 — 영어', archiPickMessage(V('valueMissing'), 'text', 'en') === V_MSG.en.valueMissing);
ok('체크박스는 「동의가 필요합니다」로 갈린다',
   archiPickMessage(V('valueMissing'), 'checkbox', 'ko') === V_MSG.ko.checkboxMissing);
ok('라디오도 같은 갈래', archiPickMessage(V('valueMissing'), 'radio', 'en') === V_MSG.en.checkboxMissing);
ok('이메일 형식 — @ 를 짚어 준다', /@/.test(archiPickMessage(V('typeMismatch'), 'email', 'ko')));
ok('주소 칸은 http 를 짚어 준다', /http/.test(archiPickMessage(V('typeMismatch'), 'url', 'ko')));
ok('너무 짧음', archiPickMessage(V('tooShort'), 'text', 'ko') === V_MSG.ko.tooShort);
ok('너무 긺', archiPickMessage(V('tooLong'), 'text', 'en') === V_MSG.en.tooLong);
ok('형식 어긋남', archiPickMessage(V('patternMismatch'), 'text', 'ko') === V_MSG.ko.patternMismatch);
ok('모르는 언어는 영어로 떨어진다', archiPickMessage(V('valueMissing'), 'text', 'it') === V_MSG.en.valueMissing);
ok('상태가 없으면 아무 말도 안 한다', archiPickMessage(null, 'text', 'ko') === '');

// ── 3) 코드 쪽 약속 ────────────────────────────────────────────────────
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
const CODE = strip(SRC);
ok('invalid 를 잡아 우리 말을 넣는다', /addEventListener\('invalid'/.test(CODE));
ok('넣기 전에 먼저 비운다(고친 칸이 계속 틀린 채로 남지 않게)',
   /setCustomValidity\(''\);\s*\n\s*if \(el\.validity\.valid\) return;/.test(CODE));
ok('입력하면 지운다', /addEventListener\('input', clear/.test(CODE));
ok('고르면 지운다', /addEventListener\('change', clear/.test(CODE));
ok('언어가 바뀌면 남은 말을 지운다', /archinode:lang/.test(CODE));
ok('언어는 화면(documentElement.lang)을 먼저 본다',
   /documentElement && document\.documentElement\.lang/.test(CODE));
ok('5초 안내도 같은 언어 판정을 쓴다', /var lang = archiFormLang\(\);/.test(CODE));
ok('5초 안내가 맨 en 으로 떨어지지 않는다', !/var lang = 'en';/.test(CODE));

// ── 4) 폼이 있는 쪽이 이 파일을 싣는가 ─────────────────────────────────
(function () {
  const SKIP = ['node_modules', '.git', '__pycache__', 'archi-diary', 'docs', 'sales',
                'silvia', 'scripts', 'tools', 'downloads', 'assets'];
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(path.join(dir, e.name)); }
      else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  })(ROOT);
  let withForm = 0; const missing = [];
  for (const f of out) {
    const t = fs.readFileSync(f, 'utf8');
    if (!/<form\b/.test(t)) continue;
    withForm++;
    if (!/form-throttle\.js/.test(t)) missing.push(path.relative(ROOT, f).split(path.sep).join('/'));
  }
  /* 폼은 전체 쪽에 있지 않다 — 2026-11-13 기준 15쪽이다. 12 밑으로 떨어지면
     검사가 멈춘 것으로 본다(허수 방지). */
  ok('폼을 가진 쪽이 12쪽 넘는다(허수 방지)', withForm > 12, withForm + '쪽');
  ok('폼을 가진 쪽이 전부 form-throttle.js 를 싣는다', missing.length === 0,
     missing.slice(0, 5).join(', '));
})();

console.log('\n폼 경고 말 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
