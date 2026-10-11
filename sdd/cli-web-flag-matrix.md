# Матрица флагов CLI → Web/API

Актуально на 11.10.2026 по `lito <команда> --help` и текущему коду. «Форма»
означает параметр или выбор своего файла в ЛК; «worker» — фиксированное значение
на сервере. «Нет» — паритета нет, даже если команда с таким именем уже доступна.
Флаги перечислены без сокращения; опции, скрытые Cobra и не показанные `--help`,
не включены. `--help` остаётся справкой CLI, `--manifest`, `--output` и `--quiet`
являются общими для каждой исполняемой команды: manifest/output задаёт worker,
тихий вывод не влияет на результат и не нужен в web. `completion` — средство
локальной оболочки, а не вычислительный сценарий.

| Команда | Форма | Worker | Нет в Web/API |
| --- | --- | --- | --- |
| `source` | `--input` (`source_file`) | `--output`, `--manifest` | `--source-url`, `--refresh` |
| `map` | `--input` (`map_file`); встроенный контур (`map`) | `--output`, `--manifest` | `--source-url`, `--refresh` |
| `dimension` | `--input` (`dimension_dataset`/`dimension_file`); встроенный контур (`dimension`) | `--output`, `--manifest` | `--full-black-sea`, `--source-url`, `--refresh` |
| `mesh` | `--input`, `--cell-sizes`, `--boundary-details`, `--generators`, `--max-cells`, `--allow-large`, `--generator-timeout` | `--gmsh`, `--output`, `--manifest` | — |
| `seabed build` | `--mesh`, `--bathymetry`, `--bathymetry-metadata`, `--coastline`, `--boundary-detail`, `--max-source-distance`, `--coast-transition`, `--recover-wgs84`, `--max-nodes`, `--max-cells`, `--max-output-mib`, `--allow-large` | `--output`, `--manifest` | — |
| `seabed render` | `--input`, `--metadata`, `--source-metadata`, `--isobaths`, `--vertical-exaggeration`, `--control-points` | `--output`, `--manifest` | `--source` |
| `seabed adapt` | `--input`, `--source-metadata`, `--min-size`, `--coast-size`, `--shelf-size`, `--deep-size`, `--coast-influence`, `--curvature-reference`, `--slope-reference`, `--flat-deep-slope`, `--max-neighbour-ratio`, `--max-size-gradient` | `--output`, `--manifest` | `--source` |
| `seabed generate-adaptive` | `--input`, `--metadata`, `--field`, `--field-report`, `--coastline`, `--boundary-detail`, `--generator`, `--max-cells`, `--allow-large`, `--generator-timeout` | `--gmsh`, `--output`, `--manifest` | — |
| `seabed compare-adaptive` | `--input`, `--metadata`, `--field`, `--field-report`, `--coastline`, `--boundary-detail`, `--detail-preset`, `--generators`, `--levels`, `--max-cells`, `--allow-large`, `--generator-timeout` | `--gmsh`, `--output`, `--manifest` | — |
| `seabed validate` | `--input`, `--metadata`, `--reference`, `--reference-metadata`, `--reference-passport`, `--size-field`, `--size-field-report`, `--isobaths`, `--worst-cells`, `--max-nearest-distance` | `--output`, `--manifest` | — |
| `seabed check-full` | — | — | `--bathymetry`, `--bathymetry-metadata`, `--boundary-detail`, `--coast-transition`, `--coastline`, `--control-points`, `--generator`, `--isobaths`, `--max-source-distance`, `--mesh`, `--mesh-report`, `--target-edge`, `--vertical-exaggeration`, `--output`, `--manifest` |
| `seabed expert-set` | — | — | `--comparison`, `--levels`, `--seed`, `--output`, `--manifest` |
| `seabed assess-ml` | — | — | `--min-evaluation`, `--min-experts-per-card`, `--min-rmse-improvement`, `--min-training`, `--organizer-key`, `--ratings`, `--ridge-lambda`, `--output`, `--manifest` |
| `erosion` | Демо Сочи: `--steps`, `--breaking-index`, `--berm-height`, `--closure-depth`, `--porosity`, `--cerc-coefficient`, `--offshore-sample-distance`, `--max-shoreline-change`, `--max-bathymetry-gap`, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip` | `--black-sea-sochi`, `--offline`, `--output`, `--manifest` | Собственные `--input`, `--wave-input`, `--wave-source`, `--bathymetry`, `--bathymetry-resolution`, `--sediment-sources`, `--structures`, `--left-boundary-transport`, `--right-boundary-transport`; `--source-url`, `--refresh` |
| `calibrate-cerc` | — | — | `--bathymetry`, `--bathymetry-resolution`, `--berm-height`, `--breaking-index`, `--cerc-coefficients`, `--closure-depth`, `--input`, `--left-boundary-transport`, `--max-bathymetry-gap`, `--max-observation-distance`, `--min-wave-hours`, `--observations`, `--offshore-sample-distance`, `--porosity`, `--right-boundary-transport`, `--sediment-sources`, `--structures`, `--wave-input`, `--wave-source`, `--output`, `--manifest` |
| `all` | Демо Сочи (`all_demo`): `--steps`, параметры CERC, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip`, `--model-max-points`, `--no-model-simplify` | `--black-sea-sochi`, `--offline`, `--output`, `--manifest` | Собственные `--input`, `--wave-input`, `--wave-source`, `--bathymetry`, `--bathymetry-resolution`, `--sediment-sources`, `--structures`, `--left-boundary-transport`, `--right-boundary-transport`; `--source-url`, `--refresh` |

