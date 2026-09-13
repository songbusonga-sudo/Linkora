"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  FolderOpen,
  History,
  ImagePlus,
  Layers3,
  LockKeyhole,
  LogOut,
  Plus,
  Save,
  Settings2,
  Upload,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Undo2,
} from "lucide-react";
import { Asset, Template, TemplateNode, emptyEdits } from "@/lib/model";
import { Header, UploadButton } from "./shared";
import { drawTemplate } from "@/lib/render";
import { presetStyle } from "@/lib/qr";
import AssetManage from "./asset-manage";
import LayerPosition from "./layer-position";
import LabelPosition from "./label-position";
import CodePlacement from "./code-placement";
import { isCodeFrame } from "@/lib/code-placement";
import LayerBrowser from "./layer-browser";
import OptionLayerPicker from "./option-layer-picker";
import { PsdLayer } from "@/lib/psd-folders";
import { defaultLayerColor } from "@/lib/layer-colors";
import { canDeleteLayer, deleteLayer } from "@/lib/layer-delete";
import { folderForLayer, layersInFolder } from "@/lib/psd-folders";
import Studio from "./studio";
import AddTemplateAsset from "./add-template-asset";
import ColorPicker from "./color-picker";
import { persistDefaultDisplay } from "@/lib/save-default-display";
import { createTemplateCover } from "@/lib/template-cover";
import { formatBeijingTime } from "@/lib/time";
type Row = {
  id: string;
  draft: Template;
  published: number | null;
  publishedCover: string | null;
  revision: number;
};
type Data = {
  templates: Row[];
  assets: (Omit<Asset, "distributable"> & { distributable: number })[];
  versions: { template_id: string; version: number; created: string }[];
  layers: PsdLayer[];
};
const categories = {
  background: "背景",
  avatar: "主头像",
  rewardAvatar: "赞赏头像",
  rewardIcon: "右下图标",
  decoration: "装饰",
  font: "字体",
};
const versionsPerPage = 5;
export default function Admin() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [configured, setConfigured] = useState(true),
    [password, setPassword] = useState(""),
    [data, setData] = useState<Data>(),
    [id, setId] = useState(""),
    [draft, setDraft] = useState<Template>(),
    [revision, setRevision] = useState(0),
    [section, setSection] = useState<
      | "templates"
      | "layers"
      | "labels"
      | "codes"
      | "defaults"
      | "options"
      | "assets"
      | "versions"
    >("templates"),
    [nodeId, setNodeId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [deleted, setDeleted] = useState<{
      template: Template;
      node: TemplateNode;
    }>(),
    [preview, setPreview] = useState(""),
    [assetCategory, setAssetCategory] =
      useState<Asset["category"]>("background"),
    [distributable, setDistributable] = useState(false),
    [versionPage, setVersionPage] = useState(0);
  const [addAsset, setAddAsset] = useState(false);
  const [layerPreviewTarget, setLayerPreviewTarget] =
    useState<HTMLDivElement | null>(null);
  const defaultUploads = useRef(new Map<string, Asset>());
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);
  async function refresh(selectId = id) {
    const r = await fetch("/api/admin");
    if (r.status === 401) {
      setAuth(false);
      return;
    }
    const d = (await r.json()) as Data;
    setData(d);
    const row = d.templates.find((t) => t.id === selectId) ?? d.templates[0];
    if (row) {
      setId(row.id);
      setDraft(row.draft);
      setRevision(row.revision);
      setNodeId(row.draft.nodes[0]?.id ?? "");
      setDirty(false);
      setDeleted(undefined);
    }
  }
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((v) => {
        setAuth(v.authenticated);
        setConfigured(v.configured);
        if (v.authenticated) refresh();
      })
      .catch(() => setMessage("无法连接服务，请刷新重试"));
  }, []);
  useEffect(() => {
    const stop = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty]);
  useEffect(() => {
    setVersionPage(0);
  }, [id, section]);
  const change = (update: Partial<Template>) => {
    setDeleted(undefined);
    setDraft((d) =>
      d
        ? {
            ...d,
            ...update,
            verified: ("verified" in update ? update.verified : false) ?? false,
          }
        : d,
    );
    setDirty(true);
  };
  const node = draft?.nodes.find((n) => n.id === nodeId);
  const templateVersions =
    data?.versions.filter((version) => version.template_id === id) ?? [];
  const versionPageCount = Math.max(
    1,
    Math.ceil(templateVersions.length / versionsPerPage),
  );
  const currentVersionPage = Math.min(versionPage, versionPageCount - 1);
  const visibleVersions = templateVersions.slice(
    currentVersionPage * versionsPerPage,
    (currentVersionPage + 1) * versionsPerPage,
  );
  function removeSelectedLayer() {
    if (!draft || !node || !canDeleteLayer(node)) return;
    const next = deleteLayer(draft, node.id);
    change(next);
    setDeleted({ template: draft, node });
    const folder = folderForLayer(node.id, data?.layers ?? []);
    setNodeId(
      layersInFolder(next.nodes, data?.layers ?? [], folder)[0]?.id ?? "",
    );
  }
  const changeNode = (update: Partial<TemplateNode>) => {
    if (draft)
      change({
        ...(update.src && draft.defaults
          ? {
              defaults: {
                ...draft.defaults,
                edits: {
                  ...draft.defaults.edits,
                  images: { ...draft.defaults.edits.images, [nodeId]: "" },
                },
              },
            }
          : {}),
        nodes: draft.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...update } : n,
        ),
      });
  };
  async function post(body: unknown) {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "操作失败");
    return d;
  }
  async function action(name: string, extra: object = {}, source = draft) {
    setBusy(true);
    setMessage("");
    try {
      const template =
        name === "save" && source
          ? await persistDefaultDisplay(source, defaultUploads.current)
          : source;
      if (name === "save" && template)
        template.cover = await createTemplateCover(template);
      await post({ action: name, id, revision, template, ...extra });
      await refresh();
      setMessage(
        (
          {
            save: "草稿已保存",
            publish: "新版本已发布，已有作品使用的版本保持不变",
            restore: "旧版本已恢复为草稿，可预览后重新发布",
            copy: "模板副本已创建",
            create: "新模板已创建，请从列表选择",
          } as Record<string, string>
        )[name],
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showPreview(t = draft) {
    if (!t) return;
    setBusy(true);
    try {
      const c = await drawTemplate(
        t,
        emptyEdits(),
        {},
        { wechat: presetStyle(), alipay: presetStyle() },
      );
      setPreview(c.toDataURL());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectTemplate(row: Row) {
    if (dirty) {
      setMessage("请先保存当前草稿，或点击“放弃未保存修改”");
      return;
    }
    setId(row.id);
    setDraft(row.draft);
    setDeleted(undefined);
    setRevision(row.revision);
    setNodeId(row.draft.nodes[0]?.id ?? "");
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("category", assetCategory);
      form.set("distributable", String(distributable));
      const r = await fetch("/api/assets", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      const fresh = await fetch("/api/admin").then((r) => r.json());
      setData(fresh);
      setMessage("素材已入库，勾选“关联到当前模板”后保存草稿即可使用");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header admin />
      {auth === null ? (
        <div className="loading-page">正在连接工作台…</div>
      ) : !auth ? (
        <main className="login-page">
          <div className="login-decoration">
            <Layers3 size={36} />
          </div>
          <p>登录 Linkora 模板工作台</p>
          <form
            className="login-card"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setPassword("");
                setAuth(true);
                await refresh();
                setMessage("");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              管理员密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入管理员密码"
              />
            </label>
            {!configured && (
              <p className="notice">
                管理员尚未初始化，请在项目目录运行 npm run admin:setup。
              </p>
            )}
            <button className="primary" disabled={busy || !configured}>
              进入工作台
              <ArrowRight size={16} />
            </button>
            <span className="muted">
              <LockKeyhole size={13} />
              安全登录 · 仅管理员可访问
            </span>
          </form>
        </main>
      ) : (
        <main className="admin-shell">
          <aside className="admin-sidebar">
            <div className="eyebrow">WORKSPACE</div>
            {Object.entries({
              templates: "模板管理",
              layers: "图层与权限",
              labels: "中英文标签位置",
              codes: "三码放置区域",
              defaults: "更改默认展示",
              options: "前台选项",
              assets: "素材库",
              versions: "发布与历史",
            }).map(([key, label], i) => {
              const Icon = [
                Layers3,
                Settings2,
                Settings2,
                Layers3,
                ImagePlus,
                Eye,
                FolderOpen,
                History,
              ][i];
              return (
                <button
                  key={key}
                  className={section === key ? "active" : ""}
                  onClick={() => {
                    if (!busy) setSection(key as typeof section);
                  }}
                >
                  <Icon size={18} />
                  {label}
                </button>
              );
            })}
            <div className="sidebar-bottom">
              <span className="status-indicator" />
              管理员已登录
              <button
                onClick={async () => {
                  await fetch("/api/auth", { method: "DELETE" });
                  setAuth(false);
                }}
              >
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          </aside>
          <section className="admin-main">
            <div className="admin-title">
              <div className="admin-actions">
                {dirty && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => refresh()}
                  >
                    放弃未保存修改
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={busy || !draft}
                  onClick={() => showPreview()}
                >
                  <Eye size={15} />
                  预览
                </button>
                <button
                  className="primary"
                  disabled={busy || !draft}
                  onClick={() => action("save")}
                >
                  <Save size={15} />
                  保存草稿
                </button>
              </div>
            </div>
            {deleted && (
              <div className="layer-deletion-notice" role="status">
                <span>已删除“{deleted.node.name}”，保存草稿后保留此修改。</span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    change(deleted.template);
                    setNodeId(deleted.node.id);
                  }}
                >
                  <Undo2 size={15} />
                  撤销删除
                </button>
              </div>
            )}
            {section === "templates" && (
              <div className="admin-columns">
                <div>
                  <div className="section-title">
                    <h2>
                      我的模板{" "}
                      <span className="muted">{data?.templates.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      disabled={busy || dirty}
                      onClick={() => action("create")}
                    >
                      <Plus size={15} />
                      创建模板
                    </button>
                  </div>
                  <div className="admin-template-grid">
                    {data?.templates.map((row) => (
                      <button
                        className={`template-card ${row.id === id ? "selected" : ""}`}
                        key={row.id}
                        onClick={() => selectTemplate(row)}
                      >
                        <div className="template-thumbnail">
                          <img
                            src={row.publishedCover ?? row.draft.cover}
                            alt={row.draft.name}
                          />
                          <span className="template-size">
                            {row.published
                              ? "已发布 v" + row.published
                              : "草稿"}
                          </span>
                        </div>
                        <div className="template-info">
                          <strong>{row.draft.name}</strong>
                          <span>
                            {row.draft.width} × {row.draft.height} px
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {draft && (
                  <div className="admin-card">
                    <h2>模板信息</h2>
                    <label className="field">
                      模板名称
                      <input
                        value={draft.name}
                        onChange={(e) => change({ name: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      描述
                      <textarea
                        value={draft.description}
                        onChange={(e) =>
                          change({ description: e.target.value })
                        }
                      />
                    </label>
                    <div className="field">
                      封面
                      <p className="muted">
                        保存草稿时会按当前模板和默认展示自动更新；访客载入编辑预览前会显示这张图。
                      </p>
                    </div>
                    <label className="field">
                      模板字体
                      <select
                        value={draft.font}
                        onChange={(e) => change({ font: e.target.value })}
                      >
                        <option value={draft.font}>
                          当前字体 · PSD 原始字体
                        </option>
                        {data?.assets
                          .filter((a) => a.category === "font")
                          .map((a) => (
                            <option key={a.id} value={a.src}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="locked-note">
                      <LockKeyhole size={14} />
                      {draft.width} × {draft.height}，沿用 PSD 原始尺寸
                    </div>
                    <button
                      className="secondary"
                      disabled={dirty || busy}
                      onClick={() => action("copy")}
                    >
                      <Copy size={15} />
                      复制模板
                    </button>
                  </div>
                )}
              </div>
            )}
            {section === "labels" && draft && (
              <LabelPosition
                key={draft.id}
                template={draft}
                saved={data?.templates.find((t) => t.id === id)?.draft}
                onChange={(nodes) => change({ nodes })}
              />
            )}
            {section === "layers" && draft && (
              <div className="position-workspace layers-position-workspace">
                <div
                  className="position-preview-panel"
                  ref={setLayerPreviewTarget}
                >
                  {!node && (
                    <p className="muted">在右侧选择图层，即可预览和调整。</p>
                  )}
                </div>
                <div className="position-controls-panel">
                  <div className="admin-card">
                    <div className="section-title">
                      <h2>二维码下方文字</h2>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setSection("labels")}
                      >
                        调整中英文标签位置
                      </button>
                    </div>
                    <p className="muted">
                      单独移动中文、英文标签，或一键对齐到对应二维码。
                    </p>
                  </div>
                  <LayerBrowser
                    key={draft.id}
                    nodes={draft.nodes.map((n) => ({
                      ...n,
                      src: draft.defaults?.edits.images[n.id] || n.src,
                    }))}
                    layers={data?.layers ?? []}
                    assets={draft.assets}
                    selectedId={nodeId}
                    onSelect={setNodeId}
                    onAddAsset={() => setAddAsset(true)}
                    onImport={(l) => {
                      const [x, y, right, bottom] = l.bbox;
                      const imported: TemplateNode = {
                        id: l.id,
                        name: l.name,
                        src: `/private-assets/layer-${l.id}.png`,
                        x,
                        y,
                        width: right - x,
                        height: bottom - y,
                        role: l.kind === "type" ? "text" : "image",
                        visible: false,
                        opacity: l.opacity / 255,
                        colorEditable: false,
                        contentEditable: false,
                        styleEditable: false,
                        positionEditable: false,
                        sizeEditable: false,
                        defaultText: l.text ?? "",
                        originalText: l.text ?? "",
                        maxLength: 60,
                        fontSize: 42,
                        color: "#aaaaaa",
                      };
                      change({
                        nodes: [
                          ...draft.nodes,
                          defaultLayerColor(imported),
                        ].sort((a, b) =>
                          a.id.localeCompare(b.id, undefined, {
                            numeric: true,
                          }),
                        ),
                      });
                      setNodeId(imported.id);
                    }}
                  />
                  {node && (
                    <div className="admin-card">
                      <div className="section-title">
                        <h2>图层设置</h2>
                        <button
                          type="button"
                          className="text-button delete-layer-button"
                          disabled={busy || !canDeleteLayer(node)}
                          title={
                            canDeleteLayer(node)
                              ? `删除“${node.name}”`
                              : "三个码及其固定外框不能删除"
                          }
                          onClick={removeSelectedLayer}
                        >
                          <Trash2 size={16} />
                          删除图层
                        </button>
                      </div>
                      <label className="field">
                        管理名称
                        <input
                          value={node.name}
                          onChange={(e) => changeNode({ name: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        图层默认素材
                        <select
                          disabled={isCodeFrame(node)}
                          value={
                            draft.defaults?.edits.images[node.id] || node.src
                          }
                          onChange={(e) => changeNode({ src: e.target.value })}
                        >
                          <option
                            value={
                              draft.defaults?.edits.images[node.id] || node.src
                            }
                          >
                            当前素材
                          </option>
                          {data?.assets
                            .filter((a) => a.category !== "font")
                            .map((a) => (
                              <option key={a.id} value={a.src}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="meta-line">
                        内部标识 <code>{node.id}</code> · 坐标 {node.x},{" "}
                        {node.y} · {node.width} × {node.height}
                      </div>
                      <LayerPosition
                        previewTarget={layerPreviewTarget}
                        key={node.id}
                        template={draft}
                        node={node}
                        saved={data?.templates
                          .find((t) => t.id === id)
                          ?.draft.nodes.find((n) => n.id === node.id)}
                        onChange={(nodes) => change({ nodes })}
                      />
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={node.visible}
                          onChange={(e) =>
                            changeNode({ visible: e.target.checked })
                          }
                          disabled={
                            isCodeFrame(node) ||
                            ["wechat", "alipay", "reward"].includes(node.role)
                          }
                        />
                        默认显示
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={node.contentEditable}
                          disabled={
                            ![
                              "avatar",
                              "rewardAvatar",
                              "background",
                              "signature",
                              "text",
                            ].includes(node.role)
                          }
                          onChange={(e) =>
                            changeNode({ contentEditable: e.target.checked })
                          }
                        />
                        允许修改内容 / 上传
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={node.styleEditable}
                          disabled={!["wechat", "alipay"].includes(node.role)}
                          onChange={(e) =>
                            changeNode({ styleEditable: e.target.checked })
                          }
                        />
                        允许二维码样式调整
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={node.colorEditable}
                          disabled={["wechat", "alipay"].includes(node.role)}
                          onChange={(e) =>
                            changeNode({ colorEditable: e.target.checked })
                          }
                        />
                        开放图层颜色叠加
                      </label>
                      {node.colorEditable && (
                        <div className="field">
                          默认叠加颜色
                          <ColorPicker
                            label="默认叠加颜色"
                            value={node.color}
                            onChange={(color) => changeNode({ color })}
                          />
                        </div>
                      )}
                      {node.strokeOnly && (
                        <p className="muted">
                          仅外侧边线叠加颜色，框内底色保持白色。
                        </p>
                      )}
                      <div className="locked-note">
                        <LockKeyhole size={14} />
                        位置由管理员调整，保存并发布后生效；前台不能移动
                      </div>
                      {["text", "signature"].includes(node.role) && (
                        <>
                          <label className="field">
                            默认文案
                            <input
                              value={node.defaultText}
                              onChange={(e) =>
                                changeNode({ defaultText: e.target.value })
                              }
                            />
                          </label>
                          <div className="two-fields">
                            <label>
                              字数上限
                              <input
                                type="number"
                                min="1"
                                max={node.role === "signature" ? 12 : 200}
                                value={node.maxLength}
                                onChange={(e) =>
                                  changeNode({
                                    maxLength: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <label>
                              字号（px）
                              <input
                                type="number"
                                min="8"
                                max="300"
                                value={node.fontSize}
                                onChange={(e) =>
                                  changeNode({
                                    fontSize: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <p className="muted">
                            居中单行排版，超出可用宽度时缩小适配。
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {section === "codes" && draft && (
              <CodePlacement
                key={draft.id}
                template={draft}
                saved={data?.templates.find((t) => t.id === id)?.draft}
                onChange={(nodes) => change({ nodes })}
              />
            )}
            {section === "defaults" && draft && (
              <fieldset className="default-display-fieldset" disabled={busy}>
                <Studio
                  key={`${draft.id}:${revision}`}
                  adminTemplate={draft}
                  onDefaultsChange={(defaults) => change({ defaults })}
                  onSaveBackground={(defaults) =>
                    action("save", {}, { ...draft, defaults, verified: false })
                  }
                />
              </fieldset>
            )}
            {section === "options" && draft && (
              <div className="options-area">
                <div className="section-title">
                  <h2>前台选项组</h2>
                  <button
                    className="secondary"
                    onClick={() =>
                      change({
                        options: [
                          ...draft.options,
                          {
                            id: crypto.randomUUID(),
                            name: "新选项",
                            defaultId: "default",
                            choices: [
                              { id: "default", name: "默认", nodeIds: [] },
                            ],
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    添加选项组
                  </button>
                </div>
                <p className="muted">
                  用下拉菜单关联一个或多个图层。先在“图层与权限”导入需要的图层，再配置这里的选项。
                </p>
                {!draft.options.length && (
                  <div className="empty-state">
                    <Settings2 size={30} />
                    <h3>尚未开放可选图层</h3>
                    <p>按你的清单配置；未指定图层保持原样。</p>
                  </div>
                )}
                {draft.options.map((o, index) => (
                  <div className="admin-card option-card" key={o.id}>
                    <div className="section-title">
                      <input
                        aria-label="前台选项名称"
                        value={o.name}
                        onChange={(e) =>
                          change({
                            options: draft.options.map((p) =>
                              p.id === o.id
                                ? { ...p, name: e.target.value }
                                : p,
                            ),
                          })
                        }
                      />
                      <div>
                        <button
                          className="icon-button"
                          disabled={index === 0}
                          aria-label="选项上移"
                          onClick={() => {
                            const opts = [...draft.options];
                            [opts[index - 1], opts[index]] = [
                              opts[index],
                              opts[index - 1],
                            ];
                            change({ options: opts });
                          }}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="删除选项组"
                          onClick={() =>
                            change({
                              options: draft.options.filter(
                                (p) => p.id !== o.id,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    {o.choices.map((ch, choiceIndex) => (
                      <div className="choice-row" key={ch.id}>
                        <label className="check-label">
                          <input
                            type="radio"
                            name={o.id}
                            checked={o.defaultId === ch.id}
                            onChange={() =>
                              change({
                                options: draft.options.map((p) =>
                                  p.id === o.id
                                    ? { ...p, defaultId: ch.id }
                                    : p,
                                ),
                              })
                            }
                          />
                          默认项
                        </label>
                        <input
                          aria-label="选项名称"
                          value={ch.name}
                          onChange={(e) =>
                            change({
                              options: draft.options.map((p) =>
                                p.id === o.id
                                  ? {
                                      ...p,
                                      choices: p.choices.map((c) =>
                                        c.id === ch.id
                                          ? { ...c, name: e.target.value }
                                          : c,
                                      ),
                                    }
                                  : p,
                              ),
                            })
                          }
                        />
                        <OptionLayerPicker
                          nodes={draft.nodes.filter((n) =>
                            ["image", "text", "rewardIcon"].includes(n.role),
                          )}
                          value={ch.nodeIds}
                          onChange={(nodeIds) =>
                            change({
                              options: draft.options.map((p) =>
                                p.id === o.id
                                  ? {
                                      ...p,
                                      choices: p.choices.map((c) =>
                                        c.id === ch.id
                                          ? {
                                              ...c,
                                              nodeIds,
                                            }
                                          : c,
                                      ),
                                    }
                                  : p,
                              ),
                            })
                          }
                        />
                        <button
                          className="text-button"
                          disabled={o.choices.length === 1}
                          onClick={() =>
                            change({
                              options: draft.options.map((p) =>
                                p.id === o.id
                                  ? {
                                      ...p,
                                      choices: p.choices.filter(
                                        (c) => c.id !== ch.id,
                                      ),
                                      defaultId:
                                        p.defaultId === ch.id
                                          ? p.choices.find(
                                              (c) => c.id !== ch.id,
                                            )!.id
                                          : p.defaultId,
                                    }
                                  : p,
                              ),
                            })
                          }
                        >
                          删除此项
                        </button>
                        <div className="choice-order">
                          <button
                            className="text-button"
                            disabled={choiceIndex === 0}
                            onClick={() => {
                              const choices = [...o.choices];
                              [choices[choiceIndex - 1], choices[choiceIndex]] =
                                [
                                  choices[choiceIndex],
                                  choices[choiceIndex - 1],
                                ];
                              change({
                                options: draft.options.map((p) =>
                                  p.id === o.id ? { ...p, choices } : p,
                                ),
                              });
                            }}
                          >
                            <ArrowUp size={13} />
                            上移
                          </button>
                          <button
                            className="text-button"
                            disabled={choiceIndex === o.choices.length - 1}
                            onClick={() => {
                              const choices = [...o.choices];
                              [choices[choiceIndex + 1], choices[choiceIndex]] =
                                [
                                  choices[choiceIndex],
                                  choices[choiceIndex + 1],
                                ];
                              change({
                                options: draft.options.map((p) =>
                                  p.id === o.id ? { ...p, choices } : p,
                                ),
                              });
                            }}
                          >
                            <ArrowDown size={13} />
                            下移
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        change({
                          options: draft.options.map((p) =>
                            p.id === o.id
                              ? {
                                  ...p,
                                  choices: [
                                    ...p.choices,
                                    {
                                      id: crypto.randomUUID(),
                                      name: "新选项",
                                      nodeIds: [],
                                    },
                                  ],
                                }
                              : p,
                          ),
                        })
                      }
                    >
                      <Plus size={14} />
                      添加菜单项
                    </button>
                  </div>
                ))}
              </div>
            )}
            {section === "assets" && (
              <>
                <div className="admin-card asset-upload">
                  <div>
                    <h2>添加素材</h2>
                    <p className="muted">
                      素材独立存储，不随代码提交公开仓库。
                    </p>
                  </div>
                  <select
                    aria-label="素材分类"
                    value={assetCategory}
                    onChange={(e) =>
                      setAssetCategory(e.target.value as Asset["category"])
                    }
                  >
                    {Object.entries(categories).map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={distributable}
                      onChange={(e) => setDistributable(e.target.checked)}
                    />
                    已确认可公开分发
                  </label>
                  <UploadButton
                    label={busy ? "上传中…" : "上传素材"}
                    accept={
                      assetCategory === "font"
                        ? ".ttf,.otf"
                        : "image/png,image/jpeg,image/webp"
                    }
                    onFile={(f) => {
                      if (!busy) upload(f);
                    }}
                  />
                </div>
                <div className="asset-grid">
                  {data?.assets.map((a) => (
                    <div className="admin-card asset-card" key={a.id}>
                      {a.category === "font" ? (
                        <div className="font-tile">Aa 字</div>
                      ) : (
                        <img src={a.src} alt={a.name} />
                      )}
                      <strong>{a.name}</strong>
                      <span className="muted">
                        {categories[a.category]} ·{" "}
                        {a.distributable ? "可公开分发" : "分发权限未确认"}
                      </span>
                      {draft && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={draft.assets.some((x) => x.id === a.id)}
                            onChange={(e) =>
                              change({
                                assets: e.target.checked
                                  ? [
                                      ...draft.assets,
                                      {
                                        ...a,
                                        distributable: !!a.distributable,
                                      },
                                    ]
                                  : draft.assets.filter((x) => x.id !== a.id),
                              })
                            }
                          />
                          关联到当前模板
                        </label>
                      )}
                      <AssetManage
                        id={a.id}
                        name={a.name}
                        distributable={!!a.distributable}
                        currentTemplateId={id}
                        linkedToCurrentTemplate={
                          !!draft?.assets.some((x) => x.id === a.id)
                        }
                        onError={setMessage}
                        onDone={async () => {
                          setData(
                            await fetch("/api/admin").then((r) => r.json()),
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
                {!data?.assets.length && (
                  <div className="empty-state">
                    <FolderOpen size={30} />
                    <h3>为模板准备一点素材</h3>
                    <p>上传背景、头像、图标、装饰或字体。</p>
                  </div>
                )}
              </>
            )}
            {section === "versions" && draft && (
              <div className="admin-columns">
                <div className="admin-card">
                  <h2>发布当前草稿</h2>
                  <p className="muted">
                    发布会创建不可变快照。恢复旧版本时，先恢复为草稿，再发布为新版本。
                  </p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={draft.verified}
                      onChange={(e) => change({ verified: e.target.checked })}
                    />
                    已对照 PSD
                    检查效果，并用真实赞赏码确认头像及图标覆盖区域安全
                  </label>
                  <p className="notice">
                    发布前先保存。每次发布后，已开始制作的用户仍绑定原版本。
                  </p>
                  <button
                    className="primary"
                    disabled={dirty || busy || !draft.verified}
                    onClick={() => action("publish")}
                  >
                    <Upload size={16} />
                    发布新版本
                  </button>
                </div>
                <div className="admin-card">
                  <h2>版本历史</h2>
                  {visibleVersions.map((v) => (
                    <div className="version-row" key={v.version}>
                      <span className="version-icon">
                        <History size={18} />
                      </span>
                      <div>
                        <strong>
                          版本 {v.version}
                            {data?.templates.find((t) => t.id === id)
                            ?.published === v.version && (
                            <span className="pill">当前发布</span>
                          )}
                        </strong>
                        <p className="muted">{formatBeijingTime(v.created)}</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            const t = await fetch(
                              `/api/templates?id=${id}&version=${v.version}`,
                            ).then((r) => r.json());
                            await showPreview(t);
                          } catch (e) {
                            setMessage((e as Error).message);
                          }
                        }}
                      >
                        预览
                      </button>
                      <button
                        className="text-button"
                        disabled={dirty || busy}
                        onClick={() =>
                          action("restore", { version: v.version })
                        }
                      >
                        恢复
                      </button>
                    </div>
                  ))}
                  {!templateVersions.length && (
                    <p className="muted">还没有已发布的版本。</p>
                  )}
                  {templateVersions.length > versionsPerPage && (
                    <nav
                      className="version-pagination"
                      aria-label="版本历史分页"
                    >
                      <button
                        type="button"
                        className="secondary"
                        disabled={currentVersionPage === 0}
                        onClick={() => setVersionPage((page) => page - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        第 {currentVersionPage + 1} / {versionPageCount} 页
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        disabled={currentVersionPage === versionPageCount - 1}
                        onClick={() => setVersionPage((page) => page + 1)}
                      >
                        下一页
                      </button>
                    </nav>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      )}
      {addAsset && draft && (
        <AddTemplateAsset
          assets={draft.assets}
          initialCategory={
            node &&
            ["background", "avatar", "rewardAvatar", "rewardIcon"].includes(
              node.role,
            )
              ? (node.role as Asset["category"])
              : "background"
          }
          onClose={() => setAddAsset(false)}
          onAdded={(added) => {
            change({
              assets: [...draft.assets, ...added],
              nodes: draft.nodes.map((n) =>
                added.some((asset) => n.role === asset.category) &&
                n.role !== "rewardIcon"
                  ? { ...n, contentEditable: true }
                  : n,
              ),
            });
            setData((d) =>
              d
                ? {
                    ...d,
                    assets: [
                      ...d.assets,
                      ...added.map((asset) => ({ ...asset, distributable: 0 })),
                    ],
                  }
                : d,
            );
            setMessage(
              `已添加 ${added.length} 张素材，保存并发布后用户即可选择`,
            );
          }}
        />
      )}
      {message && (
        <div className="toast admin-toast" role="status">
          <span>{message}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setMessage("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop inspect-backdrop">
          <button
            className="secondary inspect-close"
            onClick={() => setPreview("")}
          >
            关闭预览 ×
          </button>
          <img src={preview} alt="模板草稿预览" />
        </div>
      )}
    </>
  );
}
