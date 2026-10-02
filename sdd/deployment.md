# Развёртывание и эксплуатация на реальном сервере

Дата проверки: 25.09.2026. Это runbook и проверяемые шаблоны, **не отчёт о выполненном
развёртывании**. Команды выполняет оператор на выделенном сервере после заполнения
параметров и проверки staging. Локальный запуск остаётся в [README](../README.md).

## 1. Что именно разворачиваем

Рекомендуемый первый сервер: Ubuntu Server 24.04 LTS, Docker Engine + Compose v2,
PostgreSQL 17, отдельные API/worker, nginx web, Caddy для TLS, внешний приватный S3.
Node/pnpm/Go на production-хосте не обязательны: приложения собираются в Docker.
Это закрытый пилот для небольшой команды за IP-allowlist/VPN, не HA-кластер.

```text
Браузер команды → HTTPS :443 → Caddy → /api/* → NestJS
                                  └→ остальные пути → nginx web
                                                           ↓
                                                     PostgreSQL ← worker → Go
                                                                       ↓
Браузер ← signed HTTPS URL ← API                                внешний S3
```

Снаружи открыты 80/443 для HTTPS/ACME, SSH только с адреса оператора. PostgreSQL,
API, worker и nginx доступны лишь внутри Docker-сети, портов 3000/5173/5432/9000/9001
на публичном интерфейсе нет. Ключей S3 у браузера нет, файл скачивается по signed URL.

Файлы-примеры:

- [compose.production.yaml](examples/compose.production.yaml) — **самостоятельный**
  Compose, не дополнение к локальному `infra/compose.yaml`.
- [Caddyfile](examples/Caddyfile) — HTTPS и ограничение команды по IP.
- [.env.example](examples/.env.example) — имена и placeholder, без действующих секретов.

Не объединять эти файлы с dev Compose: там жёстко задан внутренний MinIO endpoint,
другие init/ports/env_file. Пример не изменяет работу `pnpm up` и `.env.local`.

### Почему S3 снаружи

