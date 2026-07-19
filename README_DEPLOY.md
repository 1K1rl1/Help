# Deployment

## Docker Compose (recommended)

1. Copy `.env.example` to `.env` and fill in secrets:
   - `BOT_TOKEN`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `EXCEL_DRIVE_ID`
   - `EXCEL_ITEM_ID`
   - `NOTIFICATION_CHAT_ID`

2. Build and start:
   ```bash
   docker compose up -d --build
   ```

3. Check logs:
   ```bash
   docker compose logs -f
   ```

4. Stop:
   ```bash
   docker compose down
   ```

## Hosting notes

For a VPS or cloud host, use:
- Docker + Docker Compose
- a process manager like `supervisord` or systemd
- persistent volume for the working directory
- restart policy enabled

## Health check

- Flask receiver: http://host:5000/incoming
- Notify server: http://host:3000/notify
