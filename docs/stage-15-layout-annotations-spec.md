# Stage 15 — Layout Annotations: Rectangle and Text

**Status:** Specification for implementation

**Repository baseline:** `c5bc2d3` — Stage 14 graph keyboard shortcuts and safe deletion

## 1. Objective

Add a separate annotation layer to each saved layout so users can visually organize
the graph with translucent rectangular regions and text labels.

Annotations explain a layout; they are not graph data. Graph nodes and edges remain
one interaction universe, while annotations form another. Both universes share the
same graph-space coordinate system but do not contain, reference, move or resize one
another.

Stage 15 delivers the smallest useful annotation workflow:

- explicit Graph and Annotation workspace modes;
- Rectangle and Text tools;
- single-annotation selection;
- move, resize and inline text editing;
- a small style palette;
- explicit layout persistence, discard, switching and Save as New;
- browser-local recovery of unsaved annotation changes;
- preservation of all accepted Stage 11–14 graph behavior.

## 2. Core separation rule

The implementation must preserve these invariants:

- an annotation contains no graph node or edge ID;
- a rectangle does not know which nodes appear inside it;
- moving or resizing an annotation never moves a graph node;
- moving, hiding, filtering, creating or deleting graph elements never changes an
  annotation automatically;
- annotations cannot be graph edge endpoints;
- graph algorithms, manual groups and branch selection ignore annotations;
- annotation selection never becomes React Flow graph-node selection;
- node-position snapshots contain graph nodes only;
- annotations belong to a layout, not to the canonical graph.

Sharing graph-space coordinates is not a relationship between the data models.

## 3. Scope

### 3.1 Annotation types

The first stage supports exactly:

- `rectangle`;
- `text`.

### 3.2 Required operations

Rectangle:

- draw by dragging;
- show a live preview;
- select one rectangle;
- move by dragging;
- resize from corner and side handles;
- change color, fill intensity and border thickness;
- delete through confirmation.

Text:

- place by clicking;
- edit inline at its graph-space position;
- preserve explicit line breaks;
- select one text annotation;
- move by dragging;
- change color and Small/Medium/Large font size;
- reopen inline editing by double-click;
- delete through confirmation.

### 3.3 Persistence

Annotations participate in the same explicit-save workflow as node coordinates:

- dirty state;
- Save Layout and `Ctrl/Cmd+S`;
- Discard changes;
- Save as New;
- protected layout switching;
- layout deletion cascade;
- Stage 13 local recovery.

## 4. Non-goals

Stage 15 does not add:

- lines, arrows, ellipses, freehand drawing or images;
- rotation, including text rotation;
- annotation multi-selection or group movement;
- alignment or distribution tools;
- copy/paste or duplication;
- user-controlled z-order;
- rich text or arbitrary font selection;
- arbitrary colors, gradients or advanced drawing styles;
- annotation attachment to nodes or edges;
- automatic rectangle growth or movement based on graph elements;
- moving graph nodes with a rectangle;
- mixed node-and-annotation selection;
- undo or redo;
- a keyboard shortcut for switching workspace modes;
- a keybinding settings UI;
- a general sidebar redesign;
- recovery for an initial layout that has never been saved;
- simultaneous multi-tab editing guarantees.

Future alignment may operate separately on multiple graph nodes in Graph mode or
multiple annotations in Annotation mode. Mixed alignment is not planned.

## 5. Workspace modes

### 5.1 Explicit mode switch

Add a clearly visible control in the left panel:

```text
Workspace mode

[ Graph ] [ Annotation ]
```

There is no mode-switching hotkey in Stage 15.

The current mode is transient UI state:

- startup always begins in Graph mode;
- mode is not stored in PostgreSQL;
- mode is not included in IndexedDB recovery;
- Save and Discard do not change mode;
- layout switching preserves the current mode, but clears the old annotation
  selection and returns the annotation tool to Select;
- a full application reload begins in Graph mode even if Annotation mode was active
  before reload.

### 5.2 Graph mode

Graph mode preserves the existing workspace behavior:

- nodes and edges can be selected and edited;
- nodes, branches and manual groups can be moved;
- Stage 14 N, E, Delete/Backspace and other graph interactions retain their
  existing meaning;
- annotations remain visible;
- annotations do not receive pointer events and cannot block clicks or drags on
  graph elements;
- annotation tools and properties are hidden or inactive.

### 5.3 Annotation mode

In Annotation mode:

