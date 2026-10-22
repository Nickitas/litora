# Эталонные рисунки → вычислительные отчёты

Сверено 22.10.2026 на `development`, HEAD `2d94f82` с локальными изменениями
0071–0076. Основание — [шаг 16 аудита](../todo/AUDIT.md) и
[спецификация 0077](features/0077-reference-figure-mapping.md).
Это инженерная карта существующего кода и пробелов для шагов 17–18.
Она не подтверждает научную пригодность входного набора.

В `todo/examples_figures` 11 корректных XML/SVG, **9 уникальных содержимых**.
Номер рисунка и имя файла не являются идентификатором вычислительного метода.
Различаем наличие генератора, возможность выбрать результат в web и точный
повтор архивного расчёта. Последний требует исходных файлов, их контрольных
сумм, параметров и версий, а не только похожего изображения.

## Реестр всех файлов

Пути ниже относительно `todo/examples_figures`. Группы A–E раскрыты далее;
они обозначают существующие вычислительные пути, а не новые значения DTO.

| Файл | Размер SVG | Вид и признаки эталона | Путь / статус |
| --- | --- | --- | --- |
| `fig_01_normalized_coastline_box_counting.svg` | 1440×917 | Наблюдаемый берег и аналитическая сетка box-counting; D=1.10840, R²=0.9999, 13 масштабов | A: `dimension`; значения воспроизведены, текущая компоновка отличается |
| `fig_02_box_counting_regression.svg` | 1100×720 | График log(1/ε) / log(N), точки и окно регрессии того же анализа | B: второй SVG `dimension`; точки и D/R² воспроизведены, подпись покрытия и прямая исправлены в 0079 |
| `fig_03_bathymetry_overview.svg` | 1600×1000 | Обзор глубин, изобаты, 1712 узлов / 1596 ячеек, максимальная глубина 2223.7 м | C: `seabed render`; генератор есть, точный входной MSH не установлен |
| `fig_04_adaptive_size_field.svg` | 1600×1000 | Целевой размер h(x,y), четыре опорных размера 200/300/500/1000 м; 1712 узлов / 1596 ячеек | D: `seabed adapt`; поле, новая сетка ещё не построена; исходный MSH/JSON поля не установлены |
| `fig_05_actual_mesh_fragments.svg` | 1600×1600 | Три автоматически выбранных окна модели: сложный берег, шельф, склон; 70/133/107 ячеек из 1596, `data-unthinned=true` | C: `mesh-details.svg`; генератор есть, точный входной MSH не установлен |
| `fig_06a_delaunay_detailed_kizilirmak.svg` | 960×720 | Анонимная карточка E-002, коса, окно LAEA 28×28 км, 10115 полигонов сетки / 25 отрезков изобат | E: AI-01; имя заявляет Delaunay/detailed, связанный паспорт не найден |
| `fig_06b_frontal_quad_detailed_kizilirmak.svg` | 960×720 | Анонимная карточка E-013, то же окно, 8373 полигона / 25 отрезков изобат | E: AI-01; имя заявляет Frontal-Quad/detailed, связанный паспорт не найден |
| `fig_06a_delaunay_coarse_kizilirmak.svg` | 960×720 | Анонимная карточка E-009, то же окно, 2548 полигонов / 25 отрезков изобат | E: AI-01; имя заявляет Delaunay/coarse, связанный паспорт не найден |
| `fig_06b_frontal_quad_coarse_kizilirmak.svg` | 960×720 | Анонимная карточка E-007, то же окно, 2099 полигонов / 25 отрезков изобат | E: AI-01; имя заявляет Frontal-Quad/coarse, связанный паспорт не найден |
| `fig_07a_delaunay_coarse_kizilirmak.svg` | 960×720 | Побайтовый дубликат `fig_06a_delaunay_coarse_kizilirmak.svg` | E: тот же результат, отдельный генератор или вариант не нужен |
| `fig_07b_frontal_quad_coarse_kizilirmak.svg` | 960×720 | Побайтовый дубликат `fig_06b_frontal_quad_coarse_kizilirmak.svg` | E: тот же результат, отдельный генератор или вариант не нужен |

