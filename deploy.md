# Инструкция по развертыванию uploading_ozon_orders_to_the_database

Пошаговая инструкция для развертывания скрипта выгрузки **заказов Ozon (FBO и FBS)** на сервере Ubuntu 24.04 с FASTPANEL.

## Описание

Скрипт:
- Использует **Ozon Seller API** (POST /v2/posting/fbo/list и POST /v3/posting/fbs/list)
- Выгружает заказы за последние 30 дней (исключая сегодня)
- Сохраняет данные о заказах и товарах в PostgreSQL
- Защита от дубликатов (UPSERT по posting_number)
- Ведёт технические логи выполнения в БД
- Запускается каждые 30 минут через cron

---

## API Ozon Seller

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/v2/posting/fbo/list` | Получить список FBO отправлений |
| POST | `/v3/posting/fbs/list` | Получить список FBS отправлений |

### Заголовки авторизации

| Заголовок | Описание |
|-----------|----------|
| `Client-Id` | Идентификатор клиента (числовой) |
| `Api-Key` | API-ключ (UUID формат) |

### Лимиты API Ozon

| Ограничение | Значение |
|-------------|----------|
| Запросов в минуту | ~60 |
| Записей на страницу (limit) | До 1000 |
| Глубина выборки | Рекомендуется до 3 месяцев |

### Структура ответа `/v2/posting/fbo/list`

```json
{
  "result": [
    {
      "posting_number": "12345678-0001-1",
      "order_id": 12345678,
      "order_number": "12345678-0001",
      "status": "delivered",
      "created_at": "2025-01-15T10:30:00Z",
      "in_process_at": "2025-01-15T11:00:00Z",
      "shipment_date": "2025-01-16T00:00:00Z",
      "products": [
        {
          "sku": 123456789,
          "name": "Название товара",
          "offer_id": "ARTICLE-001",
          "quantity": 2,
          "price": "1500.00"
        }
      ],
      "analytics_data": {
        "city": "Москва",
        "region": "Московская область",
        "warehouse": "Склад Ozon"
      },
      "financial_data": {
        "products": [
          {
            "product_id": 123456789,
            "commission_amount": 150.00,
            "payout": 2850.00
          }
        ]
      }
    }
  ]
}
```

### Статусы заказов Ozon

| Статус | Описание |
|--------|----------|
| `awaiting_packaging` | Ожидает упаковки |
| `awaiting_deliver` | Ожидает отгрузки |
| `delivering` | В доставке |
| `delivered` | Доставлен |
| `cancelled` | Отменён |

---

## Требования

- Ubuntu 24.04
- Node.js 18.x или выше
- PostgreSQL (доступ к БД)
- API токен Ozon (Client-Id и Api-Key)

---

## Шаг 1: Подключение к серверу

### Через SSH:
```bash
ssh root@109.73.194.111
# Пароль: w8hDWrMybh6-bH
```

---

## Шаг 2: Проверка Node.js

```bash
node --version
# Ожидается: v18.19.1 или выше

npm --version
# Ожидается: 10.x или выше
```

Если Node.js не установлен:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
```

---

## Шаг 3: Копирование проекта на сервер

### Вариант A: Через SCP
```bash
scp -r uploading_ozon_orders_to_the_database root@109.73.194.111:/opt/
# Пароль: w8hDWrMybh6-bH
```

### Вариант B: Через SCP (архив)
```bash
scp uploading_ozon_orders_to_the_database.zip root@109.73.194.111:/opt/
ssh root@109.73.194.111
cd /opt
unzip uploading_ozon_orders_to_the_database.zip
```

### Вариант C: Через Git
```bash
cd /opt
git clone <URL_репозитория> uploading_ozon_orders_to_the_database
```

---

## Шаг 4: Установка зависимостей

```bash
cd /opt/uploading_ozon_orders_to_the_database
npm install
```

### Ожидаемый вывод:
```
added 2 packages in 2s
```

---

