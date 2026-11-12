/* A-501 — 디지털 상품 카드와 구매 길목이 제대로 서는지.
 *
 * 이 페이지는 **돈을 받는 자리**다. 잘못되면 두 방향으로 나쁘다:
 *   · 결제 주소가 엉뚱하면 손님이 남의 결제창으로 간다
 *   · 상품 글에 꺾쇠 하나가 들어가면 카드가 깨진다
 * 그래서 렌더러를 떼어 내 실제로 돌려 본다(브라우저 없이).
 *
 *   node tools/test-digital-products.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'digital-products.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  x ' + name + (extra ? '  → ' + extra : '')); }
}

function grab(sig, endMark) {
  const i = SRC.indexOf(sig);
  if (i < 0) throw new Error('못 찾음: ' + sig + ' — 함수 이름이 바뀌었나?');
  const j = SRC.indexOf(endMark, i) + endMark.length;
  return SRC.slice(i, j);
}

const code = [
  grab('var DP_PRODUCTS = [', '];'),
  grab('function dpEsc', '\n}'),
  grab('function dpPayUrl', '\n}'),
  grab('function dpPreviewUrl', '\n}'),
  grab('function dpPick', '\n}'),
  grab('var DP_CAT_LABEL', '};'),
  grab('function dpRenderProducts', '\n}')
].join('\n');

let grid, empty;
function reset(lang) {
  grid = { style: {}, innerHTML: '' };
  empty = { style: {} };
  global.document = {
    documentElement: { lang: lang || 'ko' },
    getElementById: (id) => (id === 'dpGrid' ? grid : (id === 'dpEmpty' ? empty : null))
  };
  global.window = {};
}
reset('ko');
/* 'use strict' 안의 eval 은 **제 스코프**에 함수를 만든다 — 바깥에서 그냥 부를 수 없다.
   그래서 끝에 한 줄을 붙여 밖으로 꺼낸다(DP_PRODUCTS 는 배열이라 참조로 따라온다). */
eval(code + '\n;globalThis.__dp = { dpEsc, dpPayUrl, dpPreviewUrl, dpPick, dpRenderProducts, DP_PRODUCTS };');
const { dpEsc, dpPayUrl, dpPreviewUrl, dpPick, dpRenderProducts, DP_PRODUCTS } = globalThis.__dp;

// ── 1) 결제 주소 검사 ──────────────────────────────────────────────────
[['https://www.paypal.com/ncp/payment/ABC', true],
 ['https://paypal.com/ncp/payment/ABC', true],
 ['https://paypal.me/archinode/29', true],
 ['http://www.paypal.com/ncp/payment/ABC', false],   // https 아님
 ['https://evil.example/paypal.com/x', false],       // 호스트가 다르다
 ['https://paypal.com.evil.example/x', false],
 ['javascript:alert(1)', false],
 ['', false],
 [undefined, false]
].forEach(([u, want]) => ok('결제 주소 ' + JSON.stringify(u), !!dpPayUrl(u) === want));

// ── 1-2) 미리보기 주소 검사 — 시험 사용 수단은 우리가 책임지는 곳만 ────
[['/previews/a.pdf', true],
 ['/samples/x/y.pdf', true],
 ['https://archinodekr.com/previews/a.pdf', true],
 ['https://www.archinode.org/p.pdf', true],
 ['https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media', true],
 ['//evil.example/a.pdf', false],                   // 스킴 없는 바깥 주소
 ['https://evil.example/previews/a.pdf', false],
 ['https://archinodekr.com.evil.example/a.pdf', false],
 ['http://archinodekr.com/a.pdf', false],           // https 아님
 ['javascript:alert(1)', false],
 ['', false],
 [undefined, false]
].forEach(([u, want]) => ok('미리보기 주소 ' + JSON.stringify(u), !!dpPreviewUrl(u) === want));

// ── 2) 상품이 없으면 안내문을 건드리지 않는다 ──────────────────────────
reset('ko');
DP_PRODUCTS.length = 0;
dpRenderProducts();
ok('상품 0건이면 그리드를 비우지 않는다', grid.innerHTML === '');
ok('상품 0건이면 안내문을 숨기지 않는다', empty.style.display === undefined);

