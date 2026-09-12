import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { isAdmin, sameOrigin } from "@/lib/auth";
export async function PATCH(req: Request) {
  if (!(await isAdmin()) || !sameOrigin(req))
    return new Response(null, { status: 403 });
  try {
    const { id, name, distributable } = await req.json();
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      typeof distributable !== "boolean"
    )
      throw Error("素材信息无效");
    const result = db
      .prepare("UPDATE assets SET name=?,distributable=? WHERE id=?")
      .run(name.trim(), distributable ? 1 : 0, id);
    if (!result.changes) throw Error("素材不存在");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function DELETE(req: Request) {
  if (!(await isAdmin()) || !sameOrigin(req))
    return new Response(null, { status: 403 });
  try {
    const { id } = await req.json();
    if (typeof id !== "string") throw Error("素材标识无效");
    const row = db.prepare("SELECT src,path FROM assets WHERE id=?").get(id);
    if (!row) throw Error("素材不存在");
    const src = row.src as string;
    const used = db
      .prepare(
        "SELECT draft AS data FROM templates UNION ALL SELECT snapshot AS data FROM versions",
      )
      .all()
      .some((r) => (r.data as string).includes(src));
    if (used) throw Error("素材仍被草稿或历史版本引用，不能删除");
    await unlink(row.path as string);
    db.prepare("DELETE FROM assets WHERE id=?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function POST(req: Request) {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    if (Number(req.headers.get("content-length")) > 21 * 1024 * 1024)
      throw Error("素材最大 20 MB");
    const form = await req.formData();
    const file = form.get("file");
    const category = String(form.get("category"));
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024)
      throw Error("素材最大 20 MB");
    if (
      ![
        "background",
        "avatar",
        "rewardAvatar",
        "rewardIcon",
        "decoration",
        "font",
      ].includes(category)
    )
      throw Error("素材分类无效");
    const bytes = Buffer.from(await file.arrayBuffer());
    let ext = "",
      mime = "";
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      ext = "png";
      mime = "image/png";
    } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      ext = "jpg";
      mime = "image/jpeg";
    } else if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
      ext = "webp";
      mime = "image/webp";
    } else if (
      category === "font" &&
      (bytes.readUInt32BE(0) === 0x00010000 ||
        bytes.toString("ascii", 0, 4) === "OTTO")
    ) {
      ext = bytes.toString("ascii", 0, 4) === "OTTO" ? "otf" : "ttf";
      mime = "font/" + ext;
    } else throw Error("支持 PNG、JPG、WebP；字体支持 TTF、OTF");
    if (category === "font" && !mime.startsWith("font/"))
      throw Error("请上传字体文件");
    if (category !== "font" && !mime.startsWith("image/"))
      throw Error("请上传图片");
    const id = randomUUID() + "." + ext,
      dir = path.join(process.env.LINKORA_DATA_DIR || "data", "assets");
    await mkdir(dir, { recursive: true });
    const target = path.resolve(dir, id);
    await writeFile(target, bytes, { flag: "wx" });
    db.prepare(
      "INSERT INTO assets(id,name,src,category,distributable,mime,path) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id,
      file.name.slice(0, 100),
      "/api/assets/" + id,
      category,
      form.get("distributable") === "true" ? 1 : 0,
      mime,
      target,
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 400 },
    );
  }
}
