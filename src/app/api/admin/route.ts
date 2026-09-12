import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { isAdmin, sameOrigin } from "@/lib/auth";
import { db, publish, saveDraft, snapshot } from "@/lib/db";
import { templateSchema, Template, validateTemplate } from "@/lib/model";
export const dynamic = "force-dynamic";
function checkAssets(t: Template) {
  const sources = new Set<string>();
  if (existsSync("data/seed.json")) {
    const seed = JSON.parse(readFileSync("data/seed.json", "utf8")) as Template;
    for (const n of seed.nodes) sources.add(n.src);
    sources.add(seed.cover);
    sources.add(seed.font);
  }
  for (const row of db.prepare("SELECT src FROM assets").all())
    sources.add(row.src as string);
  if (existsSync("public/private-assets/layers.json")) {
    const layers = JSON.parse(
      readFileSync("public/private-assets/layers.json", "utf8"),
    ).layers;
    for (const l of layers)
      if (existsSync(`public/private-assets/layer-${l.id}.png`))
        sources.add(`/private-assets/layer-${l.id}.png`);
  }
  for (const src of [
    t.cover,
    t.font,
    ...t.nodes.map((n) => n.src),
    ...t.assets.map((a) => a.src),
  ])
    if (!sources.has(src)) throw Error("模板引用了未登记素材");
}
export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({
    templates: db
      .prepare("SELECT * FROM templates")
      .all()
      .map((r) => ({
        ...r,
        draft: (() => {
          const t = JSON.parse(r.draft as string);
          t.nodes = t.nodes.map((n: Template["nodes"][number]) => ({
            ...n,
            originalText: n.originalText ?? n.defaultText,
          }));
          return t;
        })(),
      })),
    versions: db
      .prepare(
        "SELECT template_id,version,created FROM versions ORDER BY version DESC",
      )
      .all(),
    assets: db
      .prepare("SELECT id,name,src,category,distributable FROM assets")
      .all(),
    layers: existsSync("public/private-assets/layers.json")
      ? JSON.parse(readFileSync("public/private-assets/layers.json", "utf8"))
          .layers
      : [],
  });
}
export async function POST(req: Request) {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!sameOrigin(req))
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    if (Number(req.headers.get("content-length")) > 2000000)
      throw Error("配置过大");
    const body = await req.json();
    if (body.action === "save") {
      const t = validateTemplate(templateSchema.parse(body.template));
      checkAssets(t);
      saveDraft(t, body.revision);
    } else if (body.action === "publish") {
      const row = db
        .prepare("SELECT draft FROM templates WHERE id=?")
        .get(body.id);
      if (!row) throw Error("模板不存在");
      checkAssets(templateSchema.parse(JSON.parse(row.draft as string)));
      publish(body.id, body.revision);
    } else if (body.action === "copy" || body.action === "create") {
      const row = db
        .prepare("SELECT draft FROM templates WHERE id=?")
        .get(body.id);
      if (!row) throw Error("请选择一个现有 PSD 模板作为基础");
      const t = JSON.parse(row.draft as string) as Template;
      t.id = "template-" + randomUUID();
      t.name = body.action === "copy" ? t.name + " 副本" : "未命名模板";
      t.version = 1;
      t.verified = false;
      db.prepare("INSERT INTO templates(id,draft) VALUES(?,?)").run(
        t.id,
        JSON.stringify(t),
      );
    } else if (body.action === "restore") {
      const t = snapshot(body.id, Number(body.version));
      if (!t) throw Error("历史版本不存在");
      saveDraft(t, body.revision);
    } else throw Error("操作无效");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 400 },
    );
  }
}
