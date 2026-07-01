import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  BALL_RADIUS,
  DAY_CYCLE_SECONDS,
  DAY_START_SECONDS,
  DEFAULT_INPUT,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_VERSION,
  GOAL_DEPTH,
  GOAL_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_EXHAUSTED_SPEED_MULTIPLIER,
  PLAYER_SPEED,
  PLAYER_SPRINT_MULTIPLIER,
  type HazardSnapshot,
  type HazardType,
  type TeamId,
  type InputState,
  type JoinAccepted,
  type KickKind,
  type PlayerSnapshot,
  type ServerAudioEvent,
  type ServerState,
  type WeatherSnapshot
} from "@itch-games/unsoccer-shared";
import { UnSoccerAudio, type AudioRuntimeSnapshot } from "./audio";
import { actionPressed, codeForAction, resolveMovementInput } from "./input-map";
import {
  bindingConflicts,
  cloneSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  resetSettingsTab,
  saveSettings,
  setActionBinding,
  SETTINGS_STORAGE_KEY,
  type InputAction,
  type QualityPreset,
  type SettingsTab,
  type UnSoccerSettings
} from "./settings";
import { WeatherVisualLayer } from "./weather";
import "./styles.css";

interface NetworkChannel {
  emit(eventName: string, data: unknown, options?: unknown): void;
  on(eventName: string, handler: (data: unknown) => void): void;
  onConnect(handler: (error?: Error) => void): void;
  onDisconnect(handler: () => void): void;
  close(): void;
}

interface WireMessage {
  event?: unknown;
  data?: unknown;
}

class WebSocketNetworkChannel implements NetworkChannel {
  private readonly socket: WebSocket;
  private readonly handlers = new Map<string, Array<(data: unknown) => void>>();
  private connectHandler: ((error?: Error) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private settled = false;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => {
      this.settled = true;
      this.connectHandler?.();
    });
    this.socket.addEventListener("error", () => {
      if (this.settled) return;
      this.settled = true;
      this.connectHandler?.(new Error("websocket connection failed"));
    });
    this.socket.addEventListener("close", () => {
      if (!this.settled) {
        this.settled = true;
        this.connectHandler?.(new Error("websocket connection closed"));
      }
      this.disconnectHandler?.();
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  emit(eventName: string, data: unknown): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ event: eventName, data }));
  }

  on(eventName: string, handler: (data: unknown) => void): void {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  onConnect(handler: (error?: Error) => void): void {
    this.connectHandler = handler;
    if (this.socket.readyState === WebSocket.OPEN) handler();
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch (_) {
      return;
    }
    if (typeof message.event !== "string") return;
    for (const handler of this.handlers.get(message.event) || []) {
      handler(message.data);
    }
  }
}

