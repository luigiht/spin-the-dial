'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveArtist, type ResolvedArtist } from '@/lib/artist-lookup';
import { playSpinClicks } from '@/lib/audio';
import { cleanUrl, isFramed, openSpotify, prefersReducedMotion } from '@/lib/browser';
import {
  configuredClientId,
  ENV_CLIENT_ID,
  LASTFM_API_KEY,
  rememberClientId,
  rememberLastfmUser,
  savedClientId,
  savedLastfmUser,
} from '@/lib/config';
import { loadLastfmPool } from '@/lib/lastfm';
import {
  artistImage,
  buildPool,
  filterPool,
  leastPlayed,
  topGenreWords,
  type PoolArtist,
} from '@/lib/pool';
import { SPIN_DURATION_MS } from '@/lib/settings';
import {
  artistTargets,
  authorizeUrl,
  searchTargets,
  exchangeCode,
  SpotifySession,
  takePkceValues,
  type RecentlyPlayedResponse,
  type TopArtistsResponse,
} from '@/lib/spotify';

export type Phase = 'setup' | 'loading' | 'dial' | 'reveal';

/** Where the current pool came from. `null` means nothing is connected. */
export type Source = 'spotify' | 'lastfm';

export interface GenreChip {
  label: string;
  active: boolean;
}

interface State {
  clientId: string;
  /** A deploy-wide ID is in play, so no one needs to paste anything. */
  configured: boolean;
  phase: Phase;
  error: string;
  source: Source | null;
  lastfmUser: string;
  pool: PoolArtist[];
  artist: PoolArtist | null;
  spinning: boolean;
  forgotten: boolean;
  genre: string | null;
  /** "Not tonight" artists, out for this session. */
  excluded: string[];
  /** Already drawn this round — the dial works through the pool before repeating. */
  drawn: string[];
}

const INITIAL: State = {
  clientId: ENV_CLIENT_ID,
  configured: !!ENV_CLIENT_ID,
  phase: 'setup',
  error: '',
  source: null,
  lastfmUser: '',
  pool: [],
  artist: null,
  spinning: false,
  forgotten: false,
  genre: null,
  excluded: [],
  drawn: [],
};

