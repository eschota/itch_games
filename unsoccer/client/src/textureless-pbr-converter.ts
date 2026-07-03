import * as THREE from "three";

export interface TexturelessPbrBakeResult {
  converted: boolean;
  meshCount: number;
  vertexCount: number;
  materialCount: number;
  strippedTextureCount: number;
  averageAo: number;
  averageGeometryAo: number;
  averageRoughness: number;
  averageMetalness: number;
  geometricAoBaked: boolean;
  aoContrast: number;
  aoSamples: number;
  aoRadius: number;
  occluderTriangleCount: number;
  colorAttribute: "rgba-ao";
  pbrAttribute: "uv1-roughness-metalness";
}

export interface TexturelessPbrBakeOptions {
  bakeGeometryAo?: boolean;
  aoContrast?: number;
  aoSamples?: number;
  aoRadius?: number;
  yieldEveryVertices?: number;
}

interface Sample {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface TextureSampler {
  readonly texture: THREE.Texture;
  readonly width: number;
  readonly height: number;
  sample: (uv: THREE.Vector2, out: Sample) => Sample;
}

interface MaterialBakeSource {
  readonly material: THREE.Material | null;
  readonly color: THREE.Color;
  readonly map: TextureSampler | null;
  readonly ormMap: TextureSampler | null;
  readonly aoMap: TextureSampler | null;
  readonly roughnessMap: TextureSampler | null;
  readonly metalnessMap: TextureSampler | null;
  readonly roughness: number;
  readonly metalness: number;
}

interface MaterialBakeStats {
  ao: number;
  geometryAo: number;
  roughness: number;
  metalness: number;
  count: number;
}

interface OcclusionTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  centroid: THREE.Vector3;
}

interface OcclusionBvhNode {
  min: THREE.Vector3;
  max: THREE.Vector3;
  triangles?: OcclusionTriangle[];
  left?: OcclusionBvhNode;
  right?: OcclusionBvhNode;
}

interface OcclusionBaker {
  tree: OcclusionBvhNode | null;
  triangleCount: number;
  radius: number;
  bias: number;
  minHitDistance: number;
  samples: number;
  contrast: number;
}

const sampleUv = new THREE.Vector2();
const scratchSample = { r: 1, g: 1, b: 1, a: 1 };
const pbrScratchSample = { r: 1, g: 1, b: 1, a: 1 };
const samplerCache = new WeakMap<THREE.Texture, TextureSampler | null>();
const MAX_TESSELLATION_SOURCE_VERTICES = 60000;
const MAX_TESSELLATED_VERTICES = 180000;
const BAKE_TEXEL_STEP = 96;
const MAX_TRIANGLE_SUBDIVISIONS = 4;
const LOW_DETAIL_PROP_VERTEX_THRESHOLD = 12000;
const LOW_DETAIL_PROP_MIN_SUBDIVISIONS = 3;
const DEFAULT_AO_SAMPLES = 16;
const MAX_AO_SAMPLES = 32;
const AO_LEAF_TRIANGLES = 12;
const AO_MAX_BVH_DEPTH = 28;
const AO_EPSILON = 1e-5;
const AO_OCCLUSION_STRENGTH = 0.72;

const worldVertexA = new THREE.Vector3();
const worldVertexB = new THREE.Vector3();
const worldVertexC = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const worldNormalMatrix = new THREE.Matrix3();
const aoOrigin = new THREE.Vector3();
const aoDirection = new THREE.Vector3();
const aoTangent = new THREE.Vector3();
const aoBitangent = new THREE.Vector3();
const aoUp = new THREE.Vector3(0, 1, 0);
const aoRight = new THREE.Vector3(1, 0, 0);
const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const pvec = new THREE.Vector3();
const tvec = new THREE.Vector3();
const qvec = new THREE.Vector3();

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function contrastAo(value: number, contrast: number): number {
  return clamp01(Math.pow(clamp01(value), Math.max(0.05, contrast)));
}

