import assert from "node:assert/strict";
import { test } from "node:test";
import { activeLayoutKey, readActiveLayout, writeActiveLayout, removeActiveLayout } from "../src/react-flow/workspacePreferences.ts";
import { selectStartupLayout } from "../src/react-flow/startupLayout.ts";
import type { SavedLayout } from "../src/shared/persistentLayouts.ts";

test("scoped preference round-trip and removal are independent", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  assert.equal(activeLayoutKey("myway:user:1"), "myway:last-active-layout:v1:myway%3Auser%3A1");
  writeActiveLayout("a:b", 7, storage);
  assert.equal(readActiveLayout("a:b", storage), 7);
  assert.equal(readActiveLayout("a%3Ab", storage), null);
  removeActiveLayout("a:b", storage);
  assert.equal(readActiveLayout("a:b", storage), null);
  for (const value of ["", "0", "-1", "1.5", "NaN", "9007199254740992", "1e2", " 1", "null"]) {
    values.set(activeLayoutKey("a:b")!, value);
    assert.equal(readActiveLayout("a:b", storage), null, value);
  }
  writeActiveLayout(null, 7, storage);
  assert.equal(readActiveLayout(null, storage), null);
});

test("storage exceptions and unavailable scope never escape", () => {
  const fail = () => { throw new Error("blocked"); };
  const storage = { getItem: fail, setItem: fail, removeItem: fail };
  assert.equal(readActiveLayout("user", storage), null);
  writeActiveLayout("user", 1, storage);
  removeActiveLayout("user", storage);
  assert.equal(activeLayoutKey(null), null);
  assert.equal(activeLayoutKey(""), null);
});

test("startup chooses remembered, default, then server ordering and composes stale notices", () => {
  const owned = [{ id: 1, name: "A", is_default: true }, { id: 2, name: "B", is_default: false }] as SavedLayout[];
  assert.equal(selectStartupLayout(owned, 2).layout?.id, 2);
  assert.equal(selectStartupLayout(owned, null).layout?.id, 1);
  assert.match(selectStartupLayout(owned, 99).notice, /unavailable/);
  const first = selectStartupLayout([owned[1]], 99);
  assert.equal(first.layout?.id, 2);
  assert.match(first.notice, /No default/);
  assert.equal(selectStartupLayout([], 99).stale, true);
  assert.equal(selectStartupLayout([], null).layout, null);
});
