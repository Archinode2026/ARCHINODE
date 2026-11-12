/* A-513 — 모바일 메뉴를 **키보드로 쓸 수 있는지**.
 *
 * 왜 있는가
 * ---------
 * 390px 에서 「Menu」를 눌러 메뉴를 열고 Tab 을 20번 눌러도 **메뉴 안에 들어가는
 * 정거장이 하나도 없었다**(브론즈 35차 N35-1). 까닭은 차례다 — `<nav id="mainNav">`
 * 가 `.mobile-toggle` 보다 **앞**에 있어서, 단추에서 Tab 을 누르면 메뉴를 지나쳐
 * 바깥으로 나간다. 열리기는 하는데 쓸 수가 없다.
 *
 * markup 차례를 바꾸면 233쪽 머리글이 흔들리므로, **열린 순간 초점을 안으로
 * 옮기고 닫힐 때까지 가둔다**. 그 약속이 서는지 여기서 실제로 돌려 본다.
 *
 *   node tools/test-a11y-nav.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'a11y-nav.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  x ' + name + (extra ? '  → ' + extra : '')); }
}

function El(tag, id, cls) {
  return {
    tagName: tag.toUpperCase(), id: id || '', className: cls || '',
    _attrs: {}, _kids: [], _ls: {}, _focused: false, disabled: false,
    offsetWidth: 10, offsetHeight: 10,
    classList: {
      _s: new Set(),
      add(x) { this._s.add(x); this._owner._changed(); },
      remove(x) { this._s.delete(x); this._owner._changed(); },
      contains(x) { return this._s.has(x); },
      toggle(x) { this._s.has(x) ? this._s.delete(x) : this._s.add(x); this._owner._changed(); }
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    getClientRects() { return [{}]; },
    focus() { doc.activeElement = this; },
    contains(el) { return el === this || this._kids.indexOf(el) >= 0; },
    querySelectorAll() { return this._kids; },
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    removeEventListener() {},
    _changed() {}
  };
}

let doc, observers;
function build() {
  observers = [];
  const nav = El('nav', 'mainNav', 'main-nav');
  nav.classList._owner = nav;
  const links = [El('a'), El('a'), El('a')];
  nav._kids = links;
  const toggle = El('button', '', 'mobile-toggle');
  toggle.classList._owner = toggle;
  const main = El('div', 'main');
  main.classList._owner = main;
  nav._changed = function () { observers.forEach(o => o()); };

  doc = {
    readyState: 'complete', activeElement: null, _ls: {},
    getElementById(id) { return id === 'mainNav' ? nav : (id === 'main' ? main : null); },
    querySelector(sel) { return sel === '.mobile-toggle' ? toggle : null; },
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    removeEventListener(t, f) {
      const a = this._ls[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1);
    },
    _key(ev) { (this._ls.keydown || []).slice().forEach(f => f(ev)); }
  };
  global.document = doc;
  global.window = {};
  global.MutationObserver = function (cb) {
    return { observe() { observers.push(cb); }, disconnect() {} };
  };
  eval(SRC);
  return { nav, links, toggle, main };
}

function key(shift) {
  let prevented = false;
  doc._key({ key: 'Tab', shiftKey: !!shift, preventDefault() { prevented = true; } });
  return prevented;
}

// ── 1) 처음 상태 ───────────────────────────────────────────────────────
let { nav, links, toggle, main } = build();
ok('단추에 aria-expanded 가 false 로 붙는다', toggle.getAttribute('aria-expanded') === 'false',
   String(toggle.getAttribute('aria-expanded')));
ok('단추가 어느 패널을 여는지 알린다', toggle.getAttribute('aria-controls') === 'mainNav');
ok('본문 표지를 붙인다', main.getAttribute('role') === 'main', String(main.getAttribute('role')));
ok('닫힌 동안에는 대화상자가 아니다', nav.getAttribute('role') === null);

// ── 2) 열었을 때 ───────────────────────────────────────────────────────
nav.classList.add('active');
ok('열면 aria-expanded 가 true', toggle.getAttribute('aria-expanded') === 'true');
ok('열면 대화상자가 된다', nav.getAttribute('role') === 'dialog' && nav.getAttribute('aria-modal') === 'true');
ok('열면 초점이 메뉴 첫 항목으로 간다', doc.activeElement === links[0]);

// ── 3) Tab 이 메뉴 안에 갇히는가 ──────────────────────────────────────
doc.activeElement = links[links.length - 1];
ok('마지막 항목에서 Tab 은 바깥으로 안 샌다', key(false) === true);
ok('마지막 다음은 여닫이 단추다', doc.activeElement === toggle, String(doc.activeElement && doc.activeElement.className));
ok('단추에서 Tab 은 다시 첫 항목으로', key(false) === true && doc.activeElement === links[0]);
doc.activeElement = links[0];
ok('첫 항목에서 Shift+Tab 은 단추로', key(true) === true && doc.activeElement === toggle);
ok('단추에서 Shift+Tab 은 마지막 항목으로',
   key(true) === true && doc.activeElement === links[links.length - 1]);

// ── 4) 닫았을 때 ───────────────────────────────────────────────────────
nav.classList.remove('active');
ok('닫으면 aria-expanded 가 false', toggle.getAttribute('aria-expanded') === 'false');
ok('닫으면 대화상자 표지를 뗀다', nav.getAttribute('role') === null && nav.getAttribute('aria-modal') === null);
ok('닫으면 초점이 여닫이 단추로 돌아온다', doc.activeElement === toggle);
doc.activeElement = null;
ok('닫힌 뒤 Tab 은 더 이상 가로채지 않는다', key(false) === false);

// ── 5) 검색 가리개가 열려 있으면 손을 뗀다 ─────────────────────────────
({ nav, links, toggle, main } = build());
const overlay = El('div', 'searchOverlay');
overlay.classList._owner = overlay;
overlay.classList.add('active');
const prevGet = doc.getElementById;
doc.getElementById = function (id) { return id === 'searchOverlay' ? overlay : prevGet.call(doc, id); };
doc.activeElement = null;
nav.classList.add('active');
ok('가리개가 열려 있으면 초점을 뺏지 않는다', doc.activeElement === null,
   String(doc.activeElement && doc.activeElement.tagName));

// ── 6) 모든 머리글 페이지가 이 파일을 싣는가 ───────────────────────────
(function () {
  const SKIP = ['node_modules', '.git', '__pycache__', 'archi-diary', 'docs',
                'sales', 'silvia', 'scripts', 'tools', 'downloads'];
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(path.join(dir, e.name)); }
      else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  })(ROOT);
  let nav = 0, have = 0; const missing = [];
  for (const f of out) {
    const t = fs.readFileSync(f, 'utf8');
    if (t.indexOf('id="mainNav"') < 0) continue;
    nav++;
    if (t.indexOf('a11y-nav.js') >= 0) have++;
    else missing.push(path.relative(ROOT, f));
  }
  ok('머리글을 가진 쪽이 200쪽 넘는다(허수 방지)', nav > 200, nav + '쪽');
  ok('머리글을 가진 쪽이 전부 a11y-nav.js 를 싣는다', nav === have,
     '빠진 쪽 ' + missing.length + (missing.length ? ' — ' + missing.slice(0, 3).join(', ') : ''));
})();

// ── 6-2) 한 쪽에 제목(h1)은 하나여야 한다 (A-515, 브론즈 35차 N35-4 곁가지) ──
/* `brands/view.html`·`products/view.html` 은 화면 밖에 숨긴 자리표시 h1 을 두고
   자료가 오면 진짜 h1 을 **더** 그렸다 — 읽어 주는 도구에게는 제목이 두 번 들린다.
   진짜가 선 뒤에 자리표시를 치운다. 코드가 그리는 쪽은 눈으로 셀 수 없으므로
   **치우는 코드가 있는지**로 본다. */
