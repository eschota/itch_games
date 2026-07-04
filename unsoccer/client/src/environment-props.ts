import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  BALL_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  PLAYER_RADIUS,
  type ServerState,
  type VisualColorMaterialSettings,
  type VisualSettings
} from "@itch-games/unsoccer-shared";
import { bakeTexturelessPbr, type TexturelessPbrBakeResult } from "./textureless-pbr-converter";
import {
  createIrregularPuddleEdgeGeometry,
  createIrregularPuddleGeometry,
  createWaterPuddleMaterial,
  updateWaterPuddleMaterial
} from "./water-puddle";

interface Free3dEnvironmentAsset {
  guid: string;
  kind: string;
  title: string;
  src: string;
  source: string;
  bytes: number;
}

interface Free3dEnvironmentRoster {
  version: string;
  mode: string;
  assets: Free3dEnvironmentAsset[];
}

interface Free3dEnvironmentPlacement {
  kind: string;
  x: number;
  z: number;
  rotation: number;
  size: number;
  yOffset?: number;
}

interface CourtyardEnvironmentOptions {
  root: THREE.Group;
  resolveClientAsset: (src: string) => string;
}

export interface CourtyardEnvironmentRuntime {
  update(state: ServerState, deltaSeconds: number): void;
  readonly rigidBodyCount: number;
}

interface EnvironmentRigidBody {
  object: THREE.Group;
  kind: string;
  mass: number;
  invMass: number;
  radius: number;
  home: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationVelocity: number;
  maxDisplacement: number;
  movable: boolean;
}

const free3dEnvironmentLoader = new GLTFLoader();
const free3dEnvironmentTemplates = new Map<string, Promise<THREE.Object3D>>();
const tempBox = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempCenter = new THREE.Vector3();
const tempVector = new THREE.Vector3();

const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3b38, roughness: 0.97, metalness: 0.01 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x202927, roughness: 0.94 });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x606f68, roughness: 0.9 });
const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dfd7, roughness: 0.72 });
const gardenMaterial = new THREE.MeshStandardMaterial({ color: 0x294d36, roughness: 0.96 });
const planterMaterial = new THREE.MeshStandardMaterial({ color: 0x8d6144, roughness: 0.78 });
const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x271e17, roughness: 1 });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x3d8c58, roughness: 0.92 });
const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x28302f, roughness: 0.62, metalness: 0.22 });
const brightMetalMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c5c7, roughness: 0.38, metalness: 0.34 });
const chalkMaterial = new THREE.MeshBasicMaterial({ color: 0xe7eee1, transparent: true, opacity: 0.5 });
const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.74, toneMapped: false });
const courtyardPuddleMaterials: THREE.Material[] = [];
let courtyardPuddleTime = 0;

function applyMaterialSettings(material: THREE.Material, settings: VisualColorMaterialSettings): void {
  const target = material as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    opacity?: number;
    transparent?: boolean;
  };
  target.color?.set(settings.color);
  if (settings.roughness !== undefined && "roughness" in target) target.roughness = settings.roughness;
  if (settings.metalness !== undefined && "metalness" in target) target.metalness = settings.metalness;
  if (settings.opacity !== undefined && "opacity" in target) {
    target.opacity = settings.opacity;
    target.transparent = settings.opacity < 1;
  }
  material.needsUpdate = true;
}

export function applyEnvironmentLookdevMaterials(visual: VisualSettings): void {
  applyMaterialSettings(surfaceMaterial, visual.materials.courtyard);
  applyMaterialSettings(roadMaterial, visual.materials.road);
  applyMaterialSettings(sidewalkMaterial, visual.materials.sidewalk);
  applyMaterialSettings(curbMaterial, visual.materials.curb);
  applyMaterialSettings(gardenMaterial, visual.materials.foliage);
  applyMaterialSettings(leafMaterial, visual.materials.foliage);
  applyMaterialSettings(metalMaterial, visual.materials.metal);
  applyMaterialSettings(brightMetalMaterial, visual.materials.brightMetal);
  applyMaterialSettings(chalkMaterial, visual.materials.markingSecondary);
  applyMaterialSettings(planterMaterial, visual.materials.courtyard);
  applyMaterialSettings(soilMaterial, visual.materials.courtyard);
}

let proceduralEnvironmentInstances = 0;
let free3dEnvironmentInstances = 0;
let free3dEnvironmentTexturelessTemplates = 0;
let free3dEnvironmentTexturelessFailures = 0;
let free3dEnvironmentRuntimeTextureCount = 0;
let free3dEnvironmentRigidBodyCount = 0;
let free3dEnvironmentColliderCount = 0;
let free3dEnvironmentMassKg = 0;

class LocalCourtyardEnvironmentRuntime implements CourtyardEnvironmentRuntime {
  private readonly bodies: EnvironmentRigidBody[] = [];
  private impulseEvents = 0;

  get rigidBodyCount(): number {
    return this.bodies.length;
  }

  addPropBody(object: THREE.Group, placement: Free3dEnvironmentPlacement): void {
    const physics = physicsProfileForKind(placement.kind, placement.size);
    const body: EnvironmentRigidBody = {
      object,
      kind: placement.kind,
      mass: physics.mass,
      invMass: physics.movable ? 1 / physics.mass : 0,
      radius: physics.radius,
      home: object.position.clone(),
      velocity: new THREE.Vector3(),
      rotationVelocity: 0,
      maxDisplacement: physics.maxDisplacement,
      movable: physics.movable
    };
    object.userData.rigidBody = "local-dynamic-prop";
    object.userData.massKg = physics.mass;
    object.userData.collider = {
      type: "cylinder",
      radius: physics.radius,
      height: physics.height
    };
    object.userData.vertexPbrOnly = true;
    this.bodies.push(body);
    syncPropPhysicsDatasets(this.bodies);
  }

