# Как запустить Litora для разработки

Эта инструкция запускает PostgreSQL и локальное S3 в Docker, а API, worker и web —
как три отдельных процесса. Для изменений React/NestJS доступен hot
reload; Go-ядро собирается заново после изменений исходников. Для полностью контейнерного запуска
см. раздел 8. Серверная эксплуатация описана отдельно в [deployment](deployment.md).

## 1. Подготовить инструменты

- Docker Desktop с командой `docker compose` и запущенным Docker daemon;
- Node.js 22.12+ и pnpm 10.15.0;
- Go 1.25.4+ для локальной сборки CLI;
- Git LFS для галерейного SVG и других крупных файлов.

Проверьте версии:

```bash
node --version
pnpm --version
go version
docker compose version
git lfs version
```

Если `pnpm` останавливается с ошибкой Corepack `Cannot find matching keyid`,
обновите Corepack либо отключите его shim для pnpm и установите нужную версию:

```bash
corepack disable pnpm
npm install --global pnpm@10.15.0
pnpm --version
```

Ошибка `EEXIST` при глобальной установке обычно означает, что shim ещё находится
в `bin/pnpm`. Сначала проверьте `command -v pnpm`, используйте `corepack disable pnpm`;
не удаляйте неизвестные файлы и не ставьте `npm --force` ради обхода конфликта.
Если права управления глобальными пакетами отличаются, используйте локальный nvm
Node и его npm. Инструкция не требует менять package manager в lockfile.

## 2. Получить код и зависимости

Для нового клона:

```bash
git clone https://github.com/Nickitas/litora.git
cd litora
git switch development
git lfs install --local
git lfs pull
pnpm install --frozen-lockfile
```

Если `development` ещё не опубликована, пользователь сначала коммитит/публикует
эту ветку; до того используйте существующую локальную копию. Проверяйте
`git branch --show-current` и `git status --short`, чтобы не работать в исходной
ветке старого web-репозитория. `git lfs pull` обязателен после клона/смены ветки,
иначе большой SVG может оказаться LFS pointer вместо изображения.

На уже настроенной машине достаточно `pnpm install --frozen-lockfile` после
изменения lockfile. При предупреждении pnpm про ignored build scripts проверьте
политику разрешённых scripts в корневом `pnpm-workspace.yaml`: argon2 и esbuild
нужны для сборки. Не одобряйте произвольные новые scripts без ревью.

## 3. Создать локальные настройки

```bash
pnpm env:init
```

Скрипт создаёт отсутствующий `.env.local` из `.env.example` и генерирует локальные
случайные пароли PostgreSQL и S3. Существующий файл он не перезаписывает.
Файл исключён из Git; не прикладывайте его к issue/скриншотам. Для обычного режима
проверьте согласованность портов и адресов без публикации самих секретов:

| Ключ | Обычное локальное значение | Зачем нужен |
| --- | --- | --- |
| `POSTGRES_PORT` | `55432` | Внешний порт PostgreSQL Docker |
| `DATABASE_URL` | `postgresql://...@localhost:55432/litora` | API и worker на хосте |
| `S3_PORT`, `S3_CONSOLE_PORT` | `9000`, `9001` | S3 и консоль Docker |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` | `http://localhost:9000` | Подключение Node и подписанный URL браузера |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS и проверка Origin |
| `API_ORIGIN` | `http://localhost:3000` | Swagger/auth Origin |
| `COOKIE_SECURE` | `false` | HTTP только на localhost |
| `TRUSTED_PROXY_CIDRS` | пусто | Не доверять forwarded headers при прямом запуске API |
| `API_PORT`, `WEB_PORT` | `3000`, `5173` | Compose-режим целиком |

Если 9000/9001 заняты, например другим MinIO, задайте `S3_PORT=19000`,
`S3_CONSOLE_PORT=19001`, `S3_ENDPOINT=http://localhost:19000`,
`S3_PUBLIC_ENDPOINT=http://localhost:19000`. `S3_PUBLIC_ENDPOINT` важен:
браузер должен видеть именно тот host/port, которыми подписана ссылка.
Если меняете `POSTGRES_PORT`, обновите и `DATABASE_URL`; при смене порта web
обновите `WEB_ORIGIN` и адрес, на который открываете сайт.

