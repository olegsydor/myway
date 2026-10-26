# Stage 14 — Checkpoint 2: safe deletion

Delete and Backspace in canvas context open a native application dialog for
exactly one ordinarily selected node or edge. Editable controls, the tools panel,
composition, repeats, unsupported modifiers and conflicting operations retain the
shared shortcut guards. Group, branch, search and path highlights do not provide
a deletion target. F2 remains deferred as agreed in checkpoint 1.

The existing sidebar Delete buttons and keyboard action share one deletion
controller and the existing node/edge API functions. There are no API requests on
opening or cancelling. Cancel preserves selection; focus starts on Cancel/Close.
The native modal traps focus and blocks interaction behind it; Escape closes only
when idle. Destructive actions have distinct styling and failures use an alert.

Node connectivity is checked against all canonical loaded edges, including those
hidden by the UI, both on opening and immediately before confirmation. A connected
node has Close only. Backend conflicts remain authoritative and keep the dialog
and selected element intact. There is no cascade deletion of edges.

A synchronous controller lock prevents duplicate confirmation. Existing CRUD busy
flags pause layout/recovery work through the existing Stage 13 integration.
Successful deletion clears the selected element and calls the existing canonical
graph refresh, which retains surviving node coordinates. Failed deletion keeps the
working graph and selection. If server deletion succeeds but refresh fails, the
dialog explicitly reports that fact and offers Retry refresh without repeating
DELETE. No persistence API or recovery storage semantics were changed.

## Validation

- 107 frontend unit tests pass, including 13 deletion-controller/selection tests.
- Shortcut tests cover Delete/Backspace resolution and all shared context guards;
  F2 remains unbound.
- TypeScript and the Vite production build pass.
- Lint exits successfully with warnings in the graph/layout code.
- Chrome automation could not start: the local browser process aborted before
  loading a page. This is not counted as an automated browser pass.
- The user subsequently confirmed that Delete/Backspace work as expected during
  manual testing. See `stage-14.md` for final acceptance and evidence boundaries.