declare global {
  interface Window {
    unsoccerDebug: {
      setDayCycleSeconds: (value: number | null) => void;
      clearDayCycleOverride: () => void;
      snapshot: () => {
        version: string;
        connected: boolean;
        localJoin: JoinAccepted | null;
        latestState: ServerState | null;
        dayCycleSeconds: string;
        daylight: string;
        camera: { x: number; y: number; z: number };
        audio: AudioRuntimeSnapshot;
        art: {
          pass: string;
          environment: string;
          sunVisible: boolean;
          sunFramed: boolean;
          moonVisible: boolean;
          moonFramed: boolean;
          rig: string;
        };
        ui: {
          settingsOpen: boolean;
          activeTab: SettingsTab;
          movementMode: string;
          graphicsPreset: string;
          transport: string;
          bindingConflicts: number;
        };
        interpolation: {
          bufferedStates: number;
          delayMs: number;
          alpha: number;
          renderAgeMs: number;
          localPredictionMs: number;
        };
        serverAudio: {
          lastEventId: number;
          primed: boolean;
        };
        weather: {
          hazards: number;
          localHazardId: string | null;
          ballHazardId: string | null;
          hazardAudioEvents: Record<HazardType, number>;
        };
      };
    };
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`unsoccer UI is missing ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game-canvas");
const blueScoreEl = requireElement<HTMLElement>("#blue-score");
const orangeScoreEl = requireElement<HTMLElement>("#orange-score");
const statusEl = requireElement<HTMLElement>("#status");
const weatherEl = requireElement<HTMLElement>("#weather");
const rosterEl = requireElement<HTMLElement>("#roster");
const playerRoleEl = requireElement<HTMLElement>("#player-role");
const playerTeamEl = requireElement<HTMLElement>("#player-team");
const playerInputModeEl = requireElement<HTMLElement>("#player-input-mode");
const transportStatusEl = requireElement<HTMLElement>("#transport-status");
const pingStatusEl = requireElement<HTMLElement>("#ping-status");
const snapshotAgeEl = requireElement<HTMLElement>("#snapshot-age");
const eventFeedEl = requireElement<HTMLElement>("#event-feed");
const controlHintsEl = requireElement<HTMLElement>("#control-hints");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const muteButton = requireElement<HTMLButtonElement>("#mute-button");
const fullscreenButton = requireElement<HTMLButtonElement>("#fullscreen-button");
const cameraResetButton = requireElement<HTMLButtonElement>("#camera-reset-button");
const settingsPanel = requireElement<HTMLElement>("#settings-panel");
const settingsForm = requireElement<HTMLFormElement>("#settings-form");
const settingsSaveStateEl = requireElement<HTMLElement>("#settings-save-state");
const settingsCloseButton = requireElement<HTMLButtonElement>("#settings-close-button");
const resetTabButton = requireElement<HTMLButtonElement>("#reset-tab-button");
const resetAllButton = requireElement<HTMLButtonElement>("#reset-all-button");
const applySettingsButton = requireElement<HTMLButtonElement>("#apply-settings-button");
const bindingConflictsEl = requireElement<HTMLElement>("#binding-conflicts");
const audioStateEl = requireElement<HTMLElement>("#audio-state");
const graphicsStateEl = requireElement<HTMLElement>("#graphics-state");
const networkStateEl = requireElement<HTMLElement>("#network-state");
const testSoundButton = requireElement<HTMLButtonElement>("#test-sound-button");
const versionBadge = requireElement<HTMLElement>("#version-badge");
const ART_PASS_VERSION = "v0.0.014";
const BUILD_WEIGHT_LABEL = "3.26 MB";

versionBadge.textContent = `${GAME_VERSION} / ${BUILD_WEIGHT_LABEL}`;
document.documentElement.dataset.gameVersion = GAME_VERSION;
document.documentElement.dataset.gameWeightLabel = BUILD_WEIGHT_LABEL;
document.documentElement.dataset.artPass = ART_PASS_VERSION;
document.documentElement.dataset.environment = "residential-courtyard-v011";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.Fog(0x07110f, 26, 62);
const dayColor = new THREE.Color(0x8fd7ff);
const sunsetColor = new THREE.Color(0xff9b5a);
const nightColor = new THREE.Color(0x07110f);
const fogDayColor = new THREE.Color(0xb7ede0);
const fogNightColor = new THREE.Color(0x07110f);
const snowFogColor = new THREE.Color(0xd9f3ff);
const sunColor = new THREE.Color();
const skyColor = new THREE.Color();
const fogColor = new THREE.Color();
const bounceColor = new THREE.Color();

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 150);
camera.position.set(0, 16, -16);
camera.lookAt(0, 0, 0);
const cameraLookAt = new THREE.Vector3();
const cameraFocus = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const cameraBall = new THREE.Vector3();
const cameraVelocity = new THREE.Vector3();
const cameraBallBlend = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();

const hemi = new THREE.HemisphereLight(0xd8fff2, 0x172822, 1.5);
scene.add(hemi);
const ambientFill = new THREE.AmbientLight(0x92b7ad, 0.16);
scene.add(ambientFill);
const courtyardBounce = new THREE.PointLight(0x9fc7b3, 0.68, 42, 1.8);
courtyardBounce.position.set(0, 4.6, 0);
scene.add(courtyardBounce);
const sun = new THREE.DirectionalLight(0xfff1d0, 1.8);
sun.position.set(-12, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 78;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
scene.add(sun);
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.25, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff1d0, depthTest: true, depthWrite: false, toneMapped: false })
);
const sunGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff0b8,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});
const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(2.85, 32, 16), sunGlowMaterial);
const moonMaterial = new THREE.MeshBasicMaterial({
  color: 0xbfd6ff,
  transparent: true,
  opacity: 0.82,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 20, 12), moonMaterial);
scene.add(camera, sunGlow, sunMesh, moonMesh);
const sunPathMaterial = new THREE.LineBasicMaterial({ color: 0xfff0b8, transparent: true, opacity: 0.26 });
const sunPath = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 96 }, (_, i) => {
      const a = i / 96 * Math.PI * 2 - Math.PI * 0.22;
      return new THREE.Vector3(Math.cos(a) * 40.8, Math.sin(a) * 40.8, Math.sin(a + 0.55) * 30.6);
    })
  ),
  sunPathMaterial
);
sunPath.position.y = 0;
sunPath.visible = false;
scene.add(sunPath);

const rimLight = new THREE.DirectionalLight(0x8bbcff, 0.55);
rimLight.position.set(18, 10, -18);
scene.add(rimLight);

const skyMaterial = new THREE.MeshBasicMaterial({
  color: 0x153d56,
  side: THREE.BackSide,
  fog: false
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(96, 32, 18), skyMaterial);
skyDome.position.y = 4;
scene.add(skyDome);

const floodLights: THREE.SpotLight[] = [];
for (const [x, z] of [
  [-FIELD_WIDTH / 2 - 5.5, -FIELD_LENGTH / 2 - 4.4],
  [FIELD_WIDTH / 2 + 5.5, -FIELD_LENGTH / 2 - 4.4],
  [-FIELD_WIDTH / 2 - 5.5, FIELD_LENGTH / 2 + 4.4],
  [FIELD_WIDTH / 2 + 5.5, FIELD_LENGTH / 2 + 4.4]
] as const) {
  const flood = new THREE.SpotLight(0xc5ddff, 0.18, 64, Math.PI / 5, 0.5, 1.35);
  flood.position.set(x, 13, z);
  flood.target.position.set(0, 0, 0);
  flood.castShadow = true;
  flood.shadow.mapSize.set(512, 512);
  scene.add(flood, flood.target);
  floodLights.push(flood);
}

const BALL_VARIANT_COLORS = [
  [0xf4f7fa, 0x111111],
  [0x121212, 0xf2f2f2],
  [0xf8f0de, 0xc82036],
  [0xf7d65c, 0x233c7d],
  [0xe55aa4, 0x32184f],
  [0x79d8ff, 0x145c7a],
  [0xe8f2ef, 0x2b7a4b],
  [0xff9d42, 0x27231c],
  [0xd8f7ff, 0x8f45d2],
  [0xf5f5f5, 0x2a2f3a]
] as const;

const fieldGroup = new THREE.Group();
scene.add(fieldGroup);
const movingCars: MovingCar[] = [];
const goalNets: GoalNetVisual[] = [];
const sidelineBalls: THREE.Group[] = [];
const activeFree3dBalls: THREE.Object3D[] = [];
const activeFree3dBallRoot = new THREE.Group();
const free3dBallLoader = new GLTFLoader();
const free3dCharacterLoader = new GLTFLoader();
const transparentFbxTexture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const free3dCharacterAnimationManager = new THREE.LoadingManager();
free3dCharacterAnimationManager.setURLModifier((url) => {
  if (/\.(png|jpe?g|webp|bmp|tga)(\?.*)?$/i.test(url)) return transparentFbxTexture;
  return url;
});
const free3dCharacterAnimationLoader = new FBXLoader(free3dCharacterAnimationManager);
const free3dTextureLoader = new THREE.TextureLoader();
const free3dBallMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.56,
  metalness: 0.02,
  vertexColors: true
});
const weatherLayer = new WeatherVisualLayer({ scene, fieldWidth: FIELD_WIDTH, fieldLength: FIELD_LENGTH });

const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 18);
applyBallVertexColors(ballGeometry, 0);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03, vertexColors: true });
const ballMesh = new THREE.Mesh(
  ballGeometry,
  ballMaterial
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);
addBallSeams(ballMesh, BALL_RADIUS * 1.012, 0);
const ballAuraMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff2b8,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false
});
const ballAura = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS * 1.52, 32, 18), ballAuraMaterial);
scene.add(ballAura);
activeFree3dBallRoot.visible = false;
scene.add(activeFree3dBallRoot);
let currentActiveBallVariant = 0;

const ACTION_TELEGRAPH: Record<KickKind, {
  color: number;
  opacity: number;
  scale: [number, number, number];
  ballPulse: number;
  cameraImpulse: number;
}> = {
  left: {
    color: 0x58a8ff,
    opacity: 0.66,
    scale: [1.15, 0.8, 2.35],
    ballPulse: 0.78,
    cameraImpulse: 0.56
  },
  hand: {
    color: 0xff9d42,
    opacity: 0.7,
    scale: [1.55, 1.0, 1.75],
    ballPulse: 0.62,
    cameraImpulse: 0.46
  },
  head: {
    color: 0xf7fbff,
    opacity: 0.74,
    scale: [1.55, 1.55, 1.55],
    ballPulse: 0.84,
    cameraImpulse: 0.64
  },
  body: {
    color: 0xfff16a,
    opacity: 0.82,
    scale: [2.35, 1.35, 1.55],
    ballPulse: 1,
    cameraImpulse: 1
  },
  jump: {
    color: 0xbef2ff,
    opacity: 0.52,
    scale: [1.2, 1.9, 1.2],
    ballPulse: 0.26,
    cameraImpulse: 0.22
  }
};

const players = new Map<string, PlayerVisual>();
let latestState: ServerState | null = null;
let renderedState: ServerState | null = null;
let localJoin: JoinAccepted | null = null;
let connected = false;
let inputSequence = 0;
let input: InputState = { ...DEFAULT_INPUT };
let channel: NetworkChannel | null = null;
let transportMode: "none" | "websocket" | "http" = "none";
let httpClientId: string | null = null;
let httpPollGeneration = 0;
let lastSentAt = 0;
let lastSeenActionAt = 0;
let ballPulse = 0;
let cameraImpulse = 0;
let lastFrameSeconds = 0;
let interpolationAlpha = 1;
let interpolationRenderAgeMs = 0;
let qaDayCycleSeconds: number | null = readQaDayCycleSeconds();
const audio = new UnSoccerAudio();
let lastConsumedAudioEventId = 0;
let audioEventsPrimed = false;
let audioUnlockAttempts = 0;
let audioObservedLocalHazardId: string | null = null;
let audioObservedBallHazardId: string | null = null;
const hazardAudioEvents: Record<HazardType, number> = {
  puddle: 0,
  slush: 0,
  snowbank: 0
};
const STATE_INTERPOLATION_DELAY_SECONDS = 0.1;
const STATE_HISTORY_LIMIT = 12;
const PLAYER_SNAP_DISTANCE = 7.5;
const BALL_SNAP_DISTANCE = FIELD_LENGTH * 0.45;
const LOCAL_PLAYER_PREDICTION_MAX_SECONDS = 0.12;
const stateHistory: Array<{ state: ServerState; receivedAt: number }> = [];
let localPredictionLeadMs = 0;
let settings: UnSoccerSettings = loadSettings();
let activeSettingsTab: SettingsTab = "controls";
let settingsOpen = false;
let pendingRebindAction: InputAction | null = null;
let latestSnapshotReceivedAt = 0;
const pressedCodes = new Set<string>();
const eventFeedMessages: string[] = [];

function inputEl(selector: string): HTMLInputElement {
  return requireElement<HTMLInputElement>(selector);
}

function selectEl(selector: string): HTMLSelectElement {
  return requireElement<HTMLSelectElement>(selector);
}

function readQaDayCycleSeconds(): number | null {
  const value = Number(new URLSearchParams(location.search).get("qaTime"));
  if (!Number.isFinite(value)) return null;
  return THREE.MathUtils.euclideanModulo(value, DAY_CYCLE_SECONDS);
}

function setQaDayCycleSeconds(value: number | null): void {
  qaDayCycleSeconds = value === null ? null : THREE.MathUtils.euclideanModulo(value, DAY_CYCLE_SECONDS);
  document.documentElement.dataset.qaDayCycleSeconds = qaDayCycleSeconds === null ? "realtime" : qaDayCycleSeconds.toFixed(2);
}

window.unsoccerDebug = {
  setDayCycleSeconds: setQaDayCycleSeconds,
  clearDayCycleOverride: () => setQaDayCycleSeconds(null),
  snapshot: () => ({
    version: GAME_VERSION,
    connected,
    localJoin,
    latestState,
    dayCycleSeconds: document.documentElement.dataset.dayCycleSeconds || "0",
    daylight: document.documentElement.dataset.daylight || "0",
    camera: {
      x: Number(camera.position.x.toFixed(2)),
      y: Number(camera.position.y.toFixed(2)),
      z: Number(camera.position.z.toFixed(2))
    },
    audio: audio.snapshot(),
    art: {
      pass: ART_PASS_VERSION,
      environment: document.documentElement.dataset.environment || "",
      sunVisible: document.documentElement.dataset.sunVisible === "true",
      sunFramed: document.documentElement.dataset.sunFramed === "true",
      moonVisible: document.documentElement.dataset.moonVisible === "true",
      moonFramed: document.documentElement.dataset.moonFramed === "true",
      rig: document.documentElement.dataset.playerRig || ""
    },
    ui: {
      settingsOpen,
      activeTab: activeSettingsTab,
      movementMode: settings.controls.movementMode,
      graphicsPreset: settings.graphics.qualityPreset,
      transport: transportMode,
      bindingConflicts: bindingConflicts(settings.controls.bindings).length
    },
    interpolation: {
      bufferedStates: stateHistory.length,
      delayMs: Math.round(STATE_INTERPOLATION_DELAY_SECONDS * 1000),
      alpha: Number(interpolationAlpha.toFixed(3)),
      renderAgeMs: Math.round(interpolationRenderAgeMs),
      localPredictionMs: Math.round(localPredictionLeadMs)
    },
    serverAudio: {
      lastEventId: lastConsumedAudioEventId,
      primed: audioEventsPrimed
    },
    weather: {
      hazards: latestState?.weather?.hazards.length ?? 0,
      localHazardId: audioObservedLocalHazardId,
      ballHazardId: audioObservedBallHazardId,
      hazardAudioEvents: { ...hazardAudioEvents }
    }
  })
};
setQaDayCycleSeconds(qaDayCycleSeconds);
syncAudioDebugDataset();

function syncAudioDebugDataset() {
  const audioState = audio.snapshot();
  document.documentElement.dataset.audioSupported = String(audioState.supported);
  document.documentElement.dataset.audioUnlocked = String(audioState.unlocked);
  document.documentElement.dataset.audioContext = audioState.contextState;
  document.documentElement.dataset.audioAmbience = String(audioState.ambienceReady);
  document.documentElement.dataset.audioRollGain = audioState.rollGain.toFixed(4);
  document.documentElement.dataset.audioCrowdGain = audioState.crowdGain.toFixed(4);
  document.documentElement.dataset.audioWeatherGain = audioState.weatherGain.toFixed(4);
  document.documentElement.dataset.audioBirdsGain = audioState.birdsGain.toFixed(4);
  document.documentElement.dataset.audioRoadGain = audioState.roadGain.toFixed(4);
  document.documentElement.dataset.audioBirdChirpsPlayed = String(audioState.birdChirpsPlayed);
  document.documentElement.dataset.audioCarPassesPlayed = String(audioState.carPassesPlayed);
  document.documentElement.dataset.audioPlayedEvents = String(audioState.playedEvents);
  document.documentElement.dataset.audioBlockedEvents = String(audioState.blockedEvents);
  document.documentElement.dataset.audioLastEvent = audioState.lastEvent || "none";
  document.documentElement.dataset.audioLastBlockedEvent = audioState.lastBlockedEvent || "none";
  document.documentElement.dataset.audioServerEventId = String(lastConsumedAudioEventId);
  document.documentElement.dataset.audioServerPrimed = String(audioEventsPrimed);
  document.documentElement.dataset.audioUnlockAttempts = String(audioUnlockAttempts);
  document.documentElement.dataset.audioUserActivation = audioUserActivationLabel();
  document.documentElement.dataset.hazardAudioPuddle = String(hazardAudioEvents.puddle);
  document.documentElement.dataset.hazardAudioSlush = String(hazardAudioEvents.slush);
  document.documentElement.dataset.hazardAudioSnowbank = String(hazardAudioEvents.snowbank);
}

function audioUserActivationLabel(): string {
  const activation = navigator.userActivation;
  if (!activation) return "unsupported";
  return `${activation.isActive ? "active" : "inactive"}:${activation.hasBeenActive ? "used" : "fresh"}`;
}

const ACTION_LABELS: Record<InputAction, string> = {
  moveForward: "\u0412\u043f\u0435\u0440\u0435\u0434",
  moveBack: "\u041d\u0430\u0437\u0430\u0434",
  moveLeft: "\u0412\u043b\u0435\u0432\u043e",
  moveRight: "\u0412\u043f\u0440\u0430\u0432\u043e",
  leftKick: "\u041b\u0435\u0432\u0430\u044f \u043d\u043e\u0433\u0430",
  rightKick: "\u0420\u0443\u043a\u0430",
  headHit: "\u0413\u043e\u043b\u043e\u0432\u0430",
  jump: "\u041f\u0440\u044b\u0436\u043e\u043a",
  sprint: "\u0421\u043f\u0440\u0438\u043d\u0442",
  settings: "\u041c\u0435\u043d\u044e",
  cameraReset: "\u041a\u0430\u043c\u0435\u0440\u0430",
  muteAudio: "\u0417\u0432\u0443\u043a"
};

function syncSettingsUi(): void {
  selectEl("#setting-movement-mode").value = settings.controls.movementMode;
  inputEl("#setting-invert-fb").checked = settings.controls.invertForwardBack;
  inputEl("#setting-invert-lr").checked = settings.controls.invertLeftRight;
  inputEl("#setting-mirror-team").checked = settings.controls.mirrorOnTeamSide;
  inputEl("#setting-audio-master").value = String(settings.audio.master);
  inputEl("#setting-audio-sfx").value = String(settings.audio.sfx);
  inputEl("#setting-audio-ambience").value = String(settings.audio.ambience);
  inputEl("#setting-audio-weather").value = String(settings.audio.weather);
  inputEl("#setting-audio-ui").value = String(settings.audio.ui);
  inputEl("#setting-audio-muted").checked = settings.audio.muted;
  inputEl("#setting-audio-bg-muted").checked = settings.audio.muteWhenHidden;
  selectEl("#setting-quality").value = settings.graphics.qualityPreset;
  selectEl("#setting-resolution").value = String(settings.graphics.resolutionScale);
  inputEl("#setting-shadows").checked = settings.graphics.shadows;
  inputEl("#setting-weather-particles").checked = settings.graphics.weatherParticles;
  inputEl("#setting-camera-shake").checked = settings.graphics.cameraShake;
  inputEl("#setting-motion-interpolation").checked = settings.graphics.motionInterpolation;
  inputEl("#setting-high-contrast-hud").checked = settings.graphics.highContrastHud;
  inputEl("#setting-reduce-effects").checked = settings.graphics.reduceEffects;
  selectEl("#setting-day-cycle-mode").value = settings.graphics.dayCycleMode;
  inputEl("#setting-qa-time").value = String(settings.graphics.qaDayCycleSeconds);
  inputEl("#setting-auto-reconnect").checked = settings.network.autoReconnect;
  inputEl("#setting-show-network-details").checked = settings.network.showDetails;
  inputEl("#setting-larger-hud").checked = settings.accessibility.largerHud;
  inputEl("#setting-high-contrast-teams").checked = settings.accessibility.highContrastTeams;
  inputEl("#setting-reduce-motion").checked = settings.accessibility.reduceMotion;
  inputEl("#setting-captions").checked = settings.accessibility.captions;
  inputEl("#setting-reduce-weather-opacity").checked = settings.accessibility.reduceWeatherOpacity;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-rebind-action]")) {
    const action = button.dataset.rebindAction as InputAction;
    button.innerHTML = `<span>${escapeHtml(ACTION_LABELS[action])}</span><strong>${escapeHtml(formatBinding(codeForAction(settings.controls, action)))}</strong>`;
  }
  setActiveSettingsTab(activeSettingsTab);
  syncInputTestPad();
  syncSettingsNotes();
}

function readSettingsFromForm(): void {
  settings = {
    ...settings,
    controls: {
      ...settings.controls,
      movementMode: selectEl("#setting-movement-mode").value as UnSoccerSettings["controls"]["movementMode"],
      invertForwardBack: inputEl("#setting-invert-fb").checked,
      invertLeftRight: inputEl("#setting-invert-lr").checked,
      mirrorOnTeamSide: inputEl("#setting-mirror-team").checked
    },
    audio: {
      master: Number(inputEl("#setting-audio-master").value),
      sfx: Number(inputEl("#setting-audio-sfx").value),
      ambience: Number(inputEl("#setting-audio-ambience").value),
      weather: Number(inputEl("#setting-audio-weather").value),
      ui: Number(inputEl("#setting-audio-ui").value),
      muted: inputEl("#setting-audio-muted").checked,
      muteWhenHidden: inputEl("#setting-audio-bg-muted").checked
    },
    graphics: {
      ...settings.graphics,
      qualityPreset: selectEl("#setting-quality").value as QualityPreset,
      resolutionScale: Number(selectEl("#setting-resolution").value) as UnSoccerSettings["graphics"]["resolutionScale"],
      shadows: inputEl("#setting-shadows").checked,
      weatherParticles: inputEl("#setting-weather-particles").checked,
      cameraShake: inputEl("#setting-camera-shake").checked,
      motionInterpolation: inputEl("#setting-motion-interpolation").checked,
      highContrastHud: inputEl("#setting-high-contrast-hud").checked,
      reduceEffects: inputEl("#setting-reduce-effects").checked,
      dayCycleMode: selectEl("#setting-day-cycle-mode").value as UnSoccerSettings["graphics"]["dayCycleMode"],
      qaDayCycleSeconds: Number(inputEl("#setting-qa-time").value)
    },
    network: {
      autoReconnect: inputEl("#setting-auto-reconnect").checked,
      showDetails: inputEl("#setting-show-network-details").checked
    },
    accessibility: {
      largerHud: inputEl("#setting-larger-hud").checked,
      highContrastTeams: inputEl("#setting-high-contrast-teams").checked,
      reduceMotion: inputEl("#setting-reduce-motion").checked,
      captions: inputEl("#setting-captions").checked,
      reduceWeatherOpacity: inputEl("#setting-reduce-weather-opacity").checked
    }
  };
  persistAndApplySettings();
}

function persistAndApplySettings(): void {
  settingsSaveStateEl.textContent = saveSettings(settings) ? "\u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e" : "\u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e";
  applySettingsToRuntime();
  syncSettingsUi();
}

function applySettingsToRuntime(): void {
  const maxDpr: Record<QualityPreset, number> = { low: 1, balanced: 1.5, high: 2 };
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, maxDpr[settings.graphics.qualityPreset]) * settings.graphics.resolutionScale));
  renderer.shadowMap.enabled = settings.graphics.shadows;
  sun.castShadow = settings.graphics.shadows;
  for (const flood of floodLights) flood.castShadow = settings.graphics.shadows;
  audio.setVolumes(settings.audio);
  weatherLayer.setOptions({
    particlesEnabled: settings.graphics.weatherParticles && !settings.graphics.reduceEffects,
    opacityScale: settings.accessibility.reduceWeatherOpacity ? 0.45 : 1
  });
  if (settings.graphics.dayCycleMode === "qa") setQaDayCycleSeconds(settings.graphics.qaDayCycleSeconds);
  else if (!new URLSearchParams(location.search).has("qaTime")) setQaDayCycleSeconds(null);
  document.documentElement.dataset.settingsStorageKey = SETTINGS_STORAGE_KEY;
  document.documentElement.dataset.settingsOpen = String(settingsOpen);
  document.documentElement.dataset.settingsActiveTab = activeSettingsTab;
  document.documentElement.dataset.movementMode = settings.controls.movementMode;
  document.documentElement.dataset.invertForwardBack = String(settings.controls.invertForwardBack);
  document.documentElement.dataset.invertLeftRight = String(settings.controls.invertLeftRight);
  document.documentElement.dataset.bindingConflicts = String(bindingConflicts(settings.controls.bindings).length);
  document.documentElement.dataset.graphicsPreset = settings.graphics.qualityPreset;
  document.documentElement.dataset.resolutionScale = String(settings.graphics.resolutionScale);
  document.documentElement.dataset.motionInterpolation = String(settings.graphics.motionInterpolation);
  document.documentElement.dataset.audioMuted = String(settings.audio.muted);
  document.documentElement.dataset.hudScale = settings.accessibility.largerHud ? "large" : "normal";
  document.documentElement.dataset.hudContrast = settings.graphics.highContrastHud ? "high" : "normal";
  document.documentElement.dataset.weatherOpacity = settings.accessibility.reduceWeatherOpacity ? "reduced" : "normal";
  document.documentElement.dataset.ibl = "procedural-sky";
  document.documentElement.dataset.visibleSun = String(sunMesh.visible);
  muteButton.textContent = settings.audio.muted ? "MUT" : "AUD";
  updateControlHints();
  updatePlayerChip();
  resize();
}

function setSettingsOpen(open: boolean): void {
  settingsOpen = open;
  settingsPanel.hidden = !open;
  document.documentElement.dataset.settingsOpen = String(open);
  if (open) {
    pressedCodes.clear();
    updateResolvedInput();
    syncSettingsUi();
    settingsPanel.querySelector<HTMLElement>("button[data-settings-tab]")?.focus();
  } else {
    pendingRebindAction = null;
    syncSettingsUi();
    canvas.focus();
  }
}

function setActiveSettingsTab(tab: SettingsTab): void {
  activeSettingsTab = tab;
  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]")) button.setAttribute("aria-selected", String(button.dataset.settingsTab === tab));
  for (const panel of document.querySelectorAll<HTMLElement>("[data-settings-panel]")) panel.hidden = panel.dataset.settingsPanel !== tab;
  document.documentElement.dataset.settingsActiveTab = tab;
}

function bindAction(action: InputAction, code: string): void {
  const bindings = { ...settings.controls.bindings };
  for (const key of Object.keys(bindings) as InputAction[]) bindings[key] = bindings[key].filter((item) => item !== code);
  settings = { ...settings, controls: { ...settings.controls, bindings: setActionBinding(bindings, action, code) } };
  pendingRebindAction = null;
  persistAndApplySettings();
}

function syncSettingsNotes(): void {
  const conflicts = bindingConflicts(settings.controls.bindings);
  bindingConflictsEl.textContent = pendingRebindAction
    ? `${ACTION_LABELS[pendingRebindAction]}: \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043b\u0430\u0432\u0438\u0448\u0443`
    : conflicts.length ? `Conflicts: ${conflicts.map((item) => item.code).join(", ")}` : "\u0414\u0443\u0431\u043b\u0438 \u0437\u0430\u043c\u0435\u043d\u044f\u044e\u0442\u0441\u044f.";
  const audioState = audio.snapshot();
  audioStateEl.textContent = `Audio: ${audioState.contextState}, unlocked=${audioState.unlocked}`;
  graphicsStateEl.textContent = `IBL=${document.documentElement.dataset.ibl || "procedural-sky"} / sun=${document.documentElement.dataset.visibleSun || "true"} / day=${document.documentElement.dataset.dayCycleSeconds || "0"}s`;
  networkStateEl.textContent = `Transport=${transportMode}, snapshot=${latestSnapshotReceivedAt ? Math.round(performance.now() - latestSnapshotReceivedAt) : "--"}ms`;
}

function updateControlHints(): void {
  const move = `${formatBinding(codeForAction(settings.controls, "moveForward"))}/${formatBinding(codeForAction(settings.controls, "moveLeft"))}/${formatBinding(codeForAction(settings.controls, "moveBack"))}/${formatBinding(codeForAction(settings.controls, "moveRight"))}`;
  controlHintsEl.innerHTML = [
    `<span>\u0425\u043e\u0434 ${escapeHtml(move)}</span>`,
    `<span>\u0423\u0434\u0430\u0440/\u0440\u0443\u043a\u0430 ${escapeHtml(formatBinding(codeForAction(settings.controls, "leftKick")))}/${escapeHtml(formatBinding(codeForAction(settings.controls, "rightKick")))}</span>`,
    `<span>\u0413\u043e\u043b\u043e\u0432\u0430 ${escapeHtml(formatBinding(codeForAction(settings.controls, "headHit")))}</span>`,
    `<span>\u041f\u0440\u044b\u0436\u043e\u043a/\u0441\u043f\u0440\u0438\u043d\u0442 ${escapeHtml(formatBinding(codeForAction(settings.controls, "jump")))}/${escapeHtml(formatBinding(codeForAction(settings.controls, "sprint")))}</span>`,
    `<span>\u041c\u0435\u043d\u044e ${escapeHtml(formatBinding(codeForAction(settings.controls, "settings")))}</span>`
  ].join("");
}

function updatePlayerChip(): void {
  playerRoleEl.textContent = connected ? (localJoin?.role === "player" ? "\u0418\u0433\u0440\u043e\u043a" : "\u0417\u0440\u0438\u0442\u0435\u043b\u044c") : "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435";
  playerTeamEl.textContent = localJoin ? teamNameLabel(localJoin.team) : "\u0417\u0440\u0438\u0442\u0435\u043b\u044c";
  playerInputModeEl.textContent = settings.controls.movementMode === "team-goal" ? "Team-goal" : settings.controls.movementMode === "camera" ? "Camera" : "Screen";
}

function updateNetworkHud(now = performance.now()): void {
  transportStatusEl.textContent = transportMode === "none" ? "offline" : transportMode;
  const serverLag = latestState ? Math.max(0, Date.now() - latestState.serverTime) : null;
  pingStatusEl.textContent = serverLag === null ? "-- ms" : `${Math.min(serverLag, 9999)} ms`;
  snapshotAgeEl.textContent = latestSnapshotReceivedAt ? `${Math.round(now - latestSnapshotReceivedAt)} ms` : "snapshot --";
  if (settingsOpen) syncSettingsNotes();
}

function pushEventFeed(message: string): void {
  if (!message || eventFeedMessages[0] === message) return;
  eventFeedMessages.unshift(message);
  eventFeedMessages.splice(4);
  eventFeedEl.innerHTML = eventFeedMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function syncInputTestPad(): void {
  for (const item of document.querySelectorAll<HTMLElement>("[data-pad]")) {
    item.classList.toggle("is-active", actionPressed(settings.controls, item.dataset.pad as InputAction, pressedCodes));
  }
}

function updateResolvedInput(): void {
  input = resolveMovementInput(settings.controls, pressedCodes, localJoin?.team ?? null, input);
  syncInputTestPad();
}

function formatBinding(code: string): string {
  return code
    ? code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace("Arrow", "")
      .replace("Mouse0", "LMB")
      .replace("Mouse2", "RMB")
      .replace("ShiftLeft", "Shift")
      .replace("ShiftRight", "Shift")
      .replace("Space", "Space")
    : "--";
}

function resetCamera(): void {
  cameraImpulse = 0;
  cameraLookAt.set(0, 0, 0);
  updateCamera(1 / 60);
}

function toggleMute(): void {
  settings = { ...settings, audio: { ...settings.audio, muted: !settings.audio.muted } };
  persistAndApplySettings();
}

function applyBallVertexColors(geometry: THREE.BufferGeometry, variant: number): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const primary = new THREE.Color(BALL_VARIANT_COLORS[variant % BALL_VARIANT_COLORS.length][0]);
  const secondary = new THREE.Color(BALL_VARIANT_COLORS[variant % BALL_VARIANT_COLORS.length][1]);
  const seam = new THREE.Color(0x0b1012);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const longitude = Math.atan2(z, x);
    const latitude = Math.acos(THREE.MathUtils.clamp(y / BALL_RADIUS, -1, 1));
    const panel = Math.sin(longitude * 5 + variant * 0.7) * Math.sin(latitude * 4.2);
    const stripe = Math.abs(Math.sin(longitude * 10 + latitude * 3 + variant)) > 0.9;
    const color = stripe ? seam : panel > 0.16 ? secondary : primary;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function addBallSeams(parent: THREE.Object3D, radius: number, variant: number): void {
  const seamMaterial = new THREE.LineBasicMaterial({
    color: BALL_VARIANT_COLORS[variant % BALL_VARIANT_COLORS.length][1],
    transparent: true,
    opacity: 0.68
  });
  for (const rotation of [0, Math.PI / 2, Math.PI / 4]) {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 64 }, (_, index) => {
          const angle = index / 64 * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        })
      ),
      seamMaterial
    );
    ring.rotation.y = rotation;
    parent.add(ring);
  }
}

function setBallSeamVariant(parent: THREE.Object3D, variant: number): void {
  const seamColor = BALL_VARIANT_COLORS[variant % BALL_VARIANT_COLORS.length][1];
  for (const child of parent.children) {
    if (!(child instanceof THREE.Line)) continue;
    const material = child.material;
    if (material instanceof THREE.LineBasicMaterial) material.color.setHex(seamColor);
  }
}

function createBallModel(variant: number, radius = BALL_RADIUS): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(radius, 28, 16);
  applyBallVertexColors(geometry, variant);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.54, metalness: 0.025, vertexColors: true })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  addBallSeams(group, radius * 1.012, variant);
  return group;
}

interface Free3dBallAsset {
  index: number;
  guid: string;
  title: string;
  src: string;
}

interface Free3dBallRoster {
  version: string;
  mode: string;
  assets: Free3dBallAsset[];
}

interface Free3dCharacterAsset {
  guid: string;
  title: string;
  src: string;
  mode: string;
  heightMeters: number;
  scale?: number;
  textures?: {
    albedo?: string;
    normal?: string;
    orm?: string;
  };
  clips?: {
    idle?: string;
    walk?: string;
    run?: string;
    jump?: string;
  };
}

interface Free3dCharacterRoster {
  version: string;
  mode: string;
  assets: Free3dCharacterAsset[];
}

interface LoadedFree3dCharacter {
  asset: Free3dCharacterAsset;
  scene: THREE.Object3D;
  clips: Record<string, THREE.AnimationClip>;
  textures: {
    albedo?: THREE.Texture;
    normal?: THREE.Texture;
    orm?: THREE.Texture;
  };
}

let loadedFree3dCharacter: LoadedFree3dCharacter | null = null;
let free3dCharacterPromise: Promise<LoadedFree3dCharacter | null> | null = null;
let free3dCharacterAttachCount = 0;

function resolveClientAsset(src: string): string {
  return new URL(src.replace(/^\/+/, ""), window.location.href).toString();
}

function prepareFree3dBallScene(model: THREE.Object3D, radius: number): THREE.Object3D {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = free3dBallMaterial;
    child.geometry.computeVertexNormals();
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
  model.scale.setScalar(radius * 2 / maxAxis);
  return model;
}

function loadFree3dBall(asset: Free3dBallAsset, radius: number): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    free3dBallLoader.load(
      resolveClientAsset(asset.src),
      (gltf) => resolve(prepareFree3dBallScene(gltf.scene, radius)),
      undefined,
      reject
    );
  });
}

function prepareFree3dCharacterScene(model: THREE.Object3D, asset: Free3dCharacterAsset): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  model.position.y += size.y / 2;
  const height = Math.max(size.y, 0.001);
  model.scale.setScalar((asset.scale || 1) * PLAYER_HEIGHT / height);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const material = child.material;
    if (Array.isArray(material)) {
      child.material = material.map((entry) => entry.clone());
    } else if (material) {
      child.material = material.clone();
    }
    if (child.material instanceof THREE.MeshStandardMaterial) {
      child.material.roughness = Math.max(child.material.roughness, 0.52);
      child.material.metalness *= 0.25;
    }
  });
  return model;
}

function loadTexture(src: string | undefined, colorSpace: THREE.ColorSpace = THREE.NoColorSpace): Promise<THREE.Texture | undefined> {
  if (!src) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    free3dTextureLoader.load(
      resolveClientAsset(src),
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function loadCharacterClip(name: string, src: string | undefined): Promise<[string, THREE.AnimationClip] | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    free3dCharacterAnimationLoader.load(
      resolveClientAsset(src),
      (group) => {
        const clip = group.animations[0] || null;
        if (!clip) {
          resolve(null);
          return;
        }
        clip.name = name;
        resolve([name, clip]);
      },
      undefined,
      reject
    );
  });
}

async function loadOptionalCharacterClip(name: string, src: string | undefined): Promise<[string, THREE.AnimationClip] | null> {
  try {
    return await loadCharacterClip(name, src);
  } catch (error) {
    console.warn(`Free3D character ${name} clip failed`, error);
    return null;
  }
}

function loadFree3dCharacter(): Promise<LoadedFree3dCharacter | null> {
  if (loadedFree3dCharacter) return Promise.resolve(loadedFree3dCharacter);
  if (free3dCharacterPromise) return free3dCharacterPromise;
  free3dCharacterPromise = (async () => {
    try {
      const response = await fetch(resolveClientAsset("assets/characters/free3d/roster.json"), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Free3D character roster HTTP ${response.status}`);
      const roster = await response.json() as Free3dCharacterRoster;
      const asset = roster.assets[0];
      if (!asset) throw new Error("Free3D character roster is empty");
      const [gltf, albedo, normal, orm, ...clipEntries] = await Promise.all([
        new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((resolve, reject) => {
          free3dCharacterLoader.load(
            resolveClientAsset(asset.src),
            resolve,
            undefined,
            reject
          );
        }),
        loadTexture(asset.textures?.albedo, THREE.SRGBColorSpace),
        loadTexture(asset.textures?.normal),
        loadTexture(asset.textures?.orm),
        loadOptionalCharacterClip("idle", asset.clips?.idle),
        loadOptionalCharacterClip("walk", asset.clips?.walk),
        loadOptionalCharacterClip("run", asset.clips?.run),
        loadOptionalCharacterClip("jump", asset.clips?.jump)
      ]);
      const clips = Object.fromEntries(
        clipEntries.filter((entry): entry is [string, THREE.AnimationClip] => Boolean(entry))
      );
      for (const clip of gltf.animations) {
        if (!clips.idle) clips.idle = clip;
      }
      const loaded: LoadedFree3dCharacter = {
        asset,
        scene: prepareFree3dCharacterScene(gltf.scene, asset),
        clips,
        textures: { albedo, normal, orm }
      };
      loadedFree3dCharacter = loaded;
      delete document.documentElement.dataset.playerRigError;
      document.documentElement.dataset.playerRigAsset = asset.guid;
      document.documentElement.dataset.playerRigMode = roster.mode;
      document.documentElement.dataset.playerRigClipCount = String(Object.keys(loaded.clips).length);
      document.documentElement.dataset.playerRigTextures = String(
        Number(Boolean(albedo)) + Number(Boolean(normal)) + Number(Boolean(orm))
      );
      return loaded;
    } catch (error) {
      document.documentElement.dataset.playerRigMode = "procedural-fallback";
      document.documentElement.dataset.playerRigError = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.warn("Free3D character hydration failed", error);
      return null;
    }
  })();
  return free3dCharacterPromise;
}

