export declare const GAME_VERSION = "v0.0.064";
export declare const ROOM_ID = "unsoccer-default-room";
export declare const MAX_ACTIVE_PLAYERS = 10;
export declare const MAX_ROOM_CLIENTS = 32;
export declare const SERVER_TICK_RATE = 60;
export declare const SNAPSHOT_RATE = 20;
export declare const DAY_CYCLE_SECONDS = 300;
export declare const DAY_START_SECONDS: number;
export declare const FIELD_WIDTH = 48;
export declare const FIELD_LENGTH = 72;
export declare const GOAL_WIDTH = 12;
export declare const GOAL_DEPTH = 3.2;
export declare const PLAYER_RADIUS = 0.52;
export declare const PLAYER_HEIGHT = 1.75;
export declare const PLAYER_SPEED = 8.2;
export declare const PLAYER_INPUT_AXIS_ACCELERATION = 18;
export declare const PLAYER_INPUT_AXIS_RELEASE_DECAY = 5;
export declare const PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION = 32;
export declare const PLAYER_MOVEMENT_ACCELERATION = 24;
export declare const PLAYER_MOVEMENT_DECELERATION = 8;
export declare const PLAYER_MOVEMENT_TURN_ACCELERATION = 34;
export declare const PLAYER_SPRINT_MULTIPLIER = 1.58;
export declare const PLAYER_EXHAUSTED_SPEED_MULTIPLIER = 0.46;
export declare const PLAYER_EXHAUSTED_RECOVERY_THRESHOLD = 20;
export declare const PLAYER_STAMINA_MAX = 100;
export declare const PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND = 24;
export declare const PLAYER_STAMINA_JUMP_COST = 0;
export declare const PLAYER_STAMINA_HIT_COST = 0;
export declare const PLAYER_STAMINA_RECOVERY_DELAY_MS = 700;
export declare const PLAYER_STAMINA_RECOVERY_PER_SECOND = 17;
export declare const PLAYER_JUMP_STRENGTH = 6.1;
export declare const PLAYER_JUMP_COOLDOWN_MS = 520;
export declare const PLAYER_GRAVITY = 18;
export declare const PLAYER_AIR_CONTROL_MULTIPLIER = 0.82;
export declare const PLAYER_RAGDOLL_MIN_MS = 1600;
export declare const PLAYER_RAGDOLL_FRICTION_PER_SECOND = 1.35;
export declare const PLAYER_RAGDOLL_HIT_KNOCKBACK = 11.8;
export declare const PLAYER_RAGDOLL_VERTICAL_KNOCKBACK = 4.4;
export declare const BALL_RADIUS = 0.24;
export declare const BALL_DENSITY = 3.6;
export declare const BALL_RESTITUTION = 1.05;
export declare const BALL_LINEAR_DAMPING = 0.08;
export declare const BALL_GROUND_DRAG = 0.997;
export declare const BALL_AIR_DRAG = 0.9997;
export declare const KICK_RANGE = 0.72;
export declare const FOOT_KICK_ASSIST_RANGE = 1.05;
export declare const HAND_KICK_ASSIST_RANGE = 1.15;
export declare const HEAD_KICK_ASSIST_RANGE = 1.05;
export declare const FOOT_KICK_STRENGTH = 2.4;
export declare const HAND_HIT_STRENGTH = 1.35;
export declare const HEAD_KICK_STRENGTH = 3.15;
export declare const KICK_COOLDOWN_MS = 320;
export declare const HAND_COOLDOWN_MS = 420;
export declare const HEAD_COOLDOWN_MS = 520;
export declare const BALL_HIT_BASE_POWER_MULTIPLIER = 2;
export declare const LEFT_KICK_CHARGE_SECONDS = 1;
export declare const LEFT_KICK_FULL_CHARGE_POWER_MULTIPLIER = 4;
export declare const FOOT_PLAYER_STAMINA_DAMAGE = 12;
export declare const HAND_PLAYER_STAMINA_DAMAGE = 20;
export declare const HEAD_PLAYER_STAMINA_DAMAGE = 16;
export declare const AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS = 6;
export declare const BODY_BUMP_RANGE = 0.62;
export declare const BODY_BUMP_MIN_SPEED = 3.1;
export declare const BODY_BUMP_STRENGTH = 0.18;
export declare const BODY_BUMP_COOLDOWN_MS = 240;
export declare const PLAYER_BALL_COLLISION_RESTITUTION = 1.08;
export declare const PLAYER_BALL_COLLISION_PUSH = 0.42;
export declare const PLAYER_BALL_COLLISION_SKIN = 0.035;
export declare const BALL_POSSESSION_RANGE = 0.98;
export declare const BALL_POSSESSION_CARRY_DISTANCE = 0.73;
export declare const BALL_POSSESSION_CARRY_HEIGHT = 0.04;
export declare const BALL_POSSESSION_MAX_CAPTURE_SPEED = 8.5;
export declare const BALL_POSSESSION_MAX_CAPTURE_HEIGHT = 0.72;
export declare const BALL_POSSESSION_RECAPTURE_DELAY_MS = 360;
export declare const BALL_POSSESSION_LOW_SHOT_SPEED = 8.2;
export declare const BALL_POSSESSION_UPPER_SHOT_SPEED = 6.4;
export declare const BALL_POSSESSION_LOW_SHOT_LIFT = 0.16;
export declare const BALL_POSSESSION_UPPER_SHOT_LIFT = 1.7;
export declare const BALL_POSSESSION_STRONG_MULTIPLIER = 1.4;
export declare const BALL_POSSESSION_BASE_POWER_MULTIPLIER = 0.8;
export declare const BALL_POSSESSION_FULL_POWER_MULTIPLIER = 2;
export declare const BALL_POSSESSION_MAX_SHOT_SPEED = 18;
export declare const BALL_POSSESSION_MAX_SHOT_LIFT = 5.4;
export declare const JUMP_KICK_DASH_SPEED = 7.4;
export declare const JUMP_KICK_HIT_RANGE_BONUS = 0.95;
export declare const POST_GOAL_CELEBRATION_MS = 5000;
export declare const POST_GOAL_BALL_RETURN_MS = 1000;
export declare const KICKOFF_COUNTDOWN_MS = 1200;
export declare const CELEBRATION_WINDOW_MS = 5000;
export declare const CELEBRATION_DURATION_MS = 2600;
export declare const MATCH_DURATION_MS: number;
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
export declare const EMOTION_CHOICES: readonly [{
    readonly id: "angry";
    readonly emoji: "😡";
    readonly label: "Злость";
}, {
    readonly id: "heart";
    readonly emoji: "❤️";
    readonly label: "Сердце";
}, {
    readonly id: "laugh";
    readonly emoji: "😂";
    readonly label: "Смех";
}, {
    readonly id: "wow";
    readonly emoji: "😮";
    readonly label: "Вау";
}, {
    readonly id: "sad";
    readonly emoji: "😢";
    readonly label: "Грусть";
}, {
    readonly id: "fire";
    readonly emoji: "🔥";
    readonly label: "Огонь";
}, {
    readonly id: "gg";
    readonly emoji: "🤝";
    readonly label: "Хорошая игра";
}, {
    readonly id: "goal";
    readonly emoji: "⚽";
    readonly label: "Гол";
}, {
    readonly id: "crown";
    readonly emoji: "👑";
    readonly label: "Корона";
}];
export declare const DEFAULT_USER_PICS: readonly ["⚽", "⭐", "🔥", "👑", "😎", "🤝", "🚀", "🎯", "🧤"];
export declare const BALL_SKIN_ROSTER: readonly ["6493457", "6493379", "6493403", "6493239", "6493488", "6493371", "6493256", "6493342", "6493507", "6493481"];
export declare const DEFAULT_BALL_SKIN_ID: "6493457";
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
    kickRightHeld: boolean;
    kickRightCharge: number;
    head: number;
    jump: number;
    exitVehicle: number;
    switchTeam: number;
    sprint: boolean;
    yaw: number;
}
export interface PlayerProfileSnapshot {
    nickname: string;
    skinId: string;
    ballSkinId: string;
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
    vehicleId: string | null;
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
    skinId: string;
    ownerPlayerId: string | null;
}
export type VehicleKind = "car" | "tractor" | "tank";
export interface VehicleSnapshot {
    id: string;
    assetKind: string;
    kind: VehicleKind;
    position: Vec3;
    velocity: Vec3;
    yaw: number;
    speed: number;
    occupantPlayerId: string | null;
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
    vehicles: VehicleSnapshot[];
    ball: BallSnapshot;
    score: ScoreState;
    matchDurationMs: number;
    matchRemainingMs: number;
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
export declare const DEFAULT_INPUT: InputState;
export declare const CHARACTER_ROSTER: readonly ["6299851", "6288738", "6243756", "6270571", "6324128", "6244727", "6304269", "6298522", "6255142", "6294728"];
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
    goalNetCatchDepthPadding: number;
    goalNetCatchSidePadding: number;
    goalNetCatchSettleMs: number;
    goalNetCatchStiffness: number;
    goalNetCatchVelocityDamping: number;
    maxActivePlayers: number;
    matchDurationMs: number;
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
    ballLinearDamping: number;
    ballGroundDrag: number;
    ballAirDrag: number;
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
    ballPossessionMaxShotSpeed: number;
    ballPossessionMaxShotLift: number;
    friendlyFireEnabled: boolean;
    playerHitFullKnockoutEnabled: boolean;
    jumpKickDashSpeed: number;
    jumpKickHitRangeBonus: number;
    propImpulseMultiplier: number;
    propDamping: number;
    propReturnStrength: number;
    propMaxDisplacementMultiplier: number;
    vehicleEnterRadius: number;
    vehicleEnterDwellMs: number;
    vehicleExitCooldownMs: number;
    vehicleCarMaxSpeed: number;
    vehicleTractorMaxSpeed: number;
    vehicleTankMaxSpeed: number;
    vehicleCarAcceleration: number;
    vehicleTractorAcceleration: number;
    vehicleTankAcceleration: number;
    vehicleCarTurnRate: number;
    vehicleTractorTurnRate: number;
    vehicleTankTurnRate: number;
    vehicleBrakeStrength: number;
    vehicleDrag: number;
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
export declare const DEFAULT_VISUAL_SETTINGS: VisualSettings;
export declare const DEFAULT_GAME_SETTINGS: GameSettings;
export declare const GAME_SETTINGS_SCHEMA: GameSettingSchemaItem[];
export declare function normalizeVisualSettingsPatch(value: unknown, fallback?: VisualSettings): VisualSettings;
export declare function normalizeGameSettingsPatch(value: unknown, fallback?: GameSettings): GameSettings;
export declare function teamName(team: TeamId | null): string;
export declare function clamp(value: number, min: number, max: number): number;
export declare function sanitizePlayerName(value: unknown): string;
export declare function emotionChoiceById(value: unknown): typeof EMOTION_CHOICES[number] | null;
