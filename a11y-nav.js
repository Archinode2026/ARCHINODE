/* ═══════════════════════════════════════════════════════════════════════════
   a11y-nav.js — 머리글 길잡이를 키보드로도 쓸 수 있게 (A-513, 브론즈 35차 N35-1·N35-3)

   왜 있는가
   ─────────
   390px 에서 「Menu」 단추를 눌러 모바일 메뉴를 열고 Tab 을 20번 눌러도
   **메뉴 안에 들어가는 정거장이 하나도 없었다.** 까닭은 생김새가 아니라
   **차례**다 — `<nav id="mainNav">` 가 `.mobile-toggle` 단추보다 **앞**에 있어서,
   단추에서 Tab 을 누르면 메뉴를 지나쳐 바깥으로 나간다. 뒤로(Shift+Tab) 가면
   닿지만 그것을 아는 사람은 없다. **열리기는 하는데 쓸 수가 없다.**

   markup 차례를 바꾸면 233쪽의 머리글 배치가 흔들린다. 그래서 **열린 순간
   초점을 메뉴 안으로 옮기고, 닫힐 때까지 Tab 을 안에 가둔다.**

   그리고 `toggleMobile()` 은 **243쪽에 각각 인라인으로** 적혀 있다. 그 243벌을
   고치는 대신 **`active` 종류가 붙고 떨어지는 것을 지켜본다**(MutationObserver).
   누가 어떻게 열든 같은 약속이 선다.

   ※ 검색 가리개는 제 가둠이 `search.js` 에 따로 있다 — 둘이 싸우지 않도록
     가리개가 열려 있으면 이쪽은 손을 뗀다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function focusablesIn(root) {
    var out = [];
    var list = root.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) out.push(list[i]);
    return out;
  }

  function searchOpen() {
    var o = document.getElementById('searchOverlay');
    return !!(o && o.classList.contains('active'));
  }

  function init() {
    /* ── 1) 본문 표지 ────────────────────────────────────────────────────
       A-513 때는 건너뛰기 링크가 닿는 자리가 속이 빈 `<div tabindex="-1">` 이라
       읽어 주는 도구에게 아무것도 아니었다. 그래서 markup 을 바꾸지 않고
       표지(role="main")만 붙였다.

       A-606(2026-11-18): 그 표지가 **빈 채로** 붙어 있었던 것이 문제였다 —
       건너뛰기로 들어오면 아무것도 없는 자리에 떨어지고, 진짜 본문은 어느
       구역에도 속하지 않았다(실측: 본문 안 글자 0자, 어느 구역에도 안 든
       머리글이 매거진 134개). 227쪽을 진짜 `<main>` 이 본문을 감싸도록 바꿨다.

       그래서 여기서 할 일은 **남은 쪽을 위한 뒷배**뿐이다.
       ★ 쪽에 이미 진짜 `<main>` 이 있으면 손대지 않는다 — 안 그러면 본문 구역이
         둘이 된다(privacy-en.html 에서 실제로 그랬다. 규격상 한 쪽에 하나다). */
    if (!document.querySelector('main')) {
      var main = document.getElementById('main');
      if (main && main.tagName !== 'MAIN' && !main.getAttribute('role')) {
        main.setAttribute('role', 'main');
      }
    }

    var nav = document.getElementById('mainNav');
    var toggle = document.querySelector('.mobile-toggle');
    if (!nav || !toggle) return;

    if (!toggle.getAttribute('aria-controls')) toggle.setAttribute('aria-controls', 'mainNav');
    toggle.setAttribute('aria-expanded', nav.classList.contains('active') ? 'true' : 'false');

    var trapped = false;

    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = focusablesIn(nav);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      /* 단추 자신도 고리 안에 둔다 — 안에서 밖으로 나가는 유일한 길이
         「닫기」여야 하는데, 그 닫기 단추가 메뉴 **밖**에 있기 때문이다. */
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); toggle.focus(); }
        else if (document.activeElement === toggle) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); toggle.focus(); }
        else if (document.activeElement === toggle) { e.preventDefault(); first.focus(); }
      }
    }

    var prevOverflow = '';

    function opened() {
      if (trapped) return;
      trapped = true;
      toggle.setAttribute('aria-expanded', 'true');
      nav.setAttribute('role', 'dialog');
      nav.setAttribute('aria-modal', 'true');
      /* A-565(브론즈 40차): `aria-modal="true"` 라고 알리면서 **뒤 쪽은 그대로
         스크롤**됐다. 읽어 주는 도구에는 「뒤는 없는 셈 치라」고 해 놓고 실제로는
         살아 있었던 셈이다 — 알린 것과 사실이 달랐다. Tab 은 이미 가두고 있고
         Esc 도 닫히니, 남은 한 가지를 맞춘다. 되돌릴 값을 적어 뒀다가 닫을 때
         그대로 돌려준다(빈 문자열로 덮으면 쪽이 정한 값을 지운다). */
      if (document.body) {
        prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      var items = focusablesIn(nav);
      if (items.length) { try { items[0].focus(); } catch (e) {} }
      document.addEventListener('keydown', onKey, true);
    }

    function closed() {
      if (!trapped) return;
      trapped = false;
      toggle.setAttribute('aria-expanded', 'false');
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      if (document.body) document.body.style.overflow = prevOverflow;   // A-565
      document.removeEventListener('keydown', onKey, true);
      /* 초점이 아직 메뉴 안에 있으면 단추로 돌려준다 — 메뉴가 사라진 자리에
         초점을 두고 가면 다음 Tab 이 어디로 갈지 아무도 모른다. */
      if (nav.contains(document.activeElement)) { try { toggle.focus(); } catch (e) {} }
    }

    function sync() {
      if (searchOpen()) return;              // 가리개가 열려 있으면 손을 뗀다
      if (nav.classList.contains('active')) opened(); else closed();
    }

    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
    } else {
      /* 아주 오래된 브라우저 — 지켜볼 수 없으면 단추 누름으로 갈음한다 */
      toggle.addEventListener('click', function () { setTimeout(sync, 0); });
    }
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ═════════════════════════════════════════════════════════════════════════
     A-603(2026-11-18, 브론즈 44차 3번): 「맨 위로」가 **움직임 줄이기 설정을
     무시**했다.

     CSS 는 제대로 되어 있다 — reduce 에서 `scroll-behavior` 가 smooth → auto 로
     바뀌는 것을 실측했다. 그런데 단추가 `onclick="window.scrollTo({top:0,
     behavior:'smooth'})"` 로 **JS 안에 smooth 를 박아** 두었고, JS 의 behavior 는
     CSS 의 scroll-behavior 를 **이긴다.** 그래서 설정을 켜도 화면 전체가 1.5초
     동안 8,216px 을 흘러 올라갔다(실측: 설정 끔 1,474ms / 켬 1,473ms — 차이 1ms).

     어지럼·편두통 때문에 그 설정을 켠 손님에게 **사이트에서 가장 큰 움직임**이
     그대로 남은 것이다. 다른 움직임은 다 멈추는데 이것만 안 멈췄다
     (히어로 자동 넘김 0회, 전환 0.7초→0.000001초 — 둘 다 정상).

     같은 자리가 228쪽에 복사돼 있으니 쪽마다 고치지 않고 여기 한 곳에 둔다.
     ═════════════════════════════════════════════════════════════════════════ */
  /* ── A-629 (브론즈 47차 N47-2): 햄버거 메뉴 패널의 높이 예산 ─────────────────
   패널은 `position:absolute; top:100%` 로 **붙어 있는 머리글에 매달려** 있다.
   그래서 쪽을 아무리 굴려도 패널은 제자리이고, 패널이 화면보다 길면 아래쪽
   메뉴는 **영원히 못 누른다**(브론즈 실측 375x667: 16개 중 3개 — 「자재 소싱
   문의」·「브랜드 입점」이 그 안에 있다. 320x568 에서는 8개).
   패널에 스스로 굴러갈 높이를 주려면 머리글 높이를 알아야 한다. CSS 의
   --header-height 는 고정값(64px)이고 좁은 폭에서 머리글은 줄바꿈으로 자라므로
   (style.css:355 `height:auto`), **실제로 재서** 넘긴다. */
