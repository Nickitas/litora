# Матрица флагов CLI → Web/API

Актуально на 13.10.2026 по `lito <команда> --help` и текущему коду. «Форма»
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
| `seabed compare-adaptive` | `--input`, `--metadata`, `--field`, `--field-report`, `--coastline`, `--boundary-detail`, `--detail-preset`, `--generators`, `--levels`, `--max-cells`, `--allow-large`, `--generator-timeout`, `--expert-set`, `--expert-levels`, `--expert-seed`, `--figure-five`, `--figure-five-level`, `--figure-five-generator` | `--gmsh`, `--output`, `--manifest` | — |
| `seabed validate` | `--input`, `--metadata`, `--reference`, `--reference-metadata`, `--reference-passport`, `--size-field`, `--size-field-report`, `--isobaths`, `--worst-cells`, `--max-nearest-distance` | `--output`, `--manifest` | — |
| `seabed check-full` | `--bathymetry`, `--bathymetry-metadata`, `--boundary-detail`, `--coast-transition`, `--coastline`, `--control-points`, `--generator`, `--isobaths`, `--max-source-distance`, `--mesh`, `--mesh-report`, `--target-edge`, `--vertical-exaggeration` | `--max-mesh-mib=256`, `--output`, `--manifest` | Безлимитная MSH (CLI допускает `--max-mesh-mib=0`); ресурсная и научная приёмка полного набора открыта |
| `seabed expert-set` | Карточки и рисунок 5 через опцию AI-01 в `seabed_compare_adaptive`; уровни, seed, уровень и генератор рисунка | Отчёт сравнения и пути из того же задания | Отдельный запуск по старому отчёту (`--comparison`, `--levels`, `--seed`, `--figure-five`, `--figure-five-level`, `--figure-five-generator`, `--output`, `--manifest`) |
| `seabed assess-ml` | Шесть приватных файлов: `--ratings`, `--organizer-key`, `--comparison`, `--input`, `--metadata`, `--coastline`; пороги `--min-evaluation`, `--min-experts-per-card`, `--min-rmse-improvement`, `--min-training`, `--ridge-lambda` | Пути только из staging владельца; `--output`, `--manifest` | Сбор оценок экспертами на сайте и их роли; standalone CLI по старым путям остаётся отдельным режимом |
| `erosion` | Демо Сочи и свои входы (`erosion_file`): `--input`, `--wave-input`, `--bathymetry`, `--steps` (для демо 1–168, для своих 0–48 с лимитами), `--breaking-index`, `--berm-height`, `--closure-depth`, `--porosity`, `--cerc-coefficient`, `--offshore-sample-distance`, `--max-shoreline-change`, `--max-bathymetry-gap`, `--left-boundary-transport`, `--right-boundary-transport`, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip`; по своим входам также `--sediment-sources`, `--structures`, `--svg-max-frames` | Демо: `--black-sea-sochi`, `--offline`, фиксированные 12 SVG; свой ряд: `--wave-source` из паспорта загрузки; при `steps=0`: `--max-wave-conditions=10000`, `--max-coast-points=200`; всем: `--output`, `--manifest` | `--bathymetry-resolution` без паспорта, профили для демо; `--source-url`, `--refresh`; GIF для демо свыше 48 часов; GIF и широкий CSV для полного собственного ряда |
| `calibrate-cerc` | `calibrate_cerc`: `--input`, `--wave-input`, `--bathymetry`, `--bathymetry-resolution`, `--observations`, `--cerc-coefficients`, `--max-observation-distance`, `--min-wave-hours` (не меньше 8766 ч), `--breaking-index`, `--berm-height`, `--closure-depth`, `--porosity`, `--offshore-sample-distance`, `--max-bathymetry-gap`, `--left-boundary-transport`, `--right-boundary-transport`, `--sediment-sources`, `--structures` | `--wave-source` из паспорта загрузки; `--output`, `--manifest` | короткий `--min-wave-hours` только CLI |
| `shoreline-data-audit` | `shoreline_data_audit`: `--observations`, необязательные `--wave-input` и `--validation-start` по приватным входам владельца | `--wave-source` из паспорта волнового файла; `--output`, `--manifest` | Прогноз и импорт внешних архивов требуют научной проверки и отдельного контракта |
| `all` | Демо Сочи (`all_demo`) и свои файлы (`all_file`): `--input`, `--wave-input`, `--bathymetry`, `--steps` (1–48, для своих также 0 с лимитами), параметры CERC и граничные потоки, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip`, `--model-max-points`, `--no-model-simplify`; по своим входам без упрощения `--sediment-sources`, `--structures`; `--svg-max-frames` для своих | Демо: `--black-sea-sochi`, `--offline`; свой ряд: `--wave-source` из паспорта загрузки; при `steps=0`: `--max-wave-conditions=10000`, `--max-coast-points=200`; всем: `--output`, `--manifest` | `--bathymetry-resolution` без паспорта, профили для демо и с упрощением; `--source-url`, `--refresh`; GIF и широкий CSV для полного ряда |

Для `all_demo` и `all_file` параметры CERC — `--breaking-index`, `--berm-height`,
`--closure-depth`, `--porosity`, `--cerc-coefficient`,
`--offshore-sample-distance`, `--max-shoreline-change`, `--max-bathymetry-gap`,
`--left-boundary-transport`, `--right-boundary-transport`.
`--output-csv`/`--output-gif` в форме являются переключателями, а имя файла
составляет worker. `--quiet` и `--help` общие также для отсутствующих сценариев.

## Приоритеты закрытия

1. Довести научную приёмку своих входов `erosion`/`all` и `calibrate-cerc`:
   проверить паспорт времени/CRS/единиц/лицензии, совместимость индексных профилей
   с неизменённым контуром, отрицательные owner-тесты и ресурсный замер полного
   ряда. Без этого нельзя объявлять «полный CLI» через web.
2. `check-full`: после локального подключения сценария измерить RAM, время и
   временный диск на полном наборе; сверить паспорта и независимый эталон.
3. `expert-set`/`assess-ml`: карточки AI-01 создаются внутри
   `seabed_compare_adaptive`, а AI-02 запускается отдельным заданием по шести
   приватным файлам. Отдельный запуск генерации карточек по старому отчёту,
   модель ролей экспертов и организатора и сбор оценок на сайте отсутствуют.
   `organizer-key` доступен только владельцу и не должен передаваться экспертам.
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
| `fig_05_actual_mesh_fragments.svg` | `seabed_compare_adaptive` с AI-01 и пресетом рисунка 5 | Go собирает три фактические карточки по ID фрагментов. Совпадение с архивом требует тех же входов, MSH, версий Go/Gmsh и сквозной сверки. `mesh-details.svg` из `seabed_render` — другой рисунок. |
| `fig_06_draft_compare.svg`, `fig_07a_delaunay_coarse_kizilirmak.svg`, `fig_07b_frontal_quad_coarse_kizilirmak.svg` | `seabed_compare_adaptive` с пресетом статьи | Нужны те же большие MSH, поле и версия Gmsh. Архивный manifest называет `fig_06a/06b`, а на диске — draft/07a/07b; реестр надо согласовать. |

`all_demo` относится к локальному участку Сочи и не заменяет ни одну из этих
проверок для полного моря.

Эта матрица описывает покрытие аргументов, а не научную пригодность каждого
сценария или готовность инфраструктуры к большим заданиям.
