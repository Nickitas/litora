#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 5 ]]; then
  echo 'Использование: deploy-prebuilt.sh staging|production API_IMAGE WEB_IMAGE HEAVY_IMAGE true|false' >&2
  exit 2
fi

environment_name=$1
api_image=$2
web_image=$3
heavy_image=$4
heavy_enabled=$5

[[ "$environment_name" =~ ^(staging|production)$ ]] || { echo 'Неизвестное окружение' >&2; exit 2; }
[[ "$heavy_enabled" =~ ^(true|false)$ ]] || { echo 'Некорректный профиль worker' >&2; exit 2; }
for image in "$api_image" "$web_image" "$heavy_image"; do
  [[ "$image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] || {
    echo 'Ожидался образ GHCR с неизменяемым digest' >&2
    exit 2
  }
done

deploy_dir="/opt/litora/$environment_name"
base_env="/etc/litora/$environment_name.env"
release_env="/etc/litora/$environment_name.release.env"
[[ -f "$base_env" && -f "$deploy_dir/compose.production.yaml" && -f "$deploy_dir/Caddyfile" ]] || {
  echo 'Сначала подготовьте каталог стенда, Compose, Caddyfile и защищённый env' >&2
  exit 2
}

candidate=$(mktemp "/etc/litora/.$environment_name.release.XXXXXXXX")
trap 'rm -f "$candidate"' EXIT
printf 'API_IMAGE=%s\nWEB_IMAGE=%s\nHEAVY_IMAGE=%s\nLITO_HEAVY_ENABLED=%s\n' \
  "$api_image" "$web_image" "$heavy_image" "$heavy_enabled" > "$candidate"

dc_candidate() {
  docker compose --project-name "litora-$environment_name" --profile heavy \
    --env-file "$base_env" --env-file "$candidate" \
    -f "$deploy_dir/compose.production.yaml" "$@"
}
dc() {
  docker compose --project-name "litora-$environment_name" --profile heavy \
    --env-file "$base_env" --env-file "$release_env" \
    -f "$deploy_dir/compose.production.yaml" "$@"
}

dc_candidate config --quiet
dc_candidate pull postgres api web caddy worker-heavy

# Начальная БД/роль создаются оператором до включения автоматической поставки.
[[ -f "$release_env" ]] || { echo 'Сначала выполните bootstrap БД по runbook' >&2; exit 2; }

dc stop caddy
if ! active=$(dc exec -T postgres psql -U litora_admin -d litora -Atqc \
  "SELECT count(*) FROM calculation_jobs WHERE status IN ('queued','running')"); then
  dc up -d caddy
  echo 'Не удалось проверить очередь; поставка остановлена' >&2
  exit 1
fi
[[ "$active" =~ ^[0-9]+$ ]] || { echo 'Не удалось проверить очередь' >&2; exit 1; }
if (( active > 0 )); then
  dc up -d caddy
  echo "Поставка отложена: в очереди или работе $active заданий" >&2
  exit 1
fi

dc stop worker worker-heavy
mv "$candidate" "$release_env"
dc up -d --wait postgres
dc up -d --wait api
if [[ "$heavy_enabled" == true ]]; then
  dc up -d --wait worker worker-heavy web
else
  dc up -d --wait worker web
fi
dc run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
dc up -d --wait caddy
echo "Образы развёрнуты на $environment_name; проверьте контрольный расчёт и загрузку S3"
