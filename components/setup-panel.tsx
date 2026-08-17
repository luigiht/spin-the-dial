'use client';

import type { DialModel } from '@/hooks/use-spin-the-dial';

import styles from './spin-the-dial.module.css';

interface SetupPanelProps {
  setup: DialModel['setup'];
  actions: DialModel['actions'];
}

export function SetupPanel({ setup, actions }: SetupPanelProps) {
  return (
    <section className={styles.section}>
      {setup.configured ? (
        <div className={styles.field}>
          <span className={styles.eyebrow}>Ready — app configured</span>
          <span className={styles.readyNote}>
            Sign in with your own Spotify account. Your listening history and token stay in your browser only.
          </span>
          <button type="button" className={styles.linkButton} onClick={actions.useDifferentId}>
            Use a different Client ID
          </button>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <span className={styles.eyebrow}>Paste your Spotify Client ID here ↓</span>
            <input
              type="text"
              className={styles.input}
              spellCheck={false}
              autoComplete="off"
              aria-label="Spotify Client ID"
              placeholder="3f9a2c1b4d5e6f708192a3b4c5d6e7f8"
              value={setup.clientId}
              onChange={(event) => actions.setClientId(event.target.value)}
            />
            <span className={styles.hint}>
              Register an app in the Spotify Developer Dashboard with the redirect URI below, add your own account
              under User Management, then paste the Client ID. Or set it once for everyone in
              NEXT_PUBLIC_SPOTIFY_CLIENT_ID. Scopes: user-top-read, user-read-recently-played.
            </span>
          </div>

          <div className={styles.fieldTight}>
            <span className={styles.eyebrow}>Redirect URI to register</span>
            <code className={styles.code}>{setup.redirectUri || '…'}</code>
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void actions.connect()}>
          Connect Spotify
        </button>
        <span className={styles.footNote}>Token kept in memory only</span>
      </div>
    </section>
  );
}
