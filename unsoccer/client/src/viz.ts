import * as THREE from "three";
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_VISUAL_SETTINGS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GOAL_DEPTH,
  GOAL_WIDTH,
  normalizeVisualSettingsPatch,
  type GameSettings,
  type VisualColorMaterialSettings,
  type VisualSettings,
  type WeatherKind
} from "@itch-games/unsoccer-shared";
import {
  applyLookdevMaterial,
  applyVisualLighting,
  cloneVisualSettings,
  configureVisualRenderer,
  createLookdevStandardMaterial,
  createVisualRig,
  type VisualRig
} from "./visual-pipeline";

type TabId = "Time" | "Renderer" | "Sky/Fog" | "Sun/Moon" | "Ambient" | "Floodlights" | "Materials" | "Weather";
type ControlType = "range" | "number" | "color" | "checkbox" | "select";
type MaterialKey = keyof VisualSettings["materials"];

interface SettingsPayload {
  ok: true;
  revision: number;
  loadedAt: number;
  source: string;
  settingsPath: string;
  settings: GameSettings;
  defaults: GameSettings;
}

interface ControlDef {
  tab: TabId;
  section?: string;
  label: string;
  type: ControlType;
  path?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  get?: () => unknown;
  set?: (value: unknown) => void;
}

interface PreviewMast {
  root: THREE.Group;
  mast: THREE.Mesh;
  base: THREE.Mesh;
  crossbar: THREE.Mesh;
  lamps: THREE.Mesh[];
}

const tabs: TabId[] = ["Time", "Renderer", "Sky/Fog", "Sun/Moon", "Ambient", "Floodlights", "Materials", "Weather"];
const canvas = requireElement<HTMLCanvasElement>("#viz-canvas");
const serverUrlInput = requireElement<HTMLInputElement>("#server-url");
const loadButton = requireElement<HTMLButtonElement>("#load-button");
const saveButton = requireElement<HTMLButtonElement>("#save-button");
const copyButton = requireElement<HTMLButtonElement>("#copy-button");
const resetButton = requireElement<HTMLButtonElement>("#reset-button");
const tabsEl = requireElement<HTMLElement>("#tabs");
const controlsEl = requireElement<HTMLElement>("#controls");
const statusEl = requireElement<HTMLElement>("#status");
const settingsPathEl = requireElement<HTMLElement>("#settings-path");
const revisionEl = requireElement<HTMLElement>("#revision");
const dirtyEl = requireElement<HTMLElement>("#dirty-state");
const remoteWarningEl = requireElement<HTMLElement>("#remote-warning");
const hudTimeEl = requireElement<HTMLElement>("#hud-time");
const hudWeatherEl = requireElement<HTMLElement>("#hud-weather");
const hudLightsEl = requireElement<HTMLElement>("#hud-lights");

const query = new URLSearchParams(window.location.search);
const initialServerUrl = query.get("server") || "http://127.0.0.1:8787";
serverUrlInput.value = initialServerUrl;

let activeTab: TabId = "Time";
let selectedFloodlight = 0;
let timeHours = 18.25;
let weatherKind: WeatherKind = "clear";
let weatherIntensity = 0;
let serverSettings: GameSettings = { ...DEFAULT_GAME_SETTINGS, visual: cloneVisualSettings(DEFAULT_VISUAL_SETTINGS) };
let savedVisual = cloneVisualSettings(DEFAULT_VISUAL_SETTINGS);
let draftVisual = cloneVisualSettings(DEFAULT_VISUAL_SETTINGS);
let savedCameraDistance = DEFAULT_GAME_SETTINGS.cameraDistance;
let draftCameraDistance = DEFAULT_GAME_SETTINGS.cameraDistance;
let lastPayload: SettingsPayload | null = null;
let dirty = false;
let previewCameraInitialized = false;
let lastFrameSeconds = 0;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
configureVisualRenderer(renderer, draftVisual);

const scene = new THREE.Scene();
scene.background = new THREE.Color(draftVisual.sky.nightColor);
scene.fog = new THREE.Fog(draftVisual.sky.fogNightColor, draftVisual.sky.fogNearBase, draftVisual.sky.fogFarBase);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
const visualRig = createVisualRig(scene, { renderer, camera, visual: draftVisual, includeSunPath: true });
const lookdevMaterials = new Map<MaterialKey, Set<THREE.Material>>();
const previewMasts: PreviewMast[] = [];
const pitchRoot = new THREE.Group();
const propRoot = new THREE.Group();
const previewCameraAnchor = new THREE.Vector3(0, 1, 0);
const previewCameraDesired = new THREE.Vector3();
const previewCameraLookAt = new THREE.Vector3(0, 1.05, 0);
scene.add(pitchRoot, propRoot);

installPreviewScene();
installTabs();
renderControls();
syncServerWarning();
resize();
void loadSettingsFromServer();
requestAnimationFrame(frame);

