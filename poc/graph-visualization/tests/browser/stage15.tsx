// Manual UI fixture: all /api requests stay in this tab. No application DB access.
import { createRoot } from "react-dom/client";
import { ReactFlowGraph } from "../../src/react-flow/ReactFlowGraph";
import { deleteLayoutRecovery } from "../../src/react-flow/layoutRecoveryStorage";
import type { GraphResponse } from "../../src/shared/types";
import type { LayoutDetail } from "../../src/shared/persistentLayouts";
import "../../src/index.css";
import "../../src/App.css";

const key = "myway-stage15-isolated-fixture";
const scope = "myway:stage15-isolated-fixture";
const stamp = "2026-10-27T00:00:00Z";
const graph: GraphResponse = { user_id: 1, nodes: [
  { id: 1, type: "project", label: "Plan", description: null, attributes: {} },
  { id: 2, type: "project", label: "Build", description: null, attributes: {} },
], edges: [{ id: 1, source: 1, target: 2, type: "leads_to", description: null, attributes: {} }], meta: { nodes_count: 2, edges_count: 1 } };
const seed: LayoutDetail[] = [1, 2].map((id) => ({ id, name: id === 1 ? "Fixture Main" : "Fixture Other",
  is_default: id === 1, created_at: stamp, updated_at: stamp,
  positions: [{ node_id: 1, x: 0, y: 80 }, { node_id: 2, x: 260, y: 80 }], annotations: [],
}));
let layouts: LayoutDetail[] = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(seed));
let failSave = false;
let failLoad = false;
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
const persist = () => localStorage.setItem(key, JSON.stringify(layouts));
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  const path = url.pathname.slice(4), method = init?.method ?? "GET";
  if (path === "/node-types") return json([{ id: 1, code: "project", name: "Project" }]);
  if (path === "/edge-types") return json([{ id: 1, code: "leads_to", name: "Leads to" }]);
  if (path === "/graph") return json(graph);
  if (path === "/layouts" && method === "GET") return json(layouts.map(({ positions: _positions, annotations: _annotations, ...metadata }) => metadata));
  if (path === "/layouts" && method === "POST") {
    if (failSave) return json({ detail: "Fixture save failure" }, 503);
    const layout = { ...seed[0], ...JSON.parse(String(init?.body)), id: Math.max(...layouts.map((item) => item.id)) + 1, is_default: false };
    layouts.push(layout); persist(); return json(layout, 201);
  }
  const match = /^\/layouts\/(\d+)(\/workspace)?$/.exec(path);
  if (match) {
    const id = Number(match[1]), layout = layouts.find((item) => item.id === id);
    if (!layout) return json({ detail: "Fixture layout not found" }, 404);
    if (method === "GET") return failLoad ? json({ detail: "Fixture destination load failure" }, 503) : json(layout);
    if (method === "PUT" && match[2]) {
      if (failSave) return json({ detail: "Fixture save failure" }, 503);
      Object.assign(layout, JSON.parse(String(init?.body))); persist(); return json(layout);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body));
      if (patch.is_default) layouts.forEach((item) => { item.is_default = false; });
      Object.assign(layout, patch); persist(); return json(layout);
    }
    if (method === "DELETE") {
      layouts = layouts.filter((item) => item.id !== id); persist(); return Promise.resolve(new Response(null, { status: 204 }));
    }
  }
  // Never fall through to the real application's API, including graph CRUD.
  return json({ detail: `Unsupported fixture request: ${method} ${path}` }, 400);
};

export function Fixture() {
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <header style={{ padding: 8, display: "flex", gap: 16, alignItems: "center", background: "#dbeafe" }}>
      <strong>Stage 15 isolated UI fixture</strong>
      <label><input type="checkbox" onChange={(event) => { failSave = event.target.checked; }} />Fail save</label>
      <label><input type="checkbox" onChange={(event) => { failLoad = event.target.checked; }} />Fail destination load</label>
      <button type="button" onClick={() => void (async () => {
        for (const layout of layouts) await deleteLayoutRecovery(scope, layout.id);
        localStorage.removeItem(key); location.reload();
      })()}>Reset fixture</button>
    </header>
    <ReactFlowGraph graph={graph} recoveryScope={scope} onGraphChanged={async () => undefined} />
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => {
  root.unmount();
});