Число отрезков изобат в карточках не равно числу глубинных уровней. Число
полигонов характеризует показанные пересекающие окно ячейки, а не всю MSH.
Одна ячейка может попасть в несколько окон рисунка 5.

## Генераторы, входы и артефакты

Выходные пути в таблице относительно переданного `--output`. Cobra только
связывает ввод с Go-пакетами. HTTP использует UUID собственных научных входов;
локальные пути, shell-аргументы и URL из запроса не принимаются.

| Группа | Go: вычисление и представление | Обязательные научные входы | Результат / существующий API |
| --- | --- | --- | --- |
| A — наблюдаемый берег | `runDimension` в [dimension.go](../apps/lito-cli/internal/cli/cobra/dimension.go) → `fractal.AnalyzeBoxCounting` в [domain/fractal/dimension.go](../apps/lito-cli/internal/domain/fractal/dimension.go) → `cli.WriteDimensionSVG` в [output.go](../apps/lito-cli/internal/cli/output.go) → `svgrender.DrawEnhancedSVG` в [render/svg/enhanced.go](../apps/lito-cli/internal/render/svg/enhanced.go) | Явный реальный GeoJSON берега WGS84; проекция и версия геометрии фиксируются Go | `svg/dimension_0.svg`, `metrics/dimension.metrics.json`; `dimension`, `dimension_dataset`, `dimension_file` |
| B — аудит регрессии | Тот же анализ → `logLogPlotOptionsFromAnalysis` → `svgrender.DrawLogLogSVG` в [loglog.go](../apps/lito-cli/internal/render/svg/loglog.go) | Те же точки и масштабы, что A; отдельный набор данных не нужен | `svg/dimension_loglog_0.svg` и тот же JSON; тот же job, оба SVG создаются автоматически |
| C — глубины / фактическая сетка | `runSeabedRender` → `writeSeabedVisualizations` в [seabed.go](../apps/lito-cli/internal/cli/cobra/seabed.go) → `bathymetry.WriteOverviewSVG` в [overview.go](../apps/lito-cli/internal/render/bathymetry/overview.go) и `WriteMeshDetailsSVG` в [details.go](../apps/lito-cli/internal/render/bathymetry/details.go) | Принятая батиметрическая full-quad MSH `lito-seabed/v1`, согласованный паспорт EXPORT-02, паспорт источника с атрибуцией и SHA-256; X/Y LAEA и глубины в м | `seabed/svg/bathymetry-overview.svg`, `seabed/svg/mesh-details.svg`, `seabed/bathymetry-overview.json`; `seabed_render`: `modelInputId`, `exportMetadataInputId`, `sourceMetadataInputId` |
| D — поле размера | `runSeabedAdapt` в [seabed_adapt.go](../apps/lito-cli/internal/cli/cobra/seabed_adapt.go) → `adaptive.BuildSizeField` в [field.go](../apps/lito-cli/internal/domain/adaptive/field.go) → `WriteSizeFieldSVG` в [render/adaptive/size_field.go](../apps/lito-cli/internal/render/adaptive/size_field.go) | Принятая батиметрическая MSH, паспорт источника; десять параметров поля, исходные признаки и морфометрические зоны | `seabed/svg/size-field.svg`, `seabed/adaptive/size-field.csv`, `seabed/adaptive/size-field.json`; `seabed_adapt`: `modelInputId`, `sourceMetadataInputId` |
| E — сравнение сеток, карточки AI-01 | `runSeabedAdaptiveCompare` в [seabed_adaptive_compare.go](../apps/lito-cli/internal/cli/cobra/seabed_adaptive_compare.go) → Gmsh и Go-оценка ADAPT-03 → `executeSeabedExpertSet` в [seabed_expert_set.go](../apps/lito-cli/internal/cli/cobra/seabed_expert_set.go) → `WriteExpertFragmentSVG` в [render/adaptive/expert_set.go](../apps/lito-cli/internal/render/adaptive/expert_set.go) | Опорная батиметрическая MSH, EXPORT-02, согласованные CSV и JSON поля ADAPT-01, исходный GeoJSON контура; диапазоны уровней, генераторы, seed и версия Gmsh; минимум два успешных генератора каждого выбранного уровня | Отчёт `seabed/adaptive/comparison/adaptive-generator-comparison.json`, кандидатные MSH, `seabed/expert-set/cards/E-*.svg`, `seabed/expert-set/organizer-key.json`; `seabed_compare_adaptive` с `generateExpertSet=true` |

