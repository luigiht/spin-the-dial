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
              Register an app in the{' '}
              <a
                className={styles.hintLink}
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
              >
                Spotify Developer Dashboard
              </a>
              , add your own account under User Management, then paste the Client ID.
            </span>
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void actions.connect()}>
          Connect Spotify
        </button>
      </div>

      {setup.lastfmAvailable ? (
        <div className={styles.alternative}>
          <span className={styles.divider}>or</span>

          <div className={styles.field}>
            <span className={styles.eyebrow}>Use a Last.fm username</span>
            <form
              className={styles.inlineForm}
              onSubmit={(event) => {
                event.preventDefault();
                void actions.connectLastfm();
              }}
            >
              <input
                type="text"
                className={styles.input}
                spellCheck={false}
                autoComplete="username"
                autoCapitalize="none"
                aria-label="Last.fm username"
                placeholder="username"
                value={setup.lastfmUser}
                onChange={(event) => actions.setLastfmUser(event.target.value)}
              />
              <button type="submit" className={styles.ghostPill}>
                Load
              </button>
            </form>
            <span className={styles.hint}>
              No sign-in, no password — a public Last.fm profile is read straight from your browser.
              Genres are Spotify-only, so the filter chips stay hidden.
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
