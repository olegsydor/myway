# Stage 15 Checkpoint 4 — Text and integration

Date: 2026-10-27. Baseline: `f80a6aa` (Modes and Rectangle).
The user accepted the results on 2026-11-01 and authorized committing this checkpoint.
All four Stage 15 implementation checkpoints are complete.

## Delivered behavior

Text is a one-shot Annotation tool. Clicking the canvas opens a focused inline
editor anchored in graph coordinates. Enter inserts a newline. Clicking outside
commits valid text; a new empty or whitespace-only draft is discarded. Escape
cancels editing and restores the last committed value. Double-clicking selected
text or using Edit text opens an existing annotation. Pointer capture requires
handling double-click at the canvas capture boundary, which is covered by the
interactive check.

Existing text cannot be silently deleted by clearing its editor: invalid content
keeps the editor open with validation, while the committed value remains unchanged.
The user can correct it or press Escape. Text is limited to 2,000 Unicode codepoints
with the same whitespace semantics as the backend. IME composition blocks commit.
Mode/tool changes commit valid text and discard new empty drafts; invalid existing
text must be corrected or canceled first.

Selected text can move in graph coordinates, use any of the six semantic colors,
and switch between Small, Medium and Large. It has no resize handles. Deletion
requires confirmation with a text excerpt. Enter, Delete and Backspace remain
native textarea input while editing; the existing central shortcut listener handles
Escape and guarded Cmd/Ctrl+S. No additional global keyboard listener was introduced.

Draft editors and movement previews stay outside committed workspace snapshots.
Save and recovery writes remain blocked while editing or dragging. After commit,
the existing atomic workspace API persists positions and annotations together.
Save, Save as New, Discard, switching and recovery retain the checkpoint 2 contract.
Graph nodes and edges remain independent of annotation state.

No backend, migration, API or production dependency changes were needed.

## Automated verification

- 223 frontend tests passed, 0 failed (17 more than checkpoint 3).
- Tests cover draft placement, whitespace, Unicode limits, new/existing Escape,
  valid and invalid edits, mode/tool changes, IME, move and finite-coordinate guards,
  styles, deletion, locks and editor keyboard routing.
- Real React integration tests connect editing to Save/recovery locks, complete
  snapshots, mode exit, Discard and failed Save baseline preservation.
- 138 backend tests passed, including the existing persistence, constraints,
  transactions and tenant-isolation suite.
- TypeScript and the Vite production build passed. Lint completed with existing
  graph/layout warnings; new annotation code and the fixture emitted no warnings.
- Git whitespace checks passed.

## Interactive verification

Initial placement, automatic focus and multiline typing were checked in the local
application. Further persistence checks used `tests/browser/stage15.html`, which
mounts the actual graph UI with a synthetic two-node graph. Its requests are
intercepted within the tab and its mock layouts/recovery use isolated storage keys.
It never submits writes to the user's API. Open it through the development server:
`http://localhost:5173/tests/browser/stage15.html`.

Passed through real browser input:

- Text placement, multiline entry, blur commit, double-click edit and Escape restore.
- Empty existing text validation without deleting the committed annotation.
- Purple/Large styling and movement; graph node transforms stayed unchanged.
- Save and clean reload, then dirty-tab close/reopen and recovery Restore.
- Discard restoring the saved complete workspace after text/style/deletion changes.
- Save as New, Cancel switch, Save and switch, and independent destination layouts.
- Injected Save and destination-load failures preserving working text.
- Keyboard and sidebar deletion confirmation, Cancel, Confirm and subsequent Discard.

The isolated fixture was reset to a clean empty state after testing. A screenshot
of the styled multiline text is retained outside the repository as a chat artifact.
Dirty reload attempts canceled by beforeunload were not counted as successful
reload checks; recovery was confirmed by closing and reopening the fixture tab.

The user subsequently tested the new functionality and confirmed on 2026-11-01
that all results matched expectations. This records user acceptance of Stage 15.
The exact browser and individual manual scenarios were not enumerated by the user;
these checks do not claim exhaustive Chrome coverage or measured large-graph
performance benchmarks.

## Stage 15 checkpoint history

- `73173ad`: PostgreSQL/model/schema/API persistence foundation.
- `df718a8`: atomic frontend workspace state and recovery v2 with v1 compatibility.
- `f80a6aa`: Graph/Annotation modes and Rectangle tools, accepted by the user.
- This checkpoint: Text tools and integration verification, accepted by the user.
