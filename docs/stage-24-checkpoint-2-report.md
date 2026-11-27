# MyWay · Stage 24 · Checkpoint 2 · Звіт

27 листопада 2026 року. Реалізація в робочому дереві для приймання. Прочитано звіт Checkpoint 1 і погоджене ТЗ Checkpoint 2. `master`, локальне посилання `origin/master` і `HEAD` відповідають baseline `f7c54eb95d29c8e7928a64a3783e27f6bab7cdc0`. На початку tracked-змін не було. Початкові чотири untracked-файли збережено. Після завантаження образу для перевірок локальний development тег `postgres:17` повернуто на початковий image ID `1edc8e87e531`.

## Реалізація

- Окремі production Compose та образи. Backend працює від імені користувача `myway` (10001), з одним Uvicorn worker. Node 24 збирає React через `npm ci` і `npm run build`, Caddy обслуговує `dist`. Початкові development Compose, Dockerfile і frontend-код відповідають baseline.
- Caddy публікує лише TCP 80/443, завершує TLS і проксіює `/api` зі зняттям префікса. FastAPI довіряє одній IPv4-адресі Caddy. Edge-мережа підтримує IPv4 і IPv6. PostgreSQL доступний лише через окрему внутрішню мережу. API зберігає SMTP egress.
- Prelaunch-реєстрація вимкнена за замовчуванням, production docs/OpenAPI вимкнені. Є перевірка SMTP/DB credentials, приклад зовнішнього env-файлу, безпечна побудова SQLAlchemy URL та передавання URL в Alembic без ConfigParser interpolation. API й Alembic використовують окремі обмежені ролі PostgreSQL. API readiness перевіряє наявність ревізії, а deployment-процедура звіряє очікуваний head.
- Додано release/backup/rollback runbook, one-shot міграцію, щоденний systemd timer з host lock і явний production Compose context для backup. Параметри образів, grants і ручні команди наведено в [runbook](stage-24-checkpoint-2-runbook.md).

## Результати тестів

Локальний macOS x86_64, Docker Engine 29.9.3, Compose v5.7.0, контейнери `linux/amd64`. Production images зібрано на Python 3.13.18, Node 24.19.0 та Caddy 2.11.9. База PostgreSQL 17.12, FastAPI 0.162.5, Uvicorn 0.54.0, Alembic 1.20.1, Vite 8.3.5. Тестовий release tag `myway-cp2-sjavse`. Digests базових образів зафіксовано в runbook і конфігурації.

- Backend ID `sha256:3aa600a7fbe1d5c137f4e8b8640781f81c260b2477cc7f54f5b5d08854b782e7`.
- Edge ID `sha256:08a326a1086304af69244dd1e3d37c66b43fc94841753bb455c1bc20ff7dc90b`.

| Перевірка | Спостережений результат |
| --- | --- |
| Development Compose і backend | `config --quiet` пройшов. **191 pytest passed** на окремій `myway_test` у development mode, 104.37 с. Перший прогін показав 8 збоїв від анонімного UID образу в операторському CLI. Іменований non-root користувач виправив це. |
| Frontend macOS | **300/300** на Node 24, build і lint пройшли. Початковий запуск під Node 18 не зміг виконати TypeScript-тести. |
| Frontend з чистим `npm ci` на Linux amd64 | **299/300** і на checkout, і на архіві точного baseline. В обох збій `applicationMenu.test.ts:105` при перевірці закриття меню після зовнішнього pointerdown (actual 1, expected 0). Build і lint у двох запусках пройшли, 14 попереджень і 0 помилок lint. |
| Production build, TLS і міграції | Compose config, збірки та валідація Caddy для основного і www імен пройшли. Чиста PostgreSQL дійшла до `a22a01e4b901`, повторний `upgrade head` пройшов без нових міграцій. API та Alembic з'єдналися з паролями з `@ : / % #` і пробілами. Перевірено рольові обмеження, reject placeholder і відсутність API/DB host port bindings. |
| HTTPS і auth | Довірений локальний CA, SPA HTML для hash entry і nested route, `/api/health`, JSON 404 без HTML fallback, вимкнені docs/OpenAPI, no-store, HSTS та security headers. Перевірено Secure/HttpOnly/`__Host-` cookies, Origin/CSRF, закриту реєстрацію. Login/logout, verify/reset та одноразовість reset пройшли через ізольований SMTP sink з STARTTLS і синтетичною SMTP-автентифікацією. |
| Браузер | Headless Chrome 158.0.8127.38 відобразив login і обидва auth-екрани за точними hash URL MyWay. TLS-перевірка підтвердила hostname через локальний CA, Chrome отримав pin ключа перевіреного сертифіката. |
| Graph і lifecycle | Два акаунти, ізоляція node/layout/graph, annotation і позиції, Free/Pro, JSON export/import/restore та query `confirmed=true`. Коректний JSON у 64 MiB пройшов, оголошений розмір 64 MiB + 1 відхилено HTTP 413 до передачі тіла. Cleanup пройшов, purge видалив один прострочений акаунт і зберіг майбутній deadline. |
| Proxy trust | Одне джерело отримало 429 на 11-й спробі з різними підробленими forwarded-заголовками. Другий IPv4 peer та окремий IPv6 peer мали власні buckets. DB DNS-ім'я недоступне на edge-мережі. |
| Відновлення | Після зупинки PostgreSQL API health повернув 503. Після відтворення контейнерів з іменованими томами повернулися health, graph, layout і annotation. Архів production-проєкту перевірено за SHA-256 та відновлено транзакційно в локальну disposable PostgreSQL без мережевого доступу. У відновленій БД звірено head, контрольні graph/layout записи та результат purge. |
| Секрети | Перевірено Git ignore для root/nested env, приватної пошти й каталогів secrets. Синтетичні паролі й AUTH_SECRET відсутні в метаданих, history, шарах фінальних образів і в логах перевірки. |

