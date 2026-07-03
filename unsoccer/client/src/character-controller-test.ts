import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GameCharacterController, loadFree3dCharacter, type Free3dCharacterAsset, type Free3dCharacterRoster } from "./character-controller";
import { bakeTexturelessPbr, type TexturelessPbrBakeOptions, type TexturelessPbrBakeResult } from "./textureless-pbr-converter";
import type { CelebrationKind, KickKind, StrikeSide } from "@itch-games/unsoccer-shared";

interface EnvironmentAsset {
  guid: string;
  kind: string;
  title: string;
  src: string;
  source?: string;
  inventoryUrl?: string;
  bytes?: number;
}

interface EnvironmentRoster {
  version: string;
  mode: string;
  assets: EnvironmentAsset[];
}

type AssetViewMode = "character" | "environment";
type BatchAssetKind = "character" | "environment";
type ChannelViewMode =
  | "rendered"
  | "color-rgb"
  | "color-r"
  | "color-g"
  | "color-b"
  | "color-a"
  | "uv0-rg"
  | "uv0-u"
  | "uv0-v"
  | "uv1-rg"
  | "uv1-u"
  | "uv1-v"
  | "uv2-rg"
  | "uv2-u"
  | "uv2-v";

interface TexturelessPbrBatchItem {
  kind: BatchAssetKind;
  guid: string;
  title: string;
  converted: boolean;
  vertexCount: number;
  strippedTextureCount: number;
  averageAo: number;
  error?: string;
}

interface TexturelessPbrBatchResult {
  total: number;
  completed: number;
  failures: number;
  vertexCount: number;
  strippedTextureCount: number;
  averageAo: number;
  aoContrast: number;
  items: TexturelessPbrBatchItem[];
}

declare global {
  interface Window {
    unsoccerCharacterControllerTest?: {
      controller: GameCharacterController | null;
      trigger: (action: KickKind, sprintJump?: boolean) => void;
      sprintJump: () => void;
      ragdoll: () => void;
      toggleRagdoll: () => void;
      setRagdoll: (active: boolean) => void;
      celebrate: (action: CelebrationKind) => void;
      selectCharacter: (indexOrGuid: number | string) => Promise<void>;
      nextCharacter: (direction?: number) => Promise<void>;
      selectEnvironment: (indexOrGuid: number | string) => Promise<void>;
      nextEnvironment: (direction?: number) => Promise<void>;
      assetMode: (mode: AssetViewMode) => Promise<void>;
      convertPbr: () => Promise<TexturelessPbrBakeResult | null>;
      convertAllPbr: () => Promise<TexturelessPbrBatchResult | null>;
      setChannelView: (mode: ChannelViewMode) => void;
      state: () => unknown;
      roster: () => unknown;
      environmentRoster: () => unknown;
      converterState: () => unknown;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#character-test-canvas");
if (!canvas) throw new Error("character test canvas is missing");

const rosterSrc = "assets/characters/free3d/roster.json";
const environmentRosterSrc = "assets/environment/free3d/roster.json";
const assetEl = document.querySelector<HTMLElement>("#asset");
const modeEl = document.querySelector<HTMLElement>("#mode");
const actionEl = document.querySelector<HTMLElement>("#action");
const speedEl = document.querySelector<HTMLElement>("#speed");
const strikeEl = document.querySelector<HTMLElement>("#strike");
const staminaEl = document.querySelector<HTMLElement>("#stamina");
const rosterPositionEl = document.querySelector<HTMLElement>("#roster-position");
const clipCountEl = document.querySelector<HTMLElement>("#clip-count");
const textureCountEl = document.querySelector<HTMLElement>("#texture-count");
const assetTypeEl = document.querySelector<HTMLElement>("#asset-type");
const pbrStatusEl = document.querySelector<HTMLElement>("#pbr-status");
const pbrVerticesEl = document.querySelector<HTMLElement>("#pbr-vertices");
const pbrTexturesEl = document.querySelector<HTMLElement>("#pbr-textures");
const pbrAoEl = document.querySelector<HTMLElement>("#pbr-ao");
const pbrBatchStatusEl = document.querySelector<HTMLElement>("#pbr-batch-status");
const channelViewStatusEl = document.querySelector<HTMLElement>("#channel-view-status");
const characterTitleEl = document.querySelector<HTMLElement>("#character-title");
const characterSelect = document.querySelector<HTMLSelectElement>("#character-select");
const assetKindSelect = document.querySelector<HTMLSelectElement>("#asset-kind-select");
const environmentSelect = document.querySelector<HTMLSelectElement>("#environment-select");
const channelViewSelect = document.querySelector<HTMLSelectElement>("#channel-view-select");
const aoContrastInput = document.querySelector<HTMLInputElement>("#ao-contrast-input");
const aoContrastValueEl = document.querySelector<HTMLOutputElement>("#ao-contrast-value");
const environmentGallery = document.querySelector<HTMLElement>("#environment-gallery");
const characterRow = document.querySelector<HTMLElement>(".character-row");
const batchConvertButton = document.querySelector<HTMLButtonElement>("#btn-batch-convert-pbr");
const footButton = document.querySelector<HTMLButtonElement>("#btn-foot");
const handButton = document.querySelector<HTMLButtonElement>("#btn-hand");
const headButton = document.querySelector<HTMLButtonElement>("#btn-head");
const jumpButton = document.querySelector<HTMLButtonElement>("#btn-jump");
const sprintJumpButton = document.querySelector<HTMLButtonElement>("#btn-sprint-jump");
const ragdollButton = document.querySelector<HTMLButtonElement>("#btn-ragdoll");
const celebrate1Button = document.querySelector<HTMLButtonElement>("#btn-celebrate-1");
const celebrate2Button = document.querySelector<HTMLButtonElement>("#btn-celebrate-2");
const celebrate3Button = document.querySelector<HTMLButtonElement>("#btn-celebrate-3");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1613);
scene.fog = new THREE.Fog(0x0b1613, 18, 46);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
camera.position.set(0.82, 2.0, 5.25);
camera.lookAt(0, 1.1, 0);

const hemi = new THREE.HemisphereLight(0xdffff1, 0x15231d, 1.45);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0ce, 2.05);
key.position.set(-4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fb7ff, 0.8);
rim.position.set(5, 4, -5);
scene.add(rim);

const environmentLoader = new GLTFLoader();
const environmentCache = new Map<string, Promise<THREE.Object3D | null>>();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x253b31, roughness: 0.84 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(18, 18, 0x76b294, 0x315245);
grid.position.y = 0.012;
scene.add(grid);

const keys = new Set<string>();
const velocity = new THREE.Vector3();
const position = new THREE.Vector3();
const desired = new THREE.Vector3();
const bounds = new THREE.Box3();
const boundsSize = new THREE.Vector3();
const boundsCenter = new THREE.Vector3();
let controller: GameCharacterController | null = null;
let lastTime = performance.now() / 1000;
let lastAction: KickKind | null = null;
let lastActionSide: StrikeSide | null = null;
let lastActionAt = 0;
let nextFootStrikeSide: StrikeSide = "left";
let celebration: CelebrationKind | null = null;
let celebrationAt = 0;
let celebrationAvailableUntil = 0;
let stamina = 100;
let verticalVelocity = 0;
let airborne = false;
let ragdoll = false;
let ragdollAt = 0;
let ragdollManual = false;
let sprinting = false;
let sprintJumpUntil = 0;
let yaw = Math.PI;
let rosterAssets: Free3dCharacterAsset[] = [];
let currentCharacterIndex = 0;
let assetViewMode: AssetViewMode = "character";
let environmentAssets: EnvironmentAsset[] = [];
let currentEnvironmentIndex = 0;
let environmentPreview: THREE.Object3D | null = null;
let environmentTurntable = 0;
let lastPbrResult: TexturelessPbrBakeResult | null = null;
let lastPbrBatchResult: TexturelessPbrBatchResult | null = null;
let channelViewMode: ChannelViewMode = "rendered";
let aoContrast = 1.35;
let pbrBatchInProgress = false;
let loadSequence = 0;
let triggerSequence = 0;
const channelOriginalMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const channelDebugMaterials = new Map<ChannelViewMode, THREE.ShaderMaterial>();

const channelModeLabels: Record<ChannelViewMode, string> = {
  rendered: "rendered",
  "color-rgb": "RGBA RGB",
  "color-r": "RGBA R",
  "color-g": "RGBA G",
  "color-b": "RGBA B",
  "color-a": "RGBA A",
  "uv0-rg": "UV0 U/V",
  "uv0-u": "UV0 U",
  "uv0-v": "UV0 V",
  "uv1-rg": "UV1 R/M",
  "uv1-u": "UV1 rough",
  "uv1-v": "UV1 metal",
  "uv2-rg": "UV2 U/V",
  "uv2-u": "UV2 U",
  "uv2-v": "UV2 V"
};

const channelModeIds: Record<ChannelViewMode, number> = {
  rendered: 0,
  "color-rgb": 1,
  "color-r": 2,
  "color-g": 3,
  "color-b": 4,
  "color-a": 5,
  "uv0-rg": 6,
  "uv0-u": 7,
  "uv0-v": 8,
  "uv1-rg": 9,
  "uv1-u": 10,
  "uv1-v": 11,
  "uv2-rg": 12,
  "uv2-u": 13,
  "uv2-v": 14
};

function setText(element: HTMLElement | null, value: string): void {
  if (element) element.textContent = value;
}

function syncRagdollButton(): void {
  if (ragdollButton) {
    ragdollButton.textContent = ragdoll ? "Ragdoll: On" : "Ragdoll: Off";
    ragdollButton.setAttribute("aria-pressed", String(ragdoll));
    ragdollButton.classList.toggle("is-active", ragdoll);
  }
  document.documentElement.dataset.characterControllerRagdollToggle = ragdoll ? "on" : "off";
  document.documentElement.dataset.characterControllerRagdollManual = String(ragdollManual);
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function countAssetTextures(asset: Free3dCharacterAsset | null): number {
  if (asset?.textureCount) return asset.textureCount;
  if (!asset?.textures) return 0;
  return Object.values(asset.textures).filter(Boolean).length;
}

function countAssetClips(asset: Free3dCharacterAsset | null): number {
  if (!asset?.clips) return 0;
  return Object.values(asset.clips).filter(Boolean).length;
}

function countObjectTextures(root: THREE.Object3D | null): number {
  if (!root) return 0;
  const textures = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap"] as Array<keyof THREE.MeshStandardMaterial>) {
        const texture = (material as unknown as Record<string, unknown>)[key];
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
  });
  return textures.size;
}

