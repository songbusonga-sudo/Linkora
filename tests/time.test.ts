import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBeijingTime } from "../src/lib/time";

test("publication history is formatted in Beijing time", () => {
  assert.equal(
    formatBeijingTime("2026-09-12 20:17:12"),
    "2026-09-13 04:17:12（北京时间）",
  );
  assert.equal(
    formatBeijingTime("2026-09-12T20:17:12Z"),
    "2026-09-13 04:17:12（北京时间）",
  );
});
