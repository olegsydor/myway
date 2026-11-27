# MyWay · Stage 24 · Checkpoint 2

[Звіт про реалізацію та перевірки](stage-24-checkpoint-2-report.md)

**Ручне приймання Checkpoint 2 завершено.** Власник підтвердив на локальному
production smoke виправлення довідників і порядку, а також Restore реального
development-експорту. Live deployment і gate перед публічним доступом мають
окреме погодження.

## Локальне приймання

Працюйте з кореня checkout. Для повного smoke потрібні локальні Docker Engine/Compose, Python 3.10+, OpenSSL і curl. Тест створює окремий Compose-проєкт, публікує лише Caddy на loopback (18080/TCP, 18443/TCP) і використовує синтетичні акаунти, секрети та SMTP sink. Підмережа `172.30.24.0/24` має бути вільна. Одночасно запускайте один production-подібний стек на Docker host.

```sh
git rev-parse HEAD
git status --short
git diff --check
deploy/smoke/run.sh
(cd poc/graph-visualization && npm ci && npm test && npm run build && npm run lint)
```

Для frontend використовуйте Node 24. Smoke перевіряє сертифікат Caddy через локальний CA, експортований із контейнера, а API перевіряє окремий сертифікат SMTP sink. Запуск закриває реєстрацію після створення двох тестових акаунтів. Після тесту проєкт зупиняється. Шлях до синтетичного backup і тестових файлів друкується на початку. Іменовані томи тестового проєкту залишаються для інспекції. Для повторного запуску створюється новий проєкт і чиста PostgreSQL.

Для backend pytest запускайте звичний dev-процес із окремою PostgreSQL 17 і базою `myway_test`. Нижче наведено той самий тестовий запуск, який використовує новий образ із режимом development і окремою мережею. Замініть `TEST_PROJECT` на унікальне локальне ім'я, а `SMOKE_RELEASE` на тег, надрукований smoke-запуском (ім'я проєкту).

```sh
docker network create --internal "$TEST_PROJECT"
docker run -d --rm --network "$TEST_PROJECT" --name "$TEST_PROJECT-db" \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=cp2-regression \
  -e POSTGRES_DB=myway_test postgres:17@sha256:97fb53376be3e4fb1a8a61421daa69dcc3bf2fa39bda3259f5245f9a455af1a9
docker exec "$TEST_PROJECT-db" sh -ec 'until pg_isready -h 127.0.0.1; do sleep 1; done'
docker run --rm --network "$TEST_PROJECT" -e APP_ENV=development \
  -e POSTGRES_DB=myway_test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=cp2-regression \
  -e POSTGRES_HOST="$TEST_PROJECT-db" -v "$PWD/tests:/app/tests:ro" \
  -v "$PWD/pytest.ini:/app/pytest.ini:ro" "myway/backend:$SMOKE_RELEASE" \
  python -m pytest -q -o cache_dir=/tmp/pytest-cache
docker stop "$TEST_PROJECT-db"
docker network rm "$TEST_PROJECT"
```

Для ручної перевірки в браузері повторно підніміть зупинений smoke-проєкт на loopback. Візьміть `SMOKE_RELEASE` і `SMOKE_DIR` з рядків виводу smoke. У тимчасовому профілі браузера довірте CA з `$SMOKE_DIR/caddy-ca.crt`. Відкрийте `https://localhost:18443/` і перевірте login та екрани verify/reset за URL із тестових листів у `$SMOKE_DIR/mail`. Для перевірки відображення екрану достатньо відкрити URL, навіть якщо тестовий токен вже використано.

```sh
smoke() {
  docker compose --project-name "$SMOKE_RELEASE" --file docker-compose.prod.yml \
    --file deploy/smoke/compose.yml --env-file "$SMOKE_DIR/smoke.env" "$@"
}
smoke up -d --wait --no-build db smtp api caddy
curl --fail --cacert "$SMOKE_DIR/caddy-ca.crt" https://localhost:18443/api/health
# Після браузерної перевірки
smoke down
```

## Конфігурація релізу

