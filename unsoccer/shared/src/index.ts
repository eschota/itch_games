export const GAME_VERSION = "v0.0.055";
export const ROOM_ID = "unsoccer-default-room";
export const MAX_ACTIVE_PLAYERS = 10;
export const MAX_ROOM_CLIENTS = 32;
export const SERVER_TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const DAY_CYCLE_SECONDS = 300;
export const DAY_START_SECONDS = 6 * 60 * 60;
export const FIELD_WIDTH = 48;
export const FIELD_LENGTH = 72;
export const GOAL_WIDTH = 12;
export const GOAL_DEPTH = 3.2;
export const PLAYER_RADIUS = 0.52;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_SPEED = 8.2;
export const PLAYER_INPUT_AXIS_ACCELERATION = 18;
export const PLAYER_INPUT_AXIS_RELEASE_DECAY = 5;
export const PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION = 32;
export const PLAYER_MOVEMENT_ACCELERATION = 24;
export const PLAYER_MOVEMENT_DECELERATION = 8;
export const PLAYER_MOVEMENT_TURN_ACCELERATION = 34;
export const PLAYER_SPRINT_MULTIPLIER = 1.58;
export const PLAYER_EXHAUSTED_SPEED_MULTIPLIER = 0.46;
export const PLAYER_EXHAUSTED_RECOVERY_THRESHOLD = 20;
export const PLAYER_STAMINA_MAX = 100;
export const PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND = 24;
export const PLAYER_STAMINA_JUMP_COST = 0;
export const PLAYER_STAMINA_HIT_COST = 0;
export const PLAYER_STAMINA_RECOVERY_DELAY_MS = 700;
export const PLAYER_STAMINA_RECOVERY_PER_SECOND = 17;
export const PLAYER_JUMP_STRENGTH = 6.1;
export const PLAYER_JUMP_COOLDOWN_MS = 520;
export const PLAYER_GRAVITY = 18;
export const PLAYER_AIR_CONTROL_MULTIPLIER = 0.82;
export const PLAYER_RAGDOLL_MIN_MS = 1600;
export const PLAYER_RAGDOLL_FRICTION_PER_SECOND = 1.35;
export const PLAYER_RAGDOLL_HIT_KNOCKBACK = 11.8;
export const PLAYER_RAGDOLL_VERTICAL_KNOCKBACK = 4.4;
export const BALL_RADIUS = 0.24;
export const BALL_DENSITY = 3.6;
export const BALL_RESTITUTION = 1.05;
export const KICK_RANGE = 1.25;
export const FOOT_KICK_ASSIST_RANGE = 1.35;
export const HAND_KICK_ASSIST_RANGE = 1.15;
export const HEAD_KICK_ASSIST_RANGE = 1.05;
export const FOOT_KICK_STRENGTH = 2.4;
export const HAND_HIT_STRENGTH = 1.35;
export const HEAD_KICK_STRENGTH = 3.15;
export const KICK_COOLDOWN_MS = 320;
export const HAND_COOLDOWN_MS = 420;
export const HEAD_COOLDOWN_MS = 520;
export const BALL_HIT_BASE_POWER_MULTIPLIER = 2;
export const LEFT_KICK_CHARGE_SECONDS = 1;
export const LEFT_KICK_FULL_CHARGE_POWER_MULTIPLIER = 4;
export const FOOT_PLAYER_STAMINA_DAMAGE = 12;
export const HAND_PLAYER_STAMINA_DAMAGE = 20;
export const HEAD_PLAYER_STAMINA_DAMAGE = 16;
export const AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS = 6;
export const BODY_BUMP_RANGE = 0.62;
export const BODY_BUMP_MIN_SPEED = 3.1;
export const BODY_BUMP_STRENGTH = 0.18;
export const BODY_BUMP_COOLDOWN_MS = 240;
export const PLAYER_BALL_COLLISION_RESTITUTION = 1.08;
export const PLAYER_BALL_COLLISION_PUSH = 0.42;
export const PLAYER_BALL_COLLISION_SKIN = 0.035;
export const BALL_POSSESSION_RANGE = 0.98;
export const BALL_POSSESSION_CARRY_DISTANCE = 0.86;
export const BALL_POSSESSION_CARRY_HEIGHT = 0.04;
export const BALL_POSSESSION_MAX_CAPTURE_SPEED = 8.5;
export const BALL_POSSESSION_MAX_CAPTURE_HEIGHT = 0.72;
export const BALL_POSSESSION_RECAPTURE_DELAY_MS = 360;
export const BALL_POSSESSION_LOW_SHOT_SPEED = 11.2;
export const BALL_POSSESSION_UPPER_SHOT_SPEED = 10.2;
export const BALL_POSSESSION_LOW_SHOT_LIFT = 0.22;
export const BALL_POSSESSION_UPPER_SHOT_LIFT = 4.2;
export const BALL_POSSESSION_STRONG_MULTIPLIER = 1.85;
export const BALL_POSSESSION_BASE_POWER_MULTIPLIER = 4;
export const BALL_POSSESSION_FULL_POWER_MULTIPLIER = 8;
export const JUMP_KICK_DASH_SPEED = 7.4;
export const JUMP_KICK_HIT_RANGE_BONUS = 0.95;
export const POST_GOAL_CELEBRATION_MS = 5000;
export const POST_GOAL_BALL_RETURN_MS = 1000;
export const KICKOFF_COUNTDOWN_MS = 1200;
export const CELEBRATION_WINDOW_MS = POST_GOAL_CELEBRATION_MS;
export const CELEBRATION_DURATION_MS = 2600;

export type TeamId = 0 | 1;
export type PlayerRole = "player" | "spectator";
export type PlayerController = "human" | "bot" | "test";
export type KickKind = "left" | "hand" | "head" | "body" | "jump";
export type CelebrationKind = "celebrate1" | "celebrate2" | "celebrate3";
export type WeatherKind = "clear" | "dawn" | "rain" | "snow";
export type HazardType = "puddle" | "slush" | "snowbank";
export type AudioEventKind = "roster" | "kick" | "goal" | "countdown" | "celebration";
export type RosterAudioChange = "join" | "leave" | "spectator";
export type StrikeSide = "left" | "right";

export const EMOTION_CHOICES = [
  { id: "angry", emoji: "😡", label: "Злость" },
  { id: "heart", emoji: "❤️", label: "Сердце" },
  { id: "laugh", emoji: "😂", label: "Смех" },
  { id: "wow", emoji: "😮", label: "Вау" },
  { id: "sad", emoji: "😢", label: "Грусть" },
  { id: "fire", emoji: "🔥", label: "Огонь" },
  { id: "gg", emoji: "🤝", label: "Хорошая игра" },
  { id: "goal", emoji: "⚽", label: "Гол" },
  { id: "crown", emoji: "👑", label: "Корона" }
] as const;

export const DEFAULT_USER_PICS = ["⚽", "⭐", "🔥", "👑", "😎", "🤝", "🚀", "🎯", "🧤"] as const;

export type EmotionId = typeof EMOTION_CHOICES[number]["id"];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  kickLeft: number;
  kickLeftHeld: boolean;
  kickLeftCharge: number;
  kickRight: number;
  head: number;
  jump: number;
  sprint: boolean;
  yaw: number;
}

export interface PlayerProfileSnapshot {
  nickname: string;
  skinId: string;
  userPic: string;
}

export interface PlayerEmotionSnapshot {
  id: EmotionId;
  emoji: string;
  label: string;
  appliedAt: number;
  expiresAt: number;
}

export interface ChatMessageSnapshot {
  id: number;
  playerId: string;
  name: string;
  userPic: string;
  text: string;
  createdAt: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  profile: PlayerProfileSnapshot;
  userPic: string;
  controller: PlayerController;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  goals: number;
  characterId: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  stamina: number;
  sprinting: boolean;
  airborne: boolean;
  exhausted: boolean;
  ragdoll: boolean;
  ragdollAt: number;
  grounded: boolean;
  lastAction: KickKind | null;
  lastActionSide: StrikeSide | null;
  lastActionAt: number;
  trailingFoot: StrikeSide;
  stancePhase: number;
  celebration: CelebrationKind | null;
  celebrationAt: number;
  celebrationAvailableUntil: number;
  emotion: PlayerEmotionSnapshot | null;
}

export interface BallSnapshot {
  position: Vec3;
  velocity: Vec3;
  variant: number;
  ownerPlayerId: string | null;
}

export type GoalResetPhase = "none" | "celebration" | "returning" | "kickoff";

export interface GoalResetSnapshot {
  phase: GoalResetPhase;
  scoringTeam: TeamId | null;
  elapsedMs: number;
  remainingMs: number;
  returnProgress: number;
}

export interface HazardSnapshot {
  id: string;
  type: HazardType;
  position: Vec3;
  radius: number;
  strength: number;
}

export interface WeatherSnapshot {
  kind: WeatherKind;
  label: string;
  intensity: number;
  wind: Vec3;
  hazards: HazardSnapshot[];
  nextChangeInMs: number;
}

export interface ScoreState {
  blue: number;
  orange: number;
}

export interface ServerAudioEventBase {
  id: number;
  serverTime: number;
  tick: number;
}

export interface RosterAudioEvent extends ServerAudioEventBase {
  kind: "roster";
  change: RosterAudioChange;
  playerId: string;
  role: PlayerRole;
}

export interface KickAudioEvent extends ServerAudioEventBase {
  kind: "kick";
  kick: KickKind;
  playerId: string;
  position: Vec3;
  speed: number;
}

export interface GoalAudioEvent extends ServerAudioEventBase {
  kind: "goal";
  team: TeamId;
}

export interface CountdownAudioEvent extends ServerAudioEventBase {
  kind: "countdown";
  remainingSeconds: number;
}