Один диск для БД и всех результатов увеличивает риск потери всего исследования при
отказе хоста. Managed S3 отделяет ёмкость от CPU worker. Для production выбран
AWS S3 в регионе `eu-central-1` (Франкфурт)
([ADR-008](decisions.md#adr-008--aws-s3-для-production-артефактов)).
Стоимость и расположение сервера уточняются перед staging. Настройки ниже
соответствуют выбранному региону.

На дату проверки community MinIO объявлен неподдерживаемым, GitHub-репозиторий
архивирован 25.04.2026: [первичный источник](https://github.com/minio/minio).
Не публиковать унаследованный `minio:latest` в production. Локальный изолированный
стенд пока сохраняется; поддерживаемая self-hosted альтернатива требует отдельного ADR,
подбора версии, лицензии, дисков, TLS и резервирования. Это не входит в данный шаблон.

## 2. Железо: минимум и достаточная конфигурация

Ниже **планировочная оценка**, не результат нагрузочного теста. Применима только
к трём текущим HTTP-сценариям на встроенных данных, один worker, файлы во внешнем S3.
Количество зарегистрированных пользователей само по себе не определяет нагрузку.

| Режим | CPU | RAM | Локальный SSD/NVMe | Пояснение |
| --- | --- | --- | --- | --- |
| Минимально разумный пилот | 4 vCPU | 8 ГБ | 100 ГБ | Один worker 2 CPU / 2 ГБ, без сборки под нагрузкой |
| Достаточный старт с запасом | 8 vCPU | 16 ГБ | 200 ГБ | API, БД, сборка в окно обслуживания; второй worker только после замеров |
| Тяжёлые mesh/seabed, полные растры | От 8–16 vCPU | От 32–64 ГБ | От 500 ГБ временного NVMe | Отдельная оценка по датасету; текущий лимит 2 ГБ не подходит автоматически |

2 vCPU/4 ГБ годятся лишь для ограниченного эксперимента с изменёнными лимитами,
не рекомендуются для этого полного комплекса. GPU для текущих сценариев не нужен.
CPU архитектура amd64/arm64 допустима при сборке и тестах под целевой хост; отдельные
внешние mesh-инструменты и их образы проверять дополнительно. Исходящий HTTPS к
S3/registry/GitHub обязателен; 100 Мбит/с — нижний практический ориентир, 1 Гбит/с
предпочтителен для больших отчётов. Проверьте лимит и стоимость исходящего трафика.

Бюджет RAM примера: PostgreSQL ≤2 ГБ, API ≤1 ГБ, worker ≤2 ГБ, nginx/Caddy суммарно
≤0.5 ГБ, остальное OS/cache/резерв. Лимиты не являются резервированием памяти.
Сборка Go/Node требует дополнительного пика: на 8 ГБ собирать отдельно или остановить
нагрузку. Swap 2–4 ГБ — страховка OS, не замена памяти для научного расчёта.

Ёмкость считать, а не угадывать: OS+образы+две версии релиза+БД+WAL+журналы+
локальные backup+`workers × максимальный временный job` + минимум 25% свободного.
S3: входы + число запусков × средний результат × retention + версии/резервные копии.
Например, 20 jobs/день × 200 МБ × 30 дней ≈120 ГБ только новых результатов;
это пример арифметики, не измеренный размер результата Litora. Сейчас retention
автоматически не реализован: объекты будут расти до вмешательства оператора.

Перед открытием доступа замерить wall time, peak RSS, CPU, temp/output bytes, время
upload, p95 API и очередь на 1, затем 2 worker. Не повышать concurrency/timeout
вслепую. Задать алерты на >75% диска, OOM, рост oldest queued и просроченный backup.

## 3. Предварительные условия

1. Сервер и домен, DNS A на реальный IPv4; AAAA только если IPv6 действительно работает.
2. SSH-ключи, отдельный оператор, актуальные security updates, синхронизация времени.
   Не отключать парольный вход до проверки второго ключевого SSH-сеанса.
3. Docker Engine из официального apt-репозитория, Compose plugin, Git, Git LFS,
   curl, openssl. Установка: [Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
   Не запускать случайный `curl | sh`. Доступ к Docker group эквивалентен высокому
   привилегированному доступу — выдавать только оператору.
4. Внешний firewall: SSH с IP оператора, 80/443 для ACME/HTTPS; все остальные
   входящие закрыты. Docker-порты могут обходить ожидания UFW, поэтому проверять
   с внешней машины и использовать firewall провайдера/DOCKER-USER по ситуации.
5. Bucket и сервисная учётная запись S3, отдельный backup bucket/account.
6. Проверенный release SHA монорепозитория, результаты CI и тестовый стенд.
   CI сейчас проверяет код, но не публикует образы и не выполняет автоматический deploy.

Проверка инструментов (после установки):

```bash
docker version
docker compose version
git lfs version
timedatectl status
```

Полезно разделять сборочную машину и production. Для первого закрытого пилота
допустима сборка на сервере в maintenance window; шаги ниже показывают этот вариант.

## 4. Подготовка файлов релиза и секретов

Пример путей: `/opt/litora/repository`, `/opt/litora/deploy`, `/etc/litora`,
`/var/backups/litora`. Создать их администратором и выдать владельцу-оператору
необходимые права; `/etc/litora` и backup каталог — 0700. Не клонировать поверх
существующей установки и не удалять её каталоги без инвентаризации.

```bash
git clone https://github.com/Nickitas/litora.git /opt/litora/repository
cd /opt/litora/repository
git checkout --detach <ПРОВЕРЕННЫЙ_RELEASE_SHA>
git lfs install --local
git lfs pull
git lfs fsck
git status --short
```

`<...>` заменяется конкретным значением, это не готовая команда. Релиз берётся по SHA,
не по плавающей development. До выпуска текущих документов нужен коммит пользователя;
не пытаться клонировать ещё не опубликованные файлы.

Скопировать только шаблоны (ниже предполагается новый deployment-каталог):

```bash
install -m 0644 sdd/examples/compose.production.yaml /opt/litora/deploy/compose.production.yaml
install -m 0644 sdd/examples/Caddyfile /opt/litora/deploy/Caddyfile
install -m 0600 sdd/examples/.env.example /etc/litora/production.env
```

Заполнить `production.env` защищённым редактором. Два разных пароля PostgreSQL
генерировать `openssl rand -hex 32`; hex исключает проблемы URL-encoding в DATABASE_URL.
Внести их в password manager. Не публиковать вывод, не передавать пароль аргументом
команды и не запускать shell с `set -x`. Не `source` произвольный env: его читает Compose.

Задать реальные domain/email/IP allowlist, S3 настройки и образы. Env хранится вне
Git и Docker build context. Приложению передаётся только нужный набор env: пароль
администратора БД не передаётся API/worker. `COOKIE_SECURE=true` и оба Origin заданы
Compose как `https://<domain>` без завершающего `/`; web ходит к `/api` того же origin.

Текущий SDK использует явно заданные access/secret key и не поддерживает session token
или IAM role chain этим конфигом. Для пилота — ограниченный сервисный ключ; переход
на workload identity требует изменения кода. Compose secrets сами по себе не добавят
приложению поддержку `_FILE`; не утверждать, что секрет защищён от администратора Docker.

### Доверенный адрес proxy и auth-лимит

Production-пример направляет `/api/*` из Caddy напрямую в API по имени
`api-edge` в выделенной сети: nginx не участвует в auth-цепочке. API доверяет
только адресу Caddy `/32`, не всей Docker-сети. По умолчанию edge-сеть
`172.30.10.0/24`, Caddy `172.30.10.2`. До запуска проверьте отсутствие конфликта
с VPN/сетями хоста. При конфликте добавьте в production env согласованные
`LITORA_EDGE_SUBNET` и `LITORA_PROXY_IP` (IPv4 из этой сети).
API не имеет опубликованного порта; не добавляйте его наружу для отладки.

При запуске API вне этого Compose задайте `TRUSTED_PROXY_CIDRS` списком конкретных
IP/CIDR доверенных proxy через запятую. Пустое значение означает отсутствие доверия.
`true`, число hops, hostname и `/0` запрещены. Express проверяет цепочку справа
налево, поэтому нельзя брать первый адрес из X-Forwarded-For самостоятельно:
[официальное руководство](https://expressjs.com/en/guide/behind-proxies/).
Доверенный proxy обязан очищать/корректно дополнять входящие forwarded headers;
пример предполагает прямой доступ клиентов к Caddy, без CDN/LB.

Register/login/refresh/logout делят 30 запросов в минуту на клиентский IP.
При 429 API возвращает `Retry-After` в секундах. Лимит fixed-window допускает
burst на границе минуты; пользователи за NAT делят квоту. Это не ingress/DDoS
защита. На staging отдельно проверить два клиентских IP, поддельный forwarded
header, 429 и отсутствие прямого доступа к API — локальные unit-тесты этого
реального сетевого smoke не заменяют.

## 5. Подготовка S3

В консоли выбранного провайдера создать уникальный bucket в нужном регионе **до API**.
Включить запрет публичного доступа, шифрование, versioning; учесть стоимость версий.
Не включать lifecycle удаления рабочих файлов, пока это не согласовано с реестром БД.
Для noncurrent versions/backup retention задать отдельную согласованную политику.

Для AWS S3 минимальная сервисная IAM policy (заменить `BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::BUCKET_NAME"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    }
  ]
}
```

ListBucket нужен для HeadBucket; CreateBucket/DeleteObject не выдаём. Приложение
умеет создавать отсутствующий bucket в dev (`S3_AUTO_CREATE_BUCKET=true`); в
production-шаблоне эта опция принудительно отключена. Если bucket не найден, API
останавливается с явной ошибкой вместо попытки CreateBucket. При запуске вне
production-шаблона выставить `S3_AUTO_CREATE_BUCKET=false` вручную.
403 при HeadBucket — ошибка прав, не повод сделать bucket публичным. IAM policy
не заменяет block public access. При customer-managed KMS нужны согласованные KMS
права и проверка, этот минимальный пример предполагает обычное S3-managed encryption.

Для выбранного региона AWS: endpoint `https://s3.eu-central-1.amazonaws.com`, region
`eu-central-1`, `S3_FORCE_PATH_STYLE=false`; оба endpoint одинаковые и без bucket
в пути. Для другого провайдера использовать его region/path-style правила.
`S3_PUBLIC_ENDPOINT` должен быть доступен браузеру с HTTPS. Нельзя менять host,
query или path уже подписанного URL. Он даёт доступ предъявителю до истечения срока:
[официальная документация presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

Для текущих `<img>`/скачивания CORS не требуется как для fetch; если добавляете
JS-чтение файлов, разрешить GET/HEAD только origin сайта и нужные response headers,
а не wildcard с credentials. API CORS не настраивает CORS bucket.

## 6. Сборка и фиксация образов

```bash
cd /opt/litora/repository
LITORA_RELEASE=$(git rev-parse HEAD)
docker build -f apps/lito-api/Dockerfile -t "litora-api:$LITORA_RELEASE" .
docker build -f apps/lito-web/Dockerfile -t "litora-web:$LITORA_RELEASE" .
docker pull 'postgres:17.10-alpine3.24@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193'
docker pull 'caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b'
```

Индексные digest PostgreSQL и Caddy записаны в примере production env; они
проверены для amd64 и arm64 на дату подготовки. Перед развёртыванием перепроверить
их доступность и поддерживаемость, не заменяя на плавающий тег. API_IMAGE и WEB_IMAGE
— уникальные теги с release SHA. Сохранить image IDs, дату, release SHA и результаты
сканирования образов в журнал релиза. Тег не пересобирать под тем же именем.
Для повторяемого выпуска из CI публиковать проверенные образы в private registry
и использовать `image@sha256:...`; это следующий шаг, registry pipeline пока нет.

В Dockerfile base images Go, Node и nginx закреплены multi-arch digest.
Это не делает сборку полностью воспроизводимой: внешние npm/Go-зависимости и
пакетный реестр могут измениться или стать недоступны. Хранить готовые образы
API/web и их digest; перед публичным production нужны сборка на целевой платформе,
сканирование и SBOM. Обновление digest — отдельный проверяемый release-процесс.
Большие web gallery-файлы требуют Git LFS при сборке; LFS pointer вместо SVG — ошибка.
Локальные сборки обоих Dockerfile с указанными base digest прошли 25.09.2026;
это не проверка production-хоста и не подтверждение доступа к AWS S3.

Функция для всех последующих команд, выполнить в текущем shell оператора:

```bash
dc() {
  docker compose --project-name litora-production \
    --env-file /etc/litora/production.env \
    -f /opt/litora/deploy/compose.production.yaml "$@"
}
dc config --quiet
```

Не запускать `dc config` без `--quiet` в общие журналы: там будут раскрыты секреты.
Проверка config не подтверждает доступность образов, DNS или S3. Placeholder `REPLACE`
и example.org должны отсутствовать в заполненном файле, проверять без печати значений.

## 7. Первый запуск БД и миграций

```bash
dc up -d --wait postgres
dc exec postgres psql -U litora_admin -d postgres
```

В интерактивном psql **только на новой установке**:

```sql
CREATE ROLE litora_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password litora_app
CREATE DATABASE litora OWNER litora_app;
\q
```

В prompt пароля ввести POSTGRES_PASSWORD из защищённого файла (не admin password).
Команды не повторять вслепую при ошибке «уже существует»: проверить роли/БД.
Postgres admin нужен для bootstrap/backup, приложение использует отдельного владельца
своей БД без superuser. Пока API самостоятельно применяет миграции, ему необходимы DDL
права в своей БД; разделение migration/runtime role — следующий hardening-этап.

```bash
dc up -d --wait api
dc exec -T postgres psql -U litora_admin -d litora -c 'SELECT name, applied_at FROM schema_migrations ORDER BY name;'
dc up -d --wait worker web
dc run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
dc up -d caddy
dc ps
```

API и worker применяют SQL из `infra/postgres/init/` в транзакции с advisory lock.
Это делает schema setup автоматическим после создания БД; отдельный postgres-init
из dev Compose здесь не нужен. При ошибке миграции не удалять volume и не править
schema_migrations вручную: остановить rollout, изучить причину на копии БД.

Caddy получает/обновляет сертификат при корректном DNS и доступных 80/443;
`caddy-data` хранит ACME-состояние. Механизм:
[Automatic HTTPS](https://caddyserver.com/docs/automatic-https).
Allowlist проверяется приложением Caddy, ACME challenge обслуживается его TLS/HTTP
механизмом. Пример предполагает прямой клиент → Caddy. Если перед ним CDN/LB,
`remote_ip` станет адресом proxy: сначала спроектировать trusted proxies, иначе
можно либо заблокировать всех, либо открыть всем доступ через доверенный адрес CDN.
Разница remote_ip/client_ip описана в [Caddy matchers](https://caddyserver.com/docs/caddyfile/matchers#remote-ip).

`dc --wait` не проверяет жизнеспособность worker: у него нет healthcheck. Обязателен job.
Нельзя просто удалить allowlist для «готового публичного production» — см. раздел 12.

## 8. Приёмка сервера

С разрешённого IP:

```bash
curl --fail --silent --show-error https://litora.example.org/api/health
curl --fail --silent --show-error --output /dev/null https://litora.example.org/api/docs-json
```

Подставить свой домен. С другого IP сайт должен возвращать 403; отдельно проверить,
что 5432/3000/5173 не открыты снаружи. Затем через браузер:

1. Выпустить отдельное тестовое приглашение операторской командой
   `node dist/scripts/invitations.js create --expires-hours 1` внутри контейнера API.
   Не публиковать JSON с ключом в журнале приёмки. `/login`: регистрация с этим
   ключом, вход, reload, logout; повторное использование ключа запрещено.
   Cookie Secure/HttpOnly/SameSite, access token не в storage, нет mixed content.
2. `/account`: последовательно dimension, map, erosion. Дождаться реального succeeded,
   открыть отчёт, скачать manifest, сопоставить размер/SHA-256 файла с реестром.
3. Второй пользователь не получает job первого; отмена не становится success позже.
4. URL без подписи не даёт файл, signed URL снаружи сервера работает только до срока.
5. Проверить SQL metadata и отсутствие токенов/паролей/полных signed URLs в логах.
6. Перезапуск API/worker не теряет историю; `health` может быть зелёным при мёртвом
   worker, поэтому выполнить ещё один контрольный расчёт.

Полный `pnpm test:integration` запускать на staging с отдельной БД/bucket, не на
пользовательском production: тест создаёт реальные аккаунты, задания и файлы.
На production — только согласованный smoke и описанная политика его тестовых данных.

### Проверка AWS S3 на staging

Подготовить **отдельный** приватный staging-bucket в `eu-central-1` с включённым
versioning и Block Public Access. Использовать отдельный staging-ключ с правами
`s3:ListBucket` на этот bucket, `s3:GetObject`/`s3:PutObject` и
`s3:DeleteObjectVersion` только на `arn:aws:s3:::STAGING_BUCKET/smoke-tests/*`.
Приложению в production право удаления версий **не выдавать**. Перед запуском
проверить имя bucket и права в AWS Console; тест не заменяет проверку настроек
Block Public Access и отдельный restore drill.

В защищённом `/etc/litora/staging.env` указать `S3_BUCKET`, `S3_ENDPOINT`,
`S3_PUBLIC_ENDPOINT`, `S3_REGION=eu-central-1`, `S3_FORCE_PATH_STYLE=false`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`. Из репозитория запустить:

```bash
LITORA_ENV_FILE=/etc/litora/staging.env \
  S3_SMOKE_CONFIRM_BUCKET=STAGING_BUCKET \
  S3_SMOKE_STAGING=true \
  pnpm --filter litora-api storage:smoke
```

Скрипт создаёт один случайный ключ `smoke-tests/<uuid>.bin`, проверяет чтение,
временную подписанную ссылку и отказ без подписи. Затем удаляет **только версию**
созданного тестового объекта, не весь bucket и не чужие ключи. При ошибке удаления
выписать ключ из AWS-аудита/префикса `smoke-tests/` и убрать его вручную после
проверки; не запускать bulk-delete. Сам скрипт здесь не запускается без ваших
staging-реквизитов. Signed URL и секреты в лог не выводятся.

### Ручная сверка частичных артефактов

После падения worker или недоступности S3/БД может остаться часть результата
отменённого или ошибочного job. Команда оператора **по умолчанию только читает**:

```bash
dc exec -T api node dist/scripts/reconcile-artifacts.js
```

Она просматривает не более 10 000 объектов под `users/`, сообщает число
кандидатов и первые 20 ключей. Приложенческому S3-ключу для этого нужен
`s3:ListBucket` на bucket; bucket команда не создаёт. Кандидат — объект старше
24 часов из job `failed`/`cancelled`, который также завершился более 24 часов
назад. `failure.log`, входные datasets, неизвестные, активные и успешные jobs
не удаляются. До удаления сверить отчёт с БД и резервной копией.

Только после проверки, в окне обслуживания с остановленными worker'ами и
любыми другими писателями в тот же bucket, оператор может выполнить:

```bash
dc exec -T api node dist/scripts/reconcile-artifacts.js --apply
```

За один запуск удаляется не более 100 объектов; перед каждым удалением
повторно проверяются статус job и ETag/время объекта. Сначала удаляется объект,
затем его запись в БД. Не запускать `--apply` до согласованного backup/restore
drill и проверки на staging. В versioned AWS S3 `DeleteObject` создаёт delete
marker: старые версии остаются и требуют отдельной политики хранения; этот
инструмент не удаляет версии и не является политикой retention. При ошибке
S3/БД остановиться и сверить результаты следующего dry-run, не повторять
удаление вслепую.

## 9. Backup: БД и объекты вместе

Цели пилота (оценка): RPO ≤24 h, RTO ≤4 h, подтверждаются restore drill. Ежедневный
дамп, отдельная копия S3/versioning, off-host backup конфигурации и release image IDs.
Versioning и snapshot диска сами по себе не являются независимой резервной копией.
Для меньшего RPO нужны WAL archiving/PITR или managed PostgreSQL — отдельная настройка.

Согласованный backup при коротком обслуживании:

1. Объявить downtime и закрыть новые запросы `dc stop caddy`.
2. Дать очереди завершиться; проверить SQL ниже. При долгом задании ждать или
   согласованно отменить; не убивать процессы только ради красивого snapshot.
3. Когда нет queued/running, `dc stop worker api web`. PostgreSQL остаётся работать.
4. Снять дамп и список объектов/метаданных; скопировать S3 в отдельное защищённое
   хранилище средствами провайдера/backup account. При остановленных writers
   объекты и дамп относятся к одной точке, если нет других импортёров.

```bash
dc exec -T postgres psql -U litora_admin -d litora -c "SELECT status, count(*) FROM calculation_jobs WHERE status IN ('queued','running') GROUP BY status;"
```

После остановки writers (оператор с доступом к защищённому backup-каталогу):

```bash
umask 077
LITORA_BACKUP_DIR=$(mktemp -d /var/backups/litora/snapshot-XXXXXXXX)
dc exec -T postgres pg_dump -U litora_admin -d litora -Fc > "$LITORA_BACKUP_DIR/litora.dump"
dc exec -T postgres psql -U litora_admin -d litora -c "COPY (SELECT bucket, object_key, size_bytes, sha256 FROM calculation_artifacts ORDER BY bucket, object_key) TO STDOUT WITH CSV HEADER" > "$LITORA_BACKUP_DIR/artifacts.csv"
sha256sum "$LITORA_BACKUP_DIR/litora.dump" "$LITORA_BACKUP_DIR/artifacts.csv"
```

Проверить exit code и ненулевой размер, записать checksum и дату. `pg_dump` custom
format восстанавливается через pg_restore; это не копирование живого data directory:
[PostgreSQL SQL dump](https://www.postgresql.org/docs/17/backup-dump.html).

Пример off-host копирования для AWS CLI с **заранее настроенными отдельными профилями
backup**, не с ключом приложения (заменить имена и дату):

```bash
aws --profile litora-backup s3 sync s3://SOURCE_BUCKET s3://BACKUP_BUCKET/snapshots/DATE/objects --only-show-errors
aws --profile litora-backup s3 cp "$LITORA_BACKUP_DIR/litora.dump" s3://BACKUP_BUCKET/snapshots/DATE/litora.dump --only-show-errors
aws --profile litora-backup s3 cp "$LITORA_BACKUP_DIR/artifacts.csv" s3://BACKUP_BUCKET/snapshots/DATE/artifacts.csv --only-show-errors
```

Профиль должен иметь права читать source и писать backup. Для разных провайдеров
server-side sync может не работать: нужен проверенный перенос через backup-хост
с достаточным диском. `sync` копирует текущие версии, не всю историю versioning;
для истории использовать replication/профильный backup. Не добавлять `--delete`.
Поведение команды: [AWS CLI s3 sync](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html).
Полная первая копия большого bucket может быть долгой; затем перейти к непрерывному
backup с согласованными контрольными точками, а не держать многочасовой downtime.

Шифрованно сохранить env/Caddy/Compose, image manifest и checksum вне сервера;
доступ к резервным копиям только оператору. Не отправлять env в незащищённый bucket.
После успешной копии `dc up -d --wait api worker web`, затем `dc up -d caddy` и smoke.
Политика: например 7 ежедневных + 4 еженедельных копии, ежемесячный restore drill;
утвердить с владельцем объём/стоимость/сроки до автоматизации.

## 10. Восстановление на чистом стенде

Никогда не тестировать restore поверх действующей БД. Поднять изолированный сервер,
новый Compose project/volumes и bucket; закрыть внешние записи. Восстановить именно
проверенный образ релиза, DNS пока не переключать.

1. Развернуть PostgreSQL той же major 17, создать роли/пустую БД по разделу 7.
2. Скачать dump и artifacts.csv из backup, проверить сохранённые checksums.
3. Перенести snapshot объектов в новый приватный bucket с теми же object keys.
   Согласовать bucket name: в БД оно хранится в каждой строке; безопаснее сохранить
   имя в изолированном S3 либо обновить реестр на копии БД явной миграцией.
4. При выключенных API/worker восстановить пустую БД:

```bash
dc exec -T postgres pg_restore -U litora_admin -d litora --exit-on-error < /path/to/verified/litora.dump
```

Роль litora_app должна существовать: dump сохраняет владельцев. Не использовать
`--clean` на пользовательской БД. Ошибки restore сначала разбирать на этом стенде.
Секреты приложения/БД задать новые, синхронно в ролях и env.

5. На восстановленной копии отозвать старые сессии
   (`UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL;`), чтобы
   backup не оживил ранее отозванные токены. Если snapshot без drain содержал
   running jobs — проверить их вручную, не запускать повтор автоматически.
6. Проверить число артефактов, наличие всех referenced objects, sizes/SHA-256
   (полная проверка или заранее согласованная выборка, явно записать объём).
7. Запустить API, сверить schema_migrations, затем worker/web/TLS. Проверить вход,
   старый отчёт, новые signed URLs и новый расчёт. Записать длительность/RPO/RTO.
8. Лишь после приёмки переключить DNS/трафик и окончательно отключить старых writers.

Нельзя одновременно запустить старую и восстановленную систему с одной очередью
и разными наборами объектов. Ключи S3 после восстановления могут отличаться, но
реестр должен ссылаться на доступный bucket. Старые URL не переносить в новое UI.

## 11. Обновление, откат и наблюдение

**Обновление:** CI/staging → backup → drain → остановка writers → загрузка проверенных
образов → изменить API_IMAGE/WEB_IMAGE в защищённом env → `dc config --quiet` →
`dc up -d --wait api` (применяет миграции) → сверка схемы → worker/web → Caddy → smoke.
Обычная остановка сохраняет volumes. **`down -v`, `volume prune`, `system prune --volumes`
на сервере запрещены без отдельного решения об удалении данных.**

**Откат:** старые образы применимы только если новая схема обратно совместима.
Миграции автоматически не откатываются. При несовместимом DDL — forward-fix или
восстановление согласованной пары БД+S3 с принятием потери данных после точки backup.
Нельзя просто вернуть старый Git SHA и объявить данные восстановленными.

Операционные проверки:

```bash
dc ps
dc logs --tail=100 api worker
docker stats --no-stream
df -h /var/lib/docker /var/backups/litora
```

Не публиковать сырой вывод без редактирования чувствительных данных. Настроить
внешнее наблюдение с разрешённого IP: HTTPS, health, срок TLS, CPU/RAM/disk, OOM/restarts,
oldest queued, stale heartbeat, доля failed, S3 ошибки/ёмкость, возраст последнего
успешного backup. Встроенного dashboard Prometheus/Grafana и worker-health пока нет.
Зелёный health не гарантирует живой worker и корректную математику.

Логи Docker ограничены 3×10 МБ на контейнер в примере. Временный job-каталог worker
в writable layer очищается приложением, но после аварии возможны остатки; квота
на временный диск пока не реализована. Не удалять каталог активного job.
S3 lifecycle не должен опережать политику БД; cleanup orphan objects требует сверки
реестра и отдельного согласования, не `sync --delete`.

Ротация пароля БД: изменить роль PostgreSQL и env в согласованное окно, перезапустить
API/worker и проверить. Одно редактирование POSTGRES_PASSWORD не меняет роль в volume.
Ротация S3: новый scoped key → env → restart/проверка → отзыв старого ключа; старые
signed URLs могут перестать работать. Отзыв/логика token sessions — не JWT secret.

## 12. Условия открытого публичного запуска

Закрытый серверный пилот не снимает эти задачи:

- [ ] Email verification, восстановление пароля и политика аккаунта/персональных данных.
- [ ] Rate limiting на ingress и лимиты расчётов; доверенная цепочка и per-client
  auth-лимит реализованы в примере, но требуют staging-проверки.
- [ ] Квоты на место/вычисления, retention, cleanup частичных объектов и временных файлов.
- [ ] Нагрузочные тесты, crash/restart/cancel тесты, подтверждённый restore drill.
- [ ] Мониторинг worker/очереди, дежурный оператор, алерты backup/SSL/storage.
- [ ] Pin base-image digests, проверка зависимостей, отдельные migration/runtime DB роли.
- [ ] Решение по доступу Swagger: команда/закрытый ingress либо осознанно публичная схема;
  сама документация не отменяет auth endpoint.
- [ ] Security review загружаемых данных прежде, чем добавить пользовательский upload.

До этого сохранять allowlist/VPN и небольшую доверенную аудиторию. Для HA следующий
этап — вынести БД в managed/реплицируемый PostgreSQL, обеспечить durable S3, развести
worker и API по хостам, проверить сетевую изоляцию и согласованное восстановление.
Не добавлять Redis/Kubernetes вместо решения конкретных измеренных проблем.

Дополнительное основание по разделению dev/prod конфигурации:
[Docker Compose production](https://docs.docker.com/compose/how-tos/production/).