  update(state: ServerState, deltaSeconds: number): void {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0.001, 0.05);
    courtyardPuddleTime += dt;
    for (const material of courtyardPuddleMaterials) {
      updateWaterPuddleMaterial(material, courtyardPuddleTime, 1, 0.34);
    }
    if (this.bodies.length === 0) return;
    const propImpulseMultiplier = state.settings?.propImpulseMultiplier ?? 1;
    const propDamping = state.settings?.propDamping ?? 2.4;
    const propReturnStrength = state.settings?.propReturnStrength ?? 1.25;
    const propMaxDisplacementMultiplier = state.settings?.propMaxDisplacementMultiplier ?? 1;
    let movedBodies = 0;
    for (const body of this.bodies) {
      if (body.movable) {
        for (const player of state.players) {
          if (player.role !== "player") continue;
          this.applyDiscImpulse(
            body,
            player.position.x,
            player.position.z,
            PLAYER_RADIUS + body.radius,
            player.velocity.x,
            player.velocity.z,
            7.5 * propImpulseMultiplier
          );
        }
        this.applyDiscImpulse(
          body,
          state.ball.position.x,
          state.ball.position.z,
          BALL_RADIUS + body.radius,
          state.ball.velocity.x,
          state.ball.velocity.z,
          13.5 * propImpulseMultiplier
        );
        tempVector.copy(body.object.position).sub(body.home);
        const maxDisplacement = body.maxDisplacement * propMaxDisplacementMultiplier;
        if (tempVector.length() > maxDisplacement) {
          tempVector.setLength(maxDisplacement);
          body.object.position.copy(body.home).add(tempVector);
        }
        body.velocity.addScaledVector(tempVector, -propReturnStrength * dt);
        body.velocity.multiplyScalar(Math.exp(-propDamping * dt));
        body.object.position.addScaledVector(body.velocity, dt);
        body.object.position.y = body.home.y;
        body.rotationVelocity *= Math.exp(-2.8 * dt);
        body.object.rotation.y += body.rotationVelocity * dt;
        if (body.object.position.distanceTo(body.home) > 0.035 || body.velocity.lengthSq() > 0.0025) {
          movedBodies += 1;
        }
      }
    }
    document.documentElement.dataset.free3dEnvironmentActiveRigidBodies = String(this.bodies.length);
    document.documentElement.dataset.free3dEnvironmentMovedRigidBodies = String(movedBodies);
    document.documentElement.dataset.free3dEnvironmentImpulseEvents = String(this.impulseEvents);
    document.documentElement.dataset.free3dEnvironmentPropImpulseMultiplier = propImpulseMultiplier.toFixed(3);
    document.documentElement.dataset.free3dEnvironmentPropDamping = propDamping.toFixed(3);
    document.documentElement.dataset.free3dEnvironmentPropReturnStrength = propReturnStrength.toFixed(3);
  }

  private applyDiscImpulse(
    body: EnvironmentRigidBody,
    sourceX: number,
    sourceZ: number,
    contactRadius: number,
    sourceVelocityX: number,
    sourceVelocityZ: number,
    impulseScale: number
  ): void {
    const dx = body.object.position.x - sourceX;
    const dz = body.object.position.z - sourceZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= contactRadius || distance < 0.0001) return;
    const nx = dx / distance;
    const nz = dz / distance;
    const sourceSpeedTowardBody = Math.max(0, sourceVelocityX * nx + sourceVelocityZ * nz);
    const penetration = contactRadius - distance;
    const impulse = (penetration * 16 + sourceSpeedTowardBody * impulseScale) * body.invMass;
    body.velocity.x += nx * impulse;
    body.velocity.z += nz * impulse;
    body.rotationVelocity += THREE.MathUtils.clamp((nx * sourceVelocityZ - nz * sourceVelocityX) * body.invMass * 0.9, -2.5, 2.5);
    this.impulseEvents += 1;
  }
}

export function installCourtyardEnvironment({ root, resolveClientAsset }: CourtyardEnvironmentOptions): CourtyardEnvironmentRuntime {
  proceduralEnvironmentInstances = 0;
  free3dEnvironmentInstances = 0;
  free3dEnvironmentTexturelessTemplates = 0;
  free3dEnvironmentTexturelessFailures = 0;
  free3dEnvironmentRuntimeTextureCount = 0;
  free3dEnvironmentRigidBodyCount = 0;
  free3dEnvironmentColliderCount = 0;
  free3dEnvironmentMassKg = 0;
  document.documentElement.dataset.proceduralEnvironmentInstances = "0";
  document.documentElement.dataset.free3dEnvironmentInstances = "0";
  document.documentElement.dataset.free3dEnvironmentLoaded = "false";
  document.documentElement.dataset.environmentModelTarget = "100-plus";
  document.documentElement.dataset.environmentSmallProceduralProps = "removed";
  document.documentElement.dataset.environmentAssetMode = "free3d-textureless-vertex-pbr-only";
  document.documentElement.dataset.free3dEnvironmentTexturelessPbr = "false";
  document.documentElement.dataset.free3dEnvironmentRuntimeTextureCount = "0";
  document.documentElement.dataset.free3dEnvironmentRigidBodies = "0";
  document.documentElement.dataset.free3dEnvironmentColliders = "0";
  document.documentElement.dataset.free3dEnvironmentMassKg = "0";
  syncEnvironmentInstanceDatasets();

  const runtime = new LocalCourtyardEnvironmentRuntime();
  addExtendedCourtyardSurfaces(root);
  void hydrateFree3dEnvironment(root, resolveClientAsset, runtime);
  return runtime;
}

