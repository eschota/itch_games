import * as THREE from "three";

const canvas = document.querySelector("#game-canvas");
const scoreEl = document.querySelector("#score");
const livesEl = document.querySelector("#lives");
const bestEl = document.querySelector("#best");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start-button");
const versionBadge = document.querySelector("#version-badge");

const gameVersion = "v0.0.006";

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
const audioNetwork = {
  sourceId: makeAudioSourceId(),
  sequence: 0,
  seenIds: new Set(),
  log: []
};
const audio = createAudioSystem();

bestEl.textContent = String(state.best);
versionBadge.textContent = gameVersion;
setAudioDiagnostic("audioSupported", audio.supported());
setAudioDiagnostic("audioState", "uncreated");

function setAudioDiagnostic(name, value) {
  document.documentElement.dataset[name] = String(value);
}

function makeAudioSourceId() {
  if (window.crypto?.randomUUID) return `orbital-courier:${window.crypto.randomUUID()}`;
  return `orbital-courier:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function createAudioSystem() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const system = {
    context: null,
    master: null,
    sfx: null,
    ambience: null,
    engine: null,
    engineOsc: null,
    engineFilter: null,
    ambienceStarted: false,
    muted: false,
    unlocked: false
  };

  function ensureContext() {
    if (!AudioCtor) return null;
    if (system.context) return system.context;

    const context = new AudioCtor();
    system.context = context;
    system.master = context.createGain();
    system.sfx = context.createGain();
    system.ambience = context.createGain();
    system.engine = context.createGain();

    system.master.gain.value = 0.82;
    system.sfx.gain.value = 0.7;
    system.ambience.gain.value = 0.28;
    system.engine.gain.value = 0;

    system.sfx.connect(system.master);
    system.ambience.connect(system.master);
    system.engine.connect(system.master);
    system.master.connect(context.destination);
    setAudioDiagnostic("audioState", context.state);
    context.addEventListener("statechange", () => {
      setAudioDiagnostic("audioState", context.state);
      if (context.state === "running") markUnlocked();
    });
    return context;
  }

  function playableContext() {
    const context = system.context;
    if (!context || context.state !== "running" || system.muted) return null;
    return context;
  }

  function markUnlocked() {
    system.unlocked = true;
    setAudioDiagnostic("audioUnlocked", true);
    startAmbience();
  }

  function unlock() {
    const context = ensureContext();
    if (!context) return false;
    setAudioDiagnostic("audioUnlockRequested", true);
    setAudioDiagnostic("audioState", context.state);
    if (context.state === "running") {
      markUnlocked();
      return true;
    }
    const resume = context.resume();
    if (resume?.then) {
      resume.then(() => {
        setAudioDiagnostic("audioState", context.state);
        if (context.state === "running") markUnlocked();
      }).catch(() => {});
    }
    return true;
  }

  function createPanner(context, pan) {
    if (!context.createStereoPanner) return null;
    const panner = context.createStereoPanner();
    panner.pan.value = THREE.MathUtils.clamp(Number(pan) || 0, -1, 1);
    return panner;
  }

  function connectWithPan(context, source, gain, pan) {
    const panner = createPanner(context, pan);
    if (panner) {
      source.connect(panner);
      panner.connect(gain);
      return;
    }
    source.connect(gain);
  }

  function tone(options) {
    const context = playableContext();
    if (!context) return;
    const start = context.currentTime + (options.delay || 0);
    const duration = options.duration || 0.16;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(options.frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, options.endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain || 0.08), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    connectWithPan(context, oscillator, gain, options.pan || 0);
    gain.connect(system.sfx);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function noiseBurst(options) {
    const context = playableContext();
    if (!context) return;
    const duration = options.duration || 0.18;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      const fade = 1 - i / frameCount;
      output[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + (options.delay || 0);
    source.buffer = buffer;
    filter.type = options.filterType || "bandpass";
    filter.frequency.value = options.frequency || 900;
    filter.Q.value = options.q || 1.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain || 0.08), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    connectWithPan(context, filter, gain, options.pan || 0);
    gain.connect(system.sfx);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  function startAmbience() {
    const context = playableContext();
    if (!context || system.ambienceStarted) return;
    system.ambienceStarted = true;

    const drone = context.createOscillator();
    const shimmer = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    drone.type = "sine";
    shimmer.type = "triangle";
    drone.frequency.value = 54;
    shimmer.frequency.value = 108.5;
    filter.type = "lowpass";
    filter.frequency.value = 620;
    gain.gain.value = 0.055;
    drone.connect(filter);
    shimmer.connect(filter);
    filter.connect(gain);
    gain.connect(system.ambience);
    drone.start();
    shimmer.start();
  }

  function startEngine() {
    const context = playableContext();
    if (!context || system.engineOsc) return;
    system.engineOsc = context.createOscillator();
    system.engineFilter = context.createBiquadFilter();
    system.engineOsc.type = "sawtooth";
    system.engineOsc.frequency.value = 74;
    system.engineFilter.type = "lowpass";
    system.engineFilter.frequency.value = 420;
    system.engineOsc.connect(system.engineFilter);
    system.engineFilter.connect(system.engine);
    system.engineOsc.start();
  }

  function setMotion(running, speed, lateral) {
    const context = playableContext();
    if (!context) return;
    startEngine();
    const motion = THREE.MathUtils.clamp(Math.abs(lateral || 0), 0, 1);
    const speedTone = THREE.MathUtils.clamp(Number(speed) || 0, 0, 22);
    const targetGain = running ? 0.014 + speedTone * 0.0015 + motion * 0.018 : 0.0001;
    const targetFrequency = 64 + speedTone * 4.2 + motion * 30;
    system.engine.gain.cancelScheduledValues(context.currentTime);
    system.engine.gain.linearRampToValueAtTime(targetGain, context.currentTime + 0.12);
    if (system.engineOsc) {
      system.engineOsc.frequency.linearRampToValueAtTime(targetFrequency, context.currentTime + 0.1);
    }
    if (system.engineFilter) {
      system.engineFilter.frequency.linearRampToValueAtTime(360 + speedTone * 18 + motion * 240, context.currentTime + 0.12);
    }
  }

  function play(event) {
    const pan = THREE.MathUtils.clamp((event.position?.x || 0) / laneLimit, -0.9, 0.9);
    const intensity = THREE.MathUtils.clamp(Number(event.payload?.intensity) || 1, 0.25, 1.5);
    if (event.type === "run_start") {
      tone({ frequency: 190, endFrequency: 580, duration: 0.24, type: "triangle", gain: 0.08 * intensity, pan });
      tone({ frequency: 760, duration: 0.12, type: "sine", gain: 0.035 * intensity, delay: 0.08, pan });
    } else if (event.type === "core_collect") {
      tone({ frequency: 660, duration: 0.1, type: "sine", gain: 0.075 * intensity, pan });
      tone({ frequency: 990, duration: 0.11, type: "triangle", gain: 0.055 * intensity, delay: 0.05, pan });
      tone({ frequency: 1480, duration: 0.13, type: "sine", gain: 0.045 * intensity, delay: 0.11, pan });
    } else if (event.type === "shield_hit") {
      noiseBurst({ duration: 0.18, frequency: 520, filterType: "lowpass", gain: 0.14 * intensity, pan });
      tone({ frequency: 132, endFrequency: 62, duration: 0.28, type: "sawtooth", gain: 0.11 * intensity, pan });
    } else if (event.type === "near_miss") {
      noiseBurst({ duration: 0.13, frequency: 1800, filterType: "bandpass", q: 3.2, gain: 0.045 * intensity, pan });
    } else if (event.type === "run_complete") {
      tone({ frequency: 330, endFrequency: 220, duration: 0.22, type: "triangle", gain: 0.075 * intensity, pan });
      tone({ frequency: 247, endFrequency: 165, duration: 0.3, type: "triangle", gain: 0.065 * intensity, delay: 0.16, pan });
      noiseBurst({ duration: 0.24, frequency: 360, filterType: "lowpass", gain: 0.045 * intensity, delay: 0.08, pan });
    }
  }

  function setMuted(muted) {
    system.muted = Boolean(muted);
    if (!system.master || !system.context) return;
    system.master.gain.linearRampToValueAtTime(system.muted ? 0.0001 : 0.82, system.context.currentTime + 0.04);
  }

  return {
    unlock,
    play,
    setMotion,
    setMuted,
    isUnlocked: () => system.unlocked && system.context?.state === "running",
    supported: () => Boolean(AudioCtor)
  };
}

function audioEventPayload(payload) {
  const clean = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || typeof value === "function") continue;
    clean[key] = value;
  }
  return clean;
}

function emitAudioEvent(type, payload = {}) {
  const cleanPayload = audioEventPayload(payload);
  audioNetwork.sequence += 1;
  const event = {
    id: `${audioNetwork.sourceId}:${audioNetwork.sequence}`,
    type,
    sourceId: audioNetwork.sourceId,
    sequence: audioNetwork.sequence,
    gameVersion,
    createdAt: performance.now(),
    fromNetwork: false,
    position: {
      x: Number.isFinite(cleanPayload.positionX) ? cleanPayload.positionX : player.position.x,
      laneLimit
    },
    game: {
      running: state.running,
      score: Math.floor(state.score),
      lives: state.lives,
      speed: Number(state.speed.toFixed(2)),
      time: Number(state.time.toFixed(3))
    },
    payload: cleanPayload
  };
  event.network = {
    id: event.id,
    type: event.type,
    sourceId: event.sourceId,
    sequence: event.sequence,
    gameVersion: event.gameVersion,
    positionX: event.position.x,
    gameTime: event.game.time,
    intensity: Number(cleanPayload.intensity || 1),
    replicate: cleanPayload.replicate !== false
  };
  dispatchAudioEvent(event);
  return event.network;
}

function dispatchAudioEvent(event) {
  audioNetwork.seenIds.add(event.id);
  audioNetwork.log.push(event);
  if (audioNetwork.log.length > 120) audioNetwork.log.splice(0, audioNetwork.log.length - 120);
  setAudioDiagnostic("lastAudioEvent", event.type);
  setAudioDiagnostic("audioEventCount", audioNetwork.log.length);
  window.dispatchEvent(new CustomEvent("orbital-courier:audio-event", { detail: event }));
  audio.play(event);
}

function receiveNetworkAudioEvent(networkEvent) {
  if (!networkEvent || !networkEvent.id || audioNetwork.seenIds.has(networkEvent.id)) return false;
  const type = String(networkEvent.type || "").slice(0, 80);
  if (!type) return false;
  const event = {
    id: String(networkEvent.id),
    type,
    sourceId: String(networkEvent.sourceId || "remote"),
    sequence: Number(networkEvent.sequence || 0),
    gameVersion: String(networkEvent.gameVersion || "remote"),
    createdAt: performance.now(),
    fromNetwork: true,
    position: {
      x: THREE.MathUtils.clamp(Number(networkEvent.positionX) || 0, -laneLimit, laneLimit),
      laneLimit
    },
    game: {
      running: state.running,
      score: Math.floor(state.score),
      lives: state.lives,
      speed: Number(state.speed.toFixed(2)),
      time: Number(networkEvent.gameTime || state.time)
    },
    payload: {
      intensity: Number(networkEvent.intensity || 1),
      replicate: false
    },
    network: Object.assign({}, networkEvent, { replicate: false })
  };
  dispatchAudioEvent(event);
  return true;
}

window.orbitalCourierAudio = {
  sourceId: audioNetwork.sourceId,
  eventName: "orbital-courier:audio-event",
  unlock: audio.unlock,
  setMuted: audio.setMuted,
  emit: emitAudioEvent,
  receiveNetworkEvent: receiveNetworkAudioEvent,
  recentEvents: () => audioNetwork.log.slice(),
  isUnlocked: audio.isUnlocked,
  supported: audio.supported
};

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
  emitAudioEvent("run_start", {
    positionX: player.position.x,
    lives: state.lives,
    intensity: audio.isUnlocked() ? 1 : 0.7,
    replicate: true
  });
}

function finishGame() {
  state.running = false;
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem("orbital-courier-best", String(state.best));
  hud();
  emitAudioEvent("run_complete", {
    positionX: player.position.x,
    score: Math.floor(state.score),
    best: state.best,
    replicate: true
  });
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

function updateObjects(list, delta, hit, pass) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    item.mesh.position.z += state.speed * delta;
    item.mesh.rotation.x += item.spin * delta;
    item.mesh.rotation.y += item.spin * delta * 0.7;

    if (item.mesh.position.distanceTo(player.position) < item.radius + 0.58) {
      hit(item);
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      list.splice(i, 1);
    } else if (item.mesh.position.z > 8) {
      scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      list.splice(i, 1);
    } else if (!item.passedPlayer && item.mesh.position.z >= player.position.z) {
      item.passedPlayer = true;
      pass?.(item);
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
    updateObjects(hazards, delta, (item) => {
      if (state.grace > 0) return;
      state.lives -= 1;
      state.grace = 1.1;
      emitAudioEvent("shield_hit", {
        positionX: item.mesh.position.x,
        lives: state.lives,
        speed: state.speed,
        intensity: state.lives <= 0 ? 1.25 : 1,
        replicate: true
      });
      if (state.lives <= 0) finishGame();
    }, (item) => {
      const distance = Math.abs(item.mesh.position.x - player.position.x);
      if (state.grace > 0 || distance > 1.45) return;
      emitAudioEvent("near_miss", {
        positionX: item.mesh.position.x,
        intensity: Math.max(0.35, 1 - distance / 1.45),
        replicate: false
      });
    });
    updateObjects(cores, delta, (item) => {
      state.score += 75;
      pulseLight.intensity = 3.2;
      emitAudioEvent("core_collect", {
        positionX: item.mesh.position.x,
        score: Math.floor(state.score),
        intensity: 1,
        replicate: true
      });
    });
    pulseLight.intensity = THREE.MathUtils.damp(pulseLight.intensity, 1.6, 6, delta);
    player.visible = state.grace <= 0 || Math.floor(state.time * 18) % 2 === 0;
    hud();
  } else {
    player.visible = true;
    player.rotation.y += delta * 0.5;
  }

  audio.setMotion(
    state.running,
    state.speed,
    input.pointer ? Math.abs(input.target - player.position.x) / laneLimit : Math.abs(Number(input.right) - Number(input.left))
  );
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

function unlockAudioFromInput() {
  audio.unlock();
}

function startFromControl(event) {
  event?.preventDefault();
  event?.stopPropagation();
  unlockAudioFromInput();
  const now = performance.now();
  if (now - lastControlStartAt < 250) return;
  lastControlStartAt = now;
  startGame();
}

function startFromOverlay(event) {
  if (!overlay.classList.contains("visible")) return;
  startFromControl(event);
}

function startFromDocument(event) {
  if (!overlay.classList.contains("visible")) return;
  if (event.button && event.button !== 0) return;
  startFromControl(event);
}

addEventListener("resize", resize);
addEventListener("keydown", (event) => {
  unlockAudioFromInput();
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
document.addEventListener("pointerdown", unlockAudioFromInput, { capture: true });
document.addEventListener("mousedown", unlockAudioFromInput, { capture: true });
document.addEventListener("click", unlockAudioFromInput, { capture: true });
document.addEventListener("touchstart", unlockAudioFromInput, { capture: true, passive: true });
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudioFromInput();
  if (!state.running && overlay.classList.contains("visible")) {
    startFromControl(event);
    return;
  }
  if (!state.running) return;
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
document.addEventListener("pointerdown", startFromDocument, { capture: true });
document.addEventListener("mousedown", startFromDocument, { capture: true });
document.addEventListener("click", startFromDocument, { capture: true });
document.addEventListener("touchstart", startFromDocument, { capture: true, passive: false });

resize();
hud();
requestAnimationFrame(frame);
startGame();