window.addEventListener("resize", resize);
serverUrlInput.addEventListener("input", () => {
  syncServerWarning();
  setStatus("");
});
loadButton.addEventListener("click", () => void loadSettingsFromServer());
saveButton.addEventListener("click", () => void saveSettingsToServer());
copyButton.addEventListener("click", () => void copyPatch());
resetButton.addEventListener("click", () => {
  draftVisual = cloneVisualSettings(savedVisual);
  selectedFloodlight = Math.min(selectedFloodlight, draftVisual.floodlights.lights.length - 1);
  markDirty();
  renderControls();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  draftCameraDistance = THREE.MathUtils.clamp(draftCameraDistance + event.deltaY * 0.015, 8, 24);
  markDirty();
  if (activeTab === "Renderer") renderControls();
}, { passive: false });

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function registerMaterial<T extends THREE.Material>(key: MaterialKey, material: T): T {
  const bucket = lookdevMaterials.get(key) ?? new Set<THREE.Material>();
  bucket.add(material);
  lookdevMaterials.set(key, bucket);
  return material;
}

function materialFor(key: MaterialKey): THREE.MeshStandardMaterial {
  return registerMaterial(key, createLookdevStandardMaterial(draftVisual.materials[key]));
}

function applyPreviewMaterials(): void {
  for (const [key, materials] of lookdevMaterials.entries()) {
    for (const material of materials) applyLookdevMaterial(material, draftVisual.materials[key]);
  }
}

function installPreviewScene(): void {
  const turf = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH, 0.12, FIELD_LENGTH), materialFor("field"));
  turf.position.y = -0.06;
  turf.receiveShadow = true;
  pitchRoot.add(turf);

  const stripeMaterial = materialFor("fieldStripe");
  for (let index = -3; index <= 3; index += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH, 0.012, FIELD_LENGTH / 9), stripeMaterial);
    stripe.position.set(0, 0.015, index * FIELD_LENGTH / 7);
    stripe.receiveShadow = true;
    pitchRoot.add(stripe);
  }

  addFieldLines();
  addGoal(-1);
  addGoal(1);
  addCourtyardPreview();
  addPreviewPlayers();
  addPreviewBall();
  syncPreviewMasts();
}

function addFieldLines(): void {
  const lineMaterial = registerMaterial("marking", new THREE.MeshBasicMaterial({ color: "#f4fff6", transparent: true, opacity: 0.96 }));
  const secondaryLineMaterial = registerMaterial("markingSecondary", new THREE.MeshBasicMaterial({ color: "#d9f7e4", transparent: true, opacity: 0.82 }));
  const lineWidth = 0.095;
  const addLine = (width: number, depth: number, x: number, z: number, material = lineMaterial) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, depth), material);
    line.position.set(x, 0.045, z);
    pitchRoot.add(line);
  };
  const addArea = (areaWidth: number, areaDepth: number, side: -1 | 1, material = lineMaterial) => {
    const frontZ = side * (FIELD_LENGTH / 2 - areaDepth);
    const centerZ = side * (FIELD_LENGTH / 2 - areaDepth / 2);
    addLine(areaWidth, lineWidth, 0, frontZ, material);
    addLine(lineWidth, areaDepth, -areaWidth / 2, centerZ, material);
    addLine(lineWidth, areaDepth, areaWidth / 2, centerZ, material);
  };
  addLine(FIELD_WIDTH, lineWidth, 0, 0);
  addLine(lineWidth, FIELD_LENGTH, -FIELD_WIDTH / 2, 0);
  addLine(lineWidth, FIELD_LENGTH, FIELD_WIDTH / 2, 0);
  addLine(FIELD_WIDTH, lineWidth, 0, -FIELD_LENGTH / 2);
  addLine(FIELD_WIDTH, lineWidth, 0, FIELD_LENGTH / 2);
  for (const side of [-1, 1] as const) {
    addArea(28, 13.2, side);
    addArea(16, 5.4, side, secondaryLineMaterial);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 28), lineMaterial);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.058, side * (FIELD_LENGTH / 2 - 9.6));
    pitchRoot.add(spot);
  }
  const center = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.035, 8, 96), lineMaterial);
  center.rotation.x = Math.PI / 2;
  center.position.y = 0.07;
  pitchRoot.add(center);
}

function addGoal(side: -1 | 1): void {
  const material = materialFor("goalPost");
  const z = side * (FIELD_LENGTH / 2);
  const postGeometry = new THREE.CylinderGeometry(0.17, 0.19, 2.28, 20);
  const barGeometry = new THREE.CylinderGeometry(0.16, 0.16, GOAL_WIDTH + 0.38, 20);
  const depthGeometry = new THREE.CylinderGeometry(0.08, 0.08, GOAL_DEPTH, 14);
  for (const x of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, 1.05, z);
    post.castShadow = true;
    pitchRoot.add(post);
    const topRail = new THREE.Mesh(depthGeometry, material);
    topRail.rotation.x = Math.PI / 2;
    topRail.position.set(x, 2.16, z + side * GOAL_DEPTH * 0.5);
    topRail.castShadow = true;
    pitchRoot.add(topRail);
  }
  const crossbar = new THREE.Mesh(barGeometry, material);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 2.16, z);
  crossbar.castShadow = true;
  pitchRoot.add(crossbar);
}

