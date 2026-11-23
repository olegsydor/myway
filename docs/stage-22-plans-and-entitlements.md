# My Way — Stage 22: Plans and Entitlements

Технічне завдання · baseline `63400e2` · 21 листопада 2026

## 1. Мета

Додати серверно-авторитетну модель Free/Pro та обмежити лише зростання workspace для Free-користувачів, не блокуючи доступ до вже створених даних.

Stage 22 не підключає платежі, не містить checkout і не визначає ціну. Він створює стабільний entitlement layer, який Stage 23 зможе використати для billing без зміни правил workspace.

## 2. Затверджені правила продукту

| Операція | Free | Pro |
| --- | --- | --- |
| Ноди | максимум 300 у workspace | без продуктового ліміту |
| Анотації | максимум 15 у кожному layout | без продуктового ліміту |
| Типи анотацій у ліміті | Rectangle, Ellipse і Text; кожен об’єкт рахується як 1 | так само |
| Редагування наявних даних | завжди доступне | доступне |
| Видалення даних | завжди доступне | доступне |
| Export | завжди доступний | доступний |
| Import | результат має містити ≤300 нод і ≤15 анотацій у кожному layout | без продуктових лімітів |
| Restore | результат має містити ≤300 нод і ≤15 анотацій у кожному layout | без продуктових лімітів |
| Save as New | новий layout має містити ≤15 анотацій | без продуктового ліміту |

Ліміти інклюзивні: 300-та нода й 15-та анотація дозволені.

### Поведінка після завершення Pro

- Наявні ноди, layouts і анотації не видаляються, не приховуються та не стають read-only.
- Дозволені перегляд, редагування, переміщення, зв’язки, збереження, видалення й Export.
- Якщо workspace містить 350 нод, додавання нової ноди заблоковане, доки кількість не стане меншою за 300. Після зменшення до 299 можна додати одну ноду.
- Якщо layout містить 18 анотацій, можна зберігати 18 або менше. Збільшення до 19 заборонене. Після збереження 17 повернутися до 18 уже не можна.
- Правило збереження наявного layout для Free: `incoming_count <= max(current_saved_count, 15)`.
- Import і Restore не успадковують grandfathering: імпортований результат повинен відповідати чинним Free-лімітам.

## 3. Межі етапу

### Включаємо

- модель entitlement grants і визначення effective plan;
- Free/Pro правила на backend;
- usage/plan API;
- lifetime Pro для early testers через operator command;
- зрозуміле відображення плану та лімітів у UI;
- UI-повідомлення для заблокованого зростання;
- перевірки Import, Restore, layout save і Save as New;
- міграцію, backend/frontend тести, concurrency тести та документацію.

### Не включаємо

- платіжного провайдера, checkout, invoices, webhooks і customer portal;
- ціну або валюту в коді;
- trial, coupons, grace period чи billing retry;
- нові функції Pro поза зняттям двох продуктових лімітів;
- обмеження Export;
- блокування або обрізання вже наявних over-limit даних;
- новий маршрут Account Settings або четвертий tab;
- зміну універсальних safety limits, зокрема 64 MiB для JSON і schema/DB validation.

## 4. Модель даних

### 4.1. Таблиця `entitlement_grants`

Додати окрему таблицю, а не поля `plan`/`plan_expires_at` у `users`.

Рекомендовані поля:

| Поле | Тип | Правило |
| --- | --- | --- |
| `id` | bigint PK | generated identity |
| `user_id` | bigint FK | `users.id`, `ON DELETE CASCADE`, not null |
| `plan_code` | varchar(16) | у Stage 22 лише `pro` |
| `source` | varchar(32) | `early_tester` або `manual` |
| `starts_at` | timestamptz | not null |
| `expires_at` | timestamptz nullable | `NULL` означає безстроковий grant |
| `revoked_at` | timestamptz nullable | припиняє grant без фізичного видалення |
| `created_at` | timestamptz | not null, DB timestamp |
| `note` | varchar(500) nullable | внутрішнє пояснення, не повертати публічним API |

Constraints:

- `plan_code IN ('pro')`;
- `source IN ('early_tester', 'manual')`;
- `expires_at IS NULL OR expires_at > starts_at`;
- `revoked_at IS NULL OR revoked_at >= starts_at`.

Indexes:

- індекс за `user_id`;
- індекс для пошуку grants за `user_id`, `starts_at`, `expires_at`, `revoked_at`.

Free не зберігається окремим рядком: якщо активного Pro grant немає, effective plan дорівнює Free. Для наявних користувачів backfill не потрібен.

### 4.2. Effective plan

Grant активний, якщо:

