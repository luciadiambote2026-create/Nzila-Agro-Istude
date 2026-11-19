let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

/**
 * Unlocks/resumes the browser AudioContext during a user gesture (toggle or test click)
 * so subsequent automated critical alerts can play even when the user is not interacting.
 */
export async function unlockAlertAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/**
 * Synthesizes a 3-pulse critical server overload alert tone using the Web Audio API.
 */
export async function playCriticalAlertSound(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const pulses = [
      { start: 0, duration: 0.16, freq: 880 },
      { start: 0.22, duration: 0.16, freq: 1174.66 },
      { start: 0.44, duration: 0.24, freq: 880 },
    ];

    for (const pulse of pulses) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pulse.freq, now + pulse.start);

      gain.gain.setValueAtTime(0.0001, now + pulse.start);
      gain.gain.exponentialRampToValueAtTime(0.28, now + pulse.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + pulse.start + pulse.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + pulse.start);
      osc.stop(now + pulse.start + pulse.duration + 0.02);
    }

    return true;
  } catch {
    return false;
  }
}