Поля HTTP и построение разрешённых CLI-команд определены в
[contracts](../packages/contracts/src/index.ts) и
[commands.ts](../apps/lito-api/src/calculations/commands.ts). Для E пять UUID:
`modelInputId`, `exportMetadataInputId`, `fieldCsvInputId`, `fieldReportInputId`,
`coastlineInputId`; дополнительно `generators`, `levels`, `generateExpertSet`,
`expertLevels`, `expertSeed` и технические лимиты. Полный набор и пределы —
[матрица параметров](calculation-parameter-matrix.md).

## Значение вариантов и пределы архивного повтора

### A–B: наблюдения и box-counting

`normalized` в имени рисунка 1 не означает синтетическое преобразование.
Подписи и `WriteDimensionSVG` описывают анализ наблюдаемой линии без
фрактального построения. Для эталона указаны эксперимент `exp-d145104fff83`,
версия геометрии `f6922e461df1`, локальная равнопромежуточная проекция WGS84
с центром около 44.0140° с.ш., 33.1213° в.д. Это не LAEA модели дна.
Термин «наблюдаемая линия» в этом отчёте отличает исходную геометрию от
синтетического фрактала. Контур MarineRegions IHO Sea Area не является
датированным спутниковым наблюдением; его пригодность для исследования
физической береговой линии оценивается отдельно.

Повтор с доступным `data/coastline/black-sea.geojson` дал ту же полную версию
геометрии `f6922e461df150852cc07e6532116cbf37a042ca504d1a40fc908825ee917fe9`,
9635 расчётных точек, D=1.108395268193275, R²=0.9999260180445332,
95% CI [1.102486054396492; 1.1143044819900578], 13 масштабов и окно
ε≈4671–199282 м. Видимая линия упрощена до 4998 точек; расчёт и
аналитическая сетка используют все 9635. Версия геометрии не заменяет SHA
исходного GeoJSON. Дата, путь и текущая компоновка рисунка 1 отличаются.

При первичной сверке 0077 для рисунка 2 сравнение XML выявило только перенос пояснения регрессионного
окна с y=692 на y=666; точки, линия и остальные элементы совпали. Однако
у эталона **и текущего генератора** есть несогласованность представления N:
при ε≈199282 м JSON даёт `boxes_covered=21`, SVG tooltip — `N(ε)=20`.
Go усредняет покрытие по четырём сдвигам сетки; JSON применяет `math.Round`,
SVG восстанавливает значение из `LogBoxes` и форматирует `%.0f`.
Это разные способы округления, а не доказательство изменения исходных
данных. В [0079](features/0079-box-counting-report-selection.md), подшаге 18.1,
SVG получает готовое `boxes_covered` из анализа и явно показывает приближённое
округлённое покрытие. Прямая получает уже вычисленный свободный член Go,
доступный в JSON как `regression_intercept`, вместо привязки к первой точке.
Ось X подписана как относительный масштаб. Ревизия — `reports-3`; D, R²,
логарифмы точек и масштабное окно сохраняются. Архивные SVG не переписываются.

### C: обзор и три фактических фрагмента

Обзор показывает глубины и изобаты 20, 50, 100, 200, 500, 1000, 1500,
2000 м. Внутренние рёбра отдельно не рисуются; мозаика цветов ячеек видна.
NoData у эталона 0%; вертикальная система — средний уровень моря по
допущению GEBCO, с оговоркой для мелководья.

Рисунок 5 — три автоматически выбранных окна: максимум кривизны берега,
шельфовая глубина, ближайшая к 110 м, и максимальный уклон. Центры эталона
соответственно 30.2800°/46.2543°, 30.3734°/44.0845°, 34.7125°/42.3098°
(долгота/широта). Все пересекающие окно ячейки показаны; цвет Q означает
качество формы, а не точность глубины. На иной MSH окна и числа изменятся.

