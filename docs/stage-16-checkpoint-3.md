# Stage 16 — Checkpoint 3

Checkpoint 2 was explicitly accepted by the user in this chat. This implementation
is based on the actual uncommitted Checkpoint 2 files in `~/Projects/myway`, whose
Git HEAD is still `e03d174`.

## Delivery status

The reviewed incremental patch was applied to the original repository after the
user restored approval requests and approved the write. Automated checks were
repeated in the actual `~/Projects/myway/poc/graph-visualization` checkout:
253 tests passed, TypeScript/production build passed with Node 24, whitespace checks
passed, and lint reported the same 13 existing warnings. Changes are uncommitted.
Browser smoke verification was pending at initial delivery. The user subsequently
accepted Checkpoint 3; independent Chrome checks are now recorded in `stage-16.md`.

## Changes

- `useToolsPanel` owns browser-local open/closed UI state; it is independent of graph,
  layout, annotations and recovery. The toolbar Tools button and View Show/Hide
  command invoke the same toggle.
- Preference key: `myway:tools-panel:v1`, values `open`/`closed`. Missing, corrupt
  or unavailable storage falls back safely. First visit starts open at 1200 CSS px
  and wider, closed below 1200. Only explicit actions persist the preference.
- A separate 1100 CSS px breakpoint controls presentation. Resizing switches docking
  without overriding the current open/closed choice. Docked width is 360 CSS px;
  the overlay is absolutely positioned beneath the bar and consumes no canvas
  width. Hidden panels use `hidden` without unmounting their contents.
- `ToolsPanel` retains child state and scroll position, adds an overlay Close button
  and backdrop, and consumes dismissal pointer/click events. Docked/sidebar and
  canvas stacking contexts keep search results below the application bar and the
  overlay above canvas controls.
- `useCreateFormFocus` opens the panel, then waits for its committed render before
  scrolling/focusing the same existing Node/Edge form. The Create menu and Stage 14
  N/E dispatch use the existing shared command adapter. No form is submitted or
  endpoint preselected.
- Graph-only creation, search/filter/navigation/group and editor sections are
  hidden in Annotation mode while staying mounted. Annotation controls and layout
  feedback stay in the panel. Mode switching does not open or close the panel.
- Mouse toggling/dismissing the panel preserves a focused annotation text editor
  rather than forcing its blur/commit. Ordinary panel closure restores focus to
  the toolbar toggle when appropriate.
- No toggle/resize path calls arrangement, Fit, graph mutation, annotation mutation,
  dirty-state setters or layout persistence. No backend, API, model or recovery
  contract changed. Last-active-layout restoration remains outside Stage 16.

## Verification

Executed in the isolated copy, then repeated in the original repository with Node 24:

- `npm test`: **253 passed, 0 failed**, including all 246 Checkpoint 2 tests.
- `npm run build`: TypeScript compilation and Vite production build passed.
- `npm run lint`: exit 0, **13 existing graph/layout warnings**, unchanged from
  Checkpoint 2; no new warnings in panel code or tests.
- Incremental patch checked with `git apply --check --whitespace=error-all` against
  a fresh copy of the actual Checkpoint 2 tree, then applied there and compared
  byte-for-byte with the verified source.

Seven new tests cover first-visit/default and dock/overlay boundaries, preference
values/corruption/storage failures, resize and remount behavior, mounted form and
filter state plus scroll retention, safe overlay dismissal, shared View toggle,
Create menu and actual Stage 14 N/E dispatch revealing/focusing a closed panel,
and unchanged annotation selection/tool/workspace dirty comparison across toggles.

Browser/manual wide/narrow acceptance is **not performed for Checkpoint 3**:
it was blocked by the previous session permissions while preparing the patch.
The renderer/hook tests verify state and handlers, while TypeScript/build verify
the integrated JSX. Actual browser geometry, viewport/selection/filter preservation
on the user's real graph, and focus behavior need a smoke check once permissions
are restored. The recorded Stage 15 backend baseline remains 138 passed; backend
was not rerun for this frontend-only change.

## User acceptance and final verification

The user subsequently confirmed all seven requested Checkpoint 3 manual checks:
“Так. Все працює саме так”. Checkpoint 3 is accepted. Their report of occasional
hangs after substantial unsaved editing is retained for future work at their
explicit request; recovery followed the expected scenario. Checkpoint 4's Chrome
verification and the final scope/limitations are documented in `stage-16.md`.