На VPS після окремого погодження використовуйте `/opt/myway/current` як шлях до активного checkout та `/etc/myway/production.env` як файл конфігурації, власник root, права 0600. Заповніть його за шаблоном `.env.production.example`. Одинарні лапки в Compose env-файлі зберігають пробіли й літеральні спецсимволи. Змінні shell мають пріоритет над env-файлом, тому команди запускаються зі службового середовища без однойменних експортів. Перевіряйте конфігурацію через `config --quiet`. Значення секретів доступні адміністраторам Docker через конфігурацію запущених контейнерів.

Caddy термінує HTTPS і обслуговує статичну збірку React. Основний origin — `https://mywaygraph.com`. Задайте `CADDY_WWW_SITE=www.mywaygraph.com` після готовності DNS для www, щоб Caddy отримав сертифікат і перенаправляв шлях та query на основний origin. Поточне значення шаблону задає зарезервоване HTTP-ім'я з доменом `.invalid`. Caddy публікує TCP 80/443. API і PostgreSQL доступні через Docker-мережі, а PostgreSQL підключений лише до внутрішньої мережі БД. API виходить до Brevo через proxy-мережу. Uvicorn приймає forwarded-заголовки від `172.30.24.2`. Caddy формує їх із фактичного TCP peer, схеми та Host. Статична адреса зарезервована поза діапазоном динамічної видачі `172.30.24.128/25`. Proxy-мережа підтримує IPv4 та IPv6 для вхідних з’єднань, а від Caddy до Uvicorn використовується IPv4. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/) · [Caddy network addresses](https://caddyserver.com/docs/conventions#network-addresses)

Caddy, API й PostgreSQL мають початкові ліміти 256 MiB, 768 MiB і 1 GiB відповідно. API працює одним worker з пулом 5 і максимум 2 додатковими з'єднаннями. Значення обрано для CPX22 і слід уточнити за фактичними метриками. API readiness перевіряє наявність застосованої ревізії Alembic, а deployment gate перевіряє конкретний head релізу.

| Образ | Зафіксований тег | Digest маніфесту |
| --- | --- | --- |
| Backend base | `python:3.13.18-slim-bookworm` | `sha256:f0fa218d5b06f9b9235024fa061cde2cb141f726de52134471053d2d9b5324a3` |
| Frontend build | `node:24.19.0-bookworm-slim` | `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df` |
| Edge runtime | `caddy:2.11.9-alpine` | `sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0` |
| PostgreSQL | `postgres:17` | `sha256:97fb53376be3e4fb1a8a61421daa69dcc3bf2fa39bda3259f5245f9a455af1a9` |