async function hydrateFree3dSidelineBalls(): Promise<void> {
  try {
    const response = await fetch(resolveClientAsset("assets/balls/free3d/roster.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Free3D roster HTTP ${response.status}`);
    const roster = await response.json() as Free3dBallRoster;
    await Promise.all(roster.assets.slice(0, sidelineBalls.length).map(async (asset) => {
      const target = sidelineBalls[asset.index];
      if (!target) return;
      const model = await loadFree3dBall(asset, BALL_RADIUS * 0.86);
      const activeModel = model.clone(true);
      activeModel.visible = false;
      target.clear();
      target.add(model);
      activeFree3dBalls[asset.index] = activeModel;
      activeFree3dBallRoot.add(activeModel);
      target.userData.free3dGuid = asset.guid;
      target.userData.free3dTitle = asset.title;
    }));
    document.documentElement.dataset.ballRack = `${roster.assets.length}-free3d-vertex-color-glb`;
    document.documentElement.dataset.free3dBallMode = roster.mode;
    updateSidelineBallVisibility(currentActiveBallVariant);
    updateActiveBallModel(currentActiveBallVariant);
  } catch (error) {
    document.documentElement.dataset.free3dBallMode = "fallback-procedural";
    console.warn("Free3D sideline ball hydration failed", error);
  }
}

function activeBallIndex(variant: number): number {
  return ((variant % BALL_VARIANT_COLORS.length) + BALL_VARIANT_COLORS.length) % BALL_VARIANT_COLORS.length;
}

function updateSidelineBallVisibility(activeVariant: number): void {
  const activeIndex = activeBallIndex(activeVariant);
  let visibleCount = 0;
  for (let index = 0; index < sidelineBalls.length; index += 1) {
    const ball = sidelineBalls[index];
    const visible = index !== activeIndex;
    ball.visible = visible;
    if (visible) visibleCount += 1;
  }
  document.documentElement.dataset.ballRackVisible = String(visibleCount);
  document.documentElement.dataset.ballRackActiveRemoved = String(activeIndex);
}

function updateActiveBallModel(activeVariant: number): void {
  const activeIndex = activeBallIndex(activeVariant);
  const activeModel = activeFree3dBalls[activeIndex] || null;
  for (let index = 0; index < activeFree3dBalls.length; index += 1) {
    const model = activeFree3dBalls[index];
    if (model) model.visible = model === activeModel;
  }
  activeFree3dBallRoot.visible = Boolean(activeModel);
  ballMesh.visible = !activeModel;
  document.documentElement.dataset.activeBallModel = activeModel ? "free3d-vertex-color-glb" : "procedural-fallback";
}

function buildSidelineBalls(root: THREE.Group): void {
  const baseX = -FIELD_WIDTH / 2 - 4.8;
  const baseZ = FIELD_LENGTH / 2 - 8;
  for (let index = 0; index < 10; index += 1) {
    const ball = createBallModel(index, BALL_RADIUS * 0.86);
    ball.position.set(baseX - (index % 2) * 0.82, BALL_RADIUS * 0.86, baseZ - Math.floor(index / 2) * 1.05);
    ball.rotation.set(index * 0.27, index * 0.6, index * 0.18);
    root.add(ball);
    sidelineBalls.push(ball);
  }
  document.documentElement.dataset.ballRack = "10-vertex-color-free3d-candidates";
  updateSidelineBallVisibility(currentActiveBallVariant);
  updateActiveBallModel(currentActiveBallVariant);
  void hydrateFree3dSidelineBalls();
}

interface MovingCar {
  root: THREE.Group;
  lane: number;
  speed: number;
  offset: number;
  clockwise: boolean;
}

function createCarGroup(color: number): THREE.Group {
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.36, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.18 })
  );
  body.position.y = 0.28;
  body.castShadow = true;
  body.receiveShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.42, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xa9d3e8, roughness: 0.25, metalness: 0.05 })
  );
  cabin.position.y = 0.68;
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x121616, roughness: 0.74 });
  for (const wx of [-0.68, 0.68]) {
    for (const wz of [-0.72, 0.72]) {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.36), wheelMaterial);
      wheel.position.set(wx, 0.18, wz);
      wheel.castShadow = true;
      car.add(wheel);
    }
  }
  return car;
}

