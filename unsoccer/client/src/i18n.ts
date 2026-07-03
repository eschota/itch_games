import type { TeamId, WeatherSnapshot } from "@itch-games/unsoccer-shared";
import type { InputAction, SettingsTab } from "./settings";

export type Locale = "ru" | "en";

type Vars = Record<string, string | number>;

const GENERATED_PLAYER_RE = /^(?:Игрок|Player)\s+(\d{1,4})$/i;

function resolveLocale(): Locale {
  const params = new URLSearchParams(location.search);
  const forced = (params.get("lang") || params.get("locale") || "").toLowerCase();
  if (forced === "ru" || forced.startsWith("ru-")) return "ru";
  if (forced === "en" || forced.startsWith("en-")) return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  return languages.some((language) => language.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

export const currentLocale: Locale = resolveLocale();

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    "document.title": "UnSoccer {version} | Ragdoll Soccer II",
    "meta.description": "UnSoccer {version}: browser ragdoll football with server physics, bots, chat, emotions, stamina, weather, mobile controls, and a localized RU/EN game HUD.",
    "app.label": "UnSoccer",
    "canvas.label": "UnSoccer play field",
    "player.role.connecting": "Connecting",
    "player.role.player": "Player",
    "player.role.spectator": "Spectator",
    "player.generated": "Player {number}",
    "player.you": "You",
    "player.you.short": "you",
    "player.youTeam": "You: {team} #{index}",
    "player.youSpectator": "You: spectator",
    "player.joinedTeam": "You joined {team} #{index}.",
    "player.spectatorMode": "Spectator/tester mode.",
    "team.blue": "Blue",
    "team.orange": "Orange",
    "team.spectators": "Spectators",
    "team.spectator": "Spectator",
    "team.blue.short": "B",
    "team.orange.short": "O",
    "team.spectator.short": "S",
    "controller.bot": "AI",
    "controller.test": "TEST",
    "score.goals": "Goals",
    "status.connecting": "Connecting",
    "status.connected": "Connected.",
    "status.disconnected": "Disconnected. Check the game server.",
    "status.serverFull": "Server is full.",
    "status.connectionError": "Connection error. Check the game server.",
    "status.networkError": "Network error",
    "status.websocketOnline": "WebSocket online",
    "status.httpFallback": "HTTP fallback",
    "status.httpFallbackConnecting": "Connecting HTTP fallback...",
    "status.httpSnapshotLost": "Lost HTTP snapshot",
    "status.observing": "Observing",
    "status.countdown": " Kickoff in {seconds}s.",
    "status.celebration": " Celebration {seconds}s.",
    "status.ballReturning": " Ball returning to center {progress}%.",
    "status.waitingPlayers": "Waiting for players",
    "status.settingsApplied": "Game settings applied",
    "status.ballReturningPlain": "Ball returning to center",
    "status.centerKickoff": "Kickoff from center",
    "score.orange": "Orange scores",
    "score.orangeWithScorer": "Orange scores: {name}",
    "score.blue": "Blue scores",
    "score.blueWithScorer": "Blue scores: {name}",
    "stamina.title": "Stamina",
    "stamina.waiting": "waiting",
    "stamina.exhausted": "exhausted",
    "stamina.sprint": "sprint",
    "stamina.low": "low energy",
    "stamina.recovering": "recovering",
    "stamina.ready": "ready",
    "network.snapshot": "snapshot --",
    "control.move": "Move {binding}",
    "control.kickHand": "Kick/hand {left}/{right}",
    "control.head": "Head {binding}",
    "control.jumpSprint": "Jump/sprint {jump}/{sprint}",
    "control.menu": "Menu {binding}",
    "action.moveForward": "Forward",
    "action.moveBack": "Back",
    "action.moveLeft": "Left",
    "action.moveRight": "Right",
    "action.leftKick": "Left foot",
    "action.rightKick": "Hand",
    "action.headHit": "Head",
    "action.jump": "Jump",
    "action.sprint": "Sprint",
    "action.settings": "Menu",
    "action.cameraReset": "Camera",
    "action.muteAudio": "Audio",
    "settings.title": "Settings",
    "settings.saved": "saved",
    "settings.notSaved": "not saved",
    "settings.play": "Game",
    "settings.tabs": "Settings tabs",
    "settings.tab.controls": "Controls",
    "settings.tab.audio": "Audio",
    "settings.tab.graphics": "Graphics",
    "settings.tab.network": "Network",
    "settings.tab.accessibility": "Access",
    "settings.mode": "Mode",
    "settings.invertForwardBack": "Invert forward/back",
    "settings.invertLeftRight": "Invert left/right",
    "settings.mirrorTeam": "Mirror by team side",
    "settings.master": "Master",
    "settings.sfx": "SFX",
    "settings.ambience": "Ambience",
    "settings.weather": "Weather",
    "settings.ui": "UI",
    "settings.mute": "Mute",
    "settings.muteBackground": "Mute in background",
    "settings.test": "Test",
    "settings.quality": "Quality",
    "settings.quality.low": "Low",
    "settings.quality.balanced": "Balanced",
    "settings.quality.high": "High",
    "settings.resolution": "Resolution",
    "settings.shadows": "Shadows",
    "settings.weatherParticles": "Weather",
    "settings.cameraShake": "Camera shake",
    "settings.interpolation": "Interpolation",
    "settings.highContrastHud": "High contrast HUD",
    "settings.reduceEffects": "Reduce effects",
    "settings.dayCycle": "Day cycle",
    "settings.dayCycle.live": "Live loop",
    "settings.dayCycle.qa": "QA scrub",
    "settings.qaTime": "QA time",
    "settings.autoReconnect": "Auto reconnect",
    "settings.networkDetails": "Network details",
    "settings.largerHud": "Larger HUD",
    "settings.teamPatterns": "Team patterns",
    "settings.reduceMotion": "Reduce motion",
    "settings.captions": "Captions",
    "settings.lessWeather": "Less weather",
    "settings.resetTab": "Reset tab",
    "settings.resetAll": "Reset all",
    "settings.apply": "Apply",
    "settings.rebindPending": "{action}: press a key",
    "settings.rebindDuplicate": "Duplicates are replaced.",
    "settings.conflicts": "Conflicts: {codes}",
    "chat.label": "Player chat",
    "chat.placeholder": "Enter - chat",
    "chat.messageLabel": "Chat message",
    "profile.nickname": "Nickname",
    "profile.skin": "Skin",
    "profile.userPic": "Avatar or image URL",
    "profile.skinLabel": "Skin {index} - {id}",
    "emotion.wheel": "Emotion wheel",
    "emotion.angry": "Angry",
    "emotion.happy": "Happy",
    "emotion.sad": "Sad",
    "emotion.laugh": "Laugh",
    "emotion.wow": "Wow",
    "emotion.shock": "Shock",
    "emotion.heart": "Heart",
    "emotion.fire": "Fire",
    "emotion.gg": "Good game",
    "emotion.goal": "Goal",
    "emotion.crown": "Crown",
    "emotion.clap": "Clap",
    "emotion.cool": "Cool",
    "toolbar.controls": "UnSoccer controls",
    "toolbar.settings": "Settings",
    "toolbar.mute": "Mute",
    "toolbar.fullscreen": "Fullscreen",
    "toolbar.camera": "Camera reset",
    "mobile.controls": "Mobile controls",
    "mobile.move": "Move",
    "mobile.actions": "Actions",
    "mobile.up": "Forward",
    "mobile.down": "Back",
    "mobile.left": "Left",
    "mobile.right": "Right",
    "mobile.sprint": "Sprint",
    "mobile.sprint.short": "RUN",
    "mobile.jump": "Jump",
    "mobile.jump.short": "JUMP",
    "mobile.leftKick": "Kick",
    "mobile.leftKick.short": "KICK",
    "mobile.rightKick": "Hand or upper shot",
    "mobile.rightKick.short": "HAND",
    "mobile.headHit": "Head",
    "mobile.headHit.short": "HEAD",
    "ball.label": "BALL",
    "weather.pending": "Weather: waiting",
    "weather.pendingLabel": "Weather is waiting",
    "weather.clear": "Clear",
    "weather.dawn": "Dawn",
    "weather.rain": "Rain",
    "weather.snow": "Snow",
    "weather.summary": "{label}, {intensity}%, wind {wind}, change {change}s, puddles {puddles}, slush {slush}, snowbanks {snowbanks}",
    "weather.intensity": "Weather strength",
    "weather.wind": "Wind",
    "weather.puddles": "Puddles",
    "weather.slush": "Slush",
    "weather.snowbanks": "Snowbanks",
    "server.joinedPitch": "{name} joined the pitch",
    "server.joinedSpectator": "{name} joined as spectator",
    "server.left": "{name} left",
    "server.playerLeft": "Player left",
    "server.profileUpdated": "{name} updated profile",
    "server.bodyChecked": "{name} body-checked the ball",
    "server.shotUpper": "{name} chipped the ball",
    "server.shotLow": "{name} drove the ball low",
    "server.withPower": " with power",
    "server.leftFoot": "{name} kicked with left foot",
    "server.rightFoot": "{name} kicked with right foot",
    "server.leftHand": "{name} hit with left hand",
    "server.rightHand": "{name} hit with right hand",
    "server.headed": "{name} headed the ball",
    "server.jumped": "{name} jumped",
    "server.bodyPlayed": "{name} played body",
    "server.celebrate1": "{name} raises hands after the goal",
    "server.celebrate2": "{name} jumps and pumps up the stands",
    "server.celebrate3": "{name} nods and fist-pumps"
  },
  ru: {
    "document.title": "UnSoccer {version} | Ragdoll Soccer II",
    "meta.description": "UnSoccer {version}: браузерный ragdoll-футбол с серверной физикой, ботами, чатом, эмоциями, стаминой, погодой, мобильным управлением и RU/EN интерфейсом.",
    "app.label": "UnSoccer",
    "canvas.label": "Игровое поле UnSoccer",
    "player.role.connecting": "Подключение",
    "player.role.player": "Игрок",
    "player.role.spectator": "Зритель",
    "player.generated": "Игрок {number}",
    "player.you": "Вы",
    "player.you.short": "вы",
    "player.youTeam": "Вы: {team} #{index}",
    "player.youSpectator": "Вы: зритель",
    "player.joinedTeam": "Вы в команде {team} #{index}.",
    "player.spectatorMode": "Режим зрителя/тестера.",
    "team.blue": "Синие",
    "team.orange": "Оранжевые",
    "team.spectators": "Зрители",
    "team.spectator": "Зритель",
    "team.blue.short": "С",
    "team.orange.short": "О",
    "team.spectator.short": "З",
    "controller.bot": "ИИ",
    "controller.test": "ТЕСТ",
    "score.goals": "Голы",
    "status.connecting": "Подключение",
    "status.connected": "Подключено.",
    "status.disconnected": "Отключено. Проверьте игровой сервер.",
    "status.serverFull": "Сервер заполнен.",
    "status.connectionError": "Ошибка подключения. Проверьте игровой сервер.",
    "status.networkError": "Ошибка сети",
    "status.websocketOnline": "WebSocket online",
    "status.httpFallback": "HTTP fallback",
    "status.httpFallbackConnecting": "Подключение HTTP fallback...",
    "status.httpSnapshotLost": "Потерян HTTP snapshot",
    "status.observing": "Наблюдение",
    "status.countdown": " Розыгрыш через {seconds}с.",
    "status.celebration": " Празднование {seconds}с.",
    "status.ballReturning": " Мяч летит в центр {progress}%.",
    "status.waitingPlayers": "Ждём игроков",
    "status.settingsApplied": "Настройки игры применены",
    "status.ballReturningPlain": "Мяч возвращается в центр",
    "status.centerKickoff": "Розыгрыш с центра",
    "score.orange": "Оранжевые забивают",
    "score.orangeWithScorer": "Оранжевые забивают: {name}",
    "score.blue": "Синие забивают",
    "score.blueWithScorer": "Синие забивают: {name}",
    "stamina.title": "Стамина",
    "stamina.waiting": "ожидание",
    "stamina.exhausted": "истощение",
    "stamina.sprint": "спринт",
    "stamina.low": "мало сил",
    "stamina.recovering": "восстановление",
    "stamina.ready": "готов",
    "network.snapshot": "snapshot --",
    "control.move": "Ход {binding}",
    "control.kickHand": "Удар/рука {left}/{right}",
    "control.head": "Голова {binding}",
    "control.jumpSprint": "Прыжок/спринт {jump}/{sprint}",
    "control.menu": "Меню {binding}",
    "action.moveForward": "Вперед",
    "action.moveBack": "Назад",
    "action.moveLeft": "Влево",
    "action.moveRight": "Вправо",
    "action.leftKick": "Левая нога",
    "action.rightKick": "Рука",
    "action.headHit": "Голова",
    "action.jump": "Прыжок",
    "action.sprint": "Спринт",
    "action.settings": "Меню",
    "action.cameraReset": "Камера",
    "action.muteAudio": "Звук",
    "settings.title": "Настройки",
    "settings.saved": "сохранено",
    "settings.notSaved": "не сохранено",
    "settings.play": "Игра",
    "settings.tabs": "Вкладки настроек",
    "settings.tab.controls": "Контроль",
    "settings.tab.audio": "Звук",
    "settings.tab.graphics": "Графика",
    "settings.tab.network": "Сеть",
    "settings.tab.accessibility": "Доступ",
    "settings.mode": "Режим",
    "settings.invertForwardBack": "Инверт вперед/назад",
    "settings.invertLeftRight": "Инверт лево/право",
    "settings.mirrorTeam": "Зеркало стороны",
    "settings.master": "Мастер",
    "settings.sfx": "SFX",
    "settings.ambience": "Окружение",
    "settings.weather": "Погода",
    "settings.ui": "UI",
    "settings.mute": "Без звука",
    "settings.muteBackground": "Глушить в фоне",
    "settings.test": "Тест",
    "settings.quality": "Качество",
    "settings.quality.low": "Низкое",
    "settings.quality.balanced": "Баланс",
    "settings.quality.high": "Высокое",
    "settings.resolution": "Разрешение",
    "settings.shadows": "Тени",
    "settings.weatherParticles": "Погода",
    "settings.cameraShake": "Тряска камеры",
    "settings.interpolation": "Интерполяция",
    "settings.highContrastHud": "Контрастный HUD",
    "settings.reduceEffects": "Меньше эффектов",
    "settings.dayCycle": "Цикл дня",
    "settings.dayCycle.live": "Живой цикл",
    "settings.dayCycle.qa": "QA scrub",
    "settings.qaTime": "QA время",
    "settings.autoReconnect": "Автоподключение",
    "settings.networkDetails": "Детали сети",
    "settings.largerHud": "Крупный HUD",
    "settings.teamPatterns": "Паттерны команд",
    "settings.reduceMotion": "Меньше движения",
    "settings.captions": "Субтитры",
    "settings.lessWeather": "Меньше погоды",
    "settings.resetTab": "Сброс вкладки",
    "settings.resetAll": "Сбросить всё",
    "settings.apply": "Применить",
    "settings.rebindPending": "{action}: нажмите клавишу",
    "settings.rebindDuplicate": "Дубли заменяются.",
    "settings.conflicts": "Конфликты: {codes}",
    "chat.label": "Чат игроков",
    "chat.placeholder": "Enter - чат",
    "chat.messageLabel": "Сообщение чата",
    "profile.nickname": "Никнейм",
    "profile.skin": "Скин",
    "profile.userPic": "Аватар или URL картинки",
    "profile.skinLabel": "Скин {index} - {id}",
    "emotion.wheel": "Колесо эмоций",
    "emotion.angry": "Злость",
    "emotion.happy": "Радость",
    "emotion.sad": "Грусть",
    "emotion.laugh": "Смех",
    "emotion.wow": "Вау",
    "emotion.shock": "Шок",
    "emotion.heart": "Сердце",
    "emotion.fire": "Огонь",
    "emotion.gg": "Хорошая игра",
    "emotion.goal": "Гол",
    "emotion.crown": "Корона",
    "emotion.clap": "Аплодисменты",
    "emotion.cool": "Круто",
    "toolbar.controls": "Управление UnSoccer",
    "toolbar.settings": "Настройки",
    "toolbar.mute": "Звук",
    "toolbar.fullscreen": "Полный экран",
    "toolbar.camera": "Сброс камеры",
    "mobile.controls": "Мобильное управление",
    "mobile.move": "Движение",
    "mobile.actions": "Действия",
    "mobile.up": "Вперед",
    "mobile.down": "Назад",
    "mobile.left": "Влево",
    "mobile.right": "Вправо",
    "mobile.sprint": "Спринт",
    "mobile.sprint.short": "БЕГ",
    "mobile.jump": "Прыжок",
    "mobile.jump.short": "ПРЫЖ",
    "mobile.leftKick": "Удар ногой",
    "mobile.leftKick.short": "УДАР",
    "mobile.rightKick": "Удар рукой или верхом",
    "mobile.rightKick.short": "РУКА",
    "mobile.headHit": "Голова",
    "mobile.headHit.short": "ГОЛ",
    "ball.label": "МЯЧ",
    "weather.pending": "Погода: ожидание",
    "weather.pendingLabel": "Погода ожидается",
    "weather.clear": "Ясно",
    "weather.dawn": "Рассвет",
    "weather.rain": "Дождь",
    "weather.snow": "Снег",
    "weather.summary": "{label}, {intensity}%, ветер {wind}, смена {change}с, лужи {puddles}, слякоть {slush}, сугробы {snowbanks}",
    "weather.intensity": "Сила погоды",
    "weather.wind": "Ветер",
    "weather.puddles": "Лужи",
    "weather.slush": "Слякоть",
    "weather.snowbanks": "Сугробы",
    "server.joinedPitch": "{name} подключился к полю",
    "server.joinedSpectator": "{name} подключился как наблюдатель",
    "server.left": "{name} вышел",
    "server.playerLeft": "Игрок вышел",
    "server.profileUpdated": "{name} обновил профиль",
    "server.bodyChecked": "{name} продавил мяч корпусом",
    "server.shotUpper": "{name} подбросил мяч верхом",
    "server.shotLow": "{name} пробил мяч низом",
    "server.withPower": " с усилением",
    "server.leftFoot": "{name} ударил левой ногой",
    "server.rightFoot": "{name} ударил правой ногой",
    "server.leftHand": "{name} ударил левой рукой",
    "server.rightHand": "{name} ударил правой рукой",
    "server.headed": "{name} сыграл головой",
    "server.jumped": "{name} прыгнул",
    "server.bodyPlayed": "{name} сыграл корпусом",
    "server.celebrate1": "{name} поднимает руки после гола",
    "server.celebrate2": "{name} прыгает и качает трибуны",
    "server.celebrate3": "{name} кивает и делает фист-памп"
  }
};

