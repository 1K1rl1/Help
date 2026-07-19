# MAX + Excel Online parser

Скрипт принимает сообщения от бота MAX и записывает строки в Excel Online (OneDrive/SharePoint) через Microsoft Graph.

Файлы:
- `max_bot.js` — Node.js-прокси-бот для MAX, пересылает сообщения в локальный HTTP-приёмник
- `parse_messenger_errors.py` — (placeholder) Python-скрипт для парсинга/валидации и записи в Excel

## Установка

1. Установите зависимости Python:

```bash
pip install -r requirements.txt
```

2. Установите Node.js-зависимости:

```bash
npm install
```

Если в вашей среде возникают ошибки TLS, можно временно включить небезопасный режим для тестов:

```bash
set NODE_TLS_INSECURE=true
node max_bot.js
```

## Переменные окружения

- `BOT_TOKEN` — токен MAX бота
- `INCOMING_URL` — URL локального приёмника, по умолчанию `http://localhost:5000/incoming`
 - `NOTIFY_URL` — URL для уведомлений обратно в MAX (опционально), по умолчанию `http://localhost:5000/notify`
 - `NOTIFY_URL` — URL для уведомлений обратно в MAX (опционально), по умолчанию `http://localhost:5000/notify`
 - `NOTIFY_PORT` — порт, на котором `max_bot.js` будет слушать уведомления (по умолчанию `3000`)
- Azure и Excel переменные для `parse_messenger_errors.py` (см. файл)

## Запуск

1. Быстрый запуск через Docker Compose (рекомендуется):

```bash
docker compose up --build
```

2. Локально без Docker (по отдельности):

```bash
# Python receiver
python parse_messenger_errors.py

# в другом терминале: MAX bot
node max_bot.js
```

3. Одношаговый запуск на Windows:

```powershell
./run_local.ps1
```

или

```cmd
run_local.bat
```

### Тестовый режим (если нет Azure/Excel)

Если вы не хотите настраивать Azure прямо сейчас, скрипт будет записывать строки в локальный `test_output.csv`.

Переменная окружения для теста:
Если вы не хотите настраивать Azure прямо сейчас, скрипт будет записывать строки в локальный `test_output.csv` и `test_output.xlsx`.

Переменные окружения для теста:

Пример `curl` для теста:

```bash
curl -X POST http://127.0.0.1:5000/incoming -H "Content-Type: application/json" -d '{"chat":{"id":"test"},"text":"Операция: Размещение\nСотрудник(логин): user123\nИдентификатор объекта: OBJ_001\nКомментарий: тестовая запись\nФИО Начальника Участка: Иванов Иван Иванович"}'
```