function addMovingCars(root: THREE.Group): void {
  const colors = [0xc9423d, 0x416a91, 0xd0b055, 0x3d6f52, 0x8b8f98, 0xe7e1d2];
  for (let index = 0; index < colors.length; index += 1) {
    const car = createCarGroup(colors[index]);
    root.add(car);
    movingCars.push({
      root: car,
      lane: index % 2,
      speed: 0.22 + index * 0.018,
      offset: index / colors.length,
      clockwise: index % 2 === 0
    });
  }
  document.documentElement.dataset.movingCars = String(movingCars.length);
}

function updateMovingCars(time: number, daylight: number): void {
  const roadWidth = FIELD_WIDTH / 2 + 8.4;
  const roadLength = FIELD_LENGTH / 2 + 9.2;
  const perimeter = roadWidth * 4 + roadLength * 4;
  for (const car of movingCars) {
    car.root.visible = daylight > 0.35;
    const progress = THREE.MathUtils.euclideanModulo(car.offset + time * car.speed * (car.clockwise ? 1 : -1) / perimeter, 1);
    const distance = progress * perimeter;
    const laneOffset = car.lane * 0.9;
    let x = -roadWidth - laneOffset;
    let z = -roadLength - laneOffset;
    let rotation = 0;
    const sideX = roadWidth * 2 + laneOffset * 2;
    const sideZ = roadLength * 2 + laneOffset * 2;
    if (distance < sideX) {
      x = -roadWidth + distance;
      z = -roadLength - laneOffset;
      rotation = Math.PI / 2;
    } else if (distance < sideX + sideZ) {
      x = roadWidth + laneOffset;
      z = -roadLength + (distance - sideX);
      rotation = 0;
    } else if (distance < sideX * 2 + sideZ) {
      x = roadWidth - (distance - sideX - sideZ);
      z = roadLength + laneOffset;
      rotation = -Math.PI / 2;
    } else {
      x = -roadWidth - laneOffset;
      z = roadLength - (distance - sideX * 2 - sideZ);
      rotation = Math.PI;
    }
    car.root.position.set(x, 0, z);
    car.root.rotation.y = car.clockwise ? rotation : rotation + Math.PI;
  }
}

class GoalNetVisual {
  private readonly nodes: Array<{
    position: THREE.Vector3;
    previous: THREE.Vector3;
    rest: THREE.Vector3;
    fixed: boolean;
  }> = [];
  private readonly constraints: Array<{ a: number; b: number; restDistance: number }> = [];
  private readonly segments: Array<[number, number]> = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly widthSegments = 18;
  private readonly heightSegments = 9;

  constructor(private readonly side: -1 | 1, root: THREE.Group) {
    const zBack = side * (FIELD_LENGTH / 2 + GOAL_DEPTH - 0.18);
    const topY = 2.2;
    for (let row = 0; row <= this.heightSegments; row += 1) {
      const rowT = row / this.heightSegments;
      const y = rowT * topY;
      for (let column = 0; column <= this.widthSegments; column += 1) {
        const columnT = column / this.widthSegments;
        const x = -GOAL_WIDTH / 2 + columnT * GOAL_WIDTH;
        const rest = new THREE.Vector3(x, y, zBack);
        const fixed = row === 0 || row === this.heightSegments || column === 0 || column === this.widthSegments;
        this.nodes.push({
          position: rest.clone(),
          previous: rest.clone(),
          rest,
          fixed
        });
      }
    }
    for (let row = 0; row <= this.heightSegments; row += 1) {
      for (let column = 0; column <= this.widthSegments; column += 1) {
        const index = this.nodeIndex(column, row);
        if (column < this.widthSegments) this.addConstraint(index, this.nodeIndex(column + 1, row));
        if (row < this.heightSegments) this.addConstraint(index, this.nodeIndex(column, row + 1));
        if (column < this.widthSegments) this.segments.push([index, this.nodeIndex(column + 1, row)]);
        if (row < this.heightSegments) this.segments.push([index, this.nodeIndex(column, row + 1)]);
      }
    }
    this.positions = new Float32Array(this.segments.length * 2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const mesh = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({ color: 0xf7ffff, transparent: true, opacity: 0.46 })
    );
    mesh.name = `visual-cloth-net-${side < 0 ? "south" : "north"}`;
    root.add(mesh);
    this.writeGeometry();
  }

  update(state: ServerState, time: number): void {
    const breeze = Math.sin(time * 1.7 + this.side) * 0.004;
    for (const node of this.nodes) {
      if (node.fixed) {
        node.position.copy(node.rest);
        node.previous.copy(node.rest);
        continue;
      }
      const velocity = node.position.clone().sub(node.previous).multiplyScalar(0.965);
      node.previous.copy(node.position);
      node.position.add(velocity);
      node.position.y -= 0.012;
      node.position.z += this.side * breeze;
      node.position.lerp(node.rest, 0.026);
    }

    this.applyInfluence(
      new THREE.Vector3(state.ball.position.x, state.ball.position.y, state.ball.position.z),
      1.55,
      THREE.MathUtils.clamp(Math.hypot(state.ball.velocity.x, state.ball.velocity.y, state.ball.velocity.z) / 10, 0.22, 1.4)
    );
    for (const player of state.players) {
      this.applyInfluence(
        new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.2, player.position.z),
        0.95,
        THREE.MathUtils.clamp(Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) / 6, 0.08, 0.55)
      );
    }

    for (let iteration = 0; iteration < 5; iteration += 1) this.solveConstraints();
    for (const node of this.nodes) {
      node.position.y = THREE.MathUtils.clamp(node.position.y, 0, 2.32);
      node.position.x = THREE.MathUtils.clamp(node.position.x, -GOAL_WIDTH / 2 - 0.45, GOAL_WIDTH / 2 + 0.45);
      const minZ = this.side * (FIELD_LENGTH / 2 + GOAL_DEPTH - 0.72);
      const maxZ = this.side * (FIELD_LENGTH / 2 + GOAL_DEPTH + 0.84);
      node.position.z = this.side > 0
        ? THREE.MathUtils.clamp(node.position.z, minZ, maxZ)
        : THREE.MathUtils.clamp(node.position.z, maxZ, minZ);
    }
    this.writeGeometry();
  }

  private nodeIndex(column: number, row: number): number {
    return row * (this.widthSegments + 1) + column;
  }

  private addConstraint(a: number, b: number): void {
    this.constraints.push({
      a,
      b,
      restDistance: this.nodes[a].rest.distanceTo(this.nodes[b].rest)
    });
  }

  private applyInfluence(center: THREE.Vector3, radius: number, strength: number): void {
    const netZ = this.side * (FIELD_LENGTH / 2 + GOAL_DEPTH - 0.18);
    if (Math.abs(center.z - netZ) > GOAL_DEPTH + radius || center.y > 3.1) return;
    for (const node of this.nodes) {
      if (node.fixed) continue;
      const distance = node.position.distanceTo(center);
      if (distance >= radius) continue;
      const normal = node.position.clone().sub(center);
      if (normal.lengthSq() < 0.0001) normal.set(0, 0, this.side);
      normal.normalize();
      const impulse = (radius - distance) * strength * 0.42;
      node.position.addScaledVector(normal, impulse);
      node.position.z += this.side * impulse * 0.7;
    }
  }

  private solveConstraints(): void {
    for (const constraint of this.constraints) {
      const a = this.nodes[constraint.a];
      const b = this.nodes[constraint.b];
      const delta = b.position.clone().sub(a.position);
      const distance = Math.max(delta.length(), 0.0001);
      const correction = delta.multiplyScalar((distance - constraint.restDistance) / distance);
      if (!a.fixed && !b.fixed) {
        a.position.addScaledVector(correction, 0.5);
        b.position.addScaledVector(correction, -0.5);
      } else if (!a.fixed) {
        a.position.add(correction);
      } else if (!b.fixed) {
        b.position.sub(correction);
      }
    }
  }

  private writeGeometry(): void {
    let offset = 0;
    for (const [a, b] of this.segments) {
      const first = this.nodes[a].position;
      const second = this.nodes[b].position;
      this.positions[offset] = first.x;
      this.positions[offset + 1] = first.y;
      this.positions[offset + 2] = first.z;
      this.positions[offset + 3] = second.x;
      this.positions[offset + 4] = second.y;
      this.positions[offset + 5] = second.z;
      offset += 6;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

buildField(fieldGroup);
applySettingsToRuntime();
syncSettingsUi();

function buildField(root: THREE.Group) {
  const turf = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH, 0.12, FIELD_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x19845f, roughness: 0.9 })
  );
  turf.position.y = -0.06;
  turf.receiveShadow = true;
  root.add(turf);

  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x1d966c, roughness: 0.92 });
  for (let i = -3; i <= 3; i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH, 0.01, FIELD_LENGTH / 9), stripeMaterial);
    stripe.position.set(0, 0.01, i * FIELD_LENGTH / 7);
    stripe.receiveShadow = true;
    root.add(stripe);
  }

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xe9fff3 });
  const addLine = (width: number, depth: number, x: number, z: number) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, depth), lineMaterial);
    line.position.set(x, 0.045, z);
    root.add(line);
  };
  addLine(FIELD_WIDTH, 0.06, 0, 0);
  addLine(0.06, FIELD_LENGTH, -FIELD_WIDTH / 2, 0);
  addLine(0.06, FIELD_LENGTH, FIELD_WIDTH / 2, 0);
  addLine(FIELD_WIDTH, 0.06, 0, -FIELD_LENGTH / 2);
  addLine(FIELD_WIDTH, 0.06, 0, FIELD_LENGTH / 2);
  addLine(GOAL_WIDTH, 0.08, 0, -FIELD_LENGTH / 2 + 2.7);
  addLine(GOAL_WIDTH, 0.08, 0, FIELD_LENGTH / 2 - 2.7);

  const circle = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 72 }, (_, i) => {
        const a = i / 72 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 5.2, 0.07, Math.sin(a) * 5.2);
      })
    ),
    new THREE.LineBasicMaterial({ color: 0xe9fff3 })
  );
  root.add(circle);

  addGoal(root, -1);
  addGoal(root, 1);
  addStadiumFrame(root);
  buildSidelineBalls(root);
  addMovingCars(root);
}

function addStadiumFrame(root: THREE.Group) {
  const asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0x36413e, roughness: 0.96 });
  const courtyard = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH + 20, 0.08, FIELD_LENGTH + 22),
    asphaltMaterial
  );
  courtyard.position.y = -0.13;
  courtyard.receiveShadow = true;
  root.add(courtyard);

  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x20342e, roughness: 0.72, metalness: 0.16 });
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 2.2, 0.32, 0.09), fenceMaterial);
    rail.position.set(0, 0.32, side * (FIELD_LENGTH / 2 + 1.25));
    rail.castShadow = true;
    rail.receiveShadow = true;
    root.add(rail);
  }
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, FIELD_LENGTH + 2.2), fenceMaterial);
    rail.position.set(side * (FIELD_WIDTH / 2 + 1.25), 0.32, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    root.add(rail);
  }

  for (const [x, z, width, height, depth, color, side] of [
    [-9.2, -FIELD_LENGTH / 2 - 8.2, 5.8, 8.4, 2.6, 0x6d7a7c, -1],
    [0, -FIELD_LENGTH / 2 - 8.8, 6.6, 10.2, 2.8, 0x859092, -1],
    [9.4, -FIELD_LENGTH / 2 - 8.1, 5.5, 7.6, 2.4, 0x5f7074, -1],
    [-8.6, FIELD_LENGTH / 2 + 8.4, 5.9, 8.1, 2.7, 0x7d776f, 1],
    [0.8, FIELD_LENGTH / 2 + 9.1, 6.8, 11.0, 2.9, 0x8b8176, 1],
    [10.1, FIELD_LENGTH / 2 + 8.1, 5.2, 7.2, 2.5, 0x6b7370, 1]
  ] as Array<[number, number, number, number, number, number, -1 | 1]>) {
    addApartmentBlock(root, x, z, width, height, depth, color, side);
  }

  for (const [x, z, rotation, color] of [
    [-FIELD_WIDTH / 2 - 5.3, -10.5, 0.08, 0xb9473f],
    [-FIELD_WIDTH / 2 - 5.1, -4.4, -0.08, 0x416a91],
    [-FIELD_WIDTH / 2 - 5.4, 5.2, 0.12, 0xd0b055],
    [FIELD_WIDTH / 2 + 5.2, -7.2, Math.PI + 0.04, 0x8b8f98],
    [FIELD_WIDTH / 2 + 5.4, 2.2, Math.PI - 0.1, 0x3d6f52]
  ] as Array<[number, number, number, number]>) {
    addParkedCar(root, x, z, rotation, color);
  }

  for (const [x, z, scale] of [
    [-FIELD_WIDTH / 2 - 3.4, -FIELD_LENGTH / 2 - 5.4, 1.05],
    [-FIELD_WIDTH / 2 - 4.0, FIELD_LENGTH / 2 + 5.8, 0.92],
    [FIELD_WIDTH / 2 + 3.8, -FIELD_LENGTH / 2 - 5.6, 1.0],
    [FIELD_WIDTH / 2 + 4.2, FIELD_LENGTH / 2 + 5.6, 1.1],
    [-5.6, -FIELD_LENGTH / 2 - 5.8, 0.82],
    [6.2, FIELD_LENGTH / 2 + 5.7, 0.86]
  ] as Array<[number, number, number]>) {
    addCourtyardTree(root, x, z, scale);
  }

  for (const [x, z, rotation] of [
    [-6.8, -FIELD_LENGTH / 2 - 3.6, 0],
    [6.8, FIELD_LENGTH / 2 + 3.6, Math.PI],
    [-FIELD_WIDTH / 2 - 3.1, 9.2, Math.PI / 2],
    [FIELD_WIDTH / 2 + 3.1, -9.2, -Math.PI / 2]
  ] as Array<[number, number, number]>) {
    addBench(root, x, z, rotation);
  }

  addCourtyardPavementMarks(root);
  addPlayground(root, -FIELD_WIDTH / 2 - 6.6, 10.4, Math.PI / 2);
  addServiceKiosk(root, FIELD_WIDTH / 2 + 6.7, 9.6, -Math.PI / 2);
  addClothesline(root, -8.8, FIELD_LENGTH / 2 + 4.9, 0);
  addClothesline(root, 8.6, -FIELD_LENGTH / 2 - 4.9, Math.PI);
  document.documentElement.dataset.environmentModels =
    "apartments,cars,trees,benches,playground,kiosk,clotheslines,pavement";

  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0xaebbc4,
    roughness: 0.36,
    metalness: 0.36
  });
  for (const [x, z] of [
    [-FIELD_WIDTH / 2 - 5.5, -FIELD_LENGTH / 2 - 4.4],
    [FIELD_WIDTH / 2 + 5.5, -FIELD_LENGTH / 2 - 4.4],
    [-FIELD_WIDTH / 2 - 5.5, FIELD_LENGTH / 2 + 4.4],
    [FIELD_WIDTH / 2 + 5.5, FIELD_LENGTH / 2 + 4.4]
  ] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 12, 10), mastMaterial);
    mast.position.set(x, 6, z);
    mast.castShadow = true;
    root.add(mast);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.28, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xddeaff, toneMapped: false })
    );
    lamp.position.set(x, 12.15, z);
    root.add(lamp);
  }
}

