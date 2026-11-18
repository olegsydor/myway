# My Way

My Way graph workspace: FastAPI/PostgreSQL backend and React Flow frontend.

**Current stage: Stage 19 — Authentication and User Lifecycle, completed and locally accepted on 2026-11-18.**

See [Stage 19 completion, local setup, migration and operator guide](docs/stage-19.md). Registration/login, verified email, server sessions, password recovery and account blocking are implemented. Existing user IDs and graph/layout/annotation ownership are preserved. There is no test-user authentication fallback.

Local verification/reset emails are saved to `.local-mail/`; they are not sent to real mailboxes yet. `.env` and local mail must stay out of Git. Public HTTPS/SMTP deployment remains a separate step.

## Requirements

- Docker Desktop
- Docker Compose

## Configuration

For a fresh installation, create the local environment file from the Stage 19 example. For an existing installation, preserve its database credentials and follow the Stage 19 migration guide; do not overwrite its `.env`:

```bash
cp .env.stage19.example .env
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


## Graph frontend

For local development (Node 24 was used for Stage 19 verification):

```bash
cd poc/graph-visualization
npm ci
npm run dev
```

Open `http://localhost:5173`. The Vite proxy forwards `/api` to the local backend. Keep `PUBLIC_ORIGIN` consistent with this address. After verifying an account, sign in to open its workspace.

The primary frontend graph stack selected in Stage 5 is:

- React Flow 12.11.5
- @dagrejs/dagre 3.1.1

The React Flow frontend supports:

- graph loading from `GET /graph` after session authentication;
- creation, editing, and deletion of Nodes;
- creation, editing, and deletion of directed Edges;
- Node and Edge descriptions and Properties;
- Grid, Circle, and Dagre layouts;
- Node and Edge type filtering;
- graph-wide search across Nodes, Edges, descriptions, types, endpoints, and Properties;
- navigation to every search result;
- directed path search between two Nodes;
- backward navigation through every incoming path to a selected Node;
- detection and highlighting of unconnected Nodes;
- selection and neighbour highlighting.

The graph currently supports these Node types:

- `person`
- `place`
- `organization`
- `skill`
- `event`
- `project`
- `hobby`
- `story`

The graph currently supports these Edge types:

- `knows`
- `works_at`
- `lives_in`
- `has_skill`
- `participates_in`
- `works_on`
- `located_in`
- `leads_to`
- `family`
- `pushed`
- `shared`

The backend remains the source of truth. After successful graph mutations,
the frontend reloads the canonical graph through `GET /graph`.

Node deletion does not cascade to connected Edges. Connected Edges must
be explicitly deleted first.

Duplicate directed Edges with the same source, target, and Edge type are
not allowed.

Cytoscape.js with cytoscape-dagre is retained as the reserve renderer.
Sigma.js with Graphology and vis-network were evaluated in Stage 5 and
rejected as primary renderers.

The frontend and evaluated renderer implementations are under:

```text
poc/graph-visualization

Detailed stage documentation:
docs/stage-5.md
docs/stage-6.md
docs/stage-7.md
docs/stage-8.md
```

### Pending account deletion

In Account, confirm **Delete account** with your current password. My Way
signs out every session and locks the workspace. Signing in with the same
credentials shows the deadline. To restore access within 30 days, enter
your password again to cancel, then sign in.

After deploying the migration with `alembic upgrade head`, schedule
`python -m app.commands.auth purge-deleted-accounts` as a maintenance job
against the application database. The command permanently deletes only
accounts whose deadlines have passed and commits each account and its
workspace data in one transaction. Running it again is safe after a failed
or interrupted run. The deletion deadline closes the cancellation window
even if the maintenance job has yet to run.

### Safe Import and existing initial layouts

Import accepts an empty workspace or a workspace with only its empty initial
`Main` layout. The first normal Save records the origin of this layout.
Existing layouts lack that record. If you have verified an existing layout's
origin, pass its account and layout IDs when applying the migration. For
example, for user 5 and layout 8:

```sh
alembic -x verified_initial_layout=5:8 upgrade head
```

The migration checks that the specified row is the only layout, is the
default `Main`, and that the workspace has no nodes, edges, annotations,
or saved positions. It records the layout's origin. The import transaction
rechecks eligibility and replaces the layout only when the import succeeds.
