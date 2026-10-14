# @litora/generated-data

Артефакты, которые генерирует `apps/lito-cli` (релизы, примеры, экспортированные
данные). Сюда не помещаются исходные большие наборы данных без отдельного решения
о хранении; для них используйте Git LFS или объектное хранилище.

`defaultCoastlineDataset` — малый стартовый GeoJSON `LineString` для кабинета.
Координаты взяты из `apps/lito-cli/data/examples/sochi-local-segment.geojson`:
OpenStreetMap way 59530506, выгрузка 17.08.2026, лицензия ODbL. Это технический
пример, не геодезическая съёмка и не исходные данные для инженерного заключения.

`shorelineDemoIndex`, `shorelineDemoChunk` и `shorelineDemoSeries` — малый
сохранённый результат Go CLI для демонстрации реплея в кабинете без собственного
задания. Команда: `lito erosion --black-sea-sochi --offline --steps 3`. Данные
охватывают 18.08.2026 00:00–03:00 UTC и основаны на оперативном прогнозе
Open-Meteo Marine, а не на наблюдениях за берегом. Это не годовой прогноз.