## Шаг 5: Настройка конфигурации (.env)

```bash
nano .env
```

Заполните `.env`:

```env
# Ozon Seller API
OZON_CLIENT_ID=2843272
OZON_API_KEY=76fb74b8-0018-48f6-aa5b-ba7e04cff1a2
OZON_API_URL=https://api-seller.ozon.ru

# PostgreSQL Database
PG_HOST=176.124.219.60
PG_PORT=5432
PG_USER=gen_user
PG_PASSWORD=y>D4~;f^YLgFA|
PG_DATABASE=default_db

# Настройки запросов
REQUEST_LIMIT=1000
REQUEST_DELAY_MS=300
MAX_RETRIES=5
RETRY_BACKOFF_MS=2000
DAYS_TO_FETCH=30
```

Сохраните: `Ctrl+X`, затем `Y`, затем `Enter`.

### Параметры конфигурации

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `OZON_CLIENT_ID` | Client-Id из личного кабинета Ozon | - |
| `OZON_API_KEY` | Api-Key из личного кабинета Ozon | - |
| `OZON_API_URL` | Базовый URL API | `https://api-seller.ozon.ru` |
| `REQUEST_LIMIT` | Записей на страницу (макс. 1000) | `1000` |
| `REQUEST_DELAY_MS` | Задержка между запросами | `300` |
| `MAX_RETRIES` | Макс. повторов при ошибке | `5` |
| `RETRY_BACKOFF_MS` | Базовая задержка для backoff | `2000` |
| `DAYS_TO_FETCH` | Глубина выборки в днях | `30` |

### Где найти Client-Id и Api-Key

1. Войдите в личный кабинет Ozon Seller: https://seller.ozon.ru/
2. Перейдите: **Настройки** → **API ключи**
3. Создайте новый ключ или скопируйте существующий
4. `Client-Id` — числовой идентификатор продавца
5. `Api-Key` — строка в формате UUID

---

## Шаг 6: Создание таблиц в БД

### Способ 1: Через npm скрипт
```bash
cd /opt/uploading_ozon_orders_to_the_database
npm run init-db
```

### Способ 2: Через psql
```bash
apt update && apt install -y postgresql-client
psql -h 176.124.219.60 -U gen_user -d default_db -f /opt/uploading_ozon_orders_to_the_database/sql/init.sql
# Введите пароль: y>D4~;f^YLgFA|
```

### Способ 3: Подключиться и выполнить вручную
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль

# В psql:
\i /opt/uploading_ozon_orders_to_the_database/sql/init.sql

# Проверьте создание таблиц:
\dt

# Должны появиться:
#  ozon_orders
#  ozon_order_products
#  ozon_sync_log

\q
```

### Структура таблиц

| Таблица | Назначение |
|---------|------------|
| `ozon_orders` | Информация о заказах/отправлениях |
| `ozon_order_products` | Товары в заказах |
| `ozon_sync_log` | Логи выполнения синхронизации |

---

## Шаг 7: Тестовый запуск

```bash
cd /opt/uploading_ozon_orders_to_the_database
node src/app.js
```

### Ожидаемый вывод:

```
============================================================
Ozon Orders Sync started at 2025-02-03T12:00:00.000Z
Fetching orders for last 30 days (excluding today)
============================================================
Database initialized
Date range: 2025-01-04 to 2025-02-02
Fetching FBO postings...
FBO: processed 100 orders...
FBO completed: 250 fetched, 200 new, 50 updated
Fetching FBS postings...
FBS: processed 100 orders...
FBS completed: 180 fetched, 150 new, 30 updated
============================================================
Summary:
  Period: 2025-01-04 - 2025-02-02
  FBO: 250 orders (200 new, 50 updated)
  FBS: 180 orders (150 new, 30 updated)
  Total orders: 430
  Total products: 650