export interface CelebrationAudioEvent extends ServerAudioEventBase {
  kind: "celebration";
  celebration: CelebrationKind;
  playerId: string;
  position: Vec3;
}

export type ServerAudioEvent = RosterAudioEvent | KickAudioEvent | GoalAudioEvent | CountdownAudioEvent | CelebrationAudioEvent;

export interface JoinRequest {
  name?: string;
  clientFingerprint?: string;
  profile?: Partial<PlayerProfileSnapshot>;
  skinId?: string;
  userPic?: string;
}

export interface JoinAccepted {
  id: string;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  goals: number;
  characterId: string;
  profile: PlayerProfileSnapshot;
  version: string;
  maxActivePlayers: number;
  maxRoomClients: number;
}

export interface ServerState {
  version: string;
  settingsRevision: number;
  serverTime: number;
  dayTimeSeconds: number;
  settings: GameSettings;
  tick: number;
  players: PlayerSnapshot[];
  ball: BallSnapshot;
  score: ScoreState;
  message: string;
  countdown: number;
  goalReset: GoalResetSnapshot;
  weather: WeatherSnapshot;
  chatMessages: ChatMessageSnapshot[];
  audioEvents: ServerAudioEvent[];
}

export interface ClientInputMessage {
  input: InputState;
  sequence: number;
}

export interface ServerInfo {
  ok: boolean;
  version: string;
  settingsRevision: number;
  activePlayers: number;
  botPlayers: number;
  activeBotPlayers: number;
  dormantBotPlayers: number;
  botReuseCount: number;
  botRepairCount: number;
  invalidActiveBotPlayers: number;
  desiredBotPlayers: number;
  nonBotActiveSlots: number;
  activeHumanPlayers: number;
  activeTestPlayers: number;
  staleHumanClients: number;
  staleHttpClients: number;
  staleWebSocketClients: number;
  botFillSuppressionReason: string;
  humanClients: number;
  connectedClients: number;
  maxActivePlayers: number;
  maxRoomClients: number;
  botsRuntimeEnabled: boolean;
  botTargetActivePlayers: number;
  httpClientStaleMs: number;
  websocketClientStaleMs: number;
  testMode: boolean;
  transports?: {
    websocket: boolean;
    http: boolean;
  };
}

export const DEFAULT_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  kickLeft: 0,
  kickLeftHeld: false,
  kickLeftCharge: 0,
  kickRight: 0,
  head: 0,
  jump: 0,
  sprint: false,
  yaw: 0
};

export const CHARACTER_ROSTER = [
  "6288738",
  "6299851",
  "6243756",
  "6270571",
  "6324128",
  "6244727",
  "6304269",
  "6298522",
  "6255142",
  "6294728"
] as const;

export interface VisualColorMaterialSettings {
  color: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
}

export interface VisualFloodlightSettings {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  color: string;
  angleDeg: number;
  distance: number;
  penumbra: number;
  decay: number;
  coneRadius: number;
  coneOpacity: number;
  flickerDepth: number;
  flickerSpeed: number;
  widthScale: number;
  intensityBias: number;
}

export interface VisualSettings {
  renderer: {
    exposureBase: number;
    exposureDay: number;
    exposureSunset: number;
    precipitationExposurePenalty: number;
    shadows: boolean;
  };
  sky: {
    dayColor: string;
    sunsetColor: string;
    nightColor: string;
    fogDayColor: string;
    fogNightColor: string;
    snowFogColor: string;
    domeFogMix: number;
    fogNearBase: number;
    fogNearDay: number;
    fogFarBase: number;
    fogFarDay: number;
    fogSnowPenalty: number;
  };
  sun: {
    intensityBase: number;
    intensityDay: number;
    intensitySunset: number;
    precipitationPenalty: number;
    orbitRadius: number;
    visualOrbitRadius: number;
    visualHeight: number;
    markerScaleBase: number;
    markerScaleDay: number;
    markerScaleSunset: number;
    glowOpacityBase: number;
    glowOpacityDay: number;
    glowOpacitySunset: number;
  };
  moon: {
    color: string;
    opacityBase: number;
    opacityNight: number;
  };
  ambient: {
    hemiSkyColor: string;
    hemiGroundColor: string;
    hemiBase: number;
    hemiDay: number;
    hemiPrecipitationPenalty: number;
    fillBase: number;
    fillDay: number;
    fillNight: number;
    fillSnow: number;
    bounceColor: string;
    bounceBase: number;
    bounceDay: number;
    bounceSunset: number;
    bounceNight: number;
    rimColor: string;
    rimBase: number;
    rimNight: number;
    rimSunset: number;
  };
  floodlights: {
    powerNightStart: number;
    powerNightEnd: number;
    intensityBase: number;
    precipitationBoost: number;
    lightThreshold: number;
    coneThreshold: number;
    lights: VisualFloodlightSettings[];
  };
  materials: {
    field: VisualColorMaterialSettings;
    fieldStripe: VisualColorMaterialSettings;
    marking: VisualColorMaterialSettings;
    markingSecondary: VisualColorMaterialSettings;
    goalPost: VisualColorMaterialSettings;
    mast: VisualColorMaterialSettings;
    courtyard: VisualColorMaterialSettings;
    fence: VisualColorMaterialSettings;
    road: VisualColorMaterialSettings;
    sidewalk: VisualColorMaterialSettings;
    curb: VisualColorMaterialSettings;
    foliage: VisualColorMaterialSettings;
    metal: VisualColorMaterialSettings;
    brightMetal: VisualColorMaterialSettings;
    fallbackPlayerBlue: VisualColorMaterialSettings;
    fallbackPlayerOrange: VisualColorMaterialSettings;
    ball: VisualColorMaterialSettings;
  };
  weather: {
    rainLightPenalty: number;
    snowFogBoost: number;
    conePrecipitationBoost: number;
  };
}

export interface GameSettings {
  fieldWidth: number;
  fieldLength: number;
  goalWidth: number;
  goalDepth: number;
  goalPostRadius: number;
  goalCrossbarHeight: number;
  goalCrossbarRadius: number;
  maxActivePlayers: number;
  dayCycleSeconds: number;
  dayStartSeconds: number;
  sunIntensity: number;
  moonIntensity: number;
  ambientIntensity: number;
  floodlightIntensity: number;
  toneMappingExposure: number;
  cameraDistance: number;
  visual: VisualSettings;
  weatherChangeMinMs: number;
  weatherChangeMaxMs: number;
  weatherDawnWeight: number;
  weatherClearWeight: number;
  weatherRainWeight: number;
  weatherSnowWeight: number;
  playerRadius: number;
  playerHeight: number;
  playerSpeed: number;
  playerInputAxisAcceleration: number;
  playerInputAxisReleaseDecay: number;
  playerInputAxisOppositeAcceleration: number;
  playerMovementAcceleration: number;
  playerMovementDeceleration: number;
  playerMovementTurnAcceleration: number;
  playerSprintMultiplier: number;
  playerExhaustedSpeedMultiplier: number;
  playerExhaustedRecoveryThreshold: number;
  playerStaminaMax: number;
  playerStaminaSprintDrainPerSecond: number;
  playerStaminaJumpCost: number;
  playerStaminaHitCost: number;
  playerStaminaRecoveryDelayMs: number;
  playerStaminaRecoveryPerSecond: number;
  playerHitRecoveryDelayMs: number;
  playerJumpStrength: number;
  playerJumpCooldownMs: number;
  playerGravity: number;
  playerAirControlMultiplier: number;
  playerRagdollMinMs: number;
  playerRagdollFrictionPerSecond: number;
  playerRagdollHitKnockback: number;
  playerRagdollVerticalKnockback: number;
  ballRadius: number;
  ballDensity: number;
  ballRestitution: number;
  kickRange: number;
  footKickAssistRange: number;
  handKickAssistRange: number;
  headKickAssistRange: number;
  footKickStrength: number;
  handHitStrength: number;
  headKickStrength: number;
  kickCooldownMs: number;
  handCooldownMs: number;
  headCooldownMs: number;
  ballHitBasePowerMultiplier: number;
  leftKickInputBufferMs: number;
  leftKickChargeSeconds: number;
  leftKickFullChargePowerMultiplier: number;
  footPlayerStaminaDamage: number;
  handPlayerStaminaDamage: number;
  headPlayerStaminaDamage: number;
  airborneHeadStaminaDamageBonus: number;
  bodyBumpRange: number;
  bodyBumpMinSpeed: number;
  bodyBumpStrength: number;
  bodyBumpCooldownMs: number;
  playerBallCollisionRestitution: number;
  playerBallCollisionPush: number;
  playerBallCollisionSkin: number;
  ballPossessionEnabled: boolean;
  ballPossessionRange: number;
  ballPossessionCarryDistance: number;
  ballPossessionCarryHeight: number;
  ballPossessionMaxCaptureSpeed: number;
  ballPossessionMaxCaptureHeight: number;
  ballPossessionRecaptureDelayMs: number;
  ballPossessionLowShotSpeed: number;
  ballPossessionUpperShotSpeed: number;
  ballPossessionLowShotLift: number;
  ballPossessionUpperShotLift: number;
  ballPossessionStrongMultiplier: number;
  ballPossessionBasePowerMultiplier: number;
  ballPossessionFullPowerMultiplier: number;
  friendlyFireEnabled: boolean;
  playerHitFullKnockoutEnabled: boolean;
  jumpKickDashSpeed: number;
  jumpKickHitRangeBonus: number;
  propImpulseMultiplier: number;
  propDamping: number;
  propReturnStrength: number;
  propMaxDisplacementMultiplier: number;
  postGoalCelebrationMs: number;
  postGoalBallReturnMs: number;
  kickoffCountdownMs: number;
  celebrationWindowMs: number;
  celebrationDurationMs: number;
  httpClientStaleMs: number;
  websocketClientStaleMs: number;
  botsEnabled: boolean;
  botTargetActivePlayers: number;
  botAggression: number;
  botCombatAggressionThreshold: number;
  botCombatCollapseGuardRatio: number;
  botCombatCollapseGuardMinDisabled: number;
  botShootDistance: number;
  botFightDistance: number;
  botChaseDistance: number;
  botSprintDistance: number;
  botShotAlignmentMin: number;
  botSupportReleaseDistance: number;
  botKickIntervalMs: number;
  botHandIntervalMs: number;
  botHeadIntervalMs: number;
  botJumpChance: number;
}

