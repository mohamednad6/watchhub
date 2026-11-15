/* Watch Hub — common.js
   Config, TMDB API helpers (window.TMDB), detail modal, watchlist store,
   theme / language / install helpers, service-worker registration.
   Loaded before page.js and nav.js on every page. */

// ==== EDIT THESE 4 LINES ====
const API_KEY_V3     = 'e53ec8a0b52d3bb5903a5eaf5d0e207b'; // TMDB v3 API key (short key)
const READ_TOKEN     = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzNDlkMzZkNDAyZTU1ODg0ZWU3MDE4YWEwYjA3YTY5ZSIsIm5iZiI6MTc5MjkzNzMwMS40MjQsInN1YiI6IjZhZGUwZDU1Zjg5YTdmNWQ1YmQ4MmIwZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.QPoTR8yLUrYvVVKQdhuPGNzcpXlx-7WlBhiXjXOqwqE';                                  // TMDB v4 read access token (starts with "ey")
const DEFAULT_LANG   = 'en-US';                             // default language, e.g. 'en-US' or 'fr-FR'
const DEFAULT_REGION = '';                                  // optional region for release lists, e.g. 'US'
// ===========================

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const LS_GUEST_LIST = 'wh-watchlist';
const USER_LIST_PREFIX = 'watchlist_';
const LS_THEME = 'wh-theme';
const LS_LANG = 'wh-lang';

/* ---- tiny DOM helper: textContent only, never innerHTML with external data ---- */
function whEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function getLang() {
  try { return localStorage.getItem(LS_LANG) || DEFAULT_LANG; } catch (e) { return DEFAULT_LANG; }
}

