import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  BALL_RADIUS,
  CELEBRATION_DURATION_MS,
  CHARACTER_ROSTER,
  DAY_CYCLE_SECONDS,
  DAY_START_SECONDS,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_USER_PICS,
  DEFAULT_VISUAL_SETTINGS,
  DEFAULT_INPUT,
  EMOTION_CHOICES,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_VERSION,
  GOAL_DEPTH,
  GOAL_WIDTH,
  LEFT_KICK_CHARGE_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_EXHAUSTED_SPEED_MULTIPLIER,
  PLAYER_INPUT_AXIS_ACCELERATION,
  PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION,
  PLAYER_INPUT_AXIS_RELEASE_DECAY,
  PLAYER_MOVEMENT_ACCELERATION,
  PLAYER_MOVEMENT_DECELERATION,
  PLAYER_MOVEMENT_TURN_ACCELERATION,
  PLAYER_SPEED,
  PLAYER_STAMINA_MAX,
  PLAYER_SPRINT_MULTIPLIER,
  type CelebrationKind,
  type HazardSnapshot,
  type HazardType,
  type TeamId,
  type InputState,
  type JoinAccepted,
  type KickKind,
  type EmotionId,
  type PlayerSnapshot,
  type PlayerProfileSnapshot,
  type ServerAudioEvent,
  type ServerState,
  type VisualSettings,
  type WeatherSnapshot
} from "@itch-games/unsoccer-shared";
import { UnSoccerAudio, type AudioRuntimeSnapshot } from "./audio";
import {
  GameCharacterController,
  loadFree3dCharacter,
  type CharacterControllerDebugSnapshot
} from "./character-controller";
import { applyEnvironmentLookdevMaterials, installCourtyardEnvironment, type CourtyardEnvironmentRuntime } from "./environment-props";
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
import {
  actionLabel,
  applyStaticLocalization,
  controllerBadge as localizedControllerBadge,
  currentLocale,
  emotionLabel,
  generatedPlayerName,
  localizeGeneratedPlayerName,
  staminaLabel,
  t,
  teamLabel,
  teamShortLabel,
  weatherEmoji,
  weatherKindLabel,
  weatherMessageEmoji
} from "./i18n";
import { WeatherVisualLayer } from "./weather";
import {
  applyLookdevMaterial,
  applyVisualLighting,
  configureVisualRenderer,
  type VisualFloodlightRuntime,
  type VisualRig
} from "./visual-pipeline";
import "./styles.css";
import "./hud-overrides.css";

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
          darkHours: string;
          twilightHours: string;
          stadiumLights: string;
          stadiumLightsOn: string;
          stadiumLightPower: string;
          stadiumLightCones: string;
          stadiumLightBeamAngle: string;
          stadiumLightBeamRadius: string;
          stadiumLightFlicker: string;
          stadiumLightPalette: string;
          nightLighting: string;
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
const staminaMeterEl = requireElement<HTMLElement>("#stamina-meter");
const staminaValueEl = requireElement<HTMLElement>("#stamina-value");
const staminaFillEl = requireElement<HTMLElement>("#stamina-fill");
const staminaStateEl = requireElement<HTMLElement>("#stamina-state");
const transportStatusEl = requireElement<HTMLElement>("#transport-status");
const pingStatusEl = requireElement<HTMLElement>("#ping-status");
const snapshotAgeEl = requireElement<HTMLElement>("#snapshot-age");
const eventFeedEl = requireElement<HTMLElement>("#event-feed");
const ballOffscreenIndicatorEl = requireElement<HTMLElement>("#ball-offscreen-indicator");
const playersOffscreenIndicatorsEl = requireElement<HTMLElement>("#players-offscreen-indicators");
const controlHintsEl = requireElement<HTMLElement>("#control-hints");
const mobileControlsEl = requireElement<HTMLElement>("#mobile-controls");
const mobileMovePadEl = requireElement<HTMLElement>(".mobile-move-pad");
const emotionWheelEl = requireElement<HTMLElement>("#emotion-wheel");
const chatPanelEl = requireElement<HTMLElement>("#game-chat");
const chatLogEl = requireElement<HTMLElement>("#chat-log");
const chatFormEl = requireElement<HTMLFormElement>("#chat-form");
const chatInputEl = requireElement<HTMLInputElement>("#chat-input");
const profileNameInput = requireElement<HTMLInputElement>("#profile-name");
const profileSkinSelect = requireElement<HTMLSelectElement>("#profile-skin");
const profilePicInput = requireElement<HTMLInputElement>("#profile-pic");
const profileAvatarEl = requireElement<HTMLElement>("#profile-avatar");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const muteButton = requireElement<HTMLButtonElement>("#mute-button");
const fullscreenButton = requireElement<HTMLButtonElement>("#fullscreen-button");
const cameraResetButton = requireElement<HTMLButtonElement>("#camera-reset-button");
const AUDIO_ON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm13.3-1.7-1.4 1.4a4.6 4.6 0 0 1 0 6.6l1.4 1.4a6.6 6.6 0 0 0 0-9.4Zm2.8-2.8-1.4 1.4a8.6 8.6 0 0 1 0 12.2l1.4 1.4a10.6 10.6 0 0 0 0-15Z"/></svg>';
const AUDIO_OFF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.4 3 2.8-2.8-1.4-1.4-2.8 2.8-2.8-2.8-1.4 1.4 2.8 2.8-2.8 2.8 1.4 1.4 2.8-2.8 2.8 2.8 1.4-1.4-2.8-2.8Z"/></svg>';
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
const ART_PASS_VERSION = "v0.0.036";
const BUILD_WEIGHT_LABEL = "39.92 MB";
const DAWN_START_SECONDS = 3 * 60 * 60;
const DAYLIGHT_START_SECONDS = 5 * 60 * 60;
const DUSK_START_SECONDS = 21 * 60 * 60;
const NIGHT_START_SECONDS = 23 * 60 * 60;
const DARK_HOURS_LABEL = "23:00-03:00";
const TWILIGHT_HOURS_LABEL = "03:00-05:00/21:00-23:00";

applyStaticLocalization(GAME_VERSION, BUILD_WEIGHT_LABEL);
versionBadge.textContent = `${GAME_VERSION} / ${BUILD_WEIGHT_LABEL}`;
document.documentElement.dataset.gameVersion = GAME_VERSION;
document.documentElement.dataset.gameWeightLabel = BUILD_WEIGHT_LABEL;
document.documentElement.dataset.gameLocale = currentLocale;
document.documentElement.dataset.artPass = ART_PASS_VERSION;
document.documentElement.dataset.ballRadius = BALL_RADIUS.toFixed(2);
document.documentElement.dataset.environment = "residential-courtyard-v028-free3d-dense";
document.documentElement.dataset.movementSmoothing = "axis-inertia-accel-decel";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
configureVisualRenderer(renderer, DEFAULT_VISUAL_SETTINGS);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.Fog(0x07110f, 30, 88);
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

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 180);
camera.position.set(0, 16, -16);
camera.lookAt(0, 0, 0);
const cameraLookAt = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const cameraVelocity = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const cameraRawAnchor = new THREE.Vector3();
const cameraSmoothedAnchor = new THREE.Vector3();
const cameraPreviousSmoothedAnchor = new THREE.Vector3();
const cameraMeasuredVelocity = new THREE.Vector3();
const cameraSmoothedVelocity = new THREE.Vector3();
const cameraDesiredLead = new THREE.Vector3();
const cameraSmoothedLead = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const offscreenWorld = new THREE.Vector3();
const offscreenProjected = new THREE.Vector3();
const offscreenDirection = new THREE.Vector3();
let cameraFollowInitialized = false;
let cameraAnchorId: string | null = null;

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
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(124, 32, 18), skyMaterial);
skyDome.position.y = 4;
scene.add(skyDome);

const FLOODLIGHT_POINTS = DEFAULT_VISUAL_SETTINGS.floodlights.lights;
const FLOODLIGHT_BEAM_ANGLE = THREE.MathUtils.degToRad(FLOODLIGHT_POINTS[0]?.angleDeg ?? 63.2);
const FLOODLIGHT_VISUAL_RADIUS = FLOODLIGHT_POINTS[0]?.coneRadius ?? 13.4;
const FLOODLIGHT_PALETTE = FLOODLIGHT_POINTS.map((light) => light.color);

const floodLights: THREE.SpotLight[] = [];
const stadiumFloodlights: VisualFloodlightRuntime[] = [];
const floodlightConeGeometry = new THREE.CylinderGeometry(0.24, FLOODLIGHT_VISUAL_RADIUS, 1, 36, 1, true);
const floodlightUp = new THREE.Vector3(0, 1, 0);
const floodlightDirection = new THREE.Vector3();
const floodlightMidpoint = new THREE.Vector3();
const floodlightRuntimeColor = new THREE.Color();
const floodlightDarkColor = new THREE.Color(0x6e8090);

for (const [index, point] of FLOODLIGHT_POINTS.entries()) {
  const target = new THREE.Object3D();
  target.position.set(point.targetX, point.targetY, point.targetZ);
  const baseColor = new THREE.Color(point.color);
  const flood = new THREE.SpotLight(baseColor, 0, point.distance, THREE.MathUtils.degToRad(point.angleDeg), point.penumbra, point.decay);
  flood.position.set(point.x, point.y, point.z);
  flood.target = target;
  flood.castShadow = true;
  flood.shadow.mapSize.set(768, 768);
  flood.shadow.camera.near = 2;
  flood.shadow.camera.far = 86;

  const lampMaterial = new THREE.MeshBasicMaterial({
    color: 0x6e8090,
    transparent: true,
    opacity: 0.72,
    toneMapped: false
  });
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa9b4,
    roughness: 0.34,
    metalness: 0.42
  });
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const cone = new THREE.Mesh(floodlightConeGeometry, coneMaterial);
  cone.name = "night-floodlight-volume";
  orientFloodlightCone(cone, flood.position, target.position);
  cone.visible = false;
  scene.add(flood, target, cone);
  floodLights.push(flood);
  stadiumFloodlights.push({
    light: flood,
    cone,
    lampMaterial,
    fixtureMaterial,
    target,
    baseColor,
    flickerPhase: index * 1.73 + 0.41,
    flickerSpeed: point.flickerSpeed,
    flickerDepth: point.flickerDepth,
    widthScale: point.widthScale,
    intensityBias: point.intensityBias,
    coneBaseRadius: FLOODLIGHT_VISUAL_RADIUS
  });
}
document.documentElement.dataset.stadiumLights = String(stadiumFloodlights.length);
document.documentElement.dataset.stadiumLightBeamAngle = THREE.MathUtils.radToDeg(FLOODLIGHT_BEAM_ANGLE).toFixed(1);
document.documentElement.dataset.stadiumLightBeamRadius = FLOODLIGHT_VISUAL_RADIUS.toFixed(1);
document.documentElement.dataset.stadiumLightPalette = FLOODLIGHT_PALETTE.join(",");

function orientFloodlightCone(cone: THREE.Mesh, lampPosition: THREE.Vector3, targetPosition: THREE.Vector3): void {
  floodlightDirection.copy(lampPosition).sub(targetPosition);
  const length = Math.max(1, floodlightDirection.length());
  floodlightDirection.normalize();
  floodlightMidpoint.copy(lampPosition).add(targetPosition).multiplyScalar(0.5);
  cone.position.copy(floodlightMidpoint);
  cone.scale.set(1, length, 1);
  cone.quaternion.setFromUnitVectors(floodlightUp, floodlightDirection);
}

const visualRig: VisualRig = {
  renderer,
  scene,
  hemi,
  ambientFill,
  courtyardBounce,
  sun,
  sunMesh,
  sunGlow,
  sunGlowMaterial,
  moonMesh,
  moonMaterial,
  rimLight,
  skyMaterial,
  skyDome,
  floodlights: stadiumFloodlights,
  sunPath,
  sunPathMaterial
};

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
let courtyardEnvironmentRuntime: CourtyardEnvironmentRuntime | null = null;
type LookdevMaterialKey = keyof VisualSettings["materials"];
const lookdevMaterials = new Map<LookdevMaterialKey, Set<THREE.Material>>();
let lastAppliedVisualSettings: VisualSettings | null = null;

function registerLookdevMaterial<T extends THREE.Material>(key: LookdevMaterialKey, material: T): T {
  const materials = lookdevMaterials.get(key) ?? new Set<THREE.Material>();
  materials.add(material);
  lookdevMaterials.set(key, materials);
  return material;
}

function applyRegisteredVisualMaterials(visual: VisualSettings): void {
  if (lastAppliedVisualSettings === visual) return;
  for (const [key, materials] of lookdevMaterials.entries()) {
    const settingsForKey = visual.materials[key];
    for (const material of materials) applyLookdevMaterial(material, settingsForKey);
  }
  applyEnvironmentLookdevMaterials(visual);
  lastAppliedVisualSettings = visual;
}

const movingCars: MovingCar[] = [];
const goalNets: GoalNetVisual[] = [];
const sidelineBalls: THREE.Group[] = [];
const activeFree3dBalls: THREE.Object3D[] = [];
const activeFree3dBallRoot = new THREE.Group();
const free3dBallLoader = new GLTFLoader();
const free3dBallMaterial = registerLookdevMaterial("ball", new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.56,
  metalness: 0.02,
  vertexColors: true
}));
const weatherLayer = new WeatherVisualLayer({ scene, fieldWidth: FIELD_WIDTH, fieldLength: FIELD_LENGTH });

const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 18);
applyBallVertexColors(ballGeometry, 0);
const ballMaterial = registerLookdevMaterial("ball", new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03, vertexColors: true }));
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
  durationMs?: number;
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
    opacity: 0.86,
    scale: [1.35, 1.02, 2.85],
    ballPulse: 0.72,
    cameraImpulse: 0.52,
    durationMs: 520
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

const CELEBRATION_TELEGRAPH: Record<CelebrationKind, {
  color: number;
  glow: number;
  burst: number;
  cameraImpulse: number;
}> = {
  celebrate1: {
    color: 0xfff16a,
    glow: 0.74,
    burst: 1,
    cameraImpulse: 0.28
  },
  celebrate2: {
    color: 0x58ffd1,
    glow: 0.66,
    burst: 1.16,
    cameraImpulse: 0.34
  },
  celebrate3: {
    color: 0xff79c8,
    glow: 0.7,
    burst: 0.92,
    cameraImpulse: 0.24
  }
};

type LocalPlayerProfile = PlayerProfileSnapshot;

const PROFILE_STORAGE_KEY = "unsoccer.profile.v1";
const BROWSER_FINGERPRINT_STORAGE_KEY = "unsoccer.browserFingerprint.v1";
const EMOTION_WHEEL_IDLE_MS = 2000;
const APPLIED_EMOTION_FALLBACK_MS = 4200;
const APPLIED_EMOTION_LABEL_SCALE = 1.44;
const APPLIED_EMOTION_LABEL_Y = 3.08;

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
let lastSeenCelebrationAt = 0;
let ballPulse = 0;
let cameraImpulse = 0;
const handStrikeUntilByPlayerId = new Map<string, number>();
let localHandStrikeSide: "left" | "right" = "right";
let nextLocalHandStrikeSide: "left" | "right" = "right";
let leftKickChargeStartedAt = 0;
let leftKickChargingPointerId: number | null = null;
let leftKickChargingByPointer = false;
let rightKickChargeStartedAt = 0;
let rightKickChargingPointerId: number | null = null;
let rightKickChargingByPointer = false;
let lastFrameSeconds = 0;
let lastRenderFrameAt = 0;
let interpolationAlpha = 1;
let interpolationRenderAgeMs = 0;
let qaDayCycleSeconds: number | null = readQaDayCycleSeconds();
const audio = new UnSoccerAudio();
const LOCAL_HAND_STRIKE_DURATION_MS = 900;
const playerOffscreenIndicators = new Map<string, HTMLElement>();
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
let localPredictionPlayerId: string | null = null;
let localPredictionUpdatedAt = 0;
let localPredictionAxis = { x: 0, z: 0 };
let localPredictionVelocity = { x: 0, y: 0, z: 0 };
let localPredictionMoveSpeed = 0;
let localPredictionMoveAxisMagnitude = 0;
let settings: UnSoccerSettings = loadSettings();
let activeSettingsTab: SettingsTab = "controls";
let settingsOpen = false;
let pendingRebindAction: InputAction | null = null;
let latestSnapshotReceivedAt = 0;
let localProfile: LocalPlayerProfile = loadLocalProfile();
const localBrowserFingerprint = loadBrowserFingerprint();
let profileSendTimer = 0;
let emotionWheelOpen = false;
let emotionWheelSelectedIndex = 0;
let emotionWheelCloseTimer = 0;
const pressedCodes = new Set<string>();
const eventFeedMessages: string[] = [];
type ControlHintId = "move" | "leftKick" | "rightKick" | "headHit" | "jump" | "sprint" | "menu";
const usedControlHints = new Set<ControlHintId>();
type MobileDirection = "up" | "down" | "left" | "right";
type MobileAction = "sprint" | "jump" | "leftKick" | "rightKick" | "headHit";
const mobileDirectionPointers = new Map<number, MobileDirection>();
const mobileActionPointers = new Map<number, MobileAction>();
const mobileMoveVector = { x: 0, y: 0, strength: 0 };
let mobileMovePointerId: number | null = null;
const MOBILE_MOVE_DEAD_ZONE = 0.18;
const MOBILE_DIRECTION_ACTIONS: Record<MobileDirection, InputAction> = {
  up: "moveForward",
  down: "moveBack",
  left: "moveLeft",
  right: "moveRight"
};
const mobilePointerMedia = matchMedia("(pointer: coarse)");
const mobileWidthMedia = matchMedia("(max-width: 840px)");
const forceMobileControls = new URLSearchParams(location.search).get("mobileControls") === "1";

function inputEl(selector: string): HTMLInputElement {
  return requireElement<HTMLInputElement>(selector);
}

function selectEl(selector: string): HTMLSelectElement {
  return requireElement<HTMLSelectElement>(selector);
}

function rosterSkinFallback(): string {
  return CHARACTER_ROSTER[0] || "6299851";
}

function defaultUserPic(): string {
  return DEFAULT_USER_PICS[Math.floor(Math.random() * DEFAULT_USER_PICS.length)] || DEFAULT_USER_PICS[0] || "⚽";
}

function sanitizeLocalName(value: string): string {
  const clean = value.replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 18);
  return clean ? localizeGeneratedPlayerName(clean) : generatedPlayerName();
}

function sanitizeLocalUserPic(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 96);
  return clean || defaultUserPic();
}

function sanitizeLocalSkin(value: string): string {
  return (CHARACTER_ROSTER as readonly string[]).includes(value) ? value : rosterSkinFallback();
}

function migrateStoredSkin(value: string | undefined, hasExplicitSkin: boolean): string {
  if (!hasExplicitSkin && value === "6299851") return rosterSkinFallback();
  return sanitizeLocalSkin(value || "");
}

function randomFingerprintSeed(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some((byte) => byte !== 0)) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

function fingerprintHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function browserFingerprintFacts(): string {
  const nav = navigator;
  const screenInfo = typeof screen === "undefined"
    ? "noscreen"
    : `${screen.width}x${screen.height}x${screen.colorDepth}:${devicePixelRatio.toFixed(2)}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "tz";
  return [
    nav.userAgent,
    nav.language,
    nav.platform,
    String(nav.hardwareConcurrency || 0),
    String((nav as Navigator & { deviceMemory?: number }).deviceMemory || 0),
    screenInfo,
    timezone
  ].join("|");
}

function loadBrowserFingerprint(): string {
  const facts = browserFingerprintFacts();
  try {
    let seed = localStorage.getItem(BROWSER_FINGERPRINT_STORAGE_KEY) || "";
    if (!/^[a-z0-9]{16,64}$/i.test(seed)) {
      seed = randomFingerprintSeed();
      localStorage.setItem(BROWSER_FINGERPRINT_STORAGE_KEY, seed);
    }
    return `ufp:${fingerprintHash(`${seed}|${facts}`)}:${seed.slice(0, 16)}`;
  } catch (_) {
    return `ufp:${fingerprintHash(facts)}:volatile`;
  }
}

function loadLocalProfile(): LocalPlayerProfile {
  const query = new URLSearchParams(location.search);
  const explicitSkin = query.get("skin") || query.get("skinId");
  const fallback: LocalPlayerProfile = {
    nickname: sanitizeLocalName(query.get("name") || ""),
    skinId: sanitizeLocalSkin(explicitSkin || ""),
    userPic: sanitizeLocalUserPic(query.get("user_pic") || query.get("userPic") || "")
  };
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null") as Partial<LocalPlayerProfile> | null;
    if (!stored) return fallback;
    return {
      nickname: sanitizeLocalName(query.get("name") || stored.nickname || fallback.nickname),
      skinId: explicitSkin ? sanitizeLocalSkin(explicitSkin) : migrateStoredSkin(stored.skinId || fallback.skinId, false),
      userPic: sanitizeLocalUserPic(query.get("user_pic") || query.get("userPic") || stored.userPic || fallback.userPic)
    };
  } catch (_) {
    return fallback;
  }
}

function saveLocalProfile(): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(localProfile));
}

function skinLabel(id: string, index: number): string {
  return t("profile.skinLabel", { index: index + 1, id: id.slice(0, 8) });
}

function syncProfileUi(): void {
  localProfile.nickname = localizeGeneratedPlayerName(localProfile.nickname);
  profileNameInput.value = localProfile.nickname;
  profileSkinSelect.value = localProfile.skinId;
  profilePicInput.value = localProfile.userPic;
  profileAvatarEl.textContent = isImageUserPic(localProfile.userPic) ? "" : localProfile.userPic;
  profileAvatarEl.style.backgroundImage = isImageUserPic(localProfile.userPic) ? `url("${cssUrl(localProfile.userPic)}")` : "";
  document.documentElement.dataset.localProfileName = localProfile.nickname;
  document.documentElement.dataset.localProfileSkin = localProfile.skinId;
  document.documentElement.dataset.localUserPic = localProfile.userPic;
  document.documentElement.dataset.localFingerprint = localBrowserFingerprint;
}

function readProfileUi(): boolean {
  const next: LocalPlayerProfile = {
    nickname: sanitizeLocalName(profileNameInput.value),
    skinId: sanitizeLocalSkin(profileSkinSelect.value),
    userPic: sanitizeLocalUserPic(profilePicInput.value)
  };
  const changed = next.nickname !== localProfile.nickname || next.skinId !== localProfile.skinId || next.userPic !== localProfile.userPic;
  localProfile = next;
  saveLocalProfile();
  syncProfileUi();
  return changed;
}

function profilePayload(): LocalPlayerProfile {
  return { ...localProfile, nickname: localizeGeneratedPlayerName(localProfile.nickname) };
}

function joinRequestPayload(name = localProfile.nickname) {
  const localizedName = localizeGeneratedPlayerName(name);
  return {
    name: localizedName,
    clientFingerprint: localBrowserFingerprint,
    profile: { ...profilePayload(), nickname: localizedName }
  };
}

function isImageUserPic(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function cssUrl(value: string): string {
  return value.replace(/["\\\n\r]/g, "");
}

function renderUserPicMarkup(value: string, className = "chat-avatar"): string {
  if (isImageUserPic(value)) return `<span class="${className} image" style="background-image:url('${escapeHtml(cssUrl(value))}')"></span>`;
  return `<span class="${className}">${escapeHtml(value || "⚽")}</span>`;
}

function initializeProfileControls(): void {
  profileSkinSelect.innerHTML = CHARACTER_ROSTER
    .map((id, index) => `<option value="${escapeHtml(id)}">${escapeHtml(skinLabel(id, index))}</option>`)
    .join("");
  syncProfileUi();
  renderEmotionWheel();
  updateChatUi(latestState);
}

function scheduleProfileSend(): void {
  window.clearTimeout(profileSendTimer);
  profileSendTimer = window.setTimeout(() => sendProfileUpdate(), 240);
}

function selectedEmotionId(): EmotionId {
  return EMOTION_CHOICES[emotionWheelSelectedIndex]?.id || EMOTION_CHOICES[0]?.id || "angry";
}

function renderEmotionWheel(): void {
  emotionWheelEl.innerHTML = EMOTION_CHOICES.map((choice, index) => {
    const selected = index === emotionWheelSelectedIndex ? " selected" : "";
    const angle = (index / EMOTION_CHOICES.length) * 360 - 90;
    const label = emotionLabel(choice.id);
    return (
      `<button type="button" class="emotion-choice${selected}" data-emotion="${escapeHtml(choice.id)}" ` +
      `style="--emotion-angle:${angle}deg" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
      `${escapeHtml(choice.emoji)}</button>`
    );
  }).join("");
  emotionWheelEl.dataset.selectedEmotion = selectedEmotionId();
  document.documentElement.dataset.emotionWheelSelected = selectedEmotionId();
}

function openOrCycleEmotionWheel(deltaY: number): void {
  if (settingsOpen || isTextInputActive()) return;
  const direction = deltaY > 0 ? 1 : -1;
  if (emotionWheelOpen) {
    emotionWheelSelectedIndex = (emotionWheelSelectedIndex + direction + EMOTION_CHOICES.length) % EMOTION_CHOICES.length;
  }
  emotionWheelOpen = true;
  renderEmotionWheel();
  positionEmotionWheel();
  emotionWheelEl.hidden = false;
  emotionWheelEl.dataset.open = "true";
  document.documentElement.dataset.emotionWheelOpen = "true";
  window.clearTimeout(emotionWheelCloseTimer);
  emotionWheelCloseTimer = window.setTimeout(closeEmotionWheel, EMOTION_WHEEL_IDLE_MS);
}

function closeEmotionWheel(): void {
  emotionWheelOpen = false;
  emotionWheelEl.hidden = true;
  emotionWheelEl.dataset.open = "false";
  document.documentElement.dataset.emotionWheelOpen = "false";
}

function applySelectedEmotion(): void {
  if (!emotionWheelOpen) return;
  const id = selectedEmotionId();
  closeEmotionWheel();
  sendEmotion(id);
  document.documentElement.dataset.lastEmotionApplied = id;
}

function positionEmotionWheel(): void {
  if (!emotionWheelOpen) return;
  const state = renderedState ?? latestState;
  const localPlayer = localJoin && state
    ? state.players.find((player) => player.id === localJoin?.id && player.role === "player")
    : null;
  if (!localPlayer) {
    emotionWheelEl.style.left = "50%";
    emotionWheelEl.style.top = "44%";
    return;
  }
  const projected = new THREE.Vector3(localPlayer.position.x, localPlayer.position.y + 1.58, localPlayer.position.z);
  projected.project(camera);
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  emotionWheelEl.style.left = `${Math.round(THREE.MathUtils.clamp(x, 88, window.innerWidth - 88))}px`;
  emotionWheelEl.style.top = `${Math.round(THREE.MathUtils.clamp(y, 88, window.innerHeight - 150))}px`;
}

function isTextInputActive(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

function isChatFocused(): boolean {
  return chatPanelEl.contains(document.activeElement);
}

function openChat(): void {
  chatPanelEl.classList.add("active");
  chatInputEl.focus();
  chatInputEl.select();
  pressedCodes.clear();
  clearMobileControls();
  updateResolvedInput();
  sendInput(true);
  document.documentElement.dataset.chatActive = "true";
}

function closeChat(): void {
  chatInputEl.blur();
  chatPanelEl.classList.remove("active");
  document.documentElement.dataset.chatActive = "false";
}

function submitChat(): void {
  const text = chatInputEl.value.trim();
  if (text) sendChatMessage(text);
  chatInputEl.value = "";
  closeChat();
}

function updateChatUi(state: ServerState | null): void {
  const messages = state?.chatMessages || [];
  chatLogEl.innerHTML = messages.slice(-6).map((message) => (
    `<div class="chat-line" data-player-id="${escapeHtml(message.playerId)}">` +
    `${renderUserPicMarkup(message.userPic)}` +
    `<span><strong>${escapeHtml(displayPlayerName(message.name))}</strong>${escapeHtml(message.text)}</span>` +
    `</div>`
  )).join("");
  chatPanelEl.dataset.messages = String(messages.length);
  chatPanelEl.dataset.transport = transportMode;
  document.documentElement.dataset.chatMessages = String(messages.length);
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

function triggerLocalHandStrikePreview(): void {
  if (!localJoin) return;
  localHandStrikeSide = nextLocalHandStrikeSide;
  nextLocalHandStrikeSide = nextLocalHandStrikeSide === "right" ? "left" : "right";
  handStrikeUntilByPlayerId.set(localJoin.id, performance.now() + LOCAL_HAND_STRIKE_DURATION_MS);
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
      rig: document.documentElement.dataset.playerRig || "",
      darkHours: document.documentElement.dataset.darkHours || "",
      twilightHours: document.documentElement.dataset.twilightHours || "",
      stadiumLights: document.documentElement.dataset.stadiumLights || "0",
      stadiumLightsOn: document.documentElement.dataset.stadiumLightsOn || "0",
      stadiumLightPower: document.documentElement.dataset.stadiumLightPower || "0",
      stadiumLightCones: document.documentElement.dataset.stadiumLightCones || "0",
      stadiumLightBeamAngle: document.documentElement.dataset.stadiumLightBeamAngle || "0",
      stadiumLightBeamRadius: document.documentElement.dataset.stadiumLightBeamRadius || "0",
      stadiumLightFlicker: document.documentElement.dataset.stadiumLightFlicker || "0",
      stadiumLightPalette: document.documentElement.dataset.stadiumLightPalette || "",
      nightLighting: document.documentElement.dataset.nightLighting || ""
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

function inputActionLabel(action: InputAction): string {
  return actionLabel(action);
}

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
    button.innerHTML = `<span>${escapeHtml(inputActionLabel(action))}</span><strong>${escapeHtml(formatBinding(codeForAction(settings.controls, action)))}</strong>`;
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
  settingsSaveStateEl.textContent = saveSettings(settings) ? t("settings.saved") : t("settings.notSaved");
  applySettingsToRuntime();
  syncSettingsUi();
}

function applySettingsToRuntime(): void {
  const maxDpr: Record<QualityPreset, number> = { low: 1, balanced: 1.5, high: 2 };
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, maxDpr[settings.graphics.qualityPreset]) * settings.graphics.resolutionScale));
  const visual = (renderedState ?? latestState)?.settings?.visual ?? DEFAULT_VISUAL_SETTINGS;
  renderer.shadowMap.enabled = settings.graphics.shadows && visual.renderer.shadows;
  sun.castShadow = renderer.shadowMap.enabled;
  for (const flood of floodLights) flood.castShadow = renderer.shadowMap.enabled;
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
  updateMuteButtonIcon();
  updateControlHints();
  updatePlayerChip();
  resize();
}

function updateMuteButtonIcon(): void {
  muteButton.innerHTML = settings.audio.muted ? AUDIO_OFF_ICON : AUDIO_ON_ICON;
  muteButton.title = settings.audio.muted ? "Включить звук" : "Выключить звук";
  muteButton.setAttribute("aria-label", muteButton.title);
}

