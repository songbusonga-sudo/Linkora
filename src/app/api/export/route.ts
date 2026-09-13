import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_EXPORT_BYTES = 30 * 1024 * 1024;
const EXPORT_LIFETIME_MS = 24 * 60 * 60 * 1000;

function exportDirectory() {
  return path.resolve(process.env.LINKORA_DATA_DIR || "data", "exports");
}

async function removeExpiredExports(dir: string) {
  const cutoff = Date.now() - EXPORT_LIFETIME_MS;
  const files = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    files
      .filter((file) => file.isFile() && /^[a-f0-9-]{36}\.png$/i.test(file.name))
      .map(async (file) => {
        const target = path.join(dir, file.name);
        try {
          if ((await stat(target)).mtimeMs < cutoff) await unlink(target);
        } catch {
          // A concurrent cleanup may have already removed this temporary image.
        }
      }),
  );
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    if (Number(req.headers.get("content-length")) > MAX_EXPORT_BYTES)
      throw Error("导出图片最大 30 MB");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_EXPORT_BYTES)
      throw Error("导出图片最大 30 MB");
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw Error("导出图片格式无效");

    const dir = exportDirectory();
    await mkdir(dir, { recursive: true });
    void removeExpiredExports(dir);
    const id = randomUUID();
    await writeFile(path.join(dir, `${id}.png`), bytes, { flag: "wx" });
    return Response.json({ url: `/api/export/${id}.png` });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导出图片保存失败" },
      { status: 400 },
    );
  }
}
