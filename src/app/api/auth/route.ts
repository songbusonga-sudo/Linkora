import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  digest,
  isAdmin,
  newSession,
  passwordValid,
  sameOrigin,
} from "@/lib/auth";
export async function GET() {
  return NextResponse.json({
    authenticated: await isAdmin(),
    configured: !!process.env.ADMIN_PASSWORD_HASH,
  });
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const key = "admin-login";
  const now = Date.now();
  const attempt = db
    .prepare("SELECT count,until FROM attempts WHERE key=?")
    .get(key);
  if (attempt && Number(attempt.until) > now && Number(attempt.count) >= 10)
    return NextResponse.json(
      { error: "尝试过多，请 15 分钟后重试" },
      { status: 429 },
    );
  let password;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !passwordValid(password)
  ) {
    const active = attempt && Number(attempt.until) > now;
    db.prepare(
      "INSERT OR REPLACE INTO attempts(key,count,until) VALUES(?,?,?)",
    ).run(
      key,
      active ? Number(attempt.count) + 1 : 1,
      active ? Number(attempt.until) : now + 900000,
    );
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }
  db.prepare("DELETE FROM attempts WHERE key=?").run(key);
  await newSession();
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  const token = (await cookies()).get("linkora_session")?.value;
  if (token)
    db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
  (await cookies()).delete("linkora_session");
  return NextResponse.json({ ok: true });
}
