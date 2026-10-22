# Матрица параметров расчётов web → API → CLI

Обновлено 22.10.2026 на `development`, HEAD `2d94f82` с локальными изменениями
0071–0075. Основа — шаг 12 [аудита](../todo/AUDIT.md);
[приёмка](features/0073-calculation-parameter-matrix.md).
Матрица отражает реализацию после шага 14.
После [шага 13](features/0074-calculation-form-composition.md) порядок секций
унифицирован. Форма запрашивает каталог с `includeUnavailable=true`, чтобы
показать выключенные сценарии с причиной; запуск по-прежнему запрещён.
В [шаге 14](features/0075-calculation-parameter-guidance.md) общие ограничения
и подсказки перенесены в contracts; физические параметры участка запрашиваются
явно. Батиметрия ограничена 0.1°, адаптивные настройки предзаполнены.

## Как читать матрицу

- **Предел API** — техническая runtime-проверка запроса, включая оба края,
  если не указано иное. Целые числа отмечены отдельно. Go дополнительно
  проверяет содержимое и совместимость входов; успешная проверка DTO не
  гарантирует успешного расчёта.
- **Default web/API** — фактически используемое значение, а не рекомендация.
  Технические начальные настройки показаны в форме. «Пусто / обязательно»
  означает отсутствие подстановки в web и API, включая граничные потоки.
  Отличия самостоятельного CLI перечислены ниже.
- **Выбор для исследования** — требуемое обоснование значения. Универсальный
  научно подтверждённый рабочий диапазон для перечисленных настроек в проекте
  не установлен. Числа из технических пределов, defaults и архивных пресетов
  нельзя представлять как такой диапазон. Необоснованные значения должны
  оставаться явно неподтверждёнными при дальнейшей разработке формы.
- Идентификаторы входов — UUID приватных файлов/артефактов владельца, а не
  пути. API проверяет роли и доступ; worker скачивает файлы, проверяет размер
  и SHA-256 и готовит серверные пути. Научная совместимость проверяется Go.

Источник поведения: [contracts](../packages/contracts/src/index.ts),
[общие числовые ограничения](../packages/contracts/src/calculation-parameters.ts),
[форматы списков](../packages/contracts/src/calculation-text-parameters.ts),
[validator и builder](../apps/lito-api/src/calculations/commands.ts),
[worker](../apps/lito-api/src/worker/main.ts),
[форма](../apps/lito-web/src/pages/account/new-calculation.page.tsx),
[поля калибровки](../apps/lito-web/src/pages/account/ui/cerc-calibration-fields.tsx),
[адаптеры Cobra](../apps/lito-cli/internal/cli/cobra).
Реестр всех CLI-команд и зависимостей — [cli-capabilities.md](cli-capabilities.md).

## Сценарии и обязательные входы

Названия в колонке «Входы» — поля DTO из следующего раздела. `?` означает
необязательный вход. «Heavy» — профиль очереди, требующий включённого heavy
worker и соответствующих зависимостей; каталог не предлагает его при
выключенном heavy. Это ограничение инфраструктуры, а не научный статус.

