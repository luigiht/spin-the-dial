/* Small browser probes and the Spotify hand-off. All of this needs `window`. */

import { redirectUri } from './spotify';

export function prefersReducedMotion(): boolean {
  return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/** True inside an iframe — or when the check itself is blocked cross-origin. */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/** Drop `?code=`/`?error=` from the address bar after the OAuth round trip. */
export function cleanUrl(): void {
  try {
    window.history.replaceState({}, '', redirectUri());
  } catch {
    /* nothing to do if history is unavailable */
  }
}

/**
 * Open a URL in a new tab, and if a pop-up blocker vetoes that, use this tab rather
 * than letting the click do nothing at all.
 *
 * Deliberately not passing `noopener`: with that feature set, window.open() always
 * returns null, and the return value is the only way to tell a blocked pop-up from a
 * real tab. Clearing `opener` by hand gives the same protection.
 */
function openTab(url: string): void {
  let tab: Window | null = null;
  try {
    tab = window.open(url, '_blank');
  } catch {
    tab = null;
  }
  if (!tab) {
    window.location.href = url;
    return;
  }
  try {
    tab.opener = null;
  } catch {
    /* already navigated cross-origin — nothing to sever */
  }
}

/**
 * Hand off to Spotify. Desktop tries the `spotify:` URI and falls back to the web
 * player after 1.4s if nothing took over; mobile goes straight to the URL, which
 * universal-links into the app.
 */
export function openSpotify(uri: string, webUrl: string): void {
  if (isMobile() || isFramed()) {
    openTab(webUrl);
    return;
  }
  const fallback = window.setTimeout(() => {
    // A hidden page means the desktop app took over; otherwise the URI went nowhere.
    if (!document.hidden) openTab(webUrl);
  }, 1400);
  try {
    window.location.href = uri;
  } catch {
    window.clearTimeout(fallback);
    openTab(webUrl);
  }
}
