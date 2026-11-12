import { useEffect, useRef } from 'react';

import { SHORTCUT_HELP } from "./shortcutHelp";

export function HelpDialog({ open, onClose, returnFocus }: { open: boolean; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const invoker = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!element.open) element.showModal();
    close.current?.focus();
    return () => {
      if (element.open) element.close();
      if (invoker?.isConnected) invoker.focus();
    };
  }, [open, returnFocus]);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return <dialog ref={dialog} className="layout-dialog help-dialog" aria-labelledby="shortcut-help-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab') {
        // This read-only dialog has one focusable control.
        event.preventDefault(); close.current?.focus();
      }
    }}>
    <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
    <dl>{SHORTCUT_HELP.map(([key, description]) => <div key={key}><dt>{key}</dt><dd>{description}</dd></div>)}</dl>
    {!mac && <p>Press and release Alt alone to focus the first application menu when no dialog, editor, form or gesture is active.</p>}
    <button ref={close} type="button" onClick={onClose}>Close</button>
  </dialog>;
}
