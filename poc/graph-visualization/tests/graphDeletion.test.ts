import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraphDeletionController, describeDeletion, ordinaryDeleteIdentity, EMPTY_DELETE_STATE, type DeleteState } from "../src/react-flow/graphDeletion.ts";
import type { GraphResponse } from "../src/shared/types.ts";

const graph: GraphResponse = { user_id: 1, meta: {nodes_count:3, edges_count:1},
  nodes: [1,2,3].map(id => ({ id, type:"person", label:`Node ${id}`, description:null, attributes:{} })),
  edges: [{ id:10, source:1, target:2, type:"works at", description:null, attributes:{} }] };
function harness() {
  let loaded = structuredClone(graph);
  let state: DeleteState = EMPTY_DELETE_STATE;
  let available = true;
  const calls: unknown[] = [];
  let remove = async () => {};
  let refresh = async () => {};
  const controller = createGraphDeletionController({
    graph: () => loaded, available: () => available,
    onState: next => {state = next;}, onMessage: message => calls.push(["message",message]),
    onBusy: (busy, target) => calls.push(["busy",busy,target.kind]),
    remove: async target => {calls.push(["remove",target.kind,target.id]); await remove();},
    refresh: async () => {calls.push(["refresh"]); await refresh();},
    onDeleted: target => calls.push(["deleted",target.kind,target.id]),
  });
  return {controller, calls, get state() {return state;},
    setGraph: (next: GraphResponse) => {loaded = next;},
    setAvailable: (next: boolean) => {available = next;},
    setRemove: (next: () => Promise<void>) => {remove = next;},
    setRefresh: (next: () => Promise<void>) => {refresh = next;},
  };
}
test("ordinary selection requires one visible current element and excludes remembered/highlighted targets", () => {
  const node = {id:"n-3", selected:true};
  const edge = {id:"e-10", selected:true};
  assert.deepEqual(ordinaryDeleteIdentity([node],[],false,"n-3"),{kind:"node",id:3});
  assert.deepEqual(ordinaryDeleteIdentity([],[edge],false,"e-10"),{kind:"edge",id:10});
  for (const special of [true,false]) {
    assert.equal(ordinaryDeleteIdentity([node],[edge],special,"n-3"),null);
    assert.equal(ordinaryDeleteIdentity([],[],special,"n-3"),null);
  }
  assert.equal(ordinaryDeleteIdentity([node],[],true,"n-3"),null);
  assert.equal(ordinaryDeleteIdentity([node],[],false,null),null);
  assert.equal(ordinaryDeleteIdentity([node],[],false,"n-1"),null);
  assert.equal(ordinaryDeleteIdentity([{...node,hidden:true}],[],false,"n-3"),null);
  assert.equal(ordinaryDeleteIdentity([node,{id:"n-1",selected:true,hidden:true}],[],false,"n-3"),null);
});
test("canonical incident edges block incoming and outgoing node deletion", () => {
  for (const id of [1,2]) {
    const target = describeDeletion(graph,{kind:"node",id});
    assert.equal(target?.blocked,true);
    assert.match(target!.description,/connected/);
  }
  assert.equal(describeDeletion(graph,{kind:"node",id:3})?.blocked,false);
  assert.equal(describeDeletion(graph,{kind:"node",id:99}),null);
});
test("edge confirmation names type and canonical endpoints", () => {
  assert.equal(describeDeletion(graph,{kind:"edge",id:10})?.description,
    'Delete edge “works at” from “Node 1” to “Node 2”? This cannot be undone.');
});
test("open and cancel preserve selection by never invoking mutation or success callbacks", () => {
  const h = harness();
  h.controller.open({kind:"node",id:3});
  assert.match(h.state.target!.description,/Node 3/);
  assert.deepEqual(h.calls,[]);
  h.controller.cancel();
  assert.equal(h.state.target,null);
  assert.deepEqual(h.calls,[]);
});
test("connected-node dialog has no mutation even if confirm is called", async () => {
  const h = harness();
  h.controller.open({kind:"node",id:1});
  await h.controller.confirm();
  assert.equal(h.state.target?.blocked,true);
  assert.deepEqual(h.calls,[]);
});
test("confirmation rechecks incident edges added since opening", async () => {
  const h = harness();
  h.controller.open({kind:"node",id:3});
  h.setGraph({...graph,edges:[...graph.edges,{...graph.edges[0],id:11,target:3}]});
  await h.controller.confirm();
  assert.equal(h.state.target?.blocked,true);
  assert.deepEqual(h.calls,[]);
});
for (const target of [{kind:"node" as const,id:3},{kind:"edge" as const,id:10}]) {
  test(`confirmed ${target.kind} deletion uses only its own API and refreshes`, async () => {
    const h = harness();
    h.controller.open(target);
    await h.controller.confirm();
    assert.deepEqual(h.calls.slice(0,4),[["busy",true,target.kind],["remove",target.kind,target.id],
      ["deleted",target.kind,target.id],["refresh"]]);
    assert.equal(h.state.target,null);
    assert.deepEqual(h.calls.at(-1),["busy",false,target.kind]);
  });
}
test("synchronous busy lock blocks duplicate confirmation, cancel and target replacement", async () => {
  const h = harness();
  let finish!: () => void;
  h.setRemove(() => new Promise<void>(resolve => {finish = resolve;}));
  h.controller.open({kind:"node",id:3});
  const first = h.controller.confirm();
  await h.controller.confirm();
  h.controller.cancel();
  h.controller.open({kind:"edge",id:10});
  assert.equal(h.state.busy,true);
  assert.equal(h.state.target?.kind,"node");
  assert.equal(h.calls.filter(call => (call as string[])[0] === "remove").length,1);
  finish(); await first;
});
test("backend node_has_edges conflict preserves target and reports error without refresh", async () => {
  const h = harness();
  h.setRemove(async () => {throw new Error("node_has_edges");});
  h.controller.open({kind:"node",id:3});
  await h.controller.confirm();
  assert.equal(h.state.target?.id,3);
  assert.equal(h.state.deleted,false);
  assert.equal(h.state.busy,false);
  assert.match(h.state.error,/node_has_edges/);
  assert.equal(h.calls.some(call => ["refresh","deleted"].includes((call as string[])[0])),false);
});
test("failed refresh reports server deletion and retry never repeats DELETE", async () => {
  const h = harness();
  h.setRefresh(async () => {throw new Error("offline");});
  h.controller.open({kind:"edge",id:10});
  await h.controller.confirm();
  assert.equal(h.state.deleted,true);
  assert.equal(h.state.busy,false);
  assert.match(h.state.error,/Deletion succeeded.*refresh failed.*offline/);
  await h.controller.confirm();
  h.setRefresh(async () => {});
  await h.controller.retryRefresh();
  assert.equal(h.calls.filter(call => (call as string[])[0] === "remove").length,1);
  assert.equal(h.calls.filter(call => (call as string[])[0] === "refresh").length,2);
  assert.equal(h.state.target,null);
});
test("conflicting layout or CRUD operations prevent opening and confirming", async () => {
  const h = harness(); h.setAvailable(false);
  h.controller.open({kind:"node",id:3});
  assert.equal(h.state.target,null);
  h.setAvailable(true); h.controller.open({kind:"node",id:3});
  h.setAvailable(false); await h.controller.confirm();
  assert.deepEqual(h.calls,[]);
});
test("missing canonical target cannot be deleted", async () => {
  const h = harness(); h.controller.open({kind:"node",id:3});
  h.setGraph({...graph,nodes:graph.nodes.filter(node => node.id !== 3)});
  await h.controller.confirm();
  assert.match(h.state.error,/no longer/);
  assert.deepEqual(h.calls,[]);
});
