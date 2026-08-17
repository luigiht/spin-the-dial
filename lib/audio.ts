/* The tick track under a spin: 22 square-wave clicks that thin out as the dial slows. */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function tick(ctx: AudioContext, when: number, gain: number): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, when);
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(gain, when + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  osc.connect(amp).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.06);
}

/** Schedule the whole run of clicks across a spin of `durationMs`. Silent if audio is unavailable. */
export function playSpinClicks(durationMs: number): void {
  try {
    const Ctx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctx) return;
    context = context ?? new Ctx();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume();

    const count = 22;
    let at = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      tick(ctx, at, 0.05 * (1 - i / count) + 0.012);
      // Gaps grow toward the end, so the dial sounds like it is settling.
      at += (durationMs / 1000) * (0.6 * Math.pow(i / count, 2.2) + 0.012);
    }
  } catch {
    /* no audio, no problem */
  }
}
