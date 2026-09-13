import { cookies } from "next/headers";
import {
  createHash,
  scryptSync,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import { db } from "./db";
import { allowedRequestOrigin } from "./request-origin";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function isAdmin() {
  const token = (await cookies()).get("linkora_session")?.value;
  if (!token) return false;
  const row = db
    .prepare("SELECT expires FROM sessions WHERE token=?")
    .get(digest(token));
  return !!row && Number(row.expires) > Date.now();
}
export function sameOrigin(req: Request) {
  return allowedRequestOrigin(req, process.env.APP_ORIGIN);
}
export function passwordValid(password: string) {
  const value = process.env.ADMIN_PASSWORD_HASH;
  if (!value) return false;
  const [salt, hex] = value.split(":");
  if (!salt || !hex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function newSession() {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO sessions(token,expires) VALUES(?,?)").run(
    digest(token),
    Date.now() + 8 * 3600000,
  );
  (await cookies()).set("linkora_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.APP_ORIGIN?.startsWith("https:") ?? false,
    path: "/",
    maxAge: 8 * 3600,
  });
}