| Вид задания | Команда CLI | Входы | Профиль | Условия применения / параметры |
| --- | --- | --- | --- | --- |
| `coastline_region` | `region` | `coastlineInputId`?; иначе сохранённый контур MarineRegions | standard | Географический прямоугольник; извлечение данных не подтверждает пригодность сегмента CERC |
| `dimension` | `dimension` | Сохранённый контур MarineRegions, `data/coastline/black-sea.geojson` | standard | Геометрические метрики всего контура; дополнительных полей формы нет |
| `dimension_dataset` | `dimension` | `datasetId` | standard | Геометрические метрики сохранённой геометрии; сначала успешная проверка Go |
| `dimension_file` | `dimension` | `coastlineInputId` | heavy | Геометрические метрики файла после проверки Go |
| `map` | `map black-sea` | Сохранённый контур MarineRegions | standard | Картографическое представление; дополнительных полей формы нет |
| `map_file` | `map black-sea` | `coastlineInputId` | heavy | Карта выбранного контура |
| `erosion_file` | `erosion` | `coastlineInputId`, `waveInputId`, `bathymetryInputId`, `bathymetryMetadataInputId`; `sedimentSourcesInputId`?, `structuresInputId`? | heavy | Локальный открытый сегмент; CERC и экспорт |
| `all_file` | `all` | Те же четыре входа и два необязательных профиля | heavy | CERC, геометрические отчёты и параметры упрощения модели |
| `calibrate_cerc` | `calibrate-cerc` | Четыре входа CERC + `observationsInputId`; два профиля? | heavy | Сопоставимые наблюдаемые годовые скорости и длинный волновой ряд; параметры калибровки |
| `shoreline_data_audit` | `shoreline-data-audit` | `observationsInputId`; `waveInputId`? | standard | Аудит временного ряда линий берега; дата независимой проверки |
| `mesh` | `mesh` | `coastlineInputId` | heavy | Замкнутый морской полигон; Gmsh; размеры и бюджет генерации |
| `seabed_build` | `seabed build` | `flatMeshInputId`, `bathymetryInputId`, `bathymetryMetadataInputId`, `coastlineInputId` | heavy | Совместимые сетка, проекция, контур и паспорт источника; параметры сборки |
| `seabed_render` | `seabed render` | `modelInputId`, `exportMetadataInputId`, `sourceMetadataInputId` | heavy | Модель и её паспорта одного происхождения; параметры рисунков |
| `seabed_adapt` | `seabed adapt` | `modelInputId`, `sourceMetadataInputId` | heavy | Принятая модель `lito-seabed/v1`; параметры поля размера |
| `seabed_generate_adaptive` | `seabed generate-adaptive` | `modelInputId`, `exportMetadataInputId`, `fieldCsvInputId`, `fieldReportInputId`, `coastlineInputId` | heavy | Поле и отчёт соответствуют модели; Gmsh; параметры генерации |
| `seabed_validate` | `seabed validate` | `modelInputId`, `exportMetadataInputId`, `referenceModelInputId`, `referenceMetadataInputId`, `referencePassportInputId`, `fieldCsvInputId`, `fieldReportInputId` | heavy | Проверяемая модель, согласованный опорный набор и поле; параметры проверки |
| `seabed_compare_adaptive` | `seabed compare-adaptive` | Те же пять входов, что у `seabed_generate_adaptive` | heavy | Сравнение генераторов и уровней; опционально экспертные карточки / рисунок 5 |
| `seabed_assess_ml` | `seabed assess-ml` | `ratingsInputId`, `organizerKeyInputId`, `comparisonReportInputId`, `modelInputId`, `exportMetadataInputId`, `coastlineInputId` | heavy | Согласованные экспертные карточки, оценки и результаты сравнения; пороги AI-02 |
| `seabed_check_full` | `seabed check-full` | `flatMeshInputId`, `meshReportInputId`, `coastlineInputId`, `bathymetryInputId`, `bathymetryMetadataInputId` | heavy | MSH и отчёт одного запуска с SHA-256; проверка полного контура |

Три служебных вида не являются самостоятельным выбором формы:
`source_file` → `source --input` (heavy), `coastline_validation` →
`coastline-check --input` (heavy), `dataset_validation` →
`coastline-check --input` (standard). Для первых двух нужен `coastlineInputId`,
для третьего — `datasetId`. Они не добавляют пользовательских числовых полей.
Проверка файла может требовать heavy даже перед standard-сценарием выделения
участка. Удалённые `erosion` / `all_demo` остаются только в истории;
создание и исполнение запрещены.

`dimension_dataset` требует UUID на границе API. Текущая форма при пустом
выборе создаёт или находит сохранённый OSM-сегмент Сочи из
[generated-data](../packages/generated-data/src/coastline-examples.ts),
затем проверяет его и передаёт UUID. Это реальная архивная геометрия, а не
выбор данных участка пользователя; в шаге 13 источник должен быть виден до запуска.

