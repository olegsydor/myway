import type { usePersistentLayout } from "./usePersistentLayout.ts";
import type { Command } from "./workspaceCommands.ts";
import type { MenuItem } from "../shell/menuModel.ts";

export type LayoutController = ReturnType<typeof usePersistentLayout>;
export type LayoutDialog = { kind: "new" | "rename" | "delete" } | { kind: "switch"; id: number; name: string };
export function layoutStatus(layout: Pick<LayoutController, "phase" | "dirty" | "error">): string {
  if (layout.error || layout.phase === "load-error") return "Error";
  if (layout.phase === "loading" || layout.phase === "recovery") return "Loading…";
  if (layout.phase === "saving") return "Saving…";
  if (layout.phase === "switching") return "Opening…";
  if (layout.phase === "managing") return "Updating…";
  return layout.dirty ? "Unsaved" : "Saved";
}
export function layoutMenu(layout: LayoutController, save: Command, open: (dialog: LayoutDialog) => void): MenuItem[] {
  const blocked = layout.blocked || layout.locked;
  const guarded = (action: () => unknown) => () => { if (!layout.blocked && !layout.isLocked()) void action(); };
  return [
    { id: "current", kind: "header", label: `${layout.active?.name ?? "Unsaved initial layout"} — ${layoutStatus(layout)}` },
    { id: "switch", label: "Switch layout", disabled: blocked || layout.layouts.length === 0,
      children: layout.layouts.map(item => ({ id: String(item.id), label: item.name + (item.is_default ? " (default)" : ""),
        disabled: blocked || item.id === layout.active?.id,
        run: guarded(() => { if (layout.dirty) open({ kind: "switch", id: item.id, name: item.name });
          else void layout.switchTo(item.id, "discard"); }),
      })) },
    { id: "save", label: "Save", shortcut: "Cmd/Ctrl+S", disabled: !save.enabled, run: save.run },
    { id: "discard", label: "Discard changes", disabled: !layout.canDiscard,
      run: guarded(() => { if (layout.canDiscard) layout.discard(); }) },
    { id: "new", label: "Save as new layout…", disabled: blocked, run: guarded(() => open({ kind: "new" })) },
    { id: "separator", kind: "separator", label: "" },
    { id: "rename", label: "Rename layout…", disabled: blocked || !layout.active,
      run: guarded(() => { if (layout.active) open({ kind: "rename" }); }) },
    { id: "default", label: "Set as default", disabled: blocked || !layout.active || layout.active.is_default,
      run: guarded(() => { if (layout.active && !layout.active.is_default) void layout.setDefault(); }) },
    { id: "delete", label: "Delete layout…", disabled: blocked || !layout.canDelete,
      run: guarded(() => { if (layout.canDelete) open({ kind: "delete" }); }) },
  ];
}
