/* Where the Spotify Client ID comes from. */

import { CID_KEY } from './spotify';

/**
 * A deploy-wide Client ID, inlined at build time. Safe to read during SSR, so the
 * first paint already knows whether the paste field is needed.
 */
export const ENV_CLIENT_ID = (process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? '').trim();

/**
 * Last.fm API key for the deploy. Public by design, like the Spotify Client ID: read-only
 * calls carry it in the query string. Unset means the Last.fm option is simply not offered.
 * No shared secret — see lib/lastfm.ts.
 */
export const LASTFM_API_KEY = (process.env.NEXT_PUBLIC_LASTFM_API_KEY ?? '').trim();

/**
 * The deploy-wide ID, including the two browser-only overrides:
 *   <meta name="spotify-client-id" content="..."> and ?client_id=... in the URL.
 * With any of these set, visitors never see the paste field — they just sign in.
 */
export function configuredClientId(): string {
  if (ENV_CLIENT_ID) return ENV_CLIENT_ID;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="spotify-client-id"]');
  if (meta?.content.trim()) return meta.content.trim();

  const fromQuery = new URLSearchParams(window.location.search).get('client_id');
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();

  return '';
}

/** A hand-pasted ID from a previous visit. An ID is public, not a secret. */
export function savedClientId(): string {
  try {
    return localStorage.getItem(CID_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberClientId(id: string): void {
  try {
    localStorage.setItem(CID_KEY, id);
  } catch {
    /* private mode — the ID just won't be remembered */
  }
}

const LFM_USER_KEY = 'spinthedial.lastfmUser';

/** A username is not a credential, so it is worth remembering between visits. */
export function savedLastfmUser(): string {
  try {
    return localStorage.getItem(LFM_USER_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberLastfmUser(user: string): void {
  try {
    localStorage.setItem(LFM_USER_KEY, user);
  } catch {
    /* private mode — the username just won't be remembered */
  }
}
