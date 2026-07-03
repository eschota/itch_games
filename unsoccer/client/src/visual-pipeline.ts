import * as THREE from "three";
import {
  DEFAULT_VISUAL_SETTINGS,
  type VisualColorMaterialSettings,
  type VisualFloodlightSettings,
  type VisualSettings,
  type WeatherSnapshot
} from "@itch-games/unsoccer-shared";

export interface VisualFloodlightRuntime {
  light: THREE.SpotLight;
  cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  lampMaterial: THREE.MeshBasicMaterial;
  fixtureMaterial?: THREE.MeshStandardMaterial;
  target: THREE.Object3D;
  baseColor: THREE.Color;
  flickerPhase: number;
  flickerSpeed: number;
  flickerDepth: number;
  widthScale: number;
  intensityBias: number;
  coneBaseRadius?: number;
}

export interface VisualRig {
  renderer?: THREE.WebGLRenderer;
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  ambientFill: THREE.AmbientLight;
  courtyardBounce: THREE.PointLight;
  sun: THREE.DirectionalLight;
  sunMesh: THREE.Mesh;
  sunGlow: THREE.Mesh;
  sunGlowMaterial: THREE.MeshBasicMaterial;
  moonMesh: THREE.Mesh;
  moonMaterial: THREE.MeshBasicMaterial;
  rimLight: THREE.DirectionalLight;
  skyMaterial: THREE.MeshBasicMaterial;
  skyDome: THREE.Mesh;
  floodlights: VisualFloodlightRuntime[];
  sunPath?: THREE.Line;
  sunPathMaterial?: THREE.LineBasicMaterial;
}

export interface VisualLightingMultipliers {
  sunIntensity?: number;
  moonIntensity?: number;
  ambientIntensity?: number;
  floodlightIntensity?: number;
  toneMappingExposure?: number;
}

export interface VisualLightingOptions {
  visual?: VisualSettings;
  dayTimeSeconds: number;
  elapsedSeconds: number;
  weather?: Pick<WeatherSnapshot, "kind" | "intensity"> | null;
  reduceEffects?: boolean;
  shadowsEnabled?: boolean;
  multipliers?: VisualLightingMultipliers;
  dataset?: DOMStringMap;
}

export interface VisualLightingResult {
  daylight: number;
  nightAmount: number;
  sunset: number;
  solarCycle: number;
  activeFloodlights: number;
  visibleCones: number;
  floodlightPower: number;
  strongestFlickerDip: number;
  sunVisible: boolean;
  moonVisible: boolean;
}

export interface CreateVisualRigOptions {
  renderer?: THREE.WebGLRenderer;
  camera?: THREE.Camera;
  visual?: VisualSettings;
  includeSunPath?: boolean;
}

const DAY_SECONDS = 24 * 60 * 60;
const DAWN_START_SECONDS = 3 * 60 * 60;
const DAYLIGHT_START_SECONDS = 5 * 60 * 60;
const DUSK_START_SECONDS = 21 * 60 * 60;
const NIGHT_START_SECONDS = 23 * 60 * 60;

const colorSun = new THREE.Color();
const colorSky = new THREE.Color();
const colorFog = new THREE.Color();
const colorBounce = new THREE.Color();
const colorFloodlight = new THREE.Color();
const colorFloodlightDark = new THREE.Color(0x6e8090);
const colorDay = new THREE.Color();
const colorSunset = new THREE.Color();
const colorNight = new THREE.Color();
const colorFogDay = new THREE.Color();
const colorFogNight = new THREE.Color();
const colorSnowFog = new THREE.Color();
const floodlightUp = new THREE.Vector3(0, 1, 0);
const floodlightDirection = new THREE.Vector3();
const floodlightMidpoint = new THREE.Vector3();

export function cloneVisualSettings(visual: VisualSettings = DEFAULT_VISUAL_SETTINGS): VisualSettings {
  return JSON.parse(JSON.stringify(visual)) as VisualSettings;
}

