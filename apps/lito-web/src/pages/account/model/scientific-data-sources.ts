import type { ScientificInputRole } from "@litora/contracts";

export const scientificDataSources: { title: string; href: string; roles: ScientificInputRole[]; note: string }[] = [
  { title: "MarineRegions · контуры морей", href: "https://www.marineregions.org/downloads.php", roles: ["coastline_geojson"],
    note: "Выберите Чёрное море и экспорт GeoJSON WGS84. Граница морского района служит обзорным источником; для локальной точности используйте измеренную линию берега." },
  { title: "GEBCO · батиметрия", href: "https://download.gebco.net/downloads", roles: ["bathymetry_grid_json", "bathymetry_grid_metadata_json", "bathymetry_source_json"],
    note: "Скачайте область Чёрного моря. NetCDF/GeoTIFF нужно преобразовать в массив lat/lon/depth и подготовить паспорт с SHA-256, CRS, вертикальной системой и методом обработки." },
  { title: "EMODnet · батиметрия Чёрного моря", href: "https://emodnet.ec.europa.eu/en/bathymetry", roles: ["bathymetry_grid_json", "bathymetry_grid_metadata_json", "bathymetry_source_json"],
    note: "DTM и описание источника доступны через каталог. Перед загрузкой нужен производный JSON Lito с паспортом; исходный растр напрямую не принимается." },
  { title: "Copernicus Marine · реанализ волн Чёрного моря", href: "https://data.marine.copernicus.eu/product/BLKSEA_MULTIYEAR_WAV_007_006/description", roles: ["wave_climate"],
    note: "Выгрузите ряд для своего участка и периода. NetCDF преобразуется в JSON/CSV Lito с длительностью, Hs, пиковым периодом Tp и направлением, откуда приходят волны. Проверьте определения переменных и лицензию." },
];
