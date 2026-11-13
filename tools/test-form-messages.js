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

// ── 5) A-520 — 필수인데 그렇게 안 보이던 칸 ───────────────────────────
/* 자문 신청은 필수 7칸인데 표시는 6개, 입점 신청은 6칸인데 5개였다.
   빠진 둘은 **동의 체크박스**다 — 눌러야 보내지는데 눌러야 하는 줄 모른다. */
{
  const pairs = [
    ['request-consultation.html', 'agreeContact'],
    ['list-your-brand.html', 'agreeVendorTerms'],
  ];
  for (const [f, id] of pairs) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const i = t.indexOf('id="' + id + '"');
    ok(f + ' 에 ' + id + ' 가 있다', i >= 0);
    const near = t.slice(i, i + 400);
    ok(id + ' 에 필수 표시가 붙었다', /class="req-mark"/.test(near), near.slice(0, 80));
    ok(id + ' 의 필수 표시가 두 언어다',
       /data-en="\(required\)"/.test(near) && /data-ko="\(필수\)"/.test(near));
  }
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok('필수 표시 처방이 style.css 에 있다', /\.req-mark\s*\{/.test(css));
}

// ── 6) A-520 — 한국어 화면에 영어로 굳어 있던 고르기 칸 ────────────────
/* 나라 이름 106개는 **일부러 둔다** — 가입 폼의 나라 목록은 영문 표기가
   국제 관례이고, 106개를 옮겨 적는 것은 번역이 아니라 창작에 가깝다.
   우리가 쓴 UI 글자(「선택」·「국가 선택」·유입 경로)만 본다. */
{
  const CHECK = [
    ['list-your-brand.html', 'Select country', '국가 선택'],
    ['list-your-brand.html', 'Search Engine (Google, Naver)', '검색엔진 (구글·네이버)'],
    ['list-your-brand.html', 'Referral / Word of Mouth', '소개·입소문'],
    ['request-consultation.html', '— Select —', '— 선택 —'],
  ];
  for (const [f, en, ko] of CHECK) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(f + ' 「' + en.slice(0, 18) + '」 에 한국어가 붙었다',
       t.includes('data-ko="' + ko + '"'), '없음');
  }
  const lyb = fs.readFileSync(path.join(ROOT, 'list-your-brand.html'), 'utf8');
  ok('카테고리 묶음 이름표가 두 언어다', /data-ko-aria-label="카테고리"/.test(lyb));
  const refl = lyb.slice(lyb.indexOf('<select id="referral">'), lyb.indexOf('</select>', lyb.indexOf('<select id="referral">')));
  const opts = (refl.match(/<option/g) || []).length;
  const koed = (refl.match(/data-ko="/g) || []).length;
  ok('유입 경로 7칸 전부 두 언어다', opts === 7 && koed === 7, opts + '칸 중 ' + koed + '칸');
}

// ── 7) A-520 — 글자 수가 말 없이 잘리지 않는가 ─────────────────────────
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('한도 가까워지면 세어 보여 준다', /function fmPaint/.test(code));
  ok('붙여넣기로 잘리면 그 자리에서 말한다', /addEventListener\('paste'/.test(code));
  ok('잘린 글자 수를 센다', /\(before - sel \+ add\) - max/.test(code));
  ok('읽어 주는 도구에 바뀜을 알린다', /aria-live/.test(code));
  ok('숫자를 그 칸과 묶어 읽게 한다', /aria-describedby/.test(code));
  ok('언어가 바뀌면 숫자도 그 언어로', /\[maxlength\]/.test(code));
  const css2 = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok('글자 수 안내 처방이 있다', /\.fm-count\s*\{/.test(css2));

  /* 말 고르는 함수만 떼어 내 돌린다 */
  const grab2 = (sig, end) => { const i = SRC.indexOf(sig); const j = SRC.indexOf(end, i) + end.length; return SRC.slice(i, j); };
  /* 'use strict' 안의 eval 은 **제 스코프**에 함수를 만든다 — 바깥에서 그냥 못 부른다.
     끝에 한 줄을 붙여 밖으로 꺼낸다(디지털 상품 시험에서 쓴 것과 같은 수). */
  /* fmMsg 는 fmLang 을 부르고, fmLang 은 archiFormLang 을 부른다 — 셋을 함께 꺼내고
     맨 밑의 언어 판정만 시험이 갈아 끼운다. */
  globalThis.archiFormLang = () => 'ko';
  eval(grab2('function fmLang', '}') + '\n' + grab2('function fmMsg', '\n  }')
       + '\n;globalThis.__fm2 = { fmMsg };');
  const { fmMsg } = globalThis.__fm2;
  const el = (len, max) => ({ value: 'x'.repeat(len), getAttribute: () => String(max) });
  ok('한국어로 남은 수를 센다', /\/ 100자$/.test(fmMsg(el(90, 100))), fmMsg(el(90, 100)));
  ok('꽉 차면 꽉 찼다고 말한다', /꽉 찼습니다/.test(fmMsg(el(100, 100))), fmMsg(el(100, 100)));
  globalThis.archiFormLang = () => 'en';
  ok('영어로도 센다', fmMsg(el(90, 100)) === '90 / 100', fmMsg(el(90, 100)));
  ok('영어로 꽉 참을 말한다', /Limit reached/.test(fmMsg(el(100, 100))), fmMsg(el(100, 100)));
}

// ── 8) A-521 — 받는 그 자리에서 알리고 동의를 받는가 ───────────────────
/* 푸터의 처리방침 링크만으로는 「수집 시 고지」가 되지 않는다. 이름·연락처를
   받는 폼 셋에는 **동의 칸**, 이메일만 받는 뉴스레터에는 **안내와 링크**만 —
   승리님 결정(「폼마다 다르게」)이 그대로 서 있는지 본다. */
{
  const WITH_BOX = [
    ['contact.html', 'agreePrivacyContact'],
    ['sourcing-inquiry.html', 'agreePrivacySourcing'],
    ['request-consultation.html', 'agreePrivacyConsult'],
  ];
  for (const [f, id] of WITH_BOX) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const i = t.indexOf('class="form-consent"');
    ok(f + ' 에 수집 고지 칸이 있다', i >= 0);
    const blk = t.slice(i, t.indexOf('</div>', t.indexOf('form-consent-note', i)) + 6);
    ok(f + ' 의 동의는 필수다', new RegExp('id="' + id + '"[^>]*\\brequired\\b').test(blk), blk.slice(0, 120));
    ok(f + ' 에 수집 항목이 있다', /수집 항목:/.test(blk));
    ok(f + ' 에 수집 목적이 있다', /수집 목적:/.test(blk));
    ok(f + ' 에 보유 기간과 근거가 있다', /보유 기간:/.test(blk) && /전자상거래법 시행령 제6조/.test(blk));
    ok(f + ' 에 처리방침 링크가 폼 안에 있다', /href="privacy\.html"/.test(blk));
    ok(f + ' 의 처리방침 링크가 언어를 따른다',
       /data-en-href="privacy-en\.html"/.test(blk) && /data-ko-href="privacy\.html"/.test(blk));
    ok(f + ' 에 동의 거부권을 적는다', /동의하지 않으실 수 있으나/.test(blk));
    ok(f + ' 의 필수 표시가 있다', /class="req-mark"/.test(blk));
    // 두 언어 짝 — data-en 이 있으면 data-ko 도 있고, 영어 칸에 한글이 없어야 한다
    const ens = blk.match(/data-en="([^"]*)"/g) || [];
    const kos = blk.match(/data-ko="([^"]*)"/g) || [];
    ok(f + ' 고지 칸의 두 언어 수가 같다', ens.length === kos.length, ens.length + ' vs ' + kos.length);
    ok(f + ' 고지 칸의 영어에 한글이 없다', !ens.some(x => /[가-힣]/.test(x)),
       (ens.find(x => /[가-힣]/.test(x)) || '').slice(0, 50));
  }

  for (const f of ['index.html', 'magazine.html', 'trend-report.html']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const i = t.indexOf('class="newsletter-form');
    const after = t.slice(i, i + 2600);
    ok(f + ' 뉴스레터에 안내가 있다', /newsletter-consent/.test(after));
    ok(f + ' 뉴스레터에 처리방침 링크가 있다', /href="privacy\.html"/.test(after));
    ok(f + ' 뉴스레터는 체크박스를 쓰지 않는다(결정대로)',
       !/class="form-consent"/.test(after) && !/agreePrivacy/.test(after));
  }
  const css3 = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok('수집 고지 칸 처방이 있다', /\.form-consent\s*\{/.test(css3));
  ok('뉴스레터 안내 처방이 있다', /\.newsletter-consent\s*\{/.test(css3));
}

console.log('\n폼 경고 말 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
