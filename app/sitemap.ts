import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/** One screen, one URL. No `lastModified`, so builds stay reproducible. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: 'monthly', priority: 1 }];
}