function addCourtyardPreview(): void {
  const courtyard = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 20, 0.08, FIELD_LENGTH + 18), materialFor("courtyard"));
  courtyard.position.y = -0.11;
  courtyard.receiveShadow = true;
  propRoot.add(courtyard);

  const roadMaterial = materialFor("road");
  for (const z of [-FIELD_LENGTH / 2 - 9, FIELD_LENGTH / 2 + 9]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 36, 0.06, 5.6), roadMaterial);
    road.position.set(0, -0.045, z);
    road.receiveShadow = true;
    propRoot.add(road);
  }

  const sidewalkMaterial = materialFor("sidewalk");
  for (const x of [-FIELD_WIDTH / 2 - 6.3, FIELD_WIDTH / 2 + 6.3]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.065, FIELD_LENGTH + 16), sidewalkMaterial);
    walk.position.set(x, -0.025, 0);
    walk.receiveShadow = true;
    propRoot.add(walk);
  }

  const fenceMaterial = materialFor("fence");
  for (const side of [-1, 1] as const) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 14, 1.15, 0.08), fenceMaterial);
    fence.position.set(0, 0.58, side * (FIELD_LENGTH / 2 + 5.9));
    fence.castShadow = true;
    propRoot.add(fence);
  }

  addTree(-FIELD_WIDTH / 2 - 10.5, -18, 1.2);
  addTree(FIELD_WIDTH / 2 + 10.8, 14, 1.0);
  addBench(-FIELD_WIDTH / 2 - 8.4, 7, 0.18);
  addBench(FIELD_WIDTH / 2 + 8.1, -8, -0.22);
  addPreviewCar(-19, FIELD_LENGTH / 2 + 9.2, "#4aa5a2");
  addPreviewCar(18, -FIELD_LENGTH / 2 - 9.4, "#ffc857");
}

function addTree(x: number, z: number, scale: number): void {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.4 * scale, 10), materialFor("courtyard"));
  trunk.position.set(x, 0.68 * scale, z);
  trunk.castShadow = true;
  propRoot.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale, 16, 10), materialFor("foliage"));
  crown.position.set(x, 1.65 * scale, z);
  crown.scale.set(1, 1.18, 0.92);
  crown.castShadow = true;
  propRoot.add(crown);
}

function addBench(x: number, z: number, rotation: number): void {
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  const wood = materialFor("courtyard");
  const metal = materialFor("metal");
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
  propRoot.add(bench);
}

function addPreviewCar(x: number, z: number, color: string): void {
  const bodyMaterial = registerMaterial("metal", new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.18 }));
  const glassMaterial = registerMaterial("brightMetal", new THREE.MeshStandardMaterial({ color: "#a9d3e8", roughness: 0.25, metalness: 0.05 }));
  const car = new THREE.Group();
  car.position.set(x, 0, z);
  car.rotation.y = z > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.62, 1.15), bodyMaterial);
  body.position.y = 0.52;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.48, 0.96), glassMaterial);
  cabin.position.y = 1.02;
  cabin.castShadow = true;
  car.add(cabin);
  propRoot.add(car);
}

function addPreviewPlayers(): void {
  const positions = [
    [0, 0, "fallbackPlayerBlue"],
    [-8, -8, "fallbackPlayerBlue"],
    [2, -4, "fallbackPlayerBlue"],
    [9, 8, "fallbackPlayerBlue"],
    [-4, 7, "fallbackPlayerOrange"],
    [5, 13, "fallbackPlayerOrange"],
    [13, -10, "fallbackPlayerOrange"]
  ] as const;
  for (const [x, z, materialKey] of positions) {
    const player = new THREE.Group();
    player.position.set(x, 0, z);
    const material = materialFor(materialKey);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.78, 8, 16), material);
    torso.position.y = 1.05;
    torso.castShadow = true;
    player.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), registerMaterial("courtyard", new THREE.MeshStandardMaterial({ color: "#f1c7a7", roughness: 0.55 })));
    head.position.y = 1.75;
    head.castShadow = true;
    player.add(head);
    const legMat = registerMaterial("metal", new THREE.MeshStandardMaterial({ color: "#111817", roughness: 0.72 }));
    for (const xOffset of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.78, 10), legMat);
      leg.position.set(xOffset, 0.42, 0);
      leg.castShadow = true;
      player.add(leg);
    }
    propRoot.add(player);
  }
}

function addPreviewBall(): void {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 18), materialFor("ball"));
  ball.position.set(-1.2, 0.34, 1.4);
  ball.castShadow = true;
  ball.receiveShadow = true;
  propRoot.add(ball);
}

