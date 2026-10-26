# Stage 14 — Checkpoint 1

Implemented shortcuts: Ctrl/Cmd+S through the existing guarded layout save,
N to focus Create Node, and E to focus Create Edge. Bindings and matching are
centralized; one listener also delegates existing group/branch arrow movement.
Keyboard deletion remains deferred to checkpoint 2.

## Agreed scope adjustment — 2026-10-26

Following user testing, F2 is removed from this checkpoint. The always-visible
sidebar already presents the selected element editor, so moving focus alone adds
little value. Existing mouse-driven editing remains available.

F2 is deferred until a future UI introduces separate editing windows after hiding
the left panel. The intended behavior then is to open the selected node/edge editor,
alongside N/E opening the respective creation windows. No such windows are added
in this checkpoint. This decision supersedes the original specification's F2
requirement for the current implementation.