Смена `POSTGRES_PASSWORD` в `.env.local` **не меняет** пароль существующего Docker
volume. При несоответствии либо восстановите исходное значение из password manager,
либо согласованно смените пароль роли в БД. Не удаляйте volume с данными ради ошибки
аутентификации. Подробные дополнительные переменные — в корневом README.

## 4. Поднять инфраструктуру

Если прежде запускали `pnpm up` (все приложения внутри Docker), остановите этот
профиль командой `pnpm down`: она сохраняет volumes. Иначе порты API/web будут заняты.

```bash
pnpm infra:up
docker compose --env-file .env.local -f infra/compose.yaml ps
```

Compose поднимет PostgreSQL, MinIO и однократную инициализацию схемы. Дождитесь
`healthy` у PostgreSQL/MinIO и успешного завершения `postgres-init`. API/worker
дополнительно проверяют и применяют новые SQL-миграции при запуске.

Если сервисы не готовы:

```bash
pnpm infra:logs
```

Эта команда следит за логами, завершить просмотр `Ctrl+C`. Пароли в логах/вопросах
поддержки маскируйте. Локальный `minio/minio:latest` в существующем Compose — dev
наследие; для реального сервера используйте проверенный S3 из runbook.

## 5. Собрать Go CLI

```bash
pnpm build:cli
```

Ожидаемый бинарник: `apps/lito-cli/bin/lito`. API worker по умолчанию использует
именно его и `apps/lito-cli/data`. В Docker образ бинарник собирается отдельно.
После изменения Go-кода снова запустите `pnpm build:cli`; перезапуск worker не
требуется для нового задания, но дождитесь завершения текущих jobs перед заменой
бинарника. Новую версию и результаты проверяйте заново.

Для самостоятельной работы CLI:

```bash
cd apps/lito-cli
./bin/lito --help
./bin/lito dimension --output output/example --manifest output/example/manifest.json
```

CLI не требует API, БД или аккаунта. Сложные mesh-сценарии могут требовать Gmsh;
три HTTP-сценария кабинета его сейчас не требуют.

## 6. Запустить приложение: три терминала

Во **всех трёх терминалах** текущий каталог — корень монорепозитория.

Терминал 1 — NestJS API с перезапуском после изменения TS:

```bash
pnpm dev:api
```

Терминал 2 — отдельный worker, запускающий Go CLI:

```bash
pnpm dev:worker
```

Терминал 3 — Vite/React с обновлением страницы без сборки образа:

```bash
pnpm dev:web
```

Текущий `dev:worker` запускает `tsx` без watch. После правки worker TS остановите
его `Ctrl+C` и запустите снова. Встроенные данные/миграции также подхватываются
при соответствующем рестарте. Node процессы берут настройки из корневого `.env.local`.

| Что открыть | Адрес по умолчанию |
| --- | --- |
| Сайт | http://localhost:5173/ |
| Вход / регистрация | http://localhost:5173/login |
| Личный кабинет | http://localhost:5173/account |
| Swagger | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs-json |
| Health API | http://localhost:3000/api/health |
| Консоль MinIO | http://localhost:9001/ |

Корень API на `http://localhost:3000/` не является интерфейсом сайта. Web на
5173 проксирует `/api` к 3000, поэтому frontend обращается к API с того же origin.
Если Vite занял 5174 из-за конфликта, освободите 5173 либо согласуйте `WEB_ORIGIN`;
случайный порт может сломать CORS/auth. Прокси меняется через `API_PROXY_TARGET`.

Dev Vite/nginx по умолчанию не входят в доверенную цепочку: auth-лимит может
быть общим для клиентов proxy. Не выставляйте `TRUSTED_PROXY_CIDRS=true`.
Для реальной эксплуатации используйте отдельную схему Caddy из deployment;
конкретный IP/CIDR локального proxy добавляйте только при контролируемой сети.
При 429 дождитесь времени `Retry-After` вместо отключения лимита.

