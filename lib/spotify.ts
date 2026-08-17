/* Spotify auth + Web API, browser only.
 *
 * OAuth 2.0 Authorization Code + PKCE: no client secret, no backend, no token proxy.
 * The verifier and state live in sessionStorage only for the duration of the redirect;
 * tokens never leave memory.
 */

const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

export const SCOPES = 'user-top-read user-read-recently-played';

export const CID_KEY = 'spinthedial.clientId';
export const V_KEY = 'spinthedial.verifier';
export const S_KEY = 'spinthedial.state';

export interface TokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists?: SpotifyArtist[];
}

export interface TopArtistsResponse {
  items?: SpotifyArtist[];
}

export interface RecentlyPlayedResponse {
  items?: { track?: SpotifyTrack | null }[];
}

/** Thrown when a request finished but Spotify refused it. */
export class SpotifyError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
  }
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let raw = '';
  new Uint8Array(digest).forEach((b) => {
    raw += String.fromCharCode(b);
  });
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Where Spotify sends the user back — must be registered on the app, path included. */
export function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

/** The client URI and web-player URL for an artist. */
export function artistTargets(id: string): { uri: string; web: string } {
  return { uri: `spotify:artist:${id}`, web: `https://open.spotify.com/artist/${id}` };
}

/**
 * Build the authorize URL and stash the PKCE verifier + state for the return trip.
 * Throws if the browser blocks session storage, which PKCE cannot work without.
 */
export async function authorizeUrl(clientId: string): Promise<string> {
  const verifier = randomString(64);
  const state = randomString(16);
  try {
    sessionStorage.setItem(V_KEY, verifier);
    sessionStorage.setItem(S_KEY, state);
  } catch {
    throw new Error('This browser is blocking session storage, which PKCE needs to finish the sign-in.');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
    scope: SCOPES,
    state,
  });
  return `${AUTH}?${params.toString()}`;
}

/** Read and clear the one-shot PKCE values left behind before the redirect. */
export function takePkceValues(): { verifier: string; state: string } {
  let verifier = '';
  let state = '';
  try {
    verifier = sessionStorage.getItem(V_KEY) || '';
    state = sessionStorage.getItem(S_KEY) || '';
    sessionStorage.removeItem(V_KEY);
    sessionStorage.removeItem(S_KEY);
  } catch {
    /* storage unavailable — treated as a lost verifier by the caller */
  }
  return { verifier, state };
}

/** Spotify's own reason for refusing a request, if it sent one. */
async function detail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const message =
      data?.error?.message ?? data?.error_description ?? (typeof data?.error === 'string' ? data.error : '');
    return message ? ` — ${message}` : '';
  } catch {
    return '';
  }
}

async function postToken(body: URLSearchParams): Promise<TokenPayload> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new SpotifyError(data.error_description || data.error || 'token request failed', res.status);
  }
  return data as TokenPayload;
}

export function exchangeCode(clientId: string, code: string, verifier: string): Promise<TokenPayload> {
  return postToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  );
}

/**
 * Access + refresh token holder. Memory only, never persisted: a page reload means
 * signing in again, which is the intended trade-off for keeping nothing on disk.
 */
export class SpotifySession {
  readonly clientId: string;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;

  constructor(clientId: string, payload?: TokenPayload) {
    this.clientId = clientId;
    if (payload) this.adopt(payload);
  }

  get signedIn(): boolean {
    return !!this.accessToken;
  }

  adopt(payload: TokenPayload): void {
    this.accessToken = payload.access_token;
    if (payload.refresh_token) this.refreshToken = payload.refresh_token;
    this.expiresAt = Date.now() + (payload.expires_in || 3600) * 1000;
  }

  clear(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) throw new SpotifyError('session expired — connect again');
    this.adopt(
      await postToken(
        new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
      ),
    );
  }

  /** GET a Web API path, refreshing ~30s before expiry and once on any 401. */
  async get<T>(path: string, retry = true): Promise<T> {
    if (!this.accessToken) throw new SpotifyError('not signed in');
    if (Date.now() > this.expiresAt - 30_000) await this.refresh();

    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${this.accessToken}` } });

    if (res.status === 401 && retry) {
      await this.refresh();
      return this.get<T>(path, false);
    }
    if (res.status === 429) {
      const wait = res.headers.get('Retry-After') || '30';
      throw new SpotifyError(`Spotify rate-limited this app. Wait ${wait}s and retry.`, 429);
    }
    if (res.status === 403) {
      // Do not assume the cause. A 403 on one endpoint while others work is usually the
      // request, not the account — Spotify's own message is the useful part.
      throw new SpotifyError(
        `Spotify returned 403 for ${path}${await detail(res)}. If every request fails, your account needs adding to the app’s user list (Development Mode allows 25).`,
        403,
      );
    }
    if (!res.ok) {
      throw new SpotifyError(`Spotify returned ${res.status} for ${path}${await detail(res)}`, res.status);
    }
    return res.json() as Promise<T>;
  }
}
