# 0026 — CI только для main и переносимый checkout

- Статус: implementing; изменение локально, GitHub Actions после push не проверен.
- Дата: 04.10.2026; исходная ветка: `development`.
- Область: `.github/workflows/ci.yml`, `scripts/check-workspace.mjs`, Git-пути.

## Проблема и границы

Текущий workflow запускался на каждом push и pull request, дважды выполнял
checkout и поднимал полный Docker/Chromium-стенд. На Linux runner checkout
ветки `development` падал до тестов: компонент имени статьи в
`notes/obsidian/articles/` занимал 340 байт при лимите файловой системы
255 байт. Это ошибка имени файла, а не LFS, Git-истории или содержимого статьи.

## Требования и приёмка

| ID | Требование | Проверка |
| --- | --- | --- |
| CI-026-1 | Workflow запускается только на `push` в `main` | Проверка YAML trigger |
| CI-026-2 | Один job с `pnpm verify` и отдельной тестовой PostgreSQL | Проверка workflow и локальный `pnpm verify` |
| CI-026-3 | В текущем дереве нет компонента пути более 255 UTF-8 байт | `pnpm check:workspace` |
| CI-026-4 | Статья сохранена, изменено только её имя | Git rename 100% / SHA-256 содержимого |

## Контракт и последствия

HTTP, БД, S3, Go и UI-контракты не меняются. Из автоматического CI убраны
Playwright Chromium и сквозной Docker-job; их сценарии остаются в репозитории
для локальной/staging-проверки. `pnpm verify` по-прежнему включает типы,
линтер, тесты web/API/Go, сборки и контроль bundle. PostgreSQL service нужен
для API DB suites. LFS checkout сохранён, чтобы CI не проверял только pointer.

Push в `development` и PR больше не запускают этот workflow. Первый настоящий
GitHub Actions прогон возможен только после внесения переименования в `main`;
локальный YAML/сборка не заменяют runner. До staging/release дополнительно
вручную выполняются браузерный и сквозной worker/S3-прогоны.

## Риски и альтернативы

Альтернатива sparse-checkout исключала бы `notes/`, но оставила бы репозиторий
непереносимым для полного Linux checkout. Переименование не переписывает Git
историю; старые коммиты по-прежнему содержат длинный путь, поэтому попытка
checkout старого SHA на Linux может падать. Будущий `main` с коротким именем
разворачивается; историю не переписываем.

Отказ от PR-gate ускоряет разработку, но ошибка может попасть в `main` до
автоматической проверки. Перед merge запускать `pnpm verify` локально или на
тестовом стенде. При росте команды вернуть PR CI отдельным решением.

## Проверки и выпуск

- [x] Создана ветка `fix/ci-main-only-checkout` от `development`.
- [x] Переименован файл без изменения содержимого.
- [x] Workflow сокращён до одного job и trigger `push: main`.
- [x] Локально проверены YAML, длина путей, `git diff --check` и
  `pnpm verify` (04.10.2026; API DB suites локально пропущены без
  `TEST_DATABASE_URL`, в workflow для них остаётся PostgreSQL service).
- [ ] Подтверждён первый успешный GitHub Actions после push в `main`.

Коммит, push и merge выполняет владелец проекта.
