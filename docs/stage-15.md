# Stage 15 — Layout Annotations: Rectangle and Text

**Status: Completed and accepted within the agreed scope.**

**Completion and user acceptance date:** 2026-11-01.

## Baseline and checkpoint history

Implementation began after Stage 14 at `c5bc2d3`. Formal closure is based on
`9e51ab8` on `master` / `origin/master`, with a clean working tree before this
completion document was added.

| Commit | Completed checkpoint |
|---|---|
| `73173ad` | Annotation persistence foundation: PostgreSQL, model, schemas and API |
| `df718a8` | Complete workspace state and recovery v2 with v1 compatibility |
| `f80a6aa` | Graph/Annotation modes and Rectangle tools |
| `9e51ab8` | Text tools and integration coverage |

The original [specification](stage-15-layout-annotations-spec.md) and reports for
[checkpoint 1](stage-15-checkpoint-1.md),
[checkpoint 2](stage-15-checkpoint-2.md),
[checkpoint 3](stage-15-checkpoint-3.md) and
[checkpoint 4](stage-15-checkpoint-4.md) remain the detailed implementation and
verification record. This document records final acceptance, including the user's
subsequent clarification of browser and graph size.

## Delivered workspace behavior

Rectangle and Text are layout-owned annotations in graph-space coordinates. They
contain no graph node/edge references, never become React Flow graph nodes, and
never move graph elements. Rendering uses `ViewportPortal`.

Graph mode keeps annotations visible and click-through. Annotation mode keeps the
graph visible while disabling graph selection, movement, CRUD and graph shortcuts.
Entering Annotation clears graph selection, highlights, manual groups and branches
while preserving filters, hidden flags and coordinates. Pan, zoom, layout actions
and graph-only Fit View remain available. Mode, tool and selection are transient:
startup begins in Graph; layout switching retains mode and resets the tool to Select.

Rectangle supports one-shot drawing, movement, eight resize handles, semantic
styles and confirmed deletion. Creation and resizing use a 20 graph-unit minimum;
persistence requires positive finite dimensions rather than that UI minimum.
Text supports one-shot placement, multiline inline editing, double-click reopening,
movement, semantic color/size and confirmed deletion. Invalid existing text keeps
its editor open without deleting the committed value; Escape restores that value.
IME and editable-field keyboard guards remain in force.

Positions and annotations share one saved baseline and dirty state. Save and
Cmd/Ctrl+S, Discard, Save as New and protected switching handle both together.
Failed Save or destination loading preserves the old working workspace. Preview
frames and uncommitted text remain outside snapshots; gestures and editing block
Save/recovery writes until a complete committed snapshot is available. The central
Stage 14 shortcut dispatcher handles mode-aware actions without a second global
keyboard listener.

## Actual database and API contract

Checkpoint 1 introduced migration `d15a01e4b901`, following `c12a01e4b901`, creating
only `layout_annotations` with typed columns. Existing layouts receive no annotation
rows. Downgrade drops this table and preserves layouts and node positions.

The composite primary key is `(layout_id, annotation_id)`; the composite owner
foreign key `(user_id, layout_id)` cascades on layout deletion. There are no graph
node/edge foreign keys. `order_index` is unique per layout, ranges from 0 to 1999,
and preserves request order. Save as New can reuse annotation UUIDs under a new
layout key. Geometry must be finite, rectangle dimensions positive, and fields
must match the annotation kind.

| API | Contract |
|---|---|
| `GET /layouts/{id}` | Returns complete positions and ordered annotations; existing empty layouts return `annotations: []` |
| `POST /layouts` | Creates positions and annotations together; omitted annotations default to `[]` |
| `PUT /layouts/{id}/workspace` | Requires both complete arrays; replaces both atomically; `annotations: []` removes all annotations |
| `PUT /layouts/{id}/positions` | Retains its prior schema and updates positions only, preserving annotations |

Workspace replacement reuses owner/current-node locks, validates the complete node
set once, replaces both tables in one transaction, updates the layout timestamp
and materializes the accepted response before commit. Failures roll back both
parts. Authentication supplies ownership; existing 404 ownership, 409
snapshot/constraint and 422 request-validation conventions remain. Rename and
default changes preserve annotations; graph deletion does not change them.

