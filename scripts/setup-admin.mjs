import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
if (existsSync(".env.local")) {
  console.log(
    "Existing .env.local preserved. Edit it explicitly to rotate credentials.",
  );
  process.exit(0);
}
const password = randomBytes(18).toString("base64url"),
  salt = randomBytes(16).toString("hex");
writeFileSync(
  ".env.local",
  `ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString("hex")}\nAPP_ORIGIN=http://localhost:8982\n`,
);
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/admin-access.txt",
  `Linkora local administrator\nURL: http://localhost:8982/admin\nPassword: ${password}\n\nDo not publish or commit this file.\n`,
);
console.log("Admin configured. Local credentials: .local/admin-access.txt");
