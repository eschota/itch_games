import * as THREE from "three";
import { GameCharacterController, loadFree3dCharacter, type Free3dCharacterAsset, type Free3dCharacterRoster } from "./character-controller";
import type { CelebrationKind, KickKind } from "@itch-games/unsoccer-shared";

declare global {
  interface Window {
    unsoccerCharacterControllerTest?: {
      controller: GameCharacterController | null;
      trigger: (action: KickKind, sprintJump?: boolean) => void;
      sprintJump: () => void;
      ragdoll: () => void;
      celebrate: (action: CelebrationKind) => void;
      selectCharacter: (indexOrGuid: number | string) => Promise<void>;
      nextCharacter: (direction?: number) => Promise<void>;
      state: () => unknown;
      roster: () => unknown;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#character-test-canvas");
if (!canvas) throw new Error("character test canvas is missing");

const rosterSrc = "assets/characters/free3d/roster.json";
const assetEl = document.querySelector<HTMLElement>("#asset");
const modeEl = document.querySelector<HTMLElement>("#mode");
const actionEl = document.querySelector<HTMLElement>("#action");
const speedEl = document.querySelector<HTMLElement>("#speed");
const strikeEl = document.querySelector<HTMLElement>("#strike");
const staminaEl = document.querySelector<HTMLElement>("#stamina");
const rosterPositionEl = document.querySelector<HTMLElement>("#roster-position");
const clipCountEl = document.querySelector<HTMLElement>("#clip-count");
const textureCountEl = document.querySelector<HTMLElement>("#texture-count");
const characterTitleEl = document.querySelector<HTMLElement>("#character-title");
const characterSelect = document.querySelector<HTMLSelectElement>("#character-select");

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
camera.position.set(0, 2.05, 4.85);
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
let lastActionAt = 0;
let celebration: CelebrationKind | null = null;
let celebrationAt = 0;
let celebrationAvailableUntil = 0;
let stamina = 100;
let verticalVelocity = 0;
let airborne = false;
let ragdoll = false;
let ragdollAt = 0;
let sprinting = false;
let sprintJumpUntil = 0;
let yaw = Math.PI;
let rosterAssets: Free3dCharacterAsset[] = [];
let currentCharacterIndex = 0;
let loadSequence = 0;

function setText(element: HTMLElement | null, value: string): void {
  if (element) element.textContent = value;
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

function trigger(action: KickKind, sprintJump = false): void {
  if (ragdoll) return;
  celebration = null;
  celebrationAt = 0;
  celebrationAvailableUntil = 0;
  lastAction = action;
  lastActionAt = Date.now();
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

function activateRagdoll(power = 6.2): void {
  if (ragdoll) return;
  ragdoll = true;
  ragdollAt = Date.now();
  stamina = 0;
  lastAction = "body";
  lastActionAt = ragdollAt;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (velocity.length() < 1.2) velocity.addScaledVector(forward, power);
  else velocity.addScaledVector(forward, power * 0.65);
  verticalVelocity = Math.max(verticalVelocity, 3.6);
  airborne = true;
}

function celebrate(action: CelebrationKind): void {
  if (ragdoll) return;
  celebration = action;
  celebrationAt = Date.now();
  celebrationAvailableUntil = celebrationAt + 6500;
  lastAction = null;
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

function installWindowHarness(): void {
  window.unsoccerCharacterControllerTest = {
      controller,
      trigger,
      sprintJump: () => trigger("jump", true),
      ragdoll: () => activateRagdoll(7.4),
      celebrate,
      selectCharacter,
    nextCharacter,
    state: () => ({
      velocity: velocity.toArray(),
      position: position.toArray(),
      airborne,
      ragdoll,
      ragdollAt,
      sprinting,
      stamina,
      lastAction,
      lastActionAt,
      celebration,
      celebrationAt,
      celebrationAvailableUntil,
      rosterCount: rosterAssets.length,
      characterIndex: currentCharacterIndex,
      characterGuid: rosterAssets[currentCharacterIndex]?.guid || null,
      debug: controller?.debugSnapshot()
    }),
    roster: () => rosterAssets.map((asset, index) => ({
      index,
      guid: asset.guid,
      title: asset.title,
      textures: countAssetTextures(asset),
      clips: countAssetClips(asset)
    }))
  };
}

async function selectCharacter(indexOrGuid: number | string): Promise<void> {
  if (rosterAssets.length === 0) return;
  const nextIndex = typeof indexOrGuid === "number"
    ? wrapIndex(indexOrGuid, rosterAssets.length)
    : rosterAssets.findIndex((entry) => entry.guid === indexOrGuid);
  if (nextIndex < 0) return;
  const asset = rosterAssets[nextIndex];
  const sequence = ++loadSequence;
  currentCharacterIndex = nextIndex;
  setText(assetEl, asset.guid);
  setText(modeEl, "loading");
  updateRosterUi(asset, false);
  const loaded = await loadFree3dCharacter(rosterSrc, asset.guid);
  if (sequence !== loadSequence) return;
  if (!loaded) {
    setText(modeEl, "load error");
    document.documentElement.dataset.characterControllerTest = "load-error";
    return;
  }
  if (controller) {
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
  document.documentElement.dataset.playerRig = "free3d-skinned-character-controller";
  document.documentElement.dataset.playerRigAsset = loaded.asset.guid;
  document.documentElement.dataset.playerRigMode = loaded.roster.mode;
  document.documentElement.dataset.characterClipCount = String(Object.keys(loaded.clips).length);
  document.documentElement.dataset.playerRigClipCount = String(Object.keys(loaded.clips).length);
  document.documentElement.dataset.playerRigTextures = String(loaded.textureCount);
  document.documentElement.dataset.playerRigTextureCount = String(loaded.textureCount);
}

async function nextCharacter(direction = 1): Promise<void> {
  await selectCharacter(currentCharacterIndex + direction);
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
    if (!airborne && Date.now() - ragdollAt > 1600 && stamina >= 22 && velocity.length() < 1.05) {
      ragdoll = false;
      ragdollAt = 0;
      lastAction = null;
      lastActionAt = 0;
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
      lastActionAt,
      celebration,
      celebrationAt,
      celebrationAvailableUntil
    }, now);
    controller.root.position.y += position.y;
    setText(actionEl, debug.action);
    setText(speedEl, debug.speed.toFixed(2));
    const strikeLabel = debug.strike === "hand" ? `${debug.strikeSide}-hand` : debug.strike;
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
  const focus = new THREE.Vector3(position.x, 1.15 + position.y * 0.25, position.z);
  const cameraTarget = new THREE.Vector3(position.x, 2.05, position.z + 4.85);
  camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 5.5));
  camera.lookAt(focus);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "ArrowUp") {
    event.preventDefault();
    if (!event.repeat) void nextCharacter(-1);
    return;
  }
  if (event.code === "ArrowRight" || event.code === "ArrowDown") {
    event.preventDefault();
    if (!event.repeat) void nextCharacter(1);
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
document.querySelector("#btn-foot")?.addEventListener("click", () => trigger("left"));
document.querySelector("#btn-hand")?.addEventListener("click", () => trigger("hand"));
document.querySelector("#btn-head")?.addEventListener("click", () => trigger("head"));
document.querySelector("#btn-jump")?.addEventListener("click", () => trigger("jump"));
document.querySelector("#btn-sprint-jump")?.addEventListener("click", () => trigger("jump", true));
document.querySelector("#btn-ragdoll")?.addEventListener("click", () => activateRagdoll(7.4));
document.querySelector("#btn-celebrate-1")?.addEventListener("click", () => celebrate("celebrate1"));
document.querySelector("#btn-celebrate-2")?.addEventListener("click", () => celebrate("celebrate2"));
document.querySelector("#btn-celebrate-3")?.addEventListener("click", () => celebrate("celebrate3"));
document.querySelector("#btn-prev-character")?.addEventListener("click", () => void nextCharacter(-1));
document.querySelector("#btn-next-character")?.addEventListener("click", () => void nextCharacter(1));
characterSelect?.addEventListener("change", () => void selectCharacter(characterSelect.value));

resize();
installWindowHarness();
void loadRoster().then(() => selectCharacter(0)).catch((error) => {
  console.warn("Character roster test failed", error);
    setText(assetEl, "fallback");
    setText(modeEl, "load error");
  document.documentElement.dataset.characterControllerTest = "load-error";
});
animate();
