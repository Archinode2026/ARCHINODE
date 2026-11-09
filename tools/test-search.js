/* ═══════════════════════════════════════════════════════════════════════════
   search.js 회귀 시험 — node 에 최소 DOM 을 세워 **실제 파일**을 돌린다.

   쓰기: node tools/test-search.js          (어긋나면 종료 코드 1)

   왜 있는가
   ─────────
   A-397: 사이트 검색이 227 페이지에서 **통째로 죽어 있었다.** 신청서가
   카테고리를 체크박스로 받아 배열로 저장하는데 `search.js` 가 문자열을
   전제해, 배열에 `.toLowerCase()` 를 부르자 예외가 나고 그 예외가
   `search()` 밖으로 나가 렌더가 영영 안 불렸다. **빈 화면이지 오류 화면이
   아니어서** 아무도 몰랐다.

   A-402: 그것을 고치자 **결과가 한국어 화면에서도 영어로** 뜨는 것이
   드러났다. 언어를 `localStorage` 로만 판정했기 때문이다.

   둘 다 **브라우저 없이 재현할 수 있는 결함**이었다. 그런데 이 파일에는
   시험이 없었고, A-073·A-167·A-285·A-349·A-353 까지 **여섯 번을 눈으로
   찾아 고쳤다.** 일곱 번째는 이 시험이 잡는다.

   시험을 더할 때
   ──────────────
   `search.js` 를 고칠 일이 생기면 **먼저 여기에 실패하는 시험을 하나
   더하고** 그다음 고쳐라. 그러면 그 결함은 다시 못 들어온다.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'search.js'), 'utf8');

/* 한 경우가 비동기로 터져도 **뒤 시험이 계속 돌게** 한다. search.js 의 렌더는
   프라미스 콜백에서 불리므로, 거기서 던지면 기본값으로는 node 가 그 자리에서
   죽고 남은 시험이 아예 안 돈다 — 그러면 「어긋난 것 하나」만 보이고 나머지는
   모른 채 지나간다. 받아서 그 경우의 errs 에 넣는다. */
const asyncErrs = [];
process.on('uncaughtException', e => asyncErrs.push('비동기: ' + (e && e.message)));
process.on('unhandledRejection', e => asyncErrs.push('거부: ' + (e && e.message)));

let pass = 0;
const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  통과  ' + label); }
  else { fails.push(label + (detail ? ' — ' + detail : '')); console.log('  어긋남 ' + label + (detail ? ' — ' + detail : '')); }
}

/* ── 최소 DOM ───────────────────────────────────────────────────────────── */
function makeEnv(opts) {
  const htmlLang = opts.htmlLang;
  const stored = opts.stored;
  const staticIndex = opts.staticIndex;
  const brands = opts.brands;

  const thrown = [];

  function El(tag, cls) {
    return {
      tagName: tag.toUpperCase(), className: cls || '', value: '',
      innerHTML: '', textContent: '', _ls: {},
      classList: {
        _s: new Set(),
        add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); },
        contains(x) { return this._s.has(x); },
        toggle(x) { this._s.has(x) ? this._s.delete(x) : this._s.add(x); }
      },
      addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
      removeEventListener() {}, focus() { doc.activeElement = this; }, blur() {},
      setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
      querySelector(sel) { return doc._find(sel); },
      querySelectorAll(sel) { const r = doc._findAll(sel); r.forEach = Array.prototype.forEach; return r; },
      get offsetParent() { return doc.body; },
      fire(t, ev) {
        const self = this;
        (this._ls[t] || []).forEach(function (f) {
          f.call(self, Object.assign({ preventDefault() {}, stopPropagation() {}, target: self }, ev || {}));
        });
      }
    };
  }

  const overlay = El('div', 'search-overlay'); overlay.id = 'searchOverlay';
  const input = El('input', '');
  const results = El('div', 'search-results');
  const reg = {
    '#searchOverlay': overlay, '.search-box input': input, '.search-box': El('div', 'search-box'),
    '.search-results': results, '.search-close': El('button', 'search-close'),
    '.search-toggle': El('button', 'search-toggle'), '.search-result-item': null
  };

  const doc = {
    readyState: 'complete', body: El('body'), activeElement: null, _ls: {},
    documentElement: { lang: htmlLang },
    getElementById(id) { return id === 'searchOverlay' ? overlay : null; },
    _find(sel) { return reg[sel] !== undefined ? reg[sel] : null; },
    _findAll(sel) { const v = reg[sel]; return v ? [v] : []; },
    querySelector(sel) { return this._find(sel); },
    querySelectorAll(sel) { const r = this._findAll(sel); r.forEach = Array.prototype.forEach; return r; },
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    createElement(t) { return El(t); }
  };

  const sandbox = {
    window: { location: { pathname: '/index.html' }, addEventListener() {}, innerWidth: 1200 },
    document: doc,
    console: { log() {}, warn() {}, error() {} },
    localStorage: opts.noStorage ? null : {
      _m: stored ? Object.assign({}, stored) : {},
      getItem(k) { return k in this._m ? this._m[k] : null; },
      setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }
    },
    XMLHttpRequest: function () {
      return {
        open() {}, timeout: 0,
        send() {
          this.status = 200;
          this.responseText = JSON.stringify(staticIndex);
          this.onload();
        }
      };
    },
    firebase: {},
    db: {
      collection() {
        return { where() { return { get() {
          return Promise.resolve({ forEach(cb) { brands.forEach(b => cb({ data: () => b })); } });
        } }; } };
      }
    }
  };
  if (opts.noStorage) {
    // 사생활 모드: localStorage 접근 자체가 던진다
    Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('denied'); } });
  }

  return { sandbox, input, results, doc, thrown };
}