var _archiHdrLast = -1, _archiHdrQueued = false;

function archiSyncHeaderHeight() {
  try {
    var h = document.querySelector('header');
    if (!h) return;
    /* ★ 높이가 아니라 **아래끝**을 넘긴다. 머리글 위에 공지 띠가 있을 수 있고
       (`.announcement-bar`, 영어일 때만 보인다), 그 띠가 보이는 동안 패널의 윗변은
       머리글 높이보다 아래에 있다. 처음에 높이로 잡았더니 360x640 에서 패널이
       화면 아래로 80px 넘쳤다(실측: 패널 윗변 196, 머리글 높이 116).
       쪽을 굴리면 띠가 올라가고 머리글이 붙으므로 값이 바뀐다 — 그래서 스크롤에도
       따라온다. */
    var px = Math.round(h.getBoundingClientRect().bottom);
    if (px < 0) px = 0;
    if (px === _archiHdrLast) return;          // 값이 같으면 건드리지 않는다
    _archiHdrLast = px;
    document.documentElement.style.setProperty('--hdr-h', px + 'px');
  } catch (e) {}
}

/* 스크롤마다 쓰면 배치가 흔들린다 — 한 프레임에 한 번으로 모은다 */
function archiQueueHeaderSync() {
  if (_archiHdrQueued) return;
  _archiHdrQueued = true;
  var run = function () { _archiHdrQueued = false; archiSyncHeaderHeight(); };
  if (window.requestAnimationFrame) window.requestAnimationFrame(run);
  else setTimeout(run, 16);
}
window.archiSyncHeaderHeight = archiSyncHeaderHeight;

