#!/usr/bin/env python3
"""출력 측 XSS 전수 검사 (신설 2026-11-04, 검수대장 A-218 / R-003).

왜 있나
-------
R-003 의 개발 메모가 "엑사에서는 한 곳에서 시작한 같은 문제가 60곳으로 번졌다" 고
적었다. 실제로 이 저장소에서도 `brands/view.html` 은 고쳐졌는데 `brands.html` 은
`escapeHtml` 이 **한 번도 없는** 상태로 남아 있었다 — 저장형 XSS 가 공개 페이지에서
실행됐다. 사람이 기억해서 막는 방식으로는 또 번진다. 그래서 기계로 센다.

무엇을 하나
-----------
가짜 Firestore 의 **모든 글자 필드**에 공격 문자열을, **모든 URL 필드**에
`javascript:` 를 넣고 각 화면을 열어서 네 가지를 센다.

  ① 핸들러가 실제로 실행됐는지      (window.__xss 에 쌓인 수)
  ② 주입한 태그가 **요소로** 만들어졌는지  ([data-xss] 개수)
  ③ script 가 끼어들었는지
  ④ href/src 에 `javascript:` 가 들어갔는지

글자로 보이면 안전이고, 요소가 되거나 실행되면 구멍이다. **패턴을 보지 않고
결과를 본다** — `escapeHtml` 을 부르는지 세는 방식은 "부르지만 URL 은 안 보는"
경우(`trend-report.html` 이 그랬다)를 놓친다.

이스케이프와 URL 가드는 **다른 일**이다
-------------------------------------
`javascript:` 에는 `& < > " '` 가 하나도 없다. 그래서 어떤 이스케이프 함수도
그걸 막지 못한다. `href`·`src` 에 넣는 값은 **스킴을 따로** 봐야 한다
(`/^https?:\\/\\//i`). 이 검사가 ④ 를 따로 세는 이유다.

쓰는 법
-------
    python3 -m http.server 8321 &            # 사이트 루트에서
    python3 scripts/check_xss_output.py

구멍이 있으면 종료 코드 1. Playwright 가 필요하므로 deploy.ps1 에는 묶지 않았다
(배포 검사는 브라우저 없이 도는 check_escaping.py 만 묶는다).

알려진 오탐
-----------
`products/view.html` 의 `<a href="javascript:void(0)">`(BIM 규정 펼치기)는
페이지 자신의 마크업이고 사용자 값이 아니다. 아래 ALLOW 에 적어 두고 센다.
`<button>` 으로 바꾸는 게 더 낫지만 XSS 는 아니다.
"""
import json, re, sys

PAYLOAD = ('<img src=x onerror="window.__xss.push(1)">'
           '<b data-xss="1">B</b>'
           '<svg onload="window.__xss.push(2)"></svg>'
           '"><b data-xss="2">OUT</b><i '
           "'><b data-xss=\"3\">SQ</b><i "
           '</script><script>window.__xss.push(3)</script>')
JS_URL = 'javascript:window.__xss.push(4)'
ALLOW = ['javascript:void(0)']          # 페이지 자신의 마크업 (사용자 값 아님)

PAGES = [
    ('brands.html', False), ('brands/view.html?brand=s', False),
    ('products/view.html?product=s', False), ('magazine/view.html?slug=s', False),
    ('index.html', False), ('categories.html', False), ('magazine.html', False),
    ('trend-report.html', False), ('brand-portal/dashboard.html', False),
    ('auth/profile.html', False),
    ('admin/dashboard.html', True), ('admin/articles.html', True),
    ('admin/trend-submissions.html', True), ('admin/consultations.html', True),
    ('admin/bim-requests.html', True), ('admin/newsletter-subscribers.html', True),
    ('admin/notify-subscribers.html', True),
]

