# Team API — контракт для приложения «Косметичка Team»

JSON API для сотрудников (роли `admin`, `manager`, `picker`). Новые read-эндпоинты живут в
`/api/team/*`; изменения данных делаются через уже существующие маршруты `/api/admin/*`,
`/api/picker/*`, `/api/uploads/chat` (описаны ниже).

## Общие правила

- **Аутентификация — cookie.** `POST /api/admin/login` ставит httpOnly-cookie `admin_token`
  (JWT HS256, `{ id, email: <User.login>, role }`, срок JWT — **7 дней**, срок cookie — 30 дней,
  `SameSite=Lax`, `Secure=false`, `Path=/`). Приложение должно хранить cookie (cookie jar) и
  отправлять её со всеми запросами. Когда JWT истёк — любой эндпоинт вернёт 401 → показать логин.
- **Ошибки** всегда `{ "error": string }` (по-русски) с кодом:
  `400` неверные параметры, `401` нет/просрочен токен (`"Не авторизован"`),
  `403` роль не подходит (`"Недостаточно прав"` / `"Нет прав"`), `404` не найдено, `409` конфликт состояния.
- **Даты** — ISO-строки UTC (`"2026-10-25T09:15:00.000Z"`). **Деньги** — целые рубли (`number`),
  в схеме нет Decimal. `stock` и `ProductPrice.price` — `number` (Float).
- **«Серверное время»**: «сегодня», «рабочий день» и т. п. считаются в часовом поясе сервера
  (как и на веб-страницах).
- `/api/team/*` не прикрыт `middleware.ts`; каждый маршрут проверяет роль сам (`app/api/team/_auth.ts`).
- **Важно про `/api/admin/*`:** `middleware.ts` пускает туда только `admin`/`manager`
  (кроме `/api/admin/login`). Сборщик (`picker`) получит **403** на ЛЮБОЙ `/api/admin/*`,
  даже если сам маршрут допускает picker (например `/api/admin/products/search`,
  `/api/admin/categories`, `/api/admin/logout`).
- Картинки товаров: `ProductImage.path` бывает абсолютным URL (`http…`) или относительным путём;
  относительный путь превращается в `https://kosmetichka-opt.ru/api/1c/<path>`
  (можно добавить `?w=160|320|480|800|1200` для WebP-превью). В ответах `/api/team/*` уже есть
  готовый `imageUrl`. Фото сборщика/чата (`/uploads/...`) — относительные пути от домена сайта.

Обозначения ролей: **A** = admin, **M** = manager, **P** = picker.

### Общие типы

```ts
type Role = "admin" | "manager" | "picker";
type OrderStatus = "pending" | "approved" | "assembly" | "consultation" | "payment" | "exported" | "cancelled";
// approved — устаревший статус, может встречаться в старых заказах
type CheckCode = "ok" | "out_of_stock" | "expired" | "bad_condition" | "insufficient_qty";

// OrderItemCheck.status хранится в одном из форматов:
//   "ok" | "<code>"                                 — один код
//   '["expired","bad_condition"]'                    — JSON-массив кодов
//   '[{"s":"expired","q":2},"bad_condition"]'        — JSON-массив с количествами
// В /api/team/* рядом с сырым `status` отдаётся `statuses: string[]` (только коды, без q).

type CustomerShort = { name: string | null; companyName: string | null; phone: string | null };
type Paging = { page: number; pageSize: number; totalCount: number; totalPages: number };
type StatusLabels = Record<string, string>; // { pending: "Ожидание", ... } из lib/orderStatus.ts
```

Сообщения чатов — поле `text: string`. Это либо обычный текст, либо JSON-карточка:

```ts
{ _t: "img", url: string }                                            // фото (url из /api/uploads/chat)
{ _t: "product", id: number, name: string, price: number, imagePath: string | null }
{ _t: "product-problem", id: number, name: string, price: number, imagePath: string | null, problem: string }
```

