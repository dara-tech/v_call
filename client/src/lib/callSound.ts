// Simple Web Audio API Synthesizer for premium call audio feedback (zero asset dependency)
class CallSoundSynthesizer {
  private audioCtx: AudioContext | null = null;
  private currentOscillators: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode }[] = [];
  private ringtoneInterval: any = null;

  private initCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Ring tone for caller: traditional US ringing sound (440Hz + 480Hz modulated, 2s on, 4s off)
  playOutgoingRing() {
    this.stop();
    this.initCtx();
    if (!this.audioCtx) return;

    const playTone = () => {
      if (!this.audioCtx) return;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
      osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, this.audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.08, this.audioCtx.currentTime + 1.9);
      gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 2.0);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc1.start();
      osc2.start();

      const item = { osc1, osc2, gain: gainNode };
      this.currentOscillators.push(item);

      setTimeout(() => {
        osc1.stop();
        osc2.stop();
        this.currentOscillators = this.currentOscillators.filter(x => x !== item);
      }, 2100);
    };

    playTone();
    this.ringtoneInterval = setInterval(playTone, 6000);
  }

  // Melodic ringtone for receiver: synthesized arpeggio
  playIncomingRingtone() {
    this.stop();
    this.initCtx();
    if (!this.audioCtx) return;

    const playMelody = () => {
      if (!this.audioCtx) return;
      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // C4, E4, G4, C5, G4, E4
      const now = this.audioCtx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.25);

        gainNode.gain.setValueAtTime(0, now + idx * 0.25);
        gainNode.gain.linearRampToValueAtTime(0.08, now + idx * 0.25 + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.25 + 0.24);

        osc.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        osc.start(now + idx * 0.25);
        osc.stop(now + idx * 0.25 + 0.25);
      });
    };

    playMelody();
    this.ringtoneInterval = setInterval(playMelody, 2000);
  }

  // Play a quick descending tone when a call is ended or rejected
  playEndCallTone() {
    this.stop();
    this.initCtx();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);

    gainNode.gain.setValueAtTime(0.12, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(now + 0.45);
  }

  stop() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    this.currentOscillators.forEach(({ osc1, osc2, gain }) => {
      try { osc1.stop(); } catch(e){}
      try { osc2.stop(); } catch(e){}
      try { gain.disconnect(); } catch(e){}
    });
    this.currentOscillators = [];
  }
}

export const callSound = new CallSoundSynthesizer();
