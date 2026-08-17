# Spin the Dial

A Next.js app: connect Spotify — or hand it a Last.fm username — build a pool of artists you
actually listen to, spin a dial, and launch that artist in Spotify. Everything happens in the
browser: no backend, no database, no token proxy, and no secrets of any kind.

```sh
npm install
npm run dev     # http://127.0.0.1:3000
```

Spotify allows `http` redirect URIs only for `127.0.0.1`, so `npm run dev` binds there rather
than to `localhost`. Use the URL exactly as printed.

## 1. Register a Spotify app

1. Go to the Spotify Developer Dashboard → **Create app**.
2. Name it anything ("Spin the Dial").
3. **Redirect URI** — must match exactly where you serve the app, path included, e.g.
   - `http://127.0.0.1:3000/` for local development
   - or your deploy URL, e.g. `https://spin-the-dial.vercel.app/`

   It is just the URL the app is served from — origin and path, nothing else — because that is
   what the app sends as `redirect_uri`. Copy it from the address bar if in doubt. The app no
   longer displays it, so a mismatch shows up as Spotify declining the sign-in.
4. API used: **Web API**. Save.
5. While the app is in Development Mode, add your own Spotify account under **User Management**.

## 2. Set the Client ID

### Shared deploy (recommended — everyone signs in individually)

Put the ID in the environment:

```sh
cp .env.example .env.local
# NEXT_PUBLIC_SPOTIFY_CLIENT_ID=3f9a2c...
```

For a hosted deploy, set the same variable in your host's dashboard (Vercel, Netlify, …).

A Client ID is public by design — PKCE uses no client secret, so there is nothing to hide.
`NEXT_PUBLIC_` is therefore the correct prefix here, not a leak. With it set, the first screen
skips the input entirely: each visitor presses **Connect Spotify** and authorises their *own*
account. Tokens and history never leave their browser, and no user sees another user's data.

Two overrides are honoured automatically, both useful for testing a second app:
`<meta name="spotify-client-id" content="...">` in the page, or `?client_id=...` in the URL.

**Development Mode limit — read this before sharing the link.** Only accounts you add by hand
under **User Management** can sign in. Everyone else gets a 403, which the app reports plainly.
Since February 2026 that ceiling is **5 users** for newly created apps (apps created before
9 March 2026 keep their old, higher count), and the app stops working if the owner's Spotify
**Premium** subscription lapses.

Extended Quota Mode is what removes the allowlist, but since 15 May 2025 it is closed to
individuals: it needs a legally registered business, a launched service, **250k monthly active
users**, and availability in key markets. Treat it as unavailable for a personal project.

So one shared app cannot serve arbitrary visitors, and this one does not try to. It runs as an
invite-only app: add the people you want under **User Management**, using the email on their
Spotify account. Anyone else who presses Connect gets told, in as many words, that their account
needs adding and who to ask — the app detects the all-requests-403 shape specifically rather than
dumping API detail at them.

**The way round it is Last.fm** (below). It has no allowlist, no approval step, and no OAuth, so
anyone with a public Last.fm profile can use the app immediately — no involvement from you.

Failing that, the per-person route below still works: someone brings their own Client ID and is
the sole allowlisted user of their own app. That needs Premium and a few minutes in the developer
dashboard, so it suits a technical friend, not a stranger following a link.

## 3. Add Last.fm (optional, but it removes the allowlist problem)