(function () {
  const SKIP = ['node_modules', '.git', '__pycache__', 'archi-diary', 'docs', 'sales',
                'silvia', 'scripts', 'tools', 'downloads', 'assets', 'admin',
                'brand-portal', 'auth'];
  /* 라우터·껍데기라 정적 h1 이 0인 쪽 — 코드가 본문과 함께 그린다 */
  const EXEMPT = ['magazine/view.html', 'trend-report/view.html'];
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(path.join(dir, e.name)); }
      else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  })(ROOT);
  let seen = 0; const wrong = [];
  for (const f of out) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (EXEMPT.includes(rel)) continue;
    let t = fs.readFileSync(f, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    const n = (t.match(/<h1\b/g) || []).length;
    seen++;
    if (n !== 1) wrong.push(rel + '(' + n + ')');
  }
  ok('공개 쪽을 200쪽 넘게 봤다(허수 방지)', seen > 200, seen + '쪽');
  ok('공개 쪽마다 정적 h1 이 하나다', wrong.length === 0, wrong.slice(0, 5).join(', '));
  for (const f of ['brands/view.html', 'products/view.html']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(f + ' 의 자리표시에 손잡이가 있다', /id="srTitle"/.test(t));
    ok(f + ' 이 진짜 제목이 선 뒤 자리표시를 치운다',
       /getElementById\('srTitle'\)/.test(t) && /removeChild\(ph\)/.test(t));
    ok(f + ' 은 진짜 제목이 없으면 자리표시를 그대로 둔다',
       /contentDiv\.querySelector\('h1'\)/.test(t));
  }
})();

// ── 7) 초점 고리가 두 겹인가 (A-513, 브론즈 35차 N35-2) ────────────────
/* 브라우저 기본은 검은 실선 하나뿐이라 어두운 사진 위에서 묻힌다.
   한 가지 빛깔로는 두 바탕을 다 감당하지 못한다(A-456 의 교훈). */
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const m = css.match(/(^|\n):focus-visible\s*\{[^}]*\}/);
  ok('style.css 에 :focus-visible 처방이 있다', !!m);
  if (m) {
    ok('어두운 테두리가 있다', /outline:\s*\d+px solid/.test(m[0]), m[0].slice(0, 80));
    ok('밝은 후광이 있다', /box-shadow:[^;]*rgba\(255/.test(m[0]), m[0].slice(0, 120));
  }
  ok('마우스 눌림에는 안 나온다(:focus 가 아니라 :focus-visible)',
     !/(^|\n):focus\s*\{/.test(css));
})();

console.log('\n키보드 길잡이 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
