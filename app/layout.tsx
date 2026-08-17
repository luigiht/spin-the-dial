import type { Metadata, Viewport } from 'next';
import { Host_Grotesk } from 'next/font/google';

import { IS_INDEXABLE, SITE_URL } from '@/lib/site';

import './globals.css';

const hostGrotesk = Host_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-host-grotesk',
});

const NAME = 'Spin the Dial';
const TAGLINE = 'A random artist out of everything you actually listen to';
const DESCRIPTION =
  'Connect Spotify, build a pool of the artists you actually listen to, and let the dial pick one. ' +
  'Narrow it down to the corners of your library that have gone quiet, then open them in Spotify. ' +
  'Runs entirely in your browser: no backend, no stored tokens.';

const AUTHOR = {
  name: 'Luis Hermosilla',
  url: 'https://www.luigiht.com',
  jobTitle: 'Lead Experience Designer',
  city: 'London',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${NAME} — ${TAGLINE}`, template: `%s — ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
  creator: AUTHOR.name,
  publisher: AUTHOR.name,
  category: 'music',
  keywords: [
    'Spotify',
    'music discovery',
    'random artist picker',
    'artist roulette',
    'listening history',
    'rediscover your music library',
    'Spotify Web API',
    'PKCE',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: NAME,
    title: `${NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  icons: {
    // Two SVG marks, picked by the browser's own theme rather than the page's.
    icon: [
      { url: '/favicon-light.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/favicon-dark.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
    ],
    // iOS home screens take no SVG, and do not adapt to theme.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Preview deploys stay out of the index so they cannot compete with the real URL.
  robots: { index: IS_INDEXABLE, follow: IS_INDEXABLE },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0b',
  colorScheme: 'dark',
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: NAME,
  alternateName: TAGLINE,
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript and a Spotify account',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  author: {
    '@type': 'Person',
    name: AUTHOR.name,
    url: AUTHOR.url,
    jobTitle: AUTHOR.jobTitle,
    address: { '@type': 'PostalAddress', addressLocality: AUTHOR.city, addressCountry: 'GB' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={hostGrotesk.variable}>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