- nodes and edges remain fully rendered as visual references;
- graph nodes and edges cannot be selected, dragged, edited, connected or deleted;
- manual-group rectangle selection, branch selection and group keyboard movement
  are disabled;
- graph CRUD shortcuts N and E do not act;
- graph Delete/Backspace does not act on nodes or edges;
- annotation creation, selection, movement, resizing, editing and deletion are
  enabled;
- pan and zoom remain available;
- Layout Controls remain available;
- `Ctrl/Cmd+S` saves the complete layout workspace.

Do not dim the graph by default. Accurate node and edge visibility is necessary for
drawing regions around the intended content.

Entering Annotation mode must clear ordinary graph selection, graph highlighting,
manual-group membership and branch selection without resetting active filters or
unhiding filtered nodes. The existing broad reset helper must not be reused if it
would reset filters.

Leaving Annotation mode clears annotation selection. A live rectangle preview is
cancelled. A valid active text edit is committed before switching; an empty new
text annotation is discarded. Existing committed annotation changes remain dirty.

## 6. Annotation tools

Annotation mode exposes:

```text
[ Select ] [ Rectangle ] [ Text ]
```

Select is the default tool whenever Annotation mode is entered.

Rectangle and Text are one-shot tools:

- after successful creation, return to Annotation Select;
- after cancellation, return to Annotation Select;
- do not return automatically to Graph mode.

The active mode and active tool must be visually unmistakable. Use selected button
styling and an appropriate canvas cursor. Do not rely on color alone for state.

## 7. Rectangle creation and editing

### 7.1 Creation gesture

With Rectangle active:

- primary-button drag starts a rectangle even when the pointer is visually above a
  graph node, because graph interaction is disabled in Annotation mode;
- convert pointer coordinates to React Flow graph-space coordinates;
- display a translucent live preview while dragging;
- normalize geometry so width and height are positive regardless of drag direction;
- ignore or cancel gestures below a small minimum size;
- on pointer release, create the annotation in working state, select it and return
  to Annotation Select;
- pointer cancellation, Escape or mode switching discards only the uncommitted
  preview.

The initial implementation may use a minimum of approximately 20 graph units for
both width and height. The exact threshold may be adjusted during manual testing.

### 7.2 Selection, movement and resize

In Annotation Select:

- clicking the visible rectangle area selects it;
- only one annotation is selected at a time;
- dragging the body moves the rectangle without changing its dimensions;
- selected rectangles display corner and side resize handles;
- resizing keeps width and height positive and above the minimum;
- dragging or resizing never moves nodes inside the rectangle;
- clicking empty canvas clears selection and retains normal pan behavior where the
  gestures do not conflict.

During an active drag or resize, update the visual preview smoothly but defer
recovery persistence until the gesture ends.

## 8. Text creation and editing

### 8.1 Creation

With Text active:

- a primary click chooses a graph-space position;
- create an inline editor at that position;
- focus the editor immediately;
- Enter inserts a line break rather than submitting;
- clicking outside commits valid non-empty text;
- Escape cancels creation;
- whitespace-only text is not created;
- after commit or cancellation, return to Annotation Select.

### 8.2 Existing text

In Annotation Select:

- clicking a text annotation selects it;
- dragging selected text moves it;
- double-clicking opens inline editing at the current position;
- Escape while editing restores the last committed content;
- clicking outside commits valid content;
- clearing all content and leaving the editor must not silently delete an existing
  annotation; retain the previous value and show a concise validation message or
  require explicit deletion.

Text uses content-driven dimensions. Stage 15 does not expose a text resize box or
automatic wrapping width. Explicit line breaks and font-size presets determine its
shape.

## 9. Visual layers and hit testing

Render annotations as a separate viewport-aligned layer using React Flow's
`ViewportPortal` or an equivalent mechanism. Do not append annotation records to
the controlled graph `nodes` or `edges` arrays.

Required visible order:

1. canvas background;
2. rectangle fills and borders;
3. graph edges;
4. graph nodes;
5. annotation text;
6. selected-annotation outline, resize handles and inline editor.

Rectangle fills must be translucent so nodes and edges remain readable.

Graph mode:

- annotation render layers use pointer-events behavior that allows graph
  interaction through them.

Annotation mode:

- graph elements are non-interactive;
- annotation hit targets receive the pointer;
- selected controls are rendered above graph content;
- graph content remains visible at normal opacity.

Among overlapping annotations of the same layer, the most recently created/later
stored annotation is visually above earlier ones and receives selection first.
There is no user-facing Bring Forward or Send Backward action in this stage.

