/* Where this deploy lives, for canonical links, social-card URLs, robots and the sitemap.
 *
 * Server-side only: layout metadata, robots.ts and sitemap.ts all render on the server, so
 * these can be plain env vars rather than NEXT_PUBLIC_ ones. Do not import this from a client
 * component — the Vercel variables would simply be undefined there. */

/**
 * Vercel sets these automatically at build time, so a deploy needs no configuration to get
 * its own URLs right. Previews point at themselves (so a shared preview link previews itself);
 * production uses the stable project domain rather than the deployment-specific one.
 */
function vercelUrl(): string {
  const env = process.env.VERCEL_ENV;
  const deployment = process.env.VERCEL_URL;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (env && env !== 'production' && deployment) return `https://${deployment}`;
  if (production) return `https://${production}`;
  if (deployment) return `https://${deployment}`;
  return '';
}

/** An explicit NEXT_PUBLIC_SITE_URL always wins; otherwise Vercel's own, otherwise dev. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || vercelUrl() || 'http://127.0.0.1:3000';

/**
 * Only the production deploy should be indexable — preview URLs competing with the real one
 * is the classic Vercel SEO leak. Anywhere that is not Vercel is assumed to be the real thing.
 */
export const IS_INDEXABLE = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : true;