export function configureVisualRenderer(renderer: THREE.WebGLRenderer, visual: VisualSettings = DEFAULT_VISUAL_SETTINGS): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = visual.renderer.exposureBase;
  renderer.shadowMap.enabled = visual.renderer.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export function applyLookdevMaterial(material: THREE.Material, settings: VisualColorMaterialSettings): void {
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

export function createLookdevStandardMaterial(settings: VisualColorMaterialSettings): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: settings.color,
    roughness: settings.roughness ?? 0.7,
    metalness: settings.metalness ?? 0,
    opacity: settings.opacity ?? 1,
    transparent: settings.opacity !== undefined && settings.opacity < 1
  });
}

export function visualFloodlightAt(visual: VisualSettings, index: number): VisualFloodlightSettings {
  const lights = visual.floodlights.lights.length > 0 ? visual.floodlights.lights : DEFAULT_VISUAL_SETTINGS.floodlights.lights;
  return lights[index % lights.length];
}

export function orientVisualFloodlightCone(
  cone: THREE.Mesh,
  lampPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  radialScale = 1
): void {
  floodlightDirection.copy(lampPosition).sub(targetPosition);
  const length = Math.max(1, floodlightDirection.length());
  floodlightDirection.normalize();
  floodlightMidpoint.copy(lampPosition).add(targetPosition).multiplyScalar(0.5);
  cone.position.copy(floodlightMidpoint);
  cone.scale.set(radialScale, length, radialScale);
  cone.quaternion.setFromUnitVectors(floodlightUp, floodlightDirection);
}

export function createVisualRig(scene: THREE.Scene, options: CreateVisualRigOptions = {}): VisualRig {
  const visual = options.visual ?? DEFAULT_VISUAL_SETTINGS;
  const hemi = new THREE.HemisphereLight(visual.ambient.hemiSkyColor, visual.ambient.hemiGroundColor, 1.5);
  scene.add(hemi);
  const ambientFill = new THREE.AmbientLight(visual.sky.fogDayColor, 0.16);
  scene.add(ambientFill);
  const courtyardBounce = new THREE.PointLight(visual.ambient.bounceColor, 0.68, 42, 1.8);
  courtyardBounce.position.set(0, 4.6, 0);
  scene.add(courtyardBounce);
  const sun = new THREE.DirectionalLight(visual.sky.dayColor, 1.8);
  sun.position.set(-12, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 78;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  scene.add(sun, sun.target);

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 24, 16),
    new THREE.MeshBasicMaterial({ color: visual.sky.dayColor, depthTest: true, depthWrite: false, toneMapped: false })
  );
  const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: visual.sky.sunsetColor,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(2.85, 32, 16), sunGlowMaterial);
  const moonMaterial = new THREE.MeshBasicMaterial({
    color: visual.moon.color,
    transparent: true,
    opacity: 0.82,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 20, 12), moonMaterial);
  const sceneItems: THREE.Object3D[] = [sunGlow, sunMesh, moonMesh];
  if (options.camera) sceneItems.unshift(options.camera);
  scene.add(...sceneItems);

  let sunPath: THREE.Line | undefined;
  let sunPathMaterial: THREE.LineBasicMaterial | undefined;
  if (options.includeSunPath) {
    sunPathMaterial = new THREE.LineBasicMaterial({ color: visual.sky.sunsetColor, transparent: true, opacity: 0.26 });
    sunPath = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 96 }, (_, index) => {
          const angle = index / 96 * Math.PI * 2 - Math.PI * 0.22;
          return new THREE.Vector3(Math.cos(angle) * 40.8, Math.sin(angle) * 40.8, Math.sin(angle + 0.55) * 30.6);
        })
      ),
      sunPathMaterial
    );
    sunPath.visible = false;
    scene.add(sunPath);
  }

  const rimLight = new THREE.DirectionalLight(visual.ambient.rimColor, 0.55);
  rimLight.position.set(18, 10, -18);
  scene.add(rimLight);

  const skyMaterial = new THREE.MeshBasicMaterial({
    color: visual.sky.nightColor,
    side: THREE.BackSide,
    fog: false
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(124, 32, 18), skyMaterial);
  skyDome.position.y = 4;
  scene.add(skyDome);

  const floodlights: VisualFloodlightRuntime[] = [];
  const coneGeometry = new THREE.CylinderGeometry(0.24, DEFAULT_VISUAL_SETTINGS.floodlights.lights[0].coneRadius, 1, 36, 1, true);
  for (let index = 0; index < visual.floodlights.lights.length; index += 1) {
    const config = visualFloodlightAt(visual, index);
    const target = new THREE.Object3D();
    target.position.set(config.targetX, config.targetY, config.targetZ);
    const baseColor = new THREE.Color(config.color);
    const flood = new THREE.SpotLight(baseColor, 0, config.distance, THREE.MathUtils.degToRad(config.angleDeg), config.penumbra, config.decay);
    flood.position.set(config.x, config.y, config.z);
    flood.target = target;
    flood.castShadow = true;
    flood.shadow.mapSize.set(768, 768);
    flood.shadow.camera.near = 2;
    flood.shadow.camera.far = Math.max(4, config.distance - 10);
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
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.name = "night-floodlight-volume";
    orientVisualFloodlightCone(cone, flood.position, target.position, config.coneRadius / DEFAULT_VISUAL_SETTINGS.floodlights.lights[0].coneRadius);
    cone.visible = false;
    scene.add(flood, target, cone);
    floodlights.push({
      light: flood,
      cone,
      lampMaterial,
      fixtureMaterial,
      target,
      baseColor,
      flickerPhase: index * 1.73 + 0.41,
      flickerSpeed: config.flickerSpeed,
      flickerDepth: config.flickerDepth,
      widthScale: config.widthScale,
      intensityBias: config.intensityBias,
      coneBaseRadius: DEFAULT_VISUAL_SETTINGS.floodlights.lights[0].coneRadius
    });
  }

  return {
    renderer: options.renderer,
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
    floodlights,
    sunPath,
    sunPathMaterial
  };
}

