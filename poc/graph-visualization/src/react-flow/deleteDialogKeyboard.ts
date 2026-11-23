import type { KeyboardEvent } from "react";

export function focusDeleteDialogAction(
  event: KeyboardEvent<HTMLDivElement>,
  disabled: boolean,
  cancelButton: HTMLButtonElement | null,
  deleteButton: HTMLButtonElement | null,
) {
  if (disabled || !cancelButton || !deleteButton) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

  event.preventDefault();
  event.stopPropagation();
  (event.key === "ArrowLeft" ? cancelButton : deleteButton).focus();
}