Existing Fit View remains graph-only. A distant annotation must not shrink the
graph view. A future Fit Workspace action may include annotations.

## 10. Styles

Use a constrained palette rather than arbitrary color input.

Suggested color tokens:

- gray;
- blue;
- green;
- yellow;
- red;
- purple.

Rectangle properties:

- color token;
- fill: None / Light / Medium;
- border: Thin / Normal / Thick.

Text properties:

- color token;
- size: Small / Medium / Large.

Provide readable defaults, for example blue, Light fill and Normal border for a
rectangle, and gray/Medium for text. Exact CSS values belong to one frontend style
mapping so persisted data contains stable semantic tokens rather than CSS strings.

Changing a property updates working state and dirty status. The left panel displays
properties only for the one selected annotation.

## 11. Annotation deletion

Delete removes one selected annotation from working state only. It becomes a server
change when the layout is explicitly saved.

Deletion is available through a visible left-panel action and through the existing
Delete/Backspace shortcut while Annotation mode and canvas context are active.

Show an application confirmation dialog because Stage 15 has no Undo:

- identify Rectangle or show a short Text excerpt;
- Cancel preserves selection and working state;
- confirmation removes only that annotation and marks the layout dirty;
- no graph node or edge deletion controller is invoked;
- Discard can restore the complete last-saved workspace, but is not presented as
  single-operation undo.

Graph mode retains the Stage 14 Delete behavior unchanged.

## 12. Frontend annotation model

Use a discriminated union with client-generated stable UUIDs.

Conceptual contract:

```ts
type AnnotationColor =
  | "gray" | "blue" | "green"
  | "yellow" | "red" | "purple";

interface RectangleAnnotation {
  id: string;
  kind: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: AnnotationColor;
  fill: "none" | "light" | "medium";
  border: "thin" | "normal" | "thick";
}

interface TextAnnotation {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: AnnotationColor;
  size: "small" | "medium" | "large";
}
```

Array order is meaningful draw order within an annotation kind. The server must
return the accepted order deterministically.

All geometry uses the existing React Flow graph-space coordinate system and finite
double-precision numbers. IDs should use `crypto.randomUUID()` or an equivalent
UUID generator and must remain stable across movement, recovery and repeated saves.

## 13. Dirty state and working snapshots

The layout working state consists of:

- complete current graph node positions;
- complete current annotations.

The saved baseline contains both parts. The layout is dirty when either differs
from the accepted baseline.

Dirty comparison must:

- compare annotation IDs, kinds, order, geometry, content and style tokens;
- use the existing coordinate tolerance for floating-point geometry;
- ignore UI-only mode, tool, selection, hover, live preview and editor focus;
- become clean if all saved values are restored exactly;
- remain efficient during pointer movement by avoiding unnecessary persistence or
  serialization on each frame.

A rectangle preview and an empty uncommitted text editor are not annotations and do
not make the layout dirty. A completed create, move, resize, text edit, style change
or deletion does.

## 14. Backend persistence model

### 14.1 New table

Add a `layout_annotations` table owned by user and layout.

Required logical fields:

- `layout_id`;
- `annotation_id` UUID;
- `user_id`;
- `kind` (`rectangle` or `text`);
- deterministic `order_index`;
- graph-space `x`, `y`;
- rectangle `width`, `height` where applicable;
- text content where applicable;
- validated semantic style values.

Recommended key:

- composite primary key `(layout_id, annotation_id)` so Save as New may reuse the
  current client IDs in an independent layout snapshot.

Required constraints:

- composite owner foreign key `(user_id, layout_id)` →
  `(layouts.user_id, layouts.id)` with `ON DELETE CASCADE`;
- finite-coordinate checks;
- positive finite rectangle width and height;
- supported kind values only;
- kind-specific required/forbidden geometry and content;
- non-empty text with a documented maximum length;
- supported style tokens only;
- non-negative deterministic order;
- no graph-node or graph-edge foreign key.

A limit such as 2,000 annotations per layout and 2,000 Unicode characters per text
annotation may be enforced to bound snapshots. The exact limits must be documented
and tested.

The migration creates no rows for existing layouts. Existing layouts naturally
load with `annotations: []`. Downgrade removes only annotation data and schema added
by this stage; existing layout positions remain intact.

### 14.2 Model representation

