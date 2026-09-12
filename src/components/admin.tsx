"use client";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Asset, Template, TemplateNode, emptyEdits } from "@/lib/model";
import { Header, UploadButton } from "./shared";
import { drawTemplate } from "@/lib/render";
import { presetStyle } from "@/lib/qr";
import AssetManage from "./asset-manage";
type Row = {
  id: string;
  draft: Template;
  published: number | null;
  revision: number;
};
type Layer = {
  id: string;
  name: string;
  kind: string;
  bbox: number[];
  effectiveVisible: boolean;
  opacity: number;
  text?: string;
};
type Data = {
  templates: Row[];
  assets: (Omit<Asset, "distributable"> & { distributable: number })[];
  versions: { template_id: string; version: number; created: string }[];
  layers: Layer[];
};
const categories = {
  background: "背景",
  avatar: "主头像",
  rewardAvatar: "赞赏头像",
  rewardIcon: "右下图标",
  decoration: "装饰",
  font: "字体",
};
export default function Admin() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [configured, setConfigured] = useState(true),
    [password, setPassword] = useState(""),
    [data, setData] = useState<Data>(),
    [id, setId] = useState(""),
    [draft, setDraft] = useState<Template>(),
    [revision, setRevision] = useState(0),
    [section, setSection] = useState<
      "templates" | "layers" | "options" | "assets" | "versions"
    >("templates"),
    [nodeId, setNodeId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(""),
    [assetCategory, setAssetCategory] =
      useState<Asset["category"]>("background"),
    [distributable, setDistributable] = useState(false),
    [showImport, setShowImport] = useState(false);
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
  const change = (update: Partial<Template>) => {
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
  const changeNode = (update: Partial<TemplateNode>) => {
    if (draft)
      change({
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
  async function action(name: string, extra: object = {}) {
    setBusy(true);
    setMessage("");
    try {
      await post({ action: name, id, revision, template: draft, ...extra });
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
          <h1>管理每一份好设计。</h1>
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
              options: "前台选项",
              assets: "素材库",
              versions: "发布与历史",
            }).map(([key, label], i) => {
              const Icon = [Layers3, Settings2, Eye, FolderOpen, History][i];
              return (
                <button
                  key={key}
                  className={section === key ? "active" : ""}
                  onClick={() => setSection(key as typeof section)}
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
              <div>
                <div className="eyebrow">LINKORA STUDIO</div>
                <h1>
                  {
                    {
                      templates: "让好设计，成为模板。",
                      layers: "每一层，都恰到好处。",
                      options: "把选择，留给创作者。",
                      assets: "收集一点创作灵感。",
                      versions: "每次发布，都有迹可循。",
                    }[section]
                  }
                </h1>
                <p>
                  {draft?.name ?? "尚无模板"}{" "}
                  <span className="muted">
                    / {dirty ? "有未保存修改" : "草稿已同步"}
                  </span>
                </p>
              </div>
              <div className="admin-actions">
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
            {dirty && (
              <div className="unsaved-bar">
                当前修改仅存在于此窗口。
                <button className="text-button" onClick={() => refresh()}>
                  放弃未保存修改
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
                          <img src={row.draft.cover} alt={row.draft.name} />
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
                    <label className="field">
                      封面
                      <select
                        value={draft.cover}
                        onChange={(e) => change({ cover: e.target.value })}
                      >
                        <option value={draft.cover}>当前封面</option>
                        {data?.assets
                          .filter((a) => a.category !== "font")
                          .map((a) => (
                            <option key={a.id} value={a.src}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
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
            {section === "layers" && draft && (
              <div className="admin-columns layers-columns">
                <div className="admin-card">
                  <div className="section-title">
                    <h2>原始图层顺序</h2>
                    <button
                      className="text-button"
                      onClick={() => setShowImport(!showImport)}
                    >
                      <Plus size={14} />
                      导入图层
                    </button>
                  </div>
                  <p className="muted">
                    由底至顶排列。名称和菜单排序不改变叠放关系。
                  </p>
                  {showImport && (
                    <div className="import-layers">
                      <select
                        aria-label="从 PSD 导入图层"
                        defaultValue=""
                        onChange={(e) => {
                          const l = data?.layers.find(
                            (l) => l.id === e.target.value,
                          );
                          if (!l) return;
                          const [x, y, r, b] = l.bbox;
                          const n: TemplateNode = {
                            id: l.id,
                            name: l.name,
                            src: `/private-assets/layer-${l.id}.png`,
                            x,
                            y,
                            width: r - x,
                            height: b - y,
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
                          const nodes = [...draft.nodes, n].sort((a, b) =>
                            a.id.localeCompare(b.id, undefined, {
                              numeric: true,
                            }),
                          );
                          change({ nodes });
                          setNodeId(n.id);
                          setShowImport(false);
                        }}
                      >
                        <option value="">选择一个 PSD 图层…</option>
                        {data?.layers
                          .filter(
                            (l) =>
                              l.bbox[2] > l.bbox[0] &&
                              !draft.nodes.some((n) => n.id === l.id),
                          )
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.id} · {l.name}
                            </option>
                          ))}
                      </select>
                      <p className="muted">
                        新导入图层默认隐藏并锁定。含图层组时请避免重复显示其子图层。
                      </p>
                    </div>
                  )}
                  <div className="layer-list">
                    {draft.nodes.map((n) => (
                      <button
                        key={n.id}
                        className={nodeId === n.id ? "active" : ""}
                        onClick={() => setNodeId(n.id)}
                      >
                        <span className="layer-number">{n.id}</span>
                        <span>
                          {n.name}
                          <small>{n.role}</small>
                        </span>
                        {n.colorEditable || n.contentEditable ? (
                          <Settings2 size={14} />
                        ) : (
                          <LockKeyhole size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {node && (
                  <div className="admin-card">
                    <h2>图层设置</h2>
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
                        value={node.src}
                        onChange={(e) => changeNode({ src: e.target.value })}
                      >
                        <option value={node.src}>当前素材</option>
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
                      内部标识 <code>{node.id}</code> · 坐标 {node.x}, {node.y}{" "}
                      · {node.width} × {node.height}
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={node.visible}
                        onChange={(e) =>
                          changeNode({ visible: e.target.checked })
                        }
                        disabled={["wechat", "alipay", "reward"].includes(
                          node.role,
                        )}
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
                        disabled={["wechat", "alipay", "reward"].includes(
                          node.role,
                        )}
                        onChange={(e) =>
                          changeNode({ colorEditable: e.target.checked })
                        }
                      />
                      开放图层颜色叠加
                    </label>
                    {node.colorEditable && (
                      <label className="field">
                        默认叠加颜色
                        <input
                          type="color"
                          value={node.color}
                          onChange={(e) =>
                            changeNode({ color: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <div className="locked-note">
                      <LockKeyhole size={14} />
                      位置和尺寸固定，前台不能移动
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
                                changeNode({ fontSize: Number(e.target.value) })
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
                        <select
                          aria-label="关联图层（可多选）"
                          multiple
                          value={ch.nodeIds}
                          onChange={(e) =>
                            change({
                              options: draft.options.map((p) =>
                                p.id === o.id
                                  ? {
                                      ...p,
                                      choices: p.choices.map((c) =>
                                        c.id === ch.id
                                          ? {
                                              ...c,
                                              nodeIds: Array.from(
                                                e.target.selectedOptions,
                                              ).map((o) => o.value),
                                            }
                                          : c,
                                      ),
                                    }
                                  : p,
                              ),
                            })
                          }
                        >
                          {draft.nodes
                            .filter((n) =>
                              ["image", "text", "rewardIcon"].includes(n.role),
                            )
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.id} · {n.name}
                              </option>
                            ))}
                        </select>
                        <span className="muted">Ctrl / ⌘ 多选图层</span>
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
                  {data?.versions
                    .filter((v) => v.template_id === id)
                    .map((v) => (
                      <div className="version-row" key={v.version}>
                        <span className="version-icon">
                          <History size={18} />
                        </span>
                        <div>
                          <strong>
                            版本 {v.version}
                            {data.templates.find((t) => t.id === id)
                              ?.published === v.version && (
                              <span className="pill">当前发布</span>
                            )}
                          </strong>
                          <p className="muted">{v.created} UTC</p>
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
                </div>
              </div>
            )}
          </section>
        </main>
      )}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="关闭提示" onClick={() => setMessage("")}>
            ×
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
