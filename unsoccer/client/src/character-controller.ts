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
  positionBind: Map<THREE.Bone, THREE.Vector3>;
}

type RagdollPointKey =
  | "pelvis"
  | "chest"
  | "head"
  | "leftElbow"
  | "leftHand"
  | "rightElbow"
  | "rightHand"
  | "leftKnee"
  | "leftFoot"
  | "rightKnee"
  | "rightFoot";

interface RagdollParticle {
  position: THREE.Vector3;
  previous: THREE.Vector3;
  inverseMass: number;
  floor: number;
}

interface RagdollLink {
  a: RagdollPointKey;
  b: RagdollPointKey;
  length: number;
  stiffness: number;
}

interface RagdollPoseState {
  fall: number;
  settle: number;
  motion: { speed: number; forward: number; side: number };
  side: number;
  limpEnergy: number;
  kinetic: number;
  flutter: number;
  torsoPitch: number;
  torsoRoll: number;
  torsoYaw: number;
}

interface RagdollBoneSegment {
  driveBoneKey: string;
  fromBoneKey: string;
  toBoneKey: string;
  fromPoint: RagdollPointKey;
  toPoint: RagdollPointKey;
  amount: number;
}

interface ArmRigKeys {
  shoulder: string;
  arm: string;
  forearm: string;
  hand: string;
  counterShoulder: string;
  counterArm: string;
  counterForearm: string;
  outwardZSign: number;
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

const RAGDOLL_BASE_POINTS: Record<RagdollPointKey, [number, number, number]> = {
  pelvis: [0, 0.78, 0],
  chest: [0, 1.2, 0.04],
  head: [0, 1.62, 0.06],
  leftElbow: [-0.52, 1.02, 0.08],
  leftHand: [-0.68, 0.68, 0.14],
  rightElbow: [0.52, 1.02, 0.08],
  rightHand: [0.68, 0.68, 0.14],
  leftKnee: [-0.18, 0.42, -0.04],
  leftFoot: [-0.24, 0.08, 0.18],
  rightKnee: [0.18, 0.42, -0.04],
  rightFoot: [0.24, 0.08, 0.18]
};

const RAGDOLL_PARTICLE_ORDER = Object.keys(RAGDOLL_BASE_POINTS) as RagdollPointKey[];

const RAGDOLL_LINKS: RagdollLink[] = [
  { a: "pelvis", b: "chest", length: 0.44, stiffness: 0.86 },
  { a: "chest", b: "head", length: 0.42, stiffness: 0.78 },
  { a: "chest", b: "leftElbow", length: 0.56, stiffness: 0.72 },
  { a: "leftElbow", b: "leftHand", length: 0.38, stiffness: 0.78 },
  { a: "chest", b: "rightElbow", length: 0.56, stiffness: 0.72 },
  { a: "rightElbow", b: "rightHand", length: 0.38, stiffness: 0.78 },
  { a: "pelvis", b: "leftKnee", length: 0.42, stiffness: 0.78 },
  { a: "leftKnee", b: "leftFoot", length: 0.42, stiffness: 0.82 },
  { a: "pelvis", b: "rightKnee", length: 0.42, stiffness: 0.78 },
  { a: "rightKnee", b: "rightFoot", length: 0.42, stiffness: 0.82 },
  { a: "leftHand", b: "rightHand", length: 1.12, stiffness: 0.08 },
  { a: "leftFoot", b: "rightFoot", length: 0.48, stiffness: 0.18 }
];

const RAGDOLL_BONE_SEGMENTS: RagdollBoneSegment[] = [
  { driveBoneKey: "spine1", fromBoneKey: "spine1", toBoneKey: "spine2", fromPoint: "pelvis", toPoint: "chest", amount: 0.62 },
  { driveBoneKey: "spine2", fromBoneKey: "spine2", toBoneKey: "head", fromPoint: "chest", toPoint: "head", amount: 0.48 },
  { driveBoneKey: "neck", fromBoneKey: "neck", toBoneKey: "head", fromPoint: "chest", toPoint: "head", amount: 0.5 },
  { driveBoneKey: "head", fromBoneKey: "neck", toBoneKey: "head", fromPoint: "chest", toPoint: "head", amount: 0.58 },
  { driveBoneKey: "leftShoulder", fromBoneKey: "leftArm", toBoneKey: "leftForearm", fromPoint: "chest", toPoint: "leftElbow", amount: 0.38 },
  { driveBoneKey: "leftArm", fromBoneKey: "leftArm", toBoneKey: "leftForearm", fromPoint: "chest", toPoint: "leftElbow", amount: 0.74 },
  { driveBoneKey: "leftForearm", fromBoneKey: "leftForearm", toBoneKey: "leftHand", fromPoint: "leftElbow", toPoint: "leftHand", amount: 0.86 },
  { driveBoneKey: "rightShoulder", fromBoneKey: "rightArm", toBoneKey: "rightForearm", fromPoint: "chest", toPoint: "rightElbow", amount: 0.38 },
  { driveBoneKey: "rightArm", fromBoneKey: "rightArm", toBoneKey: "rightForearm", fromPoint: "chest", toPoint: "rightElbow", amount: 0.74 },
  { driveBoneKey: "rightForearm", fromBoneKey: "rightForearm", toBoneKey: "rightHand", fromPoint: "rightElbow", toPoint: "rightHand", amount: 0.86 },
  { driveBoneKey: "leftThigh", fromBoneKey: "leftThigh", toBoneKey: "leftLeg", fromPoint: "pelvis", toPoint: "leftKnee", amount: 0.78 },
  { driveBoneKey: "leftLeg", fromBoneKey: "leftLeg", toBoneKey: "leftFoot", fromPoint: "leftKnee", toPoint: "leftFoot", amount: 0.9 },
  { driveBoneKey: "rightThigh", fromBoneKey: "rightThigh", toBoneKey: "rightLeg", fromPoint: "pelvis", toPoint: "rightKnee", amount: 0.78 },
  { driveBoneKey: "rightLeg", fromBoneKey: "rightLeg", toBoneKey: "rightFoot", fromPoint: "rightKnee", toPoint: "rightFoot", amount: 0.9 }
];

const transparentFbxTexture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
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
  const positionBind = new Map<THREE.Bone, THREE.Vector3>();
  root.traverse((child) => {
    if (child instanceof THREE.Bone) {
      bind.set(child, child.quaternion.clone());
      positionBind.set(child, child.position.clone());
    }
  });
  return { bones, bind, positionBind };
}

