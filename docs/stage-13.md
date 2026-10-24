# Stage 13 — Reliability, Diagnostics and Local Layout Recovery

**Status: Completed and accepted**
**Baseline:** `c5f8f58` — Stage 12 completion
**Final implementation checkpoint:** `7c3a2b4`

## 1. Objective

Improve the reliability of the My Way graph workspace without changing the explicit server-side layout persistence model established in Stage 12.

The accepted Stage 13 scope includes:

- Startup layout visibility barrier.
- Performance diagnostics for investigating intermittent freezes.
- Browser-local recovery of unsaved node coordinates.
- Explicit Restore / Discard recovery workflow.
- Preservation of existing graph movement and layout management behavior.

**Scope adjustment:** `Ctrl+S` / `Cmd+S` has been moved to Stage 14.

## 2. Implementation checkpoints

| Commit | Description |
|---|---|
| `8e30efd` | Add startup layout visibility barrier |
| `667c8b8` | Add graph layout performance diagnostics |
| `403b763` | Add tested local layout recovery foundations |
| `7c3a2b4` | Integrate local layout recovery with persistent layouts |

## 3. Startup layout visibility barrier

The graph canvas remains hidden until the initial server layout has been resolved.

This prevents the previously observed transition from automatically calculated Dagre coordinates to saved coordinates.

Startup errors preserve the loading-error and retry workflow.

When compatible recovery exists, the canvas remains blocked until the user explicitly chooses Restore or Discard.

**Status: Completed.**

## 4. Performance diagnostics

Development diagnostics are enabled with `?layoutDebug=1`.

Implemented capabilities include:

- Bounded ring buffer of 1,000 events.
- Aggregated diagnostic statistics.
- React Profiler measurements.
- Movement and dirty-check timing.
- Layout phase and blocked-reason tracking.
- Long Task observation where supported.
- JSON diagnostic report export.

### Measurements

Testing used a graph containing 503 nodes.

| Metric | Average | Maximum |
|---|---:|---:|
| React rendering | 2.54 ms | 63.4 ms |
| Movement processing | 0.07 ms | 0.6 ms |
| Dirty checks | 0.08 ms | 0.3 ms |

The previously observed intermittent freeze was not reproduced.

No consistent progressive performance degradation was established. No speculative optimization was introduced.

Diagnostics remain available for investigating future incidents.

**Status: Completed. Original freeze cause remains undetermined.**

## 5. Local layout recovery

### Storage and scope

Recovery uses IndexedDB:

`myway-layout-recovery`

Records are separated by authenticated user and layout ID.

Recovery stores coordinate snapshots and validation metadata without storing graph descriptions, node properties, filters or viewport state.

### Automatic recovery

Unsaved coordinates are written locally using a 500 ms debounce interval.

Writes are avoided during active dragging and unsafe layout operations.

A recovery controller coordinates asynchronous operations. Generation tokens and operation ordering protect against tested stale-write scenarios.

Recovery never automatically saves data to the server.

### Startup recovery

After loading the server layout, My Way checks for compatible local recovery.

For a compatible draft, the user chooses:

- **Restore:** Apply recovered coordinates and retain dirty state.
- **Discard:** Remove the draft and continue with server-saved coordinates.

The server layout is never overwritten automatically.

If IndexedDB is unavailable, the ordinary server-layout workflow remains available.

### Recovery cleanup

Recovery cleanup is integrated with successful Save, Save As New, Discard changes, layout switching and layout deletion.

Rename and Set as default preserve recovery because coordinates are unchanged.

**Status: Completed and manually accepted for existing saved layouts.**

## 6. Automated verification

Latest reported frontend results:

- **89 tests passed**
- **0 failed**
- TypeScript compilation successful
- Production build successfully verified during implementation
- Git whitespace checks clean before commit

Backend graph API tests were updated to support the authenticated `user_id` field required for recovery scope isolation.

The recovery modules are covered by focused tests for storage, compatibility, startup validation, operation ordering, controller behavior and scope generation.

## 7. Manual acceptance

Testing was performed in Chrome using the real My Way graph containing **503 nodes and 542 edges**.

| Scenario | Result |
|---|---|
| Automatic IndexedDB recovery creation | Passed |
| All 503 node positions stored | Passed |
| Reload presents Restore / Discard | Passed |
| Restore recovers unsaved coordinates | Passed |
| Restored layout remains dirty | Passed |
| Save after Restore succeeds | Passed |
| Save removes obsolete recovery | Passed |
| Reload after Save opens without recovery prompt | Passed |
| Discard restores saved coordinates | Passed |
| Discard removes recovery | Passed |
| Immediate Save before debounce completes | Passed |
| Save after recovery already exists | Passed |

The existing Chrome warning for leaving with unsaved changes remains enabled.

No regression was reported in the existing layout-management workflow during these acceptance checks.

## 8. Accepted limitations

Stage 13 is accepted with the following limitations:

1. Recovery currently supports layouts already saved on the server. Unsaved initial-layout recovery is not implemented.
2. Changed graph membership is handled conservatively: incompatible recovery is not automatically applied.
3. The current recovery prompt does not display all metadata originally proposed in the specification.
4. Simultaneous editing in multiple browser tabs is not guaranteed to be conflict-safe.
5. Recovery cannot guarantee preservation of edits made immediately before an abrupt browser termination.
6. The original intermittent freeze has not been conclusively diagnosed.
7. Full formal stress and memory acceptance evidence from the original specification is not available for every proposed scenario.

These limitations do not prevent acceptance of the implemented single-tab recovery workflow.

## 9. Deferred to Stage 14

**Keyboard shortcuts:**

- `Cmd+S` on macOS.
- `Ctrl+S` on other platforms.
- Use the existing guarded Save Layout operation.
- Prevent duplicate requests and avoid triggering the browser's Save Page dialog.
- Preserve existing save-error and dirty-state behavior.

Additional improvements such as undo/redo, Delete and F2 remain candidates for future scope definition; they are not automatically included in Stage 14.

## 10. Final acceptance

Stage 13 is **completed and accepted within the agreed scope**.

The startup barrier, diagnostic instrumentation and local recovery functionality have been implemented and validated.

The explicit-save server persistence model remains unchanged.

The remaining limitations and specification deviations are documented and accepted rather than treated as completed features.

The next development stage begins from the completed Stage 13 checkpoint.
