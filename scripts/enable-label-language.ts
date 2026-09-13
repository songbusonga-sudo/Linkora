import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Template, templateSchema, validateTemplate } from "../src/lib/model";

type Layer = { id: string; name: string; bbox: number[]; opacity: number };
const chinese = ["8-0", "8-1", "8-2"];
const english = ["9-0", "9-3", "9-4"];

export function enableLabelLanguage(template: Template, layers: Layer[]) {
  if (template.options.some((o) => o.id === "label-language")) return template;
  const group = template.nodes.find(
    (n) => n.id === "9" && n.src === "/private-assets/layer-9.png",
  );
  if (!group) return template;
  if (
    template.options.some((o) =>
      o.choices.some((c) => c.nodeIds.includes(group.id)),
    )
  )
    throw Error("字母图层已有选项关联，请先在后台整理该选项");
  const replacement = [...chinese, "9-0", "9-1", "9-2", "9-3", "9-4"].map(
    (id) => {
      const layer = layers.find((l) => l.id === id);
      if (!layer) throw Error(`缺少 PSD 图层 ${id}`);
      const [x, y, right, bottom] = layer.bbox;
      return {
        ...group,
        id,
        name: layer.name,
        src: `/private-assets/layer-${id}.png`,
        x,
        y,
        width: right - x,
        height: bottom - y,
        opacity: (group.opacity * layer.opacity) / 255,
        visible: !chinese.includes(id) && group.visible,
      };
    },
  );
  return validateTemplate(
    templateSchema.parse({
      ...template,
      nodes: template.nodes.flatMap((n) => (n === group ? replacement : [n])),
      options: [
        ...template.options,
        {
          id: "label-language",
          name: "二维码下方文字",
          defaultId: "en",
          choices: [
            { id: "zh", name: "中文", nodeIds: chinese },
            { id: "en", name: "英文", nodeIds: english },
          ],
        },
      ],
    }),
  );
}

// Upgrade the existing local template without rewriting historical snapshots.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const root = process.env.LINKORA_DATA_DIR || path.resolve("data");
  const layers: Layer[] = JSON.parse(
    readFileSync("public/private-assets/layers.json", "utf8"),
  ).layers;
  for (const id of [...chinese, "9-0", "9-1", "9-2", "9-3", "9-4"])
    if (!existsSync(`public/private-assets/layer-${id}.png`))
      throw Error(`缺少图层图片 ${id}`);
  const database = new DatabaseSync(path.join(root, "linkora.sqlite"));
  database.exec("PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
  let updated = 0;
  try {
    const rows = database
      .prepare("SELECT id,draft,published FROM templates")
      .all();
    for (const row of rows) {
      const draft = templateSchema.parse(JSON.parse(row.draft as string));
      const nextDraft = enableLabelLanguage(draft, layers);
      let nextVersion = row.published;
      if (row.published !== null) {
        const record = database
          .prepare(
            "SELECT snapshot FROM versions WHERE template_id=? AND version=?",
          )
          .get(row.id, row.published)!;
        const current = templateSchema.parse(
          JSON.parse(record.snapshot as string),
        );
        const next = enableLabelLanguage(current, layers);
        if (next !== current) {
          const last = database
            .prepare(
              "SELECT MAX(version) AS version FROM versions WHERE template_id=?",
            )
            .get(row.id)!;
          next.version = Number(last.version) + 1;
          nextVersion = next.version;
          database
            .prepare(
              "INSERT INTO versions(template_id,version,snapshot) VALUES(?,?,?)",
            )
            .run(row.id, next.version, JSON.stringify(next));
        }
      }
      if (nextDraft !== draft || nextVersion !== row.published) {
        if (nextVersion !== row.published)
          nextDraft.version = Number(nextVersion);
        database
          .prepare(
            "UPDATE templates SET draft=?,published=?,revision=revision+1 WHERE id=?",
          )
          .run(JSON.stringify(nextDraft), nextVersion, row.id);
        updated++;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
  const seedPath = path.join(root, "seed.json");
  if (existsSync(seedPath)) {
    const seed = templateSchema.parse(
      JSON.parse(readFileSync(seedPath, "utf8")),
    );
    const next = enableLabelLanguage(seed, layers);
    if (next !== seed)
      writeFileSync(seedPath, JSON.stringify(next, null, 2) + "\n");
  }
  console.log(`已为 ${updated} 个模板启用中英文单选，历史版本已保留。`);
}