function radicalInverseVdc(bits: number): number {
  bits = (bits << 16) | (bits >>> 16);
  bits = ((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1);
  bits = ((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2);
  bits = ((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4);
  bits = ((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8);
  return (bits >>> 0) * 2.3283064365386963e-10;
}

function hashUnit(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function readPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, out: Sample): Sample {
  const offset = (y * width + x) * 4;
  out.r = pixels[offset] / 255;
  out.g = pixels[offset + 1] / 255;
  out.b = pixels[offset + 2] / 255;
  out.a = pixels[offset + 3] / 255;
  return out;
}

function textureSource(texture: THREE.Texture): CanvasImageSource | null {
  const source = texture.source?.data || texture.image;
  if (!source) return null;
  const candidate = source as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const width = candidate.width || candidate.naturalWidth || 0;
  const height = candidate.height || candidate.naturalHeight || 0;
  return width > 0 && height > 0 ? candidate : null;
}

function createSampler(texture: THREE.Texture | null | undefined): TextureSampler | null {
  if (!texture) return null;
  if (samplerCache.has(texture)) return samplerCache.get(texture) || null;
  const source = textureSource(texture);
  if (!source) {
    samplerCache.set(texture, null);
    return null;
  }
  const width = Math.max(1, Math.floor((source as { width?: number; naturalWidth?: number }).width || (source as { naturalWidth?: number }).naturalWidth || 1));
  const height = Math.max(1, Math.floor((source as { height?: number; naturalHeight?: number }).height || (source as { naturalHeight?: number }).naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    samplerCache.set(texture, null);
    return null;
  }
  try {
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const sampler: TextureSampler = {
      texture,
      width,
      height,
      sample: (uv, out) => {
        sampleUv.copy(uv);
        texture.updateMatrix();
        texture.transformUv(sampleUv);
        const x = clamp01(sampleUv.x) * (width - 1);
        const y = clamp01(sampleUv.y) * (height - 1);
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(width - 1, x0 + 1);
        const y1 = Math.min(height - 1, y0 + 1);
        const tx = x - x0;
        const ty = y - y0;
        const p00 = readPixel(pixels, width, x0, y0, { r: 0, g: 0, b: 0, a: 1 });
        const p10 = readPixel(pixels, width, x1, y0, { r: 0, g: 0, b: 0, a: 1 });
        const p01 = readPixel(pixels, width, x0, y1, { r: 0, g: 0, b: 0, a: 1 });
        const p11 = readPixel(pixels, width, x1, y1, { r: 0, g: 0, b: 0, a: 1 });
        const topR = THREE.MathUtils.lerp(p00.r, p10.r, tx);
        const topG = THREE.MathUtils.lerp(p00.g, p10.g, tx);
        const topB = THREE.MathUtils.lerp(p00.b, p10.b, tx);
        const topA = THREE.MathUtils.lerp(p00.a, p10.a, tx);
        const bottomR = THREE.MathUtils.lerp(p01.r, p11.r, tx);
        const bottomG = THREE.MathUtils.lerp(p01.g, p11.g, tx);
        const bottomB = THREE.MathUtils.lerp(p01.b, p11.b, tx);
        const bottomA = THREE.MathUtils.lerp(p01.a, p11.a, tx);
        out.r = THREE.MathUtils.lerp(topR, bottomR, ty);
        out.g = THREE.MathUtils.lerp(topG, bottomG, ty);
        out.b = THREE.MathUtils.lerp(topB, bottomB, ty);
        out.a = THREE.MathUtils.lerp(topA, bottomA, ty);
        return out;
      }
    };
    samplerCache.set(texture, sampler);
    return sampler;
  } catch (error) {
    console.warn("Textureless PBR sampler could not read texture pixels", error);
    samplerCache.set(texture, null);
    return null;
  }
}

function materialTexture(material: THREE.Material | null, key: keyof THREE.MeshStandardMaterial): THREE.Texture | null {
  const value = material ? (material as unknown as Record<string, unknown>)[key] : null;
  return value instanceof THREE.Texture ? value : null;
}

function materialColor(material: THREE.Material | null): THREE.Color {
  const value = material ? (material as unknown as { color?: unknown }).color : null;
  return value instanceof THREE.Color ? value.clone() : new THREE.Color(0.78, 0.82, 0.76);
}

function materialNumber(material: THREE.Material | null, key: "roughness" | "metalness", fallback: number): number {
  const value = material ? (material as unknown as Record<string, unknown>)[key] : null;
  return typeof value === "number" ? clamp01(value) : fallback;
}

function createMaterialSource(material: THREE.Material | null): MaterialBakeSource {
  const roughnessMap = materialTexture(material, "roughnessMap");
  const metalnessMap = materialTexture(material, "metalnessMap");
  const aoMap = materialTexture(material, "aoMap");
  const ormTexture = roughnessMap && roughnessMap === metalnessMap ? roughnessMap : null;
  return {
    material,
    color: materialColor(material),
    map: createSampler(materialTexture(material, "map")),
    ormMap: createSampler(ormTexture),
    aoMap: createSampler(aoMap),
    roughnessMap: createSampler(roughnessMap),
    metalnessMap: createSampler(metalnessMap),
    roughness: materialNumber(material, "roughness", 0.78),
    metalness: materialNumber(material, "metalness", 0.04)
  };
}

function collectTextures(material: THREE.Material | THREE.Material[] | null | undefined, target: Set<THREE.Texture>): void {
  const materials = Array.isArray(material) ? material : [material || null];
  for (const entry of materials) {
    if (!entry) continue;
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap"] as Array<keyof THREE.MeshStandardMaterial>) {
      const texture = materialTexture(entry, key);
      if (texture) target.add(texture);
    }
  }
}

export function applyTexturelessPbrShader(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "#ifndef USE_UV1",
          "attribute vec2 uv1;",
          "#endif",
          "varying vec2 vTexturelessPackedPbr;"
        ].join("\n")
      )
      .replace(
        "#include <begin_vertex>",
        [
          "#include <begin_vertex>",
          "vTexturelessPackedPbr = uv1;"
        ].join("\n")
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "varying vec2 vTexturelessPackedPbr;"
        ].join("\n")
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(vTexturelessPackedPbr.x, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = clamp(vTexturelessPackedPbr.y, 0.0, 1.0);")
      .replace(
        "#include <aomap_fragment>",
        [
          "#include <aomap_fragment>",
          "#if defined( USE_COLOR_ALPHA )",
          "float texturelessVertexAo = clamp(vColor.a, 0.0, 1.0);",
          "reflectedLight.indirectDiffuse *= texturelessVertexAo;",
          "reflectedLight.indirectSpecular *= mix(texturelessVertexAo, 1.0, 0.35);",
          "#endif"
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => "unsoccer-textureless-pbr-packed-v2-vertex-ao";
}

function createTexturelessMaterial(source: THREE.Material | null, stats: MaterialBakeStats): THREE.MeshStandardMaterial {
  const material = source instanceof THREE.MeshStandardMaterial
    ? source.clone()
    : new THREE.MeshStandardMaterial();
  material.name = `${source?.name || "material"}_textureless_pbr`;
  material.color.set(0xffffff);
  material.map = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.aoMap = null;
  material.emissiveMap = null;
  material.alphaMap = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.lightMap = null;
  material.envMap = null;
  material.vertexColors = true;
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.roughness = stats.count > 0 ? clamp01(stats.roughness / stats.count) : 0.78;
  material.metalness = stats.count > 0 ? clamp01(stats.metalness / stats.count) : 0.04;
  material.userData.texturelessPbr = {
    colorAttribute: "COLOR_0.rgba",
    alpha: "ambient-occlusion",
    geometryAo: stats.count > 0 ? clamp01(stats.geometryAo / stats.count) : 1,
    uv1: "roughness-metalness"
  };
  applyTexturelessPbrShader(material);
  material.needsUpdate = true;
  return material;
}

function pushOcclusionTriangle(
  triangles: OcclusionTriangle[],
  mesh: THREE.Mesh,
  geometry: THREE.BufferGeometry,
  indexA: number,
  indexB: number,
  indexC: number
): void {
  const position = geometry.attributes.position;
  worldVertexA.set(position.getX(indexA), position.getY(indexA), position.getZ(indexA)).applyMatrix4(mesh.matrixWorld);
  worldVertexB.set(position.getX(indexB), position.getY(indexB), position.getZ(indexB)).applyMatrix4(mesh.matrixWorld);
  worldVertexC.set(position.getX(indexC), position.getY(indexC), position.getZ(indexC)).applyMatrix4(mesh.matrixWorld);
  const area = edge1.subVectors(worldVertexB, worldVertexA).cross(edge2.subVectors(worldVertexC, worldVertexA)).lengthSq();
  if (area < AO_EPSILON) return;
  const a = worldVertexA.clone();
  const b = worldVertexB.clone();
  const c = worldVertexC.clone();
  const min = new THREE.Vector3(
    Math.min(a.x, b.x, c.x),
    Math.min(a.y, b.y, c.y),
    Math.min(a.z, b.z, c.z)
  );
  const max = new THREE.Vector3(
    Math.max(a.x, b.x, c.x),
    Math.max(a.y, b.y, c.y),
    Math.max(a.z, b.z, c.z)
  );
  const centroid = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
  triangles.push({ a, b, c, min, max, centroid });
}

function collectOcclusionTriangles(root: THREE.Object3D): OcclusionTriangle[] {
  const triangles: OcclusionTriangle[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) return;
    const geometry = child.geometry;
    const position = geometry.attributes.position;
    if (!position) return;
    const index = geometry.index;
    if (index) {
      for (let offset = 0; offset + 2 < index.count; offset += 3) {
        pushOcclusionTriangle(
          triangles,
          child,
          geometry,
          index.getX(offset),
          index.getX(offset + 1),
          index.getX(offset + 2)
        );
      }
      return;
    }
    for (let offset = 0; offset + 2 < position.count; offset += 3) {
      pushOcclusionTriangle(triangles, child, geometry, offset, offset + 1, offset + 2);
    }
  });
  return triangles;
}

function triangleBounds(triangles: OcclusionTriangle[], start: number, end: number): { min: THREE.Vector3; max: THREE.Vector3 } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let index = start; index < end; index += 1) {
    const triangle = triangles[index];
    min.min(triangle.min);
    max.max(triangle.max);
  }
  return { min, max };
}

function buildOcclusionBvh(triangles: OcclusionTriangle[], depth = 0): OcclusionBvhNode | null {
  if (triangles.length === 0) return null;
  const bounds = triangleBounds(triangles, 0, triangles.length);
  if (triangles.length <= AO_LEAF_TRIANGLES || depth >= AO_MAX_BVH_DEPTH) {
    return { min: bounds.min, max: bounds.max, triangles };
  }
  const extent = bounds.max.clone().sub(bounds.min);
  const axis = extent.x >= extent.y && extent.x >= extent.z ? "x" : extent.y >= extent.z ? "y" : "z";
  triangles.sort((a, b) => a.centroid[axis] - b.centroid[axis]);
  const mid = Math.floor(triangles.length / 2);
  const left = buildOcclusionBvh(triangles.slice(0, mid), depth + 1);
  const right = buildOcclusionBvh(triangles.slice(mid), depth + 1);
  return { min: bounds.min, max: bounds.max, left: left || undefined, right: right || undefined };
}

function rootRadius(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return Math.max(0.12, Math.min(6, size.length() * 0.35));
}

function createOcclusionBaker(root: THREE.Object3D, options: TexturelessPbrBakeOptions): OcclusionBaker {
  const triangleBudget = root.userData?.texturelessPbrTriangleBudget;
  const triangleCount = Number.isFinite(triangleBudget) ? Number(triangleBudget) : 0;
  const radius = Math.max(0.08, Number.isFinite(options.aoRadius) ? Number(options.aoRadius) : rootRadius(root));
  const samples = THREE.MathUtils.clamp(
    Math.round(Number.isFinite(options.aoSamples) ? Number(options.aoSamples) : DEFAULT_AO_SAMPLES),
    4,
    MAX_AO_SAMPLES
  );
  const contrast = Math.max(0.05, Number.isFinite(options.aoContrast) ? Number(options.aoContrast) : 1);
  const bias = Math.max(0.01, radius * 0.01);
  const minHitDistance = bias * 2.5;
  if (options.bakeGeometryAo === false) {
    return { tree: null, triangleCount, radius, bias, minHitDistance, samples, contrast };
  }
  const triangles = collectOcclusionTriangles(root);
  return {
    tree: buildOcclusionBvh(triangles),
    triangleCount: triangles.length,
    radius,
    bias,
    minHitDistance,
    samples,
    contrast
  };
}

function rayIntersectsAabb(origin: THREE.Vector3, direction: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, maxDistance: number): boolean {
  let tMin = 0;
  let tMax = maxDistance;
  for (const axis of ["x", "y", "z"] as const) {
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < AO_EPSILON) {
      if (o < min[axis] || o > max[axis]) return false;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min[axis] - o) * inv;
    let t2 = (max[axis] - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMax < tMin) return false;
  }
  return tMax >= 0;
}