export function applyVisualLighting(rig: VisualRig, options: VisualLightingOptions): VisualLightingResult {
  const visual = options.visual ?? DEFAULT_VISUAL_SETTINGS;
  const multipliers = options.multipliers ?? {};
  const sunMultiplier = multipliers.sunIntensity ?? 1;
  const moonMultiplier = multipliers.moonIntensity ?? 1;
  const ambientMultiplier = multipliers.ambientIntensity ?? 1;
  const floodlightMultiplier = multipliers.floodlightIntensity ?? 1;
  const exposureMultiplier = multipliers.toneMappingExposure ?? 1;
  const dayTime = THREE.MathUtils.euclideanModulo(options.dayTimeSeconds, DAY_SECONDS);
  const solarCycle = dayTime / DAY_SECONDS;
  const angle = (solarCycle - 0.25) * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const sunrise = THREE.MathUtils.smoothstep(dayTime, DAWN_START_SECONDS, DAYLIGHT_START_SECONDS);
  const sunsetFade = 1 - THREE.MathUtils.smoothstep(dayTime, DUSK_START_SECONDS, NIGHT_START_SECONDS);
  const daylight = Math.max(0, Math.min(sunrise, sunsetFade));
  const nightAmount = 1 - daylight;
  const floodlightPower = THREE.MathUtils.smoothstep(nightAmount, visual.floodlights.powerNightStart, visual.floodlights.powerNightEnd);
  const sunset = Math.max(0, 1 - Math.abs(sunHeight) * 5.2) * (1 - Math.abs(daylight - 0.5));
  const weather = options.weather;
  const precipitationIntensity = weather?.kind === "rain" || weather?.kind === "snow" ? weather.intensity : 0;
  const snowIntensity = weather?.kind === "snow" ? weather.intensity : 0;

  colorDay.set(visual.sky.dayColor);
  colorSunset.set(visual.sky.sunsetColor);
  colorNight.set(visual.sky.nightColor);
  colorFogDay.set(visual.sky.fogDayColor);
  colorFogNight.set(visual.sky.fogNightColor);
  colorSnowFog.set(visual.sky.snowFogColor);

  rig.sun.position.set(
    Math.cos(angle) * visual.sun.orbitRadius,
    Math.max(1.2, sunHeight * visual.sun.orbitRadius),
    Math.sin(angle + 0.42) * (visual.sun.orbitRadius * 0.61)
  );
  rig.sun.target.position.set(0, 0, 0);
  rig.sunMesh.position.set(
    Math.cos(angle) * visual.sun.visualOrbitRadius,
    visual.sun.visualHeight + sunHeight * (visual.sun.visualOrbitRadius * 0.6),
    Math.sin(angle + 0.42) * (visual.sun.visualOrbitRadius * 0.6)
  );
  rig.sunGlow.position.copy(rig.sunMesh.position);
  const moonAngle = angle + Math.PI;
  rig.moonMesh.position.set(
    Math.cos(moonAngle) * visual.sun.visualOrbitRadius,
    visual.sun.visualHeight + Math.sin(moonAngle) * (visual.sun.visualOrbitRadius * 0.6),
    Math.sin(moonAngle + 0.42) * (visual.sun.visualOrbitRadius * 0.6)
  );

  colorSun.copy(colorDay).lerp(colorSunset, sunset).lerp(colorNight, 1 - daylight);
  colorSky.copy(colorNight).lerp(colorDay, daylight).lerp(colorSunset, sunset * 0.36);
  colorFog.copy(colorFogNight).lerp(colorFogDay, daylight).lerp(colorSunset, sunset * 0.18).lerp(colorSnowFog, snowIntensity * visual.weather.snowFogBoost);

  rig.sun.color.copy(colorSun);
  rig.sun.intensity = Math.max(
    0,
    visual.sun.intensityBase +
      daylight * visual.sun.intensityDay +
      sunset * visual.sun.intensitySunset -
      precipitationIntensity * visual.sun.precipitationPenalty
  ) * sunMultiplier;
  rig.hemi.color.set(visual.ambient.hemiSkyColor);
  rig.hemi.groundColor.set(visual.ambient.hemiGroundColor);
  rig.hemi.intensity = Math.max(
    0,
    visual.ambient.hemiBase + daylight * visual.ambient.hemiDay - precipitationIntensity * visual.ambient.hemiPrecipitationPenalty
  ) * ambientMultiplier;
  rig.ambientFill.color.copy(colorFog);
  rig.ambientFill.intensity = (
    visual.ambient.fillBase +
    daylight * visual.ambient.fillDay +
    (1 - daylight) * visual.ambient.fillNight +
    snowIntensity * visual.ambient.fillSnow
  ) * ambientMultiplier;
  colorBounce.set(visual.ambient.bounceColor).lerp(colorSunset, sunset * 0.32).lerp(colorNight, (1 - daylight) * 0.22);
  rig.courtyardBounce.color.copy(colorBounce);
  rig.courtyardBounce.intensity = (
    visual.ambient.bounceBase +
    daylight * visual.ambient.bounceDay +
    sunset * visual.ambient.bounceSunset +
    (1 - daylight) * visual.ambient.bounceNight
  ) * ambientMultiplier;
  rig.rimLight.color.set(visual.ambient.rimColor).lerp(colorFog, 0.45);
  rig.rimLight.intensity = (visual.ambient.rimBase + (1 - daylight) * visual.ambient.rimNight + sunset * visual.ambient.rimSunset) * ambientMultiplier;

  let activeFloodlights = 0;
  let visibleCones = 0;
  let strongestFlickerDip = 0;
  const effectiveFloodlightPower = floodlightPower * floodlightMultiplier;
  for (let index = 0; index < rig.floodlights.length; index += 1) {
    const entry = rig.floodlights[index];
    const config = visualFloodlightAt(visual, index);
    entry.target.position.set(config.targetX, config.targetY, config.targetZ);
    entry.light.position.set(config.x, config.y, config.z);
    entry.light.distance = config.distance;
    entry.light.angle = THREE.MathUtils.degToRad(config.angleDeg);
    entry.light.penumbra = config.penumbra;
    entry.light.decay = config.decay;
    entry.light.shadow.camera.far = Math.max(4, config.distance - 10);
    entry.baseColor.set(config.color);
    entry.flickerSpeed = config.flickerSpeed;
    entry.flickerDepth = config.flickerDepth;
    entry.widthScale = config.widthScale;
    entry.intensityBias = config.intensityBias;
    const coneBaseRadius = entry.coneBaseRadius ?? DEFAULT_VISUAL_SETTINGS.floodlights.lights[0].coneRadius;
    orientVisualFloodlightCone(entry.cone, entry.light.position, entry.target.position, config.coneRadius / coneBaseRadius * config.widthScale);

    const lightEnabled = effectiveFloodlightPower > visual.floodlights.lightThreshold;
    const coneEnabled = effectiveFloodlightPower > visual.floodlights.coneThreshold && !options.reduceEffects;
    const flickerWave = Math.sin(options.elapsedSeconds * entry.flickerSpeed + entry.flickerPhase);
    const rareFlickerGate = THREE.MathUtils.smoothstep(Math.sin(options.elapsedSeconds * 0.31 + entry.flickerPhase * 0.7), 0.82, 0.98);
    const microWaver = 0.985 + Math.sin(options.elapsedSeconds * (1.2 + index * 0.17) + entry.flickerPhase) * 0.015;
    const flickerDip = lightEnabled ? rareFlickerGate * entry.flickerDepth * (0.55 + Math.max(0, flickerWave) * 0.45) : 0;
    const flicker = THREE.MathUtils.clamp(microWaver - flickerDip, 0.76, 1.04);
    strongestFlickerDip = Math.max(strongestFlickerDip, flickerDip);
    colorFloodlight.copy(entry.baseColor).lerp(colorDay, daylight * 0.1);
    entry.light.visible = lightEnabled;
    entry.light.intensity = lightEnabled
      ? effectiveFloodlightPower *
        (visual.floodlights.intensityBase + precipitationIntensity * visual.floodlights.precipitationBoost) *
        entry.intensityBias *
        flicker
      : 0;
    entry.light.color.copy(colorFloodlight);
    entry.lampMaterial.color.copy(lightEnabled ? colorFloodlight : colorFloodlightDark);
    entry.lampMaterial.opacity = 0.58 + effectiveFloodlightPower * 0.42;
    entry.cone.visible = coneEnabled;
    entry.cone.material.color.copy(colorFloodlight);
    entry.cone.material.opacity = coneEnabled
      ? effectiveFloodlightPower * (config.coneOpacity + precipitationIntensity * visual.weather.conePrecipitationBoost) * flicker
      : 0;
    if (entry.fixtureMaterial) applyLookdevMaterial(entry.fixtureMaterial, visual.materials.mast);
    if (lightEnabled) activeFloodlights += 1;
    if (coneEnabled) visibleCones += 1;
  }

  if (rig.renderer) {
    rig.renderer.toneMappingExposure = Math.max(
      0.05,
      visual.renderer.exposureBase +
        daylight * visual.renderer.exposureDay +
        sunset * visual.renderer.exposureSunset -
        precipitationIntensity * visual.renderer.precipitationExposurePenalty
    ) * exposureMultiplier;
    rig.renderer.shadowMap.enabled = Boolean(options.shadowsEnabled ?? true) && visual.renderer.shadows;
  }
  rig.sun.castShadow = Boolean(options.shadowsEnabled ?? true) && visual.renderer.shadows;
  for (const entry of rig.floodlights) entry.light.castShadow = Boolean(options.shadowsEnabled ?? true) && visual.renderer.shadows;

  rig.scene.background = colorSky;
  rig.skyMaterial.color.copy(colorSky).lerp(colorFog, visual.sky.domeFogMix);
  if (rig.scene.fog instanceof THREE.Fog) {
    rig.scene.fog.color.copy(colorFog);
    rig.scene.fog.near = Math.max(0, visual.sky.fogNearBase + daylight * visual.sky.fogNearDay);
    rig.scene.fog.far = Math.max(rig.scene.fog.near + 1, visual.sky.fogFarBase + daylight * visual.sky.fogFarDay - snowIntensity * visual.sky.fogSnowPenalty);
  }

  const sunMaterial = rig.sunMesh.material as THREE.MeshBasicMaterial;
  sunMaterial.color.copy(colorSun);
  rig.sunMesh.scale.setScalar(visual.sun.markerScaleBase + daylight * visual.sun.markerScaleDay + sunset * visual.sun.markerScaleSunset);
  rig.sunMesh.visible = daylight > 0.05 || sunset > 0.03;
  rig.sunGlow.visible = rig.sunMesh.visible;
  rig.sunGlowMaterial.color.copy(colorSun);
  rig.sunGlowMaterial.opacity = (
    visual.sun.glowOpacityBase + daylight * visual.sun.glowOpacityDay + sunset * visual.sun.glowOpacitySunset
  ) * sunMultiplier * (rig.sunMesh.visible ? 1 : 0);
  rig.moonMesh.visible = daylight < 0.7;
  rig.moonMaterial.color.set(visual.moon.color);
  rig.moonMaterial.opacity = THREE.MathUtils.clamp(((1 - daylight) * visual.moon.opacityNight + visual.moon.opacityBase) * moonMultiplier, 0, 1);
  if (rig.sunPath && rig.sunPathMaterial) {
    rig.sunPathMaterial.opacity = 0;
    rig.sunPath.visible = false;
  }

  const dataset = options.dataset;
  if (dataset) {
    dataset.visualPipeline = "shared-viz-v1";
    dataset.stadiumLights = String(rig.floodlights.length);
    dataset.stadiumLightBeamAngle = visualFloodlightAt(visual, 0).angleDeg.toFixed(1);
    dataset.stadiumLightBeamRadius = visualFloodlightAt(visual, 0).coneRadius.toFixed(1);
    dataset.stadiumLightPalette = visual.floodlights.lights.map((light) => light.color).join(",");
    dataset.daylight = daylight.toFixed(3);
    dataset.stadiumLightPower = effectiveFloodlightPower.toFixed(3);
    dataset.stadiumLightsOn = String(activeFloodlights);
    dataset.stadiumLightCones = String(visibleCones);
    dataset.stadiumLightFlicker = strongestFlickerDip.toFixed(3);
    dataset.nightLighting = activeFloodlights > 0 ? "floodlight-masts-volumetric" : "sunlight";
    dataset.sunPathVisible = String(rig.sunPath?.visible ?? false);
    dataset.sunVisible = String(rig.sunMesh.visible);
    dataset.moonVisible = String(rig.moonMesh.visible);
    dataset.ambientFill = rig.ambientFill.intensity.toFixed(3);
    dataset.courtyardBounce = rig.courtyardBounce.intensity.toFixed(3);
    dataset.sunIntensityMultiplier = sunMultiplier.toFixed(3);
    dataset.moonIntensityMultiplier = moonMultiplier.toFixed(3);
    dataset.ambientIntensityMultiplier = ambientMultiplier.toFixed(3);
    dataset.floodlightIntensityMultiplier = floodlightMultiplier.toFixed(3);
    dataset.toneMappingExposureMultiplier = exposureMultiplier.toFixed(3);
    dataset.sunX = rig.sun.position.x.toFixed(2);
    dataset.sunY = rig.sun.position.y.toFixed(2);
    dataset.sunZ = rig.sun.position.z.toFixed(2);
  }

  return {
    daylight,
    nightAmount,
    sunset,
    solarCycle,
    activeFloodlights,
    visibleCones,
    floodlightPower,
    strongestFlickerDip,
    sunVisible: rig.sunMesh.visible,
    moonVisible: rig.moonMesh.visible
  };
}
