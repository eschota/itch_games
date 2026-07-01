# UnSoccer v0.0.001: visual vertical slice brief

Дата: 2026-07-01
Владелец: Art Director
Связанный style guide: `art_director/style_guides/unsoccer-hdr-day-cycle-camera.md`

## Цель прохода

Сделать первый визуальный срез UnSoccer, который закрывает прямое требование
Producer: крутая графика, HDR/environment lighting, видимое солнце, 120-секундный
цикл времени суток, реактивное освещение и перспективная камера над полем с
инерцией за игроком.

## Scope по файлам

- Art Director: этот brief, style guide, visual acceptance и screenshots.
- Programmer: `unsoccer/client/src/main.ts`.
- UI Designer: `unsoccer/client/index.html`, `unsoccer/client/src/styles.css`.
- Game Designer + Programmer: `unsoccer/shared/`, `unsoccer/server/` только если
  нужно разделить авторитетные события удара телом и ногой.
- Tester: `tester/checks/` или профильная папка QA evidence.

## Обязательная реализация в client visual pass

- Tone mapping / HDR-like экспозиция в Three.js.
- Видимый sun disk или читаемый источник солнца.
- 120-секундный day-cycle: утро, день, закат, вечер/ночь.
- Синхронная реакция sky, fog, sun direction, shadow, ambient tint.
- Инерционная perspective camera: игрок + мяч + look-ahead, без резких snaps.
- Игровая читаемость ночью: мяч, команды, ворота и линии поля видны.
- Русские видимые статусы и подсказки.

## Contact readability

- Удар ногой должен иметь foot/contact cue.
- Удар телом должен выглядеть тяжелее: body/contact cue, camera nudge или
  отдельный feedback.
- Если server/shared пока не готовы для отдельного body-hit события, client
  должен хотя бы визуально разделять leg kick и heavier contact placeholder.

## Acceptance для QA

- Desktop `1280x720`: поле, мяч, игрок, ворота и солнце читаются в одном кадре.
- Mobile/narrow: HUD и основные объекты не обрезаются.
- Скриншоты времени дня: `0s`, `30s`, `60s`, `90s`, `120s`.
- Нет console errors, blank canvas, сильного text overlap.
- Нет runtime remote assets.
- Free3D/GLB персонажи не блокируют этот срез; подключать только после
  provenance.

## Арт-директорское решение

Сначала делаем процедурный visual vertical slice на placeholder игроках и мяче.
Это лучший порядок, потому что он проверяет feel, lighting, camera и gameplay
readability до тяжёлого asset pipeline.
