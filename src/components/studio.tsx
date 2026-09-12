"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  Expand,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Heart,
  Info,
} from "lucide-react";
import {
  CodeInput,
  CodeKind,
  Crop,
  Edits,
  emptyEdits,
  QRStyle,
  ready,
  Template,
} from "@/lib/model";
import { readImage, loadImage, decodeImage, suggestCrop } from "@/lib/images";
import { checkExport, checkStyled, drawTemplate } from "@/lib/render";
import { presetStyle } from "@/lib/qr";
import { CropDialog, Header, LocalNote, Reset, UploadButton } from "./shared";
import QRControls from "./qr-controls";
import ColorField from "./color-field";
import AssetPresets from "./asset-presets";
const steps = ["选择模板", "上传三个码", "内容与样式", "检查与下载"];
const names = {
  wechat: "微信收款码",
  alipay: "支付宝收款码",
  reward: "微信赞赏码",
};
export default function Studio() {
  const [templates, setTemplates] = useState<Template[]>([]),
    [template, setTemplate] = useState<Template>(),
    [step, setStep] = useState(0),
    [edits, setEdits] = useState<Edits>(emptyEdits),
    [codes, setCodes] = useState<Partial<Record<CodeKind, CodeInput>>>({}),
    [styles, setStyles] = useState({
      wechat: presetStyle(),
      alipay: presetStyle(),
    }),
    [tab, setTab] = useState<"content" | "wechat" | "alipay" | "reward">(
      "content",
    ),
    [preview, setPreview] = useState(""),
    [rendering, setRendering] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [checked, setChecked] = useState(false),
    [appChecked, setAppChecked] = useState(false),
    [inspect, setInspect] = useState(false),
    [rewardChecked, setRewardChecked] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [crop, setCrop] = useState<{
      src: string;
      initial: Crop;
      title: string;
      kind?: CodeKind;
      nodeId?: string;
      fileName: string;
    }>();
  const drawId = useRef(0),
    checkId = useRef(0);
  const loaded = useRef(false);
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) throw Error("模板加载失败");
        return r.json();
      })
      .then((t: Template[]) => {
        setTemplates(t);
        if (t[0]) {
          setTemplate(t[0]);
          loaded.current = true;
        } else setError("暂无已发布模板，请先在后台配置模板。");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!template) return;
    const id = ++drawId.current;
    setRendering(true);
    setChecked(false);
    setAppChecked(false);
    setRewardChecked(false);
    setDownloaded(false);
    checkId.current++;
    const timer = setTimeout(() => {
      drawTemplate(template, edits, codes, styles)
        .then((c) => {
          if (id === drawId.current) {
            setPreview(c.toDataURL("image/png"));
            setRendering(false);
          }
        })
        .catch((e) => {
          if (id === drawId.current) {
            setError(e.message);
            setRendering(false);
          }
        });
    }, 160);
    return () => clearTimeout(timer);
  }, [template, edits, codes, styles]);
  useEffect(() => {
    const stop = (e: BeforeUnloadEvent) => {
      if (Object.keys(codes).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [codes]);
  const say = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  };
  const updateEdit = (
    key: "images" | "texts" | "colors" | "choices",
    id: string,
    value: string,
  ) => setEdits((e) => ({ ...e, [key]: { ...e[key], [id]: value } }));
  const resetEdit = (key: "images" | "texts" | "colors", id: string) =>
    setEdits((e) => {
      const values = { ...e[key] };
      delete values[id];
      return { ...e, [key]: values };
    });
  async function uploadCode(kind: CodeKind, file: File) {
    setBusy(kind);
    setError("");
    try {
      const image = await readImage(file);
      if (kind === "reward") {
        setCrop({
          src: image,
          initial: await suggestCrop(image),
          title: "定位与裁切赞赏码",
          kind,
          fileName: file.name,
        });
      } else {
        const content = await decodeImage(image);
        setCodes((c) => ({
          ...c,
          [kind]: { image, content, confirmed: true, name: file.name },
        }));
        say(`${names[kind]}识别成功`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function uploadContent(id: string, file: File, background = false) {
    setError("");
    try {
      const src = await readImage(file);
      if (background) {
        updateEdit("images", id, src);
        return;
      }
      const im = await loadImage(src),
        size = Math.min(im.width, im.height);
      setCrop({
        src,
        initial: { x: (im.width - size) / 2, y: (im.height - size) / 2, size },
        title: "裁切头像",
        nodeId: id,
        fileName: file.name,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function verify() {
    if (!template || !ready(codes)) return;
    const id = ++checkId.current;
    setBusy("verify");
    setError("");
    try {
      for (const kind of ["wechat", "alipay"] as const) {
        const n = template.nodes.find((n) => n.role === kind)!;
        await checkStyled(
          codes[kind]!.content!,
          n.styleEditable ? styles[kind] : presetStyle(),
        );
      }
      const c = await drawTemplate(template, edits, codes, styles, 2);
      checkExport(c, template, codes);
      if (id === checkId.current) {
        setChecked(true);
        say("美化图与高清成品识别通过，原始内容一致");
      }
    } catch (e) {
      if (id === checkId.current) {
        setChecked(false);
        setError((e as Error).message);
      }
    } finally {
      setBusy("");
    }
  }
  async function download() {
    if (!template || !ready(codes) || !checked || !rewardChecked || !appChecked)
      return;
    setBusy("download");
    setError("");
    try {
      const c = await drawTemplate(template, edits, codes, styles, 2);
      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG 导出失败"))),
          "image/png",
        ),
      );
      const url = URL.createObjectURL(blob);
      try {
        const decoded = await loadImage(url),
          final = document.createElement("canvas");
        final.width = c.width;
        final.height = c.height;
        final.getContext("2d")!.drawImage(decoded, 0, 0);
        checkExport(final, template, codes);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Linkora-${template.id}-v${template.version}-${c.width}px.png`;
        a.click();
        setDownloaded(true);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const switchTemplate = (t: Template) => {
    if (t.id === template?.id && t.version === template.version) return;
    setTemplate(t);
    setEdits(emptyEdits());
    setStyles({ wechat: presetStyle(), alipay: presetStyle() });
  };
  const signature = template?.nodes.find((n) => n.role === "signature");
  const avatar = template?.nodes.find((n) => n.role === "avatar");
  const background = template?.nodes.find((n) => n.role === "background");
  const rewardAvatar = template?.nodes.find((n) => n.role === "rewardAvatar");
  const rewardIcon = template?.nodes.find((n) => n.role === "rewardIcon");
  return (
    <>
      <Header />
      <main className="studio">
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> MADE FOR YOUR EVERYDAY
            </div>
            <h1>
              把心意，放在一起<span>。</span>
            </h1>
            <p>三个收款码，一张属于你的卡片。</p>
          </div>
          <div className="intro-badge">
            <Sparkles size={16} />
            <span>轻松制作 · 高清导出</span>
          </div>
        </div>
        <ol className="steps">
          {steps.map((name, i) => (
            <li
              key={name}
              className={step === i ? "current" : step > i ? "complete" : ""}
            >
              <button
                onClick={() => {
                  if (
                    i <= step ||
                    (i === 1 && template) ||
                    (i >= 2 && ready(codes))
                  )
                    setStep(i);
                }}
                disabled={
                  i > step &&
                  ((i === 1 && !template) || (i >= 2 && !ready(codes)))
                }
              >
                <span className="step-number">
                  {step > i ? (
                    <Check size={15} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>{name}</span>
              </button>
              {i < 3 && <span className="step-connector" />}
            </li>
          ))}
        </ol>
        <div className="workspace">
          <section className="settings-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">STEP 0{step + 1}</span>
                <h2>
                  {
                    [
                      "从喜欢的模板开始",
                      "让三个码各就各位",
                      "加一点你的风格",
                      "最后，检查一下",
                    ][step]
                  }
                </h2>
                <p>
                  {
                    [
                      "选一个起点，接下来交给你的灵感。",
                      "支持完整截图，我们会帮你识别与裁切。",
                      "位置已经安排好，只需要专注于好看。",
                      "确认每一个细节，再把心意带走。",
                    ][step]
                  }
                </p>
              </div>
              {step === 0 ? (
                <Layers3 size={20} />
              ) : (
                <span className="count-badge">
                  {step === 1
                    ? `${Object.keys(codes).length} / 3`
                    : `0${step + 1}`}
                </span>
              )}
            </div>
            <div className="panel-content">
              {step === 0 && (
                <>
                  <div className="filter-row">
                    <button className="filter active">
                      全部模板 <span>{templates.length}</span>
                    </button>
                    <span className="muted">持续更新</span>
                  </div>
                  <div className="template-grid">
                    {templates.map((t) => (
                      <button
                        className={`template-card ${t.id === template?.id ? "selected" : ""}`}
                        key={t.id}
                        onClick={() => switchTemplate(t)}
                      >
                        <div className="template-thumbnail">
                          <img src={t.cover} alt={t.name} />
                          <span className="template-size">
                            {t.width} × {t.height}
                          </span>
                          <span className="selection-dot">
                            {t.id === template?.id && <Check size={13} />}
                          </span>
                        </div>
                        <div className="template-info">
                          <strong>{t.name}</strong>
                          <span>
                            经典模板 <i /> 三码布局
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="template-detail">
                    <span className="small-icon">
                      <ScanLine size={19} />
                    </span>
                    <div>
                      <strong>一张卡片，三份心意</strong>
                      <p>
                        微信、支付宝与赞赏码自动归位。
                        <br />
                        让收款卡也拥有你的个人风格。
                      </p>
                    </div>
                  </div>
                  <div className="format-tags">
                    <span>高清 PNG</span>
                    <span>自由换背景</span>
                    <span>二维码美化</span>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div className="notice">
                    <Info size={16} />
                    <span>
                      三个码全部必填。微信与支付宝识别成功、赞赏码确认取景后，即可继续。
                    </span>
                  </div>
                  <div className="code-uploads">
                    {(["wechat", "alipay", "reward"] as CodeKind[]).map(
                      (kind) => (
                        <div
                          className={`code-upload ${codes[kind] ? "has-code" : ""}`}
                          key={kind}
                        >
                          <div className="code-heading">
                            <span className={`payment-icon ${kind}`}>
                              {kind === "wechat" ? (
                                <MessageCircle size={20} />
                              ) : kind === "alipay" ? (
                                <span>支</span>
                              ) : (
                                <Heart size={19} />
                              )}
                            </span>
                            <div>
                              <strong>{names[kind]}</strong>
                              <span>
                                {codes[kind]
                                  ? kind === "reward"
                                    ? "已确认取景"
                                    : "已识别 · 内容已提取"
                                  : kind === "reward"
                                    ? "保留完整原码，独立裁切"
                                    : "上传原码或完整收款截图"}
                              </span>
                            </div>
                            <span className="required">必填</span>
                          </div>
                          {codes[kind] ? (
                            <div className="uploaded-row">
                              <img src={codes[kind]!.image} alt={names[kind]} />
                              <span>{codes[kind]!.name}</span>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setCodes((c) => {
                                    const n = { ...c };
                                    delete n[kind];
                                    return n;
                                  })
                                }
                              >
                                移除
                              </button>
                            </div>
                          ) : (
                            <UploadButton
                              className="dropzone"
                              label={
                                busy === kind ? "正在识别…" : "点击上传图片"
                              }
                              onFile={(f) => {
                                if (!busy) uploadCode(kind, f);
                              }}
                            />
                          )}
                          {kind === "reward" && codes.reward && (
                            <button
                              className="text-button"
                              onClick={() =>
                                setCrop({
                                  src: codes.reward!.image,
                                  initial: codes.reward!.crop!,
                                  title: "微调赞赏码取景",
                                  kind: "reward",
                                  fileName: codes.reward!.name,
                                })
                              }
                            >
                              微调取景与对齐
                            </button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                  <p className="help-text">
                    支持 JPG、PNG、WebP，每张最大 20 MB。
                  </p>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="editor-tabs">
                    {Object.entries({
                      content: "内容",
                      wechat: "微信",
                      alipay: "支付宝",
                      reward: "赞赏码",
                    }).map(([k, n]) => (
                      <button
                        key={k}
                        className={tab === k ? "active" : ""}
                        onClick={() => setTab(k as typeof tab)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {tab === "content" && (
                    <div className="content-controls">
                      {avatar?.contentEditable && (
                        <div className="field">
                          <div className="field-heading">
                            <label>主头像</label>
                            <Reset
                              onClick={() => resetEdit("images", avatar.id)}
                            />
                          </div>
                          <div className="avatar-edit">
                            <img
                              src={edits.images[avatar.id] ?? avatar.src}
                              alt="主头像"
                            />
                            <div>
                              <UploadButton
                                label="上传头像"
                                onFile={(f) => uploadContent(avatar.id, f)}
                              />
                              <p className="muted">圆形裁切，位置固定</p>
                            </div>
                          </div>
                          <AssetPresets
                            assets={
                              template?.assets.filter(
                                (a) => a.category === "avatar",
                              ) ?? []
                            }
                            value={edits.images[avatar.id]}
                            onChange={(v) => updateEdit("images", avatar.id, v)}
                          />
                        </div>
                      )}
                      {signature?.contentEditable && (
                        <label className="field">
                          署名
                          <div className="input-with-count">
                            <input
                              value={
                                edits.texts[signature.id] ??
                                signature.defaultText
                              }
                              aria-label="署名"
                              onChange={(e) =>
                                updateEdit(
                                  "texts",
                                  signature.id,
                                  Array.from(e.target.value)
                                    .slice(0, signature.maxLength)
                                    .join(""),
                                )
                              }
                            />
                            <span>
                              {
                                Array.from(
                                  edits.texts[signature.id] ??
                                    signature.defaultText,
                                ).length
                              }
                              /{signature.maxLength}
                            </span>
                          </div>
                          <Reset
                            onClick={() => resetEdit("texts", signature.id)}
                          />
                        </label>
                      )}
                      {background?.contentEditable && (
                        <div className="field">
                          <div className="field-heading">
                            <label>背景图片</label>
                            <Reset
                              onClick={() => {
                                resetEdit("images", background.id);
                                setEdits((e) => ({ ...e, backgroundY: 50 }));
                              }}
                            />
                          </div>
                          <UploadButton
                            label="替换背景"
                            onFile={(f) =>
                              uploadContent(background.id, f, true)
                            }
                          />
                          <AssetPresets
                            assets={
                              template?.assets.filter(
                                (a) => a.category === "background",
                              ) ?? []
                            }
                            value={edits.images[background.id]}
                            onChange={(v) =>
                              updateEdit("images", background.id, v)
                            }
                          />
                          <label className="range-field">
                            <span>
                              上下取景<small>{edits.backgroundY}%</small>
                            </span>
                            <input
                              aria-label="背景上下取景"
                              type="range"
                              value={edits.backgroundY}
                              onChange={(e) =>
                                setEdits({
                                  ...edits,
                                  backgroundY: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                      {template?.nodes
                        .filter((n) => n.role === "text" && n.contentEditable)
                        .map((n) => (
                          <label className="field" key={n.id}>
                            {n.name}
                            <input
                              maxLength={n.maxLength}
                              value={edits.texts[n.id] ?? n.defaultText}
                              onChange={(e) =>
                                updateEdit("texts", n.id, e.target.value)
                              }
                            />
                            <Reset onClick={() => resetEdit("texts", n.id)} />
                          </label>
                        ))}
                      {template?.options.map((o) => (
                        <label className="field" key={o.id}>
                          {o.name}
                          <select
                            value={edits.choices[o.id] ?? o.defaultId}
                            onChange={(e) =>
                              updateEdit("choices", o.id, e.target.value)
                            }
                          >
                            {o.choices.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      {template?.nodes
                        .filter((n) => n.colorEditable)
                        .map((n) => (
                          <ColorField
                            key={n.id}
                            label={n.name + "颜色"}
                            value={edits.colors[n.id] ?? n.color}
                            onChange={(v) => updateEdit("colors", n.id, v)}
                            onReset={() => resetEdit("colors", n.id)}
                            preview={preview}
                          />
                        ))}
                      <div className="locked-note">
                        <LockKeyhole size={14} />
                        其他图层按模板默认效果呈现
                      </div>
                    </div>
                  )}
                  {(tab === "wechat" || tab === "alipay") &&
                    (template?.nodes.find((n) => n.role === tab)
                      ?.styleEditable ? (
                      <QRControls
                        style={styles[tab]}
                        onChange={(s) => setStyles({ ...styles, [tab]: s })}
                        preview={preview}
                      />
                    ) : (
                      <div className="notice">此模板的二维码样式已锁定。</div>
                    ))}
                  {tab === "reward" && (
                    <div className="content-controls">
                      <div className="notice">
                        赞赏码保留原始编码图案，头像与右下图标按模板顺序覆盖。
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          if (codes.reward)
                            setCrop({
                              src: codes.reward.image,
                              initial: codes.reward.crop!,
                              title: "微调赞赏码取景",
                              kind: "reward",
                              fileName: codes.reward.name,
                            });
                        }}
                      >
                        微调底图取景与对齐
                      </button>
                      {rewardAvatar?.contentEditable && (
                        <div className="field">
                          <div className="field-heading">
                            <label>中心头像</label>
                            <Reset
                              onClick={() =>
                                resetEdit("images", rewardAvatar.id)
                              }
                            />
                          </div>
                          <UploadButton
                            label="上传并裁切头像"
                            onFile={(f) => uploadContent(rewardAvatar.id, f)}
                          />
                          <select
                            aria-label="赞赏码预设头像"
                            value={
                              edits.images[rewardAvatar.id]?.startsWith("/")
                                ? edits.images[rewardAvatar.id]
                                : ""
                            }
                            onChange={(e) =>
                              e.target.value
                                ? updateEdit(
                                    "images",
                                    rewardAvatar.id,
                                    e.target.value,
                                  )
                                : resetEdit("images", rewardAvatar.id)
                            }
                          >
                            <option value="">模板默认 / 上传头像</option>
                            {template?.assets
                              .filter((a) => a.category === "rewardAvatar")
                              .map((a) => (
                                <option key={a.id} value={a.src}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {rewardIcon && (
                        <label className="field">
                          右下图标
                          <select
                            value={edits.images[rewardIcon.id] ?? ""}
                            onChange={(e) =>
                              e.target.value
                                ? updateEdit(
                                    "images",
                                    rewardIcon.id,
                                    e.target.value,
                                  )
                                : resetEdit("images", rewardIcon.id)
                            }
                          >
                            <option value="">模板默认图标</option>
                            {template?.assets
                              .filter((a) => a.category === "rewardIcon")
                              .map((a) => (
                                <option key={a.id} value={a.src}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                          <span className="muted">
                            仅可选择管理员提供的预设
                          </span>
                        </label>
                      )}
                      <p className="help-text">
                        取景变化后，请重新确认中心与右下覆盖层没有触碰编码图案。
                      </p>
                    </div>
                  )}
                </>
              )}
              {step === 3 && (
                <div className="review-controls">
                  <div className="export-card">
                    <span>
                      <ImagePlus size={25} />
                    </span>
                    <div>
                      <strong>高清 PNG</strong>
                      <p>
                        {template ? template.width * 2 : 4096} ×{" "}
                        {template ? template.height * 2 : 4096} px · 2 倍导出
                      </p>
                    </div>
                    <span className="pill">无水印</span>
                  </div>
                  <div className={`check-item ${checked ? "passed" : ""}`}>
                    <ShieldCheck size={21} />
                    <div>
                      <strong>二维码内容一致性</strong>
                      <p>
                        {checked
                          ? "美化后与成品识别均已通过"
                          : "检查微信、支付宝美化与成品内容"}
                      </p>
                    </div>
                    {checked ? (
                      <Check size={18} />
                    ) : (
                      <button
                        className="text-button"
                        disabled={!!busy || rendering}
                        onClick={verify}
                      >
                        {busy === "verify" ? "检查中…" : "开始检查"}
                      </button>
                    )}
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={rewardChecked}
                      onChange={(e) => setRewardChecked(e.target.checked)}
                    />
                    <span>已放大检查赞赏码，覆盖层没有遮挡编码图案</span>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={appChecked}
                      onChange={(e) => setAppChecked(e.target.checked)}
                    />
                    <span>
                      已使用微信、支付宝测试对应收款码，并使用微信测试赞赏码
                    </span>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => setInspect(true)}
                  >
                    <Expand size={14} />
                    放大成品进行扫码测试
                  </button>
                  <div className="notice">
                    自动识别用于确认二维码内容一致。实际收款效果以对应 App
                    的测试结果为准。
                  </div>
                  {downloaded && (
                    <div className="success-message">
                      <CheckCheck size={18} />
                      高清图片已下载，感谢每一份心意。
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="panel-footer">
              {step > 0 ? (
                <button
                  className="secondary back-button"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ArrowLeft size={15} />
                  上一步
                </button>
              ) : (
                <span className="footer-hint">
                  <Check size={14} />
                  已选择 {template ? 1 : 0} 个模板
                </span>
              )}
              {step < 3 ? (
                <button
                  className="primary"
                  disabled={
                    !template || !!busy || (step === 1 && !ready(codes))
                  }
                  onClick={() => {
                    setError("");
                    setStep((s) => s + 1);
                  }}
                >
                  {step === 0 ? "使用这个模板" : "下一步"}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    !checked ||
                    !rewardChecked ||
                    !appChecked ||
                    !!busy ||
                    rendering
                  }
                  onClick={download}
                >
                  <Download size={16} />
                  {busy === "download" ? "正在导出…" : "下载高清 PNG"}
                </button>
              )}
            </div>
          </section>
          <section className="preview-panel">
            <div className="preview-toolbar">
              <div>
                <span className="live-dot" />
                <strong>实时预览</strong>
                <span className="preview-version">
                  {template ? `v${template.version}.0` : ""}
                </span>
              </div>
              <div>
                <button
                  className="icon-button"
                  title="恢复模板默认设置（保留上传的三个码）"
                  aria-label="恢复模板默认设置"
                  onClick={() => {
                    setEdits(emptyEdits());
                    setStyles({ wechat: presetStyle(), alipay: presetStyle() });
                    say("已恢复模板默认设置，上传的三个码已保留");
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <span className="toolbar-divider" />
                <button
                  className="icon-button"
                  aria-label="放大预览"
                  onClick={() => setInspect(true)}
                >
                  <Expand size={16} />
                </button>
              </div>
            </div>
            <div className="preview-stage">
              <div className="artboard">
                {preview ? (
                  <img src={preview} alt="收款卡实时预览" />
                ) : (
                  <div className="preview-placeholder">
                    <LoaderCircle className="spin" size={25} />
                    <span>正在准备模板</span>
                  </div>
                )}
                {rendering && preview && (
                  <span className="render-indicator">
                    <LoaderCircle className="spin" size={12} />
                    更新中
                  </span>
                )}
              </div>
              <div className="canvas-meta">
                <span>
                  {template?.width ?? 2048} × {template?.height ?? 2048} px
                </span>
                <span>
                  原始比例 <ChevronDown size={11} />
                </span>
              </div>
            </div>
            <div className="preview-bottom">
              <span>
                <LockKeyhole size={13} />
                模板布局已锁定，内容自动对齐
              </span>
              <span>所见即所得</span>
            </div>
          </section>
        </div>
        <div className="page-bottom">
          <LocalNote />
          <span>
            一点个性，一份心意。
            <Heart size={12} />
          </span>
        </div>
        {error && (
          <div className="toast error" role="alert">
            <Info size={17} />
            <span>{error}</span>
            <button aria-label="关闭提示" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
      </main>
      {crop && (
        <CropDialog
          src={crop.src}
          initial={crop.initial}
          title={crop.title}
          reward={crop.kind === "reward"}
          onClose={() => setCrop(undefined)}
          onConfirm={(bounds, url) => {
            if (crop.kind)
              setCodes((c) => ({
                ...c,
                [crop.kind!]: {
                  image: crop.src,
                  crop: bounds,
                  confirmed: true,
                  name: crop.fileName,
                },
              }));
            if (crop.nodeId) updateEdit("images", crop.nodeId, url);
            setCrop(undefined);
          }}
        />
      )}
      {inspect && (
        <div className="modal-backdrop inspect-backdrop">
          <button
            className="inspect-close secondary"
            onClick={() => setInspect(false)}
          >
            关闭预览 ×
          </button>
          <img src={preview} alt="高清成品预览" />
        </div>
      )}
    </>
  );
}
