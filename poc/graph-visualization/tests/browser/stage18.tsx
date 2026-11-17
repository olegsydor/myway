// Manual UI fixture: all /api requests stay in this tab. No application DB access.
import { createRoot } from "react-dom/client";
import { ReactFlowGraph } from "../../src/react-flow/ReactFlowGraph";
import { deleteLayoutRecovery } from "../../src/react-flow/layoutRecoveryStorage";
import type { GraphResponse } from "../../src/shared/types";
import type { LayoutDetail } from "../../src/shared/persistentLayouts";
import "../../src/index.css";
import "../../src/App.css";

const key = "myway-stage18-visual-fixture-v2" + location.search;
const scope = "myway:stage18-visual-fixture-v2" + location.search;
const stamp = "2026-10-27T00:00:00Z";
const types = ['person', 'organization', 'skill', 'place', 'event', 'project', 'hobby', 'story'];
const count = new URLSearchParams(location.search).get('dense') === '1' ? 500 : 16;
const labels = ['Минка Валерій', 'Вітафол', 'Дослідження', 'Київ', 'Зустріч', 'My Way', 'music', 'Історія з довгою назвою для перевірки'];
const graph: GraphResponse = {
  user_id: 1,
  nodes: Array.from({ length: count }, (_, index) => ({ id: index + 1,
    type: types[index % types.length], label: labels[index % labels.length] + (index >= 16 ? ` ${index + 1}` : ''),
    description: index === 1 ? 'аптека' : 'Isolated visual review sample', attributes: { started: 1989 } })),
  edges: Array.from({ length: count - 1 }, (_, index) => ({ id: index + 1,
    source: index + 1, target: index + 2, type: 'leads_to', description: 'Example relationship', attributes: {} })),
  meta: { nodes_count: count, edges_count: count - 1 },
};
const seed: LayoutDetail[] = [1, 2].map((id) => ({ id, name: id === 1 ? "Fixture Main" : "Fixture Other",
  is_default: id === 1, created_at: stamp, updated_at: stamp,
  positions: graph.nodes.map((node, index) => ({ node_id: node.id,
    x: (index % (count > 16 ? 25 : 4)) * 240, y: Math.floor(index / (count > 16 ? 25 : 4)) * 140 + 70 })),
  annotations: new URLSearchParams(location.search).has('overlap') ? (
    new URLSearchParams(location.search).get('overlap') === 'reverse' ? [
      { id: '00000000-0000-4000-8000-000000000003', kind: 'rectangle', x: 50, y: 70, width: 600, height: 300, color: 'red', fill: 'light', border: 'normal' },
      { id: '00000000-0000-4000-8000-000000000001', kind: 'rectangle', x: 200, y: 160, width: 300, height: 120, color: 'blue', fill: 'light', border: 'normal' },
    ] : [
      { id: '00000000-0000-4000-8000-000000000001', kind: 'rectangle', x: 200, y: 160, width: 300, height: 120, color: 'blue', fill: 'light', border: 'normal' },
      { id: '00000000-0000-4000-8000-000000000003', kind: 'rectangle', x: 50, y: 70, width: 600, height: 300, color: 'red', fill: 'light', border: 'normal' },
    ]
  ) : [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'rectangle', x: -30, y: 15, width: 940, height: 285, color: 'blue', fill: 'light', border: 'thin' },
    { id: '00000000-0000-4000-8000-000000000002', kind: 'text', x: -10, y: 160, text: '1998 рік', color: 'gray', size: 'medium' },
  ],
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
  if (path === "/node-types") return json(types.map((code, index) => ({ id: index + 1, code, name: code })));
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
    <header style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", background: "#dbeafe" }}>
      <strong>Stage 18 isolated UI fixture</strong>
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