function syncPreviewMasts(): void {
  while (previewMasts.length < draftVisual.floodlights.lights.length) {
    previewMasts.push(createPreviewMast());
  }
  for (let index = 0; index < previewMasts.length; index += 1) {
    const mast = previewMasts[index];
    const config = draftVisual.floodlights.lights[index];
    mast.root.visible = Boolean(config);
    if (!config) continue;
    const towardField = new THREE.Vector3(config.targetX - config.x, 0, config.targetZ - config.z).normalize();
    const fixtureYaw = Math.atan2(-towardField.z, towardField.x);
    mast.mast.position.set(config.x, config.y * 0.48, config.z);
    mast.mast.scale.y = Math.max(0.2, config.y / 12.9);
    mast.base.position.set(config.x, 0.11, config.z);
    mast.crossbar.position.set(config.x + towardField.x * 0.48, config.y - 0.6, config.z + towardField.z * 0.48);
    mast.crossbar.rotation.y = fixtureYaw;
    for (const [lampIndex, lamp] of mast.lamps.entries()) {
      const side = lampIndex === 0 ? -1 : 1;
      lamp.position.set(
        config.x + towardField.x * 0.86 + towardField.z * side * 0.42,
        config.y - 0.78,
        config.z + towardField.z * 0.86 - towardField.x * side * 0.42
      );
      lamp.rotation.y = fixtureYaw;
    }
  }
}

function createPreviewMast(): PreviewMast {
  const root = new THREE.Group();
  const mastMaterial = materialFor("mast");
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.14, 12.4, 12), mastMaterial);
  mast.castShadow = true;
  root.add(mast);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.22, 16), mastMaterial);
  base.receiveShadow = true;
  root.add(base);
  const fixtureMaterial = materialFor("mast");
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), fixtureMaterial);
  crossbar.castShadow = true;
  root.add(crossbar);
  const lamps: THREE.Mesh[] = [];
  for (let index = 0; index < 2; index += 1) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.5), visualRig.floodlights[0]?.lampMaterial ?? new THREE.MeshBasicMaterial());
    lamp.castShadow = true;
    lamps.push(lamp);
    root.add(lamp);
  }
  propRoot.add(root);
  return { root, mast, base, crossbar, lamps };
}

function installTabs(): void {
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.textContent = tab;
    button.addEventListener("click", () => {
      activeTab = tab;
      renderControls();
    });
    tabsEl.appendChild(button);
  }
}

