# Spin the Dial

A Next.js app: connect Spotify, build a pool of artists you actually listen to, spin a dial, and
launch that artist in Spotify. Everything happens in the browser — there is no backend, no
database, and no token proxy.

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

   The app prints the exact URI to paste, under "Redirect URI to register".
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

**Development Mode limit:** until Spotify approves an extended-quota request, only accounts you
add under **User Management** (25 max) can sign in — everyone else gets a 403, which the app
reports plainly. Extended quota removes the allowlist.

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
  The reveal needs nothing beyond the pool it already has, so no per-artist request is made and
  there is no second call left to fail.
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
  pool.ts                     pool building, filtering, genre chips
  config.ts                   where the Client ID comes from
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

**1. Set `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`** in Project → Settings → Environment Variables. It is
inlined at build time, so setting it needs a redeploy to take effect. Nothing else is required:
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