export type GameSettingInput = "number" | "range" | "checkbox" | "json";

export interface GameSettingSchemaItem {
  key: keyof GameSettings;
  group: string;
  label: string;
  description: string;
  input: GameSettingInput;
  min?: number;
  max?: number;
  step?: number;
  restartPhysics?: boolean;
}

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  renderer: {
    exposureBase: 1.12,
    exposureDay: 0.9,
    exposureSunset: 0.18,
    precipitationExposurePenalty: 0.16,
    shadows: true
  },
  sky: {
    dayColor: "#8fd7ff",
    sunsetColor: "#ff9b5a",
    nightColor: "#07110f",
    fogDayColor: "#b7ede0",
    fogNightColor: "#07110f",
    snowFogColor: "#d9f3ff",
    domeFogMix: 0.18,
    fogNearBase: 32,
    fogNearDay: 18,
    fogFarBase: 86,
    fogFarDay: 34,
    fogSnowPenalty: 8
  },
  sun: {
    intensityBase: 1.05,
    intensityDay: 4.15,
    intensitySunset: 1.05,
    precipitationPenalty: 0.38,
    orbitRadius: 46,
    visualOrbitRadius: 70,
    visualHeight: 42,
    markerScaleBase: 0.82,
    markerScaleDay: 0.34,
    markerScaleSunset: 0.28,
    glowOpacityBase: 0.12,
    glowOpacityDay: 0.34,
    glowOpacitySunset: 0.3
  },
  moon: {
    color: "#bfd6ff",
    opacityBase: 0.08,
    opacityNight: 0.78
  },
  ambient: {
    hemiSkyColor: "#d8fff2",
    hemiGroundColor: "#172822",
    hemiBase: 1.05,
    hemiDay: 2.1,
    hemiPrecipitationPenalty: 0.16,
    fillBase: 0.34,
    fillDay: 0.58,
    fillNight: 0.12,
    fillSnow: 0.02,
    bounceColor: "#9fc7b3",
    bounceBase: 0.48,
    bounceDay: 1.12,
    bounceSunset: 0.42,
    bounceNight: 0.18,
    rimColor: "#8bbcff",
    rimBase: 0.28,
    rimNight: 0.72,
    rimSunset: 0.24
  },
  floodlights: {
    powerNightStart: 0.18,
    powerNightEnd: 0.82,
    intensityBase: 3.1,
    precipitationBoost: 0.28,
    lightThreshold: 0.035,
    coneThreshold: 0.055,
    lights: [
      { x: -29.9, y: 12.9, z: -40.8, targetX: 16.32, targetY: 0.18, targetZ: 23.76, color: "#eaf4ff", angleDeg: 63.2, distance: 96, penumbra: 0.88, decay: 1.05, coneRadius: 13.4, coneOpacity: 0.095, flickerDepth: 0.07, flickerSpeed: 3.4, widthScale: 0.95, intensityBias: 0.94 },
      { x: 29.9, y: 12.9, z: -40.8, targetX: -16.32, targetY: 0.18, targetZ: 23.76, color: "#fff0d4", angleDeg: 63.2, distance: 96, penumbra: 0.88, decay: 1.05, coneRadius: 13.4, coneOpacity: 0.095, flickerDepth: 0.088, flickerSpeed: 3.77, widthScale: 0.985, intensityBias: 0.985 },
      { x: -29.9, y: 12.9, z: 40.8, targetX: 16.32, targetY: 0.18, targetZ: -23.76, color: "#dcefff", angleDeg: 63.2, distance: 96, penumbra: 0.88, decay: 1.05, coneRadius: 13.4, coneOpacity: 0.095, flickerDepth: 0.106, flickerSpeed: 4.14, widthScale: 1.02, intensityBias: 1.03 },
      { x: 29.9, y: 12.9, z: 40.8, targetX: -16.32, targetY: 0.18, targetZ: -23.76, color: "#f7f2ff", angleDeg: 63.2, distance: 96, penumbra: 0.88, decay: 1.05, coneRadius: 13.4, coneOpacity: 0.095, flickerDepth: 0.124, flickerSpeed: 4.51, widthScale: 1.055, intensityBias: 1.075 }
    ]
  },
  materials: {
    field: { color: "#19845f", roughness: 0.9 },
    fieldStripe: { color: "#1d966c", roughness: 0.92 },
    marking: { color: "#f4fff6", opacity: 0.96 },
    markingSecondary: { color: "#d9f7e4", opacity: 0.82 },
    goalPost: { color: "#f0f3ec", roughness: 0.38, metalness: 0.16 },
    mast: { color: "#aebbc4", roughness: 0.36, metalness: 0.36 },
    courtyard: { color: "#36413e", roughness: 0.96 },
    fence: { color: "#20342e", roughness: 0.72, metalness: 0.16 },
    road: { color: "#202927", roughness: 0.94 },
    sidewalk: { color: "#606f68", roughness: 0.9 },
    curb: { color: "#d8dfd7", roughness: 0.72 },
    foliage: { color: "#3d8c58", roughness: 0.92 },
    metal: { color: "#28302f", roughness: 0.62, metalness: 0.22 },
    brightMetal: { color: "#b8c5c7", roughness: 0.38, metalness: 0.34 },
    fallbackPlayerBlue: { color: "#bfe5ff", roughness: 0.5 },
    fallbackPlayerOrange: { color: "#ffd37a", roughness: 0.5 },
    ball: { color: "#ffffff", roughness: 0.5, metalness: 0.03 }
  },
  weather: {
    rainLightPenalty: 0.38,
    snowFogBoost: 0.1,
    conePrecipitationBoost: 0.035
  }
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  fieldWidth: FIELD_WIDTH,
  fieldLength: FIELD_LENGTH,
  goalWidth: GOAL_WIDTH,
  goalDepth: GOAL_DEPTH,
  goalPostRadius: 0.19,
  goalCrossbarHeight: 2.18,
  goalCrossbarRadius: 0.16,
  maxActivePlayers: MAX_ACTIVE_PLAYERS,
  dayCycleSeconds: DAY_CYCLE_SECONDS,
  dayStartSeconds: DAY_START_SECONDS,
  sunIntensity: 1,
  moonIntensity: 1,
  ambientIntensity: 1,
  floodlightIntensity: 1,
  toneMappingExposure: 1,
  cameraDistance: 12.4,
  visual: DEFAULT_VISUAL_SETTINGS,
  weatherChangeMinMs: 60000,
  weatherChangeMaxMs: 120000,
  weatherDawnWeight: 3,
  weatherClearWeight: 12,
  weatherRainWeight: 1,
  weatherSnowWeight: 1,
  playerRadius: PLAYER_RADIUS,
  playerHeight: PLAYER_HEIGHT,
  playerSpeed: PLAYER_SPEED,
  playerInputAxisAcceleration: PLAYER_INPUT_AXIS_ACCELERATION,
  playerInputAxisReleaseDecay: PLAYER_INPUT_AXIS_RELEASE_DECAY,
  playerInputAxisOppositeAcceleration: PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION,
  playerMovementAcceleration: PLAYER_MOVEMENT_ACCELERATION,
  playerMovementDeceleration: PLAYER_MOVEMENT_DECELERATION,
  playerMovementTurnAcceleration: PLAYER_MOVEMENT_TURN_ACCELERATION,
  playerSprintMultiplier: PLAYER_SPRINT_MULTIPLIER,
  playerExhaustedSpeedMultiplier: PLAYER_EXHAUSTED_SPEED_MULTIPLIER,
  playerExhaustedRecoveryThreshold: PLAYER_EXHAUSTED_RECOVERY_THRESHOLD,
  playerStaminaMax: PLAYER_STAMINA_MAX,
  playerStaminaSprintDrainPerSecond: PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND,
  playerStaminaJumpCost: PLAYER_STAMINA_JUMP_COST,
  playerStaminaHitCost: PLAYER_STAMINA_HIT_COST,
  playerStaminaRecoveryDelayMs: PLAYER_STAMINA_RECOVERY_DELAY_MS,
  playerStaminaRecoveryPerSecond: PLAYER_STAMINA_RECOVERY_PER_SECOND,
  playerHitRecoveryDelayMs: 600,
  playerJumpStrength: PLAYER_JUMP_STRENGTH,
  playerJumpCooldownMs: PLAYER_JUMP_COOLDOWN_MS,
  playerGravity: PLAYER_GRAVITY,
  playerAirControlMultiplier: PLAYER_AIR_CONTROL_MULTIPLIER,
  playerRagdollMinMs: PLAYER_RAGDOLL_MIN_MS,
  playerRagdollFrictionPerSecond: PLAYER_RAGDOLL_FRICTION_PER_SECOND,
  playerRagdollHitKnockback: PLAYER_RAGDOLL_HIT_KNOCKBACK,
  playerRagdollVerticalKnockback: PLAYER_RAGDOLL_VERTICAL_KNOCKBACK,
  ballRadius: BALL_RADIUS,
  ballDensity: BALL_DENSITY,
  ballRestitution: BALL_RESTITUTION,
  kickRange: KICK_RANGE,
  footKickAssistRange: FOOT_KICK_ASSIST_RANGE,
  handKickAssistRange: HAND_KICK_ASSIST_RANGE,
  headKickAssistRange: HEAD_KICK_ASSIST_RANGE,
  footKickStrength: FOOT_KICK_STRENGTH,
  handHitStrength: HAND_HIT_STRENGTH,
  headKickStrength: HEAD_KICK_STRENGTH,
  kickCooldownMs: KICK_COOLDOWN_MS,
  handCooldownMs: HAND_COOLDOWN_MS,
  headCooldownMs: HEAD_COOLDOWN_MS,
  ballHitBasePowerMultiplier: BALL_HIT_BASE_POWER_MULTIPLIER,
  leftKickInputBufferMs: 180,
  leftKickChargeSeconds: LEFT_KICK_CHARGE_SECONDS,
  leftKickFullChargePowerMultiplier: LEFT_KICK_FULL_CHARGE_POWER_MULTIPLIER,
  footPlayerStaminaDamage: FOOT_PLAYER_STAMINA_DAMAGE,
  handPlayerStaminaDamage: HAND_PLAYER_STAMINA_DAMAGE,
  headPlayerStaminaDamage: HEAD_PLAYER_STAMINA_DAMAGE,
  airborneHeadStaminaDamageBonus: AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS,
  bodyBumpRange: BODY_BUMP_RANGE,
  bodyBumpMinSpeed: BODY_BUMP_MIN_SPEED,
  bodyBumpStrength: BODY_BUMP_STRENGTH,
  bodyBumpCooldownMs: BODY_BUMP_COOLDOWN_MS,
  playerBallCollisionRestitution: PLAYER_BALL_COLLISION_RESTITUTION,
  playerBallCollisionPush: PLAYER_BALL_COLLISION_PUSH,
  playerBallCollisionSkin: PLAYER_BALL_COLLISION_SKIN,
  ballPossessionEnabled: true,
  ballPossessionRange: BALL_POSSESSION_RANGE,
  ballPossessionCarryDistance: BALL_POSSESSION_CARRY_DISTANCE,
  ballPossessionCarryHeight: BALL_POSSESSION_CARRY_HEIGHT,
  ballPossessionMaxCaptureSpeed: BALL_POSSESSION_MAX_CAPTURE_SPEED,
  ballPossessionMaxCaptureHeight: BALL_POSSESSION_MAX_CAPTURE_HEIGHT,
  ballPossessionRecaptureDelayMs: BALL_POSSESSION_RECAPTURE_DELAY_MS,
  ballPossessionLowShotSpeed: BALL_POSSESSION_LOW_SHOT_SPEED,
  ballPossessionUpperShotSpeed: BALL_POSSESSION_UPPER_SHOT_SPEED,
  ballPossessionLowShotLift: BALL_POSSESSION_LOW_SHOT_LIFT,
  ballPossessionUpperShotLift: BALL_POSSESSION_UPPER_SHOT_LIFT,
  ballPossessionStrongMultiplier: BALL_POSSESSION_STRONG_MULTIPLIER,
  ballPossessionBasePowerMultiplier: BALL_POSSESSION_BASE_POWER_MULTIPLIER,
  ballPossessionFullPowerMultiplier: BALL_POSSESSION_FULL_POWER_MULTIPLIER,
  friendlyFireEnabled: true,
  playerHitFullKnockoutEnabled: true,
  jumpKickDashSpeed: JUMP_KICK_DASH_SPEED,
  jumpKickHitRangeBonus: JUMP_KICK_HIT_RANGE_BONUS,
  propImpulseMultiplier: 1,
  propDamping: 2.4,
  propReturnStrength: 1.25,
  propMaxDisplacementMultiplier: 1,
  postGoalCelebrationMs: POST_GOAL_CELEBRATION_MS,
  postGoalBallReturnMs: POST_GOAL_BALL_RETURN_MS,
  kickoffCountdownMs: KICKOFF_COUNTDOWN_MS,
  celebrationWindowMs: CELEBRATION_WINDOW_MS,
  celebrationDurationMs: CELEBRATION_DURATION_MS,
  httpClientStaleMs: 12000,
  websocketClientStaleMs: 12000,
  botsEnabled: true,
  botTargetActivePlayers: 3,
  botAggression: 0.5,
  botCombatAggressionThreshold: 0.5,
  botCombatCollapseGuardRatio: 0.25,
  botCombatCollapseGuardMinDisabled: 2,
  botShootDistance: 4.1,
  botFightDistance: 1.52,
  botChaseDistance: 5.7,
  botSprintDistance: 6.6,
  botShotAlignmentMin: 0.14,
  botSupportReleaseDistance: 2.65,
  botKickIntervalMs: 430,
  botHandIntervalMs: 950,
  botHeadIntervalMs: 900,
  botJumpChance: 0.018
};

