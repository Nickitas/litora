# Анализ результатов Lito

Скрипты читают результаты уже выполненных расчётов. Команды ниже выполняются
из `apps/lito-cli`; пути файлов замените своими сохранёнными входами участка.
Демо-сценария и автоматического получения волн, глубин или сооружений нет.

## Установка

```bash
python3 -m venv scripts/venv
source scripts/venv/bin/activate
python -m pip install -r scripts/requirements.txt
```

Графики используют backend `Agg` и подходят для серверов и CI.

## Расчёт и экспорт по явным входам

Подготовьте непрерывный локальный контур, реальные волновые условия и батиметрию
с паспортом `.metadata.json`. Пример не подтверждает пригодность этих данных.

```bash
./lito erosion \
  --input data/coast-segment.geojson \
  --wave-input data/waves.csv \
  --wave-source "Источник и период волнового ряда" \
  --bathymetry data/bathymetry.json \
  --output output/research \
  --output-csv erosion.csv --csv-format long
python scripts/analysis/analyze_erosion.py output/research/csv/erosion.csv \
  --output output/research/analysis/erosion-report.txt
python scripts/analysis/plot_dynamics.py output/research/csv/erosion.csv \
  --dashboard --output output/research/analysis/dashboard
```

Для сравнения воздействий выполните два расчёта с разными явно подготовленными
волновыми рядами и экспортируйте CSV. Вероятность штормов, сезонность и число лет
не генерируются: временной масштаб берётся из длительностей фактических состояний.

```bash
python scripts/analysis/compare_scenarios.py \
  output/first/csv/erosion.csv output/second/csv/erosion.csv \
  --report --heatmap --output output/comparison
python scripts/analysis/storm_analysis.py output/research/csv/erosion.csv \
  --detailed --plot --output output/research/analysis/storms
python scripts/analysis/export_reports.py output/research/csv/erosion.csv \
  --format all --output output/research/analysis/report
```

## Сводный анализ

`analyze_outputs.py` читает `profiles.csv`, `dimension.metrics.json` и
`mesh-comparison.json` из указанного каталога и его подкаталогов.

```bash
./lito dimension --input data/coastline/black-sea.geojson
python scripts/analysis/analyze_outputs.py output
```

Результаты анализа не являются новыми расчётами Go или научной аттестацией.
Нулевые значения означают отсутствие изменения в исходном запуске.

## Файлы каталога `analysis`

- `analyze_outputs.py` — сводка `seabed`, `dimension`, `mesh`;
- `analyze_erosion.py` — числовая статистика эрозии;
- `plot_dynamics.py` — графики динамики;
- `storm_analysis.py` — анализ штормовых состояний;
- `compare_scenarios.py` — сравнение CSV;
- `export_reports.py` — отчёты Markdown/JSON/LaTeX;
- `cli_csv.py` — адаптер русских имён CSV.
