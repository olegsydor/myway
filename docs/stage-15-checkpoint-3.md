# Stage 15 Checkpoint 3 — Modes and Rectangle

Date: 2026-10-27. Baseline: `df718a8` (workspace state and recovery v2).
The user confirmed that the UI and gestures behaved as expected and authorized
committing this checkpoint before proceeding to Text.

## Delivered behavior

A visible Workspace mode control switches between Graph and Annotation. Startup
begins in Graph; mode/tool/selection are never persisted. Entering Annotation
clears ordinary selection, highlights, manual groups and branches while preserving
filters, hidden flags and coordinates. Returning to Graph clears annotation
selection and cancels a pending gesture. Layout switching retains mode and resets
the annotation tool to Select.

Annotation mode disables graph selection, dragging, keyboard movement, CRUD and
search/navigation selection actions. The graph remains rendered at normal opacity.
Type filters remain available. Layout persistence, pan, zoom and graph-only Fit View
remain available. Graph mode retains its existing actions and annotations are
visible with pointer events passing through them.

Rectangle is a one-shot tool:

- Primary drag creates a normalized rectangle in graph coordinates, even above nodes.
- Pointer capture follows drawing/moving/resizing outside the original hit area.
- A 20-unit minimum applies to both creation dimensions and resizing.
- Single selection supports body movement and eight side/corner resize handles.
- Geometry previews remain separate from committed annotations until pointer release.
- Escape, pointer cancellation, tool changes and mode changes cancel previews.
- Secondary/middle gestures and empty Select-mode drags remain available for panning.
- Color, fill and border controls use the constrained semantic palette.
- Delete rectangle and canvas Delete/Backspace use an annotation-only confirmation.
  Cancel preserves selection and values. Confirm changes working state only.

The annotation controller receives no graph node or edge IDs. It never writes graph
state. Geometry, interaction state, visual styles, controls/dialog and viewport
rendering have focused modules outside `ReactFlowGraph.tsx`.

## Rendering and integration

Annotations render through React Flow `ViewportPortal`, sharing its viewport
transform without becoming React Flow nodes or edge endpoints. Layer order is:
background, rectangle fills/borders, graph edges, graph nodes, annotation text,
annotation hit targets and selected controls. Overlapping rectangles retain stored
order; later ones receive hits first. Handles remain approximately 10 screen pixels
across zoom levels.

CSS values have one semantic mapping in `annotationStyles.ts`. Existing persisted
text is displayed, but text creation/editing remains checkpoint 4 scope.

The existing centralized keyboard listener now takes workspace mode as context.
N/E and group/branch fallback actions are disabled in Annotation mode, Delete routes
to annotation confirmation, and Cmd/Ctrl+S still uses the complete guarded workspace
save. Escape cancels annotation gestures with the existing editable/modal/repeat/IME
guards. There is no mode-switch hotkey or new independent global keyboard listener.

`annotationBusy` connects gesture activity to checkpoint 2 persistence/recovery
locks. Preview frames do not update committed annotation snapshots or serialize
recovery. Pointer release commits once; recovery resumes with the complete latest
workspace. Node interaction objects are memoized to avoid recreating the entire
graph-node array on every annotation preview frame.

Backend, API contracts, database schema, graph algorithms and production dependencies
are unchanged in this checkpoint. No migration or service restart is required.

## Verification

- **206 frontend tests passed, 0 failed** (27 additional tests).
- Pure geometry tests cover all eight handles, opposite-edge preservation, minimum
  sizes, direction normalization, move identity/style preservation and nonfinite inputs.
- Graph-highlight reset tests verify hidden flags, data and coordinates are preserved.
- Eleven real-React controller tests cover transient modes/tools, creation, preview
  cancellation, pointer identity/capture, selection, movement, resize, style changes,
  deletion confirmation, layout reset and persistence/graph operation guards.
- Three additional tests connect the real annotation and persistence hooks: previews
  block Save without making the workspace dirty, committed creation saves both parts,
  Discard restores both parts and switching clears tool/selection while retaining mode.
- Shortcut tests cover mode isolation, annotation Delete, Save and Escape guards.
- Existing Stage 11–14, layout API and recovery regressions remain green.
- TypeScript compilation and Vite production build passed.
- Lint passed with existing graph/layout warnings; new annotation modules and tests
  produce no warnings. Git whitespace checks passed.

## Interactive evidence and its limits

An in-app browser opened the actual local My Way application and its existing large
personal graph. These checks completed through real UI input:

- Graph/Annotation controls and disabled graph tools in Annotation mode.
- Rectangle creation, movement and southeast resize.
- DOM node transforms unchanged before and after move/resize.
- Purple color, Medium fill and Thick border selection.
- Cancel in the annotation deletion dialog preserving the rectangle.
- Graph-mode click-through: selecting a graph node within the rectangle.
- Returning to Annotation clears graph node and edge selection.
- Person type filter and rendered filtered-node IDs survive both mode transitions.
- N/E leave focus on the canvas and graph creation remains disabled.
- Canvas Delete opens the annotation dialog, and confirmation removes only the
  scratch rectangle. The workspace returns to clean because that rectangle was new.

No Save was submitted in the real browser, so these checks did not rewrite saved
layouts, graph nodes, edges or positions. Persistence and failure paths are covered
by automated hook/API tests. Full save/reload/recovery browser acceptance, Chrome
acceptance, pan/zoom acceptance and final performance measurements remain part of
the later integration checkpoint.

A screenshot of the styled scratch rectangle is retained as a chat artifact, outside
the Git repository. A later attempt to refresh that screenshot hit a browser-input
timeout and the browser connection became unavailable. That interrupted attempt is
not counted as a pass; final cleanup of its temporary browser-local draft could not
be confirmed. Earlier scratch deletion was confirmed clean. No server Save occurred.

Temporary pointer diagnostics were removed; no per-pointer-frame logging remains.