function syncEnvironmentInstanceDatasets(): void {
  document.documentElement.dataset.proceduralEnvironmentInstances = String(proceduralEnvironmentInstances);
  document.documentElement.dataset.free3dEnvironmentInstances = String(free3dEnvironmentInstances);
  document.documentElement.dataset.environmentModelInstances = String(
    proceduralEnvironmentInstances + free3dEnvironmentInstances
  );
  document.documentElement.dataset.free3dEnvironmentTexturelessTemplates = String(free3dEnvironmentTexturelessTemplates);
  document.documentElement.dataset.free3dEnvironmentTexturelessFailures = String(free3dEnvironmentTexturelessFailures);
  document.documentElement.dataset.free3dEnvironmentRuntimeTextureCount = String(free3dEnvironmentRuntimeTextureCount);
  document.documentElement.dataset.free3dEnvironmentTexturelessPbr = String(
    free3dEnvironmentInstances > 0 && free3dEnvironmentRuntimeTextureCount === 0
  );
  document.documentElement.dataset.free3dEnvironmentRigidBodies = String(free3dEnvironmentRigidBodyCount);
  document.documentElement.dataset.free3dEnvironmentColliders = String(free3dEnvironmentColliderCount);
  document.documentElement.dataset.free3dEnvironmentMassKg = String(Math.round(free3dEnvironmentMassKg));
}

function registerProceduralEnvironmentInstance(root: THREE.Group, object: THREE.Object3D, kind: string): void {
  object.userData.environmentKind = kind;
  proceduralEnvironmentInstances += 1;
  root.add(object);
}

function syncPropPhysicsDatasets(bodies: EnvironmentRigidBody[]): void {
  free3dEnvironmentRigidBodyCount = bodies.length;
  free3dEnvironmentColliderCount = bodies.length;
  free3dEnvironmentMassKg = bodies.reduce((total, body) => total + body.mass, 0);
  syncEnvironmentInstanceDatasets();
}

function physicsProfileForKind(kind: string, size: number): {
  mass: number;
  radius: number;
  height: number;
  maxDisplacement: number;
  movable: boolean;
} {
  if (kind.includes("traffic-cone")) {
    return { mass: 3.2, radius: Math.max(0.26, size * 0.34), height: size, maxDisplacement: 2.8, movable: true };
  }
  if (kind.includes("trash-bin")) {
    return { mass: 22, radius: Math.max(0.42, size * 0.42), height: size * 1.2, maxDisplacement: 1.35, movable: true };
  }
  if (kind.includes("bench")) {
    return { mass: 58, radius: Math.max(0.88, size * 0.44), height: size * 0.45, maxDisplacement: 0.62, movable: true };
  }
  return { mass: 1200, radius: Math.max(2.2, size * 0.42), height: size, maxDisplacement: 0.04, movable: false };
}

function countTextureMaps(root: THREE.Object3D): number {
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

function addExtendedCourtyardSurfaces(root: THREE.Group): void {
  const outer = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH + 46, 0.055, FIELD_LENGTH + 50),
    surfaceMaterial
  );
  outer.position.y = -0.18;
  outer.receiveShadow = true;
  root.add(outer);

  const sideRoadWidth = 6.4;
  for (const side of [-1, 1] as const) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(sideRoadWidth, 0.04, FIELD_LENGTH + 50), roadMaterial);
    road.position.set(side * (FIELD_WIDTH / 2 + 16.1), -0.105, 0);
    road.receiveShadow = true;
    root.add(road);

    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, FIELD_LENGTH + 44), sidewalkMaterial);
    sidewalk.position.set(side * (FIELD_WIDTH / 2 + 10.5), -0.08, 0);
    sidewalk.receiveShadow = true;
    root.add(sidewalk);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, FIELD_LENGTH + 44), curbMaterial);
    curb.position.set(side * (FIELD_WIDTH / 2 + 8.78), 0.0, 0);
    curb.receiveShadow = true;
    root.add(curb);
  }

  for (const side of [-1, 1] as const) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 46, 0.04, 5.8), roadMaterial);
    road.position.set(0, -0.11, side * (FIELD_LENGTH / 2 + 17.4));
    road.receiveShadow = true;
    root.add(road);

    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 38, 0.05, 3.0), sidewalkMaterial);
    sidewalk.position.set(0, -0.08, side * (FIELD_LENGTH / 2 + 11.5));
    sidewalk.receiveShadow = true;
    root.add(sidewalk);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(FIELD_WIDTH + 38, 0.12, 0.16), curbMaterial);
    curb.position.set(0, 0, side * (FIELD_LENGTH / 2 + 9.85));
    curb.receiveShadow = true;
    root.add(curb);
  }

  for (const [x, z, w, d] of [
    [-FIELD_WIDTH / 2 - 13.8, -FIELD_LENGTH / 2 - 13.8, 7.4, 7.4],
    [FIELD_WIDTH / 2 + 13.8, -FIELD_LENGTH / 2 - 13.8, 7.4, 7.4],
    [-FIELD_WIDTH / 2 - 13.8, FIELD_LENGTH / 2 + 13.8, 7.4, 7.4],
    [FIELD_WIDTH / 2 + 13.8, FIELD_LENGTH / 2 + 13.8, 7.4, 7.4],
    [0, -FIELD_LENGTH / 2 - 13.6, 14.2, 3.8],
    [0, FIELD_LENGTH / 2 + 13.6, 14.2, 3.8]
  ] as Array<[number, number, number, number]>) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), gardenMaterial);
    patch.position.set(x, -0.055, z);
    patch.receiveShadow = true;
    root.add(patch);
  }

  document.documentElement.dataset.environmentExtension = "outer-roads-sidewalks-garden-pockets";
}

