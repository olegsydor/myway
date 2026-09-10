# Stage 7 — Web stability and diagnostics

## Goal

Investigate intermittent frontend resets observed during graph editing, determine whether the cause is in the application or browser environment, improve recovery behavior after reload/navigation, and verify that graph data remains persisted in the backend.

## Starting point

Stage 7 started from the completed Stage 6 checkpoint:

`08721cb Add graph creation and editing`

The working tree was clean before Stage 7 changes.

## Observed problem

During interactive testing in Safari, the application periodically returned to its initial frontend state. Visually this looked similar to an F5 reload:

- the currently loaded graph disappeared from the UI;
- React state returned to its initial values;
- the user had to load the graph again manually.

At first it was unclear whether this was caused by:

- a React crash;
- React Flow state corruption;
- a CRUD mutation;
- a backend failure;
- a browser reload;
- browser history navigation.

## Diagnostic instrumentation

Temporary frontend diagnostics were added to distinguish these scenarios.

The instrumentation recorded:

- document boot count;
- Navigation Timing navigation type;
- `beforeunload`;
- `pagehide`;
- `pageshow`;
- React App mount/unmount;
- uncaught JavaScript errors;
- unhandled Promise rejections;
- `popstate`;
- `hashchange`;
- recent pointer/click/change/keydown interactions.

The diagnostics were temporary and were removed after the investigation.

## Findings

Repeated failures in Safari showed the same pattern:

1. Normal user interaction occurred in the application.
2. `beforeunload` was triggered.
3. `pagehide` was triggered.
4. Safari suspended the Vite development WebSocket.
5. A new document was loaded or a previous page was restored.
6. Navigation Timing reported:

   `navigationType: "back_forward"`

No corresponding application failure was observed:

- no uncaught JavaScript exception;
- no unhandled Promise rejection;
- no evidence of React Flow triggering navigation;
- no explicit `window.location`, `reload`, or History API navigation was found in the relevant frontend code;
- CRUD buttons use `type="button"`;
- no form submission path was present.

The issue occurred during different UI operations, including Node and Edge workflows, and therefore was not tied to one particular CRUD handler.

The same usage scenario was tested in Chrome and the reset did not reproduce.

## Conclusion

The intermittent reset was classified as Safari/macOS-specific browser history navigation rather than an application crash.

The Vite WebSocket suspension message observed during these events was a consequence of the page being suspended/navigated away from, not the root cause.

No application-level workaround for Safari history navigation was added during this stage.

## Recovery improvement

Before Stage 7, `App` initialized with:

- `graph = null`;
- no automatic call to `GET /graph`.

As a result, any real reload or browser navigation that recreated the application made the UI appear empty until the user manually loaded the graph again.

Stage 7 added automatic graph loading during application startup.

On initial mount, the frontend now:

1. sets loading state;
2. calls `GET /graph`;
3. restores the latest graph returned by the backend;
4. displays an error if the request fails.

The existing `refreshGraph()` behavior after successful mutations remains unchanged.

The backend remains the source of truth. No client-side graph cache, autosave mechanism, optimistic update layer, or localStorage persistence was introduced.

## Manual verification

The following recovery scenarios were verified manually:

### Node persistence

1. Create a Node.
2. Confirm it appears in the graph.
3. Perform a real page reload.
4. The graph loads automatically.
5. The newly created Node is still present.

### Edge persistence

1. Create an Edge.
2. Confirm it appears in the graph.
3. Perform a real page reload.
4. The graph loads automatically.
5. The newly created Edge is still present.

This confirms that the apparent Safari reset did not imply loss of successfully persisted backend data.

## Validation

Backend:

```bash
docker compose exec api pytest -q

Result:
33 passed
Frontend:
npm run build
Result:
passed
Frontend lint:
npm run lint
Result:
- 0 errors
- 1 warning
The remaining warning is the known Stage 6 react(set-state-in-effect) warning in ReactFlowGraph.tsx. It was not introduced by Stage 7 and was intentionally not refactored as part of this stage.
Whitespace validation:
git diff --check
Result:
clean.
Final Stage 7 behavior
After Stage 7:
- Safari-specific history navigation is understood and documented;
- no evidence indicates a React/backend crash;
- temporary diagnostic instrumentation has been removed;
- the graph automatically loads from the backend when the frontend starts;
- real reload/navigation no longer leaves the application in an apparently empty initial graph state;
- successfully persisted Nodes and Edges survive reload;
- the backend remains the sole source of truth.
Deferred / out of scope
Stage 7 intentionally did not add:
- localStorage graph caching;
- autosave;
- optimistic updates;
- mutation retry queues;
- Error Boundary architecture changes;
- Safari-specific navigation interception;
- unrelated React Flow refactoring;
- fixes for the existing lint warning.
These should only be introduced in a future stage if there is a concrete product requirement or new evidence that they are necessary.