---

## 1. Новые эндпоинты `/api/team/*` (только GET)

### GET /api/team/me — A, M, P

Текущий сотрудник (из БД по `id` из токена). 401, если учётка удалена.

```ts
{
  id: number; name: string; login: string;
  role: string;          // роль в БД
  roleLabel: string;     // "Администратор" | "Менеджер" | "Сборщик"
  tokenRole: Role;       // роль в JWT (именно она используется для проверок прав;
                         // после смены роли нужен повторный логин)
  createdAt: string;
}
```

### GET /api/team/dashboard — A, M

Данные `app/admin/page.tsx`. «Сегодня» = календарные сутки сервера.

```ts
{
  today: {
    ordersCount: number;                 // все заказы за сегодня (любой статус)
    revenue: number;                     // сумма total за сегодня без cancelled
    byStatus: Record<string, number>;    // только статусы, которые сегодня встречались
  };
  active: {                              // все время, статусы pending/approved/assembly/consultation/payment
    total: number;
    byStatus: { status: string; label: string; count: number }[]; // всегда 5 строк в этом порядке
  };
  weekRevenue: number;                   // с (сегодня 00:00 − 7 дней), без cancelled
  customers: { totalApproved: number; newToday: number };
  recentOrders: {                        // 10 последних по createdAt desc
    id: number; status: string; statusLabel: string; total: number; createdAt: string;
    itemsCount: number; customer: CustomerShort;
    clientName: string;                  // companyName || name || phone || "—"
  }[];
  statusLabels: StatusLabels;
}
```

### GET /api/team/orders — A, M

Список `app/admin/orders/page.tsx`, по 50 на страницу, `createdAt desc`.

Query:
| param | значение |
|---|---|
| `date` | **не передан** → текущий *рабочий день*; `date=` (пусто) → все даты; `YYYY-MM-DD` → этот рабочий день. Иное → 400 |
| `customer` | поиск по клиенту: name / companyName (без регистра), phone, inn (подстрока) |
| `status` | точный статус; пусто/нет → все |
| `page` | ≥1, по умолчанию 1 |

Рабочий день `D` = с `D−1 19:00:00` до `D 18:59:59.999` (время сервера). «Текущий рабочий день»
= завтрашняя дата, если на сервере уже ≥ 18:30, иначе сегодняшняя.

```ts
{
  orders: {
    id: number; status: string; statusLabel: string; total: number; createdAt: string;
    pickerId: number | null;
    customer: CustomerShort;
    itemsCount: number;
    checkedCount: number;      // позиций с проверкой сборщика
    hasIssues: boolean;        // есть проверка с кодом ≠ "ok"
  }[];
} & Paging & {
  filters: { date: string /* "" = все */; businessToday: string; customer: string; status: string };
  todayCounts: {               // «чипсы» над списком — ВСЕГДА за текущий рабочий день
    total: number;
    byStatus: { status: string; label: string; count: number }[]; // 7 статусов в порядке воронки
  };
}
```

Веб скрывает чипсы `exported`/`cancelled` с `count = 0`.

### GET /api/team/orders/:id — A, M

Всё, что `app/admin/orders/[id]/page.tsx` передаёт в `AdminOrderClient`, кроме чата с клиентом
(его брать из `GET /api/admin/orders/:id/customer-messages`). 400 — нечисловой id, 404 — нет заказа.