Оба рисунка содержат источник GEBCO_2026 и сокращение SHA `c957981ff054f50d…`.
[Паспорт источника](../apps/lito-cli/data/black-sea-bathymetry-source.metadata.json)
расшифровывает его как SHA регионального **NetCDF**, не MSH:
`c957981ff054f50d1cd87f730c1e6b08f948686f8342a8208655a512efaa77ac`.
Он не доказывает тождество модели с 1596 ячейками. Этот MSH, его EXPORT-02
и полный паспорт сборки не установлены среди просмотренных локальных
артефактов. Генератор работает на других реальных входах; обещать те же
координаты окон и байты эталона пока нельзя.

**Совпадение имени с архивом `article_1` не задаёт вид отчёта.** В
[0041](features/0041-article-figure-five.md) другой рисунок 5: 1800×760,
три встроенные карточки AI-01 (Кызылырмак, Батуми, Анатолийский склон).
Его создают `seabed figure-five` / флаг `--figure-five` после AI-01.
К текущему эталону 1600×1600 относится `seabed render` без Gmsh.

### D: поле h, не сгенерированная сетка

Эталон показывает четыре опорных значения 200/300/500/1000 м,
1158 скорректированных узлов из 1712, соседнее отношение ≤1.25,
фактический градиент 0.0258 при пределе 0.15 м/м, медиану h≈413 м.
Исходный каркас имеет 1596 ячеек. Текущие значения по умолчанию Go:
влияние берега 25000 м, опорная кривизна 30°, опорный уклон 10°,
порог плоского глубоководья 1°. Эти четыре значения — **кандидат для
повтора**, не доказанные параметры архива: SVG не содержит полного
JSON конфигурации. Для точного повтора нужны исходные MSH и `size-field.json`.

Пресет [0030](features/0030-article-figure-presets.md) относится к другому
архиву: 50/75/125/250 м. Найденный архивный JSON поля действительно задаёт
эти значения и 434296 узлов / 431406 ячеек. Он не является входом эталона 4.
Существующий workflow [0060](features/0060-seabed-figure-workflows.md)
передаёт 200/300/500/1000 м; старую кнопку с подписью «рисунок 4» нельзя
трактовать как универсальный выбор текущего эталона.

### E: анонимные карточки сравнения

Шесть файлов 6–7 — четыре уникальные карточки AI-01 и два повтора.
Это не общий SVG рейтинга ADAPT-03 и не подробное окно сравнения,
получаемое через `--detail-preset kizilirmak`. Последнее может иметь
другое окно; одинаковое название участка не делает результаты одинаковыми.

Все карточки скрывают генератор и уровень. Форма и окно соответствуют
`eval-kizilirmak-spit`: центр 35.90° в.д., 41.75° с.ш., LAEA 28×28 км,
опорные изобаты 5/10/20/50 м. Определение —
[DefaultExpertFragments](../apps/lito-cli/internal/domain/adaptive/expert_set.go).
Имена файлов заявляют алгоритм и `detailed`/`coarse`, но не доказывают
числовые диапазоны размеров. Нельзя присвоить им 200–1000 или 125–250 м
по имени или по одноимённому пресету другого архива.

В просмотренном локальном архиве `/Users/datsky/edu/_lito-cli` найдены
два `organizer-key.json`, но **ни один не связывает эти SVG с MSH**:

| Ключ относительно архива | SHA-256 ключа | Почему не подходит |
| --- | --- | --- |
| `output/seabed/expert-set/organizer-key.json` | `0053a5895a8c6e50a04f67a8be756093077ef1a8d474ceab4e52002d3919ec67` | Для E-002/E-013 в том же окне указаны 9291/7344 ячейки и 224 отрезка изобат; эталоны имеют 10115/8373 и 25 |
| `output/article_1/seabed/expert-set/organizer-key.json` | `d02dfb1ececcab8e2f70c71f8a59737401f477188583ed2d88faebbb91c3f9f9` | Для E-009/E-007 указаны 36625/29106 ячеек и 224 отрезка; эталоны имеют 2548/2099 и 25 |

Архивные SVG этих карточек также отличаются побайтово. Среди просмотренных
SVG этого архива идентичных эталонам не найдено. Анонимный E-номер зависит
от seed и состава набора; он не является постоянным ключом алгоритма.
Для точного повтора недостаёт согласованной цепочки: эталонный SVG → ключ
AI-01 → SHA отчёта ADAPT-03 → MSH опоры и кандидатов / параметры Gmsh /
исходный контур и CSV/JSON поля. Закрытый ключ не передают экспертам.

