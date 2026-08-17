/* Turning Spotify history into a pool of artists, and narrowing it down. */

import type {
  RecentlyPlayedResponse,
  SpotifyArtist,
  SpotifyImage,
  TopArtistsResponse,
} from './spotify';

/** An artist on the dial, tagged with how recently it turned up in your history. */
export interface PoolArtist {
  id: string;
  name: string;
  genres: string[];
  images: SpotifyImage[];
  /** Appeared in the last 50 played tracks. */
  recent: boolean;
  /** Appeared in the short-term (roughly last month) top artists. */
  shortTerm: boolean;
}

export interface Filters {
  excluded: string[];
  forgotten: boolean;
  genre: string | null;
}

/** Genre words too common or too vague to be worth a filter chip. */
const STOP_WORDS = ['music', 'and', 'the', 'pop', 'contemporary', 'modern'];

export interface PoolResult {
  pool: PoolArtist[];
  /** How many of the history requests rejected. */
  failed: number;
  /** Message from the first rejection, for reporting a partial load. */
  firstError: string;
}

/**
 * Merge the three top-artist ranges plus recently-played into one de-duplicated pool.
 * Partial failures are counted rather than thrown: the dial spins on whatever came back.
 */
export function buildPool(
  results: PromiseSettledResult<TopArtistsResponse | RecentlyPlayedResponse>[],
): PoolResult {
  const byId = new Map<string, PoolArtist>();
  let failed = 0;
  let firstError = '';

  const add = (artist: SpotifyArtist | undefined | null, flags: { recent?: boolean; shortTerm?: boolean }) => {
    if (!artist || !artist.id) return;
    const existing = byId.get(artist.id);
    if (existing) {
      existing.recent = existing.recent || !!flags.recent;
      existing.shortTerm = existing.shortTerm || !!flags.shortTerm;
      if (!existing.genres.length && artist.genres?.length) existing.genres = artist.genres;
      if (!existing.images.length && artist.images?.length) existing.images = artist.images;
      return;
    }
    byId.set(artist.id, {
      id: artist.id,
      name: artist.name,
      genres: artist.genres ?? [],
      images: artist.images ?? [],
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
    // 0..2 are the top-artist time ranges (short, medium, long); 3 is recently-played.
    if (index < 3) {
      const items = (result.value as TopArtistsResponse).items ?? [];
      items.forEach((artist) => add(artist, { shortTerm: index === 0 }));
      return;
    }
    const items = (result.value as RecentlyPlayedResponse).items ?? [];
    items.forEach((item) => {
      item?.track?.artists?.forEach((artist) => add(artist, { recent: true }));
    });
  });

  return { pool: Array.from(byId.values()), failed, firstError };
}

/** The artists still eligible for the next spin. */
export function filterPool(pool: PoolArtist[], filters: Filters): PoolArtist[] {
  return pool.filter((artist) => {
    if (filters.excluded.includes(artist.id)) return false;
    if (filters.forgotten && (artist.recent || artist.shortTerm)) return false;
    if (filters.genre && !artist.genres.some((g) => g.includes(filters.genre!))) return false;
    return true;
  });
}

/**
 * The artists showing no sign of recent play — nothing from the last 50 tracks, nothing
 * in this month's top. The same set `forgotten` keeps, and the source for genre chips.
 */
export function leastPlayed(pool: PoolArtist[]): PoolArtist[] {
  return pool.filter((artist) => !artist.recent && !artist.shortTerm);
}

/** The most common words across a set of artists' genre tags, as filter chips. */
export function topGenreWords(pool: PoolArtist[], limit = 6): string[] {
  const counts = new Map<string, number>();
  pool.forEach((artist) =>
    artist.genres.forEach((genre) =>
      genre.split(/[\s-]+/).forEach((word) => {
        if (word.length < 3 || STOP_WORDS.includes(word)) return;
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }),
    ),
  );
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/** Pick the image the reveal card uses — the second size when there is one. */
export function artistImage(artist: PoolArtist | null): string {
  if (!artist?.images.length) return '';
  return artist.images[artist.images.length > 1 ? 1 : 0].url;
}
