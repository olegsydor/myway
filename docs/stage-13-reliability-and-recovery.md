# Stage 13. Graph workspace reliability and crash recovery

Status: specification for implementation.

Base commit: `c5f8f58` (`Document Stage 12 completion and acceptance`).

Stage 12 persistent named layouts remain the functional baseline. Stage 13 must
improve startup correctness and reliability without changing the explicit-save
model or introducing server-side autosave.

## 1. Background

Functional testing of Stage 12 in Chrome was successful. Node and group movement
is smooth and predictable, and the unbounded graph workspace is comfortable on a
large monitor.

Two reliability problems were observed during longer editing sessions:

1. After more than approximately 300 mixed single-node and group movements over
   5–20 minutes, the graph workspace became unresponsive. The browser window and
   pointer still worked, but canvas controls, including Save layout, could not be
   used. In one occurrence the page recovered after approximately 2–3 minutes. In
   other occurrences Chrome later displayed a generic page-unavailable failure.
2. On reload, the graph first visibly renders the default Dagre arrangement and
   changes to saved coordinates approximately 1–2 seconds later.

Reload after a freeze successfully restores the last server-saved layout. Only
changes made since the last explicit save are lost. Filters were used rarely,
Circle was not used, and Grid was used once, so those features are not the main
suspects. DevTools was not open during the incidents.

## 2. Goals

Stage 13 shall:

- show the graph for the first time only after the startup layout decision is
  complete;
- make long editing sessions with hundreds of movement operations stable;
- collect bounded, useful evidence about performance stalls;
- keep a browser-local recovery draft of unsaved coordinates;
- let the user explicitly choose whether to restore a valid recovery draft;
- support `Ctrl+S` / `Cmd+S` as a shortcut for the existing Save layout action;
- preserve all Stage 11 and Stage 12 movement and persistence behavior.

## 3. Non-goals

This stage does not add:

- server-side autosave;
- periodic saving to the layout API;
- undo or redo (`Ctrl/Cmd+Z`);
- node deletion with Delete;
- node editing with F2;
- drawing, annotations or timeline functionality;
- viewport persistence;
- saved manual groups or branch selections;
- simultaneous-client conflict resolution;
- a collapsible sidebar or other small-screen redesign;
- a new authentication model.

The keyboard operations above, drawing tools and sidebar improvements remain
future work.

## 4. Current implementation findings

The following are implementation facts or investigation targets, not a claimed
root cause for the freeze:

- `ReactFlowGraph` currently creates and renders automatic positions when graph
  data arrives. `usePersistentLayout` loads the default layout asynchronously and
  applies saved positions afterward. This explains the visible Dagre-to-saved
  transition.
- `layoutIsDirty` scans node coordinates whenever the controlled `nodes` array
  changes. Dragging can produce many such changes per second.
- Manual-group and branch movement can perform several complete node-array passes
  for one position-change batch.
- Save is intentionally blocked while a node reports `dragging`, while graph CRUD
  is active, while layout work is in progress, or while graph IDs are not
  reconciled. Diagnostics must reveal which condition is active if Save remains
  unavailable.
- No application-owned undo history or movement queue currently explains growth
  across operations. React rendering, React Flow state, event listeners, temporary
  arrays and browser garbage collection must therefore be measured rather than
  guessed.

## 5. Startup layout barrier

### 5.1 Required behavior

The graph canvas must not expose an intermediate automatic arrangement while the
startup layout is being resolved.

Startup shall have these visible states:

1. Graph or layout data is loading: show a stable loading state such as
   `Loading graph and layout…`; do not show positioned graph nodes.
2. A saved startup layout is available: apply its positions, including positions
   of hidden nodes, and then reveal the graph.
3. No saved layout exists: calculate the normal initial Dagre arrangement and
   reveal it once as the unsaved initial layout.
4. Layout loading fails: keep coordinate-changing actions blocked, show the
   existing understandable error and Retry action, and do not reveal a misleading
   editable Dagre graph.

The barrier concerns visible rendering. Internal node conversion or fallback
calculation may occur before reveal, provided users cannot see the intermediate
state.

### 5.2 Switching and restoration

