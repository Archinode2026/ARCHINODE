/* ══════════════════════════════════════════════════════════════════════════
   articles-lang.js — 기사를 "보는 사람 언어"로 고르는 한 곳 (A-259 / R-063)

   왜 필요한가
     기사는 브랜드가 쓴 언어 하나로만 저장돼 왔다(`lang` 이 그 언어다). 그래서
     한국어로 보고 있어도 영문 기사는 영문 그대로 나왔다. 이제 기사 문서가 반대편
     언어판을 함께 들고 있을 수 있고, 화면은 보는 사람 언어에 맞는 쪽을 고른다.

   문서 구조
     lang                         원문 언어 'en' | 'ko'  (없으면 'en' 으로 본다)
     title, excerpt, blocks[]     원문 — 위 lang 의 언어
     koTitle, koExcerpt, koBlocks[]   한국어판 (원문이 영어일 때 붙는다)
     enTitle, enExcerpt, enBlocks[]   영어판   (원문이 한국어일 때 붙는다)
     translatedBy                 'auto' | 'editor' | 'brand'  — 누가 만든 번역인지

     원문 쪽은 접두사 없는 자리에 그대로 둔다. 그래야 옛 기사(번역판이 없는 것)와
     어드민·브랜드 포털(원문을 봐야 하는 곳)이 손대지 않고도 지금처럼 돈다.

   고르는 규칙
     1. 보는 언어 = 원문 언어  → 원문
     2. 반대편 언어판이 있다   → 그쪽
     3. 없다                   → 원문을 주되 fellBack=true 로 알린다.
                                 화면은 그 표시를 보고 "원문은 영어입니다" 같은
                                 한 줄을 띄운다 — 말없이 다른 언어를 내밀면
                                 읽는 사람은 번역이 깨진 줄 안다.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function norm(l) { return l === 'ko' ? 'ko' : 'en'; }

  // 지금 화면 언어. lang.js 가 아직 안 돌았을 수도 있어 documentElement 로도 본다.
  window.artViewLang = function () {
    if (typeof window.archinodeLang === 'function') {
      try { return norm(window.archinodeLang()); } catch (e) { /* 넘어감 */ }
    }
    return norm(document.documentElement.lang);
  };

  function hasSide(a, p) {
    if (!a) return false;
    var b = a[p + 'Blocks'];
    return !!(a[p + 'Title'] || (Array.isArray(b) && b.length > 0));
  }

  /* 기사 한 건을 보는 언어로 고른다.
     want 를 주지 않으면 지금 화면 언어를 쓴다. */
  window.artSide = function (a, want) {
    a = a || {};
    var orig = norm(a.lang);
    want = want ? norm(want) : window.artViewLang();

    var base = {
      title:   a.title || '',
      excerpt: a.excerpt || '',
      blocks:  Array.isArray(a.blocks) ? a.blocks : [],
      content: a.content || '',          // 옛 스키마 폴백 (blocks 이전)
      lang:    orig,
      translated: false,
      fellBack: false
    };

    if (want === orig) return base;

    if (hasSide(a, want)) {
      var b = a[want + 'Blocks'];
      return {
        title:   a[want + 'Title'] || base.title,
        excerpt: a[want + 'Excerpt'] || base.excerpt,
        blocks:  (Array.isArray(b) && b.length) ? b : base.blocks,
        content: '',                     // 번역판은 blocks 로만 들어온다
        lang:    want,
        translated: true,
        translatedBy: a.translatedBy || 'auto',
        fellBack: false
      };
    }

    base.fellBack = true;                // 원문을 내주지만, 원한 언어가 아니다
    base.wanted = want;
    return base;
  };

  /* 원문만 있을 때 띄울 한 줄. 양쪽 말을 다 돌려준다 —
     화면에 박는 쪽에서 data-en/data-ko 로 달아야 언어를 바꿔도 따라온다(A-222). */
  window.artFallbackNote = function (origLang) {
    return norm(origLang) === 'ko'
      ? { ko: '이 글은 한국어 원문만 있습니다.', en: 'This article is available in Korean only.' }
      : { ko: '이 글은 영어 원문만 있습니다.',   en: 'This article is available in English only.' };
  };
})();