function addApartmentBlock(
  root: THREE.Group,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: number,
  side: -1 | 1
): void {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.03 })
  );
  wall.position.set(x, height / 2 - 0.08, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.35, 0.18, depth + 0.35),
    new THREE.MeshStandardMaterial({ color: 0xd8e5e2, roughness: 0.78 })
  );
  roof.position.set(x, height + 0.02, z);
  roof.castShadow = true;
  root.add(roof);

  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd987, toneMapped: false });
  const windowRows = Math.max(3, Math.floor(height / 1.35));
  const windowColumns = Math.max(3, Math.floor(width / 1.25));
  const facadeZ = z - side * (depth / 2 + 0.024);
  for (let row = 0; row < windowRows; row += 1) {
    for (let column = 0; column < windowColumns; column += 1) {
      if ((row + column) % 5 === 0) continue;
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.035), windowMaterial);
      windowMesh.position.set(
        x - width / 2 + 0.72 + column * ((width - 1.4) / Math.max(1, windowColumns - 1)),
        1.0 + row * ((height - 1.8) / Math.max(1, windowRows - 1)),
        facadeZ
      );
      root.add(windowMesh);
    }
  }

  const balconyMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd8d2, roughness: 0.64, metalness: 0.14 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x253534, roughness: 0.54, metalness: 0.18 });
  for (let column = 0; column < Math.max(2, Math.floor(width / 2)); column += 1) {
    const balconyX = x - width / 2 + 1.0 + column * ((width - 2.0) / Math.max(1, Math.floor(width / 2) - 1));
    const balcony = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.36), balconyMaterial);
    balcony.position.set(balconyX, Math.min(height - 0.8, 2.35 + (column % 3) * 1.45), facadeZ - side * 0.2);
    balcony.castShadow = true;
    balcony.receiveShadow = true;
    root.add(balcony);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.28, 0.045), railMaterial);
    rail.position.set(balcony.position.x, balcony.position.y + 0.2, balcony.position.z - side * 0.16);
    rail.castShadow = true;
    root.add(rail);
  }
  const entry = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(1.25, width * 0.22), 1.18, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x263837, roughness: 0.58, metalness: 0.08 })
  );
  entry.position.set(x, 0.52, facadeZ - side * 0.045);
  entry.castShadow = true;
  root.add(entry);
}

function addCourtyardPavementMarks(root: THREE.Group): void {
  const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x21302d, transparent: true, opacity: 0.5 });
  const paintMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe7de, transparent: true, opacity: 0.52 });
  for (const [x, z, width, rotation] of [
    [-10.2, -12.0, 5.2, -0.18],
    [10.4, -11.2, 4.3, 0.14],
    [-11.0, 12.1, 4.8, 0.22],
    [10.8, 12.0, 5.0, -0.12],
    [0, FIELD_LENGTH / 2 + 2.2, 10.2, 0],
    [0, -FIELD_LENGTH / 2 - 2.2, 10.2, 0]
  ] as Array<[number, number, number, number]>) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, 0.055), paintMaterial);
    stripe.position.set(x, 0.012, z);
    stripe.rotation.y = rotation;
    root.add(stripe);
  }
  for (const [x, z, width, depth, rotation] of [
    [-3.8, -FIELD_LENGTH / 2 - 5.0, 3.8, 0.035, 0.24],
    [4.4, FIELD_LENGTH / 2 + 5.2, 4.1, 0.035, -0.19],
    [-FIELD_WIDTH / 2 - 4.8, 1.6, 0.035, 7.2, 0.07],
    [FIELD_WIDTH / 2 + 4.8, -1.8, 0.035, 7.6, -0.06]
  ] as Array<[number, number, number, number, number]>) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(width, 0.016, depth), crackMaterial);
    crack.position.set(x, 0.018, z);
    crack.rotation.y = rotation;
    root.add(crack);
  }
}

function addPlayground(root: THREE.Group, x: number, z: number, rotation: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const paint = new THREE.MeshStandardMaterial({ color: 0x4aa5a2, roughness: 0.48, metalness: 0.08 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.5, metalness: 0.04 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x27302f, roughness: 0.94 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.04, 3.0), rubber);
  base.position.y = -0.02;
  base.receiveShadow = true;
  group.add(base);
  for (const px of [-1.35, 1.35]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 8), paint);
    post.position.set(px, 0.85, -0.86);
    post.castShadow = true;
    group.add(post);
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.08), paint);
  topBar.position.set(0, 1.68, -0.86);
  topBar.castShadow = true;
  group.add(topBar);
  for (const px of [-0.45, 0.45]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.86, 6), accent);
    rope.position.set(px, 1.16, -0.86);
    rope.castShadow = true;
    group.add(rope);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.38), accent);
  seat.position.set(0, 0.72, -0.86);
  seat.castShadow = true;
  group.add(seat);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 2.15), new THREE.MeshStandardMaterial({ color: 0xe95f51, roughness: 0.42 }));
  slide.position.set(0.95, 0.52, 0.45);
  slide.rotation.x = -0.34;
  slide.castShadow = true;
  group.add(slide);
  root.add(group);
}

function addServiceKiosk(root: THREE.Group, x: number, z: number, rotation: number): void {
  const kiosk = new THREE.Group();
  kiosk.position.set(x, 0, z);
  kiosk.rotation.y = rotation;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.65, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x435b56, roughness: 0.7, metalness: 0.05 })
  );
  body.position.y = 0.82;
  body.castShadow = true;
  body.receiveShadow = true;
  kiosk.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.75, 0.18, 2.02),
    new THREE.MeshStandardMaterial({ color: 0xf0b84a, roughness: 0.52, metalness: 0.03 })
  );
  roof.position.y = 1.76;
  roof.castShadow = true;
  kiosk.add(roof);
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.58, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xf5e6a8, toneMapped: false })
  );
  hatch.position.set(0, 1.0, -0.88);
  kiosk.add(hatch);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.28, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x7be0c3, toneMapped: false })
  );
  sign.position.set(0, 1.92, -0.98);
  kiosk.add(sign);
  root.add(kiosk);
}

function addClothesline(root: THREE.Group, x: number, z: number, rotation: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xb4c0c4, roughness: 0.45, metalness: 0.32 });
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xdde7e3 });
  for (const px of [-1.8, 1.8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.75, 8), poleMaterial);
    pole.position.set(px, 0.88, 0);
    pole.castShadow = true;
    group.add(pole);
  }
  for (const y of [1.25, 1.52]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.018, 0.018), lineMaterial);
    line.position.y = y;
    group.add(line);
  }
  const clothColors = [0xf1efe4, 0x58a8ff, 0xff9d42, 0x89c878];
  for (let i = 0; i < clothColors.length; i += 1) {
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.62, 0.035),
      new THREE.MeshStandardMaterial({ color: clothColors[i], roughness: 0.84 })
    );
    cloth.position.set(-1.2 + i * 0.76, 1.08 + (i % 2) * 0.25, 0.02);
    cloth.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.05;
    cloth.castShadow = true;
    group.add(cloth);
  }
  root.add(group);
}

function addParkedCar(root: THREE.Group, x: number, z: number, rotation: number, color: number): void {
  const car = new THREE.Group();
  car.position.set(x, 0, z);
  car.rotation.y = rotation;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.36, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.18 })
  );
  body.position.y = 0.28;
  body.castShadow = true;
  body.receiveShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.42, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xa9d3e8, roughness: 0.25, metalness: 0.05 })
  );
  cabin.position.y = 0.68;
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x121616, roughness: 0.74 });
  for (const wx of [-0.68, 0.68]) {
    for (const wz of [-0.72, 0.72]) {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.36), wheelMaterial);
      wheel.position.set(wx, 0.18, wz);
      wheel.castShadow = true;
      car.add(wheel);
    }
  }
  root.add(car);
}

function addCourtyardTree(root: THREE.Group, x: number, z: number, scale: number): void {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.18 * scale, 1.35 * scale, 9),
    new THREE.MeshStandardMaterial({ color: 0x654832, roughness: 0.88 })
  );
  trunk.position.set(x, 0.68 * scale, z);
  trunk.castShadow = true;
  root.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.9 * scale, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f7a55, roughness: 0.92 })
  );
  crown.position.set(x, 1.65 * scale, z);
  crown.scale.set(1.0, 1.18, 0.92);
  crown.castShadow = true;
  crown.receiveShadow = true;
  root.add(crown);
}

function addBench(root: THREE.Group, x: number, z: number, rotation: number): void {
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x232a2a, roughness: 0.7, metalness: 0.18 });
  for (const y of [0.45, 0.72]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.18), wood);
    plank.position.y = y;
    plank.castShadow = true;
    bench.add(plank);
  }
  for (const xOffset of [-0.72, 0.72]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.14), metal);
    leg.position.set(xOffset, 0.22, 0);
    leg.castShadow = true;
    bench.add(leg);
  }
  root.add(bench);
}

function addGoal(root: THREE.Group, side: -1 | 1) {
  const material = new THREE.MeshStandardMaterial({ color: side < 0 ? 0x58a8ff : 0xff9d42, roughness: 0.45 });
  const z = side * (FIELD_LENGTH / 2);
  const postGeometry = new THREE.CylinderGeometry(0.34, 0.38, 2.28, 20);
  const barGeometry = new THREE.CylinderGeometry(0.32, 0.32, GOAL_WIDTH + 0.76, 20);
  const depthBarGeometry = new THREE.CylinderGeometry(0.16, 0.16, GOAL_DEPTH, 14);
  [-GOAL_WIDTH / 2, GOAL_WIDTH / 2].forEach((x) => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, 1.05, z);
    post.castShadow = true;
    root.add(post);
    const topRail = new THREE.Mesh(depthBarGeometry, material);
    topRail.rotation.x = Math.PI / 2;
    topRail.position.set(x, 2.16, z + side * GOAL_DEPTH * 0.5);
    topRail.castShadow = true;
    root.add(topRail);
  });
  const bar = new THREE.Mesh(barGeometry, material);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 2.16, z);
  bar.castShadow = true;
  root.add(bar);
  const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, GOAL_WIDTH, 14), material);
  backBar.rotation.z = Math.PI / 2;
  backBar.position.set(0, 0.08, z + side * GOAL_DEPTH);
  root.add(backBar);
  const backTopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, GOAL_WIDTH, 14), material);
  backTopBar.rotation.z = Math.PI / 2;
  backTopBar.position.set(0, 2.16, z + side * GOAL_DEPTH);
  backTopBar.castShadow = true;
  root.add(backTopBar);
  goalNets.push(new GoalNetVisual(side, root));
  document.documentElement.dataset.goalPostRadius = "0.38";
  document.documentElement.dataset.goalNetMode = "local-verlet-cloth-no-network";
  document.documentElement.dataset.goalNetCount = String(goalNets.length);
}

class PlayerVisual {
  readonly root = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly characterRoot = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly chest: THREE.Mesh;
  private readonly shorts: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly hair: THREE.Mesh;
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;
  private readonly leftFoot: THREE.Mesh;
  private readonly rightFoot: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly label: THREE.Sprite;
  private readonly ring: THREE.Mesh;
  private readonly contactFlash: THREE.Mesh;
  private readonly contactFlashMaterial: THREE.MeshBasicMaterial;
  private characterModel: THREE.Object3D | null = null;
  private characterMixer: THREE.AnimationMixer | null = null;
  private readonly characterActions = new Map<string, THREE.AnimationAction>();
  private activeCharacterAction = "";
  private characterLastUpdateTime = 0;
  private characterReady = false;

