import { NextResponse } from "next/server";
import { published, snapshot } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.has("id")) {
    const t = snapshot(q.get("id")!, Number(q.get("version")));
    return NextResponse.json(t ?? { error: "版本不存在" }, {
      status: t ? 200 : 404,
    });
  }
  return NextResponse.json(published());
}
