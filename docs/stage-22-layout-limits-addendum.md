# My Way — Stage 22: Layout Limits

Доповнення до ТЗ **Stage 22 — Plans and Entitlements**
Дата рішення: 22 листопада 2026

## 1. Причина доповнення

Початкове ТЗ Stage 22 визначало продуктові ліміти для нод і анотацій, але не обмежувало кількість layouts.

Необмежена кількість layouts небажана навіть для Pro:

- кожен layout зберігає власний набір positions для нод;
- кожен layout може містити окремий набір annotations;
- необмежені layouts створюють неконтрольоване множення обсягу даних;
- Free-користувач міг би частково обходити практичний сенс annotation limit, створюючи необмежену кількість layouts по 15 анотацій.

Тому в Stage 22 додається явний plan-dependent layout limit.

## 2. Остаточна матриця продуктових лімітів

| Ресурс | Free | Pro |
| --- | ---: | ---: |
| Nodes per workspace | 300 | без продуктового ліміту |
| Annotations per layout | 15 | без продуктового ліміту |
| Layouts per workspace | 3 | 15 |

Усі числові межі інклюзивні:

- Free може створити третій layout, але не четвертий;
- Pro може створити п’ятнадцятий layout, але не шістнадцятий;
- початковий `Main` входить у загальну кількість layouts.

Ліміт 15 для Pro є видимим продуктовим лімітом, а не прихованим технічним safety limit.

## 3. Основне правило enforcement

Layout limit перевіряється лише для операцій, результатом яких є створення нового layout:

- `POST /layouts`;
- `Save as New`;
- Import;
- Restore / Replace workspace.

Збереження, редагування або видалення вже наявного layout не блокується через загальну кількість layouts.

Для звичайного створення:

```text
allow create when current_layout_count < effective_layout_limit
```

де:

```text
effective_layout_limit(Free) = 3
effective_layout_limit(Pro)  = 15
```

Backend залишається авторитетним. Disabled state у frontend є лише UX-підказкою.

## 4. Grandfathering і зміна плану

Наявні layouts не видаляються, не приховуються і не стають read-only після завершення Pro або зміни правил.

Користувач, який має більше layouts, ніж дозволяє поточний план, може для всіх наявних layouts:

- відкривати та переглядати;
- редагувати positions і annotations;
- зберігати workspace;
- перейменовувати;
- призначати default;
- видаляти;
- експортувати разом з усім workspace.

Забороняється лише створення нового layout.

Приклад downgrade:

1. Pro-користувач має 12 layouts.
2. Pro завершується, effective plan стає Free.
3. Усі 12 layouts залишаються повністю доступними.
4. Створення нового layout заблоковане.
5. При 3 layouts створення все ще заблоковане.
6. Після видалення до 2 layouts можна створити один новий — третій.

Повторний перехід на Pro дозволяє зростання до 15 layouts.

Pro-користувач із 15 layouts може користуватися всіма ними, але не може створити шістнадцятий.

## 5. Backend-зміни

### 5.1. Entitlement policy

У централізованому entitlement service додати plan-dependent limits:

```text
FREE_LAYOUT_LIMIT = 3
PRO_LAYOUT_LIMIT = 15
```

Policy повинна повертати layout limit для обох планів. Не реалізовувати перевірку як окремий `if plan == free`, оскільки Pro також має числову межу.

Рекомендований інтерфейс policy:

```text
layout_limit(plan) -> int
assert_layout_creation_allowed(plan, current_count)
assert_snapshot_layout_count_allowed(plan, incoming_count)
```

Не дублювати значення 3 і 15 у routers, repositories або frontend components.

### 5.2. Atomic layout creation

У `create_layout`:

1. взяти наявний owner lock на user row;
2. визначити effective plan у цій самій транзакції;
3. порахувати поточні layouts користувача;
4. перевірити plan limit;
5. лише після цього створювати layout;
6. commit виконувати в тій самій транзакції.

Поточний `layout.lock_owner` уже створює правильну точку серіалізації. Два паралельні create біля межі не повинні дозволити перевищення:

- Free при 2 layouts: один concurrent request отримує 201, другий — 409;
- Pro при 14 layouts: один отримує 201, другий — 409.

### 5.3. Structured error

Використати той самий Stage 22 error contract:

```json
{
  "detail": {
    "code": "plan_limit_exceeded",
    "resource": "layouts",
    "plan": "free",
    "limit": 3,
    "current": 3,
    "attempted": 4
  }
}
```

HTTP status: `409 Conflict`.

Для Pro відповідь містить `plan: "pro"` і `limit: 15`.

### 5.4. Операції, які не можна блокувати

Layout count не перевіряється для:

- `GET /layouts`;
- `GET /layouts/{id}`;
- `PATCH /layouts/{id}`;
- `PUT /layouts/{id}/positions`;
- `PUT /layouts/{id}/workspace`;
- `DELETE /layouts/{id}`;
- Export.

Ці операції продовжують застосовувати свої чинні validation, ownership та default-layout правила.

Annotation limit перевіряється окремо за правилами Stage 22 і не повинен змішуватися з layout count.

## 6. Import, Restore і Preview

### 6.1. Строгий result limit

Grandfathering не застосовується до вхідного JSON snapshot.

Для Import і Restore:

```text
Free: len(data.layouts) <= 3
Pro:  len(data.layouts) <= 15
```

Перевірка виконується після JSON/schema validation, але до видалення або вставлення workspace rows.

При перевищенні операція завершується 409 і не змінює workspace.

Навіть якщо поточний grandfathered Free workspace має 12 layouts, Restore файлом із 4 layouts не дозволяється. Free restore result повинен відповідати поточному ліміту 3.

### 6.2. Restore preview

`POST /restore/preview` залишається доступним для файлу з надлишковою кількістю layouts і повертає counts плюс eligibility violation:

```json
{
  "nodes": 120,
  "edges": 80,
  "layouts": 4,
  "positions": 400,
  "annotations": 20,
  "eligibility": {
    "allowed": false,
    "violations": [
      {
        "resource": "layouts",
        "limit": 3,
        "attempted": 4
      }
    ]
  }
}
```

Frontend показує причину несумісності, а confirmation checkbox і `Replace workspace` залишаються disabled.

`POST /restore` повторно перевіряє effective plan і layout count незалежно від preview.

## 7. Entitlement API

`GET /auth/entitlements` має повертати layout limit і usage.

Free:

```json
{
  "plan": "free",
  "limits": {
    "nodes": 300,
    "annotations_per_layout": 15,
    "layouts": 3
  },
  "usage": {
    "nodes": 42,
    "layouts": 2
  }
}
```

Pro:

```json
{
  "plan": "pro",
  "limits": {
    "nodes": null,
    "annotations_per_layout": null,
    "layouts": 15
  },
  "usage": {
    "nodes": 350,
    "layouts": 8
  }
}
```

На відміну від node та annotation limits, `limits.layouts` не дорівнює `null` для Pro.

## 8. Frontend-зміни

### 8.1. Plan & Usage

У `Account Settings → Profile & Security → Plan & Usage` показувати:

```text
Free
Nodes: 42 of 300
Layouts: 2 of 3
Up to 15 annotations per layout
```

або:

```text
Pro
Nodes: Unlimited
Layouts: 8 of 15
Annotations per layout: Unlimited
```

Grandfathered Free state може відображатися як:

```text
Layouts: 12 of 3
Existing layouts remain available. Delete layouts until fewer than 3 remain to create another.
```

Не показувати некоректний progress bar із шириною понад 100%; використати текст або capped visual state.

### 8.2. Layout controls

Якщо відомий current count досяг effective limit або перевищує його:

- `Save as New` disabled;
- інші entry points створення layout disabled;
- показати коротке пояснення ліміту;
- layout switching, Save, Discard, rename, set default і delete залишаються доступними.

Усі UI entry points повинні використовувати одну policy-derived умову. Не залишати menu, button або keyboard bypass.