`git diff --check` і синтаксис shell-скриптів пройшли. Тестові проєкти зупинено. Git commit/push, Hetzner deployment, Porkbun DNS, реальні production secrets і публічна реєстрація залишалися поза виконаними діями.

## Ручне приймання та відкриті перевірки

Запустіть `deploy/smoke/run.sh` з кореня checkout. Команди backend/frontend regression, deployment gate і порядок rollback наведено у [runbook](stage-24-checkpoint-2-runbook.md). Рев'ю tracked-змін доступне через `git diff`, список нових файлів через `git status --short --untracked-files=all`.

`systemd-analyze verify` для service і timer та `systemd-analyze calendar` пройшли в одноразовому Ubuntu 24.04 зі службою-заглушкою Docker. Maintenance-команди перевірено окремо на disposable даних.

Залишаються активація і перевірка розкладу на цільовому VPS, capacity, зовнішні IPv4/IPv6 і TLS/ACME для apex та www, app-level доставка Brevo з перевіркою allowlist, незалежне підтвердження SSH fingerprint, provider backup recovery та off-host автоматизація CP5. Mac ARM у цьому прогоні не використовувався.

## Виправлення після ручного приймання

### Причина CP2-01, CP2-02 і CP2-04

Read-only SQL і прямі виклики API підтвердили однакову ревізію `a22a01e4b901` на двох базах. У `myway_db` є 8 типів вузлів і 11 типів зв'язків, зокрема `person` і `knows` (обидва з ID 1 у своїх таблицях). У `myway-cp2-igfkcy` є 7 і 10 відповідно. Решта кодів і назв збігаються, їхні числові ID різняться.

Початкові міграції створюють порожні таблиці. Seed-ревізії `1fad1039e79c`, `1934c101cf4c` та `b4edbb2ba0b8` додають усі інші стандартні типи, а `person` і `knows` випущено. Stage 2 описує їх як створені тестові записи, README включає їх у стандартні довідники. У доступній Git-історії не знайдено seed-скрипта, який завантажував би ці записи при bootstrap. Старі тести Import/Export самі створювали ці типи, тому не виявляли пропуску в міграціях.

API повертає рядки довідників за їхніми ID. Frontend використовує повні відповіді API в Create/Edit. Окремі фільтри полотна показують типи, які вже присутні в поточному графі. Export записує коди, а Import/Restore шукає ці коди в цільовій БД. У чистому smoke не було коду `person`, тому перевірка повертала HTTP 422 `Unknown node type`. `knows` так само відсутній і відхилявся б на наступній перевірці. Експорт із самого smoke використовував тільки доступні йому коди, тому проходив. Це дефект чистої ініціалізації, наявний у baseline Stage 23.

**CP2-03.** У baseline `AnnotationControls.tsx` явно виключає `kind === "text"` зі списку Select shape. Text має власний інструмент створення і доступний через прямий вибір на полотні. Поведінка відповідає baseline.

### Зміни