function setSettingsOpen(open: boolean): void {
  settingsOpen = open;
  settingsPanel.hidden = !open;
  document.documentElement.dataset.settingsOpen = String(open);
  if (open) {
    pressedCodes.clear();
    clearMobileControls();
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
    ? t("settings.rebindPending", { action: inputActionLabel(pendingRebindAction) })
    : conflicts.length ? t("settings.conflicts", { codes: conflicts.map((item) => item.code).join(", ") }) : t("settings.rebindDuplicate");
  const audioState = audio.snapshot();
  audioStateEl.textContent = `Audio: ${audioState.contextState}, unlocked=${audioState.unlocked}`;
  graphicsStateEl.textContent = `IBL=${document.documentElement.dataset.ibl || "procedural-sky"} / sun=${document.documentElement.dataset.visibleSun || "true"} / day=${document.documentElement.dataset.dayCycleSeconds || "0"}s`;
  networkStateEl.textContent = `Transport=${transportMode}, snapshot=${latestSnapshotReceivedAt ? Math.round(performance.now() - latestSnapshotReceivedAt) : "--"}ms`;
}

function updateControlHints(): void {
  const move = `${formatBinding(codeForAction(settings.controls, "moveForward"))}/${formatBinding(codeForAction(settings.controls, "moveLeft"))}/${formatBinding(codeForAction(settings.controls, "moveBack"))}/${formatBinding(codeForAction(settings.controls, "moveRight"))}`;
  const hints: Array<[ControlHintId, string]> = [
    ["move", t("control.move", { binding: move })],
    ["leftKick", `${actionLabel("leftKick")} ${formatBinding(codeForAction(settings.controls, "leftKick"))}`],
    ["rightKick", `${actionLabel("rightKick")} ${formatBinding(codeForAction(settings.controls, "rightKick"))}`],
    ["headHit", t("control.head", { binding: formatBinding(codeForAction(settings.controls, "headHit")) })],
    ["jump", `${actionLabel("jump")} ${formatBinding(codeForAction(settings.controls, "jump"))}`],
    ["sprint", `${actionLabel("sprint")} ${formatBinding(codeForAction(settings.controls, "sprint"))}`],
    ["menu", t("control.menu", { binding: formatBinding(codeForAction(settings.controls, "settings")) })]
  ];
  const visibleHints = hints.filter(([id]) => !usedControlHints.has(id));
  controlHintsEl.hidden = visibleHints.length === 0;
  controlHintsEl.innerHTML = visibleHints
    .map(([id, label]) => `<span data-control-hint="${id}">${escapeHtml(label)}</span>`)
    .join("");
  document.documentElement.dataset.controlHintsUsed = [...usedControlHints].sort().join(",");
  document.documentElement.dataset.controlHintsRemaining = visibleHints.map(([id]) => id).join(",");
}

function markControlHintsUsed(...ids: ControlHintId[]): void {
  let changed = false;
  for (const id of ids) {
    if (usedControlHints.has(id)) continue;
    usedControlHints.add(id);
    changed = true;
  }
  if (changed) updateControlHints();
}

function markInputActionHintUsed(action: InputAction): void {
  if (action === "moveForward" || action === "moveBack" || action === "moveLeft" || action === "moveRight") markControlHintsUsed("move");
  else if (action === "leftKick") markControlHintsUsed("leftKick");
  else if (action === "rightKick") markControlHintsUsed("rightKick");
  else if (action === "headHit") markControlHintsUsed("headHit");
  else if (action === "jump") markControlHintsUsed("jump");
  else if (action === "sprint") markControlHintsUsed("sprint");
  else if (action === "settings") markControlHintsUsed("menu");
}

function markHintsForPressedCodes(codes: Set<string>): void {
  for (const action of ["moveForward", "moveBack", "moveLeft", "moveRight", "leftKick", "rightKick", "headHit", "jump", "sprint", "settings"] as InputAction[]) {
    if (actionPressed(settings.controls, action, codes)) markInputActionHintUsed(action);
  }
}

type StaminaUiState = "hidden" | "ready" | "recovering" | "low" | "sprint" | "exhausted";

function updatePlayerChip(state: ServerState | null = renderedState ?? latestState): void {
  playerRoleEl.textContent = connected ? (localJoin?.role === "player" ? t("player.role.player") : t("player.role.spectator")) : t("player.role.connecting");
  playerTeamEl.textContent = localJoin ? teamNameLabel(localJoin.team) : teamLabel(null, true);
  playerInputModeEl.textContent = settings.controls.movementMode === "team-goal" ? "Team-goal" : settings.controls.movementMode === "camera" ? "Camera" : "Screen";
  updateStaminaHud(findLocalPlayer(state));
}

function findLocalPlayer(state: ServerState | null | undefined): PlayerSnapshot | null {
  if (!state || !localJoin || localJoin.role !== "player") return null;
  const localId = localJoin.id;
  return state.players.find((player) => player.id === localId && player.role === "player") ?? null;
}

function updateStaminaHud(player: PlayerSnapshot | null): void {
  if (!player) {
    staminaMeterEl.dataset.state = "hidden";
    staminaMeterEl.setAttribute("aria-valuenow", "0");
    staminaMeterEl.style.setProperty("--stamina-pct", "0%");
    staminaFillEl.style.setProperty("--stamina-pct", "0%");
    staminaValueEl.textContent = "--";
    staminaStateEl.textContent = t("stamina.waiting");
    document.documentElement.dataset.localStamina = "";
    document.documentElement.dataset.localStaminaState = "hidden";
    document.documentElement.dataset.localStaminaSprinting = "false";
    document.documentElement.dataset.localStaminaExhausted = "false";
    return;
  }

  const serverState = renderedState ?? latestState;
  const maxStamina = Math.max(1, serverState?.settings?.playerStaminaMax ?? PLAYER_STAMINA_MAX);
  const stamina = THREE.MathUtils.clamp(player.stamina, 0, maxStamina);
  const staminaPercent = Math.round(stamina / maxStamina * 100);
  const uiState = staminaUiState(player, staminaPercent);
  staminaMeterEl.dataset.state = uiState;
  staminaMeterEl.setAttribute("aria-valuenow", String(staminaPercent));
  staminaMeterEl.style.setProperty("--stamina-pct", `${staminaPercent}%`);
  staminaFillEl.style.setProperty("--stamina-pct", `${staminaPercent}%`);
  staminaValueEl.textContent = `${staminaPercent}%`;
  staminaStateEl.textContent = staminaUiLabel(uiState);
  document.documentElement.dataset.localStamina = String(staminaPercent);
  document.documentElement.dataset.localStaminaState = uiState;
  document.documentElement.dataset.localStaminaSprinting = String(player.sprinting);
  document.documentElement.dataset.localStaminaExhausted = String(player.exhausted);
}

function staminaUiState(player: PlayerSnapshot, staminaPercent: number): StaminaUiState {
  if (player.exhausted || staminaPercent <= 0) return "exhausted";
  if (player.sprinting) return "sprint";
  if (staminaPercent < 25) return "low";
  if (staminaPercent < 95) return "recovering";
  return "ready";
}

function staminaUiLabel(state: StaminaUiState): string {
  return staminaLabel(state);
}

function updateNetworkHud(now = performance.now()): void {
  transportStatusEl.textContent = transportMode === "none" ? "offline" : transportMode;
  const serverLag = latestState ? Math.max(0, Date.now() - latestState.serverTime) : null;
  pingStatusEl.textContent = serverLag === null ? "-- ms" : `${Math.min(serverLag, 9999)} ms`;
  snapshotAgeEl.textContent = latestSnapshotReceivedAt ? `${Math.round(now - latestSnapshotReceivedAt)} ms` : t("network.snapshot");
  if (settingsOpen) syncSettingsNotes();
}

function pushEventFeed(message: string): void {
  if (!message || eventFeedMessages[0] === message) return;
  eventFeedMessages.unshift(message);
  eventFeedMessages.splice(4);
  eventFeedEl.innerHTML = eventFeedMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function mergedPressedCodes(): Set<string> {
  const codes = new Set(pressedCodes);
  for (const direction of activeMobileDirections()) {
    const code = codeForAction(settings.controls, MOBILE_DIRECTION_ACTIONS[direction]);
    if (code) codes.add(code);
  }
  if ([...mobileActionPointers.values()].includes("sprint")) {
    const code = codeForAction(settings.controls, "sprint");
    if (code) codes.add(code);
  }
  return codes;
}

function activeMobileDirections(): MobileDirection[] {
  const directions = [...mobileDirectionPointers.values()];
  if (mobileMoveVector.strength > MOBILE_MOVE_DEAD_ZONE) {
    if (mobileMoveVector.y < -MOBILE_MOVE_DEAD_ZONE) directions.push("up");
    if (mobileMoveVector.y > MOBILE_MOVE_DEAD_ZONE) directions.push("down");
    if (mobileMoveVector.x < -MOBILE_MOVE_DEAD_ZONE) directions.push("left");
    if (mobileMoveVector.x > MOBILE_MOVE_DEAD_ZONE) directions.push("right");
  }
  return directions;
}

function updateMobileMoveVector(event: PointerEvent): void {
  const rect = mobileMovePadEl.getBoundingClientRect();
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;
  const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.43);
  const rawX = (event.clientX - centerX) / radius;
  const rawY = (event.clientY - centerY) / radius;
  const length = Math.hypot(rawX, rawY);
  const clamped = Math.min(1, length);
  mobileMoveVector.x = length > 0 ? (rawX / length) * clamped : 0;
  mobileMoveVector.y = length > 0 ? (rawY / length) * clamped : 0;
  mobileMoveVector.strength = clamped;
}

function resetMobileMoveVector(): void {
  mobileMovePointerId = null;
  mobileMoveVector.x = 0;
  mobileMoveVector.y = 0;
  mobileMoveVector.strength = 0;
}

function syncInputTestPad(activeCodes = mergedPressedCodes()): void {
  for (const item of document.querySelectorAll<HTMLElement>("[data-pad]")) {
    item.classList.toggle("is-active", actionPressed(settings.controls, item.dataset.pad as InputAction, activeCodes));
  }
}

function leftKickChargeFraction(now = performance.now()): number {
  if (!leftKickChargingByPointer || leftKickChargeStartedAt <= 0) return 0;
  return THREE.MathUtils.clamp((now - leftKickChargeStartedAt) / (LEFT_KICK_CHARGE_SECONDS * 1000), 0, 1);
}

function rightKickChargeFraction(now = performance.now()): number {
  if (!rightKickChargingByPointer || rightKickChargeStartedAt <= 0) return 0;
  return THREE.MathUtils.clamp((now - rightKickChargeStartedAt) / (LEFT_KICK_CHARGE_SECONDS * 1000), 0, 1);
}

function syncLeftKickChargeInput(now = performance.now()): void {
  if (!leftKickChargingByPointer) {
    input.kickLeftHeld = false;
    return;
  }
  input.kickLeftHeld = true;
  input.kickLeftCharge = leftKickChargeFraction(now);
}

function syncRightKickChargeInput(now = performance.now()): void {
  if (!rightKickChargingByPointer) {
    input.kickRightHeld = false;
    return;
  }
  input.kickRightHeld = true;
  input.kickRightCharge = rightKickChargeFraction(now);
}

function syncLeftKickChargeDataset(now = performance.now()): void {
  const leftCharge = leftKickChargingByPointer ? leftKickChargeFraction(now) : 0;
  const rightCharge = rightKickChargingByPointer ? rightKickChargeFraction(now) : 0;
  const charge = Math.max(leftCharge, rightCharge);
  document.documentElement.dataset.localKickCharge = charge.toFixed(3);
  document.documentElement.dataset.localKickChargeHeld = String(leftKickChargingByPointer || rightKickChargingByPointer);
  document.documentElement.dataset.localKickChargeKind = rightKickChargingByPointer ? "right" : leftKickChargingByPointer ? "left" : "none";
}

function beginLeftKickCharge(pointerId: number): void {
  leftKickChargingByPointer = true;
  leftKickChargingPointerId = pointerId;
  leftKickChargeStartedAt = performance.now();
  input.kickLeftHeld = true;
  input.kickLeftCharge = 0;
  syncLeftKickChargeDataset(leftKickChargeStartedAt);
}

function releaseLeftKickCharge(pointerId: number | null): boolean {
  if (!leftKickChargingByPointer) return false;
  if (pointerId !== null && leftKickChargingPointerId !== null && pointerId !== leftKickChargingPointerId) return false;
  const now = performance.now();
  input.kickLeftCharge = leftKickChargeFraction(now);
  input.kickLeftHeld = false;
  input.kickLeft += 1;
  leftKickChargingByPointer = false;
  leftKickChargingPointerId = null;
  leftKickChargeStartedAt = 0;
  syncLeftKickChargeDataset(now);
  return true;
}

function beginRightKickCharge(pointerId: number): void {
  rightKickChargingByPointer = true;
  rightKickChargingPointerId = pointerId;
  rightKickChargeStartedAt = performance.now();
  input.kickRightHeld = true;
  input.kickRightCharge = 0;
  syncLeftKickChargeDataset(rightKickChargeStartedAt);
}

function releaseRightKickCharge(pointerId: number | null): boolean {
  if (!rightKickChargingByPointer) return false;
  if (pointerId !== null && rightKickChargingPointerId !== null && pointerId !== rightKickChargingPointerId) return false;
  const now = performance.now();
  input.kickRightCharge = rightKickChargeFraction(now);
  input.kickRightHeld = false;
  input.kickRight += 1;
  rightKickChargingByPointer = false;
  rightKickChargingPointerId = null;
  rightKickChargeStartedAt = 0;
  triggerLocalHandStrikePreview();
  syncLeftKickChargeDataset(now);
  return true;
}

function cancelLeftKickCharge(): void {
  leftKickChargingByPointer = false;
  leftKickChargingPointerId = null;
  leftKickChargeStartedAt = 0;
  input.kickLeftHeld = false;
  syncLeftKickChargeDataset();
}

function cancelRightKickCharge(): void {
  rightKickChargingByPointer = false;
  rightKickChargingPointerId = null;
  rightKickChargeStartedAt = 0;
  input.kickRightHeld = false;
  syncLeftKickChargeDataset();
}

function syncMobileControlsUi(): void {
  const enabled = forceMobileControls || mobilePointerMedia.matches || mobileWidthMedia.matches;
  const portrait = window.innerHeight >= window.innerWidth;
  const activeDirections = activeMobileDirections();
  const activeDirectionSet = new Set(activeDirections);
  mobileControlsEl.hidden = !enabled;
  document.documentElement.dataset.mobileControls = String(enabled);
  document.documentElement.dataset.mobileControlsForce = String(forceMobileControls);
  document.documentElement.dataset.mobileControlsPortrait = String(portrait);
  document.documentElement.dataset.mobileDirections = [...new Set(activeDirections)].sort().join(",");
  document.documentElement.dataset.mobileActions = [...new Set(mobileActionPointers.values())].sort().join(",");
  document.documentElement.dataset.mobileMoveX = mobileMoveVector.x.toFixed(3);
  document.documentElement.dataset.mobileMoveY = mobileMoveVector.y.toFixed(3);
  document.documentElement.dataset.mobileMoveStrength = mobileMoveVector.strength.toFixed(3);
  if (activeDirections.length > 0) {
    markControlHintsUsed("move");
    document.documentElement.dataset.mobileLastDirections = [...new Set(activeDirections)].sort().join(",");
    document.documentElement.dataset.mobileLastMoveStrength = mobileMoveVector.strength.toFixed(3);
  }
  mobileMovePadEl.dataset.active = String(mobileMoveVector.strength > MOBILE_MOVE_DEAD_ZONE);
  mobileMovePadEl.style.setProperty("--mobile-stick-x", `${(mobileMoveVector.x * 18).toFixed(1)}px`);
  mobileMovePadEl.style.setProperty("--mobile-stick-y", `${(mobileMoveVector.y * 18).toFixed(1)}px`);
  for (const button of mobileControlsEl.querySelectorAll<HTMLButtonElement>("[data-mobile-dir]")) {
    const direction = button.dataset.mobileDir as MobileDirection;
    button.classList.toggle("is-active", activeDirectionSet.has(direction));
  }
  for (const button of mobileControlsEl.querySelectorAll<HTMLButtonElement>("[data-mobile-action]")) {
    const action = button.dataset.mobileAction as MobileAction;
    button.classList.toggle("is-active", [...mobileActionPointers.values()].includes(action));
  }
}

function updateResolvedInput(): void {
  const activeCodes = mergedPressedCodes();
  input = resolveMovementInput(settings.controls, activeCodes, localJoin?.team ?? null, input);
  syncLeftKickChargeInput();
  syncRightKickChargeInput();
  syncInputTestPad(activeCodes);
  document.documentElement.dataset.resolvedInputDirections = [
    input.up ? "up" : "",
    input.down ? "down" : "",
    input.left ? "left" : "",
    input.right ? "right" : ""
  ].filter(Boolean).join(",");
  document.documentElement.dataset.resolvedInputSprint = String(input.sprint);
  document.documentElement.dataset.resolvedInputActions = [
    `left:${input.kickLeft}`,
    `right:${input.kickRight}`,
    `head:${input.head}`,
    `jump:${input.jump}`,
    `held:${input.kickLeftHeld}`,
    `charge:${input.kickLeftCharge.toFixed(3)}`,
    `rightHeld:${input.kickRightHeld}`,
    `rightCharge:${input.kickRightCharge.toFixed(3)}`
  ].join(",");
  syncMobileControlsUi();
}

function formatBinding(code: string): string {
  return code
    ? code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace("Arrow", "")
      .replace("Mouse0", "LMB")
      .replace("Mouse1", "MMB")
      .replace("Mouse2", "RMB")
      .replace("ShiftLeft", "Shift")
      .replace("ShiftRight", "Shift")
      .replace("Space", "Space")
    : "--";
}

function resetCamera(): void {
  cameraImpulse = 0;
  cameraFollowInitialized = false;
  cameraAnchorId = null;
  cameraSmoothedAnchor.set(0, 1.0, 0);
  cameraPreviousSmoothedAnchor.copy(cameraSmoothedAnchor);
  cameraMeasuredVelocity.set(0, 0, 0);
  cameraSmoothedVelocity.set(0, 0, 0);
  cameraSmoothedLead.set(0, 0, 0);
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

let free3dCharacterAttachCount = 0;
let free3dCharacterHydrated = false;

function resolveClientAsset(src: string): string {
  return new URL(src.replace(/^\/+/, ""), window.location.href).toString();
}

function countRuntimeTextureMaps(root: THREE.Object3D): number {
  const textures = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "aoMap",
        "emissiveMap",
        "alphaMap",
        "bumpMap",
        "displacementMap",
        "lightMap"
      ] as Array<keyof THREE.MeshStandardMaterial>) {
        const value = (material as unknown as Record<string, unknown>)[key];
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  return textures.size;
}

function prepareFree3dBallScene(model: THREE.Object3D, radius: number): THREE.Object3D {
  if (countRuntimeTextureMaps(model) > 0) {
    throw new Error("Free3D ball asset is not runtime textureless");
  }
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

type GoalNetPanelName = "back" | "roof" | "left-side" | "right-side";

interface GoalNetNode {
  position: THREE.Vector3;
  previous: THREE.Vector3;
  rest: THREE.Vector3;
  fixed: boolean;
}

interface GoalNetPanel {
  name: GoalNetPanelName;
  nodes: GoalNetNode[];
  constraints: Array<{ a: number; b: number; restDistance: number }>;
  segments: Array<[number, number]>;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  widthSegments: number;
  heightSegments: number;
}

class GoalNetVisual {
  static readonly PANEL_COUNT = 4;
  static readonly COVERAGE = "back,roof,left-side,right-side";

  private readonly panels: GoalNetPanel[] = [];
  private readonly topY = 2.2;
  private readonly faceZ: number;
  private readonly backZ: number;

  constructor(private readonly side: -1 | 1, root: THREE.Group) {
    this.faceZ = side * (FIELD_LENGTH / 2);
    this.backZ = side * (FIELD_LENGTH / 2 + GOAL_DEPTH - 0.18);
    this.addPanel(root, "back", 18, 9, (u, v) => new THREE.Vector3(
      -GOAL_WIDTH / 2 + u * GOAL_WIDTH,
      v * this.topY,
      this.backZ
    ));
    this.addPanel(root, "roof", 18, 5, (u, v) => new THREE.Vector3(
      -GOAL_WIDTH / 2 + u * GOAL_WIDTH,
      this.topY,
      this.faceZ + this.side * v * (GOAL_DEPTH - 0.18)
    ));
    this.addPanel(root, "left-side", 7, 9, (u, v) => new THREE.Vector3(
      -GOAL_WIDTH / 2,
      v * this.topY,
      this.faceZ + this.side * u * (GOAL_DEPTH - 0.18)
    ));
    this.addPanel(root, "right-side", 7, 9, (u, v) => new THREE.Vector3(
      GOAL_WIDTH / 2,
      v * this.topY,
      this.faceZ + this.side * u * (GOAL_DEPTH - 0.18)
    ));
  }

  update(state: ServerState, time: number): void {
    const breeze = Math.sin(time * 1.7 + this.side) * 0.004;
    for (const panel of this.panels) {
      for (const node of panel.nodes) {
        if (node.fixed) {
          node.position.copy(node.rest);
          node.previous.copy(node.rest);
          continue;
        }
        const velocity = node.position.clone().sub(node.previous).multiplyScalar(0.965);
        node.previous.copy(node.position);
        node.position.add(velocity);
        node.position.y -= panel.name === "roof" ? 0.006 : 0.012;
        node.position.z += this.side * breeze;
        node.position.lerp(node.rest, 0.026);
      }
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

    for (const panel of this.panels) {
      for (let iteration = 0; iteration < 5; iteration += 1) this.solveConstraints(panel);
      for (const node of panel.nodes) this.clampNode(node);
      this.writeGeometry(panel);
    }
  }

  private addPanel(
    root: THREE.Group,
    name: GoalNetPanelName,
    widthSegments: number,
    heightSegments: number,
    restAt: (u: number, v: number) => THREE.Vector3
  ): void {
    const nodes: GoalNetNode[] = [];
    const constraints: GoalNetPanel["constraints"] = [];
    const segments: GoalNetPanel["segments"] = [];
    const nodeIndex = (column: number, row: number) => row * (widthSegments + 1) + column;
    for (let row = 0; row <= heightSegments; row += 1) {
      for (let column = 0; column <= widthSegments; column += 1) {
        const rest = restAt(column / widthSegments, row / heightSegments);
        nodes.push({
          position: rest.clone(),
          previous: rest.clone(),
          rest,
          fixed: row === 0 || row === heightSegments || column === 0 || column === widthSegments
        });
      }
    }
    const addConstraint = (a: number, b: number) => {
      constraints.push({ a, b, restDistance: nodes[a].rest.distanceTo(nodes[b].rest) });
    };
    for (let row = 0; row <= heightSegments; row += 1) {
      for (let column = 0; column <= widthSegments; column += 1) {
        const index = nodeIndex(column, row);
        if (column < widthSegments) {
          const next = nodeIndex(column + 1, row);
          addConstraint(index, next);
          segments.push([index, next]);
        }
        if (row < heightSegments) {
          const next = nodeIndex(column, row + 1);
          addConstraint(index, next);
          segments.push([index, next]);
        }
      }
    }
    const positions = new Float32Array(segments.length * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xf7ffff, transparent: true, opacity: name === "back" ? 0.5 : 0.42 })
    );
    mesh.name = `visual-cloth-net-${this.side < 0 ? "south" : "north"}-${name}`;
    root.add(mesh);
    const panel: GoalNetPanel = { name, nodes, constraints, segments, geometry, positions, widthSegments, heightSegments };
    this.panels.push(panel);
    this.writeGeometry(panel);
  }

  private applyInfluence(center: THREE.Vector3, radius: number, strength: number): void {
    const minZ = Math.min(this.faceZ, this.backZ) - radius;
    const maxZ = Math.max(this.faceZ, this.backZ) + radius;
    if (
      center.z < minZ
      || center.z > maxZ
      || Math.abs(center.x) > GOAL_WIDTH / 2 + radius + 0.35
      || center.y > this.topY + radius
    ) {
      return;
    }
    for (const panel of this.panels) {
      for (const node of panel.nodes) {
        if (node.fixed) continue;
        const distance = node.position.distanceTo(center);
        if (distance >= radius) continue;
        const normal = node.position.clone().sub(center);
        if (normal.lengthSq() < 0.0001) {
          if (panel.name === "roof") normal.set(0, 1, 0);
          else if (panel.name === "left-side") normal.set(-1, 0, 0);
          else if (panel.name === "right-side") normal.set(1, 0, 0);
          else normal.set(0, 0, this.side);
        }
        normal.normalize();
        const impulse = (radius - distance) * strength * 0.42;
        node.position.addScaledVector(normal, impulse);
      }
    }
  }

  private solveConstraints(panel: GoalNetPanel): void {
    for (const constraint of panel.constraints) {
      const a = panel.nodes[constraint.a];
      const b = panel.nodes[constraint.b];
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

  private clampNode(node: GoalNetNode): void {
    const minZ = Math.min(this.faceZ, this.backZ) - 0.56;
    const maxZ = Math.max(this.faceZ, this.backZ) + 0.56;
    node.position.y = THREE.MathUtils.clamp(node.position.y, 0, 2.36);
    node.position.x = THREE.MathUtils.clamp(node.position.x, -GOAL_WIDTH / 2 - 0.5, GOAL_WIDTH / 2 + 0.5);
    node.position.z = THREE.MathUtils.clamp(node.position.z, minZ, maxZ);
  }

  private writeGeometry(panel: GoalNetPanel): void {
    let offset = 0;
    for (const [a, b] of panel.segments) {
      const first = panel.nodes[a].position;
      const second = panel.nodes[b].position;
      panel.positions[offset] = first.x;
      panel.positions[offset + 1] = first.y;
      panel.positions[offset + 2] = first.z;
      panel.positions[offset + 3] = second.x;
      panel.positions[offset + 4] = second.y;
      panel.positions[offset + 5] = second.z;
      offset += 6;
    }
    panel.geometry.attributes.position.needsUpdate = true;
  }
}

buildField(fieldGroup);
applySettingsToRuntime();
syncSettingsUi();

function buildField(root: THREE.Group) {
  const turf = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH, 0.12, FIELD_LENGTH),
    registerLookdevMaterial("field", new THREE.MeshStandardMaterial({ color: 0x19845f, roughness: 0.9 }))
  );
  turf.position.y = -0.06;
  turf.receiveShadow = true;
  root.add(turf);

  const stripeMaterial = registerLookdevMaterial("fieldStripe", new THREE.MeshStandardMaterial({ color: 0x1d966c, roughness: 0.92 }));
  for (let i = -3; i <= 3; i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH, 0.01, FIELD_LENGTH / 9), stripeMaterial);
    stripe.position.set(0, 0.01, i * FIELD_LENGTH / 7);
    stripe.receiveShadow = true;
    root.add(stripe);
  }

  const lineWidth = 0.095;
  const lineMaterial = registerLookdevMaterial("marking", new THREE.MeshBasicMaterial({ color: 0xf4fff6, transparent: true, opacity: 0.96 }));
  const secondaryLineMaterial = registerLookdevMaterial("markingSecondary", new THREE.MeshBasicMaterial({ color: 0xd9f7e4, transparent: true, opacity: 0.82 }));
  const addLine = (
    width: number,
    depth: number,
    x: number,
    z: number,
    material: THREE.Material = lineMaterial
  ) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, depth), material);
    line.position.set(x, 0.045, z);
    root.add(line);
  };
  const addAreaBox = (areaWidth: number, areaDepth: number, side: -1 | 1, material = lineMaterial) => {
    const frontZ = side * (FIELD_LENGTH / 2 - areaDepth);
    const centerZ = side * (FIELD_LENGTH / 2 - areaDepth / 2);
    addLine(areaWidth, lineWidth, 0, frontZ, material);
    addLine(lineWidth, areaDepth, -areaWidth / 2, centerZ, material);
    addLine(lineWidth, areaDepth, areaWidth / 2, centerZ, material);
  };
  const addCircleLine = (radius: number, x: number, z: number, material = lineMaterial, segments = 96) => {
    const circle = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: segments }, (_, i) => {
          const a = i / segments * Math.PI * 2;
          return new THREE.Vector3(x + Math.cos(a) * radius, 0.071, z + Math.sin(a) * radius);
        })
      ),
      registerLookdevMaterial(material === lineMaterial ? "marking" : "markingSecondary", new THREE.LineBasicMaterial({
        color: material === lineMaterial ? 0xf4fff6 : 0xd9f7e4,
        transparent: true,
        opacity: material === lineMaterial ? 0.96 : 0.82
      }))
    );
    root.add(circle);
  };
  const addFlatDisc = (radius: number, x: number, z: number, material = lineMaterial) => {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), material);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x, 0.058, z);
    root.add(spot);
  };

  addLine(FIELD_WIDTH, lineWidth, 0, 0);
  addLine(lineWidth, FIELD_LENGTH, -FIELD_WIDTH / 2, 0);
  addLine(lineWidth, FIELD_LENGTH, FIELD_WIDTH / 2, 0);
  addLine(FIELD_WIDTH, lineWidth, 0, -FIELD_LENGTH / 2);
  addLine(FIELD_WIDTH, lineWidth, 0, FIELD_LENGTH / 2);

  for (const side of [-1, 1] as const) {
    addAreaBox(28, 13.2, side);
    addAreaBox(16, 5.4, side, secondaryLineMaterial);
    addFlatDisc(0.22, 0, side * (FIELD_LENGTH / 2 - 9.6));
  }
  addCircleLine(7.2, 0, 0);
  addFlatDisc(0.18, 0, 0);
  document.documentElement.dataset.fieldMarkings = "touchlines,halfway,center-circle,penalty-boxes,goal-areas,penalty-spots";

  addGoal(root, -1);
  addGoal(root, 1);
  addStadiumFrame(root);
  buildSidelineBalls(root);
  addMovingCars(root);
}

