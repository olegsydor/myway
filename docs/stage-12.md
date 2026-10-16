# Stage 12. Persistent named layouts

Status: implementation and user functional acceptance completed on 2026-10-16.
Longer-term comfort evaluation is deferred to ordinary use.

## Checkpoints

| Commit | Result |
| --- | --- |
| 2694ffc | Stage 11 base: manual groups and coordinate preservation after CRUD |
| 7b3c998 | Layout models, migration, database constraints and model tests |
| e30cc60 | Layout management API and atomic full-snapshot saving |
| c70bf25 | Default loading, explicit Save, dirty state and Discard |
| d2a5972 | Multiple-layout management and protected switching |

The final documentation commit follows d2a5972.
Alembic head: c12a01e4b901, following b4edbb2ba0b8.

## Implemented behavior

- Multiple user-owned named layouts reference the same graph nodes and edges.
- Node coordinates belong to layouts, not to graph node records.
- Startup loads the default layout. With no layouts, the graph remains an unsaved
  initial arrangement; the first Save creates Main as default.
- Save layout explicitly persists every loaded graph node, including hidden nodes.
- Single-node, branch, manual-group and keyboard movement change working positions
  without automatically saving. Grid, Circle and Dagre are also local edits.
- Dirty state compares working coordinates with the last accepted saved snapshot.
  Filters, search, pan, zoom, selection and metadata changes do not themselves
  change persisted coordinates. Returning to the saved arrangement clears dirty.
- Discard restores saved positions. Current nodes without saved positions receive
  fallback positions and remain dirty until saved; Discard never deletes graph data.
- Save as new layout captures the current working arrangement under a new identity,
  including unsaved movement, without overwriting the old saved layout.
- Rename preserves identity, saved coordinates and current dirty state.
- Set as default changes what opens on the next application load.
- Switching dirty layouts offers Save and switch, Discard and switch, or Cancel.
- Default and only-layout deletion are prohibited. Confirmed deletion of an active
  non-default layout opens the default and leaves graph data intact.
- A standard browser-leave warning protects dirty work where the browser permits.

## Persistence and API

Tables:

- layouts: id, user_id, name, is_default, created_at, updated_at.
- layout_node_positions: layout_id, node_id, user_id, x, y.

Names are trimmed, required, limited to 100 characters and unique per user under
PostgreSQL lower(name). A partial unique index permits at most one default per
user. Composite foreign keys enforce matching layout/node ownership. Layout/node
removal cascades to position rows. Coordinates are finite double-precision values
using the existing React Flow graph-space node anchor.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /layouts | Owned layout metadata |
| GET | /layouts/{id} | Owned metadata and saved positions |
| POST | /layouts | Atomic creation with complete positions |
| PATCH | /layouts/{id} | Rename and/or set default |
| PUT | /layouts/{id}/positions | Atomic full-snapshot replacement |
| DELETE | /layouts/{id} | Allowed layout deletion |

Snapshot IDs must match the current user's complete node set exactly. Incomplete,
stale, unknown or foreign node sets return 409. Duplicate/malformed IDs and invalid
coordinates return 422. Foreign/missing layouts return 404. Invalid deletion and
name conflicts return 409. Failed mutations roll back the transaction.

Layout mutations lock the owner row; full saves also lock existing graph nodes
against deletion. Default transfer and coordinate replacement are transactional.
Position saves update layout.updated_at. No empty Main records are created by the
migration. The existing current-user dependency is retained; Stage 12 does not
implement a new authentication system.

## Frontend boundaries and error behavior

Key files:

- src/react-flow/ReactFlowGraph.tsx: existing graph interaction integration.
- src/react-flow/usePersistentLayout.ts: persistence and layout operation state.
- src/react-flow/LayoutControls.tsx: selector, management actions and dialogs.
- src/shared/persistentLayouts.ts: snapshots, coordinate comparison and restoration.
- src/shared/layoutApi.ts: layout HTTP client.

These paths are relative to poc/graph-visualization/.

Coordinate comparison uses absolute tolerance 1e-6. Complete node-state snapshots
include hidden nodes. Graph CRUD retains existing coordinates through Stage 11
reconciliation. New nodes remain missing from other saved layouts until those
layouts are explicitly saved. Deleted nodes are ignored by dirty comparison,
matching database cascade cleanup.

