# Watch Hub

A zero-build, zero-backend PWA to discover movies, series and anime, powered entirely by the TMDB API. All data comes from `window.TMDB` (api.themoviedb.org) — no local server, database or build step required.

## Files

| File | Purpose |
|---|---|
| `index.html` | Home: popular / top rated / now playing / trending / upcoming movies, popular / top rated / on the air / trending series, popular anime |
| `movies.html` | Movie discovery with genre pills, sort, year filter, infinite scroll |
| `series.html` | TV series discovery (same controls) |
| `anime.html` | Anime discovery (`with_genres=16` + `with_original_language=ja`) |
| `watchlist.html` | Saved titles: add/remove, export/import JSON, print, clear all |
| `login.html` | Email/password + Google sign-in, create account, continue as guest |
| `style.css` | Full responsive dark/light theme |
| `common.js` | Credentials, `window.TMDB`, detail modal, per-user watchlist store, PWA helpers |
| `auth.js` | Firebase Auth (compat CDN): `signInWithGoogle`, `signInWithEmail`, `signUpWithEmail`, `signOutUser`, `onAuthChange` |
| `page.js` | Rendering, filters, search, infinite scroll, watchlist actions |
| `nav.js` | Header listeners only (menu, theme, language, install, auth state, back-to-top) |
| `sw.js` | Offline cache (`watch-hub-v3.3`), cache-first assets / network-only TMDB |
| `manifest.json` | PWA manifest (`icon-192.png`, `icon-512.png`) |

## Setup

1. Open `auth.js` and replace `apiKey` in `firebaseConfig` with the Web API key from your Firebase project (Project settings → Your apps). Auth needs no other change.
2. Open `common.js` and fill in the 4 config lines at the top (v3 key, v4 read token, language, region). The v3 key alone is enough for the site to work; the v4 read token is additionally sent on detail/find calls when present.
3. In Firebase → Authentication → Sign-in method, enable **Email/Password** and **Google**. Add your hosting domain under Authentication → Settings → Authorized domains.
4. If the Web API key is restricted by HTTP referrer (Google Cloud → APIs & Services → Credentials → your browser key), add your site domain **and** `http://localhost:*` there as well. Without this, sign-in fails with “Requests from referer … are blocked”.
5. Serve the folder over HTTP(S) or `localhost` (any static server) so the service worker and install prompt can register. Opening `index.html` directly also works for browsing, minus PWA features.
6. To install: when the browser fires the install prompt, an **Install** button appears in the header.

## Notes

- Genre filtering uses the `with_genres` parameter.
- Watchlist data lives in `localStorage`: `watchlist_<uid>` when signed in, `wh-watchlist` for guests. Guest items are merged into the account on first sign-in, de-duplicated. Credentials are never stored.
- Only `api.themoviedb.org`, `image.tmdb.org`, Google Fonts and the Firebase SDK/auth endpoints are contacted.


## 🔐 Authentication
Email/password and Google sign-in through Firebase Authentication.
Login state is shared across pages, and each user has their own saved watchlist.

## 🌐 Live Demo
[mohamednad6.github.io/watchhub](https://mohamednad6.github.io/watchhub/)