export class GameCharacterController {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly boneRig: BoneRig;
  private readonly armRig: Record<HandStrikeSide, ArmRigKeys>;
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
  private readonly ragdollParticles = new Map<RagdollPointKey, RagdollParticle>();
  private ragdollStartedAt = 0;
  private ragdollSeed = 0;
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
    this.armRig = this.resolveArmRig();
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
    const ragdollPose = ragdoll ? this.updateRagdollSimulation(snapshot, time, deltaTime) : null;
    if (ragdoll && ragdollPose) this.applyRagdollIk(ragdollPose);
    else this.applyProceduralIk(snapshot, strikePose, celebrationPose);
    const bob = ragdoll ? 0 : snapshot.airborne ? 0.12 : Math.abs(Math.sin(time * (7.2 + Math.min(speed, 7) * 0.22))) * Math.min(0.1, speed * 0.011);
    const breath = ragdoll ? 0 : snapshot.exhausted ? Math.sin(time * 9) * 0.012 : Math.sin(time * 2.4) * 0.006;
    if (ragdoll && ragdollPose) {
      const ragdollAge = Math.max(0, Date.now() - (snapshot.ragdollAt || 0));
      const fall = ragdollPose.fall;
      const settle = ragdollPose.settle;
      const motion = ragdollPose.motion;
      const side = ragdollPose.side;
      const sideFall = 1 - Math.min(1, Math.abs(motion.forward));
      const liveShake = Math.sin(time * 8.2 + this.ragdollSeed * 4.7) * 0.018 * ragdollPose.limpEnergy * (0.35 + ragdollPose.kinetic);
      const pitch = -0.18 - Math.abs(motion.forward) * 0.12;
      this.root.position.y = 0.058 + (1 - fall) * 0.22 + liveShake * 0.5;
      this.root.rotation.set(
        pitch * fall + ragdollPose.torsoPitch * 0.08 + ragdollPose.flutter * 0.01,
        motion.side * 0.08 * fall * (1 - settle * 0.45) + ragdollPose.torsoYaw * 0.07,
        side * (1.24 + sideFall * 0.18) * fall + ragdollPose.torsoRoll * 0.06 + Math.sin(time * 2.1 + this.ragdollSeed * 9.3) * 0.01 * ragdollPose.limpEnergy
      );
      this.root.scale.set(1 + 0.012 * ragdollPose.kinetic, 1, 1 + 0.014 * fall);
    } else {
      if (this.ragdollStartedAt > 0) this.ragdollStartedAt = 0;
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
      ikMode: this.ragdollActive ? "ragdoll-lightweight-constraint-ik" : "procedural-bone-ik-overlay",
      boneCount: this.boneRig.bind.size
    };
  }

  private localBonePosition(key: string): THREE.Vector3 | null {
    const bone = this.boneRig.bones.get(key);
    if (!bone) return null;
    this.root.updateMatrixWorld(true);
    bone.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    bone.getWorldPosition(position);
    return this.root.worldToLocal(position);
  }

  private localBoneX(key: string): number {
    return this.localBonePosition(key)?.x ?? 0;
  }

  private calibrateArmOutwardZ(keys: Omit<ArmRigKeys, "outwardZSign">): number {
    const touched = [keys.shoulder, keys.arm, keys.forearm, keys.hand]
      .map((key) => this.boneRig.bones.get(key))
      .filter((bone): bone is THREE.Bone => Boolean(bone));
    if (touched.length === 0) return 1;
    const saved = touched.map((bone) => [bone, bone.quaternion.clone()] as const);
    const shoulderX = this.localBoneX(keys.shoulder);
    const before = this.localBoneX(keys.hand);
    const shoulderSign = shoulderX >= 0 ? 1 : -1;
    this.rotateBone(keys.shoulder, 0, 0, 0.38, 1);
    this.rotateBone(keys.arm, 0, 0, 0.38, 1);
    this.rotateBone(keys.forearm, 0, 0, 0.18, 1);
    this.root.updateMatrixWorld(true);
    const after = this.localBoneX(keys.hand);
    for (const [bone, quaternion] of saved) bone.quaternion.copy(quaternion);
    this.root.updateMatrixWorld(true);
    return (after - before) * shoulderSign >= 0 ? 1 : -1;
  }

  private resolveArmRig(): Record<HandStrikeSide, ArmRigKeys> {
    const leftShoulderX = this.localBoneX("leftShoulder");
    const rightShoulderX = this.localBoneX("rightShoulder");
    const leftKeys = {
      shoulder: "leftShoulder",
      arm: "leftArm",
      forearm: "leftForearm",
      hand: "leftHand",
      counterShoulder: "rightShoulder",
      counterArm: "rightArm",
      counterForearm: "rightForearm"
    };
    const rightKeys = {
      shoulder: "rightShoulder",
      arm: "rightArm",
      forearm: "rightForearm",
      hand: "rightHand",
      counterShoulder: "leftShoulder",
      counterArm: "leftArm",
      counterForearm: "leftForearm"
    };
    const rightUsesLeft = leftShoulderX >= rightShoulderX;
    const visualRight = rightUsesLeft ? leftKeys : rightKeys;
    const visualLeft = rightUsesLeft ? rightKeys : leftKeys;
    return {
      right: { ...visualRight, outwardZSign: this.calibrateArmOutwardZ(visualRight) },
      left: { ...visualLeft, outwardZSign: this.calibrateArmOutwardZ(visualLeft) }
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
    for (const [bone, bindPosition] of this.boneRig.positionBind) {
      bone.position.copy(bindPosition);
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

  private nudgeBoneInRootSpace(key: string, x: number, y: number, z: number, amount: number): void {
    if (amount <= 0) return;
    const bone = this.boneRig.bones.get(key);
    const parent = bone?.parent;
    if (!bone || !parent) return;
    this.root.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    const originWorld = this.root.localToWorld(new THREE.Vector3(0, 0, 0));
    const targetWorld = this.root.localToWorld(new THREE.Vector3(x * amount, y * amount, z * amount));
    const deltaWorld = targetWorld.sub(originWorld);
    const parentQuaternion = new THREE.Quaternion();
    parent.getWorldQuaternion(parentQuaternion);
    parentQuaternion.invert();
    bone.position.add(deltaWorld.applyQuaternion(parentQuaternion));
  }

  private offsetBoneLocal(key: string, x: number, y: number, z: number, amount: number): void {
    if (amount <= 0) return;
    const bone = this.boneRig.bones.get(key);
    if (!bone) return;
    bone.position.x += x * amount;
    bone.position.y += y * amount;
    bone.position.z += z * amount;
  }

  private moveBoneTowardRootPosition(key: string, target: THREE.Vector3, amount: number): void {
    if (amount <= 0) return;
    const bone = this.boneRig.bones.get(key);
    const parent = bone?.parent;
    const current = this.localBonePosition(key);
    if (!bone || !parent || !current) return;
    const next = current.lerp(target, THREE.MathUtils.clamp(amount, 0, 1));
    this.root.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    const nextWorld = this.root.localToWorld(next);
    bone.position.copy(parent.worldToLocal(nextWorld));
  }

  private forceHandForwardFromShoulder(handKey: string, shoulderKey: string, amount: number): void {
    const shoulder = this.localBonePosition(shoulderKey);
    const hand = this.localBonePosition(handKey);
    if (!shoulder || !hand) return;
    const side = Math.sign(shoulder.x || hand.x || 1);
    const target = new THREE.Vector3(
      side * Math.max(0.26, Math.abs(shoulder.x) * 2.35, Math.abs(hand.x)),
      THREE.MathUtils.lerp(hand.y, shoulder.y - 0.04, 0.18),
      shoulder.z + 0.86
    );
    this.moveBoneTowardRootPosition(handKey, target, amount);
  }

  private pullBoneTowardRagdollPoint(boneKey: string, pointKey: RagdollPointKey, amount: number, maxDistance: number): void {
    if (amount <= 0) return;
    const current = this.localBonePosition(boneKey);
    if (!current) return;
    const target = this.ragdollParticle(pointKey).position;
    const correction = target.clone().sub(current);
    const distance = correction.length();
    if (distance <= 0.0001) return;
    if (distance > maxDistance) correction.multiplyScalar(maxDistance / distance);
    this.nudgeBoneInRootSpace(boneKey, correction.x, correction.y, correction.z, amount);
  }

  private alignBoneToRagdollSegment(segment: RagdollBoneSegment, amount: number): void {
    const bone = this.boneRig.bones.get(segment.driveBoneKey);
    const fromBone = this.boneRig.bones.get(segment.fromBoneKey);
    const toBone = this.boneRig.bones.get(segment.toBoneKey);
    const parent = bone?.parent;
    if (!bone || !fromBone || !toBone || !parent || amount <= 0) return;

    this.root.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    fromBone.updateMatrixWorld(true);
    toBone.updateMatrixWorld(true);
    bone.updateMatrixWorld(true);

    const currentFrom = new THREE.Vector3();
    const currentTo = new THREE.Vector3();
    fromBone.getWorldPosition(currentFrom);
    toBone.getWorldPosition(currentTo);
    const currentDir = currentTo.sub(currentFrom);
    if (currentDir.lengthSq() < 0.000001) return;
    currentDir.normalize();

    const targetFrom = this.root.localToWorld(this.ragdollParticle(segment.fromPoint).position.clone());
    const targetTo = this.root.localToWorld(this.ragdollParticle(segment.toPoint).position.clone());
    const targetDir = targetTo.sub(targetFrom);
    if (targetDir.lengthSq() < 0.000001) return;
    targetDir.normalize();

    const currentWorldQuat = new THREE.Quaternion();
    const parentWorldQuat = new THREE.Quaternion();
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);
    const targetWorldQuat = new THREE.Quaternion();
    const targetLocalQuat = new THREE.Quaternion();
    bone.getWorldQuaternion(currentWorldQuat);
    parent.getWorldQuaternion(parentWorldQuat);
    targetWorldQuat.copy(alignQuat).multiply(currentWorldQuat).normalize();
    targetLocalQuat.copy(parentWorldQuat).invert().multiply(targetWorldQuat).normalize();
    bone.quaternion.slerp(targetLocalQuat, THREE.MathUtils.clamp(amount, 0, 1));
  }

  private correctHandStrikeTarget(keys: ArmRigKeys, visualSide: number, amount: number): void {
    if (amount <= 0) return;
    this.root.updateMatrixWorld(true);
    const shoulder = this.localBonePosition(keys.shoulder);
    const hand = this.localBonePosition(keys.hand);
    if (!shoulder || !hand) return;
    const targetX = visualSide * Math.max(0.24, Math.abs(shoulder.x) * 1.7);
    const targetZ = shoulder.z + 0.72;
    const correctionX = THREE.MathUtils.clamp(targetX - hand.x, -0.85, 0.85);
    const correctionZ = THREE.MathUtils.clamp(targetZ - hand.z, -0.42, 1.02);
    this.nudgeBoneInRootSpace(keys.forearm, correctionX * 0.34, 0.02, correctionZ * 0.34, amount);
    this.nudgeBoneInRootSpace(keys.hand, correctionX, 0.02, correctionZ, amount);
  }

  private currentVisualArmRig(visualSide: number): ArmRigKeys {
    const leftKeys = {
      shoulder: "leftShoulder",
      arm: "leftArm",
      forearm: "leftForearm",
      hand: "leftHand",
      counterShoulder: "rightShoulder",
      counterArm: "rightArm",
      counterForearm: "rightForearm",
      outwardZSign: 1
    };
    const rightKeys = {
      shoulder: "rightShoulder",
      arm: "rightArm",
      forearm: "rightForearm",
      hand: "rightHand",
      counterShoulder: "leftShoulder",
      counterArm: "leftArm",
      counterForearm: "leftForearm",
      outwardZSign: 1
    };
    return this.localBoneX("leftShoulder") * visualSide >= this.localBoneX("rightShoulder") * visualSide
      ? leftKeys
      : rightKeys;
  }

  private resetRagdollSimulation(snapshot: CharacterControllerSnapshot): void {
    const startedAt = snapshot.ragdollAt || Date.now();
    this.ragdollStartedAt = startedAt;
    const seed = Math.sin(startedAt * 0.0129898) * 43758.5453;
    this.ragdollSeed = seed - Math.floor(seed);
    this.ragdollParticles.clear();
    const motion = ragdollMotion(snapshot);
    const impulse = THREE.MathUtils.clamp(0.62 + motion.speed * 0.16, 0.62, 1.95);
    const side = Math.abs(motion.side) > 0.1
      ? Math.sign(motion.side)
      : Math.sin(startedAt * 0.017) >= 0 ? 1 : -1;
    for (const key of RAGDOLL_PARTICLE_ORDER) {
      const [x, y, z] = RAGDOLL_BASE_POINTS[key];
      const pointIndex = RAGDOLL_PARTICLE_ORDER.indexOf(key);
      const noiseA = Math.sin(this.ragdollSeed * 91.7 + pointIndex * 17.31);
      const noiseB = Math.sin(this.ragdollSeed * 131.9 + pointIndex * 29.13);
      const isHand = key.endsWith("Hand");
      const isElbow = key.endsWith("Elbow");
      const isFoot = key.endsWith("Foot");
      const isKnee = key.endsWith("Knee");
      const limbWeight = isHand ? 1.45 : isElbow ? 1.1 : isFoot ? 1.28 : isKnee ? 1 : 0.42;
      const sideSign = key.startsWith("left") ? -1 : key.startsWith("right") ? 1 : 0;
      const position = new THREE.Vector3(
        x + side * noiseA * 0.04 * limbWeight,
        y - Math.abs(noiseB) * 0.035 * limbWeight,
        z + (motion.forward * 0.025 + noiseB * 0.018) * limbWeight
      );
      const velocity = new THREE.Vector3(
        (side * 0.46 + sideSign * 0.22 + noiseA * 0.18) * impulse * limbWeight,
        (-0.5 - Math.abs(noiseB) * 0.38) * impulse * (isHand || isFoot ? 1.1 : 0.65),
        (motion.forward * 0.14 + noiseB * 0.08) * impulse * limbWeight
      );
      const previous = position.clone().addScaledVector(velocity, -1 / 60);
      const inverseMass = key === "pelvis" ? 0.36 : key === "chest" ? 0.46 : key === "head" ? 0.72 : 1;
      const floor = isHand || isFoot ? 0.045 : isKnee ? 0.1 : key === "pelvis" ? 0.2 : key === "chest" ? 0.22 : key === "head" ? 0.08 : 0.14;
      this.ragdollParticles.set(key, { position, previous, inverseMass, floor });
    }
  }

  private ragdollParticle(key: RagdollPointKey): RagdollParticle {
    let particle = this.ragdollParticles.get(key);
    if (!particle) {
      const [x, y, z] = RAGDOLL_BASE_POINTS[key];
      const position = new THREE.Vector3(x, y, z);
      particle = { position, previous: position.clone(), inverseMass: 1, floor: 0.04 };
      this.ragdollParticles.set(key, particle);
    }
    return particle;
  }

  private pullRagdollParticle(key: RagdollPointKey, target: THREE.Vector3, stiffness: number): void {
    const particle = this.ragdollParticle(key);
    particle.position.lerp(target, THREE.MathUtils.clamp(stiffness, 0, 1));
  }

  private solveRagdollLink(link: RagdollLink): void {
    const a = this.ragdollParticle(link.a);
    const b = this.ragdollParticle(link.b);
    const delta = b.position.clone().sub(a.position);
    const distance = delta.length();
    if (distance < 0.0001) return;
    const error = (distance - link.length) / distance;
    const totalMass = a.inverseMass + b.inverseMass;
    if (totalMass <= 0) return;
    const correction = delta.multiplyScalar(error * link.stiffness);
    a.position.addScaledVector(correction, a.inverseMass / totalMass);
    b.position.addScaledVector(correction, -b.inverseMass / totalMass);
  }

  private clampRagdollParticles(): void {
    for (const particle of this.ragdollParticles.values()) {
      particle.position.x = THREE.MathUtils.clamp(particle.position.x, -1.08, 1.08);
      particle.position.z = THREE.MathUtils.clamp(particle.position.z, -0.58, 0.72);
      if (particle.position.y < particle.floor) {
        particle.position.y = particle.floor;
        particle.previous.y = particle.position.y;
        particle.previous.x = particle.position.x + (particle.previous.x - particle.position.x) * 0.58;
        particle.previous.z = particle.position.z + (particle.previous.z - particle.position.z) * 0.58;
      }
      particle.position.y = Math.min(particle.position.y, 1.72);
    }
  }

  private updateRagdollSimulation(snapshot: CharacterControllerSnapshot, time: number, deltaTime: number): RagdollPoseState {
    const startedAt = snapshot.ragdollAt || Date.now();
    if (this.ragdollStartedAt !== startedAt || this.ragdollParticles.size === 0) {
      this.resetRagdollSimulation(snapshot);
    }
    const ragdollAge = Math.max(0, Date.now() - startedAt);
    const fall = easeOutCubic(THREE.MathUtils.clamp(ragdollAge / 560, 0, 1));
    const settle = THREE.MathUtils.clamp((ragdollAge - 1400) / 5200, 0, 0.72);
    const motion = ragdollMotion(snapshot);
    const side = Math.abs(motion.side) > 0.12
      ? Math.sign(motion.side)
      : Math.sin(startedAt * 0.017) >= 0 ? 1 : -1;
    const dt = THREE.MathUtils.clamp(deltaTime, 1 / 120, 1 / 30);
    const subSteps = dt > 1 / 55 ? 2 : 1;
    const impactEnergy = Math.max(0, 1 - ragdollAge / 2600);
    const slideEnergy = THREE.MathUtils.clamp(motion.speed / 5.8, 0, 0.85);
    const limpEnergy = THREE.MathUtils.clamp(0.36 + impactEnergy * 0.72 + slideEnergy * 0.6, 0.36, 1.28);
    for (let subStep = 0; subStep < subSteps; subStep += 1) {
      const step = dt / subSteps;
      const stepSq = step * step;
      const damping = Math.exp(-step * (0.92 + settle * 0.72));
      for (const key of RAGDOLL_PARTICLE_ORDER) {
        const particle = this.ragdollParticle(key);
        const old = particle.position.clone();
        const velocity = particle.position.clone().sub(particle.previous).multiplyScalar(damping);
        const pointIndex = RAGDOLL_PARTICLE_ORDER.indexOf(key);
        const isLimbTip = key.endsWith("Hand") || key.endsWith("Foot");
        const isLimbMid = key.endsWith("Elbow") || key.endsWith("Knee");
        const quickNoise = Math.sin(time * 7.7 + this.ragdollSeed * 8.9 + pointIndex * 1.73);
        const slowNoise = Math.sin(time * 2.35 + this.ragdollSeed * 13.1 + pointIndex * 2.41);
        const limbForce = isLimbTip ? 1.65 : isLimbMid ? 1.18 : 0.42;
        particle.position.add(velocity);
        particle.position.x += (motion.side * 4.2 + side * quickNoise * 1.5 + slowNoise * 2.2) * limpEnergy * limbForce * stepSq;
        particle.position.z += (motion.forward * 2.4 + quickNoise * 0.9 + slowNoise * 1.15) * limpEnergy * limbForce * stepSq;
        particle.position.y -= (7.2 + fall * 3.4) * stepSq * (isLimbTip ? 1.08 : 0.92);
        particle.previous.copy(old);
      }
      const anchorSway = Math.sin(time * 1.7 + this.ragdollSeed * 6.1);
      const pelvisAnchor = new THREE.Vector3(
        side * 0.025 + motion.side * 0.035 + anchorSway * 0.018,
        0.58 - fall * 0.36,
        -0.18 + motion.forward * 0.08 * fall + Math.cos(time * 1.25 + this.ragdollSeed * 5.4) * 0.018
      );
      const chestAnchor = new THREE.Vector3(
        side * 0.04 + motion.side * 0.045 - anchorSway * 0.02,
        0.84 - fall * 0.58,
        0.34 + motion.forward * 0.12 * fall - Math.sin(time * 1.4 + this.ragdollSeed * 4.2) * 0.018
      );
      const headAnchor = new THREE.Vector3(
        side * 0.06 + motion.side * 0.035,
        0.24 - fall * 0.08,
        0.66 + motion.forward * 0.12 * fall + Math.sin(time * 1.15 + this.ragdollSeed * 3.3) * 0.014
      );
      this.pullRagdollParticle("pelvis", pelvisAnchor, 0.09 + slideEnergy * 0.06);
      this.pullRagdollParticle("chest", chestAnchor, 0.06 + slideEnergy * 0.05);
      this.pullRagdollParticle("head", headAnchor, 0.035 + slideEnergy * 0.025);
      for (let iteration = 0; iteration < 4; iteration += 1) {
        for (const link of RAGDOLL_LINKS) this.solveRagdollLink(link);
        this.clampRagdollParticles();
      }
    }
    let velocitySum = 0;
    for (const particle of this.ragdollParticles.values()) {
      velocitySum += particle.position.distanceTo(particle.previous) / Math.max(dt, 0.001);
    }
    const pelvis = this.ragdollParticle("pelvis").position;
    const chest = this.ragdollParticle("chest").position;
    const head = this.ragdollParticle("head").position;
    const kinetic = THREE.MathUtils.clamp((velocitySum / Math.max(1, this.ragdollParticles.size)) * 0.95, 0, 1);
    const torsoPitch = THREE.MathUtils.clamp((chest.z - pelvis.z) * 1.8 + (head.z - chest.z) * 0.65, -0.8, 0.8);
    const torsoRoll = THREE.MathUtils.clamp((chest.x - pelvis.x) * 2.1 + side * kinetic * 0.12, -0.8, 0.8);
    const torsoYaw = THREE.MathUtils.clamp((head.x - chest.x) * 1.35, -0.55, 0.55);
    const flutter = (
      Math.sin(time * 5.6 + this.ragdollSeed * 7.1) * 0.65 +
      Math.sin(time * 2.2 + this.ragdollSeed * 11.5) * 0.35
    ) * limpEnergy * (0.22 + kinetic * 0.82);
    return { fall, settle, motion, side, limpEnergy, kinetic, flutter, torsoPitch, torsoRoll, torsoYaw };
  }

  private applyRagdollIk(state: RagdollPoseState): void {
    const fall = state.fall;
    const settle = state.settle;
    const point = (key: RagdollPointKey) => this.ragdollParticle(key).position;
    const segmentFollow = fall * (0.82 - settle * 0.16 + state.kinetic * 0.1);
    this.moveBoneTowardRootPosition("spine1", point("pelvis"), fall * 0.78);
    this.moveBoneTowardRootPosition("spine2", point("chest"), fall * 0.42);
    for (const segment of RAGDOLL_BONE_SEGMENTS) {
      this.alignBoneToRagdollSegment(segment, segment.amount * segmentFollow);
    }

    const limbFollow = fall * (0.38 + state.kinetic * 0.1);
    this.pullBoneTowardRagdollPoint("head", "head", limbFollow * 0.24, 0.24);
    this.pullBoneTowardRagdollPoint("leftHand", "leftHand", limbFollow * 0.52, 0.3);
    this.pullBoneTowardRagdollPoint("rightHand", "rightHand", limbFollow * 0.52, 0.3);
    this.pullBoneTowardRagdollPoint("leftFoot", "leftFoot", limbFollow * 0.48, 0.26);
    this.pullBoneTowardRagdollPoint("rightFoot", "rightFoot", limbFollow * 0.48, 0.26);

    const groundedX = new THREE.Vector3(0, 0, 0);
    const groundAmount = fall * (0.82 + state.kinetic * 0.08);
    const settleFlat = THREE.MathUtils.clamp(settle * 1.4, 0, 1);
    const puppetDrift = state.flutter * 0.12;
    const puppetCounter = state.flutter * -0.08;
    const target = (x: number, y: number, z: number) => groundedX.set(x, y, z).clone();
    this.moveBoneTowardRootPosition("leftElbow", target(0, 0.82 + puppetDrift * 0.25, 0.22 + puppetCounter), groundAmount * 0.46);
    this.moveBoneTowardRootPosition("rightElbow", target(0, 0.82 + puppetCounter * 0.25, 0.28 + puppetDrift), groundAmount * 0.46);
    this.moveBoneTowardRootPosition("leftHand", target(0, 0.58 + puppetCounter * 0.35, 0.54 + puppetDrift), groundAmount * (0.68 + settleFlat * 0.22));
    this.moveBoneTowardRootPosition("rightHand", target(0, 0.58 + puppetDrift * 0.35, puppetCounter), groundAmount * (0.68 + settleFlat * 0.22));
    this.moveBoneTowardRootPosition("leftThigh", target(0, 0.52, -0.16 + puppetCounter * 0.45), groundAmount * 0.44);
    this.moveBoneTowardRootPosition("rightThigh", target(0, 0.5, 0.18 + puppetDrift * 0.45), groundAmount * 0.44);
    this.moveBoneTowardRootPosition("leftLeg", target(0, 0.28 + puppetDrift * 0.2, -0.24 + puppetCounter * 0.5), groundAmount * 0.52);
    this.moveBoneTowardRootPosition("rightLeg", target(0, 0.28 + puppetCounter * 0.2, 0.22 + puppetDrift * 0.5), groundAmount * 0.52);
    this.moveBoneTowardRootPosition("leftKnee", target(0, 0.32, -0.18 + puppetCounter * 0.45), groundAmount * 0.56);
    this.moveBoneTowardRootPosition("rightKnee", target(0, 0.3, 0.16 + puppetDrift * 0.45), groundAmount * 0.56);
    this.moveBoneTowardRootPosition("leftFoot", target(0, 0.08 + puppetCounter * 0.2, -0.42 + puppetCounter), groundAmount * (0.78 + settleFlat * 0.2));
    this.moveBoneTowardRootPosition("rightFoot", target(0, 0.08 + puppetDrift * 0.2, 0.36 + puppetDrift), groundAmount * (0.78 + settleFlat * 0.2));
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
      const keys = this.resolveArmRig()[this.activeHandStrikeSide] || this.armRig[this.activeHandStrikeSide];
      const strikeShoulder = keys.shoulder;
      const strikeArm = keys.arm;
      const strikeForearm = keys.forearm;
      const strikeHand = keys.hand;
      const counterShoulder = keys.counterShoulder;
      const counterArm = keys.counterArm;
      const counterForearm = keys.counterForearm;
      const visualSide = isRight ? 1 : -1;
      const outwardZ = keys.outwardZSign;
      this.rotateBone(strikeShoulder, -0.22, -0.06 * visualSide, 0.46 * outwardZ, chamber);
      this.rotateBone(strikeArm, -0.36, -0.04 * visualSide, 0.5 * outwardZ, chamber);
      this.rotateBone(strikeForearm, 0.48, 0, 0.2 * outwardZ, chamber);
      this.rotateBone(strikeHand, -0.04, -0.02 * visualSide, 0.06 * outwardZ, chamber);
      this.rotateBone(strikeShoulder, -1.02, -0.1 * visualSide, 0.66 * outwardZ, impact);
      this.rotateBone(strikeArm, -1.48, -0.08 * visualSide, 0.84 * outwardZ, impact);
      this.rotateBone(strikeForearm, -0.3, 0.02 * visualSide, 0.24 * outwardZ, impact);
      this.rotateBone(strikeHand, -0.1, -0.03 * visualSide, 0.06 * outwardZ, impact);
      this.nudgeBoneInRootSpace(strikeForearm, 0.08 * visualSide, 0.02, 0.16, impact);
      this.nudgeBoneInRootSpace(strikeHand, 0.24 * visualSide, 0.02, 0.34, impact);
      this.correctHandStrikeTarget(keys, visualSide, impact);
      this.rotateBone("spine1", -0.06, -0.18 * visualSide, -0.03 * visualSide, pulse);
      this.rotateBone("spine2", -0.08, -0.26 * visualSide, -0.04 * visualSide, impact);
      this.rotateBone(counterShoulder, -0.16, 0.02 * visualSide, -0.22 * visualSide, pulse);
      this.rotateBone(counterArm, -0.52, 0.04 * visualSide, -0.18 * visualSide, pulse);
      this.rotateBone(counterForearm, -0.38, 0, -0.1 * visualSide, pulse);
      this.correctHandStrikeTarget(this.currentVisualArmRig(visualSide), visualSide, impact);
      this.nudgeBoneInRootSpace("leftForearm", 0, 0.01, 0.16, impact);
      this.nudgeBoneInRootSpace("rightForearm", 0, 0.01, 0.16, impact);
      this.nudgeBoneInRootSpace("leftHand", 0, 0.01, 0.36, impact);
      this.nudgeBoneInRootSpace("rightHand", 0, 0.01, 0.36, impact);
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