function addStadiumFrame(root: THREE.Group) {
  const asphaltMaterial = registerLookdevMaterial("courtyard", new THREE.MeshStandardMaterial({ color: 0x36413e, roughness: 0.96 }));
  const courtyard = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH + 20, 0.08, FIELD_LENGTH + 22),
    asphaltMaterial
  );
  courtyard.position.y = -0.13;
  courtyard.receiveShadow = true;
  root.add(courtyard);

  const fenceMaterial = registerLookdevMaterial("fence", new THREE.MeshStandardMaterial({ color: 0x20342e, roughness: 0.72, metalness: 0.16 }));
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

  addCourtyardPavementMarks(root);
  courtyardEnvironmentRuntime = installCourtyardEnvironment({ root, resolveClientAsset });
  document.documentElement.dataset.environmentModels =
    "apartments,trees,pavement,outer-roads,free3d-textureless-instanced-props,local-prop-rigidbodies,floodlight-masts";
  document.documentElement.dataset.environmentPrimitiveSmallPropsRemoved = "parked-cars,benches,playground,kiosk,clotheslines,dense-procedural-dressing";
  addFloodlightMasts(root);
}

function addFloodlightMasts(root: THREE.Group): void {
  const mastMaterial = registerLookdevMaterial("mast", new THREE.MeshStandardMaterial({
    color: 0xaebbc4,
    roughness: 0.36,
    metalness: 0.36
  }));
  for (let index = 0; index < FLOODLIGHT_POINTS.length; index += 1) {
    const point = FLOODLIGHT_POINTS[index];
    const runtime = stadiumFloodlights[index];
    const towardField = new THREE.Vector3(point.targetX - point.x, 0, point.targetZ - point.z).normalize();
    const fixtureYaw = Math.atan2(-towardField.z, towardField.x);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.14, 12.4, 12), mastMaterial);
    mast.position.set(point.x, 6.2, point.z);
    mast.castShadow = true;
    root.add(mast);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.22, 16), mastMaterial);
    base.position.set(point.x, 0.11, point.z);
    base.receiveShadow = true;
    root.add(base);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), runtime.fixtureMaterial);
    crossbar.position.set(point.x + towardField.x * 0.48, 12.3, point.z + towardField.z * 0.48);
    crossbar.rotation.y = fixtureYaw;
    crossbar.castShadow = true;
    root.add(crossbar);

    for (const side of [-1, 1] as const) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.5), runtime.lampMaterial);
      lamp.position.set(
        point.x + towardField.x * 0.86 + towardField.z * side * 0.42,
        12.12,
        point.z + towardField.z * 0.86 - towardField.x * side * 0.42
      );
      lamp.rotation.y = fixtureYaw;
      lamp.castShadow = true;
      root.add(lamp);
    }

    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 1.5), mastMaterial);
    cable.position.set(point.x + towardField.x * 0.36, 11.72, point.z + towardField.z * 0.36);
    cable.rotation.y = fixtureYaw + Math.PI / 2;
    cable.castShadow = true;
    root.add(cable);
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
  const material = registerLookdevMaterial("goalPost", new THREE.MeshStandardMaterial({ color: 0xf0f3ec, roughness: 0.38, metalness: 0.16 }));
  const z = side * (FIELD_LENGTH / 2);
  const postGeometry = new THREE.CylinderGeometry(0.17, 0.19, 2.28, 20);
  const barGeometry = new THREE.CylinderGeometry(0.16, 0.16, GOAL_WIDTH + 0.38, 20);
  const depthBarGeometry = new THREE.CylinderGeometry(0.08, 0.08, GOAL_DEPTH, 14);
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
  const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_WIDTH, 14), material);
  backBar.rotation.z = Math.PI / 2;
  backBar.position.set(0, 0.08, z + side * GOAL_DEPTH);
  root.add(backBar);
  const backTopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_WIDTH, 14), material);
  backTopBar.rotation.z = Math.PI / 2;
  backTopBar.position.set(0, 2.16, z + side * GOAL_DEPTH);
  backTopBar.castShadow = true;
  root.add(backTopBar);
  goalNets.push(new GoalNetVisual(side, root));
  document.documentElement.dataset.goalPostRadius = "0.19";
  document.documentElement.dataset.goalPostMaterial = "neutral-white-metal";
  document.documentElement.dataset.goalNetMode = "local-verlet-closed-goal-cloth-no-network";
  document.documentElement.dataset.goalNetCount = String(goalNets.length);
  document.documentElement.dataset.goalNetPanels = String(goalNets.length * GoalNetVisual.PANEL_COUNT);
  document.documentElement.dataset.goalNetCoverage = GoalNetVisual.COVERAGE;
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
  private readonly emotionLabel: THREE.Sprite;
  private readonly teamHalo: THREE.Mesh;
  private readonly teamHaloMaterial: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly contactFlash: THREE.Mesh;
  private readonly contactFlashMaterial: THREE.MeshBasicMaterial;
  private readonly handStrike: THREE.Mesh;
  private readonly handStrikeMaterial: THREE.MeshBasicMaterial;
  private readonly celebrationAura!: THREE.Mesh;
  private readonly celebrationAuraMaterial!: THREE.MeshBasicMaterial;
  private readonly celebrationBurst!: THREE.Mesh;
  private readonly celebrationBurstMaterial!: THREE.MeshBasicMaterial;
  private lastVisualActionAt = 0;
  private lastVisualActionSeenAt = 0;
  private lastVisualCelebrationAt = 0;
  private lastVisualCelebrationSeenAt = 0;
  private visualHandStrikeSide: "left" | "right" = "right";
  private nextVisualHandStrikeSide: "left" | "right" = "right";
  private labelKey = "";
  private emotionKey = "";
  private readonly currentCharacterId: string;
  private characterController: GameCharacterController | null = null;
  private characterDebug: CharacterControllerDebugSnapshot | null = null;
  private readonly renderPosition = new THREE.Vector3();
  private readonly renderVelocity = new THREE.Vector3();
  private renderYaw = 0;
  private renderInitialized = false;
  private lastRenderUpdateTime = 0;

  constructor(private readonly snapshot: PlayerSnapshot) {
    this.currentCharacterId = snapshot.characterId;
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

    this.teamHaloMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false
    });
    this.teamHalo = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), this.teamHaloMaterial);
    this.teamHalo.rotation.x = -Math.PI / 2;
    this.teamHalo.position.y = 0.034;
    this.root.add(this.teamHalo);

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false
    });
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.045, 10, 40),
      this.ringMaterial
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.052;
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

    this.handStrikeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9d42,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.handStrike = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 30, Math.PI * 1.08), this.handStrikeMaterial);
    this.handStrike.visible = false;
    this.root.add(this.handStrike);

    this.celebrationAuraMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff16a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.celebrationAura = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 8, 48), this.celebrationAuraMaterial);
    this.celebrationAura.rotation.x = Math.PI / 2;
    this.celebrationAura.position.y = 0.08;
    this.celebrationAura.visible = false;
    this.root.add(this.celebrationAura);

    this.celebrationBurstMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff16a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.celebrationBurst = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.032, 8, 42), this.celebrationBurstMaterial);
    this.celebrationBurst.visible = false;
    this.root.add(this.celebrationBurst);

    this.label = makeLabel(playerLabelText(snapshot));
    this.label.position.y = 2.15;
    this.root.add(this.label);
    this.emotionLabel = makeEmotionLabel("");
    this.emotionLabel.position.y = APPLIED_EMOTION_LABEL_Y;
    this.emotionLabel.visible = false;
    this.root.add(this.emotionLabel);
    scene.add(this.root);
    void this.attachCharacterModel();
    this.update(snapshot, 0);
  }

  matchesCharacter(characterId: string): boolean {
    return this.currentCharacterId === characterId;
  }

  debugState() {
    return {
      visible: this.root.visible,
      characterAttached: Boolean(this.characterController),
      rigRagdoll: Boolean(this.characterDebug?.ragdoll),
      rigStrike: this.characterDebug?.strike || "none",
      rigStrikePulse: this.characterDebug?.strikePulse || 0,
      handStrikeVisible: this.handStrike.visible
    };
  }

  private async attachCharacterModel(): Promise<void> {
    const loaded = await loadFree3dCharacter("assets/characters/free3d/roster.json", this.snapshot.characterId);
    if (!loaded || this.characterController) {
      if (!loaded) {
        document.documentElement.dataset.playerRigMode = "procedural-fallback";
        document.documentElement.dataset.playerRigError = "Free3D character failed to load";
      }
      return;
    }
    const controller = new GameCharacterController(loaded, teamColor(this.snapshot.team));
    this.characterRoot.add(controller.root);
    this.characterController = controller;
    this.rig.visible = false;
    this.characterRoot.visible = true;
    free3dCharacterAttachCount += 1;
    free3dCharacterHydrated = true;
    delete document.documentElement.dataset.playerRigError;
    document.documentElement.dataset.playerRig = "free3d-skinned-character-controller";
    document.documentElement.dataset.playerRigAsset = loaded.asset.guid;
    document.documentElement.dataset.playerRigMode = loaded.roster.mode;
    document.documentElement.dataset.playerRigClipCount = String(Object.keys(loaded.clips).length);
    document.documentElement.dataset.playerRigTextures = String(loaded.textureCount);
    document.documentElement.dataset.playerRigTexturelessPbr = String(Boolean(loaded.texturelessPbr?.converted));
    document.documentElement.dataset.playerRigTexturelessStripped = String(loaded.texturelessPbr?.strippedTextureCount ?? 0);
    document.documentElement.dataset.playerRigIk = "procedural-bone-ik-overlay";
    document.documentElement.dataset.playerRigAttached = String(free3dCharacterAttachCount);
  }

  private smoothedSnapshot(snapshot: PlayerSnapshot, time: number): PlayerSnapshot {
    const targetPosition = new THREE.Vector3(
      snapshot.position.x,
      snapshot.position.y - PLAYER_HEIGHT / 2,
      snapshot.position.z
    );
    const snapDistance = this.renderInitialized ? this.renderPosition.distanceTo(targetPosition) : Number.POSITIVE_INFINITY;
    const dt = this.lastRenderUpdateTime > 0 ? Math.min(0.05, Math.max(0.001, time - this.lastRenderUpdateTime)) : 1 / 60;
    this.lastRenderUpdateTime = time;
    if (!this.renderInitialized || snapDistance > PLAYER_SNAP_DISTANCE) {
      this.renderPosition.copy(targetPosition);
      this.renderVelocity.set(snapshot.velocity.x, snapshot.velocity.y, snapshot.velocity.z);
      this.renderYaw = snapshot.yaw;
      this.renderInitialized = true;
    } else {
      const positionAlpha = 1 - Math.exp(-dt * (snapshot.id === localJoin?.id ? 16 : 11));
      const velocityAlpha = 1 - Math.exp(-dt * 7);
      const yawAlpha = 1 - Math.exp(-dt * 10);
      this.renderPosition.lerp(targetPosition, positionAlpha);
      this.renderVelocity.lerp(new THREE.Vector3(snapshot.velocity.x, snapshot.velocity.y, snapshot.velocity.z), velocityAlpha);
      this.renderYaw = lerpAngle(this.renderYaw, snapshot.yaw, yawAlpha);
    }
    return {
      ...snapshot,
      position: {
        x: this.renderPosition.x,
        y: this.renderPosition.y + PLAYER_HEIGHT / 2,
        z: this.renderPosition.z
      },
      velocity: {
        x: this.renderVelocity.x,
        y: this.renderVelocity.y,
        z: this.renderVelocity.z
      },
      yaw: this.renderYaw
    };
  }

  update(snapshot: PlayerSnapshot, time: number) {
    snapshot = this.smoothedSnapshot(snapshot, time);
    this.updateLabel(snapshot);
    this.updateEmotion(snapshot);
    this.root.position.set(snapshot.position.x, snapshot.position.y - PLAYER_HEIGHT / 2, snapshot.position.z);
    this.root.rotation.y = snapshot.yaw;
    this.root.visible = snapshot.role === "player";
    const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    const stridePhase = time * (7.2 + Math.min(speed, 7) * 0.22) + snapshot.index * 0.7;
    const swing = Math.sin(stridePhase) * Math.min(0.78, speed * 0.09);
    const counterSwing = Math.sin(stridePhase + Math.PI) * Math.min(0.78, speed * 0.09);
    const bob = Math.abs(Math.sin(stridePhase)) * Math.min(0.11, speed * 0.012);
    const telegraph = snapshot.lastAction ? ACTION_TELEGRAPH[snapshot.lastAction] : null;
    if (snapshot.lastActionAt > 0 && snapshot.lastActionAt !== this.lastVisualActionAt) {
      this.lastVisualActionAt = snapshot.lastActionAt;
      this.lastVisualActionSeenAt = performance.now();
      if (snapshot.lastAction === "hand") {
        this.visualHandStrikeSide = snapshot.lastActionSide || this.nextVisualHandStrikeSide;
        this.nextVisualHandStrikeSide = this.visualHandStrikeSide === "right" ? "left" : "right";
        handStrikeUntilByPlayerId.set(snapshot.id, performance.now() + LOCAL_HAND_STRIKE_DURATION_MS);
      }
    }
    const actionAge = snapshot.lastActionAt > 0 && snapshot.lastActionAt === this.lastVisualActionAt
      ? Math.max(0, performance.now() - this.lastVisualActionSeenAt)
      : Number.POSITIVE_INFINITY;
    const actionPulse = THREE.MathUtils.clamp(1 - actionAge / (telegraph?.durationMs ?? 260), 0, 1);
    const kickArc = Math.sin(actionPulse * Math.PI);
    const celebrationTelegraph = snapshot.celebration ? CELEBRATION_TELEGRAPH[snapshot.celebration] : null;
    if (snapshot.celebrationAt > 0 && snapshot.celebrationAt !== this.lastVisualCelebrationAt) {
      this.lastVisualCelebrationAt = snapshot.celebrationAt;
      this.lastVisualCelebrationSeenAt = performance.now();
    }
    const celebrationAge = snapshot.celebrationAt > 0 && snapshot.celebrationAt === this.lastVisualCelebrationAt
      ? Math.max(0, performance.now() - this.lastVisualCelebrationSeenAt)
      : Number.POSITIVE_INFINITY;
    const celebrationPulse = snapshot.celebration && celebrationAge < CELEBRATION_DURATION_MS
      ? THREE.MathUtils.clamp(1 - celebrationAge / CELEBRATION_DURATION_MS, 0, 1)
      : 0;
    const celebrationArc = Math.sin(celebrationPulse * Math.PI);
    const localKickCharge = snapshot.id === localJoin?.id ? leftKickChargeFraction() : 0;
    const celebrationWave = Math.sin(time * 10 + snapshot.index);
    const trackedHandPulse = THREE.MathUtils.clamp(
      ((handStrikeUntilByPlayerId.get(snapshot.id) ?? 0) - performance.now()) / LOCAL_HAND_STRIKE_DURATION_MS,
      0,
      1
    );
    const handPulse = Math.max(snapshot.lastAction === "hand" ? actionPulse : 0, trackedHandPulse);
    const handArc = Math.sin(handPulse * Math.PI);
    if (this.characterController) {
      this.characterDebug = this.characterController.update(snapshot, time);
      if (!localJoin || snapshot.id === localJoin.id) {
        document.documentElement.dataset.playerRigAction = this.characterDebug.action;
        document.documentElement.dataset.playerRigLocomotion = this.characterDebug.locomotion;
        document.documentElement.dataset.playerRigStrike = this.characterDebug.strike;
        document.documentElement.dataset.playerRigStrikePulse = this.characterDebug.strikePulse.toFixed(2);
        document.documentElement.dataset.playerRigStrikeSide = this.characterDebug.strikeSide;
        document.documentElement.dataset.playerRigTrailingFoot = snapshot.trailingFoot;
        document.documentElement.dataset.playerRigLastActionSide = snapshot.lastActionSide || "none";
        document.documentElement.dataset.playerRigCelebration = this.characterDebug.celebration;
        document.documentElement.dataset.playerRigCelebrationPulse = this.characterDebug.celebrationPulse.toFixed(2);
        document.documentElement.dataset.playerRigJumpStyle = this.characterDebug.jumpStyle;
        document.documentElement.dataset.playerRigRagdoll = String(this.characterDebug.ragdoll);
        document.documentElement.dataset.playerRigIk = this.characterDebug.ikMode;
        document.documentElement.dataset.playerRigIkBones = String(this.characterDebug.boneCount);
        document.documentElement.dataset.localPlayerRigAction = this.characterDebug.action;
        document.documentElement.dataset.localPlayerRigLocomotion = this.characterDebug.locomotion;
        document.documentElement.dataset.localPlayerRigStrike = this.characterDebug.strike;
        document.documentElement.dataset.localPlayerRigStrikePulse = this.characterDebug.strikePulse.toFixed(2);
        document.documentElement.dataset.localPlayerRigRagdoll = String(this.characterDebug.ragdoll);
      }
    }

    this.rig.position.y = bob + (snapshot.airborne ? 0.08 : 0);
    this.rig.rotation.set(0, 0, 0);
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

    if (snapshot.ragdoll) {
      const ragdollAge = Math.max(0, Date.now() - snapshot.ragdollAt);
      const fall = THREE.MathUtils.clamp(ragdollAge / 520, 0, 1);
      const easedFall = 1 - Math.pow(1 - fall, 3);
      const side = Math.sin(snapshot.ragdollAt * 0.017) >= 0 ? 1 : -1;
      this.rig.position.y = 0.1 + Math.sin(time * 18) * 0.012 * (1 - easedFall);
      this.rig.rotation.x = -1.22 * easedFall;
      this.rig.rotation.z = 0.36 * side * easedFall;
      this.body.rotation.x = 0.48 * easedFall;
      this.chest.rotation.x = 0.64 * easedFall;
      this.head.rotation.x = 0.58 * easedFall;
      this.hair.rotation.x = 0.58 * easedFall;
      this.leftArm.rotation.set(-1.35, 0.12 * side, -0.86);
      this.rightArm.rotation.set(-1.05, -0.08 * side, 0.72);
      this.leftLeg.rotation.set(0.72, 0, -0.24);
      this.rightLeg.rotation.set(-0.38, 0, 0.3);
      this.leftFoot.rotation.x = 0.2;
      this.rightFoot.rotation.x = -0.12;
      this.contactFlash.visible = true;
      this.contactFlashMaterial.color.setHex(0xff5c5c);
      this.contactFlashMaterial.opacity = 0.2 + (1 - easedFall) * 0.38;
      this.contactFlash.position.set(0, 0.58, 0.15);
      this.contactFlash.scale.setScalar(1.35 + (1 - easedFall) * 1.8);
    } else if (celebrationPulse > 0 && snapshot.celebration) {
      const bounce = snapshot.celebration === "celebrate2" ? Math.max(0, Math.sin(time * 16)) * 0.13 * celebrationArc : 0;
      this.rig.position.y += bounce;
      this.body.rotation.z = 0.08 * celebrationWave * celebrationArc;
      this.chest.rotation.z = 0.1 * celebrationWave * celebrationArc;
      this.celebrationAura.visible = true;
      this.celebrationAuraMaterial.color.setHex(celebrationTelegraph?.color ?? 0xfff16a);
      this.celebrationAuraMaterial.opacity = celebrationPulse * (celebrationTelegraph?.glow ?? 0.7);
      this.celebrationAura.scale.setScalar((celebrationTelegraph?.burst ?? 1) * (1.15 + (1 - celebrationPulse) * 1.05));
      this.celebrationAura.rotation.z = time * 2.4;
      this.celebrationBurst.visible = true;
      this.celebrationBurstMaterial.color.setHex(celebrationTelegraph?.color ?? 0xfff16a);
      this.celebrationBurstMaterial.opacity = celebrationPulse * 0.78;
      this.celebrationBurst.position.set(0, 1.48 + bounce, 0);
      this.celebrationBurst.rotation.set(Math.PI / 2 + celebrationWave * 0.18, 0, time * 4.8);
      this.celebrationBurst.scale.setScalar(0.82 + (1 - celebrationPulse) * 1.3);
      this.contactFlash.visible = true;
      this.contactFlashMaterial.color.setHex(celebrationTelegraph?.color ?? 0xfff16a);
      this.contactFlashMaterial.opacity = celebrationPulse * 0.48;
      this.contactFlash.position.set(0, 1.28 + bounce, 0);
      this.contactFlash.scale.setScalar(1.1 + (1 - celebrationPulse) * 2.4);
      if (snapshot.celebration === "celebrate1") {
        this.leftArm.rotation.set(-1.35, 0, -0.72 + celebrationWave * 0.18);
        this.rightArm.rotation.set(-1.35, 0, 0.72 + celebrationWave * 0.18);
        this.leftLeg.rotation.x = 0.12 * celebrationArc;
        this.rightLeg.rotation.x = 0.12 * celebrationArc;
      } else if (snapshot.celebration === "celebrate2") {
        this.leftArm.rotation.set(-0.88 - bounce, 0, -0.55 - celebrationWave * 0.16);
        this.rightArm.rotation.set(-0.88 - bounce, 0, 0.55 - celebrationWave * 0.16);
        this.leftLeg.rotation.x = 0.34 * celebrationArc;
        this.rightLeg.rotation.x = -0.18 * celebrationArc;
        this.leftFoot.position.y += bounce * 0.35;
        this.rightFoot.position.y += bounce * 0.25;
      } else {
        const pump = Math.max(0, Math.sin(time * 13)) * celebrationArc;
        this.body.rotation.x = -0.22 * celebrationArc;
        this.chest.rotation.x = -0.24 * celebrationArc;
        this.head.rotation.x = -0.18 * celebrationArc;
        this.hair.rotation.x = -0.18 * celebrationArc;
        this.rightArm.rotation.set(-1.18 - pump * 0.45, 0, 0.48);
        this.leftArm.rotation.set(-0.24, 0, -0.22);
      }
    } else if (snapshot.lastAction === "left") {
      const rightFootStrike = snapshot.lastActionSide === "right";
      const strikeLeg = rightFootStrike ? this.rightLeg : this.leftLeg;
      const strikeFoot = rightFootStrike ? this.rightFoot : this.leftFoot;
      const counterArm = rightFootStrike ? this.leftArm : this.rightArm;
      const side = rightFootStrike ? 1 : -1;
      strikeLeg.rotation.x = -1.18 * kickArc;
      strikeLeg.rotation.z = -0.1 * side * kickArc;
      strikeLeg.position.z += 0.12 * kickArc;
      strikeFoot.position.set(0.2 * side, 0.15, 0.58 + 0.6 * kickArc);
      strikeFoot.rotation.x = -0.52 * kickArc;
      counterArm.rotation.x = -0.65 * kickArc;
      this.contactFlash.position.set(0.2 * side, 0.36, 0.94);
    } else if (snapshot.lastAction === "hand" || handPulse > 0) {
      const serverHandPulse = snapshot.lastAction === "hand" ? actionPulse : 0;
      const previewHandSide = snapshot.id === localJoin?.id && trackedHandPulse > serverHandPulse
        ? localHandStrikeSide
        : this.visualHandStrikeSide;
      const rightHandStrike = previewHandSide === "right";
      const strikeArm = rightHandStrike ? this.rightArm : this.leftArm;
      const counterArm = rightHandStrike ? this.leftArm : this.rightArm;
      const side = rightHandStrike ? 1 : -1;
      strikeArm.position.set(0.43 * side, 1.2 + 0.08 * handArc, 0.12 + 0.38 * handArc);
      strikeArm.rotation.x = -1.72 * handArc;
      strikeArm.rotation.y = 0.16 * side * handArc;
      strikeArm.rotation.z = -0.18 * side;
      counterArm.rotation.x = -0.32 * handArc;
      counterArm.rotation.z = 0.18 * side;
      this.body.rotation.y = -0.22 * side * handArc;
      this.chest.rotation.y = -0.24 * side * handArc;
      this.contactFlash.position.set(0.24 * side, 1.38, 1.02);
      this.handStrike.visible = handPulse > 0;
      this.handStrikeMaterial.opacity = handPulse * 0.9;
      this.handStrike.position.set(0.22 * side, 1.46, 1.1);
      this.handStrike.rotation.set(0.18, -0.12 * side, -1.1 * side + handArc * 0.82 * side);
      this.handStrike.scale.setScalar(1.12 + (1 - handPulse) * 0.92);
    } else if (snapshot.lastAction === "head") {
      this.body.rotation.x = -0.12 * kickArc;
      this.chest.rotation.x = -0.16 * kickArc;
      this.head.rotation.x = -0.86 * kickArc;
      this.hair.rotation.x = -0.86 * kickArc;
      this.head.position.z = 0.38 * kickArc;
      this.hair.position.z = 0.38 * kickArc;
      this.contactFlash.position.set(0, 1.64, 0.94);
    } else if (snapshot.lastAction === "body") {
      this.body.rotation.x = -0.28 * kickArc;
      this.chest.rotation.x = -0.28 * kickArc;
      this.body.position.z = 0.16 * kickArc;
      this.chest.position.z = 0.42 + 0.16 * kickArc;
      this.head.position.z = 0.08 * kickArc;
      this.hair.position.z = 0.08 * kickArc;
      this.contactFlash.position.set(0, 1.08, 0.42);
    } else if (snapshot.lastAction === "jump") {
      const runJump = snapshot.sprinting || speed > 4.35;
      if (runJump) {
        this.body.rotation.x = -0.18 * kickArc;
        this.chest.rotation.x = -0.2 * kickArc;
        this.leftLeg.rotation.x = 0.82 * kickArc;
        this.rightLeg.rotation.x = -0.32 * kickArc;
        this.leftFoot.rotation.x = -0.22 * kickArc;
        this.rightFoot.rotation.x = 0.18 * kickArc;
        this.leftArm.rotation.x = -0.92 * kickArc;
        this.rightArm.rotation.x = 0.32 * kickArc;
        this.rig.position.y += 0.24 * kickArc;
      } else {
        this.leftLeg.rotation.x = 0.58 * kickArc;
        this.rightLeg.rotation.x = 0.58 * kickArc;
        this.leftArm.rotation.x = -0.48 * kickArc;
        this.rightArm.rotation.x = -0.48 * kickArc;
        this.rig.position.y += 0.16 * kickArc;
      }
      this.contactFlash.position.set(0, 0.3, 0);
      document.documentElement.dataset.playerRigJumpStyle = runJump ? "run" : "standing";
    } else {
      this.contactFlash.visible = false;
    }
    if (celebrationPulse <= 0) {
      this.celebrationAura.visible = false;
      this.celebrationAuraMaterial.opacity = 0;
      this.celebrationAura.scale.setScalar(1);
      this.celebrationBurst.visible = false;
      this.celebrationBurstMaterial.opacity = 0;
      this.celebrationBurst.scale.setScalar(1);
    }
    if (handPulse <= 0) {
      this.handStrike.visible = false;
      this.handStrikeMaterial.opacity = 0;
      this.handStrike.scale.setScalar(1);
    }
    if (snapshot.id === localJoin?.id) {
      document.documentElement.dataset.localHandStrikeVisible = String(this.handStrike.visible);
      document.documentElement.dataset.localHandStrikeSide = trackedHandPulse > 0 ? localHandStrikeSide : this.visualHandStrikeSide;
      document.documentElement.dataset.localTrailingFoot = snapshot.trailingFoot;
      document.documentElement.dataset.localLastActionSide = snapshot.lastActionSide || "none";
      document.documentElement.dataset.localPlayerRagdoll = String(snapshot.ragdoll);
      document.documentElement.dataset.localPlayerRagdollAt = String(snapshot.ragdollAt || 0);
    }
    if (this.handStrike.visible) {
      document.documentElement.dataset.handStrikeVisible = "true";
      document.documentElement.dataset.handStrikePlayer = snapshot.id;
    }

    const actionScale = 1 + actionPulse * (snapshot.lastAction === "body" ? 0.24 : 0.14) + celebrationArc * 0.08;
    this.body.scale.set(actionScale, actionScale, actionScale);
    this.chest.scale.set(actionScale, actionScale, actionScale);
    this.shadowMaterial.opacity = (0.22 + Math.min(0.12, speed * 0.015)) * (snapshot.airborne ? 0.58 : 1);
    this.shadow.scale.set(1 + speed * 0.018 + (snapshot.airborne ? 0.18 : 0), 0.82 + speed * 0.01, 1);
    const markerColor = teamColor(snapshot.team);
    this.teamHaloMaterial.color.setHex(markerColor);
    this.teamHaloMaterial.opacity = snapshot.team === null ? 0.08 : snapshot.id === localJoin?.id ? 0.28 + localKickCharge * 0.2 : 0.2;
    this.ringMaterial.color.setHex(markerColor);
    const exhaustionPulse = snapshot.exhausted ? 0.55 + Math.sin(time * 12) * 0.18 : 1;
    this.ringMaterial.opacity = (snapshot.team === null ? 0.42 : snapshot.id === localJoin?.id ? 1 : 0.9) * exhaustionPulse;
    this.ring.scale.setScalar(1 + actionPulse * 0.18 + celebrationArc * 0.22 + localKickCharge * 0.34 + (snapshot.exhausted ? (1 - exhaustionPulse) * 0.16 : 0));
    this.ring.visible = snapshot.role === "player";
    this.teamHaloMaterial.opacity *= snapshot.exhausted ? 0.72 : 1;
    this.teamHalo.visible = snapshot.role === "player";
    this.label.material.opacity = snapshot.id === localJoin?.id ? 1 : 0.78;
    if (snapshot.id === localJoin?.id) {
      document.documentElement.dataset.localTeamMarker = snapshot.team === 0 ? "blue" : snapshot.team === 1 ? "orange" : "spectator";
      document.documentElement.dataset.localTeamMarkerColor = `#${markerColor.toString(16).padStart(6, "0")}`;
    }
  }

  private updateLabel(snapshot: PlayerSnapshot): void {
    const key = playerLabelText(snapshot);
    if (key === this.labelKey) return;
    this.labelKey = key;
    replaceSpriteTexture(this.label, makeLabelTexture(key));
  }

  private updateEmotion(snapshot: PlayerSnapshot): void {
    const emotion = snapshot.emotion;
    const key = emotion ? `${emotion.id}:${emotion.appliedAt}` : "";
    if (key !== this.emotionKey) {
      this.emotionKey = key;
      replaceSpriteTexture(this.emotionLabel, makeEmotionTexture(emotion?.emoji || ""));
    }
    this.emotionLabel.visible = Boolean(emotion);
    if (emotion) {
      const remaining = Math.max(0, emotion.expiresAt - Date.now());
      this.emotionLabel.material.opacity = THREE.MathUtils.clamp(remaining / APPLIED_EMOTION_FALLBACK_MS, 0.28, 1);
      if (snapshot.id === localJoin?.id) document.documentElement.dataset.localEmotion = emotion.id;
    } else if (snapshot.id === localJoin?.id) {
      document.documentElement.dataset.localEmotion = "none";
    }
  }

  dispose() {
    this.characterController?.dispose();
    this.label.material.map?.dispose();
    this.label.material.dispose();
    this.emotionLabel.material.map?.dispose();
    this.emotionLabel.material.dispose();
    scene.remove(this.root);
  }
}

