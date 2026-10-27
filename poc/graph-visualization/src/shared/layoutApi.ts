import { annotationSnapshot, type Annotation } from "./annotations.ts";
import type { LayoutDetail, LayoutPosition, SavedLayout } from "./persistentLayouts";

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/layouts${path}`, {
    method, signal,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const detail = typeof error?.detail === "string" ? error.detail :
      Array.isArray(error?.detail) ? error.detail.map((item: { msg?: string }) => item.msg ?? "Invalid layout").join("; ") :
      `Layout request failed (${response.status})`;
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function fetchLayouts(signal?: AbortSignal): Promise<SavedLayout[]> {
  return request("", "GET", undefined, signal);
}

function acceptedDetail(detail: LayoutDetail): LayoutDetail {
  if (!Object.hasOwn(detail, "annotations")) {
    throw new Error("Layout data is incomplete. Reload the application after its server update.");
  }
  return { ...detail, annotations: annotationSnapshot(detail.annotations) };
}

export async function fetchLayout(id: number, signal?: AbortSignal): Promise<LayoutDetail> {
  return acceptedDetail(await request<LayoutDetail>(`/${id}`, "GET", undefined, signal));
}

export async function createLayout(name: string, positions: LayoutPosition[], annotations: readonly Annotation[] = []): Promise<LayoutDetail> {
  return acceptedDetail(await request<LayoutDetail>("", "POST", { name, positions, annotations: annotationSnapshot(annotations) }));
}

export async function saveLayout(id: number, positions: LayoutPosition[], annotations: readonly Annotation[]): Promise<LayoutDetail> {
  return acceptedDetail(await request<LayoutDetail>(`/${id}/workspace`, "PUT", { positions, annotations: annotationSnapshot(annotations) }));
}

export function updateLayout(id: number, data: { name?: string; is_default?: true }): Promise<SavedLayout> {
  return request(`/${id}`, "PATCH", data);
}

export async function deleteLayout(id: number): Promise<void> {
  await request(`/${id}`, "DELETE");
}