/* 이 파일은 <head> 에서 실리므로 그 시점에는 <header> 가 아직 없다 — 준비된 뒤에 잰다. */
function archiStartHeaderWatch() {
  /* 이 파일은 브라우저 밖에서도 불린다 — tools/test-a11y-nav.js 가 가짜 window 로
     돌린다(그 window 에는 addEventListener 가 없다). 그래서 쓰기 전에 있는지 본다. */
  try {
    archiSyncHeaderHeight();
    if (window.addEventListener) {
      window.addEventListener('resize', archiQueueHeaderSync);
      window.addEventListener('scroll', archiQueueHeaderSync, { passive: true });
    }
    if (window.ResizeObserver) {
      var hdr = document.querySelector('header');
      if (hdr) new ResizeObserver(archiSyncHeaderHeight).observe(hdr);
    }
    /* 언어를 바꾸면 라벨 길이가 달라져 머리글이 줄바꿈될 수 있다 */
    if (document.addEventListener) {
      document.addEventListener('archinode:lang', archiSyncHeaderHeight);
    }
    /* 글꼴이 늦게 오면 머리글 높이가 바뀐다 */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(archiSyncHeaderHeight).catch(function () {});
    }
    archiWatchMenuForBanner();
  } catch (e) {}
}
if (document.readyState === 'loading' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', archiStartHeaderWatch);
} else {
  archiStartHeaderWatch();
}

/* ── A-637 (브론즈 48차 N48-6): 메뉴를 연 동안 쿠키 고지를 **만질 수 없게** 한다 ──
   층 규약대로 메뉴 패널이 고지 위에 오면서, 패널이 불투명해 고지가 보이지 않는다.
   그런데 고지는 role="dialog" 로 뜨면서 **「모두 수락」에 초점을 둔다**(A-097).
   그 상태에서 Enter 를 누르면 **안 보이는 단추로 전체 동의가 들어간다** —
   브론즈 실측 390x844: 「모두 수락」 자리의 맨 위가 #mainNav, 「필수만」 자리는 메뉴 링크.
   손님이 고르지 않은 동의가 저장되는 것은 N48-1 과 같은 결의 사고다.
   메뉴가 열려 있는 동안만 고지를 inert 로 둔다(닫으면 그대로 돌아온다).
   inert 를 모르는 브라우저에서는 aria-hidden 과 tabindex 로 갈음한다. */
function archiSyncBannerInert() {
  try {
    var nav = document.getElementById('mainNav') || document.querySelector('.main-nav');
    var ban = document.getElementById('archi-cookie-banner');
    if (!ban) return;
    var menuOpen = !!(nav && nav.classList && nav.classList.contains('active'));
    if (menuOpen) {
      if ('inert' in ban) ban.inert = true;
      else {
        ban.setAttribute('aria-hidden', 'true');
        var f = ban.querySelectorAll('a, button');
        for (var i = 0; i < f.length; i++) f[i].setAttribute('tabindex', '-1');
      }
    } else {
      if ('inert' in ban) ban.inert = false;
      ban.removeAttribute('aria-hidden');
      var g = ban.querySelectorAll('a, button');
      for (var j = 0; j < g.length; j++) g[j].removeAttribute('tabindex');
    }
  } catch (e) {}
}
window.archiSyncBannerInert = archiSyncBannerInert;

function archiWatchMenuForBanner() {
  try {
    var nav = document.getElementById('mainNav') || document.querySelector('.main-nav');
    if (!nav || !window.MutationObserver) return;
    new MutationObserver(archiSyncBannerInert).observe(nav, { attributes: true, attributeFilter: ['class'] });
    /* 고지는 메뉴보다 늦게 들어올 수 있다 — 들어온 뒤 한 번 맞춘다 */
    [0, 300, 1000].forEach(function (ms) { setTimeout(archiSyncBannerInert, ms); });
  } catch (e) {}
}

function archiReduceMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  /* 가로 레일처럼 위 두 helper 로 감쌀 수 없는 자리를 위해 판단만 내놓는다. */
  window.archiReduceMotion = archiReduceMotion;

  window.archiScrollTop = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
      window.scrollTo({ top: 0, behavior: archiReduceMotion() ? 'auto' : 'smooth' });
    } catch (err) {
      window.scrollTo(0, 0);   // 옛 브라우저
    }
  };

  /* 폼 오류·접수 안내로 끌어올리는 자리에도 같은 판단이 필요하다. */
  window.archiScrollIntoView = function (el, opts) {
    if (!el || !el.scrollIntoView) return;
    var o = opts || {};
    try {
      el.scrollIntoView({ behavior: archiReduceMotion() ? 'auto' : 'smooth',
                          block: o.block || 'center' });
    } catch (err) {
      el.scrollIntoView();
    }
  };
})();
