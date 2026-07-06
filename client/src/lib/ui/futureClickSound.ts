type FutureClickKind = 'summon' | 'dismiss' | 'info';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function scheduleTone(
  ctx: AudioContext,
  start: number,
  freqStart: number,
  freqEnd: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), start + duration * 0.7);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Short synthesized UI chirp — no asset files, feels sci-fi / holographic. */
export function playFutureClick(kind: FutureClickKind = 'summon'): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t = ctx.currentTime;

    if (kind === 'summon') {
      scheduleTone(ctx, t, 520, 1480, 0.14, 0.09, 'sine');
      scheduleTone(ctx, t + 0.03, 1040, 2090, 0.1, 0.04, 'triangle');
    } else if (kind === 'dismiss') {
      scheduleTone(ctx, t, 880, 220, 0.12, 0.08, 'sine');
      scheduleTone(ctx, t + 0.02, 440, 110, 0.08, 0.03, 'triangle');
    } else {
      scheduleTone(ctx, t, 1200, 1800, 0.08, 0.06, 'sine');
      scheduleTone(ctx, t + 0.025, 2400, 3200, 0.06, 0.025, 'sine');
    }
  } catch {
    // Ignore if audio is blocked (autoplay policy, etc.)
  }
}
