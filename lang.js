/* ===== ARCHINODE Language Toggle (Multi-language, dropdown) =====
   Available languages per page: set <body data-langs="ko,en,it"> or
   <html data-langs="..."> attribute. Default: "en,ko".
   Each element uses data-en="..." data-ko="..." data-it="..." with ISO 639-1 codes.
   HTML content: data-{lang}-html. Placeholder: data-{lang}-placeholder.
*/
(function() {
  /* A-418(2026-11-09): `aria` 는 **언어 전환 단추 자체의 이름**이다. 전에는
     buildSwitcherInner() 가 aria-label="Language" 를 박아 넣어서, lang.js 를 싣는
     244개 파일 전부에서 화면낭독기가 한국어 화면에서도 "Language" 라고 읽었다.
     lang.js:295 가 data-{lang}-aria-label 을 이미 지원하는데 정작 제 단추엔 안 썼다. */
  var LANG_LABELS = {
    en: { native: 'English',    short: 'EN', label: 'English',  aria: 'Language' },
    ko: { native: '한국어',     short: 'KR', label: 'Korean',   aria: '언어' },
    it: { native: 'Italiano',   short: 'IT', label: 'Italian',  aria: 'Lingua' },
    de: { native: 'Deutsch',    short: 'DE', label: 'German',   aria: 'Sprache' },
    fr: { native: 'Français',   short: 'FR', label: 'French',   aria: 'Langue' },
    es: { native: 'Español',    short: 'ES', label: 'Spanish',  aria: 'Idioma' },
    nl: { native: 'Nederlands', short: 'NL', label: 'Dutch',    aria: 'Taal' },
    da: { native: 'Dansk',      short: 'DA', label: 'Danish',   aria: 'Sprog' }
  };

  var availableLangs = ['en', 'ko'];
  var currentLang = 'en';

  function getAvailableLangs() {
    var body = document.body;
    var attr = (body && body.getAttribute('data-langs')) || document.documentElement.getAttribute('data-langs');
    if (!attr) return ['en', 'ko'];
    return attr.split(',')
      .map(function(s) { return s.trim().toLowerCase(); })
      .filter(function(l) { return LANG_LABELS[l]; });
  }

  function pickInitialLang() {
    // 1. 사용자가 명시적으로 토글한 선택 — 항상 최우선
    var saved = null;
    try { saved = localStorage.getItem('archinode-lang'); } catch(e){}
    if (saved && availableLangs.indexOf(saved) !== -1) return saved;
    // 2. IP 자동 감지 캐시 — 첫 IP 조회 후 캐시된 값
    var autoLang = null;
    try { autoLang = localStorage.getItem('archinode-lang-auto'); } catch(e){}
    if (autoLang && availableLangs.indexOf(autoLang) !== -1) return autoLang;
    // 3. A-359(2026-11-06): 브라우저 언어 — **네트워크를 기다리지 않는 신호**
    //    여기는 전에 「한국 사이트라 ko 우선」이라고 무조건 ko 를 돌려줬다. 그래서 처음 오는
    //    유럽 브랜드는 api.country.is 왕복이 끝날 때까지 **페이지 전체를 한국어로** 보고,
    //    자기들을 위한 내용(data-lang-only="en")은 가려진 채였다. 그 API 가 막히거나(사내
    //    방화벽·광고 차단기가 서드파티 호출을 자주 막는다) 응답이 없으면 **한국어에 갇혔다.**
    //    브라우저 언어는 동기로 읽히고 사용자가 직접 고른 값이라, 위치(IP)보다 언어 선택에
    //    더 맞는 신호다. IP 조회는 그대로 두고 **보정**으로만 쓴다.
    //    한국어 브라우저면 지금과 똑같이 ko 로 간다 — 한국 사용자 대다수는 달라지는 게 없다.
    var navLangs = [];
    try {
      navLangs = (navigator.languages && navigator.languages.length)
        ? navigator.languages.slice()
        : (navigator.language ? [navigator.language] : []);
    } catch(e){ navLangs = []; }
    for (var i = 0; i < navLangs.length; i++) {
      var base = String(navLangs[i] || '').toLowerCase().split('-')[0];
      if (base && availableLangs.indexOf(base) !== -1) return base;
    }
    // 4. 브라우저 언어가 이 사이트에 없는 언어일 때 — 영어가 더 넓게 읽힌다
    if (availableLangs.indexOf('en') !== -1) return 'en';
    if (availableLangs.indexOf('ko') !== -1) return 'ko';
    return availableLangs[0] || 'ko';
  }

  // IP 기반 국가 감지 → 자동 언어 적용
  // 한국 IP → ko, 외국 IP → en. 사용자가 명시적으로 토글한 선택('archinode-lang')은 항상 우선.
  function detectCountryAndApply() {
    try {
      if (localStorage.getItem('archinode-lang')) return;
    } catch(e){ return; }
    if (availableLangs.length < 2) return;
    fetch('https://api.country.is/', { method: 'GET', cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data || !data.country) return;
        var autoLang = (data.country === 'KR') ? 'ko' : 'en';
        if (availableLangs.indexOf(autoLang) === -1) return;
        try { localStorage.setItem('archinode-lang-auto', autoLang); } catch(e){}
        if (currentLang !== autoLang) {
          currentLang = autoLang;
          applyLanguage(autoLang);
          updateLangButton(autoLang);
          broadcastLang(autoLang);       // A-259
        }
      })
      .catch(function(e){
        /* A-359: 조용히 삼키면 「왜 언어가 안 바뀌나」를 알 수 없다.
           이제는 브라우저 언어로 이미 정해져 있으니 치명적이진 않지만,
           막혔다는 사실은 남겨 둔다. */
        console.warn('[lang] 국가 감지에 실패했습니다 — 브라우저 언어로 진행합니다:', e && e.message);
      });
  }

  document.addEventListener('DOMContentLoaded', function() {
    availableLangs = getAvailableLangs();
    currentLang = pickInitialLang();
    initSwitcher();
    applyLanguage(currentLang);
    updateLangButton(currentLang);
    broadcastLang(currentLang);          // A-259
    detectCountryAndApply();
  });

  function initSwitcher() {
    // A-008(2026-11-03): data-langs 가 언어 1개뿐인 페이지(예: list-your-brand.html의 "en")는
    // 전환할 다른 언어가 없으니 스위처 UI 자체가 필요 없다. 기존에는 이 체크가 없어서 페이지에
    // 명시적 스위처 마크업이 없으면 무조건 플로팅 스위처를 새로 만들어 "EN ▾" 1개짜리 무의미한
    // 드롭다운이 떠 있었다. 기존 placeholder가 있으면 숨기고, 새로 만들지 않는다.
    if (availableLangs.length < 2) {
      document.querySelectorAll('.lang-switch, .lang-switcher').forEach(function(el) { el.style.display = 'none'; });
      return;
    }
    document.querySelectorAll('.lang-switcher').forEach(function(sw) {
      sw.innerHTML = buildSwitcherInner();
    });
    document.querySelectorAll('.lang-switch:not(.lang-switcher)').forEach(function(el) {
      var wrapper = document.createElement('div');
      wrapper.className = 'lang-switcher';
      if (el.classList.contains('lang-switch-floating')) {
        wrapper.classList.add('lang-switcher-floating');
      }
      wrapper.innerHTML = buildSwitcherInner();
      el.parentNode.replaceChild(wrapper, el);
    });
    /* 스위처 자리가 아예 없는 페이지를 위한 폴백 (A-206) ──────────────────
       ① 일부러 언어 토글을 뺀 페이지(list-your-brand.html — 외국 고객 전용
          영어 페이지)가 있다. 그런 페이지에도 폴백이 떠서 **의도를 뒤집었다.**
          `<body data-no-lang-switcher>` 로 빼 달라고 말할 수 있게 했다.
       ② 폴백 위치가 우상단(top:14px)이라 **그게 뜨는 모든 페이지의 헤더를
          덮었다** — 실측: 안내 띠·'회원가입' 링크·'로그아웃' 버튼을 375px 과
          1440px 양쪽에서 가렸고, z-index:9999 라 클릭까지 가로챘다.
          위치는 style.css 에서 우하단으로 내렸다. */
    if (document.body.hasAttribute('data-no-lang-switcher')) return;
    if (!document.querySelector('.lang-switcher')) {
      var floater = document.createElement('div');
      floater.className = 'lang-switcher lang-switcher-floating';
      floater.innerHTML = buildSwitcherInner();
      document.body.appendChild(floater);
    }
  }

  function buildSwitcherInner() {
    var menuItems = availableLangs.map(function(l) {
      return '<a href="#" data-lang="' + l + '" onclick="setLang(\'' + l + '\', event)">'
        + LANG_LABELS[l].native
        + '<small>' + LANG_LABELS[l].short + '</small></a>';
    }).join('');
    var curShort = LANG_LABELS[currentLang] ? LANG_LABELS[currentLang].short : 'EN';
    /* A-418: 첫 칠에 맞는 이름을 박고(initSwitcher 는 applyLanguage 보다 먼저 돈다),
       나중에 언어를 바꿔도 따라오도록 data-{lang}-aria-label 을 같이 단다. */
    var curAria = (LANG_LABELS[currentLang] && LANG_LABELS[currentLang].aria) || 'Language';
    var ariaAttrs = Object.keys(LANG_LABELS).map(function (l) {
      return 'data-' + l + '-aria-label="' + LANG_LABELS[l].aria + '"';
    }).join(' ');
    return '<button class="lang-switch-btn" type="button" onclick="toggleLangMenu(event)" aria-label="' + curAria + '" ' + ariaAttrs + ' aria-haspopup="true" aria-expanded="false">'
      + '<span class="lang-current">' + curShort + '</span>'
      + ' <i class="fas fa-chevron-down" aria-hidden="true"></i>'
      + '</button>'
      + '<div class="lang-menu" role="menu" aria-hidden="true" style="display:none;">' + menuItems + '</div>';
  }

  // A-062: 비동기로 나중에 끼워 넣어지는 조각(예: 카테고리 제품 목록의 빈 상태 안내)은
  // DOMContentLoaded 때 한 번 도는 applyLanguage()의 손길이 닿지 않는다. 그런 코드가
  // innerHTML을 채운 직후 이 함수를 불러서 현재 언어를 다시 적용할 수 있게 공개한다.
  // (일부 페이지에 이미 "if (window.applyLang) window.applyLang();" 방어 호출이 있었음)
  window.applyLang = function() {
    applyLanguage(currentLang);
  };

  function _syncLangMenuAria(menu, isOpen) {
    menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    var sw = menu.closest('.lang-switcher');
    if (sw) {
      var btn = sw.querySelector('.lang-switch-btn');
      if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }
  window.toggleLangMenu = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    document.querySelectorAll('.lang-menu').forEach(function(m) {
      var open = m.style.display !== 'block';
      m.style.display = open ? 'block' : 'none';
      _syncLangMenuAria(m, open);
    });
  };

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.lang-switcher')) {
      document.querySelectorAll('.lang-menu').forEach(function(m) {
        m.style.display = 'none';
        _syncLangMenuAria(m, false);
      });
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.lang-menu').forEach(function(m) {
        m.style.display = 'none';
      });
    }
  });

  /* ── 동적으로 끼운 요소에 현재 언어를 '다시 입히기' (A-204) ────────────────
     setLang(lang) 은 **사용자가 고른 선택**이라 localStorage('archinode-lang')에
     저장한다. 그래서 innerHTML 로 넣은 요소를 다시 칠하려고 setLang 을 부르면
     안 된다 — brand-portal 이 `setLang(document.documentElement.lang || 'ko')` 로
     그렇게 했고, 이 적용이 DOMContentLoaded 에 일어나므로 그보다 먼저 호출되면
     값이 HTML 시작값 `lang="en"` 이라 **한국어 선호가 'en' 으로 영구히 덮였다.**
     다시 칠하기는 선택이 아니다. 저장하지 않고 현재 언어만 다시 입힌다. */
  window.applyLangAgain = function() {
    applyLanguage(currentLang);
    updateLangButton(currentLang);
  };

  /* ── A-259: 언어가 바뀌었음을 알리는 신호 ──────────────────────────────────
     data-en/data-ko 는 **이미 화면에 있는 글자**만 바꾼다. 기사 본문처럼 자바스크립트가
     Firestore 에서 읽어 innerHTML 로 그려 넣는 것은 그 손길이 닿지 않는다 — 언어를
     바꿔도 처음 그릴 때의 언어가 그대로 굳는다(A-222 와 같은 함정).
     그런 화면이 스스로 다시 그릴 수 있도록, 언어를 적용할 때마다 신호를 하나 쏜다.
     듣는 쪽: document.addEventListener('archinode:lang', fn) — e.detail.lang 에 'en'|'ko'.
     applyLanguage() 안이 아니라 여기서 쏘는 이유: applyLanguage 는 '다시 칠하기'로도
     불리는데(applyLang/applyLangAgain), 그때마다 기사를 다시 그리면 헛일이 된다.
     언어가 **정말 바뀐 때**만 쏜다. */
  var _lastBroadcast = null;
  function broadcastLang(lang) {
    if (_lastBroadcast === lang) return;
    _lastBroadcast = lang;
    try {
      document.dispatchEvent(new CustomEvent('archinode:lang', { detail: { lang: lang } }));
    } catch (err) { /* CustomEvent 를 못 만드는 아주 옛 브라우저 — 조용히 넘어감 */ }
  }
  window.archinodeLang = function() { return currentLang; };

  window.setLang = function(lang, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (availableLangs.indexOf(lang) === -1) return;
    currentLang = lang;
    try { localStorage.setItem('archinode-lang', lang); } catch(err){}
    applyLanguage(lang);
    updateLangButton(lang);
    broadcastLang(lang);                 // A-259
    document.querySelectorAll('.lang-menu').forEach(function(m) {
      m.style.display = 'none';
    });
  };

  window.toggleLang = function(e) {
    if (e) e.preventDefault();
    if (availableLangs.length > 2) {
      window.toggleLangMenu(e);
      return;
    }
    var next = currentLang === 'en' ? 'ko' : 'en';
    if (availableLangs.indexOf(next) !== -1) {
      window.setLang(next);
    }
  };

  function applyLanguage(lang) {
    document.querySelectorAll('[data-' + lang + ']').forEach(function(el) {
      var text = el.getAttribute('data-' + lang);
      if (text === null) return;
      // 자식 요소(텍스트 노드 외)가 하나라도 있으면 자식 보존 + 첫 텍스트 노드만 교체.
      // 자식 요소가 없으면 textContent 전체 갱신.
      if (el.children.length > 0) {
        var nodes = el.childNodes;
        var replaced = false;
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].nodeType === Node.TEXT_NODE && nodes[i].textContent.trim()) {
            nodes[i].textContent = text;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          // 텍스트 노드가 없으면 맨 앞에 삽입 (자식 보존)
          el.insertBefore(document.createTextNode(text + ' '), el.firstChild);
        }
      } else {
        el.textContent = text;
      }
    });

    document.querySelectorAll('[data-' + lang + '-html]').forEach(function(el) {
      var html = el.getAttribute('data-' + lang + '-html');
      if (html !== null) el.innerHTML = html;
    });

    document.querySelectorAll('[data-' + lang + '-placeholder]').forEach(function(el) {
      var ph = el.getAttribute('data-' + lang + '-placeholder');
      if (ph !== null) el.placeholder = ph;
    });

    // A-076: 언어별로 다른 링크로 보내야 하는 경우 (예: 개인정보처리방침 한/영 별도 파일)
    document.querySelectorAll('[data-' + lang + '-href]').forEach(function(el) {
      var href = el.getAttribute('data-' + lang + '-href');
      if (href !== null) el.setAttribute('href', href);
    });

    // A-091: 접근성 — aria-label도 언어에 따라 바꿀 수 있도록 지원
    document.querySelectorAll('[data-' + lang + '-aria-label]').forEach(function(el) {
      var al = el.getAttribute('data-' + lang + '-aria-label');
      if (al !== null) el.setAttribute('aria-label', al);
    });

    /* A-363(2026-11-06): `-title` 이 빠져 있었다. `data-en-title`/`data-ko-title`
       을 단 자리가 2곳 있는데(brands/view.html · products/view.html 의 「내 리스트에
       저장」 단추) lang.js 가 그 접미사를 훑지 않아서 **마우스를 올렸을 때 나오는
       말풍선은 언제나 영어**였다. 달아 놓고 안 듣던 죽은 속성이다. */
    document.querySelectorAll('[data-' + lang + '-title]').forEach(function(el) {
      var tt = el.getAttribute('data-' + lang + '-title');
      if (tt !== null) el.setAttribute('title', tt);
    });

    document.querySelectorAll('[data-lang-only]').forEach(function(el) {
      var only = el.getAttribute('data-lang-only').split(',').map(function(s){ return s.trim().toLowerCase(); });
      el.style.display = (only.indexOf(lang) !== -1) ? '' : 'none';
    });

    document.querySelectorAll('[data-lang-not]').forEach(function(el) {
      var not = el.getAttribute('data-lang-not').split(',').map(function(s){ return s.trim().toLowerCase(); });
      el.style.display = (not.indexOf(lang) === -1) ? '' : 'none';
    });

    document.documentElement.lang = lang;
  }

  function updateLangButton(lang) {
    document.querySelectorAll('.lang-switcher').forEach(function(sw) {
      var cur = sw.querySelector('.lang-current');
      if (cur) cur.textContent = LANG_LABELS[lang] ? LANG_LABELS[lang].short : lang.toUpperCase();
      sw.querySelectorAll('.lang-menu a').forEach(function(a) {
        if (a.getAttribute('data-lang') === lang) {
          a.classList.add('active');
        } else {
          a.classList.remove('active');
        }
      });
    });
  }
})();
