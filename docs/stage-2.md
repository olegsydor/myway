# Stage 2 — Data Model and Users

## Мета

Створити базову модель даних My Way, на якій буде будуватися граф, та забезпечити основний принцип multi-tenant isolation:

> Користувач бачить і може змінювати тільки власні дані.

На цьому етапі не реалізується повноцінна authentication system, повний CRUD або UI графа.

---

## Результат

Створена базова модель:

```text
User
 ├── Nodes
 │    └── NodeType
 │
 └── Edges
      ├── EdgeType
      ├── source_node -> Node
      └── target_node -> Node
```

У PostgreSQL існують таблиці:

```text
users
node_types
nodes
edge_types
edges
```

---

# 1. User

Створена SQLAlchemy-модель `User`.

Основні поля:

```text
id            BIGINT PRIMARY KEY
email         VARCHAR(320) NOT NULL UNIQUE
display_name  VARCHAR(255) NOT NULL
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```

Для `created_at` та `updated_at` початкове значення встановлюється PostgreSQL:

```sql
clock_timestamp()
```

На Stage 2 пароль та інші authentication-related поля не додаються.

Створені базові repository operations:

- створення користувача;
- отримання користувача за `id`;
- отримання користувача за `email`.

---

# 2. NodeType

Типи Node винесені в окрему таблицю, а не реалізовані через PostgreSQL ENUM.

```text
node_types
----------
id
code
name
```

`code` має `UNIQUE` constraint.

Такий підхід дозволяє надалі розширювати набір типів Node без зміни PostgreSQL enum type.

Під час Stage 2 створено тестовий тип:

```text
code = person
name = Person
```

---

# 3. Node

Основні поля:

```text
nodes
-----
id
user_id
node_type_id
display_name
description
properties
created_at
updated_at
```

Типи:

```text
id             BIGINT
user_id        BIGINT
node_type_id   BIGINT
display_name   VARCHAR(255)
description    TEXT NULL
properties     JSONB NOT NULL DEFAULT '{}'
created_at     TIMESTAMPTZ
updated_at     TIMESTAMPTZ
```

Relationships:

```text
nodes.user_id
    -> users.id

nodes.node_type_id
    -> node_types.id
```

Правила видалення:

```text
User -> Nodes
ON DELETE CASCADE

NodeType -> Nodes
ON DELETE RESTRICT
```

Для Node створений constraint:

```text
UNIQUE (user_id, id)
```

Він потрібен не для унікальності `id` як такої — `id` уже є PRIMARY KEY — а для можливості створення composite foreign keys з `edges`.

---

# 4. EdgeType

Типи Edge також винесені в окрему таблицю:

```text
edge_types
----------
id
code
name
```

`code` має `UNIQUE` constraint.

Під час Stage 2 створено тестовий тип:

```text
code = knows
name = Knows
```

---

# 5. Edge

Основні поля:

```text
edges
-----
id
user_id
source_node_id
target_node_id
edge_type_id
description
properties
created_at
updated_at
```

`description` є nullable `TEXT`.

`properties`:

```text
JSONB NOT NULL DEFAULT '{}'
```

Edge належить конкретному User:

```text
edges.user_id -> users.id
```

Edge має тип:

```text
edges.edge_type_id -> edge_types.id
```

---

# 6. Database-level tenant isolation

Одна з основних вимог Stage 2:

> Edge не може зв'язувати Node різних користувачів.

Це забезпечується не тільки application logic, а й PostgreSQL constraints.

У `nodes` існує:

```text
UNIQUE (user_id, id)
```

У `edges` створені composite foreign keys:

```text
(user_id, source_node_id)
    -> nodes(user_id, id)

(user_id, target_node_id)
    -> nodes(user_id, id)
```

Constraints:

```text
fk_edges_source_node_owner
fk_edges_target_node_owner
```

Таким чином PostgreSQL фізично не дозволяє створити Edge, якщо source або target Node не належить користувачу, зазначеному в `edges.user_id`.

Це було перевірено прямою спробою INSERT.

PostgreSQL повернув:

```text
ForeignKeyViolationError

insert or update on table "edges"
violates foreign key constraint
"fk_edges_target_node_owner"
```

---

# 7. Індекси

Для tenant-scoped доступу створені індекси.

Node:

```text
ix_nodes_user_id
ix_nodes_node_type_id
```

Edge:

```text
ix_edges_user_id
ix_edges_edge_type_id
ix_edges_user_id_source_node_id
ix_edges_user_id_target_node_id
```

Для source/target використовуються composite indexes:

```text
(user_id, source_node_id)
(user_id, target_node_id)
```

оскільки основні запити до tenant-owned даних виконуються в контексті конкретного User.

---

# 8. Application-level tenant isolation

Для tenant-owned ресурсів Node та Edge repository layer не отримує об'єкти тільки за primary key.

Node шукається за:

```text
Node.id = node_id
AND
Node.user_id = current_user.id
```

Edge аналогічно:

```text
Edge.id = edge_id
AND
Edge.user_id = current_user.id
```

Таким чином application layer не розрізняє:

```text
об'єкт не існує
```

та:

```text
об'єкт існує, але належить іншому User
```

В обох випадках API повертає:

```text
404 Not Found
```

Це навмисне рішення, щоб не розкривати існування чужих ресурсів.

---

# 9. Current User

Повноцінна authentication system не входить у Stage 2.

Для формування правильного application architecture створена FastAPI dependency:

```text
get_current_user()
```

На Stage 2 вона використовує тимчасовий:

```python
TEST_USER_ID = 1
```

Це виключно Stage 2 stub.

Решта application layer уже працює через:

```text
current_user.id
```

і не залежить від способу authentication.

У майбутньому реалізація `get_current_user()` буде замінена справжньою authentication logic без необхідності змінювати tenant-aware repositories та endpoints.

---

# 10. Pydantic schemas

Створені schemas:

```text
UserCreate
UserRead

NodeCreate
NodeRead

EdgeCreate
EdgeRead
```

Важливе правило:

```text
NodeCreate НЕ містить user_id
EdgeCreate НЕ містить user_id
```

Клієнт не визначає ownership ресурсу.

`user_id` завжди визначається server-side через:

```text
current_user.id
```

---

# 11. API foundation

Stage 2 не реалізує повний CRUD.

Створений мінімальний API foundation для перевірки моделі та isolation:

```text
POST /nodes
GET  /nodes/{node_id}

POST /edges
GET  /edges/{edge_id}

GET  /health
```

При створенні Edge application layer перевіряє ownership обох Node:

```text
current_user
     |
     +--> source Node belongs to user?
     |
     +--> target Node belongs to user?
     |
     +--> INSERT Edge
              |
              +--> PostgreSQL composite FK
```

Таким чином використовується defense-in-depth:

```text
Application-level validation
+
Database-level constraints
```

---

# 12. Alembic

Stage 2 використовує Alembic migrations.

Baseline зі Stage 1:

```text
c0704bc3daf4_initial.py
```

Міграція є порожнім baseline.

Stage 2 migrations:

```text
35fde2b6328e_create_users.py

e29ae5016ee2_create_node_types_and_nodes.py

create edge types and edges migration
```

Міграції перевіряються вручну перед `upgrade`.

Особливо важливо:

> `alembic revision --autogenerate` не вважається автоматично правильним результатом.

Згенеровану migration необхідно переглядати перед застосуванням.

---

# 13. persistence_test

Development database містить службову таблицю:

```text
persistence_test
```

Вона не є частиною ORM-моделі Stage 2.

Через це Alembic autogenerate спочатку намагався генерувати:

```python
op.drop_table("persistence_test")
```

Для неї в `alembic/env.py` доданий `include_object`, який виключає `persistence_test` з Alembic autogenerate comparison.

Перевірка:

```bash
docker compose exec api alembic check
```

повертає:

```text
No new upgrade operations detected.
```

---

# 14. Testing

Для Stage 2 додані:

```text
pytest
pytest-asyncio
httpx
```

Створена окрема PostgreSQL database:

```text
myway_test
```

Tests не використовують development database.

У `tests/conftest.py` є захист, який вимагає використання:

```text
/myway_test
```

Для кожного тесту створюється окремий async SQLAlchemy engine.

Це зроблено для уникнення конфліктів asyncio event loops між `pytest-asyncio`, SQLAlchemy та `asyncpg`.

Початковий session-scoped engine спричиняв:

```text
RuntimeError:
Future attached to a different loop
```

Перехід на function-scoped engine усунув проблему.

---

# 15. Isolation tests

Автоматизованими тестами перевірено:

- User може отримати власну Node.
- User не може отримати Node іншого User.
- User не може отримати Edge іншого User.
- API не дозволяє створити cross-user Edge.
- PostgreSQL constraint не дозволяє створити cross-user Edge навіть напряму через ORM/DB layer.

Результат:

```text
5 passed
```

Запуск:

```bash
docker compose exec api pytest -q
```

---

# 16. Reproducibility test

Окремо перевірено, що Stage 2 schema може бути створена з нуля лише через Alembic migrations.

Для цього використана чиста:

```text
myway_test
```

і виконано:

```bash
docker compose exec \
  -e POSTGRES_DB=myway_test \
  api alembic upgrade head
```

Після цього в чистій database були створені:

```text
alembic_version
users
node_types
nodes
edge_types
edges
```

Таким чином підтверджено, що структура Stage 2 відтворюється з історії міграцій без ручного створення таблиць.

---

# 17. Перевірка стану

Перевірити Alembic:

```bash
docker compose exec api alembic current
```

Перевірити відповідність ORM та database schema:

```bash
docker compose exec api alembic check
```

Очікується:

```text
No new upgrade operations detected.
```

Запустити tests:

```bash
docker compose exec api pytest -q
```

Очікується:

```text
5 passed
```

Перевірити API:

```text
http://localhost:8000/docs
```

---

# Definition of Done

- [x] Є таблиці `users`, `nodes`, `edges`.
- [x] Є таблиці `node_types`, `edge_types`.
- [x] Між таблицями правильно визначені relationships.
- [x] Node належить конкретному User.
- [x] Edge належить конкретному User.
- [x] Визначені необхідні foreign keys.
- [x] Визначені `NOT NULL` constraints.
- [x] Визначені необхідні `UNIQUE` constraints.
- [x] Визначені правила `ON DELETE`.
- [x] Додані tenant-aware indexes.
- [x] Node має `description`.
- [x] Edge має `description`.
- [x] Node та Edge підтримують `properties JSONB`.
- [x] `user_id` визначається server-side.
- [x] Чужа Node повертає `404`.
- [x] Чужий Edge повертає `404`.
- [x] Application layer не дозволяє cross-user Edge.
- [x] PostgreSQL не дозволяє cross-user Edge.
- [x] Створені Pydantic schemas.
- [x] Створений мінімальний API foundation.
- [x] Створена окрема test database.
- [x] Multi-tenant isolation покрита автоматизованими тестами.
- [x] Усі тести проходять.
- [x] Alembic migrations відтворюють Stage 2 schema з чистої database.

## Stage 2 status

**COMPLETED**
