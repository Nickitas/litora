#!/usr/bin/env python3
"""Сохранить региональный исходный NetCDF GEBCO_2026 из официального OPeNDAP."""

import argparse
import hashlib
import os
import tempfile
from pathlib import Path

try:
    import xarray as xr
except ImportError as error:
    raise SystemExit(
        "Установите зависимости: pip install -r cmd/bathymetry/convert/requirements.txt"
    ) from error


SOURCE_URL = (
    "https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/"
    "gebco_2026/ice_surface_elevation/netcdf/GEBCO_2026.nc"
)
BOUNDS = {"lat": slice(40.5, 47.5), "lon": slice(27.0, 42.5)}
EXPECTED_DIMENSIONS = {"lat": 1680, "lon": 3720}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch_region(output: Path) -> None:
    if output.exists():
        raise FileExistsError(f"Исходный файл уже существует: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".gebco-region-", suffix=".nc", dir=output.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with xr.open_dataset(SOURCE_URL, engine="netcdf4") as source:
            region = source.sel(**BOUNDS)
            dimensions = dict(region.sizes)
            if dimensions != EXPECTED_DIMENSIONS:
                raise ValueError(
                    f"Неожиданные размеры регионального среза: {dimensions}"
                )
            region.to_netcdf(temporary)
        os.link(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Региональный NetCDF: {output}")
    print(f"Размер: {output.stat().st_size} байт")
    print(f"SHA-256: {sha256_file(output)}")
    print(f"Источник: {SOURCE_URL}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="новый путь для регионального NetCDF")
    options = parser.parse_args()
    try:
        fetch_region(options.output)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"Ошибка подготовки GEBCO: {error}\n")


if __name__ == "__main__":
    main()
