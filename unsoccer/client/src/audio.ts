import type { CelebrationKind, HazardType, KickKind, PlayerRole, TeamId, WeatherKind } from "@itch-games/unsoccer-shared";

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
  rainSampleGain: number;
  windSampleGain: number;
  birdsGain: number;
  roadGain: number;
  birdChirpsPlayed: number;
  carPassesPlayed: number;
  weatherCuesPlayed: number;
  samplesReady: boolean;
  sampleDecodeErrors: number;
  sampleMissingEvents: number;
  samplePlayedEvents: number;
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
type AudioEventKind = "connection" | "join" | "roster" | "kick" | "goal" | "countdown" | "celebration" | "weather" | "ui";

const AUDIO_SAMPLE_BASE = "assets/audio/sfx/";
const SAMPLE_DEFS = [
  { key: "footballKickLong", file: "football-kick-bigsoundbank-1044.ogg" },
  { key: "ballReboundLong", file: "ball-rebound-bigsoundbank-1045.ogg" },
  { key: "punchHeavy", file: "punch-heavy-bigsoundbank-2460.ogg" },
  { key: "punchCombo", file: "punch-combo-bigsoundbank-0444.ogg" },
  { key: "soccerKick", file: "soccer-ball-kick-mixkit-2099.mp3" },
  { key: "soccerQuickKick", file: "soccer-ball-quick-kick-mixkit-2108.mp3" },
  { key: "ballBounce", file: "ball-bounce-mixkit-2077.mp3" },
  { key: "stadiumJoyCrowd", file: "stadium-joy-crowd-mixkit-3022.mp3" },
  { key: "stadiumCrowd", file: "stadium-crowd-mixkit-2111.mp3" },
  { key: "sportsCrowdAmbience", file: "sports-crowd-ambience-mixkit-2097.mp3" },
  { key: "littleBirds", file: "little-birds-mixkit-17.mp3" },
  { key: "cityTraffic", file: "city-traffic-mixkit-2930.mp3" },
  { key: "lightRain", file: "light-rain-loop-mixkit-2393.mp3" },
  { key: "windAmbience", file: "wind-blowing-mixkit-2658.mp3" },
  { key: "windSwoosh", file: "short-wind-swoosh-mixkit-1461.mp3" },
  { key: "bodyPunches", file: "strong-body-punches-mixkit-2198.mp3" },
  { key: "martialKick", file: "martial-kick-mixkit-2163.mp3" },
  { key: "slapClap", file: "slap-clap-mixkit-2167.mp3" },
  { key: "footstepGrassA", file: "footstep-grass-kenney-000.ogg" },
  { key: "footstepGrassB", file: "footstep-grass-kenney-002.ogg" },
  { key: "footstepSnow", file: "footstep-snow-kenney-000.ogg" },
  { key: "impactLightA", file: "impact-generic-light-kenney-000.ogg" },
  { key: "impactLightB", file: "impact-generic-light-kenney-003.ogg" },
  { key: "impactHeavy", file: "impact-heavy-kenney-mining-001.ogg" }
] as const;

type SampleKey = (typeof SAMPLE_DEFS)[number]["key"];

interface SamplePlaybackOptions {
  pan?: number;
  gain?: number;
  delay?: number;
  playbackRate?: number;
  startAt?: number;
  duration?: number;
  destination?: AudioNode;
}

const FOOT_KICK_OFFSETS = [0.08, 2.34, 4.58, 6.82, 9.06] as const;
const BALL_REBOUND_OFFSETS = [0.05, 1.18, 2.32, 3.62, 4.86] as const;

