import assert from "node:assert/strict";
import { test } from "node:test";
import { createLayout, deleteLayout, fetchLayout, fetchLayouts, saveLayout, updateLayout } from "../src/shared/layoutApi.ts";

const metadata = { id: 7, name: "Main", is_default: true, created_at: "2026-10-16", updated_at: "2026-10-16" };
const positions = [{ node_id: 1, x: -50.5, y: 300 }];

async function mockedFetch(response: () => Response, action: (calls: { url: string; options?: RequestInit }[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return response(); };
  try { await action(calls); } finally { globalThis.fetch = original; }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test("list metadata and fetch detail use separate GET endpoints", async () => {
  await mockedFetch(() => json([metadata]), async (calls) => {
    assert.deepEqual(await fetchLayouts(), [metadata]);
    assert.equal(calls[0].url, "/api/layouts");
    assert.equal(calls[0].options?.method, "GET");
  });
  await mockedFetch(() => json({ ...metadata, positions, annotations: [] }), async (calls) => {
    assert.deepEqual(await fetchLayout(7), { ...metadata, positions, annotations: [] });
    assert.equal(calls[0].url, "/api/layouts/7");
  });
});
test("save-as-new sends the working snapshot with POST and receives the new identity", async () => {
  await mockedFetch(() => json({ ...metadata, id: 8, positions, annotations: [] }, 201), async (calls) => {
    assert.equal((await createLayout("Career", positions)).id, 8);
    assert.equal(calls[0].options?.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options?.body as string), { name: "Career", positions, annotations: [] });
  });
});
test("save replaces the specified layout snapshot with PUT", async () => {
  await mockedFetch(() => json({ ...metadata, positions, annotations: [] }), async (calls) => {
    await saveLayout(7, positions, []);
    assert.equal(calls[0].url, "/api/layouts/7/workspace");
    assert.equal(calls[0].options?.method, "PUT");
    assert.deepEqual(JSON.parse(calls[0].options?.body as string), { positions, annotations: [] });
  });
});
test("rename and default PATCH never send coordinates", async () => {
  await mockedFetch(() => json(metadata), async (calls) => {
    await updateLayout(7, { name: "Work" });
    await updateLayout(7, { is_default: true });
    assert.equal(calls[0].options?.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].options?.body as string), { name: "Work" });
    assert.deepEqual(JSON.parse(calls[1].options?.body as string), { is_default: true });
  });
});
test("successful DELETE handles empty 204 response", async () => {
  await mockedFetch(() => new Response(null, { status: 204 }), async (calls) => {
    assert.equal(await deleteLayout(7), undefined);
    assert.equal(calls[0].url, "/api/layouts/7");
    assert.equal(calls[0].options?.method, "DELETE");
  });
});
test("server validation and conflict messages reach the user", async () => {
  await mockedFetch(() => json({ detail: "A layout with this name already exists" }, 409), async () => {
    await assert.rejects(updateLayout(7, { name: "Main" }), /already exists/);
  });
  await mockedFetch(() => json({ detail: [{ msg: "Invalid name" }] }, 422), async () => {
    await assert.rejects(createLayout("", positions), /Invalid name/);
  });
});
test("non-JSON errors produce an understandable failure", async () => {
  await mockedFetch(() => new Response("Unavailable", { status: 503 }), async () => {
    await assert.rejects(fetchLayout(7), /503/);
  });
});
test("startup GET forwards the cancellation signal", async () => {
  const controller = new AbortController();
  await mockedFetch(() => json([metadata]), async (calls) => {
    await fetchLayouts(controller.signal);
    assert.equal(calls[0].options?.signal, controller.signal);
  });
});

test("create and save send annotations as part of the same workspace snapshot", async () => {
  const { rectangle, text } = await import("./annotationFixtures.ts");
  const annotations = [rectangle, text];
  await mockedFetch(() => json({ ...metadata, positions, annotations }), async (calls) => {
    assert.deepEqual((await createLayout("Annotated", positions, annotations)).annotations, annotations);
    assert.deepEqual((await saveLayout(7, positions, annotations)).annotations, annotations);
    assert.deepEqual(JSON.parse(calls[0].options?.body as string), { name: "Annotated", positions, annotations });
    assert.deepEqual(JSON.parse(calls[1].options?.body as string), { positions, annotations });
    assert.equal(calls[1].url, "/api/layouts/7/workspace");
  });
});

test("invalid outgoing annotations never send a partial workspace", async () => {
  const { rectangle } = await import("./annotationFixtures.ts");
  await mockedFetch(() => json({ ...metadata, positions, annotations: [] }), async (calls) => {
    await assert.rejects(saveLayout(7, positions, [{ ...rectangle, x: Infinity }]), /Invalid/);
    await assert.rejects(createLayout("Bad", positions, [rectangle, rectangle]), /Duplicate/);
    assert.equal(calls.length, 0);
  });
});

test("malformed server annotations reject the entire layout load", async () => {
  const { rectangle } = await import("./annotationFixtures.ts");
  await mockedFetch(() => json({ ...metadata, positions, annotations: [rectangle, rectangle] }), async () => {
    await assert.rejects(fetchLayout(7), /Duplicate/);
  });
});

test("an outdated server response reports incomplete data instead of a false annotation limit", async () => {
  await mockedFetch(() => json({ ...metadata, positions }), async () => {
    await assert.rejects(fetchLayout(7), /Layout data is incomplete/);
  });
});