  constructor(private readonly snapshot: PlayerSnapshot) {
    const color = teamColor(snapshot.team);
    const variant = snapshot.index % 4;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
    const jerseyPanel = new THREE.MeshStandardMaterial({ color: snapshot.team === 1 ? 0xffd37a : 0xbfe5ff, roughness: 0.5 });
    const clothDark = new THREE.MeshStandardMaterial({ color: 0x111817, roughness: 0.72 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c7a7, roughness: 0.55 });
    const hair = new THREE.MeshStandardMaterial({ color: variant === 1 ? 0x3a2419 : variant === 2 ? 0xd6b46b : 0x15100c, roughness: 0.64 });
    const boots = new THREE.MeshStandardMaterial({ color: variant === 3 ? 0xf5f1d0 : 0x111111, roughness: 0.46, metalness: 0.08 });
    this.rig.name = "procedural-player-fallback";
    this.characterRoot.name = "free3d-skinned-player";
    this.characterRoot.visible = false;
    this.root.add(this.rig, this.characterRoot);

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x020807,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.66, 28), this.shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.022;
    this.root.add(this.shadow);

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36 + variant * 0.018, 0.74, 6, 12), bodyMaterial);
    this.body.position.y = 1.08;
    this.body.castShadow = true;
    this.rig.add(this.body);

    this.chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.045), jerseyPanel);
    this.chest.position.set(0, 1.18, 0.365);
    this.rig.add(this.chest);

    this.shorts = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.38), clothDark);
    this.shorts.position.y = 0.68;
    this.shorts.castShadow = true;
    this.rig.add(this.shorts);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), skin);
    this.head.position.y = 1.75;
    this.head.castShadow = true;
    this.rig.add(this.head);

    this.hair = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    this.hair.position.y = 1.85;
    this.hair.castShadow = true;
    this.rig.add(this.hair);

    this.leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.56, 4, 8), skin);
    this.rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.56, 4, 8), skin);
    this.leftArm.position.set(-0.43, 1.14, 0.03);
    this.rightArm.position.set(0.43, 1.14, 0.03);
    this.leftArm.rotation.z = 0.18;
    this.rightArm.rotation.z = -0.18;
    this.leftArm.castShadow = true;
    this.rightArm.castShadow = true;
    this.rig.add(this.leftArm, this.rightArm);

    this.leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 8), clothDark);
    this.rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 8), clothDark);
    this.leftLeg.position.set(-0.18, 0.38, 0);
    this.rightLeg.position.set(0.18, 0.38, 0);
    this.leftLeg.castShadow = true;
    this.rightLeg.castShadow = true;
    this.rig.add(this.leftLeg, this.rightLeg);

    this.leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.38), boots);
    this.rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.38), boots);
    this.leftFoot.position.set(-0.18, 0.08, 0.08);
    this.rightFoot.position.set(0.18, 0.08, 0.08);
    this.leftFoot.castShadow = true;
    this.rightFoot.castShadow = true;
    this.rig.add(this.leftFoot, this.rightFoot);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({ color })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.04;
    this.root.add(this.ring);

    this.contactFlashMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2a6,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.contactFlash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8), this.contactFlashMaterial);
    this.root.add(this.contactFlash);

    this.label = makeLabel(snapshot.name);
    this.label.position.y = 2.15;
    this.root.add(this.label);
    scene.add(this.root);
    void this.attachCharacterModel();
    this.update(snapshot, 0);
  }

  private async attachCharacterModel(): Promise<void> {
    const loaded = await loadFree3dCharacter();
    if (!loaded || this.characterModel) return;
    const model = SkeletonUtils.clone(loaded.scene) as THREE.Object3D;
    const color = new THREE.Color(teamColor(this.snapshot.team));
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const sourceMaterial = child.material;
      if (Array.isArray(sourceMaterial)) {
        child.material = sourceMaterial.map((material) => material.clone());
      } else if (sourceMaterial) {
        child.material = sourceMaterial.clone();
      }
      const material = child.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        if (loaded.textures.albedo) material.map = loaded.textures.albedo;
        if (loaded.textures.normal) material.normalMap = loaded.textures.normal;
        if (loaded.textures.orm) {
          material.roughnessMap = loaded.textures.orm;
          material.metalnessMap = loaded.textures.orm;
        }
        material.color.lerp(color, material.map ? 0.08 : 0.52);
        material.roughness = Math.max(material.roughness, 0.56);
        material.metalness *= 0.2;
        material.needsUpdate = true;
      }
    });
    model.rotation.y = Math.PI;
    this.characterRoot.add(model);
    this.characterModel = model;
    this.characterMixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of Object.entries(loaded.clips)) {
      const action = this.characterMixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = name === "jump";
      this.characterActions.set(name, action);
    }
    this.setCharacterAction("idle", true);
    this.characterReady = true;
    this.rig.visible = false;
    this.characterRoot.visible = true;
    free3dCharacterAttachCount += 1;
    document.documentElement.dataset.playerRig = "free3d-skinned-mixamo-character";
    document.documentElement.dataset.playerRigAttached = String(free3dCharacterAttachCount);
  }

  private setCharacterAction(name: string, immediate = false): void {
    const nextName = this.characterActions.has(name) ? name : "idle";
    if (this.activeCharacterAction === nextName) return;
    const previous = this.characterActions.get(this.activeCharacterAction);
    const next = this.characterActions.get(nextName);
    if (!next) return;
    if (previous) previous.fadeOut(immediate ? 0 : 0.12);
    next.reset();
    next.enabled = true;
    next.fadeIn(immediate ? 0 : 0.12);
    next.play();
    this.activeCharacterAction = nextName;
    document.documentElement.dataset.playerRigAction = nextName;
  }

  update(snapshot: PlayerSnapshot, time: number) {
    this.root.position.set(snapshot.position.x, snapshot.position.y - PLAYER_HEIGHT / 2, snapshot.position.z);
    this.root.rotation.y = snapshot.yaw;
    this.root.visible = snapshot.role === "player";
    const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    const stridePhase = time * (7.2 + Math.min(speed, 7) * 0.22) + snapshot.index * 0.7;
    const swing = Math.sin(stridePhase) * Math.min(0.78, speed * 0.09);
    const counterSwing = Math.sin(stridePhase + Math.PI) * Math.min(0.78, speed * 0.09);
    const bob = Math.abs(Math.sin(stridePhase)) * Math.min(0.11, speed * 0.012);
    const actionAge = Math.max(0, Date.now() - snapshot.lastActionAt);
    const actionPulse = THREE.MathUtils.clamp(1 - actionAge / 260, 0, 1);
    const kickArc = Math.sin(actionPulse * Math.PI);
    const deltaTime = this.characterLastUpdateTime > 0 ? Math.min(0.05, Math.max(0, time - this.characterLastUpdateTime)) : 1 / 60;
    this.characterLastUpdateTime = time;
    if (this.characterReady && this.characterMixer) {
      const actionName = snapshot.airborne || snapshot.lastAction === "jump"
        ? "jump"
        : speed > 4.8
          ? "run"
          : speed > 0.65
            ? "walk"
            : "idle";
      this.setCharacterAction(actionName);
      const speedScale = actionName === "run"
        ? THREE.MathUtils.clamp(speed / 5.6, 0.82, 1.42)
        : actionName === "walk"
          ? THREE.MathUtils.clamp(speed / 2.2, 0.65, 1.18)
          : actionName === "jump"
            ? 1.05
            : 0.72;
      const currentAction = this.characterActions.get(this.activeCharacterAction);
      if (currentAction) currentAction.timeScale = speedScale;
      this.characterMixer.update(deltaTime);
      this.characterRoot.position.y = bob + (snapshot.airborne ? 0.12 : 0);
      this.characterRoot.scale.setScalar(1 + actionPulse * 0.035);
    }

    this.rig.position.y = bob + (snapshot.airborne ? 0.08 : 0);
    this.body.position.set(0, 1.08, 0);
    this.chest.position.set(0, 1.18, 0.365);
    this.shorts.position.y = 0.68;
    this.head.position.set(0, 1.75, 0);
    this.hair.position.set(0, 1.85, 0);
    this.leftArm.position.set(-0.43, 1.14, 0.03);
    this.rightArm.position.set(0.43, 1.14, 0.03);
    this.leftLeg.position.set(-0.18, 0.38, 0);
    this.rightLeg.position.set(0.18, 0.38, 0);
    this.leftFoot.position.set(-0.18, 0.08, 0.08);
    this.rightFoot.position.set(0.18, 0.08, 0.08);

    this.leftArm.rotation.set(-counterSwing * 0.68, 0, 0.22);
    this.rightArm.rotation.set(-swing * 0.68, 0, -0.22);
    this.leftLeg.rotation.set(swing, 0, 0);
    this.rightLeg.rotation.set(counterSwing, 0, 0);
    this.leftFoot.rotation.set(Math.max(0, -swing) * 0.38, 0, 0);
    this.rightFoot.rotation.set(Math.max(0, -counterSwing) * 0.38, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.hair.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.contactFlash.visible = actionPulse > 0;
    const telegraph = snapshot.lastAction ? ACTION_TELEGRAPH[snapshot.lastAction] : null;
    if (telegraph) {
      const bloom = 0.7 + (1 - actionPulse) * 1.85;
      this.contactFlashMaterial.color.setHex(telegraph.color);
      this.contactFlashMaterial.opacity = actionPulse * telegraph.opacity;
      this.contactFlash.scale.set(
        telegraph.scale[0] * bloom,
        telegraph.scale[1] * bloom,
        telegraph.scale[2] * bloom
      );
    } else {
      this.contactFlashMaterial.opacity = 0;
      this.contactFlash.scale.setScalar(1);
    }

    if (snapshot.lastAction === "left") {
      this.leftLeg.rotation.x = -1.18 * kickArc;
      this.leftLeg.rotation.z = -0.32 * kickArc;
      this.leftFoot.position.set(-0.31, 0.15, 0.36 + 0.34 * kickArc);
      this.leftFoot.rotation.x = -0.52 * kickArc;
      this.rightArm.rotation.x = -0.65 * kickArc;
      this.contactFlash.position.set(-0.4, 0.36, 0.46);
    } else if (snapshot.lastAction === "hand") {
      this.rightArm.rotation.x = -1.45 * kickArc;
      this.rightArm.rotation.z = -0.52 + 0.38 * kickArc;
      this.leftArm.rotation.x = 0.34 * kickArc;
      this.body.rotation.y = -0.2 * kickArc;
      this.chest.rotation.y = -0.2 * kickArc;
      this.contactFlash.position.set(0.5, 1.16, 0.46);
    } else if (snapshot.lastAction === "head") {
      this.head.rotation.x = -0.72 * kickArc;
      this.hair.rotation.x = -0.72 * kickArc;
      this.head.position.z = 0.18 * kickArc;
      this.hair.position.z = 0.18 * kickArc;
      this.contactFlash.position.set(0, 1.64, 0.46);
    } else if (snapshot.lastAction === "body") {
      this.body.rotation.x = -0.28 * kickArc;
      this.chest.rotation.x = -0.28 * kickArc;
      this.body.position.z = 0.16 * kickArc;
      this.chest.position.z = 0.42 + 0.16 * kickArc;
      this.head.position.z = 0.08 * kickArc;
      this.hair.position.z = 0.08 * kickArc;
      this.contactFlash.position.set(0, 1.08, 0.42);
    } else if (snapshot.lastAction === "jump") {
      this.leftLeg.rotation.x = 0.58 * kickArc;
      this.rightLeg.rotation.x = 0.58 * kickArc;
      this.leftArm.rotation.x = -0.48 * kickArc;
      this.rightArm.rotation.x = -0.48 * kickArc;
      this.rig.position.y += 0.16 * kickArc;
      this.contactFlash.position.set(0, 0.3, 0);
    } else {
      this.contactFlash.visible = false;
    }

    const actionScale = 1 + actionPulse * (snapshot.lastAction === "body" ? 0.24 : 0.14);
    this.body.scale.set(actionScale, actionScale, actionScale);
    this.chest.scale.set(actionScale, actionScale, actionScale);
    this.shadowMaterial.opacity = (0.22 + Math.min(0.12, speed * 0.015)) * (snapshot.airborne ? 0.58 : 1);
    this.shadow.scale.set(1 + speed * 0.018 + (snapshot.airborne ? 0.18 : 0), 0.82 + speed * 0.01, 1);
    this.ring.scale.setScalar(1 + actionPulse * 0.18);
    this.ring.visible = !snapshot.exhausted || Math.sin(time * 12) > 0;
    this.label.material.opacity = snapshot.id === localJoin?.id ? 1 : 0.78;
  }

  dispose() {
    scene.remove(this.root);
  }
}

function teamColor(team: number | null) {
  if (team === 0) return 0x58a8ff;
  if (team === 1) return 0xff9d42;
  return 0xb9c6d8;
}

function makeLabel(name: string) {
  const canvasLabel = document.createElement("canvas");
  canvasLabel.width = 256;
  canvasLabel.height = 64;
  const context = canvasLabel.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(4, 12, 11, 0.72)";
    context.fillRect(0, 0, canvasLabel.width, canvasLabel.height);
    context.fillStyle = "#f5fff9";
    context.font = "28px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name, canvasLabel.width / 2, canvasLabel.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvasLabel);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function webSocketUrl() {
  const params = new URLSearchParams(location.search);
  const explicit = params.get("server");
  if (explicit) {
    const target = new URL(explicit);
    if (target.protocol === "ws:" || target.protocol === "wss:") return target.toString();
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    if (target.pathname === "/") target.pathname = "/ws";
    return target.toString();
  }
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return "ws://127.0.0.1:8787/ws";
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/unsoccer/socket/ws`;
}

function serverApiBase() {
  const explicit = new URLSearchParams(location.search).get("server");
  if (explicit) {
    const target = new URL(explicit);
    target.protocol = target.protocol === "wss:" ? "https:" : target.protocol === "ws:" ? "http:" : target.protocol;
    let pathname = target.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/api";
    else if (pathname.endsWith("/socket/ws")) pathname = `${pathname.slice(0, -"/socket/ws".length)}/api`;
    else if (pathname.endsWith("/socket")) pathname = `${pathname.slice(0, -"/socket".length)}/api`;
    else if (pathname.endsWith("/ws")) pathname = "/api";
    else if (!pathname.endsWith("/api")) pathname = `${pathname}/api`;
    return `${target.origin}${pathname}`;
  }
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return "http://127.0.0.1:8787/api";
  }
  return `${location.origin}/unsoccer/api`;
}

function prefersHttpTransport() {
  const transport = new URLSearchParams(location.search).get("transport");
  if (transport === "http") return true;
  return false;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${serverApiBase()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return await response.json() as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${serverApiBase()}/${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return await response.json() as T;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function acceptJoin(join: JoinAccepted) {
  const previous = localJoin;
  localJoin = join;
  if (!previous || previous.role !== join.role || previous.team !== join.team || previous.index !== join.index) {
    audio.playJoin(localJoin.role);
    pushEventFeed(localJoin.role === "player"
      ? `\u0412\u044b: ${teamNameLabel(localJoin.team)} #${localJoin.index + 1}`
      : "\u0412\u044b: \u0437\u0440\u0438\u0442\u0435\u043b\u044c");
  }
  statusEl.textContent = localJoin.role === "player"
    ? `\u0412\u044b \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0435 ${teamNameLabel(localJoin.team)} #${localJoin.index + 1}.`
    : "\u0420\u0435\u0436\u0438\u043c \u0437\u0440\u0438\u0442\u0435\u043b\u044f/\u0442\u0435\u0441\u0442\u0435\u0440\u0430.";
  updatePlayerChip();
  updateResolvedInput();
}

function connect() {
  const name = new URLSearchParams(location.search).get("name") || `\u0418\u0433\u0440\u043e\u043a ${Math.floor(Math.random() * 90 + 10)}`;
  if (prefersHttpTransport()) {
    void connectHttp(name, "preferred");
    return;
  }
  connectWebSocket(name);
}

function connectWebSocket(name: string) {
  resetServerAudioCursor();
  resetStateInterpolation();
  transportMode = "websocket";
  const wsChannel = new WebSocketNetworkChannel(webSocketUrl());
  channel = wsChannel;
  const fallbackTimer = window.setTimeout(() => {
    if (!connected && transportMode === "websocket" && channel === wsChannel) {
      wsChannel.close();
      channel = null;
      void connectHttp(name, "websocket-timeout");
    }
  }, 1800);
  wsChannel.onConnect((error) => {
    if (transportMode !== "websocket" || channel !== wsChannel) {
      wsChannel.close();
      return;
    }
    if (error) {
      window.clearTimeout(fallbackTimer);
      channel = null;
      void connectHttp(name, error.message);
      console.warn("unsoccer connection failed", error.message);
      return;
    }
    window.clearTimeout(fallbackTimer);
    connected = true;
    document.documentElement.dataset.transport = "websocket";
    audio.playConnection(true);
    statusEl.textContent = "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e.";
    pushEventFeed("WebSocket online");
    updateNetworkHud();
    wsChannel.emit("join", { name });
  });
  wsChannel.onDisconnect(() => {
    if (transportMode !== "websocket" || channel !== wsChannel) return;
    connected = false;
    transportMode = "none";
    channel = null;
    document.documentElement.dataset.transport = "none";
    audio.playConnection(false);
    resetServerAudioCursor();
    resetStateInterpolation();
    statusEl.textContent = "\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0441\u0435\u0440\u0432\u0435\u0440.";
    pushEventFeed("\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e");
    updatePlayerChip();
    updateNetworkHud();
  });
  wsChannel.on("joined", (data) => {
    acceptJoin(data as JoinAccepted);
  });
  wsChannel.on("server-full", () => {
    statusEl.textContent = "\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d.";
    pushEventFeed("\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d");
  });
  wsChannel.on("state", (data) => {
    receiveState(data as ServerState);
  });
}

async function connectHttp(name: string, reason: string) {
  if (transportMode === "http" && httpClientId) return;
  resetServerAudioCursor();
  resetStateInterpolation();
  channel = null;
  transportMode = "http";
  httpPollGeneration += 1;
  const generation = httpPollGeneration;
  statusEl.textContent = "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 HTTP fallback...";
  pushEventFeed("HTTP fallback");
  try {
    const payload = await postJson<{ ok: boolean; joined: JoinAccepted; state: ServerState }>("join", { name });
    httpClientId = payload.joined.id;
    connected = true;
    audio.playConnection(true);
    acceptJoin(payload.joined);
    receiveState(payload.state);
    document.documentElement.dataset.transport = `http:${reason}`;
    updateNetworkHud();
    void pollHttpState(generation);
  } catch (error) {
    connected = false;
    transportMode = "none";
    statusEl.textContent = "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0441\u0435\u0440\u0432\u0435\u0440.";
    pushEventFeed("\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0442\u0438");
    updateNetworkHud();
    console.warn("unsoccer http fallback failed", error);
  }
}

async function pollHttpState(generation: number) {
  while (transportMode === "http" && httpClientId && generation === httpPollGeneration) {
    try {
      const payload = await getJson<{ ok: boolean; joined: JoinAccepted; state: ServerState }>(
        `state?clientId=${encodeURIComponent(httpClientId)}`
      );
      acceptJoin(payload.joined);
      receiveState(payload.state);
      await wait(55);
    } catch (error) {
      connected = false;
      audio.playConnection(false);
      statusEl.textContent = "\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0441\u0435\u0440\u0432\u0435\u0440.";
      pushEventFeed("\u041f\u043e\u0442\u0435\u0440\u044f\u043d HTTP snapshot");
      updateNetworkHud();
      console.warn("unsoccer http poll failed", error);
      await wait(1000);
    }
  }
}

function unlockAudio() {
  audioUnlockAttempts += 1;
  syncAudioDebugDataset();
  void audio.unlock().then((becameUnlocked) => {
    if (becameUnlocked) hydrateAudioAfterUnlock();
    syncAudioDebugDataset();
  });
}

function hydrateAudioAfterUnlock() {
  if (connected) audio.playConnection(true);
  if (localJoin) audio.playJoin(localJoin.role);
  if (latestState) {
    primeAudioObservation(latestState);
    updateAudioMix(latestState);
  }
}

