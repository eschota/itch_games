import * as THREE from "three";
import type { HazardSnapshot, WeatherSnapshot } from "@itch-games/unsoccer-shared";
import {
  createIrregularPuddleEdgeGeometry,
  createIrregularPuddleGeometry,
  createWaterPuddleMaterial,
  updateWaterPuddleMaterial
} from "./water-puddle";

interface WeatherVisualLayerOptions {
  scene: THREE.Scene;
  fieldWidth: number;
  fieldLength: number;
}

const SNOW_PARTICLE_COUNT = 520;

function hazardColor(hazard: HazardSnapshot): number {
  if (hazard.type === "puddle") return 0x6fb7d8;
  if (hazard.type === "slush") return 0xc8ddd8;
  return 0xe7f2f5;
}

export class WeatherVisualLayer {
  private readonly group = new THREE.Group();
  private readonly snow: THREE.Points;
  private readonly snowPositions = new Float32Array(SNOW_PARTICLE_COUNT * 3);
  private readonly snowSeeds = new Float32Array(SNOW_PARTICLE_COUNT);
  private readonly hazardGroups = new Map<string, THREE.Group>();
  private readonly fieldWidth: number;
  private readonly fieldLength: number;
  private particlesEnabled = true;
  private opacityScale = 1;

  constructor(options: WeatherVisualLayerOptions) {
    this.fieldWidth = options.fieldWidth;
    this.fieldLength = options.fieldLength;
    this.group.name = "weather-layer";
    options.scene.add(this.group);

    for (let index = 0; index < SNOW_PARTICLE_COUNT; index += 1) {
      this.snowSeeds[index] = Math.random();
      this.snowPositions[index * 3] = (Math.random() - 0.5) * (this.fieldWidth + 18);
      this.snowPositions[index * 3 + 1] = 2 + Math.random() * 18;
      this.snowPositions[index * 3 + 2] = (Math.random() - 0.5) * (this.fieldLength + 24);
    }

    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute("position", new THREE.BufferAttribute(this.snowPositions, 3));
    this.snow = new THREE.Points(
      snowGeometry,
      new THREE.PointsMaterial({
        color: 0xeaf8ff,
        size: 0.075,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.snow.name = "weather-particles";
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    document.documentElement.dataset.weatherParticlesVisible = "false";
    this.group.add(this.snow);
  }

  update(weather: WeatherSnapshot | undefined, time: number): void {
    if (!weather) {
      this.group.visible = false;
      document.documentElement.dataset.weatherWaterSurfaces = "0";
      return;
    }
    this.group.visible = true;
    this.syncHazards(weather.hazards, time);
    this.updateSnow(weather, time);
  }

  setOptions(options: { particlesEnabled: boolean; opacityScale: number }): void {
    this.particlesEnabled = options.particlesEnabled;
    this.opacityScale = THREE.MathUtils.clamp(options.opacityScale, 0.25, 1);
    if (!this.particlesEnabled) this.snow.visible = false;
    document.documentElement.dataset.weatherParticlesVisible = String(this.snow.visible);
  }

  private syncHazards(hazards: HazardSnapshot[], time: number): void {
    const seen = new Set<string>();
    let waterSurfaceCount = 0;
    for (const hazard of hazards) {
      seen.add(hazard.id);
      let group = this.hazardGroups.get(hazard.id);
      if (!group) {
        group = this.createHazardGroup(hazard);
        this.hazardGroups.set(hazard.id, group);
        this.group.add(group);
      }
      group.position.set(hazard.position.x, hazard.type === "snowbank" ? 0.055 : 0.038, hazard.position.z);
      if (hazard.type === "snowbank") {
        group.scale.setScalar(hazard.radius);
      } else {
        group.scale.set(hazard.radius, 1, hazard.radius);
      }
      group.rotation.y = Math.sin(time * 0.22 + hazard.radius) * 0.05;
      group.userData.strength = hazard.strength;
      let groupHasWaterSurface = false;
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          child.renderOrder = hazard.type === "snowbank" ? 5 : 4;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) updateWaterPuddleMaterial(material, time, this.opacityScale, hazard.strength);
          if (materials.some((material) => Boolean(material.userData.puddleUniforms))) groupHasWaterSurface = true;
        }
      }
      if (groupHasWaterSurface) waterSurfaceCount += 1;
    }

    for (const [id, group] of this.hazardGroups) {
      if (!seen.has(id)) {
        this.group.remove(group);
        this.hazardGroups.delete(id);
      }
    }
    document.documentElement.dataset.weatherWaterSurfaces = String(waterSurfaceCount);
  }