function controlDefs(): ControlDef[] {
  const defs: ControlDef[] = [
    { tab: "Time", section: "Preview", label: "Time", type: "range", min: 0, max: 24, step: 0.05, get: () => timeHours, set: (value) => { timeHours = Number(value); } },
    { tab: "Time", section: "Preview", label: "Weather", type: "select", options: weatherOptions(), get: () => weatherKind, set: (value) => { weatherKind = value as WeatherKind; } },
    { tab: "Time", section: "Preview", label: "Intensity", type: "range", min: 0, max: 1, step: 0.01, get: () => weatherIntensity, set: (value) => { weatherIntensity = Number(value); } },
    { tab: "Renderer", section: "Exposure", label: "Base", type: "range", path: "renderer.exposureBase", min: 0.1, max: 3, step: 0.01 },
    { tab: "Renderer", section: "Exposure", label: "Day", type: "range", path: "renderer.exposureDay", min: 0, max: 2, step: 0.01 },
    { tab: "Renderer", section: "Exposure", label: "Sunset", type: "range", path: "renderer.exposureSunset", min: 0, max: 1, step: 0.01 },
    { tab: "Renderer", section: "Exposure", label: "Precip penalty", type: "range", path: "renderer.precipitationExposurePenalty", min: 0, max: 1, step: 0.01 },
    { tab: "Renderer", section: "Shadows", label: "Enabled", type: "checkbox", path: "renderer.shadows" },
    { tab: "Renderer", section: "Gameplay camera", label: "Player distance", type: "range", min: 8, max: 24, step: 0.1, get: () => draftCameraDistance, set: (value) => { draftCameraDistance = Number(value); } },
    { tab: "Sky/Fog", section: "Sky", label: "Day", type: "color", path: "sky.dayColor" },
    { tab: "Sky/Fog", section: "Sky", label: "Sunset", type: "color", path: "sky.sunsetColor" },
    { tab: "Sky/Fog", section: "Sky", label: "Night", type: "color", path: "sky.nightColor" },
    { tab: "Sky/Fog", section: "Fog", label: "Day", type: "color", path: "sky.fogDayColor" },
    { tab: "Sky/Fog", section: "Fog", label: "Night", type: "color", path: "sky.fogNightColor" },
    { tab: "Sky/Fog", section: "Fog", label: "Snow", type: "color", path: "sky.snowFogColor" },
    { tab: "Sky/Fog", section: "Fog", label: "Dome mix", type: "range", path: "sky.domeFogMix", min: 0, max: 1, step: 0.01 },
    { tab: "Sky/Fog", section: "Fog", label: "Near base", type: "number", path: "sky.fogNearBase", min: 0, max: 220, step: 1 },
    { tab: "Sky/Fog", section: "Fog", label: "Near day", type: "number", path: "sky.fogNearDay", min: -50, max: 120, step: 1 },
    { tab: "Sky/Fog", section: "Fog", label: "Far base", type: "number", path: "sky.fogFarBase", min: 10, max: 420, step: 1 },
    { tab: "Sky/Fog", section: "Fog", label: "Far day", type: "number", path: "sky.fogFarDay", min: -80, max: 220, step: 1 },
    { tab: "Sun/Moon", section: "Sun intensity", label: "Base", type: "range", path: "sun.intensityBase", min: 0, max: 3, step: 0.01 },
    { tab: "Sun/Moon", section: "Sun intensity", label: "Day", type: "range", path: "sun.intensityDay", min: 0, max: 8, step: 0.01 },
    { tab: "Sun/Moon", section: "Sun intensity", label: "Sunset", type: "range", path: "sun.intensitySunset", min: 0, max: 4, step: 0.01 },
    { tab: "Sun/Moon", section: "Sun orbit", label: "Orbit", type: "number", path: "sun.orbitRadius", min: 12, max: 120, step: 1 },
    { tab: "Sun/Moon", section: "Sun orbit", label: "Marker orbit", type: "number", path: "sun.visualOrbitRadius", min: 20, max: 160, step: 1 },
    { tab: "Sun/Moon", section: "Sun marker", label: "Scale base", type: "range", path: "sun.markerScaleBase", min: 0.1, max: 3, step: 0.01 },
    { tab: "Sun/Moon", section: "Sun marker", label: "Glow day", type: "range", path: "sun.glowOpacityDay", min: 0, max: 1, step: 0.01 },
    { tab: "Sun/Moon", section: "Moon", label: "Color", type: "color", path: "moon.color" },
    { tab: "Sun/Moon", section: "Moon", label: "Base opacity", type: "range", path: "moon.opacityBase", min: 0, max: 1, step: 0.01 },
    { tab: "Sun/Moon", section: "Moon", label: "Night opacity", type: "range", path: "moon.opacityNight", min: 0, max: 1, step: 0.01 },
    { tab: "Ambient", section: "Hemisphere", label: "Sky", type: "color", path: "ambient.hemiSkyColor" },
    { tab: "Ambient", section: "Hemisphere", label: "Ground", type: "color", path: "ambient.hemiGroundColor" },
    { tab: "Ambient", section: "Hemisphere", label: "Base", type: "range", path: "ambient.hemiBase", min: 0, max: 4, step: 0.01 },
    { tab: "Ambient", section: "Hemisphere", label: "Day", type: "range", path: "ambient.hemiDay", min: 0, max: 5, step: 0.01 },
    { tab: "Ambient", section: "Fill", label: "Base", type: "range", path: "ambient.fillBase", min: 0, max: 2, step: 0.01 },
    { tab: "Ambient", section: "Fill", label: "Day", type: "range", path: "ambient.fillDay", min: 0, max: 3, step: 0.01 },
    { tab: "Ambient", section: "Bounce", label: "Color", type: "color", path: "ambient.bounceColor" },
    { tab: "Ambient", section: "Bounce", label: "Day", type: "range", path: "ambient.bounceDay", min: 0, max: 4, step: 0.01 },
    { tab: "Ambient", section: "Rim", label: "Color", type: "color", path: "ambient.rimColor" },
    { tab: "Ambient", section: "Rim", label: "Night", type: "range", path: "ambient.rimNight", min: 0, max: 3, step: 0.01 },
    { tab: "Floodlights", section: "Global", label: "Night start", type: "range", path: "floodlights.powerNightStart", min: 0, max: 1, step: 0.01 },
    { tab: "Floodlights", section: "Global", label: "Night end", type: "range", path: "floodlights.powerNightEnd", min: 0, max: 1, step: 0.01 },
    { tab: "Floodlights", section: "Global", label: "Intensity", type: "range", path: "floodlights.intensityBase", min: 0, max: 8, step: 0.01 },
    { tab: "Floodlights", section: "Global", label: "Precip boost", type: "range", path: "floodlights.precipitationBoost", min: 0, max: 2, step: 0.01 },
    { tab: "Floodlights", section: "Light", label: "Selector", type: "select", options: draftVisual.floodlights.lights.map((_, index) => ({ label: `Light ${index + 1}`, value: String(index) })), get: () => String(selectedFloodlight), set: (value) => { selectedFloodlight = Number(value); renderControls(); } },
    ...floodlightControls(),
    { tab: "Weather", section: "Preview", label: "Weather", type: "select", options: weatherOptions(), get: () => weatherKind, set: (value) => { weatherKind = value as WeatherKind; } },
    { tab: "Weather", section: "Preview", label: "Intensity", type: "range", min: 0, max: 1, step: 0.01, get: () => weatherIntensity, set: (value) => { weatherIntensity = Number(value); } },
    { tab: "Weather", section: "Response", label: "Rain penalty", type: "range", path: "weather.rainLightPenalty", min: 0, max: 2, step: 0.01 },
    { tab: "Weather", section: "Response", label: "Snow fog", type: "range", path: "weather.snowFogBoost", min: 0, max: 1, step: 0.01 },
    { tab: "Weather", section: "Response", label: "Cone boost", type: "range", path: "weather.conePrecipitationBoost", min: 0, max: 0.2, step: 0.001 }
  ];

  for (const materialKey of materialKeys()) {
    defs.push(
      { tab: "Materials", section: materialKey, label: "Color", type: "color", path: `materials.${materialKey}.color` },
      { tab: "Materials", section: materialKey, label: "Roughness", type: "range", path: `materials.${materialKey}.roughness`, min: 0, max: 1, step: 0.01 },
      { tab: "Materials", section: materialKey, label: "Metalness", type: "range", path: `materials.${materialKey}.metalness`, min: 0, max: 1, step: 0.01 }
    );
  }
  return defs;
}