function addDenseCourtyardDressing(root: THREE.Group): void {
  const halfW = FIELD_WIDTH / 2;
  const halfL = FIELD_LENGTH / 2;

  for (let i = 0; i < 16; i += 1) {
    const z = -halfL + 2.2 + i * ((FIELD_LENGTH - 4.4) / 15);
    addBollard(root, -halfW - 2.25, z, 0xeff3e8);
    addBollard(root, halfW + 2.25, z, 0xf5df6d);
  }

  for (let i = 0; i < 14; i += 1) {
    const x = -halfW + 2.3 + i * ((FIELD_WIDTH - 4.6) / 13);
    addBollard(root, x, -halfL - 2.15, 0xf4f2e5);
    addBollard(root, x, halfL + 2.15, 0x7fd2be);
  }

  addVisibleSidelineClusters(root, halfW, halfL);

  const planterZ = [-halfL - 7.2, halfL + 7.2];
  for (const z of planterZ) {
    for (let i = 0; i < 12; i += 1) {
      const x = -halfW - 8.0 + i * ((FIELD_WIDTH + 16) / 11);
      addPlanter(root, x, z, i * 0.17, 0.82 + (i % 3) * 0.08, i % 2 === 0 ? 0xd56848 : 0xf0c85d);
    }
  }

  const planterX = [-halfW - 9.8, halfW + 9.8];
  for (const x of planterX) {
    for (let i = 0; i < 9; i += 1) {
      const z = -halfL - 5.4 + i * ((FIELD_LENGTH + 10.8) / 8);
      addPlanter(root, x, z, Math.PI / 2 + i * 0.09, 0.72 + (i % 2) * 0.1, i % 3 === 0 ? 0x8fc1ff : 0xeadb78);
    }
  }

  for (const [x, z, rotation, color] of [
    [-halfW - 11.0, -29.0, Math.PI / 2, 0x6fb6d7],
    [-halfW - 11.2, -18.0, Math.PI / 2, 0xe46b5d],
    [-halfW - 11.1, -7.0, Math.PI / 2, 0xecc55f],
    [-halfW - 11.0, 7.5, Math.PI / 2, 0x7bcf8a],
    [-halfW - 11.2, 20.0, Math.PI / 2, 0xd6e4e7],
    [halfW + 11.0, -25.0, -Math.PI / 2, 0xf19955],
    [halfW + 11.3, -12.0, -Math.PI / 2, 0x6d9ad4],
    [halfW + 11.1, 3.0, -Math.PI / 2, 0xcfd66c],
    [halfW + 11.2, 16.0, -Math.PI / 2, 0x88c8ff],
    [halfW + 11.0, 29.0, -Math.PI / 2, 0xe06074],
    [-14.5, -halfL - 11.4, 0, 0x7ab6d6],
    [14.5, halfL + 11.4, Math.PI, 0xd68b58]
  ] as Array<[number, number, number, number]>) {
    addBicycle(root, x, z, rotation, color);
  }

  for (const [x, z, rotation, color] of [
    [-halfW - 12.6, -31.2, 0.05, 0x3a625d],
    [halfW + 12.4, -30.6, -0.04, 0x75554c],
    [-halfW - 12.8, 31.0, 0.02, 0x4c5f75],
    [halfW + 12.6, 30.7, -0.08, 0x6b7250],
    [-17.6, -halfL - 13.6, Math.PI / 2, 0x755a36],
    [17.8, -halfL - 13.7, Math.PI / 2, 0x4f6f6b],
    [-17.8, halfL + 13.7, -Math.PI / 2, 0x6e5550],
    [17.6, halfL + 13.6, -Math.PI / 2, 0x4e6570],
    [0, -halfL - 15.0, 0, 0x38635c],
    [0, halfL + 15.0, Math.PI, 0x756a4c]
  ] as Array<[number, number, number, number]>) {
    addUtilityBox(root, x, z, rotation, color);
  }

  for (const [x, z, rotation, color] of [
    [-halfW - 13.8, -20.5, Math.PI / 2, 0x426b6c],
    [-halfW - 13.7, 0.5, Math.PI / 2, 0x6b5942],
    [-halfW - 13.9, 21.0, Math.PI / 2, 0x576b43],
    [halfW + 13.8, -19.5, -Math.PI / 2, 0x62444d],
    [halfW + 13.9, 0.2, -Math.PI / 2, 0x456663],
    [halfW + 13.7, 20.8, -Math.PI / 2, 0x6d6549],
    [-9.5, -halfL - 14.7, 0, 0x495d74],
    [9.5, halfL + 14.7, Math.PI, 0x755b45]
  ] as Array<[number, number, number, number]>) {
    addNoticeBoard(root, x, z, rotation, color);
  }

  for (const [x, z, rotation] of [
    [-halfW - 14.0, -14.0, 0.1],
    [-halfW - 14.3, -3.0, -0.1],
    [-halfW - 14.0, 11.2, 0.18],
    [halfW + 14.2, -15.0, -0.05],
    [halfW + 14.0, -2.6, 0.08],
    [halfW + 14.3, 12.0, -0.16],
    [-20.8, -halfL - 15.2, 0.04],
    [-8.5, -halfL - 15.3, -0.08],
    [8.6, -halfL - 15.3, 0.12],
    [20.4, -halfL - 15.1, -0.07],
    [-20.6, halfL + 15.2, -0.04],
    [-8.8, halfL + 15.1, 0.1],
    [8.6, halfL + 15.3, -0.12],
    [20.5, halfL + 15.1, 0.08]
  ] as Array<[number, number, number]>) {
    addCrateStack(root, x, z, rotation);
  }

  for (const [x, z, rotation] of [
    [-halfW - 13.2, -34.2, 0.12],
    [-halfW - 13.4, 34.2, -0.08],
    [halfW + 13.2, -34.0, -0.1],
    [halfW + 13.4, 34.1, 0.14],
    [-29.5, -halfL - 13.2, Math.PI / 2],
    [29.5, -halfL - 13.2, Math.PI / 2],
    [-29.4, halfL + 13.2, -Math.PI / 2],
    [29.4, halfL + 13.2, -Math.PI / 2]
  ] as Array<[number, number, number]>) {
    addCafeTable(root, x, z, rotation);
  }

  for (let i = 0; i < 10; i += 1) {
    const z = -halfL - 4.4 + i * ((FIELD_LENGTH + 8.8) / 9);
    addGardenLamp(root, -halfW - 7.4, z);
    addGardenLamp(root, halfW + 7.4, z);
  }

  for (let i = 0; i < 10; i += 1) {
    const x = -halfW - 5 + i * ((FIELD_WIDTH + 10) / 9);
    addGroundDecal(root, x, -halfL - 8.8, 0.1 + i * 0.04, i % 2 === 0);
    addGroundDecal(root, x, halfL + 8.8, -0.1 - i * 0.04, i % 2 !== 0);
  }

  for (let i = 0; i < 8; i += 1) {
    addPuddle(root, -halfW - 15.8, -28 + i * 8.0, 0.72 + (i % 3) * 0.12);
    addPuddle(root, halfW + 15.8, -25 + i * 7.2, 0.62 + (i % 2) * 0.18);
  }

  syncEnvironmentInstanceDatasets();
  document.documentElement.dataset.environmentPropFamilies =
    "bollards,planters,bicycles,utility-boxes,notice-boards,crate-stacks,cafe-tables,garden-lamps,ground-decals,puddles,sideline-pennants,spectator-benches";
}

