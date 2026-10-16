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
  return await response.json() as T;
}

export function fetchLayouts(signal?: AbortSignal): Promise<SavedLayout[]> {
  return request("", "GET", undefined, signal);
}

export function fetchLayout(id: number, signal?: AbortSignal): Promise<LayoutDetail> {
  return request(`/${id}`, "GET", undefined, signal);
}

export function createLayout(name: string, positions: LayoutPosition[]): Promise<LayoutDetail> {
  return request("", "POST", { name, positions });
}

export function saveLayout(id: number, positions: LayoutPosition[]): Promise<LayoutDetail> {
  return request(`/${id}/positions`, "PUT", { positions });
}
