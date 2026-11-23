import { planLimitMessage, type PlanViolation } from "./entitlements.ts";
import { ApiError, identityGeneration, request, StaleRequest } from "./http.ts";

const maxImportBytes = 64 * 1024 * 1024;

interface ImportCounts {
  nodes: number;
  edges: number;
  layouts: number;
}

export async function importDataFile(file: File): Promise<ImportCounts> {
  return uploadExport<ImportCounts>("/api/import", file);
}

export interface RestoreCounts extends ImportCounts {
  positions: number;
  annotations: number;
}

export interface RestorePreview extends RestoreCounts {
  eligibility: { allowed: boolean; violations: PlanViolation[] };
}

export function previewRestore(file: File): Promise<RestorePreview> {
  return uploadExport("/api/restore/preview", file);
}

export function restoreWorkspace(file: File): Promise<RestoreCounts> {
  return uploadExport("/api/restore?confirmed=true", file);
}

async function uploadExport<T>(path: string, file: File): Promise<T> {
  if (file.size > maxImportBytes) throw new ApiError(413, "Import file exceeds 64 MiB");
  const started = identityGeneration();
  const response = await request(path, { method: "POST", body: file });
  const counts = await response.json() as T;
  if (started !== identityGeneration()) throw new StaleRequest();
  return counts;
}

export function importErrorMessage(error: unknown, operation = "import"): string {
  const limit = planLimitMessage(error, true);
  if (limit) return limit;
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === "import_requires_empty_account") {
      return "Import is only available for an empty account.";
    }
    if (error.status === 422) return `Invalid My Way export. ${error.message}`;
    if (error.status === 413) return "Choose a JSON file no larger than 64 MiB.";
  }
  return `Could not confirm the ${operation}. Check your workspace before trying again.`;
}
