# 0049 — Поставка готовых образов на VPS

- Статус: реализация в репозитории, staging-приёмка открыта.
- Дата: 17.10.2026; исходная ветка `development`, SHA выпуска фиксируется после коммита.
- Область: GitHub Actions, GHCR, Docker Compose, runbook; ADR-007/008/022.

## Проблема и границы

Старый production-пример требовал сборку API/web на сервере и не содержал
heavy worker. Нужна проверяемая поставка `image:version` на подготовленный VPS,
где приложения запускаются только из готовых образов. Поставка не создаёт
VPS, AWS bucket, домен или секреты и не открывает публичную регистрацию.

## Требования и приёмка

| ID | Given / When / Then | Доказательство |
| --- | --- | --- |
| DEP-001 | Успешный push в `main` → `pnpm verify` → три GHCR image с уникальным тегом SHA/run/attempt | GitHub Actions run и digest в Summary |
| DEP-002 | Провал `checks` → publish и deploy не выполняются | Отрицательный CI run |
| DEP-003 | `STAGING_ENABLED=false` → образы публикуются, SSH к VPS не выполняется | GitHub Actions run |
| DEP-004 | Подготовленный staging + включённый CD → сервер скачивает exact digest и запускает API перед workers | Compose ps, лог и release env на стенде |
| DEP-005 | В очереди есть queued/running job → поставка отказывается менять образы | Staging-проверка с заданием |
| DEP-006 | `LITO_HEAVY_ENABLED=true` на 32-ГБ хосте → отдельный Gmsh worker исполняет heavy job | Контрольный job и peak RSS/temp |
| DEP-007 | VPS без исходников/Node/Go → API/web/worker работают, файлы читаются из приватного S3 | Инвентаризация хоста и сквозной smoke |

## Контракты, риски и совместимость

HTTP DTO и SQL schema этим срезом не меняются. Compose использует те же env и
PostgreSQL migrations. Первичный bootstrap роли/БД ручной, после него API
применяет миграции. Автоматического rollback SQL нет. Digest сохранять вместе
с backup; старый образ разрешён только при совместимой схеме. Секреты S3/БД
остаются в `/etc/litora`, не в GitHub Actions, GHCR или web. PAT private GHCR
и SSH key требуют ротации. Для hosted runner SSH доступ должен быть явно открыт
либо выбран другой канал доставки. Альтернатива: локальная сборка на VPS —
отклонена из-за памяти и повторяемости; Docker Hub — лишняя интеграция.

## Проверки и выпуск

- [x] Статическая проверка Compose, shell syntax, YAML и `git diff --check`.
- [ ] Реальный CI run и pull private GHCR на staging.
- [ ] Чистая БД, S3, TLS и стандартный контрольный расчёт.
- [ ] Heavy job, замер RAM/temp/time и повторный rollout без потери данных.
- [ ] Backup, restore drill и решение о публичном доступе.

Инструкция оператора: [Aeza и CI/CD](../aeza-deployment.md).
