import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { CELEBRATION_DURATION_MS, PLAYER_HEIGHT, type CelebrationKind, type KickKind, type StrikeSide } from "@itch-games/unsoccer-shared";
import { applyTexturelessPbrShader, bakeTexturelessPbr, type TexturelessPbrBakeResult } from "./textureless-pbr-converter";

export interface Free3dCharacterAsset {
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
    jumpRun?: string;
  };
  textureCount?: number;
}

export interface Free3dCharacterRoster {
  version: string;
  mode: string;
  assets: Free3dCharacterAsset[];
}

export interface LoadedFree3dCharacter {
  asset: Free3dCharacterAsset;
  roster: Free3dCharacterRoster;
  scene: THREE.Object3D;
  clips: Record<string, THREE.AnimationClip>;
  textureCount: number;
  texturelessPbr: TexturelessPbrBakeResult | null;
}

export interface CharacterControllerSnapshot {
  yaw?: number;
  velocity: { x: number; y?: number; z: number };
  airborne: boolean;
  exhausted: boolean;
  stamina?: number;
  sprinting?: boolean;
  ragdoll?: boolean;
  ragdollAt?: number;
  lastAction: KickKind | null;
  lastActionSide?: StrikeSide | null;
  lastActionAt: number;
  trailingFoot?: StrikeSide;
  celebration: CelebrationKind | null;
  celebrationAt: number;
  celebrationAvailableUntil: number;
}

export interface CharacterControllerDebugSnapshot {
  assetGuid: string;
  action: string;
  locomotion: string;
  speed: number;
  blend: number;
  strike: string;
  strikePulse: number;
  strikeSide: string;
  celebration: string;
  celebrationPulse: number;
  jumpStyle: string;
  ragdoll: boolean;
  ikMode: string;
  boneCount: number;
}

interface BoneRig {
  bones: Map<string, THREE.Bone>;
  bind: Map<THREE.Bone, THREE.Quaternion>;
}

interface StrikePose {
  pulse: number;
  chamber: number;
  impact: number;
  recover: number;
}

interface CelebrationPose {
  pulse: number;
  t: number;
  hop: number;
}

type HandStrikeSide = "left" | "right";
type FootStrikeSide = "left" | "right";
type JumpStyle = "standing" | "run";

const gltfLoader = new GLTFLoader();
const characterAnimationManager = new THREE.LoadingManager();
characterAnimationManager.setURLModifier((url) => {
  if (/\.(png|jpe?g|webp|bmp|tga|tiff?|dds|ktx2?|basis|hdr|exr)(\?.*)?$/i.test(url)) {
    throw new Error(`Blocked texture request from textureless character animation asset: ${url}`);
  }
  return url;
});
const fbxLoader = new FBXLoader(characterAnimationManager);
const characterCache = new Map<string, Promise<LoadedFree3dCharacter | null>>();

function resolveClientAsset(src: string, baseUrl = window.location.href): string {
  return new URL(src.replace(/^\/+/, ""), baseUrl).toString();
}

function easeOutCubic(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function ragdollMotion(snapshot: CharacterControllerSnapshot): { speed: number; forward: number; side: number } {
  const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
  if (speed < 0.08) {
    const side = Math.sin((snapshot.ragdollAt || 0) * 0.013) >= 0 ? 1 : -1;
    return { speed, forward: -0.72, side };
  }
  const velocityYaw = Math.atan2(snapshot.velocity.x, snapshot.velocity.z);
  const localYaw = normalizeAngle(velocityYaw - (snapshot.yaw ?? velocityYaw));
  return {
    speed,
    forward: THREE.MathUtils.clamp(Math.cos(localYaw), -1, 1),
    side: THREE.MathUtils.clamp(Math.sin(localYaw), -1, 1)
  };
}

function prepareCharacterScene(model: THREE.Object3D, asset: Free3dCharacterAsset): THREE.Object3D {
  const root = new THREE.Group();
  root.name = `free3d-character-${asset.guid}`;
  root.add(model);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  if (size.z > size.y * 1.35 && size.z > size.x) root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const orientedBox = new THREE.Box3().setFromObject(root);
  orientedBox.getSize(size);
  orientedBox.getCenter(center);
  const height = Math.max(size.y, 0.001);
  const scale = (asset.scale || 1) * PLAYER_HEIGHT / height;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -center.y * scale + size.y * scale / 2, -center.z * scale);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
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
  return root;
}

function sanitizeCharacterClip(name: string, source: THREE.AnimationClip): THREE.AnimationClip {
  const clip = source.clone();
  clip.name = name;
  clip.tracks = clip.tracks.filter((track) => {
    const trackName = track.name.toLowerCase();
    const targetName = trackName.replace(/\.(position|quaternion|scale)$/i, "");
    const compactTargetName = targetName.replace(/[^a-z0-9]/g, "");
    if (compactTargetName === "root" || compactTargetName === "rootx") return false;
    if (trackName.endsWith(".scale")) return false;
    if (/(^|[._-])(index|thumb|middle|ring|pinky|base)/.test(trackName)) return false;
    if (trackName.endsWith(".position")) return false;
    return true;
  });
  return clip;
}