```text
starts_at <= database_now
AND revoked_at IS NULL
AND (expires_at IS NULL OR expires_at > database_now)
```

Якщо існує хоча б один активний Pro grant — план Pro; інакше Free. Час береться з PostgreSQL через наявний `db_now`, а не з годинника application process.

Закінчення строкового grant не потребує cron. Кожна авторитетна mutation повторно визначає effective plan у своїй транзакції.

## 5. Backend-архітектура

### 5.1. Entitlement service

Створити один модуль, наприклад `app/services/entitlements.py`, який володіє:

- продуктовими константами `FREE_NODE_LIMIT = 300` і `FREE_ANNOTATIONS_PER_LAYOUT = 15`;
- визначенням active grants та effective plan;
- підрахунком node usage;
- перевіркою node growth;
- перевіркою annotation growth;
- перевіркою Import/Restore snapshot;
- формуванням публічного entitlement response і структурованої помилки.

Ліміти не робити environment variables: це продуктові правила, які мають бути однаковими в усіх інстансах. Pro означає відсутність продуктового ліміту, але не скасовує schema, payload і safety constraints.

### 5.2. Транзакції та блокування

Поточний `get_current_user` уже бере `SELECT ... FOR UPDATE` на `users`. `layout.lock_owner` робить те саме для layout mutations. Stage 22 повинен зберегти єдиний lock order:

```text
user row → effective entitlement/counts → workspace rows → commit
```

Repositories, які застосовують ліміт, мають явно гарантувати owner lock, а не покладатися лише на конкретну FastAPI dependency. Повторний `FOR UPDATE` того самого рядка в одній транзакції безпечний.

Це потрібно для сценарію 299 нод + два одночасні POST: рівно один запит створює 300-ту ноду, другий після очікування бачить 300 і отримує 409.

Operator grant/revoke також спочатку блокує user row. Тому grant не може змінитися посеред авторитетної workspace mutation.

### 5.3. Структурована помилка

Використовувати HTTP `409 Conflict`:

```json
{
  "detail": {
    "code": "plan_limit_exceeded",
    "resource": "nodes",
    "plan": "free",
    "limit": 300,
    "current": 300,
    "attempted": 301
  }
}
```

Для анотацій `resource` дорівнює `annotations_per_layout`; можна додати `layout_id` або безпечне `layout_name`. Той самий код використовується для node creation, layout save, Import і Restore, щоб frontend мав один передбачуваний error path.

### 5.4. Node creation

У `POST /nodes` після owner lock і всередині тієї самої транзакції:

1. визначити effective plan;
2. для Free виконати `COUNT(nodes)` користувача;
3. дозволити insert лише якщо current `< 300`;
4. вставити ноду й commit.

`GET`, `PATCH`, `DELETE`, робота з edges і layout positions не отримують quota block.

### 5.5. Layout annotations

Для `POST /layouts` (включно із Save as New):

- Free: `len(incoming.annotations) <= 15`.

Для `PUT /layouts/{id}/workspace`:

- Pro: не додавати продуктову перевірку;
- Free: прочитати current saved annotation count після owner lock;
- дозволити, якщо `incoming <= max(current, 15)`;
- відхилити до видалення старих annotations, щоб failure залишав layout незмінним.

`PUT /layouts/{id}/positions` не змінює annotations і не перевіряє entitlement.

Рахуються всі елементи `WorkspaceSnapshot.annotations`, незалежно від kind.

### 5.6. Import і Restore

Після JSON/schema/catalog validation, але до delete/insert:

- Free: `len(data.nodes) <= 300`;
- Free: для кожного layout `len(layout.annotations) <= 15`;
- Pro: продуктові перевірки пропускаються;
- операція залишається атомарною й при відмові не змінює workspace.

`POST /restore/preview` залишається доступним і не мутує дані навіть для несумісного Free-файлу. Response розширити:

```json
{
  "nodes": 350,
  "edges": 0,
  "layouts": 2,
  "positions": 350,
  "annotations": 17,
  "eligibility": {
    "allowed": false,
    "violations": [
      {"resource": "nodes", "limit": 300, "attempted": 350}
    ]
  }
}
```

Preview UI показує counts і причину несумісності; checkbox та `Replace workspace` залишаються disabled. `POST /restore` все одно повторно перевіряє entitlement і файл — preview не є дозволом на mutation.

Import може відразу повернути 409 із тією самою структурованою помилкою. Export не звертається до entitlement service.

## 6. API плану та usage

Додати `GET /auth/entitlements`:

```json
{
  "plan": "free",
  "source": "default",
  "starts_at": null,
  "expires_at": null,
  "limits": {
    "nodes": 300,
    "annotations_per_layout": 15
  },
  "usage": {
    "nodes": 42
  }
}
```