function teamColor(team: number | null) {
  if (team === 0) return 0x58a8ff;
  if (team === 1) return 0xff9d42;
  return 0xb9c6d8;
}

function playerLabelText(snapshot: PlayerSnapshot): string {
  const prefix = snapshot.userPic && !isImageUserPic(snapshot.userPic) ? `${snapshot.userPic} ` : "";
  return `${prefix}${displayPlayerName(snapshot.name)}`;
}

function makeLabelTexture(name: string): THREE.CanvasTexture {
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
  return new THREE.CanvasTexture(canvasLabel);
}

function makeEmotionTexture(emoji: string): THREE.CanvasTexture {
  const canvasLabel = document.createElement("canvas");
  canvasLabel.width = 256;
  canvasLabel.height = 256;
  const context = canvasLabel.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(4, 12, 11, 0.72)";
    context.beginPath();
    context.arc(128, 128, 108, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "116px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(emoji || " ", 128, 132);
  }
  return new THREE.CanvasTexture(canvasLabel);
}

function replaceSpriteTexture(sprite: THREE.Sprite, texture: THREE.CanvasTexture): void {
  sprite.material.map?.dispose();
  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
}

function makeLabel(name: string) {
  const texture = makeLabelTexture(name);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function makeEmotionLabel(emoji: string) {
  const texture = makeEmotionTexture(emoji);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(APPLIED_EMOTION_LABEL_SCALE, APPLIED_EMOTION_LABEL_SCALE, 1);
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
  if (isItchHostedBuild()) {
    return "wss://io-games.mecharulez.com/unsoccer/socket/ws";
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
  if (isItchHostedBuild()) {
    return "https://io-games.mecharulez.com/unsoccer/api";
  }
  return `${location.origin}/unsoccer/api`;
}

function isItchHostedBuild() {
  return location.hostname.endsWith(".itch.zone") || location.hostname.endsWith(".itch.io");
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
  if (join.profile) {
    localProfile = {
      nickname: localizeGeneratedPlayerName(join.profile.nickname),
      skinId: sanitizeLocalSkin(join.profile.skinId),
      userPic: sanitizeLocalUserPic(join.profile.userPic)
    };
    saveLocalProfile();
    syncProfileUi();
  }
  if (!previous || previous.role !== join.role || previous.team !== join.team || previous.index !== join.index) {
    audio.playJoin(localJoin.role);
    pushEventFeed(localJoin.role === "player"
      ? t("player.youTeam", { team: teamNameLabel(localJoin.team), index: localJoin.index + 1 })
      : t("player.youSpectator"));
  }
  statusEl.textContent = localJoin.role === "player"
    ? t("player.joinedTeam", { team: teamNameLabel(localJoin.team), index: localJoin.index + 1 })
    : t("player.spectatorMode");
  updatePlayerChip();
  updateResolvedInput();
}

function connect() {
  const name = localProfile.nickname;
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
  let stateWatchdogTimer = 0;
  let stateWatchdogStartedAt = 0;
  const clearStateWatchdog = () => {
    if (!stateWatchdogTimer) return;
    window.clearTimeout(stateWatchdogTimer);
    stateWatchdogTimer = 0;
  };
  const fallbackTimer = window.setTimeout(() => {
    if (!connected && transportMode === "websocket" && channel === wsChannel) {
      clearStateWatchdog();
      wsChannel.close();
      channel = null;
      void connectHttp(name, "websocket-timeout");
    }
  }, 1800);
  wsChannel.on("joined", (data) => {
    acceptJoin(data as JoinAccepted);
    stateWatchdogStartedAt = performance.now();
    document.documentElement.dataset.websocketStateWatchdog = "waiting";
    clearStateWatchdog();
    stateWatchdogTimer = window.setTimeout(() => {
      if (transportMode !== "websocket" || channel !== wsChannel) return;
      if (latestSnapshotReceivedAt > stateWatchdogStartedAt) return;
      document.documentElement.dataset.websocketStateWatchdog = "fallback";
      connected = false;
      transportMode = "none";
      channel = null;
      wsChannel.close();
      resetServerAudioCursor();
      resetStateInterpolation();
      void connectHttp(name, "websocket-state-timeout");
    }, 900);
  });
  wsChannel.on("server-full", () => {
    statusEl.textContent = t("status.serverFull");
    pushEventFeed(t("status.serverFull"));
  });
  wsChannel.on("state", (data) => {
    clearStateWatchdog();
    document.documentElement.dataset.websocketStateWatchdog = "ok";
    receiveState(data as ServerState);
  });
  wsChannel.onConnect((error) => {
    if (transportMode !== "websocket" || channel !== wsChannel) {
      clearStateWatchdog();
      wsChannel.close();
      return;
    }
    if (error) {
      window.clearTimeout(fallbackTimer);
      clearStateWatchdog();
      channel = null;
      void connectHttp(name, error.message);
      console.warn("unsoccer connection failed", error.message);
      return;
    }
    window.clearTimeout(fallbackTimer);
    connected = true;
    document.documentElement.dataset.transport = "websocket";
    audio.playConnection(true);
    statusEl.textContent = t("status.connected");
    pushEventFeed(t("status.websocketOnline"));
    updateNetworkHud();
    wsChannel.emit("join", joinRequestPayload(name));
  });
  wsChannel.onDisconnect(() => {
    if (transportMode !== "websocket" || channel !== wsChannel) return;
    clearStateWatchdog();
    connected = false;
    transportMode = "none";
    channel = null;
    document.documentElement.dataset.transport = "none";
    audio.playConnection(false);
    resetServerAudioCursor();
    resetStateInterpolation();
    statusEl.textContent = t("status.disconnected");
    pushEventFeed(t("status.disconnected"));
    updatePlayerChip();
    updateNetworkHud();
    document.documentElement.dataset.autoReconnect = String(settings.network.autoReconnect);
    if (settings.network.autoReconnect) {
      window.setTimeout(() => {
        if (!connected && transportMode === "none" && settings.network.autoReconnect) connect();
      }, 900);
    }
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
  statusEl.textContent = t("status.httpFallbackConnecting");
  pushEventFeed(t("status.httpFallback"));
  try {
    const payload = await postJson<{ ok: boolean; joined: JoinAccepted; state: ServerState }>("join", joinRequestPayload(name));
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
    statusEl.textContent = t("status.connectionError");
    pushEventFeed(t("status.networkError"));
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
      statusEl.textContent = t("status.disconnected");
      pushEventFeed(t("status.httpSnapshotLost"));
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

function sendProfileUpdate(): void {
  saveLocalProfile();
  if (!connected) return;
  const profile = profilePayload();
  if (transportMode === "http" && httpClientId) {
    void postJson<{ ok: boolean; joined: JoinAccepted; state: ServerState }>("profile", {
      clientId: httpClientId,
      profile
    }).then((payload) => {
      acceptJoin(payload.joined);
      receiveState(payload.state);
    }).catch((error) => {
      console.warn("unsoccer http profile failed", error);
    });
    return;
  }
  channel?.emit("profile", { profile });
}

function sendChatMessage(text: string): void {
  if (!connected) return;
  if (transportMode === "http" && httpClientId) {
    void postJson<{ ok: boolean; state: ServerState }>("chat", { clientId: httpClientId, text })
      .then((payload) => receiveState(payload.state))
      .catch((error) => {
        console.warn("unsoccer http chat failed", error);
      });
    return;
  }
  channel?.emit("chat", { text });
}

function sendEmotion(emotionId: EmotionId): void {
  if (!connected) return;
  if (transportMode === "http" && httpClientId) {
    void postJson<{ ok: boolean; state: ServerState }>("emotion", { clientId: httpClientId, emotionId })
      .then((payload) => receiveState(payload.state))
      .catch((error) => {
        console.warn("unsoccer http emotion failed", error);
      });
    return;
  }
  channel?.emit("emotion", { emotionId });
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
    variant: to.variant,
    ownerPlayerId: to.ownerPlayerId
  };
}

function interpolatePlayer(from: PlayerSnapshot | undefined, to: PlayerSnapshot, alpha: number): PlayerSnapshot {
  if (!from || from.role !== to.role || vecDistance(from.position, to.position) > PLAYER_SNAP_DISTANCE) return to;
  if (Boolean(from.ragdoll) !== Boolean(to.ragdoll)) return to;
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
  if (latestPlayer.ragdoll) return state;
  const playerIndex = state.players.findIndex((player) => player.id === localId);
  if (playerIndex < 0) return state;

  if (localPredictionPlayerId !== latestPlayer.id || vecDistance(latestPlayer.position, state.players[playerIndex].position) > PLAYER_SNAP_DISTANCE) {
    localPredictionPlayerId = latestPlayer.id;
    localPredictionUpdatedAt = nowSeconds;
    localPredictionAxis = { x: 0, z: 0 };
    localPredictionVelocity = { x: latestPlayer.velocity.x, y: 0, z: latestPlayer.velocity.z };
  }

  const predictionDt = localPredictionUpdatedAt > 0 ? Math.max(0, Math.min(0.05, nowSeconds - localPredictionUpdatedAt)) : 1 / 60;
  localPredictionUpdatedAt = nowSeconds;
  const rawMovement = movementAxes(input, latestPlayer.team);
  localPredictionAxis.x = approachMovementAxis(localPredictionAxis.x, rawMovement.x, predictionDt);
  localPredictionAxis.z = approachMovementAxis(localPredictionAxis.z, rawMovement.z, predictionDt);
  const movement = normalizeMovementAxis(localPredictionAxis.x, localPredictionAxis.z);
  localPredictionMoveAxisMagnitude = movement.magnitude;
  const lastAuthoritative = stateHistory[stateHistory.length - 1];
  const rawMoving = rawMovement.magnitude > 0.05;
  const runtimeSettings = latestState.settings;
  const localSpeedMultiplier = latestPlayer.exhausted
    ? (runtimeSettings?.playerExhaustedSpeedMultiplier ?? PLAYER_EXHAUSTED_SPEED_MULTIPLIER)
    : rawMoving && input.sprint && latestPlayer.stamina > 0.01
      ? (runtimeSettings?.playerSprintMultiplier ?? PLAYER_SPRINT_MULTIPLIER)
      : 1;
  const localSpeed = (runtimeSettings?.playerSpeed ?? PLAYER_SPEED) * localSpeedMultiplier;
  const desiredMoveVelocity = {
    x: movement.x * localSpeed * movement.magnitude,
    y: 0,
    z: movement.z * localSpeed * movement.magnitude
  };
  localPredictionVelocity.x = THREE.MathUtils.lerp(localPredictionVelocity.x, latestPlayer.velocity.x, 0.18);
  localPredictionVelocity.z = THREE.MathUtils.lerp(localPredictionVelocity.z, latestPlayer.velocity.z, 0.18);
  const desiredMoveSpeed = Math.hypot(desiredMoveVelocity.x, desiredMoveVelocity.z);
  const currentMoveSpeed = Math.hypot(localPredictionVelocity.x, localPredictionVelocity.z);
  const velocityDot = currentMoveSpeed > 0.001 && desiredMoveSpeed > 0.001
    ? (localPredictionVelocity.x * desiredMoveVelocity.x + localPredictionVelocity.z * desiredMoveVelocity.z) / (currentMoveSpeed * desiredMoveSpeed)
    : 1;
  const movementRate = desiredMoveSpeed < currentMoveSpeed - 0.01
    ? (runtimeSettings?.playerMovementDeceleration ?? PLAYER_MOVEMENT_DECELERATION)
    : velocityDot < -0.05
      ? (runtimeSettings?.playerMovementTurnAcceleration ?? PLAYER_MOVEMENT_TURN_ACCELERATION)
      : (runtimeSettings?.playerMovementAcceleration ?? PLAYER_MOVEMENT_ACCELERATION);
  localPredictionVelocity.x = approachScalar(localPredictionVelocity.x, desiredMoveVelocity.x, movementRate, predictionDt);
  localPredictionVelocity.z = approachScalar(localPredictionVelocity.z, desiredMoveVelocity.z, movementRate, predictionDt);
  if (desiredMoveSpeed <= 0.001 && Math.abs(localPredictionVelocity.x) < 0.001) localPredictionVelocity.x = 0;
  if (desiredMoveSpeed <= 0.001 && Math.abs(localPredictionVelocity.z) < 0.001) localPredictionVelocity.z = 0;
  localPredictionMoveSpeed = Math.hypot(localPredictionVelocity.x, localPredictionVelocity.z);

  const leadSeconds = (rawMoving || movement.magnitude > 0.05 || localPredictionMoveSpeed > 0.05) && lastAuthoritative
    ? Math.min(
      LOCAL_PLAYER_PREDICTION_MAX_SECONDS,
      Math.max(nowSeconds - lastAuthoritative.receivedAt, 1 / 60)
    )
    : 0;
  localPredictionLeadMs = leadSeconds * 1000;

  const localPlayer: PlayerSnapshot = leadSeconds > 0
    ? {
      ...latestPlayer,
      position: {
        x: latestPlayer.position.x + localPredictionVelocity.x * leadSeconds,
        y: latestPlayer.position.y,
        z: latestPlayer.position.z + localPredictionVelocity.z * leadSeconds
      },
      velocity: {
        x: localPredictionVelocity.x,
        y: 0,
        z: localPredictionVelocity.z
      },
      yaw: localPredictionMoveSpeed > 0.15 ? Math.atan2(localPredictionVelocity.x, localPredictionVelocity.z) : latestPlayer.yaw
    }
    : latestPlayer;

  const players = state.players.slice();
  players[playerIndex] = localPlayer;
  return { ...state, players };
}

function approachScalar(current: number, target: number, rate: number, dt: number): number {
  if (current === target) return target;
  const alpha = 1 - Math.exp(-Math.max(0, rate) * dt);
  return current + (target - current) * alpha;
}

function movementAxes(inputState: InputState, team: TeamId | null): { x: number; z: number; magnitude: number } {
  const xAxis = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
  const forwardAxis = (inputState.up ? 1 : 0) - (inputState.down ? 1 : 0);
  const attackDirection = team === 1 ? -1 : 1;
  const zAxis = forwardAxis * attackDirection;
  return {
    x: xAxis,
    z: zAxis,
    magnitude: Math.hypot(xAxis, zAxis)
  };
}

function normalizeMovementAxis(x: number, z: number): { x: number; z: number; magnitude: number } {
  const magnitude = Math.hypot(x, z);
  if (magnitude <= 0) return { x: 0, z: 0, magnitude: 0 };
  return {
    x: x / magnitude,
    z: z / magnitude,
    magnitude: Math.min(1, magnitude)
  };
}

function approachMovementAxis(current: number, target: number, dt: number): number {
  const rate = target === 0
    ? PLAYER_INPUT_AXIS_RELEASE_DECAY
    : current !== 0 && Math.sign(current) !== Math.sign(target)
      ? PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION
      : PLAYER_INPUT_AXIS_ACCELERATION;
  const next = approachScalar(current, target, rate, dt);
  return Math.abs(next) < 0.001 && target === 0 ? 0 : THREE.MathUtils.clamp(next, -1, 1);
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
  updateWeatherHud(state.weather, state.dayTimeSeconds);
  updatePlayerChip(state);
  updateNetworkHud();
  document.documentElement.dataset.goalResetPhase = state.goalReset.phase;
  document.documentElement.dataset.goalResetRemainingMs = String(Math.round(state.goalReset.remainingMs));
  document.documentElement.dataset.goalResetReturnProgress = state.goalReset.returnProgress.toFixed(3);
  const countdown = state.countdown > 0 ? t("status.countdown", { seconds: (state.countdown / 1000).toFixed(1) }) : "";
  const goalResetText = state.goalReset.phase === "celebration"
    ? t("status.celebration", { seconds: (state.goalReset.remainingMs / 1000).toFixed(1) })
    : state.goalReset.phase === "returning"
      ? t("status.ballReturning", { progress: Math.round(state.goalReset.returnProgress * 100) })
      : "";
  const rawMessage = state.message;
  const message = translateServerMessage(rawMessage);
  if (settings.accessibility.captions && message) pushEventFeed(message);
  const statusMessage = isTransientEventMessage(message) ? "" : message;
  if (isWeatherServerMessage(rawMessage)) {
    statusEl.textContent = message;
    statusEl.title = rawMessage;
  } else if (!localJoin || localJoin.role === "spectator") {
    statusEl.title = "";
    statusEl.textContent = `${statusMessage || t("status.observing")}.${goalResetText || countdown || ""}`;
  } else if (statusMessage) {
    statusEl.title = "";
    statusEl.textContent = `${statusMessage}.${goalResetText || countdown}`;
  } else {
    statusEl.title = "";
    statusEl.textContent = `${t("player.youTeam", { team: teamNameLabel(localJoin.team), index: localJoin.index + 1 })}.${goalResetText || countdown}`;
  }
  rosterEl.innerHTML = state.players.map((player) => {
    const dot = player.team === 0 ? "blue" : player.team === 1 ? "orange" : "spectator";
    const role = player.role === "player" ? teamNameLabel(player.team) : teamLabel(null, true);
    const controllerBadge = localizedControllerBadge(player.controller);
    const goals = Math.max(0, Math.floor(player.goals || 0));
    const title = controllerBadge ? `${role} - ${controllerBadge}` : role;
    return `<div class="roster-row" title="${escapeHtml(title)}" data-player-goals="${goals}" data-controller="${escapeHtml(player.controller)}"><i class="dot ${dot}"></i><span>${escapeHtml(displayPlayerName(player.name))}</span><b class="roster-goals" title="${escapeHtml(t("score.goals"))}">${goals}</b></div>`;
  }).join("");
  updateChatUi(state);
}

function updateWeatherHud(weather: WeatherSnapshot | undefined, dayTimeSeconds: number) {
  if (!weather) {
    const pending = t("weather.pendingLabel");
    weatherEl.innerHTML = `<div class="weather-hud" role="img" aria-label="${escapeHtml(pending)}"><span class="weather-icon">⌛</span>${weatherClockMarkup(dayTimeSeconds)}<span class="weather-pill">🌬️ --</span><span class="weather-pill">💧--</span><span class="weather-pill">🧊--</span><span class="weather-pill">⛄--</span><span class="weather-pill">🔄--</span></div>`;
    weatherEl.title = pending;
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
  const label = weatherKindLabel(weather.kind);
  document.documentElement.dataset.weatherLabel = label;
  document.documentElement.dataset.weatherHazards = String(weather.hazards.length);
  document.documentElement.dataset.weatherPuddles = String(counts.puddle);
  document.documentElement.dataset.weatherSlush = String(counts.slush);
  document.documentElement.dataset.weatherSnowbanks = String(counts.snowbank);
  document.documentElement.dataset.weatherKind = weather.kind;
  document.documentElement.dataset.weatherIntensity = weather.intensity.toFixed(3);
  document.documentElement.dataset.weatherNextChangeMs = String(Math.round(weather.nextChangeInMs));
  const intensity = Math.round(weather.intensity * 100);
  const nextChangeSeconds = Math.ceil(weather.nextChangeInMs / 1000);
  const summary = t("weather.summary", {
    label,
    intensity,
    wind: wind.toFixed(1),
    change: nextChangeSeconds,
    puddles: counts.puddle,
    slush: counts.slush,
    snowbanks: counts.snowbank
  });
  weatherEl.title = summary;
  weatherEl.innerHTML =
    `<div class="weather-hud" role="img" aria-label="${escapeHtml(summary)}">` +
    `<span class="weather-icon">${weatherEmoji(weather.kind)}</span>` +
    weatherClockMarkup(dayTimeSeconds) +
    `<span class="weather-pill" title="${escapeHtml(t("weather.intensity"))}">${intensity}%</span>` +
    `<span class="weather-pill" title="${escapeHtml(t("weather.wind"))}">🌬️ ${wind.toFixed(1)}</span>` +
    `<span class="weather-pill" title="${escapeHtml(t("weather.puddles"))}">💧${counts.puddle}</span>` +
    `<span class="weather-pill" title="${escapeHtml(t("weather.slush"))}">🧊${counts.slush}</span>` +
    `<span class="weather-pill" title="${escapeHtml(t("weather.snowbanks"))}">⛄${counts.snowbank}</span>` +
    `</div>`;
}

function isWeatherServerMessage(message: string): boolean {
  return /^\s*(\u041f\u043e\u0433\u043e\u0434\u0430|Weather):/i.test(message);
}

function isTransientEventMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("\u0443\u0434\u0430\u0440\u0438\u043b")
    || normalized.includes("\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439")
    || normalized.includes("\u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b")
    || normalized.includes("\u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f")
    || normalized.includes("\u043e\u0431\u043d\u043e\u0432\u0438\u043b \u043f\u0440\u043e\u0444\u0438\u043b\u044c")
    || normalized.includes("\u0432\u044b\u0448\u0435\u043b")
    || normalized.includes("joined")
    || normalized.includes("updated profile")
    || normalized.includes("left")
    || normalized.includes("kicked")
    || normalized.includes("hit with")
    || normalized.includes("headed")
    || normalized.includes("body-checked")
    || normalized.includes("chipped")
    || normalized.includes("drove the ball")
    || normalized.includes("raises hands")
    || normalized.includes("fist-pumps");
}

function weatherClockMarkup(dayTimeSeconds: number): string {
  const daySeconds = THREE.MathUtils.euclideanModulo(dayTimeSeconds, 24 * 60 * 60);
  const hour = Math.floor(daySeconds / 3600);
  const minute = Math.floor((daySeconds % 3600) / 60);
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;
  const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    `<span class="weather-clock" title="${label}" aria-hidden="true" ` +
    `style="--clock-hour-angle:${hourAngle.toFixed(1)}deg;--clock-minute-angle:${minuteAngle.toFixed(1)}deg">` +
    `<span class="clock-hand hour"></span><span class="clock-hand minute"></span></span>`
  );
}

function teamNameLabel(team: TeamId | null): string {
  return teamLabel(team);
}

function displayPlayerName(name: string): string {
  return localizeGeneratedPlayerName(name);
}

function localizeGeneratedNamesInText(text: string): string {
  return text.replace(/(?:Игрок|Player)\s+\d{1,4}/gi, (name) => localizeGeneratedPlayerName(name));
}

function translateServerMessage(message: string): string {
  if (!message) return "";
  if (isWeatherServerMessage(message)) return weatherMessageEmoji(message);
  if (message === "Waiting for players" || message === "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432") return t("status.waitingPlayers");
  if (message === "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0438\u0433\u0440\u044b \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u044b") return t("status.settingsApplied");
  if (message === "\u041c\u044f\u0447 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044f \u0432 \u0446\u0435\u043d\u0442\u0440") return t("status.ballReturningPlain");
  if (message === "\u0420\u043e\u0437\u044b\u0433\u0440\u044b\u0448 \u0441 \u0446\u0435\u043d\u0442\u0440\u0430") return t("status.centerKickoff");
  if (message === "Orange scores" || message === "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442") return t("score.orange");
  if (message === "Blue scores" || message === "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442") return t("score.blue");
  const orangeScore = message.match(/^(?:Orange scores|\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442):\s*(.+)$/);
  if (orangeScore) return t("score.orangeWithScorer", { name: displayPlayerName(orangeScore[1]) });
  const blueScore = message.match(/^(?:Blue scores|\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442):\s*(.+)$/);
  if (blueScore) return t("score.blueWithScorer", { name: displayPlayerName(blueScore[1]) });
  const joined = message.match(/^(.+) joined (the pitch|as spectator)$/);
  if (joined) return t(joined[2] === "the pitch" ? "server.joinedPitch" : "server.joinedSpectator", { name: displayPlayerName(joined[1]) });
  const joinedPitch = message.match(/^(.+) \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f \u043a \u043f\u043e\u043b\u044e$/);
  if (joinedPitch) return t("server.joinedPitch", { name: displayPlayerName(joinedPitch[1]) });
  const joinedSpectator = message.match(/^(.+) \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f \u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c$/);
  if (joinedSpectator) return t("server.joinedSpectator", { name: displayPlayerName(joinedSpectator[1]) });
  const left = message.match(/^(.+) left$/);
  if (left) return t("server.left", { name: displayPlayerName(left[1]) });
  if (message === "\u0418\u0433\u0440\u043e\u043a \u0432\u044b\u0448\u0435\u043b") return t("server.playerLeft");
  const ruLeft = message.match(/^(.+) \u0432\u044b\u0448\u0435\u043b$/);
  if (ruLeft) return t("server.left", { name: displayPlayerName(ruLeft[1]) });
  const profileUpdated = message.match(/^(.+) \u043e\u0431\u043d\u043e\u0432\u0438\u043b \u043f\u0440\u043e\u0444\u0438\u043b\u044c$/) || message.match(/^(.+) updated profile$/);
  if (profileUpdated) return t("server.profileUpdated", { name: displayPlayerName(profileUpdated[1]) });
  const ruBody = message.match(/^(.+) \u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b \u043c\u044f\u0447 \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c$/);
  if (ruBody) return t("server.bodyChecked", { name: displayPlayerName(ruBody[1]) });
  const ruShot = message.match(/^(.+) (\u043f\u043e\u0434\u0431\u0440\u043e\u0441\u0438\u043b \u043c\u044f\u0447 \u0432\u0435\u0440\u0445\u043e\u043c|\u043f\u0440\u043e\u0431\u0438\u043b \u043c\u044f\u0447 \u043d\u0438\u0437\u043e\u043c)( \u0441 \u0443\u0441\u0438\u043b\u0435\u043d\u0438\u0435\u043c)?$/);
  if (ruShot) {
    const base = t(ruShot[2].includes("\u0432\u0435\u0440\u0445\u043e\u043c") ? "server.shotUpper" : "server.shotLow", { name: displayPlayerName(ruShot[1]) });
    return `${base}${ruShot[3] ? t("server.withPower") : ""}`;
  }
  const ruAction = message.match(/^(.+) (\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439|\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439|\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439|\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439|\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439|\u043f\u0440\u044b\u0433\u043d\u0443\u043b|\u0441\u044b\u0433\u0440\u0430\u043b \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c)$/);
  if (ruAction) {
    const keys: Record<string, string> = {
      "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439": "server.leftFoot",
      "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439": "server.rightFoot",
      "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439": "server.leftHand",
      "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439": "server.rightHand",
      "\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439": "server.headed",
      "\u043f\u0440\u044b\u0433\u043d\u0443\u043b": "server.jumped",
      "\u0441\u044b\u0433\u0440\u0430\u043b \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c": "server.bodyPlayed"
    };
    return t(keys[ruAction[2]], { name: displayPlayerName(ruAction[1]) });
  }
  const ruCelebration = message.match(/^(.+) (\u043f\u043e\u0434\u043d\u0438\u043c\u0430\u0435\u0442 \u0440\u0443\u043a\u0438 \u043f\u043e\u0441\u043b\u0435 \u0433\u043e\u043b\u0430|\u043f\u0440\u044b\u0433\u0430\u0435\u0442 \u0438 \u043a\u0430\u0447\u0430\u0435\u0442 \u0442\u0440\u0438\u0431\u0443\u043d\u044b|\u043a\u0438\u0432\u0430\u0435\u0442 \u0438 \u0434\u0435\u043b\u0430\u0435\u0442 \u0444\u0438\u0441\u0442-\u043f\u0430\u043c\u043f)$/);
  if (ruCelebration) {
    const keys: Record<string, string> = {
      "\u043f\u043e\u0434\u043d\u0438\u043c\u0430\u0435\u0442 \u0440\u0443\u043a\u0438 \u043f\u043e\u0441\u043b\u0435 \u0433\u043e\u043b\u0430": "server.celebrate1",
      "\u043f\u0440\u044b\u0433\u0430\u0435\u0442 \u0438 \u043a\u0430\u0447\u0430\u0435\u0442 \u0442\u0440\u0438\u0431\u0443\u043d\u044b": "server.celebrate2",
      "\u043a\u0438\u0432\u0430\u0435\u0442 \u0438 \u0434\u0435\u043b\u0430\u0435\u0442 \u0444\u0438\u0441\u0442-\u043f\u0430\u043c\u043f": "server.celebrate3"
    };
    return t(keys[ruCelebration[2]], { name: displayPlayerName(ruCelebration[1]) });
  }
  const action = message.match(/^(.+) (left-kicked|right-kicked|headed|body-checked) the ball$/);
  if (action) {
    const keys: Record<string, string> = {
      "left-kicked": "server.leftFoot",
      "right-kicked": "server.rightFoot",
      headed: "server.headed",
      "body-checked": "server.bodyChecked"
    };
    return t(keys[action[2]], { name: displayPlayerName(action[1]) });
  }
  return localizeGeneratedNamesInText(message);
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

function applyState(state: ServerState, time: number, deltaSeconds = 1 / 60) {
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
  document.documentElement.dataset.handStrikeVisible = "false";
  document.documentElement.dataset.handStrikePlayer = "";
  let visibleCelebrations = 0;
  for (const player of state.players) {
    seen.add(player.id);
    const celebrationTelegraph = player.celebration ? CELEBRATION_TELEGRAPH[player.celebration] : null;
    if (player.celebration && player.celebrationAt > 0 && state.serverTime - player.celebrationAt < CELEBRATION_DURATION_MS) {
      visibleCelebrations += 1;
    }
    if (player.celebrationAt > lastSeenCelebrationAt) {
      lastSeenCelebrationAt = player.celebrationAt;
      ballPulse = Math.max(ballPulse, celebrationTelegraph?.glow ?? 0.72);
      document.documentElement.dataset.lastCelebrationKind = player.celebration || "none";
      document.documentElement.dataset.lastCelebrationPlayer = player.id;
      document.documentElement.dataset.lastCelebrationAt = String(player.celebrationAt);
      document.documentElement.dataset.celebrationAvailableUntil = String(player.celebrationAvailableUntil);
      if (player.id === localJoin?.id) cameraImpulse = Math.max(cameraImpulse, celebrationTelegraph?.cameraImpulse ?? 0.28);
    }
    if (player.lastActionAt > lastSeenActionAt) {
      lastSeenActionAt = player.lastActionAt;
      const telegraph = player.lastAction ? ACTION_TELEGRAPH[player.lastAction] : null;
      ballPulse = telegraph?.ballPulse ?? 0.76;
      document.documentElement.dataset.lastActionKind = player.lastAction || "none";
      document.documentElement.dataset.lastActionPlayer = player.id;
      document.documentElement.dataset.lastActionAt = String(player.lastActionAt);
      document.documentElement.dataset.lastActionSide = player.lastActionSide || "none";
      document.documentElement.dataset.lastTrailingFoot = player.trailingFoot;
      if (player.lastAction === "hand") {
        document.documentElement.dataset.lastHandActionAt = String(player.lastActionAt);
        document.documentElement.dataset.lastHandActionPlayer = player.id;
        handStrikeUntilByPlayerId.set(player.id, performance.now() + LOCAL_HAND_STRIKE_DURATION_MS);
      }
      if (player.id === localJoin?.id) cameraImpulse = Math.max(cameraImpulse, telegraph?.cameraImpulse ?? 0.58);
    }
    let visual = players.get(player.id);
    if (visual && !visual.matchesCharacter(player.characterId)) {
      visual.dispose();
      players.delete(player.id);
      visual = undefined;
    }
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
  const visibleVisuals = [...players.entries()].filter(([_id, visual]) => visual.root.visible);
  const visiblePlayerIds = new Set(visibleVisuals.map(([id]) => id));
  const visibleVisualDebug = new Map(visibleVisuals.map(([id, visual]) => [id, visual.debugState()]));
  const activePlayers = state.players.filter((player) => player.role === "player");
  const botPlayers = state.players.filter((player) => player.controller === "bot");
  const activeBots = activePlayers.filter((player) => player.controller === "bot");
  const visibleBots = activeBots.filter((player) => visiblePlayerIds.has(player.id));
  const hiddenActivePlayers = activePlayers.filter((player) => !visiblePlayerIds.has(player.id));
  const recentStrikePlayers = activePlayers.filter((player) => {
    const age = state.serverTime - player.lastActionAt;
    return Boolean(player.lastAction) && player.lastActionAt > 0 && age >= 0 && age <= 1200;
  });
  const activeStamina = activePlayers.map((player) => player.stamina);
  const botStamina = activeBots.map((player) => player.stamina);
  const staminaStats = (values: number[]) => ({
    min: values.length ? Math.round(Math.min(...values) * 10) / 10 : 0,
    max: values.length ? Math.round(Math.max(...values) * 10) / 10 : 0
  });
  const activeStaminaStats = staminaStats(activeStamina);
  const botStaminaStats = staminaStats(botStamina);
  const visibleRagdollPlayers = activePlayers.filter((player) => player.ragdoll && visiblePlayerIds.has(player.id));
  const visibleStrikePlayers = recentStrikePlayers.filter((player) => visiblePlayerIds.has(player.id));
  const visibleRigRagdollPlayers = activePlayers.filter((player) => visibleVisualDebug.get(player.id)?.rigRagdoll);
  const visibleRigStrikePlayers = activePlayers.filter((player) => {
    const debug = visibleVisualDebug.get(player.id);
    return debug ? debug.rigStrike !== "none" && debug.rigStrikePulse > 0 : false;
  });
  const visibleRiggedBots = visibleBots.filter((player) => visibleVisualDebug.get(player.id)?.characterAttached);
  const activeRagdollBots = activeBots.filter((player) => player.ragdoll);
  const activeStrikeBots = recentStrikePlayers.filter((player) => player.controller === "bot");
  document.documentElement.dataset.snapshotPlayers = String(state.players.length);
  document.documentElement.dataset.snapshotActivePlayers = String(activePlayers.length);
  document.documentElement.dataset.snapshotBotPlayers = String(botPlayers.length);
  document.documentElement.dataset.snapshotActiveBots = String(activeBots.length);
  document.documentElement.dataset.visiblePlayers = String(visibleVisuals.length);
  document.documentElement.dataset.visibleBots = String(visibleBots.length);
  document.documentElement.dataset.hiddenActivePlayers = String(hiddenActivePlayers.length);
  document.documentElement.dataset.botsRuntimeVisible = String(activeBots.length > 0 && visibleBots.length === activeBots.length);
  document.documentElement.dataset.visibleRiggedBots = String(visibleRiggedBots.length);
  document.documentElement.dataset.botsCharactersVisible = String(activeBots.length > 0 && visibleRiggedBots.length === activeBots.length);
  document.documentElement.dataset.activeRagdollPlayers = String(activePlayers.filter((player) => player.ragdoll).length);
  document.documentElement.dataset.visibleRagdollPlayers = String(visibleRagdollPlayers.length);
  document.documentElement.dataset.visibleRigRagdollPlayers = String(visibleRigRagdollPlayers.length);
  document.documentElement.dataset.botRagdollCount = String(activeRagdollBots.length);
  document.documentElement.dataset.visibleBotRagdollCount = String(visibleRagdollPlayers.filter((player) => player.controller === "bot").length);
  document.documentElement.dataset.activeStrikePlayers = String(recentStrikePlayers.length);
  document.documentElement.dataset.visibleStrikePlayers = String(visibleStrikePlayers.length);
  document.documentElement.dataset.visibleRigStrikePlayers = String(visibleRigStrikePlayers.length);
  document.documentElement.dataset.botStrikeCount = String(activeStrikeBots.length);
  document.documentElement.dataset.visibleBotStrikeCount = String(visibleStrikePlayers.filter((player) => player.controller === "bot").length);
  document.documentElement.dataset.activeSprintingPlayers = String(activePlayers.filter((player) => player.sprinting).length);
  document.documentElement.dataset.botSprintingCount = String(activeBots.filter((player) => player.sprinting).length);
  document.documentElement.dataset.activeExhaustedPlayers = String(activePlayers.filter((player) => player.exhausted).length);
  document.documentElement.dataset.botExhaustedCount = String(activeBots.filter((player) => player.exhausted).length);
  document.documentElement.dataset.activeStaminaMin = String(activeStaminaStats.min);
  document.documentElement.dataset.activeStaminaMax = String(activeStaminaStats.max);
  document.documentElement.dataset.botStaminaMin = String(botStaminaStats.min);
  document.documentElement.dataset.botStaminaMax = String(botStaminaStats.max);
  document.documentElement.dataset.snapshotReceived = "true";
  document.documentElement.dataset.snapshotServerVersion = state.version;
  document.documentElement.dataset.playerRig = free3dCharacterHydrated
    ? "free3d-skinned-character-controller"
    : "procedural-animated-footballer-loading";
  document.documentElement.dataset.animatedPlayers = String(visibleVisuals.length);
  document.documentElement.dataset.celebrationVisible = String(visibleCelebrations > 0);
  document.documentElement.dataset.celebrationVisibleCount = String(visibleCelebrations);
  weatherLayer.update(state.weather, time);
  courtyardEnvironmentRuntime?.update(state, deltaSeconds);
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
    } else if (event.kind === "celebration") {
      audio.playCelebration(event.celebration, {
        pan: event.position.x / (FIELD_WIDTH / 2),
        isLocal: event.playerId === localJoin?.id
      });
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
  const lightingState = renderedState ?? latestState;
  const runtimeSettings = lightingState?.settings;
  const cycleSeconds = Math.max(1, runtimeSettings?.dayCycleSeconds ?? DAY_CYCLE_SECONDS);
  const startSeconds = runtimeSettings?.dayStartSeconds ?? DAY_START_SECONDS;
  const serverDayTime = lightingState?.dayTimeSeconds;
  const fallbackCycleSeconds = qaDayCycleSeconds === null ? elapsedSeconds : qaDayCycleSeconds + elapsedSeconds;
  const fallbackDayTime = startSeconds + fallbackCycleSeconds / cycleSeconds * 24 * 60 * 60;
  const daySeconds = serverDayTime ?? fallbackDayTime;
  const dayTime = THREE.MathUtils.euclideanModulo(daySeconds, 24 * 60 * 60);
  const visual = runtimeSettings?.visual ?? DEFAULT_VISUAL_SETTINGS;
  applyRegisteredVisualMaterials(visual);
  const lighting = applyVisualLighting(visualRig, {
    visual,
    dayTimeSeconds: dayTime,
    elapsedSeconds,
    weather: lightingState?.weather ?? null,
    reduceEffects: settings.graphics.reduceEffects,
    shadowsEnabled: settings.graphics.shadows,
    multipliers: {
      sunIntensity: runtimeSettings?.sunIntensity ?? 1,
      moonIntensity: runtimeSettings?.moonIntensity ?? 1,
      ambientIntensity: runtimeSettings?.ambientIntensity ?? 1,
      floodlightIntensity: runtimeSettings?.floodlightIntensity ?? 1,
      toneMappingExposure: runtimeSettings?.toneMappingExposure ?? 1
    },
    dataset: document.documentElement.dataset
  });
  document.documentElement.dataset.dayCycleSeconds = THREE.MathUtils.euclideanModulo((lighting.solarCycle - 0.25) * cycleSeconds, cycleSeconds).toFixed(2);
  document.documentElement.dataset.dayTimeSeconds = dayTime.toFixed(1);
  document.documentElement.dataset.dayCycleSource = serverDayTime === undefined ? "fallback-animated" : "server";
  document.documentElement.dataset.dayCycleLengthSeconds = String(cycleSeconds);
  document.documentElement.dataset.darkHours = DARK_HOURS_LABEL;
  document.documentElement.dataset.twilightHours = TWILIGHT_HOURS_LABEL;
  document.documentElement.dataset.sunFramed = "false";
  document.documentElement.dataset.moonFramed = "false";
}

function updateCamera(delta: number) {
  const cameraState = renderedState ?? latestState;
  const localPlayer = cameraState?.players.find((item) => item.id === localJoin?.id && item.role === "player") ?? null;
  const fallbackPlayer = cameraState?.players.find((item) => item.role === "player") ?? null;
  const player = localPlayer ?? fallbackPlayer;
  const team: TeamId | null = player?.team ?? localJoin?.team ?? null;
  const safeDelta = Math.min(delta, 0.05);
  const nextAnchorId = player?.id ?? (cameraState ? "ball-fallback" : "origin");

  if (player) {
    cameraRawAnchor.set(player.position.x, 1.0, player.position.z);
    cameraVelocity.set(player.velocity.x, 0, player.velocity.z);
  } else if (cameraState) {
    cameraRawAnchor.set(cameraState.ball.position.x, 1.0, cameraState.ball.position.z);
    cameraVelocity.set(0, 0, 0);
  } else {
    cameraRawAnchor.set(0, 1.0, 0);
    cameraVelocity.set(0, 0, 0);
  }

  const rawAnchorDistance = cameraSmoothedAnchor.distanceTo(cameraRawAnchor);
  if (!cameraFollowInitialized || cameraAnchorId !== nextAnchorId || rawAnchorDistance > 10) {
    cameraAnchorId = nextAnchorId;
    cameraSmoothedAnchor.copy(cameraRawAnchor);
    cameraPreviousSmoothedAnchor.copy(cameraSmoothedAnchor);
    cameraMeasuredVelocity.set(0, 0, 0);
    cameraSmoothedVelocity.set(0, 0, 0);
    cameraSmoothedLead.set(0, 0, 0);
  } else {
    cameraPreviousSmoothedAnchor.copy(cameraSmoothedAnchor);
    cameraSmoothedAnchor.lerp(cameraRawAnchor, 1 - Math.exp(-safeDelta * 7.2));
    cameraMeasuredVelocity.copy(cameraSmoothedAnchor).sub(cameraPreviousSmoothedAnchor).multiplyScalar(1 / Math.max(safeDelta, 0.001));
    cameraSmoothedVelocity.lerp(cameraMeasuredVelocity, 1 - Math.exp(-safeDelta * 8.8));
  }

  const speed = Math.hypot(cameraSmoothedVelocity.x, cameraSmoothedVelocity.z);
  if (speed > 0.35) {
    cameraDesiredLead.copy(cameraSmoothedVelocity).multiplyScalar(1 / Math.max(speed, 0.001));
    cameraDesiredLead.multiplyScalar(THREE.MathUtils.clamp(speed * 0.28, 0, 2.6));
  } else {
    cameraDesiredLead.set(0, 0, 0);
  }
  cameraSmoothedLead.lerp(cameraDesiredLead, 1 - Math.exp(-safeDelta * 3.4));

  const attackDirection = team === 1 ? -1 : 1;
  const shake = settings.graphics.cameraShake ? cameraImpulse : 0;
  cameraLookTarget.copy(cameraSmoothedAnchor).add(cameraSmoothedLead);
  cameraLookTarget.y = 1.05;
  const cameraDistance = THREE.MathUtils.clamp(
    cameraState?.settings?.cameraDistance ?? DEFAULT_GAME_SETTINGS.cameraDistance,
    8,
    24
  );
  const cameraHeight = Math.max(7.2, cameraDistance * 0.82 + 1.7);
  cameraDesired.set(
    cameraSmoothedAnchor.x + cameraSmoothedLead.x * 0.32,
    cameraHeight + Math.min(speed * 0.03, 0.45) + shake * 0.36,
    cameraSmoothedAnchor.z - attackDirection * (cameraDistance + Math.min(speed * 0.045, 0.9) + shake * 0.22) + cameraSmoothedLead.z * 0.18
  );

  if (!cameraFollowInitialized) {
    camera.position.copy(cameraDesired);
    cameraLookAt.copy(cameraLookTarget);
    cameraFollowInitialized = true;
  } else {
    camera.position.lerp(cameraDesired, 1 - Math.exp(-safeDelta * 5.4));
    cameraLookAt.lerp(cameraLookTarget, 1 - Math.exp(-safeDelta * 7.8));
  }
  camera.lookAt(cameraLookAt);
  cameraImpulse = Math.max(0, cameraImpulse - safeDelta * 2.8);
  document.documentElement.dataset.cameraMode = "player-anchored-lerp-anchor";
  document.documentElement.dataset.cameraAnchor = player?.id ?? "ball-fallback";
  document.documentElement.dataset.cameraLead = cameraSmoothedLead.length().toFixed(2);
  document.documentElement.dataset.cameraAnchorSmoothing = "lerped-authoritative-player-offset-no-bone-follow";
  document.documentElement.dataset.cameraAnchorOffset = cameraSmoothedAnchor.distanceTo(cameraRawAnchor).toFixed(2);
  document.documentElement.dataset.cameraFollowSpeed = speed.toFixed(2);
  document.documentElement.dataset.cameraDistance = cameraDistance.toFixed(2);
  document.documentElement.dataset.cameraHeight = cameraHeight.toFixed(2);
}

function getPlayerOffscreenIndicator(player: PlayerSnapshot): HTMLElement {
  let indicator = playerOffscreenIndicators.get(player.id);
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "offscreen-indicator player";
    indicator.innerHTML = '<i class="indicator-arrow"></i><b></b>';
    playersOffscreenIndicatorsEl.append(indicator);
    playerOffscreenIndicators.set(player.id, indicator);
  }
  indicator.classList.toggle("team-blue", player.team === 0);
  indicator.classList.toggle("team-orange", player.team === 1);
  indicator.title = displayPlayerName(player.name);
  return indicator;
}

function placeOffscreenIndicator(
  indicator: HTMLElement,
  position: { x: number; y: number; z: number },
  edgePadding: { x: number; y: number }
): boolean {
  offscreenWorld.set(position.x, position.y, position.z);
  offscreenDirection.copy(offscreenWorld).sub(camera.position);
  camera.getWorldDirection(cameraForward);
  offscreenProjected.copy(offscreenWorld).project(camera);

  const inFront = offscreenDirection.dot(cameraForward) > 0;
  const inView = inFront
    && offscreenProjected.z >= -1
    && offscreenProjected.z <= 1
    && Math.abs(offscreenProjected.x) <= 0.94
    && Math.abs(offscreenProjected.y) <= 0.9;
  if (inView) {
    indicator.hidden = true;
    return false;
  }

  let screenX = inFront ? offscreenProjected.x : -offscreenProjected.x;
  let screenY = inFront ? offscreenProjected.y : -offscreenProjected.y;
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY) || Math.hypot(screenX, screenY) < 0.001) {
    screenX = 0;
    screenY = 1;
  }

  const scale = Math.min(
    edgePadding.x / Math.max(Math.abs(screenX), 0.001),
    edgePadding.y / Math.max(Math.abs(screenY), 0.001)
  );
  const edgeX = screenX * scale;
  const edgeY = screenY * scale;
  const pixelX = (edgeX * 0.5 + 0.5) * window.innerWidth;
  const pixelY = (-edgeY * 0.5 + 0.5) * window.innerHeight;
  const angle = Math.atan2(-edgeY, edgeX) * THREE.MathUtils.RAD2DEG;

  indicator.hidden = false;
  indicator.style.left = `${pixelX}px`;
  indicator.style.top = `${pixelY}px`;
  indicator.style.setProperty("--indicator-angle", `${angle}deg`);
  return true;
}

function updateOffscreenIndicators(state: ServerState | null): void {
  if (!state) {
    ballOffscreenIndicatorEl.hidden = true;
    for (const indicator of playerOffscreenIndicators.values()) indicator.hidden = true;
    document.documentElement.dataset.ballOffscreen = "false";
    document.documentElement.dataset.offscreenPlayers = "0";
    return;
  }

  camera.updateMatrixWorld();
  const ballOffscreen = placeOffscreenIndicator(ballOffscreenIndicatorEl, state.ball.position, { x: 0.76, y: 0.38 });
  const localId = localJoin?.id ?? "";
  const seenPlayers = new Set<string>();
  let offscreenPlayers = 0;

  for (const player of state.players) {
    if (player.role !== "player" || player.id === localId) continue;
    const indicator = getPlayerOffscreenIndicator(player);
    const isOffscreen = placeOffscreenIndicator(
      indicator,
      { x: player.position.x, y: 1.25, z: player.position.z },
      { x: 0.86, y: 0.76 }
    );
    seenPlayers.add(player.id);
    if (isOffscreen) offscreenPlayers += 1;
  }
  for (const [id, indicator] of playerOffscreenIndicators) {
    if (!seenPlayers.has(id)) indicator.hidden = true;
  }

  document.documentElement.dataset.ballOffscreen = String(ballOffscreen);
  document.documentElement.dataset.offscreenPlayers = String(offscreenPlayers);
}

function mobileButtonFromEvent(event: PointerEvent): HTMLButtonElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>("[data-mobile-dir],[data-mobile-action]")
    : null;
}

function onMobilePointerDown(event: PointerEvent): void {
  const movePad = event.target instanceof Element
    ? event.target.closest<HTMLElement>(".mobile-move-pad")
    : null;
  const button = mobileButtonFromEvent(event);
  if ((!button && !movePad) || settingsOpen) return;
  unlockAudio();
  event.preventDefault();
  event.stopPropagation();
  canvas.focus();
  if (movePad) {
    mobileMovePointerId = event.pointerId;
    updateMobileMoveVector(event);
    markControlHintsUsed("move");
    try {
      mobileMovePadEl.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; release/cancel still reset the movement state.
    }
    updateResolvedInput();
    sendInput(true);
    return;
  }

  if (!button) return;
  try {
    button.setPointerCapture(event.pointerId);
  } catch {
    // Some browsers reject capture for already-ended touches.
  }

  if (button.dataset.mobileDir) {
    mobileDirectionPointers.set(event.pointerId, button.dataset.mobileDir as MobileDirection);
    markControlHintsUsed("move");
    updateResolvedInput();
    sendInput(true);
    return;
  }

  const action = button.dataset.mobileAction as MobileAction | undefined;
  if (!action) return;
  mobileActionPointers.set(event.pointerId, action);
  markInputActionHintUsed(action);
  document.documentElement.dataset.mobileLastAction = action;
  document.documentElement.dataset.mobileLastActionAt = String(Math.round(performance.now()));
  if (action === "sprint") {
    updateResolvedInput();
  } else if (action === "jump") {
    input.jump += 1;
  } else if (action === "leftKick") {
    if (!leftKickChargingByPointer) beginLeftKickCharge(event.pointerId);
  } else if (action === "rightKick") {
    if (!rightKickChargingByPointer) beginRightKickCharge(event.pointerId);
  } else if (action === "headHit") {
    input.head += 1;
  }
  sendInput(true);
  syncMobileControlsUi();
}

function onMobilePointerMove(event: PointerEvent): void {
  if (event.pointerId !== mobileMovePointerId) return;
  event.preventDefault();
  event.stopPropagation();
  updateMobileMoveVector(event);
  updateResolvedInput();
  sendInput(true);
}

function finishMobilePointer(pointerId: number, cancel = false): void {
  const action = mobileActionPointers.get(pointerId);
  const hadDirection = mobileDirectionPointers.delete(pointerId);
  const hadAction = mobileActionPointers.delete(pointerId);
  const hadMoveVector = pointerId === mobileMovePointerId;
  if (hadMoveVector) resetMobileMoveVector();
  if (action === "leftKick") {
    if (cancel) cancelLeftKickCharge();
    else releaseLeftKickCharge(pointerId);
  } else if (action === "rightKick") {
    if (cancel) cancelRightKickCharge();
    else releaseRightKickCharge(pointerId);
  }
  if (!hadDirection && !hadAction && !hadMoveVector) return;
  updateResolvedInput();
  sendInput(true);
}

function clearMobileControls(): void {
  if (mobileDirectionPointers.size === 0 && mobileActionPointers.size === 0 && mobileMovePointerId === null) return;
  mobileDirectionPointers.clear();
  mobileActionPointers.clear();
  resetMobileMoveVector();
  if (leftKickChargingByPointer) cancelLeftKickCharge();
  if (rightKickChargingByPointer) cancelRightKickCharge();
  updateResolvedInput();
  sendInput(true);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  syncMobileControlsUi();
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
  if (!settingsOpen && event.code === "Enter") {
    event.preventDefault();
    if (document.activeElement === chatInputEl) submitChat();
    else openChat();
    return;
  }
  if (!settingsOpen && event.code === "Escape" && isChatFocused()) {
    event.preventDefault();
    closeChat();
    return;
  }
  if (isChatFocused()) return;
  if (actionPressed(settings.controls, "settings", new Set([event.code]))) {
    event.preventDefault();
    markControlHintsUsed("menu");
    setSettingsOpen(!settingsOpen);
    return;
  }
  if (settingsOpen) return;
  pressedCodes.add(event.code);
  if (!event.repeat) {
    markHintsForPressedCodes(new Set([event.code]));
    if (actionPressed(settings.controls, "leftKick", new Set([event.code]))) {
      if (!leftKickChargingByPointer) beginLeftKickCharge(-1);
    }
    if (actionPressed(settings.controls, "rightKick", new Set([event.code]))) {
      if (!rightKickChargingByPointer) beginRightKickCharge(-2);
    }
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
  if (isChatFocused()) return;
  pressedCodes.delete(event.code);
  if (actionPressed(settings.controls, "leftKick", new Set([event.code]))) releaseLeftKickCharge(-1);
  if (actionPressed(settings.controls, "rightKick", new Set([event.code]))) releaseRightKickCharge(-2);
  updateResolvedInput();
  sendInput(true);
});

settingsButton.addEventListener("click", () => {
  markControlHintsUsed("menu");
  setSettingsOpen(true);
});
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
chatFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitChat();
});
chatInputEl.addEventListener("focus", () => {
  chatPanelEl.classList.add("active");
  document.documentElement.dataset.chatActive = "true";
});
chatInputEl.addEventListener("blur", () => {
  if (document.activeElement && chatPanelEl.contains(document.activeElement)) return;
  chatPanelEl.classList.remove("active");
  document.documentElement.dataset.chatActive = "false";
});
emotionWheelEl.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-emotion]") : null;
  if (target?.dataset.emotion) {
    const index = EMOTION_CHOICES.findIndex((choice) => choice.id === target.dataset.emotion);
    if (index >= 0) emotionWheelSelectedIndex = index;
  }
  event.preventDefault();
  applySelectedEmotion();
});
for (const element of [profileNameInput, profileSkinSelect, profilePicInput]) {
  element.addEventListener("input", () => {
    if (readProfileUi()) scheduleProfileSend();
  });
  element.addEventListener("change", () => {
    if (readProfileUi()) sendProfileUpdate();
  });
}
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
mobileControlsEl.addEventListener("pointerdown", onMobilePointerDown);
mobileControlsEl.addEventListener("pointermove", onMobilePointerMove);
mobileControlsEl.addEventListener("pointerup", (event) => {
  event.preventDefault();
  event.stopPropagation();
  finishMobilePointer(event.pointerId);
});
mobileControlsEl.addEventListener("pointercancel", (event) => {
  event.preventDefault();
  event.stopPropagation();
  finishMobilePointer(event.pointerId, true);
});
mobileControlsEl.addEventListener("lostpointercapture", (event) => {
  event.preventDefault();
  event.stopPropagation();
  finishMobilePointer(event.pointerId, true);
});
canvas.addEventListener("pointerdown", (event) => {
  if (emotionWheelOpen) {
    event.preventDefault();
    applySelectedEmotion();
    return;
  }
  canvas.focus();
  if (settingsOpen) return;
  if (isChatFocused()) return;
  const mouseCodes = new Set([`Mouse${event.button}`]);
  let handled = false;
  if (actionPressed(settings.controls, "leftKick", mouseCodes)) {
    markControlHintsUsed("leftKick");
    beginLeftKickCharge(event.pointerId);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; release/cancel handlers still cover the input.
    }
    handled = true;
  }
  if (actionPressed(settings.controls, "rightKick", mouseCodes)) {
    markControlHintsUsed("rightKick");
    beginRightKickCharge(event.pointerId);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; release/cancel handlers still cover the input.
    }
    handled = true;
  }
  if (actionPressed(settings.controls, "headHit", mouseCodes)) {
    markControlHintsUsed("headHit");
    input.head += 1;
    handled = true;
  }
  if (!handled) return;
  event.preventDefault();
  sendInput(true);
});
canvas.addEventListener("pointerup", (event) => {
  const released = releaseLeftKickCharge(event.pointerId) || releaseRightKickCharge(event.pointerId);
  if (!released) return;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  event.preventDefault();
  sendInput(true);
});
canvas.addEventListener("pointercancel", (event) => {
  let cancelled = false;
  if (event.pointerId === leftKickChargingPointerId) {
    cancelLeftKickCharge();
    cancelled = true;
  }
  if (event.pointerId === rightKickChargingPointerId) {
    cancelRightKickCharge();
    cancelled = true;
  }
  if (cancelled) sendInput(true);
});
canvas.addEventListener("lostpointercapture", (event) => {
  let cancelled = false;
  if (event.pointerId === leftKickChargingPointerId) {
    cancelLeftKickCharge();
    cancelled = true;
  }
  if (event.pointerId === rightKickChargingPointerId) {
    cancelRightKickCharge();
    cancelled = true;
  }
  if (cancelled) sendInput(true);
});
canvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
canvas.addEventListener("wheel", (event) => {
  unlockAudio();
  event.preventDefault();
  if (settingsOpen || isChatFocused()) return;
  if (emotionWheelOpen) {
    openOrCycleEmotionWheel(event.deltaY);
    return;
  }
  markControlHintsUsed("headHit");
  input.head += 1;
  sendInput(true);
}, { passive: false });

