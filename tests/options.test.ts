import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedChoice } from "../src/lib/model";

test("single selection uses layer IDs even when PSD layer names are duplicated", () => {
  const option = {
    id: "dividers", name: "分割线", defaultId: "3-71",
    choices: [
      { id: "3-71", name: "72", nodeIds: ["3-71"] },
      { id: "3-72", name: "72", nodeIds: ["3-72"] },
    ],
  };
  assert.deepEqual(selectedChoice(option, "3-72").nodeIds, ["3-72"]);
  assert.deepEqual(selectedChoice(option).nodeIds, ["3-71"]);
  assert.deepEqual(selectedChoice(option, "removed-choice").nodeIds, ["3-71"]);
});
