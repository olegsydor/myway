# Stage 12 — Backend layouts (checkpoints 2 and 3)

Base: 7b3c998, with migration c12a01e4b901 already applied.

## Install

Copy files individually into the corresponding existing project folders:

- app/main.py — replace the existing file (adds layouts router).
- app/routers/layouts.py — new.
- app/repositories/layout.py — new.
- app/schemas/layout.py — new.
- tests/test_layouts_api.py — new.
- docs/stage-12-backend.md — new.

No migration, dependency, or frontend changes are needed.

```bash
git diff --check
docker compose restart api
docker compose exec api pytest -q tests/test_layout_models.py tests/test_layouts_api.py
docker compose exec api pytest -q
```

Expected collection: 40 layout tests; 83 tests in the full existing suite.
The existing fixture uses the dedicated myway_test database and recreates its tables.

## API contract

| Method | Route | Result |
| --- | --- | --- |
| GET | /layouts | Owned metadata, ordered by ID |
| GET | /layouts/{id} | Owned metadata and positions ordered by node ID |
| POST | /layouts | Atomic create with full positions; 201 |
| PATCH | /layouts/{id} | Rename and/or set default; metadata response |
| PUT | /layouts/{id}/positions | Atomic full replacement; metadata and accepted positions |
| DELETE | /layouts/{id} | Delete non-default, non-only layout; 204 |

Metadata: id, name, is_default, created_at, updated_at.
Position: node_id, x, y.

POST example:

```json
{"name":"Main","positions":[{"node_id":1,"x":120.5,"y":240}]}
```

PATCH accepts a nonempty combination of name and is_default=true.
It rejects null fields, is_default=false, empty/blank names, names longer than
100 characters, and unknown fields. Names are trimmed; case-insensitive
uniqueness remains enforced by PostgreSQL. A first layout becomes default even
if the create flag is absent/false. Additional layouts remain non-default unless
explicitly requested. The frontend will use Main for its initial save.

PUT body contains positions only. Every current owned node must appear exactly
once, including hidden nodes. Missing, unknown, foreign, or stale node sets
return 409 using the same message to avoid disclosing other users' nodes.
Duplicate IDs, malformed IDs, nonnumeric/nonfinite coordinates, and structurally
invalid payloads return 422. Empty positions are valid only for an empty graph.

Unknown or foreign layout IDs return 404 for every operation. Name conflicts
and forbidden deletions return 409. The default layout cannot be deleted; set
another default first. An inconsistent legacy single non-default layout cannot
be deleted either.

## Transactions

Layout mutations lock the owner's User row FOR UPDATE to serialize layout
creation/default changes/deletion. This also blocks new node inserts through
the existing users foreign key while a snapshot is validated and committed.
Snapshot validation locks current nodes FOR SHARE against concurrent deletion.
Coordinate replacement deletes/inserts positions and updates the layout timestamp
in one transaction. Default changes remove the old default before assigning the
new one. Errors roll back the request transaction.

Responses are materialized before commit, so the save response represents the
accepted snapshot without a post-commit reread. This is not version history or
cross-client conflict merging; these remain out of scope.

The LayoutRoute validation wrapper ensures invalid JSON numeric tokens such as
NaN/Infinity return a JSON-safe 422, rather than a serialization-related 500.

## Validation status

Completed locally: Python syntax compilation, 30 integration-test collection,
OpenAPI generation, 12 HTTP validation cases without a database, and schema
normalization checks. Live PostgreSQL integration tests were not run here.
Run the Docker commands above before committing this checkpoint.

## Remaining Stage 12 work

Frontend startup/default loading, save/discard/dirty state, management controls,
unsaved-change protection, lifecycle integration, and real-graph evaluation.
Agreed refinements: missing saved positions remain dirty after Discard;
coordinate changes and node CRUD are blocked during save; failed switching
preserves the previous active layout and working coordinates.