## Соответствие входных полей и флагов

Роль приведена точно как в contracts. Подготовка пути не разрешает передавать
из HTTP произвольный путь, URL или содержимое командной строки.

| Поле формы / DTO | Роль | Флаг или подготовка worker |
| --- | --- | --- |
| `datasetId` | Сохранённый `DatasetDto` | Серверный GeoJSON → `--input` у `dimension` / служебной проверки |
| `coastlineInputId` | `coastline_geojson` | `--input` у region/геометрии/карты/mesh/CERC, `--coastline` у seabed |
| `waveInputId` | `wave_climate` | `--wave-input`; метаданные `source` → `--wave-source`, отдельного свободного поля формы нет |
| `bathymetryInputId` | `bathymetry_grid_json` | `--bathymetry` |
| `bathymetryMetadataInputId` | `bathymetry_grid_metadata_json` | У seabed → `--bathymetry-metadata`; у CERC worker размещает паспорт рядом с JSON под ожидаемым Go именем, отдельного флага нет |
| `sedimentSourcesInputId` | `longshore_sediment_sources_json` | `--sediment-sources` |
| `structuresInputId` | `longshore_structures_json` | `--structures` |
| `observationsInputId` | `shoreline_observations_json` у калибровки; `shoreline_timeseries_geojson` у аудита | `--observations`; роли и форматы невзаимозаменяемы |
| `flatMeshInputId` | `flat_mesh_msh` | `--mesh` у build/check-full |
| `modelInputId` | `seabed_msh` | `--input` у seabed |
| `exportMetadataInputId` | `export_metadata_json` | `--metadata` |
| `sourceMetadataInputId` | `bathymetry_source_json` | `--source-metadata` |
| `fieldCsvInputId` | `adaptive_field_csv` | `--field` у генерации/сравнения; `--size-field` у validate |
| `fieldReportInputId` | `adaptive_field_report_json` | `--field-report` у генерации/сравнения; `--size-field-report` у validate |
| `referenceModelInputId` | `seabed_msh` | `--reference` |
| `referenceMetadataInputId` | `export_metadata_json` | `--reference-metadata` |
| `referencePassportInputId` | `relief_reference_passport_json` | `--reference-passport` |
| `ratingsInputId` | `expert_ratings_tsv` | `--ratings` |
| `organizerKeyInputId` | `expert_organizer_key_json` | `--organizer-key` |
| `comparisonReportInputId` | `adaptive_comparison_report_json` | `--comparison` |
| `meshReportInputId` | `mesh_comparison_report_json` | `--mesh-report` |

Контуры используют GeoJSON `[долгота, широта]`, EPSG:4326, градусы.
Прибрежная батиметрия CERC хранит отметки под водой со знаком минус, в метрах;
шаг регулярной сетки — в градусах. Метрические параметры сетки нельзя
подменять угловым шагом источника. Для MSH/CSV требуются согласованные
метрическая проекция и экспортные паспорта. CRS, единицы, nodata, источник,
версия, лицензия и ограничения берутся из паспортов, а не выводятся из имени
файла. Проверка загруженного файла не означает научной аттестации.

## Поля параметров

### Географический участок

| Поле | CLI | Единица | Предел API | Default web / API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| `west`, `east` | `--west`, `--east` | ° долготы | 27…42.5; west < east | 27 и 42.5 / обязательны | Фактические границы изучаемого участка |
| `south`, `north` | `--south`, `--north` | ° широты | 40.5…47.5; south < north | 40.5 и 47.5 / обязательны | Те же границы; извлечение может не дать непрерывный открытый сегмент |

### CERC: `erosion_file`, `all_file`

