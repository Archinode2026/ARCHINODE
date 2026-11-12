/* A-506 — 공개 목록이 24개에서 **아무 말 없이** 끊기지 않는지.
 *
 * 왜 있는가
 * ---------
 * `category-products.js`(카테고리 69페이지)와 `trend-report.html` 은 둘 다
 * `limit(24)` 로 끊고 **그 사실을 화면에 말하지 않았다**. 25번째 제품·글은
 * 승인까지 받아도 어디에도 안 나타난다 — 오류가 아니라 **아무 일도 일어나지
 * 않는** 꼴이라 올린 사람도 보는 사람도 빠진 줄을 모른다(브론즈 철칙 6).
 *
 * 그래서 한 개를 더 불러(PAGE+1) 다음 쪽이 있는지 알아내고, 「더 보기」를 띄운다.
 * 이 시험은 **넘쳐 온 한 개가 화면에 그려지지 않는지**를 실제로 돌려 본다 —
 * 거기서 틀리면 24개 자리에 25개가 나오고 다음 쪽이 한 개씩 밀린다.
 *
 *   node tools/test-list-paging.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  x ' + name + (extra ? '  → ' + extra : '')); }
}

// ── 가짜 DOM — escapeHtml 과 조각 이어 붙이기에 필요한 만큼만 ────────────
function fakeEl(html) {
  return {
    _html: html || '',
    style: {},
    disabled: false,
    _attrs: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    textContent: '',
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(ev, fn) { (this._on || (this._on = {}))[ev] = fn; },
    /* 자식에 붙인 조각은 뿌리에도 쌓인다 — 진짜 DOM 이면 당연한 일이고,
       이게 없으면 「더 보기」로 이어 붙인 카드를 세지 못한다 */
    insertAdjacentHTML(_pos, h) { this._html += h; if (this._root) this._root._html += h; },
    querySelector(sel) {
      /* 조각은 **뿌리의 html** 에 그 이름이 있을 때만 돌려준다 — 없는 것을
         있다고 하지 않는다. 자식도 같은 뿌리를 본다(진짜 DOM 처럼). */
      const root = this._root || this;
      if (!root._kids) root._kids = {};
      if (!root._kids[sel]) { const k = fakeEl(''); k._root = root; root._kids[sel] = k; }
      const bare = sel.replace(/^\./, '');
      return root._html.indexOf(bare) >= 0 ? root._kids[sel] : null;
    }
  };
}

function makeDb(total) {
  /* total 개가 있는 컬렉션 흉내. where/orderBy 는 자기를 돌려주고,
     startAfter 가 시작점을, limit 이 개수를 정한다. */
  const all = [];
  for (let i = 0; i < total; i++) {
    all.push({ id: 'p' + i, data: () => ({ name: 'Product ' + i, slug: 'p' + i, brandName: 'B', materials: 'oak', imageUrl: 'https://x/y.jpg' }) });
  }
  function q(from) {
    return {
      _from: from || 0,
      where() { return this; },
      orderBy() { return this; },
      startAfter(d) { const i = all.indexOf(d); return q(i + 1); },
      limit(n) { this._n = n; return this; },
      get() {
        const docs = all.slice(this._from, this._from + (this._n || all.length));
        return Promise.resolve({ docs, empty: docs.length === 0, forEach: (f) => docs.forEach(f) });
      }
    };
  }
  return { collection: () => q(0), _all: all };
}

