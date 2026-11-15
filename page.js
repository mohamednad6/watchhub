/* Watch Hub — page.js
   Page rendering, genre pills, sort/year filters, search, infinite scroll,
   watchlist page (export / import / print / clear). Requires common.js first. */
(function () {
  /* Required scaffold: if the required ids are missing, create them so nothing
     throws, then bail out — the page markup is not what we expect. */
  var pillsEl = document.getElementById('genrePills');
  var searchEl = document.getElementById('searchInput');
  var scaffolded = false;
  if (!pillsEl) {
    pillsEl = document.createElement('div');
    pillsEl.id = 'genrePills';
    document.body.appendChild(pillsEl);
    scaffolded = true;
  }
  if (!searchEl) {
    searchEl = document.createElement('input');
    searchEl.id = 'searchInput';
    searchEl.type = 'search';
    document.body.appendChild(searchEl);
    scaffolded = true;
  }
  if (scaffolded) return; // bail out instead of throwing

  var el = window.whEl;
  var pageType = document.body.getAttribute('data-page') || 'home';
  var main = document.querySelector('main') || document.body;

  var grid = document.getElementById('grid');
  if (!grid) { grid = el('section', 'grid'); grid.id = 'grid'; main.appendChild(grid); }
  var sentinel = document.getElementById('sentinel');
  if (!sentinel) { sentinel = el('div', 'sentinel'); sentinel.id = 'sentinel'; main.appendChild(sentinel); }
  var countEl = document.getElementById('resultCount');
  var sortEl = document.getElementById('sortSelect');
  var yearEl = document.getElementById('yearSelect');
  var shelvesEl = document.getElementById('shelves');

  var state = {
    page: 1,
    totalPages: 1,
    loading: false,
    genre: '',
    sort: sortEl ? sortEl.value : 'popularity.desc',
    year: '',
    query: '',
    gridMode: pageType !== 'home' // home starts in shelf mode
  };

  var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513">' +
    '<rect width="100%" height="100%" fill="#1b1f27"/>' +
    '<text x="50%" y="50%" fill="#5b6472" font-family="sans-serif" font-size="20" text-anchor="middle">No image</text>' +
    '</svg>');

  /* ---- cards ---- */
  function yearOf(it) { return String(it.release_date || it.first_air_date || '').slice(0, 4); }
  function fallbackType() { return (pageType === 'series' || pageType === 'anime') ? 'tv' : 'movie'; }
  function mediaType(it) {
    if (it.media_type === 'movie' || it.media_type === 'tv') return it.media_type;
    return fallbackType();
  }
  function card(it, forcedType) {
    var type = forcedType || mediaType(it);
    var c = el('article', 'card');

    var posterBtn = el('button', 'card-poster'); posterBtn.type = 'button';
    var img = el('img'); img.loading = 'lazy'; img.alt = it.title || it.name || 'Poster';
    img.src = it.poster_path ? window.TMDB.img(it.poster_path) : PLACEHOLDER;
    posterBtn.appendChild(img);
    posterBtn.addEventListener('click', function () { window.openItem(type, it.id); });

    var heart = el('button', 'heart'); heart.type = 'button'; heart.textContent = '♥';
    heart.setAttribute('data-heart', type + ':' + it.id);
    heart.setAttribute('aria-label', 'Add or remove from watchlist');
    heart.addEventListener('click', function (ev) {
      ev.stopPropagation();
      window.whList.toggle(window.whNormalize(it, type));
    });

    c.appendChild(posterBtn);
    c.appendChild(heart);
    c.appendChild(el('h3', 'card-title', it.title || it.name || 'Untitled'));
    c.appendChild(el('p', 'card-meta',
      (yearOf(it) || '—') + (it.vote_average ? ' · ★ ' + Number(it.vote_average).toFixed(1) : '')));
    return c;
  }
  function refreshHearts() {
    var btns = document.querySelectorAll('[data-heart]');
    for (var i = 0; i < btns.length; i++) {
      var parts = btns[i].getAttribute('data-heart').split(':');
      if (window.whList.has(parts[0], Number(parts[1]))) btns[i].classList.add('on');
      else btns[i].classList.remove('on');
    }
  }
  window.addEventListener('wh-watchlist', function () {
    refreshHearts();
    if (pageType === 'watchlist') renderWatchlist();
  });

  /* ---- genres ---- */
  var genreCache = {};
  function loadGenres(kind) {
    if (!genreCache[kind]) {
      var p = kind === 'movie' ? window.TMDB.movieGenres() : window.TMDB.tvGenres();
      genreCache[kind] = p.then(function (d) { return d.genres || []; }).catch(function () { return []; });
    }
    return genreCache[kind];
  }
  function genreKind() { return (pageType === 'series' || pageType === 'anime') ? 'tv' : 'movie'; }
  function renderPills(genres) {
    pillsEl.textContent = '';
    var all = el('button', 'pill' + (state.genre ? '' : ' on'), 'All'); all.type = 'button';
    all.addEventListener('click', function () { setGenre(''); });
    pillsEl.appendChild(all);
    genres.forEach(function (g) {
      var b = el('button', 'pill' + (String(g.id) === state.genre ? ' on' : ''), g.name);
      b.type = 'button';
      b.addEventListener('click', function () {
        setGenre(state.genre === String(g.id) ? '' : String(g.id));
      });
      pillsEl.appendChild(b);
    });
  }
  function initPills() {
    if (pageType === 'watchlist') {
      Promise.all([loadGenres('movie'), loadGenres('tv')]).then(function (r) {
        var map = {};
        r[0].concat(r[1]).forEach(function (g) { map[g.id] = g.name; });
        renderPills(Object.keys(map).map(function (id) { return { id: id, name: map[id] }; }));
      });
    } else {
      loadGenres(genreKind()).then(renderPills);
    }
  }
  function setGenre(id) {
    state.genre = id;
    state.page = 1;
    state.gridMode = true;
    initPills(); // re-render pills so the active state is correct
    runQuery(true);
  }

  /* ---- years ---- */
  function initYears() {
    if (!yearEl) return;
    var now = new Date().getFullYear();
    for (var y = now + 1; y >= 1950; y--) {
      var o = el('option', null, String(y));
      o.value = String(y);
      yearEl.appendChild(o);
    }
  }

  /* ---- query building ---- */
  function sortParam() {
    var s = state.sort;
    var tv = genreKind() === 'tv';
    if (s === 'newest') return tv ? 'first_air_date.desc' : 'primary_release_date.desc';
    if (s === 'oldest') return tv ? 'first_air_date.asc' : 'primary_release_date.asc';
    if (s === 'vote_average.desc') return 'vote_average.desc';
    return 'popularity.desc';
  }
  function buildParams() {
    var p = { page: state.page, sort_by: sortParam() };
    var base = '';
    if (pageType === 'anime') { base = '16'; p.with_original_language = 'ja'; } // animation + Japanese
    if (state.genre) base = base ? base + ',' + state.genre : state.genre;
    if (base) p.with_genres = base;
    if (sortParam() === 'vote_average.desc') p['vote_count.gte'] = 200;
    if (state.year) p[genreKind() === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = state.year;
    return p;
  }
  function fetchResults() {
    if (state.query) return window.TMDB.searchMulti(state.query, state.page);
    if (genreKind() === 'tv') return window.TMDB.discoverTv(buildParams());
    return window.TMDB.discoverMovie(buildParams());
  }

  /* ---- grid loading + infinite scroll ---- */
  function runQuery(reset) {
    if (pageType === 'watchlist') { renderWatchlist(); return; }
    if (reset) { state.page = 1; grid.textContent = ''; }
    if (shelvesEl) shelvesEl.style.display = state.gridMode ? 'none' : '';
    if (!state.gridMode) { if (countEl) countEl.textContent = ''; return; }
    state.loading = true;
    fetchResults().then(function (d) {
      state.totalPages = d.total_pages || 1;
      var results = (d.results || []).filter(function (r) { return r.media_type !== 'person'; });
      results.forEach(function (r) { grid.appendChild(card(r)); });
      if (countEl) countEl.textContent = (d.total_results || 0).toLocaleString() + ' results';
      state.loading = false;
      refreshHearts();
    }).catch(function () {
      state.loading = false;
      if (countEl) countEl.textContent = 'Failed to load — check your TMDB credentials in common.js';
    });
  }
  function loadMore() {
    if (state.loading || !state.gridMode || state.page >= state.totalPages) return;
    state.page++;
    runQuery(false);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) loadMore(); });
    }, { rootMargin: '600px' }).observe(sentinel);
  }
  /* scroll fallback: also covers browsers without IntersectionObserver */
  window.addEventListener('scroll', function () {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900) loadMore();
  }, { passive: true });

  /* ---- search ---- */
  function doSearch() {
    state.query = searchEl.value.trim();
    if (pageType === 'watchlist') { renderWatchlist(); return; }
    if (state.query) { state.gridMode = true; runQuery(true); }
    else if (pageType === 'home') {
      state.gridMode = false;
      grid.textContent = '';
      if (shelvesEl) shelvesEl.style.display = '';
      if (countEl) countEl.textContent = '';
    } else runQuery(true);
  }
  searchEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  searchEl.addEventListener('search', doSearch); // fires when the field is cleared too
  searchEl.addEventListener('input', function () { // live filtering on the watchlist page
    if (pageType === 'watchlist') { state.query = searchEl.value.trim(); renderWatchlist(); }
  });

  if (sortEl) sortEl.addEventListener('change', function () {
    state.sort = sortEl.value;
    state.gridMode = true;
    runQuery(true);
  });
  if (yearEl) yearEl.addEventListener('change', function () {
    state.year = yearEl.value;
    state.gridMode = true;
    runQuery(true);
  });

  /* ---- home shelves ---- */
  var SHELVES = [
    ['Popular Movies', function () { return window.TMDB.movieList('popular'); }, 'movie'],
    ['Top Rated Movies', function () { return window.TMDB.movieList('top_rated'); }, 'movie'],
    ['Now Playing', function () { return window.TMDB.movieList('now_playing'); }, 'movie'],
    ['Trending Movies', function () { return window.TMDB.trending('movie'); }, 'movie'],
    ['Upcoming', function () { return window.TMDB.movieList('upcoming'); }, 'movie'],
    ['Popular Series', function () { return window.TMDB.tvList('popular'); }, 'tv'],
    ['Top Rated Series', function () { return window.TMDB.tvList('top_rated'); }, 'tv'],
    ['On The Air', function () { return window.TMDB.tvList('on_the_air'); }, 'tv'],
    ['Trending Series', function () { return window.TMDB.trending('tv'); }, 'tv'],
    ['Popular Anime', function () { return window.TMDB.discoverTv({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }); }, 'tv']
  ];
  function renderShelves() {
    if (!shelvesEl) return;
    SHELVES.forEach(function (s) {
      var sec = el('section', 'shelf');
      sec.appendChild(el('h2', 'shelf-title', s[0]));
      var row = el('div', 'shelf-row');
      sec.appendChild(row);
      shelvesEl.appendChild(sec);
      s[1]().then(function (d) {
        (d.results || []).forEach(function (r) { row.appendChild(card(r, s[2])); });
        refreshHearts();
      }).catch(function () {
        row.appendChild(el('p', 'shelf-error', 'Unavailable right now.'));
      });
    });
  }

  /* ---- watchlist page ---- */
  function renderWatchlist() {
    if (pageType !== 'watchlist') return;
    var all = window.whList.all();
    var list = all.slice();
    if (state.query) list = list.filter(function (x) {
      return x.title.toLowerCase().indexOf(state.query.toLowerCase()) >= 0;
    });
    if (state.genre) list = list.filter(function (x) {
      return (x.genreIds || []).map(String).indexOf(state.genre) >= 0;
    });
    if (state.year) list = list.filter(function (x) { return x.year === state.year; });
    var s = state.sort;
    list.sort(function (a, b) {
      if (s === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (s === 'year') return String(b.year).localeCompare(String(a.year));
      if (s === 'title') return a.title.localeCompare(b.title);
      return 0; // 'added' — stored order, newest first
    });
    grid.textContent = '';
    list.forEach(function (x) {
      grid.appendChild(card({
        id: x.id,
        title: x.title,
        poster_path: x.poster,
        release_date: x.type === 'movie' ? x.year : '',
        first_air_date: x.type === 'tv' ? x.year : '',
        vote_average: x.rating,
        genre_ids: x.genreIds
      }, x.type));
    });
    var empty = document.getElementById('emptyState');
    var isEmpty = all.length === 0;
    if (empty) empty.hidden = !isEmpty;
    grid.hidden = isEmpty;
    if (countEl) countEl.textContent = list.length + (list.length === 1 ? ' title' : ' titles');
    refreshHearts();
  }

  function importData(data) {
    var items = Array.isArray(data) ? data : (data && data.watchlist) || [];
    var lookups = items.map(function (x) {
      if (x && x.id && x.type) return Promise.resolve(x);
      if (x && x.imdb_id) {
        return window.TMDB.find(x.imdb_id, 'imdb_id').then(function (d) {
          var m = (d.movie_results && d.movie_results[0]) || (d.tv_results && d.tv_results[0]);
          if (!m) return null;
          return window.whNormalize(m, m.title ? 'movie' : 'tv');
        }).catch(function () { return null; });
      }
      return Promise.resolve(null);
    });
    return Promise.all(lookups).then(function (r) {
      return window.whList.importAll(r.filter(Boolean));
    });
  }

  function initWatchlistActions() {
    var ex = document.getElementById('exportBtn');
    if (ex) ex.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(window.whList.all(), null, 2)], { type: 'application/json' });
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'watchlist.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    var im = document.getElementById('importBtn');
    var file = document.getElementById('importFile');
    if (im && file) im.addEventListener('click', function () { file.click(); });
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          importData(JSON.parse(String(reader.result))).then(function (n) {
            alert('Imported ' + n + ' title' + (n === 1 ? '' : 's') + '.');
          });
        } catch (e) { alert('Invalid watchlist file.'); }
        file.value = '';
      };
      reader.readAsText(f);
    });

    var pr = document.getElementById('printBtn');
    if (pr) pr.addEventListener('click', function () { window.print(); });

    var cl = document.getElementById('clearBtn');
    if (cl) cl.addEventListener('click', function () {
      if (confirm('Remove ALL titles from your watchlist?')) window.whList.clear();
    });
  }

  /* ---- signed-out banner on the watchlist page ---- */
  function renderAuthBanner(user) {
    var banner = document.getElementById('authBanner');
    if (banner) banner.hidden = !!user;
  }
  if (pageType === 'watchlist') {
    window.addEventListener('wh-auth', function (e) {
      renderAuthBanner(e.detail && e.detail.user);
    });
    if (window.whAuth && typeof window.whAuth.onAuthChange === 'function') {
      window.whAuth.onAuthChange(renderAuthBanner);
    } else {
      renderAuthBanner(null);
    }
  }

  /* ---- init ---- */
  initPills();
  initYears();
  if (pageType === 'home') {
    renderShelves();
  } else if (pageType === 'watchlist') {
    initWatchlistActions();
    renderWatchlist();
  } else {
    runQuery(true);
  }
})();
