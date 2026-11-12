/* A-477 — 임시 비밀번호가 **공개 정보에서 유도되지 않는지** 지킨다 (2026-11-12)
 *
 * 왜: 전에는 `(브랜드명 앞 8자) + yymmdd + Math.random() 4자` 였다.
 *     앞 두 조각이 전부 공개 정보(brands 문서의 brandName · createdAt)라
 *     남는 미지수가 **36⁴ = 1,679,616** 뿐이었다 — 공개값 둘만 보고
 *     168만 번이면 브랜드 포털 계정이 열린다(브론즈 30차 ②).
 *     이 시험은 그 모양이 돌아오면 잡는다.
 */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'list-your-brand.html');
const html = fs.readFileSync(SRC, 'utf8');

function grab(name) {
  const i = html.indexOf('function ' + name);
  if (i < 0) throw new Error('못 찾음: ' + name);
  let j = html.indexOf('{', i), d = 0, k = j;
  for (; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) { k++; break; } }
  }
  return html.slice(i, k);
}

const src = grab('generatePassword');
let fail = 0, n = 0;
function ok(c, what, extra) { n++; if (!c) { fail++; console.log('  X ' + what + (extra ? '  → ' + extra : '')); } }

// ── 소스 모양 ──
ok(!/Math\.random/.test(src), 'Math.random 을 쓰지 않는다 (암호학적으로 안전하지 않다)');
ok(/getRandomValues/.test(src), 'crypto.getRandomValues 를 쓴다');
ok(!/brandName/.test(src.replace(/function generatePassword\([^)]*\)/, '')),
   '브랜드명을 비밀번호에 섞지 않는다');
ok(!/getFullYear|getMonth|getDate|Date\.now/.test(src), '날짜를 비밀번호에 섞지 않는다');
ok(/throw new Error/.test(src), 'crypto 가 없으면 조용히 약한 값으로 떨어지지 않고 던진다');

// ── 실제로 돌려 본다 ──
const window = { crypto: { getRandomValues: (b) => { require('crypto').randomFillSync(b); return b; } } };
const gen = new Function('window', src + '; return generatePassword;')(window);

const seen = new Set();
let minLen = 1e9, maxLen = 0;
const N = 5000;
for (let i = 0; i < N; i++) {
  const p = gen('oska');
  seen.add(p);
  minLen = Math.min(minLen, p.length); maxLen = Math.max(maxLen, p.length);
}
ok(seen.size === N, N + '번 생성해 전부 다르다', seen.size + '개만 달랐다');
ok(minLen === maxLen && minLen >= 14, '길이가 일정하고 14자 이상', minLen + '~' + maxLen);

const all = [...seen].join('');
ok(new Set(all).size >= 40, '쓰이는 글자가 40종 이상', new Set(all).size + '종');
ok(!/[0O1lI]/.test(all), '혼동되는 글자(0 O 1 l I)를 쓰지 않는다 — 화면에서 베껴 적는다');
ok(![...seen].some(p => /oska/i.test(p)), '브랜드명이 결과에 섞이지 않는다');

// 날짜 문자열(yymmdd)이 결과에 반복적으로 나타나지 않는다
const d = new Date();
const ymd = String(d.getFullYear()).slice(-2)
          + String(d.getMonth() + 1).padStart(2, '0')
          + String(d.getDate()).padStart(2, '0');
const withYmd = [...seen].filter(p => p.includes(ymd)).length;
ok(withYmd <= 1, '오늘 날짜(yymmdd)가 결과에 박히지 않는다', withYmd + '개에 들어 있다');

// crypto 가 없으면 던지는지
let threw = false;
try { new Function('window', src + '; return generatePassword;')({}) ('oska'); }
catch (e) { threw = true; }
ok(threw, 'crypto 가 없으면 예외를 던진다');

// 호출부가 브랜드명을 더 이상 신뢰하지 않는지 (인자는 남아 있어도 안 쓰면 된다)
ok(/const tempPassword = generatePassword\(/.test(html), '호출부가 그대로 있다');

console.log('임시 비밀번호 — 시험 ' + n + '개, 실패 ' + fail + '개');
if (fail) process.exit(1);
console.log('통과');
