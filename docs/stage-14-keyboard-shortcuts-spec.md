# Stage 14 — Graph Keyboard Shortcuts

**Status:** Specification for implementation

**Repository baseline:** `c0d9a70` — Stage 13 completion and acceptance

**Stage 13 implementation checkpoint:** `7c3a2b4`

## 1. Objective

Add a small, predictable set of desktop keyboard shortcuts for frequent graph
operations without changing the underlying graph CRUD, layout persistence or local
recovery models.

Stage 14 adds shortcuts for:

- saving the active layout;
- deleting one ordinarily selected node or edge;
- editing one ordinarily selected node or edge;
- opening node creation;
- opening edge creation.

The shortcuts must invoke the existing guarded actions. They must not create a
second implementation of save, edit or delete behavior.

## 2. Scope

| Shortcut | Action |
|---|---|
| `Cmd+S` on macOS / `Ctrl+S` elsewhere | Save the active layout |
| `Delete` or canvas `Backspace` | Delete one ordinarily selected node or edge |
| `F2` | Edit one ordinarily selected node or edge |
| `N` | Open Create Node and focus its first field |
| `E` | Open Create Edge and focus its first field |

Shortcut definitions must be centralized so that changing `N` or `E` later is a
small, localized change.

## 3. Non-goals

Stage 14 does not add:

- undo or redo;
- bulk deletion;
- editing or deletion of a manual group as one object;
- editing or deletion of a selected branch as one object;
- creation of a node automatically connected to the current node;
- automatic source selection for a new edge;
- automatic edge creation;
- cascade deletion of connected edges;
- user-configurable shortcut settings in the UI;
- drawing or annotations;
- changes to server layout persistence or IndexedDB recovery semantics.

`Shift+N` is intentionally left unused so it can be considered later for a
possible Create Connected Node workflow after that workflow is designed.

## 4. Selection model

Delete and F2 operate only when exactly one ordinary graph element is selected:

- one node; or
- one edge.

An ordinary selection is the standard single-element React Flow selection shown by
the normal selected-element highlight. The action target must be derived from the
current selection at the moment the key is pressed, not from an older remembered
element.

The following do not constitute a Delete or F2 target:

- visual highlighting of manual-group members;
- visual highlighting of branch members;
- a manual-group anchor;
- a branch anchor;
- search-result highlighting;
- filtered or hidden elements that are not ordinarily selected.

If zero elements are selected, no edit or delete action occurs. If an unexpected
state contains more than one ordinarily selected element, no edit or delete action
occurs. Stage 14 must never infer a bulk operation.

Clicking empty canvas continues to clear ordinary selection according to the
existing behavior.

## 5. Shared keyboard dispatch

Implement one centralized keyboard dispatcher or hook for graph shortcuts. Do not
add unrelated global `keydown` listeners independently to multiple controls.

The shortcut configuration should be represented in one module, for example:

```ts
export const GRAPH_SHORTCUTS = {
  saveLayout: "mod+s",
  deleteElement: ["delete", "backspace"],
  editElement: "f2",
  createNode: "n",
  createEdge: "e",
} as const;
```

The exact internal representation and module name are implementation choices. The
required property is that default bindings and matching rules have a single owner.

### 5.1 Common guards

`N`, `E`, `F2`, `Delete` and `Backspace` must not trigger when:

- focus is in `input`, `textarea` or `select`;
- focus is in a content-editable element;
- an IME composition is active;
- a modal dialog is open, except for keys intentionally handled by that dialog;
- the key event is an automatic repeat;
- a conflicting graph CRUD or layout operation is active;
- the shortcut includes an unsupported modifier combination.

`N` and `E` require no Ctrl, Cmd, Alt or Shift modifier. Matching should be
case-insensitive for the unmodified key value while still reserving `Shift+N`.

Delete, Backspace, F2, N and E are canvas-context actions. They are eligible after
the user has interacted with or focused the graph canvas. They must not take over
the same keys while the user is working in the left tools panel.

The dispatcher must register once and remove its listener on unmount. Re-renders
must not accumulate listeners or retain stale action state.

### 5.2 Preventing browser defaults

Call `preventDefault()` only when the application recognizes and owns the relevant
shortcut context.

`Ctrl/Cmd+S` is application-owned while My Way is open and must prevent the
browser's Save Page action even when the layout cannot currently be saved. Other
keys should preserve their browser or editing behavior outside the canvas context.

## 6. Save Layout — `Ctrl/Cmd+S`

`Cmd+S` and `Ctrl+S` must invoke the same existing guarded Save Layout operation as
the Save Layout button.

Required behavior:

- prevent the browser Save Page dialog;
- use the active layout and current complete node-position snapshot;
- include hidden nodes through the existing Stage 12 save path;
- respect layout phase, graph CRUD, dragging and node-reconciliation guards;
- do not start a duplicate request while another operation is in flight;
- ignore repeated `keydown` events;
- when the layout is clean, perform no API request;
- when no saved layout exists, retain the existing first-save behavior;
- on success, accept the saved baseline and clear obsolete Stage 13 recovery using
  the existing save workflow;
