# Stage 18 — Visual Design & UI Polish

## Specification status

- Product: My Way.
- Design direction: **Calm Canvas**, approved by the user.
- This document records the implementation specification developed during visual-design discovery.
- Token values are working implementation values, subject to contrast and in-application visual verification.
- Stage 18 was implemented and accepted by the user on 2026-11-17.
- The approved amendments below supersede conflicting original visual-only or label/tooltip constraints. Final delivery and validation are recorded in `stage-18.md`.

## Objective

Give My Way a coherent, polished appearance suitable for a public product, using the approved Calm Canvas direction.

The scope includes the application shell, panels, forms, menus, dialogs, messages, canvas, nodes, edges, and annotations.

The graph remains the primary focus. The surrounding interface should be calm, readable, and consistent.

## 1. Fixed constraints

Preserve the Stage 16 navigation and information architecture, including application-bar item order, menu contents, tool placement, and Tools panel behavior.

Preserve Stage 17 and earlier functional behavior:

- Node and edge CRUD.
- Layouts, Save, Save as New, Discard, Rename, and Delete.
- Recovery and protection against losing unsaved changes.
- Per-layout viewports, camera restoration, and explicit Fit commands.
- Search, filtering, selection, grouping, and highlighting.
- Graph and Annotation modes.
- Annotation creation, selection, movement, resizing, and text editing.
- Shortcuts, keyboard navigation, focus restoration, and unavailable-command guards.

Do not introduce dark mode, authentication, Free/Pro tiers, new tools, new annotation shapes, autosave, Undo/Redo, or a CRUD redesign.

## 2. Code-change boundaries

Changes primarily concern CSS and visual values defined in React/TypeScript.

Small markup changes and shared styling helpers are allowed. They must not alter state ownership, callback ordering, command-availability conditions, or component mounting behavior on which retained state depends.

Do not change the backend, APIs, data schemas, persistence keys, recovery payloads, or saved-layout formats.

No new dependencies are required for this visual update.

## 3. Design tokens

The following names define semantic roles. Their final code syntax may follow the existing styling organization.

| Token | Initial value | Purpose |
| --- | --- | --- |
| `surface.canvas` | `#F7F9FC` | Graph background |
| `surface.panel` | `#FFFFFF` | Panels, menus, dialogs, and tooltips |
| `surface.subtle` | `#F1F4F8` | Supporting surfaces |
| `text.primary` | `#273548` | Primary text |
| `text.secondary` | `#617184` | Supporting text and metadata |
| `border.default` | `#DBE3EC` | Component borders |
| `accent.primary` | `#346DCB` | Primary actions and focus accent |
| `accent.soft` | `#EAF1FC` | Subtle active-element background |
| `graph.emphasis` | `#BD555E` | Existing red graph emphasis |
| `graph.group` | `#3F8069` | Existing green outline |
| `edge.default` | `#8C9EB2` | Ordinary edges |
| `feedback.error.text` | `#8B3D46` | Error text |
| `feedback.error.surface` | `#FCF4F4` | Error background |

Node-type colors retain their existing category mappings. Style every existing type with a light tinted surface, dark text, and a colored type marker. Keep the textual type label visible.

### Typography

Retain the existing Inter/system font stack.

Shell targets:

- Primary text: 14 px.
- Supporting text: 12 px.
- Section headings: 14–16 px.

Preserve node font size and line height wherever changing them would affect node geometry.

### Spacing and shape

- Spacing scale: 4, 8, 12, 16, and 24 px.
- Fields and buttons: 6 px corner radius.
- Nodes, menus, and tooltips: 8 px corner radius.
- Dialogs: 12 px corner radius.

The node-radius target applies only while preserving external node dimensions.

Use restrained shadows for floating surfaces. Separate persistent panels primarily through backgrounds and borders.

Adjust working values as necessary after contrast and real-application visual verification.

## 4. Application shell and panels

Use a light application bar with a thin bottom border. Establish a clearer hierarchy between commands:

- Menus use restrained button styling.
- Save is the primary action.
- Graph/Annotation has a clear active state.
- Layout name and status form a compact, readable group.

In Tools, unify headings, labels, fields, buttons, vertical spacing, and separators. Distinguish primary, secondary, and destructive actions visually.

Preserve the current panel width and responsive breakpoints. Do not relocate forms or change their contents.

## 5. Canvas, nodes, and edges

### Canvas

Use a light background and a low-contrast grid. The grid must not compete with thin edges.

### Nodes

Preserve:

- External node dimensions.
- Handle positions.
- Label truncation rules.
- Tooltip content and behavior.
- Click, drag, and selection areas.

Cover all existing node types and visual states.

Before changing colors, inspect the actual state-composition rules in the current code: selected nodes, groups, branch/path highlighting, search results, and dimming outside the active focus. Preserve their existing priorities and behavioral meaning.

### Edges

Make edges visually calmer. Color, visible stroke width, and arrow size may be adjusted while preserving direction and state meaning.

Do not change routing, layout algorithms, coordinates, interaction width, or edge-selection behavior.

Do not introduce new label-hiding rules, graph simplification, or zoom-dependent rendering behavior.

## 6. Annotations

