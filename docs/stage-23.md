# Stage 23 — Create & Search Workspace Flow

Baseline commit `e00e27e` (Unify deletion dialog keyboard navigation). Stage 23 was accepted on 2026-11-24.

## Workspace behavior

- The application menu is ordered **Create → Search → Layout → View → Arrange → Help**. In Annotation mode, **Annotations** takes the Search slot. View offers **Close side panel** while the panel is open.

- **Create → New Node** and **Create → New Edge**, including the N and E shortcuts, open the corresponding Create tab. The shortcuts also work with a Ukrainian keyboard layout and when focus returns to the Search launcher. Both forms keep their drafts while switching tabs, opening Search, closing the panel or editing a graph element.
- Successful submissions keep the selected Type, clear the submitted fields and return focus to Name or Source Node while the user stays in the same Create view. Leaving that view cancels the post-submit focus return. Validation and request errors appear beside the form and retain the entered data.
- **Search** opens Search & Navigate and focuses its query field. Search keeps its query, results, filters, path endpoints and contextual edit state between panel views. Selecting a result still uses the existing graph navigation.
- **Annotations** opens automatically on entering Annotation mode. Closing its panel retains the current tool and selection. Returning to Graph restores the previous graph panel view and open state. Graph highlights are suppressed on the canvas during Annotation mode and restored on return.
- The panel remembers scroll per view for the mounted workspace. It docks at 1100 px and opens by default from 1200 px on a first visit with no saved preference. The new `myway:workspace-panel:v2` preference stores the graph view and open state. Existing open and closed preferences migrate to Search. Drafts stay in the current authenticated workspace and are cleared on reload or remount.
- The Stage 22 Node limit continues to disable Node creation while Search and Edge creation remain available. Billing is scheduled for Stage 24.

## Verification

Stage 23 requires no database migration. The browser migrates the panel preference automatically.

The final frontend run passed 300 tests. The build passed and lint reported the same 14 warnings as the baseline.

From `poc/graph-visualization`, run `npm test`, `npm run build` and `npm run lint` using Node 24.

The [browser regression](../poc/graph-visualization/tests/browser/stage23.cjs) uses a disposable My Way instance, a file mail sink and headless Chrome. Set `MYWAY_TEST_ORIGIN` to the test instance, `MYWAY_TEST_MAIL_DIR` to its mail directory and optionally `MYWAY_PLAYWRIGHT_MODULE` to the installed Playwright module. Run `node tests/browser/stage23.cjs` from the frontend directory.

The regression covers serial submissions, validation and simulated network failures, draft retention after contextual edit, delayed submit while Search has focus, search navigation and filters, Annotation round trips, the Node limit UI, and keyboard and responsive behavior at widths of 1440, 430 and 320 px. Browser verification uses a disposable test graph.