Сервіси націлені на `linux/amd64`. [Python releases](https://www.python.org/downloads/) · [Caddy 2.11.9](https://github.com/caddyserver/caddy/releases/tag/v2.11.9)

Зберігайте immutable release tag і ID зібраних образів. Використовуйте унікальний тег на реліз, наприклад прийнятий SHA. Тримайте локальну копію попередньої пари образів і її Compose/Caddy-конфігурації.

`myway_admin` — bootstrap superuser та ідентичність для backup через Unix socket усередині контейнера БД. `myway_migrate` володіє схемою `public` та створеними міграціями об'єктами. `myway_runtime` має CONNECT, USAGE схеми, SELECT/INSERT/UPDATE/DELETE таблиць і USAGE/SELECT послідовностей. Гранти автоматично поширюються на нові об'єкти власника схеми. Обидві прикладні ролі без superuser, CREATE ROLE або CREATE DB. Три паролі окремі. Bootstrap виконується лише на чистому volume. Якщо ініціалізація перервана, зупиніть запуск і перевірте ролі та схему перед відновленням. Ротація на існуючому volume потребує узгодженого ALTER ROLE та оновлення захищеного файлу.

## Порядок deployment після погодження

Виконуйте під root у /opt/myway/current. Звірте Git SHA з прийнятим релізом на основі `f7c54eb95d29c8e7928a64a3783e27f6bab7cdc0`, перевірте чистий checkout і запишіть попередній тег/ID. На етапі першої перевірки обмежте доступ до Caddy через loopback bind і використовуйте окремі налаштування TLS для локального приймання. Публічне відкриття прив'язане до gate нижче.

```sh
set -eu
test "$(stat -c '%a:%u' /etc/myway/production.env)" = 600:0
exec 9>/run/lock/myway-release.lock
flock -n 9
prod() {
  docker compose --project-name myway-prod --file docker-compose.prod.yml \
    --env-file /etc/myway/production.env "$@"
}
prod config --quiet
prod build api caddy
prod config --images | while IFS= read -r image; do
  case "$image" in myway/*) docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$image";; esac
done
prod run --rm --no-deps api python -c 'from app.core.config import get_settings; get_settings()'
```

Якщо вже є дані, почніть заплановане вікно робіт. Зупиніть `caddy` і `api` під тим самим lock, дочекайтесь PostgreSQL readiness і зробіть backup **до міграції**. Якщо backup або drill не пройшов, завершіть release-процедуру. Зберігайте архів у приватному каталозі за межами checkout.

```sh
prod stop caddy api
prod up -d --wait db
python3 scripts/backup_restore.py backup /var/backups/myway --production-env /etc/myway/production.env
```

У тій самій оболонці задайте `ARCHIVE` як шлях, надрукований командою backup.

```sh
python3 scripts/backup_restore.py restore-test "${ARCHIVE:?Set the verified backup directory}" \
  --postgres-image "$(prod config --images db)"
```

Для нової, порожньої БД почніть із `prod up -d --wait db`. Виконайте one-shot міграцію один раз у цьому release-вікні. Звичайний старт API не запускає Alembic. Lock також спільний із systemd maintenance. Перевірте вихід `alembic current` і продовжуйте лише після підтвердження `a24a01e4b901 (head)` для цього релізу.

```sh
prod run --rm migrate
revision=$(prod run --rm migrate alembic current)
printf '%s\n' "$revision" | grep -Fx 'a24a01e4b901 (head)'
prod up -d --wait --no-build api caddy
prod ps
curl --fail --silent --show-error https://mywaygraph.com/api/health
```

Останній curl виконуйте у погодженому середовищі з готовим TLS. Після smoke підтвердьте SPA, API JSON 404 і закриту реєстрацію. Звільніть lock, завершивши оболонку. При невдалому старті спочатку перегляньте статус і локальні журнали `prod logs --tail=100 db api caddy`.

## Maintenance і rollback

Unit і timer у `deploy/systemd` призначені для встановлення після окремого погодження. Розклад щодня о 03:30 UTC, `Persistent=true` виконує пропущений запуск. Один service і `flock -n` серіалізують maintenance з релізом. Статус і помилки надходять до journal (`journalctl -u myway-maintenance.service`). Cleanup і purge мають окремі транзакції, помилка першої команди зупиняє другу. До активації перевірте політику retention та готовність резервного відновлення, потім звірте units і розклад на цільовому хості.

```sh
systemd-analyze verify deploy/systemd/myway-maintenance.service deploy/systemd/myway-maintenance.timer
systemd-analyze calendar '*-*-* 03:30:00 UTC'
```

Поверніть попередній тег, образи та release-конфігурацію лише після перевірки сумісності старого коду з чинною схемою. Під тим самим lock зупиніть edge/API, застосуйте попередню конфігурацію і запустіть `prod up -d --wait --no-build api caddy`. Якщо схеми несумісні, погодьте downtime і втрату змін після backup. Спочатку відтворіть і перевірте архів у disposable PostgreSQL, потім відновлюйте в новий ізольований production volume і перемикайтеся лише після перевірки, зберігши старий volume. Для перенесення між production volumes спершу створіть ролі та гранти, імпортуйте архів із `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --role=myway_migrate` під контролем адміністратора та звірте head, дані й runtime-права. Старі секрети та Caddy volumes зберігаються. Автоматичний downgrade або вилучення volumes не входять до процедури rollback.

## Gate перед публічним доступом

Потрібні незалежна перевірка SSH fingerprint, firewall і зовнішніх портів IPv4/IPv6, погодження website DNS/TLS, тест відновлення provider backup та підготовлений off-host процес, app-level доставка через Brevo з перевіркою SMTP allowlist і проходженням SPF/DKIM/DMARC, перевірка метрик і сценарію рестарту на CPX22. Зберігайте `REGISTRATION_ENABLED=false` під час prelaunch і погодьте активацію реєстрації окремо. Автоматизацію off-host backup відкладено до CP5.

## Повторне ручне приймання довідників

Для чистої бази запустіть `deploy/smoke/run.sh` після звільнення локальних портів і підмережі, зазначених вище. Для перевірки upgrade збережіть наявний локальний smoke volume проєкту `myway-cp2-igfkcy`. Використовуйте початковий **синтетичний** env-файл цього проєкту (`SMOKE_ENV`) із loopback bind і `REGISTRATION_ENABLED=false`. Виконуйте команди з кореня поточного checkout.

```sh
set -eu
: "${SMOKE_ENV:?Set the original local smoke.env path}"
export MYWAY_RELEASE=cp2-manual-dictionaries-a24a01e4b901
export REGISTRATION_ENABLED=false
smoke() {
  docker compose --project-name myway-cp2-igfkcy --file docker-compose.prod.yml \
    --file deploy/smoke/compose.yml --env-file "$SMOKE_ENV" "$@"
}
smoke config --quiet
smoke build api caddy
smoke stop caddy api
smoke up -d --wait db smtp
python3 scripts/backup_restore.py backup /tmp/myway-cp2-manual-backups \
  --production-env "$SMOKE_ENV" --project-name myway-cp2-igfkcy
```

У тій самій оболонці задайте `ARCHIVE` як шлях до приватного каталогу, надрукований командою backup.

```sh
python3 scripts/backup_restore.py restore-test "$ARCHIVE" --postgres-image "$(smoke config --images db)"
smoke run --rm migrate
smoke run --rm migrate alembic current
smoke up -d --wait --no-build api caddy
```

Переконайтеся, що Alembic показує `a24a01e4b901 (head)`. Через локальний HTTPS перевірте `/api/node-types` і `/api/edge-types`, а в редакторі знайдіть **Person** та **Knows**. Створіть два Person, зв'яжіть їх через Knows і експортуйте граф. Імпортуйте валідний синтетичний експорт з незалежного development-середовища в порожній smoke-акаунт. В іншому smoke-акаунті перевірте Preview і підтверджений Restore. Звірте типи, напрямок зв'язку, позиції та анотації після повторного відкриття layout.

Для негативної перевірки змініть один type у **копії** синтетичного JSON на невідомий код. Зробіть експорт цільового workspace перед спробою Restore і після неї. Очікуються повідомлення про невідомий тип та ідентичний вміст workspace, крім часу експорту. Для CP2-03 перевірте прямий вибір тексту на полотні в режимі Select. Dropdown **Select shape** містить прямокутники й еліпси, як у baseline.

## Оновлення smoke після виправлення порядку довідників

Порядок задається кодами типів у backend і застосовується до наявної БД на `a24a01e4b901`. Для smoke-проєкту, який уже пройшов попереднє приймання, оновіть backend і frontend образи. Переконайтеся, що `SMOKE_ENV` вказує на той самий локальний синтетичний env-файл із loopback bind. Якщо ревізія старіша, спочатку виконайте [upgrade довідників](#повторне-ручне-приймання-довідників).

```sh
set -eu
: "${SMOKE_ENV:?Set the original local smoke.env path}"
export MYWAY_RELEASE=cp2-manual-dictionary-order
export REGISTRATION_ENABLED=false
smoke() {
  docker compose --project-name myway-cp2-igfkcy --file docker-compose.prod.yml \
    --file deploy/smoke/compose.yml --env-file "$SMOKE_ENV" "$@"
}
smoke config --quiet
smoke build api caddy
smoke run --rm --no-deps migrate alembic current
# Continue after confirming a24a01e4b901 (head).
smoke up -d --wait --no-build --no-deps api
smoke up -d --wait --no-build --no-deps caddy
```

Перезавантажте вкладку smoke, щоб завантажити новий frontend. Порядок у Create/Edit і в `/api/node-types` має бути **Person → Place → Organization → Skill → Event → Project → Hobby → Story**. Порядок у Create/Edit і в `/api/edge-types` має бути **Knows → Works at → Lives in → Has skill → Participates in → Works on → Located in → Leads to → Family → Pushed → Shared**. У фільтрах графа після **All types** має зберігатися відносний порядок тієї частини довідника, яка використана в поточному графі.
