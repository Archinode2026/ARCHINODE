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
      /* A-511: 전에는 **컬렉션 이름을 안 보고** 늘 brands 를 돌려줬다.
         제품 색인이 생긴 뒤로는 그러면 제품 자리에 브랜드가 들어가
         시험이 거짓으로 통과한다. 이름대로 돌려준다. */
      collection(name) {
        const rows = (name === 'products') ? (opts.products || []) : brands;
        return { where() { return { get() {
          return Promise.resolve({ forEach(cb) { rows.forEach(b => cb({ data: () => b })); } });
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

  console.log('\n[5] A-442 — 화면에 보이는 한글 카테고리로 브랜드를 찾을 수 있다');
  // 브랜드 색인의 category 는 영문 값뿐인데 카드는 「욕실 · 마감재」로 보여준다.
  // 대응표는 search-index.json 의 category 항목(name_en/name_ko)에서 뽑는다.
  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: BRANDS_REAL }, '욕실');
  ok('한글 「욕실」로 Bathroom 브랜드가 찾힌다', /테스트/.test(r.text), r.text.slice(0, 90));

  // 생산에서 실제로 브랜드를 떨어뜨린 것은 **설명이 일치하는 기사들**이었다(40+2=42점).
  // 옛 점수에서 브랜드는 20+5=25점이라 12개 자르기에서 늘 밀렸다.
  const CROWD = STATIC.concat(Array.from({ length: 14 }, (_, i) => ({
    type: 'article', name_en: 'Piece ' + i, name_ko: '글 ' + i,
    desc_en: 'A long read about bathroom design', desc_ko: '욕실 디자인 이야기',
    parent_en: '', parent_ko: '', url: 'magazine/piece-' + i + '.html'
  })));
  r = await run({ htmlLang: 'en', staticIndex: CROWD, brands: BRANDS_REAL }, 'bathroom');
  ok('같은 말이 든 기사 14편에 밀려도 브랜드가 12개 안에 남는다', /테스트/.test(r.text),
     '결과 ' + r.count + '건: ' + r.text.slice(0, 90));

  // ※ 처음엔 「대응표에 없는 카테고리 값도 그대로 검색된다」를 시험했는데, catKo 가
  //   모르는 값을 **버리게 고쳐도 그 시험이 통과했다** — 영문 category 로도 매칭되니
  //   구분이 안 된다. 못 깨지는 시험은 거짓 안심이라 지웠다. 대신 한국어 경로가
  //   **조용히 죽는 진짜 조건**을 지킨다: 색인의 category 항목에 name_ko 가 비면
  //   대응표가 통째로 비고, 한글 검색이 아무 예외 없이 못 찾게 된다.
  const catItems = real.filter(x => x.type === 'category');
  const noNameKo = catItems.filter(x => !x.name_ko || !/[가-힣]/.test(x.name_ko));
  ok('색인의 카테고리 10개가 모두 한글 이름을 갖고 있다 (대응표의 공급원)',
     catItems.length === 10 && noNameKo.length === 0,
     '카테고리 ' + catItems.length + '개, 한글 이름 없는 것 ' + noNameKo.length + '개');

  r = await run({ htmlLang: 'ko', staticIndex: real, brands: BRANDS_REAL }, '마감재');
  ok('실제 색인으로도 한글 카테고리 검색이 예외 없이 돈다', r.errs.length === 0,
     JSON.stringify(r.errs));

  // country 가 카테고리 분리로 죽지 않았는지 (같은 묶음에서 떼어냈다)
  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: BRANDS_REAL }, 'albania');
  ok('나라 이름으로도 여전히 찾힌다', /테스트/.test(r.text), r.text.slice(0, 80));

  // 찾는 것만 고치고 보이는 것을 안 고치면 같은 결함이 반쪽 남는다(A-424 · A-438 의 교훈).
  r = await run({ htmlLang: 'ko', staticIndex: real, brands: BRANDS_REAL }, '테스트');
  ok('한국어 화면에서는 결과 부제의 카테고리도 한글이다',
     /욕실/.test(r.text) && !/Bathroom/.test(r.text), r.text.slice(0, 80));

  r = await run({ htmlLang: 'en', staticIndex: real, brands: BRANDS_REAL }, '멀티');
  ok('카테고리 여러 개는 카드와 같은 ` · ` 로 이어 붙인다',
     /Bathroom · Furniture · Decor/.test(r.text), r.text.slice(0, 90));

  console.log('\n[6] A-449 — 서브카테고리는 부모 이름을 달고 나온다');
  // search.js 는 서브카테고리 부제로 부모 이름을 쓰고 점수에도 쓰는데, 색인이 그 필드를
  // 한 번도 넣은 적이 없었다(69/69 비어 있었다). 그래서 이름이 겹치는 쌍이 화면에서
  // 구분되지 않았다 — 「아웃도어 조명」(조명 / 아웃도어) · 「스팀룸」(욕실 / 웰니스).
  const subs = real.filter(x => x.type === 'subcategory');
  const noParent = subs.filter(x => !x.parent_en || !x.parent_ko);
  ok('색인의 서브카테고리가 모두 부모 이름을 갖고 있다',
     subs.length > 0 && noParent.length === 0,
     '서브카테고리 ' + subs.length + '개 중 부모 없는 것 ' + noParent.length + '개');

  // 이름이 겹치는 쌍은 **부모가 서로 달라야** 화면에서 구분된다
  const byName = {};
  subs.forEach(x => { (byName[x.name_ko] = byName[x.name_ko] || []).push(x); });
  const dupes = Object.keys(byName).filter(k => byName[k].length > 1);
  const indistinct = dupes.filter(k => {
      const ps = byName[k].map(x => x.parent_ko);
      return new Set(ps).size !== ps.length;
  });
  ok('이름이 겹치는 서브카테고리는 부모가 서로 다르다',
     dupes.length > 0 && indistinct.length === 0,
     '겹치는 이름 ' + dupes.length + '개(' + dupes.join(', ') + ') · 구분 안 되는 것 ' + indistinct.length + '개');

  r = await run({ htmlLang: 'ko', staticIndex: real, brands: BRANDS_REAL }, '스팀룸');
  ok('「스팀룸」 두 줄이 욕실 / 웰니스 로 갈린다',
     /욕실/.test(r.text) && /웰니스/.test(r.text), r.text.slice(0, 90));

  console.log('\n[10] A-511 — 검색창에 적힌 약속과 실제가 같은가');
  /* 검색창 글은 **230벌로 복사돼** 있다(A-444·A-466·A-468 과 같은 자리).
     그리고 그 글은 「디자이너」를 찾아 준다고 말했는데 그런 항목은 색인에
     아예 없다 — 지킬 수 없는 약속이다. 약속한 것만 적혔는지, 230벌이 한 글자로
     같은지 본다. */
  {
    const glob = (dir, out) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (['node_modules', '.git', '__pycache__'].includes(e.name)) continue;
          glob(path.join(dir, e.name), out);
        } else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
      }
      return out;
    };
    const kos = new Set(), ens = new Set();
    let files = 0;
    for (const f of glob(ROOT, [])) {
      const t = fs.readFileSync(f, 'utf8');
      const mk = t.match(/data-ko-placeholder="([^"]*(?:검색|Search)[^"]*)"/g) || [];
      const me = t.match(/data-en-placeholder="([^"]*(?:검색|Search)[^"]*)"/g) || [];
      mk.forEach(x => kos.add(x));
      me.forEach(x => ens.add(x));
      if (mk.length || me.length) files++;
    }
    ok('검색창 글을 가진 페이지가 200쪽 넘는다(허수 방지)', files > 200, files + '쪽');
    ok('한국어 검색창 글이 한 가지다', kos.size === 1, [...kos].join(' / ').slice(0, 140));
    ok('영어 검색창 글이 한 가지다', ens.size === 1, [...ens].join(' / ').slice(0, 140));
    const all = [...kos, ...ens].join(' ');
    ok('찾아 주지 못하는 것을 약속하지 않는다(디자이너)', !/designer|디자이너/i.test(all), all.slice(0, 140));
    const SJ2 = fs.readFileSync(path.join(ROOT, 'search.js'), 'utf8');
    ok('약속한 제품을 실제로 읽는다', /collection\('products'\)/.test(SJ2));
    ok('약속한 브랜드를 실제로 읽는다', /collection\('brands'\)/.test(SJ2));
  }

  console.log('\n[9] A-511 — 제품도 찾아지는가');
  /* 검색창은 늘 「브랜드, **제품**, 디자이너 검색」이라고 적혀 있었는데
     제품을 보는 코드가 **아예 없었다**. 없어서 0건이 아니라 안 봐서 0건이었다. */
  const PRODUCTS = [
    { name: 'Thermroof Panel', slug: 'thermroof-panel', brandName: 'AGM',
      status: 'approved', category: 'Construction', materials: 'aluminium' },
    { name: 'Oak Dining Table', slug: 'oak-dining-table', brandName: 'Nordic Nest',
      status: 'approved', category: 'Furniture', materials: 'oak' },
    { name: '이름만 있고 slug 가 없는 제품', brandName: 'X', status: 'approved' }
  ];
  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: [], products: PRODUCTS }, 'thermroof');
  ok('제품 이름으로 찾아진다', r.count === 1, r.count + '건 — ' + r.text.slice(0, 70));
  ok('제품 결과에 Product 라벨이 붙는다', /Product/.test(r.text), r.text.slice(0, 90));
  ok('제품 주소는 제품 상세로 간다', /products\/view\.html\?id=thermroof-panel/.test(r.html));
  ok('부제에 브랜드 이름이 보인다', /AGM/.test(r.text), r.text.slice(0, 90));
  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: [], products: PRODUCTS }, 'oak');
  ok('자재(materials)로도 찾아진다', r.count >= 1, r.count + '건');
  r = await run({ htmlLang: 'ko', staticIndex: STATIC, brands: [], products: PRODUCTS }, 'thermroof');
  ok('한국어 화면에서는 「제품」이라고 적는다', /제품/.test(r.text), r.text.slice(0, 90));
  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: [], products: PRODUCTS }, 'slug');
  ok('slug 없는 제품은 색인에 안 넣는다(눌러도 갈 곳이 없다)',
     !/이름만 있고/.test(r.text), r.text.slice(0, 80));
  /* 제품을 읽다 실패해도 나머지 검색은 살아 있어야 한다 */
  r = await run({ htmlLang: 'en', staticIndex: STATIC, brands: BRANDS_REAL, products: [] }, 'bathroom');
  ok('제품이 0건이어도 다른 결과는 나온다', r.count >= 1, r.count + '건');

  console.log('\n[8] A-509 — 12건에서 자른 사실을 말하는가');
  /* 20개를 전부 「bath」에 걸리게 만들어, 화면이 12줄만 보여 주면서
     **더 있다고 말하는지**를 본다. 전에는 말 없이 잘랐다. */
  const MANY = [];
  for (let i = 0; i < 20; i++) {
    MANY.push({ type: 'subcategory', name_en: 'Bath Item ' + i, name_ko: '욕실 물건 ' + i,
                desc_en: 'bath', desc_ko: '욕실', parent_en: 'Bathroom', parent_ko: '욕실',
                url: 'categories/bathroom/item-' + i + '.html' });
  }
  r = await run({ htmlLang: 'ko', staticIndex: MANY, brands: [] }, 'bath');
  ok('12줄만 보여 준다', r.count === 12, '실제 ' + r.count + '줄');
  ok('더 있다는 사실을 적는다', /search-result-more/.test(r.html), r.text.slice(-90));
  ok('전체 건수를 숫자로 말한다', /20/.test(r.text), r.text.slice(-90));
  ok('한국어 화면에서는 한국어로 말한다', /전체 20건 중/.test(r.text), r.text.slice(-90));
  r = await run({ htmlLang: 'en', staticIndex: MANY, brands: [] }, 'bath');
  ok('영어 화면에서는 영어로 말한다', /Showing 12 of 20 results/.test(r.text), r.text.slice(-90));
  /* 자르지 않았을 때 「더 있다」고 말하면 거짓말이다 */
  r = await run({ htmlLang: 'ko', staticIndex: MANY.slice(0, 5), brands: [] }, 'bath');
  ok('안 잘랐으면 그 줄을 안 띄운다', r.count === 5 && !/search-result-more/.test(r.html),
     r.count + '줄, 안내줄 ' + (/search-result-more/.test(r.html) ? '있음' : '없음'));

  console.log('\n[7] 빈 쿼리·없는 말');
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