Create a key at [last.fm/api/account/create](https://www.last.fm/api/account/create) and set:

```sh
NEXT_PUBLIC_LASTFM_API_KEY=...
```

That is the only variable it needs, and it is public by design like the Client ID. Last.fm also
issues a **shared secret** — this app neither uses nor wants it. The secret is only required for
`auth.getSession`, meaning private profiles and scrobbling, which need requests signed on a
server. Reading a public profile takes a key and a username, and Last.fm's API sends
`Access-Control-Allow-Origin: *`, so the call goes straight from the browser and the app stays
backend-free. Never put the secret in a `NEXT_PUBLIC_` variable: those ship to the browser.

Unset the key and the Last.fm option simply isn't offered. Set either provider, or both.

### Or paste it per-person

Leave the variable unset and the first screen asks for the ID under
**"Paste your Spotify Client ID here ↓"**. It's remembered in `localStorage` under
`spinthedial.clientId` for convenience (an ID is public, not a secret).

## What it does

- **OAuth 2.0 Authorization Code + PKCE**, no client secret, no backend. The `code_verifier`
  and `state` live in `sessionStorage` only for the duration of the redirect and are deleted
  on return.
- **Tokens are in memory only** (never persisted) — held in a ref, not in state or storage.
  Refresh happens automatically ~30s before expiry and on any `401`. Because the refresh token
  is also memory-only, a page reload means signing in again — that's the intended trade-off.
- **Scopes:** `user-top-read`, `user-read-recently-played`.
- **Last.fm as a second source:** `user.getTopArtists` over `1month` / `6month` / `overall` plus
  `user.getRecentTracks`, de-duplicated by name because Last.fm's `mbid` is often missing. Those
  periods line up with Spotify's short / medium / long term, so the recency flags, the forgotten
  filter and the round counter all behave identically. A username is remembered in `localStorage`
  under `spinthedial.lastfmUser`; it is not a credential.
- **Artist images always come from Spotify**, whichever source filled the pool. Spotify's own
  history covers most of it, but two cases arrive without an image: artists seen only in
  recently-played (the simplified artist object has none) and everything from Last.fm (their API
  returns a placeholder star). Those are looked up through Spotify's **oEmbed** endpoint, which
  is public, CORS-open and needs no token — `/v1/search` would need OAuth, and Client Credentials
  would need a server to hold the client secret. oEmbed only takes an artist ID, so Last.fm
  artists are resolved via their MusicBrainz ID first, which is why `mbid` is carried through the
  pool (96–98% of Last.fm artists have one). oEmbed hands back a small thumbnail, but Spotify
  encodes the size in the image path, so the largest variant is requested and *verified by
  loading it* before use — a wrong guess keeps the thumbnail rather than breaking the card.
  MusicBrainz answers 503 when pushed, so lookups are serialised at ~1/second, retried once, and
  each mbid→Spotify-ID mapping is cached in `localStorage` (it never changes), meaning an artist
  costs MusicBrainz one request ever rather than one per session.
- **Coverage is about 70% on a long-tail library**, and higher on a mainstream one. The limit is
  MusicBrainz: obscure artists often have no Spotify relation at all (Falloch, for one, has nine
  relations and none of them Spotify), and no chain of public databases fixes that — Wikidata and
  Deezer links are missing too. Closing it would mean Spotify's own `/v1/search`, which needs a
  token, which needs a server to hold the client secret. Deliberately not done: the app stays
  static and secret-free, and a miss falls back to a patterned card instead.
- **The no-photo card is patterned from the artist's name** — angle and stripe rhythm derived
  from a small hash, so it is stable for that artist and different from the next. A missing image
  then reads as a designed sleeve rather than a failure.
- **What Last.fm still cannot give:** genres, since tags cost one request per artist. The chip
  row hides itself when nothing is tagged. Play artist opens a Spotify *search* for the name,
  since Last.fm hands over no Spotify IDs.
- **Artist pool:** `/me/top/artists` for `short_term`, `medium_term`, `long_term` (50 each)
  plus artists extracted from `/me/player/recently-played` (50 tracks), de-duplicated by
  artist ID. Requests run in parallel; partial failures are reported and the app spins on
  whatever came back.
- **Narrow the spin:** *Dig up something forgotten* removes every artist that appears in your
  last 50 played tracks or in your `short_term` top artists, so the only ones left are from the
  `medium_term` and `long_term` charts — artists you clearly listened to enough to chart, but
  haven't reached for lately. The genre chips are the six most common words across the genre tags
  of *those* least-played artists, not of the pool at large — so they point at the corners of your
  library that have gone quiet instead of at whatever is already on repeat. (If those artists
  carry no genre tags, the chips fall back to the whole pool and the label says so; if nothing in
  the pool is tagged, the row stays hidden.) Both filters compose, and the count under them says
  what's left.
- **Spin:** uniform random pick from the artists not yet drawn this round, revealing name,
  image, genres, and how recently they turned up in your history.
- **Play artist** → opens `spotify:artist:{id}`, their page in Spotify, where you press play.
  Last.fm gives no Spotify IDs, but the image lookup already establishes one for most artists, so
  that ID drives this button too and the real artist page opens either way. Only when no ID can be
  found does it fall back to a name search — and that fallback is **web-only on purpose**: the
  desktop client accepts `spotify:search:<query>` but ignores the query and lands on its
  recent-searches page, so a target with no usable `spotify:` URI skips the client hop entirely.
- **Links:** desktop tries the `spotify:` URI and falls back to `open.spotify.com` after
  1.4s if the page is still visible (a hidden page means the app took over); mobile goes
  straight to the `open.spotify.com` URL, which universal-links into the app. If a pop-up
  blocker vetoes the new tab, the current tab navigates instead, so a click is never silently
  swallowed.

## Honest failure states

- No Client ID → clear prompt, no spin.
- Empty history → says so instead of showing an empty dial.
- `401` → silent refresh, then re-auth prompt. `429` → shows the `Retry-After` wait. Any other
  refusal quotes Spotify's own `error.message` rather than guessing at a cause — a `403` on one
  endpoint while the rest work is usually the request, not the account, so the Development Mode
  user-list hint is offered only as a possibility.
- Sign-in declined, a lost PKCE verifier, or a `state` mismatch each get their own message,
  and the callback parameters are stripped from the URL either way.

## Accessibility & motion

Keyboard-operable throughout, with a visible focus ring on every control, `aria-pressed` on the
filter toggles, and the loading/error region announced via `role="alert"`.
`prefers-reduced-motion` skips the spin animation and the tick sounds — the reveal is immediate.
Layout is fluid from 320px up.

## Project layout

```
app/
  layout.tsx                  document shell, metadata, SEO, JSON-LD, Host Grotesk
  page.tsx                    renders the client app
  globals.css                 reset + base type
  opengraph-image.png         1200x630 social card (+ .alt.txt)
  robots.ts                   indexable in production, noindex on previews
  sitemap.ts                  one screen, one URL
components/
  spin-the-dial.tsx           header, lead line, error region, phase switch, footer
  logo.tsx                    the wordmark, inlined from uploads/logo.svg
  setup-panel.tsx             Client ID and connect
  dial-panel.tsx              filters, spin button, rolling names
  reveal-panel.tsx            artist card and launch buttons
  spin-the-dial.module.css    all styling for the three faces
hooks/
  use-spin-the-dial.ts        the state machine: auth, pool, spin, launch
public/
  favicon-light.svg           mark for light browser chrome
  favicon-dark.svg            mark for dark browser chrome
  apple-touch-icon.png        180x180, iOS takes no SVG
lib/
  spotify.ts                  PKCE, token handling, Web API client
  lastfm.ts                   public-profile reads, no auth and no secret
  artist-image.ts             official Spotify images via oEmbed, no token needed
  pool.ts                     pool building, filtering, genre chips
  config.ts                   where the Client ID and Last.fm key come from
  browser.ts                  reduced motion, framing, Spotify hand-off
  audio.ts                    the tick track under a spin
  settings.ts                 spin duration
  site.ts                     resolves the deploy URL and whether to allow indexing
```

The state machine has four phases — `setup`, `loading`, `dial`, `reveal` — and one screen with
three faces. `lib/` is pure and browser-agnostic apart from the `window` probes in `browser.ts`.

Type is [Host Grotesk](https://fonts.google.com/specimen/Host+Grotesk), loaded through
`next/font/google`, so it is self-hosted at build time with a size-matched fallback — no request
to Google at runtime and no layout shift.

## Deploying to Vercel

Import the repo and deploy — the framework is detected, every route prerenders, and there are no
server routes or secrets to configure. Then two things:

**1. Set `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`** in Project → Settings → Environment Variables, and
`NEXT_PUBLIC_LASTFM_API_KEY` too if you want the Last.fm option. Both are inlined at build time,
so setting either needs a redeploy to take effect. Nothing else is required:
`NEXT_PUBLIC_SITE_URL` is optional, because `lib/site.ts` falls back to Vercel's own
`VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, which are injected automatically. Set it anyway
once you put a custom domain in front, so the canonical link points at the domain you want.

**2. Register the redirect URI** on the Spotify app — exactly `https://your-domain.vercel.app/`,
with the trailing slash, since the app sends `origin + pathname`. The URI is shown on the first
screen if in doubt.

> **Preview deploys cannot sign in.** Every preview gets a fresh generated URL, and Spotify only
> accepts redirect URIs registered ahead of time. Either add that specific preview URL to the
> Spotify app, or test sign-in on production and locally. Everything up to pressing **Connect
> Spotify** works fine on a preview.

Preview deploys are also served `noindex` and a `Disallow: /` robots file, so they cannot compete
with the production URL in search results. `robots.txt` and `sitemap.xml` are generated from the
resolved site URL, and `VERCEL_ENV` is what distinguishes production from a preview.

Two response headers are set in `next.config.mjs`: `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`. There is deliberately no CSP (Next's
hydration needs inline script) and no `X-Frame-Options` (the app detects framing itself, to
explain that sign-in cannot complete inside a preview frame).

### Anywhere else

Any static-capable Next host works the same way:

```sh
npm run build && npm start
```

Off Vercel, set `NEXT_PUBLIC_SITE_URL` yourself — without it the canonical link and social-card
URLs point at `127.0.0.1`, which no share preview can fetch. Both `NEXT_PUBLIC_` variables are
inlined at build time, so changing either needs a rebuild.

## Branding & metadata

The mark and wordmark come from `uploads/`. `logo.svg` is inlined as `components/logo.tsx` so it
costs no request and takes its colour from the surrounding text; it sits in the `h1`, with the
heading's real text kept for crawlers and screen readers since the wordmark itself is a graphic.

The favicon is a pair of SVGs chosen by `media="(prefers-color-scheme: …)"` — the white mark for
dark browser chrome, the black one for light. `apple-touch-icon.png` is a rasterised 180×180
fallback, because iOS accepts no SVG there and does not adapt to theme, so the dark background is
baked in.

`app/opengraph-image.png` uses Next's file convention, which emits the absolute URL, dimensions,
and type, and doubles as the X/Twitter card image via `summary_large_image`. Alt text lives in
`app/opengraph-image.alt.txt`. Beyond the usual title/description/canonical, `app/layout.tsx`
carries `WebApplication` JSON-LD naming the author, so the credit is machine-readable as well as
visible in the footer.

## Credits

Made by [Luis Hermosilla](https://www.luigiht.com), a lead experience designer based in London.

## The original single-file version

This started as one self-contained HTML file, kept for reference as `Spin the Dial.dc.html` with
its `support.js` runtime. It is superseded by the app above, and `.vercelignore` keeps both out of
deploys.

Its `config.js` is deliberately untracked: it carries a Client ID in plain sight and nothing in
the Next.js app reads it. To run the old file, write one yourself —
`window.SPIN_THE_DIAL_CONFIG = { clientId: "…" };`
