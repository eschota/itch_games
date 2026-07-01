import * as THREE from "three";
import {
  BALL_RADIUS,
  DAY_CYCLE_SECONDS,
  DEFAULT_INPUT,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_VERSION,
  GOAL_DEPTH,
  GOAL_WIDTH,
  PLAYER_HEIGHT,
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
        interpolation: {
          bufferedStates: number;
          delayMs: number;
          alpha: number;
          renderAgeMs: number;
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
const versionBadge = requireElement<HTMLElement>("#version-badge");
const BUILD_WEIGHT_LABEL = "0.56 MB";

versionBadge.textContent = `${GAME_VERSION} • ${BUILD_WEIGHT_LABEL}`;
document.documentElement.dataset.gameVersion = GAME_VERSION;
document.documentElement.dataset.gameWeightLabel = BUILD_WEIGHT_LABEL;
document.documentElement.dataset.environment = "residential-courtyard";

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
  new THREE.MeshBasicMaterial({ color: 0xfff1d0 })
);
scene.add(sunMesh);

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

const fieldGroup = new THREE.Group();
scene.add(fieldGroup);
buildField(fieldGroup);
const weatherLayer = new WeatherVisualLayer({ scene, fieldWidth: FIELD_WIDTH, fieldLength: FIELD_LENGTH });

const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.5, metalness: 0.03 });
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 18),
  ballMaterial
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);
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
  right: {
    color: 0xff9d42,
    opacity: 0.66,
    scale: [1.15, 0.8, 2.35],
    ballPulse: 0.78,
    cameraImpulse: 0.56
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
const stateHistory: Array<{ state: ServerState; receivedAt: number }> = [];

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
    interpolation: {
      bufferedStates: stateHistory.length,
      delayMs: Math.round(STATE_INTERPOLATION_DELAY_SECONDS * 1000),
      alpha: Number(interpolationAlpha.toFixed(3)),
      renderAgeMs: Math.round(interpolationRenderAgeMs)
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
        return new THREE.Vector3(Math.cos(a) * 3.2, 0.07, Math.sin(a) * 3.2);
      })
    ),
    new THREE.LineBasicMaterial({ color: 0xe9fff3 })
  );
  root.add(circle);

  addGoal(root, -1);
  addGoal(root, 1);
  addStadiumFrame(root);
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
  const z = side * (FIELD_LENGTH / 2 + GOAL_DEPTH / 2);
  const postGeometry = new THREE.BoxGeometry(0.18, 2.1, 0.18);
  const barGeometry = new THREE.BoxGeometry(GOAL_WIDTH + 0.35, 0.18, 0.18);
  const netMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.26 });
  [-GOAL_WIDTH / 2, GOAL_WIDTH / 2].forEach((x) => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, 1.05, z);
    post.castShadow = true;
    root.add(post);
  });
  const bar = new THREE.Mesh(barGeometry, material);
  bar.position.set(0, 2.05, z);
  root.add(bar);

  const net = new THREE.Mesh(new THREE.BoxGeometry(GOAL_WIDTH, 2.05, GOAL_DEPTH), netMaterial);
  net.position.set(0, 1.02, z + side * GOAL_DEPTH / 2);
  root.add(net);
}

class PlayerVisual {
  readonly root = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly ring: THREE.Mesh;
  private readonly contactFlash: THREE.Mesh;
  private readonly contactFlashMaterial: THREE.MeshBasicMaterial;

