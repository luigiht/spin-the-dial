'use client';

import type { DialModel } from '@/hooks/use-spin-the-dial';

import styles from './spin-the-dial.module.css';

interface DialPanelProps {
  dial: DialModel['dial'];
  actions: DialModel['actions'];
}

export function DialPanel({ dial, actions }: DialPanelProps) {
  return (
    <section className={styles.panel}>
      {dial.spinning ? (
        <div className={styles.rollWrap}>
          <div className={styles.rollWindow}>
            {/* Names are swapped straight into this node while the dial runs. */}
            <span ref={dial.rollRef} className={styles.rollName}>
              {dial.rollSeed}
            </span>
          </div>
          <span className={styles.spinningLabel}>Spinning…</span>
        </div>
      ) : (
        <div className={styles.narrow}>
          <span className={styles.eyebrow}>Narrow the spin</span>

          <button
            type="button"
            className={styles.toggle}
            aria-pressed={dial.forgotten}
            aria-describedby="forgotten-hint"
            onClick={actions.toggleForgotten}
          >
            <span>Dig up something forgotten</span>
            <span className={`${styles.toggleState} ${dial.forgotten ? styles.toggleStateOn : ''}`}>
              {dial.forgotten ? 'On' : 'Off'}
            </span>
          </button>
          <span id="forgotten-hint" className={styles.hint}>
            On, the dial skips anyone from your last 50 plays or this month&rsquo;s top artists, leaving
            only your longer-term charts — the artists you loved once and stopped reaching for.
          </span>

          {dial.chips.length > 0 ? (
            <div className={styles.chipGroup}>
              <span className={styles.eyebrow}>{dial.chipsLabel}</span>
              <div className={styles.chips}>
                {dial.chips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className={`${styles.chip} ${chip.active ? styles.chipActive : ''}`}
                    aria-pressed={chip.active}
                    onClick={() => actions.toggleGenre(chip.label)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <span className={styles.note}>{dial.narrowNote}</span>
        </div>
      )}

      <div className={styles.spinBlock}>
        <button type="button" className={styles.spinButton} disabled={dial.spinning} onClick={actions.spin}>
          Spin
        </button>
        <span className={styles.footNote}>{dial.roundLine}</span>
      </div>
    </section>
  );
}