function rayTriangleDistance(origin: THREE.Vector3, direction: THREE.Vector3, triangle: OcclusionTriangle, minDistance: number, maxDistance: number): number {
  edge1.subVectors(triangle.b, triangle.a);
  edge2.subVectors(triangle.c, triangle.a);
  pvec.crossVectors(direction, edge2);
  const det = edge1.dot(pvec);
  if (Math.abs(det) < AO_EPSILON) return Infinity;
  const invDet = 1 / det;
  tvec.subVectors(origin, triangle.a);
  const u = tvec.dot(pvec) * invDet;
  if (u < 0 || u > 1) return Infinity;
  qvec.crossVectors(tvec, edge1);
  const v = direction.dot(qvec) * invDet;
  if (v < 0 || u + v > 1) return Infinity;
  const distance = edge2.dot(qvec) * invDet;
  return distance > minDistance && distance < maxDistance ? distance : Infinity;
}

function rayBvhDistance(
  node: OcclusionBvhNode | null,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  minDistance: number,
  maxDistance: number,
  best = maxDistance
): number {
  if (!node || !rayIntersectsAabb(origin, direction, node.min, node.max, best)) return best;
  if (node.triangles) {
    for (const triangle of node.triangles) {
      const distance = rayTriangleDistance(origin, direction, triangle, minDistance, best);
      if (distance < best) best = distance;
    }
    return best;
  }
  best = rayBvhDistance(node.left || null, origin, direction, minDistance, maxDistance, best);
  return rayBvhDistance(node.right || null, origin, direction, minDistance, maxDistance, best);
}