```ts
{
  order: {
    id: number; status: string; statusLabel: string; total: number;
    comment: string | null;
    customerConfirmed: boolean;           // клиент подтвердил изменения
    changesSnapshot: null | {             // последние правки менеджера (PUT items)
      added:   { productName: string; quantity: number; price: number; variantName: string | null }[];
      removed: { productName: string; quantity: number; price: number; variantName: string | null }[];
      changed: { productName: string; oldQty: number; newQty: number; price: number; variantName: string | null }[];
    };
    oneCExportedAt: string | null; bitrixDealId: number | null;
    createdAt: string; updatedAt: string;
    customerId: number;
    customer: {
      id: number; companyName: string | null; name: string | null; phone: string | null;
      email: string | null; city: string | null; inn: string | null; manager: string | null;
      priceType: string;
    };
    pickerId: number | null;
    picker: { id: number; name: string } | null;      // назначенный сборщик
    items: {                                          // по id asc
      id: number; productId: number; productName: string;
      barcode: string | null;                         // из позиции, иначе из каталога
      quantity: number; price: number; total: number;
      variantName: string | null; variantImageUrl: string | null;
      imagePath: string | null;                       // первое фото товара (сырой path)
      imageUrl: string | null;                        // абсолютный URL
      check: null | {
        status: string;                               // сырой формат (см. выше)
        statuses: string[]; hasIssues: boolean;
        note: string | null; availableQty: number | null;
        picker: { name: string } | null;
        updatedAt: string;                            // OrderItemCheck.checkedAt
      };
      photos: { id: number; url: string; createdAt: string }[];
    }[];
    messages: {                                       // чат сборщик↔менеджер (source="picker"), asc
      id: number; text: string;
      isFromPicker: boolean;                          // true = написал сотрудник с ролью picker
      userId: number | null; userName: string | null; userRole: string | null;
      createdAt: string;
    }[];
    statusLogs: {                                     // история статусов, asc
      id: number; fromStatus: string | null; toStatus: string;
      userId: number | null; userName: string | null; createdAt: string;
    }[];
  };
  pickers: { id: number; name: string }[];           // все User с role="picker", по имени
  allowedTransitions: string[];                       // ORDER_STATUS_TRANSITIONS[status] — что примет POST .../status
  actions: { label: string; to: string }[];           // кнопки веб-интерфейса (ORDER_STATUS_ACTIONS)
  canEditItems: boolean;                              // status ∈ pending|consultation|assembly
  statusLabels: StatusLabels;
  customerMessagesUrl: string;                        // "/api/admin/orders/:id/customer-messages"
}
```

Для опроса чата сборщика можно использовать `GET /api/picker/messages/:id` (та же форма сообщений, без `userRole`).

### GET /api/team/customers — A, M

Список `app/admin/customers/page.tsx`, по 50, `createdAt desc`.

Query: `q` (name/companyName/email без регистра, phone — подстрока), `status` = `""` | `approved`
(`isApproved=true`) | `pending` (`isApproved=false`) | `blocked` (`isActive=false`), `page`.

```ts
{
  customers: {
    id: number; name: string | null; companyName: string | null; phone: string | null;
    email: string | null; inn: string | null; city: string | null;
    priceType: string;            // retail | discount | wholesale | big_wholesale
    priceTypeLabel: string;       // Розница | Скидка | Опт | Крупный опт
    isActive: boolean;            // false = «Заблокирован»
    isApproved: boolean;          // true = «Подтверждён», false = «Ожидает»
    manager: string | null;       // менеджер из 1С (текст)
    displayName: string;          // companyName || name || "—"
    createdAt: string;
  }[];
} & Paging & { filters: { q: string; status: string } }
```

### GET /api/team/customers/:id — A, M

Поля формы `app/admin/customers/[id]/page.tsx` (без хэша пароля). 400 / 404.

```ts
{
  customer: {
    id: number; name: string | null; companyName: string | null; phone: string | null;
    email: string | null; inn: string | null; city: string | null; address: string | null;
    oneCId: string | null; manager: string | null;
    priceType: string; priceTypeLabel: string;
    isActive: boolean; isApproved: boolean;
    role: string;                 // всегда "customer"
    displayName: string;
    ordersCount: number;
    createdAt: string; updatedAt: string;
  }
}
```

> Редактирование карточки клиента на сайте сделано server action'ом — **API для изменения полей
> клиента нет**. Доступны только approve/block (ниже).

### GET /api/team/stats — A, M