Для `all_demo` параметры CERC — `--breaking-index`, `--berm-height`,
`--closure-depth`, `--porosity`, `--cerc-coefficient`,
`--offshore-sample-distance`, `--max-shoreline-change`, `--max-bathymetry-gap`.
`--output-csv`/`--output-gif` в форме являются переключателями, а имя файла
составляет worker. `--quiet` и `--help` общие также для отсутствующих сценариев.

## Приоритеты закрытия

1. Свои входы `erosion`/`all` и `calibrate-cerc`: роли волн, наблюдений,
   глубин, сооружений, паспорт времени/CRS/единиц/лицензии; Go-проверки
   совместимости и отрицательные owner-тесты. Без научно корректных входов
   нельзя выдавать «полный CLI» через web.
2. `check-full`: отдельный тяжёлый профиль, лимиты памяти/временного диска,
   связка всех паспортов и независимый эталон результата.
3. `expert-set`/`assess-ml`: модель ролей экспертов и организатора,
   приватный `organizer-key`, хранение оценок и отсутствие утечки в артефактах.
4. `source-url`/`refresh` и `full-black-sea`: отдельная политика сетевых
   источников с защитой DNS/IP/redirect и лицензий либо заранее одобренные
   версии данных; не прокидывать URL из формы в CLI.
5. PAR-002/004: сверить CLI и worker на одинаковых SHA-256/версиях Go/Gmsh,
   метрики и SVG `fig_01`–`fig_07` из архива. Наличие SVG в ЛК само по себе
   не доказывает тождество рисункам статьи.

## Архив `article_1/figures`

| Файл архива | Ближайший сценарий ЛК | Оставшийся пробел |
| --- | --- | --- |
| `fig_01_normalized_coastline_box_counting.svg`, `fig_02_box_counting_regression.svg` | `dimension_file` | Тот же полный контур, SHA-256, параметры и сверка SVG ещё не подтверждены. |
| `fig_03_bathymetry_overview.svg` | `seabed_render` | Нужны исходная MSH и оба паспорта архива; сверка изобат/цветовой шкалы. |
| `fig_04_adaptive_size_field.svg` | `seabed_adapt` с пресетом статьи | Пресет задаёт числа, но не исходную модель; сравнение рисунка ещё открыто. |
| `fig_05_actual_mesh_fragments.svg` | `seabed_render` | Отдельного шаблона компоновки фактических фрагментов в ЛК нет. |
| `fig_06_draft_compare.svg`, `fig_07a_delaunay_coarse_kizilirmak.svg`, `fig_07b_frontal_quad_coarse_kizilirmak.svg` | `seabed_compare_adaptive` с пресетом статьи | Нужны те же большие MSH, поле и версия Gmsh. Архивный manifest называет `fig_06a/06b`, а на диске — draft/07a/07b; реестр надо согласовать. |

`all_demo` относится к локальному участку Сочи и не заменяет ни одну из этих
проверок для полного моря.

Эта матрица описывает покрытие аргументов, а не научную пригодность каждого
сценария или готовность инфраструктуры к большим заданиям.
