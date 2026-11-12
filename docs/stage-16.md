# Stage 16 — Application Shell and Navigation

Implementation and Checkpoint 4 verification completed on 2026-11-12.
User acceptance of Checkpoints 2 and 3 is recorded below. This closes the agreed
shell/navigation implementation with the explicitly deferred issues and validation
limits described here; it does not claim a new performance benchmark.

## Source and delivery state

Specification: user-provided `stage-16-application-shell-spec.md` from the linked
Stage 16 discussion. Baseline: `e03d174c232a7db270b8ff1783a1f21d12bf3881`
(Stage 15 completion and acceptance).

The Stage 16 delivery is recorded in the commit containing this report, whose
parent is the baseline above. Earlier checkpoint reports describe their original
verification-time working-tree state. This delivery includes source, tests and
documentation; no push or release is included.
The pre-existing untracked `stage-16-ui-input.zip` is untouched.

| Checkpoint | Delivered result | Acceptance/evidence |
| --- | --- | --- |
| 1 | Shared commands, keyboard/menu primitives and shell slots | 236 tests; foundational change |
| 2 | Five application menus, status/Save/mode migration, Help and existing dialogs | 246 tests; user explicitly stated “Checkpoint 2 - done” |
| 3 | Remembered responsive tools panel; panel-aware Create/N/E; contextual tools | 253 tests; user confirmed all seven requested manual checks behave as specified |
| 4 | Final accessibility/regression/responsive checks, one focus-protection fix and this report | 253 tests; independent Chrome verification on macOS |

The user also reported occasional hangs after substantial unsaved editing and
successful recovery through the expected flow. They explicitly requested that
supplied diagnostics be retained as context for later work, **not investigated or
fixed now**. Acceptance of shell behavior does not erase that known observation.

## Final implementation

`App` retains loading/error handling. The working graph owns `ApplicationShell`
so its existing controllers supply the bar without moving graph state into a second
controller. The old large My Way/Personal graph header and My Way tools heading
are gone. The compact persistent bar has Tools, My Way, Layout/Create/Arrange/View/
Help, layout name/status, Save and Graph/Annotation in the specified order.

`workspaceCommands`/`useWorkspaceCommands` supply guarded command availability and
stable callbacks to the existing controllers. Cmd/Ctrl+S remains dispatched by
Stage 14 and shares Save with the bar/menu. N/E and Create reveal the same existing
forms without submitting or preselecting endpoints. Arrangement preserves its
original dirty-layout confirmation; Fit retains padding 0.1/duration 300 ms.
Reset clears the original selection/highlighting without resetting filters or
viewport. Ready/busy/mode/form/editor guards remain in force.

`LayoutControls` retains one set of dialog/name/validation state. Layout menu
commands reuse Save as New, Rename, Delete and dirty-switch Save/Discard/Cancel
flows and controller guards. The default layout cannot be deleted. Failures keep
the existing recovery guarantees. `LayoutMessages` keeps errors, notices and
retry/refresh actions visible in the panel; status is derived from the controller.
No new dirty/save phase was introduced.

`ApplicationMenu` supports one open menu, keyboard item and submenu navigation,
Escape/Tab handling, disabled visible items, shortcut hints and outside dismissal.
The Stage 14 capture listener yields to menu interaction, including Cmd/Ctrl+S.
Help is a native modal with Close, Tab containment, Escape and explicit focus
restoration. Layout dialogs restore Layout focus. Help excludes F2 and Undo/Redo.
Alt-alone is registered only off macOS and is gated against unsafe input/state.

`ToolsPanel` hides without unmounting content, retains scroll position and uses the
same state for the toolbar and View command. The UI-only preference is
`myway:tools-panel:v1` (`open`/`closed`), with safe missing/corrupt/storage-failure
fallback. First visit starts open at 1200 CSS px or wider. Docking changes at
1100 CSS px; resizing never overwrites open/closed choice. The 360 px docked panel
releases space when hidden; narrow overlay/backdrop does not resize the canvas.
Graph-only controls are hidden in Annotation mode with values kept mounted.
Annotation mode/tools/properties retain the Stage 15 owner and transition rules.
Panel actions do not call Fit/arrangement or mutate graph/annotation snapshots.

Diagnostic metrics and Export diagnostics are rendered only for startup
`?layoutDebug=1`; the Stage 13 collector, ring buffer and export payload are unchanged.
No backend, database, API, saved-workspace, graph/annotation or recovery-record
contract changed. No dependency or package-lock changes were needed.

## Final automated verification

Executed in the original repository's `poc/graph-visualization` with the installed
Node 24 runtime after the final code change:

| Check | Result |
| --- | --- |
| `npm test` | **253 passed, 0 failed**, including existing Stage 11–15 suites |
| `npm run build` | TypeScript compilation and Vite production build passed |
| `npm run lint` | Exit 0; **13 existing graph/layout warnings**, no new shell warnings |
| `git diff --check` plus new-file whitespace scan | Passed |
| Backend | Unchanged; recorded Stage 15 baseline **138 passed**, not rerun |

The baseline had 223 frontend tests; Stage 16 added 30. Checkpoint 4 extended an
existing rendered-menu test for the discovered blocked-pointer regression, so the
final test count remains 253. React test renderer's existing deprecation notice
is separate from lint. The documented Checkpoint 1 `react/refs` suppression at
command-factory construction remains narrowly scoped to deferred callbacks.