async function runCategory(total) {
  const container = fakeEl('');
  container.dataset = { category: 'Furniture', subcategory: 'chairs-stools' };
  global.document = {
    readyState: 'complete',
    documentElement: { lang: 'ko' },
    getElementById: (id) => (id === 'dynamicProducts' ? container : null),
    createElement: () => ({
      textContent: '',
      get innerHTML() {
        return String(this.textContent)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
    }),
    addEventListener() {}
  };
  global.window = { location: { pathname: '/categories/furniture/chairs-stools.html' }, applyLang: null };
  global.db = makeDb(total);
  const src = fs.readFileSync(path.join(ROOT, 'category-products.js'), 'utf8');
  eval(src);
  await new Promise((r) => setTimeout(r, 0));
  return container;
}

(async function () {
  // ── 1) 24개 정확히 — 더 보기가 뜨면 안 된다 ────────────────────────────
  let c = await runCategory(24);
  let cards = (c.innerHTML.match(/class="cp-card"/g) || []).length;
  ok('24개일 때 카드 24장', cards === 24, '실제 ' + cards);
  let wrap = c.querySelector('.cp-more');
  ok('24개일 때 더 보기는 숨어 있다', wrap && wrap.style.display === 'none', wrap && wrap.style.display);

  // ── 2) 25개 — 24장만 그리고 더 보기가 뜬다 ─────────────────────────────
  c = await runCategory(25);
  cards = (c.innerHTML.match(/class="cp-card"/g) || []).length;
  ok('25개여도 첫 쪽은 24장', cards === 24, '실제 ' + cards);
  ok('넘쳐 온 25번째는 안 그린다', c.innerHTML.indexOf('Product 24') < 0);
  wrap = c.querySelector('.cp-more');
  ok('25개일 때 더 보기가 뜬다', wrap && wrap.style.display === 'block', wrap && wrap.style.display);
  ok('몇 개를 보고 있는지 적는다', /24개를 보고 있습니다/.test((wrap.querySelector('.cp-more-note') || {}).textContent || ''));

  // ── 3) 더 보기를 누르면 **이어서** 나온다(겹치지도 빠지지도 않는다) ────
  c = await runCategory(50);
  wrap = c.querySelector('.cp-more');
  const btn = wrap.querySelector('.cp-more-btn');
  await btn._on.click();
  await new Promise((r) => setTimeout(r, 0));
  cards = (c.innerHTML.match(/class="cp-card"/g) || []).length;
  ok('더 보기 뒤 48장', cards === 48, '실제 ' + cards);
  ok('24번째 다음이 25번째다(한 개도 안 건너뛴다)', c.innerHTML.indexOf('Product 24') >= 0);
  ok('겹쳐 그리지 않는다', (c.innerHTML.match(/Product 23</g) || []).length === 1);
  ok('아직 더 있으면 단추가 남는다', wrap.style.display === 'block');

  // ── 4) 마지막 쪽에서는 단추가 사라진다 ─────────────────────────────────
  c = await runCategory(30);
  wrap = c.querySelector('.cp-more');
  await wrap.querySelector('.cp-more-btn')._on.click();
  await new Promise((r) => setTimeout(r, 0));
  cards = (c.innerHTML.match(/class="cp-card"/g) || []).length;
  ok('30개면 다 그린다', cards === 30, '실제 ' + cards);
  ok('다 보여 준 뒤 더 보기가 사라진다', wrap.style.display === 'none', wrap.style.display);

  // ── 5) 글 목록(trend-report.html) 쪽 약속 ──────────────────────────────
  const TR = fs.readFileSync(path.join(ROOT, 'trend-report.html'), 'utf8');
  /* 주석은 빼고 본다 — 「전에는 limit(24) 였다」고 적어 둔 주석에 시험이 걸린다.
     A-492·A-502 에서 같은 함정에 두 번 빠졌다. */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  ok('글 목록에 맨 limit(24) 가 남아 있지 않다', !/limit\(24\)/.test(strip(TR)));
  ok('글 목록도 한 개를 더 불러 본다', /limit\(PAGE \+ 1\)/.test(TR));
  ok('넘쳐 온 한 개를 잘라 낸다', /docs\.slice\(0, PAGE\)/.test(TR));
  ok('더 보기 단추가 있다', /id="articlesMore"/.test(TR));
  ok('더 보기는 두 언어다', /data-en="Load more articles"/.test(TR) && /data-ko="아티클 더 보기"/.test(TR));
  ok('더 보기를 누르면 실시간 수신을 끊는다', /_unsub\(\)/.test(TR));
  ok('다음 쪽은 startAfter 로 이어 붙인다', /startAfter\(_lastDoc\)/.test(TR));
  ok('색인 없는 갈래도 PAGE 로 끊는다', /rows\.slice\(0, PAGE\)/.test(TR));
  ok('글 목록도 몇 개를 보고 있는지 적는다', /개를 보고 있습니다/.test(TR));
  const CP = fs.readFileSync(path.join(ROOT, 'category-products.js'), 'utf8');
  ok('카테고리 쪽에도 맨 limit(24) 가 없다', !/limit\(24\)/.test(strip(CP)));

  // ── 6) 매거진 셈 — 보이는 것과 세는 것이 같은가 (A-509, 브론즈 34차 N34-7) ──
  /* 그리드 밖에 추천 기사 카드가 한 장 더 있다. 그것을 안 세면 손님 눈에는
     131장이 보이는데 문구는 「129개 중」이라고 말한다. */
  const MG = fs.readFileSync(path.join(ROOT, 'magazine.html'), 'utf8');
  const mstrip = MG.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  ok('추천 카드를 센다', /\.featured-article \.featured-card/.test(mstrip));
  ok('전체는 그리드 + 추천이다', /cards\.length \+ featured/.test(mstrip));
  ok('보여 준 수에도 추천을 더한다', /shown \+ featured/.test(mstrip));
  ok('맨 cards.length 로 세는 문구가 남아 있지 않다',
     !/of ' \+ cards\.length \+ ' articles/.test(mstrip));
  ok('추천 카드가 실제로 한 장 있다', (MG.match(/class="featured-card/g) || []).length === 1);

  // ── 7) 검색 가리개 — 자른 사실을 말하는가 (A-509, 브론즈 34차 N34-3) ───────
  const SJ = fs.readFileSync(path.join(ROOT, 'search.js'), 'utf8');
  const sstrip = SJ.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  ok('검색도 맨 12 로 자르지 않는다', !/slice\(0, 12\)/.test(sstrip));
  ok('자른 줄 수를 함께 보낸다', /top\.total = results\.length/.test(sstrip));
  ok('안내줄 자리가 있다', /search-result-more/.test(sstrip));
  const CSS = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok('안내줄 처방이 style.css 에 있다', /\.search-result-more\s*\{/.test(CSS));

  console.log('\n목록 끊김 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
  process.exit(fail ? 1 : 0);
})();