function disposeObject(root: THREE.Object3D | null): void {
  if (!root) return;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material?.dispose();
  });
}

function visibleAssetRoot(): THREE.Object3D | null {
  return assetViewMode === "environment" ? environmentPreview : controller?.root || null;
}

function channelAttributeValue(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number, component: number, fallback: number): number {
  if (component >= attribute.itemSize) return fallback;
  const value = component === 0
    ? attribute.getX(index)
    : component === 1
      ? attribute.getY(index)
      : component === 2
        ? attribute.getZ(index)
        : attribute.getW(index);
  const normalized = "normalized" in attribute && attribute.normalized && value > 1;
  return THREE.MathUtils.clamp(normalized ? value / 255 : value, 0, 1);
}

function ensureChannelDebugAttributes(geometry: THREE.BufferGeometry): void {
  const position = geometry.attributes.position;
  if (!position) return;
  const count = position.count;
  const hasColor = Boolean(geometry.attributes.color);
  const hasUv0 = Boolean(geometry.attributes.uv);
  const hasUv1 = Boolean(geometry.attributes.uv1);
  const hasUv2 = Boolean(geometry.attributes.uv2);
  for (const attributeName of ["debugColor", "debugMask", "debugUv0", "debugUv1", "debugUv2"]) {
    if (geometry.attributes[attributeName]) geometry.deleteAttribute(attributeName);
  }
  if (!geometry.attributes.debugColor) {
    const sourceColor = geometry.attributes.color;
    const colors = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      colors[offset] = sourceColor ? channelAttributeValue(sourceColor, index, 0, 0.74) : 1;
      colors[offset + 1] = sourceColor ? channelAttributeValue(sourceColor, index, 1, 0.74) : 0;
      colors[offset + 2] = sourceColor ? channelAttributeValue(sourceColor, index, 2, 0.74) : 1;
      colors[offset + 3] = sourceColor ? channelAttributeValue(sourceColor, index, 3, 1) : 1;
    }
    geometry.setAttribute("debugColor", new THREE.BufferAttribute(colors, 4));
  }
  if (!geometry.attributes.debugMask) {
    const masks = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      masks[offset] = hasColor ? 1 : 0;
      masks[offset + 1] = hasUv0 ? 1 : 0;
      masks[offset + 2] = hasUv1 ? 1 : 0;
      masks[offset + 3] = hasUv2 ? 1 : 0;
    }
    geometry.setAttribute("debugMask", new THREE.BufferAttribute(masks, 4));
  }
  for (const [targetName, sourceName] of [
    ["debugUv0", "uv"],
    ["debugUv1", "uv1"],
    ["debugUv2", "uv2"]
  ] as Array<[string, string]>) {
    if (geometry.attributes[targetName]) continue;
    const sourceUv = geometry.attributes[sourceName];
    const uvs = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 2;
      uvs[offset] = sourceUv ? channelAttributeValue(sourceUv, index, 0, 0) : 0;
      uvs[offset + 1] = sourceUv ? channelAttributeValue(sourceUv, index, 1, 0) : 0;
    }
    geometry.setAttribute(targetName, new THREE.BufferAttribute(uvs, 2));
  }
}