Данные `app/admin/stats/page.tsx`. Query `period` = `all` (по умолчанию) | `365d` | `90d` | `30d`
— влияет **только** на `topCustomers`. Неизвестное значение = `all`.

```ts
{
  period: "all" | "365d" | "90d" | "30d";
  today: { ordersCount: number; revenue: number /* вкл. cancelled */; ordersWithIssues: number };
  weekOrdersCount: number;                  // с 00:00 шесть дней назад (7 дней вкл. сегодня)
  avgOrderValue: number;                    // средний чек за всё время без cancelled, округлён
  nonCancelledOrdersCount: number;
  week: { date: string /* YYYY-MM-DD (UTC-ключ, как на сайте) */; count: number; total: number }[]; // 7 элементов, старые → новые
  statusDistribution: { status: string; label: string; count: number; percent: number }[]; // все статусы кроме exported, по count desc
  topCustomers: {                           // до 10, по сумме desc, без cancelled, за period
    customerId: number; displayName: string;
    name: string | null; companyName: string | null;
    priceType: string | null; priceTypeLabel: string | null;
    ordersCount: number; totalSpent: number; avgOrder: number;
  }[];
  topProducts: { productName: string; qty: number; revenue: number }[]; // до 10 за 7 дней, по qty desc
  checks: {                                 // результаты проверок сборщиков за 90 дней (≤10 000 записей)
    total: number;
    byStatus: { status: string; label: string; count: number; percent: number }[];
  };
}
```

### GET /api/team/users — **только A**

Как `app/admin/users/page.tsx` (менеджер получает 403). `createdAt desc`.

```ts
{
  users: { id: number; name: string; login: string; role: string; roleLabel: string; createdAt: string; isSelf: boolean }[];
  totalCount: number;
  roleLabels: Record<string, string>;
}
```

### GET /api/team/users/:id — **только A**

```ts
{
  user: {
    id: number; name: string; login: string; role: string; roleLabel: string;
    createdAt: string; updatedAt: string;
    assignedOrdersCount: number;
    isSelf: boolean;
    canDelete: boolean;           // веб не даёт удалить себя
  };
  roleOptions: { value: Role; label: string }[];
}
```

### GET /api/team/picker/orders — A, M, P

Как `app/picker/page.tsx`: **все** заказы в статусе `assembly` (не только назначенные мне).
Сортировка: сначала назначенные текущему пользователю, потом остальные; внутри — старые первыми.

```ts
{
  currentUserId: number;
  orders: {
    id: number; status: "assembly"; comment: string | null; createdAt: string;
    pickerId: number | null; picker: { id: number; name: string } | null;
    isMine: boolean;              // «Мой заказ»
    isAssignedToOther: boolean;   // «Назначен другому»
    customer: CustomerShort; clientName: string;
    itemsCount: number; checkedCount: number; allChecked: boolean; hasIssues: boolean;
    progress: "not_started" | "in_progress" | "all_ok" | "has_issues";
    itemsPreview: { id: number; productName: string; variantName: string | null; quantity: number }[]; // первые 3
  }[];
}
```

### GET /api/team/picker/orders/:id — A, M, P

Как `app/picker/[orderId]/page.tsx`. 400 / 404; если заказ **не** в `assembly` →
`409 { error: "Этот заказ не на стадии сборки", status: string }`.
Чат — через `/api/picker/messages/:id`.

```ts
{
  currentUserId: number;
  order: {
    id: number; status: "assembly"; comment: string | null; total: number; createdAt: string;
    pickerId: number | null; picker: { id: number; name: string } | null;
    customer: CustomerShort;
    items: {                                  // по id asc
      id: number; productId: number; productName: string;
      barcode: string | null;                 // из позиции, иначе из каталога (для сканера)
      quantity: number; price: number; total: number;
      variantName: string | null; variantImageUrl: string | null;
      imageUrl: string | null;                // первое фото товара, абсолютный URL
      check: null | {
        status: string; statuses: string[];
        availableQty: number | null; note: string | null;
        pickerId: number | null; checkedAt: string;
      };
      photos: { id: number; url: string; createdAt: string }[];
    }[];
  };
}
```

