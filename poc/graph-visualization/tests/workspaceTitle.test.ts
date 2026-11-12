import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { workspaceTitle } from "../src/react-flow/useWorkspaceTitle.ts";

test("base HTML and loading/error titles use My Way", () => {
  assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /<title>My Way<\/title>/);
  assert.equal(workspaceTitle("Layout B", true, false), "My Way");
  assert.equal(workspaceTitle(null, false, true), "My Way — Unsaved layout *");
  assert.equal(workspaceTitle("", false, true), "My Way — ");
});