function qs(params) {
  const parts = [];
  Object.keys(params || {}).forEach(function (k) {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/* Every call sends ?api_key=API_KEY_V3 first. Detail/find calls additionally
   send the v4 READ_TOKEN as a Bearer header. If that attempt fails, retry
   key-only, then token-only — so the site works with either single credential. */
async function apiGet(path, params, useToken) {
  const url = TMDB_BASE + path + qs(Object.assign({ api_key: API_KEY_V3, language: getLang() }, params));
  const tokenUrl = TMDB_BASE + path + qs(Object.assign({ language: getLang() }, params));
  const attempts = [];
  if (useToken && READ_TOKEN) attempts.push({ url: url, headers: { Authorization: 'Bearer ' + READ_TOKEN } });
  attempts.push({ url: url, headers: {} });
  if (READ_TOKEN) attempts.push({ url: tokenUrl, headers: { Authorization: 'Bearer ' + READ_TOKEN } });

  let status = 0;
  for (let i = 0; i < attempts.length; i++) {
    const res = await fetch(attempts[i].url, { headers: attempts[i].headers });
    if (res.ok) return res.json();
    status = res.status;
  }
  throw new Error('TMDB error ' + status);
}

window.TMDB = {
  img: function (path, size) { return path ? TMDB_IMG + (size || 'w342') + path : ''; },
  searchMulti: function (query, page) { return apiGet('/search/multi', { query: query, page: page || 1, include_adult: 'false' }); },
  discoverMovie: function (params) { return apiGet('/discover/movie', params); },
  discoverTv: function (params) { return apiGet('/discover/tv', params); },
  movieGenres: function () { return apiGet('/genre/movie/list'); },
  tvGenres: function () { return apiGet('/genre/tv/list'); },
  movieDetail: function (id) { return apiGet('/movie/' + id, { append_to_response: 'credits,videos' }, true); },
  tvDetail: function (id) { return apiGet('/tv/' + id, { append_to_response: 'credits,videos' }, true); },
  find: function (externalId, source) { return apiGet('/find/' + encodeURIComponent(externalId), { external_source: source || 'imdb_id' }, true); },
  movieList: function (kind, page) { return apiGet('/movie/' + kind, { page: page || 1, region: DEFAULT_REGION }); },
  tvList: function (kind, page) { return apiGet('/tv/' + kind, { page: page || 1 }); },
  trending: function (type, page) { return apiGet('/trending/' + type + '/week', { page: page || 1 }); },
  detail: function (type, id) { return type === 'movie' ? this.movieDetail(id) : this.tvDetail(id); }
};

/* ---- watchlist store (localStorage, never credentials) ----
   Per user: key 'watchlist_<uid>'. Guests use the legacy 'wh-watchlist' key so
   anything added before signing in can be merged into the account on login. */
let whUid = null;
function listKey() { return whUid ? USER_LIST_PREFIX + whUid : LS_GUEST_LIST; }
function readList() {
  try { const v = JSON.parse(localStorage.getItem(listKey())); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function writeList(list) {
  try { localStorage.setItem(listKey(), JSON.stringify(list)); } catch (e) {}
  window.dispatchEvent(new CustomEvent('wh-watchlist')); // real-time sync for hearts + list page
}

/* Called by auth.js whenever the signed-in user changes. */
window.whUser = {
  set: function (uid) {
    const next = uid || null;
    if (next === whUid) return;
    whUid = next;
    window.dispatchEvent(new CustomEvent('wh-watchlist'));
  },
  get: function () { return whUid; }
};

/* Merge guest items into the signed-in user's list (no duplicates), then
   clear the guest bucket. Safe to call when signed out (returns 0). */
window.whMergeGuest = function () {
  if (!whUid) return 0;
  let guest = [];
  try { const v = JSON.parse(localStorage.getItem(LS_GUEST_LIST)); guest = Array.isArray(v) ? v : []; }
  catch (e) { guest = []; }
  if (!guest.length) return 0;

  const user = readList();
  const seen = new Set(user.map(function (x) { return x.type + ':' + x.id; }));
  let added = 0;
  guest.forEach(function (x) {
    if (!x || !x.id || !x.type) return;
    const k = x.type + ':' + x.id;
    if (seen.has(k)) return;
    seen.add(k);
    user.unshift(x);
    added++;
  });
  try { localStorage.removeItem(LS_GUEST_LIST); } catch (e) {}
  writeList(user);
  return added;
};
function normalizeItem(it, type) {
  return {
    id: it.id,
    type: type,
    title: it.title || it.name || 'Untitled',
    poster: it.poster_path || it.poster || '',
    year: String(it.release_date || it.first_air_date || it.year || '').slice(0, 4),
    rating: typeof it.vote_average === 'number' ? it.vote_average : (it.rating || 0),
    genreIds: it.genre_ids || (it.genres ? it.genres.map(function (g) { return g.id; }) : []) || it.genreIds || []
  };
}
window.whNormalize = normalizeItem;
window.whEl = whEl;

window.whList = {
  all: readList,
  has: function (type, id) { return readList().some(function (x) { return x.type === type && x.id === id; }); },
  toggle: function (item) {
    const list = readList();
    const i = list.findIndex(function (x) { return x.type === item.type && x.id === item.id; });
    if (i >= 0) { list.splice(i, 1); writeList(list); return false; }
    list.unshift(item); writeList(list); return true;
  },
  remove: function (type, id) {
    writeList(readList().filter(function (x) { return !(x.type === type && x.id === id); }));
  },
  clear: function () { writeList([]); },
  importAll: function (items) {
    const clean = (Array.isArray(items) ? items : []).filter(function (x) { return x && x.id && x.type; });
    const seen = new Set();
    const out = [];
    clean.forEach(function (x) {
      const k = x.type + ':' + x.id;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        id: x.id,
        type: x.type === 'movie' ? 'movie' : 'tv',
        title: String(x.title || 'Untitled'),
        poster: String(x.poster || ''),
        year: String(x.year || '').slice(0, 4),
        rating: Number(x.rating) || 0,
        genreIds: Array.isArray(x.genreIds) ? x.genreIds.map(Number) : []
      });
    });
    writeList(out);
    return out.length;
  }
};

/* ---- detail modal ---- */
function closeModal() {
  const m = document.getElementById('whModal');
  if (m) m.hidden = true;
}
function ensureModal() {
  if (document.getElementById('whModal')) return;
  const ov = whEl('div', 'modal-overlay'); ov.id = 'whModal'; ov.hidden = true;
  const box = whEl('div', 'modal-box'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const close = whEl('button', 'modal-close', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeModal);
  const content = whEl('div', 'modal-content'); content.id = 'whModalContent';
  box.appendChild(close); box.appendChild(content); ov.appendChild(box);
  ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  document.body.appendChild(ov);
}

window.openItem = async function (type, id) {
  ensureModal();
  const ov = document.getElementById('whModal');
  const content = document.getElementById('whModalContent');
  content.textContent = '';
  content.appendChild(whEl('p', 'modal-loading', 'Loading…'));
  ov.hidden = false;

  let d;
  try { d = await window.TMDB.detail(type, id); }
  catch (e) {
    content.textContent = '';
    content.appendChild(whEl('p', 'modal-loading', 'Could not load details. Check your TMDB credentials in common.js.'));
    return;
  }
  const item = normalizeItem(d, type);
  content.textContent = '';

  const head = whEl('div', 'modal-head');
  if (item.poster) {
    const img = whEl('img', 'modal-poster'); img.src = window.TMDB.img(item.poster, 'w342'); img.alt = item.title;
    head.appendChild(img);
  }
  const info = whEl('div', 'modal-info');
  info.appendChild(whEl('h2', 'modal-title', item.title));
  info.appendChild(whEl('p', 'modal-meta',
    (item.year || '—') + (item.rating ? ' · ★ ' + Number(item.rating).toFixed(1) : '') +
    (d.runtime ? ' · ' + d.runtime + ' min' : '') +
    (d.number_of_seasons ? ' · ' + d.number_of_seasons + ' season' + (d.number_of_seasons > 1 ? 's' : '') : '')));
  if (d.genres && d.genres.length) info.appendChild(whEl('p', 'modal-genres', d.genres.map(function (g) { return g.name; }).join(' · ')));

  const actions = whEl('div', 'modal-actions');
  const trailer = whEl('a', 'btn', 'Trailer on YouTube');
  trailer.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.title + ' ' + (item.year || '') + ' trailer');
  trailer.target = '_blank'; trailer.rel = 'noopener';
  const heart = whEl('button', 'btn heart-modal'); heart.type = 'button';
  const syncHeart = function () {
    heart.textContent = window.whList.has(type, id) ? '♥ In your watchlist' : '♡ Add to watchlist';
  };
  syncHeart();
  heart.addEventListener('click', function () { window.whList.toggle(item); syncHeart(); });
  actions.appendChild(trailer); actions.appendChild(heart);
  info.appendChild(actions);
  head.appendChild(info);
  content.appendChild(head);

  if (d.overview) content.appendChild(whEl('p', 'modal-overview', d.overview));

  const cast = d.credits && Array.isArray(d.credits.cast) ? d.credits.cast.slice(0, 6) : [];
  if (cast.length) {
    content.appendChild(whEl('h3', 'modal-sub', 'Cast'));
    const ul = whEl('ul', 'modal-cast');
    cast.forEach(function (c) {
      ul.appendChild(whEl('li', null, c.name + (c.character ? ' — ' + c.character : '')));
    });
    content.appendChild(ul);
  }
};

/* ---- theme, language, install prompt ---- */
window.toggleTheme = function () {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem(LS_THEME, next); } catch (e) {}
  return next;
};

window.toggleLang = function () {
  const next = getLang() === 'en-US' ? 'fr-FR' : 'en-US';
  try { localStorage.setItem(LS_LANG, next); } catch (e) {}
  location.reload();
  return next;
};

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredInstall = e;
  window.dispatchEvent(new Event('wh-installable'));
});
/* The ONLY promptInstall definition in the project. Returns a Promise. */
window.promptInstall = function () {
  if (!deferredInstall) return Promise.resolve(false);
  deferredInstall.prompt();
  return deferredInstall.userChoice.then(function (choice) {
    const ok = !!(choice && choice.outcome === 'accepted');
    if (ok) deferredInstall = null;
    return ok;
  }).catch(function () { return false; });
};

/* ---- service worker registration ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
