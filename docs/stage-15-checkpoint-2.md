# Stage 15 Checkpoint 2 — Workspace state and recovery v2

Date: 2026-10-27. Backend foundation committed as `73173ad`, following baseline
`c5bc2d3`. Checkpoint 2 remains uncommitted for review.

## Delivered

Annotations remain separate React state; they never enter graph node/edge arrays.
Shared helpers validate and copy discriminated rectangle/text snapshots, preserve
order, compare every persisted field with the existing 1e-6 geometry tolerance,
normalize rectangle drawing geometry, and restore complete workspaces.

The frontend matches the backend limits and style tokens: 2000 annotations per
layout, 2000 Unicode code points per text, finite coordinates, positive rectangle
dimensions, supported styles, unique canonical UUIDs, no extra fields and no
whitespace-only text. Text content and explicit line breaks are preserved.
The whitespace set matches the Python/PostgreSQL contract, including NEL and NBSP.
The 20-unit drawing minimum is separate from persistence's positive-size constraint.

Layout detail loads validate annotations before applying a destination. Create and
Save as New send positions and annotations together. Save uses
`PUT /layouts/{id}/workspace`; the compatibility `/positions` API is unchanged.
Invalid outgoing annotations fail before any request is sent. Missing server
annotations produce an incomplete-data message rather than a false limit error.

The persistent-layout hook coordinates both working parts and both saved baselines:

- Startup applies annotations and positions before opening the existing barrier.
- Annotation-only changes make the layout dirty; exact restoration becomes clean.
- Save and the existing Cmd/Ctrl+S path save the complete workspace.
- Discard, Save as New and all layout-switch choices use both snapshot parts.
- Destination load failure preserves the old working workspace.
- Layout deletion applies the prefetched default positions and annotations.
- Failed Save preserves working state, saved baseline and local recovery.
- Failed recovery cleanup prevents Discard and Discard-and-switch from losing state.
- Annotation gesture/editor busy state blocks persistence alongside graph operations.
- Returning exactly to the saved state clears stale local recovery.

The hook exposes `annotationBusy` for later drawing/dragging/resizing/text editing
integration. No mode controls, annotation rendering or drawing/editing UI are added
in this checkpoint. Graph CRUD, filters, manual groups, branches, Fit View and the
central Stage 14 shortcut dispatcher retain their existing behavior.

## Recovery v2

Each v2 draft contains complete positions and annotations, node/position baseline
fingerprints, saved annotation baseline fingerprint, working annotation fingerprint,
scope, layout ID and timestamp. Annotation order and every persisted field take
part in fingerprints; object property order does not. Restoration rejects the
entire draft on malformed annotations or inconsistent fingerprints.

Compatible v1 drafts upgrade in memory only when the server annotation baseline is
empty and all prior node/position/scope/layout checks pass. A server layout with
annotations makes a v1 draft incompatible. A v1-labelled record carrying annotation
fields is rejected rather than silently discarding those fields.

Incompatible records are removed through the safe cleanup path; a cleanup failure
never blocks server startup. The IndexedDB database/store version remains 1 because
only the stored record payload changes. Existing scope keys, queue serialization
and generation protections remain in use. New debounced writes carry both parts.
Pending debounce writes are cancelled during unsafe operations/gestures and resume
with the latest complete snapshot afterward. Initial unsaved layouts still have
no local recovery. Recovery notices now refer to unsaved layout changes.

## Verification

- **179 frontend tests passed, 0 failed**, including 72 new tests.
- **21 integration tests run the actual hook with real React state/effects**, mocked
  HTTP and fake IndexedDB. They exercise startup, dirty state, Save, Save as New,
  Discard, switch choices, destination/save/cleanup failures, default-after-delete,
  gesture/graph guards, recovery Restore/Discard, safe v1 upgrades/rejections,
  malformed v2 rejection, first Save, exact restoration and duplicate Save guards.
- Pure tests cover geometry, UUIDs, semantic tokens, Unicode text/bounds, snapshots,
  fingerprints, complete-draft rejection and v1 compatibility.
- API tests verify workspace requests and rejection before partial writes.
- Controller tests verify complete latest-snapshot ordering and cancellation.
- TypeScript compilation and Vite production build passed.
- Lint passes with existing graph/layout warnings; it is not warning-free.
- Git whitespace checks passed.
- Backend checkpoint's **138 PostgreSQL tests passed** before its commit; backend
  implementation files were not changed in checkpoint 2.

Added pinned dev-only `react-test-renderer@19.2.8` (matching React), plus its locked
`react-is` dependency, for real-hook tests without browser or application database
access. React emits its test-renderer deprecation notice. Production dependencies
are unchanged; unrelated lockfile metadata was preserved.

Headless browser acceptance is not counted: the Playwright browser binary was
absent and installed Chrome aborted before opening a page. Temporary browser
harness files were removed; the retained integration tests run with `npm test`.

## Local application update and user acceptance

During implementation the user reported that the graph no longer loaded. Diagnosis
confirmed that the frontend had reloaded while the API still ran the pre-Stage-15
contract and the application database remained at `c12a01e4b901`.

After explicit user approval, migration `d15a01e4b901` was applied to the local
application database and the API was restarted. Read-only verification confirmed
all three layouts returned annotation arrays (empty), with 505, 505 and 502 stored
positions respectively, and the workspace endpoint was present in OpenAPI.
No workspace save or position rewrite was performed during this update.

The user then confirmed that everything was working again. This establishes graph
loading acceptance after the coordinated update, not acceptance of the future
annotation drawing UI or every final Stage 15 browser scenario.

Next: Checkpoint 3 — explicit modes and Rectangle interaction/rendering.