The startup barrier must not alter normal switching between already loaded named
layouts. Existing protected switching, fallback placement for new nodes, filters,
hidden-node handling and fit-view behavior remain unchanged.

A recovery decision, when present, is part of startup. The canvas is revealed only
after the user selects the recovered draft or the last saved state.

## 6. Performance diagnostics

### 6.1 Evidence before optimization

Create a repeatable stress scenario using a representative large graph. It must
cover at least 500 nodes and at least 300 movements since the last explicit save,
including:

- single-node mouse drags;
- manual-group mouse drags;
- branch or manual-group keyboard movement;
- hidden group members;
- a mixture of short and longer movement sequences.

Record a baseline before substantial optimization. Changes to hot paths must be
justified by measurements or by a deterministic reproduction, not only by code
appearance.

### 6.2 Bounded diagnostic data

Development diagnostics shall record, where browser support exists:

- ReactFlow node-change batch count and change types;
- movement start, movement end and duration;
- node count and moved-member count;
- time spent in the application movement handler;
- layout dirty-check count and duration;
- React render count for the graph component;
- layout phase and every reason that contributes to `blocked`;
- recovery serialization size, queue delay and write duration;
- layout API request duration and result;
- long main-thread tasks through `PerformanceObserver`;
- approximate JavaScript heap information only where Chrome exposes it.

Diagnostic storage must be bounded, for example by a fixed-size ring buffer.
Instrumentation must not accumulate one permanent object, snapshot or closure per
movement. It must not make production interaction materially slower.

Diagnostics may be development-only or enabled by an explicit debug flag. Provide
a practical way to copy or export a compact diagnostic report after a stress run.
Do not log complete node labels, descriptions or arbitrary properties; IDs, counts,
durations, phases and sizes are sufficient.

### 6.3 Optimization constraints

- High-frequency drag frames must not perform avoidable persistence work.
- Recovery storage writes must never occur for every pointer-move event.
- Dirty-state correctness must remain exact at operation boundaries: returning all
  nodes to their saved coordinates clears dirty state.
- Do not retain full historical coordinate snapshots. Stage 13 keeps only the
  current working state and one recovery draft per layout.
- Event listeners, observers, animation frames, timers and storage connections must
  be cleaned up on unmount or replacement.
- Existing movement geometry must remain exact: every selected member receives the
  same delta and unrelated nodes remain fixed.

The implementation may reduce full-array passes, defer non-visible calculations
until drag completion, memoize baseline lookup structures, or split rapidly
changing interaction state from persistence state. The exact optimization is chosen
after profiling.

## 7. Local recovery drafts

### 7.1 Storage model

Use asynchronous browser storage, preferably IndexedDB, rather than synchronous
`localStorage` writes in the drag path.

Store at most one latest recovery draft for each layout identity. Also support one
draft identity for the unsaved initial layout when no server layout exists.

Each draft must contain at least:

- schema version;
- active layout ID or the unsaved-initial marker;
- active layout `updated_at` value used as its saved baseline, when applicable;
- recovery timestamp;
- complete graph-space positions for all currently loaded nodes, including hidden
  nodes;
- enough node-ID information to validate or reconcile the draft.

Do not store node labels, descriptions, properties, edges, filters, selection,
manual-group membership, branch selection, pan or zoom.

### 7.2 Draft creation

A draft is eligible only when:

- layout startup has completed successfully;
- the working arrangement is dirty;
- coordinates and node IDs pass the same validity rules used for an explicit save;
- no layout switch, save, discard or graph CRUD reconciliation is in an unsafe
  intermediate phase.

Draft creation must be debounced and performed after movement activity settles.
It must skip active drag frames and coalesce rapid single-node, group and keyboard
movements into one latest snapshot. The implementation may also impose a maximum
write frequency so continuous interaction cannot create an unbounded write queue.

Only one write per draft identity may be pending at a time. A newer eligible state
supersedes an older queued state. Completing an older asynchronous write must not
overwrite a newer snapshot.

The recovery mechanism does not promise preservation of the last pointer frame.
Its purpose is to limit loss to a short debounce window instead of the entire
unsaved editing session.

