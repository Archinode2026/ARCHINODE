/* A-468 — basePath 사본 둘이 같은 답을 내는지 (2026-11-11)
 *
 * 왜: search.js 의 옛 getBasePath 는 **폴더 이름을 나열**했고 `/products/` ·
 *     `/trend-report/` 가 빠져 있었다. 그 두 폴더에서 search-index.json 이 404 라
 *     정적 항목 220개가 통째로 사라졌고, 결과 링크도 죽은 주소로 갔다.
 *     사본이 둘(search.js · category-products.js)이라 하나만 고쳐질 수 있다.
 *     이 시험은 **두 사본을 같은 표에 대고** 맞춰 본다.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function pull(file, label) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const i = src.indexOf('function getBasePath()');
  if (i < 0) throw new Error(label + ' 에 getBasePath 가 없다');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { k++; break; } }
  }
  const body = src.slice(i, k);
  return new Function('window', body + '; return getBasePath;');
}

// 경로 → 기대하는 접두사
const TABLE = [
  ['/', ''],
  ['/index.html', ''],
  ['/about', ''],                       // 확장자 없는 「예쁜 주소」 — 라이브에서 200
  ['/brands.html', ''],
  ['/products/view.html', '../'],       // ★ 옛 코드가 '' 를 돌려줘 색인이 404 였다
  ['/products/view', '../'],
  ['/trend-report/view.html', '../'],   // ★ 같은 결함
  ['/trend-report/salone-del-mobile-2026-trends.html', '../'],
  ['/magazine/view.html', '../'],
  ['/brands/view.html', '../'],
  ['/auth/login.html', '../'],
  ['/brand-portal/dashboard.html', '../'],
  ['/admin/dashboard.html', '../'],
  ['/categories.html', ''],
  // 내가 처음 적은 기대가 틀렸던 자리: `/categories/bathroom.html` 은 categories 폴더
  // **안**이므로 한 단 깊다(`../`). 사본 둘이 같은 답을 내서 내 기대가 틀린 걸 알았다.
  ['/categories/bathroom.html', '../'],
  ['/categories/bathroom/bathroom-taps.html', '../../'],
  ['/categories/bathroom/', '../../'],
  ['/products/', '../']
];

const impls = [
  ['search.js', pull('search.js', 'search.js')],
  ['category-products.js', pull('category-products.js', 'category-products.js')]
];

let fail = 0, n = 0;
for (const [file, make] of impls) {
  for (const [p, want] of TABLE) {
    const fn = make({ location: { pathname: p } });
    const got = fn();
    n++;
    if (got !== want) {
      fail++;
      console.log('  X ' + file + '  ' + p + '  →  ' + JSON.stringify(got) + '  (기대 ' + JSON.stringify(want) + ')');
    }
  }
}
// 두 사본이 서로 같은가
for (const [p] of TABLE) {
  const a = impls[0][1]({ location: { pathname: p } })();
  const b = impls[1][1]({ location: { pathname: p } })();
  n++;
  if (a !== b) { fail++; console.log('  X 사본이 갈렸다  ' + p + '  search.js=' + JSON.stringify(a) + '  category-products.js=' + JSON.stringify(b)); }
}
console.log('basePath — 시험 ' + n + '개, 실패 ' + fail + '개');
if (fail) process.exit(1);
console.log('통과');
