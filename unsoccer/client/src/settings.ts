export type SettingsTab = "controls" | "audio" | "graphics" | "network" | "accessibility";
export type MovementMode = "screen" | "team-goal" | "camera";
export type QualityPreset = "low" | "balanced" | "high";
export type ResolutionScale = 0.6 | 0.75 | 1;
export type InputAction =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "leftKick"
  | "rightKick"
  | "headHit"
  | "settings"
  | "cameraReset"
  | "muteAudio";

export type KeyBindings = Record<InputAction, string[]>;

export interface UnSoccerSettings {
  schemaVersion: 1;
  controls: {
    movementMode: MovementMode;
    invertForwardBack: boolean;
    invertLeftRight: boolean;
    mirrorOnTeamSide: boolean;
    bindings: KeyBindings;
  };
  audio: {
    master: number;
    sfx: number;
    ambience: number;
    weather: number;
    ui: number;
    muted: boolean;
    muteWhenHidden: boolean;
  };
  graphics: {
    qualityPreset: QualityPreset;
    resolutionScale: ResolutionScale;
    shadows: boolean;
    weatherParticles: boolean;
    cameraShake: boolean;
    motionInterpolation: boolean;
    highContrastHud: boolean;
    reduceEffects: boolean;
    dayCycleMode: "live" | "qa";
    qaDayCycleSeconds: number;
  };
  network: {
    autoReconnect: boolean;
    showDetails: boolean;
  };
  accessibility: {
    largerHud: boolean;
    highContrastTeams: boolean;
    reduceMotion: boolean;
    captions: boolean;
    reduceWeatherOpacity: boolean;
  };
}

export type ControlSettings = UnSoccerSettings["controls"];

export const SETTINGS_STORAGE_KEY = "unsoccer.settings.v1";

export const DEFAULT_BINDINGS: KeyBindings = {
  moveForward: ["KeyW", "ArrowUp"],
  moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"],
  moveRight: ["KeyD", "ArrowRight"],
  leftKick: ["Mouse0", "KeyJ"],
  rightKick: ["Mouse2", "KeyK"],
  headHit: ["Wheel", "KeyL"],
  settings: ["Escape"],
  cameraReset: ["KeyR"],
  muteAudio: ["KeyM"]
};

export const DEFAULT_SETTINGS: UnSoccerSettings = {
  schemaVersion: 1,
  controls: {
    movementMode: "screen",
    invertForwardBack: false,
    invertLeftRight: false,
    mirrorOnTeamSide: false,
    bindings: DEFAULT_BINDINGS
  },
  audio: {
    master: 0.72,
    sfx: 0.86,
    ambience: 0.42,
    weather: 0.7,
    ui: 0.8,
    muted: false,
    muteWhenHidden: true
  },
  graphics: {
    qualityPreset: "balanced",
    resolutionScale: 1,
    shadows: true,
    weatherParticles: true,
    cameraShake: true,
    motionInterpolation: true,
    highContrastHud: false,
    reduceEffects: false,
    dayCycleMode: "live",
    qaDayCycleSeconds: 0
  },
  network: {
    autoReconnect: true,
    showDetails: false
  },
  accessibility: {
    largerHud: false,
    highContrastTeams: true,
    reduceMotion: false,
    captions: true,
    reduceWeatherOpacity: false
  }
};

export function cloneSettings(value: UnSoccerSettings = DEFAULT_SETTINGS): UnSoccerSettings {
  return {
    schemaVersion: 1,
    controls: { ...value.controls, bindings: cloneBindings(value.controls.bindings) },
    audio: { ...value.audio },
    graphics: { ...value.graphics },
    network: { ...value.network },
    accessibility: { ...value.accessibility }
  };
}

export function loadSettings(): UnSoccerSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<UnSoccerSettings>) : cloneSettings();
  } catch {
    return cloneSettings();
  }
}