### 7.3 Startup recovery decision

After server layout data and a local draft are available, validate the draft before
offering it.

A valid draft that differs from the last saved arrangement must produce an explicit
choice before revealing the canvas:

- **Restore recovered changes** — apply matching recovered coordinates and retain
  dirty state;
- **Use last saved layout** — discard the recovery draft and open the accepted
  server snapshot.

The prompt should identify the layout and show the recovery time. It must explain
that recovery is local and unsaved.

For an unsaved initial layout, the second choice is **Use initial layout**.

Never silently replace a newer accepted server snapshot with an older local draft.
Compare the stored baseline `updated_at` with the loaded layout. If they do not
match, treat the draft as stale and do not automatically apply it. A stale draft
may be discarded with a concise notice; Stage 13 does not implement conflict
merging.

If graph membership changed but the baseline is otherwise valid:

- apply recovered coordinates to IDs present in both the draft and current graph;
- ignore draft positions for deleted nodes;
- place current nodes missing from the draft using the existing fallback rules;
- keep the arrangement dirty so an explicit save can create a complete snapshot.

A corrupt draft, unsupported schema version, duplicate/unsafe node ID or non-finite
coordinate must never prevent startup. Ignore and remove it, open the normal saved
or initial arrangement, and show a concise recovery warning.

### 7.4 Draft cleanup

Clear the relevant draft after:

- a successful explicit Save layout;
- a successful Save as new layout for the accepted working arrangement;
- Discard changes;
- choosing Use last saved layout / Use initial layout;
- successful Save and switch or Discard and switch for the layout being left;
- successful deletion of that layout.

Keep the draft after a failed save, failed switch, failed layout load, cancelled
switch or cancelled recovery prompt. Rename and Set as default preserve the draft
because layout identity and coordinates do not change.

Clearing recovery storage must occur only after the corresponding operation has
been accepted. A failed server request must not destroy recoverable coordinates.

## 8. `Ctrl+S` / `Cmd+S`

Add a keyboard shortcut for the existing Save layout operation:

- `Cmd+S` on macOS and `Ctrl+S` elsewhere invoke the same guarded save operation as
  the Save layout button;
- prevent the browser's Save Page dialog when the application handles the shortcut;
- do not create a duplicate request while save or another blocking operation is in
  progress;
- do not save coordinates behind an open layout-management or recovery dialog;
- when there are no unsaved changes, perform no request;
- when no layout exists and the initial arrangement is dirty, the shortcut follows
  the existing first-save behavior and creates Main;
- failures retain working coordinates and the recovery draft and use the existing
  visible error handling.

Keyboard handling must be registered once and cleaned up correctly. Text entry in
layout-name fields must remain normal.

## 9. Preservation requirements

All previously accepted behavior remains valid:

- independent named layouts and protected switching;
- complete snapshots including hidden nodes;
- single-node, branch and manual-group movement by mouse and keyboard;
- exact same-delta group geometry;
- stationary non-members;
- filtering without coordinate loss;
- fallback placement of newly created nodes;
- deleted-node cleanup;
- Grid, Circle and Dagre as unsaved local coordinate changes;
- Save, Save as new, Discard, Rename, Set as default and Delete semantics;
- browser leave warning for dirty work;
- no graph-data changes caused by layout operations.

## 10. Tests

### 10.1 Unit tests

Add deterministic tests for:

- recovery draft serialization and validation;
- inclusion of hidden nodes;
- corrupt, duplicate-ID and non-finite-coordinate rejection;
- schema-version rejection;
- stale-baseline detection;
- exact-match and changed-membership restoration;
- one-latest-draft behavior under overlapping asynchronous writes;
- debounce/coalescing and no write during drag;
- cleanup rules for save, discard, switch and delete;
- preservation after failed or cancelled operations;
- `Ctrl/Cmd+S` guards and duplicate-request prevention;
- bounded diagnostic buffering;
- dirty-state correctness after optimized movement handling.

Keep and extend the existing `persistentLayouts.test.ts` and
`layoutApi.test.ts` coverage. Add focused modules and tests rather than placing
browser-storage behavior directly into the large graph component.