/** Everything reset by Disconnect, or by loading a fresh pool. */
const CLEARED = {
  pool: [] as PoolArtist[],
  artist: null,
  spinning: false,
  forgotten: false,
  genre: null,
  excluded: [] as string[],
  drawn: [] as string[],
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useSpinTheDial() {
  const [state, setState] = useState<State>(INITIAL);

  const session = useRef<SpotifySession | null>(null);
  const rollRef = useRef<HTMLSpanElement | null>(null);
  const spinTimer = useRef<number | undefined>(undefined);
  const rollTimer = useRef<number | undefined>(undefined);
  const started = useRef(false);

  /* What we worked out about an artist after the fact, keyed by pool id: the Spotify ID (so
   * Play artist can open the artist rather than a search) and the official image. Spotify's own
   * history supplies images for most artists; this covers the rest, and all of Last.fm. */
  const [found, setFound] = useState<Record<string, ResolvedArtist>>({});
  const lookups = useRef(new Set<string>());

  const patch = useCallback((next: Partial<State>) => {
    setState((s) => ({ ...s, ...next }));
  }, []);

  const fail = useCallback((error: string) => patch({ error }), [patch]);

  /** Work out an artist's Spotify ID and image, for artists that arrived without them. */
  const lookUp = useCallback((artist: PoolArtist) => {
    // Nothing to learn: the source gave us both already.
    if (artist.spotifyId && artistImage(artist)) return;
    if (lookups.current.has(artist.id)) return; // in flight, or already attempted
    lookups.current.add(artist.id);

    void resolveArtist(artist).then((resolved) => {
      if (resolved.spotifyId || resolved.image) {
        setFound((current) => ({ ...current, [artist.id]: resolved }));
        return;
      }
      // Could have been a transient MusicBrainz 503 rather than a genuine miss, so let a later
      // spin of the same artist try again instead of writing it off for the session.
      lookups.current.delete(artist.id);
    });
  }, []);

  /** A new pool means the old lookups are meaningless. */
  const resetLookups = useCallback(() => {
    lookups.current.clear();
    setFound({});
  }, []);

  /* ---------------------------------------------------------------- history */

  const loadPool = useCallback(async () => {
    const spotify = session.current;
    if (!spotify) return;

    patch({ phase: 'loading', error: '' });

    // In parallel; partial failures are reported and the dial spins on the rest.
    const results = await Promise.allSettled([
      spotify.get<TopArtistsResponse>('/me/top/artists?limit=50&time_range=short_term'),
      spotify.get<TopArtistsResponse>('/me/top/artists?limit=50&time_range=medium_term'),
      spotify.get<TopArtistsResponse>('/me/top/artists?limit=50&time_range=long_term'),
      spotify.get<RecentlyPlayedResponse>('/me/player/recently-played?limit=50'),
    ]);

    const { pool, failed, firstError, firstStatus } = buildPool(results);

    if (!pool.length) {
      const everythingFailed = failed === results.length;
      // Every request refused with a 403 is the expected shape of "this account is not on
      // the app's allowlist" — worth saying plainly instead of stacking up API detail.
      let error: string;
      if (everythingFailed && firstStatus === 403) {
        error =
          'Spotify refused this account. This app is in Development Mode, so only accounts added to it by hand can sign in — ask whoever runs it to add the email on your Spotify account, then connect again.';
      } else if (everythingFailed) {
        error = `Every Spotify request failed (${firstError}). Nothing to spin yet.`;
      } else {
        error = 'Spotify returned no listening history for this account yet. Play some music, then connect again.';
      }
      patch({ phase: 'setup', error });
      return;
    }

    resetLookups();
    patch({
      ...CLEARED,
      pool,
      phase: 'dial',
      source: 'spotify',
      error: failed
        ? `${failed} of ${results.length} history requests failed (${firstError}). Spinning on what came back.`
        : '',
    });
  }, [patch, resetLookups]);

  /* ------------------------------------------------------------------- auth */

  const finishSignIn = useCallback(
    async (code: string, clientId: string, returnedState: string | null) => {
      const { verifier, state: expected } = takePkceValues();
      cleanUrl();

      if (!verifier) {
        patch({
          phase: 'setup',
          error: 'Lost the PKCE verifier for this sign-in (new tab or cleared session). Press Connect again.',
        });
        return;
      }
      if (expected && returnedState && expected !== returnedState) {
        patch({ phase: 'setup', error: 'State mismatch on the callback — sign-in aborted for safety. Try again.' });
        return;
      }

      try {
        const payload = await exchangeCode(clientId, code, verifier);
        session.current = new SpotifySession(clientId, payload);
        await loadPool();
      } catch (error) {
        patch({ phase: 'setup', error: `Could not exchange the code for a token: ${message(error)}` });
      }
    },
    [loadPool, patch],
  );

  useEffect(() => {
    // Auth codes are single use, so this must not run twice under Strict Mode.
    if (started.current) return;
    started.current = true;

    const configured = configuredClientId();
    const clientId = configured || savedClientId();
    const base = { clientId, configured: !!configured, lastfmUser: savedLastfmUser() };

    const params = new URLSearchParams(window.location.search);
    const denied = params.get('error');
    const code = params.get('code');

    if (denied) {
      cleanUrl();
      patch({
        ...base,
        error: `Spotify declined the sign-in: ${denied}. Check the redirect URI matches exactly, then try again.`,
      });
      return;
    }
    if (code) {
      patch({ ...base, phase: 'loading' });
      void finishSignIn(code, clientId, params.get('state'));
      return;
    }
    patch(base);
  }, [finishSignIn, patch]);

  useEffect(
    () => () => {
      window.clearTimeout(spinTimer.current);
      window.clearTimeout(rollTimer.current);
    },
    [],
  );

  const connect = useCallback(async () => {
    const id = state.clientId.trim();
    if (!id) {
      fail('Paste your Spotify Client ID first, or set NEXT_PUBLIC_SPOTIFY_CLIENT_ID.');
      return;
    }
    if (!state.configured) rememberClientId(id);

    try {
      const url = await authorizeUrl(id);
      if (isFramed()) {
        window.open(url, '_blank', 'noopener');
        fail(
          'Spotify sign-in cannot run inside a preview frame. Open this page in its own browser tab (at the registered redirect URI) and connect there.',
        );
        return;
      }
      window.location.assign(url);
    } catch (error) {
      fail(message(error));
    }
  }, [fail, state.clientId, state.configured]);

  const disconnect = useCallback(() => {
    session.current?.clear();
    session.current = null;
    window.clearTimeout(spinTimer.current);
    window.clearTimeout(rollTimer.current);
    resetLookups();
    patch({ ...CLEARED, phase: 'setup', source: null, error: '' });
  }, [patch, resetLookups]);

  const connectLastfm = useCallback(async () => {
    const user = state.lastfmUser.trim();
    if (!user) {
      fail('Enter a Last.fm username first.');
      return;
    }
    patch({ phase: 'loading', error: '' });

    try {
      const { pool, failed, firstError } = await loadLastfmPool(user);
      if (!pool.length) {
        patch({ phase: 'setup', error: `Last.fm has no listening history for “${user}” yet.` });
        return;
      }
      rememberLastfmUser(user);
      resetLookups();
      patch({
        ...CLEARED,
        pool,
        phase: 'dial',
        source: 'lastfm',
        error: failed
          ? `${failed} of 4 Last.fm requests failed (${firstError}). Spinning on what came back.`
          : '',
      });
    } catch (error) {
      patch({ phase: 'setup', error: message(error) });
    }
  }, [fail, patch, resetLookups, state.lastfmUser]);

  /* ------------------------------------------------------------------- spin */

  const available = useMemo(
    () => filterPool(state.pool, { excluded: state.excluded, forgotten: state.forgotten, genre: state.genre }),
    [state.pool, state.excluded, state.forgotten, state.genre],
  );

  /**
   * Cycle other artists' names in the roll window, slowing to a stop on the pick.
   * Written straight to the DOM: this ticks far too often to re-render for, and the
   * element may not exist yet on the first frame after the state change.
   */
  const startRoll = useCallback((pool: PoolArtist[], pick: PoolArtist, ms: number) => {
    window.clearTimeout(rollTimer.current);
    const names = pool.map((a) => a.name).filter((name) => name !== pick.name);
    const start = performance.now();
    let i = Math.floor(Math.random() * Math.max(1, names.length));

    const step = () => {
      const el = rollRef.current;
      const t = Math.min(1, (performance.now() - start) / ms);
      if (!el) {
        if (t < 1) rollTimer.current = window.setTimeout(step, 70);
        return;
      }
      if (t >= 1 || !names.length) {
        el.textContent = pick.name;
        return;
      }
      i = (i + 1) % names.length;
      el.textContent = names[i];
      rollTimer.current = window.setTimeout(step, 55 + 340 * Math.pow(t, 3.2));
    };
    step();
  }, []);

  const spin = useCallback(() => {
    if (state.spinning) return;
    if (!available.length) {
      fail('No artists left under these filters. Clear a filter or press Not tonight fewer times.');
      return;
    }

    // Work through the pool before repeating anyone; start over once it is exhausted.
    let drawn = state.drawn;
    let undrawn = available.filter((a) => !drawn.includes(a.id));
    if (!undrawn.length) {
      drawn = [];
      undrawn = available;
    }
    const pick = undrawn[Math.floor(Math.random() * undrawn.length)];
    const nextDrawn = [...drawn, pick.id];

    // Start now, not on reveal: the lookup then overlaps the spin animation, so the image is
    // usually fetched and decoded by the time the card appears.
    lookUp(pick);

    const commit = () => {
      patch({ artist: pick, phase: 'reveal', spinning: false, drawn: nextDrawn, error: '' });
    };

    if (prefersReducedMotion()) {
      commit();
      return;
    }

    const ms = Math.max(300, SPIN_DURATION_MS);
    patch({ spinning: true, phase: 'dial', error: '' });
    playSpinClicks(ms);
    startRoll(available, pick, ms);
    window.clearTimeout(spinTimer.current);
    spinTimer.current = window.setTimeout(commit, ms + 90);
  }, [available, fail, lookUp, patch, startRoll, state.drawn, state.spinning]);

  const spinAgain = useCallback(() => {
    window.clearTimeout(spinTimer.current);
    window.clearTimeout(rollTimer.current);
    patch({ phase: 'dial', artist: null, spinning: false, error: '' });
  }, [patch]);

  const notTonight = useCallback(() => {
    setState((s) =>
      s.artist ? { ...s, excluded: [...s.excluded, s.artist.id], artist: null, phase: 'dial' } : s,
    );
  }, []);

  /* ---------------------------------------------------------------- filters */

  const toggleForgotten = useCallback(() => {
    setState((s) => ({ ...s, forgotten: !s.forgotten, error: '' }));
  }, []);

  const toggleGenre = useCallback((word: string) => {
    setState((s) => ({ ...s, genre: s.genre === word ? null : word, error: '' }));
  }, []);

  /* ----------------------------------------------------------------- launch */

  const play = useCallback(() => {
    const artist = state.artist;
    if (!artist) return;
    // A resolved ID means the real artist page; searching by name is the last resort.
    const spotifyId = artist.spotifyId || found[artist.id]?.spotifyId;
    openSpotify(spotifyId ? artistTargets(spotifyId) : searchTargets(artist.name));
  }, [found, state.artist]);

  /* ------------------------------------------------------------------- view */

  const connected = state.source !== null;
  const undrawn = available.filter((a) => !state.drawn.includes(a.id)).length;
  const artist = state.artist;

  // Chips come from the artists you have played least, so they point at the corners of
  // your library that have gone quiet rather than at whatever is already on repeat.
  // If those artists carry no genre tags, fall back to the whole pool so the row still
  // has something to offer.
  const chips = useMemo(() => {
    if (!connected) return { words: [] as string[], neglected: false };
    const words = topGenreWords(leastPlayed(state.pool));
    if (words.length) return { words, neglected: true };
    return { words: topGenreWords(state.pool), neglected: false };
  }, [connected, state.pool]);

  let leadLine: string;
  if (state.phase === 'loading') {
    leadLine = 'Building your pool from top charts and recent plays…';
  } else if (!connected) {
    // Only advertise the second route when this deploy actually has a Last.fm key.
    leadLine = LASTFM_API_KEY
      ? 'A random artist out of everything you actually listen to. Connect Spotify, or hand it a Last.fm username.'
      : 'A random artist out of everything you actually listen to. Connect Spotify to load your artists.';
  } else if (state.source === 'lastfm') {
    leadLine = `Spinning from ${available.length} artists in ${state.lastfmUser}'s Last.fm history.`;
  } else {
    leadLine = `Spinning from ${available.length} artists you actually listen to.`;
  }

  let recencyLine = '';
  if (artist?.recent) recencyLine = 'In your recent rotation.';
  else if (artist?.shortTerm) recencyLine = 'One of your top artists this month.';
  else if (artist) recencyLine = 'Not in your recent plays — from your longer-term charts.';

  const narrowNote = available.length
    ? `${available.length} artists in play${state.genre ? ` · genre: ${state.genre}` : ''}${
        state.forgotten ? ' · forgotten only' : ''
      }`
    : 'Nothing left under these filters — clear one to spin.';

  return {
    phase: state.phase,
    error: state.error,
    leadLine,
    connected,

    setup: {
      clientId: state.clientId,
      configured: state.configured,
      lastfmAvailable: !!LASTFM_API_KEY,
      lastfmUser: state.lastfmUser,
    },

    dial: {
      spinning: state.spinning,
      rollSeed: available.length ? available[0].name : '',
      rollRef,
      forgotten: state.forgotten,
      chips: chips.words.map<GenreChip>((label) => ({ label, active: state.genre === label })),
      chipsLabel: chips.neglected ? 'Genres you have been neglecting' : 'Genres in your pool',
      narrowNote,
      roundLine: `${undrawn} of ${available.length} not yet drawn this round`,
    },

    reveal: {
      artist,
      imageUrl: artistImage(artist) || (artist ? found[artist.id]?.image ?? '' : ''),
      // Empty when untagged, so the reveal can leave the line out rather than apologise for it.
      genresLine: artist?.genres.length ? artist.genres.slice(0, 4).join(' · ') : '',
      recencyLine,
      playHint: 'Opens spotify',
      launchNote:
        artist && !(artist.spotifyId || found[artist.id]?.spotifyId)
          ? 'Opens a Spotify search for them: this artist could not be matched to a Spotify page, so the search box is the honest answer.'
          : 'Opens their page in Spotify, where you can press play on anything of theirs.',
    },

    actions: {
      setClientId: (clientId: string) => patch({ clientId, error: '' }),
      setLastfmUser: (lastfmUser: string) => patch({ lastfmUser, error: '' }),
      connectLastfm,
      useDifferentId: () => patch({ configured: false, clientId: '', error: '' }),
      connect,
      disconnect,
      spin,
      spinAgain,
      notTonight,
      toggleForgotten,
      toggleGenre,
      play,
    },
  };
}

export type DialModel = ReturnType<typeof useSpinTheDial>;