Новый расчёт с реальными входами уже поддержан. Нужный результат выбирают
в его ключе по `(fragment_id, level_id, algorithm)`, не по прежнему E-номеру.
Без найденной исходной цепочки он воспроизводит вид отчёта, но не считается
точным повтором этих четырёх архивных вариантов.

## Воспроизводимые команды

Команды выполняются из `apps/lito-cli`. `--output` всегда отдельный каталог;
`--manifest` сохраняет машинный манифест. Пути во втором примере относятся
к уже проверенному **локальному** набору 20.10.2026; наличие на другой
машине не гарантируется. Там нужны свои принятые MSH и соответствующие
паспорта, подготовленные через `mesh` → источник GEBCO → `seabed build`.
Примеры не создают научные входы из SVG.

```bash
go run ./cmd/lito dimension \
  --input data/coastline/black-sea.geojson \
  --output output/acceptance/figure-map-2026-10-22/dimension \
  --manifest output/acceptance/figure-map-2026-10-22/dimension/manifest.json
```

```bash
figure_model=output/acceptance/grids-2026-10-20/seabed/black-sea-depth.msh
figure_export=output/acceptance/grids-2026-10-20/seabed/export-metadata.json
figure_source=output/acceptance/grids-2026-10-20/seabed/bathymetry-source.json

go run ./cmd/lito seabed render \
  --input "$figure_model" --metadata "$figure_export" \
  --source-metadata "$figure_source" \
  --isobaths 20,50,100,200,500,1000,1500,2000 \
  --output output/acceptance/figure-map-2026-10-22/render \
  --manifest output/acceptance/figure-map-2026-10-22/render/manifest.json

go run ./cmd/lito seabed adapt \
  --input "$figure_model" --source-metadata "$figure_source" \
  --min-size 200 --coast-size 300 --shelf-size 500 --deep-size 1000 \
  --coast-influence 25000 --curvature-reference 30 --slope-reference 10 \
  --flat-deep-slope 1 --max-neighbour-ratio 1.25 --max-size-gradient 0.15 \
  --output output/acceptance/figure-map-2026-10-22/adapt \
  --manifest output/acceptance/figure-map-2026-10-22/adapt/manifest.json
```

Для E цепочка начинается с `seabed compare-adaptive --input … --metadata …
--field … --field-report … --coastline …`. Явно выбираются `--generators
delaunay,frontal-quad`, `--levels id:min:max`, технические лимиты и
`--expert-set --expert-levels id --expert-seed …`. Числовой диапазон берут
из исследуемой задачи и паспорта, а не из имени эталона; Gmsh строит новые
кандидатные MSH. Полные флаги и диапазоны — в матрице параметров.

Если уже есть принятый ADAPT-03 и все его файлы на диске с совпадающими
контрольными суммами, CLI умеет создать AI-01 без повторной генерации Gmsh:

```bash
go run ./cmd/lito seabed expert-set \
  --comparison output/seabed/adaptive/comparison/adaptive-generator-comparison.json \
  --seed ai-01-black-sea-2026 \
  --output output/acceptance/figure-map-expert-repeat \
  --manifest output/acceptance/figure-map-expert-repeat/manifest.json
```

Это условный рецепт для существующего отчёта, не выполненная здесь тяжёлая
цепочка. Go проверяет `accepted`, входные SHA-256 и связанные файлы.
Отдельного публичного API-сценария повторного AI-01 из готового отчёта пока нет.

## Состояние web и следующие изменения

- **17 выполнен в [0078](features/0078-seabed-report-selection.md):** единый
  тип «Отчёты по модели дна» содержит три подтипа. `input.reportType`
  сохраняется в задании и проверяется API; web выделяет выбранный SVG.
  Обзор и фактические фрагменты вызывают `seabed_render`, поле h —
  `seabed_adapt`. Go выдаёт все прежние артефакты; metadata не становится
  CLI-флагом. Переключение сохраняет совместимые файлы и параметры, повтор
  восстанавливает выбор. Архивный пресет 50–250 м явно отделён от текущего
  примера 200–1000 м. Переходы workflow 0060 сохраняют совместимость.