export const GAME_SETTINGS_SCHEMA: GameSettingSchemaItem[] = [
  { key: "fieldWidth", group: "Поле", label: "Ширина поля", description: "Игровая ширина поля в метрах мира. Пересобирает физические границы и размещение погодных препятствий.", input: "range", min: 24, max: 96, step: 1, restartPhysics: true },
  { key: "fieldLength", group: "Поле", label: "Длина поля", description: "Игровая длина поля в метрах мира. Пересобирает ворота, границы, спавны и погодные препятствия.", input: "range", min: 36, max: 144, step: 1, restartPhysics: true },
  { key: "goalWidth", group: "Поле", label: "Ширина ворот", description: "Ширина открытого створа ворот. Больше значение облегчает голы.", input: "range", min: 6, max: 22, step: 0.25, restartPhysics: true },
  { key: "goalDepth", group: "Поле", label: "Глубина ворот", description: "Насколько далеко ворота уходят за лицевую линию. Влияет на удержание мяча и проверки сброса.", input: "range", min: 1.5, max: 8, step: 0.1, restartPhysics: true },
  { key: "goalPostRadius", group: "Поле", label: "Толщина штанг", description: "Радиус физического коллайдера штанг. Чем выше значение, тем сильнее отскок от штанги.", input: "range", min: 0.05, max: 0.35, step: 0.01, restartPhysics: true },
  { key: "goalCrossbarHeight", group: "Поле", label: "Высота перекладины", description: "Высота перекладины и верхней границы легального створа ворот.", input: "range", min: 1.5, max: 3.2, step: 0.01, restartPhysics: true },
  { key: "goalCrossbarRadius", group: "Поле", label: "Толщина перекладины", description: "Радиус физического коллайдера перекладины.", input: "range", min: 0.04, max: 0.28, step: 0.01, restartPhysics: true },
  { key: "maxActivePlayers", group: "Матч", label: "Активные игроки", description: "Максимум активных игроков на поле, включая ботов.", input: "range", min: 1, max: MAX_ACTIVE_PLAYERS, step: 1 },
  { key: "dayCycleSeconds", group: "Мир", label: "Длина суток", description: "Сколько реальных секунд длится полный цикл день/ночь.", input: "range", min: 60, max: 900, step: 5 },
  { key: "dayStartSeconds", group: "Мир", label: "Стартовое время", description: "Время суток при запуске сервера в секундах от полуночи. 21600 значит 06:00, рассвет.", input: "number", min: 0, max: 86399, step: 60 },
  { key: "sunIntensity", group: "Мир", label: "Яркость солнца", description: "Множитель прямого солнечного света и видимого свечения солнца.", input: "range", min: 0, max: 4, step: 0.01 },
  { key: "moonIntensity", group: "Мир", label: "Яркость луны", description: "Множитель видимого маркера луны ночью.", input: "range", min: 0, max: 3, step: 0.01 },
  { key: "ambientIntensity", group: "Мир", label: "Фоновый свет", description: "Множитель рассеянного света, небесной заливки и отраженного света двора.", input: "range", min: 0.1, max: 3, step: 0.01 },
  { key: "floodlightIntensity", group: "Мир", label: "Мощность прожекторов", description: "Множитель ночных прожекторов и объемных световых конусов.", input: "range", min: 0, max: 4, step: 0.01 },
  { key: "toneMappingExposure", group: "Мир", label: "Экспозиция камеры", description: "Множитель экспозиции tone mapping в рендерере.", input: "range", min: 0.35, max: 2.4, step: 0.01 },
  { key: "cameraDistance", group: "Camera", label: "Player camera distance", description: "Gameplay follow camera distance from the anchored player. Edited through /viz/ and saved to game-settings.json.", input: "range", min: 8, max: 24, step: 0.1 },
  { key: "visual", group: "Visual", label: "Lookdev JSON", description: "Full lookdev block edited through /viz/.", input: "json" },
  { key: "weatherChangeMinMs", group: "Мир", label: "Мин. интервал погоды", description: "Минимум миллисекунд до следующей смены погоды.", input: "number", min: 10000, max: 600000, step: 1000 },
  { key: "weatherChangeMaxMs", group: "Мир", label: "Макс. интервал погоды", description: "Максимум миллисекунд до следующей смены погоды.", input: "number", min: 10000, max: 900000, step: 1000 },
  { key: "weatherDawnWeight", group: "Мир", label: "Вес рассветной погоды", description: "Относительная вероятность сухой рассветной погоды при ротации.", input: "range", min: 0, max: 24, step: 1 },
  { key: "weatherClearWeight", group: "Мир", label: "Вес ясной погоды", description: "Относительная вероятность ясной яркой погоды. Держи высоким, если игра должна чаще быть солнечной.", input: "range", min: 0, max: 32, step: 1 },
  { key: "weatherRainWeight", group: "Мир", label: "Вес дождя", description: "Относительная вероятность дождя и луж.", input: "range", min: 0, max: 16, step: 1 },
  { key: "weatherSnowWeight", group: "Мир", label: "Вес снега", description: "Относительная вероятность снега, слякоти и сугробов.", input: "range", min: 0, max: 16, step: 1 },
  { key: "playerRadius", group: "Игрок", label: "Радиус игрока", description: "Радиус серверного коллайдера игрока. Влияет на контакты, удары и обход мяча.", input: "range", min: 0.25, max: 1.2, step: 0.01, restartPhysics: true },
  { key: "playerHeight", group: "Игрок", label: "Рост игрока", description: "Высота серверного коллайдера игрока и базовая высота контактов.", input: "range", min: 1, max: 2.4, step: 0.01, restartPhysics: true },
  { key: "playerSpeed", group: "Игрок", label: "Скорость ходьбы", description: "Базовая горизонтальная скорость до множителей спринта, стамины, воздуха и погоды.", input: "range", min: 2, max: 18, step: 0.1 },
  { key: "playerSprintMultiplier", group: "Игрок", label: "Множитель спринта", description: "Множитель скорости при зажатом Shift и наличии стамины.", input: "range", min: 1, max: 3, step: 0.01 },
  { key: "playerExhaustedSpeedMultiplier", group: "Игрок", label: "Скорость без стамины", description: "Множитель скорости, когда стамина полностью потрачена.", input: "range", min: 0.1, max: 1, step: 0.01 },
  { key: "playerExhaustedRecoveryThreshold", group: "Игрок", label: "Порог выхода из усталости", description: "Сколько стамины надо восстановить, чтобы игрок снова мог нормально бежать.", input: "range", min: 0, max: 100, step: 1 },
  { key: "playerStaminaMax", group: "Игрок", label: "Максимум стамины", description: "Максимальная стамина. По умолчанию тратится только на Shift и входящий урон.", input: "range", min: 25, max: 250, step: 1 },
  { key: "playerStaminaSprintDrainPerSecond", group: "Игрок", label: "Расход спринта", description: "Стамина, которая тратится за секунду спринта.", input: "range", min: 1, max: 80, step: 1 },
  { key: "playerStaminaJumpCost", group: "Игрок", label: "Цена прыжка", description: "Заблокировано правилом: Space не тратит стамину. Стамина уходит только на Shift и входящий урон.", input: "range", min: 0, max: 0, step: 1 },
  { key: "playerStaminaHitCost", group: "Игрок", label: "Цена удара", description: "Заблокировано правилом: атакующий не тратит стамину на удар. Стамина уходит только у цели от урона.", input: "range", min: 0, max: 0, step: 1 },
  { key: "playerStaminaRecoveryDelayMs", group: "Игрок", label: "Задержка восстановления", description: "Миллисекунды до восстановления после спринта или настроенной дополнительной траты стамины.", input: "number", min: 0, max: 5000, step: 50 },
  { key: "playerStaminaRecoveryPerSecond", group: "Игрок", label: "Скорость восстановления", description: "Сколько стамины восстанавливается в секунду после задержки.", input: "range", min: 0, max: 80, step: 1 },
  { key: "playerHitRecoveryDelayMs", group: "Игрок", label: "Задержка после удара", description: "Миллисекунды до восстановления стамины после урона от другого игрока.", input: "number", min: 0, max: 6000, step: 50 },
  { key: "playerJumpStrength", group: "Игрок", label: "Сила прыжка", description: "Вертикальный импульс прыжка на Space.", input: "range", min: 1, max: 14, step: 0.1 },
  { key: "playerJumpCooldownMs", group: "Игрок", label: "Кулдаун прыжка", description: "Минимальная пауза между прыжками в миллисекундах.", input: "number", min: 0, max: 2500, step: 10 },
  { key: "playerGravity", group: "Игрок", label: "Гравитация игрока", description: "Гравитация для прыжков и падений ragdoll.", input: "range", min: 4, max: 35, step: 0.1 },
  { key: "playerAirControlMultiplier", group: "Игрок", label: "Управление в воздухе", description: "Множитель управления движением, пока игрок в прыжке.", input: "range", min: 0, max: 1.5, step: 0.01 },
  { key: "playerRagdollMinMs", group: "Игрок", label: "Мин. время ragdoll", description: "Минимальное время, которое игрок остается в падении после нокаута.", input: "number", min: 0, max: 6000, step: 50 },
  { key: "playerRagdollFrictionPerSecond", group: "Игрок", label: "Трение ragdoll", description: "Как быстро лежащий игрок теряет скорость скольжения.", input: "range", min: 0, max: 6, step: 0.05 },
  { key: "playerRagdollHitKnockback", group: "Игрок", label: "Отброс ragdoll", description: "Горизонтальная сила отброса при падении от удара.", input: "range", min: 0, max: 30, step: 0.1 },
  { key: "playerRagdollVerticalKnockback", group: "Игрок", label: "Подброс ragdoll", description: "Вертикальная сила подброса при падении от удара.", input: "range", min: 0, max: 15, step: 0.1 },
  { key: "playerInputAxisAcceleration", group: "Игрок", label: "Разгон оси клавиатуры", description: "Как быстро зажатые WASD-оси доходят до полной силы.", input: "range", min: 1, max: 80, step: 1 },
  { key: "playerInputAxisReleaseDecay", group: "Игрок", label: "Затухание отпущенной оси", description: "Как плавно отпущенная ось движения исчезает из вектора.", input: "range", min: 1, max: 40, step: 1 },
  { key: "playerInputAxisOppositeAcceleration", group: "Игрок", label: "Победа противоположной оси", description: "Как быстро противоположное направление перебивает старую отпущенную ось.", input: "range", min: 1, max: 100, step: 1 },
  { key: "playerMovementAcceleration", group: "Игрок", label: "Разгон движения", description: "Как быстро фактическая скорость догоняет желаемое направление.", input: "range", min: 1, max: 80, step: 1 },
  { key: "playerMovementDeceleration", group: "Игрок", label: "Торможение движения", description: "Как быстро игрок замедляется после отпускания ввода.", input: "range", min: 1, max: 60, step: 1 },
  { key: "playerMovementTurnAcceleration", group: "Игрок", label: "Разворот движения", description: "Как быстро игрок меняет направление на противоположное.", input: "range", min: 1, max: 100, step: 1 },
  { key: "ballRadius", group: "Мяч", label: "Радиус мяча", description: "Авторитетный радиус коллайдера мяча. Требует пересброса физики.", input: "range", min: 0.12, max: 0.8, step: 0.01, restartPhysics: true },
  { key: "ballDensity", group: "Мяч", label: "Плотность мяча", description: "Плотность массы мяча. Чем выше значение, тем труднее его разогнать.", input: "range", min: 0.2, max: 12, step: 0.1, restartPhysics: true },
  { key: "ballRestitution", group: "Мяч", label: "Прыгучесть мяча", description: "Коэффициент отскока от земли, стен, штанг и коллайдера мяча.", input: "range", min: 0, max: 1.8, step: 0.01, restartPhysics: true },
  { key: "kickRange", group: "Удары", label: "Точная дистанция удара по мячу", description: "Близкий радиус вокруг рассчитанной точки ноги, руки или головы. Уменьшай, если удар срабатывает слишком далеко.", input: "range", min: 0.4, max: 4, step: 0.05 },
  { key: "footKickAssistRange", group: "Удары", label: "Дальность ЛКМ-удара по мячу", description: "Прощающая горизонтальная дистанция для контакта ЛКМ-ударом ногой по мячу.", input: "range", min: 0.6, max: 5, step: 0.05 },
  { key: "handKickAssistRange", group: "Удары", label: "Дальность ПКМ-удара по мячу", description: "Прощающая горизонтальная дистанция для контакта ПКМ-ударом рукой по мячу.", input: "range", min: 0.4, max: 4, step: 0.05 },
  { key: "headKickAssistRange", group: "Удары", label: "Дальность удара головой по мячу", description: "Прощающая горизонтальная дистанция для контакта колесиком/головой по мячу.", input: "range", min: 0.4, max: 4, step: 0.05 },
  { key: "footKickStrength", group: "Удары", label: "Сила ноги", description: "Базовый импульс ЛКМ-удара до множителя заряда.", input: "range", min: 0.2, max: 12, step: 0.05 },
  { key: "handHitStrength", group: "Удары", label: "Сила руки", description: "Базовый импульс ПКМ-удара по мячу.", input: "range", min: 0.1, max: 8, step: 0.05 },
  { key: "headKickStrength", group: "Удары", label: "Сила головы", description: "Базовый импульс удара головой через колесико.", input: "range", min: 0.2, max: 12, step: 0.05 },
  { key: "kickCooldownMs", group: "Удары", label: "Кулдаун ноги", description: "Минимальная пауза между ударами ногой.", input: "number", min: 50, max: 3000, step: 10 },
  { key: "handCooldownMs", group: "Удары", label: "Кулдаун руки", description: "Минимальная пауза между ударами рукой.", input: "number", min: 50, max: 3000, step: 10 },
  { key: "headCooldownMs", group: "Удары", label: "Кулдаун головы", description: "Минимальная пауза между ударами головой.", input: "number", min: 50, max: 3000, step: 10 },
  { key: "ballHitBasePowerMultiplier", group: "Удары", label: "Базовый множитель удара", description: "Общий множитель силы обычных ударов по мячу.", input: "range", min: 0.2, max: 6, step: 0.05 },
  { key: "leftKickInputBufferMs", group: "Удары", label: "Буфер ЛКМ", description: "Сколько миллисекунд ранний клик удара ногой хранится, пока игрок добегает до мяча.", input: "number", min: 0, max: 1000, step: 10 },
  { key: "leftKickChargeSeconds", group: "Удары", label: "Время заряда", description: "Сколько секунд надо держать ЛКМ для полного заряда удара ногой.", input: "range", min: 0.1, max: 3, step: 0.05 },
  { key: "leftKickFullChargePowerMultiplier", group: "Удары", label: "Множитель полного заряда", description: "Множитель силы при полностью заряженном ЛКМ-ударе.", input: "range", min: 0.5, max: 10, step: 0.05 },
  { key: "footPlayerStaminaDamage", group: "Удары", label: "Урон стамине ногой", description: "Сколько стамины снимает удар ногой по другому игроку.", input: "range", min: 0, max: 80, step: 1 },
  { key: "handPlayerStaminaDamage", group: "Удары", label: "Урон стамине рукой", description: "Сколько стамины снимает удар рукой по другому игроку.", input: "range", min: 0, max: 80, step: 1 },
  { key: "headPlayerStaminaDamage", group: "Удары", label: "Урон стамине головой", description: "Сколько стамины снимает удар головой по другому игроку.", input: "range", min: 0, max: 80, step: 1 },
  { key: "airborneHeadStaminaDamageBonus", group: "Удары", label: "Бонус головы в прыжке", description: "Дополнительный урон стамине, если удар головой сделан в воздухе.", input: "range", min: 0, max: 50, step: 1 },
  { key: "bodyBumpRange", group: "Удары", label: "Дистанция толчка телом", description: "Радиус пассивного контакта телом, который может слегка толкнуть мяч.", input: "range", min: 0.1, max: 2, step: 0.01 },
  { key: "bodyBumpMinSpeed", group: "Удары", label: "Мин. скорость толчка", description: "Минимальная скорость игрока, при которой пассивный толчок телом активен.", input: "range", min: 0, max: 12, step: 0.1 },
  { key: "bodyBumpStrength", group: "Удары", label: "Сила толчка телом", description: "Пассивный импульс контакта телом, применяемый к мячу.", input: "range", min: 0, max: 2, step: 0.01 },
  { key: "bodyBumpCooldownMs", group: "Удары", label: "Кулдаун толчка телом", description: "Минимальная пауза между пассивными толчками телом.", input: "number", min: 0, max: 2000, step: 10 },
  { key: "playerBallCollisionRestitution", group: "Мяч", label: "Отскок от игрока", description: "Насколько сильно мяч отражается от твердого коллайдера игрока при столкновении.", input: "range", min: 0, max: 2, step: 0.01 },
  { key: "playerBallCollisionPush", group: "Мяч", label: "Толчок корпусом", description: "Доля скорости игрока, передаваемая мячу при физическом контакте корпусом.", input: "range", min: 0, max: 2, step: 0.01 },
  { key: "playerBallCollisionSkin", group: "Мяч", label: "Запас контакта", description: "Дополнительный зазор вокруг игрока, который не дает мячу проскакивать через капсулу между тиками.", input: "range", min: 0, max: 0.2, step: 0.005 },
  { key: "ballPossessionEnabled", group: "Мяч", label: "Владение мячом", description: "Если включено, близкий игрок подбирает мяч и ведет его перед собой.", input: "checkbox" },
  { key: "ballPossessionRange", group: "Мяч", label: "Дистанция подбора", description: "Горизонтальная дистанция, на которой игрок захватывает свободный медленный мяч.", input: "range", min: 0.2, max: 2.5, step: 0.01 },
  { key: "ballPossessionCarryDistance", group: "Мяч", label: "Дистанция ведения", description: "Насколько далеко перед игроком держится мяч во время владения.", input: "range", min: 0.3, max: 2, step: 0.01 },
  { key: "ballPossessionCarryHeight", group: "Мяч", label: "Высота ведения", description: "Дополнительная высота мяча над газоном при владении.", input: "range", min: 0, max: 0.4, step: 0.01 },
  { key: "ballPossessionMaxCaptureSpeed", group: "Мяч", label: "Макс. скорость подбора", description: "Мяч быстрее этого значения не прилипает к игроку, а продолжает лететь или отскакивать.", input: "range", min: 0, max: 30, step: 0.1 },
  { key: "ballPossessionMaxCaptureHeight", group: "Мяч", label: "Макс. высота подбора", description: "Мяч выше этой высоты не считается доступным для ведения ногой.", input: "range", min: 0.2, max: 2.5, step: 0.01 },
  { key: "ballPossessionRecaptureDelayMs", group: "Мяч", label: "Задержка повторного подбора", description: "Пауза после удара, в течение которой мяч не прилипает обратно к игрокам.", input: "number", min: 0, max: 2000, step: 10 },
  { key: "ballPossessionLowShotSpeed", group: "Мяч", label: "Скорость низкого удара", description: "Скорость ЛКМ-удара по мячу при владении.", input: "range", min: 1, max: 35, step: 0.1 },
  { key: "ballPossessionUpperShotSpeed", group: "Мяч", label: "Скорость верхнего удара", description: "Горизонтальная скорость ПКМ-удара верхом при владении.", input: "range", min: 1, max: 35, step: 0.1 },
  { key: "ballPossessionLowShotLift", group: "Мяч", label: "Подъем низкого удара", description: "Вертикальная скорость ЛКМ-удара при владении.", input: "range", min: 0, max: 5, step: 0.05 },
  { key: "ballPossessionUpperShotLift", group: "Мяч", label: "Подъем верхнего удара", description: "Вертикальная скорость ПКМ-удара верхом при владении.", input: "range", min: 0, max: 12, step: 0.05 },
  { key: "ballPossessionStrongMultiplier", group: "Мяч", label: "Множитель Shift-удара", description: "Множитель скорости низкого и верхнего удара, если во время удара зажат Shift.", input: "range", min: 1, max: 4, step: 0.05 },
  { key: "ballPossessionBasePowerMultiplier", group: "Мяч", label: "База удара владения", description: "Множитель силы ЛКМ/ПКМ-удара, когда игрок владеет мячом и бьет без заряда.", input: "range", min: 1, max: 12, step: 0.05 },
  { key: "ballPossessionFullPowerMultiplier", group: "Мяч", label: "Полный удар владения", description: "Множитель силы ЛКМ/ПКМ-удара при полном заряде или Shift.", input: "range", min: 1, max: 16, step: 0.05 },
  { key: "friendlyFireEnabled", group: "Удары", label: "Бить своих", description: "Разрешает ударами без мяча вырубать игроков своей команды.", input: "checkbox" },
  { key: "playerHitFullKnockoutEnabled", group: "Удары", label: "Нокаут с одного удара", description: "Если включено, любой точный удар по игроку сразу сбивает всю стамину и включает ragdoll.", input: "checkbox" },
  { key: "jumpKickDashSpeed", group: "Удары", label: "Dash удара в прыжке", description: "Дополнительная скорость вперед для удара ногой в воздухе.", input: "range", min: 0, max: 20, step: 0.1 },
  { key: "jumpKickHitRangeBonus", group: "Удары", label: "Дальность удара в прыжке", description: "Дополнительная дальность попадания ногой во время airborne dash-удара.", input: "range", min: 0, max: 3, step: 0.05 },
  { key: "propImpulseMultiplier", group: "Объекты", label: "Импульс объектов", description: "Общий множитель толчков от игроков и мяча по физическим объектам окружения.", input: "range", min: 0, max: 4, step: 0.01 },
  { key: "propDamping", group: "Объекты", label: "Затухание объектов", description: "Как быстро подвижные объекты теряют скорость после толчка.", input: "range", min: 0.1, max: 8, step: 0.05 },
  { key: "propReturnStrength", group: "Объекты", label: "Возврат объектов", description: "Пружинная сила, возвращающая локальные объекты окружения к домашней позиции.", input: "range", min: 0, max: 6, step: 0.05 },
  { key: "propMaxDisplacementMultiplier", group: "Объекты", label: "Лимит сдвига объектов", description: "Множитель максимального смещения каждого физического объекта от домашней точки.", input: "range", min: 0.25, max: 4, step: 0.05 },
  { key: "postGoalCelebrationMs", group: "Матч", label: "Празднование гола", description: "Миллисекунды после гола до начала возврата мяча.", input: "number", min: 0, max: 20000, step: 100 },
  { key: "postGoalBallReturnMs", group: "Матч", label: "Возврат мяча", description: "Миллисекунды, за которые мяч летит обратно к центру после гола.", input: "number", min: 100, max: 5000, step: 100 },
  { key: "kickoffCountdownMs", group: "Матч", label: "Отсчет розыгрыша", description: "Миллисекунды отсчета перед розыгрышем после возврата мяча.", input: "number", min: 0, max: 10000, step: 100 },
  { key: "celebrationWindowMs", group: "Матч", label: "Окно эмоции гола", description: "Сколько миллисекунд игроки могут запускать празднование после гола.", input: "number", min: 0, max: 20000, step: 100 },
  { key: "celebrationDurationMs", group: "Матч", label: "Длительность эмоции", description: "Сколько миллисекунд длится выбранная анимация празднования.", input: "number", min: 0, max: 10000, step: 100 },
  { key: "httpClientStaleMs", group: "Сеть", label: "Таймаут HTTP-игрока", description: "Через сколько миллисекунд без HTTP polling игрок считается вышедшим и освобождает активный слот под бота.", input: "number", min: 3000, max: 60000, step: 500 },
  { key: "websocketClientStaleMs", group: "Сеть", label: "Таймаут WebSocket-игрока", description: "Через сколько миллисекунд без WebSocket input/heartbeat вкладка считается зависшей и освобождает активный слот под бота.", input: "number", min: 5000, max: 180000, step: 500 },
  { key: "botsEnabled", group: "Боты", label: "Включить ботов", description: "Заполняет ли сервер свободные активные слоты AI-игроками.", input: "checkbox" },
  { key: "botTargetActivePlayers", group: "Боты", label: "Цель заполнения ботами", description: "Желаемое число активных игроков на поле, включая людей и ботов.", input: "range", min: 0, max: MAX_ACTIVE_PLAYERS, step: 1 },
  { key: "botAggression", group: "Боты", label: "Агрессия", description: "Большее значение заставляет ботов чаще выбирать драку.", input: "range", min: 0, max: 1, step: 0.01 },
  { key: "botCombatAggressionThreshold", group: "Боты", label: "Порог драки", description: "Минимальная агрессия, с которой боты начинают выбирать удары по игрокам на обычной сложности.", input: "range", min: 0, max: 1, step: 0.01 },
  { key: "botCombatCollapseGuardRatio", group: "Боты", label: "Лимит нокаутов", description: "Доля активных игроков в ragdoll/усталости, после которой боты временно перестают начинать новые драки.", input: "range", min: 0, max: 1, step: 0.01 },
  { key: "botCombatCollapseGuardMinDisabled", group: "Боты", label: "Мин. лимит нокаутов", description: "Минимальное число уже вырубленных игроков до включения защиты от массового collapse матча.", input: "range", min: 1, max: MAX_ACTIVE_PLAYERS, step: 1 },
  { key: "botShootDistance", group: "Боты", label: "Дистанция удара по воротам", description: "Дистанция до мяча, на которой бот пытается пробить.", input: "range", min: 1.2, max: 8, step: 0.05 },
  { key: "botFightDistance", group: "Боты", label: "Дистанция драки", description: "Дистанция до соперника, на которой бот рассматривает удары руками и ногами.", input: "range", min: 0.8, max: 4, step: 0.05 },
  { key: "botChaseDistance", group: "Боты", label: "Дистанция погони", description: "Дистанция до мяча, на которой бот активно включается в преследование.", input: "range", min: 1, max: 12, step: 0.05 },
  { key: "botSprintDistance", group: "Боты", label: "Дистанция спринта", description: "Порог дистанции, после которого бот начинает спринтовать.", input: "range", min: 0, max: 18, step: 0.1 },
  { key: "botShotAlignmentMin", group: "Боты", label: "Выравнивание удара", description: "Минимальная направленность вперед, чтобы бот считал мяч удобным для удара.", input: "range", min: -0.5, max: 1, step: 0.01 },
  { key: "botSupportReleaseDistance", group: "Боты", label: "Выход из поддержки", description: "Дополнительная дистанция погони, после которой неосновные боты уходят с позиции поддержки.", input: "range", min: 0, max: 8, step: 0.05 },
  { key: "botKickIntervalMs", group: "Боты", label: "Интервал ноги бота", description: "Минимум миллисекунд между ударами ногой у бота.", input: "number", min: 120, max: 3000, step: 10 },
  { key: "botHandIntervalMs", group: "Боты", label: "Интервал руки бота", description: "Минимум миллисекунд между ударами рукой у бота.", input: "number", min: 120, max: 4000, step: 10 },
  { key: "botHeadIntervalMs", group: "Боты", label: "Интервал головы бота", description: "Минимум миллисекунд между ударами головой у бота.", input: "number", min: 120, max: 4000, step: 10 },
  { key: "botJumpChance", group: "Боты", label: "Шанс прыжка бота", description: "Шанс за тик, который бот использует для ситуативных прыжков.", input: "range", min: 0, max: 0.25, step: 0.001 }
];