Loading/discarding uses complete-graph Dagre fallback only for missing positions;
saved nodes do not move because of fallback calculation. Switching clears branch
and manual-group membership, preserves filters, and fits visible nodes. Viewport
pan/zoom is not saved.

During a persistence request, synchronous guards and disabled controls block
coordinate changes, graph CRUD and duplicate submissions. Save is also blocked
while graph CRUD or dragging is in progress, or node IDs are not reconciled.

A failed Save retains working coordinates and the saved baseline. A failed switch
retains the old active layout and working coordinates. If Save succeeds before a
target load fails, the old layout remains active and clean. Deletion fetches the
default destination before sending DELETE; a destination load failure therefore
does not delete the active layout. Initial load failures block writes and offer
retry. Native dialogs and keyboard guards prevent graph movement behind dialogs.

## Verification evidence

User's Docker/PostgreSQL environment:

- Migration upgraded successfully to c12a01e4b901.
- 10 model/constraint tests passed.
- 40 combined layout model/API tests passed.
- Full backend suite: 83 passed.

Frontend:

- Final npm test: 45 passed.
- Final TypeScript/Vite production build passed with Vite 8.2.2.
- package-lock.json and project dependencies remained unchanged.
- Local React-hook and controls smoke checks with mocked API covered success and
  failure paths, cancellation, duplicate-operation guards, metadata/dirty isolation,
  destination-prefetch deletion, naming forms and hidden complete snapshots.
- Lint completed with React advisory warnings, including the effect applying
  external saved positions to the controlled graph. No lint errors blocked build.

User functional acceptance on the real project graph confirmed:

1. Main creation, Save, reload recovery, dirty indication and exact Discard.
2. Save as new, independent arrangements and repeated layout switching.
3. Cancel, Discard and switch, and Save and switch behavior.
4. Rename, duplicate-name rejection, default selection/reload and layout deletion.
5. Large-group movement followed by save/reload with preserved geometry.
6. Movement and saving of filtered/hidden group or branch members.
7. New-node fallback and dirty behavior, including Discard retaining the node.
8. New-node handling across layouts and deletion cleanup without changing remaining
   coordinates or restoring a deleted node.
9. Browser reload/leave protection for unsaved movement in the tested environment.

Browser versions and per-operation performance measurements were not collected.
The checks establish functional acceptance, not a measured performance benchmark
or separate cross-browser certification. Live downgrade was not tested; offline
upgrade/downgrade SQL generation was verified. Downgrade drops saved layout data.

## User evaluation and follow-up

The user reports that functionality works very well and better than expected.
A more considered assessment of convenience will follow ordinary use after the
stage, rather than expanding the current implementation based on first impressions.

Potential future UI work: make the left tools panel collapsible and callable when
needed, preserving more graph workspace. This is explicitly deferred and is not
part of Stage 12.

Revisit autosave, fallback placement or viewport behavior only if subsequent use
shows a concrete need. No automatic saving is introduced by this stage.

## Stage boundary and future annotations

Stage 12 delivers explicit persistent named layouts and complete node-position
snapshots. Functional acceptance is complete; longer-term usability observation
remains open.

Excluded: autosave, viewport persistence, annotations, timeline generation, saved
manual groups, undo/version history, sharing and simultaneous-client coordination.
No annotation tables, payloads or placeholder tools were added. A later annotation
stage can attach visual content to the stable owned layout_id and use the same
graph-space coordinates without moving coordinate ownership back to graph nodes.

## Next-stage handoff

Start from the final documentation commit after d2a5972. Confirm a clean working
tree and Alembic head c12a01e4b901. Use the current repository as authoritative;
there is no need to rebuild from earlier archive packages.

Read this document and the relevant detailed implementation notes:

- docs/stage-12-backend.md
- docs/stage-12-frontend-save.md
- docs/stage-12-layout-management.md

The earlier notes describe individual checkpoints; this document records the final
stage status and user acceptance. Saved layout data now exists and should be
preserved during future migrations and graph interaction changes.