Нова Alembic-ревізія `a24a01e4b901` додає тільки відсутні коди `person` і `knows` з чинними назвами. Існуючі рядки та зовнішні ключі зберігаються. Downgrade цієї ревізії зберігає довідникові записи, оскільки вони могли існувати до upgrade або вже мати зв'язки з графом. Історичні міграції та валідатор Import/Restore збережено. Ревізійний gate і production smoke оновлено. Ширший перегляд типів відкладено.

[Команди повторного ручного приймання](stage-24-checkpoint-2-runbook.md#повторне-ручне-приймання-довідників).

### Повторні перевірки

- Backend pytest на ізольованій PostgreSQL 17.12 — **192 passed** за 119.56 с. Чиста БД повертає всі 8 типів вузлів і 11 типів зв'язків за незалежними очікуваннями. Upgrade з попередньої ревізії зберіг усі наявні ID, включно з окремим сценарієм із заповненим графом та вже наявними Person/Knows.
- JSON, експортований із незалежної БД попередньої ревізії, пройшов Import, Preview і Restore у новій БД з іншими числовими ID типів. Звірено кінці й напрямок Knows, Person, позиції та текстову анотацію. Невідомий код вузла або зв'язку дає 422, а повторний Export підтверджує збереження цільового workspace.
- Повний production smoke `myway-cp2-7cuucv` пройшов із head `a24a01e4b901`, реальними API-запитами створення Person і Knows, повторною міграцією, snapshot 64 MiB, recovery і backup/restore drill. Для паралельного збереження початкового smoke-проєкту використано тимчасову копію конфігурації з підмережею `172.30.25.0/24`, відповідною довіреною адресою Caddy та loopback-портами `28080` і `28443`.
- На macOS frontend — **300/300**. На Linux amd64 із чистим `npm ci` — **299/300**, відтворюється раніше підтверджений baseline-збій у `applicationMenu.test.ts:105`. Build і lint пройшли на обох платформах, lint дав 14 попереджень.
- Наявні development і `myway-cp2-igfkcy` використано тільки для read-only порівняння. Команди повторного ручного приймання застосовують міграцію до локального smoke лише за вибором оператора.

## Порядок довідників

Read-only порівняння підтвердило, що `person` і `knows` мають ID 1 у development, але найбільші ID 8 і 11 у smoke після `a24a01e4b901`. Обидва API сортували за ID, і Create/Edit зберігали цей порядок. Фільтри активного React Flow редактора окремо сортували коди за абеткою.

Backend тепер упорядковує стандартні записи за явною послідовністю стабільних кодів, підтвердженою в development. Записи поза стандартним переліком ідуть після нього за кодом. Create/Edit використовують отриманий порядок, а фільтри графа застосовують його до використаних типів. Поле `sort_order` у БД або API знадобилося б для змінюваного порядку, тоді як поточний перелік фіксований. Ревізія `a24a01e4b901` і схема БД збережені.

[Оновлення наявного smoke-проєкту](stage-24-checkpoint-2-runbook.md#оновлення-smoke-після-виправлення-порядку-довідників).

Повторні перевірки пройшли. Backend pytest — **192/192**. Окремий cross-database прогін підтвердив точну послідовність обох повних довідників, коли Person і Knows мають найменші ID в одній БД і найбільші в іншій. Frontend на macOS — **302/302**, build і lint пройшли з 14 попередженнями lint. Повний production smoke `myway-cp2-ersvdq` пройшов на окремій локальній підмережі й loopback-портах, включно з перевіркою перших позицій Person і Knows через HTTPS.

## Фінальний аудит і закриття Checkpoint 2

**Ручне приймання завершено.** Власник підтвердив закриття всіх повідомлених дефектів, доступність Person і Knows, успішний Restore реального development-експорту в локальному production smoke та точний усталений порядок обох довідників. Реальний експорт використовувався під час ручного приймання. Автоматизований аудит повторено лише на синтетичних даних.

### Висновки аудиту

- Повний candidate diff перевірено відносно `f7c54eb95d29c8e7928a64a3783e27f6bab7cdc0`, включно з локальними новими файлами. Індекс Git порожній. Список нижче містить рівно 33 призначені для commit файли.
- Candidate перевірено за типом і вмістом файлів, характерними сигнатурами ключів, токенів та credential URL. Конфігурацію і релевантні присвоєння переглянуто окремо. Є лише placeholders, посилання на змінні, dev defaults і синтетичні test credentials. Приватні env-файли, ключі, локальна пошта, експорти, backup, build output та тимчасові файли відсутні у списку.
- У Alembic один head `a24a01e4b901`. На окремій чистій PostgreSQL 17.12 `upgrade head` пройшов і `alembic check` повернув `No new upgrade operations detected.` Міграційний регресійний тест охоплює також legacy upgrade, збереження даних і зіставлення схеми з ORM.
- Dev Compose пройшов `config --quiet`. Dev Compose, dev Dockerfile та dev env templates відповідають baseline. Базу розробки використано тільки для read-only перевірок. Вона може залишатися на `a22a01e4b901` до окремого локального upgrade. Успішний legacy upgrade підтверджено на disposable БД.
- Перевірено production Compose validation, закриту реєстрацію, розмежування мереж і ролей, непублічні API/DB порти, довіру до єдиного Caddy peer, ізоляцію TLS/SMTP smoke та обмеження запитів. Переглянуто migration gate, readiness, maintenance lock і rollback. Runbook вимагає backup і isolated restore drill перед міграцією з наявними даними. При несумісності схеми перехід на відновлений volume потребує затвердженого вікна робіт і рішення щодо змін після backup.
- Node & Edge Types Review записано в [Product backlog](../README.md#product-backlog) і відкладено до відгуків перших тестувальників.

### Остаточні результати перевірок

- Backend на disposable PostgreSQL 17.12 — **192/192** за 131.88 с.
- Metadata, history і layers фінальних backend та edge images пройшли перевірку. У фінальних smoke, service та error-validation журналах відсутні синтетичні значення паролів і AUTH_SECRET.
- Frontend на macOS із Node 24 — **302/302**, build і lint пройшли.
- Linux amd64 із чистим `npm ci` і Node 24.19.0 — **301/302** для candidate та **299/300** для точного baseline. В обох один збій `applicationMenu.test.ts:105` на зовнішньому pointerdown. Build і lint пройшли в обох checkout, 14 попереджень та 0 помилок lint.
- Повний production smoke `myway-cp2-l7fqps` пройшов, зокрема перевірки порядку Person/Knows, HTTPS/STARTTLS, proxy rate-limit buckets, перезапуск і backup/restore drill. Тест запущено з копії candidate на окремій loopback-парі портів і підмережі, щоб зберегти наявне середовище приймання.
- Read-only health чинного development API повернув `ok`; development OpenAPI повернув HTTP 200. Прийнята smoke-БД read-only підтвердила `a24a01e4b901`.

### Відкладені роботи й технічний борг

Для закриття CP2 функціональних блокерів не виявлено. Linux frontend має відтворюваний baseline-збій `applicationMenu.test.ts:105`. Окремі технічні покращення включають усунення 14 наявних lint-попереджень, звуження default DML grants для runtime, зокрема на `alembic_version` та відокремлення SMTP/auth credentials від середовища one-shot мігратора. Образи й runtime topology перевірено локально, а цільові інфраструктурні перевірки перелічено в [gate перед публічним доступом](stage-24-checkpoint-2-runbook.md#gate-перед-публічним-доступом). Зокрема відкриті публічні DNS/TLS, зовнішні IPv4/IPv6, live Brevo, provider/off-host backup і перевірка timer/capacity на VPS.

### Точний список для commit

Зі списку виключені початкові вхідні документи `docs/stage-24-checkpoint-1.md` та `docs/stage-24-checkpoint-2-spec.md`, а також сторонні `docs/stage-23-create-search-workspace-flow-spec.md` і `stage-23-input-HEAD.zip`. Файли залишено в робочому дереві.

```text
.dockerignore
.env.production.example
.gitignore
Dockerfile.prod
README.md
alembic/env.py
alembic/versions/a24a01e4b901_restore_standard_graph_types.py
app/core/config.py
app/core/database.py
app/main.py
app/repositories/edge_type.py
app/repositories/node_type.py
deploy/Caddyfile
deploy/Dockerfile.frontend
deploy/db-entrypoint.sh
deploy/init-db.sh
deploy/maintenance.sh
deploy/smoke/check.py
deploy/smoke/compose.yml
deploy/smoke/run.sh
deploy/smoke/smtp_sink.py
deploy/systemd/myway-maintenance.service
deploy/systemd/myway-maintenance.timer
docker-compose.prod.yml
docs/stage-24-checkpoint-2-report.md
docs/stage-24-checkpoint-2-runbook.md
poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx
poc/graph-visualization/src/react-flow/graphTypeOptions.ts
poc/graph-visualization/tests/graphTypeOptions.test.ts
scripts/backup_restore.py
tests/test_auth_config.py
tests/test_migrations.py
tests/test_standard_graph_types.py
```

Запропонований commit message

```text
Complete Stage 24 Checkpoint 2 production deployment configuration
```
