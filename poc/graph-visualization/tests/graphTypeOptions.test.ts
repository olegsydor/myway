import assert from "node:assert/strict";
import test from "node:test";
import { graphTypeOptions } from "../src/react-flow/graphTypeOptions.ts";

test("graph filters follow dictionary order and only show types in the graph", () => {
  const dictionary = [{ code: "person" }, { code: "place" }, { code: "organization" }, { code: "skill" }];
  const records = ["skill", "organization", "person", "person"].map((type) => ({ type }));
  assert.deepEqual(graphTypeOptions(records, dictionary), ["person", "organization", "skill"]);
});

test("graph filters keep a deterministic fallback while dictionaries load", () => {
  const records = ["custom_z", "works_at", "knows", "custom_a"].map((type) => ({ type }));
  assert.deepEqual(graphTypeOptions(records, [{ code: "knows" }, { code: "works_at" }]), [
    "knows", "works_at", "custom_a", "custom_z",
  ]);
  assert.deepEqual(graphTypeOptions(records, []), ["custom_a", "custom_z", "knows", "works_at"]);
});