- **18.1:** выбор A/B добавлен в [0079](features/0079-box-counting-report-selection.md)
  для трёх сценариев размерности с теми же входами, повтором и паспортом.
  Округление и свободный член графика согласованы с Go-метриками.
- **18.2 остаётся:** дать явный выбор E из подтверждённых выходов текущего
  расчёта. Для точного архивного повтора E сначала восстановить происхождение. Возможный API
  повторного AI-01 из готового задания требует отдельного контракта и
  проверки владельца связанных артефактов.
- Ни один SVG из `todo/examples_figures` не становится результатом job.
  Дубликаты 07 не требуют ещё двух вариантов UI. Идентификаторы подтипов
  должны описывать смысл отчёта, сохраняя номер рисунка только как пояснение.

## Проверка 22.10.2026

Выполнены три команды выше (`dimension`, `seabed render`, `seabed adapt`)
с манифестами. Анализ берега воспроизвёл метрики A/B. Принятая реальная
модель GEBCO_2026 с 5143 узлами / 4908 ячейками дала C/D: NoData 0%,
глубина до 2217.94 м, окна 34/154/128 ячеек, поле 200–998.74 м,
1848 ограниченных узлов, соседнее отношение 1.25, градиент 0.07236≤0.15.
Она отличается от эталонного каркаса 1712/1596 и не заявляется его заменой.

Все 11 XML проверены, SHA посчитаны, дубликаты сверены побайтово;
9 уникальных SVG просмотрены через локальные превью с отключённой сетью.
Результаты и превью остаются в игнорируемом
`apps/lito-cli/output/acceptance/figure-map-2026-10-22/`.
Новые тяжёлые Gmsh-расчёты E не запускались: предмет шага — соответствие,
а несогласованные архивные входы не дают критерия точного повтора.

## Контрольные суммы эталонов

| Файл | Байты | SHA-256 |
| --- | ---: | --- |
| `fig_01_normalized_coastline_box_counting.svg` | 208545 | `47a09bfcb55b19e29863aa33ccc05e01bcba1710ec0a91fe8ea9fb43951caa26` |
| `fig_02_box_counting_regression.svg` | 7534 | `d4767b7ed862e60d0a31c93396d660e0fab85490613d3c9ca12744a1501c13f0` |
| `fig_03_bathymetry_overview.svg` | 645100 | `d9720d5bf1b4f56e545eb68c09a4ea0cf1165750cd5efd311901fc1381fd99fc` |
| `fig_04_adaptive_size_field.svg` | 335737 | `927be3ffd552f1d2878d6cb5d3320a6c298d33102d4e16dc9d43bc05f05cd90b` |
| `fig_05_actual_mesh_fragments.svg` | 193006 | `11097f023e4afc2291de1a33991c58514ec0479eb16f902381a0aea9e15a94dd` |
| `fig_06a_delaunay_detailed_kizilirmak.svg` | 1068713 | `c726ef5399f2eed6931901b30eb35d97fb46139598aaa8017f5b6b5a60aa5cd4` |
| `fig_06b_frontal_quad_detailed_kizilirmak.svg` | 886057 | `a53520a4470dfed6f858c2ed44a9256d35a89d9d36e8c67cefc3d743a6c3f645` |
| `fig_06a_delaunay_coarse_kizilirmak.svg` | 275204 | `883d3e3493901b8ab39b2534ac7767a77551cc1b3e33126e1579c5df592a6cf6` |
| `fig_06b_frontal_quad_coarse_kizilirmak.svg` | 228169 | `60aade916700a7dc960a07373008ce5ff1ee66ca01d667bb8a448ae9513f2493` |
| `fig_07a_delaunay_coarse_kizilirmak.svg` | 275204 | `883d3e3493901b8ab39b2534ac7767a77551cc1b3e33126e1579c5df592a6cf6` |
| `fig_07b_frontal_quad_coarse_kizilirmak.svg` | 228169 | `60aade916700a7dc960a07373008ce5ff1ee66ca01d667bb8a448ae9513f2493` |