Для Pro обидва limits повертаються як `null`. Для кількох активних grants response використовує grant із найбільшим доступом; для однакового Pro пріоритет — безстроковий, потім найдовший `expires_at`. Це лише presentation metadata: право Pro визначається наявністю будь-якого active grant.

Response не містить internal note або майбутні billing identifiers. Endpoint authenticated, tenant-scoped, `cache: no-store` через чинний request wrapper.

## 7. Operator workflow

Розширити `python -m app.commands.auth`:

```bash
python -m app.commands.auth grant-pro USER_ID --source early_tester
python -m app.commands.auth grant-pro USER_ID --source manual --until 2027-12-31T23:59:59+00:00
python -m app.commands.auth list-entitlements USER_ID
python -m app.commands.auth revoke-pro GRANT_ID
```

- Відсутній `--until` означає lifetime Pro (`expires_at = NULL`).
- `grant-pro` блокує user row, перевіряє майбутній timezone-aware `--until` і не створює випадковий дубль активного grant того самого source.
- `revoke-pro` адресує конкретний grant, блокує його owner user і записує `revoked_at`; рядок не видаляється.
- CLI output містить operator, action, user/grant IDs і timestamp, але не email та не internal note.
- Early testers отримують `source=early_tester`, `expires_at=NULL`; 10-річна штучна дата не використовується.

## 8. Frontend

### 8.1. Account Settings

Не змінювати три затверджені tabs. У `Profile & Security` перед Password додати компактну card `Plan & Usage`:

- `Free` або `Pro`;
- для Free: `Nodes: 42 of 300` і `Up to 15 annotations per layout`;
- для lifetime early tester: `Pro · Early tester access` і `No workspace growth limits`;
- для строкового manual grant: локалізовано зрозуміла дата завершення;
- без Upgrade/Buy button до Stage 23.

Відкриття Account Settings оновлює entitlement response. Помилка завантаження плану не повинна блокувати роботу акаунта; показати нейтральне `Plan information is temporarily unavailable`.

### 8.2. Node UI

- Backend залишається єдиним джерелом істини.
- Якщо відомий Free usage дорівнює або перевищує 300, New Node command і submit disabled з поясненням, але форми редагування/видалення доступні.
- Після create/delete або `plan_limit_exceeded` usage оновлюється.
- Stale/multi-tab request, який отримав 409, показує продуктове повідомлення, а не `POST /nodes failed`.

### 8.3. Annotation UI

- Для Free на активному layout показувати компактний counter `12 / 15` в Annotation tools.
- Якщо working count досяг 15 і saved baseline не був вищим, вимкнути створення Rectangle, Ellipse і Text; Select, edit, move, delete та tooltip залишаються доступними.
- Для grandfathered layout дозволений UI ceiling дорівнює `max(saved_count, 15)` і зменшується після успішного save. Наприклад, після save 18→17 наступне додавання 18-ї заборонене.
- Shortcut і menu command повинні використовувати те саме правило, що й buttons; не залишати keyboard bypass.
- Backend 409 має коректно відображатися навіть якщо локальний entitlement state застарів.

### 8.4. Import/Restore UI

- Free-правила коротко вказати біля file inputs.
- Import 409 перетворити на конкретне повідомлення про ноди або layout annotations.
- Restore preview завжди показує counts; при incompatibility показує причину й не дозволяє підтвердити replacement.
- Download current workspace у restore flow та звичайний Export завжди доступні.

## 9. Точки зміни коду

Очікувані основні файли:

### Backend

- `app/models/entitlement.py` — grant model;
- `app/models/__init__.py` — model registration;
- `alembic/versions/<stage22>_plans_and_entitlements.py` — table, constraints, indexes;
- `app/services/entitlements.py` — policy та usage;
- `app/schemas/entitlement.py` — public response/error contracts;
- `app/routers/auth.py` або окремий router — `GET /auth/entitlements`;
- `app/repositories/node.py` — atomic node limit;
- `app/repositories/layout.py` — create/update annotation growth checks;
- `app/repositories/data_import.py`, `app/routers/data_import.py` — Import/Restore enforcement і preview eligibility;
- `app/commands/auth.py` — grant/list/revoke;
- `app/main.py` — лише якщо entitlement endpoint винесено в окремий router.

### Frontend

- `src/auth/AccountSettings.tsx`, `AuthGate.tsx`, `auth.css` — plan card і refresh;
- новий `src/auth/entitlements.ts` — type/API/message mapping;
- `src/auth/dataImport.ts` — eligibility та limit errors;
- `src/shared/api.ts` — структурована node error;
- `src/react-flow/ReactFlowGraph.tsx` та пов’язані command/annotation modules — usage, counters, disabled states;
- відповідні frontend tests.

