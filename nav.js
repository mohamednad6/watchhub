/* Watch Hub — nav.js
   Header interactions: attaches listeners to elements that already exist and
   inserts the Report / Slides links before the Install button. Never replaces
   or renames existing elements, never touches their styles or classes, never
   redefines functions. If a needed function is missing, it skips. */
(function () {
  function on(elm, ev, fn) { if (elm) elm.addEventListener(ev, fn); }

  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  on(toggle, 'click', function () {
    if (links) links.hidden = !links.hidden;
  });

  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn && typeof window.toggleTheme === 'function') {
    on(themeBtn, 'click', function () { window.toggleTheme(); });
  }

  var langBtn = document.getElementById('langBtn');
  if (langBtn && typeof window.toggleLang === 'function') {
    on(langBtn, 'click', function () { window.toggleLang(); });
  }

  var installBtn = document.getElementById('installBtn');
  if (installBtn && typeof window.promptInstall === 'function') {
    on(installBtn, 'click', function () { window.promptInstall(); });
    window.addEventListener('wh-installable', function () { installBtn.hidden = false; });
  }

  /* ---- Report / Slides links, inserted just before the Install button ----
     They go into the header tools row so they sit beside the other actions;
     the class reuses the nav link styling from style.css. */
  var tools = document.querySelector('.header-tools');
  if (tools && installBtn) {
    [{ href: 'report.html', label: 'Report' },
     { href: 'slides.html', label: 'Slides' }].forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      link.className = 'tool-link';
      tools.insertBefore(link, installBtn);
    });
  }

  /* ---- auth UI ----
     The markup ships in every page; this only toggles what is already there. */
  var signInLink = document.getElementById('signInLink');
  var authUser = document.getElementById('authUser');
  var authName = document.getElementById('authName');
  var authAvatar = document.getElementById('authAvatar');
  var authInitial = document.getElementById('authInitial');
  var signOutBtn = document.getElementById('signOutBtn');

  function displayNameOf(user) {
    var n = (user && user.displayName) || '';
    if (!n && user && user.email) n = String(user.email).split('@')[0];
    n = String(n).trim();
    return n || 'Account';
  }

  function renderAuth(user) {
    if (user) {
      if (signInLink) signInLink.hidden = true;
      if (authUser) authUser.hidden = false;
      var name = displayNameOf(user);
      if (authName) authName.textContent = name.split(/\s+/)[0];
      if (authAvatar && user.photoURL) {
        authAvatar.src = user.photoURL;
        authAvatar.alt = name;
        authAvatar.hidden = false;
        if (authInitial) authInitial.hidden = true;
      } else {
        if (authAvatar) authAvatar.hidden = true;
        if (authInitial) {
          authInitial.textContent = name.charAt(0).toUpperCase();
          authInitial.hidden = false;
        }
      }
    } else {
      if (authUser) authUser.hidden = true;
      if (signInLink) signInLink.hidden = false;
    }
  }

  if (signInLink || authUser) {
    if (window.whAuth && typeof window.whAuth.onAuthChange === 'function') {
      window.whAuth.onAuthChange(renderAuth);
    } else {
      renderAuth(null); // SDK failed to load: stay usable as a guest
    }
  }

  if (signOutBtn && window.whAuth && typeof window.whAuth.signOutUser === 'function') {
    on(signOutBtn, 'click', function () {
      signOutBtn.disabled = true;
      window.whAuth.signOutUser().catch(function () {}).then(function () {
        signOutBtn.disabled = false;
      });
    });
  }

  var backTop = document.getElementById('backTop');
  on(backTop, 'click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  window.addEventListener('scroll', function () {
    if (backTop) backTop.hidden = window.scrollY < 400;
  }, { passive: true });

  var page = document.body ? document.body.getAttribute('data-page') : '';
  if (links && page) {
    var anchors = links.querySelectorAll('a[data-nav]');
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].getAttribute('data-nav') === page) {
        anchors[i].setAttribute('aria-current', 'page');
      }
    }
  }
})();
