# My Way

My Way backend application.

## Requirements

- Docker Desktop
- Docker Compose

## Configuration

Create the local environment file from the example:

```bash
cp .env.example .env
```

The `.env` file contains the local application and database configuration
and must not be committed to Git.

## Start the project

Build and start all services:

```bash
docker compose up -d --build
```

Check running services:

```bash
docker compose ps
```

## Stop the project

```bash
docker compose down
```

PostgreSQL data is stored in a Docker volume and is preserved after
`docker compose down`.

Do not use `docker compose down -v` unless you intentionally want to
remove the database volume.

## API

Health check:

```text
http://localhost:8000/health
```

Swagger UI:

```text
http://localhost:8000/docs
```

OpenAPI schema:

```text
http://localhost:8000/openapi.json
```

## Database migrations

Create a new migration:

```bash
docker compose exec api alembic revision -m "migration description"
```

Apply all migrations:

```bash
docker compose exec api alembic upgrade head
```

Show the current migration:

```bash
docker compose exec api alembic current
```

Show migration history:

```bash
docker compose exec api alembic history
```

## Development

The project directory is mounted into the API container:

```text
.:/app
```

Changes to project files are therefore immediately visible inside the
container.

If Python dependencies or the Docker image configuration change, rebuild
the API image:

```bash
docker compose up -d --build api
```
