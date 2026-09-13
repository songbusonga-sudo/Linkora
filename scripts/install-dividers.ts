// Update the local supplied template without rewriting historical snapshots.
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { Template, templateSchema, validateTemplate } from "../src/lib/model";

const additions = JSON.parse(
  readFileSync("public/private-assets/dividers.json", "utf8"),
);
function upgrade(template: Template): Template {
  if (template.options.some((option) => option.id === "dividers"))
    return template;
  const next = structuredClone(template);
  const index = next.nodes.findIndex(
    (node) => node.id === "4" && node.src === "/private-assets/layer-4.png",
  );
  if (index < 0) throw Error("未找到原始分割线，无法自动升级此模板");
  if (
    next.options.some((option) =>
      option.choices.some((choice) => choice.nodeIds.includes("4")),
    )
  )
    throw Error("原分割线已有自定义选项，请通过后台调整");
  next.nodes.splice(index, 1, ...additions.nodes);
  next.options.push(additions.option);
  return validateTemplate(templateSchema.parse(next));
}

const seed = upgrade(
  templateSchema.parse(JSON.parse(readFileSync("data/seed.json", "utf8"))),
);
db.exec("BEGIN IMMEDIATE");
try {
  const row = db
    .prepare("SELECT draft,published FROM templates WHERE id='starlight'")
    .get();
  if (!row) throw Error("未找到星光模板");
  const draft = upgrade(JSON.parse(row.draft as string));
  let version = row.published;
  if (version) {
    const prior = db
      .prepare(
        "SELECT snapshot FROM versions WHERE template_id='starlight' AND version=?",
      )
      .get(version);
    const current = JSON.parse(prior!.snapshot as string) as Template;
    if (!current.options.some((option) => option.id === "dividers")) {
      if (current.verified)
        throw Error("已验收模板需通过后台发布；此脚本仅升级本地预览模板");
      const updated = upgrade(current);
      version =
        Number(
          db
            .prepare(
              "SELECT MAX(version) AS v FROM versions WHERE template_id='starlight'",
            )
            .get()!.v,
        ) + 1;
      updated.version = Number(version);
      db.prepare(
        "INSERT INTO versions(template_id,version,snapshot) VALUES('starlight',?,?)",
      ).run(version, JSON.stringify(updated));
    }
  }
  if (JSON.stringify(draft) !== row.draft || version !== row.published) {
    draft.version = Number(version ?? draft.version);
    db.prepare(
      "UPDATE templates SET draft=?,published=?,revision=revision+1 WHERE id='starlight'",
    ).run(JSON.stringify(draft), version);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
writeFileSync("data/seed.json", JSON.stringify(seed, null, 2) + "\n");
console.log("已安装 73 款分割线，保留旧版本及其他模板设置。");