function addVisibleSidelineClusters(root: THREE.Group, halfW: number, halfL: number): void {
  for (const [x, z, rotation] of [
    [-18.5, -halfL - 2.85, 0],
    [0, -halfL - 2.95, 0],
    [18.5, -halfL - 2.85, 0],
    [-18.5, halfL + 2.85, Math.PI],
    [0, halfL + 2.95, Math.PI],
    [18.5, halfL + 2.85, Math.PI]
  ] as Array<[number, number, number]>) {
    addPennantFrame(root, x, z, rotation);
  }

  for (const [x, z, rotation, color] of [
    [-halfW - 2.95, -27.0, Math.PI / 2, 0x6d9ad4],
    [-halfW - 2.95, -15.0, Math.PI / 2, 0xe8b85c],
    [-halfW - 2.95, 15.0, Math.PI / 2, 0x7bcf8a],
    [-halfW - 2.95, 27.0, Math.PI / 2, 0xe36a5c],
    [halfW + 2.95, -27.0, -Math.PI / 2, 0xe8b85c],
    [halfW + 2.95, -15.0, -Math.PI / 2, 0x88c8ff],
    [halfW + 2.95, 15.0, -Math.PI / 2, 0xe36a5c],
    [halfW + 2.95, 27.0, -Math.PI / 2, 0x7bcf8a]
  ] as Array<[number, number, number, number]>) {
    addSpectatorBench(root, x, z, rotation, color);
  }
}

function addPennantFrame(root: THREE.Group, x: number, z: number, rotation: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.52, metalness: 0.08 });
  for (const px of [-1.65, 1.65]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.15, 8), postMaterial);
    post.position.set(px, 1.075, 0);
    post.castShadow = true;
    group.add(post);
  }
  const line = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.028, 0.028), brightMetalMaterial);
  line.position.y = 1.86;
  group.add(line);
  const flagColors = [0xffd166, 0x46c2ff, 0xef476f, 0x6ee7a8, 0xf2f7f2];
  for (let i = 0; i < 7; i += 1) {
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.3, 3),
      new THREE.MeshBasicMaterial({ color: flagColors[i % flagColors.length], toneMapped: false })
    );
    flag.position.set(-1.25 + i * 0.42, 1.69 - (i % 2) * 0.04, 0.02);
    flag.rotation.x = Math.PI;
    flag.rotation.z = Math.PI / 3;
    group.add(flag);
  }
  registerProceduralEnvironmentInstance(root, group, "sideline-pennant-frame");
}