export function t(key: string, vars: Vars = {}): string {
  const template = STRINGS[currentLocale][key] ?? STRINGS.en[key] ?? STRINGS.ru[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    vars[name] === undefined ? match : String(vars[name])
  ));
}

export function generatedPlayerName(number = Math.floor(Math.random() * 90 + 10)): string {
  return t("player.generated", { number });
}

export function localizeGeneratedPlayerName(name: string): string {
  const match = name.trim().match(GENERATED_PLAYER_RE);
  return match ? t("player.generated", { number: match[1] }) : name;
}

export function actionLabel(action: InputAction): string {
  return t(`action.${action}`);
}

export function settingsTabLabel(tab: SettingsTab | string): string {
  return t(`settings.tab.${tab}`);
}

export function teamLabel(team: TeamId | null, singular = false): string {
  if (team === 0) return t("team.blue");
  if (team === 1) return t("team.orange");
  return t(singular ? "team.spectator" : "team.spectators");
}

export function teamShortLabel(team: TeamId | null): string {
  if (team === 0) return t("team.blue.short");
  if (team === 1) return t("team.orange.short");
  return t("team.spectator.short");
}

export function controllerBadge(controller: string): string {
  if (controller === "bot") return t("controller.bot");
  if (controller === "test") return t("controller.test");
  return "";
}

