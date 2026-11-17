# Stage 18 — Visual Design & UI Polish

## Completion and acceptance

**Stage 18 is completed and accepted by the user on 2026-11-17.**

The user reviewed Calm Canvas on their real graph, requested the refinements recorded below, confirmed their operation, and explicitly accepted closing the stage. New issues and feature ideas will be handled separately.

Baseline: `2785fa1` — final Stage 17 delivery. This report accompanies the Stage 18 implementation commit; it does not claim a push, deployment, or public release.

## Delivered visual system

- Shared surface, typography, border, focus, radius, shadow, and feedback styling for the existing application shell.
- Light application bar, quieter menus, distinct Save action, and a shared framed Graph/Annotation mode switch.
- Consistent panels, controls, menus, search results, dialogs, tooltips, and messages.
- Light canvas with a subtle grid; light tinted nodes with dark text and persistent colored type markers for all eight existing types and the fallback type.
- Names occupy up to two lines, are top-aligned, and use weight 500. Very long names are truncated after the second line. The visible type row was replaced by full-name/type information in the tooltip; the existing selected-node type field remains.
- Ordinary edges and arrowheads use `#97A6B8`; ordinary visible edge width is **0.75** graph units. Emphasized edges retain their separate appearance and 2.5 stroke width. Arrow marker size is 14. These final, user-approved values supersede the initial draft palette and stroke values.
- Rectangle outlines and fills have **6-unit rounded corners**. Saved annotation geometry, text-size presets, border/fill options, and resize handles are unchanged.

Node dimensions and handle positions are preserved by retaining hidden legacy single-line/type sizing metrics beneath the two-line title. This avoids changes to layouts or edge attachment geometry.

## Tooltip behavior

- Full name and type are available even when a node has no optional description or properties.
- Existing descriptions and properties remain available.
- Reveal follows one second of hover or keyboard-visible focus.
- Leaving the trigger hides the tooltip immediately.
- Tooltips are suppressed while dragging and for selected nodes. Ending a drag restarts the delay if the node remains eligible.
- Pointer focus retained after clicking does not keep a tooltip open; keyboard-visible focus remains supported for unselected nodes.
- `prefers-reduced-motion: reduce` removes the reveal fade while retaining the one-second delay. It does not change graph camera behavior.

## Explicitly approved interaction additions

These additions were approved during real-data review and extend the original visual-only scope:

1. **Overlapping annotation selection.** In Annotation Select mode, Alt/Option + click cycles the actual annotation hit stack without changing saved stacking order. Alt-drag moves the annotation chosen by that click. Ordinary clicks and resize handles retain their behavior. Rapid modified clicks do not open a Text editor. Selection alone does not dirty the layout.
2. **Keyboard search navigation.** Search graph results and node-picker suggestions support Down from the input, Up/Down between results, Up from the first result back to the input, native Enter/Space selection, and Escape to close and return focus. Tab remains native. Escape preserves the typed query; Down can reopen results. Arrow navigation does not select. Explicit graph-search submission and live node-picker filtering remain unchanged.

Both additions retain existing mode, lock, primary-pointer, and composition guards. No persistence-format change was introduced.

## Verification

| Check | Result |
| --- | --- |
| Final frontend suite | **276 passed, 0 failed** (269 Stage 17 baseline + 7 focused overlap/search tests) |
| TypeScript compilation | Passed |
| Vite production build | Passed |
| Lint | Exit 0; 13 existing warnings, no additional warnings |
| Diff/whitespace check | Passed |
| Backend | Unchanged; not rerun for this stage |

Earlier browser checks in this chat used isolated Chrome/macOS fixtures whose API requests never reach the application database:

- All 16 representative nodes matched baseline dimensions, positions, and handle geometry in ordinary and checked highlighted states.
- Rectangle and Text annotation geometry matched the baseline; desktop bar height remained 54 px.
- Unsubmitted form values and Text-editor drafts survived Tools toggles; checked docked and overlay toggles preserved the exact camera transform.
- Rename initial field focus and return focus were verified.
- Responsive review covered 768 px overlay, 320 px panel fit, and an overlay-camera check at 1000 px. A legacy width conflict at 320 px and annotation-property alignment were corrected.
- Synthetic overview rendered 500 nodes and 499 edges without page overflow. This was a rendering smoke check, not a performance benchmark.
- Tooltip delay, immediate dismissal, fresh delay after dropping, no-detail keyboard access, and selected-node suppression were checked.
- Nested rectangles were selectable in both creation orders while the layout remained Saved. Repeated Alt-clicks cycled without reordering; modified double-clicks did not open the Text editor.
- Both search controls were checked with native keyboard events. Arrows moved focus without selecting, Escape preserved the query, Tab moved normally, and Enter selected the intended item while the layout remained Saved.
- No captured console errors in the reported final browser checks.

The reduced-motion finishing change is a CSS media-query override included in the final build. The operating system's reduced-motion preference was not changed for testing; no manual reduced-motion browser-emulation result is claimed.

## Preserved contracts

Stage 16 navigation structure, application-bar ordering, menu contents, Tools docking breakpoint and desktop width are retained. Stage 17 last-layout startup, per-layout camera continuity, workspace title, Save/Discard, recovery, and beforeunload protection remain.

Backend, database, APIs, persistence keys, saved-workspace format, recovery payloads, dependencies, graph algorithms, node positions, edge routing, arrow offset, and edge interaction width are unchanged.

## Limits and deferred work

- User acceptance reflects real daily use and explicit confirmations, not exhaustive cross-platform certification or completion of every possible state combination.
- The deliberately lighter, thinner ordinary edges were selected through user review. Earlier contrast measurements for darker draft edges do not certify the final edge color; no blanket WCAG AA certification is claimed.
- No new performance/soak benchmark or freeze/hang investigation was performed.
- Figure names and additional two-dimensional annotation shapes remain future ideas, explicitly outside this stage.
- Dark mode, authentication, Free/Pro, Undo/Redo, autosave, CRUD redesign, and public-launch work remain outside scope.
- Future findings will be assessed separately rather than keeping Stage 18 open indefinitely.

## Isolated review fixtures

- `/tests/browser/stage18.html` — 16 nodes covering eight types, Rectangle and Text.
- `/tests/browser/stage18.html?dense=1` — synthetic 500-node overview.
- `/tests/browser/stage18.html?overlap=1` and `?overlap=reverse` — nested rectangles in opposite creation orders.

The fixture banner is test-only, not product UI. Existing input ZIP archives are preserved and excluded from the Stage 18 commit.
