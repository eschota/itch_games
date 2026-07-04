import * as THREE from "three";

interface WaterPuddleMaterialOptions {
  deepColor?: number;
  shallowColor?: number;
  highlightColor?: number;
  opacity?: number;
  strength?: number;
}

interface WaterPuddleUniforms extends Record<string, THREE.IUniform> {
  uTime: { value: number };
  uOpacity: { value: number };
  uStrength: { value: number };
  uDeepColor: { value: THREE.Color };
  uShallowColor: { value: THREE.Color };
  uHighlightColor: { value: THREE.Color };
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random01(seed: number, index: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createIrregularPuddleGeometry(seedText: string, segments = 52, jitter = 0.24): THREE.BufferGeometry {
  const seed = hashText(seedText);
  const safeSegments = Math.max(16, Math.floor(segments));
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let index = 0; index < safeSegments; index += 1) {
    const angle = index / safeSegments * Math.PI * 2;
    const lobe = Math.sin(angle * 2.1 + seed * 0.0007) * 0.09
      + Math.sin(angle * 4.7 + seed * 0.0013) * 0.065;
    const radius = THREE.MathUtils.clamp(
      1 + lobe + (random01(seed, index) - 0.5) * jitter,
      0.66,
      1.18
    );
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * (0.62 + random01(seed, index + 101) * 0.2);
    positions.push(x, 0, z);
    normals.push(0, 1, 0);
    uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  }

  for (let index = 1; index <= safeSegments; index += 1) {
    indices.push(0, index, index === safeSegments ? 1 : index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createIrregularPuddleEdgeGeometry(surfaceGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = surfaceGeometry.getAttribute("position");
  const points: THREE.Vector3[] = [];
  for (let index = 1; index < position.count; index += 1) {
    points.push(new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createWaterPuddleMaterial(options: WaterPuddleMaterialOptions = {}): THREE.ShaderMaterial {
  const uniforms: WaterPuddleUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: options.opacity ?? 0.58 },
    uStrength: { value: options.strength ?? 0.5 },
    uDeepColor: { value: new THREE.Color(options.deepColor ?? 0x0b3440) },
    uShallowColor: { value: new THREE.Color(options.shallowColor ?? 0x80d8ff) },
    uHighlightColor: { value: new THREE.Color(options.highlightColor ?? 0xe9ffff) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: `
      varying vec2 vLocal;
      varying float vEdge;
      varying float vWave;
      uniform float uTime;
      uniform float uStrength;

      void main() {
        vLocal = position.xz;
        float distanceFromCenter = length(vLocal);
        vEdge = smoothstep(1.08, 0.58, distanceFromCenter);
        vec3 transformed = position;
        float waveA = sin((position.x * 8.2 + uTime * 1.7) + cos(position.z * 3.4));
        float waveB = cos(position.z * 6.5 - uTime * 1.25 + position.x * 1.8);
        vWave = waveA * 0.5 + waveB * 0.5;
        transformed.y += (waveA * 0.009 + waveB * 0.006) * (0.5 + uStrength) * vEdge;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vLocal;
      varying float vEdge;
      varying float vWave;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uStrength;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uHighlightColor;

      void main() {
        float distanceFromCenter = length(vLocal);
        float ripple = sin(distanceFromCenter * 22.0 - uTime * 3.0)
          + sin((vLocal.x * 10.0 + vLocal.y * 7.0) + uTime * 1.6);
        ripple = ripple * 0.5 + 0.5;
        float streak = smoothstep(0.82, 1.0, sin(vLocal.x * 13.0 + vLocal.y * 5.0 + uTime * 0.9) * 0.5 + 0.5);
        float edgeFoam = smoothstep(0.58, 1.02, distanceFromCenter) * vEdge;
        float caustic = smoothstep(0.35, 0.98, sin((vLocal.x - vLocal.y) * 17.0 + uTime * 1.25 + vWave) * 0.5 + 0.5);
        float specular = pow(max(0.0, streak * (0.45 + ripple * 0.55)), 2.3);
        vec3 color = mix(uDeepColor, uShallowColor, 0.46 + ripple * 0.24);
        color = mix(color, uHighlightColor, specular * 0.34 + caustic * 0.16 + edgeFoam * 0.28);
        color += uHighlightColor * (0.05 + uStrength * 0.08) * vEdge;
        float alpha = uOpacity * vEdge * (0.78 + ripple * 0.22 + edgeFoam * 0.2 + specular * 0.22) * (0.85 + uStrength * 0.25);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  material.userData.puddleUniforms = uniforms;
  material.userData.puddleBaseOpacity = uniforms.uOpacity.value;
  return material;
}

export function updateWaterPuddleMaterial(
  material: THREE.Material,
  time: number,
  opacityScale: number,
  strength: number
): void {
  const uniforms = material.userData.puddleUniforms as WaterPuddleUniforms | undefined;
  if (!uniforms) return;
  const baseOpacity = Number(material.userData.puddleBaseOpacity ?? uniforms.uOpacity.value ?? 0.58);
  uniforms.uTime.value = time;
  uniforms.uOpacity.value = THREE.MathUtils.clamp(baseOpacity * opacityScale, 0, 0.9);
  uniforms.uStrength.value = THREE.MathUtils.clamp(strength, 0, 1);
}
