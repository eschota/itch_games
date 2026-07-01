import * as THREE from "three";

const canvas = document.querySelector("#game-canvas");
const scoreEl = document.querySelector("#score");
const livesEl = document.querySelector("#lives");
const bestEl = document.querySelector("#best");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start-button");
const versionBadge = document.querySelector("#version-badge");

const gameVersion = "v0.0.003";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.035);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 120);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, -10);

scene.add(new THREE.AmbientLight(0x8bbdff, 0.75));
const light = new THREE.DirectionalLight(0xffffff, 2.2);
light.position.set(4, 8, 6);
scene.add(light);
const pulseLight = new THREE.PointLight(0x43d9ff, 1.6, 28);
pulseLight.position.set(-5, 3, -4);
scene.add(pulseLight);

const laneLimit = 5.4;
const player = new THREE.Group();
const ship = new THREE.Mesh(
  new THREE.ConeGeometry(0.58, 1.55, 4),
  new THREE.MeshStandardMaterial({
    color: 0x43d9ad,
    emissive: 0x0f6c5e,
    metalness: 0.35,
    roughness: 0.22
  })
);
ship.rotation.x = Math.PI * 0.5;
player.add(ship);

const wingMaterial = new THREE.MeshStandardMaterial({
  color: 0xa6f7ff,
  emissive: 0x154c66,
  roughness: 0.24
});
for (const side of [-1, 1]) {
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.45), wingMaterial);
  wing.position.set(side * 0.62, -0.02, 0.12);
  wing.rotation.z = side * 0.32;
  player.add(wing);
}
player.position.set(0, 0, 3.8);
scene.add(player);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(15, 150, 18, 80),
  new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.82,
    wireframe: true,
    transparent: true,
    opacity: 0.34
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -1.25, -35);
scene.add(floor);

const starMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.08, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xdaf7ff }),
  240
);
const temp = new THREE.Object3D();
for (let i = 0; i < starMesh.count; i += 1) {
  temp.position.set(
    THREE.MathUtils.randFloatSpread(42),
    THREE.MathUtils.randFloat(0, 18),
    THREE.MathUtils.randFloat(-95, 18)
  );
  temp.scale.setScalar(THREE.MathUtils.randFloat(0.55, 1.9));
  temp.updateMatrix();
  starMesh.setMatrixAt(i, temp.matrix);
}
scene.add(starMesh);

const state = {
  running: false,
  score: 0,
  lives: 3,
  best: Number(localStorage.getItem("orbital-courier-best") || 0),
  speed: 9,
  spawnAt: 0,
  coreAt: 0,
  grace: 0,
  time: 0
};
const input = { left: false, right: false, pointer: false, target: 0 };
const hazards = [];
const cores = [];
let lastControlStartAt = 0;

bestEl.textContent = String(state.best);
versionBadge.textContent = gameVersion;

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function setOverlay(visible, title = "Orbital Courier", message = "Collect energy cores, dodge debris, and keep the courier alive.") {
  overlay.classList.toggle("visible", visible);
  overlay.setAttribute("aria-hidden", String(!visible));
  overlay.querySelector("h1").textContent = title;
  overlay.querySelector("p").textContent = message;
  startButton.textContent = state.score > 0 ? "Restart Run" : "Start Run";
}

function hud() {
  scoreEl.textContent = String(Math.floor(state.score));
  livesEl.textContent = String(state.lives);
  bestEl.textContent = String(state.best);
}

function clear(list) {
  for (const item of list) {
    scene.remove(item.mesh);
    item.mesh.geometry.dispose();
  }
  list.length = 0;
}

function focusCanvas() {
  try {
    canvas.focus({ preventScroll: true });
  } catch {
    canvas.focus();
  }
}

function startGame() {
  clear(hazards);
  clear(cores);
  Object.assign(state, {
    running: true,
    score: 0,
    lives: 3,
    speed: 9,
    spawnAt: 0.2,
    coreAt: 1.1,
    grace: 1.2,
    time: 0
  });
  Object.assign(input, { left: false, right: false, pointer: false, target: 0 });
  player.position.x = 0;
  setOverlay(false);
  focusCanvas();
  hud();
}

function finishGame() {
  state.running = false;
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem("orbital-courier-best", String(state.best));
  hud();
  setOverlay(true, "Run Complete", `Final score ${Math.floor(state.score)}. Press Space or tap Start to fly again.`);
}

function spawn(kind) {
  const isCore = kind === "core";
  const mesh = new THREE.Mesh(
    isCore ? new THREE.OctahedronGeometry(0.34, 0) : new THREE.IcosahedronGeometry(THREE.MathUtils.randFloat(0.35, 0.82), 1),
    new THREE.MeshStandardMaterial({
      color: isCore ? 0x62e6ff : 0xff5d73,
      emissive: isCore ? 0x1a9bc8 : 0x43121c,
      roughness: isCore ? 0.18 : 0.7,
      metalness: isCore ? 0.2 : 0
    })
  );
  mesh.position.set(THREE.MathUtils.randFloatSpread(laneLimit * 1.8), isCore ? 0.1 : 0, -48);
  scene.add(mesh);
  (isCore ? cores : hazards).push({
    mesh,
    radius: isCore ? 0.45 : 0.72,
    spin: THREE.MathUtils.randFloat(1.4, 3)
  });
}

