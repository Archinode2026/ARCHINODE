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

// ── 8) A-522 — 약관 조항과 계약 전 고지 ────────────────────────────────
/* 전자상거래법 제13조제2항은 **사기 전에** 거래조건을 알리게 한다. 검토자가
   화면과 대조해 일곱 항목이 없다고 했다. 조항(terms.html)과 고지(이 페이지)는
   **한 쌍**이라, 한쪽만 있으면 뜻이 없다 — 둘을 함께 본다. */
const TERMS = fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8');
ok('약관에 청약철회 조항이 있다', /제10조 \(청약철회 등\)/.test(TERMS));
ok('약관에 환급 조항이 있다', /제11조 \(환급\)/.test(TERMS));
ok('약관에 디지털 상품 제공 조항이 있다', /제12조 \(디지털 상품의 제공\)/.test(TERMS));
ok('청약철회 기산점을 두 호로 나눴다', /공급을 받거나 공급이 시작된 날/.test(TERMS) && /주소를 알거나 알 수 있었던 날/.test(TERMS));
/* ★ 약관 글은 **두 벌**로 들어간다 — `data-ko-html` 속성과 화면에 박힌 글자.
   한 벌만 보면 **한쪽만 지워도 시험이 통과한다**(깨뜨려 보고 알았다).
   두 벌이 다 있는지 센다 — 사본이 갈리는 것이 이 저장소의 단골 실패다. */
function twice(re, label) {
  const n = (TERMS.match(re) || []).length;
  ok(label, n === 2, '사본 ' + n + '벌 (속성 + 화면이라 2벌이어야 한다)');
}
twice(/시험 사용 상품 등을 제공한 상품에 한하여/g, '제한을 단정하지 않는다 — 두 벌 다');
twice(/3영업일 이내에 대금을 환급/g, '환급 기한이 두 벌 다');
twice(/원하는 것을 선택할 수 있습니다/g, '고르는 쪽이 이용자임이 두 벌 다');
ok('표시·광고와 다르면 3개월·30일', /3개월 이내 또는/.test(TERMS) && /30일 이내/.test(TERMS));
ok('지연배상금 연 15% 를 적는다', /연 100분의 15/.test(TERMS));
ok('약관이 두 언어다', /Article 10 \(Withdrawal of Offer\)/.test(TERMS) && /Article 11 \(Refund\)/.test(TERMS));
ok('제3조 서비스 목록에 디지털 상품 판매가 있다', /디지털 상품\(시장 리포트/.test(TERMS));
ok('부칙이 개정 시행일을 적는다(제4조②의 7일 전 공지)',
   /2026년 11월 20일부터 시행/.test(TERMS) && /시행일 7일 전에 공지/.test(TERMS));

/* 계약 전 고지 — 안내 섹션의 네 칸 */
for (const [label, needle] of [
  ['청약철회 기한과 방법', /data-ko="청약철회 기한과 방법"/],
  ['환불 절차와 시기', /data-ko="환불 절차와 시기"/],
  ['불만·분쟁 처리', /data-ko="불만·분쟁 처리"/],
  ['기술적 사항', /data-ko="파일을 여는 데 필요한 것"/],
]) ok('안내 섹션에 「' + label + '」 칸이 있다', needle.test(SRC));
ok('분쟁 처리에 외부 조정 창구를 적는다', /1372/.test(SRC) && /한국소비자원/.test(SRC));

/* 구매창 — 지급 시기 · 기술적 사항 · 약관 링크 */
ok('구매창이 지급 시기를 말한다', /분할·후불 결제는 없습니다/.test(DP_BUY));
ok('구매창이 여는 데 필요한 것을 보여 준다', /dpPick\(p\.requiresEn, p\.requiresKo\)/.test(DP_BUY));
ok('구매창에 약관 링크가 있다', /href="terms\.html"/.test(DP_BUY));
ok('동의 문구가 어느 조항인지 가리킨다', /제10조·제11조/.test(DP_BUY));
ok('영문 동의 문구도 조항을 가리킨다', /Articles 10-11 of our Terms/.test(DP_BUY));
ok('상품 틀에 기술적 사항 칸이 있다', /requiresKo:/.test(SRC));
/* A-524: 처음에는 `requires` 한 칸이었다. 영어로 보는 손님에게 한국어가 그대로 나왔다. */
ok('기술적 사항도 두 언어다(A-524)',
   /requiresEn:/.test(SRC) && /requiresKo:/.test(SRC));
ok('한 언어짜리 requires 칸이 남아 있지 않다(A-524)',
   !/[^a-zA-Z]requires\s*:/.test(SRC.replace(/requiresEn\s*:/g,'').replace(/requiresKo\s*:/g,'')));
/* 조항이 들어갔으니 「아직 없습니다」 주석이 남아 있으면 안 된다 */
ok('약관에 조항이 없다는 묵은 주석이 사라졌다',
   !/terms\.html` 에는 아직 청약철회·환불 조항이/.test(SRC));

// ── 9) A-523 — 시행 7일 전 공지가 두 언어로 서 있는가 ──────────────────
/* 제4조제2항이 요구하는 공지다. 상단 띠는 `data-lang-only="en"` 이라 한국어
   손님에게 안 보이므로, 약관과 구매 길목 **양쪽에** 붙였다. */
for (const [f, src] of [['terms.html', TERMS], ['digital-products.html', SRC]]) {
  ok(f + ' 에 개정 공지가 있다', /class="terms-amend-notice"/.test(src));
  ok(f + ' 공지가 시행일을 적는다', /2026년 11월 20일/.test(src));
  ok(f + ' 공지가 7일 전 공지임을 밝힌다', /제4조제2항에 따라 시행 7일 전 공지/.test(src));
  ok(f + ' 공지가 바뀐 조항을 짚는다', /제10조\(청약철회 등\)/.test(src));
  ok(f + ' 공지가 거부할 자유를 알린다', /시행일 전에 서비스 이용을 중단/.test(src));
  ok(f + ' 공지가 두 언어다',
     /data-en-html='<strong>Notice of amendment/.test(src) && /data-ko-html='<strong>약관 개정 공지/.test(src));
  ok(f + ' 영문 공지에 한글이 없다',
     !/[가-힣]/.test((src.match(/data-en-html='([^']*)'/) || ['',''])[1]));
}
ok('약관 최종 수정일이 개정일과 같다', /최종 수정일: 2026년 11월 13일/.test(TERMS));

console.log('\n디지털 상품 — 시험 ' + (pass + fail) + '개, 실패 ' + fail + '개');
process.exit(fail ? 1 : 0);