function countMaterialTextures(root: THREE.Object3D, externalTextures: Array<THREE.Texture | undefined>): number {
  const textures = new Set<THREE.Texture>();
  for (const texture of externalTextures) {
    if (texture) textures.add(texture);
  }
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
        material.emissiveMap,
        material.alphaMap
      ]) {
        if (texture) textures.add(texture);
      }
    }
  });
  return textures.size;
}

function loadClip(name: string, src: string | undefined): Promise<[string, THREE.AnimationClip] | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    fbxLoader.load(
      resolveClientAsset(src),
      (group) => {
        const clip = group.animations[0] || null;
        if (!clip) {
          resolve(null);
          return;
        }
        resolve([name, sanitizeCharacterClip(name, clip)]);
      },
      undefined,
      reject
    );
  });
}

async function loadOptionalClip(name: string, src: string | undefined): Promise<[string, THREE.AnimationClip] | null> {
  try {
    return await loadClip(name, src);
  } catch (error) {
    console.warn(`Free3D character ${name} clip failed`, error);
    return null;
  }
}

export function loadFree3dCharacter(
  rosterSrc = "assets/characters/free3d/roster.json",
  preferredGuid?: string
): Promise<LoadedFree3dCharacter | null> {
  const cacheKey = `${rosterSrc}::${preferredGuid || "default"}`;
  const cached = characterCache.get(cacheKey);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await fetch(resolveClientAsset(rosterSrc), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Free3D character roster HTTP ${response.status}`);
      const roster = await response.json() as Free3dCharacterRoster;
      const asset = roster.assets.find((entry) => entry.guid === preferredGuid) || roster.assets[0];
      if (!asset) throw new Error("Free3D character roster is empty");
      const [gltf, ...clipEntries] = await Promise.all([
        new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((resolve, reject) => {
          gltfLoader.load(resolveClientAsset(asset.src), resolve, undefined, reject);
        }),
        loadOptionalClip("idle", asset.clips?.idle),
        loadOptionalClip("walk", asset.clips?.walk),
        loadOptionalClip("run", asset.clips?.run),
        loadOptionalClip("jump", asset.clips?.jump),
        loadOptionalClip("jumpRun", asset.clips?.jumpRun)
      ]);
      const clips = Object.fromEntries(
        clipEntries.filter((entry): entry is [string, THREE.AnimationClip] => Boolean(entry))
      );
      if (!clips.jumpRun && clips.jump) {
        clips.jumpRun = clips.jump.clone();
        clips.jumpRun.name = "jumpRun";
      }
      for (const clip of gltf.animations) {
        if (!clips.idle) clips.idle = clip;
      }
      const sourceTextureCount = countMaterialTextures(gltf.scene, []);
      if (sourceTextureCount > 0 || (asset.textureCount || 0) > 0) {
        throw new Error(`Free3D character ${asset.guid} is not runtime textureless`);
      }
      const preparedScene = prepareCharacterScene(gltf.scene, asset);
      const texturelessPbr = await bakeTexturelessPbr(preparedScene, {
        bakeGeometryAo: true,
        aoContrast: 1.2,
        aoSamples: 6,
        yieldEveryVertices: 4096
      });
      const textureCount = countMaterialTextures(preparedScene, []);
      return {
        asset,
        roster,
        scene: preparedScene,
        clips,
        textureCount,
        texturelessPbr: {
          ...texturelessPbr,
          strippedTextureCount: texturelessPbr.strippedTextureCount + sourceTextureCount + (asset.textureCount || 0)
        }
      };
    } catch (error) {
      console.warn("Free3D character hydration failed", error);
      return null;
    }
  })();
  characterCache.set(cacheKey, promise);
  return promise;
}

function cloneMaterialForTeam(material: THREE.Material | THREE.Material[], loaded: LoadedFree3dCharacter, tint: THREE.Color): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((entry) => cloneMaterialForTeam(entry, loaded, tint) as THREE.Material);
  const clone = material.clone();
  if (clone instanceof THREE.MeshStandardMaterial) {
    clone.map = null;
    clone.normalMap = null;
    clone.roughnessMap = null;
    clone.metalnessMap = null;
    clone.aoMap = null;
    clone.emissiveMap = null;
    clone.alphaMap = null;
    clone.bumpMap = null;
    clone.displacementMap = null;
    clone.lightMap = null;
    clone.envMap = null;
    clone.vertexColors = true;
    clone.color.lerp(tint, 0.68);
    clone.roughness = Math.max(clone.roughness, 0.56);
    clone.metalness *= 0.2;
    applyTexturelessPbrShader(clone);
    clone.needsUpdate = true;
  }
  return clone;
}

function findBone(root: THREE.Object3D, patterns: RegExp[]): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Bone)) return;
    const name = child.name.toLowerCase();
    if (patterns.some((pattern) => pattern.test(name))) found = child;
  });
  return found;
}

function collectBoneRig(root: THREE.Object3D): BoneRig {
  const keys: Array<[string, RegExp[]]> = [
    ["spine1", [/spine[_-]?01/, /spine1/, /hips/, /pelvis/]],
    ["spine2", [/spine[_-]?02/, /spine2/, /chest/]],
    ["spine3", [/spine[_-]?03/, /spine3/, /upper.*chest/]],
    ["neck", [/neck/]],
    ["head", [/head/]],
    ["leftShoulder", [/^shoulder[_-]?l$/, /shoulder.*(\.l|_l|left)/, /left.*shoulder/]],
    ["rightShoulder", [/^shoulder[_-]?r$/, /shoulder.*(\.r|_r|right)/, /right.*shoulder/]],
    ["leftArm", [/^arm[_-]?stretch[_-]?l$/, /^arm[_-]?twist[_-]?l$/, /upper.*arm.*(left|_l|\.l)/, /left.*upper.*arm/]],
    ["rightArm", [/^arm[_-]?stretch[_-]?r$/, /^arm[_-]?twist[_-]?r$/, /upper.*arm.*(right|_r|\.r)/, /right.*upper.*arm/]],
    ["leftForearm", [/^forearm[_-]?stretch[_-]?l$/, /^forearm[_-]?twist[_-]?l$/, /fore.*arm.*(left|_l|\.l)/, /left.*fore.*arm/]],
    ["rightForearm", [/^forearm[_-]?stretch[_-]?r$/, /^forearm[_-]?twist[_-]?r$/, /fore.*arm.*(right|_r|\.r)/, /right.*fore.*arm/]],
    ["leftHand", [/^hand[_-]?l$/, /hand.*(\.l|_l|left)/, /left.*hand/]],
    ["rightHand", [/^hand[_-]?r$/, /hand.*(\.r|_r|right)/, /right.*hand/]],
    ["leftThigh", [/^thigh[_-]?stretch[_-]?l$/, /^thigh[_-]?twist[_-]?l$/, /upper.*leg.*(left|_l|\.l)/, /left.*thigh/]],
    ["rightThigh", [/^thigh[_-]?stretch[_-]?r$/, /^thigh[_-]?twist[_-]?r$/, /upper.*leg.*(right|_r|\.r)/, /right.*thigh/]],
    ["leftLeg", [/^leg[_-]?stretch[_-]?l$/, /^leg[_-]?twist[_-]?l$/, /lower.*leg.*(left|_l|\.l)/, /shin.*(left|_l|\.l)/]],
    ["rightLeg", [/^leg[_-]?stretch[_-]?r$/, /^leg[_-]?twist[_-]?r$/, /lower.*leg.*(right|_r|\.r)/, /shin.*(right|_r|\.r)/]],
    ["leftFoot", [/^foot[_-]?l$/, /foot.*(\.l|_l|left)/, /left.*foot/]],
    ["rightFoot", [/^foot[_-]?r$/, /foot.*(\.r|_r|right)/, /right.*foot/]]
  ];
  const bones = new Map<string, THREE.Bone>();
  for (const [key, patterns] of keys) {
    const bone = findBone(root, patterns);
    if (bone) bones.set(key, bone);
  }
  const bind = new Map<THREE.Bone, THREE.Quaternion>();
  root.traverse((child) => {
    if (child instanceof THREE.Bone) bind.set(child, child.quaternion.clone());
  });
  return { bones, bind };
}

export class GameCharacterController {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly boneRig: BoneRig;
  private activeAction = "";
  private locomotionAction = "idle";
  private smoothedSpeed = 0;
  private lastUpdateTime = 0;
  private lastStrike: KickKind | null = null;
  private lastStrikePulse = 0;
  private lastCelebration: CelebrationKind | null = null;
  private lastCelebrationPulse = 0;
  private lastObservedActionAt = 0;
  private activeHandStrikeSide: HandStrikeSide = "right";
  private nextHandStrikeSide: HandStrikeSide = "right";
  private activeFootStrikeSide: FootStrikeSide = "left";
  private activeJumpStyle: JumpStyle = "standing";
  private ragdollActive = false;
  private lastActionSwitchAt = 0;

  constructor(readonly loaded: LoadedFree3dCharacter, teamColor = 0xffffff) {
    const model = SkeletonUtils.clone(loaded.scene) as THREE.Object3D;
    const tint = new THREE.Color(teamColor);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      child.material = cloneMaterialForTeam(child.material, loaded, tint);
    });
    this.root.name = "unsoccer-character-controller";
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of Object.entries(loaded.clips)) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      const jumpAction = name === "jump" || name === "jumpRun";
      action.setLoop(jumpAction ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = jumpAction;
      this.actions.set(name, action);
    }
    this.boneRig = collectBoneRig(model);
    this.setAction("idle", true);
  }

  update(snapshot: CharacterControllerSnapshot, time: number): CharacterControllerDebugSnapshot {
    const deltaTime = this.lastUpdateTime > 0 ? Math.min(0.05, Math.max(0, time - this.lastUpdateTime)) : 1 / 60;
    this.lastUpdateTime = time;
    const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    const smoothAlpha = 1 - Math.exp(-deltaTime * 5.8);
    this.smoothedSpeed = THREE.MathUtils.lerp(this.smoothedSpeed, speed, smoothAlpha);
    const actionAge = Math.max(0, Date.now() - snapshot.lastActionAt);
    const celebrationAge = Math.max(0, Date.now() - snapshot.celebrationAt);
    const celebrationPose = this.celebrationPose(snapshot.celebration, celebrationAge);
    const celebrating = celebrationPose.pulse > 0;
    const ragdoll = Boolean(snapshot.ragdoll);
    this.ragdollActive = ragdoll;
    const jumpTakeoffWindow = snapshot.lastAction === "jump" && actionAge < 160;
    const nextLocomotion = this.resolveLocomotion(snapshot, this.smoothedSpeed);
    const jumpAction = this.resolveJumpAction(snapshot, this.smoothedSpeed, jumpTakeoffWindow);
    const actionName = ragdoll || celebrating ? "idle" : jumpAction || nextLocomotion;
    this.setAction(actionName);
    this.syncActionSpeed(actionName, this.smoothedSpeed);
    this.resetBonesToBindPose();
    this.mixer.update(deltaTime);
    this.syncStrikeSide(snapshot);
    const strikePose = ragdoll || celebrating ? { pulse: 0, chamber: 0, impact: 0, recover: 0 } : this.strikePose(snapshot.lastAction, actionAge, this.activeJumpStyle);
    if (ragdoll) this.applyRagdollIk(snapshot, time);
    else this.applyProceduralIk(snapshot, strikePose, celebrationPose);
    const bob = ragdoll ? 0 : snapshot.airborne ? 0.12 : Math.abs(Math.sin(time * (7.2 + Math.min(speed, 7) * 0.22))) * Math.min(0.1, speed * 0.011);
    const breath = ragdoll ? 0 : snapshot.exhausted ? Math.sin(time * 9) * 0.012 : Math.sin(time * 2.4) * 0.006;
    if (ragdoll) {
      const ragdollAge = Math.max(0, Date.now() - (snapshot.ragdollAt || 0));
      const fall = easeOutCubic(THREE.MathUtils.clamp(ragdollAge / 520, 0, 1));
      const settle = easeOutCubic(THREE.MathUtils.clamp((ragdollAge - 520) / 920, 0, 1));
      const motion = ragdollMotion(snapshot);
      const side = Math.abs(motion.side) > 0.12 ? motion.side : Math.sign(motion.side || 1);
      const forwardFall = Math.max(0, motion.forward);
      const backwardFall = Math.max(0, -motion.forward);
      const pitch = motion.forward >= -0.18
        ? -1.62 - forwardFall * 0.22
        : 1.38 + backwardFall * 0.18;
      const sideFall = 1 - Math.min(1, Math.abs(motion.forward));
      this.root.position.y = 0.055 + (1 - fall) * 0.26 + Math.sin(time * 16) * 0.014 * (1 - settle);
      this.root.rotation.set(
        pitch * fall,
        motion.side * 0.18 * fall * (1 - settle * 0.7),
        side * (0.48 + sideFall * 0.5) * fall
      );
      this.root.scale.set(1 + 0.026 * (1 - settle), 1 - 0.11 * fall, 1 + 0.08 * fall);
    } else {
      this.root.position.y = bob + breath + celebrationPose.hop;
      this.root.rotation.set(0, 0, 0);
      this.root.scale.setScalar(1 + strikePose.pulse * 0.024 + celebrationPose.pulse * 0.018);
    }
    this.lastStrike = strikePose.pulse > 0 ? snapshot.lastAction : null;
    this.lastStrikePulse = strikePose.pulse;
    this.lastCelebration = celebrating ? snapshot.celebration : null;
    this.lastCelebrationPulse = celebrationPose.pulse;
    return this.debugSnapshot();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }

  debugSnapshot(): CharacterControllerDebugSnapshot {
    return {
      assetGuid: this.loaded.asset.guid,
      action: this.ragdollActive ? "ragdoll" : this.activeAction,
      locomotion: this.locomotionAction,
      speed: Math.round(this.smoothedSpeed * 100) / 100,
      blend: Math.round(this.currentActionWeight() * 100) / 100,
      strike: this.lastStrike || "none",
      strikePulse: Math.round(this.lastStrikePulse * 100) / 100,
      strikeSide: this.lastStrike === "hand" ? this.activeHandStrikeSide : this.lastStrike === "left" ? this.activeFootStrikeSide : this.lastStrike || "none",
      celebration: this.lastCelebration || "none",
      celebrationPulse: Math.round(this.lastCelebrationPulse * 100) / 100,
      jumpStyle: this.activeJumpStyle,
      ragdoll: this.ragdollActive,
      ikMode: this.ragdollActive ? "ragdoll-limp-ik-overlay" : "procedural-bone-ik-overlay",
      boneCount: this.boneRig.bind.size
    };
  }

  private syncStrikeSide(snapshot: CharacterControllerSnapshot): void {
    if (!snapshot.lastActionAt || snapshot.lastActionAt === this.lastObservedActionAt) return;
    this.lastObservedActionAt = snapshot.lastActionAt;
    if (snapshot.lastAction === "hand") {
      this.activeHandStrikeSide = snapshot.lastActionSide || this.nextHandStrikeSide;
      this.nextHandStrikeSide = this.activeHandStrikeSide === "right" ? "left" : "right";
    } else if (snapshot.lastAction === "left") {
      this.activeFootStrikeSide = snapshot.lastActionSide || snapshot.trailingFoot || "left";
    }
  }

  private resolveLocomotion(snapshot: CharacterControllerSnapshot, speed: number): string {
    let next = this.locomotionAction;
    if (snapshot.exhausted) {
      if (speed > 0.4) next = "walk";
      else next = "idle";
    } else if (next === "run") {
      if (speed < 3.85) next = speed > 0.25 ? "walk" : "idle";
    } else if (next === "walk") {
      if (speed > 5.25) next = "run";
      else if (speed < 0.22) next = "idle";
    } else {
      if (speed > 5.25) next = "run";
      else if (speed > 0.42) next = "walk";
      else next = "idle";
    }
    if (!this.actions.has(next)) next = this.actions.has("walk") && speed > 0.35 ? "walk" : "idle";
    this.locomotionAction = next;
    return next;
  }

  private resolveJumpAction(snapshot: CharacterControllerSnapshot, speed: number, jumpTakeoffWindow: boolean): string | null {
    const jumping = snapshot.airborne || jumpTakeoffWindow;
    if (!jumping) {
      this.activeJumpStyle = "standing";
      return null;
    }
    const wantsRunJump = Boolean(snapshot.sprinting) || speed > 4.35;
    if (jumpTakeoffWindow || this.activeJumpStyle !== "run") {
      this.activeJumpStyle = wantsRunJump ? "run" : "standing";
    }
    const actionName = this.activeJumpStyle === "run" && this.actions.has("jumpRun") ? "jumpRun" : "jump";
    return this.actions.has(actionName) ? actionName : null;
  }

  private setAction(name: string, immediate = false): void {
    const nextName = this.actions.has(name) ? name : "idle";
    if (this.activeAction === nextName) return;
    const previous = this.actions.get(this.activeAction);
    const next = this.actions.get(nextName);
    if (!next) return;
    const now = Date.now();
    const nextIsLocomotion = nextName === "idle" || nextName === "walk" || nextName === "run";
    const currentIsLocomotion = this.activeAction === "idle" || this.activeAction === "walk" || this.activeAction === "run";
    if (!immediate && nextIsLocomotion && currentIsLocomotion && now - this.lastActionSwitchAt < 160) return;
    const fade = immediate ? 0 : nextName.startsWith("jump") ? 0.06 : 0.16;
    if (previous) previous.fadeOut(fade);
    if (immediate || nextName.startsWith("jump") || !nextIsLocomotion) next.reset();
    next.enabled = true;
    next.fadeIn(fade);
    next.play();
    this.activeAction = nextName;
    this.lastActionSwitchAt = now;
  }

  private syncActionSpeed(actionName: string, speed: number): void {
    const action = this.actions.get(actionName);
    if (!action) return;
    if (actionName === "run") action.timeScale = THREE.MathUtils.clamp(speed / 5.8, 0.85, 1.44);
    else if (actionName === "walk") action.timeScale = THREE.MathUtils.clamp(speed / 2.2, 0.62, 1.22);
    else if (actionName === "jumpRun") action.timeScale = THREE.MathUtils.clamp(1.16 + speed / 13, 1.18, 1.48);
    else if (actionName === "jump") action.timeScale = 1.06;
    else action.timeScale = THREE.MathUtils.lerp(action.timeScale || 0.72, 0.72, 0.18);
  }

  private currentActionWeight(): number {
    const action = this.actions.get(this.activeAction);
    return action?.getEffectiveWeight() ?? 0;
  }

  private resetBonesToBindPose(): void {
    for (const [bone, bindQuaternion] of this.boneRig.bind) {
      bone.quaternion.copy(bindQuaternion);
    }
  }

  private strikePose(action: KickKind | null, ageMs: number, jumpStyle: JumpStyle = "standing"): StrikePose {
    const empty = { pulse: 0, chamber: 0, impact: 0, recover: 0 };
    if (!action) return empty;
    const duration = action === "hand"
      ? 560
      : action === "left"
        ? 620
        : action === "head"
          ? 620
          : action === "jump"
            ? (jumpStyle === "run" ? 620 : 420)
            : action === "body"
              ? 300
              : 760;
    if (ageMs >= duration) return empty;
    const t = THREE.MathUtils.clamp(ageMs / duration, 0, 1);
    if (action === "body") {
      const pulse = Math.sin((1 - t) * Math.PI);
      return { pulse, chamber: 0, impact: pulse, recover: 1 - t };
    }
    const chamberEnd = action === "hand" ? 0.24 : action === "left" ? 0.22 : action === "head" ? 0.3 : 0.28;
    const impactStart = action === "hand" ? 0.16 : action === "left" ? 0.14 : action === "head" ? 0.22 : 0.2;
    const impactEnd = action === "hand" ? 0.46 : action === "left" ? 0.44 : action === "head" ? 0.54 : 0.56;
    const holdEnd = action === "hand" ? 0.58 : action === "left" ? 0.55 : action === "head" ? 0.62 : 0.66;
    const chamber = t < chamberEnd
      ? easeOutCubic(t / chamberEnd)
      : Math.max(0, 1 - (t - chamberEnd) / Math.max(0.001, impactEnd - chamberEnd));
    const impact = t < impactStart
      ? 0
      : t < impactEnd
        ? easeOutCubic((t - impactStart) / Math.max(0.001, impactEnd - impactStart))
        : t < holdEnd
          ? 1
          : Math.max(0, 1 - (t - holdEnd) / Math.max(0.001, 1 - holdEnd));
    const recover = t < holdEnd ? 0 : easeOutCubic((t - holdEnd) / Math.max(0.001, 1 - holdEnd));
    return {
      pulse: Math.max(chamber * 0.55, impact),
      chamber,
      impact,
      recover
    };
  }

  private celebrationPose(action: CelebrationKind | null, ageMs: number): CelebrationPose {
    if (!action || ageMs >= CELEBRATION_DURATION_MS) return { pulse: 0, t: 0, hop: 0 };
    const t = THREE.MathUtils.clamp(ageMs / CELEBRATION_DURATION_MS, 0, 1);
    const fadeIn = easeOutCubic(Math.min(1, t / 0.14));
    const fadeOut = 1 - easeOutCubic(Math.max(0, (t - 0.78) / 0.22));
    const pulse = Math.max(0, fadeIn * fadeOut);
    const hop = action === "celebrate2"
      ? Math.max(0, Math.sin(t * Math.PI * 6)) * 0.055 * pulse
      : action === "celebrate1"
        ? Math.max(0, Math.sin(t * Math.PI * 4)) * 0.032 * pulse
        : 0;
    return { pulse, t, hop };
  }

  private rotateBone(key: string, x: number, y: number, z: number, amount: number): void {
    const bone = this.boneRig.bones.get(key);
    if (!bone) return;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * amount, y * amount, z * amount, "XYZ"));
    bone.quaternion.multiply(rotation);
  }

  private applyRagdollIk(snapshot: CharacterControllerSnapshot, time: number): void {
    const ragdollAge = Math.max(0, Date.now() - (snapshot.ragdollAt || 0));
    const fall = easeOutCubic(THREE.MathUtils.clamp(ragdollAge / 560, 0, 1));
    const settle = easeOutCubic(THREE.MathUtils.clamp((ragdollAge - 560) / 920, 0, 1));
    const motion = ragdollMotion(snapshot);
    const speed = motion.speed;
    const flutter = Math.sin(time * 18 + (snapshot.ragdollAt || 0) * 0.001) * (1 - settle) * THREE.MathUtils.clamp(speed / 8, 0.08, 0.72);
    const side = Math.abs(motion.side) > 0.12 ? motion.side : Math.sin((snapshot.ragdollAt || 0) * 0.013) >= 0 ? 1 : -1;
    const forward = THREE.MathUtils.clamp(motion.forward, -0.7, 1);
    const faceDown = forward >= -0.18 ? 1 : 0;
    const backward = 1 - faceDown;

    this.rotateBone("spine1", (0.26 + 0.24 * forward) * faceDown - 0.2 * backward, 0.1 * side, 0.2 * side, fall);
    this.rotateBone("spine2", (0.5 + 0.24 * forward) * faceDown - 0.32 * backward, 0.14 * side, 0.24 * side, fall);
    this.rotateBone("neck", 0.38 * faceDown - 0.24 * backward, -0.1 * side, 0.12 * side, fall);
    this.rotateBone("head", 0.58 * faceDown - 0.36 * backward, -0.14 * side, 0.18 * side, fall);
    this.rotateBone("leftShoulder", -0.12 + flutter * 0.06, 0.08 * side, -1.08, fall);
    this.rotateBone("rightShoulder", -0.1 - flutter * 0.06, -0.08 * side, 1.0, fall);
    this.rotateBone("leftArm", -0.46 + flutter * 0.12, 0.1 * side, -0.86, fall);
    this.rotateBone("rightArm", -0.38 - flutter * 0.1, -0.1 * side, 0.8, fall);
    this.rotateBone("leftForearm", -0.24 + 0.06 * backward, 0, -0.46 + flutter * 0.1, fall);
    this.rotateBone("rightForearm", -0.18 + 0.08 * backward, 0, 0.48 - flutter * 0.09, fall);
    this.rotateBone("leftHand", -0.22, 0, -0.18, fall);
    this.rotateBone("rightHand", -0.2, 0, 0.18, fall);
    this.rotateBone("leftThigh", 0.28 * faceDown - 0.24 * backward, 0.06 * side, -0.24, fall);
    this.rotateBone("rightThigh", -0.16 * faceDown + 0.36 * backward, -0.05 * side, 0.28, fall);
    this.rotateBone("leftLeg", -0.34 + 0.16 * backward, 0, 0.1, fall);
    this.rotateBone("rightLeg", 0.22 - 0.18 * backward, 0, -0.08, fall);
    this.rotateBone("leftFoot", 0.12, 0, -0.1, fall);
    this.rotateBone("rightFoot", -0.1, 0, 0.08, fall);
  }

  private applyProceduralIk(snapshot: CharacterControllerSnapshot, pose: StrikePose, celebration: CelebrationPose): void {
    const moveLean = THREE.MathUtils.clamp(this.smoothedSpeed / 9, 0, 1) * (snapshot.exhausted ? 0.35 : 0.2);
    this.rotateBone("spine1", -0.08 * moveLean, 0, 0, 1);
    this.rotateBone("spine2", -0.06 * moveLean, 0, 0, 1);
    if (celebration.pulse > 0 && snapshot.celebration) {
      this.applyCelebrationIk(snapshot.celebration, celebration);
      return;
    }
    const pulse = pose.pulse;
    const chamber = pose.chamber;
    const impact = pose.impact;
    if (pulse <= 0 || !snapshot.lastAction) return;
    if (snapshot.lastAction === "left") {
      const isRight = this.activeFootStrikeSide === "right";
      const side = isRight ? 1 : -1;
      const strikeThigh = isRight ? "rightThigh" : "leftThigh";
      const strikeLeg = isRight ? "rightLeg" : "leftLeg";
      const strikeFoot = isRight ? "rightFoot" : "leftFoot";
      const plantThigh = isRight ? "leftThigh" : "rightThigh";
      this.rotateBone(strikeThigh, 0.16, -0.08, 0.46 * side, chamber);
      this.rotateBone(strikeLeg, -0.5, 0, -0.16 * side, chamber);
      this.rotateBone(strikeFoot, 0.08, 0, 0.06 * side, chamber);
      this.rotateBone(strikeThigh, 0.2, -0.24, 1.64 * side, impact);
      this.rotateBone(strikeLeg, 0.48, 0, -0.52 * side, impact);
      this.rotateBone(strikeFoot, -0.26, 0, -0.2 * side, impact);
      this.rotateBone(plantThigh, -0.14, 0, 0.04 * side, pulse);
      this.rotateBone("spine1", -0.16, 0.04 * side, -0.02 * side, pulse);
      this.rotateBone("spine2", -0.22, 0.06 * side, -0.02 * side, impact);
      this.rotateBone(isRight ? "leftArm" : "rightArm", -0.5, 0, -0.18 * side, pulse);
      this.rotateBone(isRight ? "rightArm" : "leftArm", 0.18, 0, 0.12 * side, chamber);
    } else if (snapshot.lastAction === "hand") {
      const isRight = this.activeHandStrikeSide === "right";
      // The imported Free3D roster reads left/right arm bones mirrored in gameplay view.
      const rigUsesRightSide = !isRight;
      const strikeShoulder = rigUsesRightSide ? "rightShoulder" : "leftShoulder";
      const strikeArm = rigUsesRightSide ? "rightArm" : "leftArm";
      const strikeForearm = rigUsesRightSide ? "rightForearm" : "leftForearm";
      const strikeHand = rigUsesRightSide ? "rightHand" : "leftHand";
      const counterShoulder = rigUsesRightSide ? "leftShoulder" : "rightShoulder";
      const counterArm = rigUsesRightSide ? "leftArm" : "rightArm";
      const counterForearm = rigUsesRightSide ? "leftForearm" : "rightForearm";
      const side = isRight ? 1 : -1;
      this.rotateBone(strikeShoulder, -0.22, 0.16 * side, -0.46 * side, chamber);
      this.rotateBone(strikeArm, -0.34, 0.08 * side, -0.42 * side, chamber);
      this.rotateBone(strikeForearm, 0.62, 0, -0.2 * side, chamber);
      this.rotateBone(strikeHand, -0.04, 0, -0.08 * side, chamber);
      this.rotateBone(strikeShoulder, -0.92, -0.18 * side, 0.16 * side, impact);
      this.rotateBone(strikeArm, -1.18, -0.14 * side, 0.08 * side, impact);
      this.rotateBone(strikeForearm, 0.34, 0, 0.02 * side, impact);
      this.rotateBone(strikeHand, -0.12, 0, 0.02 * side, impact);
      this.rotateBone("spine1", -0.06, -0.22 * side, -0.04 * side, pulse);
      this.rotateBone("spine2", -0.1, -0.34 * side, -0.05 * side, impact);
      this.rotateBone(counterShoulder, -0.22, 0, 0.2 * side, pulse);
      this.rotateBone(counterArm, -0.62, 0.04 * side, 0.18 * side, pulse);
      this.rotateBone(counterForearm, -0.46, 0, 0.12 * side, pulse);
    } else if (snapshot.lastAction === "head") {
      this.rotateBone("spine1", -0.24, 0, 0, chamber);
      this.rotateBone("spine2", -0.38, 0, 0, chamber);
      this.rotateBone("neck", -0.56, 0, 0, chamber);
      this.rotateBone("head", -0.68, 0, 0, chamber);
      this.rotateBone("spine1", 0.36, 0, 0, impact);
      this.rotateBone("spine2", 0.62, 0, 0, impact);
      this.rotateBone("neck", 1.08, 0, 0, impact);
      this.rotateBone("head", 1.34, 0, 0, impact);
      this.rotateBone("leftShoulder", 0.02, 0, -0.12, pulse);
      this.rotateBone("rightShoulder", 0.02, 0, 0.12, pulse);
      this.rotateBone("leftArm", -0.18, 0, -0.38, pulse);
      this.rotateBone("rightArm", -0.18, 0, 0.38, pulse);
      this.rotateBone("leftForearm", -0.22, 0, -0.22, pulse);
      this.rotateBone("rightForearm", -0.22, 0, 0.22, pulse);
    } else if (snapshot.lastAction === "jump") {
      if (this.activeJumpStyle === "run") {
        const drive = THREE.MathUtils.clamp(0.58 + this.smoothedSpeed / 8.5, 0.72, 1.18);
        this.rotateBone("spine1", -0.24, 0, 0, pulse);
        this.rotateBone("spine2", -0.22, 0, 0, pulse);
        this.rotateBone("leftThigh", 0.84, 0, -0.16, pulse * drive);
        this.rotateBone("leftLeg", -0.52, 0, 0.04, pulse * drive);
        this.rotateBone("leftFoot", 0.16, 0, -0.1, pulse * drive);
        this.rotateBone("rightThigh", -0.34, 0, 0.08, pulse * drive);
        this.rotateBone("rightLeg", 0.2, 0, 0, pulse * drive);
        this.rotateBone("rightFoot", -0.12, 0, 0.06, pulse * drive);
        this.rotateBone("leftArm", -0.92, 0, 0.34, pulse * drive);
        this.rotateBone("leftForearm", -0.2, 0, 0.16, pulse * drive);
        this.rotateBone("rightArm", 0.24, 0, -0.42, pulse * drive);
        this.rotateBone("rightForearm", -0.08, 0, -0.2, pulse * drive);
      } else {
        this.rotateBone("leftThigh", 0.54, 0, -0.08, pulse);
        this.rotateBone("rightThigh", 0.54, 0, 0.08, pulse);
        this.rotateBone("leftLeg", -0.36, 0, 0, pulse);
        this.rotateBone("rightLeg", -0.36, 0, 0, pulse);
        this.rotateBone("leftArm", -0.42, 0, 0.18, pulse);
        this.rotateBone("rightArm", -0.42, 0, -0.18, pulse);
      }
    } else if (snapshot.lastAction === "body") {
      this.rotateBone("spine1", -0.2, 0, 0, pulse);
      this.rotateBone("spine2", -0.18, 0, 0, pulse);
      this.rotateBone("neck", -0.12, 0, 0, pulse);
    }
  }

  private applyCelebrationIk(kind: CelebrationKind, pose: CelebrationPose): void {
    const pulse = pose.pulse;
    const wave = Math.sin(pose.t * Math.PI * 8);
    const sway = Math.sin(pose.t * Math.PI * 4);
    const bounce = Math.max(0, Math.sin(pose.t * Math.PI * 6));
    if (kind === "celebrate1") {
      this.rotateBone("spine1", -0.08, 0, 0.05 * sway, pulse);
      this.rotateBone("spine2", -0.1, 0, 0.07 * sway, pulse);
      this.rotateBone("neck", -0.08, 0, -0.04 * sway, pulse);
      this.rotateBone("head", -0.05, 0, -0.05 * sway, pulse);
      this.rotateBone("leftShoulder", -0.25, 0, -0.7, pulse);
      this.rotateBone("rightShoulder", -0.25, 0, 0.7, pulse);
      this.rotateBone("leftArm", -1.05 + wave * 0.1, 0, -0.92, pulse);
      this.rotateBone("rightArm", -1.05 - wave * 0.1, 0, 0.92, pulse);
      this.rotateBone("leftForearm", -0.18, 0, -0.36 - wave * 0.18, pulse);
      this.rotateBone("rightForearm", -0.18, 0, 0.36 - wave * 0.18, pulse);
      this.rotateBone("leftHand", -0.05, 0, -0.18, pulse);
      this.rotateBone("rightHand", -0.05, 0, 0.18, pulse);
      return;
    }

    if (kind === "celebrate2") {
      this.rotateBone("spine1", -0.05 + bounce * 0.08, 0.1 * sway, 0, pulse);
      this.rotateBone("spine2", -0.1 + bounce * 0.08, 0.18 * sway, 0, pulse);
      this.rotateBone("neck", -0.03, -0.08 * sway, 0, pulse);
      this.rotateBone("head", -0.03, -0.1 * sway, 0, pulse);
      this.rotateBone("leftArm", -0.46 - bounce * 0.42, 0, -0.48 - 0.18 * sway, pulse);
      this.rotateBone("rightArm", -0.46 - bounce * 0.42, 0, 0.48 - 0.18 * sway, pulse);
      this.rotateBone("leftForearm", -0.2, 0, -0.34, pulse);
      this.rotateBone("rightForearm", -0.2, 0, 0.34, pulse);
      this.rotateBone("leftThigh", 0.16 + bounce * 0.14, 0, -0.08, pulse);
      this.rotateBone("rightThigh", 0.16 + bounce * 0.14, 0, 0.08, pulse);
      this.rotateBone("leftLeg", -0.18 - bounce * 0.12, 0, 0, pulse);
      this.rotateBone("rightLeg", -0.18 - bounce * 0.12, 0, 0, pulse);
      return;
    }

    const pump = Math.max(0, Math.sin(pose.t * Math.PI * 5));
    const bow = Math.sin(Math.min(1, pose.t / 0.38) * Math.PI) * pulse;
    this.rotateBone("spine1", -0.28, 0, -0.04, bow);
    this.rotateBone("spine2", -0.34, 0, -0.05, bow);
    this.rotateBone("neck", -0.18, 0, 0.04, bow);
    this.rotateBone("head", -0.18, 0, 0.06, bow);
    this.rotateBone("rightShoulder", -0.12, 0, 0.42, pulse);
    this.rotateBone("rightArm", -0.62 - pump * 0.36, 0, 0.58, pulse);
    this.rotateBone("rightForearm", -0.78 + pump * 0.5, 0, 0.24, pulse);
    this.rotateBone("rightHand", -0.08, 0, 0.08, pulse);
    this.rotateBone("leftArm", -0.2, 0, -0.22, pulse);
    this.rotateBone("leftForearm", -0.28, 0, -0.16, pulse);
  }
}