| Поле | CLI | Единица | Предел API | Default web/API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| `steps` | `--steps` | состояний волн | целое 0…48 | 3 | 0 — весь загруженный ряд; положительное — первые N состояний. Число состояний не равно числу часов |
| `svgMaxFrames` | `--svg-max-frames` | кадров SVG | целое 0…128; при steps=0: 2…128 | 0 | Только прореживание изображений, не численных шагов; builder передаёт при steps=0 |
| `breakingIndex` | `--breaking-index` | безразмерная | 0.55…1.2 | пусто / обязательно | Обоснование прибойных условий участка; допустимый диапазон не является калибровкой |
| `bermHeight` | `--berm-height` | м | 0.001…100 | пусто / обязательно | Измерения активного профиля / калибровка |
| `closureDepth` | `--closure-depth` | м | 0.001…1000 | пусто / обязательно | Измерения активного профиля / калибровка |
| `porosity` | `--porosity` | доля | 0.000001…0.699999 | пусто / обязательно | Характеристики реальных наносов |
| `cercCoefficient` | `--cerc-coefficient` | безразмерная | 0.000001…1 | пусто / обязательно | Независимая калибровка K на наблюдениях участка |
| `offshoreSampleDistance` | `--offshore-sample-distance` | м | 1…100000 | пусто / обязательно | Положение отбора глубины и покрытие реальной прибрежной батиметрии |
| `maxShorelineChange` | `--max-shoreline-change` | м / состояние | 0.001…1000 | 25 | Численный защитный предел; достижение требует разбора, а не повышения ради успешного расчёта |
| `maxBathymetryGap` | `--max-bathymetry-gap` | м | 1…100000 | пусто / обязательно | Допустимая дистанция до реальной глубины по разрешению и неопределённости источника |
| `leftBoundaryTransport` | `--left-boundary-transport` | м³/с | −1000000…1000000 | пусто / обязательно | Положительный поток внутрь сегмента; явно заданный 0 — допущение, требующее обоснования |
| `rightBoundaryTransport` | `--right-boundary-transport` | м³/с | −1000000…1000000 | пусто / обязательно | Положительный поток из сегмента; то же требование к граничному условию |
| `outputCsv` | `--output-csv` | bool | true/false | false | Экспорт; фиксированное имя worker, путь пользователь не задаёт |
| `csvFormat` | `--csv-format` | формат | `long` / `wide` | `long` | При steps=0 разрешён только long, если CSV включён |
| `outputGif` | `--output-gif` | bool | true/false | false | GIF запрещён при steps=0; имена файлов фиксированы |
| `gifFps` | `--gif-fps` | кадров/с воспроизведения | целое 1…30 | 10 | Представление, не длительность волн |
| `gifSkip` | `--gif-skip` | шаг отбора кадров | целое 1…48 | 1 | Представление, не прореживание расчётного ряда |
| `modelMaxPoints` (`all_file`) | `--model-max-points` | точек | 0 либо целое 2…10000 | 0 | Контроль потери геометрии; 0 не задаёт явный лимит |
| `noModelSimplify` (`all_file`) | `--no-model-simplify` | bool | true/false | false | true несовместимо с modelMaxPoints > 0; при индексных профилях обязательны true и лимит 0 |

Для полного ряда worker задаёт фиксированные `--max-wave-conditions 10000`
и `--max-coast-points 200`; это защита ресурсов, а не научная рекомендация.
В режиме первых N эти два флага не передаются. SVG/GIF не заменяют полного
численного отчёта. `--bathymetry-resolution` у этих двух сценариев не является
полем HTTP: Go получает шаг из соседнего паспорта батиметрии.

Научная применимость, требования к открытому локальному сегменту, волновому
ряду и ограничения модели — в методике CERC (`packages/docs/content/cerc-one-line-model.md`).
Реальные входы и совпадение defaults с CLI не дают статуса прогноза.

### Калибровка и аудит ряда

`calibrate_cerc` использует параметры CERC из таблицы выше: `breakingIndex`,
`bermHeight`, `closureDepth`, `porosity`, `offshoreSampleDistance`,
`maxBathymetryGap`, `leftBoundaryTransport`, `rightBoundaryTransport` с теми же
флагами, пределами и defaults. Нет полей steps, SVG/GIF/CSV, maxShorelineChange,
cercCoefficient или упрощения модели. Дополнительно:

