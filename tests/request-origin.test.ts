import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedRequestOrigin } from "../src/lib/request-origin";

const request = (origin: string | null, url = "http://127.0.0.1:8982/api/auth") =>
  new Request(url, { headers: origin === null ? {} : { origin } });

test("local login accepts localhost and loopback IP on the configured port", () => {
  for (const origin of ["http://localhost:8982", "http://127.0.0.1:8982", "http://[::1]:8982"])
    assert.equal(allowedRequestOrigin(request(origin), "http://localhost:8982"), true);
  assert.equal(allowedRequestOrigin(request("http://localhost:8982"), "http://127.0.0.1:8982"), true);
});

test("local aliases do not allow missing, malformed, external or other-port origins", () => {
  for (const origin of [null, "null", "invalid", "http://evil.example:8982",
    "http://localhost.evil.example:8982", "http://localhost:8983",
    "https://localhost:8982", "http://127.0.0.1:8982/path", "http://user@localhost:8982"])
    assert.equal(allowedRequestOrigin(request(origin), "http://localhost:8982"), false);
  assert.equal(allowedRequestOrigin(request("http://127.0.0.1:8982", "http://evil.example:8982/api/auth"), "http://localhost:8982"), false);
});

test("deployed origins remain restricted to the configured origin", () => {
  const configured = "https://linkora.example";
  assert.equal(allowedRequestOrigin(request(configured), configured), true);
  assert.equal(allowedRequestOrigin(request("http://localhost:8982"), configured), false);
  assert.equal(allowedRequestOrigin(request("https://other.example"), configured), false);
  assert.equal(allowedRequestOrigin(request("http://127.0.0.1:8982")), true);
});
