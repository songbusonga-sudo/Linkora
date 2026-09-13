import { test } from "node:test";
import assert from "node:assert/strict";
import {
  folderForLayer,
  layersInFolder,
  PsdLayer,
  BACKGROUND_FOLDER,
  withBackgroundFolder,
} from "../src/lib/psd-folders";

const layer = (
  id: string,
  kind: string,
  parent: string,
  name = id,
): PsdLayer => ({
  id,
  name,
  kind,
  parent,
  bbox: [0, 0, 20, 20],
  opacity: 255,
  effectiveVisible: true,
});
const layers = [
  layer("0", "pixel", ""),
  layer("3", "group", "", "素材"),
  layer("3-0", "pixel", "3"),
  layer("7", "group", "", "素材"),
  layer("7-0", "pixel", "7"),
  layer("7-2", "group", "7", "头像"),
  layer("7-2-0", "pixel", "7-2"),
];

test("PSD folders use original parent IDs and keep nested composite layers together", () => {
  const nodes = ["0", "3-0", "7-0", "7-2", "7-2-0"].map((id) => ({ id }));
  assert.deepEqual(
    layersInFolder(nodes, layers, "").map((n) => n.id),
    ["0"],
  );
  assert.deepEqual(
    layersInFolder(nodes, layers, "3").map((n) => n.id),
    ["3-0"],
  );
  assert.deepEqual(
    layersInFolder(nodes, layers, "7").map((n) => n.id),
    ["7-0"],
  );
  assert.deepEqual(
    layersInFolder(nodes, layers, "7-2").map((n) => n.id),
    ["7-2", "7-2-0"],
  );
});
test("derived layers use the nearest PSD folder and unknown layers remain accessible", () => {
  assert.equal(folderForLayer("7-2-derived", layers), "7-2");
  assert.equal(folderForLayer("custom", layers), "");
  assert.equal(folderForLayer("0", []), "");
});

test("background folder groups the replaceable layer without changing PSD sources", () => {
  const nodes = [
    { id: "0", role: "background" },
    { id: "3-0", role: "image" },
  ];
  const grouped = withBackgroundFolder(layers, nodes);
  assert.equal(folderForLayer("0", grouped), BACKGROUND_FOLDER);
  assert.equal(folderForLayer("0", layers), "");
  assert.deepEqual(layersInFolder(nodes, grouped, BACKGROUND_FOLDER), [
    nodes[0],
  ]);
  assert.equal(folderForLayer("3-0", grouped), "3");
  assert.deepEqual(withBackgroundFolder(grouped, nodes), grouped);
  const custom = withBackgroundFolder(
    [],
    [{ id: "custom-bg", role: "background" }],
  );
  assert.equal(folderForLayer("custom-bg", custom), BACKGROUND_FOLDER);
  assert.equal(withBackgroundFolder(layers, []), layers);
});
