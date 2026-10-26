export const GRAPH_SHORTCUTS = {
  saveLayout: "mod+s", createNode: "n", createEdge: "e", deleteElement: ["delete", "backspace"],
} as const;
export type ShortcutAction = keyof typeof GRAPH_SHORTCUTS;
export type Key = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;
export function resolveShortcut(event: Key, bindings: Record<ShortcutAction, string | readonly string[]> = GRAPH_SHORTCUTS): ShortcutAction | null {
  const key = event.key.toLowerCase();
  if (event.altKey || event.shiftKey) return null;
  for (const action of Object.keys(bindings) as ShortcutAction[]) {
    const configured = bindings[action];
    for (const binding of typeof configured === "string" ? [configured] : configured) {
      if (binding.startsWith("mod+")) {
        if (event.ctrlKey !== event.metaKey && key === binding.slice(4)) return action;
      } else if (!event.ctrlKey && !event.metaKey && key === binding) return action;
    }
  }
  return null;
}
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
  ));
}
export interface ShortcutContext {
  canvas: boolean; editable: boolean; modal: boolean; busy: boolean; form: boolean;
  run: (action: ShortcutAction) => void; notice: () => void;
}
export function dispatchShortcut(event: KeyboardEvent, context: ShortcutContext): boolean {
  const action = resolveShortcut(event);
  if (!action) return false;
  if (action === "saveLayout") {
    event.preventDefault();
    if (event.repeat || event.isComposing) return true;
    if (context.form || context.modal) context.notice();
    else if (!context.busy) context.run(action);
    return true;
  }
  if (event.defaultPrevented || event.repeat || event.isComposing || !context.canvas ||
      context.editable || context.modal || context.busy || context.form) return false;
  event.preventDefault();
  context.run(action);
  return true;
}

export function registerGraphKeyboard(target: Pick<Window, "addEventListener" | "removeEventListener">, listener: (event: KeyboardEvent) => void) {
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