---

## 2. Существующие маршруты, которые использует приложение

### Вход / выход

**POST /api/admin/login** — без авторизации.
Body `{ login: string; password: string }`.
200 `{ success: true; role: string }` + Set-Cookie `admin_token`. 401 `{ error: "Неверный логин или пароль" }`.
После входа: `role === "picker"` → экран сборщика, иначе — админ-экраны.

**POST /api/admin/logout** — A, M. 200 `{ success: true }`, удаляет cookie.
⚠ Для `picker` middleware отвечает 403 и cookie **не** удаляется — приложение должно просто
стереть cookie у себя (то же происходит и на сайте).

### Заказы (A, M)

**POST /api/admin/orders/:id/status** — смена статуса.
Body `{ status: OrderStatus }`. Разрешённые переходы (`ORDER_STATUS_TRANSITIONS`):
`pending→assembly|cancelled`, `approved→assembly|payment|cancelled`,
`assembly→pending|approved|consultation|payment|cancelled`, `consultation→assembly|payment|cancelled`,
`payment→assembly|consultation|exported|cancelled`; из `exported`/`cancelled` — никуда.
Переход в `assembly`/`pending`/`approved` удаляет все проверки сборщика; в
`assembly`/`consultation`/`pending`/`approved` сбрасывает `customerConfirmed`. Пишет лог, шлёт письмо клиенту.
200 `{ order: OrderRow }`, 400 `{ error: "Нельзя перейти из \"x\" в \"y\"" }`, 404.

```ts
type OrderRow = {               // «сырая» строка Order
  id: number; customerId: number; status: string; total: number; comment: string | null;
  oneCExportedAt: string | null; bitrixDealId: number | null; customerConfirmed: boolean;
  changesSnapshot: unknown | null; pickerId: number | null; createdAt: string; updatedAt: string;
};
```

**POST /api/admin/orders/:id/approve** — без body; переводит в `approved` по той же таблице
переходов (фактически возможно только из `assembly`). 200 `{ success: true; order: OrderRow }`, 400, 404.

**POST /api/admin/orders/:id/assign** — назначить сборщика.
Body `{ pickerId: number | null }` (`null` — снять). Только User с `role="picker"`, иначе 404 `{ error: "Сборщик не найден" }`.
200 `{ order: { id: number; pickerId: number | null; picker: { id: number; name: string } | null } }`.

**PUT /api/admin/orders/:id/items** — редактирование состава. Только при статусе
`pending|consultation|assembly`, иначе 400.

```ts
// body
{
  items?:    { id: number; quantity: number; price: number; variantName?: string | null; variantImageUrl?: string | null }[]; // изменить существующие
  removeIds?: number[];                                                                                                     // удалить (вместе с проверками и фото)
  newItems?: { productId: number; productName: string; barcode?: string | null; quantity: number; price: number;
               variantName?: string | null; variantImageUrl?: string | null }[];
}
```
quantity округляется и ≥1, price округляется и ≥0, `total = qty*price`. Пересчитывает `Order.total`,
ставит `customerConfirmed=false`, пишет `changesSnapshot`.
400 `{ error: "Позиция N не принадлежит заказу" }`. 200 `{ order }` — Prisma-объект:
`OrderRow & { customer: {companyName,name,phone,city,inn}; picker: {id,name}|null;
items: (OrderItemRow & { check: (CheckRow & { picker: {name}|null }) | null; photos: {id,orderItemId,url,createdAt}[] })[];
messages: (MessageRow & { user: {name,role}|null })[] /* ОБА чата */; statusLogs: StatusLogRow[] }`.
Проще после успеха перезапросить `GET /api/team/orders/:id`.