============================================================
```

---

## Шаг 8: Настройка Cron (каждые 30 минут)

```bash
crontab -e
```

Добавьте строку:
```cron
*/30 * * * * cd /opt/uploading_ozon_orders_to_the_database && /usr/bin/node src/app.js >> /var/log/uploading_ozon_orders_to_the_database.log 2>&1
```

Сохраните и выйдите: `Ctrl+X`, затем `Y`, затем `Enter`.

### Проверка cron:
```bash
crontab -l
```

### Создание файла лога:
```bash
touch /var/log/uploading_ozon_orders_to_the_database.log
chmod 644 /var/log/uploading_ozon_orders_to_the_database.log
```

---

## Шаг 9: Проверка работы

### Просмотр логов в реальном времени:
```bash
tail -f /var/log/uploading_ozon_orders_to_the_database.log
```

### Проверка данных в БД:
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль: y>D4~;f^YLgFA|
```

```sql
-- Количество заказов
SELECT COUNT(*) FROM ozon_orders;

-- Количество по типам (FBO/FBS)
SELECT posting_type, COUNT(*) as orders, 
       SUM((SELECT COUNT(*) FROM ozon_order_products WHERE posting_number = o.posting_number)) as products
FROM ozon_orders o
GROUP BY posting_type;

-- Последние заказы
SELECT posting_number, order_id, posting_type, status, created_at, warehouse_name,customer_city
FROM ozon_orders
ORDER BY created_at DESC
LIMIT 20;

-- Заказы по статусам
SELECT status, COUNT(*) as count
FROM ozon_orders
GROUP BY status
ORDER BY count DESC;

-- Товары в заказах
SELECT op.posting_number, op.sku, op.name, op.offer_id, 
       op.quantity, op.price, op.payout
FROM ozon_order_products op
JOIN ozon_orders o ON op.posting_number = o.posting_number
ORDER BY o.created_at DESC
LIMIT 20;

-- Топ-10 продаваемых товаров
SELECT op.sku, op.name, op.offer_id,
       SUM(op.quantity) as total_qty,
       SUM(op.price * op.quantity) as total_revenue
FROM ozon_order_products op
GROUP BY op.sku, op.name, op.offer_id
ORDER BY total_qty DESC
LIMIT 10;

-- Продажи по городам
SELECT customer_city, COUNT(*) as orders,
       SUM((SELECT SUM(price * quantity) FROM ozon_order_products WHERE posting_number = o.posting_number)) as revenue
FROM ozon_orders o
WHERE customer_city IS NOT NULL
GROUP BY customer_city
ORDER BY orders DESC
LIMIT 10;

-- Логи синхронизации
SELECT job_start, job_end, status, posting_type,
       orders_fetched, orders_inserted, orders_updated,
       products_count, http_requests, retries,
       EXTRACT(EPOCH FROM (job_end - job_start))::int AS duration_sec
FROM ozon_sync_log
ORDER BY job_start DESC
LIMIT 10;

-- Ошибки синхронизации
SELECT job_start, posting_type, status, error_message
FROM ozon_sync_log
WHERE status = 'failed'
ORDER BY job_start DESC
LIMIT 5;
```

---

## Структура проекта

```
uploading_ozon_orders_to_the_database/
├── src/
│   ├── app.js                # Точка входа
│   ├── config.js             # Конфигурация из .env
│   ├── database.js           # Подключение к PostgreSQL
│   ├── api/
│   │   └── ozon.js           # Ozon Seller API
│   ├── services/
│   │   └── syncOrders.js     # Логика синхронизации
│   └── utils/
│       └── logger.js         # Логирование
├── sql/
│   └── init.sql              # SQL для создания таблиц
├── .env                      # Конфигурация (НЕ коммитить!)
├── .env.example              # Пример конфигурации
├── .gitignore
├── package.json
└── deploy.md                 # Эта инструкция
```

---

## Устранение неполадок

### Ошибка подключения к БД

1. Проверьте доступность PostgreSQL:
   ```bash
   nc -zv 176.124.219.60 5432
   ```

2. Проверьте данные в `.env`

