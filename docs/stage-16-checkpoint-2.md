# Stage 16 — Checkpoint 2

Baseline: `e03d174c232a7db270b8ff1783a1f21d12bf3881`, continuing the
uncommitted Checkpoint 1 work. Checkpoint 2 is implemented; changes remain
uncommitted for review. Stage 16 is not yet complete.

## Changes

- `ReactFlowGraph` now renders its application shell, where its existing layout,
  annotation and graph controllers already live. `App` retains a small shell for
  loading/error states. The old large header, Personal graph subtitle and My Way
  tools heading are no longer rendered.
- `ApplicationBar` supplies Layout, Create, Arrange, View and Help menus, the active
  layout name/status, guarded Save and the extracted Graph/Annotation switch.
  Status comes from the existing layout phase/error/dirty values. Long layout
  names truncate; the bar can wrap on widths below the desktop target.
- `LayoutControls` keeps its original dialog state, validation and async success/
  failure behavior. Its render prop supplies menu items/status without creating
  another layout controller. Dirty switching still offers Save/Discard/Cancel;
  the default layout remains protected from deletion. Errors/notices and retry/
  refresh actions remain visible in `LayoutMessages` in the sidebar.
- The old Saved layout card, Arrange nodes block, duplicated mode switch and
  standalone diagnostic export button are removed. Annotation tool/property
  controls continue to use the Stage 15 controller.
- Save from the bar, Layout menu and Stage 14 dispatch uses the shared command.
  Protected forms/editors, layout locks and incomplete annotation operations
  prevent saving. Create delegates to the existing reveal/scroll/focus callbacks;
  arrangement delegates to the existing dirty-confirmation path. Fit retains
  padding 0.1 and duration 300 ms. Fit/Reset availability now includes workspace
  readiness; Fit remains available in both modes when ready.
- `HelpDialog` documents delivered shortcuts only, uses a native modal, traps Tab
  on its Close button, handles Escape and explicitly restores the Help trigger.
  Existing layout dialogs explicitly restore the Layout trigger too.
- Menu primitives now include non-command headers, separators and shortcut hints.
  Modal/editor/gesture gates prevent menu opening; Alt-alone is installed only on
  non-Mac platforms, respects forms and pointer activity, and is covered by tests.
  Outside dismissal consumes both pointerdown and the ensuing click so it cannot
  select an underlying node. Other application-bar controls remain usable.
- Diagnostic metrics and Export diagnostics are rendered only with the existing
  startup `layoutDebug=1` capability. Collector/export behavior is unchanged.

## Verification

Using the installed Node 24 runtime in `poc/graph-visualization`:

- `npm test`: **246 passed, 0 failed** (236 after Checkpoint 1; 10 added here).
- `npm run build`: TypeScript and production build passed.
- `npm run lint`: exit 0, **13 existing warnings**, down from 16 at Checkpoint 1
  because the removed JSX command surfaces no longer trigger three old warnings.
  New components/tests have no reported lint warnings. The documented Checkpoint 1
  command-factory suppression remains.
- `git diff --check`: passed.

New coverage exercises layout menu delegation, clean/dirty switching, immediate
lock guards, default-layout protection, derived status, all five menu definitions,
Graph/Annotation availability, debug-only export visibility, protected Save,
workspace readiness and Help content. Rendered-component tests reach the retained
layout dialogs, trimmed-name validation, failed-save dialog retention, Delete,
Help focus trapping/restoration and extracted Stage 15 controls. Existing menu
coverage also verifies the swallowed outside click and Alt during pointer input.
All existing Stage 11–15 frontend tests remain green.

Browser smoke verification used the existing isolated Stage 15 fixture at
`/tests/browser/stage15.html`, which intercepts API requests and never reaches the
application database. Verified in the Codex in-app browser on macOS:

- menu opening, keyboard invocation, Switch layout submenu and Create form focus;
- Save as New access, Escape closure and explicit Layout focus restoration;
- Help content, Tab trap, Escape and Help focus restoration;
- Create disabled in Annotation mode;
- Grid causing Unsaved, protected dirty switching and Cancel retaining the layout;
- Fit preserving Unsaved and top-bar Save returning the fixture to Saved;
- outside click closing the menu without selecting a node;
- normal startup without metrics and debug startup with metrics/export.

The smoke viewport was approximately 663 CSS px wide; the bar remained reachable
by wrapping. This does not replace the specified desktop/laptop acceptance matrix.
Native Chrome automation timed out, so no Chrome, physical Windows/Linux Alt,
wide-screen, or real approximately 500-node graph acceptance is claimed here.
Those remain part of Checkpoint 4/user acceptance. A screenshot of the isolated
fixture was saved separately for the chat report.

No backend, API, database, annotation model, saved layout or recovery contract
changes. The recorded backend baseline remains Stage 15's **138 passed**, not rerun.
The existing untracked `stage-16-ui-input.zip` remains untouched.

## Boundaries

The sidebar remains docked and always open at this checkpoint. Its toggle, View
Show/Hide command, remembered preference, overlay/backdrop presentation and
mode-specific hiding belong to Checkpoint 3. N/E already share the Create command;
opening a closed panel is deferred until such a panel exists in Checkpoint 3.

Checkpoint 3 has not been started. Full Stage 16 acceptance/documentation remains
Checkpoint 4; this report does not assert completion or user acceptance of Stage 16.

## User acceptance

The user explicitly accepted Checkpoint 2 in this chat before authorizing Checkpoint 3.