function addSpectatorBench(root: THREE.Group, x: number, z: number, rotation: number, color: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const seatMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const frameMaterial = metalMaterial;
  for (const y of [0.42, 0.68]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 0.16), seatMaterial);
    plank.position.set(0, y, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }
  for (const px of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.12), frameMaterial);
    leg.position.set(px, 0.2, 0.03);
    leg.castShadow = true;
    group.add(leg);
  }
  const bag = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 7),
    new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.86 })
  );
  bag.position.set(0.86, 0.23, 0.18);
  bag.scale.set(1, 0.72, 0.82);
  bag.castShadow = true;
  group.add(bag);
  registerProceduralEnvironmentInstance(root, group, "spectator-bench");
}

function addBollard(root: THREE.Group, x: number, z: number, accentColor: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.62, 12), metalMaterial);
  post.position.y = 0.31;
  post.castShadow = true;
  group.add(post);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.079, 0.079, 0.08, 12),
    new THREE.MeshBasicMaterial({ color: accentColor, toneMapped: false })
  );
  stripe.position.y = 0.46;
  group.add(stripe);
  registerProceduralEnvironmentInstance(root, group, "bollard");
}

function addPlanter(
  root: THREE.Group,
  x: number,
  z: number,
  rotation: number,
  scale: number,
  flowerColor: number
): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.62), planterMaterial);
  box.position.y = 0.21;
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.035, 0.48), soilMaterial);
  soil.position.y = 0.44;
  group.add(soil);
  for (let i = 0; i < 3; i += 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.32, 5), leafMaterial);
    stem.position.set(-0.34 + i * 0.34, 0.6, (i % 2 - 0.5) * 0.18);
    stem.castShadow = true;
    group.add(stem);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: flowerColor, roughness: 0.76 })
    );
    bloom.position.set(stem.position.x, 0.78 + (i % 2) * 0.04, stem.position.z);
    bloom.castShadow = true;
    group.add(bloom);
  }
  registerProceduralEnvironmentInstance(root, group, "planter");
}

function addBicycle(root: THREE.Group, x: number, z: number, rotation: number, color: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const frameMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.18 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111514, roughness: 0.82, metalness: 0.08 });
  for (const localZ of [-0.43, 0.43]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 22), wheelMaterial);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.3, localZ);
    wheel.castShadow = true;
    group.add(wheel);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.9), frameMaterial);
  frame.position.set(0, 0.54, 0);
  frame.rotation.x = 0.18;
  frame.castShadow = true;
  group.add(frame);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.08), brightMetalMaterial);
  handle.position.set(0, 0.78, 0.45);
  handle.castShadow = true;
  group.add(handle);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.22), metalMaterial);
  seat.position.set(0, 0.74, -0.16);
  seat.castShadow = true;
  group.add(seat);
  registerProceduralEnvironmentInstance(root, group, "bicycle");
}

function addUtilityBox(root: THREE.Group, x: number, z: number, rotation: number, color: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.18, 0.56),
    new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.08 })
  );
  body.position.y = 0.59;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.035), metalMaterial);
  door.position.set(0, 0.58, -0.3);
  group.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.04), brightMetalMaterial);
  handle.position.set(0.28, 0.58, -0.34);
  group.add(handle);
  registerProceduralEnvironmentInstance(root, group, "utility-box");
}

function addNoticeBoard(root: THREE.Group, x: number, z: number, rotation: number, color: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const postMaterial = brightMetalMaterial;
  for (const px of [-0.52, 0.52]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.45, 8), postMaterial);
    post.position.set(px, 0.72, 0);
    post.castShadow = true;
    group.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.38, 0.78, 0.08),
    new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.03 })
  );
  board.position.y = 1.05;
  board.castShadow = true;
  group.add(board);
  for (let i = 0; i < 4; i += 1) {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 + (i % 2) * 0.12, 0.24, 0.012),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xf4e7c4 : 0xcbe8ef, toneMapped: false })
    );
    paper.position.set(-0.44 + i * 0.29, 1.07 + (i % 2) * 0.1, -0.052);
    group.add(paper);
  }
  registerProceduralEnvironmentInstance(root, group, "notice-board");
}

function addCrateStack(root: THREE.Group, x: number, z: number, rotation: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const colors = [0x9b6a42, 0x596f55, 0x6d5c4b];
  for (let i = 0; i < 3; i += 1) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.72 - i * 0.04, 0.36, 0.54),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.84 })
    );
    crate.position.set((i - 1) * 0.18, 0.18 + i * 0.34, (i % 2 - 0.5) * 0.14);
    crate.rotation.y = i * 0.08;
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
  }
  registerProceduralEnvironmentInstance(root, group, "crate-stack");
}

function addCafeTable(root: THREE.Group, x: number, z: number, rotation: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 18), planterMaterial);
  table.position.y = 0.62;
  table.castShadow = true;
  group.add(table);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.58, 10), brightMetalMaterial);
  stem.position.y = 0.32;
  stem.castShadow = true;
  group.add(stem);
  for (let i = 0; i < 3; i += 1) {
    const angle = i / 3 * Math.PI * 2 + 0.3;
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12), metalMaterial);
    stool.position.set(Math.cos(angle) * 0.72, 0.24, Math.sin(angle) * 0.72);
    stool.castShadow = true;
    group.add(stool);
  }
  registerProceduralEnvironmentInstance(root, group, "cafe-table");
}