| Сценарий / поле | CLI | Единица | Предел API | Default web / API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| Калибровка: `bathymetryResolution` | `--bathymetry-resolution` | ° | 0.000000001…0.1 | пусто / обязательно | Только фактический шаг сетки, совпадающий с паспортом; нельзя подбирать вручную для улучшения результата |
| Калибровка: `cercCoefficients` | `--cerc-coefficients` | безразмерная | строка ≤96 символов, 1…8 чисел через запятую, каждое (0;1] | пусто / обязательно | Кандидаты эксперимента; список не доказывает пригодность лучшего K |
| Калибровка: `maxObservationDistance` | `--max-observation-distance` | м | 1…100000 | пусто / обязательно | Пространственное сопоставление с учётом точности наблюдений и геометрии |
| Калибровка: `minWaveHours` | `--min-wave-hours` | ч | 8766…100000 | 8766 | Минимальное покрытие годовой калибровки по протоколу Go; само по себе не доказывает полноту и репрезентативность ряда |
| Аудит: `validationStart` | `--validation-start` | дата UTC | Существующая дата YYYY-MM-DD либо отсутствие | пусто / отсутствует | Граница поздней независимой проверки задаётся до подбора модели; аудит не строит прогноз |

Содержимое наблюдений, неопределённость, разделение калибровки и проверки —
в той же методике (`packages/docs/content/cerc-one-line-model.md`).

### Плоская и адаптивная генерация сеток

| Сценарий / поле | CLI | Единица | Предел API | Default web/API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| mesh: `cellSizes` | `--cell-sizes` | м | 1…4 целых через запятую, каждое 10…10000 | `1000` | Исследование сходимости и разрешение источника; меньшая ячейка не добавляет измерений |
| mesh: `boundaryDetails` | `--boundary-details` | м | Тот же формат; одно значение либо столько же, сколько cellSizes | `1000` | Допуск детализации исходного берега; оценка потери геометрии |
| mesh/compare: `generators` | `--generators` | перечисление | Разрешённые сочетания ниже | mesh: `frontal-quad`; compare: `delaunay,frontal-quad` | Сопоставление принятых сеток по единому протоколу, без гарантированного победителя |
| adaptive: `generator` | `--generator` | перечисление | Один из трёх генераторов ниже | `delaunay` | Те же условия сравнения |
| adaptive/compare: `boundaryDetail` | `--boundary-detail` | м | 10…10000 | adaptive: 200; compare: 50 | Детализация контура, обоснованная точностью источника |
| mesh/adaptive/compare: `maxCells` | `--max-cells` | ячеек, оценка | целое 1000…25000000 | mesh/adaptive: 5000000; compare: 25000000 | Защита ресурсов; не порог научного качества |
| mesh/adaptive/compare: `allowLarge` | `--allow-large` при true | bool | true/false | false | Разрешение превысить защитную оценку Go после проверки ресурсов; лимиты worker остаются |
| mesh/adaptive/compare: `generatorTimeoutMinutes` | `--generator-timeout` (`Nm`) | мин | целое 1…120 | 20 | Лимит одного запуска генератора; общий лимит worker может завершить задание раньше |
| compare: `levels` | `--levels` | id и м | 1…4 уникальных `id:min:max`; целые размеры 10…10000, min < max | `detailed:125:250` | Набор уровней эксперимента; текущий default не является универсальной рекомендацией |
| compare: `detailPreset` | `--detail-preset` | перечисление | `none` / `kizilirmak` | `none` | Географическое окно рисунка; применять kizilirmak только для соответствующего участка, не как научный параметр |

Здесь adaptive — `seabed_generate_adaptive`, compare —
`seabed_compare_adaptive`. Разрешённые генераторы: `delaunay`, `frontal-quad`,
`parallelograms`. Для поля generators разрешены только три одиночных значения,
`delaunay,frontal-quad` и `delaunay,frontal-quad,parallelograms`; произвольные
перестановки и остальные пары API не принимает. ID уровня соответствует
`[a-z][a-z0-9_-]{0,31}`. API также принимает устаревающие альтернативы
`levelMin` / `levelMax` (10…10000 м, defaults 125/250) для одного detailed-уровня;
одновременно с levels их передавать нельзя. Отдельных полей формы для них нет.

