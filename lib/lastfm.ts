/* Last.fm as a second source for the artist pool.
 *
 * Read-only calls against a public profile need nothing but an API key and a username: no
 * OAuth, no token, no shared secret, and the API sends `Access-Control-Allow-Origin: *`, so
 * this runs entirely in the browser like the rest of the app. The shared secret would only be
 * needed for auth.getSession — private profiles and scrobbling — which requires MD5-signing
 * params and therefore a server. Out of scope by design.
 *
 * What Last.fm cannot give us: artist images (their API returns a placeholder star) and cheap
 * genres (tags cost one request per artist). Images are recovered from Spotify itself — see
 * lib/artist-image.ts, which is why `mbid` is kept below. Genres are simply absent, and the
 * chip row hides itself when nothing is tagged. */

import { LASTFM_API_KEY } from './config';
import type { PoolArtist, PoolResult } from './pool';

const API = 'https://ws.audioscrobbler.com/2.0/';

/** Periods lined up with Spotify's short / medium / long term ranges. */
const PERIODS = ['1month', '6month', 'overall'] as const;

export class LastfmError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'LastfmError';
    this.code = code;
  }
}

interface TopArtistsResponse {
  topartists?: { artist?: { name?: string; mbid?: string }[] };
}

/** Last.fm leaves `mbid` empty often enough to matter, so treat it as optional throughout. */
const mbidOf = (value?: string) => (value && value.length > 10 ? value : undefined);

interface RecentTracksResponse {
  // `artist` is `{"#text": name}` normally and `{name}` with extended=1; handle both.
  recenttracks?: { track?: { artist?: { '#text'?: string; name?: string; mbid?: string } }[] };
}

async function call<T>(params: Record<string, string>): Promise<T> {
  if (!LASTFM_API_KEY) throw new LastfmError('No Last.fm API key is configured for this deploy.');

  const query = new URLSearchParams({ ...params, api_key: LASTFM_API_KEY, format: 'json' });
  const res = await fetch(`${API}?${query.toString()}`);
  const data = await res.json().catch(() => null);

  // Last.fm reports failures in the body, sometimes alongside a 200.
  if (data && typeof data.error === 'number') {
    throw new LastfmError(friendly(data.error, data.message), data.error);
  }
  if (!res.ok) throw new LastfmError(`Last.fm returned ${res.status}.`);
  return data as T;
}

/** Turn Last.fm's numeric error codes into something worth reading. */
function friendly(code: number, message?: string): string {
  switch (code) {
    case 6:
      return 'No Last.fm user by that name. Check the spelling — it is the username, not the display name.';
    case 10:
    case 26:
      return 'This deploy’s Last.fm API key was rejected. Check NEXT_PUBLIC_LASTFM_API_KEY.';
    case 17:
      return 'That Last.fm profile hides its listening data. Only public profiles can be read.';
    case 29:
      return 'Last.fm is rate-limiting this app. Wait a moment and try again.';
    default:
      return message ? `Last.fm: ${message}` : `Last.fm error ${code}.`;
  }
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * Build the pool from three top-artist periods plus recent tracks, de-duplicated by name
 * since Last.fm's mbid is frequently missing. Mirrors the Spotify builder: requests run in
 * parallel and partial failures are counted rather than thrown.
 */
export async function loadLastfmPool(username: string): Promise<PoolResult> {
  const user = username.trim();

  const results = await Promise.allSettled([
    ...PERIODS.map((period) =>
      call<TopArtistsResponse>({ method: 'user.getTopArtists', user, period, limit: '50' }),
    ),
    call<RecentTracksResponse>({ method: 'user.getRecentTracks', user, limit: '50' }),
  ]);

  const byName = new Map<string, PoolArtist>();
  let failed = 0;
  let firstError = '';

  const add = (
    name: string | undefined,
    mbid: string | undefined,
    flags: { recent?: boolean; shortTerm?: boolean },
  ) => {
    const clean = name?.trim();
    if (!clean) return;
    const existing = byName.get(key(clean));
    if (existing) {
      existing.recent = existing.recent || !!flags.recent;
      existing.shortTerm = existing.shortTerm || !!flags.shortTerm;
      // Recent tracks sometimes carry an mbid where the top-artist entry did not.
      existing.mbid = existing.mbid ?? mbidOf(mbid);
      return;
    }
    byName.set(key(clean), {
      id: `lastfm:${key(clean)}`,
      name: clean,
      mbid: mbidOf(mbid),
      genres: [],
      images: [],
      recent: !!flags.recent,
      shortTerm: !!flags.shortTerm,
    });
  };

  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      failed++;
      if (!firstError) firstError = result.reason?.message || 'request failed';
      return;
    }
    if (index < PERIODS.length) {
      const artists = (result.value as TopArtistsResponse).topartists?.artist ?? [];
      // Only the 1month period counts as "currently in rotation".
      artists.forEach((artist) => add(artist.name, artist.mbid, { shortTerm: PERIODS[index] === '1month' }));
      return;
    }
    const tracks = (result.value as RecentTracksResponse).recenttracks?.track ?? [];
    tracks.forEach((track) =>
      add(track.artist?.['#text'] ?? track.artist?.name, track.artist?.mbid, { recent: true }),
    );
  });

  // Nothing succeeded, so there is no partial pool to salvage and the first error is the whole
  // story — throw it rather than have the caller wrap an already-clear message.
  if (failed === results.length) throw new LastfmError(firstError);

  return { pool: Array.from(byName.values()), failed, firstError };
}
