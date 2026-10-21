# Картографические контуры исследовательских районов Чёрного моря

Назначение среза — изучение геометрии картографического берега и масштабной
зависимости box-counting. Каждый GeoJSON содержит один самостоятельный сегмент
выбранного подокна района. Название района не означает покрытия всего его берега.

Все 24 фрагмента подключены к открытому каталогу на `/lab/datasets`:
`@litora/generated-data/research` читает эти паспорта, а отдельный модуль
`research-geometries` публикует URL готовых GeoJSON для web. Исходные снимки
`sources/` в web не импортируются. Превью и приватная копия используют одну
геометрию; перед сохранением проверяется `canonicalGeometrySha256`, а не hash
файла с завершающим переводом строки. При обновлении среза нужно синхронно
обновить список импортов/URL и проверить все карточки браузерным тестом.

Источник: **© OpenStreetMap contributors**. Данные и производная геометрия
распространяются под [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
отдельно от лицензии программного кода. [Атрибуция и условия OpenStreetMap](https://www.openstreetmap.org/copyright).
Данные получены ограниченными публичными запросами `natural=coastline` через
[Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

Для каждого ID поставляются:

- `<id>.geojson` — двумерный LineString EPSG:4326, долгота/широта в градусах;
- `<id>.metadata.json` — назначение, точный ROI, источник/версия, лицензия,
  SHA-256, преобразования, замечания Go, расчёт и ограничения;
- `sources/*.json` — закреплённый геометрический снимок всех ways исходного
  запроса, ID узлов, версии ways, координаты и время среза OSM.

`regions.json` содержит ID, очереди, поисковые точки и размер окна. Точки взяты
из закреплённого протокола поиска источников; окно 0,16° × 0,12° определяет
подобласть геометрического анализа, а не точность измерения. Точные границы
записаны в каждом паспорте.
Для Каламитского залива окно расширено по долготе до 0,24°: первоначальная
восточная граница отсекала подробный путь, оставляя только 2–5 точек в каждом
фрагменте. Оба снимка сохранены; принятый указан в `source.snapshotFile`.

Go обрезает пути рамкой, сохраняя независимые линии и разрывы. При пересечении
рамки интерполируются только граничные точки. Длинные фрагменты делятся на
части до 500 точек с общей конечной точкой. Упрощение и соединение разных ways
не применяются. Выбирается самый длинный фрагмент с минимум 8 точками и длиной
200 м, прошедший строгую проверку и расчёт без нормализации. Причины исключения
других кандидатов сохранены в паспорте.
Если ни один основной фрагмент не принят, проверяются непрерывные половины и
их подчасти до 8 точек. Выбирается самый длинный пригодный подучасток;
`startPoint`/`endPoint` (с единицы) относятся к обрезанному сегменту,
`subdivisionLevel` показывает использование этого дополнительного деления.

Версия way сама по себе не фиксирует версии координат узлов. Воспроизведение
использует закреплённый снимок целиком, а не повторный запрос текущего way.
Снимок представляет проекцию полей HTTP-ответа: все геометрии и ID сохранены,
автор и uid исключены. SHA-256 полного ответа указан отдельно; исходные ответы
и крупные расчётные рисунки хранятся вне Git.

`file.sha256` относится к байтам поставляемого GeoJSON, включая перевод строки.
`file.canonicalGeometrySha256` относится к компактному объекту геометрии без
этого перевода строки и предназначен для сопоставления с малым набором API.

Независимая точность положения берега не подтверждена: RMSE, контрольная съёмка
и дата измерения отсутствуют. Время правки OSM и время среза карты не являются
датами физических наблюдений. Возможны искусственные берега и сооружения.
Устойчивость и R² характеризуют расчёт на доступных масштабах, а не точность
координат или доказанную фрактальность природного берега. Один срез не позволяет
оценивать скорость эрозии или строить годовой прогноз.

Порядок подготовки и offline-проверки описан в
[спецификации 0068](../../../sdd/features/0068-research-coastline-data.md).


## Реестр подготовленных входов

| Район | Очередь | Контур и паспорт | Точек | Длина, км | OSM way |
| --- | --- | --- | ---: | ---: | --- |
| Сочи | 1 | [sochi-01](sochi-01.geojson), [паспорт](sochi-01.metadata.json) | 189 | 8.474 | [59530506](https://www.openstreetmap.org/way/59530506) |
| Геленджик | 1 | [gelendzhik-01](gelendzhik-01.geojson), [паспорт](gelendzhik-01.metadata.json) | 163 | 3.310 | [1033178833](https://www.openstreetmap.org/way/1033178833) |
| Кызылырмакская коса и дельта | 1 | [turkey-01](turkey-01.geojson), [паспорт](turkey-01.metadata.json) | 57 | 8.104 | [305952470](https://www.openstreetmap.org/way/305952470) |
| Анапа — Витязево — Благовещенская | 1 | [anapa-01](anapa-01.geojson), [паспорт](anapa-01.metadata.json) | 181 | 16.067 | [4528022](https://www.openstreetmap.org/way/4528022) |
| Батумский залив | 1 | [batumi-01](batumi-01.geojson), [паспорт](batumi-01.metadata.json) | 69 | 3.776 | [4523983](https://www.openstreetmap.org/way/4523983) |
| Бургасский залив | 1 | [burgas-01](burgas-01.geojson), [паспорт](burgas-01.metadata.json) | 299 | 11.766 | [143103249](https://www.openstreetmap.org/way/143103249) |
| Морской берег дельты Дуная | 1 | [danube-01](danube-01.geojson), [паспорт](danube-01.metadata.json) | 148 | 10.918 | [922963843](https://www.openstreetmap.org/way/922963843) |
| Одесский залив | 1 | [odesa-01](odesa-01.geojson), [паспорт](odesa-01.metadata.json) | 370 | 6.460 | [4529551](https://www.openstreetmap.org/way/4529551) |
| Поти и устье Риони | 2 | [poti-rioni-01](poti-rioni-01.geojson), [паспорт](poti-rioni-01.metadata.json) | 177 | 9.789 | [297344079](https://www.openstreetmap.org/way/297344079) |
| Кобулети — Уреки | 2 | [kobuleti-01](kobuleti-01.geojson), [паспорт](kobuleti-01.metadata.json) | 109 | 3.409 | [1459286973](https://www.openstreetmap.org/way/1459286973) |
| Трабзон — Ризе | 2 | [trabzon-rize-01](trabzon-rize-01.geojson), [паспорт](trabzon-rize-01.metadata.json) | 87 | 3.320 | [4523910](https://www.openstreetmap.org/way/4523910) |
| Гиресун и остров Гиресун | 2 | [giresun-01](giresun-01.geojson), [паспорт](giresun-01.metadata.json) | 48 | 3.680 | [172810421](https://www.openstreetmap.org/way/172810421) |
| Дельта Ешильырмака | 2 | [yesilirmak-01](yesilirmak-01.geojson), [паспорт](yesilirmak-01.metadata.json) | 47 | 11.002 | [290720464](https://www.openstreetmap.org/way/290720464) |
| Синопский полуостров | 2 | [sinop-01](sinop-01.geojson), [паспорт](sinop-01.metadata.json) | 500 | 2.918 | [749028749](https://www.openstreetmap.org/way/749028749) |
| Устье Сакарьи — Карасу | 2 | [sakarya-01](sakarya-01.geojson), [паспорт](sakarya-01.metadata.json) | 39 | 5.656 | [215581186](https://www.openstreetmap.org/way/215581186) |
| Кильос и открытый берег севернее Стамбула | 2 | [kilyos-01](kilyos-01.geojson), [паспорт](kilyos-01.metadata.json) | 266 | 5.261 | [4509642](https://www.openstreetmap.org/way/4509642) |
| Игнеада и район Резовской | 2 | [igneada-01](igneada-01.geojson), [паспорт](igneada-01.metadata.json) | 32 | 5.417 | [997433482](https://www.openstreetmap.org/way/997433482) |
| Варна — Камчия | 2 | [varna-kamchia-01](varna-kamchia-01.geojson), [паспорт](varna-kamchia-01.metadata.json) | 46 | 2.397 | [142949247](https://www.openstreetmap.org/way/142949247) |
| Шабла — Калиакра | 2 | [shabla-kaliakra-01](shabla-kaliakra-01.geojson), [паспорт](shabla-kaliakra-01.metadata.json) | 500 | 4.973 | [109841255](https://www.openstreetmap.org/way/109841255) |
| Мамая — Констанца | 2 | [mamaia-01](mamaia-01.geojson), [паспорт](mamaia-01.metadata.json) | 162 | 5.883 | [1330184586](https://www.openstreetmap.org/way/1330184586) |
| Тендровская коса | 2 | [tendra-01](tendra-01.geojson), [паспорт](tendra-01.metadata.json) | 32 | 6.546 | [685423874](https://www.openstreetmap.org/way/685423874) |
| Каламитский залив: Евпатория — Саки | 2 | [kalamita-01](kalamita-01.geojson), [паспорт](kalamita-01.metadata.json) | 17 | 3.580 | [4530495](https://www.openstreetmap.org/way/4530495) |
| Ялта — Алушта | 2 | [yalta-alushta-01](yalta-alushta-01.geojson), [паспорт](yalta-alushta-01.metadata.json) | 106 | 2.050 | [4530088](https://www.openstreetmap.org/way/4530088) |
| Феодосийский залив — Коктебель | 2 | [feodosia-koktebel-01](feodosia-koktebel-01.geojson), [паспорт](feodosia-koktebel-01.metadata.json) | 407 | 7.390 | [4529543](https://www.openstreetmap.org/way/4529543) |
