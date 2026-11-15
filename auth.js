/* Watch Hub — auth.js
   Real Firebase Authentication using the compat CDN build (v10.12.0, no bundler).
   Loaded before page.js and nav.js on every page.

   Public API — window.whAuth:
     signInWithGoogle()                  -> Promise<UserCredential>
     signInWithEmail(email, pass)        -> Promise<UserCredential>
     signUpWithEmail(email, pass, name)  -> Promise<UserCredential>
     signOutUser()                       -> Promise<void>
     onAuthChange(callback)              -> unsubscribe fn
     currentUser()                       -> User | null
     isConfigured()                      -> boolean
     errorMessage(err)                   -> human readable string */
(function () {
  'use strict';

  // ==== EDIT THESE LINES ====
  const firebaseConfig = {
    apiKey: "AIzaSyCJeMKJsOlDJsjEvO6AO2jUy5wwvwwRn7k",
    authDomain: "watch-hub-8701f.firebaseapp.com",
    projectId: "watch-hub-8701f",
    storageBucket: "watch-hub-8701f.firebasestorage.app",
    messagingSenderId: "3209393548614",
    appId: "1:3209393548614:web:8b3ede6eeb9c713d88b47"
  };
  // ==========================

  const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';
  const SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js'];

  function isConfigured() {
    const k = String(firebaseConfig.apiKey || '');
    return k.length > 20 && k.indexOf('PASTE_') !== 0;
  }

  /* ---- load the compat SDK in order (classic <script> tags, no bundler) ---- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  let authPromise = null;

  /* Compat equivalent of the modular getAuth(): resolves to the Auth instance. */
  function getAuth() {
    if (authPromise) return authPromise;
    authPromise = SDK_FILES.reduce(function (chain, file) {
      return chain.then(function () { return loadScript(SDK_BASE + file); });
    }, Promise.resolve()).then(function () {
      if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
        throw new Error('Firebase SDK unavailable');
      }
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
      return firebase.auth();
    });
    return authPromise;
  }

  /* ---- auth state broadcasting ---- */
  const listeners = [];
  let lastUser = null;
  let resolvedOnce = false;
  let subscribed = false;
  let lastError = null;

  function emit(user) {
    lastUser = user || null;
    resolvedOnce = true;
    if (lastUser) {
      if (window.whUser && typeof window.whUser.set === 'function') window.whUser.set(lastUser.uid);
      /* guest items added before signing in move into the account, de-duplicated */
      if (typeof window.whMergeGuest === 'function') window.whMergeGuest();
    } else if (window.whUser && typeof window.whUser.set === 'function') {
      window.whUser.set(null);
    }
    window.dispatchEvent(new CustomEvent('wh-auth', { detail: { user: lastUser } }));
    listeners.slice().forEach(function (cb) {
      try { cb(lastUser); } catch (e) { /* a broken listener must not block the rest */ }
    });
  }

  function attach() {
    if (subscribed) return;
    subscribed = true;
    getAuth().then(function (auth) {
      /* fires immediately with the restored session (or null), then on every change */
      auth.onAuthStateChanged(function (user) { emit(user); });
    }).catch(function (err) {
      lastError = err;
      emit(null); // degrade to signed-out instead of throwing
    });
  }

  function onAuthChange(callback) {
    if (typeof callback !== 'function') return function () {};
    listeners.push(callback);
    if (resolvedOnce) {
      try { callback(lastUser); } catch (e) {}
    }
    attach();
    return function () {
      const i = listeners.indexOf(callback);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ---- helpers ---- */
  function signInWithGoogle() {
    return getAuth().then(function (auth) {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return auth.signInWithPopup(provider);
    });
  }

  function signInWithEmail(email, pass) {
    return getAuth().then(function (auth) {
      return auth.signInWithEmailAndPassword(email, pass);
    });
  }

  function signUpWithEmail(email, pass, name) {
    return getAuth().then(function (auth) {
      return auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
        const displayName = String(name || '').trim();
        if (!displayName || !cred || !cred.user) return cred;
        return cred.user.updateProfile({ displayName: displayName }).then(function () { return cred; });
      });
    });
  }

  function signOutUser() {
    return getAuth().then(function (auth) { return auth.signOut(); });
  }

  /* ---- friendly error text ---- */
  const ERROR_MESSAGES = {
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-login-credentials': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/email-already-in-use': 'That email is already in use. Sign in instead.',
    'auth/weak-password': 'Password is too weak — use at least 6 characters.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/missing-password': 'Enter your password.',
    'auth/missing-email': 'Enter your email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and retry.',
    'auth/cancelled-popup-request': 'Another sign-in popup is already open.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in your Firebase project.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/invalid-api-key': 'Firebase apiKey is missing or invalid — paste your real key into auth.js.',
    'auth/api-key-not-valid': 'Firebase apiKey is missing or invalid — paste your real key into auth.js.',
    'auth/unauthorized-domain': 'This domain is not authorised in Firebase Auth settings.',
    'auth/internal-error': 'Firebase returned an internal error. Try again.'
  };

  function errorMessage(err) {
    const code = (err && err.code) || '';
    const raw = (err && err.message) || '';
    /* Google Cloud key restriction — shown before the generic mapping so the
       message points at the real cause rather than "invalid apiKey". */
    if (/API_KEY_HTTP_REFERRER_BLOCKED/.test(raw) || /referer/i.test(raw)) {
      return 'This Firebase API key is blocked for this domain. In Google Cloud → APIs & Services → Credentials, add your site domain (and http://localhost:*) to the key\'s HTTP referrers.';
    }
    if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (!isConfigured()) return 'Firebase apiKey is missing — paste your real key into auth.js.';
    if (lastError) return 'Could not reach Firebase. Check your connection and try again.';
    return raw || 'Sign-in failed. Please try again.';
  }

  window.whAuth = {
    signInWithGoogle: signInWithGoogle,
    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signOutUser: signOutUser,
    onAuthChange: onAuthChange,
    currentUser: function () { return lastUser; },
    isConfigured: isConfigured,
    errorMessage: errorMessage,
    ready: getAuth
  };

  /* Resolve auth state on page load: onAuthStateChanged fires immediately. */
  attach();

  /* =====================================================================
     login.html controller — runs only where the form exists.
     ===================================================================== */
  const form = document.getElementById('loginForm');
  if (form) {
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    const nameInput = document.getElementById('loginName');
    const nameWrap = document.getElementById('loginNameWrap');
    const submitBtn = document.getElementById('loginSubmit');
    const googleBtn = document.getElementById('googleBtn');
    const errorBox = document.getElementById('authError');
    const modeLink = document.getElementById('modeLink');
    const modeText = document.getElementById('modeText');

    let mode = 'signin';

    function showError(msg) {
      if (!errorBox) return;
      errorBox.textContent = String(msg || 'Something went wrong.');
      errorBox.hidden = false;
    }
    function hideError() {
      if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    }
    function setBusy(busy) {
      if (submitBtn) submitBtn.disabled = busy;
      if (googleBtn) googleBtn.disabled = busy;
      if (submitBtn) submitBtn.textContent = busy ? 'Please wait…' : (mode === 'signup' ? 'Create Account' : 'Sign In');
    }
    function setMode(next) {
      mode = next;
      hideError();
      if (nameWrap) nameWrap.hidden = mode !== 'signup';
      if (submitBtn) submitBtn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
      if (modeText) modeText.textContent = mode === 'signup' ? 'Already have an account?' : 'New to Watch Hub?';
      if (modeLink) modeLink.textContent = mode === 'signup' ? 'Sign In' : 'Create Account';
    }

    setMode('signin');

    if (modeLink) modeLink.addEventListener('click', function (e) {
      e.preventDefault();
      setMode(mode === 'signup' ? 'signin' : 'signup');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError();
      const email = emailInput ? emailInput.value.trim() : '';
      const pass = passInput ? passInput.value : '';
      if (!email || !pass) { showError('Enter both your email and password.'); return; }

      setBusy(true);
      const action = mode === 'signup'
        ? signUpWithEmail(email, pass, nameInput ? nameInput.value : '')
        : signInWithEmail(email, pass);

      action.then(function () {
        /* wh-auth listener below performs the redirect */
      }).catch(function (err) {
        showError(errorMessage(err));
      }).then(function () { setBusy(false); });
    });

    if (googleBtn) googleBtn.addEventListener('click', function () {
      if (googleBtn.disabled) return;
      hideError();
      setBusy(true);
      signInWithGoogle().then(function () {
        /* wh-auth listener below performs the redirect */
      }).catch(function (err) {
        showError(errorMessage(err));
      }).then(function () { setBusy(false); });
    });

    /* already signed in? go straight to the app */
    onAuthChange(function (user) {
      if (user) location.replace('index.html');
    });
  }
})();
