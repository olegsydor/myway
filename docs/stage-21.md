# Stage 21 — Annotation Shapes and Metadata

**Status:** Completed and accepted by the user on 2026-11-21.
**Baseline:** `d9ce8ad` — Reorganize Account Settings UI.

## Delivered behavior

- Layout annotations support Rectangle, Ellipse and Text. An Ellipse with equal width and height is a circle.
- Rectangle and Ellipse support optional Name and Description. Names appear inside the outline: top left for Rectangle and top center for Ellipse. Long names are shortened on the canvas. Properties and the metadata tooltip show the full name.
- The metadata tooltip appears after one second of stationary hover in Annotation → Select. It uses a muted surface and a lighter description. Description in the properties panel shares the Name field's typography.
- **Pan canvas by default** is the initial drag behavior in Annotation → Select. Dragging pans the canvas, including over a shape. Click an annotation to select it, then hold **Space** while dragging to move it. **Move annotations by default** remains available in the selector and uses **Space + drag** to pan. The hint below the selector explains the active shortcut.
- Alt/Option + click cycles annotations under the cursor. For a selected shape with canvas focus, Arrow keys move it by 10 units and Shift + Arrow by 50. In the delete dialog, Left focuses Cancel and Right focuses Delete. Enter activates the focused button.
- Clicking outside the Text editor finishes editing and keeps the text selected. The layout Save action persists the edit.

## Compatibility and deployment

- Positions and annotations share the existing atomic workspace snapshot. Browser recovery retains version 2 and supports compatible older drafts.
- JSON exports use schema version 2. Import and Restore accept versions 1 and 2.
- Alembic revision `a21a01e4b901` follows `a20c02f1a901`. It adds nullable Name and Description columns and extends the annotation constraint for Ellipse. A downgrade refuses to proceed while an Ellipse or populated shape metadata exists.
- A backup was created and verified before the local upgrade. The upgrade succeeded, and `alembic current` reported `a21a01e4b901 (head)`. The later interaction and styling changes use that revision.
- After updating a running Docker Compose deployment, restart the API so Uvicorn loads the new schema. During acceptance, the old process rejected Ellipse until `docker compose restart api`; saving succeeded after the restart.

## Verification and acceptance

| Check | Result |
| --- | --- |
| Backend suite in Docker with PostgreSQL | `181 passed in 59.16s` after updating the affected legacy tests |
| Frontend suite and production build during implementation | 295 tests passed and the build succeeded before the later UI refinements |
| TypeScript check after adding both drag modes | Passed |
| Manual acceptance during use | User confirmed saving after the API restart, Text editing after clicking outside, arrow navigation in the delete dialog, Description and tooltip styling, title placement, and the pan and move workflow. Final appearance and behavior accepted on 2026-11-21. |

The full automated suites were not rerun after the last UI refinements.

## Handoff

Use this checkpoint as the baseline for Stage 22 — Plans and Entitlements. Rectangle, Ellipse and Text each count as one annotation. Name and Description are properties of the same annotation.