function primeAudioObservation(state: ServerState) {
  lastConsumedAudioEventId = maxAudioEventId(state.audioEvents || []);
  audioEventsPrimed = true;
  const localPlayer = localJoin
    ? state.players.find((player) => player.id === localJoin?.id && player.role === "player")
    : null;
  audioObservedLocalHazardId = localPlayer ? hazardAt(localPlayer.position, state.weather)?.id ?? null : null;
  audioObservedBallHazardId = hazardAt(state.ball.position, state.weather)?.id ?? null;
}

function resetServerAudioCursor(): void {
  lastConsumedAudioEventId = 0;
  audioEventsPrimed = false;
}

function resetStateInterpolation(): void {
  stateHistory.length = 0;
  renderedState = null;
  interpolationAlpha = 1;
  interpolationRenderAgeMs = 0;
}

function sendInput(force = false) {
  if (!connected) return;
  updateResolvedInput();
  const now = performance.now();
  if (!force && now - lastSentAt < 34) return;
  lastSentAt = now;
  inputSequence += 1;
  if (transportMode === "http" && httpClientId) {
    void postJson("input", { clientId: httpClientId, input, sequence: inputSequence }).catch((error) => {
      console.warn("unsoccer http input failed", error);
    });
    return;
  }
  if (!channel) return;
  channel.emit("input", { input, sequence: inputSequence });
}

function receiveState(state: ServerState) {
  latestState = state;
  latestSnapshotReceivedAt = performance.now();
  stateHistory.push({ state, receivedAt: latestSnapshotReceivedAt * 0.001 });
  while (stateHistory.length > STATE_HISTORY_LIMIT) stateHistory.shift();
  observeAudioState(state);
  updateNetworkHud(latestSnapshotReceivedAt);
}

function selectRenderState(nowSeconds: number): ServerState | null {
  localPredictionLeadMs = 0;
  if (!latestState) return null;
  let state: ServerState;
  if (!settings.graphics.motionInterpolation || stateHistory.length < 2) {
    interpolationAlpha = 1;
    interpolationRenderAgeMs = 0;
    state = latestState;
    return withResponsiveLocalPlayer(state, nowSeconds);
  }

  const targetTime = nowSeconds - STATE_INTERPOLATION_DELAY_SECONDS;
  let from = stateHistory[0];
  let to = stateHistory[stateHistory.length - 1];

  if (targetTime <= from.receivedAt) {
    interpolationAlpha = 0;
    interpolationRenderAgeMs = (nowSeconds - from.receivedAt) * 1000;
    return withResponsiveLocalPlayer(from.state, nowSeconds);
  }

  if (targetTime >= to.receivedAt) {
    interpolationAlpha = 1;
    interpolationRenderAgeMs = (nowSeconds - to.receivedAt) * 1000;
    return withResponsiveLocalPlayer(to.state, nowSeconds);
  }

  for (let index = 0; index < stateHistory.length - 1; index += 1) {
    const candidateFrom = stateHistory[index];
    const candidateTo = stateHistory[index + 1];
    if (candidateFrom.receivedAt <= targetTime && targetTime <= candidateTo.receivedAt) {
      from = candidateFrom;
      to = candidateTo;
      break;
    }
  }

  const span = Math.max(0.001, to.receivedAt - from.receivedAt);
  const alpha = THREE.MathUtils.clamp((targetTime - from.receivedAt) / span, 0, 1);
  interpolationAlpha = alpha;
  interpolationRenderAgeMs = (nowSeconds - targetTime) * 1000;
  state = interpolateState(from.state, to.state, alpha);
  return withResponsiveLocalPlayer(state, nowSeconds);
}

function interpolateState(from: ServerState, to: ServerState, alpha: number): ServerState {
  const previousPlayers = new Map(from.players.map((player) => [player.id, player]));
  return {
    ...to,
    ball: interpolateBall(from.ball, to.ball, alpha),
    players: to.players.map((player) => interpolatePlayer(previousPlayers.get(player.id), player, alpha))
  };
}

function interpolateBall(from: ServerState["ball"], to: ServerState["ball"], alpha: number): ServerState["ball"] {
  if (vecDistance(from.position, to.position) > BALL_SNAP_DISTANCE) return to;
  return {
    position: lerpVec3(from.position, to.position, alpha),
    velocity: lerpVec3(from.velocity, to.velocity, alpha),
    variant: to.variant
  };
}

function interpolatePlayer(from: PlayerSnapshot | undefined, to: PlayerSnapshot, alpha: number): PlayerSnapshot {
  if (!from || from.role !== to.role || vecDistance(from.position, to.position) > PLAYER_SNAP_DISTANCE) return to;
  return {
    ...to,
    position: lerpVec3(from.position, to.position, alpha),
    velocity: lerpVec3(from.velocity, to.velocity, alpha),
    yaw: lerpAngle(from.yaw, to.yaw, alpha)
  };
}

function withResponsiveLocalPlayer(state: ServerState, nowSeconds: number): ServerState {
  const localId = localJoin?.id;
  if (!localId || !latestState) return state;
  const latestPlayer = latestState.players.find((player) => player.id === localId && player.role === "player");
  if (!latestPlayer) return state;
  const playerIndex = state.players.findIndex((player) => player.id === localId);
  if (playerIndex < 0) return state;

  const movement = movementDirection(input, latestPlayer.team);
  const lastAuthoritative = stateHistory[stateHistory.length - 1];
  const leadSeconds = movement.magnitude > 0 && lastAuthoritative
    ? Math.min(
      LOCAL_PLAYER_PREDICTION_MAX_SECONDS,
      Math.max(nowSeconds - lastAuthoritative.receivedAt, 1 / 60)
    )
    : 0;
  localPredictionLeadMs = leadSeconds * 1000;
  const localSpeedMultiplier = latestPlayer.exhausted
    ? PLAYER_EXHAUSTED_SPEED_MULTIPLIER
    : input.sprint && latestPlayer.stamina > 1
      ? PLAYER_SPRINT_MULTIPLIER
      : 1;
  const localSpeed = PLAYER_SPEED * localSpeedMultiplier;

  const localPlayer: PlayerSnapshot = leadSeconds > 0
    ? {
      ...latestPlayer,
      position: {
        x: latestPlayer.position.x + movement.x * localSpeed * leadSeconds,
        y: latestPlayer.position.y,
        z: latestPlayer.position.z + movement.z * localSpeed * leadSeconds
      },
      velocity: {
        x: movement.x * localSpeed,
        y: 0,
        z: movement.z * localSpeed
      },
      yaw: Math.atan2(movement.x, movement.z)
    }
    : latestPlayer;

  const players = state.players.slice();
  players[playerIndex] = localPlayer;
  return { ...state, players };
}

function movementDirection(inputState: InputState, team: TeamId | null): { x: number; z: number; magnitude: number } {
  const xAxis = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
  const forwardAxis = (inputState.up ? 1 : 0) - (inputState.down ? 1 : 0);
  const attackDirection = team === 1 ? -1 : 1;
  const zAxis = forwardAxis * attackDirection;
  const magnitude = Math.hypot(xAxis, zAxis);
  if (magnitude <= 0) return { x: 0, z: 0, magnitude: 0 };
  return {
    x: xAxis / magnitude,
    z: zAxis / magnitude,
    magnitude
  };
}

function lerpVec3(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, alpha: number) {
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, alpha),
    y: THREE.MathUtils.lerp(from.y, to.y, alpha),
    z: THREE.MathUtils.lerp(from.z, to.z, alpha)
  };
}

function vecDistance(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function lerpAngle(from: number, to: number, alpha: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function updateHud(state: ServerState) {
  blueScoreEl.textContent = String(state.score.blue);
  orangeScoreEl.textContent = String(state.score.orange);
  updateWeatherHud(state.weather);
  updatePlayerChip();
  updateNetworkHud();
  const countdown = state.countdown > 0 ? ` \u0420\u043e\u0437\u044b\u0433\u0440\u044b\u0448 \u0447\u0435\u0440\u0435\u0437 ${(state.countdown / 1000).toFixed(1)}\u0441.` : "";
  const message = translateServerMessage(state.message);
  if (settings.accessibility.captions && message) pushEventFeed(message);
  if (!localJoin || localJoin.role === "spectator") {
    statusEl.textContent = `${message}.${countdown || " \u041d\u0430\u0431\u043b\u044e\u0434\u0435\u043d\u0438\u0435."}`;
  } else if (message) {
    statusEl.textContent = `${message}.${countdown}`;
  }
  rosterEl.innerHTML = state.players.map((player) => {
    const dot = player.team === 0 ? "blue" : player.team === 1 ? "orange" : "spectator";
    const role = player.role === "player" ? teamNameLabel(player.team) : "\u0417\u0440\u0438\u0442\u0435\u043b\u044c";
    const self = player.id === localJoin?.id ? "\u0432\u044b" : role;
    return `<div class="roster-row"><i class="dot ${dot}"></i><span>${escapeHtml(player.name)}</span><small>${self}</small></div>`;
  }).join("");
}

function updateWeatherHud(weather: WeatherSnapshot | undefined) {
  if (!weather) {
    weatherEl.textContent = "\u041f\u043e\u0433\u043e\u0434\u0430: \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u0435";
    document.documentElement.dataset.weatherLabel = "";
    document.documentElement.dataset.weatherHazards = "0";
    return;
  }
  const counts = weather.hazards.reduce<Record<HazardType, number>>(
    (total, hazard) => {
      total[hazard.type] += 1;
      return total;
    },
    { puddle: 0, slush: 0, snowbank: 0 }
  );
  const wind = Math.hypot(weather.wind.x, weather.wind.z);
  document.documentElement.dataset.weatherLabel = weather.label;
  document.documentElement.dataset.weatherHazards = String(weather.hazards.length);
  document.documentElement.dataset.weatherPuddles = String(counts.puddle);
  document.documentElement.dataset.weatherSlush = String(counts.slush);
  document.documentElement.dataset.weatherSnowbanks = String(counts.snowbank);
  document.documentElement.dataset.weatherKind = weather.kind;
  document.documentElement.dataset.weatherIntensity = weather.intensity.toFixed(3);
  document.documentElement.dataset.weatherNextChangeMs = String(Math.round(weather.nextChangeInMs));
  weatherEl.textContent =
    `\u041f\u043e\u0433\u043e\u0434\u0430: ${weather.label} ` +
    `\u2022 ${Math.round(weather.intensity * 100)}% ` +
    `\u2022 \u0432\u0435\u0442\u0435\u0440 ${wind.toFixed(1)} ` +
    `\u2022 \u0441\u043c\u0435\u043d\u0430 ${Math.ceil(weather.nextChangeInMs / 1000)}\u0441 ` +
    `\u2022 \u043b\u0443\u0436\u0438 ${counts.puddle}, \u0441\u043b\u044f\u043a\u043e\u0442\u044c ${counts.slush}, \u0441\u0443\u0433\u0440\u043e\u0431\u044b ${counts.snowbank}`;
}

function teamNameLabel(team: TeamId | null): string {
  if (team === 0) return "\u0421\u0438\u043d\u0438\u0435";
  if (team === 1) return "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435";
  return "\u0417\u0440\u0438\u0442\u0435\u043b\u0438";
}

function translateServerMessage(message: string): string {
  if (!message) return "";
  if (message === "Waiting for players") return "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
  if (message === "Orange scores") return "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
  if (message === "Blue scores") return "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
  const joined = message.match(/^(.+) joined (the pitch|as spectator)$/);
  if (joined) return `${joined[1]} ${joined[2] === "the pitch" ? "\u0432\u044b\u0448\u0435\u043b \u043d\u0430 \u043f\u043e\u043b\u0435" : "\u0441\u0442\u0430\u043b \u0437\u0440\u0438\u0442\u0435\u043b\u0435\u043c"}`;
  const left = message.match(/^(.+) left$/);
  if (left) return `${left[1]} \u0432\u044b\u0448\u0435\u043b`;
  const action = message.match(/^(.+) (left-kicked|right-kicked|headed|body-checked) the ball$/);
  if (action) {
    const verbs: Record<string, string> = {
      "left-kicked": "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439",
      "right-kicked": "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439",
      headed: "\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439",
      "body-checked": "\u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b \u043c\u044f\u0447 \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c"
    };
    return `${action[1]} ${verbs[action[2]] || "\u0441\u044b\u0433\u0440\u0430\u043b \u043c\u044f\u0447\u043e\u043c"}`;
  }
  return message;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char] || char);
}

function applyState(state: ServerState, time: number) {
  const variant = state.ball.variant || 0;
  if (document.documentElement.dataset.activeBallVariant !== String(variant)) {
    applyBallVertexColors(ballGeometry, variant);
    setBallSeamVariant(ballMesh, variant);
    ballGeometry.attributes.color.needsUpdate = true;
    currentActiveBallVariant = variant;
    updateSidelineBallVisibility(variant);
    updateActiveBallModel(variant);
    document.documentElement.dataset.activeBallVariant = String(variant);
  }
  ballMesh.position.set(state.ball.position.x, state.ball.position.y, state.ball.position.z);
  ballMesh.rotation.x += state.ball.velocity.z * 0.01;
  ballMesh.rotation.z -= state.ball.velocity.x * 0.01;
  activeFree3dBallRoot.position.copy(ballMesh.position);
  activeFree3dBallRoot.rotation.copy(ballMesh.rotation);
  ballAura.position.copy(ballMesh.position);
  ballPulse = Math.max(0, ballPulse - 0.055);
  ballAuraMaterial.opacity = ballPulse * 0.5;
  ballAura.scale.setScalar(1 + ballPulse * 1.45);
  ballMaterial.emissive.setHex(ballPulse > 0 ? 0xffd87a : 0x000000);
  ballMaterial.emissiveIntensity = ballPulse * 0.35;

  const seen = new Set<string>();
  for (const player of state.players) {
    seen.add(player.id);
    if (player.lastActionAt > lastSeenActionAt) {
      lastSeenActionAt = player.lastActionAt;
      const telegraph = player.lastAction ? ACTION_TELEGRAPH[player.lastAction] : null;
      ballPulse = telegraph?.ballPulse ?? 0.76;
      document.documentElement.dataset.lastActionKind = player.lastAction || "none";
      document.documentElement.dataset.lastActionPlayer = player.id;
      document.documentElement.dataset.lastActionAt = String(player.lastActionAt);
      if (player.id === localJoin?.id) cameraImpulse = Math.max(cameraImpulse, telegraph?.cameraImpulse ?? 0.58);
    }
    let visual = players.get(player.id);
    if (!visual) {
      visual = new PlayerVisual(player);
      players.set(player.id, visual);
    }
    visual.update(player, time);
  }
  for (const [id, visual] of players) {
    if (!seen.has(id)) {
      visual.dispose();
      players.delete(id);
    }
  }
  document.documentElement.dataset.playerRig = loadedFree3dCharacter
    ? "free3d-skinned-mixamo-character"
    : "procedural-animated-footballer-loading";
  document.documentElement.dataset.animatedPlayers = String([...players.values()].filter((visual) => visual.root.visible).length);
  weatherLayer.update(state.weather, time);
  for (const net of goalNets) net.update(state, time);
  updateMovingCars(time, Number(document.documentElement.dataset.daylight || "0"));
  observeWeatherAudio(state);
  updateHud(state);
  updateAudioMix(state);
}

function observeAudioState(state: ServerState) {
  if (!audioEventsPrimed) {
    primeAudioObservation(state);
    return;
  }
  consumeServerAudioEvents(state.audioEvents || []);
}

function maxAudioEventId(events: ServerAudioEvent[]): number {
  let maxId = 0;
  for (const event of events) maxId = Math.max(maxId, event.id);
  return maxId;
}