function recordSource(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedFinite(value: unknown, fallback: number, min: number, max: number, decimals = 3): number {
  const numberValue = Number(value);
  const safeValue = Number.isFinite(numberValue) ? numberValue : fallback;
  return Number(clamp(safeValue, min, max).toFixed(decimals));
}

function normalizedBool(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : Boolean(value);
}

function normalizedColor(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${clamp(Math.round(value), 0, 0xffffff).toString(16).padStart(6, "0")}`;
  }
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const threeDigit = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (threeDigit) {
    const [, hex] = threeDigit;
    return `#${hex.split("").map((char) => `${char}${char}`).join("").toLowerCase()}`;
  }
  const sixDigit = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  return sixDigit ? `#${sixDigit[1].toLowerCase()}` : fallback;
}

function normalizedMaterial(value: unknown, fallback: VisualColorMaterialSettings): VisualColorMaterialSettings {
  const source = recordSource(value);
  const result: VisualColorMaterialSettings = {
    color: normalizedColor(source.color, fallback.color)
  };
  if (source.roughness !== undefined || fallback.roughness !== undefined) {
    result.roughness = normalizedFinite(source.roughness, fallback.roughness ?? 0.65, 0, 1, 3);
  }
  if (source.metalness !== undefined || fallback.metalness !== undefined) {
    result.metalness = normalizedFinite(source.metalness, fallback.metalness ?? 0, 0, 1, 3);
  }
  if (source.opacity !== undefined || fallback.opacity !== undefined) {
    result.opacity = normalizedFinite(source.opacity, fallback.opacity ?? 1, 0, 1, 3);
  }
  return result;
}