Retain all existing color choices, fill variants, border options, and text-size options.

Align their visual treatment with Calm Canvas:

- Light Rectangle fills.
- Readable Text annotations.
- Clear selection outlines and resize handles.
- Consistent text-editor and helper-text styling.

Do not change saved annotation dimensions or coordinates, text geometry, handle counts, or interaction areas. Do not add resizing or other capabilities to annotation types that do not currently support them.

## 7. Menus, dialogs, and messages

Apply shared tokens to all existing menus and dialogs, not only Rename.

Unify padding, borders, corner radii, fields, primary and secondary buttons, hover states, focus states, and disabled states.

Style messages according to their meaning. Reduce excessive spacing while preserving message placement, wording, lifetime, and available actions.

Do not replace existing messages with a new toast system.

Native browser dialogs are outside the styling scope. The diagnostics strip and Export diagnostics remain available only under their current debug rules.

## 8. Validation

Before implementation, record baseline screenshots and the geometry of representative nodes, handles, and annotations.

After implementation, verify:

- Ordinary, active, disabled, hover, and keyboard-focus states.
- Long names, different node types, and tooltips.
- Combined selection, grouping, and highlighting states.
- Rectangle and Text annotations in normal and editing states.
- Tools open and closed, including docked and overlay layouts.
- Menus, dialogs, errors, and recovery.
- Text contrast against every relevant surface, meeting applicable WCAG AA requirements.
- A real graph of approximately 500 nodes at overview and working zoom levels.

Overview zoom is not required to make every label readable. Evaluate structure, visual noise, and visibility of the active graph fragment. Do not change zoom limits.

Run the existing frontend tests, production build, and lint checks. Do not add tests that merely duplicate CSS values. Add targeted coverage when markup changes introduce a behavioral regression risk.

The discovery mockups illustrate visual direction. They do not establish full state coverage, real-graph readability, or performance acceptance.

## 9. Delivery sequence

1. Verify the current baseline and map existing visual states.
2. Introduce tokens and update the shell, forms, menus, and dialogs.
3. Update the canvas, nodes, edges, and annotations.
4. Verify geometry, contrast, responsive states, and behavioral regressions.
5. Review the result with real data and make targeted adjustments.

## Completion criteria

My Way consistently follows Calm Canvas across all interface areas listed in this specification. Saved data, navigation, and Stage 16–17 behavior continue to work as before.

Any usability issues discovered during use should be examined as concrete cases and addressed through targeted adjustments. Changes beyond visual styling must be described separately before implementation.


## Approved refinement — two-line node names

Following visual review, the user approved replacing the visible node-type row with a name of up to two lines, aligned at the top even for short names. Excess text is truncated after the second line. The colored type marker remains.

The tooltip now always contains the full name and type, followed by any existing description and properties, including for nodes without optional details. It is also visible on keyboard focus. The selected-node panel retains its existing type field.

This refinement supersedes the original requirements to retain single-line truncation and a visible node-type label. Node and handle geometry must still remain unchanged. Existing hidden single-line/type metrics reserve the original content height while the two-line label is overlaid in that space.


## Approved enhancement — overlapping annotation selection

The user approved Alt/Option + click to cycle annotations under the pointer in Annotation mode's Select tool. Ordinary clicking and annotation stacking order remain unchanged. The cycle follows the actual DOM hit stack, so Text/Rectangle layer order is respected. Repeated Alt-clicks wrap around without reordering or dirtying the saved workspace.

Alt-drag moves the annotation chosen by that click; resize handles can still be used normally after selection. Rapid Alt-clicks must not invoke text editing. Locks, primary-pointer checks, and tool/mode guards remain in force. This is an explicitly approved interaction enhancement beyond the original visual-only scope; it does not introduce a persistence-format change.


## Approved enhancement — keyboard search navigation

Search graph results and node-picker suggestions support Down from the input, Up/Down between result buttons, Up from the first result back to the input, native Enter/Space selection, and Escape to close the list and return input focus. Tab remains native. Arrow navigation never selects an element. Escape preserves the typed query; Down can reopen the results. Empty/disabled lists and IME composition do not steal focus. Graph search keeps its existing explicit Search/Enter submission behavior; node pickers keep live filtering.


## Final approved appearance and closure

The user accepted Stage 18 on 2026-11-17. Final refinements supersede the corresponding initial draft values:

- Node names: up to two lines, top-aligned, weight 500; original outer/handle geometry retained.
- Graph/Annotation: a shared segmented-control frame with a distinct active segment.
- Ordinary edge/arrow color: `#97A6B8`; ordinary edge stroke: `0.75`; emphasized stroke remains `2.5`; marker size: `14`.
- Rectangle outline and fill radius: `6` graph units; hit geometry and resize behavior unchanged.
- Node tooltip: one-second reveal delay, immediate dismissal on exit, suppressed while dragging and when selected, keyboard access through visible focus on unselected nodes only.
- Reduced-motion preference: remove the tooltip fade while preserving the one-second delay. No change to camera motion.

User-approved Alt/Option overlap selection and keyboard search navigation are recorded above. The stage is closed; future issues and figure-naming/new-shape ideas are separate work.
