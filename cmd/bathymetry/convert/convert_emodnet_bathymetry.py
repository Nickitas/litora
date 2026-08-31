#!/usr/bin/env python3
"""Создаёт проверяемый производный набор глубин Чёрного моря из EMODnet DTM."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import xarray as xr


def sha256_file(path: Path) -> str:
    """Возвращает SHA-256 файла без загрузки всего файла в память."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def grid_step(values: np.ndarray) -> float:
    """Определяет шаг регулярной координатной оси."""
    unique = np.unique(np.asarray(values, dtype=float))
    if len(unique) < 2:
        raise ValueError("координатная ось должна содержать как минимум две точки")
    steps = np.diff(unique)
    return float(np.median(steps))


def convert(input_path: Path, output_path: Path, source_url: str, downloaded_at: str) -> dict:
    """Сохраняет отрицательные донные отметки EMODnet в контракте Lito."""
    with xr.open_dataset(input_path) as dataset:
        if "elevation" not in dataset or "latitude" not in dataset or "longitude" not in dataset:
            raise ValueError("NetCDF EMODnet должен содержать elevation, latitude и longitude")

        elevations = np.asarray(dataset["elevation"].values, dtype=float)
        latitudes = np.asarray(dataset["latitude"].values, dtype=float)
        longitudes = np.asarray(dataset["longitude"].values, dtype=float)

    if elevations.shape != (len(latitudes), len(longitudes)):
        raise ValueError("размер elevation не соответствует осям latitude и longitude")

    points: list[dict[str, float]] = []
    for lat_index, latitude in enumerate(latitudes):
        for lon_index, longitude in enumerate(longitudes):
            elevation = elevations[lat_index, lon_index]
            if np.isfinite(elevation) and elevation < 0:
                points.append(
                    {
                        "lat": round(float(latitude), 10),
                        "lon": round(float(longitude), 10),
                        "depth": round(float(elevation), 4),
                    }
                )

    if not points:
        raise ValueError("в выбранном фрагменте нет подводных точек")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(points, target, ensure_ascii=False, separators=(",", ":"))

    target_step = max(grid_step(latitudes), grid_step(longitudes))
    source_hash = sha256_file(input_path)
    dataset_hash = sha256_file(output_path)
    metadata = {
        "schema_version": "1.0",
        "title": "Контрольная производная батиметрия Чёрного моря EMODnet DTM 2024",
        "status": "verified_derived",
        "dataset_file": output_path.name,
        "dataset_sha256": dataset_hash,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "point_count": len(points),
        "bounds": {
            "min_lat": float(latitudes.min()),
            "max_lat": float(latitudes.max()),
            "min_lon": float(longitudes.min()),
            "max_lon": float(longitudes.max()),
        },
        "target_resolution_degrees": target_step,
        "target_resolution_arc_seconds": target_step * 3600,
        "source_product": "EMODnet Bathymetry DTM 2024",
        "source_url": source_url,
        "source_downloaded_at": downloaded_at,
        "source_netcdf": str(input_path),
        "source_netcdf_sha256": source_hash,
        "source_grid_interval_arc_seconds": 3.75,
        "horizontal_reference": "WGS 84, EPSG:4326",
        "vertical_reference": "Отметки относительно Lowest Astronomical Tide; в поле depth Lito сохранена отрицательная донная отметка",
        "vertical_reference_caveat": "Датум EMODnet отличается от описания нулевой линии в контуре IHO; у берега необходима процедура согласования BATHY-02.",
        "resampling_method": "Регулярная выборка ERDDAP с шагом 19 ячеек исходной сетки; интерполяция значений не применялась",
        "land_filter": "Исключены значения elevation >= 0 и NaN; отрицательные донные отметки сохранены без изменения знака",
        "processing_script": "cmd/bathymetry/convert/convert_emodnet_bathymetry.py",
        "processing_software": {"python": "3", "xarray": xr.__version__, "numpy": np.__version__},
        "license": "Условия использования EMODnet Bathymetry; при публикации требуется атрибуция источника.",
        "license_url": "https://emodnet.ec.europa.eu/en/terms-use",
        "attribution": "EMODnet Bathymetry Consortium (2024). EMODnet Digital Terrain Model.",
        "limitations": [
            "Контрольный продукт предназначен для межпродуктового сопоставления с GEBCO, а не для навигации.",
            "GEBCO использует часть данных EMODnet, поэтому сопоставление не является независимой публикационной валидацией.",
            "Пространственная выборка около 0,02° не заменяет исходную сетку EMODnet с шагом 3,75 угловых секунд.",
        ],
    }
    metadata_path = output_path.with_name(output_path.stem + ".metadata.json")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "points": len(points),
        "step_degrees": target_step,
        "source_sha256": source_hash,
        "dataset_sha256": dataset_hash,
        "metadata": str(metadata_path),
    }


def main() -> None:
    """Разбирает параметры и выводит краткий паспорт созданного набора."""
    parser = argparse.ArgumentParser(description="Подготовить контрольную батиметрию EMODnet для Чёрного моря")
    parser.add_argument("--input", required=True, type=Path, help="региональный NetCDF, полученный из официального ERDDAP EMODnet")
    parser.add_argument("--output", required=True, type=Path, help="путь производного JSON с полями lat, lon, depth")
    parser.add_argument("--source-url", required=True, help="точный официальный URL получения NetCDF")
    parser.add_argument("--downloaded-at", required=True, help="время загрузки источника в ISO 8601, UTC")
    arguments = parser.parse_args()

    result = convert(arguments.input, arguments.output, arguments.source_url, arguments.downloaded_at)
    print("Точек глубины:", result["points"])
    print("Шаг регулярной выборки, °:", f'{result["step_degrees"]:.12f}')
    print("SHA-256 источника:", result["source_sha256"])
    print("SHA-256 набора:", result["dataset_sha256"])
    print("Паспорт:", result["metadata"])


if __name__ == "__main__":
    main()
