'use client';

import type { DialModel } from '@/hooks/use-spin-the-dial';
import { placeholderPattern } from '@/lib/placeholder';

import styles from './spin-the-dial.module.css';

interface RevealPanelProps {
  reveal: DialModel['reveal'];
  actions: DialModel['actions'];
}

export function RevealPanel({ reveal, actions }: RevealPanelProps) {
  const { artist, imageUrl } = reveal;

  return (
    <section className={styles.panel}>
      <div
        className={`${styles.card} ${imageUrl ? styles.cardPhoto : ''}`}
        style={{
          backgroundImage: imageUrl
            ? `url("${imageUrl}")`
            : placeholderPattern(artist?.name ?? ''),
        }}
      >
        <h2 className={styles.artistName}>{artist?.name ?? ''}</h2>
      </div>

      <div className={styles.meta}>
        {/* Untagged artists — everything from Last.fm — just get no genre line. */}
        {reveal.genresLine ? <span className={styles.genres}>{reveal.genresLine}</span> : null}
        <span className={styles.recency}>{reveal.recencyLine}</span>
      </div>

      <div className={styles.launchBlock}>
        <button type="button" className={styles.launchPrimary} onClick={actions.play}>
          <span>Play artist</span>
          <span className={styles.launchHint}>{reveal.playHint}</span>
        </button>

        <div className={styles.pair}>
          <button type="button" className={styles.pill} onClick={actions.spinAgain}>
            Spin again
          </button>
          <button type="button" className={styles.pill} onClick={actions.notTonight}>
            Not tonight
          </button>
        </div>

        <span className={styles.launchNote}>{reveal.launchNote}</span>
      </div>
    </section>
  );
}
