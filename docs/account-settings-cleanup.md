# Account Settings Cleanup

**Status:** Completed and visually accepted on 2026-11-19  
**Baseline:** `a569ad5` — Stage 20 workspace restore and regression acceptance  
**Scope:** Frontend presentation and navigation only

## Summary

Account Settings now groups existing capabilities into three sections:

- **Profile & Security** — account identity, password change and sign out.
- **Your Data** — Export, Import and Restore / Replace.
- **Danger Zone** — account deletion and its existing confirmation flow.

The dialog uses accessible tabs with mouse and keyboard navigation. All panels
remain mounted so switching sections preserves form values and selected files.
The layout follows the existing Calm Canvas tokens and uses a vertical section
list on viewports at or below 600 px. Existing handlers and backend behavior
remain in place.

## Changed files

- `poc/graph-visualization/src/auth/AccountSettings.tsx` — new sectioned UI.
- `poc/graph-visualization/src/auth/AuthGate.tsx` — section state and routing
  between existing account flows.
- `poc/graph-visualization/src/auth/AccountDialog.tsx` — accessible dialog title.
- `poc/graph-visualization/src/auth/auth.css` — dialog, section and responsive
  styling.
- `poc/graph-visualization/tests/accountSettings.test.ts` — focused component
  coverage.

## Verification

- `npm test` — **289 passed** under Node 24.
- `npm run lint` — passed. Existing warnings remain in graph/layout code; no
  warnings were reported for Account Settings changes.
- `npm run build` — passed with Vite 8.3.5.
- Chrome review on the main project at `localhost:5173` confirmed the new
  Account Settings view. At a measured viewport of **500 × 434 px**, the narrow
  layout activated: section navigation became vertical, content wrapped, the
  dialog scrolled vertically, and the footer remained reachable. No horizontal
  overflow was visible.
- Keyboard navigation switched sections. The account deletion confirmation
  opened and its Back action returned to Danger Zone. No deletion, password
  change, sign out, import or restore was performed during this review.

The graph displayed an Unsaved state during the browser review. It was left
untouched; no graph or layout data was saved or discarded.

## Database and migration impact

None. This checkpoint changes only frontend presentation and navigation; no
backend, API, schema or Alembic migration changes are required.

## Commit

Suggested commit message: `Reorganize Account Settings UI`.