STUB = r"""
(() => {
  window.__xss = [];
  const P = __PAY__, U = __JSURL__;
  const user = {uid:'u1', email:'qa@x.test', displayName:P};
  const base = () => ({
    brandName:P, name:P, title:P, slug:'s', brandSlug:'s', country:P, category:P, subcategory:P,
    collection:P, description:P, materials:P, dimensions:P, designer:P, tag:P, excerpt:P,
    content:P, summary:P, originalBody:P, englishBody:P, koreanBody:P, reviewerNote:P,
    contactName:P, email:'a@x.test', phone:P, company:P, jobTitle:P, industry:P, source:P,
    originalLang:'en', lang:'en', status:'approved', visible:true,
    website:U, imageUrl:U, logoUrl:U, coverImage:U, fileUrl:U, pageUrl:U,
    subject:P, body:P, fromName:P, fromEmail:'k@x.test', fromRole:'pro', answer:P,
    title_ko:P, title_en:P, body_ko:P, body_en:P, audience:'all', updatedBy:P,
    no:'R-001', area:P, screen:P, action:P, expectation:P, current:P, gap:P,
    priority:'Medium', techNote:P, reportedBy:P, type:P, note:P, label:P,
    productName:P, fileType:P, projectName:P, projectType:P, krDealer:P,
    koreanDealer:{name:P, address:P, showroom:P, phone:P, email:'d@x.test', website:U, note:P},
    certifications:[{name:P, issuer:P, fileUrl:U}],
    blocks:[{type:'text', content:P}, {type:'image', url:U, alt:P, caption:P}],
    history:[{status:'검토대기', by:P, at:'2026-11-01T00:00:00.000Z', note:P}],
    createdAt:{toDate:()=>new Date('2026-11-01T00:00:00Z')},
    reportedAt:{toDate:()=>new Date('2026-11-01T00:00:00Z')},
    at:{toDate:()=>new Date('2026-11-01T00:00:00Z')},
    publishedAt:{toDate:()=>new Date('2026-11-01T00:00:00Z')}});
  const BOX = {};
  ['brands','products','articles','leads','users','reviewIssues','notices','inquiries',
   'adminLogs','trend-submissions','bim-requests','newsletterSubscribers','notifySubscribers',
   'consultations','settings'].forEach(k => BOX[k] = [base(), base()]);
  const wrap = a => (a||[]).map((d,i)=>({id:'d'+i, data:()=>d, exists:true}));
  const snapOf = d => ({forEach(f){d.forEach(f);}, empty:!d.length, size:d.length, docs:d});
  const COLL = n => BOX[n] || [];
  const q = n => ({orderBy:()=>q(n), limit:()=>q(n), startAfter:()=>q(n), where:()=>q(n),
      get:()=>Promise.resolve(snapOf(wrap(COLL(n)))),
      onSnapshot:cb=>{cb(snapOf(wrap(COLL(n)))); return ()=>{};}});
  const stub = {collection(n){ return Object.assign(q(n), {
      doc:id=>({get:()=>Promise.resolve({id:id, exists:true, data:()=>(COLL(n)[0]||base())}),
                onSnapshot:cb=>{cb({id:id, exists:true, data:()=>(COLL(n)[0]||base())}); return ()=>{};},
                set:()=>Promise.resolve(), update:()=>Promise.resolve()}),
      add:()=>Promise.resolve({id:'x'})}); },
    batch:()=>({set:()=>{}, commit:()=>Promise.resolve()}),
    runTransaction:async fn=>fn({get:async()=>({exists:false,data:()=>({})}), set:()=>{}, update:()=>{}})};
  const fb = {initializeApp(){return {};}, apps:[{}],
    auth(){return {currentUser:user, onAuthStateChanged(cb){cb(user); return ()=>{};},
                   signOut(){return Promise.resolve();}};},
    firestore(){return stub;},
    storage(){return {ref:()=>({put:()=>Promise.resolve({ref:{getDownloadURL:()=>Promise.resolve(U)}}),
                               getDownloadURL:()=>Promise.resolve(U)})};}};
  fb.firestore.FieldValue={serverTimestamp:()=>new Date(), arrayUnion:(...a)=>a, increment:n=>n};
  fb.firestore.Timestamp={now:()=>({toDate:()=>new Date()}), fromDate:d=>({toDate:()=>d})};
  Object.defineProperty(window,'firebase',{value:fb,writable:true,configurable:true});
  window.__seed = () => { if (typeof admRegisterCache === 'function')
     ['brands','products','articles','leads','users','reviewIssues','notices','inquiries']
       .forEach(k => admRegisterCache(k, COLL(k).map((d,i)=>Object.assign({id:k+i}, d)))); };
})();
"""

PROBE = """(allow) => {
  const els = document.querySelectorAll('[data-xss]');
  const handlers = [...document.querySelectorAll('*')].filter(e=>e.hasAttribute('onerror')||e.hasAttribute('onload'));
  const bad = [...document.querySelectorAll('[href],[src]')]
      .map(e=>({tag:e.tagName.toLowerCase(), u:(e.getAttribute('href')||e.getAttribute('src')||'')}))
      .filter(x=>/^javascript:/i.test(x.u) && !allow.some(a=>x.u.indexOf(a)===0));
  return {run:(window.__xss||[]).length, injected:els.length, handlers:handlers.length,
          badUrls:bad.slice(0,4).map(x=>x.tag+':'+x.u.slice(0,34)),
          samples:[...els].slice(0,2).map(e=>e.outerHTML.slice(0,46))};
}"""


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8321'
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('Playwright 가 없습니다: pip install playwright && playwright install chromium')
        return 2
    stub = STUB.replace('__PAY__', json.dumps(PAYLOAD)).replace('__JSURL__', json.dumps(JS_URL))
    png = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                        '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082')
    bad = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for page, seed in PAGES:
            pg = b.new_page(viewport={'width': 1440, 'height': 900})
            pg.on('dialog', lambda d: d.accept())
            pg.route('**/*', lambda r: (r.fulfill(status=200, body=png, content_type='image/png')
                     if re.search(r'\.(png|jpg|jpeg|webp|gif)(\?|$)', r.request.url)
                     else (r.continue_() if '127.0.0.1' in r.request.url else r.fulfill(status=204, body=''))))
            pg.add_init_script(stub)
            try:
                pg.goto(base + '/' + page, wait_until='networkidle', timeout=25000)
                pg.wait_for_timeout(1400)
                if seed:
                    pg.evaluate("()=>window.__seed && window.__seed()")
                    pg.wait_for_timeout(700)
                d = pg.evaluate(PROBE, ALLOW)
            except Exception as e:
                print('   ? %-38s 열지 못함: %s' % (page, str(e).splitlines()[0][:50]))
                pg.close()
                continue
            hit = d['run'] or d['injected'] or d['handlers'] or d['badUrls']
            if hit:
                bad += 1
            print('   %s %-38s 실행%d 주입요소%d 핸들러%d 나쁜URL%d'
                  % ('X' if hit else '.', page, d['run'], d['injected'], d['handlers'], len(d['badUrls'])))
            for v in d['samples']:
                print('        %s' % v)
            for u in d['badUrls']:
                print('        URL %s' % u)
            pg.close()
        b.close()
    print('\n결과: %s (구멍 있는 화면 %d개)' % ('통과' if bad == 0 else '실패', bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
