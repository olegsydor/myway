import { useEffect, useRef, type ReactNode } from "react";
export function AccountDialog({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const invoker = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); invoker?.focus(); };
  }, []);
  return <dialog ref={ref} className="auth-card account-dialog" aria-label="Account"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
