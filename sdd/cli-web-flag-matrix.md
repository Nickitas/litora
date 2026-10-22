# Матрица флагов CLI → Web/API

Первичная сверка всех флагов — 13.10.2026; сценарии region/CERC и граница
worker обновлены 21.10.2026 после удаления демо. Поля формы, единицы, пределы,
[defaults и условия выбора](calculation-parameter-matrix.md) сверены отдельно.
«Форма» означает параметр или выбор своего файла в ЛК; «worker» — серверную
подготовку и фиксированные значения. «Нет» — паритета нет, даже если команда
с таким именем уже доступна.
Опции, скрытые Cobra и не показанные `--help`,
не включены. `--help` остаётся справкой CLI, `--manifest`, `--output` и `--quiet`
являются общими для каждой исполняемой команды: manifest/output задаёт worker,
тихий вывод не влияет на результат и не нужен в web. `completion` — средство
локальной оболочки, а не вычислительный сценарий.

| Команда | Форма | Worker | Нет в Web/API |
| --- | --- | --- | --- |
| `source` | Скрыт из формы; совместимый API `source_file` с `--input` | `--output`, `--manifest` | `--source-url`, `--refresh` |
| `coastline-check` | Автоматическая проверка загрузки: `dataset_validation`/`coastline_validation`, только UUID | `--input` из приватного S3, `--output`, `--manifest` | Пути и URL пользователя |
| `map` | `--input` (`map_file`); встроенный контур (`map`) | `--output`, `--manifest` | `--source-url`, `--refresh` |
| `region` | `coastline_region`: `--west`, `--east`, `--south`, `--north`; свой `coastlineInputId` или сохранённый контур | `--input` из UUID/пакета; `--output`, `--manifest` | Произвольные пути и URL |
| `dimension` | `--input` (`dimension_dataset`/`dimension_file`); встроенный контур (`dimension`) | `--output`, `--manifest` | `--full-black-sea`, `--source-url`, `--refresh` |
| `mesh` | `--input`, `--cell-sizes`, `--boundary-details`, `--generators`, `--max-cells`, `--allow-large`, `--generator-timeout` | Gmsh из серверного окружения; `--output`, `--manifest` | `--gmsh`, `--source-url`, `--refresh` |
| `seabed build` | `--mesh`, `--bathymetry`, `--bathymetry-metadata`, `--coastline`, `--boundary-detail`, `--max-source-distance`, `--coast-transition`, `--recover-wgs84`, `--max-nodes`, `--max-cells`, `--max-output-mib`, `--allow-large` | `--output`, `--manifest` | — |
| `seabed render` | `--input`, `--metadata`, `--source-metadata`, `--isobaths`, `--vertical-exaggeration`, `--control-points` | `--output`, `--manifest` | `--source` |
| `seabed adapt` | `--input`, `--source-metadata`, `--min-size`, `--coast-size`, `--shelf-size`, `--deep-size`, `--coast-influence`, `--curvature-reference`, `--slope-reference`, `--flat-deep-slope`, `--max-neighbour-ratio`, `--max-size-gradient` | `--output`, `--manifest` | `--source` |
| `seabed generate-adaptive` | `--input`, `--metadata`, `--field`, `--field-report`, `--coastline`, `--boundary-detail`, `--generator`, `--max-cells`, `--allow-large`, `--generator-timeout` | Gmsh из серверного окружения; `--output`, `--manifest` | `--gmsh` |
| `seabed compare-adaptive` | `--input`, `--metadata`, `--field`, `--field-report`, `--coastline`, `--boundary-detail`, `--detail-preset`, `--generators`, `--levels`, `--max-cells`, `--allow-large`, `--generator-timeout`, `--expert-set`, `--expert-levels`, `--expert-seed`, `--figure-five`, `--figure-five-level`, `--figure-five-generator` | Gmsh из серверного окружения; `--output`, `--manifest` | `--gmsh` |
| `seabed validate` | `--input`, `--metadata`, `--reference`, `--reference-metadata`, `--reference-passport`, `--size-field`, `--size-field-report`, `--isobaths`, `--worst-cells`, `--max-nearest-distance` | `--output`, `--manifest` | — |
| `seabed check-full` | `--bathymetry`, `--bathymetry-metadata`, `--boundary-detail`, `--coast-transition`, `--coastline`, `--control-points`, `--generator`, `--isobaths`, `--max-source-distance`, `--mesh`, `--mesh-report`, `--target-edge`, `--vertical-exaggeration` | `--max-mesh-mib=256`, `--output`, `--manifest` | Безлимитная MSH (CLI допускает `--max-mesh-mib=0`); ресурсная и научная приёмка полного набора открыта |
| `seabed expert-set` | Карточки и рисунок 5 через опцию AI-01 в `seabed_compare_adaptive`; уровни, seed, уровень и генератор рисунка | Отчёт сравнения и пути из того же задания | Отдельный запуск по старому отчёту (`--comparison`, `--levels`, `--seed`, `--figure-five`, `--figure-five-level`, `--figure-five-generator`, `--output`, `--manifest`) |
| `seabed assess-ml` | Шесть приватных файлов: `--ratings`, `--organizer-key`, `--comparison`, `--input`, `--metadata`, `--coastline`; пороги `--min-evaluation`, `--min-experts-per-card`, `--min-rmse-improvement`, `--min-training`, `--ridge-lambda` | Пути только из staging владельца; `--output`, `--manifest` | Сбор оценок экспертами на сайте и их роли; standalone CLI по старым путям остаётся отдельным режимом |
| `erosion` | Только свои входы (`erosion_file`): `--input`, `--wave-input`, `--bathymetry`, `--steps` (0–48), параметры CERC ниже, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip`, `--sediment-sources`, `--structures`, `--svg-max-frames` | Паспорт рядом с батиметрией; `--wave-source` из метаданных; при `steps=0`: `--max-wave-conditions=10000`, `--max-coast-points=200`; `--output`, `--manifest` | `--bathymetry-resolution` вручную без паспорта; `--source-url`, `--refresh`; GIF и широкий CSV для полного ряда. Демо и его флаги удалены |
| `calibrate-cerc` | `calibrate_cerc`: `--input`, `--wave-input`, `--bathymetry`, `--bathymetry-resolution`, `--observations`, `--cerc-coefficients`, `--max-observation-distance`, `--min-wave-hours` (не меньше 8766 ч), `--breaking-index`, `--berm-height`, `--closure-depth`, `--porosity`, `--offshore-sample-distance`, `--max-bathymetry-gap`, `--left-boundary-transport`, `--right-boundary-transport`, `--sediment-sources`, `--structures` | `--wave-source` из паспорта загрузки; `--output`, `--manifest` | короткий `--min-wave-hours` только CLI |
| `shoreline-data-audit` | `shoreline_data_audit`: `--observations`, необязательные `--wave-input` и `--validation-start` по приватным входам владельца | `--wave-source` из паспорта волнового файла; `--output`, `--manifest` | Прогноз и импорт внешних архивов требуют научной проверки и отдельного контракта |
| `all` | Только свои файлы (`all_file`): `--input`, `--wave-input`, `--bathymetry`, `--steps` (0–48), параметры CERC ниже, `--output-csv`, `--csv-format`, `--output-gif`, `--gif-fps`, `--gif-skip`, `--model-max-points`, `--no-model-simplify`, `--svg-max-frames`; индексные `--sediment-sources`, `--structures` требуют отключить упрощение | Паспорт рядом с батиметрией; `--wave-source` из метаданных; при `steps=0`: `--max-wave-conditions=10000`, `--max-coast-points=200`; `--output`, `--manifest` | `--bathymetry-resolution` вручную без паспорта; профили с упрощением; `--source-url`, `--refresh`; GIF и широкий CSV для полного ряда. Демо и его флаги удалены |

Для `erosion_file` и `all_file` параметры CERC — `--breaking-index`, `--berm-height`,
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

Исторические `erosion` / `all_demo` больше не запускаются через API или CLI.
Чтение старого результата не заменяет ни одну из проверок для полного моря.

Эта матрица описывает покрытие аргументов, а не научную пригодность каждого
сценария или готовность инфраструктуры к большим заданиям.
