# OpenCode — шпаргалка продолжения (handoff)

Последнее обновление: 13.08.2026

## Проект
- Прототип приложения «СП Петровское» (спортивный клуб) в Open Design.
- Главный рабочий экран: `screens/07-add-event.html` (создание события, шаг «Площадка и время»).
- Дизайн-система: `assets/ds.css`. Референсы UX: `referens/Grok_Arenda*.txt`, `referens/create-event.html`.
- Спецификация: `product-spec.md`.

## GitHub
- Репозиторий: `https://github.com/negonibesa/sp-petrovskoe` (публичный, аккаунт negonibesa).
- Живой сайт (Pages): `https://negonibesa.github.io/sp-petrovskoe/` (карта макетов = `index.html`).
- Экран аренды: `.../screens/07-add-event.html`.
- Локальный git репо — в корне проекта. Пуш обновлений: `git add -A` → `git commit` → `git push` (сайт обновится ~2 мин).
- `.gitignore` исключает внутренности Open Design: `.file-versions/`, `.od-skills/`, `*.artifact.json`, `referens/`.
- Вход через `gh` (GitHub CLI, `C:\Program Files\GitHub CLI\gh.exe`). Авторизован как negonibesa.

## Фото площадок в листе «О площадке» (07-add-event.html)
- Реальные фото: `assets/facilities/<id>-<n>.png|.jpg`, n = 1..4. ID: gym1, gym2, fit, pool, tennis, martial.
- Логика `buildFacilityPhotos` (~стр. 772): загрузилось ≥1 реального фото → только они; иначе fallback на `f.photos` (иллюстрации `assets/sports/*.png`).
- На первой фотке подпись = название площадки (`f.name`), остальные без подписи.
- Загружено 17 PNG (668×376, ровно 16:9). У бассейна нет `pool-1` (только pool-2, pool-3) → 2 фото.
- Важные фиксы (были причины «не видно фото»): `img.src = src` добавлялся в `addSlide`; `padding: 0` для cover-режима (иначе видна голубая подложка-рамка).

## Figma через MCP (htmlToFigma)
- MCP-сервер: `C:\Users\Rakutin\htmlToFigma\figmaToDesign` (клонирован с github.com/Yueyin-Tql/htmlToFigma, MIT).
- Прописан в `opencode.json` (корень проекта) под именем `html-to-figma`; тип local, команда `node C:\Users\Rakutin\htmlToFigma\figmaToDesign\dist\index.js`; env `PUPPETEER_EXECUTABLE_PATH` = системный Chrome.
- **После правки конфига opencode нужно перезапустить**, чтобы MCP подхватился.
- Исправлены 2 бага upstream (в src, затем `npm run build`):
  1. `svg-converter.ts`: `import { parseSVG } from 'svg-parser'` → default-импорт (иначе краш ESM/CJS).
  2. `web-to-figma.ts`: метод `extractStyles(page)` переименован в `extractStylesFromPage` (иначе перекрывал базовый `extractStyles(cssRules)` и падал `page.evaluate is not a function`).
- Проверено: конвертация `https://negonibesa.github.io/sp-petrovskoe/screens/07-add-event.html` → `.fig.json` (336 КБ, FRAME+TEXT ноды) — успешно.
- Инструменты сервера: `import_web_to_figma(url, viewport, outputPath)`, `import_code_to_figma`, `import_h2d_file`, `create_figma_file`.
- Импорт JSON в Figma: плагин «Figma JSON Import» (Community). Это `.fig.json` формат.
- Токен Figma: `referens/Figma.txt` — отвечает 401 (не активирован/обрезан). Нужен только для `create_figma_file`; для пути «JSON → плагин» не требуется. Перегенерировать на https://www.figma.com/settings → Account → Security. Сохранён в env-переменной Windows `FIGMA_ACCESS_TOKEN` (user scope).

## Выгрузка в Figma (бесплатный путь, без платного плагина)
- Плагин «Figma JSON Import» из Community — платный. Вместо него работает **локальный плагин** `figma-plugin/` (dev-режим): импортирует `.fig.json` прямо на активную страницу.
- Загрузка: Figma → Plugins → Development → Import plugin from manifest → выбрать `figma-plugin/manifest.json`. Запуск: правый клик → Plugins → Fig JSON Import.
- Сборка `.fig.json` из локальных HTML: `node figma-export/build.mjs` (в `figma-export/`). Конвертирует `screens/*.html` + `assets/ds.css`, встраивает локальные картинки в base64, из `:root`-токенов ds.css собирает страницу «Design Tokens» (75 токенов).
- Скрипт импортирует dist-конвертер htmlToFigma напрямую (без MCP, без Chrome). Выход: `figma-export/{06-home,07-add-event,07-calendar,design-system,design-tokens}.fig.json`.
- Исправлены 2 бага в dist (нужно сохранять при пересборке сервера!):
  1. `svg-converter.js`: `import { parse as parseSVG } from 'svg-parser'` (нативная ESM-сборка, у svg-parser нет default-экспорта и нет `parseSVG`).
  2. `base-converter.js` `parseCssRules`/`selectorToString`: устойчивость к сложным селекторам (иначе падает весь CSS-маппинг).
- Ограничения: картинки, подгружаемые JS (фото площадок в 07-add-event), в статической сборке не встраиваются — для полного рендера нужен путь с Chrome (`import_web_to_figma` через file://, см. выше: перезапуск opencode после правки конфига MCP).

## Инструменты/приёмы проверки
- Headless Chrome: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --user-data-dir=<отдельный профиль> --screenshot=... --window-size=430,932`.
- Beacon: node-сервер на 127.0.0.1:8733 логирует `new Image().src = "http://127.0.0.1:8733/?r=..."` в `$env:TEMP\opencode\beacon.log` (файл beacon.js был удалён после задачи; при необходимости пересоздать).
- Важно: каждая команда в opencode — отдельный PowerShell-процесс; фоновые Start-Job живут только внутри одной команды. Долгий сервер поднимать через Start-Process (переживает сессию) или в той же команде, где тест.
- Валидация JS: вытащить `<script>` из html → `node --check`.