function addGardenLamp(root: THREE.Group, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.15, 8), brightMetalMaterial);
  post.position.y = 0.58;
  post.castShadow = true;
  group.add(post);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), glowMaterial);
  lamp.position.y = 1.2;
  group.add(lamp);
  registerProceduralEnvironmentInstance(root, group, "garden-lamp");
}

function addGroundDecal(root: THREE.Group, x: number, z: number, rotation: number, arrow: boolean): void {
  const group = new THREE.Group();
  group.position.set(x, 0.02, z);
  group.rotation.y = rotation;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.012, 0.08), chalkMaterial);
  stripe.receiveShadow = true;
  group.add(stripe);
  if (arrow) {
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 3), chalkMaterial);
    head.rotation.x = Math.PI / 2;
    head.position.x = 0.9;
    group.add(head);
  }
  registerProceduralEnvironmentInstance(root, group, "ground-decal");
}

function addPuddle(root: THREE.Group, x: number, z: number, scale: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0.026, z);
  group.scale.set(scale, 1, scale);
  const geometry = createIrregularPuddleGeometry(`courtyard-${x.toFixed(2)}-${z.toFixed(2)}`, 48, 0.28);
  const shore = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x172f2d,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    })
  );
  shore.scale.set(1.06, 1, 1.06);
  shore.position.y = 0.001;
  const material = createWaterPuddleMaterial({
    deepColor: 0x0a3340,
    shallowColor: 0x78cde8,
    highlightColor: 0xe4ffff,
    opacity: 0.42,
    strength: 0.34
  });
  courtyardPuddleMaterials.push(material);
  const water = new THREE.Mesh(geometry, material);
  water.name = "courtyard-water-surface";
  water.position.y = 0.01;
  const edge = new THREE.LineLoop(
    createIrregularPuddleEdgeGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0xc9f4ff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    })
  );
  edge.name = "courtyard-water-edge";
  edge.position.y = 0.016;
  edge.renderOrder = 6;
  group.add(shore, water, edge);
  registerProceduralEnvironmentInstance(root, group, "puddle");
}

async function hydrateFree3dEnvironment(
  root: THREE.Group,
  resolveClientAsset: (src: string) => string,
  runtime: LocalCourtyardEnvironmentRuntime
): Promise<void> {
  try {
    document.documentElement.dataset.free3dEnvironmentMode = "loading-local-roster";
    const response = await fetch(resolveClientAsset("assets/environment/free3d/roster.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Free3D environment roster HTTP ${response.status}`);
    const roster = await response.json() as Free3dEnvironmentRoster;
    const assetsByKind = new Map(roster.assets.map((asset) => [asset.kind, asset]));
    const placements = buildFree3dEnvironmentPlacements();
    document.documentElement.dataset.free3dEnvironmentMode = roster.mode;
    document.documentElement.dataset.free3dEnvironmentAssetCount = String(roster.assets.length);
    document.documentElement.dataset.free3dEnvironmentPlanned = String(placements.length);
    document.documentElement.dataset.free3dEnvironmentSourceGuids = roster.assets.map((asset) => asset.guid).join(",");

    let failures = 0;
    for (const placement of placements) {
      const asset = assetsByKind.get(placement.kind);
      if (!asset) {
        failures += 1;
        continue;
      }
      try {
        const template = await loadFree3dEnvironmentTemplate(asset, resolveClientAsset);
        const instance = createFree3dEnvironmentInstance(template, placement, asset);
        free3dEnvironmentInstances += 1;
        runtime.addPropBody(instance, placement);
        root.add(instance);
        syncEnvironmentInstanceDatasets();
      } catch (error) {
        failures += 1;
        console.warn("Free3D environment instance failed", placement.kind, error);
      }
    }
    document.documentElement.dataset.free3dEnvironmentFailures = String(failures);
    document.documentElement.dataset.free3dEnvironmentLoaded = failures === placements.length ? "false" : "true";
    syncEnvironmentInstanceDatasets();
  } catch (error) {
    document.documentElement.dataset.free3dEnvironmentMode = "fallback-procedural-only";
    document.documentElement.dataset.free3dEnvironmentLoaded = "false";
    console.warn("Free3D environment hydration failed", error);
  }
}

function loadFree3dEnvironmentTemplate(
  asset: Free3dEnvironmentAsset,
  resolveClientAsset: (src: string) => string
): Promise<THREE.Object3D> {
  const cached = free3dEnvironmentTemplates.get(asset.src);
  if (cached) return cached;
  const promise = new Promise<THREE.Object3D>((resolve, reject) => {
    free3dEnvironmentLoader.load(
      resolveClientAsset(asset.src),
      (gltf) => {
        const scene = gltf.scene;
        scene.name = `free3d-environment-template-${asset.kind}`;
        scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          child.receiveShadow = true;
          child.geometry.computeVertexNormals();
        });
        bakeEnvironmentTemplate(scene, asset)
          .then(() => resolve(scene))
          .catch((error) => {
            free3dEnvironmentTexturelessFailures += 1;
            syncEnvironmentInstanceDatasets();
            reject(error);
          });
      },
      undefined,
      reject
    );
  });
  free3dEnvironmentTemplates.set(asset.src, promise);
  return promise;
}

