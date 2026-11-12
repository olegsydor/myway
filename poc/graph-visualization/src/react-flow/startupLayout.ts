import type { SavedLayout } from "../shared/persistentLayouts.ts";

export function selectStartupLayout(owned: SavedLayout[], remembered: number | null) {
  const match = owned.find((layout) => layout.id === remembered);
  const layout = match ?? owned.find((item) => item.is_default) ?? owned[0] ?? null;
  const stale = remembered !== null && !match;
  const notices: string[] = [];
  if (stale && layout) notices.push(`Last used layout is unavailable; opened ${layout.name}.`);
  if (layout && !match && !layout.is_default) {
    notices.push("No default layout was found; opened the oldest saved layout. Choose Set as default to use it on startup.");
  }
  return { layout, stale, notice: notices.join(" ") };
}