Actual validated limits and tokens, shared by frontend and backend:

- At most **2000 annotations per layout**; unique valid UUIDs and strict kind fields.
- Text: **1–2000 Unicode code points**, with at least one non-whitespace character.
  Content and explicit line breaks are preserved, with matching Python/SQL/frontend
  whitespace semantics; text is not trimmed.
- Colors: `gray`, `blue`, `green`, `yellow`, `red`, `purple`.
- Rectangle fill: `none`, `light`, `medium`; border: `thin`, `normal`, `thick`.
- Text size: `small`, `medium`, `large`.

Checkpoint 1 tested upgrade/downgrade twice on isolated PostgreSQL while preserving
existing positions; it did not migrate the application database. Checkpoint 2
subsequently records the approved application migration to `d15a01e4b901` and API
restart. Read-only verification found annotation arrays in all three layouts
(with 505, 505 and 502 stored positions) and the workspace endpoint in OpenAPI.
That update performed no workspace save or position rewrite. Closure does not
claim a newly executed migration or deployment.

## Recovery v2

Recovery stores complete positions and annotations plus scope, layout ID,
timestamp and node/saved-position/saved-annotation/working-annotation fingerprints.
Malformed annotations or inconsistent fingerprints reject the whole draft.
Compatible position-only v1 drafts upgrade in memory only when the server annotation
baseline is empty and existing node/position/scope/layout checks pass. Otherwise
v1 is incompatible; a v1 record carrying annotation fields is rejected.

IndexedDB database/store version remains 1; the record payload is v2. Debounced
writes retain queue/generation protections and pause during unsafe operations.
Restore applies both parts and leaves the workspace dirty; Discard retains the
server snapshot and safely removes recovery. Cleanup failure cannot silently lose
working state. Recovery before the first saved server layout remains out of scope.

## Verification and final acceptance

The final checkpoint reports:

- **Backend: 138 passed, 0 failed**, including persistence, SQL/API constraints,
  migration, rollback and tenant-isolation coverage.
- **Frontend: 223 passed, 0 failed**, including real React hook integration,
  complete workspace/recovery, annotation interactions and Stage 11–14 regressions.
- **TypeScript compilation and Vite production build passed.**
- Lint completed with existing graph/layout warnings; it is not warning-free.
- Git whitespace checks passed.

These are the implementation verification results recorded in the reports, not
new test executions during this documentation-only closure. Checkpoint 4 also
records isolated browser-fixture persistence and failure-path checks; those are
distinct from acceptance on the user's real graph.

The user confirmed final manual acceptance in **Chrome on a real graph of
approximately 500 nodes** on 2026-11-01:

| User-tested area | Accepted result |
|---|---|
| Rectangle/Text creation, editing, movement and styles | Everything behaves as expected |
| Graph/Annotation switching | No interaction conflicts observed |
| Save, Discard, Save as New and Recovery after reload | Checked and accepted, with the nonblocking startup-layout observation below |
| Interaction performance, including moving annotations over the large graph | No visible lag observed |

This is user-reported workflow acceptance, not an independently timed performance
benchmark or a claim that every individual specification checklist item was
separately enumerated. Together with the checkpoint evidence it closes Stage 15
within the agreed scope.

## Accepted limitations and deferred UX backlog

**Nonblocking UX backlog: restore the last active layout after reload.** Currently,
a reload opens the default layout even when another layout was active before it.
The user accepted Stage 15 and requested that this unexpected startup behavior be
tracked for a future fix. Future work should restore `activeLayoutId`, verify that
the layout still exists and is accessible to the current user/scope, and fall back
safely to the default layout when it is unavailable. This concerns layout identity;
it is separate from Graph/Annotation mode, whose Graph-on-startup behavior remains
intentional. No active-layout restoration is implemented by this closure.

Other retained scope limits include no Undo/Redo, annotation multi-selection,
copy/paste, alignment, user-controlled z-order, rich text, arbitrary styles,
additional shapes, graph attachments, mixed graph/annotation operations, initial
unsaved-layout recovery or simultaneous multi-tab editing guarantees. See the
specification for the full non-goals.

Stage 16 requires a separate specification and authorization. This closure adds
completion documentation only; it does not implement the next stage.
