/* ARCHINODE Cookie Consent Banner (P3-2)
   경량 쿠키 동의 배너. GDPR 최소 준수:
   - 방문 시 배너 표시 (localStorage에 결정 저장 안 된 상태)
   - "Accept All", "Necessary Only", "Learn more" 3버튼 (A-448: 전에는 "Manage" 였는데
     쿠키 설정 UI 가 없으므로 없는 기능을 약속하는 말이었다)
   - 결정 후 재방문 시 표시 안 함
   - Analytics·Marketing 쿠키는 Accept All 선택 시만 로드 (window.__cookieConsent.analytics)
*/
(function(){
  var KEY = 'archinode-cookie-consent';
  var SAVED = null;
  try { SAVED = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){}

  window.__cookieConsent = SAVED || { necessary: true, analytics: false, marketing: false };

  function saveConsent(c){
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch(e){}
    window.__cookieConsent = c;
    document.dispatchEvent(new CustomEvent('archinode:consent', { detail: c }));
    var banner = document.getElementById('archi-cookie-banner');
    if (banner) banner.parentNode.removeChild(banner);
    // A-435: 「맨 위로」를 제자리로 되돌린다
    document.documentElement.classList.remove('has-cookie-banner');
    document.documentElement.style.removeProperty('--cc-h');
  }

  function showBanner(){
    if (SAVED) return; // 이미 결정한 사용자는 안 보임
    var lang = document.documentElement.lang || 'en';
    var isKo = lang === 'ko';
    var wrap = document.createElement('div');
    wrap.id = 'archi-cookie-banner';
    // R-007: 두 단추가 390px 에서 높이 38px 이라 손가락 기준(44px)에 못 미쳤다 — min-height 로 올린다.
    wrap.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;background:#332e27;color:#fff;padding:20px 24px;border-radius:10px;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:720px;margin:0 auto;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;';
    /* A-437(2026-11-09): **배너가 영어로 떴다 — 한국 손님이 처음 보는 화면이다.**
       브론즈 26차가 손님 origin(넷리파이 미리보기) 네 페이지에서 전부 영어를 봤다.
       그 순간 `lang="ko"` · 저장값 `ko` · 머리띠는 「로그인」 한국어였는데 배너만 영어였다.

       기제: 바로 위 `var isKo = lang === 'ko'` 가 **배너를 만드는 순간 한 번 읽고 굳는다.**
       이 파일은 `defer` 라 파싱이 끝나자마자 돌고, `lang.js` 의 칠하기는 `DOMContentLoaded`
       에서 돈다 — **배너가 먼저 만들어진다.** 게다가 배너 안에 `data-ko` 가 **0개**여서
       나중에 칠할 방법조차 없었다. **순서에 기댄 경주**였고, 캐시 없는 첫 방문에서 진다.

       ★ A-419(profile) → A-434(머리띠) 에 이은 **세 번째**이고 가장 나쁘다 —
         앞의 둘은 짝이 있어서 「부르기만 하면」 됐는데 여기는 **짝 자체가 없었다.**
       고치는 법은 같다: **두 언어를 속성에 심고**, 넣은 뒤 다시 칠한다.
       그러면 순서가 어떻든, 나중에 언어를 바꾸든 따라온다. 범위 231 페이지. */
    function bi(en, ko, tag, attrs) {
      return '<' + (tag || 'span') + ' data-en="' + en.replace(/"/g, '&quot;') + '"' +
             ' data-ko="' + ko.replace(/"/g, '&quot;') + '"' + (attrs ? ' ' + attrs : '') + '>' +
             (isKo ? ko : en) + '</' + (tag || 'span') + '>';
    }
    var LINK = 'class="cc-inline" style="color:#c9a36a;text-decoration:underline;"';
    /* 분석 도구가 실제로 켜져 있나. 못 보면(로더가 안 실린 페이지) **꺼진 것으로 본다** —
       모르면서 「쓴다」고 말하지 않는다. */
    var ccAnalyticsOn = !!(window.__archinodeAnalytics && window.__archinodeAnalytics.enabled);
    wrap.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        bi('We use cookies', '쿠키 사용에 대한 안내', 'h3',
           'style="font-size:0.95rem;font-weight:700;margin:0;color:#c9a36a;"') +
        '<p style="font-size:0.82rem;line-height:1.5;margin:0;color:#ccc;">' +
          /* A-496(2026-11-12, 브론즈 32차 ①): 전에는 언제나 「분석용 쿠키를 사용합니다」라고
             말했다. 그런데 분석 도구가 아직 꽂혀 있지 않아 **아무것도 로드되지 않는다** —
             A-448 과 같은 종류의 거짓말이다(그때는 없는 「설정」 화면을 약속했다).
             analytics-loader.js 가 밝히는 상태를 보고 말을 고른다. */
          (ccAnalyticsOn
            ? bi('ARCHINODE uses necessary cookies for the site to work and analytics cookies to improve it. See our ',
                 'ARCHINODE는 사이트 작동에 필요한 쿠키와 사용 분석용 쿠키를 사용합니다. ')
            : bi('ARCHINODE currently uses only the cookies needed for the site to work. If we add analytics cookies later, the choice you make here applies to them. See our ',
                 'ARCHINODE는 현재 사이트 작동에 필요한 쿠키만 사용합니다. 나중에 분석용 쿠키를 추가하면 여기서 하신 선택이 그대로 적용됩니다. ')) +
          '<a href="/privacy.html" ' + LINK + ' data-en="Privacy Policy" data-ko="개인정보 처리방침">' +
            (isKo ? '개인정보 처리방침' : 'Privacy Policy') + '</a>' +
          bi('. Choose your preference below.', '을 확인하시고 선택해주세요.') +
        '</p>' +
        '<div class="cc-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">' +
          bi('Accept All', '모두 수락', 'button',
             'id="cc-accept" style="background:#c9a36a;color:#332e27;border:none;padding:10px 18px;' +
             'font-size:0.82rem;font-weight:700;border-radius:6px;cursor:pointer;font-family:inherit;min-height:44px;"') +
          bi('Necessary Only', '필수만', 'button',
             'id="cc-necessary" style="background:transparent;color:#fff;border:1px solid #6b6459;padding:10px 18px;' +
             'font-size:0.82rem;font-weight:600;border-radius:6px;cursor:pointer;font-family:inherit;min-height:44px;"') +
          /* A-448(2026-11-10): 영어 라벨이 "Manage / Learn more" 였는데 이 링크는
             설정 화면이 아니라 **개인정보 처리방침 문서**로 간다. "Manage" 는
             **없는 기능을 약속하는 말**이다(쿠키 설정 UI 가 없다). 한국어는 처음부터
             「자세히」였으니 영어만 거짓을 말하고 있었다. 문서로 간다는 뜻대로 적는다.
             덤: 영어 배너가 KO 222px 대 EN 294px 로 72px 더 높아 단추가 두 줄이 됐는데,
             라벨이 짧아지면서 그것도 줄어든다. (브론즈 27차 12번) */
          '<a href="/privacy.html" class="cc-more" data-en="Learn more" data-ko="자세히"' +
            ' style="font-size:0.76rem;color:#b5ab9b;text-decoration:none;display:inline-flex;' +
            'align-items:center;min-height:44px;padding:0 6px;">' +
            (isKo ? '자세히' : 'Learn more') + '</a>' +
        '</div>' +
      '</div>';

    // A-097: 접근성 — 배너를 dialog 역할로 선언하고, 뜨자마자 "모두 수락" 버튼에 초점을 둬
    // 키보드 사용자가 76번 Tab을 눌러야 닿던 문제를 해결한다. (dialog는 non-modal이라
    // 포커스 트랩은 두지 않음 — 사용자가 원하면 Shift+Tab 또는 Tab으로 페이지로 돌아갈 수 있음.)
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'false');
    wrap.setAttribute('aria-labelledby', 'archi-cookie-title');
    var titleEl = wrap.querySelector('h3');
    if (titleEl) titleEl.id = 'archi-cookie-title';

    /* A-435(2026-11-09): 배너가 `.scroll-top` 을 통째로 덮고 있었다.
       브론즈 25차 실측 — 배너(y633~828)가 「맨 위로」(316,716,44,44)를 가려
       **첫 방문자는 그 단추를 누를 수 없다.** 하필 A-411 에서 넷리파이 배지를
       피하려고 올린 84px 자리가 배너 한가운데다. 한 가림을 피해 올린 자리가
       **다른 가림의 한복판**이었다 — 고정 요소가 셋(배지·배너·맨 위로)이면
       둘만 보고 자리를 정할 수 없다.
       배너 높이는 글자 길이·화면 폭에 따라 달라지므로 **실제 높이를 재서** 넘긴다. */
    if (!document.getElementById('cc-space-style')) {
      var st = document.createElement('style');
      st.id = 'cc-space-style';
      st.textContent =
        'html.has-cookie-banner body .scroll-top{bottom:calc(var(--cc-h,0px) + 28px);}' +
        /* 본문 안내문의 링크도 손가락 기준으로 — 배너 문단엔 다른 링크가 없어
           띠가 이웃 줄로 번져도 탭을 뺏지 않는다(A-421 과 같은 판단). */
        /* A-437: 「자세히」가 넷리파이 배지와 세로 27px 겹쳐 3/7 이었다(브론즈 26차).
           **왼쪽으로는 못 피한다** — 배지를 비키려면 x<148 인데 「필수만」이 x208 까지 쓴다.
           한 줄에 셋이면 세 번째는 반드시 걸린다. 그래서 **줄 자체를 올린다.** */
        '@media (max-width:760px){#archi-cookie-banner{padding-bottom:47px !important;}}' +
        '#archi-cookie-banner .cc-inline{position:relative;}' +
        '#archi-cookie-banner .cc-inline::after{content:"";position:absolute;left:0;right:0;' +
        'top:50%;height:44px;transform:translateY(-50%);}';
      document.head.appendChild(st);
    }

    document.body.appendChild(wrap);

    function ccSyncSpace() {
      var h = wrap.offsetHeight || 0;
      document.documentElement.style.setProperty('--cc-h', h + 'px');
      document.documentElement.classList.add('has-cookie-banner');
    }
    // A-437: 넣은 직후 현재 언어로 다시 칠한다. lang.js 가 아직 안 돌았으면
    // 위에서 박은 글자가 그대로 쓰이고, 나중에 돌 때 data-* 를 보고 따라온다.
    if (window.applyLangAgain) { try { window.applyLangAgain(); } catch (e) {} }
    ccSyncSpace();
    window.addEventListener('resize', ccSyncSpace);
    if (window.ResizeObserver) { try { new ResizeObserver(ccSyncSpace).observe(wrap); } catch (e) {} }

    var acceptBtn = document.getElementById('cc-accept');
    acceptBtn.onclick = function(){
      saveConsent({ necessary: true, analytics: true, marketing: true, at: new Date().toISOString() });
    };
    document.getElementById('cc-necessary').onclick = function(){
      saveConsent({ necessary: true, analytics: false, marketing: false, at: new Date().toISOString() });
    };
    // 포커스 이동(스크롤 방지)
    try { acceptBtn.focus({ preventScroll: true }); } catch(e) { acceptBtn.focus(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