Typed columns or strictly validated JSONB may be used internally. Regardless of
storage choice, the API must expose a discriminated and strictly validated union.
Unknown fields, unsupported tokens, duplicate IDs, invalid UUIDs and non-finite
geometry return 422.

## 15. Atomic layout workspace API

Coordinates and annotations must be accepted in one database transaction. A Save
Layout action must never commit one part while failing the other.

### 15.1 Read contract

Extend `LayoutDetail`:

```json
{
  "id": 7,
  "name": "Main",
  "is_default": true,
  "created_at": "...",
  "updated_at": "...",
  "positions": [],
  "annotations": []
}
```

### 15.2 Create layout

Extend `POST /layouts` to accept positions and annotations in the same request.
For backward compatibility, omitted annotations may default to an empty list.

Save as New sends the current working positions and annotations. The new layout is
independent even if annotation UUIDs are reused under its composite layout key.

### 15.3 Replace complete workspace

Add:

```text
PUT /layouts/{layout_id}/workspace
```

Request:

```json
{
  "positions": [],
  "annotations": []
}
```

The operation must:

- lock the owner and current graph nodes using the established layout-save rules;
- validate the complete current node-ID set exactly once;
- validate the full annotation snapshot;
- replace positions and annotations in one transaction;
- update `layout.updated_at` once;
- return the accepted `LayoutDetail` only after both replacements are materialized;
- roll back both parts on any validation, constraint or database failure.

Keep the existing `PUT /layouts/{id}/positions` endpoint during this stage for
compatibility. It replaces positions only and must preserve existing annotations.
The Stage 15 frontend uses the workspace endpoint.

### 15.4 Other operations

- GET detail returns both positions and annotations.
- Rename and Set as default preserve annotations.
- layout deletion cascades annotations.
- graph node/edge deletion never deletes or edits annotations.
- errors preserve existing 404/409/422 ownership and validation conventions.

## 16. Frontend layout integration

Extend the persistent-layout controller so accepted and working annotation state is
coordinated with node positions.

Required behavior:

- initial load applies positions and annotations before revealing the canvas;
- no Dagre or annotation flash is visible;
- Save sends one complete workspace request;
- `Ctrl/Cmd+S` calls that same guarded save path;
- Discard restores positions and annotations together;
- Save as New creates both together;
- Save and switch saves both before loading the destination;
- Discard and switch discards both before loading the destination;
- Cancel switch preserves both;
- switching loads destination positions and annotations together;
- failed Save preserves both working parts and their accepted baselines;
- failed destination load preserves the old working workspace;
- deletion of a layout opens the prefetched default workspace with its annotations;
- existing startup barrier remains active until the complete workspace decision is
  resolved.

The controller may receive annotation state and setters through its options or be
refactored into a broader workspace-persistence hook. Avoid putting API, recovery
and annotation persistence logic directly into the already large
`ReactFlowGraph.tsx` component.

## 17. Recovery version 2

Extend Stage 13 recovery so one draft represents the complete working layout.

Version 2 contains at least:

- scope and layout ID;
- recovery timestamp;
- node fingerprint;
- saved position baseline fingerprint;
- saved annotation baseline fingerprint;
- complete working positions;
- complete working annotations.

Compatibility validation must reject the entire draft if annotation data is
malformed, duplicated, non-finite or inconsistent with its fingerprint. Do not
restore positions from one draft while silently discarding its annotation part.

### 17.1 Legacy version 1 records

Existing version 1 position-only recovery records must not break startup.

- if the server baseline contains no annotations and the position/node checks pass,
  a v1 record may be upgraded in memory and offered with `annotations: []`;
- if the server baseline contains annotations, a v1 record is incompatible because
  it cannot prove the saved annotation baseline;
- invalid or incompatible records are ignored/removed through the existing safe
  recovery path and never block normal server-layout loading.

### 17.2 Scheduling and cleanup

Schedule a debounced recovery when either positions or committed annotations are
dirty. Do not write on every pointer frame.

Skip scheduling during:

- node dragging;
- rectangle drawing preview;
- annotation dragging or resizing;
- uncommitted inline text editing;
- unsafe layout or graph CRUD operations.

After the operation ends, schedule one complete latest snapshot through the
existing generation and queue protections.

Recovery Restore applies both positions and annotations and leaves the workspace
dirty. Recovery Discard retains the server workspace and removes the local draft.
Successful Save, Save as New, Discard, switching and layout deletion retain the
existing cleanup guarantees.

The recovery prompt should refer to `unsaved layout changes`, not only positions.