  private createHazardGroup(hazard: HazardSnapshot): THREE.Group {
    const group = new THREE.Group();
    group.name = `hazard-${hazard.id}`;
    const color = hazardColor(hazard);

    if (hazard.type === "snowbank") {
      const moundMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0.02
      });
      const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x5d7788,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      });
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10), moundMaterial);
      mound.scale.set(1, 0.24 + hazard.strength * 0.16, 0.72);
      mound.position.y = 0.22;
      mound.castShadow = true;
      mound.receiveShadow = true;
      const outline = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.96, 36), shadowMaterial);
      outline.rotation.x = -Math.PI / 2;
      outline.position.y = 0.012;
      group.add(outline, mound);
      return group;
    }

    const isPuddle = hazard.type === "puddle";
    const geometry = createIrregularPuddleGeometry(hazard.id, isPuddle ? 56 : 42, isPuddle ? 0.26 : 0.18);
    const shore = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: isPuddle ? 0x173431 : 0xe8f0ee,
        transparent: true,
        opacity: isPuddle ? 0.16 : 0.2,
        depthWrite: false
      })
    );
    shore.name = `${hazard.type}-shore`;
    shore.scale.set(1.06, 1, 1.06);
    shore.position.y = 0.002;

    const water = new THREE.Mesh(
      geometry,
      createWaterPuddleMaterial({
        deepColor: isPuddle ? 0x07394a : 0xb9d6d4,
        shallowColor: isPuddle ? 0x73d5ff : 0xf4fffb,
        highlightColor: isPuddle ? 0xe7ffff : 0xffffff,
        opacity: isPuddle ? 0.46 + hazard.strength * 0.14 : 0.28 + hazard.strength * 0.08,
        strength: hazard.strength
      })
    );
    water.name = `${hazard.type}-water-surface`;
    water.position.y = 0.012;
    water.receiveShadow = false;
    const glint = new THREE.Mesh(
      geometry,
      createWaterPuddleMaterial({
        deepColor: isPuddle ? 0x0d5a65 : 0xcff0eb,
        shallowColor: isPuddle ? 0xa4ecff : 0xffffff,
        highlightColor: 0xffffff,
        opacity: isPuddle ? 0.22 + hazard.strength * 0.06 : 0.14 + hazard.strength * 0.05,
        strength: Math.min(1, hazard.strength + 0.25)
      })
    );
    glint.name = `${hazard.type}-water-glint`;
    glint.scale.set(0.72, 1, 0.46);
    glint.position.set(0.08, 0.023, -0.05);
    glint.rotation.y = 0.38;
    glint.receiveShadow = false;
    const edge = new THREE.LineLoop(
      createIrregularPuddleEdgeGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: isPuddle ? 0xbcefff : 0xf7ffff,
        transparent: true,
        opacity: isPuddle ? 0.38 : 0.24,
        depthWrite: false
      })
    );
    edge.name = `${hazard.type}-water-edge`;
    edge.position.y = 0.018;
    edge.renderOrder = 6;
    group.add(shore, water, glint, edge);
    return group;
  }

  private updateSnow(weather: WeatherSnapshot, time: number): void {
    const halfWidth = this.fieldWidth / 2 + 9;
    const halfLength = this.fieldLength / 2 + 12;
    const intensity = THREE.MathUtils.clamp(weather.intensity, 0, 1);
    const precipitation = weather.kind === "rain" || weather.kind === "snow";
    this.snow.visible = this.particlesEnabled && precipitation;
    document.documentElement.dataset.weatherParticlesVisible = String(this.snow.visible);
    if (!precipitation) return;
    const material = this.snow.material as THREE.PointsMaterial;
    material.color.setHex(weather.kind === "rain" ? 0x9fd4ff : 0xeaf8ff);
    material.opacity = (weather.kind === "rain" ? 0.12 + intensity * 0.3 : 0.18 + intensity * 0.48) * this.opacityScale;
    material.size = weather.kind === "rain" ? 0.035 + intensity * 0.035 : 0.045 + intensity * 0.06;

    for (let index = 0; index < SNOW_PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const seed = this.snowSeeds[index];
      this.snowPositions[offset] += weather.wind.x * (0.014 + seed * 0.014) + Math.sin(time * 0.8 + seed * 19) * 0.002;
      this.snowPositions[offset + 1] -= weather.kind === "rain"
        ? 0.12 + intensity * 0.16 + seed * 0.03
        : 0.035 + intensity * 0.055 + seed * 0.015;
      this.snowPositions[offset + 2] += weather.wind.z * (0.014 + seed * 0.014);

      if (this.snowPositions[offset + 1] < 0.35) {
        this.snowPositions[offset] = (seed - 0.5) * halfWidth * 2 + Math.sin(time + index) * 3;
        this.snowPositions[offset + 1] = 12 + seed * 9;
        this.snowPositions[offset + 2] = (Math.random() - 0.5) * halfLength * 2;
      }
      if (this.snowPositions[offset] > halfWidth) this.snowPositions[offset] = -halfWidth;
      if (this.snowPositions[offset] < -halfWidth) this.snowPositions[offset] = halfWidth;
      if (this.snowPositions[offset + 2] > halfLength) this.snowPositions[offset + 2] = -halfLength;
      if (this.snowPositions[offset + 2] < -halfLength) this.snowPositions[offset + 2] = halfLength;
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
}
