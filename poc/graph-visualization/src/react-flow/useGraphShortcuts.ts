import { useEffect, useLayoutEffect, useRef } from "react";
import { dispatchShortcut, isEditableTarget, registerGraphKeyboard, type ShortcutContext } from "./graphShortcuts";

export function useGraphShortcuts(context: Omit<ShortcutContext, "canvas" | "editable" | "modal"> & {
  fallback: (event: KeyboardEvent) => void;
}) {
  const latest = useRef(context);
  useLayoutEffect(() => { latest.current = context; });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const modal = Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
      const canvas = Boolean(target?.closest(".react-flow-container"));
      const editable = isEditableTarget(event.target);
      if (!dispatchShortcut(event, { ...latest.current, canvas, editable, modal }) &&
          canvas && !editable && !modal && !latest.current.busy && !latest.current.form &&
          !event.repeat && !event.isComposing) latest.current.fallback(event);
    };
    return registerGraphKeyboard(window, listener);
  }, []);
}
