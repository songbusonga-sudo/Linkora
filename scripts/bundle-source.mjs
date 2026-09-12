import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync(".local", { recursive: true });
// Explicit allowlist: no templates, fonts, database, user images, environment or credentials.
execFileSync("python", ["scripts/bundle-source.py"], { stdio: "inherit" });
console.log("Corresponding source: .local/linkora-source.zip");