function normalizedFloodlight(value: unknown, fallback: VisualFloodlightSettings): VisualFloodlightSettings {
  const source = recordSource(value);
  return {
    x: normalizedFinite(source.x, fallback.x, -500, 500, 3),
    y: normalizedFinite(source.y, fallback.y, 0.1, 200, 3),
    z: normalizedFinite(source.z, fallback.z, -500, 500, 3),
    targetX: normalizedFinite(source.targetX, fallback.targetX, -500, 500, 3),
    targetY: normalizedFinite(source.targetY, fallback.targetY, -100, 200, 3),
    targetZ: normalizedFinite(source.targetZ, fallback.targetZ, -500, 500, 3),
    color: normalizedColor(source.color, fallback.color),
    angleDeg: normalizedFinite(source.angleDeg, fallback.angleDeg, 1, 89, 3),
    distance: normalizedFinite(source.distance, fallback.distance, 1, 500, 3),
    penumbra: normalizedFinite(source.penumbra, fallback.penumbra, 0, 1, 3),
    decay: normalizedFinite(source.decay, fallback.decay, 0, 4, 3),
    coneRadius: normalizedFinite(source.coneRadius, fallback.coneRadius, 0.1, 100, 3),
    coneOpacity: normalizedFinite(source.coneOpacity, fallback.coneOpacity, 0, 1, 3),
    flickerDepth: normalizedFinite(source.flickerDepth, fallback.flickerDepth, 0, 1, 3),
    flickerSpeed: normalizedFinite(source.flickerSpeed, fallback.flickerSpeed, 0, 20, 3),
    widthScale: normalizedFinite(source.widthScale, fallback.widthScale, 0.05, 8, 3),
    intensityBias: normalizedFinite(source.intensityBias, fallback.intensityBias, 0, 4, 3)
  };
}

