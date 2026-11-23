import assert from "node:assert/strict";
import test from "node:test";
import { importDataFile, importErrorMessage } from "../src/auth/dataImport.ts";
import { setIdentity, StaleRequest } from "../src/auth/http.ts";

test("uploads original JSON bytes with session CSRF and returns import counts", async t => {
  setIdentity(1, "destination-token");
  t.after(() => setIdentity(null, null));
  const content = '{"schema_version":1,"nodes":[{"id":9007199254740993}]}';
  const file = new File([content], "export.json");
  t.mock.method(globalThis, "fetch", async (path, init) => {
    assert.equal(path, "/api/import");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("Content-Type"), "application/json");
    assert.equal(init.headers.get("X-CSRF-Token"), "destination-token");
    assert.equal(await init.body.text(), content);
    return Response.json({ nodes: 1, edges: 0, layouts: 0 }, { status: 201 });
  });
  assert.deepEqual(await importDataFile(file), { nodes: 1, edges: 0, layouts: 0 });
});

test("reports a nonempty account and drops a response from a previous account", async t => {
  setIdentity(1, "first-token");
  t.after(() => setIdentity(null, null));
  const file = new File(["{}"], "export.json");
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "import_requires_empty_account" }, { status: 409 }));
  await assert.rejects(importDataFile(file), error =>
    importErrorMessage(error) === "Import is only available for an empty account.");
  fetch.mock.mockImplementationOnce(async () => {
    setIdentity(2, "second-token");
    return Response.json({ nodes: 1, edges: 0, layouts: 0 }, { status: 201 });
  });
  await assert.rejects(importDataFile(file), StaleRequest);
});

test("a server-side layout quota error reports the actual limit for either plan", async t => {
  setIdentity(1, "destination-token");
  t.after(() => setIdentity(null, null));
  const file = new File(["{}"], "export.json");
  let limit = 3;
  t.mock.method(globalThis, "fetch", async () => Response.json({
    detail: { code: "plan_limit_exceeded", resource: "layouts", plan: limit === 3 ? "free" : "pro",
      limit, current: 0, attempted: limit + 1 },
  }, { status: 409 }));
  for (limit of [3, 15]) {
    await assert.rejects(importDataFile(file), error =>
      importErrorMessage(error) === `This file contains ${limit + 1} layouts. Your current plan allows ${limit}.`);
  }
});
