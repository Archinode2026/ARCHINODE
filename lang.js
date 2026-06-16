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
    var saved = null;
    try { saved = localStorage.getItem('archinode-lang'); } catch(e){}
    if (saved && availableLangs.indexOf(saved) !== -1) return saved;
    // 한국 사이트(archinodekr.com) — 첫 방문 무조건 한국어 디폴트.
    // EN 토글 1회 누르면 localStorage에 'en' 저장되어 다음부터 영어 유지.
    if (availableLangs.indexOf('ko') !== -1) return 'ko';
    if (availableLangs.indexOf('en') !== -1) return 'en';
    return availableLangs[0] || 'ko';
  }

  document.addEventListener('DOMContentLoaded', function() {
    availableLangs = getAvailableLangs();
    currentLang = pickInitialLang();
    initSwitcher();
    applyLanguage(currentLang);
    updateLangButton(currentLang);
  });

  function initSwitcher() {
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
    return '<button class="lang-switch-btn" type="button" onclick="toggleLangMenu(event)" aria-label="Language">'
      + '<span class="lang-current">' + curShort + '</span>'
      + ' <i class="fas fa-chevron-down"></i>'
      + '</button>'
      + '<div class="lang-menu" style="display:none;">' + menuItems + '</div>';
  }

  window.toggleLangMenu = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    document.querySelectorAll('.lang-menu').forEach(function(m) {
      m.style.display = (m.style.display === 'block') ? 'none' : 'block';
    });
  };

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.lang-switcher')) {
      document.querySelectorAll('.lang-menu').forEach(function(m) {
        m.style.display = 'none';
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
}