function floodlightControls(): ControlDef[] {
  const prefix = `floodlights.lights.${selectedFloodlight}`;
  return [
    { tab: "Floodlights", section: "Position", label: "X", type: "number", path: `${prefix}.x`, min: -80, max: 80, step: 0.1 },
    { tab: "Floodlights", section: "Position", label: "Y", type: "number", path: `${prefix}.y`, min: 2, max: 32, step: 0.1 },
    { tab: "Floodlights", section: "Position", label: "Z", type: "number", path: `${prefix}.z`, min: -90, max: 90, step: 0.1 },
    { tab: "Floodlights", section: "Target", label: "Target X", type: "number", path: `${prefix}.targetX`, min: -40, max: 40, step: 0.1 },
    { tab: "Floodlights", section: "Target", label: "Target Y", type: "number", path: `${prefix}.targetY`, min: 0, max: 8, step: 0.1 },
    { tab: "Floodlights", section: "Target", label: "Target Z", type: "number", path: `${prefix}.targetZ`, min: -60, max: 60, step: 0.1 },
    { tab: "Floodlights", section: "Beam", label: "Color", type: "color", path: `${prefix}.color` },
    { tab: "Floodlights", section: "Beam", label: "Angle", type: "range", path: `${prefix}.angleDeg`, min: 20, max: 86, step: 0.1 },
    { tab: "Floodlights", section: "Beam", label: "Distance", type: "number", path: `${prefix}.distance`, min: 10, max: 160, step: 1 },
    { tab: "Floodlights", section: "Beam", label: "Penumbra", type: "range", path: `${prefix}.penumbra`, min: 0, max: 1, step: 0.01 },
    { tab: "Floodlights", section: "Beam", label: "Decay", type: "range", path: `${prefix}.decay`, min: 0, max: 3, step: 0.01 },
    { tab: "Floodlights", section: "Volume", label: "Cone radius", type: "range", path: `${prefix}.coneRadius`, min: 2, max: 28, step: 0.1 },
    { tab: "Floodlights", section: "Volume", label: "Cone opacity", type: "range", path: `${prefix}.coneOpacity`, min: 0, max: 0.25, step: 0.001 },
    { tab: "Floodlights", section: "Flicker", label: "Depth", type: "range", path: `${prefix}.flickerDepth`, min: 0, max: 0.3, step: 0.001 },
    { tab: "Floodlights", section: "Flicker", label: "Speed", type: "range", path: `${prefix}.flickerSpeed`, min: 0, max: 8, step: 0.01 },
    { tab: "Floodlights", section: "Flicker", label: "Width", type: "range", path: `${prefix}.widthScale`, min: 0.4, max: 2.2, step: 0.01 },
    { tab: "Floodlights", section: "Flicker", label: "Bias", type: "range", path: `${prefix}.intensityBias`, min: 0, max: 2.5, step: 0.01 }
  ];
}

function materialKeys(): MaterialKey[] {
  return [
    "field",
    "fieldStripe",
    "marking",
    "markingSecondary",
    "goalPost",
    "mast",
    "courtyard",
    "fence",
    "road",
    "sidewalk",
    "curb",
    "foliage",
    "metal",
    "brightMetal",
    "fallbackPlayerBlue",
    "fallbackPlayerOrange",
    "ball"
  ];
}

function weatherOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "Clear", value: "clear" },
    { label: "Dawn", value: "dawn" },
    { label: "Rain", value: "rain" },
    { label: "Snow", value: "snow" }
  ];
}

function renderControls(): void {
  for (const button of tabsEl.querySelectorAll<HTMLButtonElement>(".tab")) {
    button.dataset.active = String(button.textContent === activeTab);
  }
  controlsEl.replaceChildren();
  if (activeTab === "Floodlights") renderFloodlightActions();

  let currentSection = "";
  for (const def of controlDefs().filter((item) => item.tab === activeTab)) {
    if (def.section && def.section !== currentSection) {
      currentSection = def.section;
      const title = document.createElement("div");
      title.className = "section-title";
      title.textContent = currentSection;
      controlsEl.appendChild(title);
    }
    controlsEl.appendChild(renderControl(def));
  }
  updateDirtyState();
}

function renderFloodlightActions(): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Apply selected beam to all";
  button.addEventListener("click", () => {
    const source = draftVisual.floodlights.lights[selectedFloodlight];
    if (!source) return;
    draftVisual.floodlights.lights = draftVisual.floodlights.lights.map((light, index) => index === selectedFloodlight ? light : {
      ...light,
      color: source.color,
      angleDeg: source.angleDeg,
      distance: source.distance,
      penumbra: source.penumbra,
      decay: source.decay,
      coneRadius: source.coneRadius,
      coneOpacity: source.coneOpacity,
      flickerDepth: source.flickerDepth,
      flickerSpeed: source.flickerSpeed,
      widthScale: source.widthScale,
      intensityBias: source.intensityBias
    });
    markDirty();
    renderControls();
  });
  controlsEl.appendChild(button);
}