addEventListener("resize", resize);
addEventListener("blur", () => {
  if (mobileDirectionPointers.size > 0 || mobileActionPointers.size > 0) {
    clearMobileControls();
    return;
  }
  if (leftKickChargingByPointer) {
    cancelLeftKickCharge();
    sendInput(true);
  }
  if (rightKickChargingByPointer) {
    cancelRightKickCharge();
    sendInput(true);
  }
});
addEventListener("pagehide", () => {
  const clientId = transportMode === "http" ? httpClientId : localJoin?.id;
  if (!clientId) return;
  const body = JSON.stringify({ clientId });
  navigator.sendBeacon(`${serverApiBase()}/leave`, new Blob([body], { type: "application/json" }));
});
resize();
initializeProfileControls();
connect();

function runFrame(time: number) {
  lastRenderFrameAt = performance.now();
  const seconds = time * 0.001;
  const delta = lastFrameSeconds > 0 ? Math.min(0.05, seconds - lastFrameSeconds) : 1 / 60;
  lastFrameSeconds = seconds;
  syncLeftKickChargeDataset(time);
  sendInput();
  renderedState = selectRenderState(seconds);
  document.documentElement.dataset.interpolationBuffer = String(stateHistory.length);
  document.documentElement.dataset.interpolationDelayMs = String(Math.round(STATE_INTERPOLATION_DELAY_SECONDS * 1000));
  document.documentElement.dataset.interpolationAlpha = interpolationAlpha.toFixed(3);
  document.documentElement.dataset.interpolationRenderAgeMs = String(Math.round(interpolationRenderAgeMs));
  document.documentElement.dataset.localPredictionMs = String(Math.round(localPredictionLeadMs));
  document.documentElement.dataset.localMoveSpeed = localPredictionMoveSpeed.toFixed(3);
  document.documentElement.dataset.localMoveAxis = localPredictionMoveAxisMagnitude.toFixed(3);
  if (renderedState) applyState(renderedState, seconds, delta);
  updateLighting(seconds);
  updateCamera(delta);
  updateOffscreenIndicators(renderedState ?? latestState);
  positionEmotionWheel();
  renderer.render(scene, camera);
}

function frame(time: number) {
  requestAnimationFrame(frame);
  runFrame(time);
}

requestAnimationFrame(frame);
window.setInterval(() => {
  if (performance.now() - lastRenderFrameAt < 250) return;
  document.documentElement.dataset.rafFallbackTick = String(Math.round(performance.now()));
  runFrame(performance.now());
}, 250);
