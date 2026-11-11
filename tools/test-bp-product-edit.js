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


// ── ④ A-472: 제출 핸들러의 **구조**를 본다 (브론즈 29차 ①②③) ──
//
// 결함의 모양: 핸들러가 `editing` 과 `name` 만 미리 읽고 **나머지 칸은 업로드
// await 뒤에** 읽었다. 그 사이 사람이 폼을 갈아타면 업로드가 끝난 뒤 **먼저
// 고르던 문서**에 지금 화면의 값이 들어간다(제품 A 가 B 의 내용으로 덮어써졌다).
// 그래서 불변식은 이것이다 — **첫 await 뒤에는 입력칸을 읽지 않는다.**
{
  const i = html.indexOf("document.getElementById('submitProduct').addEventListener");
  ok(i >= 0, '제출 핸들러를 찾는다');
  // 핸들러 끝: 다음 최상위 `});` 까지
  const end = html.indexOf('\n});', i);
  // ★ 주석을 **지우고** 본다. 내 주석에도 「업로드 await 가 끝난 뒤에」처럼 `await `
  //   라는 글자가 들어 있어서, 안 지우면 첫 await 자리를 주석에서 잡는다
  //   (처음 이 시험을 쓸 때 그래서 15건이 거짓으로 떨어졌다 — 코드는 맞았다).
  const h = html.slice(i, end > 0 ? end : i + 14000)
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '');

  const firstAwait = h.search(/\bawait\s+[A-Za-z_$(]/);
  ok(firstAwait > 0, '핸들러 안에 await 가 있다');
  const after = h.slice(firstAwait);
  const reads = [...after.matchAll(/getElementById\('(prod[A-Za-z0-9]*)'\)\s*\.\s*(value|files)/g)]
                  .map(m => m[1] + '.' + m[2]);
  ok(reads.length === 0,
     '첫 await 뒤에 입력칸을 다시 읽지 않는다 (A-472 ①)',
     reads.length ? '읽는 칸: ' + [...new Set(reads)].join(', ') : '');

  // 스냅샷이 await 앞에 있다
  const before = h.slice(0, firstAwait);
  ['prodName', 'prodCollection', 'prodDesc', 'prodCategory', 'prodSubcategory', 'prodMaterials',
   'prodDimensions', 'prodDesigner', 'prodPrice', 'prodMoq', 'prodLeadTime', 'prodSupplyType']
    .forEach(id => ok(before.includes("getElementById('" + id + "')"),
                      '칸을 await 앞에서 읽는다: ' + id));

  // 제출 중 잠금 (A-472 ①)
  ok(/bpSubmitting\s*=\s*true/.test(before), '제출 시작에 bpSubmitting 을 켠다');
  ok(/cancelProduct'\)\.disabled\s*=\s*true/.test(before), '제출 중 「취소」도 잠근다');
  ok(/if\s*\(bpSubmitting\)\s*return/.test(html), '「취소」 핸들러가 제출 중이면 아무것도 안 한다');
  ok(/if\s*\(bpSubmitting\)\s*\{/.test(html), '폼 열기가 제출 중이면 거절한다');

  // 영구 정지 방지 (A-472 ③)
  ok(/\}\s*finally\s*\{\s*(\/\*[\s\S]*?\*\/\s*)?restoreBtn\(\);/.test(h),
     'finally 에서 restoreBtn() 을 반드시 부른다 (A-472 ③)');
  const tryAt = h.indexOf('\n  try {');
  const restoreAt = h.indexOf('const restoreBtn');
  ok(restoreAt > 0 && tryAt > 0 && restoreAt < tryAt,
     'restoreBtn 선언이 try 블록 **밖**이다 (const 는 블록 스코프라 finally 에서 안 보인다)');

  // 라벨 복원이 한 군데서만 (A-472 ②)
  const labelPatches = [...h.matchAll(/setLangText\(btn,\s*"Submit for Review"/g)].length;
  ok(labelPatches === 0,
     '핸들러 안에서 「검수 요청」 글자를 직접 박는 자리가 없다 (restoreBtn 이 모드를 보고 고른다)',
     labelPatches ? labelPatches + '곳 남음' : '');

  // 수정 payload 가 공개 주소를 지킨다
  const upd = h.slice(h.indexOf('const updates'), h.indexOf('const updates') + 900);
  ok(!/\bslug\s*:/.test(upd), '수정 payload 에 slug 이 없다 (공개 주소 보존)');
  ok(!/\bbrandId\s*:/.test(upd) && !/\bcreatedAt\s*:/.test(upd),
     '수정 payload 에 brandId·createdAt 이 없다 (규칙이 보호한다)');
  ok(/status:\s*'pending'/.test(upd), '수정 payload 가 status 를 pending 으로 둔다');
}

console.log('포털 제품 수정 — 시험 ' + n + '개, 실패 ' + fail + '개');
if (fail) process.exit(1);
console.log('통과');