function consumeServerAudioEvents(events: ServerAudioEvent[]): void {
  const pending = events
    .filter((event) => event.id > lastConsumedAudioEventId)
    .sort((a, b) => a.id - b.id);
  for (const event of pending) {
    lastConsumedAudioEventId = Math.max(lastConsumedAudioEventId, event.id);
    if (event.kind === "roster") {
      audio.playRosterChange(event.change);
    } else if (event.kind === "kick") {
      audio.playKick(event.kick, {
        pan: event.position.x / (FIELD_WIDTH / 2),
        isLocal: event.playerId === localJoin?.id,
        speed: event.speed
      });
    } else if (event.kind === "goal") {
      audio.playGoal(event.team);
    } else if (event.kind === "countdown" && event.remainingSeconds <= 3) {
      audio.playCountdown(event.remainingSeconds);
    }
  }
}

function hazardAt(position: { x: number; y: number; z: number }, weather: WeatherSnapshot | undefined): HazardSnapshot | null {
  if (!weather) return null;
  let nearest: HazardSnapshot | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const hazard of weather.hazards) {
    const distance = Math.hypot(position.x - hazard.position.x, position.z - hazard.position.z);
    if (distance <= hazard.radius && distance < nearestDistance) {
      nearest = hazard;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function observeWeatherAudio(state: ServerState) {
  const localPlayer = localJoin
    ? state.players.find((player) => player.id === localJoin?.id && player.role === "player")
    : null;
  const localHazard = localPlayer ? hazardAt(localPlayer.position, state.weather) : null;
  const nextLocalHazardId = localHazard?.id ?? null;
  if (nextLocalHazardId !== audioObservedLocalHazardId) {
    audioObservedLocalHazardId = nextLocalHazardId;
    if (localHazard) {
      hazardAudioEvents[localHazard.type] += 1;
      audio.playWeatherHazard(localHazard.type, {
        pan: localHazard.position.x / (FIELD_WIDTH / 2),
        isLocal: true,
        speed: localPlayer ? Math.hypot(localPlayer.velocity.x, localPlayer.velocity.z) : 0
      });
    }
  }

  const ballHazard = hazardAt(state.ball.position, state.weather);
  const nextBallHazardId = ballHazard?.id ?? null;
  const ballSpeed = Math.hypot(state.ball.velocity.x, state.ball.velocity.y, state.ball.velocity.z);
  if (nextBallHazardId !== audioObservedBallHazardId) {
    audioObservedBallHazardId = nextBallHazardId;
    if (ballHazard && ballSpeed > 0.6) {
      hazardAudioEvents[ballHazard.type] += 1;
      audio.playWeatherHazard(ballHazard.type, {
        pan: ballHazard.position.x / (FIELD_WIDTH / 2),
        speed: ballSpeed
      });
    }
  }
}

function updateAudioMix(state: ServerState) {
  const ballSpeed = Math.hypot(state.ball.velocity.x, state.ball.velocity.y, state.ball.velocity.z);
  const daylight = Number(document.documentElement.dataset.daylight || "0");
  const ballHazard = hazardAt(state.ball.position, state.weather);
  audio.update({
    activePlayers: state.players.filter((player) => player.role === "player").length,
    ballSpeed,
    connected,
    daylight,
    dayTimeSeconds: state.dayTimeSeconds,
    weatherKind: state.weather?.kind ?? "clear",
    weatherIntensity: state.weather?.intensity ?? 0,
    hazardDrag: ballHazard ? ballHazard.strength : 0
  });
  syncAudioDebugDataset();
}

function updateLighting(elapsedSeconds: number) {
  const serverDayTime = (renderedState ?? latestState)?.dayTimeSeconds;
  const fallbackCycleSeconds = qaDayCycleSeconds === null ? elapsedSeconds : qaDayCycleSeconds + elapsedSeconds;
  const fallbackDayTime = DAY_START_SECONDS + fallbackCycleSeconds / DAY_CYCLE_SECONDS * 24 * 60 * 60;
  const daySeconds = serverDayTime ?? fallbackDayTime;
  const dayTime = THREE.MathUtils.euclideanModulo(daySeconds, 24 * 60 * 60);
  const solarCycle = dayTime / (24 * 60 * 60);
  const angle = (solarCycle - 0.25) * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const sunrise = THREE.MathUtils.smoothstep(dayTime, 4 * 60 * 60, 6 * 60 * 60);
  const sunsetFade = 1 - THREE.MathUtils.smoothstep(dayTime, 20 * 60 * 60, 22 * 60 * 60);
  const daylight = Math.max(0, Math.min(sunrise, sunsetFade));
  const sunset = Math.max(0, 1 - Math.abs(sunHeight) * 5.2) * (1 - Math.abs(daylight - 0.5));
  const skyRadius = 46;
  sun.position.set(Math.cos(angle) * skyRadius, Math.max(1.2, sunHeight * skyRadius), Math.sin(angle + 0.42) * 28);
  sun.target.position.set(0, 0, 0);
  sunMesh.position.set(Math.cos(angle) * 70, 12 + sunHeight * 42, Math.sin(angle + 0.42) * 42);
  sunGlow.position.copy(sunMesh.position);
  const moonAngle = angle + Math.PI;
  moonMesh.position.set(Math.cos(moonAngle) * 70, 12 + Math.sin(moonAngle) * 42, Math.sin(moonAngle + 0.42) * 42);
  sunColor.copy(dayColor).lerp(sunsetColor, sunset).lerp(nightColor, 1 - daylight);
  skyColor.copy(nightColor).lerp(dayColor, daylight).lerp(sunsetColor, sunset * 0.36);
  const weather = (renderedState ?? latestState)?.weather;
  const precipitationIntensity = weather?.kind === "rain" || weather?.kind === "snow" ? weather.intensity : 0;
  const snowIntensity = weather?.kind === "snow" ? weather.intensity : 0;
  fogColor.copy(fogNightColor).lerp(fogDayColor, daylight).lerp(sunsetColor, sunset * 0.18).lerp(snowFogColor, snowIntensity * 0.1);
  sun.color.copy(sunColor);
  sun.intensity = 1.05 + daylight * 4.15 + sunset * 1.05 - precipitationIntensity * 0.38;
  hemi.intensity = 1.05 + daylight * 2.1 - precipitationIntensity * 0.16;
  ambientFill.color.copy(fogColor);
  ambientFill.intensity = 0.34 + daylight * 0.58 + (1 - daylight) * 0.12 + snowIntensity * 0.02;
  bounceColor.set(0x9fc7b3).lerp(sunsetColor, sunset * 0.32).lerp(nightColor, (1 - daylight) * 0.22);
  courtyardBounce.color.copy(bounceColor);
  courtyardBounce.intensity = 0.48 + daylight * 1.12 + sunset * 0.42 + (1 - daylight) * 0.18;
  rimLight.color.copy(fogColor);
  rimLight.intensity = 0.28 + (1 - daylight) * 0.72 + sunset * 0.24;
  for (const flood of floodLights) {
    flood.intensity = 0.12 + (1 - daylight) * 1.18;
    flood.color.set(daylight > 0.55 ? 0xc6dbff : 0xe7f0ff);
  }
  renderer.toneMappingExposure = 1.12 + daylight * 0.9 + sunset * 0.18 - precipitationIntensity * 0.16;
  scene.background = skyColor;
  skyMaterial.color.copy(skyColor).lerp(fogColor, 0.18);
  if (scene.fog) {
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(fogColor);
    fog.near = 32 + daylight * 18;
    fog.far = 86 + daylight * 34 - snowIntensity * 8;
  }
  (sunMesh.material as THREE.MeshBasicMaterial).color.copy(sunColor);
  sunMesh.scale.setScalar(0.82 + daylight * 0.34 + sunset * 0.28);
  sunMesh.visible = daylight > 0.05 || sunset > 0.03;
  sunGlow.visible = sunMesh.visible;
  sunGlowMaterial.color.copy(sunColor);
  sunGlowMaterial.opacity = (0.12 + daylight * 0.34 + sunset * 0.3) * (sunMesh.visible ? 1 : 0);
  moonMesh.visible = daylight < 0.7;
  moonMaterial.opacity = THREE.MathUtils.clamp((1 - daylight) * 0.78 + 0.08, 0, 0.86);
  sunPathMaterial.opacity = 0;
  sunPath.visible = false;
  document.documentElement.dataset.dayCycleSeconds = THREE.MathUtils.euclideanModulo((solarCycle - 0.25) * DAY_CYCLE_SECONDS, DAY_CYCLE_SECONDS).toFixed(2);
  document.documentElement.dataset.dayTimeSeconds = dayTime.toFixed(1);
  document.documentElement.dataset.dayCycleSource = serverDayTime === undefined ? "fallback-animated" : "server";
  document.documentElement.dataset.dayCycleLengthSeconds = String(DAY_CYCLE_SECONDS);
  document.documentElement.dataset.daylight = daylight.toFixed(3);
  document.documentElement.dataset.darkHours = "20:00-04:00";
  document.documentElement.dataset.sunPathVisible = String(sunPath.visible);
  document.documentElement.dataset.sunVisible = String(sunMesh.visible);
  document.documentElement.dataset.moonVisible = String(moonMesh.visible);
  document.documentElement.dataset.sunFramed = "false";
  document.documentElement.dataset.moonFramed = "false";
  document.documentElement.dataset.ambientFill = ambientFill.intensity.toFixed(3);
  document.documentElement.dataset.courtyardBounce = courtyardBounce.intensity.toFixed(3);
  document.documentElement.dataset.sunX = sun.position.x.toFixed(2);
  document.documentElement.dataset.sunY = sun.position.y.toFixed(2);
  document.documentElement.dataset.sunZ = sun.position.z.toFixed(2);
}

function updateCamera(delta: number) {
  cameraFocus.set(0, 0.6, 0);
  cameraBall.set(0, BALL_RADIUS, 0);
  cameraVelocity.set(0, 0, 0);
  let yaw = 0;
  let team: TeamId | null = localJoin?.team ?? null;
  const cameraState = renderedState ?? latestState;

  if (cameraState) {
    cameraBall.set(cameraState.ball.position.x, cameraState.ball.position.y, cameraState.ball.position.z);
    const player = cameraState.players.find((item) => item.id === localJoin?.id && item.role === "player");
    if (player) {
      cameraFocus.set(player.position.x, 0.6, player.position.z);
      cameraVelocity.set(player.velocity.x, 0, player.velocity.z);
      yaw = player.yaw;
      team = player.team;
    } else {
      cameraFocus.copy(cameraBall);
      cameraFocus.y = 0.6;
    }
  }

  const attackDirection = team === 1 ? -1 : 1;
  cameraVelocity.multiplyScalar(0.28);
  cameraBallBlend.copy(cameraBall).sub(cameraFocus).multiplyScalar(0.34);
  cameraLookTarget.copy(cameraFocus).add(cameraBallBlend).add(cameraVelocity);

  const yawBackX = -Math.sin(yaw) * 3.5;
  const tacticalBackZ = -attackDirection * (12.5 + cameraImpulse * 1.3);
  cameraDesired.set(
    cameraLookTarget.x + yawBackX,
    14.5 + cameraImpulse * 1.4,
    cameraLookTarget.z + tacticalBackZ
  );

  const positionDamp = 1 - Math.exp(-delta * 4.6);
  const lookDamp = 1 - Math.exp(-delta * 6.5);
  camera.position.lerp(cameraDesired, positionDamp);
  cameraLookAt.lerp(cameraLookTarget, lookDamp);
  camera.lookAt(cameraLookAt);
  cameraImpulse = Math.max(0, cameraImpulse - delta * 2.8);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

addEventListener("keydown", (event) => {
  unlockAudio();
  if (pendingRebindAction) {
    event.preventDefault();
    if (event.code === "Escape") {
      pendingRebindAction = null;
      syncSettingsUi();
      return;
    }
    bindAction(pendingRebindAction, event.code);
    return;
  }
  if (actionPressed(settings.controls, "settings", new Set([event.code]))) {
    event.preventDefault();
    setSettingsOpen(!settingsOpen);
    return;
  }
  if (settingsOpen) return;
  pressedCodes.add(event.code);
  if (!event.repeat) {
    if (actionPressed(settings.controls, "leftKick", new Set([event.code]))) input.kickLeft += 1;
    if (actionPressed(settings.controls, "rightKick", new Set([event.code]))) input.kickRight += 1;
    if (actionPressed(settings.controls, "headHit", new Set([event.code]))) input.head += 1;
    if (actionPressed(settings.controls, "jump", new Set([event.code]))) input.jump += 1;
    if (actionPressed(settings.controls, "muteAudio", new Set([event.code]))) toggleMute();
    if (actionPressed(settings.controls, "cameraReset", new Set([event.code]))) resetCamera();
  }
  updateResolvedInput();
  sendInput(true);
});

addEventListener("keyup", (event) => {
  unlockAudio();
  pressedCodes.delete(event.code);
  updateResolvedInput();
  sendInput(true);
});

settingsButton.addEventListener("click", () => setSettingsOpen(true));
settingsCloseButton.addEventListener("click", () => setSettingsOpen(false));
muteButton.addEventListener("click", toggleMute);
cameraResetButton.addEventListener("click", resetCamera);
fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
});
settingsForm.addEventListener("submit", (event) => event.preventDefault());
settingsForm.addEventListener("input", readSettingsFromForm);
settingsForm.addEventListener("change", readSettingsFromForm);
applySettingsButton.addEventListener("click", persistAndApplySettings);
resetTabButton.addEventListener("click", () => {
  settings = resetSettingsTab(settings, activeSettingsTab);
  persistAndApplySettings();
});
resetAllButton.addEventListener("click", () => {
  settings = cloneSettings(DEFAULT_SETTINGS);
  persistAndApplySettings();
});
testSoundButton.addEventListener("click", () => {
  unlockAudio();
  audio.playConnection(true);
  syncAudioDebugDataset();
});
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]")) {
  button.addEventListener("click", () => {
    setActiveSettingsTab(button.dataset.settingsTab as SettingsTab);
    syncSettingsUi();
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-rebind-action]")) {
  button.addEventListener("click", () => {
    pendingRebindAction = button.dataset.rebindAction as InputAction;
    syncSettingsUi();
  });
}

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
const audioUnlockOptions: AddEventListenerOptions = { capture: true, passive: true };
addEventListener("pointerdown", unlockAudio, audioUnlockOptions);
addEventListener("mousedown", unlockAudio, audioUnlockOptions);
addEventListener("touchstart", unlockAudio, audioUnlockOptions);
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  if (settingsOpen) return;
  if (event.button === 0) input.kickLeft += 1;
  if (event.button === 2) input.kickRight += 1;
  sendInput(true);
});
canvas.addEventListener("wheel", (event) => {
  unlockAudio();
  event.preventDefault();
  if (settingsOpen) return;
  input.head += 1;
  sendInput(true);
}, { passive: false });

addEventListener("resize", resize);
addEventListener("pagehide", () => {
  if (transportMode !== "http" || !httpClientId) return;
  const body = JSON.stringify({ clientId: httpClientId });
  navigator.sendBeacon(`${serverApiBase()}/leave`, new Blob([body], { type: "application/json" }));
});
resize();
connect();

function frame(time: number) {
  requestAnimationFrame(frame);
  const seconds = time * 0.001;
  const delta = lastFrameSeconds > 0 ? Math.min(0.05, seconds - lastFrameSeconds) : 1 / 60;
  lastFrameSeconds = seconds;
  sendInput();
  renderedState = selectRenderState(seconds);
  document.documentElement.dataset.interpolationBuffer = String(stateHistory.length);
  document.documentElement.dataset.interpolationDelayMs = String(Math.round(STATE_INTERPOLATION_DELAY_SECONDS * 1000));
  document.documentElement.dataset.interpolationAlpha = interpolationAlpha.toFixed(3);
  document.documentElement.dataset.interpolationRenderAgeMs = String(Math.round(interpolationRenderAgeMs));
  document.documentElement.dataset.localPredictionMs = String(Math.round(localPredictionLeadMs));
  if (renderedState) applyState(renderedState, seconds);
  updateLighting(seconds);
  updateCamera(delta);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
