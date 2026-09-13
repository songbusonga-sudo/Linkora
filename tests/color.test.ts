import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex } from "../src/lib/color";

test("color conversion preserves precise RGB values and grayscale endpoints", () => {
  for (const hex of [
    "#000000",
    "#ffffff",
    "#a0a0a0",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#edb6be",
    "#adc5d9",
    "#123456",
  ])
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  assert.deepEqual(hexToHsv("#a0a0a0"), { h: 0, s: 0, v: (160 / 255) * 100 });
  assert.equal(hsvToHex({ h: 360, s: 100, v: 100 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), "#00ff00");
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), "#0000ff");
});
