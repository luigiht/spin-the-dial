'use client';

import { useSpinTheDial } from '@/hooks/use-spin-the-dial';

import { DialPanel } from './dial-panel';
import { Logo } from './logo';
import { RevealPanel } from './reveal-panel';
import { SetupPanel } from './setup-panel';
import styles from './spin-the-dial.module.css';

export function SpinTheDial() {
  const model = useSpinTheDial();
  const { phase, actions } = model;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.brand}>
            <Logo className={styles.logo} />
            <span className={styles.srOnly}>Spin the Dial</span>
          </h1>
          {model.connected ? (
            <button type="button" className={styles.disconnect} onClick={actions.disconnect}>
              Disconnect
            </button>
          ) : null}
        </header>

        <p className={styles.lead}>{model.leadLine}</p>

        {model.error ? (
          <div role="alert" className={styles.alert}>
            {model.error}
          </div>
        ) : null}

        {phase === 'setup' || phase === 'loading' ? (
          <SetupPanel setup={model.setup} actions={actions} />
        ) : null}
        {phase === 'dial' ? <DialPanel dial={model.dial} actions={actions} /> : null}
        {phase === 'reveal' ? <RevealPanel reveal={model.reveal} actions={actions} /> : null}

        <footer className={styles.footer}>
          Made by{' '}
          {/* No `noreferrer`: the referrer is how a personal site sees this traffic. */}
          <a
            className={styles.footerLink}
            href="https://www.luigiht.com"
            target="_blank"
            rel="noopener author me"
          >
            Luis Hermosilla
          </a>
          , a lead experience designer based in London.
        </footer>
      </div>
    </main>
  );
}