function worldNormalAt(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, index: number): THREE.Vector3 {
  const normal = geometry.attributes.normal;
  worldNormalMatrix.getNormalMatrix(mesh.matrixWorld);
  if (normal) {
    worldNormal.set(normal.getX(index), normal.getY(index), normal.getZ(index));
  } else {
    worldNormal.set(0, 1, 0);
  }
  worldNormal.applyMatrix3(worldNormalMatrix);
  if (worldNormal.lengthSq() < AO_EPSILON) worldNormal.set(0, 1, 0);
  return worldNormal.normalize();
}

function cosineHemisphereDirection(normal: THREE.Vector3, sampleIndex: number, sampleCount: number, seed: number): THREE.Vector3 {
  const helper = Math.abs(normal.dot(aoUp)) > 0.92 ? aoRight : aoUp;
  aoTangent.crossVectors(helper, normal).normalize();
  aoBitangent.crossVectors(normal, aoTangent).normalize();
  const u1 = (sampleIndex + 0.5) / sampleCount;
  const u2 = (radicalInverseVdc(sampleIndex + 1) + seed) % 1;
  const r = Math.sqrt(u1);
  const phi = 2 * Math.PI * u2;
  const x = Math.cos(phi) * r;
  const y = Math.sin(phi) * r;
  const z = Math.sqrt(Math.max(0, 1 - u1));
  return aoDirection
    .copy(aoTangent).multiplyScalar(x)
    .addScaledVector(aoBitangent, y)
    .addScaledVector(normal, z)
    .normalize();
}

