# Stage 17 — Workspace Continuity

Implementation through Checkpoint 3 delivered on 2026-11-12.
Baseline: `847d40ab42236af95c1fc81ca9b61c9a0b4e073e` (Stage 16).
Source: `stage-17-workspace-continuity-spec.md` provided separately from the input
ZIP. The input archive matches the repository baseline source. No blocking scope,
behavior or acceptance discrepancies were identified during the initial audit.

## Delivery and acceptance

Stage 17 is recorded in focused commits for active-layout selection, camera
continuity and workspace titles. On 2026-11-13 the user confirmed acceptance of
the Stage 17 changes and authorized committing the remaining work. No push or
release is claimed. Existing untracked input ZIPs were preserved.

| Checkpoint | Result | Acceptance |
| --- | --- | --- |
| 1 | Scoped last-layout preference, deterministic startup selection and selected-layout recovery | User confirmed reload returns to the last layout and Restore recovers its latest unsaved changes |
| 2 | Separate local camera per layout, coordinated restore/Fit and transition guards | User confirmed separate pan/zoom, reload restoration and unchanged camera for Discard/Save as New |
| 3 | Base/dynamic browser title and final regression verification | Automated and Chrome fixture checks passed; user confirmed Stage 17 acceptance on 2026-11-13 |

## Implementation

`workspacePreferences.ts` wraps localStorage with versioned, collision-safe keys
scoped by the existing recovery identity. Missing/invalid IDs, malformed viewport
records and storage exceptions are nonfatal. Viewports require exact version,
scope/layout identity, finite coordinates, zoom 0.05–4 and canonical ISO timestamp.

`startupLayout.ts` chooses remembered owned metadata, default, then existing server
ordering. A stale ID produces a concise notice, combined with the existing no-default
notice where needed. No-layout startup clears a stale preference. A listed layout's
detail failure remains a load error with Retry, without silently opening default.
Preferences update after accepted startup/switch/first Save/Save as New/delete
destination. The original recovery check and visibility barrier remain tied to the
selected layout; recovery schema, fingerprints and controller were not changed.

`LayoutViewportCoordinator` and `useLayoutViewport` own camera initialization and
completed movement writes. They wait for selected-workspace/recovery readiness,
React Flow and two animation frames, then restore a validated viewport or Fit with
padding 0.1, without initial animation. The canvas stays hidden until completion.
The competing automatic fitView prop and old onRestored Fit path were removed.
Generation guards suppress outgoing callbacks and transition writes; outgoing camera
animations are interrupted. Save as New/first Save seed the new identity without a
camera jump. Ordinary Save/Rename/Set Default and content Discard preserve the camera.
Deletion clears the deleted camera best effort and restores/fits the default.
All existing explicit Fit/arrange/path/free-node focus calls use the shared wrapper;
React Flow controls and user movements use onMoveEnd.

`useWorkspaceTitle` derives document.title directly from accepted active layout,
existing dirty state and startup usability. Loading/error/recovery-choice states
show `My Way`; ready unsaved startup shows `My Way — Unsaved layout *`; accepted
layouts show `My Way — <name>` with ` *` only while dirty. Successful Save clears
that marker through accepted controller state; failed Save retains it. Rename,
switch and delete destination follow acceptance. Assignment uses document.title,
so layout names are plain text. Cleanup resets `My Way`. Base index.html also uses
`My Way` for initial/lazy-loading and graph-load errors.

No camera/title state enters workspaceSnapshot, dirty comparison, API, recovery or
diagnostics payloads. No backend/database/schema, dependency or lockfile changes.
Graph remains the startup mode. Tools preference, explicit Save/Discard, annotation
and graph functionality, shortcuts, menus and beforeunload protection are retained.

## Final verification

| Check | Result |
| --- | --- |
| Full frontend suite | 269 passed, 0 failed (253 Stage 16 baseline + 16 Stage 17 tests) |
| TypeScript + Vite production build | Passed |
| Lint | Exit 0, same 13 existing warnings |
| Patch application/whitespace and repository diff checks | Passed |
| Backend | Unchanged; prior recorded 138-test baseline, not rerun |

Pure, hook and rendered-harness coverage includes scoped ID/storage failures,
stale/default/first selection, remembered detail failure/Retry, accepted/canceled/
failed transitions, selected-layout recovery, viewport validation and boundaries,
restore-or-Fit, delayed outgoing callback rejection, new-ID camera preservation,
programmatic Fit capture, controller camera transition reasons, Discard, title base/
clean/dirty/unsaved states, Save success/failure, safe Rename text, failed/successful
switch, delete destination, recovery Restore/Discard and unmount reset.

Chrome/macOS checks used the isolated two-layout fixture, whose API requests never
reach the application database. Checkpoint 2 verified exact camera retention across
reload, independent cameras across switches and zoom controls, while status remained
Saved. Checkpoint 3 verified node movement adds the tab marker, injected failed Save
retains it and successful Save removes it. Panel closure preserved the exact camera
transform. No captured console errors in that check. This fixture is test-only and
its banner is not product UI.

## Limits and retained backlog

The user manually accepted Checkpoints 1 and 2 on their application and subsequently
confirmed acceptance of Stage 17 as a whole. Do not represent
that as exhaustive completion of all 25 manual scenarios in the specification.
No fresh approximately 500-node performance/soak benchmark or cross-platform browser
certification was run. Broad real-graph annotation/CRUD/focus/arrangement/responsive/
diagnostics acceptance relies on existing regression coverage and prior acceptance;
not every combination was repeated manually during Checkpoint 3. Freeze/hang
investigation remains explicitly deferred;
no diagnosis, telemetry changes or performance guarantee is claimed.

No work on later stages, visual redesign, routing, authentication, multi-tab sync,
autosave, Undo/Redo or new graph/annotation features was included.