Фактичне розміщення дрібних helper-функцій можна адаптувати до чинних меж модулів; дублювати policy в кількох компонентах не можна.

## 10. Тестовий план

### 10.1. Entitlements і operator

- відсутність grants → Free;
- future grant ще не активний;
- active finite grant → Pro;
- `expires_at == database_now` → Free;
- lifetime grant → Pro;
- revoked grant → Free;
- один revoked/expired та один active grant → Pro;
- grant/revoke/list, invalid timestamp, missing user, duplicate active source;
- account deletion cascade видаляє grants.

### 10.2. Nodes

- 299→300 дозволено;
- 300→301 відхилено 409;
- over-limit Free не може додавати, але може patch/delete/export;
- після 300→299 нове додавання дозволено;
- Pro може перейти 300→301;
- два одночасні create при 299 дають один 201 і один 409;
- grant/revoke, block/delete і node creation дотримуються lock order без deadlock.

### 10.3. Annotations

- новий Free layout: 14→15 дозволено, 16 відхилено;
- Save as New із 16 відхилено без створення layout;
- existing 18→18 і 18→17 дозволено; 18→19 відхилено;
- після 18→17 спроба 17→18 відхилена;
- same count із зміненими shape metadata дозволено;
- positions-only save не блокується;
- Pro може зберегти 16+;
- одночасні workspace saves не обходять policy.

### 10.4. Import/Restore/Export

- Free import із 300 нод/15 на layout дозволено;
- 301 нода відхилена до mutation;
- один layout із 16 відхилений, навіть якщо total annotations малий;
- Pro приймає ті самі валідні over-Free snapshots;
- preview over-limit повертає counts + violations і нічого не змінює;
- restore повторно перевіряє policy незалежно від preview;
- failed import/restore повністю rollback;
- Export доступний Free, Pro і grandfathered Free;
- tenant isolation збережена.

### 10.5. Frontend

- plan card для Free, lifetime Pro, finite Pro та unavailable state;
- node create disabled at known limit; edit/delete не disabled;
- stale server 409 показує точний текст;
- annotation counter, button/menu/shortcut parity;
- grandfathered baseline зменшується після успішного save;
- restore incompatible preview не допускає confirmation;
- Account Settings keyboard navigation і narrow viewport не регресують.

### 10.6. Regression

- усі наявні backend і frontend tests;
- Alembic upgrade з `63400e2`-сумісної БД і metadata drift check;
- graph, edges DAG, layouts, local recovery, annotations, authentication, account deletion, Import/Restore/Export;
- ручна перевірка desktop і narrow viewport.

## 11. Реалізаційні checkpoints

1. **Entitlement foundation** — migration, model, policy service, operator commands, unit tests.
2. **Backend enforcement** — nodes, layouts, Import/Restore, structured errors, concurrency tests.
3. **Plan and usage UI** — endpoint, Account Settings card, node/annotation state and messages.
4. **Portability UX** — preview eligibility, Import/Restore messaging, Export regression.
5. **Acceptance** — full suites, migration check, standard-stack manual test, documentation.

Кожен checkpoint має залишати backend авторитетним. Frontend disable states є UX-підказкою, а не security boundary.

## 12. Критерії приймання

Stage 22 завершений, коли:

- effective Free/Pro визначається з grants і не залежить від application clock;
- Free не може перевищити 300 нод або дозволений annotation growth;
- Pro не має цих двох продуктових лімітів;
- downgrade/expiry не позбавляє доступу до існуючих over-limit даних;
- Import/Restore застосовують строгі Free result limits атомарно;
- Export завжди доступний;
- early testers можуть отримати й втратити audit-preserving lifetime Pro через operator CLI;
- UI показує план, usage та зрозумілі причини блокування без billing CTA;
- concurrency не дозволяє обійти ліміти;
- немає регресій у graph, layouts, annotations, auth, deletion, portability та local recovery;
- міграції, backend/frontend suites і ручне приймання пройдені;
- реалізація й перевірка виконуються на стандартному project stack; окремий постійний dev-server/порт для Stage 22 не є частиною архітектури.

## 13. Рішення, відкладені до Stage 23

- payment provider;
- конкретна ціна, monthly/annual products;
- subscription/webhook state machine;
- grace period, failed payment та cancellation semantics;
- Upgrade CTA, checkout і customer portal;
- зв’язок billing subscription із Pro grant source.

Stage 23 повинен видавати/припиняти Pro через цей entitlement layer, а не дублювати quota rules у billing code.