export function staminaLabel(state: string): string {
  return t(`stamina.${state}`);
}

export function emotionLabel(id: string): string {
  return t(`emotion.${id}`);
}

export function weatherKindLabel(kind: WeatherSnapshot["kind"] | string): string {
  return t(`weather.${kind}`);
}

export function weatherEmoji(kind: WeatherSnapshot["kind"]): string {
  if (kind === "dawn") return "🌅";
  if (kind === "rain") return "🌧️";
  if (kind === "snow") return "🌨️";
  return "☀️";
}

export function weatherMessageEmoji(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("рассвет") || normalized.includes("dawn")) return "🌅";
  if (normalized.includes("дожд") || normalized.includes("rain")) return "🌧️";
  if (normalized.includes("снег") || normalized.includes("snow")) return "🌨️";
  if (normalized.includes("ясн") || normalized.includes("clear")) return "☀️";
  return "🌤️";
}

export function applyStaticLocalization(version: string, buildWeightLabel: string): void {
  document.documentElement.lang = currentLocale;
  document.documentElement.dataset.locale = currentLocale;
  document.title = t("document.title", { version });
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t("meta.description", { version });

  setAttr("#app", "aria-label", "app.label");
  setAttr("#game-canvas", "aria-label", "canvas.label");
  setText("#player-role", "player.role.connecting");
  setText("#player-team", "team.spectator");
  setAttr("#stamina-meter", "aria-label", "stamina.title");
  setText("#stamina-meter .stamina-meter-head span", "stamina.title");
  setText("#stamina-state", "stamina.waiting");
  setText("#status", "status.connecting");
  setText("#weather", "weather.pending");
  setText("#ball-offscreen-indicator b", "ball.label");
  setAttr("#mobile-controls", "aria-label", "mobile.controls");
  setAttr(".mobile-move-pad", "aria-label", "mobile.move");
  setAttr(".mobile-action-pad", "aria-label", "mobile.actions");
  setAttr("#game-chat", "aria-label", "chat.label");
  setAttr("#profile-name", "aria-label", "profile.nickname");
  setAttr("#profile-skin", "aria-label", "profile.skin");
  setAttr("#profile-pic", "aria-label", "profile.userPic");
  setAttr("#profile-pic", "placeholder", "profile.userPic");
  setAttr("#chat-input", "placeholder", "chat.placeholder");
  setAttr("#chat-input", "aria-label", "chat.messageLabel");
  setAttr("#emotion-wheel", "aria-label", "emotion.wheel");
  setAttr("#toolbar", "aria-label", "toolbar.controls");
  setButtonTitle("#settings-button", "toolbar.settings");
  setButtonTitle("#mute-button", "toolbar.mute");
  setButtonTitle("#fullscreen-button", "toolbar.fullscreen");
  setButtonTitle("#camera-reset-button", "toolbar.camera");
  setText("#settings-title", "settings.title");
  setText("#settings-save-state", "settings.saved");
  setText("#settings-close-button", "settings.play");
  setAttr(".settings-tabs", "aria-label", "settings.tabs");
  setText("#reset-tab-button", "settings.resetTab");
  setText("#reset-all-button", "settings.resetAll");
  setText("#apply-settings-button", "settings.apply");
  setText("#test-sound-button", "settings.test");
  setText("#version-badge", "", { value: `${version} / ${buildWeightLabel}` });

  const scoreLabels = document.querySelectorAll<HTMLElement>(".score > span");
  if (scoreLabels[0]) {
    scoreLabels[0].textContent = "";
    scoreLabels[0].setAttribute("aria-label", t("team.blue"));
    scoreLabels[0].setAttribute("title", t("team.blue"));
  }
  if (scoreLabels[1]) {
    scoreLabels[1].textContent = "";
    scoreLabels[1].setAttribute("aria-label", t("team.orange"));
    scoreLabels[1].setAttribute("title", t("team.orange"));
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]")) {
    button.textContent = settingsTabLabel(button.dataset.settingsTab || "");
  }

  setLabel("#setting-movement-mode", "settings.mode");
  setLabel("#setting-invert-fb", "settings.invertForwardBack");
  setLabel("#setting-invert-lr", "settings.invertLeftRight");
  setLabel("#setting-mirror-team", "settings.mirrorTeam");
  setLabel("#setting-audio-master", "settings.master");
  setLabel("#setting-audio-sfx", "settings.sfx");
  setLabel("#setting-audio-ambience", "settings.ambience");
  setLabel("#setting-audio-weather", "settings.weather");
  setLabel("#setting-audio-ui", "settings.ui");
  setLabel("#setting-audio-muted", "settings.mute");
  setLabel("#setting-audio-bg-muted", "settings.muteBackground");
  setLabel("#setting-quality", "settings.quality");
  setLabel("#setting-resolution", "settings.resolution");
  setLabel("#setting-shadows", "settings.shadows");
  setLabel("#setting-weather-particles", "settings.weatherParticles");
  setLabel("#setting-camera-shake", "settings.cameraShake");
  setLabel("#setting-motion-interpolation", "settings.interpolation");
  setLabel("#setting-high-contrast-hud", "settings.highContrastHud");
  setLabel("#setting-reduce-effects", "settings.reduceEffects");
  setLabel("#setting-day-cycle-mode", "settings.dayCycle");
  setLabel("#setting-qa-time", "settings.qaTime");
  setLabel("#setting-auto-reconnect", "settings.autoReconnect");
  setLabel("#setting-show-network-details", "settings.networkDetails");
  setLabel("#setting-larger-hud", "settings.largerHud");
  setLabel("#setting-high-contrast-teams", "settings.teamPatterns");
  setLabel("#setting-reduce-motion", "settings.reduceMotion");
  setLabel("#setting-captions", "settings.captions");
  setLabel("#setting-reduce-weather-opacity", "settings.lessWeather");

  setOption("#setting-quality", "low", "settings.quality.low");
  setOption("#setting-quality", "balanced", "settings.quality.balanced");
  setOption("#setting-quality", "high", "settings.quality.high");
  setOption("#setting-day-cycle-mode", "live", "settings.dayCycle.live");
  setOption("#setting-day-cycle-mode", "qa", "settings.dayCycle.qa");

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mobile-dir]")) {
    const key = `mobile.${button.dataset.mobileDir || ""}`;
    button.setAttribute("aria-label", t(key));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mobile-action]")) {
    const action = button.dataset.mobileAction || "";
    button.setAttribute("aria-label", t(`mobile.${action}`));
    button.textContent = t(`mobile.${action}.short`);
  }
}

function setText(selector: string, key: string, vars: Vars = {}): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.textContent = key ? t(key, vars) : String(vars.value ?? "");
}

function setAttr(selector: string, attr: string, key: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.setAttribute(attr, t(key));
}

function setButtonTitle(selector: string, key: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  const label = t(key);
  element.setAttribute("title", label);
  element.setAttribute("aria-label", label);
}

function setLabel(controlSelector: string, key: string): void {
  const control = document.querySelector(controlSelector);
  const span = control?.closest("label")?.querySelector("span");
  if (span) span.textContent = t(key);
}

function setOption(selectSelector: string, value: string, key: string): void {
  const option = document.querySelector<HTMLOptionElement>(`${selectSelector} option[value="${value}"]`);
  if (option) option.textContent = t(key);
}