**POST /api/admin/orders/bulk-status** — Body `{ orderIds: number[]; toStatus: string }`.
Заказы с недопустимым переходом пропускаются. Без писем и без удаления проверок.
200 `{ updated: number[]; skipped: number[] }`, 400 если пусто.

**GET /api/admin/orders/count** — бейдж. 200 `{ pending: number; consultation: number; total: number }`.

**GET /api/admin/orders/export** — XML (CommerceML) заказов в статусах `approved`/`payment`,
`Content-Type: application/xml`, файл `Orders.xml`; статусы не меняет.
**POST /api/admin/orders/export** — тот же XML и **переводит** эти заказы в `exported`
(`oneCExportedAt = now`, лог). Ответ — XML-файл, не JSON.

### Чат с клиентом (A, M)

**GET /api/admin/orders/:id/customer-messages** →
`{ messages: { id: number; text: string; isFromPicker: boolean /* true = сотрудник, false = клиент */; userName: string | null /* только для сотрудника */; createdAt: string }[] }` (asc).

**POST /api/admin/orders/:id/customer-messages** — Body `{ text: string }` (1…4000 символов, обрезается trim).
Сообщение от сотрудника (`isFromPicker: true`), клиенту уходит email.
200 `{ message: { id; text; isFromPicker: true; userName: string | null; createdAt } }`, 400.

### Сборка (A, M, P — проверяют cookie сами, middleware их не трогает)

**GET /api/picker/messages/:orderId** — чат сборщик↔менеджер.
`{ messages: { id: number; text: string; isFromPicker: boolean; userName: string | null; userId: number | null; createdAt: string }[] }` (asc).

**POST /api/picker/messages/:orderId** — Body `{ text: string }` (1…4000). `isFromPicker = (role === "picker")`.
200 `{ message: <как в GET> }`, 400, 401.

**POST /api/picker/checks** — отправить результаты проверки. Заказ должен быть в `assembly` (иначе 400).
```ts
{
  orderId: number;
  items: {
    itemId: number;                                   // OrderItem.id этого заказа (иначе 403)
    statuses?: CheckCode[];                           // старый формат
    statusData?: (CheckCode | { s: CheckCode; q: number })[]; // предпочтительно: с количествами
    status?: CheckCode;                               // legacy
    availableQty?: number | null;                     // для insufficient_qty
    note?: string | null;
  }[];
}
```
Если после записи проверены **не все** позиции заказа:
200 `{ success: true; partial: true; checked: number; total: number; message: string }`.
Если все: заказ → `consultation` (есть проблемы) или `payment` (всё ок), лог;
200 `{ success: true; partial: false; checked: number; total: number; newStatus: "consultation" | "payment" }`.
Назначенность сборщика не проверяется.

**POST /api/picker/photos** — `multipart/form-data`: `file` (картинка), `orderItemId`.
200 `{ photo: { id: number; orderItemId: number; url: string /* /uploads/order-photos/... */; createdAt: string } }`, 400.
Тип/размер файла не проверяются — сжимайте на клиенте.

**POST /api/uploads/chat** — `multipart/form-data`: `file` (только `image/*`, ≤10 МБ). Также доступен клиентам.
200 `{ url: string /* /uploads/chat/... */ }`. Чтобы отправить фото в чат — POST сообщение с
`text = JSON.stringify({ _t: "img", url })`.

### Товары (A, M; picker — 403 из-за middleware)

**GET /api/admin/products** — `?q=` (≥2 символа: name/barcode/article), `limit` (≤50, по умолч. 20), `offset`. По имени.
`{ products: { id; name; barcode: string|null; article: string|null; imageUrl: string|null; imageCount: number; variantCount: number }[]; hasMore: boolean }`.

