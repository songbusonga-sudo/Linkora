import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { templateSchema, Template, validateTemplate } from "./model";
import { editableFooter } from "./template-upgrades";
const root = process.env.LINKORA_DATA_DIR || path.join(process.cwd(), "data");
mkdirSync(root, { recursive: true });
const globalDb = globalThis as unknown as { linkoraDb?: DatabaseSync };
export const db =
  globalDb.linkoraDb ?? new DatabaseSync(path.join(root, "linkora.sqlite"));
globalDb.linkoraDb = db;
db.exec("PRAGMA busy_timeout=10000");
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,draft TEXT NOT NULL,published INTEGER,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS versions(template_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(template_id,version));
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,src TEXT NOT NULL,category TEXT NOT NULL,distributable INTEGER NOT NULL DEFAULT 0,mime TEXT NOT NULL,path TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);`);
if (
  !db.prepare("SELECT id FROM templates LIMIT 1").get() &&
  existsSync(path.join(root, "seed.json"))
) {
  const t = validateTemplate(
    templateSchema.parse(
      JSON.parse(readFileSync(path.join(root, "seed.json"), "utf8")),
    ),
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT OR IGNORE INTO templates(id,draft,published) VALUES(?,?,1)",
    ).run(t.id, JSON.stringify(t));
    db.prepare(
      "INSERT OR IGNORE INTO versions(template_id,version,snapshot) VALUES(?,1,?)",
    ).run(t.id, JSON.stringify(t));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function published() {
  return db
    .prepare(
      "SELECT v.snapshot FROM versions v JOIN templates t ON t.id=v.template_id AND t.published=v.version",
    )
    .all()
    .map((r) => editableFooter(JSON.parse(r.snapshot as string) as Template));
}
export function snapshot(id: string, version: number) {
  const r = db
    .prepare("SELECT snapshot FROM versions WHERE template_id=? AND version=?")
    .get(id, version);
  return r ? editableFooter(JSON.parse(r.snapshot as string) as Template) : null;
}
export function saveDraft(t: Template, expectedRevision: number) {
  validateTemplate(t);
  const r = db
    .prepare(
      "UPDATE templates SET draft=?,revision=revision+1 WHERE id=? AND revision=?",
    )
    .run(JSON.stringify(t), t.id, expectedRevision);
  if (!r.changes) throw Error("模板已被其他窗口修改，请刷新后重试");
}
export function publish(id: string, expectedRevision: number) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT draft,revision FROM templates WHERE id=?")
      .get(id);
    if (!row || row.revision !== expectedRevision)
      throw Error("模板已改变，请刷新");
    const t = validateTemplate(
      templateSchema.parse(JSON.parse(row.draft as string)),
    );
    if (!t.verified) throw Error("请先完成 PSD 对照与赞赏码覆盖检查");
    const last = db
      .prepare("SELECT MAX(version) AS v FROM versions WHERE template_id=?")
      .get(id);
    t.version = Number(last?.v ?? 0) + 1;
    db.prepare(
      "INSERT INTO versions(template_id,version,snapshot) VALUES(?,?,?)",
    ).run(id, t.version, JSON.stringify(t));
    db.prepare(
      "UPDATE templates SET draft=?,published=?,revision=revision+1 WHERE id=?",
    ).run(JSON.stringify(t), t.version, id);
    db.exec("COMMIT");
    return t;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
