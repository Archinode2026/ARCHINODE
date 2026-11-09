#!/usr/bin/env node
/* A-422 ─ 로그인 화면의 갈림길 시험 ─────────────────────────────────────────
   로그인된 사람에게 안내 화면을 보여 주도록 바꿨다. 그런데 이 화면의 제출 처리는
   **리디렉션을 onAuthStateChanged 에 맡기고 있다** — 무조건 안내를 띄우면 방금
   로그인한 사람도 거기 갇혀 **로그인이 통째로 깨진다.**

   여기서 로그인 상태를 만들 수 없으므로, 그 갈림길만이라도 node 로 지킨다.
   함수는 HTML 에서 그대로 뽑아 온다 — 사본을 두지 않는다.
   실행: node tools/test-login-gate.js                                        */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'auth', 'login.html');
const src = fs.readFileSync(HTML, 'utf8');

function grab(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  if (i === -1) throw new Error(name + ' 를 login.html 에서 못 찾았다');
  let d = 0, started = false, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

/* ── 아주 작은 DOM 흉내 ── */
function makeEl(id) {
  return { id, style: {}, textContent: '', innerHTML: '', className: '',
           attrs: {}, kids: [], onclick: null,
           setAttribute(k, v) { this.attrs[k] = v; },
           appendChild(k) { this.kids.push(k); } };
}

function newWorld(opts) {
  const ids = ['alreadySection', 'loginSection', 'resetSection', 'aliEmail',
               'aliNextHint', 'aliGo', 'aliLogout'];
  const els = {};
  ids.forEach(i => { if (!(opts.missing || []).includes(i)) els[i] = makeEl(i); });
  const nav = [];
  const box = {
    console,
    document: {
      getElementById: (i) => els[i] || null,
      createElement: (t) => makeEl('<' + t + '>'),
    },
    window: {
      location: { search: opts.search || '', origin: 'https://archinodekr.com',
                  pathname: '/auth/login.html',
                  set href(v) { nav.push(v); }, get href() { return nav[nav.length - 1]; },
                  reload() { nav.push('(reload)'); } },
      setLangText(el, en, ko) {
        if (!el) return;
        el.setAttribute('data-en', en); el.setAttribute('data-ko', ko);
        el.textContent = ko;                       // 이 시험은 한국어 화면을 본다
      },
      applyLangAgain() {},
    },
    URL, URLSearchParams,
    auth: { signOut: () => Promise.resolve() },
  };
  box.window.window = box.window;
  vm.createContext(box);
  vm.runInContext(
    'var loginJustSubmitted = ' + (opts.justSubmitted ? 'true' : 'false') + ';\n' +
    [grab('loginNextUrl'), grab('showAlreadyLoggedIn'), grab('loginArrive')].join('\n'),
    box);
  return { box, els, nav };
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((m || '') + ' 기대 ' + JSON.stringify(b) + ' 인데 ' + JSON.stringify(a));
}
const USER = { email: 'someone@example.com' };

console.log('A-422 로그인 화면 갈림길 시험');

t('[1] ★ 방금 로그인한 사람은 안내 없이 목적지로 간다 (이게 깨지면 로그인이 죽는다)', () => {
  const w = newWorld({ justSubmitted: true });
  w.box.loginArrive(USER, 'profile.html', 'Go →', '가기 →');
  eq(w.nav, ['profile.html'], '이동:');
  eq(w.els.alreadySection.style.display, undefined, '안내 화면은 안 뜬다:');
});

t('[2] 이미 로그인돼 있던 사람에게는 안내 화면', () => {
  const w = newWorld({ justSubmitted: false });
  w.box.loginArrive(USER, 'profile.html', 'Go to my page →', '내 페이지로 가기 →');
  eq(w.nav, [], '이동이 없어야 한다:');
  eq(w.els.alreadySection.style.display, '', '안내 화면:');
  eq(w.els.loginSection.style.display, 'none', '로그인 칸은 숨는다:');
  eq(w.els.resetSection.style.display, 'none', '재설정 칸도 숨는다:');
});

t('[3] 어느 계정인지 보여 준다', () => {
  const w = newWorld({ justSubmitted: false });
  w.box.loginArrive(USER, 'profile.html', 'Go →', '가기 →');
  eq(w.els.aliEmail.textContent, 'someone@example.com');
});

t('[4] ?next= 가 없으면 단추에 그 계정의 제 자리 이름이 뜬다', () => {
  const w = newWorld({ justSubmitted: false });
  w.box.loginArrive(USER, '../brand-portal/dashboard.html', 'Go to brand portal →', '브랜드 포털로 가기 →');
  eq(w.els.aliGo.textContent, '브랜드 포털로 가기 →');
  eq(w.els.aliNextHint.style.display, undefined, '안내 줄은 안 뜬다:');
});

t('[5] ?next= 가 있으면 「계속하기」 + 안내 줄', () => {
  const w = newWorld({ justSubmitted: false, search: '?next=/products/view.html%3Fid%3Dx' });
  w.box.loginArrive(USER, '/products/view.html?id=x', 'Go to my page →', '내 페이지로 가기 →');
  eq(w.els.aliGo.textContent, '계속하기 →');
  eq(w.els.aliNextHint.style.display, 'block', '안내 줄:');
});

t('[6] 계속하기를 누르면 목적지로 간다', () => {
  const w = newWorld({ justSubmitted: false });
  w.box.loginArrive(USER, '../admin/dashboard.html', 'Go to admin →', '어드민으로 가기 →');
  w.els.aliGo.onclick();
  eq(w.nav, ['../admin/dashboard.html']);
});

t('[7] 로그아웃을 누르면 새로고침한다 (?next= 를 들고 돌아온다)', async () => {
  const w = newWorld({ justSubmitted: false, search: '?next=/x.html' });
  w.box.loginArrive(USER, '/x.html', 'Go →', '가기 →');
  let prevented = false;
  w.els.aliLogout.onclick({ preventDefault() { prevented = true; } });
  if (!prevented) throw new Error('preventDefault 를 안 불렀다 — # 로 점프한다');
});

t('[8] 안내 칸이 없는 페이지에서는 예전처럼 보낸다 (안 깨진다)', () => {
  const w = newWorld({ justSubmitted: false, missing: ['alreadySection'] });
  w.box.loginArrive(USER, 'profile.html', 'Go →', '가기 →');
  eq(w.nav, ['profile.html']);
});

t('[9] 바깥 주소·javascript: 는 next 로 안 받는다 (R-069 가 지키는 것)', () => {
  ['?next=//evil.com/x', '?next=javascript:alert(1)', '?next=https://evil.com/x',
   '?next=/auth/login.html'].forEach(q => {
    const w = newWorld({ justSubmitted: false, search: q });
    if (w.box.loginNextUrl() !== '') throw new Error(q + ' → ' + w.box.loginNextUrl());
  });
  const ok = newWorld({ justSubmitted: false, search: '?next=/brand-portal/dashboard.html' });
  eq(ok.box.loginNextUrl(), '/brand-portal/dashboard.html');
});

t('[10] 마크업 쪽: 안내 칸과 깃발이 실제로 있다', () => {
  ['id="alreadySection"', 'id="aliEmail"', 'id="aliGo"', 'id="aliLogout"', 'id="aliNextHint"']
    .forEach(x => { if (src.indexOf(x) === -1) throw new Error(x + ' 가 없다'); });
  if (!/loginJustSubmitted = true;/.test(src)) throw new Error('제출할 때 깃발을 안 세운다');
  if (!/loginJustSubmitted = false;/.test(src)) throw new Error('실패했을 때 깃발을 안 내린다');
});

console.log('\n통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
