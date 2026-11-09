#!/usr/bin/env node
/* A-415 ─ brand-portal 카테고리 왕복 시험 ────────────────────────────────────
   brands.category 는 **배열**이다(list-your-brand.html:783). 브랜드 포털은 단일
   <select> 로 읽고 .value 를 도로 써서, 2개 이상 고른 브랜드가 무엇이든 저장하면
   카테고리가 통째로 지워졌다. 그 자리를 체크박스 + 도우미 3개로 바꿨고,
   이 시험이 **지우지 않는다**는 것을 지킨다.

   HTML 에서 함수 본문을 그대로 뽑아 돌린다 — 사본을 두지 않는다.
   실행: node tools/test-bp-category.js                                        */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'brand-portal', 'dashboard.html');
const src = fs.readFileSync(HTML, 'utf8');

/* ── 함수 3개를 이름으로 떼어 온다 ── */
function grab(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  if (i === -1) throw new Error(name + ' 를 dashboard.html 에서 못 찾았다');
  // 중괄호 균형으로 끝을 찾는다 (이 세 함수 안에 문자열 중괄호가 없음을 전제)
  let depth = 0, started = false, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}
const code = ['bpCategoryToArray', 'bpSetCategory', 'bpGetCategory'].map(grab).join('\n');

/* ── 최소 DOM 흉내 ── */
function makeGroup(values) {
  const boxes = values.map(v => ({ type: 'checkbox', name: 'editCategory', value: v, checked: false }));
  return {
    _boxes: boxes,
    querySelectorAll(sel) {
      if (sel === 'input[type="checkbox"]') return boxes.slice();
      if (sel === 'input[type="checkbox"]:checked') return boxes.filter(b => b.checked);
      throw new Error('모르는 선택자: ' + sel);
    },
    appendChild(lab) { lab._kids.forEach(k => { if (k.type === 'checkbox') boxes.push(k); }); }
  };
}
const document = {
  getElementById() { return null; },
  createElement(tag) {
    const el = { tagName: tag, _kids: [], className: '', textContent: '',
                 appendChild(k) { this._kids.push(k); } };
    return el;
  }
};
const sandbox = { document, console, Array, String, Object };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { bpCategoryToArray, bpSetCategory, bpGetCategory } = sandbox;

/* ── 시험 ── */
const OPTS = ['Bathroom','Construction','Decor','Finishes','Furniture',
              'Kitchen','Lighting','Office','Outdoor','Wellness'];
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + ' 기대 ' + B + ' 인데 ' + A);
}
function roundTrip(input) {
  const g = makeGroup(OPTS);
  bpSetCategory(input, g);
  return bpGetCategory(g);
}

console.log('A-415 brand-portal 카테고리 왕복 시험');

t('[1] 배열 2개가 그대로 돌아온다 (이게 지워지던 그 경우다)', () => {
  eq(roundTrip(['Furniture', 'Lighting']), ['Furniture', 'Lighting']);
});
t('[2] 배열 1개', () => eq(roundTrip(['Furniture']), ['Furniture']));
t('[3] 열 개 전부', () => eq(roundTrip(OPTS.slice()), OPTS));
t('[4] 옛 문자열 1개도 읽는다', () => eq(roundTrip('Furniture'), ['Furniture']));
t('[5] 망가진 "a,b" 문자열에서 되살린다', () => {
  eq(roundTrip('Furniture,Lighting'), ['Furniture', 'Lighting']);
});
t('[6] 공백 낀 "a, b" 도 읽는다', () => eq(roundTrip('Furniture, Lighting'), ['Furniture', 'Lighting']));
t('[7] 빈 값들은 [] 로', () => {
  eq(roundTrip(undefined), []); eq(roundTrip(null), []);
  eq(roundTrip(''), []);        eq(roundTrip([]), []);
});
t('[8] 목록에 없는 값은 지우지 않고 체크한 채 남긴다', () => {
  const g = makeGroup(OPTS);
  const unknown = bpSetCategory(['Furniture', 'Textiles'], g);
  eq(unknown, ['Textiles'], '모르는 값 보고:');
  eq(bpGetCategory(g), ['Furniture', 'Textiles'], '왕복:');
});
t('[9] 쓰기는 언제나 배열이다 — 문자열이 새어 나가면 안 된다', () => {
  [['Furniture','Lighting'], 'Furniture', '', null, ['Textiles']].forEach(v => {
    const r = roundTrip(v);
    if (!Array.isArray(r)) throw new Error(JSON.stringify(v) + ' → 배열이 아니다: ' + typeof r);
  });
});
t('[10] 빈 칸·null 섞인 배열을 걸러 낸다', () => {
  eq(roundTrip(['Furniture', '', null, undefined, '  ', 'Lighting']), ['Furniture', 'Lighting']);
});
t('[11] 다시 읽으면 앞서 체크한 것이 풀린다 (잔상이 남지 않는다)', () => {
  const g = makeGroup(OPTS);
  bpSetCategory(['Furniture', 'Lighting'], g);
  bpSetCategory(['Office'], g);
  eq(bpGetCategory(g), ['Office']);
});
t('[12] 마크업 쪽: 체크박스 10개가 실제로 있다', () => {
  const n = (src.match(/name="editCategory"/g) || []).length;
  if (n !== 10) throw new Error('체크박스 ' + n + '개');
  OPTS.forEach(v => {
    if (src.indexOf('value="' + v + '"') === -1) throw new Error(v + ' 체크박스가 없다');
  });
});
t('[13] 단일 select 잔재가 없다', () => {
  if (/getElementById\('editCategory'\)\.value/.test(src)) throw new Error("editCategory.value 가 남아 있다");
  if (/<select id="editCategory"/.test(src)) throw new Error('select#editCategory 가 남아 있다');
});

console.log('\n통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
