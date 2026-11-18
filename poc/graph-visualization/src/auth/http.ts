export class ApiError extends Error {
  status: number;
  code: string;
  readonly detail?: unknown;
  constructor(status: number, code: string, detail?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
export class StaleRequest extends Error { constructor() { super("Account changed; request cancelled"); } }
let generation = 0;
let csrf: string | null = null;
let account: number | null = null;
let onInvalid: ((error: ApiError) => void) | null = null;
const pending = new Set<AbortController>();
export function identityGeneration() { return generation; }
export function currentAccount() { return account; }
export function setIdentity(id: number | null, token: string | null) {
  generation++;
  for (const controller of pending) controller.abort();
  pending.clear();
  account = id; csrf = token;
}
export function setCsrf(token: string) { csrf = token; }
export function onAuthInvalid(handler: ((error: ApiError) => void) | null) { onInvalid = handler; }
export async function request(path: string, init: RequestInit = {}, authFlow = false): Promise<Response> {
  const started = generation;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  pending.add(controller);
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD"].includes(init.method ?? "GET")) {
    headers.set("Content-Type", "application/json");

  }
  if (csrf) headers.set("X-CSRF-Token", csrf);
  try {
    const response = await fetch(path, { ...init, headers, credentials: "same-origin", signal: controller.signal, cache: "no-store" });
    if (generation !== started) throw new StaleRequest();
    if (!response.ok) {
      const body = await response.clone().json().catch(() => null);
      const detail = typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail)
        ? body.detail.map((item: { msg?: string }) => item.msg ?? "Invalid input").join("; ") : `Request failed (${response.status})`;
      const code = typeof body?.detail?.code === "string" ? body.detail.code : detail;
      if (generation !== started) throw new StaleRequest();
      const error = new ApiError(response.status, code, body?.detail);
      if (!authFlow && (response.status === 401 || (response.status === 403 && ["account_blocked", "account_pending_deletion", "email_verification_required", "csrf_failed"].includes(code)))) {
        onInvalid?.(error);
      }
      throw error;
    }
    // Consume before releasing generation guard, including a slow response body.
    const buffer = await response.arrayBuffer();
    if (generation !== started) throw new StaleRequest();
    return new Response(response.status === 204 ? null : buffer, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    pending.delete(controller);
    init.signal?.removeEventListener("abort", abort);
  }
}
export async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await request(`/api/auth${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }, true);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