Initial unsaved-layout recovery remains outside Stage 15. Before the first server
layout exists, annotations can be created and included in the first Save, but an
abrupt reload may lose those unsaved initial changes.

## 18. Filters, search, navigation and graph changes

- annotations remain visible when node or edge filters change;
- annotations are not included in graph search results;
- graph filters do not change annotation dirty state;
- Annotation mode entry preserves current filters;
- filtered/hidden nodes remain valid visual context according to the active filter;
- graph CRUD reconciliation preserves annotations exactly;
- new-node fallback placement does not consider rectangles;
- Fit View continues to use graph nodes only;
- viewport pan and zoom remain unsaved;
- switching layouts may fit graph nodes as today without moving annotations.

## 19. Keyboard behavior

Stage 14 remains the keyboard foundation.

Graph mode:

- N opens Create Node;
- E opens Create Edge;
- Delete/Backspace targets one ordinary graph element;
- group/branch arrow movement remains unchanged.

Annotation mode:

- N and E do nothing;
- Delete/Backspace opens confirmation for one selected annotation;
- graph group/branch arrow movement does nothing;
- no F2 binding is introduced;
- no mode-switch shortcut is introduced.

Both modes:

- `Ctrl/Cmd+S` invokes complete workspace Save;
- editable fields, inline text editing, dialogs, IME composition and repeated events
  retain the central Stage 14 guards;
- Backspace edits text normally while the inline editor is focused.

Changing action context must extend the existing centralized shortcut dispatcher,
not add an independent global keyboard listener.

## 20. Error and concurrency behavior

- invalid annotation state must not be sent silently; show a useful validation
  error and preserve working state;
- failed workspace Save keeps coordinates, annotations, dirty state and recovery;
- failed Discard recovery cleanup must not discard working state;
- duplicate save and delete submissions remain blocked;
- annotation drag/resize and graph/layout persistence locks must not overlap in an
  unsafe way;
- switching modes during a server operation is disabled or safely deferred;
- API ownership is always derived from the authenticated user, never request data;
- foreign layout annotations remain inaccessible;
- no new unbounded history or diagnostic buffer is introduced;
- do not add permanent per-pointer-frame console logging.

## 21. Suggested implementation boundaries

Backend:

- new `LayoutAnnotation` model and migration;
- annotation/workspace Pydantic schemas;
- repository helpers for ordered read, strict validation and atomic replacement;
- new workspace route while retaining the positions route;
- model, constraint, API, transaction and tenant-isolation tests.

Frontend:

- pure shared annotation types, validation, snapshot comparison and restoration;
- focused annotation layer rendered through `ViewportPortal`;
- Rectangle, Text, selection handles and inline editor components;
- workspace mode/tool controller;
- annotation properties and deletion dialog UI;
- persistent-layout integration for complete workspace snapshots;
- recovery v2 with explicit v1 compatibility;
- extensions to the centralized shortcut context;
- focused unit tests outside `ReactFlowGraph.tsx` wherever logic can be pure.

Do not represent annotations as `ReactFlowNode`, overload graph `originalId`, or add
annotation exceptions throughout graph algorithms and node-position helpers.

## 22. Automated verification

### 22.1 Backend

Cover:

- migration upgrade and downgrade;
- layout ownership and cascade deletion;
- finite geometry constraints;
- positive rectangle dimensions;
- kind-specific schema validation;
- UUID and duplicate-ID validation;
- text length and whitespace validation;
- supported style values;
- stable ordering;
- existing layouts returning empty annotations;
- create with positions and annotations;
- atomic workspace replacement;
- rollback of both parts when either part fails;
- complete node snapshot validation unchanged;
- legacy positions-only endpoint preserving annotations;
- Save as New independence;
- rename/default preservation;
- foreign-layout isolation and error status behavior.

### 22.2 Frontend pure logic

Cover:

- annotation UUID and discriminated validation;
- rectangle normalization and minimum size;
- finite geometry rejection;
- annotation snapshot equality and dirty state;
- array-order preservation;
- style token validation;
- text validation and explicit line breaks;
- workspace dirty when only annotations change;
- clean state after exact restoration;
- recovery v2 fingerprints and compatibility;
- safe v1 recovery upgrade rules;
- latest-write ordering with annotations;
- recovery cleanup after accepted operations.

### 22.3 Interaction and integration

Cover where practical:

- Graph/Annotation mode transition rules;
- clearing selection without resetting filters;
- graph handlers disabled in Annotation mode;
- annotations click-through in Graph mode;
- one-shot Rectangle and Text tools;
- cancellation of live preview;
- single annotation selection;
- move and resize geometry;
- inline text commit and cancellation;
- annotation Delete routing never reaching graph deletion;
- N/E disabled in Annotation mode;
- complete Save, Discard, Save as New and switch behavior;
- startup barrier with annotations;
- existing Stage 11–14 regression tests.

## 23. Manual acceptance checklist

Test in Chrome on the real graph:

1. Upgrade the database and open an existing layout; no annotation error or visual
   startup flash occurs.
2. Switch explicitly to Annotation mode; nodes and edges remain fully visible but
   cannot be selected, edited or moved.
3. Draw a rectangle around several visible nodes and verify live preview and exact
   final placement.
4. Move and resize the rectangle; verify every graph node remains stationary.
5. Change rectangle color, fill and border presets.
6. Add multiline text inline, move it, reopen with double-click and edit it.
7. Switch to Graph mode and verify annotations remain visible but do not block node
   selection or movement.
8. Verify entering Annotation mode clears graph selection/group/branch but preserves
   filters.
9. Delete an annotation, cancel once, then confirm; verify no graph element changes.
10. Save with `Ctrl/Cmd+S`, reload and verify exact rectangle/text geometry, content,
    order and styles.
11. Change both node positions and annotations, then Discard; verify both return to
    the accepted snapshot.
12. Save as New and verify both layouts have independent annotation states.
13. Test Cancel, Save and switch, and Discard and switch with annotation-only dirty
    state.
14. Make unsaved annotation changes, wait for recovery, reload, Restore and verify
    positions and annotations return together and remain dirty.
15. Repeat recovery and choose Discard; verify the server workspace opens and the
    prompt does not recur.
16. Delete a non-default layout and verify its annotations and recovery are removed
    while graph data remains.
17. Change filters and perform graph CRUD; verify annotations neither move nor hide.
18. Verify N/E and graph Delete do not act in Annotation mode and retain Stage 14
    behavior in Graph mode.
19. Verify pan, zoom, controls and graph-only Fit View remain usable.
20. Exercise the workflow with approximately 500 graph nodes and confirm no visible
    interaction regression.

## 24. Acceptance criteria

Stage 15 is accepted when:

- existing layouts migrate and load with empty annotation lists;
- Rectangle and Text operate in a clearly separate Annotation mode;
- graph nodes and edges stay visible but non-interactive in Annotation mode;
- annotations are visible but click-through in Graph mode;
- no annotation stores or infers graph membership;
- rectangle movement and resize never change node coordinates;
- complete positions and annotations save atomically;
- dirty, Save, Discard, Save as New and switching treat both parts as one workspace;
- recovery restores or discards both parts coherently;
- Stage 14 shortcuts are correctly mode-aware;
- filters, graph CRUD, manual groups and branches do not mutate annotations;
- backend ownership, validation and cascade rules pass;
- all frontend and backend tests pass;
- TypeScript compilation and production build pass;
- manual Chrome acceptance succeeds on the real graph;
- Stage 11–14 accepted behavior shows no regression.

## 25. Suggested checkpoints

1. **Annotation persistence foundation**
   - migration, model and strict schemas;
   - GET/Create annotation payloads;
   - atomic workspace save endpoint;
   - backend transaction, constraint and isolation tests.
2. **Frontend workspace state and recovery**
   - annotation types and pure helpers;
   - combined dirty/baseline behavior;
   - API integration;
   - recovery v2 and safe v1 compatibility;
   - focused tests before drawing UI.
3. **Modes and Rectangle**
   - explicit mode switch and interaction isolation;
   - viewport annotation layer;
   - Select and Rectangle tools;
   - move, resize, styling and deletion.
4. **Text and final integration**
   - inline create/edit and text styling;
   - mode-aware shortcuts;
   - complete Save/Discard/Switch/Recovery manual tests;
   - full regression, build and completion documentation.

Checkpoint commits may be combined where appropriate, but each checkpoint must
leave saved layouts readable and must not expose partially atomic persistence.

## 26. Completion documentation

At completion, record:

- migration revision and final commit checkpoints;
- exact database and API contract;
- chosen style tokens and limits;
- recovery v2 compatibility decisions;
- frontend/backend test totals;
- production build result;
- manual acceptance results on the real graph;
- performance observations;
- accepted limitations and deferred annotation features.