Методики: сетка (`packages/docs/content/mesh-generation.md`),
адаптивная генерация (`packages/docs/content/adaptive-gmsh.md`),
сравнение (`packages/docs/content/adaptive-generator-comparison.md`).

### Сборка, рисунки и проверка модели дна

| Сценарий / поле | CLI | Единица | Предел API | Default web/API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| build/check-full: `boundaryDetail` | `--boundary-detail` | м | 10…10000 | 1000 | Согласование исходного контура и проекции; у build не задаёт размер ячеек |
| build/check-full: `maxSourceDistance` | `--max-source-distance` | м | 100…100000 | пусто / обязательно | Предел ближайшей замены; обосновать по покрытию и неопределённости батиметрии, не увеличивать для сокрытия nodata |
| build/check-full: `coastTransition` | `--coast-transition` | м | 0…100000 | 0 | 0 — автоматически два средних ребра; переход к береговому нулю должен быть явно учтён в интерпретации |
| build: `recoverWgs84` | `--recover-wgs84=true/false` | bool | true/false | true | Восстановление WGS84 для старой плоской MSH по контуру; требуется проверяемое происхождение проекции |
| build: `maxNodes`, `maxCells` | `--max-nodes`, `--max-cells` | узлов / ячеек | целое 1000…25000000 | 5000000 каждое | Защита ресурсов |
| build: `maxOutputMiB` | `--max-output-mib` | МиБ | целое 1…8192 | 2048 | Оценка объёма экспортов; не заменяет лимиты загрузки результатов worker |
| build: `allowLarge` | `--allow-large` при true | bool | true/false | false | Превышение защитных лимитов Go, без расширения квот worker |
| render/check-full: `isobaths` | `--isobaths` | м глубины | 1…16 положительных чисел ≤10000, до 3 десятичных знаков | `20,50,100,200,500,1000,1500,2000` | Уровни анализа/рисунка, выбранные до сравнения |
| render/check-full: `verticalExaggeration` | `--vertical-exaggeration` | множитель | 1…200 | 40 | Только отображение; не меняет научные отметки модели |
| render/check-full: `controlPoints` | `--control-points=true/false` | bool | true/false | true | Показ узловых выборок на рисунке |
| validate: `isobaths` | `--isobaths` | м глубины | Тот же формат | `20,200,1000,2000` | Уровни контрольного сопоставления |
| validate: `worstCells` | `--worst-cells` | ячеек отчёта | целое 1…1000 | 20 | Число показываемых проблемных ячеек, не ограничение проверяемой модели |
| validate: `maxNearestDistance` | `--max-nearest-distance` | м | 0…100000 | 0 | 0 — два шага разрешения опорного источника по Go; явное значение обосновать точностью источника |
| check-full: `generator` | `--generator` | перечисление | Один из трёх генераторов | `frontal-quad` | Должен соответствовать проверяемому запуску mesh-report |
| check-full: `targetEdge` | `--target-edge` | м | 10…10000 | 1000 | Контрольная длина ребра выбранного запуска, не рекомендация для любой акватории |

build/render/validate/check-full обозначают соответствующие `seabed_*` виды.
У check-full worker фиксирует `--max-mesh-mib 256`; пользовательского поля нет.
Паспорта и контрольные суммы запрещают произвольное смешение результатов.
Научная интерпретация и ограничения —
руководство модели дна (`packages/docs/content/seabed-scientific-guide.md`).

### Поле адаптивного размера: `seabed_adapt`