function renderControl(def: ControlDef): HTMLElement {
  const row = document.createElement("div");
  row.className = "control";
  row.dataset.type = def.type;
  row.dataset.label = def.label;
  if (def.path) row.dataset.path = def.path;
  const label = document.createElement("label");
  label.textContent = def.label;
  row.appendChild(label);
  const valueEl = document.createElement("span");
  valueEl.className = "value";
  const value = readControlValue(def);

  let input: HTMLInputElement | HTMLSelectElement;
  if (def.type === "select") {
    const select = document.createElement("select");
    select.setAttribute("aria-label", def.label);
    for (const option of def.options ?? []) {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    }
    select.value = String(value);
    input = select;
  } else {
    const field = document.createElement("input");
    field.setAttribute("aria-label", def.label);
    field.type = def.type === "checkbox" ? "checkbox" : def.type;
    if (def.min !== undefined) field.min = String(def.min);
    if (def.max !== undefined) field.max = String(def.max);
    if (def.step !== undefined) field.step = String(def.step);
    if (def.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = String(value ?? "");
    }
    input = field;
  }

  const syncValue = () => {
    const nextValue = input instanceof HTMLInputElement && input.type === "checkbox"
      ? input.checked
      : def.type === "number" || def.type === "range"
        ? Number(input.value)
        : input.value;
    writeControlValue(def, nextValue);
    valueEl.textContent = formatValue(readControlValue(def));
    markDirty(def.tab !== "Time" && !(def.tab === "Weather" && def.section === "Preview"));
  };
  input.addEventListener("input", syncValue);
  input.addEventListener("change", syncValue);
  row.appendChild(input);
  valueEl.textContent = formatValue(value);
  row.appendChild(valueEl);
  return row;
}

function readControlValue(def: ControlDef): unknown {
  if (def.get) return def.get();
  if (!def.path) return "";
  return getPath(draftVisual, def.path);
}

function writeControlValue(def: ControlDef, value: unknown): void {
  if (def.set) {
    def.set(value);
    return;
  }
  if (!def.path) return;
  setPath(draftVisual as unknown as Record<string, unknown>, def.path, value);
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, part) => {
    if (cursor === null || cursor === undefined) return undefined;
    return (cursor as Record<string, unknown>)[part];
  }, source);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor = cursor[part] as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  cursor[key] = value;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value ?? "");
}

function markDirty(settingsChanged = true): void {
  if (settingsChanged) {
    draftVisual = normalizeVisualSettingsPatch(draftVisual, savedVisual);
    draftCameraDistance = THREE.MathUtils.clamp(Number(draftCameraDistance), 8, 24);
  }
  selectedFloodlight = THREE.MathUtils.clamp(selectedFloodlight, 0, draftVisual.floodlights.lights.length - 1);
  dirty = JSON.stringify(draftVisual) !== JSON.stringify(savedVisual) || draftCameraDistance !== savedCameraDistance;
  updateDirtyState();
}

function updateDirtyState(): void {
  dirtyEl.dataset.state = dirty ? "dirty" : "clean";
  dirtyEl.textContent = dirty ? "Dirty" : "Clean";
}

