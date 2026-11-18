import { identityGeneration, request, StaleRequest } from "./http.ts";

export async function downloadDataExport() {
  const started = identityGeneration();
  const response = await request("/api/export");
  const file = await response.blob();
  if (started !== identityGeneration()) throw new StaleRequest();

  const filename = /filename="(my-way-export-\d{4}-\d{2}-\d{2}\.json)"/
    .exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "my-way-export.json";
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser start reading the URL before revoking it.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