С шага 17 необязательное `input.reportType` выбирает основное представление:
`seabed_render` — `bathymetry_overview` или `mesh_details`, `seabed_adapt` —
`size_field`. Каталог и сочетания в contracts; API проверяет kind. Это
метаданные задания, не флаг CLI или научный параметр: Go сохраняет все
обычные артефакты, web выделяет выбранный SVG. Старые запросы без поля
совместимы. Приёмка — [0078](features/0078-seabed-report-selection.md).
В [0079](features/0079-box-counting-report-selection.md) этот контракт
расширен для `dimension`, `dimension_dataset`, `dimension_file`:
`coastline_box_counting` и `box_counting_regression`. UUID и CLI-флаги
не расширены. Доступные сочетания задаёт общий каталог `calculationReports`.

| Поле | CLI | Единица | Предел API | Default web/API | Выбор для исследования |
| --- | --- | --- | --- | --- | --- |
| `minSize` | `--min-size` | м | 1…100000 | 200 | Минимальный размер по разрешению данных и исследованию сходимости |
| `coastSize` | `--coast-size` | м | 1…100000 | 300 | Размер у берега по его геометрической точности |
| `shelfSize` | `--shelf-size` | м | 1…100000 | 500 | Разрешение шельфа по задаче и источнику |
| `deepSize` | `--deep-size` | м | 1…100000 | 1000 | Разрешение глубоководья по задаче и источнику |
| `coastInfluence` | `--coast-influence` | м | 1…1000000 | 25000 | Дальность влияния берега; исследование чувствительности |
| `curvatureReference` | `--curvature-reference` | ° | 0.001…180 | 30 | Опорный поворот берега; обоснование по геометрии |
| `slopeReference` | `--slope-reference` | ° | 0.001…90 | 10 | Опорный уклон по батиметрии |
| `flatDeepSlope` | `--flat-deep-slope` | ° | 0.001…90 | 1 | Условие ровного глубоководья по батиметрии |
| `maxNeighbourRatio` | `--max-neighbour-ratio` | отношение | 1.000001…100 | 1.25 | Плавность поля и проверка качества итоговой сетки |
| `maxSizeGradient` | `--max-size-gradient` | м/м | 0.000001…100 | 0.15 | То же; числовой порог требует проверки чувствительности |

Обязательно minSize ≤ coastSize ≤ shelfSize ≤ deepSize.
Кнопка пресета рисунка 4 заполняет размеры `50,75,125,250` м, остальные значения
берёт из показанного архивного пресета. Это воспроизведение эксперимента,
не рабочий диапазон для любого участка. Алгоритм, дополнительные требования
к принятой модели и действительным порогам зон —
поле размера (`packages/docs/content/adaptive-size-field.md`).

### Экспертный набор, рисунок 5 и AI-02

Первые шесть полей доступны у `seabed_compare_adaptive`, последние пять —
у `seabed_assess_ml`. Они задают протокол исследования / представление,
а не свойства геофизической модели.

| Поле | CLI | Единица | Предел API / зависимость | Default web/API | Обоснование выбора |
| --- | --- | --- | --- | --- | --- |
| `generateExpertSet` | `--expert-set` | bool | true/false; при true ≥2 генераторов | false | Нужен сравнительный эксперимент с экспертами |
| `expertLevels` | `--expert-levels` | ID уровней | Пусто = все; иначе 1…4 уникальных существующих ID | пусто | Заранее определить сравниваемые уровни |
| `expertSeed` | `--expert-seed` | строка | 1…80 символов `[a-zA-Z0-9_-]` | `ai-01-black-sea-2026` | Воспроизводимая анонимизация, не научный коэффициент |
| `generateFigureFive` | `--figure-five` | bool | true/false; требуется expert-set | false | Нужен рисунок из фактических экспертных карточек |
| `figureFiveLevel` | `--figure-five-level` | ID | При включении обязателен, входит в expertLevels | пусто | Уровень публикуемого результата |
| `figureFiveGenerator` | `--figure-five-generator` | перечисление | При включении обязателен, входит в generators | web: `delaunay`; API требует явного выбора | Генератор публикуемого результата |
| `minExpertsPerCard` | `--min-experts-per-card` | экспертов | целое 2…10 | 2 | Дизайн экспертного исследования; универсальный достаточный объём не установлен |
| `minTraining` | `--min-training` | карточек | целое 2…96 | 12 | Размер обучения по протоколу и доступным независимым данным |
| `minEvaluation` | `--min-evaluation` | карточек | целое 2…96 | 12 | Размер отложенной проверки, не доказательство статистической мощности |
| `ridgeLambda` | `--ridge-lambda` | параметр регуляризации | 0.000001…1000 | 1 | Выбор по протоколу обучения с независимой проверкой |
| `minRmseImprovement` | `--min-rmse-improvement` | доля | 0.001…0.99 | 0.1 | Заранее установленный критерий улучшения; 0.1 = 10%, не научная аттестация |