async function bakeEnvironmentTemplate(scene: THREE.Object3D, asset: Free3dEnvironmentAsset): Promise<void> {
  const sourceTextureCount = countTextureMaps(scene);
  if (sourceTextureCount > 0) {
    throw new Error(`Free3D environment ${asset.guid} is not runtime textureless`);
  }
  const result: TexturelessPbrBakeResult = await bakeTexturelessPbr(scene, {
    bakeGeometryAo: true,
    aoContrast: 1.35,
    aoSamples: 8,
    yieldEveryVertices: 3072
  });
  scene.userData.texturelessPbr = result;
  scene.userData.vertexPbrOnly = true;
  scene.userData.free3dGuid = asset.guid;
  free3dEnvironmentTexturelessTemplates += 1;
  free3dEnvironmentRuntimeTextureCount += countTextureMaps(scene);
  document.documentElement.dataset.free3dEnvironmentLastBake = [
    asset.guid,
    result.vertexCount,
    result.strippedTextureCount,
    result.averageAo.toFixed(3)
  ].join(":");
  syncEnvironmentInstanceDatasets();
}

function createFree3dEnvironmentInstance(
  template: THREE.Object3D,
  placement: Free3dEnvironmentPlacement,
  asset: Free3dEnvironmentAsset
): THREE.Group {
  const source = template.clone(true);
  source.updateMatrixWorld(true);
  tempBox.setFromObject(source);
  tempBox.getSize(tempSize);
  tempBox.getCenter(tempCenter);
  const maxAxis = Math.max(tempSize.x, tempSize.y, tempSize.z, 0.001);
  const scale = placement.size / maxAxis;
  source.scale.multiplyScalar(scale);
  source.position.set(
    -tempCenter.x * scale,
    -tempBox.min.y * scale + (placement.yOffset ?? 0),
    -tempCenter.z * scale
  );
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  const group = new THREE.Group();
  group.name = `free3d-environment-${placement.kind}-${asset.guid}`;
  group.userData.environmentKind = placement.kind;
  group.userData.free3dGuid = asset.guid;
  group.userData.free3dTitle = asset.title;
  group.position.set(placement.x, 0, placement.z);
  group.rotation.y = placement.rotation;
  group.add(source);
  return group;
}

function buildFree3dEnvironmentPlacements(): Free3dEnvironmentPlacement[] {
  const placements: Free3dEnvironmentPlacement[] = [];
  const halfW = FIELD_WIDTH / 2;
  const halfL = FIELD_LENGTH / 2;

  const sideBenchZ = [-31, -23, -15, -7, 7, 15, 23, 31];
  for (let i = 0; i < sideBenchZ.length; i += 1) {
    const kind = i % 2 === 0 ? "bench-rustic" : "bench-modern";
    placements.push({ kind, x: -halfW - 5.2, z: sideBenchZ[i], rotation: Math.PI / 2, size: 2.35 });
    placements.push({ kind, x: halfW + 5.2, z: sideBenchZ[i], rotation: -Math.PI / 2, size: 2.35 });
  }

  const endBenchX = [-18, -10, -2, 6, 14, 22];
  for (let i = 0; i < endBenchX.length; i += 1) {
    const kind = i % 2 === 0 ? "bench-modern" : "bench-rustic";
    placements.push({ kind, x: endBenchX[i], z: -halfL - 5.4, rotation: 0, size: 2.25 });
    placements.push({ kind, x: -endBenchX[i], z: halfL + 5.4, rotation: Math.PI, size: 2.25 });
  }

  const binKinds = ["trash-bin", "trash-bin-modern", "trash-bin-ribbed"] as const;
  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    placements.push({
      kind: binKinds[i % binKinds.length],
      x: side * (halfW + 7.15),
      z: -halfL + 4 + i * 4.05,
      rotation: side * Math.PI / 2 + i * 0.04,
      size: 1.05
    });
  }
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    placements.push({
      kind: binKinds[(i + 1) % binKinds.length],
      x: -halfW + 4 + i * 3.1,
      z: side * (halfL + 7.2),
      rotation: side > 0 ? Math.PI : 0,
      size: 1.05
    });
  }

  for (let i = 0; i < 22; i += 1) {
    const z = -halfL - 14.9 + i * ((FIELD_LENGTH + 29.8) / 21);
    placements.push({
      kind: i % 3 === 0 ? "traffic-cone" : "traffic-cone-game",
      x: -halfW - 16.0,
      z,
      rotation: i * 0.2,
      size: i % 3 === 0 ? 0.82 : 0.72
    });
    placements.push({
      kind: i % 3 === 1 ? "traffic-cone" : "traffic-cone-game",
      x: halfW + 16.0,
      z,
      rotation: Math.PI + i * 0.18,
      size: i % 3 === 1 ? 0.82 : 0.72
    });
  }

  for (let i = 0; i < 12; i += 1) {
    const x = -halfW - 16 + i * ((FIELD_WIDTH + 32) / 11);
    placements.push({ kind: "traffic-cone-game", x, z: -halfL - 17.0, rotation: i * 0.12, size: 0.7 });
    placements.push({ kind: "traffic-cone-game", x, z: halfL + 17.0, rotation: Math.PI - i * 0.11, size: 0.7 });
  }

  for (const [x, z, rotation, size] of [
    [-halfW - 19.0, -halfL - 19.0, 0.38, 8.4],
    [halfW + 19.0, -halfL - 19.0, -0.46, 8.0],
    [-halfW - 19.0, halfL + 19.0, Math.PI - 0.35, 8.6],
    [halfW + 19.0, halfL + 19.0, Math.PI + 0.42, 8.2]
  ] as Array<[number, number, number, number]>) {
    placements.push({ kind: "urban-ruins", x, z, rotation, size });
  }

  return placements;
}
