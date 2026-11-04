/* ===== ARCHINODE Language Toggle (Multi-language, dropdown) =====
   Available languages per page: set <body data-langs="ko,en,it"> or
   <html data-langs="..."> attribute. Default: "en,ko".
   Each element uses data-en="..." data-ko="..." data-it="..." with ISO 639-1 codes.
   HTML content: data-{lang}-html. Placeholder: data-{lang}-placeholder.
*/
(function() {
  var LANG_LABELS = {
    en: { native: 'English',    short: 'EN', label: 'English' },
    ko: { native: '한국어',     short: 'KR', label: 'Korean' },
    it: { native: 'Italiano',   short: 'IT', label: 'Italian' },
    de: { native: 'Deutsch',    short: 'DE', label: 'German' },
    fr: { native: 'Français',   short: 'FR', label: 'French' },
    es: { native: 'Español',    short: 'ES', label: 'Spanish' },
    nl: { native: 'Nederlands', short: 'NL', label: 'Dutch' },
    da: { native: 'Dansk',      short: 'DA', label: 'Danish' }
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
    // 3. 디폴트 — 한국 사이트라 ko 우선 (IP 조회 결과 받기 전 임시)
    if (availableLangs.indexOf('ko') !== -1) return 'ko';
    if (availableLangs.indexOf('en') !== -1) return 'en';
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
        }
      })
      .catch(function(){});
  }

  document.addEventListener('DOMContentLoaded', function() {
    availableLangs = getAvailableLangs();
    currentLang = pickInitialLang();
    initSwitcher();
    applyLanguage(currentLang);
    updateLangButton(currentLang);
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
    return '<button class="lang-switch-btn" type="button" onclick="toggleLangMenu(event)" aria-label="Language" aria-haspopup="true" aria-expanded="false">'
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

  window.setLang = function(lang, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (availableLangs.indexOf(lang) === -1) return;
    currentLang = lang;
    try { localStorage.setItem('archinode-lang', lang); } catch(err){}
    applyLanguage(lang);
    updateLangButton(lang);
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