Когда expert-set выключен, expertLevels/expertSeed передавать нельзя; когда
figure-five выключен, его level/generator тоже нельзя. Кнопки пресетов и
переходов между этапами только заполняют существующие поля / UUID, отдельного
флага вычислительного ядра у них нет. Протокол и ограничения —
экспертный набор (`packages/docs/content/expert-fragment-set.md`).

## Различия слоёв и выполненная приёмка

Шаг 14 устранил расхождения HTML/API для адаптации, дробных размерных полей
и шага батиметрии. Числа, формат списков и зависимые ограничения проверяются
одними функциями contracts. Swagger берёт те же числовые пределы и перечисляет
обязательные входы каждого сценария. Параметры участка CERC, кандидаты K,
дистанция наблюдений и радиус поиска глубины дна больше не получают скрытых
значений. Явный 0 на границе сохраняется; пустое поле не означает 0.

Оставшиеся различия самостоятельного CLI и HTTP намеренные:

| Наблюдение | Интерпретация |
| --- | --- |
| CERC web/API: первые 3 состояния; CLI erosion/all: steps=0 и svg-max-frames=0 | В web весь ряд требует явного выбора и 2…128 SVG; число состояний не равно числу часов |
| mesh CLI: размеры/детализации `1000,500,300,200`, три генератора, max-cells=15000000, timeout=5m; HTTP: один 1000, frontal-quad, 5000000, 20m | Это технические стартовые настройки web/API; они не копируются из CLI автоматически |
| compare CLI: detail=200, три генератора, levels=`detailed:200:1000,coarse:500:1000`, max-cells=5000000, timeout=10m; HTTP: 50, два генератора, detailed:125:250, 25000000, 20m | Географическое окно теперь none в обоих интерфейсах; kizilirmak остаётся явным архивным пресетом |
| Go нормализует ряд нулевых CERC-параметров в defaults; API физические нули отклоняет, кроме разрешённых граничных потоков | В web/API 0 не означает «автоматически» для бермы, K и пористости; CLI-defaults сохранены для совместимости |
| Go проверяет проекции, паспорта, научную совместимость и индексные профили | Успех валидации формы не является научной проверкой; ошибки Go сохраняются |

Самостоятельный CLI шире HTTP и не обязан иметь те же ресурсные пределы:
например, Go adaptive проверяет положительность, порядок размеров и отношение
>1, а API дополнительно ограничивает числовые диапазоны. Не расширять HTTP
на основании более широких возможностей CLI.

## Граница безопасного запуска и поддержка матрицы

`kind` выбирается из разрешённого каталога, внешние поля проверяются runtime.
`--output` задаёт worker; `--manifest` добавляет worker. Пути CSV/GIF,
`--max-mesh-mib` и ограничения полного ряда фиксированы сервером. HTTP не
принимает `--source-url`, `--refresh`, `--gmsh`, arbitrary argv, пути или URL
источников вместо UUID. Пользовательские метаданные загрузки (источник,
лицензия, CRS и прочие поля паспорта) проходят отдельный контракт, а не
превращаются в произвольные флаги. Изменение этой границы — отдельная задача.

При изменении поля сначала обновить contracts/validator и Go при необходимости,
затем builder, api-client, форму, Swagger и соответствующую строку матрицы.
При изменении научной реализации действует правило ревизий методов из AGENTS.md.
В шагах 12–14 расчётные методы и их ревизии не менялись.