async function run(opts, query) {
  const env = makeEnv(opts);
  const vm = require('vm');
  const ctx = vm.createContext(env.sandbox);
  const errs = [];
  try {
    vm.runInContext(SRC, ctx);
  } catch (e) {
    errs.push('적재: ' + e.message);
  }
  env.input.value = query;
  asyncErrs.length = 0;
  try { env.input.fire('input'); } catch (e) { errs.push('입력: ' + e.message); }
  await new Promise(r => setTimeout(r, 400));
  while (asyncErrs.length) errs.push(asyncErrs.shift());
  const html = env.results.innerHTML;
  return {
    count: (html.match(/search-result-item/g) || []).length,
    html, errs,
    korean: (html.match(/[가-힣]/g) || []).length,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  };
}

const STATIC = [
  { type: 'category', name_en: 'Bathroom', name_ko: '욕실', desc_en: 'Baths and taps',
    desc_ko: '욕조와 수전', parent_en: '', parent_ko: '', url: 'categories/bathroom.html' },
  { type: 'subcategory', name_en: 'Showers', name_ko: '샤워', desc_en: '', desc_ko: '',
    parent_en: 'Bathroom', parent_ko: '욕실', url: 'categories/bathroom/showers.html' }
];

const BRANDS_REAL = [
  { brandName: 'oska', slug: 'oska', country: 'seoul', category: 'Outdoor' },
  { brandName: '테스트', slug: '테스트-gux2q5', country: 'Albania', category: ['Bathroom'] },
  { brandName: '멀티', slug: 'multi', country: 'Italy', category: ['Bathroom', 'Furniture', 'Decor'] }
];

(async () => {
  console.log('search.js 회귀 시험\n');

  console.log('[1] A-397 — 배열 category 가 검색을 죽이지 않는다');
  let r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BRANDS_REAL }, 'oska');
  ok('배열이 섞여 있어도 브랜드가 찾힌다', r.count >= 1, '결과 ' + r.count + '건, 예외 ' + JSON.stringify(r.errs));
  ok('예외가 새어 나오지 않는다', r.errs.length === 0, JSON.stringify(r.errs));

  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BRANDS_REAL }, 'decor');
  ok('카테고리 배열의 뒤쪽 값으로도 찾힌다 (멀티 → decor)', r.count >= 1, '결과 ' + r.count + '건');

  console.log('\n[2] A-397 — 항목 하나가 나빠도 검색 전체가 멈추지 않는다');
  const BAD = [
    { brandName: 'oska', slug: 'oska', country: 'seoul', category: 'Outdoor' },
    { brandName: '망가진', slug: 'broken', country: { nested: 1 }, category: { also: 'object' } },
    { brandName: null, slug: null, country: null, category: null }
  ];
  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BAD }, 'oska');
  ok('객체·null 이 섞여도 멀쩡한 브랜드가 찾힌다', r.count >= 1, '결과 ' + r.count + '건, 예외 ' + JSON.stringify(r.errs));

  console.log('\n[3] A-402 — 결과가 화면 언어를 따른다');
  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BRANDS_REAL }, '욕실');
  ok('html lang=ko · 저장된 선택 없음 → 한국어로 렌더', r.korean > 0,
     '한글 ' + r.korean + '자: ' + r.text.slice(0, 60));

  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: BRANDS_REAL }, 'bathroom');
  ok('html lang=en → 영어로 렌더', /Bathroom/.test(r.text) && !/욕실/.test(r.text),
     r.text.slice(0, 60));

  r = await run({ htmlLang: '', stored: { 'archinode-lang': 'ko' }, staticIndex: STATIC, brands: BRANDS_REAL }, '욕실');
  ok('html lang 이 비어도 저장된 선택(ko)을 따른다', r.korean > 0, '한글 ' + r.korean + '자');

  r = await run({ htmlLang: 'ko', noStorage: true, staticIndex: STATIC, brands: BRANDS_REAL }, '욕실');
  ok('localStorage 접근이 던져도 렌더가 살아 있다', r.count >= 1 && r.errs.length === 0,
     '결과 ' + r.count + '건, 예외 ' + JSON.stringify(r.errs));

  console.log('\n[4] A-401 — 실제 색인의 한국어 설명이 쓰인다');
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'));
  r = await run({ htmlLang: 'ko', staticIndex: real, brands: BRANDS_REAL }, '사우나');
  ok('「사우나」 결과에 한국어 설명이 들어 있다', /웰니스|사우나/.test(r.text) && r.korean > 10,
     '한글 ' + r.korean + '자: ' + r.text.slice(0, 70));

  const noKo = real.filter(x => x.desc_ko && !/[가-힣]/.test(x.desc_ko)).length;
  ok('색인의 desc_ko 중 한글이 없는 것이 3개 이하', noKo <= 3, '지금 ' + noKo + '개');

  console.log('\n[5] 빈 쿼리·없는 말');
  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BRANDS_REAL }, 'zzzzqqqq');
  ok('없는 말을 치면 빈 상태 안내가 뜬다 (빈 화면이 아니다)', r.html.length > 0 && r.count === 0,
     'HTML ' + r.html.length + '자, 결과 ' + r.count + '건');

  console.log('\n────────────────────────────────────────');
  if (fails.length) {
    console.log('어긋난 시험 %d개 / 통과 %d개\n', fails.length, pass);
    fails.forEach(f => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('검색 회귀 시험 — 통과 %d개, 어긋난 것 없음', pass);
})();
