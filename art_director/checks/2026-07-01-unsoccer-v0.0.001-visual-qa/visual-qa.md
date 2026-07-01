# UnSoccer v0.0.001: Art Director visual QA

Дата: 2026-07-01
Роль: Art Director
Surface: `http://127.0.0.1:5174/?name=ArtDirectorVisual`
Server health: `http://127.0.0.1:8787/api/health`

## Visual target

UnSoccer должен выглядеть как энергичный физический футбол на читаемом поле:
HDR-like свет, видимое солнце, заметная смена времени суток, перспективная
камера над игроком с инерцией, мяч и игроки читаются в каждом состоянии.

## Current state

- UnSoccer server уже был запущен на `8787`; `/api/health` вернул `ok=true`,
  `version=v0.0.001`, `activePlayers=2`, `connectedClients=2`.
- Vite client был доступен на `5174`; Art Director QA подключился как третий
  клиент.
- Desktop DOM: `lang=ru`, горизонтального overflow нет, canvas занимает viewport,
  console warning/error logs пустые.
- Mobile `390x844`: горизонтального overflow нет, canvas занимает viewport,
  console warning/error logs пустые.
- Смена освещения видна между desktop samples `t0`, `t30`, `t60`, `t90`.

## Mismatches

- Видимое солнце/источник света не попал ни в один проверенный gameplay кадр.
  Свет меняется, но Producer просил именно солнце и HDR/environment impression.
- На `t30` и `t60` левый край поля и окружение выглядят как тяжёлая чёрная
  диагональ. Это читается как случайная тёмная форма, а не как контролируемая
  stadium/environment композиция.
- На `t90` часть player-facing UI возвращается на английский: `Blue`,
  `Orange`, `you`. На mobile также видны `Blue`, `Orange`, `you` в roster.
  Это нарушает требование Producer писать всё на русском.
- `t120` loop sample не снят в этом проходе. Проверка возврата цикла в начало
  остаётся неполной.
- Camera framing в проверенных кадрах держит игрока и мяч, но кодовый read-only
  срез показал риск: camera target не смешивает player + ball + velocity
  look-ahead полноценно, поэтому мяч может уходить из кадра в активной игре.
- Body/leg contact readability не проверена кадром: в текущих samples не было
  достаточного удара телом и отдельного удара ногой.

## Actions

- Programmer: сделать солнце читаемым в gameplay кадре или добавить
  небесный/стадионный ориентир, который явно показывает источник света.
- Programmer / Art Director: смягчить или переосмыслить тёмные диагонали
  окружения, чтобы они выглядели как стадионная структура, а не как clipping.
- UI Designer / Programmer: перевести все fallback/team/self labels на русский:
  `Blue`, `Orange`, `you`, `Player`, `Agent` и похожие runtime строки.
- Programmer: использовать camera ball blend / look-ahead и применить
  `cameraImpulse` для body contact, если это уже заложено в коде.
- Tester: снять обязательные follow-up evidence кадры `t120`, mobile gameplay,
  foot kick и body contact после следующего client pass.

## Acceptance status

- Desktop readability: partially passed. Поле, мяч, игроки и ворота читаются,
  но солнце не подтверждено кадром.
- Day-cycle: partially passed. `t0/t30/t60/t90` показывают изменение света;
  `t120` loop не проверен.
- Mobile layout: partially passed. Нет overflow, HUD виден, но roster содержит
  английские labels.
- Russian-only UI: failed until all runtime/fallback labels are translated.
- Contact readability: not verified in this pass.
- Console/blank canvas: passed for checked desktop/mobile frames.

## Evidence

- `desktop-cycle-t0.png`
- `desktop-cycle-t30.png`
- `desktop-cycle-t60.png`
- `desktop-cycle-t90.png`
- `mobile-390x844.png`