export function normalizeVisualSettingsPatch(value: unknown, fallback: VisualSettings = DEFAULT_VISUAL_SETTINGS): VisualSettings {
  const source = recordSource(value);
  const renderer = recordSource(source.renderer);
  const sky = recordSource(source.sky);
  const sun = recordSource(source.sun);
  const moon = recordSource(source.moon);
  const ambient = recordSource(source.ambient);
  const floodlights = recordSource(source.floodlights);
  const materials = recordSource(source.materials);
  const weather = recordSource(source.weather);
  const fallbackLights = fallback.floodlights.lights.length > 0 ? fallback.floodlights.lights : DEFAULT_VISUAL_SETTINGS.floodlights.lights;
  const sourceLights = Array.isArray(floodlights.lights) ? floodlights.lights : [];
  const requestedLightCount = sourceLights.length > 0 ? sourceLights.length : fallbackLights.length;
  const lightCount = Math.max(1, Math.min(12, requestedLightCount));
  const normalizedLights = Array.from({ length: lightCount }, (_, index) => {
    const fallbackLight = fallbackLights[index] ?? fallbackLights[0] ?? DEFAULT_VISUAL_SETTINGS.floodlights.lights[0];
    return normalizedFloodlight(sourceLights[index], fallbackLight);
  });
  const fogNearBase = normalizedFinite(sky.fogNearBase, fallback.sky.fogNearBase, 0, 1000, 3);
  const fogNearDay = normalizedFinite(sky.fogNearDay, fallback.sky.fogNearDay, -1000, 1000, 3);
  const fogFarBase = normalizedFinite(sky.fogFarBase, fallback.sky.fogFarBase, 1, 2000, 3);
  const fogFarDay = normalizedFinite(sky.fogFarDay, fallback.sky.fogFarDay, -1000, 2000, 3);

  return {
    renderer: {
      exposureBase: normalizedFinite(renderer.exposureBase, fallback.renderer.exposureBase, 0.1, 5, 3),
      exposureDay: normalizedFinite(renderer.exposureDay, fallback.renderer.exposureDay, 0, 3, 3),
      exposureSunset: normalizedFinite(renderer.exposureSunset, fallback.renderer.exposureSunset, 0, 3, 3),
      precipitationExposurePenalty: normalizedFinite(renderer.precipitationExposurePenalty, fallback.renderer.precipitationExposurePenalty, 0, 2, 3),
      shadows: normalizedBool(renderer.shadows, fallback.renderer.shadows)
    },
    sky: {
      dayColor: normalizedColor(sky.dayColor, fallback.sky.dayColor),
      sunsetColor: normalizedColor(sky.sunsetColor, fallback.sky.sunsetColor),
      nightColor: normalizedColor(sky.nightColor, fallback.sky.nightColor),
      fogDayColor: normalizedColor(sky.fogDayColor, fallback.sky.fogDayColor),
      fogNightColor: normalizedColor(sky.fogNightColor, fallback.sky.fogNightColor),
      snowFogColor: normalizedColor(sky.snowFogColor, fallback.sky.snowFogColor),
      domeFogMix: normalizedFinite(sky.domeFogMix, fallback.sky.domeFogMix, 0, 1, 3),
      fogNearBase,
      fogNearDay,
      fogFarBase: Math.max(fogNearBase + 1, fogFarBase),
      fogFarDay,
      fogSnowPenalty: normalizedFinite(sky.fogSnowPenalty, fallback.sky.fogSnowPenalty, -500, 500, 3)
    },
    sun: {
      intensityBase: normalizedFinite(sun.intensityBase, fallback.sun.intensityBase, 0, 20, 3),
      intensityDay: normalizedFinite(sun.intensityDay, fallback.sun.intensityDay, 0, 20, 3),
      intensitySunset: normalizedFinite(sun.intensitySunset, fallback.sun.intensitySunset, 0, 20, 3),
      precipitationPenalty: normalizedFinite(sun.precipitationPenalty, fallback.sun.precipitationPenalty, 0, 5, 3),
      orbitRadius: normalizedFinite(sun.orbitRadius, fallback.sun.orbitRadius, 1, 500, 3),
      visualOrbitRadius: normalizedFinite(sun.visualOrbitRadius, fallback.sun.visualOrbitRadius, 1, 500, 3),
      visualHeight: normalizedFinite(sun.visualHeight, fallback.sun.visualHeight, -200, 500, 3),
      markerScaleBase: normalizedFinite(sun.markerScaleBase, fallback.sun.markerScaleBase, 0.01, 50, 3),
      markerScaleDay: normalizedFinite(sun.markerScaleDay, fallback.sun.markerScaleDay, 0, 50, 3),
      markerScaleSunset: normalizedFinite(sun.markerScaleSunset, fallback.sun.markerScaleSunset, 0, 50, 3),
      glowOpacityBase: normalizedFinite(sun.glowOpacityBase, fallback.sun.glowOpacityBase, 0, 1, 3),
      glowOpacityDay: normalizedFinite(sun.glowOpacityDay, fallback.sun.glowOpacityDay, 0, 1, 3),
      glowOpacitySunset: normalizedFinite(sun.glowOpacitySunset, fallback.sun.glowOpacitySunset, 0, 1, 3)
    },
    moon: {
      color: normalizedColor(moon.color, fallback.moon.color),
      opacityBase: normalizedFinite(moon.opacityBase, fallback.moon.opacityBase, 0, 1, 3),
      opacityNight: normalizedFinite(moon.opacityNight, fallback.moon.opacityNight, 0, 1, 3)
    },
    ambient: {
      hemiSkyColor: normalizedColor(ambient.hemiSkyColor, fallback.ambient.hemiSkyColor),
      hemiGroundColor: normalizedColor(ambient.hemiGroundColor, fallback.ambient.hemiGroundColor),
      hemiBase: normalizedFinite(ambient.hemiBase, fallback.ambient.hemiBase, 0, 10, 3),
      hemiDay: normalizedFinite(ambient.hemiDay, fallback.ambient.hemiDay, 0, 10, 3),
      hemiPrecipitationPenalty: normalizedFinite(ambient.hemiPrecipitationPenalty, fallback.ambient.hemiPrecipitationPenalty, 0, 5, 3),
      fillBase: normalizedFinite(ambient.fillBase, fallback.ambient.fillBase, 0, 10, 3),
      fillDay: normalizedFinite(ambient.fillDay, fallback.ambient.fillDay, 0, 10, 3),
      fillNight: normalizedFinite(ambient.fillNight, fallback.ambient.fillNight, 0, 10, 3),
      fillSnow: normalizedFinite(ambient.fillSnow, fallback.ambient.fillSnow, 0, 10, 3),
      bounceColor: normalizedColor(ambient.bounceColor, fallback.ambient.bounceColor),
      bounceBase: normalizedFinite(ambient.bounceBase, fallback.ambient.bounceBase, 0, 10, 3),
      bounceDay: normalizedFinite(ambient.bounceDay, fallback.ambient.bounceDay, 0, 10, 3),
      bounceSunset: normalizedFinite(ambient.bounceSunset, fallback.ambient.bounceSunset, 0, 10, 3),
      bounceNight: normalizedFinite(ambient.bounceNight, fallback.ambient.bounceNight, 0, 10, 3),
      rimColor: normalizedColor(ambient.rimColor, fallback.ambient.rimColor),
      rimBase: normalizedFinite(ambient.rimBase, fallback.ambient.rimBase, 0, 10, 3),
      rimNight: normalizedFinite(ambient.rimNight, fallback.ambient.rimNight, 0, 10, 3),
      rimSunset: normalizedFinite(ambient.rimSunset, fallback.ambient.rimSunset, 0, 10, 3)
    },
    floodlights: {
      powerNightStart: normalizedFinite(floodlights.powerNightStart, fallback.floodlights.powerNightStart, 0, 1, 3),
      powerNightEnd: normalizedFinite(floodlights.powerNightEnd, fallback.floodlights.powerNightEnd, 0, 1, 3),
      intensityBase: normalizedFinite(floodlights.intensityBase, fallback.floodlights.intensityBase, 0, 20, 3),
      precipitationBoost: normalizedFinite(floodlights.precipitationBoost, fallback.floodlights.precipitationBoost, 0, 10, 3),
      lightThreshold: normalizedFinite(floodlights.lightThreshold, fallback.floodlights.lightThreshold, 0, 1, 3),
      coneThreshold: normalizedFinite(floodlights.coneThreshold, fallback.floodlights.coneThreshold, 0, 1, 3),
      lights: normalizedLights
    },
    materials: {
      field: normalizedMaterial(materials.field, fallback.materials.field),
      fieldStripe: normalizedMaterial(materials.fieldStripe, fallback.materials.fieldStripe),
      marking: normalizedMaterial(materials.marking, fallback.materials.marking),
      markingSecondary: normalizedMaterial(materials.markingSecondary, fallback.materials.markingSecondary),
      goalPost: normalizedMaterial(materials.goalPost, fallback.materials.goalPost),
      mast: normalizedMaterial(materials.mast, fallback.materials.mast),
      courtyard: normalizedMaterial(materials.courtyard, fallback.materials.courtyard),
      fence: normalizedMaterial(materials.fence, fallback.materials.fence),
      road: normalizedMaterial(materials.road, fallback.materials.road),
      sidewalk: normalizedMaterial(materials.sidewalk, fallback.materials.sidewalk),
      curb: normalizedMaterial(materials.curb, fallback.materials.curb),
      foliage: normalizedMaterial(materials.foliage, fallback.materials.foliage),
      metal: normalizedMaterial(materials.metal, fallback.materials.metal),
      brightMetal: normalizedMaterial(materials.brightMetal, fallback.materials.brightMetal),
      fallbackPlayerBlue: normalizedMaterial(materials.fallbackPlayerBlue, fallback.materials.fallbackPlayerBlue),
      fallbackPlayerOrange: normalizedMaterial(materials.fallbackPlayerOrange, fallback.materials.fallbackPlayerOrange),
      ball: normalizedMaterial(materials.ball, fallback.materials.ball)
    },
    weather: {
      rainLightPenalty: normalizedFinite(weather.rainLightPenalty, fallback.weather.rainLightPenalty, 0, 5, 3),
      snowFogBoost: normalizedFinite(weather.snowFogBoost, fallback.weather.snowFogBoost, 0, 5, 3),
      conePrecipitationBoost: normalizedFinite(weather.conePrecipitationBoost, fallback.weather.conePrecipitationBoost, 0, 5, 3)
    }
  };
}

