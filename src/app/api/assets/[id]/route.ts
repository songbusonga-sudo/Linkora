import { db } from "@/lib/db";
import { readFile } from "node:fs/promises";
import { isAdmin } from "@/lib/auth";
import { published } from "@/lib/db";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db.prepare("SELECT * FROM assets WHERE id=?").get(id);
  if (!row) return new Response(null, { status: 404 });
  const src = row.src as string;
  let publicAsset = published().some((t) => JSON.stringify(t).includes(src));
  if (!publicAsset) {
    publicAsset = db
      .prepare("SELECT snapshot FROM versions")
      .all()
      .some((r) => (r.snapshot as string).includes(src));
  }
  if (!publicAsset && !(await isAdmin()))
    return new Response(null, { status: 404 });
  return new Response(await readFile(row.path as string), {
    headers: {
      "Content-Type": row.mime as string,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
