import { useEffect } from "react";

export function workspaceTitle(name: string | null, dirty: boolean, usable: boolean): string {
  if (!usable) return "My Way";
  if (name === null) return "My Way — Unsaved layout *";
  return `My Way — ${name}${dirty ? " *" : ""}`;
}

export function useWorkspaceTitle(name: string | null, dirty: boolean, usable: boolean): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = workspaceTitle(name, dirty, usable);
    return () => { document.title = "My Way"; };
  }, [name, dirty, usable]);
}