export function normalizeGameSettingsPatch(value: unknown, fallback: GameSettings = DEFAULT_GAME_SETTINGS): GameSettings {
  const source = recordSource(value) as Partial<Record<keyof GameSettings, unknown>>;
  const result: GameSettings = {
    ...fallback,
    visual: normalizeVisualSettingsPatch(source.visual, fallback.visual)
  };
  for (const item of GAME_SETTINGS_SCHEMA) {
    const raw = source[item.key];
    if (raw === undefined) continue;
    if (item.input === "json") {
      if (item.key === "visual") result.visual = normalizeVisualSettingsPatch(raw, result.visual);
      continue;
    }
    if (item.input === "checkbox") {
      result[item.key] = Boolean(raw) as never;
      continue;
    }
    const numberValue = Number(raw);
    if (!Number.isFinite(numberValue)) continue;
    const min = item.min ?? Number.NEGATIVE_INFINITY;
    const max = item.max ?? Number.POSITIVE_INFINITY;
    const step = item.step ?? 0.001;
    const clamped = clamp(numberValue, min, max);
    const decimals = step < 1 ? Math.min(6, Math.max(0, String(step).split(".")[1]?.length || 0)) : 0;
    result[item.key] = Number(clamped.toFixed(decimals)) as never;
  }
  if (result.weatherChangeMaxMs < result.weatherChangeMinMs) result.weatherChangeMaxMs = result.weatherChangeMinMs;
  if (result.playerExhaustedRecoveryThreshold > result.playerStaminaMax) {
    result.playerExhaustedRecoveryThreshold = result.playerStaminaMax;
  }
  if (result.botTargetActivePlayers > result.maxActivePlayers) result.botTargetActivePlayers = result.maxActivePlayers;
  return result;
}

export function teamName(team: TeamId | null): string {
  if (team === 0) return "\u0421\u0438\u043d\u0438\u0435";
  if (team === 1) return "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435";
  return "\u041d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizePlayerName(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const clean = raw.replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 18);
  return clean || "\u0418\u0433\u0440\u043e\u043a";
}

export function emotionChoiceById(value: unknown): typeof EMOTION_CHOICES[number] | null {
  const id = typeof value === "string" ? value : "";
  return EMOTION_CHOICES.find((choice) => choice.id === id) || null;
}