Перед первой регистрацией выпустите одноразовый ключ из корня проекта:

```bash
pnpm --filter litora-api invitations create
```

Команда применяет миграции и выводит JSON с `id`, `code` и `expiresAt`.
Передайте `code` пользователю безопасным способом, не сохраняйте вывод в Git или
общих логах. По умолчанию ключ действует 7 дней. Отзыв неиспользованного ключа:
`pnpm --filter litora-api invitations revoke --id <UUID>`.
Существующим пользователям ключ для входа не нужен. Для Docker-режима см.
операторскую команду в корневом README.

Зарегистрируйтесь с ключом на `/login`, откройте `/account`, запустите dimension и дождитесь
появления отчёта/ссылки. Затем map и демонстрационный erosion (`steps` 1–48).
На странице Swagger после входа используйте полученный access token в Authorize;
без него защищённые ручки вернут 401. Файлы доступны по подписанным ссылкам S3.

## 7. Проверки во время разработки

Полный прогон одной командой:

```bash
pnpm verify
```

Он проверяет границы монорепозитория, типы, web lint, документацию и бинарники,
тесты API/Go и сборку. В CI используется тот же сценарий.

Также проверяется бюджет всего статического JS-графа web (400 000 байт) и
отсутствие eager Motion/docs. Отдельно: `pnpm test:bundle`; подробный граф маршрутов:
`pnpm --filter litora-web analyze:bundle`. Анализ выполняет дополнительную сборку
в памяти, не меняя dist; это не измерение LCP, CSS/шрифтов или скорости backend.

PostgreSQL/HTTP-тесты приглашений, сессий, изоляции владельцев и конкурентной
квоты запускаются при заданном `TEST_DATABASE_URL`. Допускается только отдельная
БД с именем `litora_test_<суффикс>` (суффикс: строчные латинские буквы, цифры,
подчёркивания). Тесты создают собственные fixtures и удаляют их после проверки;
тест приглашений также использует тестовый trigger. Не указывайте рабочую БД.
Локально `pnpm test:api` без переменной явно пропускает две PostgreSQL suites.
`pnpm test:api:db` и запуск при `CI=true` требуют TEST_DATABASE_URL и завершаются
ошибкой при её отсутствии. CI поднимает отдельный PostgreSQL.

После создания выделенной тестовой БД:

```bash
TEST_DATABASE_URL='postgresql://test_user:test_password@127.0.0.1:5432/litora_test_local' pnpm test:api:db
```

Замените пример реквизитами тестового стенда, не копируйте рабочий DATABASE_URL.
Тест изоляции подменяет только S3 signer: реальный worker/S3 проверяется отдельным
интеграционным сценарием ниже.

Из корня:

```bash
pnpm check:workspace
pnpm typecheck
pnpm build:api
pnpm build:web
pnpm lint
pnpm test:web
pnpm test:api
pnpm test:cli
```

Браузерная регрессия web запускается отдельно от быстрого `pnpm verify`:

```bash
pnpm --filter litora-web exec playwright install chromium
pnpm test:web:e2e
```

Если Chrome уже установлен локально, вместо загрузки Chromium можно выполнить
`LITORA_E2E_USE_SYSTEM_CHROME=1 pnpm test:web:e2e`. В CI используется
установленный Playwright Chromium, переменная там не задаётся.

Она автоматически запускает Vite на `127.0.0.1:5189`, перехватывает все
`/api/**` и проверяет регистрацию, вход, кабинет и создание расчёта на
контролируемых ответах. Работающие API, БД и S3 не нужны; не запускайте тест
параллельно с другим процессом на порту 5189. В CI Chromium устанавливается
отдельным шагом и затем выполняется эта же команда. Проверка не заменяет
интеграционный тест с реальным worker и S3 ниже.

