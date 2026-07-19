Run locally with Docker Compose:

1. Build and start both services:

```bash
docker compose up --build
```

2. Environment variables are read from `.env` in project root. Keep secrets out of repo.

3. To run only receiver:

```bash
docker compose up --build receiver
```

4. To view logs:

```bash
docker compose logs -f
```