**GET /api/admin/products/search** — каталог для добавления в заказ/чат. `?q=` (≥2), `limit` (≤100, по умолч. 40),
`offset`, `categoryGuid` (включая все подкатегории).
`{ products: { id; name; barcode: string|null; article: string|null; stock: number|null; price: number /* wholesale → big_wholesale → retail → первая */; prices: { priceType: string; price: number }[]; imagePath: string|null; hasVariants: boolean }[]; hasMore: boolean }`.

**GET /api/admin/products/:id** — `{ product: { id; name; barcode; article; guid: string; images: { id: number; path: string }[] } }`, 404 `{ error: "Не найден" }`.

**GET /api/admin/products/:id/variants** —
`{ variants: { id; imageId; imageUrl: string; name: string; sortOrder: number }[]; images: { id; path; url }[] }`.
**PUT /api/admin/products/:id/variants** — Body `{ variants: { imageId: number; name: string; sortOrder?: number }[] }`
(заменяет все варианты). 200 `{ variants: [...как в GET] }`, 404.

**POST /api/admin/products/:id/images** — `multipart/form-data`, поле `image` (jpeg/png/webp/gif).
**Заменяет** все фото товара одним. 200 `{ success: true; path: string; id: number }`.
**DELETE /api/admin/products/:id/images** — удаляет все фото. 200 `{ success: true }`.

**GET /api/admin/categories** — `{ categories: { id: number; guid: string; name: string; parentGuid: string | null }[] }` (по имени; дерево строится по `parentGuid`).

### Клиенты (A, M)

**POST /api/admin/customers/:id/approve** — `isApproved = true`. 200 `{ success: true }`, 500 `{ error }`.
**POST /api/admin/customers/:id/block** — ⚠ ставит `isApproved = false` (а НЕ `isActive=false`),
т. е. возвращает в «Ожидает». 200 `{ success: true }`.

### Сотрудники

**POST /api/admin/users** — Body `{ name: string; login: string; password: string; role?: Role }`.
400 — не заполнено / недопустимая роль / логин занят. 200 `{ success: true }` (id не возвращается — перезапросите список).
**PATCH /api/admin/users/:id** — Body `{ name?; login?; password?; role? }` (пустые значения игнорируются). 200 `{ success: true }`.
**DELETE /api/admin/users/:id** — 200 `{ success: true }`.

⚠ Эти три маршрута пропускают **A и M** (`requireAdmin`), хотя веб-страницы сотрудников только для A,
и не валидируют роль в PATCH, длину пароля, уникальность логина в PATCH (будет 500), удаление самого себя.
Приложение должно показывать раздел только админу и само проверять: пароль ≥ 6 символов,
роль ∈ admin|manager|picker, нельзя удалить себя (`isSelf`).

### Импорт из 1С (A, M)

**GET /api/admin/import/1c** — `{ status: "API импорта работает" }`.
**POST /api/admin/import/1c** — запускает `npm run import:1c` (долго, минуты).
200 `{ success: true; products: number; categories: number; brands: number; prices: number; images: number; duration: string /* "12.3 сек" */ }`,
500 `{ success: false; error: "Ошибка импорта" }`.

**GET /api/admin/import-customers** — `{ status: "API импорта контрагентов работает" }`.
**POST /api/admin/import-customers** — `npm run import:customers`.
200 `{ success: true; customers: number; duration: string }`, 500 `{ success: false; error: string }`.

---

## Права доступа — сводка

| Раздел | admin | manager | picker |
|---|---|---|---|
| `/api/team/me` | ✓ | ✓ | ✓ |
| dashboard, orders, customers, stats (`/api/team/*`) | ✓ | ✓ | 403 |
| users (`/api/team/users*`) | ✓ | 403 | 403 |
| `/api/team/picker/*` | ✓ | ✓ | ✓ |
| `/api/admin/*` (кроме login) | ✓ | ✓ | 403 (middleware) |
| `/api/picker/*`, `/api/uploads/chat` | ✓ | ✓ | ✓ |

Права определяются ролью **в JWT**; после смены роли сотруднику нужно перелогиниться.