- on failure, retain working coordinates, dirty state and the recovery draft and
  show the existing error.

If a create/edit form or modal operation is active, the shortcut must not silently
save the layout behind that operation. Prevent the browser default and give a
concise visible notice such as `Finish or cancel the current operation first.`

The keyboard path must call the same save controller used by the button rather
than reproducing layout API calls in the shortcut layer.

## 7. Delete selected element — `Delete` / `Backspace`

### 7.1 General behavior

Delete operates on exactly one ordinary selection. It must use the same node or
edge deletion controller as the existing UI.

Both `Delete` and `Backspace` are recognized in canvas context because the physical
Delete key on macOS commonly reports `Backspace` in the browser. Backspace must
remain ordinary text deletion in editable controls.

The shortcut opens an application confirmation dialog. It must not immediately
send a delete request and must not rely only on `window.confirm`.

Cancel:

- closes the dialog;
- makes no API request;
- preserves the ordinary selection.

During confirmed deletion:

- disable duplicate confirmation and submission;
- preserve the existing graph-operation lock;
- keep the dialog open with a useful error if deletion fails;
- after success, close the dialog, clear the deleted selection and refresh the
  canonical graph through the existing flow.

### 7.2 Edge deletion

The dialog must clearly identify the edge, using its type and, where available,
the source and target labels.

Example:

> Delete edge “works at” from “Oleh” to “Company”?

Confirmation deletes only that edge. It never deletes either endpoint node.

### 7.3 Node deletion

The dialog must clearly identify the node by its label.

For a node with no incident edges, show destructive confirmation such as:

> Delete node “Project A”? This cannot be undone.

For a node that has one or more incoming or outgoing edges, do not offer a
destructive confirmation action. Show an informational dialog such as:

> This node cannot be deleted because it is connected to one or more edges.

The connection check must use the canonical loaded graph, not only currently
visible or filtered edges.

The backend prohibition remains authoritative. If graph state changes between the
client check and request, a backend `node_has_edges` conflict must be shown in the
dialog and the node must remain intact. Stage 14 must not automatically delete
edges, retry after deleting edges or otherwise bypass this rule.

### 7.4 Layout and recovery preservation

Keyboard deletion must preserve the existing graph CRUD behavior:

- coordinates of remaining nodes do not move;
- deletion of a node relies on the existing backend cascade for that node's saved
  layout-position rows only after deletion is valid;
- Stage 13 recovery pauses during the unsafe operation and reconciles through the
  existing graph-refresh path;
- an edge deletion does not change layout coordinates by itself.

## 8. Edit selected element — `F2`

F2 opens the existing editor for the one ordinarily selected element:

- selected node → Edit Node;
- selected edge → Edit Edge.

F2 only opens and focuses the existing edit UI. It does not submit changes.

The editor must be populated from current canonical element data. Existing
validation, save, error and cancel behavior remains unchanged.

If no unambiguous ordinary selection exists, F2 performs no action. It must not
edit a manual group, a branch, an old remembered selection or the first highlighted
member of a group.

Opening the editor should bring the relevant section into view and focus its first
appropriate editable field without changing graph coordinates.

## 9. Open Create Node — `N`

When the canvas context is active, unmodified `N` must:

- open or activate the existing Create Node section;
- bring it into view if necessary;
- focus the first appropriate input;
- preserve all existing form validation and submission behavior.

It must not immediately create a node. It must not derive a connection, edge type,
direction, parent or initial relationship from the currently selected node.

The existing new-node placement and layout dirty/recovery behavior after successful
creation remains unchanged.

## 10. Open Create Edge — `E`

When the canvas context is active, unmodified `E` must:

- open or activate the existing Create Edge section;
- bring it into view if necessary;
- focus the first appropriate input;
- preserve all existing form validation, DAG validation and submission behavior.

It must not immediately create an edge. A currently selected node does not
automatically become source or target in Stage 14.

## 11. Dialog behavior and accessibility

Use the established application dialog styling and interaction pattern.

Delete dialogs must:

- use clear node/edge-specific titles and descriptions;
- place initial focus on the safe Cancel or Close action;
- support Escape to cancel or close while no request is in flight;
- keep destructive and non-destructive actions visually distinct;
- trap focus while open through the existing native or application dialog pattern;
- expose useful accessible names and descriptions;
- block graph movement and other shortcuts behind the dialog;
- retain error text in an `aria-live` or alert region when a request fails.

The connected-node informational dialog contains Close but no Delete action.

Shortcut hints may be added to relevant button titles or small labels, but a new
shortcut-help screen and user keybinding editor are outside this stage.

## 12. Error behavior

- Shortcut errors use the existing visible graph action or layout error surfaces.
- A failed Save preserves dirty state and recovery.
- A failed Delete preserves the selected element and current graph.
- A failed graph refresh after a successful server deletion must report the refresh
  failure without pretending the server deletion was rolled back.