function updateObjects(list, delta, hit) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    item.mesh.position.z += state.speed * delta;
    item.mesh.rotation.x += item.spin * delta;
    item.mesh.rotation.y += item.spin * delta * 0.7;

    if (item.mesh.position.distanceTo(player.position) < item.radius + 0.58) {
      hit();
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      list.splice(i, 1);
    } else if (item.mesh.position.z > 8) {
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      list.splice(i, 1);
    }
  }
}

function movePlayer(delta) {
  const direction = Number(input.right) - Number(input.left);
  if (input.pointer) {
    player.position.x = THREE.MathUtils.damp(player.position.x, input.target, 10, delta);
  } else {
    player.position.x += direction * 8.8 * delta;
    if (direction === 0) {
      player.position.x = THREE.MathUtils.damp(player.position.x, 0, 1.6, delta);
    }
  }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -laneLimit, laneLimit);
  player.rotation.z = THREE.MathUtils.damp(player.rotation.z, -player.position.x * 0.12, 8, delta);
  player.rotation.y = Math.sin(state.time * 4.2) * 0.04;
  ship.rotation.z += delta * 1.6;
}

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - (frame.previous || now)) / 1000, 0.05);
  frame.previous = now;

  floor.position.z = floor.position.z > -20 ? -35 : floor.position.z + delta * state.speed;
  starMesh.rotation.y += delta * 0.012;

  if (state.running) {
    state.time += delta;
    state.speed += delta * 0.26;
    state.score += delta * (8 + state.speed * 0.48);
    state.spawnAt -= delta;
    state.coreAt -= delta;
    state.grace = Math.max(0, state.grace - delta);

    if (state.spawnAt <= 0) {
      spawn("hazard");
      state.spawnAt = THREE.MathUtils.randFloat(0.42, 0.88) * Math.max(0.58, 11 / state.speed);
    }
    if (state.coreAt <= 0) {
      spawn("core");
      state.coreAt = THREE.MathUtils.randFloat(1.1, 1.9);
    }

    movePlayer(delta);
    updateObjects(hazards, delta, () => {
      if (state.grace > 0) return;
      state.lives -= 1;
      state.grace = 1.1;
      if (state.lives <= 0) finishGame();
    });
    updateObjects(cores, delta, () => {
      state.score += 75;
      pulseLight.intensity = 3.2;
    });
    pulseLight.intensity = THREE.MathUtils.damp(pulseLight.intensity, 1.6, 6, delta);
    player.visible = state.grace <= 0 || Math.floor(state.time * 18) % 2 === 0;
    hud();
  } else {
    player.visible = true;
    player.rotation.y += delta * 0.5;
  }

  renderer.render(scene, camera);
}

function lane(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / Math.max(rect.width, 1);
  return (THREE.MathUtils.clamp(x, 0, 1) * 2 - 1) * laneLimit;
}

function capturePointer(event) {
  if (!canvas.setPointerCapture) return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Some iframe hosts reject capture if the pointer was retargeted.
  }
}

function stopPointerControl() {
  input.pointer = false;
}

function startFromControl(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const now = performance.now();
  if (now - lastControlStartAt < 250) return;
  lastControlStartAt = now;
  startGame();
}

function startFromOverlay(event) {
  if (!overlay.classList.contains("visible")) return;
  startFromControl(event);
}

addEventListener("resize", resize);
addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") input.right = true;
  if (event.code === "Space" && !state.running) {
    event.preventDefault();
    startGame();
  }
});
addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") input.right = false;
});
canvas.addEventListener("pointerdown", (event) => {
  if (!state.running) return;
  event.preventDefault();
  input.pointer = true;
  input.target = lane(event.clientX);
  focusCanvas();
  capturePointer(event);
});
canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  if (input.pointer) input.target = lane(event.clientX);
});
canvas.addEventListener("pointerup", stopPointerControl);
canvas.addEventListener("pointercancel", stopPointerControl);
startButton.addEventListener("pointerdown", startFromControl);
startButton.addEventListener("pointerup", startFromControl);
startButton.addEventListener("mousedown", startFromControl);
startButton.addEventListener("mouseup", startFromControl);
startButton.addEventListener("click", startFromControl);
startButton.addEventListener("touchstart", startFromControl, { passive: false });
startButton.addEventListener("touchend", startFromControl);
startButton.addEventListener("keydown", (event) => {
  if (event.code === "Enter" || event.code === "Space") startFromControl(event);
});
overlay.addEventListener("pointerdown", startFromOverlay, { capture: true });
overlay.addEventListener("mousedown", startFromOverlay, { capture: true });

resize();
hud();
requestAnimationFrame(frame);
startGame();