function sampleGeometryAo(baker: OcclusionBaker, mesh: THREE.Mesh, geometry: THREE.BufferGeometry, index: number): number {
  if (!baker.tree || baker.samples <= 0) return 1;
  const position = geometry.attributes.position;
  if (!position) return 1;
  aoOrigin
    .set(position.getX(index), position.getY(index), position.getZ(index))
    .applyMatrix4(mesh.matrixWorld);
  const normal = worldNormalAt(mesh, geometry, index);
  aoOrigin.addScaledVector(normal, baker.bias);
  const seed = hashUnit(index + aoOrigin.x * 17.17 + aoOrigin.y * 37.31 + aoOrigin.z * 57.53);
  let occlusion = 0;
  for (let sample = 0; sample < baker.samples; sample += 1) {
    const direction = cosineHemisphereDirection(normal, sample, baker.samples, seed);
    const hit = rayBvhDistance(baker.tree, aoOrigin, direction, baker.minHitDistance, baker.radius);
    if (hit < baker.radius) {
      const falloff = 1 - THREE.MathUtils.smoothstep(hit / baker.radius, 0, 1);
      occlusion += falloff * AO_OCCLUSION_STRENGTH;
    }
  }
  return clamp01(1 - occlusion / baker.samples);
}

function getGroupMaterials(material: THREE.Material | THREE.Material[] | null | undefined): Array<THREE.Material | null> {
  if (Array.isArray(material)) return material;
  return [material || null];
}

function maxSamplerSize(source: MaterialBakeSource): number {
  let size = 0;
  for (const sampler of [source.map, source.ormMap, source.aoMap, source.roughnessMap, source.metalnessMap]) {
    if (sampler) size = Math.max(size, sampler.width, sampler.height);
  }
  return size;
}