При изменении Go дополнительно из `apps/lito-cli`: `go vet ./...`; для
конкурентного Go — `go test -race ./...`. Установка Gmsh для этих команд зависит
от задействованных тестов/модулей.

Интеграционный сценарий только на отдельной локальной или тестовой БД/bucket
при работающих API, worker, PostgreSQL и S3:

```bash
TEST_INVITATIONS_JSON="$(pnpm --silent --filter litora-api invitations create --count 3 --expires-hours 1)" pnpm test:integration
```

Команда выпускает три ключа на тестовом стенде и передаёт их без записи в файл.
Он создаёт тестовых пользователей и файлы. Не запускать его на рабочем production.
При ошибке проверки зафиксируйте конкретный вывод и состояние сервисов, не
заменяйте полноценную проверку одним `/api/health`: health не проверяет worker.

## 8. Альтернатива: всё в Docker

Если не нужен быстрый hot reload, можно запустить полный профиль:

```bash
pnpm up
pnpm logs
pnpm down
```

`pnpm up` при отсутствии `.env.local` создаёт его, затем собирает Go/API/web и
поднимает БД, MinIO, API, worker, web. `pnpm down` останавливает контейнеры,
данные в именованных volumes сохраняются. После изменения кода `pnpm up`
пересобирает образ; это существенно медленнее режима трёх терминалов.
Перед переходом между режимами остановите предыдущий профиль, иначе получите
`port already allocated` или два worker на общей очереди. Обычный `pnpm infra:down`
останавливает только БД/S3; сначала остановите хостовые API и worker.

## 9. Частые ошибки

| Признак | Что проверить |
| --- | --- |
| API 503 на `/api/health` | PostgreSQL/MinIO healthy, URL/порт/ключ bucket в `.env.local`, миграции и логи API |
| `password authentication failed` | `DATABASE_URL`, пароль роли в существующем volume; env-файл сам пароль БД не меняет |
| На 3000 JSON вместо сайта | Это API; React открыт на 5173 |
| `Failed to load module script`, MIME `text/html` | В Network посмотреть **точный URL** сбойного модуля и `Content-Type` ответа. В Yandex Browser после старого ответа HTML для `/src/`, `/@fs/` и `/node_modules/.vite/deps/` помогли `Disable cache` в DevTools и повторная загрузка страницы: те же URL стали отдавать JS. Если `/assets/` — возможно, вкладка держит старый production-бандл после Docker. Если отключение кеша не помогает, сверить URL прямым запросом к Vite и проверить его логи; не менять MIME вручную. |
| `Failed to fetch dynamically imported module` | Проверьте URL модуля и загрузку в чистой вкладке. Если Vite отдаёт его как JavaScript, а старая вкладка падает после hot reload, обновите её без кеша. Общий экран ошибки маршрута предлагает повторную загрузку; он не заменяет диагностику при устойчивом сбое. |
| Кабинет не обновляется из `queued` | Отдельный `pnpm dev:worker` запущен, `apps/lito-cli/bin/lito` существует; логи worker |
| Ошибка скачивания или `SignatureDoesNotMatch` | `S3_PUBLIC_ENDPOINT` должен совпадать с браузерным host/port, часы синхронизированы |
| React `useState` of null | Одна копия React в workspace; Vite `dedupe` уже настроен, проверить зависимости/cache после обновления |
| Corepack `keyid` / npm `EEXIST` | Версия pnpm, конфликт Corepack shim; см. шаг 1 |
| `port already allocated` | Не оставлен ли полный `pnpm up` или другой проект на 3000/5173/9000/9001 |
| SVG выглядит как несколько строк текста | Git LFS не извлёк объект: `git lfs pull` |

Остановить Vite/API/worker: `Ctrl+C` в их терминалах. Затем при необходимости:

```bash
pnpm infra:down
```

БД и артефакты сохраняются. Не использовать `down -v` или volume prune ради обычной
остановки. Если теряется авторизация после перезапуска web, проверьте cookie/origin,
а не возвращайте токен в localStorage.
