# Aeza → GitHub Actions → GHCR → Docker Compose

Дата сверки тарифов: 17.10.2026. Инструкция готовит **закрытый стенд** Litora.
Ни VPS, ни домен, ни AWS, ни GitHub Secrets этим изменением не созданы.
Общая эксплуатация, S3, backup/restore и условия публичного запуска описаны в
[основном runbook](deployment.md). Новая технология и платный сервис не требуются:
GitHub Actions уже используется, AWS S3 выбран в ADR-008, Docker Compose в ADR-007.

## Выбор сервера

Планирование ниже основано на лимитах Compose, а не на нагрузочном тесте. Цены
проверять в панели при покупке: [каталог Aeza](https://aeza.net/virtual-servers)
показывает тарифы для выбранной на странице локации, наличие и стоимость другой
локации могут отличаться.

| Назначение | Ориентир Aeza на странице каталога | Ресурсы | Оценка |
| --- | --- | --- | --- |
| Стенд стандартных jobs | WAWs-4, €47.45/мес | 8 vCPU, 16 ГБ, 240 ГБ NVMe | API, PostgreSQL, web, Caddy и один standard worker; heavy выключен |
| Полный пилот с heavy | WAWs-5, €94.89/мес | 16 vCPU, 32 ГБ, 480 ГБ NVMe | Рекомендуемый старт для всех типов jobs и одного heavy worker |

Цены — опубликованные значения каталога на дату сверки, **не счёт и не гарантия**.
Для AWS S3 и домена будет отдельная плата; хранение S3, запросы и исходящий
трафик оценить по [калькулятору AWS S3](https://aws.amazon.com/s3/pricing/)
из ожидаемых jobs и срока хранения. По [текущим правилам GHCR](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
хранение и трафик container images бесплатны, но это может измениться;
GitHub Actions/LFS имеют отдельные лимиты. Выбрать Ubuntu Server 24.04 LTS,
`linux/amd64`, одну локацию в ЕС по доступности/задержке до AWS `eu-central-1`
и пользователей. Если 480 ГБ недостаточно для измеренного temp/output и двух
поколений образов, нужен больший диск или отдельный worker. У shared vCPU время
CPU делится с соседями: перед длительными тяжёлыми заданиями измерить steal,
RSS, пиковый temp, wall time и стоимость. Внешний S3 хранит артефакты; локальный
NVMe содержит PostgreSQL, WAL, образы, временные расчёты и backup до выгрузки.
Оставлять не менее 25% свободного места. GPU не нужен.

Стенд и production лучше держать на разных VPS и с разными PostgreSQL volumes,
S3 buckets, ключами и доменами. Один VPS является одной точкой отказа. Для
публичной регистрации выполнить [условия открытия](deployment.md#12-условия-открытого-публичного-запуска).

## Что делает pipeline

```text
push в main → pnpm verify → GitHub Actions buildx (amd64, Git LFS)
             → GHCR: api/web/heavy :sha-<commit SHA>-<run ID>-<attempt>
             → digest sha256 для каждого образа
             → staging по SSH: Docker pull → Compose up → smoke оператора
```

Публикация идёт только после успешного `checks` в [.github/workflows/ci.yml](../.github/workflows/ci.yml).
`GITHUB_TOKEN` получает `packages: write` только в job публикации. Тег включает
SHA коммита и номер запуска/попытки, поэтому повторный запуск не перепишет тег.
Стенд получает точные `image@sha256:...`. Не использовать `latest`.
В GitHub Actions Summary после publish видны три digest. `worker` использует
API-образ; `worker-heavy` — отдельный образ с Gmsh. Production развёртывается
вручную тем же [скриптом](../scripts/deploy-prebuilt.sh) после staging-приёмки и
backup. На сервере не нужны Git, Git LFS, Node, pnpm, Go или компилятор.

## 1. Подготовить DNS, AWS и доступ

1. Создать отдельные DNS A-записи для staging и production. AAAA добавлять только
   после проверки IPv6. Выбрать один домен стенда в `LITORA_DOMAIN`; Caddy выдаст TLS.
2. Создать **отдельный приватный** AWS S3 bucket для стенда в `eu-central-1`:
   Block Public Access, versioning, server-side encryption. Создать ограниченный
   сервисный ключ по [разделу S3](deployment.md#5-подготовка-s3). Для production —
   отдельный bucket и ключ. Не делать bucket публичным для устранения 403.
3. Подготовить два SSH-ключа: персональный оператора и отдельный ключ GitHub Actions
   для staging. Приватный ключ Actions поместить только в GitHub Environment `staging`.
   Host key VPS сверить с отпечатком из консоли/проверенного канала, затем сохранить
   точную строку `known_hosts` в GitHub Secret. Не доверять слепому `ssh-keyscan`.
4. Firewall Aeza: 80/443 всем для HTTPS и ACME; PostgreSQL/API/nginx наружу не
   публикуются. Автоматический SSH с GitHub hosted runner требует доступного извне
   SSH-порта: разрешить TCP 22, вход только по ключу, запретить root/password login
   после проверки второго сеанса. Это изменение сетевого доступа согласовать с
   владельцем стенда. Если SSH нельзя открыть, использовать ручной pull/delivery
   по digest либо отдельно спроектировать приватный runner/VPN; pipeline staging
   оставить выключенным. Проверить порт-сканированием с внешней сети.

## 2. Подготовить Ubuntu VPS

Подключиться под созданным оператором с `sudo`; установить Docker Engine/Compose
из [официального репозитория Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
Проверить, что это именно 24.04 и `x86_64` (`lsb_release -rs`, `uname -m`).

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker version
docker compose version
```

Пользователь поставки должен иметь доступ к Docker daemon и `/etc/litora`.
Членство в группе `docker` эквивалентно root: выдавать только доверенному
оператору, отдельно записать это решение. Подготовить каталоги с правами:

```bash
sudo usermod -aG docker "$USER"
# Переподключиться по SSH и проверить `docker ps` без sudo.
sudo install -d -m 0700 -o "$USER" -g "$USER" /etc/litora
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/litora/staging
sudo install -d -m 0700 -o "$USER" -g "$USER" /var/backups/litora
```

На production повторить для `/opt/litora/production` и отдельного VPS.
Синхронизация часов обязательна для AWS signatures и TLS. Настроить security
updates, SSH и внешнее резервное хранение до доступа пользователей.

## 3. Заполнить конфигурацию стенда

Из текущего checkout **на машине оператора** передать три несекретных файла:

```bash
scp sdd/examples/compose.production.yaml sdd/examples/Caddyfile \
  scripts/deploy-prebuilt.sh OPERATOR@STAGING_HOST:/opt/litora/staging/
```

На VPS скопировать [шаблон env](examples/.env.example) в
`/etc/litora/staging.env` с правами 0600. Заполнить домен/email/allowlist,
случайные **разные** `POSTGRES_ADMIN_PASSWORD` и `POSTGRES_PASSWORD`, endpoint,
bucket, S3 access/secret. Пароли сделать `openssl rand -hex 32`; сохранить в
password manager и не выводить в shell trace/log. `LITO_HEAVY_ENABLED` в base
env может оставаться `false`: release override задаёт режим стенда.
`API_IMAGE`, `WEB_IMAGE`, `HEAVY_IMAGE` из шаблона перекрываются release env.
Для полного пилота выбирается `true`; для 16-ГБ стенда `false`.

Для private GHCR образов создать отдельный **classic PAT** с `read:packages`
и доступом к этим пакетам. На VPS от имени пользователя поставки:

```bash
read -rsp 'GHCR token: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u GITHUB_USER --password-stdin
unset GHCR_TOKEN
chmod 0600 ~/.docker/config.json
```

Docker хранит этот логин на диске пользователя; защитить домашний каталог и
запланировать ротацию PAT. Для public GHCR package анонимный pull возможен,
но это отдельное решение о публичности образов. AWS/S3 credentials в GHCR не
передаются: они находятся только в `/etc/litora/staging.env`.

## 4. Первый запуск и включение CD

1. Оставить GitHub Variable `STAGING_ENABLED` отсутствующей или `false`. После
   commit/push в `main` дождаться зелёного CI и publish. В Actions Summary взять
   три `image@sha256:...` **одного** запуска.
2. На VPS создать `/etc/litora/staging.release.env` (0600) с четырьмя строками:

   ```dotenv
   API_IMAGE=ghcr.io/OWNER/REPO-api@sha256:DIGEST_FROM_ACTIONS
   WEB_IMAGE=ghcr.io/OWNER/REPO-web@sha256:DIGEST_FROM_ACTIONS
   HEAVY_IMAGE=ghcr.io/OWNER/REPO-heavy@sha256:DIGEST_FROM_ACTIONS
   LITO_HEAVY_ENABLED=true
   ```

3. В shell VPS определить Compose-функцию (значения не печатать):

   ```bash
   dc() {
     docker compose --project-name litora-staging --profile heavy \
       --env-file /etc/litora/staging.env \
       --env-file /etc/litora/staging.release.env \
       -f /opt/litora/staging/compose.production.yaml "$@"
   }
   dc config --quiet
   dc pull postgres api web caddy worker-heavy
   dc up -d --wait postgres
   dc exec postgres psql -U litora_admin -d postgres
   ```

4. В интерактивном `psql` только на **новой** БД выполнить:

   ```sql
   CREATE ROLE litora_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
   \password litora_app
   CREATE DATABASE litora OWNER litora_app;
   \q
   ```

   В password prompt ввести именно `POSTGRES_PASSWORD`. Не выполнять bootstrap
   повторно на существующем volume. Затем `dc up -d --wait api`: API применит
   нумерованные миграции. Проверить `schema_migrations` по основному runbook.
5. Запустить поставку уже опубликованных digest:

   ```bash
   bash /opt/litora/staging/deploy-prebuilt.sh staging \
     'ghcr.io/OWNER/REPO-api@sha256:API_DIGEST' \
     'ghcr.io/OWNER/REPO-web@sha256:WEB_DIGEST' \
     'ghcr.io/OWNER/REPO-heavy@sha256:HEAVY_DIGEST' true
   ```

   Скрипт проверяет формат digest, конфигурацию, скачивает образы, отказывает
   при активной очереди, останавливает ingress и workers, запускает API раньше
   workers, проверяет Caddyfile. Сбой после миграции требует расследования;
   автоматического отката БД нет. `docker compose config` запускать только с
   `--quiet`, иначе напечатает секреты.
6. В репозитории GitHub создать Environment `staging`; Secrets
   `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS`; Variables `STAGING_HOST`,
   `STAGING_USER`, `STAGING_PORT=22`, `STAGING_HEAVY_ENABLED=true` или `false`.
   После ручной приёмки установить **repository variable** `STAGING_ENABLED=true`.
   Следующий успешный
   push в `main` автоматически доставит именно digest собранных образов.

Из отдельного IP проверить HTTPS allowlist, `/api/health`, вход и один реальный
standard job; при heavy=true — ещё один ограниченный контрольный heavy job и
загрузку/скачивание из **приватного** S3. Проверить `docker compose ps`, RAM,
`df`, TLS, внешнюю недоступность 5432/3000/80 web. На staging выполнить
`pnpm test:integration` только из тестовой среды с отдельными БД/bucket; на
production он создаёт реальные данные и запрещён без отдельной приёмки.

## 5. Production, backup и откат

Production имеет отдельные `/etc/litora/production.env`,
`production.release.env`, `/opt/litora/production`, volume, bucket и домен.
Выпустить и проверить тот же SHA на staging. Перед production-поставкой
выполнить [backup и restore drill](deployment.md#9-backup-бд-и-объекты-вместе),
проверить совместимость SQL-миграций со старым образом. Затем вручную вызвать
скрипт с `production` и тремя проверенными digest. Обновления могут иметь
короткий downtime. Старый release env и digest сохранить в журнале выпуска.
Возврат старого образа возможен только при совместимой схеме; для несовместимой
миграции нужен forward-fix или восстановление согласованной пары БД и S3.

Настроить ежедневный off-host backup PostgreSQL и объектов, периодический
restore drill, наблюдение за диском, очередью/heartbeat, OOM и TLS. `health=200`
не доказывает работу worker. Не запускать `down -v`, `volume prune` и массовую
очистку образов: они могут уничтожить данные или возможность отката.

## Открытые проверки до реального запуска

- Домен, Aeza локация/тариф и наличие `linux/amd64`, стоимость исходящего трафика.
- Доступность AWS S3 из выбранной локации, применимость требований к данным.
- Настоящая сборка GitHub Actions с LFS, pull private GHCR, корректность digest.
- Миграция на чистой БД, сохранение данных при повторном rollout, staging smoke.
- Замер heavy job: Gmsh, 12-ГБ лимит, размер temp, timeout 4 часа и restore.
- Проверенный backup и восстановление на отдельном хосте до публичного доступа.