- N, E and F2 must not erase partially entered data from another form.
- Unsupported or unavailable actions must fail safely without throwing an uncaught
  browser error.

## 13. Implementation boundaries

Suggested responsibilities:

- a new focused shortcut configuration/resolver module owns bindings, key matching
  and editable-target detection;
- one React hook or graph integration layer owns listener lifecycle and dispatch;
- `ReactFlowGraph.tsx` supplies current ordinary selection and existing action
  callbacks;
- `usePersistentLayout.ts` remains the owner of guarded Save behavior;
- existing create/edit/delete handlers remain owners of CRUD behavior;
- a focused Delete dialog component may be added if keeping it outside the already
  large graph component improves clarity;
- `App.css` supplies only necessary dialog and shortcut-hint styles;
- pure shortcut logic receives direct unit coverage.

Do not move API requests, persistence rules or recovery storage into the keyboard
dispatcher.

## 14. Automated tests

Add focused tests for:

- `Cmd+S` and `Ctrl+S` resolution;
- browser Save Page prevention;
- no save request for a clean layout;
- no duplicate save during an in-flight operation or key repeat;
- existing failure and recovery preservation on shortcut save;
- Delete and Backspace only in canvas context;
- ordinary text deletion in editable fields;
- exactly-one-selection requirement;
- manual group and branch highlighting not becoming delete/edit targets;
- Delete opens confirmation without sending a request;
- Cancel preserves selection and sends no request;
- unconnected-node confirmation and successful deletion;
- connected-node informational dialog with no destructive action;
- backend node-edge conflict preservation;
- edge confirmation identifies the correct edge and deletes only it;
- F2 opens the correct existing editor without submitting;
- N and E open and focus the correct forms without creating data;
- N and E do not activate while typing or with Ctrl, Cmd, Alt or Shift;
- IME composition and repeated events are ignored;
- modal dialogs block unrelated shortcuts;
- listener cleanup and absence of duplicate registrations;
- centralized bindings can be changed without changing dispatch behavior.

Existing Stage 11 manual-group tests, Stage 12 persistence tests and Stage 13
diagnostics/recovery tests must continue to pass.

## 15. Manual acceptance checklist

Test in Chrome on macOS and, where practical, verify Ctrl behavior independently:

1. Move a node, press `Cmd+S`, reload and confirm its position persists.
2. Press `Cmd+S` repeatedly while saving and confirm only one request is made.
3. Press `Cmd+S` on a clean layout and confirm no request and no browser Save Page.
4. Select an unconnected node, press Delete, cancel and confirm nothing changes.
5. Repeat and confirm deletion; remaining nodes retain their coordinates.
6. Select a connected node, press Delete and confirm no destructive action exists.
7. Select an edge, press Delete, confirm its identity and delete only that edge.
8. Select a node and press F2; verify the correct populated editor opens.
9. Select an edge and press F2; verify the correct populated editor opens.
10. Activate a manual group or branch and confirm Delete/F2 do not target the group.
11. Focus the canvas and press N; verify Create Node opens and receives focus.
12. Focus the canvas and press E; verify Create Edge opens and receives focus.
13. Type `n`, `e`, Backspace, Delete and F2-equivalent input while editing fields;
    confirm ordinary form behavior and no background action.
14. Open a dialog and confirm graph shortcuts do not act behind it.
15. Verify keyboard CRUD preserves Stage 13 recovery and startup behavior.

## 16. Acceptance criteria

Stage 14 is accepted when:

- every agreed shortcut invokes the existing corresponding action;
- shortcut bindings and matching rules have one centralized owner;
- only one ordinary node or edge can be edited or deleted by keyboard;
- no group or bulk delete path exists;
- node deletion still fails whenever the node is connected to an edge;
- all deletion paths require an explicit application dialog decision;
- N and E are safe during text entry and can be changed centrally with small
  implementation effort;
- browser Save Page is suppressed for `Ctrl/Cmd+S`;
- duplicate keyboard operations are prevented;
- coordinates, named layouts and local recovery preserve Stage 12/13 semantics;
- all frontend tests pass;
- TypeScript compilation and the production build pass;
- manual Chrome acceptance shows no regression in mouse-driven controls.

## 17. Suggested checkpoints

1. **Central shortcut infrastructure and non-destructive actions**
   - centralized bindings and resolver;
   - common guards and listener lifecycle;
   - `Ctrl/Cmd+S`, F2, N and E integration;
   - focused unit tests.
2. **Safe keyboard deletion**
   - exactly-one-selection targeting;
   - node/edge confirmation dialogs;
   - connected-node informational behavior;
   - error, lock and selection preservation tests.
3. **Regression and acceptance**
   - complete frontend tests and production build;
   - Stage 11–13 regression checks;
   - Chrome manual shortcut acceptance;
   - final Stage 14 completion documentation.

Each checkpoint must leave mouse-driven UI actions operational and must not change
the explicit-save layout model.