  constructor(private readonly snapshot: PlayerSnapshot) {
    const color = teamColor(snapshot.team);
    const variant = snapshot.index % 4;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x101614, roughness: 0.5 });

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 + variant * 0.025, 0.72, 6, 12), bodyMaterial);
    this.body.position.y = 0.95;
    this.body.castShadow = true;
    this.root.add(this.body);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf1c7a7 }));
    this.head.position.y = 1.66;
    this.head.castShadow = true;
    this.root.add(this.head);

    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), accent);
    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), accent);
    this.leftLeg.position.set(-0.18, 0.32, 0);
    this.rightLeg.position.set(0.18, 0.32, 0);
    this.leftLeg.castShadow = true;
    this.rightLeg.castShadow = true;
    this.root.add(this.leftLeg, this.rightLeg);

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
    this.update(snapshot, 0);
  }

  update(snapshot: PlayerSnapshot, time: number) {
    this.root.position.set(snapshot.position.x, snapshot.position.y - PLAYER_HEIGHT / 2, snapshot.position.z);
    this.root.rotation.y = snapshot.yaw;
    this.root.visible = snapshot.role === "player";
    const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    const swing = Math.sin(time * 8.5 + snapshot.index) * Math.min(0.65, speed * 0.08);
    const actionAge = Math.max(0, Date.now() - snapshot.lastActionAt);
    const actionPulse = THREE.MathUtils.clamp(1 - actionAge / 260, 0, 1);
    const kickArc = Math.sin(actionPulse * Math.PI);

    this.leftLeg.rotation.set(swing, 0, 0);
    this.rightLeg.rotation.set(-swing, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.z = 0;
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
      this.leftLeg.rotation.x = -1.05 * kickArc;
      this.leftLeg.rotation.z = -0.32 * kickArc;
      this.contactFlash.position.set(-0.4, 0.36, 0.34);
    } else if (snapshot.lastAction === "right") {
      this.rightLeg.rotation.x = -1.05 * kickArc;
      this.rightLeg.rotation.z = 0.32 * kickArc;
      this.contactFlash.position.set(0.4, 0.36, 0.34);
    } else if (snapshot.lastAction === "head") {
      this.head.rotation.x = -0.72 * kickArc;
      this.contactFlash.position.set(0, 1.64, 0.36);
    } else if (snapshot.lastAction === "body") {
      this.body.rotation.x = -0.28 * kickArc;
      this.body.position.z = 0.16 * kickArc;
      this.contactFlash.position.set(0, 1.08, 0.42);
    } else {
      this.contactFlash.visible = false;
      this.body.position.z = 0;
    }

    const actionScale = 1 + actionPulse * (snapshot.lastAction === "body" ? 0.24 : 0.14);
    this.body.scale.setScalar(actionScale);
    this.ring.scale.setScalar(1 + actionPulse * 0.18);
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
  }
  statusEl.textContent = localJoin.role === "player"
    ? `\u0412\u044b \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0435 ${teamNameLabel(localJoin.team)} #${localJoin.index + 1}.`
    : "\u0420\u0435\u0436\u0438\u043c \u0437\u0440\u0438\u0442\u0435\u043b\u044f/\u0442\u0435\u0441\u0442\u0435\u0440\u0430.";
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
    statusEl.textContent = "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e. WASD - \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435, \u041b\u041a\u041c/\u041f\u041a\u041c - \u0443\u0434\u0430\u0440 \u043d\u043e\u0433\u043e\u0439, \u043a\u043e\u043b\u0435\u0441\u043e - \u0443\u0434\u0430\u0440 \u0433\u043e\u043b\u043e\u0432\u043e\u0439.";
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
  });
  wsChannel.on("joined", (data) => {
    acceptJoin(data as JoinAccepted);
  });
  wsChannel.on("server-full", () => {
    statusEl.textContent = "\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d.";
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
  try {
    const payload = await postJson<{ ok: boolean; joined: JoinAccepted; state: ServerState }>("join", { name });
    httpClientId = payload.joined.id;
    connected = true;
    audio.playConnection(true);
    acceptJoin(payload.joined);
    receiveState(payload.state);
    document.documentElement.dataset.transport = `http:${reason}`;
    void pollHttpState(generation);
  } catch (error) {
    connected = false;
    transportMode = "none";
    statusEl.textContent = "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0441\u0435\u0440\u0432\u0435\u0440.";
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
  stateHistory.push({ state, receivedAt: performance.now() * 0.001 });
  while (stateHistory.length > STATE_HISTORY_LIMIT) stateHistory.shift();
  observeAudioState(state);
}

function selectRenderState(nowSeconds: number): ServerState | null {
  if (!latestState) return null;
  if (stateHistory.length < 2) {
    interpolationAlpha = 1;
    interpolationRenderAgeMs = 0;
    return latestState;
  }

  const targetTime = nowSeconds - STATE_INTERPOLATION_DELAY_SECONDS;
  let from = stateHistory[0];
  let to = stateHistory[stateHistory.length - 1];

  if (targetTime <= from.receivedAt) {
    interpolationAlpha = 0;
    interpolationRenderAgeMs = (nowSeconds - from.receivedAt) * 1000;
    return from.state;
  }

  if (targetTime >= to.receivedAt) {
    interpolationAlpha = 1;
    interpolationRenderAgeMs = (nowSeconds - to.receivedAt) * 1000;
    return to.state;
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
  return interpolateState(from.state, to.state, alpha);
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
    velocity: lerpVec3(from.velocity, to.velocity, alpha)
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
  const countdown = state.countdown > 0 ? ` \u0420\u043e\u0437\u044b\u0433\u0440\u044b\u0448 \u0447\u0435\u0440\u0435\u0437 ${(state.countdown / 1000).toFixed(1)}\u0441.` : "";
  const message = translateServerMessage(state.message);
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
  weatherEl.textContent =
    `\u041f\u043e\u0433\u043e\u0434\u0430: ${weather.label} ` +
    `\u2022 ${Math.round(weather.intensity * 100)}% ` +
    `\u2022 \u0432\u0435\u0442\u0435\u0440 ${wind.toFixed(1)} ` +
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
  ballMesh.position.set(state.ball.position.x, state.ball.position.y, state.ball.position.z);
  ballMesh.rotation.x += state.ball.velocity.z * 0.01;
  ballMesh.rotation.z -= state.ball.velocity.x * 0.01;
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
  weatherLayer.update(state.weather, time);
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
    weatherIntensity: state.weather?.intensity ?? 0,
    hazardDrag: ballHazard ? ballHazard.strength : 0
  });
  syncAudioDebugDataset();
}

function updateLighting(elapsedSeconds: number) {
  const daySeconds = qaDayCycleSeconds ?? elapsedSeconds;
  const cycle = (daySeconds % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
  const angle = cycle * Math.PI * 2 - Math.PI * 0.22;
  const daylight = THREE.MathUtils.smoothstep(Math.sin(angle), -0.24, 0.82);
  const sunset = Math.max(0, 1 - Math.abs(Math.sin(angle)) * 3.2) * (1 - daylight * 0.45);
  sun.position.set(Math.cos(angle) * 24, Math.max(2.2, Math.sin(angle) * 24), Math.sin(angle + 0.55) * 18);
  sun.target.position.set(0, 0, 0);
  sunMesh.position.copy(sun.position).multiplyScalar(1.7);
  sunColor.copy(dayColor).lerp(sunsetColor, sunset).lerp(nightColor, 1 - daylight);
  skyColor.copy(nightColor).lerp(dayColor, daylight).lerp(sunsetColor, sunset * 0.36);
  const snowIntensity = (renderedState ?? latestState)?.weather?.intensity ?? 0;
  fogColor.copy(fogNightColor).lerp(fogDayColor, daylight).lerp(sunsetColor, sunset * 0.22).lerp(snowFogColor, snowIntensity * 0.14);
  sun.color.copy(sunColor);
  sun.intensity = 0.32 + daylight * 2.6 + sunset * 0.75;
  hemi.intensity = 0.38 + daylight * 1.45;
  rimLight.color.copy(fogColor);
  rimLight.intensity = 0.28 + (1 - daylight) * 0.72 + sunset * 0.24;
  for (const flood of floodLights) {
    flood.intensity = 0.12 + (1 - daylight) * 1.18;
    flood.color.set(daylight > 0.55 ? 0xc6dbff : 0xe7f0ff);
  }
  renderer.toneMappingExposure = 0.78 + daylight * 0.58 + sunset * 0.14;
  scene.background = skyColor;
  skyMaterial.color.copy(skyColor).lerp(fogColor, 0.18);
  if (scene.fog) {
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(fogColor);
    fog.near = 24 + daylight * 8;
    fog.far = 54 + daylight * 18 - snowIntensity * 6;
  }
  (sunMesh.material as THREE.MeshBasicMaterial).color.copy(sunColor);
  sunMesh.scale.setScalar(0.82 + daylight * 0.34 + sunset * 0.28);
  document.documentElement.dataset.dayCycleSeconds = THREE.MathUtils.euclideanModulo(daySeconds, DAY_CYCLE_SECONDS).toFixed(2);
  document.documentElement.dataset.daylight = daylight.toFixed(3);
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
  cameraLookTarget.x = THREE.MathUtils.clamp(cameraLookTarget.x, -FIELD_WIDTH * 0.44, FIELD_WIDTH * 0.44);
  cameraLookTarget.z = THREE.MathUtils.clamp(cameraLookTarget.z, -FIELD_LENGTH * 0.48, FIELD_LENGTH * 0.48);

  const yawBackX = -Math.sin(yaw) * 3.5;
  const tacticalBackZ = -attackDirection * (12.5 + cameraImpulse * 1.3);
  cameraDesired.set(
    THREE.MathUtils.clamp(cameraLookTarget.x + yawBackX, -FIELD_WIDTH * 0.52, FIELD_WIDTH * 0.52),
    14.5 + cameraImpulse * 1.4,
    THREE.MathUtils.clamp(cameraLookTarget.z + tacticalBackZ, -FIELD_LENGTH * 0.56, FIELD_LENGTH * 0.56)
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

function setKey(code: string, pressed: boolean) {
  if (code === "KeyW" || code === "ArrowUp") input.up = pressed;
  if (code === "KeyS" || code === "ArrowDown") input.down = pressed;
  if (code === "KeyA" || code === "ArrowLeft") input.left = pressed;
  if (code === "KeyD" || code === "ArrowRight") input.right = pressed;
}

addEventListener("keydown", (event) => {
  unlockAudio();
  setKey(event.code, true);
  sendInput(true);
});

addEventListener("keyup", (event) => {
  unlockAudio();
  setKey(event.code, false);
  sendInput(true);
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
const audioUnlockOptions: AddEventListenerOptions = { capture: true, passive: true };
addEventListener("pointerdown", unlockAudio, audioUnlockOptions);
addEventListener("mousedown", unlockAudio, audioUnlockOptions);
addEventListener("touchstart", unlockAudio, audioUnlockOptions);
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  if (event.button === 0) input.kickLeft += 1;
  if (event.button === 2) input.kickRight += 1;
  sendInput(true);
});
canvas.addEventListener("wheel", (event) => {
  unlockAudio();
  event.preventDefault();
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
  if (renderedState) applyState(renderedState, seconds);
  updateLighting(seconds);
  updateCamera(delta);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