3. Тест подключения:
   ```bash
   psql -h 176.124.219.60 -U gen_user -d default_db -c "SELECT 1;"
   ```

### Ошибка API (401 Unauthorized)

1. Проверьте `OZON_CLIENT_ID` и `OZON_API_KEY` в `.env`
2. Убедитесь, что ключ активен в личном кабинете Ozon
3. Проверьте, что Client-Id — это числовой ID, а Api-Key — UUID

### Ошибка API (403 Forbidden)

1. Проверьте права доступа API ключа
2. Убедитесь, что ключ имеет доступ к нужным методам

### Ошибка API (429 Too Many Requests)

Скрипт автоматически обрабатывает rate limiting с экспоненциальным backoff.
Если ошибка повторяется:
1. Увеличьте `REQUEST_DELAY_MS` в `.env` до 500-1000
2. Уменьшите `REQUEST_LIMIT` до 500

### Ошибка API (5xx Server Error)

Скрипт автоматически делает до 5 повторов с увеличивающейся задержкой.
Если проблема сохраняется — проверьте статус Ozon API.

### Cron не работает

1. Проверьте статус cron:
   ```bash
   systemctl status cron
   ```

2. Проверьте логи:
   ```bash
   grep CRON /var/log/syslog
   ```

3. Перезапустите cron:
   ```bash
   systemctl restart cron
   ```

4. Проверьте путь к node:
   ```bash
   which node
   # Должно быть: /usr/bin/node
   ```

### Нет данных за период

1. Проверьте, есть ли заказы в личном кабинете Ozon за этот период
2. Убедитесь, что `DAYS_TO_FETCH` установлен корректно
3. Проверьте даты в логах синхронизации

---

## Полезные команды

```bash
# Ручной запуск
cd /opt/uploading_ozon_orders_to_the_database && node src/app.js

# Просмотр последних логов
tail -100 /var/log/uploading_ozon_orders_to_the_database.log

# Статистика синхронизаций
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT status, posting_type, COUNT(*), 
          AVG(EXTRACT(EPOCH FROM (job_end - job_start)))::int as avg_sec,
          SUM(orders_fetched) as total_orders
   FROM ozon_sync_log GROUP BY status, posting_type;"

# Очистка старых логов (старше 30 дней)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "DELETE FROM ozon_sync_log WHERE job_start < NOW() - INTERVAL '30 days';"

# Количество записей по таблицам
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT 'ozon_orders' as table_name, COUNT(*) FROM ozon_orders
   UNION ALL SELECT 'ozon_order_products', COUNT(*) FROM ozon_order_products
   UNION ALL SELECT 'ozon_sync_log', COUNT(*) FROM ozon_sync_log;"

# Заказы за последнюю неделю
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT DATE(created_at) as date, posting_type, COUNT(*) as orders
   FROM ozon_orders
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at), posting_type
   ORDER BY date DESC;"

# Выручка по дням
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT DATE(o.created_at) as date, 
          SUM(op.price * op.quantity) as revenue
   FROM ozon_orders o
   JOIN ozon_order_products op ON o.posting_number = op.posting_number
   WHERE o.created_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(o.created_at)
   ORDER BY date DESC;"

# Отменённые заказы
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT posting_number, order_id, created_at, cancel_reason_id
   FROM ozon_orders WHERE status = 'cancelled'
   ORDER BY created_at DESC LIMIT 20;"
```

---

## Мониторинг

### Проверка последней успешной синхронизации
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT posting_type, job_start, job_end, orders_fetched
   FROM ozon_sync_log WHERE status = 'success'
   ORDER BY job_start DESC LIMIT 2;"
```

### Алерт если синхронизация не работает более 1 часа
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT CASE 
     WHEN MAX(job_start) < NOW() - INTERVAL '1 hour' THEN 'ALERT: No sync in last hour!'
     ELSE 'OK: Last sync at ' || MAX(job_start)::text
   END FROM ozon_sync_log WHERE status = 'success';"
```

---
