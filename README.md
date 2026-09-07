# Litora

Программный комплекс исследования и визуализации геометрических образов прибрежных систем.

## Запуск

Требования: Node.js 20+, pnpm 10, Go 1.25.4+, Git. Для сеток CLI также нужен Gmsh.

Если `corepack enable` включён, но команда `pnpm` падает с ошибкой проверки
подписи или `Cannot find matching keyid`, установите pnpm напрямую:

```bash
npm install --global pnpm@10.15.0
```

После этого повторите `pnpm install`.

```bash
git clone https://github.com/Nickitas/litora.git
cd litora
corepack enable
pnpm install
```

Подготовьте локальную конфигурацию и инфраструктуру:

```bash
cp .env.example .env.local
pnpm infra:up
```

Команда поднимает PostgreSQL на `localhost:5432`, MinIO S3 API на
`localhost:9000` и MinIO Console на `http://localhost:9001`.

Схема БД и приватный bucket `litora` создаются автоматически. Уже созданные
результаты CLI можно импортировать в PostgreSQL и MinIO:

```bash
pnpm --filter litora-api artifacts:import -- ../lito-cli/output/platform-smoke smoke
```

После импорта задания доступны через `GET /api/calculations`.

Запустите API и web в двух терминалах:

```bash
pnpm --filter litora-api start:dev
pnpm --filter litora-web dev
```

API: `http://localhost:3000`, web обычно: `http://localhost:5173`.
На `http://localhost:3000/` API показывает краткую информацию о доступных маршрутах;
это не web-интерфейс.

По умолчанию web обращается к API через `/api`. Для другого адреса создайте
`apps/lito-web/.env`:

```dotenv
VITE_API_URL=http://localhost:3000/api
```

Проверка API:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/releases/latest
```

Swagger UI доступен по адресу [`http://localhost:3000/api/docs`](http://localhost:3000/api/docs),
а OpenAPI JSON — по адресу [`http://localhost:3000/api/docs-json`](http://localhost:3000/api/docs-json).

## Структура

```text
apps/lito-cli       Go CLI: расчёты и экспорт данных
apps/lito-api       NestJS API
apps/lito-web       React + Vite
packages/contracts  общие DTO и TypeScript-типы
packages/api-client типизированный клиент API
packages/config     общая конфигурация
packages/generated-data  артефакты CLI
packages/docs         единая документация CLI и web
docs                общая документация
```

Связь приложений: `lito-web` использует `@litora/api-client`, клиент типизирован
через `@litora/contracts` и обращается к `lito-api`. CLI генерирует расчёты и
данные независимо; небольшие готовые артефакты можно размещать в
`packages/generated-data`.

Форматы ответов находятся в `packages/contracts/src/index.ts`, методы клиента —
в `packages/api-client/src/index.ts`, endpoint'ы — в `apps/lito-api/src/main.ts`.

## Команды monorepo

```bash
pnpm --filter litora-api start:dev  # API с hot reload
pnpm --filter litora-api build
pnpm --filter litora-web dev
pnpm --filter litora-web build
pnpm --filter litora-web preview
pnpm --filter litora-web lint
pnpm --filter litora-web typecheck
pnpm typecheck                     # contracts, api-client и web
```

Production-файлы web находятся в `apps/lito-web/dist/`.

Если после обновления зависимостей web показывает ошибку React `Cannot read
properties of null (reading 'useState')`, остановите dev-сервер и запустите его
с пересборкой Vite-кэша:

```bash
pnpm --filter litora-web dev -- --force
```

## Запуск CLI

```bash
cd apps/lito-cli
go test ./...
go build -o lito ./cmd/lito
./lito --help
```

Без сборки:

```bash
go run ./cmd/lito --help
go run ./cmd/lito source
go run ./cmd/lito map black-sea
```

Основные команды: `source`, `map`, `dimension`, `mesh`, `seabed`, `erosion`,
`calibrate-cerc`, `all`. Результаты сохраняются в `apps/lito-cli/output/`; путь
можно изменить флагом `--output`. Подробности: [`apps/lito-cli/README.md`](apps/lito-cli/README.md).

## Рабочий процесс

1. Обновите DTO в `packages/contracts`.
2. Измените endpoint в `apps/lito-api`.
3. Добавьте метод в `packages/api-client`.
4. Используйте его в `apps/lito-web`.
5. Выполните `pnpm typecheck` и `pnpm --filter litora-web build`.
6. Для изменений CLI выполните `cd apps/lito-cli && go test ./...`.

Документация хранится только в `packages/docs/content/`: CLI ссылается прямо на
общий пакет, а web собирает из него все Markdown-документы рекурсивно. Новые Markdown-документы и
связанные схемы добавляйте только туда. Крупные
наборы данных храните через Git LFS или объектное хранилище, а не в npm-пакетах.
