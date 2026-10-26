# Stage 14 — Graph Keyboard Shortcuts

**Status: Completed within the agreed scope; user-tested shortcuts accepted.**

**Final verification date:** 2026-10-26

## Baseline and scope

The implementation starts from HEAD `608cf34`, a documentation cleanup following
Stage 13 acceptance `c0d9a70`. Stage 13 implementation checkpoint `7c3a2b4` was
verified before implementation. Existing working-tree files were preserved.

The original Stage 14 specification is retained in
[stage-14-keyboard-shortcuts-spec.md](stage-14-keyboard-shortcuts-spec.md).
The agreed F2 deferral below supersedes its editing-shortcut requirement.

## Delivered behavior

| Shortcut | Behavior |
|---|---|
| Cmd+S / Ctrl+S | Suppress browser Save Page and call the existing guarded Save Layout when dirty |
| N | Bring Create Node into view and focus its first available field |
| E | Bring Create Edge into view and focus its first available field |
| Delete / Backspace | Open confirmation for exactly one ordinarily selected node or edge in canvas context |

Definitions and matching rules have one owner (`graphShortcuts.ts`). A single
listener (`useGraphShortcuts.ts`) dispatches shortcuts and delegates existing
group/branch arrow movement; it removes its listener on unmount and reads current
state after renders. React Flow's automatic keyboard deletion remains disabled.

Canvas actions respect editable fields, tools-panel focus, modal dialogs, IME
composition, repeats, unsupported modifiers and conflicting layout/CRUD operations.
Save remains application-owned and shows a visible notice when a form or dialog
prevents saving. N/E only focus forms and do not submit data or choose endpoints.

Keyboard deletion and the existing sidebar Delete buttons use one guarded
controller. Opening/cancelling makes no API request. Connected nodes have an
informational dialog without Delete, using the full canonical graph for the
connectivity check. Confirmation rechecks connectivity, blocks duplicate requests,
and preserves errors in the dialog. No bulk/group deletion or edge cascade exists.

Server deletion followed by a failed refresh is reported separately; Retry refresh
never repeats DELETE. Canonical refresh retains surviving coordinates through the
existing reconciliation path. Save, server persistence and Stage 13 recovery
modules were not changed. Existing CRUD busy flags remain the recovery guard.

## Agreed F2 deferral

After testing, the user and implementer agreed to remove F2: the current sidebar
already exposes editing for the selected element, so moving focus alone adds
little value. Mouse-driven editing remains available.

F2 is reserved for a future UI with separate editing windows after the sidebar is
hidden. It would open the selected element editor, alongside N/E opening creation
windows. F2 is currently unbound and tested as such. No popup editing UI, undo/redo,
connected-node creation or keybinding settings were added.

## Verification

Final frontend verification:

- **107 tests passed, 0 failed.**
- Includes Stage 11 manual-group/branch, Stage 12 persistence/API, Stage 13
  diagnostics/recovery regressions, 5 shortcut tests and 13 deletion tests.
- TypeScript compilation and Vite production build passed.
- Lint exited successfully with warnings in graph/layout code; it is not warning-free.
- Git whitespace checks passed.

The shell's default Node was too old for the project tools. Final checks used the
bundled Node runtime (v24.22.1); no dependency or lockfile changes were needed.

## Manual acceptance and limits of evidence

User reports in this conversation on 2026-10-26:

| Behavior | Reported result |
|---|---|
| Cmd+S | Works correctly; convenient and intuitive |
| N/E | Focus the corresponding creation section in the left panel |
| Delete/Backspace | Works as expected; convenient and intuitive |
| F2 | Removed following user testing and explicit agreement |

The user accepted checkpoint 2 and authorized this final regression/documentation
checkpoint. These reports support acceptance of the delivered shortcut workflows.
They do not establish an individual pass for every item in the original manual
checklist (for example Ctrl behavior on another OS, focus trapping, fault injection,
and reload/recovery after keyboard operations).

Automated Chrome launch aborted before a page loaded in this environment; it is
not counted as a browser test pass. Selection, conflicts, duplicate requests,
cancellation and refresh-failure behavior have direct unit coverage. Production
browser failure/recovery scenarios remain useful follow-up checks if those areas
change.

Checkpoint details: [checkpoint 1](stage-14-checkpoint-1.md) and
[checkpoint 2](stage-14-checkpoint-2.md).

The user subsequently authorized committing the Stage 14 implementation, tests
and documentation together. No push or deployment is included in this checkpoint.
