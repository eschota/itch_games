import type { HazardType, KickKind, PlayerRole, TeamId, WeatherKind } from "@itch-games/unsoccer-shared";

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
  dayTimeSeconds: number;
  weatherKind: WeatherKind;
  weatherIntensity: number;
  hazardDrag: number;
}

export interface AudioRuntimeSnapshot {
  supported: boolean;
  unlocked: boolean;
  contextState: AudioContextState | "missing";
  ambienceReady: boolean;
  rollGain: number;
  crowdGain: number;
  weatherGain: number;
  birdsGain: number;
  roadGain: number;
  birdChirpsPlayed: number;
  carPassesPlayed: number;
  playedEvents: number;
  blockedEvents: number;
  lastEvent: AudioEventKind | null;
  lastBlockedEvent: AudioEventKind | null;
}

export interface AudioVolumeSettings {
  master: number;
  sfx: number;
  ambience: number;
  weather: number;
  ui: number;
  muted: boolean;
  muteWhenHidden: boolean;
}

const MIN_GAIN = 0.0001;
type AudioEventKind = "connection" | "join" | "roster" | "kick" | "goal" | "countdown" | "weather" | "ui";

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
  private weatherGain: GainNode | null = null;
  private weatherFilter: BiquadFilterNode | null = null;
  private birdsGain: GainNode | null = null;
  private roadGain: GainNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private ambienceReady = false;
  private noiseBuffers = new Map<number, AudioBuffer>();
  private currentRollGain = 0;
  private currentCrowdGain = 0;
  private currentWeatherGain = 0;
  private currentBirdsGain = 0;
  private currentRoadGain = 0;
  private nextBirdChirpAt = 0;
  private nextCarPassAt = 0;
  private birdChirpsPlayed = 0;
  private carPassesPlayed = 0;
  private playedEvents = 0;
  private blockedEvents = 0;
  private lastEvent: AudioEventKind | null = null;
  private lastBlockedEvent: AudioEventKind | null = null;
  private volumes: AudioVolumeSettings = {
    master: 0.72,
    sfx: 0.86,
    ambience: 0.42,
    weather: 0.7,
    ui: 0.8,
    muted: false,
    muteWhenHidden: true
  };

  setVolumes(settings: AudioVolumeSettings): void {
    this.volumes = { ...settings };
    if (this.masterGain) this.masterGain.gain.value = this.volumes.muted ? 0 : this.volumes.master;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx;
    if (this.ambienceGain) this.ambienceGain.gain.value = this.volumes.ambience;
  }

  async unlock(): Promise<boolean> {
    const wasUnlocked = this.unlocked;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      return false;
    }
    if (ctx.state !== "running") return false;
    if (!this.unlocked) {
      this.unlocked = true;
      this.ensureAmbience();
      this.markPlayed("ui");
      this.playUiConfirm();
    }
    return !wasUnlocked && this.unlocked;
  }

  playConnection(isConnected: boolean): void {
    if (!this.canPlay("connection")) return;
    const notes = isConnected ? [392, 523] : [392, 247];
    this.markPlayed("connection");
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
    if (!this.canPlay("join")) return;
    this.markPlayed("join");
    const base = role === "player" ? 587 : 440;
    this.playTone({ frequency: base, duration: 0.08, peak: 0.05, type: "triangle", pan: 0 });
    this.playTone({ frequency: role === "player" ? 784 : 554, duration: 0.11, delay: 0.07, peak: 0.04, type: "triangle", pan: 0 });
  }

  playRosterChange(kind: "join" | "leave" | "spectator"): void {
    if (!this.canPlay("roster")) return;
    this.markPlayed("roster");
    const frequency = kind === "leave" ? 220 : kind === "spectator" ? 330 : 494;
    this.playTone({ frequency, duration: 0.08, peak: 0.032, type: "sine", pan: kind === "leave" ? -0.18 : 0.18 });
  }

  playKick(kind: KickKind, options: SpatialSoundOptions): void {
    if (!this.canPlay("kick")) return;
    this.markPlayed("kick");
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

    if (kind === "hand") {
      this.playPitchDrop({ start: 190, end: 92, duration: 0.1, peak: peak * 0.82, pan, type: "triangle" });
      this.playNoiseBurst({ duration: 0.065, peak: peak * 0.54, pan, filterType: "bandpass", frequency: 1180, q: 1.2 });
      return;
    }

    if (kind === "jump") {
      this.playPitchDrop({ start: 118, end: 74, duration: 0.09, peak: peak * 0.42, pan, type: "sine" });
      this.playNoiseBurst({ duration: 0.08, peak: peak * 0.34, pan, filterType: "lowpass", frequency: 680, q: 0.6 });
      return;
    }

    const left = true;
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
    if (!this.canPlay("goal")) return;
    this.markPlayed("goal");
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
    if (!this.canPlay("countdown")) return;
    this.markPlayed("countdown");
    const pitch = remainingSeconds <= 1 ? 1175 : remainingSeconds === 2 ? 988 : 784;
    this.playTone({ frequency: pitch, duration: 0.06, peak: 0.045, type: "square", pan: 0 });
  }

  playWeatherHazard(kind: HazardType, options: SpatialSoundOptions): void {
    if (!this.canPlay("weather")) return;
    this.markPlayed("weather");
    const speed = clamp((options.speed || 0) / 8, 0, 1);
    const pan = clamp(options.pan, -0.92, 0.92);
    const localBoost = options.isLocal ? 1.2 : 0.82;
    if (kind === "puddle") {
      this.playNoiseBurst({
        duration: 0.18,
        peak: localBoost * (0.035 + speed * 0.035),
        pan,
        filterType: "bandpass",
        frequency: 980,
        q: 1.35
      });
      return;
    }
    if (kind === "slush") {
      this.playNoiseBurst({
        duration: 0.2,
        peak: localBoost * (0.028 + speed * 0.025),
        pan,
        filterType: "lowpass",
        frequency: 720,
        q: 0.95
      });
      return;
    }
    this.playPitchDrop({ start: 118, end: 58, duration: 0.13, peak: localBoost * 0.052, pan, type: "triangle" });
    this.playNoiseBurst({ duration: 0.12, peak: localBoost * 0.034, pan, filterType: "lowpass", frequency: 420, q: 0.8 });
  }

  update(frame: AudioMixFrame): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    this.ensureAmbience();
    if (!this.rollGain || !this.rollFilter || !this.crowdGain || !this.crowdFilter || !this.weatherGain || !this.weatherFilter || !this.birdsGain || !this.roadGain || !this.roadFilter) return;

    const visibility = document.visibilityState === "visible" ? 1 : this.volumes.muteWhenHidden ? 0 : 0.25;
    const ballAmount = clamp(frame.ballSpeed / 12, 0, 1);
    const activeAmount = clamp(frame.activePlayers / 4, 0, 1);
    const nightAmount = 1 - clamp(frame.daylight, 0, 1);
    const connectedAmount = frame.connected ? 1 : 0.25;
    const weatherAmount = clamp(frame.weatherIntensity, 0, 1);
    const hazardAmount = clamp(frame.hazardDrag, 0, 1);
    const daySeconds = ((frame.dayTimeSeconds % 86400) + 86400) % 86400;
    const dawnAmount = clamp(1 - Math.abs(daySeconds - 6 * 3600) / 5400, 0, 1);
    const dayRoadAmount = frame.daylight > 0.62 && daySeconds > 7 * 3600 && daySeconds < 19 * 3600 ? 1 : 0;
    const now = ctx.currentTime;

    const muted = this.volumes.muted || this.volumes.master <= 0;
    const rollTarget = muted ? 0 : visibility * connectedAmount * ballAmount * (0.018 + activeAmount * 0.014) * (1 - hazardAmount * 0.22);
    const rollFrequency = 220 + ballAmount * 980 - hazardAmount * 110;
    this.rollGain.gain.setTargetAtTime(rollTarget, now, 0.08);
    this.rollFilter.frequency.setTargetAtTime(rollFrequency, now, 0.08);
    this.currentRollGain = rollTarget;

    const crowdTarget = muted ? 0 : visibility * connectedAmount * (0.012 + activeAmount * 0.018 + nightAmount * 0.008);
    this.crowdGain.gain.setTargetAtTime(crowdTarget, now, 0.65);
    this.crowdFilter.frequency.setTargetAtTime(260 + frame.daylight * 180, now, 0.65);
    this.currentCrowdGain = crowdTarget;

    const weatherProfileBoost = frame.weatherKind === "rain" ? 1.2 : frame.weatherKind === "snow" ? 1 : 0.18;
    const weatherTarget = muted ? 0 : visibility * connectedAmount * weatherAmount * weatherProfileBoost * (0.008 + activeAmount * 0.008 + hazardAmount * 0.01) * this.volumes.weather;
    this.weatherGain.gain.setTargetAtTime(weatherTarget, now, 0.8);
    this.weatherFilter.frequency.setTargetAtTime(frame.weatherKind === "rain" ? 1250 : 880 - weatherAmount * 260 + hazardAmount * 160, now, 0.8);
    this.currentWeatherGain = weatherTarget;

    const birdsTarget = muted ? 0 : visibility * connectedAmount * dawnAmount * (1 - weatherAmount * 0.72) * 0.016;
    this.birdsGain.gain.setTargetAtTime(birdsTarget, now, 1.2);
    this.currentBirdsGain = birdsTarget;
    if (birdsTarget > 0.003 && now >= this.nextBirdChirpAt) {
      this.playBirdChirp();
      this.nextBirdChirpAt = now + 1.2 + Math.random() * 2.8;
    }

    const roadTarget = muted ? 0 : visibility * connectedAmount * dayRoadAmount * (0.006 + frame.daylight * 0.009) * (1 - weatherAmount * 0.22);
    this.roadGain.gain.setTargetAtTime(roadTarget, now, 1.6);
    this.roadFilter.frequency.setTargetAtTime(180 + frame.daylight * 240, now, 1.1);
    this.currentRoadGain = roadTarget;
    if (roadTarget > 0.004 && now >= this.nextCarPassAt) {
      this.playCarPass();
      this.nextCarPassAt = now + 7 + Math.random() * 11;
    }
  }

  snapshot(): AudioRuntimeSnapshot {
    return {
      supported: this.supported,
      unlocked: this.unlocked,
      contextState: this.ctx?.state || "missing",
      ambienceReady: this.ambienceReady,
      rollGain: Number(this.currentRollGain.toFixed(4)),
      crowdGain: Number(this.currentCrowdGain.toFixed(4)),
      weatherGain: Number(this.currentWeatherGain.toFixed(4)),
      birdsGain: Number(this.currentBirdsGain.toFixed(4)),
      roadGain: Number(this.currentRoadGain.toFixed(4)),
      birdChirpsPlayed: this.birdChirpsPlayed,
      carPassesPlayed: this.carPassesPlayed,
      playedEvents: this.playedEvents,
      blockedEvents: this.blockedEvents,
      lastEvent: this.lastEvent,
      lastBlockedEvent: this.lastBlockedEvent
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

    master.gain.value = this.volumes.muted ? 0 : this.volumes.master;
    sfx.gain.value = this.volumes.sfx;
    ambience.gain.value = this.volumes.ambience;
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

  private canPlay(kind: AudioEventKind): boolean {
    if (this.volumes.muted || this.volumes.master <= 0) return false;
    if (this.readyContext()) return true;
    this.blockedEvents += 1;
    this.lastBlockedEvent = kind;
    return false;
  }

  private markPlayed(kind: AudioEventKind): void {
    this.playedEvents += 1;
    this.lastEvent = kind;
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

    const weatherSource = ctx.createBufferSource();
    weatherSource.buffer = this.noiseBuffer(2.6);
    weatherSource.loop = true;
    const weatherFilter = ctx.createBiquadFilter();
    weatherFilter.type = "bandpass";
    weatherFilter.frequency.value = 720;
    weatherFilter.Q.value = 0.85;
    const weatherGain = ctx.createGain();
    weatherGain.gain.value = 0;
    weatherSource.connect(weatherFilter).connect(weatherGain).connect(this.ambienceGain);
    weatherSource.start();

    const roadSource = ctx.createBufferSource();
    roadSource.buffer = this.noiseBuffer(2.4);
    roadSource.loop = true;
    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = "lowpass";
    roadFilter.frequency.value = 220;
    roadFilter.Q.value = 0.45;
    const roadGain = ctx.createGain();
    roadGain.gain.value = 0;
    roadSource.connect(roadFilter).connect(roadGain).connect(this.ambienceGain);
    roadSource.start();

    const birdsGain = ctx.createGain();
    birdsGain.gain.value = 0;
    birdsGain.connect(this.ambienceGain);

    this.crowdGain = crowdGain;
    this.crowdFilter = crowdFilter;
    this.rollGain = rollGain;
    this.rollFilter = rollFilter;
    this.weatherGain = weatherGain;
    this.weatherFilter = weatherFilter;
    this.birdsGain = birdsGain;
    this.roadGain = roadGain;
    this.roadFilter = roadFilter;
    this.ambienceReady = true;
  }

  private playBirdChirp(): void {
    const ctx = this.readyContext();
    if (!ctx || !this.birdsGain) return;
    this.birdChirpsPlayed += 1;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let index = 0; index < notes; index += 1) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index % 2 ? "sine" : "triangle";
      const start = 2800 + Math.random() * 1800;
      const now = ctx.currentTime + index * (0.045 + Math.random() * 0.035);
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(start * (1.18 + Math.random() * 0.25), now + 0.055);
      this.applyEnvelope(gain, now, 0.006, 0.055, 0.035);
      oscillator.connect(gain).connect(this.birdsGain);
      oscillator.start(now);
      oscillator.stop(now + 0.11);
    }
  }

  private playCarPass(): void {
    const ctx = this.readyContext();
    if (!ctx || !this.roadGain) return;
    this.carPassesPlayed += 1;
    const now = ctx.currentTime;
    const pan = Math.random() > 0.5 ? -0.75 : 0.75;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(82 + Math.random() * 28, now);
    oscillator.frequency.exponentialRampToValueAtTime(54 + Math.random() * 20, now + 1.3);
    this.applyEnvelope(gain, now, 0.12, 1.25, 0.025);
    const destination = this.spatialDestination(pan);
    if (destination) oscillator.connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + 1.45);
  }

  private playUiConfirm(): void {
    this.playTone({ frequency: 740, duration: 0.045, peak: 0.025 * this.volumes.ui, type: "sine", pan: 0 });
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
