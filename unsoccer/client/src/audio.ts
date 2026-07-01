import type { KickKind, PlayerRole, TeamId } from "@itch-games/unsoccer-shared";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export interface SpatialSoundOptions {
  pan: number;
  isLocal?: boolean;
  speed?: number;
}

export interface AudioMixFrame {
  activePlayers: number;
  ballSpeed: number;
  connected: boolean;
  daylight: number;
}

export interface AudioRuntimeSnapshot {
  supported: boolean;
  unlocked: boolean;
  contextState: AudioContextState | "missing";
  ambienceReady: boolean;
  rollGain: number;
  crowdGain: number;
}

const MIN_GAIN = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class UnSoccerAudio {
  private supported = true;
  private unlocked = false;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private ambienceReady = false;
  private noiseBuffers = new Map<number, AudioBuffer>();
  private currentRollGain = 0;
  private currentCrowdGain = 0;

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      return;
    }
    if (ctx.state !== "running") return;
    if (!this.unlocked) {
      this.unlocked = true;
      this.ensureAmbience();
      this.playUiConfirm();
    }
  }

  playConnection(isConnected: boolean): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    const notes = isConnected ? [392, 523] : [392, 247];
    notes.forEach((frequency, index) => {
      this.playTone({
        frequency,
        duration: 0.09,
        delay: index * 0.075,
        peak: isConnected ? 0.055 : 0.04,
        type: "sine",
        pan: 0
      });
    });
  }

  playJoin(role: PlayerRole): void {
    const base = role === "player" ? 587 : 440;
    this.playTone({ frequency: base, duration: 0.08, peak: 0.05, type: "triangle", pan: 0 });
    this.playTone({ frequency: role === "player" ? 784 : 554, duration: 0.11, delay: 0.07, peak: 0.04, type: "triangle", pan: 0 });
  }

  playRosterChange(kind: "join" | "leave" | "spectator"): void {
    const frequency = kind === "leave" ? 220 : kind === "spectator" ? 330 : 494;
    this.playTone({ frequency, duration: 0.08, peak: 0.032, type: "sine", pan: kind === "leave" ? -0.18 : 0.18 });
  }

  playKick(kind: KickKind, options: SpatialSoundOptions): void {
    const localBoost = options.isLocal ? 1.2 : 0.82;
    const speedBoost = clamp((options.speed || 0) / 9, 0, 0.32);
    const peak = localBoost * (0.075 + speedBoost * 0.035);
    const pan = clamp(options.pan, -0.92, 0.92);

    if (kind === "body") {
      this.playPitchDrop({ start: 82, end: 43, duration: 0.18, peak: peak * 1.25, pan, type: "triangle" });
      this.playNoiseBurst({ duration: 0.16, peak: peak * 0.62, pan, filterType: "lowpass", frequency: 540, q: 0.7 });
      return;
    }

    if (kind === "head") {
      this.playPitchDrop({ start: 260, end: 145, duration: 0.11, peak: peak * 0.72, pan, type: "sine" });
      this.playNoiseBurst({ duration: 0.08, peak: peak * 0.5, pan, filterType: "bandpass", frequency: 1250, q: 1.8 });
      return;
    }

    const left = kind === "left";
    this.playPitchDrop({
      start: left ? 132 : 148,
      end: left ? 72 : 78,
      duration: 0.13,
      peak,
      pan,
      type: "triangle"
    });
    this.playNoiseBurst({
      duration: 0.085,
      peak: peak * 0.45,
      pan,
      filterType: "bandpass",
      frequency: left ? 820 : 920,
      q: 1.1
    });
  }

  playGoal(team: TeamId): void {
    const pan = team === 0 ? -0.18 : 0.18;
    const chord = team === 0 ? [392, 523, 659, 784] : [330, 440, 554, 659];
    this.playNoiseBurst({ duration: 0.62, peak: 0.085, pan, filterType: "bandpass", frequency: 620, q: 0.45 });
    chord.forEach((frequency, index) => {
      this.playTone({
        frequency,
        duration: 0.28,
        delay: index * 0.065,
        peak: 0.07 - index * 0.007,
        type: "sawtooth",
        pan
      });
    });
    this.playPitchDrop({ start: 96, end: 52, duration: 0.28, peak: 0.08, pan: 0, type: "sine" });
  }

  playCountdown(remainingSeconds: number): void {
    const pitch = remainingSeconds <= 1 ? 1175 : remainingSeconds === 2 ? 988 : 784;
    this.playTone({ frequency: pitch, duration: 0.06, peak: 0.045, type: "square", pan: 0 });
  }

  update(frame: AudioMixFrame): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    this.ensureAmbience();
    if (!this.rollGain || !this.rollFilter || !this.crowdGain || !this.crowdFilter) return;

    const visibility = document.visibilityState === "visible" ? 1 : 0.25;
    const ballAmount = clamp(frame.ballSpeed / 12, 0, 1);
    const activeAmount = clamp(frame.activePlayers / 4, 0, 1);
    const nightAmount = 1 - clamp(frame.daylight, 0, 1);
    const connectedAmount = frame.connected ? 1 : 0.25;
    const now = ctx.currentTime;

    const rollTarget = visibility * connectedAmount * ballAmount * (0.018 + activeAmount * 0.014);
    const rollFrequency = 220 + ballAmount * 980;
    this.rollGain.gain.setTargetAtTime(rollTarget, now, 0.08);
    this.rollFilter.frequency.setTargetAtTime(rollFrequency, now, 0.08);
    this.currentRollGain = rollTarget;

    const crowdTarget = visibility * connectedAmount * (0.012 + activeAmount * 0.018 + nightAmount * 0.008);
    this.crowdGain.gain.setTargetAtTime(crowdTarget, now, 0.65);
    this.crowdFilter.frequency.setTargetAtTime(260 + frame.daylight * 180, now, 0.65);
    this.currentCrowdGain = crowdTarget;
  }

  snapshot(): AudioRuntimeSnapshot {
    return {
      supported: this.supported,
      unlocked: this.unlocked,
      contextState: this.ctx?.state || "missing",
      ambienceReady: this.ambienceReady,
      rollGain: Number(this.currentRollGain.toFixed(4)),
      crowdGain: Number(this.currentCrowdGain.toFixed(4))
    };
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AudioContextCtor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      this.supported = false;
      return null;
    }

    const ctx = new AudioContextCtor();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const ambience = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    master.gain.value = 0.72;
    sfx.gain.value = 0.86;
    ambience.gain.value = 0.42;
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;

    sfx.connect(compressor);
    ambience.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.ambienceGain = ambience;
    return ctx;
  }

  private readyContext(): AudioContext | null {
    if (!this.ctx || !this.unlocked || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  private ensureAmbience(): void {
    const ctx = this.readyContext();
    if (!ctx || this.ambienceReady || !this.ambienceGain) return;

    const crowdSource = ctx.createBufferSource();
    crowdSource.buffer = this.noiseBuffer(2.0);
    crowdSource.loop = true;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = "bandpass";
    crowdFilter.frequency.value = 320;
    crowdFilter.Q.value = 0.55;
    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    crowdSource.connect(crowdFilter).connect(crowdGain).connect(this.ambienceGain);
    crowdSource.start();

    const rollSource = ctx.createBufferSource();
    rollSource.buffer = this.noiseBuffer(1.0);
    rollSource.loop = true;
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = "bandpass";
    rollFilter.frequency.value = 260;
    rollFilter.Q.value = 1.5;
    const rollGain = ctx.createGain();
    rollGain.gain.value = 0;
    rollSource.connect(rollFilter).connect(rollGain).connect(this.ambienceGain);
    rollSource.start();

    this.crowdGain = crowdGain;
    this.crowdFilter = crowdFilter;
    this.rollGain = rollGain;
    this.rollFilter = rollFilter;
    this.ambienceReady = true;
  }

  private playUiConfirm(): void {
    this.playTone({ frequency: 740, duration: 0.045, peak: 0.025, type: "sine", pan: 0 });
  }

  private playTone(options: {
    frequency: number;
    duration: number;
    delay?: number;
    peak: number;
    type: OscillatorType;
    pan: number;
  }): void {
    const ctx = this.readyContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime + (options.delay || 0);
    const destination = this.spatialDestination(options.pan);
    if (!destination) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, now);
    this.applyEnvelope(gain, now, 0.008, options.duration, options.peak);
    oscillator.connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + options.duration + 0.035);
  }

  private playPitchDrop(options: {
    start: number;
    end: number;
    duration: number;
    peak: number;
    pan: number;
    type: OscillatorType;
  }): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const destination = this.spatialDestination(options.pan);
    if (!destination) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, options.end), now + options.duration);
    this.applyEnvelope(gain, now, 0.004, options.duration, options.peak);
    oscillator.connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + options.duration + 0.04);
  }

  private playNoiseBurst(options: {
    duration: number;
    peak: number;
    pan: number;
    filterType: BiquadFilterType;
    frequency: number;
    q: number;
  }): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const destination = this.spatialDestination(options.pan);
    if (!destination) return;

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noiseBuffer(Math.max(0.1, options.duration));
    filter.type = options.filterType;
    filter.frequency.setValueAtTime(options.frequency, now);
    filter.Q.value = options.q;
    this.applyEnvelope(gain, now, 0.003, options.duration, options.peak);
    source.connect(filter).connect(gain).connect(destination);
    source.start(now);
    source.stop(now + options.duration + 0.03);
  }

  private spatialDestination(pan: number): AudioNode | null {
    const ctx = this.readyContext();
    if (!ctx || !this.sfxGain) return null;
    const createStereoPanner = (ctx as AudioContext & {
      createStereoPanner?: () => StereoPannerNode;
    }).createStereoPanner;
    if (typeof createStereoPanner === "function") {
      const panner = createStereoPanner.call(ctx);
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.sfxGain);
      return panner;
    }
    const gain = ctx.createGain();
    gain.connect(this.sfxGain);
    return gain;
  }

  private applyEnvelope(gain: GainNode, start: number, attack: number, decay: number, peak: number): void {
    gain.gain.cancelScheduledValues(start);
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, start + attack + decay);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ensureContext();
    if (!ctx) throw new Error("AudioContext is not available");
    const key = Math.round(seconds * 1000);
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      data[index] = last;
    }
    this.noiseBuffers.set(key, buffer);
    return buffer;
  }
}