export function saveSettings(settings: UnSoccerSettings): boolean {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function resetSettingsTab(settings: UnSoccerSettings, tab: SettingsTab): UnSoccerSettings {
  const next = cloneSettings(settings);
  if (tab === "controls") next.controls = { ...DEFAULT_SETTINGS.controls, bindings: cloneBindings(DEFAULT_BINDINGS) };
  if (tab === "audio") next.audio = { ...DEFAULT_SETTINGS.audio };
  if (tab === "graphics") next.graphics = { ...DEFAULT_SETTINGS.graphics };
  if (tab === "network") next.network = { ...DEFAULT_SETTINGS.network };
  if (tab === "accessibility") next.accessibility = { ...DEFAULT_SETTINGS.accessibility };
  return next;
}

export function bindingConflicts(bindings: KeyBindings): Array<{ code: string; actions: InputAction[] }> {
  const byCode = new Map<string, InputAction[]>();
  for (const action of Object.keys(bindings) as InputAction[]) {
    for (const code of bindings[action]) byCode.set(code, [...(byCode.get(code) || []), action]);
  }
  return Array.from(byCode.entries())
    .filter(([, actions]) => actions.length > 1)
    .map(([code, actions]) => ({ code, actions }));
}

export function setActionBinding(bindings: KeyBindings, action: InputAction, code: string): KeyBindings {
  return { ...bindings, [action]: [code] };
}

function normalizeSettings(value: Partial<UnSoccerSettings>): UnSoccerSettings {
  return {
    schemaVersion: 1,
    controls: {
      movementMode: oneOf(value.controls?.movementMode, ["screen", "team-goal", "camera"], DEFAULT_SETTINGS.controls.movementMode),
      invertForwardBack: Boolean(value.controls?.invertForwardBack),
      invertLeftRight: Boolean(value.controls?.invertLeftRight),
      mirrorOnTeamSide: Boolean(value.controls?.mirrorOnTeamSide),
      bindings: normalizeBindings(value.controls?.bindings)
    },
    audio: {
      master: clamp(value.audio?.master, 0, 1, DEFAULT_SETTINGS.audio.master),
      sfx: clamp(value.audio?.sfx, 0, 1, DEFAULT_SETTINGS.audio.sfx),
      ambience: clamp(value.audio?.ambience, 0, 1, DEFAULT_SETTINGS.audio.ambience),
      weather: clamp(value.audio?.weather, 0, 1, DEFAULT_SETTINGS.audio.weather),
      ui: clamp(value.audio?.ui, 0, 1, DEFAULT_SETTINGS.audio.ui),
      muted: Boolean(value.audio?.muted),
      muteWhenHidden: value.audio?.muteWhenHidden !== false
    },
    graphics: {
      qualityPreset: oneOf(value.graphics?.qualityPreset, ["low", "balanced", "high"], DEFAULT_SETTINGS.graphics.qualityPreset),
      resolutionScale: oneOf(value.graphics?.resolutionScale, [0.6, 0.75, 1], DEFAULT_SETTINGS.graphics.resolutionScale),
      shadows: value.graphics?.shadows !== false,
      weatherParticles: value.graphics?.weatherParticles !== false,
      cameraShake: value.graphics?.cameraShake !== false,
      motionInterpolation: value.graphics?.motionInterpolation !== false,
      highContrastHud: Boolean(value.graphics?.highContrastHud),
      reduceEffects: Boolean(value.graphics?.reduceEffects),
      dayCycleMode: oneOf(value.graphics?.dayCycleMode, ["live", "qa"], DEFAULT_SETTINGS.graphics.dayCycleMode),
      qaDayCycleSeconds: clamp(value.graphics?.qaDayCycleSeconds, 0, 119.99, DEFAULT_SETTINGS.graphics.qaDayCycleSeconds)
    },
    network: {
      autoReconnect: value.network?.autoReconnect !== false,
      showDetails: Boolean(value.network?.showDetails)
    },
    accessibility: {
      largerHud: Boolean(value.accessibility?.largerHud),
      highContrastTeams: value.accessibility?.highContrastTeams !== false,
      reduceMotion: Boolean(value.accessibility?.reduceMotion),
      captions: value.accessibility?.captions !== false,
      reduceWeatherOpacity: Boolean(value.accessibility?.reduceWeatherOpacity)
    }
  };
}

function normalizeBindings(value: Partial<KeyBindings> | undefined): KeyBindings {
  const next = cloneBindings(DEFAULT_BINDINGS);
  if (!value) return next;
  for (const action of Object.keys(next) as InputAction[]) {
    const codes = value[action];
    if (Array.isArray(codes) && codes.length > 0) next[action] = Array.from(new Set(codes.filter(Boolean)));
  }
  return next;
}

function cloneBindings(bindings: KeyBindings): KeyBindings {
  return Object.fromEntries(
    (Object.keys(DEFAULT_BINDINGS) as InputAction[]).map((action) => [action, [...(bindings[action] || DEFAULT_BINDINGS[action])]])
  ) as KeyBindings;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function oneOf<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