function shouldTessellate(source: THREE.BufferGeometry, materialSources: MaterialBakeSource[]): boolean {
  if (!source.attributes.uv || !source.attributes.position) return false;
  if (source.attributes.skinIndex || source.attributes.skinWeight) return false;
  if (source.attributes.position.count > MAX_TESSELLATION_SOURCE_VERTICES) return false;
  return materialSources.some((materialSource) => maxSamplerSize(materialSource) > 0);
}

function triangleSubdivisions(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  a: number,
  b: number,
  c: number,
  textureSize: number,
  remainingVertexBudget: number
): number {
  if (textureSize <= 0 || remainingVertexBudget < 12) return 1;
  const au = uv.getX(a);
  const av = uv.getY(a);
  const bu = uv.getX(b);
  const bv = uv.getY(b);
  const cu = uv.getX(c);
  const cv = uv.getY(c);
  const edgeAB = Math.hypot(au - bu, av - bv) * textureSize;
  const edgeBC = Math.hypot(bu - cu, bv - cv) * textureSize;
  const edgeCA = Math.hypot(cu - au, cv - av) * textureSize;
  const wanted = Math.ceil(Math.max(edgeAB, edgeBC, edgeCA) / BAKE_TEXEL_STEP);
  const budgeted = Math.floor(Math.sqrt(Math.max(1, remainingVertexBudget / 3)));
  return THREE.MathUtils.clamp(Math.min(wanted, budgeted), 1, MAX_TRIANGLE_SUBDIVISIONS);
}

function pushInterpolatedVertex(
  source: THREE.BufferGeometry,
  indexA: number,
  indexB: number,
  indexC: number,
  weightA: number,
  weightB: number,
  weightC: number,
  positions: number[],
  normals: number[],
  uvs: number[]
): void {
  const position = source.attributes.position;
  const normal = source.attributes.normal;
  const uv = source.attributes.uv;
  positions.push(
    position.getX(indexA) * weightA + position.getX(indexB) * weightB + position.getX(indexC) * weightC,
    position.getY(indexA) * weightA + position.getY(indexB) * weightB + position.getY(indexC) * weightC,
    position.getZ(indexA) * weightA + position.getZ(indexB) * weightB + position.getZ(indexC) * weightC
  );
  if (normal) {
    const nx = normal.getX(indexA) * weightA + normal.getX(indexB) * weightB + normal.getX(indexC) * weightC;
    const ny = normal.getY(indexA) * weightA + normal.getY(indexB) * weightB + normal.getY(indexC) * weightC;
    const nz = normal.getZ(indexA) * weightA + normal.getZ(indexB) * weightB + normal.getZ(indexC) * weightC;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / length, ny / length, nz / length);
  }
  uvs.push(
    uv.getX(indexA) * weightA + uv.getX(indexB) * weightB + uv.getX(indexC) * weightC,
    uv.getY(indexA) * weightA + uv.getY(indexB) * weightB + uv.getY(indexC) * weightC
  );
}

