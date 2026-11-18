import { ApiError, identityGeneration, request, StaleRequest } from "./http.ts";

const maxImportBytes = 64 * 1024 * 1024;

interface ImportCounts {
  nodes: number;
  edges: number;
  layouts: number;
}

export async function importDataFile(file: File): Promise<ImportCounts> {
  if (file.size > maxImportBytes) throw new ApiError(413, "Import file exceeds 64 MiB");
  const started = identityGeneration();
  const response = await request("/api/import", { method: "POST", body: file });
  const counts = await response.json() as ImportCounts;
  if (started !== identityGeneration()) throw new StaleRequest();
  return counts;
}

export function importErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === "import_requires_empty_account") {
      return "Import is only available for an empty account.";
    }
    if (error.status === 422) return `Invalid My Way export. ${error.message}`;
    if (error.status === 413) return "Choose a JSON file no larger than 64 MiB.";
  }
  return "Could not confirm the import. Check your workspace before trying again.";
}
