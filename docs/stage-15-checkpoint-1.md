# Stage 15 Checkpoint 1 — Annotation persistence foundation

Baseline: `c5bc2d3`. Scope: backend only; Stage 11–14 frontend, shortcuts,
positions validation, recovery and graph CRUD behavior are unchanged.

## Database contract

Migration `d15a01e4b901` follows `c12a01e4b901` and creates only
`layout_annotations`. Existing layouts receive no rows. Downgrade drops only this
table and preserves layouts and node positions.

Annotations have a composite primary key `(layout_id, annotation_id)` and a
composite owner FK `(user_id, layout_id)` with `ON DELETE CASCADE`. There are no
graph node or edge references. UUIDs may be reused by Save as New. `order_index`
is unique per layout, ranges from 0 through 1999, and preserves request order.
This also bounds stored annotation count to 2000 per layout.

Typed columns enforce finite double geometry, positive rectangle dimensions,
kind-specific required and forbidden fields, and semantic style values:

- Colors: gray, blue, green, yellow, red, purple.
- Rectangle fill: none, light, medium; border: thin, normal, thick.
- Text size: small, medium, large.
- Text: 1–2000 Unicode characters, with at least one non-whitespace character.
  Validation preserves content and explicit line breaks; it never trims stored text.
  The SQL whitespace set matches Python's Unicode `str.strip()` whitespace set.

## API contract

- GET `/layouts/{id}` includes ordered `annotations`, defaulting naturally to `[]`
  for an existing layout with no annotation rows.
- POST `/layouts` accepts annotations together with positions; omission remains
  backward compatible and means `[]`.
- PUT `/layouts/{id}/workspace` requires both complete `positions` and
  `annotations` arrays. An empty annotation array removes all annotations.
- PUT `/layouts/{id}/positions` retains its previous request schema and changes
  only positions. Returned detail includes the preserved annotations.
- Rename/default changes preserve annotations. Layout deletion cascades them;
  graph deletion does not affect them.

Pydantic uses a discriminated rectangle/text union, forbids unknown fields and
kind-inappropriate fields, rejects unsupported tokens, invalid/duplicate UUIDs,
coerced numeric strings/booleans, non-finite geometry and excessive snapshots.
Ownership comes exclusively from authentication. Existing 404 ownership, 409
snapshot/constraint, and 422 request-validation conventions remain in use.

Workspace saves reuse the established owner lock and current-node locks. The
complete node set is validated once. Both tables are replaced in the same
transaction, the layout timestamp is updated, and the full accepted response is
materialized before commit. Existing route-level rollback covers validation,
constraint, response materialization and database failures.

## Verification

All tests run in the existing API container against isolated `myway_test` PostgreSQL,
using the existing destructive test fixtures. No application database migration
was executed.

Final backend suite: **138 passed, 0 failed**, including **55 new tests**.
Coverage includes mixed-kind order and precision, legacy empty annotations,
Save as New independence, positions-only compatibility, rename/default
preservation, graph deletion independence, layout cascade, tenant isolation,
API and direct SQL constraints, Unicode whitespace, both limits, one node-set
validation per save, and injected rollback failures after positions/annotations,
on a constraint error, during response materialization and before commit.

Migration upgrade/downgrade runs twice on PostgreSQL with existing layout positions;
positions survive and each upgrade creates an empty annotations table.

Whitespace/diff checks passed. No frontend files, dependencies or lockfiles changed.
Frontend tests/build and browser acceptance were not run for this backend checkpoint.
The migration remains to be applied to the application database before using these
backend changes there (`docker compose exec api alembic upgrade head`).
No commit, push or deployment is included.
