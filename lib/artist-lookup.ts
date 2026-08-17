/* Resolving an artist's Spotify identity — the artist ID, and from it the official image.
 *
 * The Spotify path already gets images from /me/top/artists, but two cases don't: artists seen
 * only in recently-played (the simplified artist object carries no images) and everything from
 * Last.fm (their API returns a placeholder star). Both are filled in here.
 *
 * No token, no secret, no backend. /v1/search would need OAuth, and Client Credentials would
 * need a server to hold the client secret — but Spotify's oEmbed endpoint is public, sends
 * `Access-Control-Allow-Origin: *`, and hands back an image on Spotify's own CDN. It only needs
 * an artist ID, so Last.fm artists are resolved through their MusicBrainz ID first.
 *
 * The ID is worth as much as the image: it turns Play artist into a real artist link rather than
 * a search. Every step fails soft — a miss leaves the patterned placeholder and a search link. */

const OEMBED = 'https://open.spotify.com/oembed?url=';
const MUSICBRAINZ = 'https://musicbrainz.org/ws/2/artist/';

/**
 * oEmbed returns a small thumbnail, but Spotify encodes the size in the image path, so the
 * same asset is available larger. Verified pairs, by family:
 *   ab677269… 00008f74 =   64px  →  0000c46c = 1000px   (artist header, confirmed live)
 *   ab676161… 00005174 =  320px  →  0000e5eb =  640px   (artist art, confirmed live)
 *   ab67616d… 00001e02 =  300px  →  0000b273 =  640px   (album art, by convention only)
 * All undocumented, which is why the load check below decides rather than the constant: a wrong
 * guess simply keeps the thumbnail instead of showing a broken card.
 */
const SIZE_UPGRADES: readonly (readonly [string, string])[] = [
  ['00008f74', '0000c46c'],
  ['00005174', '0000e5eb'],
  ['00001e02', '0000b273'],
];

/** Resolves true only once the browser has actually decoded the image. */
function loads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
}

/** Swap in the larger size when it really exists, otherwise keep the thumbnail. */
async function largest(thumbnail: string): Promise<string> {
  for (const [small, large] of SIZE_UPGRADES) {
    if (!thumbnail.includes(small)) continue;
    const bigger = thumbnail.replace(small, large);
    return (await loads(bigger)) ? bigger : thumbnail;
  }
  return thumbnail;
}

async function imageForSpotifyId(spotifyId: string): Promise<string> {
  try {
    const url = `${OEMBED}${encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`)}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data?.thumbnail_url === 'string' ? largest(data.thumbnail_url) : '';
  } catch {
    return '';
  }
}

/* MusicBrainz asks for no more than about one request a second and answers 503 when pushed —
 * which a run of quick spins will do. Lookups are therefore serialised through a queue that
 * keeps a minimum gap, and a 503 is retried once, since it means "slow down" and not "no such
 * artist". (It also asks for a descriptive User-Agent, which a browser will not let us set.) */
const MB_MIN_GAP_MS = 1100;
let mbQueue: Promise<unknown> = Promise.resolve();
let mbLastAt = 0;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    const gap = MB_MIN_GAP_MS - (Date.now() - mbLastAt);
    if (gap > 0) await pause(gap);
    mbLastAt = Date.now();
    return task();
  };
  // Run regardless of how the previous lookup settled, but keep them strictly in order.
  const result = mbQueue.then(run, run);
  mbQueue = result.catch(() => undefined);
  return result;
}

/* An artist's MusicBrainz-to-Spotify mapping never changes, so it is worth remembering across
 * visits: each artist then costs MusicBrainz one request ever rather than one per session, which
 * is what keeps this off their rate limit. Only successes are stored, so a 503 retries later. */
const ID_CACHE_KEY = 'spinthedial.spotifyIdByMbid';

function readIdCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ID_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeIdCache(mbid: string, spotifyId: string): void {
  try {
    localStorage.setItem(ID_CACHE_KEY, JSON.stringify({ ...readIdCache(), [mbid]: spotifyId }));
  } catch {
    /* private mode or a full quota — the lookup simply happens again next time */
  }
}

/**
 * A MusicBrainz ID is exact, which is why Last.fm's `mbid` is worth keeping: it avoids
 * searching by name and choosing between artists who share one.
 */
function spotifyIdForMbid(mbid: string): Promise<string> {
  const cached = readIdCache()[mbid];
  if (cached) return Promise.resolve(cached);

  const lookup = () => fetch(`${MUSICBRAINZ}${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`);

  return queued(async () => {
    try {
      let res = await lookup();
      if (res.status === 503) {
        await pause(MB_MIN_GAP_MS);
        mbLastAt = Date.now();
        res = await lookup();
      }
      if (!res.ok) return '';
      const data = await res.json();
      const relation = (data?.relations ?? [])
        .map((r: { url?: { resource?: string } }) => r?.url?.resource ?? '')
        .find((resource: string) => resource.includes('open.spotify.com/artist/'));
      if (!relation) return '';

      const spotifyId = relation.split('/artist/')[1].split(/[?#]/)[0];
      if (spotifyId) writeIdCache(mbid, spotifyId);
      return spotifyId;
    } catch {
      return '';
    }
  });
}

export interface ResolvedArtist {
  /** Spotify artist ID, or '' when it could not be established. */
  spotifyId: string;
  /** Official Spotify image URL, or '' when there is none to be had. */
  image: string;
}

/** Everything we can learn about an artist from Spotify without holding a token. */
export async function resolveArtist(artist: {
  spotifyId?: string;
  mbid?: string;
}): Promise<ResolvedArtist> {
  const spotifyId = artist.spotifyId || (artist.mbid ? await spotifyIdForMbid(artist.mbid) : '');
  return { spotifyId, image: spotifyId ? await imageForSpotifyId(spotifyId) : '' };
}