function channelDebugMaterial(mode: ChannelViewMode): THREE.ShaderMaterial {
  const cached = channelDebugMaterials.get(mode);
  if (cached) return cached;
  const material = new THREE.ShaderMaterial({
    name: `channel-debug-${mode}`,
    uniforms: {
      channelMode: { value: channelModeIds[mode] }
    },
    vertexShader: `
      attribute vec4 debugColor;
      attribute vec2 debugUv0;
      attribute vec2 debugUv1;
      attribute vec2 debugUv2;
      attribute vec4 debugMask;
      varying vec4 vDebugColor;
      varying vec2 vDebugUv0;
      varying vec2 vDebugUv1;
      varying vec2 vDebugUv2;
      varying vec4 vDebugMask;
      #include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      void main() {
        vDebugColor = debugColor;
        vDebugUv0 = debugUv0;
        vDebugUv1 = debugUv1;
        vDebugUv2 = debugUv2;
        vDebugMask = debugMask;
        vec3 transformed = vec3(position);
        #include <morphtarget_vertex>
        #include <skinbase_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
      }
    `,
    fragmentShader: `
      uniform int channelMode;
      varying vec4 vDebugColor;
      varying vec2 vDebugUv0;
      varying vec2 vDebugUv1;
      varying vec2 vDebugUv2;
      varying vec4 vDebugMask;
      vec3 scalarView(float value) {
        return vec3(clamp(value, 0.0, 1.0));
      }
      vec3 pairView(vec2 value) {
        return vec3(fract(value.x), fract(value.y), 0.0);
      }
      void main() {
        vec3 displayColor = vDebugColor.rgb;
        float hasChannel = vDebugMask.x;
        if (channelMode == 2) displayColor = scalarView(vDebugColor.r);
        else if (channelMode == 3) displayColor = scalarView(vDebugColor.g);
        else if (channelMode == 4) displayColor = scalarView(vDebugColor.b);
        else if (channelMode == 5) displayColor = scalarView(vDebugColor.a);
        else if (channelMode == 6) { displayColor = pairView(vDebugUv0); hasChannel = vDebugMask.y; }
        else if (channelMode == 7) { displayColor = scalarView(vDebugUv0.x); hasChannel = vDebugMask.y; }
        else if (channelMode == 8) { displayColor = scalarView(vDebugUv0.y); hasChannel = vDebugMask.y; }
        else if (channelMode == 9) { displayColor = pairView(vDebugUv1); hasChannel = vDebugMask.z; }
        else if (channelMode == 10) { displayColor = scalarView(vDebugUv1.x); hasChannel = vDebugMask.z; }
        else if (channelMode == 11) { displayColor = scalarView(vDebugUv1.y); hasChannel = vDebugMask.z; }
        else if (channelMode == 12) { displayColor = pairView(vDebugUv2); hasChannel = vDebugMask.w; }
        else if (channelMode == 13) { displayColor = scalarView(vDebugUv2.x); hasChannel = vDebugMask.w; }
        else if (channelMode == 14) { displayColor = scalarView(vDebugUv2.y); hasChannel = vDebugMask.w; }
        if (hasChannel < 0.5) {
          float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.055));
          displayColor = mix(vec3(1.0, 0.0, 1.0), vec3(0.04, 0.0, 0.04), stripe);
        }
        gl_FragColor = vec4(displayColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false
  });
  channelDebugMaterials.set(mode, material);
  return material;
}

function restoreChannelMaterials(root: THREE.Object3D | null = visibleAssetRoot()): void {
  if (!root) return;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = channelOriginalMaterials.get(child);
    if (!original) return;
    child.material = original;
    channelOriginalMaterials.delete(child);
  });
}

function setChannelView(mode: ChannelViewMode): void {
  channelViewMode = mode;
  if (channelViewSelect) channelViewSelect.value = mode;
  setText(channelViewStatusEl, channelModeLabels[mode]);
  const root = visibleAssetRoot();
  restoreChannelMaterials(root);
  let meshCount = 0;
  if (root && mode !== "rendered") {
    const material = channelDebugMaterial(mode);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) return;
      ensureChannelDebugAttributes(child.geometry);
      if (!channelOriginalMaterials.has(child)) channelOriginalMaterials.set(child, child.material);
      child.material = material;
      meshCount += 1;
    });
  }
  document.documentElement.dataset.channelViewMode = mode;
  document.documentElement.dataset.channelViewLabel = channelModeLabels[mode];
  document.documentElement.dataset.channelViewMeshCount = String(meshCount);
  document.documentElement.dataset.channelViewTarget = root?.name || assetViewMode;
}

function parseChannelViewMode(value: string): ChannelViewMode {
  return Object.prototype.hasOwnProperty.call(channelModeIds, value) ? value as ChannelViewMode : "rendered";
}

function bindButtonPress(button: HTMLButtonElement | null, handler: () => void): void {
  if (!button) return;
  let pointerPressAt = 0;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerPressAt = Date.now();
    event.preventDefault();
    button.focus();
    handler();
  });
  button.addEventListener("click", () => {
    if (Date.now() - pointerPressAt < 240) return;
    handler();
  });
}

function updateAoContrast(value: number): void {
  aoContrast = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1.35, 0.45, 3);
  if (aoContrastInput) aoContrastInput.value = aoContrast.toFixed(2);
  setText(aoContrastValueEl, aoContrast.toFixed(2));
  document.documentElement.dataset.texturelessPbrAoContrast = aoContrast.toFixed(2);
}

function syncAoContrastFromInput(): void {
  updateAoContrast(Number(aoContrastInput?.value || aoContrast));
}

function texturelessBakeOptions(batchMode = false): TexturelessPbrBakeOptions {
  syncAoContrastFromInput();
  return {
    bakeGeometryAo: true,
    aoContrast,
    aoSamples: batchMode ? 8 : 16,
    yieldEveryVertices: batchMode ? 2048 : 4096
  };
}

function setBatchStatus(label: string): void {
  setText(pbrBatchStatusEl, label);
  document.documentElement.dataset.texturelessPbrBatchStatus = label;
}

function clearPbrStatus(label = "textured"): void {
  lastPbrResult = null;
  setText(pbrStatusEl, label);
  setText(pbrVerticesEl, "0");
  setText(pbrTexturesEl, "0");
  setText(pbrAoEl, "1.00");
  document.documentElement.dataset.texturelessPbrConverted = "false";
  document.documentElement.dataset.texturelessPbrColor = "COLOR_0.rgba";
  document.documentElement.dataset.texturelessPbrAo = "COLOR_0.a";
  document.documentElement.dataset.texturelessPbrGeometricAo = "false";
  document.documentElement.dataset.texturelessPbrUv1 = "TEXCOORD_1.roughness_metalness";
  document.documentElement.dataset.texturelessPbrVertexCount = "0";
  document.documentElement.dataset.texturelessPbrRemovedTextures = "0";
  document.documentElement.dataset.texturelessPbrAverageAo = "1.000";
}

function setPbrStatus(result: TexturelessPbrBakeResult, label = result.converted ? "converted" : "empty"): void {
  lastPbrResult = result;
  setText(pbrStatusEl, label);
  setText(pbrVerticesEl, result.vertexCount.toLocaleString("en-US"));
  setText(pbrTexturesEl, String(result.strippedTextureCount));
  setText(pbrAoEl, result.averageAo.toFixed(2));
  document.documentElement.dataset.texturelessPbrConverted = String(result.converted);
  document.documentElement.dataset.texturelessPbrMeshCount = String(result.meshCount);
  document.documentElement.dataset.texturelessPbrVertexCount = String(result.vertexCount);
  document.documentElement.dataset.texturelessPbrMaterialCount = String(result.materialCount);
  document.documentElement.dataset.texturelessPbrRemovedTextures = String(result.strippedTextureCount);
  document.documentElement.dataset.texturelessPbrAverageAo = result.averageAo.toFixed(3);
  document.documentElement.dataset.texturelessPbrAverageGeometryAo = result.averageGeometryAo.toFixed(3);
  document.documentElement.dataset.texturelessPbrAverageRoughness = result.averageRoughness.toFixed(3);
  document.documentElement.dataset.texturelessPbrAverageMetalness = result.averageMetalness.toFixed(3);
  document.documentElement.dataset.texturelessPbrGeometricAo = String(result.geometricAoBaked);
  document.documentElement.dataset.texturelessPbrAoContrast = result.aoContrast.toFixed(2);
  document.documentElement.dataset.texturelessPbrAoSamples = String(result.aoSamples);
  document.documentElement.dataset.texturelessPbrAoRadius = result.aoRadius.toFixed(3);
  document.documentElement.dataset.texturelessPbrAoOccluderTriangles = String(result.occluderTriangleCount);
  document.documentElement.dataset.texturelessPbrColor = "COLOR_0.rgba";
  document.documentElement.dataset.texturelessPbrAo = "COLOR_0.a";
  document.documentElement.dataset.texturelessPbrUv1 = "TEXCOORD_1.roughness_metalness";
}

function updateModeUi(): void {
  setText(assetTypeEl, assetViewMode);
  if (assetKindSelect) assetKindSelect.value = assetViewMode;
  if (characterRow) characterRow.style.display = assetViewMode === "character" ? "grid" : "none";
  if (characterSelect) characterSelect.style.display = assetViewMode === "character" ? "block" : "none";
  if (environmentSelect) environmentSelect.style.display = assetViewMode === "environment" ? "block" : "none";
  if (environmentGallery) environmentGallery.style.display = assetViewMode === "environment" ? "grid" : "none";
  document.documentElement.dataset.assetViewMode = assetViewMode;
}

function populateRosterSelect(): void {
  if (!characterSelect) return;
  characterSelect.textContent = "";
  rosterAssets.forEach((asset, index) => {
    const option = document.createElement("option");
    option.value = asset.guid;
    option.textContent = `${index + 1}. ${asset.title}`;
    characterSelect.append(option);
  });
}

function populateEnvironmentControls(): void {
  if (environmentSelect) {
    environmentSelect.textContent = "";
    environmentAssets.forEach((asset, index) => {
      const option = document.createElement("option");
      option.value = asset.guid;
      option.textContent = `${index + 1}. ${asset.kind}`;
      environmentSelect.append(option);
    });
  }
  if (environmentGallery) {
    environmentGallery.textContent = "";
    environmentAssets.forEach((asset, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.value = asset.guid;
      button.textContent = `${index + 1}. ${asset.kind}`;
      button.setAttribute("aria-pressed", index === currentEnvironmentIndex ? "true" : "false");
      button.addEventListener("click", () => void selectEnvironment(asset.guid));
      environmentGallery.append(button);
    });
  }
  document.documentElement.dataset.environmentGalleryCount = String(environmentAssets.length);
}

function updateEnvironmentGalleryState(): void {
  if (!environmentGallery) return;
  Array.from(environmentGallery.querySelectorAll<HTMLButtonElement>("button")).forEach((button, index) => {
    button.setAttribute("aria-pressed", index === currentEnvironmentIndex ? "true" : "false");
  });
}

function updateRosterUi(asset: Free3dCharacterAsset | null, loaded = false): void {
  const total = rosterAssets.length;
  setText(rosterPositionEl, total ? `${currentCharacterIndex + 1}/${total}` : "0/0");
  setText(characterTitleEl, asset?.title || "loading");
  setText(clipCountEl, String(asset ? countAssetClips(asset) : 0));
  setText(textureCountEl, String(asset ? countAssetTextures(asset) : 0));
  if (characterSelect && asset) characterSelect.value = asset.guid;
  document.documentElement.dataset.characterRosterCount = String(total);
  document.documentElement.dataset.characterRosterIndex = String(total ? currentCharacterIndex : -1);
  document.documentElement.dataset.characterRosterGuid = asset?.guid || "";
  document.documentElement.dataset.characterTextureCount = String(asset ? countAssetTextures(asset) : 0);
  document.documentElement.dataset.characterClipCount = String(asset ? countAssetClips(asset) : 0);
  document.documentElement.dataset.characterControllerTest = loaded ? "ready" : "loading";
}

function updateEnvironmentUi(asset: EnvironmentAsset | null, loaded = false, textureCount = 0): void {
  const total = environmentAssets.length;
  setText(rosterPositionEl, total ? `${currentEnvironmentIndex + 1}/${total}` : "0/0");
  setText(characterTitleEl, asset?.title || "environment loading");
  setText(clipCountEl, "0");
  setText(textureCountEl, String(textureCount));
  if (environmentSelect && asset) environmentSelect.value = asset.guid;
  updateEnvironmentGalleryState();
  document.documentElement.dataset.environmentGalleryCount = String(total);
  document.documentElement.dataset.environmentAssetIndex = String(total ? currentEnvironmentIndex : -1);
  document.documentElement.dataset.environmentAssetGuid = asset?.guid || "";
  document.documentElement.dataset.environmentAssetKind = asset?.kind || "";
  document.documentElement.dataset.environmentTextureCount = String(textureCount);
  document.documentElement.dataset.environmentAssetLoaded = loaded ? "true" : "false";
}

function trigger(action: KickKind, sprintJump = false): void {
  triggerSequence += 1;
  document.documentElement.dataset.characterControllerTriggerAttempt = action;
  document.documentElement.dataset.characterControllerTriggerSequence = String(triggerSequence);
  if (ragdoll) {
    document.documentElement.dataset.characterControllerTriggerBlocked = "ragdoll";
    return;
  }
  document.documentElement.dataset.characterControllerTriggerBlocked = "";
  celebration = null;
  celebrationAt = 0;
  celebrationAvailableUntil = 0;
  lastAction = action;
  if (action === "left") {
    lastActionSide = nextFootStrikeSide;
    nextFootStrikeSide = nextFootStrikeSide === "left" ? "right" : "left";
  } else {
    lastActionSide = null;
  }
  lastActionAt = Date.now();
  document.documentElement.dataset.characterControllerTrigger = action;
  document.documentElement.dataset.characterControllerTriggerSide = lastActionSide || "";
  if (action === "jump" && !airborne && stamina >= 12) {
    airborne = true;
    verticalVelocity = sprintJump ? 6.35 : 5.8;
    if (sprintJump) {
      sprinting = true;
      sprintJumpUntil = Date.now() + 700;
      if (velocity.length() < 4.7) velocity.set(0, 0, -5.9);
      yaw = Math.PI;
    }
    stamina = Math.max(0, stamina - 12);
  } else if (action !== "jump") {
    stamina = Math.max(0, stamina - 6);
  }
  if (stamina <= 0.5) activateRagdoll(action === "hand" ? 7.2 : action === "left" ? 6.4 : 5.6);
}

function activateRagdoll(power = 6.2, manual = false): void {
  if (ragdoll) {
    if (manual) ragdollManual = true;
    syncRagdollButton();
    return;
  }
  ragdoll = true;
  ragdollManual = manual;
  ragdollAt = Date.now();
  stamina = 0;
  lastAction = "body";
  lastActionSide = null;
  lastActionAt = ragdollAt;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const impulse = manual ? -power * 0.48 : power;
  if (velocity.length() < 1.2) velocity.addScaledVector(forward, impulse);
  else velocity.addScaledVector(forward, impulse * 0.65);
  verticalVelocity = Math.max(verticalVelocity, manual ? 2.15 : 3.6);
  airborne = true;
  syncRagdollButton();
}

function deactivateRagdoll(): void {
  if (!ragdoll) {
    ragdollManual = false;
    syncRagdollButton();
    return;
  }
  ragdoll = false;
  ragdollManual = false;
  ragdollAt = 0;
  airborne = false;
  verticalVelocity = 0;
  position.y = 0;
  velocity.multiplyScalar(0.18);
  stamina = Math.max(stamina, 55);
  lastAction = null;
  lastActionSide = null;
  lastActionAt = 0;
  syncRagdollButton();
}

function toggleRagdoll(): void {
  if (ragdoll) deactivateRagdoll();
  else activateRagdoll(7.4, true);
}

function resetCharacterRuntimeState(): void {
  keys.clear();
  velocity.set(0, 0, 0);
  position.set(0, 0, 0);
  desired.set(0, 0, 0);
  lastAction = null;
  lastActionSide = null;
  lastActionAt = 0;
  nextFootStrikeSide = "left";
  celebration = null;
  celebrationAt = 0;
  celebrationAvailableUntil = 0;
  stamina = 100;
  verticalVelocity = 0;
  airborne = false;
  ragdoll = false;
  ragdollAt = 0;
  ragdollManual = false;
  sprinting = false;
  sprintJumpUntil = 0;
  yaw = Math.PI;
  document.documentElement.dataset.characterControllerTrigger = "";
  document.documentElement.dataset.characterControllerTriggerSide = "";
  document.documentElement.dataset.characterControllerTriggerBlocked = "";
  syncRagdollButton();
}

function celebrate(action: CelebrationKind): void {
  if (ragdoll) return;
  celebration = action;
  celebrationAt = Date.now();
  celebrationAvailableUntil = celebrationAt + 6500;
  lastAction = null;
  lastActionSide = null;
  lastActionAt = 0;
}

function movementInput(): THREE.Vector3 {
  desired.set(0, 0, 0);
  if (keys.has("KeyW")) desired.z -= 1;
  if (keys.has("KeyS")) desired.z += 1;
  if (keys.has("KeyA")) desired.x -= 1;
  if (keys.has("KeyD")) desired.x += 1;
  if (desired.lengthSq() > 0) desired.normalize();
  return desired;
}

async function loadRoster(): Promise<void> {
  const response = await fetch(rosterSrc, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Free3D character roster HTTP ${response.status}`);
  const roster = await response.json() as Free3dCharacterRoster;
  rosterAssets = roster.assets;
  populateRosterSelect();
  updateRosterUi(rosterAssets[0] || null, false);
}

async function loadEnvironmentRoster(): Promise<void> {
  const response = await fetch(environmentRosterSrc, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Free3D environment roster HTTP ${response.status}`);
  const roster = await response.json() as EnvironmentRoster;
  environmentAssets = roster.assets;
  populateEnvironmentControls();
  updateEnvironmentUi(environmentAssets[0] || null, false, 0);
}

function loadEnvironmentTemplate(asset: EnvironmentAsset): Promise<THREE.Object3D | null> {
  const cached = environmentCache.get(asset.src);
  if (cached) return cached;
  const promise = new Promise<THREE.Object3D | null>((resolve) => {
    environmentLoader.load(
      asset.src,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => {
        console.warn("Free3D environment preview failed", asset.guid, error);
        resolve(null);
      }
    );
  });
  environmentCache.set(asset.src, promise);
  return promise;
}

function normalizeEnvironmentPreview(source: THREE.Object3D, asset: EnvironmentAsset): THREE.Object3D {
  const root = new THREE.Group();
  root.name = `free3d-environment-preview-${asset.guid}`;
  root.add(source);
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) child.material = child.material.map((material) => material.clone());
    else if (child.material) child.material = child.material.clone();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = Math.max(material.roughness, 0.54);
        material.metalness = Math.min(material.metalness, 0.45);
        material.needsUpdate = true;
      }
    }
  });
  root.updateMatrixWorld(true);
  bounds.setFromObject(root);
  bounds.getSize(boundsSize);
  bounds.getCenter(boundsCenter);
  source.position.sub(boundsCenter);
  const largest = Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 0.001);
  const scale = 2.65 / largest;
  root.scale.setScalar(scale);
  root.position.set(0, Math.max(0.02, boundsSize.y * scale * 0.5), 0);
  root.userData.environmentAsset = asset;
  return root;
}

function removeEnvironmentPreview(): void {
  if (!environmentPreview) return;
  restoreChannelMaterials(environmentPreview);
  scene.remove(environmentPreview);
  disposeObject(environmentPreview);
  environmentPreview = null;
}

function installWindowHarness(): void {
  window.unsoccerCharacterControllerTest = {
      controller,
      trigger,
      sprintJump: () => trigger("jump", true),
      ragdoll: toggleRagdoll,
      toggleRagdoll,
      setRagdoll: (active: boolean) => {
        if (active) activateRagdoll(7.4, true);
        else deactivateRagdoll();
      },
      celebrate,
      selectCharacter,
    nextCharacter,
    selectEnvironment,
    nextEnvironment,
    assetMode,
    convertPbr: convertVisiblePbr,
    convertAllPbr,
    setChannelView,
    state: () => ({
      assetViewMode,
      channelViewMode,
      aoContrast,
      pbrBatchInProgress,
      velocity: velocity.toArray(),
      position: position.toArray(),
      airborne,
      ragdoll,
      ragdollAt,
      ragdollManual,
      sprinting,
      stamina,
      lastAction,
      lastActionSide,
      lastActionAt,
      celebration,
      celebrationAt,
      celebrationAvailableUntil,
      rosterCount: rosterAssets.length,
      characterIndex: currentCharacterIndex,
      characterGuid: rosterAssets[currentCharacterIndex]?.guid || null,
      environmentCount: environmentAssets.length,
      environmentIndex: currentEnvironmentIndex,
      environmentGuid: environmentAssets[currentEnvironmentIndex]?.guid || null,
      texturelessPbr: lastPbrResult,
      texturelessPbrBatch: lastPbrBatchResult,
      debug: controller?.debugSnapshot()
    }),
    roster: () => rosterAssets.map((asset, index) => ({
      index,
      guid: asset.guid,
      title: asset.title,
      textures: countAssetTextures(asset),
      clips: countAssetClips(asset)
    })),
    environmentRoster: () => environmentAssets.map((asset, index) => ({
      index,
      guid: asset.guid,
      kind: asset.kind,
      title: asset.title,
      bytes: asset.bytes || 0
    })),
    converterState: () => ({
      current: lastPbrResult,
      batch: lastPbrBatchResult,
      aoContrast
    })
  };
}

async function selectCharacter(indexOrGuid: number | string): Promise<void> {
  if (rosterAssets.length === 0) return;
  const nextIndex = typeof indexOrGuid === "number"
    ? wrapIndex(indexOrGuid, rosterAssets.length)
    : rosterAssets.findIndex((entry) => entry.guid === indexOrGuid);
  if (nextIndex < 0) return;
  assetViewMode = "character";
  resetCharacterRuntimeState();
  updateModeUi();
  removeEnvironmentPreview();
  document.documentElement.dataset.environmentAssetGuid = "";
  document.documentElement.dataset.environmentAssetKind = "";
  document.documentElement.dataset.environmentPreview = "inactive";
  document.documentElement.dataset.environmentTexturelessPbr = "false";
  const asset = rosterAssets[nextIndex];
  const sequence = ++loadSequence;
  currentCharacterIndex = nextIndex;
  setText(assetEl, asset.guid);
  setText(modeEl, "loading");
  clearPbrStatus("textured");
  updateRosterUi(asset, false);
  const loaded = await loadFree3dCharacter(rosterSrc, asset.guid);
  if (sequence !== loadSequence) return;
  if (!loaded) {
    setText(modeEl, "load error");
    document.documentElement.dataset.characterControllerTest = "load-error";
    return;
  }
  if (controller) {
    restoreChannelMaterials(controller.root);
    scene.remove(controller.root);
    controller.dispose();
  }
  controller = new GameCharacterController(loaded, 0x58a8ff);
  scene.add(controller.root);
  installWindowHarness();
  updateRosterUi(loaded.asset, true);
  setText(assetEl, loaded.asset.guid);
  setText(modeEl, loaded.asset.mode);
  setText(clipCountEl, String(Object.keys(loaded.clips).length));
  setText(textureCountEl, String(loaded.textureCount));
  if (loaded.texturelessPbr) setPbrStatus(loaded.texturelessPbr, "baked");
  document.documentElement.dataset.playerRig = "free3d-skinned-character-controller";
  document.documentElement.dataset.playerRigAsset = loaded.asset.guid;
  document.documentElement.dataset.playerRigMode = loaded.roster.mode;
  document.documentElement.dataset.characterClipCount = String(Object.keys(loaded.clips).length);
  document.documentElement.dataset.playerRigClipCount = String(Object.keys(loaded.clips).length);
  document.documentElement.dataset.playerRigTextures = String(loaded.textureCount);
  document.documentElement.dataset.playerRigTextureCount = String(loaded.textureCount);
  setChannelView(channelViewMode);
}

async function nextCharacter(direction = 1): Promise<void> {
  await selectCharacter(currentCharacterIndex + direction);
}

async function selectEnvironment(indexOrGuid: number | string): Promise<void> {
  if (environmentAssets.length === 0) return;
  const nextIndex = typeof indexOrGuid === "number"
    ? wrapIndex(indexOrGuid, environmentAssets.length)
    : environmentAssets.findIndex((entry) => entry.guid === indexOrGuid);
  if (nextIndex < 0) return;
  assetViewMode = "environment";
  updateModeUi();
  const asset = environmentAssets[nextIndex];
  const sequence = ++loadSequence;
  currentEnvironmentIndex = nextIndex;
  updateEnvironmentGalleryState();
  setText(assetEl, asset.guid);
  setText(modeEl, "environment loading");
  clearPbrStatus("textured");
  updateEnvironmentUi(asset, false, 0);
  if (controller) {
    restoreChannelMaterials(controller.root);
    scene.remove(controller.root);
    controller.dispose();
    controller = null;
  }
  document.documentElement.dataset.playerRigAsset = "";
  document.documentElement.dataset.playerRigTexturelessPbr = "false";
  document.documentElement.dataset.playerRigTextures = "0";
  document.documentElement.dataset.playerRigTextureCount = "0";
  const template = await loadEnvironmentTemplate(asset);
  if (sequence !== loadSequence) return;
  removeEnvironmentPreview();
  if (!template) {
    setText(modeEl, "load error");
    document.documentElement.dataset.environmentAssetLoaded = "load-error";
    installWindowHarness();
    return;
  }
  environmentPreview = normalizeEnvironmentPreview(template.clone(true), asset);
  scene.add(environmentPreview);
  environmentTurntable = 0;
  position.set(0, 0, 0);
  velocity.set(0, 0, 0);
  updateEnvironmentUi(asset, true, countObjectTextures(environmentPreview));
  setText(assetEl, asset.guid);
  setText(modeEl, asset.kind);
  document.documentElement.dataset.environmentAssetLoaded = "true";
  document.documentElement.dataset.environmentPreview = "ready";
  installWindowHarness();
  setChannelView(channelViewMode);
}

async function nextEnvironment(direction = 1): Promise<void> {
  await selectEnvironment(currentEnvironmentIndex + direction);
}

async function assetMode(mode: AssetViewMode): Promise<void> {
  if (mode === "environment") await selectEnvironment(currentEnvironmentIndex);
  else await selectCharacter(currentCharacterIndex);
}

async function reloadCurrentAsset(): Promise<void> {
  if (assetViewMode === "environment") await selectEnvironment(currentEnvironmentIndex);
  else await selectCharacter(currentCharacterIndex);
}

async function convertVisiblePbr(batchMode = false): Promise<TexturelessPbrBakeResult | null> {
  const target = assetViewMode === "environment" ? environmentPreview : controller?.root || null;
  if (!target) {
    clearPbrStatus("no asset");
    return null;
  }
  const previousChannelMode = channelViewMode;
  restoreChannelMaterials(target);
  setText(pbrStatusEl, "converting");
  document.documentElement.dataset.texturelessPbrConverting = "true";
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const result = await bakeTexturelessPbr(target, texturelessBakeOptions(batchMode));
  setPbrStatus(result);
  setText(textureCountEl, "0");
  if (assetViewMode === "character") {
    document.documentElement.dataset.playerRigTexturelessPbr = String(result.converted);
    document.documentElement.dataset.playerRigTextures = "0";
    document.documentElement.dataset.playerRigTextureCount = "0";
  } else {
    document.documentElement.dataset.environmentTexturelessPbr = String(result.converted);
    document.documentElement.dataset.environmentTextureCount = "0";
  }
  document.documentElement.dataset.texturelessPbrConverting = "false";
  installWindowHarness();
  setChannelView(previousChannelMode);
  return result;
}

async function renderOneFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function setBatchProgress(done: number, total: number, failures: number): void {
  const label = total > 0 ? `${done}/${total}` : "idle";
  setBatchStatus(label);
  document.documentElement.dataset.texturelessPbrBatchDone = String(done);
  document.documentElement.dataset.texturelessPbrBatchTotal = String(total);
  document.documentElement.dataset.texturelessPbrBatchFailures = String(failures);
}

function setBatchResult(result: TexturelessPbrBatchResult): void {
  lastPbrBatchResult = result;
  setBatchStatus(result.failures > 0 ? `done ${result.failures} err` : "ready");
  document.documentElement.dataset.texturelessPbrBatchComplete = "true";
  document.documentElement.dataset.texturelessPbrBatchTotal = String(result.total);
  document.documentElement.dataset.texturelessPbrBatchDone = String(result.completed);
  document.documentElement.dataset.texturelessPbrBatchFailures = String(result.failures);
  document.documentElement.dataset.texturelessPbrBatchVertexCount = String(result.vertexCount);
  document.documentElement.dataset.texturelessPbrBatchRemovedTextures = String(result.strippedTextureCount);
  document.documentElement.dataset.texturelessPbrBatchAverageAo = result.averageAo.toFixed(3);
  document.documentElement.dataset.texturelessPbrBatchAoContrast = result.aoContrast.toFixed(2);
}

async function convertAllPbr(): Promise<TexturelessPbrBatchResult | null> {
  if (pbrBatchInProgress) return lastPbrBatchResult;
  const total = rosterAssets.length + environmentAssets.length;
  if (total <= 0) {
    setBatchStatus("no assets");
    return null;
  }

  const previousMode = assetViewMode;
  const previousCharacter = currentCharacterIndex;
  const previousEnvironment = currentEnvironmentIndex;
  const previousChannelMode = channelViewMode;
  const items: TexturelessPbrBatchItem[] = [];
  let failures = 0;
  let vertexCount = 0;
  let strippedTextureCount = 0;
  let aoSum = 0;
  let aoCount = 0;

  pbrBatchInProgress = true;
  if (batchConvertButton) batchConvertButton.disabled = true;
  document.documentElement.dataset.texturelessPbrBatchComplete = "false";
  document.documentElement.dataset.texturelessPbrBatchRunning = "true";
  setBatchProgress(0, total, 0);

  try {
    for (let index = 0; index < rosterAssets.length; index += 1) {
      const asset = rosterAssets[index];
      try {
        await selectCharacter(index);
        await renderOneFrame();
        const result = await convertVisiblePbr(true);
        if (!result) throw new Error("character bake returned empty result");
        items.push({
          kind: "character",
          guid: asset.guid,
          title: asset.title,
          converted: result.converted,
          vertexCount: result.vertexCount,
          strippedTextureCount: result.strippedTextureCount,
          averageAo: result.averageAo
        });
        vertexCount += result.vertexCount;
        strippedTextureCount += result.strippedTextureCount;
        aoSum += result.averageAo * result.vertexCount;
        aoCount += result.vertexCount;
      } catch (error) {
        failures += 1;
        items.push({
          kind: "character",
          guid: asset.guid,
          title: asset.title,
          converted: false,
          vertexCount: 0,
          strippedTextureCount: 0,
          averageAo: 1,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      setBatchProgress(items.length, total, failures);
      await renderOneFrame();
    }

    for (let index = 0; index < environmentAssets.length; index += 1) {
      const asset = environmentAssets[index];
      try {
        await selectEnvironment(index);
        await renderOneFrame();
        const result = await convertVisiblePbr(true);
        if (!result) throw new Error("environment bake returned empty result");
        items.push({
          kind: "environment",
          guid: asset.guid,
          title: asset.title,
          converted: result.converted,
          vertexCount: result.vertexCount,
          strippedTextureCount: result.strippedTextureCount,
          averageAo: result.averageAo
        });
        vertexCount += result.vertexCount;
        strippedTextureCount += result.strippedTextureCount;
        aoSum += result.averageAo * result.vertexCount;
        aoCount += result.vertexCount;
      } catch (error) {
        failures += 1;
        items.push({
          kind: "environment",
          guid: asset.guid,
          title: asset.title,
          converted: false,
          vertexCount: 0,
          strippedTextureCount: 0,
          averageAo: 1,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      setBatchProgress(items.length, total, failures);
      await renderOneFrame();
    }

    if (previousMode === "environment") await selectEnvironment(previousEnvironment);
    else await selectCharacter(previousCharacter);
    await renderOneFrame();
    await convertVisiblePbr(true);
    setChannelView(previousChannelMode);

    const result: TexturelessPbrBatchResult = {
      total,
      completed: items.length,
      failures,
      vertexCount,
      strippedTextureCount,
      averageAo: aoCount > 0 ? aoSum / aoCount : 1,
      aoContrast,
      items
    };
    setBatchResult(result);
    installWindowHarness();
    return result;
  } finally {
    pbrBatchInProgress = false;
    if (batchConvertButton) batchConvertButton.disabled = false;
    document.documentElement.dataset.texturelessPbrBatchRunning = "false";
  }
}

function updateKinematics(dt: number): void {
  if (ragdoll) {
    position.addScaledVector(velocity, dt);
    velocity.multiplyScalar(Math.exp(-dt * 1.2));
    position.x = THREE.MathUtils.clamp(position.x, -4.8, 4.8);
    position.z = THREE.MathUtils.clamp(position.z, -4.8, 4.8);
    position.y += verticalVelocity * dt;
    verticalVelocity -= 18.5 * dt;
    if (position.y <= 0) {
      position.y = 0;
      airborne = false;
      verticalVelocity = 0;
    } else {
      airborne = true;
    }
    stamina = Math.min(100, stamina + dt * 17);
    sprinting = false;
    if (!ragdollManual && !airborne && Date.now() - ragdollAt > 1600 && stamina >= 22 && velocity.length() < 1.05) {
      ragdoll = false;
      ragdollAt = 0;
      ragdollManual = false;
      lastAction = null;
      lastActionSide = null;
      lastActionAt = 0;
      syncRagdollButton();
    }
    return;
  }
  const input = movementInput();
  const sprintBoost = Date.now() < sprintJumpUntil;
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || sprintBoost;
  const moving = input.lengthSq() > 0;
  const exhausted = stamina <= 0.5;
  const maxSpeed = sprint && (moving || sprintBoost) && !exhausted ? 6.7 : moving ? 3.2 : 0;
  const target = input.multiplyScalar(maxSpeed);
  if (sprintBoost && target.lengthSq() <= 0.01) target.set(0, 0, -maxSpeed);
  const rate = moving ? 15 : 20;
  const alpha = 1 - Math.exp(-dt * rate);
  velocity.lerp(target, alpha);
  position.addScaledVector(velocity, dt);
  position.x = THREE.MathUtils.clamp(position.x, -4.8, 4.8);
  position.z = THREE.MathUtils.clamp(position.z, -4.8, 4.8);
  if (velocity.lengthSq() > 0.01) {
    const targetYaw = Math.atan2(velocity.x, velocity.z);
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, 1 - Math.exp(-dt * 12));
  }
  sprinting = sprint && (moving || sprintBoost) && !exhausted;
  if (sprinting) stamina = Math.max(0, stamina - dt * 18);
  else stamina = Math.min(100, stamina + dt * (airborne ? 9 : 15));
  if (airborne) {
    position.y += verticalVelocity * dt;
    verticalVelocity -= 18.5 * dt;
    if (position.y <= 0) {
      position.y = 0;
      airborne = false;
      verticalVelocity = 0;
    }
  }
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function animate(): void {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, Math.max(0, now - lastTime));
  lastTime = now;
  updateKinematics(dt);
  if (controller) {
    controller.root.position.x = position.x;
    controller.root.position.z = position.z;
    controller.root.rotation.y = yaw;
    const debug = controller.update({
      velocity,
      airborne,
      exhausted: stamina <= 0.5,
      stamina,
      sprinting,
      ragdoll,
      ragdollAt,
      lastAction,
      lastActionSide,
      lastActionAt,
      celebration,
      celebrationAt,
      celebrationAvailableUntil
    }, now);
    controller.root.position.y += position.y;
    setText(actionEl, debug.action);
    setText(speedEl, debug.speed.toFixed(2));
    const strikeLabel = debug.strike === "hand"
      ? `${debug.strikeSide}-hand`
      : debug.strike === "left"
        ? `${debug.strikeSide}-foot`
        : debug.strike;
    const overlayLabel = debug.celebration !== "none"
      ? `${debug.celebration} ${debug.celebrationPulse.toFixed(2)}`
      : `${strikeLabel} ${debug.strikePulse.toFixed(2)}`;
    setText(strikeEl, overlayLabel);
    setText(staminaEl, Math.round(stamina).toString());
    document.documentElement.dataset.playerRigAction = debug.action;
    document.documentElement.dataset.playerRigLocomotion = debug.locomotion;
    document.documentElement.dataset.playerRigStrike = debug.strike;
    document.documentElement.dataset.playerRigStrikeSide = debug.strikeSide;
    document.documentElement.dataset.playerRigJumpStyle = debug.jumpStyle;
    document.documentElement.dataset.playerRigRagdoll = String(debug.ragdoll);
    document.documentElement.dataset.characterControllerRagdoll = String(ragdoll);
    document.documentElement.dataset.characterControllerRagdollAt = String(ragdollAt);
    document.documentElement.dataset.characterControllerRagdollManual = String(ragdollManual);
    document.documentElement.dataset.characterControllerSprinting = String(sprinting);
    document.documentElement.dataset.playerRigCelebration = debug.celebration;
    document.documentElement.dataset.playerRigCelebrationPulse = debug.celebrationPulse.toFixed(2);
    document.documentElement.dataset.playerRigIk = debug.ikMode;
    bounds.setFromObject(controller.root);
    bounds.getSize(boundsSize);
    bounds.getCenter(boundsCenter);
    document.documentElement.dataset.characterControllerBounds =
      `${boundsSize.x.toFixed(2)},${boundsSize.y.toFixed(2)},${boundsSize.z.toFixed(2)}`;
    document.documentElement.dataset.characterControllerCenter =
      `${boundsCenter.x.toFixed(2)},${boundsCenter.y.toFixed(2)},${boundsCenter.z.toFixed(2)}`;
  }
  if (environmentPreview) {
    environmentTurntable += dt * 0.42;
    environmentPreview.rotation.y = environmentTurntable;
    bounds.setFromObject(environmentPreview);
    bounds.getSize(boundsSize);
    bounds.getCenter(boundsCenter);
    setText(actionEl, "preview");
    setText(speedEl, "0.00");
    setText(strikeEl, "none");
    setText(staminaEl, "-");
    document.documentElement.dataset.environmentPreviewBounds =
      `${boundsSize.x.toFixed(2)},${boundsSize.y.toFixed(2)},${boundsSize.z.toFixed(2)}`;
    document.documentElement.dataset.environmentPreviewCenter =
      `${boundsCenter.x.toFixed(2)},${boundsCenter.y.toFixed(2)},${boundsCenter.z.toFixed(2)}`;
  }
  const focus = environmentPreview
    ? new THREE.Vector3(boundsCenter.x, Math.max(0.55, boundsCenter.y), boundsCenter.z)
    : new THREE.Vector3(position.x, 1.15 + position.y * 0.25, position.z);
  const previewRadius = environmentPreview ? Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 1.8) : 0;
  const cameraTarget = environmentPreview
    ? new THREE.Vector3(boundsCenter.x, Math.max(1.8, boundsCenter.y + previewRadius * 0.34), boundsCenter.z + Math.max(3.4, previewRadius * 2.25))
    : new THREE.Vector3(position.x + 0.82, 2, position.z + 5.25);
  camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 5.5));
  camera.lookAt(focus);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "ArrowUp") {
    event.preventDefault();
    if (!event.repeat) void (assetViewMode === "environment" ? nextEnvironment(-1) : nextCharacter(-1));
    return;
  }
  if (event.code === "ArrowRight" || event.code === "ArrowDown") {
    event.preventDefault();
    if (!event.repeat) void (assetViewMode === "environment" ? nextEnvironment(1) : nextCharacter(1));
    return;
  }
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    trigger("jump", keys.has("ShiftLeft") || keys.has("ShiftRight"));
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("mousedown", (event) => {
  canvas.focus();
  if (event.button === 0) {
    event.preventDefault();
    trigger("left");
  }
  if (event.button === 1) {
    event.preventDefault();
    trigger("head");
  }
  if (event.button === 2) {
    event.preventDefault();
    trigger("hand");
  }
});
canvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
}, { passive: false });
bindButtonPress(footButton, () => trigger("left"));
bindButtonPress(handButton, () => trigger("hand"));
bindButtonPress(headButton, () => trigger("head"));
bindButtonPress(jumpButton, () => trigger("jump"));
bindButtonPress(sprintJumpButton, () => trigger("jump", true));
bindButtonPress(ragdollButton, () => toggleRagdoll());
bindButtonPress(celebrate1Button, () => celebrate("celebrate1"));
bindButtonPress(celebrate2Button, () => celebrate("celebrate2"));
bindButtonPress(celebrate3Button, () => celebrate("celebrate3"));
document.querySelector("#btn-prev-character")?.addEventListener("click", () => void nextCharacter(-1));
document.querySelector("#btn-next-character")?.addEventListener("click", () => void nextCharacter(1));
characterSelect?.addEventListener("change", () => void selectCharacter(characterSelect.value));
environmentSelect?.addEventListener("change", () => void selectEnvironment(environmentSelect.value));
assetKindSelect?.addEventListener("change", () => void assetMode(assetKindSelect.value === "environment" ? "environment" : "character"));
channelViewSelect?.addEventListener("change", () => setChannelView(parseChannelViewMode(channelViewSelect.value)));
aoContrastInput?.addEventListener("input", syncAoContrastFromInput);
aoContrastInput?.addEventListener("change", syncAoContrastFromInput);
document.querySelector("#btn-convert-pbr")?.addEventListener("click", () => void convertVisiblePbr());
batchConvertButton?.addEventListener("click", () => void convertAllPbr());
document.querySelector("#btn-reload-asset")?.addEventListener("click", () => void reloadCurrentAsset());

resize();
updateModeUi();
updateAoContrast(Number(aoContrastInput?.value || aoContrast));
setBatchStatus("idle");
clearPbrStatus("textured");
setChannelView("rendered");
syncRagdollButton();
installWindowHarness();
void Promise.all([loadRoster(), loadEnvironmentRoster()]).then(() => selectCharacter(0)).catch((error) => {
  console.warn("Character controller test failed", error);
    setText(assetEl, "fallback");
    setText(modeEl, "load error");
  document.documentElement.dataset.characterControllerTest = "load-error";
});
animate();