async function loadSettingsFromServer(): Promise<void> {
  setStatus("Loading...");
  try {
    const response = await fetch(`${apiBase()}/api/game-settings`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as SettingsPayload;
    lastPayload = payload;
    serverSettings = payload.settings;
    savedVisual = normalizeVisualSettingsPatch(payload.settings.visual, DEFAULT_VISUAL_SETTINGS);
    draftVisual = cloneVisualSettings(savedVisual);
    savedCameraDistance = THREE.MathUtils.clamp(Number(payload.settings.cameraDistance ?? DEFAULT_GAME_SETTINGS.cameraDistance), 8, 24);
    draftCameraDistance = savedCameraDistance;
    selectedFloodlight = Math.min(selectedFloodlight, draftVisual.floodlights.lights.length - 1);
    settingsPathEl.textContent = payload.settingsPath || "game-settings.json";
    revisionEl.textContent = `revision ${payload.revision} / ${new Date(payload.loadedAt).toLocaleTimeString()}`;
    dirty = false;
    renderControls();
    setStatus("Loaded");
  } catch (error) {
    setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveSettingsToServer(): Promise<void> {
  setStatus("Saving...");
  try {
    const response = await fetch(`${apiBase()}/api/game-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { cameraDistance: draftCameraDistance, visual: draftVisual } })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as SettingsPayload;
    lastPayload = payload;
    serverSettings = payload.settings;
    savedVisual = normalizeVisualSettingsPatch(payload.settings.visual, draftVisual);
    draftVisual = cloneVisualSettings(savedVisual);
    savedCameraDistance = THREE.MathUtils.clamp(Number(payload.settings.cameraDistance ?? draftCameraDistance), 8, 24);
    draftCameraDistance = savedCameraDistance;
    settingsPathEl.textContent = payload.settingsPath || "game-settings.json";
    revisionEl.textContent = `revision ${payload.revision} / ${new Date(payload.loadedAt).toLocaleTimeString()}`;
    dirty = false;
    renderControls();
    setStatus("Saved");
  } catch (error) {
    setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function copyPatch(): Promise<void> {
  const visualDiff = diff(savedVisual, draftVisual) ?? {};
  const patch: { cameraDistance?: number; visual?: unknown } = {};
  if (draftCameraDistance !== savedCameraDistance) patch.cameraDistance = draftCameraDistance;
  if (Object.keys(visualDiff as Record<string, unknown>).length > 0) patch.visual = visualDiff;
  const patchText = JSON.stringify(patch, null, 2);
  (window as Window & { unsoccerVizLastPatch?: string }).unsoccerVizLastPatch = patchText;
  try {
    await navigator.clipboard.writeText(patchText);
    setStatus("Patch copied");
  } catch (_) {
    setStatus("Patch ready");
  }
}

function diff(previous: unknown, next: unknown): unknown {
  if (JSON.stringify(previous) === JSON.stringify(next)) return undefined;
  if (Array.isArray(previous) || Array.isArray(next)) return next;
  if (isRecord(previous) && isRecord(next)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(next)) {
      const child = diff(previous[key], next[key]);
      if (child !== undefined) out[key] = child;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiBase(): string {
  return serverUrlInput.value.trim().replace(/\/+$/, "");
}

function syncServerWarning(): void {
  remoteWarningEl.dataset.visible = String(!isLocalServer(serverUrlInput.value));
}

function isLocalServer(value: string): boolean {
  try {
    const url = new URL(value, window.location.href);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch (_) {
    return false;
  }
}

function setStatus(value: string): void {
  statusEl.textContent = value;
}

function resize(): void {
  const { clientWidth, clientHeight } = canvas;
  const width = Math.max(1, clientWidth);
  const height = Math.max(1, clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateCamera(delta: number): void {
  const safeDelta = Math.min(delta, 0.05);
  const cameraDistance = THREE.MathUtils.clamp(draftCameraDistance, 8, 24);
  const cameraHeight = Math.max(7.2, cameraDistance * 0.82 + 1.7);
  previewCameraAnchor.set(0, 1, 0);
  previewCameraLookAt.set(previewCameraAnchor.x, 1.05, previewCameraAnchor.z);
  previewCameraDesired.set(previewCameraAnchor.x, cameraHeight, previewCameraAnchor.z - cameraDistance);
  if (!previewCameraInitialized) {
    camera.position.copy(previewCameraDesired);
    previewCameraInitialized = true;
  } else {
    camera.position.lerp(previewCameraDesired, 1 - Math.exp(-safeDelta * 5.4));
  }
  camera.lookAt(previewCameraLookAt);
  document.documentElement.dataset.vizCameraMode = "gameplay-player-follow";
  document.documentElement.dataset.cameraDistance = cameraDistance.toFixed(2);
  document.documentElement.dataset.cameraHeight = cameraHeight.toFixed(2);
}

function frame(now: number): void {
  const seconds = now / 1000;
  const delta = lastFrameSeconds > 0 ? Math.min(seconds - lastFrameSeconds, 0.05) : 1 / 60;
  lastFrameSeconds = seconds;
  resize();
  updateCamera(delta);
  applyPreviewMaterials();
  syncPreviewMasts();
  const weatherIntensityForPreview = weatherKind === "clear" || weatherKind === "dawn" ? 0 : weatherIntensity;
  const dayTimeSeconds = timeHours / 24 * 24 * 60 * 60;
  const lighting = applyVisualLighting(visualRig as VisualRig, {
    visual: draftVisual,
    dayTimeSeconds,
    elapsedSeconds: seconds,
    weather: { kind: weatherKind, intensity: weatherIntensityForPreview },
    reduceEffects: false,
    shadowsEnabled: draftVisual.renderer.shadows,
    multipliers: {
      sunIntensity: serverSettings.sunIntensity,
      moonIntensity: serverSettings.moonIntensity,
      ambientIntensity: serverSettings.ambientIntensity,
      floodlightIntensity: serverSettings.floodlightIntensity,
      toneMappingExposure: serverSettings.toneMappingExposure
    },
    dataset: document.documentElement.dataset
  });
  renderer.render(scene, camera);
  hudTimeEl.textContent = `${String(Math.floor(timeHours)).padStart(2, "0")}:${String(Math.floor((timeHours % 1) * 60)).padStart(2, "0")}`;
  hudWeatherEl.textContent = `${weatherKind} ${weatherIntensityForPreview.toFixed(2)}`;
  hudLightsEl.textContent = `${lighting.activeFloodlights}/${visualRig.floodlights.length} lights`;
  document.documentElement.dataset.vizReady = "true";
  document.documentElement.dataset.vizDirty = String(dirty);
  document.documentElement.dataset.vizRevision = String(lastPayload?.revision ?? "local");
  requestAnimationFrame(frame);
}