### 10.2 Integration and manual checks

In Chrome, verify:

1. Reload never shows Dagre before a saved layout.
2. A first-time user with no layouts sees one initial arrangement after loading.
3. A layout-load error exposes Retry without an editable misleading canvas.
4. More than 300 mixed movements on a graph of at least 500 nodes do not make the
   workspace unusable.
5. Save becomes actionable promptly after drag completion and reports why it is
   blocked in debug diagnostics if it does not.
6. Reload after unsaved movement offers recovery and restores exact matching-node
   coordinates, including hidden members.
7. Choosing the saved layout removes the draft and does not ask again.
8. Successful Save removes the draft; failed Save preserves it.
9. A stale or corrupt draft cannot block startup.
10. `Cmd+S` on macOS and `Ctrl+S` on other platforms use the existing save flow.
11. Layout switching, deletion, graph CRUD and browser-leave protection retain
    Stage 12 behavior.

## 11. Acceptance criteria

Stage 13 is accepted when all of the following are true:

- there is no visible automatic-layout flash before saved coordinates;
- a deterministic stress run of at least 500 nodes and 300 mixed movements
  completes without a multi-second application stall, page failure or permanently
  unavailable Save action;
- after a completed drag, Save and other controls respond normally without waiting
  for accumulated historical work;
- diagnostic records remain bounded throughout the stress run;
- memory does not grow in proportion to the total historical movement count after
  garbage collection and idle stabilization;
- a valid recovery draft limits crash/reload loss to the configured debounce
  window and is never sent to the server automatically;
- users explicitly choose whether to restore recovered coordinates;
- successful explicit persistence and deliberate discard remove obsolete drafts;
- all existing frontend tests and production build pass;
- new recovery, diagnostic and shortcut tests pass;
- Stage 11 group behavior and Stage 12 layout acceptance scenarios show no
  regression.

Machine-dependent frame times and heap values shall be recorded during testing but
are not treated as portable absolute guarantees. The non-negotiable result is the
absence of accumulated multi-minute blocking and unbounded application-owned
history.

## 12. Suggested implementation boundaries

Keep responsibilities separated:

- `ReactFlowGraph.tsx`: startup visibility barrier, movement integration, stress
  hooks and shortcut wiring;
- `usePersistentLayout.ts`: persistence phases, recovery decision integration,
  operation outcomes and cleanup triggers;
- `LayoutControls.tsx`: loading/recovery/status UI and guarded actions;
- `persistentLayouts.ts`: pure snapshot, comparison and restoration logic;
- new focused recovery module: IndexedDB access, schema validation, debounce and
  latest-write ordering;
- new focused diagnostics module: bounded measurements and report export;
- `App.css`: loading barrier and recovery dialog presentation;
- tests: pure recovery/diagnostic tests plus extensions to existing layout tests.

Names of new modules are implementation choices. Avoid adding recovery storage,
diagnostic buffers or keyboard logic directly as more unrelated state inside the
already large `ReactFlowGraph` component.

## 13. Implementation order and checkpoints

1. **Startup barrier and baseline diagnostics**
   - reproduce and measure the current path;
   - remove the visible Dagre-to-saved transition;
   - add bounded instrumentation and blocked-reason reporting.
2. **Measured stability work**
   - run the stress scenario;
   - optimize proven hot paths;
   - repeat measurements and document before/after evidence.
3. **Local recovery**
   - add async draft storage, validation, debounced latest-write behavior, startup
     choice and cleanup rules.
4. **Shortcut and final regression**
   - add `Ctrl/Cmd+S`;
   - run unit tests, production build, Stage 11/12 regression checks and final
     Chrome stress/recovery acceptance.

Do not combine the diagnostic checkpoint with speculative broad refactoring. Each
checkpoint should leave the application testable and preserve saved layout data.

## 14. Documentation handoff

At completion, update this document or add a completion record containing:

- commits/checkpoints;
- confirmed freeze cause or the strongest measured explanation;
- stress graph size and operation mix;
- before/after timing and memory observations;
- recovery debounce and storage decisions;
- tests and build results;
- Chrome acceptance results;
- any remaining limitations or follow-up work.

