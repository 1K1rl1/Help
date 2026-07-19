Node setup & smoke test

1. Install Node.js (>=16)
2. From project folder run:

```bash
npm install
npm start
```

3. To test notify roundtrip (without BOT_TOKEN):

- start `parse_messenger_errors.py` (Flask)
- start `max_bot.js` with no BOT_TOKEN
- POST to `http://localhost:3000/notify` with JSON payload, e.g.:`{ "chat_id": "test", "text": "OK" }`

The notify server will attempt to send messages if `BOT_TOKEN` present; otherwise it will just accept and log the request.
