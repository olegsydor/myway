# Stage 16 — Checkpoint 1

Baseline: `e03d174c232a7db270b8ff1783a1f21d12bf3881`.
Scope: command surface and shell foundations only. Changes are uncommitted for review.

## Implemented

- `workspaceCommands` maps existing Graph/Annotation, dirty, blocked and locked
  state to shared Save, New Node, New Edge, Grid, Circle, Dagre, Fit and Reset
  callbacks. `useWorkspaceCommands` keeps command identities stable until their
  availability changes and invokes the latest committed controller callbacks.
- The existing Save button and Stage 14 Save shortcut share the Save command.
  N/E use the shared form-focus commands. Existing Arrange, Fit and Reset buttons
  delegate through the adapter. Arrangement still reaches the original dirty
  confirmation and layout path. Fit keeps padding 0.1 and duration 300 ms.
- `ApplicationShell` supplies a 54 px application bar and a remaining-height
  workspace. Current sidebar facilities, layout dialogs, mode controls, errors,
  diagnostics and annotation controls remain in place. Existing identity text
  remains until the Checkpoint 2 command migration.
- Reusable `ApplicationMenu` and its menu model support one open menu, trigger
  toggling and hover switching, disabled commands, enabled-item navigation,
  Home/End, nested submenus, Escape focus restoration, normal Tab exit, safe
  outside-pointer dismissal and blocked/modal closure. Product menu definitions
  are deliberately not mounted yet.
- The Alt-alone registration helper is tested for Windows/Linux safety gates and
  macOS non-capture. Its actual application-bar registration belongs to the visible
  menu migration. Callers must provide the modal/editor/form/composition/gesture
  safety gate.
- The Stage 14 capture listener yields to menu targets/open menus before shortcut
  dispatch, including Cmd/Ctrl+S, so later menu navigation cannot trigger graph
  actions behind it. Existing deletion, annotation Escape, form protection and
  dialog ownership are retained.

## Verification

Commands run in `poc/graph-visualization` with the installed Node 24 runtime:

- `npm test`: **236 passed, 0 failed** (Stage 15 baseline: 223; 13 new tests).
- `npm run build`: TypeScript compilation and Vite production build passed.
- `npm run lint`: exit 0; **16 pre-existing warnings**, matching an independent
  lint run over an archive of `e03d174`. No additional reported warnings.
- `git diff --check`: passed.

New tests exercise command delegation and availability, stable callback identities
and current handlers, Save/Create dispatch, form/modal protection, menu isolation
from Stage 14, menu state, item/submenu keyboard navigation, focus requests,
rendered-menu focus restoration, outside-pointer dismissal, modal blocking,
Alt-alone combinations/composition/safety gates and macOS non-registration.
The rendered-component test compiles the actual TSX through the already installed
TypeScript dependency because Node's native TS runner does not parse JSX.

There is one local `react/refs` lint suppression at command construction: the
analyzer treats callbacks passed through the command factory as potential render
calls. The factory stores them; the refs are read only when commands execute.
The tests verify that construction does not invoke handlers and that subsequent
invocations reach the latest committed handlers.

Backend/model/API/recovery contracts are untouched. The recorded Stage 15 backend
baseline is **138 passed, 0 failed** (`docs/stage-15.md`); backend tests were not
rerun for this frontend-only checkpoint.

## Deliberately pending

Checkpoint 2 owns the five product menus, Help dialog, status/Save/mode relocation
and removal of old command surfaces. Checkpoint 3 owns remembered panel state,
responsive overlay/docking and panel-aware N/E. Checkpoint 4 owns complete manual
acceptance and final Stage 16 delivery documentation.

No Chrome/manual viewport or real-graph acceptance is claimed here; focus and
pointer behavior were verified by the model and rendered-component test harness,
not a native browser run. Full browser, real 500-node graph, and Windows/Linux
acceptance remain pending. The pre-existing untracked `stage-16-ui-input.zip`
was left untouched.