// ── 3) 상품이 있으면 카드가 서고 안내문이 사라진다 ─────────────────────
reset('ko');
DP_PRODUCTS.length = 0;
DP_PRODUCTS.push(
  { id: 'a', category: 'market-intel', priceEur: 29, nameEn: 'Market <brief>', nameKo: '시장 <브리프>',
    descEn: 'd', descKo: 'ㄷ', format: 'PDF · 24p', previewUrl: '/previews/a.pdf',
    paypalUrl: 'https://www.paypal.com/ncp/payment/ABC' },
  { id: 'b', category: 'cad-library', priceEur: 49, nameEn: 'CAD', nameKo: '캐드',
    descEn: 'd', descKo: 'ㄷ', format: 'DWG', previewUrl: '/previews/b.pdf',
    paypalUrl: 'javascript:alert(1)' },
  /* 결제 주소는 성한데 **맛보기가 없는** 상품 — 전자상거래법 제17조②5호의
     「시험 사용 상품」이 없으면 청약철회 제한이 서지 않으므로 팔지 않는다 */
  { id: 'c', category: 'spec-sheet', priceEur: 19, nameEn: 'Spec', nameKo: '스펙',
    descEn: 'd', descKo: 'ㄷ', format: 'PDF',
    paypalUrl: 'https://www.paypal.com/ncp/payment/DEF' }
);
dpRenderProducts();
const h = grid.innerHTML;
ok('카드 3장', (h.match(/class="dp-card"/g) || []).length === 3);
ok('안내문을 숨긴다', empty.style.display === 'none');
ok('그리드를 grid 로 바꾼다', grid.style.display === 'grid');
ok('결제·맛보기가 둘 다 성한 상품만 살아 있는 단추', (h.match(/data-buy=/g) || []).length === 1);
ok('살아 있는 단추는 a 상품뿐', /data-buy="a"/.test(h) && !/data-buy="c"/.test(h));
ok('맛보기 없는 상품은 비활성 단추', (h.match(/dp-card-btn disabled/g) || []).length === 2);
ok('맛보기 링크는 2개(c 는 없다)', (h.match(/class="dp-preview-link"/g) || []).length === 2);
ok('맛보기 링크는 새 탭·noopener', !/dp-preview-link[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(h) === false);
ok('나쁜 주소가 HTML 에 안 들어간다', !/javascript:/.test(h), h.slice(0, 80));
ok('꺾쇠를 이스케이프한다', /Market &lt;brief&gt;/.test(h));
ok('div 균형', (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length);
ok('두 언어 속성이 붙는다', /data-en="/.test(h) && /data-ko="/.test(h));

// ── 4) 영어로 보면 영어가 그려진다 ─────────────────────────────────────
reset('en');
dpRenderProducts();
ok('영어 화면은 영어 글자', /Market &lt;brief&gt;/.test(grid.innerHTML) && /Buy — EUR 29/.test(grid.innerHTML));

// ── 5) 페이지 쪽 약속 ──────────────────────────────────────────────────
ok('구매 확인 창이 있다(기본 confirm 을 쓰지 않는다)', /function dpOpenBuy/.test(SRC));
ok('청약철회 동의 체크가 있다', /id="dpAgree"/.test(SRC));
ok('동의 전에는 결제 단추가 잠겨 있다', /id="dpGo"[^>]*disabled/.test(SRC));
ok('기본 confirm/alert 을 쓰지 않는다',
   !/(?<![\w.])(confirm|alert)\s*\(/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
ok('복귀 페이지가 있다', fs.existsSync(path.join(ROOT, 'order-complete.html')));
const OC = fs.readFileSync(path.join(ROOT, 'order-complete.html'), 'utf8');
ok('복귀 페이지는 검색에서 뺀다(noindex)', /noindex/.test(OC));
/* 주석은 빼고 본다 — 「이렇게 쓰지 마라」고 적어 둔 주석에 시험이 걸린다(A-492 때와 같은 함정) */
const OC_TEXT = OC.replace(/<!--[\s\S]*?-->/g, '');
ok('복귀 페이지가 결제를 단정하지 않는다', !/결제가 완료되었습니다|결제가 완료/.test(OC_TEXT));
ok('복귀 페이지 제목도 단정하지 않는다', !/<title[^>]*>[^<]*결제 완료/.test(OC_TEXT));

// ── 6) 결제 전에 「파는 사람이 누구인지」를 보여 준다 ───────────────────
/* 피싱 걱정에 대한 답은 「믿어 주세요」가 아니라 **대조할 수 있는 사실**이다.
   신고번호는 공개 대장과 맞춰 볼 수 있고, 이동할 주소는 눈으로 확인된다. */
const DP_BUY = SRC.slice(SRC.indexOf('function dpOpenBuy'));
ok('구매창이 맛보기 없이는 열리지 않는다', /if \(!pay \|\| !prev\) return;/.test(DP_BUY));
ok('구매창에 상호가 있다', /비비들리바이브/.test(DP_BUY));
ok('구매창에 사업자등록번호가 있다', /640-03-02879/.test(DP_BUY));
ok('구매창에 통신판매업신고번호가 있다', /2026-안양동안-0318/.test(DP_BUY));
ok('구매창 영문에도 신고번호가 있다', /2026-Anyang Dongan-0318/.test(DP_BUY));
ok('구매창에 주소가 있다', /흥안대로 528/.test(DP_BUY));
ok('이동 전에 주소창 확인을 먼저 말한다', /주소창이 paypal\.com/.test(DP_BUY));
ok('이동 전 안내가 영문에도 있다', /address bar reads paypal\.com/.test(DP_BUY));
ok('이동할 주소를 화면에 보여 준다', /dpEsc\(pay\)/.test(DP_BUY));
ok('카드 정보를 묻지 않는다고 분명히 적는다', /카드 정보를 묻지 않습니다/.test(DP_BUY));
ok('구매창에 맛보기 링크가 있다', /dpEsc\(prev\)/.test(DP_BUY));

// ── 7) 모든 페이지 푸터의 사업자 정보 ──────────────────────────────────
ok('디지털 상품 페이지 푸터에 신고번호', /2026-안양동안-0318/.test(SRC.slice(SRC.indexOf('footer-business-info'))));
ok('복귀 페이지 푸터에 신고번호', /2026-안양동안-0318/.test(OC));

console.log('\n디지털 상품 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