function createTessellatedBakeGeometry(source: THREE.BufferGeometry, materialSources: MaterialBakeSource[]): THREE.BufferGeometry {
  if (!shouldTessellate(source, materialSources)) return source;
  const position = source.attributes.position;
  const uv = source.attributes.uv;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const generatedGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
  const groups = source.groups.length > 0
    ? source.groups
    : [{ start: 0, count: position.count, materialIndex: 0 }];

  for (const group of groups) {
    const groupStart = positions.length / 3;
    const materialIndex = THREE.MathUtils.clamp(group.materialIndex || 0, 0, Math.max(0, materialSources.length - 1));
    const textureSize = maxSamplerSize(materialSources[materialIndex] || materialSources[0] || createMaterialSource(null));
    const minSegments = textureSize > 0 && position.count <= LOW_DETAIL_PROP_VERTEX_THRESHOLD
      ? LOW_DETAIL_PROP_MIN_SUBDIVISIONS
      : 1;
    const start = Math.max(0, group.start);
    const end = Math.min(position.count, start + group.count);
    for (let index = start; index + 2 < end; index += 3) {
      const remainingBudget = Math.max(3, MAX_TESSELLATED_VERTICES - positions.length / 3);
      const segments = Math.max(
        Math.min(minSegments, Math.floor(Math.sqrt(Math.max(1, remainingBudget / 3)))),
        triangleSubdivisions(uv, index, index + 1, index + 2, textureSize, remainingBudget)
      );
      if (segments <= 1) {
        pushInterpolatedVertex(source, index, index + 1, index + 2, 1, 0, 0, positions, normals, uvs);
        pushInterpolatedVertex(source, index, index + 1, index + 2, 0, 1, 0, positions, normals, uvs);
        pushInterpolatedVertex(source, index, index + 1, index + 2, 0, 0, 1, positions, normals, uvs);
        continue;
      }
      const grid = new Map<string, [number, number, number]>();
      for (let row = 0; row <= segments; row += 1) {
        for (let column = 0; column <= segments - row; column += 1) {
          const weightB = row / segments;
          const weightC = column / segments;
          const weightA = 1 - weightB - weightC;
          grid.set(`${row}:${column}`, [weightA, weightB, weightC]);
        }
      }
      const appendGridVertex = (row: number, column: number): void => {
        const weights = grid.get(`${row}:${column}`) || [1, 0, 0];
        pushInterpolatedVertex(source, index, index + 1, index + 2, weights[0], weights[1], weights[2], positions, normals, uvs);
      };
      for (let row = 0; row < segments; row += 1) {
        for (let column = 0; column < segments - row; column += 1) {
          appendGridVertex(row, column);
          appendGridVertex(row + 1, column);
          appendGridVertex(row, column + 1);
          if (column < segments - row - 1) {
            appendGridVertex(row + 1, column);
            appendGridVertex(row + 1, column + 1);
            appendGridVertex(row, column + 1);
          }
        }
      }
    }
    const groupCount = positions.length / 3 - groupStart;
    if (groupCount > 0) generatedGroups.push({ start: groupStart, count: groupCount, materialIndex });
  }

  if (positions.length / 3 <= position.count) return source;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.clearGroups();
  for (const group of generatedGroups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.userData.texturelessPbrTessellated = {
    sourceVertices: position.count,
    bakedVertices: positions.length / 3
  };
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}

function sampleMaterial(source: MaterialBakeSource, uv: THREE.Vector2, out: Sample): { ao: number; roughness: number; metalness: number } {
  const albedo = source.map?.sample(uv, out) || null;
  const isSrgb = source.map?.texture.colorSpace === THREE.SRGBColorSpace;
  if (albedo) {
    out.r = clamp01(out.r);
    out.g = clamp01(out.g);
    out.b = clamp01(out.b);
    if (isSrgb) {
      const color = new THREE.Color(out.r, out.g, out.b).convertSRGBToLinear();
      out.r = color.r;
      out.g = color.g;
      out.b = color.b;
    }
  } else {
    out.r = source.color.r;
    out.g = source.color.g;
    out.b = source.color.b;
    out.a = 1;
  }

  let ao = 1;
  let roughness = source.roughness;
  let metalness = source.metalness;
  if (source.ormMap) {
    const orm = source.ormMap.sample(uv, pbrScratchSample);
    roughness = clamp01(orm.g);
    metalness = clamp01(orm.b);
  }
  if (source.aoMap) ao = clamp01(source.aoMap.sample(uv, pbrScratchSample).r);
  if (!source.ormMap && source.roughnessMap) roughness = clamp01(source.roughnessMap.sample(uv, pbrScratchSample).g);
  if (!source.ormMap && source.metalnessMap) metalness = clamp01(source.metalnessMap.sample(uv, pbrScratchSample).b);
  return { ao, roughness, metalness };
}

export async function bakeTexturelessPbr(root: THREE.Object3D, options: TexturelessPbrBakeOptions = {}): Promise<TexturelessPbrBakeResult> {
  const strippedTextures = new Set<THREE.Texture>();
  const totals = {
    meshCount: 0,
    vertexCount: 0,
    materialCount: 0,
    ao: 0,
    geometryAo: 0,
    roughness: 0,
    metalness: 0
  };
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) meshes.push(child);
  });
  const occlusionBaker = createOcclusionBaker(root, options);
  const yieldEveryVertices = Math.max(
    0,
    Math.round(Number.isFinite(options.yieldEveryVertices) ? Number(options.yieldEveryVertices) : 0)
  );
  let processedVertices = 0;

  for (const mesh of meshes) {
    const materials = getGroupMaterials(mesh.material);
    const materialSources = materials.map((material) => createMaterialSource(material));
    const materialStats = materials.map<MaterialBakeStats>(() => ({ ao: 0, geometryAo: 0, roughness: 0, metalness: 0, count: 0 }));
    collectTextures(mesh.material, strippedTextures);
    const sourceGeometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    if (!sourceGeometry.attributes.normal) sourceGeometry.computeVertexNormals();
    const geometry = createTessellatedBakeGeometry(sourceGeometry, materialSources);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const position = geometry.attributes.position;
    const sourceColor = geometry.attributes.color as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    const sourcePackedPbr = geometry.attributes.uv1 as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    const uv = geometry.attributes.uv;
    const vertexCount = position.count;
    if (vertexCount <= 0) continue;
    const colorData = new Float32Array(vertexCount * 4);
    const pbrData = new Float32Array(vertexCount * 2);
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: vertexCount, materialIndex: 0 }];

    for (const group of groups) {
      const materialIndex = THREE.MathUtils.clamp(group.materialIndex || 0, 0, Math.max(0, materialSources.length - 1));
      const source = materialSources[materialIndex] || materialSources[0] || createMaterialSource(null);
      const stats = materialStats[materialIndex] || materialStats[0];
      const start = Math.max(0, group.start);
      const end = Math.min(vertexCount, start + group.count);
      for (let index = start; index < end; index += 1) {
        sampleUv.set(uv ? uv.getX(index) : 0.5, uv ? uv.getY(index) : 0.5);
        const pbr = sampleMaterial(source, sampleUv, scratchSample);
        if (sourceColor) {
          scratchSample.r *= sourceColor.getX(index);
          scratchSample.g *= sourceColor.getY(index);
          scratchSample.b *= sourceColor.getZ(index);
          if (sourceColor.itemSize >= 4) pbr.ao *= clamp01(sourceColor.getW(index));
        }
        if (sourcePackedPbr && !source.ormMap && !source.roughnessMap && !source.metalnessMap) {
          pbr.roughness = clamp01(sourcePackedPbr.getX(index));
          pbr.metalness = clamp01(sourcePackedPbr.getY(index));
        }
        const geometryAo = sampleGeometryAo(occlusionBaker, mesh, geometry, index);
        const ao = contrastAo(clamp01(pbr.ao * geometryAo), occlusionBaker.contrast);
        const roughness = clamp01(pbr.roughness);
        const metalness = clamp01(pbr.metalness);
        const colorOffset = index * 4;
        colorData[colorOffset] = clamp01(scratchSample.r);
        colorData[colorOffset + 1] = clamp01(scratchSample.g);
        colorData[colorOffset + 2] = clamp01(scratchSample.b);
        colorData[colorOffset + 3] = ao;
        const pbrOffset = index * 2;
        pbrData[pbrOffset] = roughness;
        pbrData[pbrOffset + 1] = metalness;
        stats.ao += ao;
        stats.geometryAo += geometryAo;
        stats.roughness += roughness;
        stats.metalness += metalness;
        stats.count += 1;
        totals.ao += ao;
        totals.geometryAo += geometryAo;
        totals.roughness += roughness;
        totals.metalness += metalness;
        processedVertices += 1;
        if (yieldEveryVertices > 0 && processedVertices % yieldEveryVertices === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colorData, 4));
    geometry.setAttribute("uv1", new THREE.BufferAttribute(pbrData, 2));
    geometry.setAttribute("uv2", new THREE.BufferAttribute(pbrData.slice(), 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    mesh.geometry = geometry;
    mesh.material = Array.isArray(mesh.material)
      ? materials.map((material, index) => createTexturelessMaterial(material, materialStats[index] || materialStats[0]))
      : createTexturelessMaterial(materials[0], materialStats[0]);
    mesh.userData.texturelessPbr = true;
    totals.meshCount += 1;
    totals.vertexCount += vertexCount;
    totals.materialCount += materials.length;
  }

  const divisor = Math.max(1, totals.vertexCount);
  const result: TexturelessPbrBakeResult = {
    converted: totals.meshCount > 0,
    meshCount: totals.meshCount,
    vertexCount: totals.vertexCount,
    materialCount: totals.materialCount,
    strippedTextureCount: strippedTextures.size,
    averageAo: totals.ao / divisor,
    averageGeometryAo: totals.geometryAo / divisor,
    averageRoughness: totals.roughness / divisor,
    averageMetalness: totals.metalness / divisor,
    geometricAoBaked: Boolean(occlusionBaker.tree),
    aoContrast: occlusionBaker.contrast,
    aoSamples: occlusionBaker.samples,
    aoRadius: occlusionBaker.radius,
    occluderTriangleCount: occlusionBaker.triangleCount,
    colorAttribute: "rgba-ao",
    pbrAttribute: "uv1-roughness-metalness"
  };
  root.userData.texturelessPbr = result;
  return result;
}