function pickOne<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T;
}

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
  private rainSampleGain: GainNode | null = null;
  private windSampleGain: GainNode | null = null;
  private birdsGain: GainNode | null = null;
  private roadGain: GainNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private ambienceReady = false;
  private noiseBuffers = new Map<number, AudioBuffer>();
  private sampleBuffers = new Map<SampleKey, AudioBuffer>();
  private sampleLoadStarted = false;
  private sampleLoadComplete = false;
  private sampleDecodeErrors = 0;
  private sampleMissingEvents = 0;
  private samplePlayedEvents = 0;
  private startedAmbienceSamples = new Set<SampleKey>();
  private currentRollGain = 0;
  private currentCrowdGain = 0;
  private currentWeatherGain = 0;
  private currentRainSampleGain = 0;
  private currentWindSampleGain = 0;
  private currentBirdsGain = 0;
  private currentRoadGain = 0;
  private nextBirdChirpAt = 0;
  private nextCarPassAt = 0;
  private nextWeatherCueAt = 0;
  private birdChirpsPlayed = 0;
  private carPassesPlayed = 0;
  private weatherCuesPlayed = 0;
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
      this.preloadSamples();
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
    const sampleGain = localBoost * clamp(0.18 + speedBoost * 1.25, 0.18, 0.52);

    if (kind === "body") {
      const played = this.playSample("bodyPunches", { pan, gain: sampleGain * 0.78, playbackRate: 0.94 + speedBoost * 0.55, duration: 0.55 });
      this.playSample("punchCombo", { pan, gain: sampleGain * 0.34, delay: 0.018, playbackRate: 0.95 + speedBoost * 0.45, startAt: 0.04, duration: 0.46 });
      this.playSample("punchHeavy", { pan, gain: sampleGain * 0.42, delay: 0.025, playbackRate: 0.9 + speedBoost * 0.6 });
      this.playSample("impactHeavy", { pan, gain: sampleGain * 0.24, delay: 0.035, playbackRate: 0.82 + speedBoost * 0.45 });
      if (!played) {
        this.playPitchDrop({ start: 82, end: 43, duration: 0.18, peak: peak * 1.25, pan, type: "triangle" });
        this.playNoiseBurst({ duration: 0.16, peak: peak * 0.62, pan, filterType: "lowpass", frequency: 540, q: 0.7 });
      }
      return;
    }

    if (kind === "head") {
      const played = this.playSample("ballReboundLong", {
        pan,
        gain: sampleGain * 0.46,
        playbackRate: 1.12 + speedBoost * 0.4,
        startAt: pickOne(BALL_REBOUND_OFFSETS),
        duration: 0.36
      });
      this.playSample("ballBounce", { pan, gain: sampleGain * 0.2, delay: 0.025, playbackRate: 1.04 + speedBoost * 0.35, duration: 0.24 });
      this.playSample("impactLightA", { pan, gain: sampleGain * 0.24, delay: 0.018, playbackRate: 0.88 + speedBoost * 0.6 });
      if (!played) {
        this.playPitchDrop({ start: 260, end: 145, duration: 0.11, peak: peak * 0.72, pan, type: "sine" });
        this.playNoiseBurst({ duration: 0.08, peak: peak * 0.5, pan, filterType: "bandpass", frequency: 1250, q: 1.8 });
      }
      return;
    }

    if (kind === "hand") {
      const played = this.playSample("slapClap", { pan, gain: sampleGain * 0.52, playbackRate: 0.96 + speedBoost * 0.5, duration: 0.34 });
      this.playSample("punchHeavy", { pan, gain: sampleGain * 0.38, delay: 0.012, playbackRate: 1.08 + speedBoost * 0.5 });
      if (!played) {
        this.playPitchDrop({ start: 190, end: 92, duration: 0.1, peak: peak * 0.82, pan, type: "triangle" });
        this.playNoiseBurst({ duration: 0.065, peak: peak * 0.54, pan, filterType: "bandpass", frequency: 1180, q: 1.2 });
      }
      return;
    }

    if (kind === "jump") {
      const footstep = Math.random() > 0.35 ? pickOne(["footstepGrassA", "footstepGrassB"] as const) : "martialKick";
      const played = this.playSample(footstep, { pan, gain: sampleGain * 0.34, playbackRate: 0.92 + speedBoost * 0.35, duration: 0.36 });
      this.playSample("impactLightB", { pan, gain: sampleGain * 0.18, delay: 0.025, playbackRate: 0.86 + speedBoost * 0.35 });
      if (!played) {
        this.playPitchDrop({ start: 118, end: 74, duration: 0.09, peak: peak * 0.42, pan, type: "sine" });
        this.playNoiseBurst({ duration: 0.08, peak: peak * 0.34, pan, filterType: "lowpass", frequency: 680, q: 0.6 });
      }
      return;
    }

    const primary = Math.random() > 0.48 ? "soccerKick" : "soccerQuickKick";
    const played = this.playSample(primary, { pan, gain: sampleGain * 0.78, playbackRate: 0.94 + speedBoost * 0.55, duration: 0.5 });
    this.playSample("footballKickLong", {
      pan,
      gain: sampleGain * 0.36,
      delay: 0.012,
      playbackRate: 0.96 + speedBoost * 0.35,
      startAt: pickOne(FOOT_KICK_OFFSETS),
      duration: 0.42
    });
    if (!played) {
      this.playPitchDrop({
        start: 132,
        end: 72,
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
        frequency: 820,
        q: 1.1
      });
    }
  }

  playGoal(team: TeamId): void {
    if (!this.canPlay("goal")) return;
    this.markPlayed("goal");
    const pan = team === 0 ? -0.18 : 0.18;
    const played = this.playSample("stadiumJoyCrowd", { pan, gain: 0.58, duration: 3.2 });
    this.playSample("stadiumCrowd", { pan: -pan, gain: 0.26, delay: 0.12, duration: 2.2 });
    this.playNoiseBurst({ duration: 0.18, peak: 0.045, pan: 0, filterType: "lowpass", frequency: 180, q: 0.4 });
    if (!played) {
      this.playNoiseBurst({ duration: 0.62, peak: 0.085, pan, filterType: "bandpass", frequency: 620, q: 0.45 });
      this.playPitchDrop({ start: 96, end: 52, duration: 0.28, peak: 0.08, pan: 0, type: "sine" });
    }
  }

  playCelebration(kind: CelebrationKind, options: SpatialSoundOptions): void {
    if (!this.canPlay("celebration")) return;
    this.markPlayed("celebration");
    const pan = clamp(options.pan, -0.92, 0.92);
    const localBoost = options.isLocal ? 1.24 : 0.9;
    const celebratoryCrowd = kind === "celebrate2" ? "stadiumJoyCrowd" : "stadiumCrowd";
    const played = this.playSample(celebratoryCrowd, {
      pan,
      gain: localBoost * (kind === "celebrate2" ? 0.4 : 0.28),
      playbackRate: kind === "celebrate3" ? 1.06 : 1,
      duration: kind === "celebrate2" ? 2.4 : 1.6
    });
    this.playSample("slapClap", { pan, gain: localBoost * 0.14, delay: 0.08, playbackRate: 0.94, duration: 0.34 });
    if (!played) {
      this.playNoiseBurst({
        duration: kind === "celebrate2" ? 0.42 : 0.28,
        peak: localBoost * 0.055,
        pan,
        filterType: "bandpass",
        frequency: kind === "celebrate3" ? 1460 : 980,
        q: 0.75
      });
    }
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
      const played = this.playSample("lightRain", {
        pan,
        gain: localBoost * (0.16 + speed * 0.16),
        playbackRate: 1.12 + speed * 0.25,
        startAt: Math.random() * 0.75,
        duration: 0.32
      });
      if (!played) {
        this.playNoiseBurst({
          duration: 0.18,
          peak: localBoost * (0.035 + speed * 0.035),
          pan,
          filterType: "bandpass",
          frequency: 980,
          q: 1.35
        });
      }
      return;
    }
    if (kind === "slush") {
      const played = this.playSample("footstepSnow", {
        pan,
        gain: localBoost * (0.15 + speed * 0.12),
        playbackRate: 0.88 + speed * 0.25,
        duration: 0.34
      });
      if (!played) {
        this.playNoiseBurst({
          duration: 0.2,
          peak: localBoost * (0.028 + speed * 0.025),
          pan,
          filterType: "lowpass",
          frequency: 720,
          q: 0.95
        });
      }
      return;
    }
    const played = this.playSample("impactHeavy", {
      pan,
      gain: localBoost * (0.18 + speed * 0.12),
      playbackRate: 0.78 + speed * 0.2,
      duration: 0.42
    });
    this.playSample("footstepGrassB", { pan, gain: localBoost * 0.1, delay: 0.04, playbackRate: 0.82 + speed * 0.2, duration: 0.28 });
    if (!played) {
      this.playPitchDrop({ start: 118, end: 58, duration: 0.13, peak: localBoost * 0.052, pan, type: "triangle" });
      this.playNoiseBurst({ duration: 0.12, peak: localBoost * 0.034, pan, filterType: "lowpass", frequency: 420, q: 0.8 });
    }
  }

  update(frame: AudioMixFrame): void {
    const ctx = this.readyContext();
    if (!ctx) return;
    this.ensureAmbience();
    if (!this.rollGain || !this.rollFilter || !this.crowdGain || !this.crowdFilter || !this.weatherGain || !this.weatherFilter || !this.rainSampleGain || !this.windSampleGain || !this.birdsGain || !this.roadGain || !this.roadFilter) return;

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
    const rainSampleTarget = frame.weatherKind === "rain" ? clamp(weatherAmount * 0.95, 0, 1) : 0;
    const windSampleTarget = frame.weatherKind === "snow" ? clamp(0.28 + weatherAmount * 0.62, 0, 1) : frame.weatherKind === "rain" ? clamp(weatherAmount * 0.18, 0, 0.32) : 0;
    this.rainSampleGain.gain.setTargetAtTime(rainSampleTarget, now, 1.2);
    this.windSampleGain.gain.setTargetAtTime(windSampleTarget, now, 1.2);
    this.currentRainSampleGain = rainSampleTarget;
    this.currentWindSampleGain = windSampleTarget;
    if (!muted && visibility > 0 && connectedAmount > 0.5 && weatherAmount > 0.22 && now >= this.nextWeatherCueAt) {
      this.playAmbientWeatherCue(frame.weatherKind, weatherAmount);
      this.nextWeatherCueAt = now + 60 + Math.random() * 60;
    } else if (weatherAmount <= 0.08 && now > this.nextWeatherCueAt) {
      this.nextWeatherCueAt = now + 24 + Math.random() * 28;
    }

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
      rainSampleGain: Number(this.currentRainSampleGain.toFixed(4)),
      windSampleGain: Number(this.currentWindSampleGain.toFixed(4)),
      birdsGain: Number(this.currentBirdsGain.toFixed(4)),
      roadGain: Number(this.currentRoadGain.toFixed(4)),
      birdChirpsPlayed: this.birdChirpsPlayed,
      carPassesPlayed: this.carPassesPlayed,
      weatherCuesPlayed: this.weatherCuesPlayed,
      samplesReady: this.sampleLoadComplete && this.sampleBuffers.size > 0,
      sampleDecodeErrors: this.sampleDecodeErrors,
      sampleMissingEvents: this.sampleMissingEvents,
      samplePlayedEvents: this.samplePlayedEvents,
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

  private preloadSamples(): void {
    const ctx = this.readyContext();
    if (!ctx || this.sampleLoadStarted) return;
    this.sampleLoadStarted = true;

    void Promise.all(SAMPLE_DEFS.map(async (definition) => {
      try {
        const response = await fetch(`${AUDIO_SAMPLE_BASE}${definition.file}`, { cache: "force-cache" });
        if (!response.ok) {
          this.sampleMissingEvents += 1;
          return;
        }
        const bytes = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes.slice(0));
        this.sampleBuffers.set(definition.key, buffer);
      } catch {
        this.sampleDecodeErrors += 1;
      }
    })).finally(() => {
      this.sampleLoadComplete = true;
      this.ensureSampleAmbience();
    });
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

    const rainSampleGain = ctx.createGain();
    rainSampleGain.gain.value = 0;
    rainSampleGain.connect(weatherGain);

    const windSampleGain = ctx.createGain();
    windSampleGain.gain.value = 0;
    windSampleGain.connect(weatherGain);

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
    this.rainSampleGain = rainSampleGain;
    this.windSampleGain = windSampleGain;
    this.birdsGain = birdsGain;
    this.roadGain = roadGain;
    this.roadFilter = roadFilter;
    this.ambienceReady = true;
    this.ensureSampleAmbience();
  }

  private ensureSampleAmbience(): void {
    if (!this.readyContext() || !this.ambienceReady) return;
    if (this.crowdGain) this.startLoopedSample("sportsCrowdAmbience", this.crowdGain, 0.74);
    if (this.roadGain) this.startLoopedSample("cityTraffic", this.roadGain, 0.58);
    if (this.rainSampleGain) this.startLoopedSample("lightRain", this.rainSampleGain, 0.9);
    if (this.windSampleGain) this.startLoopedSample("windAmbience", this.windSampleGain, 0.7);
  }

  private startLoopedSample(key: SampleKey, destination: AudioNode, level: number, playbackRate = 1): boolean {
    const ctx = this.readyContext();
    const buffer = this.sampleBuffers.get(key);
    if (!ctx || !buffer || this.startedAmbienceSamples.has(key)) return false;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    gain.gain.value = level;
    source.connect(gain).connect(destination);
    source.start(ctx.currentTime, Math.random() * Math.max(0.01, buffer.duration - 0.25));
    this.startedAmbienceSamples.add(key);
    return true;
  }

  private playAmbientWeatherCue(kind: WeatherKind, weatherAmount: number): void {
    const pan = Math.random() > 0.5 ? -0.45 : 0.45;
    const gain = clamp(0.1 + weatherAmount * 0.18, 0.1, 0.32);
    const played = kind === "rain"
      ? this.playSample("lightRain", { pan, gain, startAt: Math.random() * 0.8, duration: 1.8, playbackRate: 1.04 })
      : this.playSample("windSwoosh", { pan, gain: gain * 1.2, duration: 1.35, playbackRate: kind === "snow" ? 0.82 : 1 });
    if (played) this.weatherCuesPlayed += 1;
  }

  private playSample(key: SampleKey, options: SamplePlaybackOptions = {}): boolean {
    const ctx = this.readyContext();
    if (!ctx) return false;
    const buffer = this.sampleBuffers.get(key);
    if (!buffer) {
      if (this.sampleLoadComplete) this.sampleMissingEvents += 1;
      return false;
    }

    const destination = options.destination || this.spatialDestination(options.pan || 0);
    if (!destination) return false;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const now = ctx.currentTime + (options.delay || 0);
    const maxOffset = Math.max(0, buffer.duration - 0.02);
    const offset = clamp(options.startAt || 0, 0, maxOffset);
    const remaining = Math.max(0.02, buffer.duration - offset);
    const duration = options.duration ? clamp(options.duration, 0.02, remaining) : undefined;

    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate || 1;
    gain.gain.setValueAtTime(clamp(options.gain ?? 1, MIN_GAIN, 1.4), now);
    source.connect(gain).connect(destination);
    if (duration) source.start(now, offset, duration);
    else source.start(now, offset);
    this.samplePlayedEvents += 1;
    return true;
  }

  private playBirdChirp(): void {
    const ctx = this.readyContext();
    if (!ctx || !this.birdsGain) return;
    this.birdChirpsPlayed += 1;
    if (this.playSample("littleBirds", {
      destination: this.birdsGain,
      gain: 0.5 + Math.random() * 0.25,
      playbackRate: 0.94 + Math.random() * 0.12,
      startAt: Math.random() * 1.9,
      duration: 0.85 + Math.random() * 0.75
    })) return;

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
    if (this.playSample("cityTraffic", {
      pan,
      gain: 0.14 + Math.random() * 0.08,
      playbackRate: 0.9 + Math.random() * 0.12,
      startAt: Math.random() * 2.4,
      duration: 1.25 + Math.random() * 0.6
    })) return;

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
