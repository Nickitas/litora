# Litora

Платформа исследования береговой линии Чёрного моря: Go вычисляет, NestJS
управляет пользователями и заданиями, React отображает результаты.

## Быстрый запуск всей системы

Нужны Docker Desktop / Docker Compose, Git LFS и Node.js 22.12+ с pnpm 10.15.0.
Go локально нужен только для разработки CLI; Docker собирает его самостоятельно.

```bash
git clone https://github.com/Nickitas/litora.git
cd litora
git lfs pull
pnpm install
pnpm up
```

`pnpm up` создаёт отсутствующий `.env.local` со случайными локальными паролями,
собирает приложения и поднимает PostgreSQL, MinIO, API, worker и web. Существующий
`.env.local` сохраняется. Первое скачивание образов и сборка могут занять несколько минут.
Если pnpm ещё не установлен: `npm install --global pnpm@10.15.0`.
При конфликте с Corepack сначала выполните `corepack disable pnpm`.

| Сервис | Адрес |
| --- | --- |
| Сайт и личный кабинет | http://localhost:5173/account |
| Регистрация / вход | http://localhost:5173/login |
| Swagger | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs-json |
| API health | http://localhost:3000/api/health |
| MinIO Console | http://localhost:9001 |
| MinIO S3 | http://localhost:9000 |
| PostgreSQL | localhost:55432 |

Порты настраиваются в `.env.local`. Логин MinIO — `S3_ACCESS_KEY`, пароль —
`S3_SECRET_KEY`. PostgreSQL использует `POSTGRES_*`. Пароли не коммитятся.
На существующих volumes пароль БД не меняется от редактирования `.env.local`.

Если `9000/9001` заняты другим проектом, укажите `S3_PORT=19000`,
`S3_CONSOLE_PORT=19001`, `S3_ENDPOINT=http://localhost:19000` и
`S3_PUBLIC_ENDPOINT=http://localhost:19000`. Консоль будет доступна на `19001`.

Откройте сайт, создайте аккаунт (пароль от 10 символов), выберите сценарий и нажмите
«Запустить расчёт». В кабинете появятся статус, параметры, метрики, изображения
и ссылки на файлы. Доступны размерность, обзорная карта и демонстрационная эрозия
Сочи. Регистрация реальная; демо-логинов нет.

```bash
pnpm logs        # журналы всех сервисов
pnpm down        # остановка; БД и файлы сохраняются в Docker volumes
pnpm up          # повторный запуск / пересборка после изменений
```

Не добавляйте `down -v`, если нужно сохранить пользователей и результаты.

## Разработка на хосте

Для Go требуется версия 1.25.4 или новее. Gmsh нужен для отдельных mesh-сценариев
самостоятельного CLI, но не для трёх сценариев кабинета.

```bash
pnpm install
pnpm env:init
pnpm infra:up
pnpm build:cli
```

Затем в трёх терминалах из корня репозитория:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Если ранее запускали всю систему в Docker, сначала выполните `pnpm down`, затем
`pnpm infra:up`, чтобы освободить порты API/web. Vite проксирует `/api` на
`http://localhost:3000`; изменить адрес можно переменной `API_PROXY_TARGET`.
После изменения Go-кода повторите `pnpm build:cli`.

Настройки API/worker загружаются из корневого `.env.local`. Для нестандартного
размещения есть `LITORA_ENV_FILE`, `LITO_CLI_DIRECTORY`, `LITO_CLI_BINARY`,
`LITO_JOBS_DIRECTORY`, `LITORA_MIGRATIONS_DIR`. Таймаут задания — `JOB_TIMEOUT_MS`
(по умолчанию 300000). Если меняете порты, согласуйте `DATABASE_URL`,
`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `WEB_ORIGIN` и proxy Vite.

## Как связаны приложения

```text
React → @litora/api-client → NestJS → PostgreSQL (очередь и метаданные)
                                          ↓
                              отдельный worker → Go CLI
                                          ↓
                                     MinIO / S3
```

API сразу возвращает задание `queued`; worker выполняет его асинхронно.
Доступ к расчётам ограничен владельцем. Access token живёт 15 минут и хранится
только в памяти браузера; refresh cookie — HttpOnly, ротируется при обновлении.
Пароли хешируются Argon2id. Signed URL файлов действует 15 минут.

В Swagger выполните `/api/auth/register` или `/api/auth/login`, скопируйте
`accessToken` в **Authorize**, затем вызывайте `/api/calculations`.
Доверенные источники запросов авторизации — `WEB_ORIGIN` и `API_ORIGIN`
(по умолчанию `http://localhost:3000` для Swagger).

```json
{ "kind": "erosion", "input": { "steps": 3 } }
```

Миграции находятся в `infra/postgres/init/`. API и worker применяют новые `.sql`
файлы автоматически и записывают их в `schema_migrations`; существующие миграции
после публикации не редактируйте, добавляйте новые. Приватный bucket создаётся
при запуске. Для доступа браузера к файлам `S3_PUBLIC_ENDPOINT` должен быть
внешним адресом, даже если внутренний `S3_ENDPOINT` равен `http://minio:9000`.

## Структура

```text
apps/lito-cli/          Go: математика, CLI и манифест результатов
apps/lito-api/          NestJS: HTTP, авторизация, очередь; отдельный worker
apps/lito-web/          React: сайт и личный кабинет
packages/contracts/    общие DTO
packages/api-client/   типизированный HTTP-клиент
packages/config/       общая конфигурация
packages/docs/content/ единственная общая документация
packages/generated-data/ небольшие примеры
infra/                 Compose и SQL-миграции
scripts/               подготовка окружения и интеграционные проверки
```

[План интеграции, готовые возможности и следующие этапы](packages/docs/content/platform-integration.md).
[Архитектура](packages/docs/content/architecture.md).
[Возможности самостоятельного CLI](apps/lito-cli/README.md).

## Самостоятельный CLI

```bash
pnpm build:cli
cd apps/lito-cli
./bin/lito --help
./bin/lito dimension --output output/example --manifest output/example/manifest.json
```

CLI не требует регистрации, API, БД или MinIO. Команды `source`, `map`,
`dimension`, `mesh`, `seabed`, `erosion`, `calibrate-cerc`, `all` сохраняются.
HTTP пока предоставляет только три сценария на поставляемых данных. Пользовательские
наборы и сложные батиметрические цепочки — следующие этапы из плана.

Служебный импорт старых результатов:

```bash
pnpm --filter litora-api artifacts:import -- ../lito-cli/output/example manual-import
```

Этот импорт создаёт задание без владельца; оно не появляется в пользовательском
кабинете. Для личных расчётов используйте API или сайт.

## Проверки

```bash
pnpm typecheck
pnpm build:api
pnpm build:web
pnpm test:api
pnpm test:cli
pnpm test:integration   # при работающих API, worker, PostgreSQL и MinIO
```

Интеграционный тест запускает все три сценария, проверяет регистрацию, ротацию
сессии, чужие задания, отмену, Swagger, приватность S3 и SHA-256 манифеста. Он
оставляет тестовых пользователей и результаты в локальной БД.
Для проверки через web proxy: `TEST_API_URL=http://localhost:5173/api pnpm test:integration`.

## Границы текущей реализации

Это рабочая локальная основа системы. Перед публичным размещением настройте HTTPS,
`COOKIE_SECURE=true`, секреты, резервное копирование и внешний rate limiting.
Восстановление пароля, подтверждение почты, загрузка произвольных данных,
пагинация и политики удаления результатов ещё не реализованы.
