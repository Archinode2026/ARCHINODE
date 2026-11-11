/* A-467 — 포털 「제품 수정」 왕복 시험 (2026-11-11)
 *
 * 왜 이 시험인가:
 *   ① 폼을 채우는 순서. 카테고리를 넣고 **하위 목록을 다시 만든 뒤** 하위를 넣어야 한다.
 *      순서가 바뀌면 `<select>` 에 그 option 이 아직 없어서 **조용히 빈칸**이 된다 —
 *      화면은 멀쩡해 보이고, 저장할 때 「서브카테고리를 골라 주세요」로만 튕긴다.
 *      그래서 아래 선택칸 흉내는 **진짜 select 처럼** 없는 값을 거부한다.
 *      (흉내가 그냥 받아 주면 순서를 뒤집어도 시험이 통과해 버린다 — 못 떨어지는 시험.)
 *   ② 폼 비우기. 전에는 거래조건·스펙 파일 6칸을 안 비워 **다음 제품에 묻어 갔다**.
 *   ③ 사진 URL. bpSafeUrl 을 거치지 않으면 javascript: 스킴이 미리보기로 들어간다(A-218).
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'brand-portal', 'dashboard.html');
const html = fs.readFileSync(SRC, 'utf8');

// ── 소스에서 꺼내 온다 (사본을 만들지 않는다) ──
function grab(startPat) {
  const i = html.indexOf(startPat);
  if (i < 0) throw new Error('못 찾음: ' + startPat);
  let j = html.indexOf('{', i), depth = 0, k = j;
  for (; k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return html.slice(i, k) + (startPat.startsWith('const') ? ';' : '');
}
const src = [
  grab('const SUBCATEGORIES = '),
  html.match(/function bpSafeUrl\(u\)[^\n]*\n/)[0],
  grab('function updateSubcategories()'),
  grab('function bpClearProductForm()'),
  grab('function bpFillProductForm(p)')
].join('\n');

// ── DOM 흉내 ──
const FIELDS = ['prodName','prodCollection','prodDesc','prodMaterials','prodDimensions',
  'prodDesigner','prodMoq','prodLeadTime','prodPrice','prodCategory','prodSupplyType',
  'prodImage','prodCatalogFile','prodBimFile','prodModel3dFile'];
let els;
function freshDom() {
  els = {};
  FIELDS.forEach(id => { els[id] = { value: '', style: {} }; });
  // 진짜 select 처럼 — innerHTML 안에 있는 value 만 받는다
  // 진짜 <select> 의 두 가지 성질을 흉내낸다:
  //  ㄱ. 없는 값을 넣으면 빈칸이 된다
  //  ㄴ. innerHTML 을 갈아끼우면 option 이 새로 파싱되고 **선택이 첫 option 으로 돌아간다**
  //      (updateSubcategories 는 `=` 뒤에 `+=` 로 붙이므로 매번 다시 파싱된다)
  els.prodSubcategory = {
    style: {}, _html: '', _v: '',
    get innerHTML() { return this._html; },
    set innerHTML(h) { this._html = h; this._v = (this._opts()[0] !== undefined) ? this._opts()[0] : ''; },
    _opts() { return (this._html.match(/value="([^"]*)"/g) || []).map(x => x.slice(7, -1)); },
    get value() { return this._v; },
    set value(v) { this._v = this._opts().includes(v) ? v : ''; }
  };
  els.prodImagePreview = { style: { display: 'none' } };
  els.prodPreviewImg = { src: '', alt: '' };
  return {
    getElementById: id => els[id] || null,
    documentElement: { lang: 'ko' }
  };
}

let fail = 0, n = 0;
function ok(cond, what, extra) {
  n++;
  if (!cond) { fail++; console.log('  X ' + what + (extra ? '  → ' + extra : '')); }
}

function run() {
  const document = freshDom();
  const window = {};
  const prodMsg = () => {};
  // eslint-disable-next-line no-eval
  const fn = new Function('document', 'window', 'prodMsg', src + `
    return { updateSubcategories, bpClearProductForm, bpFillProductForm, SUBCATEGORIES, bpSafeUrl };`);
  return { api: fn(document, window, prodMsg), document };
}

// ── ① 채우기: 카테고리 → 하위 순서 ──
{
  const { api } = run();
  const pairs = [
    ['Finishes', 'metal-finishes'], ['Furniture', 'tables-desks'],
    ['Office', 'office-chairs'], ['Bathroom', 'bathroom-taps'],
    ['Kitchen', 'sinks-taps'], ['Construction', 'windows-doors']
  ];
  pairs.forEach(([cat, sub]) => {
    api.bpFillProductForm({ name: 'X', category: cat, subcategory: sub });
    ok(els.prodCategory.value === cat, '카테고리가 들어간다: ' + cat, els.prodCategory.value);
    ok(els.prodSubcategory.value === sub,
       '하위 카테고리가 들어간다: ' + cat + '/' + sub,
       '받은 값 ' + JSON.stringify(els.prodSubcategory.value));
  });
  // 없는 하위 값은 빈칸이 되어야 한다 (흉내가 진짜 select 처럼 구는지 확인)
  api.bpFillProductForm({ name: 'X', category: 'Finishes', subcategory: '없는-값' });
  ok(els.prodSubcategory.value === '', '없는 하위 값은 빈칸이 된다', els.prodSubcategory.value);
}

// ── ② 비우기: 15칸 전부 ──
{
  const { api } = run();
  api.bpFillProductForm({
    name: 'A', collection: 'B', description: 'C', materials: 'D', dimensions: 'E',
    designer: 'F', priceRange: 'G', moq: 'H', leadTime: 'I', supplyType: 'direct',
    category: 'Finishes', subcategory: 'metal-finishes',
    imageUrl: 'https://example.com/a.jpg'
  });
  els.prodCatalogFile.value = 'x'; els.prodBimFile.value = 'y';
  els.prodModel3dFile.value = 'z'; els.prodImage.value = 'w';
  api.bpClearProductForm();
  FIELDS.forEach(id => ok(els[id].value === '', '비워진다: ' + id, JSON.stringify(els[id].value)));
  ok(els.prodSubcategory.value === '', '비워진다: prodSubcategory', els.prodSubcategory.value);
  ok(els.prodImagePreview.style.display === 'none', '미리보기가 닫힌다');
}

// ── ③ 사진 URL — bpSafeUrl 을 거치는지 ──
{
  const { api } = run();
  api.bpFillProductForm({ name: 'X', imageUrl: 'https://example.com/a.jpg' });
  ok(els.prodImagePreview.style.display === 'block', '정상 사진은 미리보기가 열린다');
  ok(els.prodPreviewImg.src === 'https://example.com/a.jpg', '사진 주소가 그대로');
  ok(!!els.prodPreviewImg.alt, '미리보기에 alt 가 있다 (A-395)');

  api.bpFillProductForm({ name: 'X', imageUrl: 'javascript:alert(1)' });
  ok(els.prodImagePreview.style.display === 'none', 'javascript: 스킴은 미리보기에 안 들어간다 (A-218)');

  api.bpFillProductForm({ name: 'X' });
  ok(els.prodImagePreview.style.display === 'none', '사진 없으면 미리보기가 닫힌다');
}

console.log('포털 제품 수정 — 시험 ' + n + '개, 실패 ' + fail + '개');
if (fail) process.exit(1);
console.log('통과');