Backend 409 повинен коректно відображатися навіть якщо локальний entitlement state застарів через іншу вкладку.

Після create/delete layout або `plan_limit_exceeded` frontend оновлює entitlement usage.

### 8.3. Import/Restore messaging

Поруч із file actions коротко вказати:

- Free import/restore: максимум 3 layouts;
- Pro import/restore: максимум 15 layouts.

Повідомлення повинно використовувати limit із API/error response, а не окремі hardcoded тексти для планів.

## 9. Тестовий план

### 9.1. Backend boundary tests

- Free: 0→1 initial `Main` дозволено;
- Free: 2→3 дозволено;
- Free: 3→4 відхилено 409;
- Pro: 14→15 дозволено;
- Pro: 15→16 відхилено 409;
- error contract містить правильні `resource`, `plan`, `limit`, `current`, `attempted`;
- два concurrent creates при Free count 2: один 201, один 409;
- два concurrent creates при Pro count 14: один 201, один 409.

### 9.2. Grandfathering tests

- Pro із 12 layouts після revoke/expiry стає Free;
- усі 12 layouts доступні для read;
- rename, set default, positions save та workspace save дозволені;
- delete дозволений;
- create при 12, 4 і 3 layouts відхиляється;
- після зменшення до 2 створення третього дозволене;
- повторний Pro grant дозволяє зростання до 15.

### 9.3. Import/Restore tests

- Free snapshot із 3 layouts дозволено;
- Free snapshot із 4 layouts відхилено без mutation;
- Pro snapshot із 15 layouts дозволено;
- Pro snapshot із 16 layouts відхилено без mutation;
- Restore preview повертає layout violation, але не змінює workspace;
- Restore повторно перевіряє plan і count після preview;
- grandfathered Free з 12 layouts не може restore snapshot із 4 layouts;
- Export працює для Free, Pro і grandfathered Free незалежно від count.

### 9.4. Frontend tests

- Free показує `Layouts: x of 3`;
- Pro показує `Layouts: x of 15`;
- `Save as New` disabled на межі;
- звичайний Save не disabled через layout count;
- grandfathered state показує зрозуміле пояснення;
- server 409 обробляється після stale/multi-tab state;
- Import/Restore показують правильний plan-dependent limit;
- Account Settings і Layout controls не регресують на narrow viewport та keyboard navigation.

## 10. QA-акаунти

У погодженій схемі ручного тестування:

- `qa-free`: перевірки межі 3 layouts;
- `qa-pro`: перевірки межі 15 layouts;
- `qa-lifecycle`: створення до 4–15 layouts у Pro, revoke/expiry, перевірка grandfathering у Free та повторний grant.

Користувацького перемикача Free/Pro в UI не додаємо. Плани змінюються operator grants/revoke.

## 11. Точки зміни відносно основного ТЗ Stage 22

Основне ТЗ потрібно трактувати з такими уточненнями:

1. До plan limits додається `layouts`.
2. Free layout limit дорівнює 3.
3. Pro layout limit дорівнює 15, а не unlimited.
4. `POST /layouts`, Save as New, Import і Restore отримують layout enforcement.
5. Entitlement API та Plan & Usage отримують layout limit/usage.
6. Grandfathering поширюється на наявні layouts після downgrade.
7. До acceptance додаються boundary, concurrency, portability і UI tests із цього документа.

Міграція БД для цієї зміни не потрібна. Значення належать централізованій plan policy Stage 22.

## 12. Критерії приймання доповнення

Layout-limit частина Stage 22 завершена, коли:

- Free може мати максимум 3 layouts при новому створенні;
- Pro може мати максимум 15 layouts при новому створенні;
- concurrent create не обходить межу;
- downgrade не блокує роботу з існуючими layouts;
- Import і Restore застосовують строгий result limit відповідного плану;
- Export ніколи не блокується;
- UI показує правильний count/limit і блокує лише creation entry points;
- backend залишається авторитетним для stale та multi-tab сценаріїв;
- усі нові й наявні backend/frontend тести проходять;
- немає регресій у layouts, annotations, local recovery та data portability.
