import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadDataExport } from "../src/auth/dataExport.ts";
import { setIdentity, StaleRequest } from "../src/auth/http.ts";

test("downloads the server JSON with session credentials and ignores a stale download", async (t) => {
  const json = '{"schema_version":1,"nodes":[],"edges":[],"layouts":[]}';
  const filename = "my-way-export-2026-11-18.json";
  const fileResponse = () => new Response(json, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"` },
  });
  let file: Blob | undefined;
  let clicks = 0;
  let removed = false;
  let cleanup: (() => void) | undefined;
  const link = {
    href: "", download: "",
    click() { clicks++; },
    remove() { removed = true; },
  };
  t.mock.method(URL, "createObjectURL", (blob: Blob) => { file = blob; return "blob:export"; });
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  const document = { createElement: () => link, body: { append() {} } };
  const window = { setTimeout(callback: () => void) { cleanup = callback; } };
  Object.assign(globalThis, { document, window });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    setIdentity(null, null);
  });

  setIdentity(1, "export-csrf");
  const fetch = t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    assert.equal(path, "/api/export");
    assert.equal(init.credentials, "same-origin");
    assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "export-csrf");
    return fileResponse();
  });

  await downloadDataExport();
  assert.equal(await file?.text(), json);
  assert.equal(link.download, filename);
  assert.equal(link.href, "blob:export");
  assert.equal(removed, true);
  assert.equal(clicks, 1);
  cleanup?.();
  assert.deepEqual(revoke.mock.calls[0].arguments, ["blob:export"]);

  fetch.mock.mockImplementationOnce(async () => new Response(null, { status: 500 }));
  await assert.rejects(downloadDataExport(), /500/);
  fetch.mock.mockImplementationOnce(async () => {
    setIdentity(2, "other-csrf");
    return fileResponse();
  });
  await assert.rejects(downloadDataExport(), StaleRequest);
  assert.equal(clicks, 1);
});
