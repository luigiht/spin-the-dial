/* A texture for artists with no photo.
 *
 * Roughly a third of Last.fm artists cannot be matched to a Spotify image (MusicBrainz has no
 * Spotify link for the deep long tail), so this card is not a rare edge case. Deriving the
 * pattern from the artist's name means each one gets its own angle and rhythm — consistent for
 * that artist, distinct from the next — so a missing photo reads as a designed sleeve rather
 * than a gap where an image failed. Same palette as everything else; no new colours. */

const ANGLES = [30, 45, 60, 75, 105, 120, 135, 150];

/** Small deterministic hash. Stable across reloads, which is the whole point. */
function hash(seed: string): number {
  let value = 0;
  for (let i = 0; i < seed.length; i++) {
    value = (value * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(value);
}

export function placeholderPattern(seed: string): string {
  const h = hash(seed || 'spin the dial');
  const angle = ANGLES[h % ANGLES.length];
  const period = 16 + ((h >> 3) % 12); // 16–27px, so the weight varies too
  const half = period / 2;
  return `repeating-linear-gradient(${angle}deg, #1a1a1a 0 ${half}px, #131313 ${half}px ${period}px)`;
}