Coverage relevant to the specification:

| Area | Evidence |
| --- | --- |
| Menu open/close, one-open invariant, outside pointer+click, Escape, item/submenu arrows, Home/End, Tab and trigger focus | `applicationMenu.test.ts` |
| Non-Mac Alt-alone, Mac exclusion, combination/composition/pointer/safety gates and cleanup | `applicationMenu.test.ts` |
| No Stage 14 dispatch behind menus; shared Save/Create handlers; form/modal Save protection | `shellShortcuts.test.ts` |
| Mode/busy/dirty/readiness enabled mapping and exact controller delegation | `workspaceCommands.test.ts`, `layoutMenu.test.ts` |
| Clean/dirty switching, layout guards/status, retained dialogs, validation, failed-save retention and default protection | `layoutMenu.test.ts`, `shellDialogs.test.ts`, existing persistent-workspace tests |
| Create menu and actual N/E dispatch reveal the closed panel and focus the rendered form | `toolsPanel.test.ts` |
| Preference thresholds, storage failures/remounts, docking-only resize, preserved child state/scroll and safe dismissal | `toolsPanel.test.ts` |
| Annotation selection/tool/snapshot dirty comparison survives toggles; extracted tool/property callbacks retained | `toolsPanel.test.ts`, `shellDialogs.test.ts`, existing annotation suites |
| Help content/trap/Escape/focus and debug-only menu capability | `shellDialogs.test.ts`, `layoutMenu.test.ts` |

## Chrome verification and final correction

Independent smoke checks used Chrome on macOS and the existing isolated fixture
`/tests/browser/stage15.html`. Its `/api/` requests are intercepted in that tab;
the user's graph/database was not edited. The fixture's blue test banner is not
part of the product UI.

- At **1400 × 900**, the application bar measured 54 px, the docked panel 360 px,
  and the canvas 1040 px. Hiding/showing the panel preserved an unsubmitted form
  value, exact rendered node positions and exact pan/zoom transform; status stayed
  Saved. Tab and Shift+Tab left the open menu correctly.
- At **1000 × 800**, the panel was an overlay. Canvas width stayed 1000 px and its
  transform stayed identical across closure. Closed preference survived reload.
  N focused the Node type field; E focused Source Node after revealing the panel.
- Additional **1099, 1100, 1199, 1200 and 768 px** checks confirmed overlay below
  1100/docking at and above 1100, no override of current choice, and no horizontal
  page overflow. At 768 px, the bar wrapped while its controls remained reachable.
- Graph/Annotation tools, Help Tab/Shift+Tab containment and Escape/Help focus
  restoration were checked. The fixture's dirty Arrange confirmation was observed
  and canceled through Chrome's native dialog. The existing callback path remains
  unchanged. The browser automation connection needed recovery after that native
  dialog; this was a test-tool interruption, not evidence about the deferred hangs.
- Normal startup omitted metrics/export. Debug startup showed metrics and View's
  Export diagnostics. Final clean fixture tab had no captured console errors.
- Opening a new fixture after the dirty test offered recovery; discarding the
  fixture-only draft returned to Saved. This supplements existing automated
  recovery coverage and the user's recovery observation; it is not an investigation
  of the supplied diagnostics or a performance test.

One Stage 16 boundary defect was found and corrected: mouse-clicking an
`aria-disabled` menu trigger could blur the annotation textarea, commit its draft,
mark Unsaved and then open the menu. Blocked triggers now prevent pointer-down
focus transfer. The existing rendered-menu test covers that guard. Repeating the
real Chrome click kept the textarea focused, editor open, menu closed and layout
Saved. Tools hide/show also retained the draft; Escape canceled it as before.

Temporary viewport overrides were reset. Screenshot evidence was saved separately
for the chat report, not embedded as a new product asset.

## Acceptance and retained limits

The user explicitly accepted Checkpoint 2 and then confirmed Checkpoint 3's seven
manual checks on their own application: toolbar/View toggle, remembered state,
retained form values, panel-aware N/E, contextual modes, narrow overlay dismissal
and no coordinate/selection/dirty mutation from toggling. Those are user-reported
acceptance results; the checks above are independent fixture verification.
No new sign-off by the user on the small Checkpoint 4 pointer guard is invented.

Physical Windows/Linux Alt testing was unavailable; its behavior is covered by the
platform-gated unit tests. No fresh approximately 500-node timing/soak benchmark
was run. Chrome/macOS fixture checks and prior real-application user acceptance
must not be represented as exhaustive cross-platform or performance certification.

Deferred outside this stage:

- Restore last active layout after reload: retained Stage 15 backlog, explicitly
  excluded by Stage 16. Startup still uses the default layout and Graph mode.
- Investigate occasional hangs after substantial unsaved edits. The user provided
  `myway-layout-diagnostics-1794162819593.json` and
  `myway-layout-diagnostics-1794150430683.json` for future context only. No freeze
  diagnosis, optimization, telemetry change or new instrumentation was performed.
- Existing scope limits remain: no Undo/Redo, new annotation shapes, context menus,
  modal Node/Edge redesign, theme/auth features or replacement of React Flow.
