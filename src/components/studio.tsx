"use client";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  ArrowRight,
  ArrowLeft,
  Download,
  Expand,
  LoaderCircle,
  RotateCcw,
  Info,
  Settings2,
} from "lucide-react";
import {
  CodeInput,
  CodeKind,
  Crop,
  Edits,
  emptyEdits,
  Template,
  TemplateDefaults,
  TemplateNode,
  selectedChoice,
} from "@/lib/model";
import {
  readImage,
  loadImage,
  decodeImage,
  autoCropReward,
  optimizedImageSource,
} from "@/lib/images";
import { drawTemplate } from "@/lib/render";
import { backgroundViewport } from "@/lib/background-transform";
import { codeFrame } from "@/lib/code-placement";
import { rewardAlignmentGuide } from "@/lib/reward-alignment";
import { presetStyle } from "@/lib/qr";
import {
  codeColors,
  rewardArtworkIds,
  unifiedQRColor,
} from "@/lib/code-appearance";
import {
  CropDialog,
  Header,
  Reset,
  RewardAlignDialog,
  UploadButton,
} from "./shared";
import QRControls from "./qr-controls";
import ColorField from "./color-field";
import AssetPresets from "./asset-presets";
import BackgroundPicker from "./background-picker";
import BackgroundCrop from "./background-crop";
import OptionPicker from "./option-picker";
const names = {
  wechat: "微信收款码",
  alipay: "支付宝收款码",
  reward: "微信赞赏码",
};
export default function Studio({
  adminTemplate,
  initialTemplates = [],
  onDefaultsChange,
  onSaveBackground,
}: {
  adminTemplate?: Template;
  initialTemplates?: Template[];
  onDefaultsChange?: (defaults: TemplateDefaults) => void;
  onSaveBackground?: (defaults: TemplateDefaults) => void;
} = {}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates),
    [template, setTemplate] = useState<Template | undefined>(
      adminTemplate ?? initialTemplates[0],
    ),
    [edits, setEdits] = useState<Edits>(
      () => adminTemplate?.defaults?.edits ?? initialTemplates[0]?.defaults?.edits ?? emptyEdits(),
    ),
    [codes, setCodes] = useState<Partial<Record<CodeKind, CodeInput>>>(
      () => adminTemplate?.defaults?.codes ?? {},
    ),
    [styles, setStyles] = useState(
      adminTemplate?.defaults?.styles ?? initialTemplates[0]?.defaults?.styles ?? {
        wechat: presetStyle(),
        alipay: presetStyle(),
      },
    ),
    [step, setStep] = useState(0),
    [backgroundEditing, setBackgroundEditing] = useState(false),
    [previewReady, setPreviewReady] = useState(false),
    [rendering, setRendering] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [inspect, setInspect] = useState(false),
    [exportImage, setExportImage] = useState<{
      url: string;
    }>(),
    [downloaded, setDownloaded] = useState(false),
    [crop, setCrop] = useState<{
      src: string;
      initial: Crop;
      defaultCrop?: Crop;
      title: string;
      nodeId?: string;
      fileName: string;
      shape?: "circle" | "square";
    }>();
  const [rewardAlignment, setRewardAlignment] = useState<{
    image: string;
    initial: Crop;
    defaultCrop: Crop;
    name: string;
  }>();
  const [openDisclosure, setOpenDisclosure] = useState<string | null>(null);
  const notified = useRef({ edits, codes, styles });
  const savedDefaults = useRef(adminTemplate?.defaults);
  const resetDefaults = adminTemplate
    ? savedDefaults.current
    : template?.defaults;
  const notify = useRef(onDefaultsChange);
  notify.current = onDefaultsChange;
  useEffect(() => {
    const previous = notified.current;
    if (
      previous.edits === edits &&
      previous.codes === codes &&
      previous.styles === styles
    )
      return;
    notified.current = { edits, codes, styles };
    notify.current?.({ edits, codes, styles });
  }, [edits, codes, styles]);
  useEffect(() => {
    if (adminTemplate) setTemplate(adminTemplate);
  }, [adminTemplate]);
  const renderTemplate = (t: Template): Template =>
    adminTemplate
      ? {
          ...t,
          defaults: undefined,
          nodes: t.nodes.map((n) => ({
            ...n,
            contentEditable:
              [
                "avatar",
                "background",
                "signature",
                "text",
                "rewardAvatar",
              ].includes(n.role) || n.contentEditable,
            styleEditable:
              ["wechat", "alipay"].includes(n.role) || n.styleEditable,
            colorEditable: n.role === "reward" || n.colorEditable,
          })),
        }
      : t.defaults
        ? {
            ...t,
            defaults: {
              ...t.defaults,
              // Page-one colors also apply to the editable default code,
              // before the user chooses to upload a replacement.
              styles: {
                wechat: t.nodes.find((n) => n.role === "wechat")?.styleEditable
                  ? styles.wechat
                  : t.defaults.styles.wechat,
                alipay: t.nodes.find((n) => n.role === "alipay")?.styleEditable
                  ? styles.alipay
                  : t.defaults.styles.alipay,
              },
            },
          }
        : t;
  const drawId = useRef(0);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const settingsPanel = useRef<HTMLElement>(null);
  const inspectCanvas = useRef<HTMLCanvasElement>(null);
  const latestCanvas = useRef<HTMLCanvasElement | null>(null);
  const modalOpen = Boolean(crop) || inspect || Boolean(exportImage);
  useEffect(() => {
    if (adminTemplate || !modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [adminTemplate, modalOpen]);
  useEffect(() => {
    if (adminTemplate) return;
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) throw Error("模板加载失败");
        return r.json();
      })
      .then((t: Template[]) => {
        setTemplates(t);
        if (t[0]) {
          setTemplate(t[0]);
          setEdits(t[0].defaults?.edits ?? emptyEdits());
          setStyles(
            t[0].defaults?.styles ?? {
              wechat: presetStyle(),
              alipay: presetStyle(),
            },
          );
        } else setError("暂无已发布模板，请先在后台配置模板。");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!template) return;
    const id = ++drawId.current;
    setRendering(true);
    setDownloaded(false);
    // Start on every edit; only the newest completed frame may be displayed.
    // The on-screen artboard is much smaller than the printable source. Keep
    // preview compositing light, then render the full-resolution image only
    // when the user downloads it.
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    const previewEdge = mobile
      ? 960
      : 1200;
    const previewScale = Math.min(
      1,
      previewEdge / Math.max(template.width, template.height),
    );
    // The desktop preview uses the same template frames as the phone. The
    // saved editor bounds are not a visual scale setting; applying them here
    // shrinks the two side payment codes when a template has compact layers.
    drawTemplate(renderTemplate(template), edits, codes, styles, previewScale)
      .then((c) => {
        if (id !== drawId.current) return;
        latestCanvas.current = c;
        for (const target of [previewCanvas.current, inspectCanvas.current]) {
          if (!target) continue;
          if (target.width !== c.width) target.width = c.width;
          if (target.height !== c.height) target.height = c.height;
          const ctx = target.getContext("2d")!;
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(c, 0, 0);
          target.dataset.revision = String(id);
        }
        setPreviewReady(true);
        setRendering(false);
      })
      .catch((e) => {
        if (id === drawId.current) {
          setError(e.message);
          setRendering(false);
        }
      });
    return () => {
      drawId.current++;
    };
  }, [template, edits, codes, styles]);
  useEffect(() => {
    const c = latestCanvas.current,
      target = inspectCanvas.current;
    if (!inspect || !c || !target) return;
    target.width = c.width;
    target.height = c.height;
    target.getContext("2d")!.drawImage(c, 0, 0);
  }, [inspect]);
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
      const value = resetDefaults?.edits[key][id];
      if (value !== undefined) values[id] = value;
      else delete values[id];
      return { ...e, [key]: values };
    });
  async function uploadCode(kind: CodeKind, file: File) {
    // Switching to a new payment code starts a new task. Keep the settings
    // area compact instead of leaving the other payment method's controls
    // open above or below the upload card.
    if (kind === "wechat" || kind === "alipay") setOpenDisclosure(null);
    setBusy(kind);
    setError("");
    try {
      const image = await readImage(file);
      if (kind === "reward") {
        const source = await loadImage(image);
        const size = Math.min(source.width, source.height);
        let automaticCrop = {
          x: (source.width - size) / 2,
          y: (source.height - size) / 2,
          size,
        };
        try {
          automaticCrop = await autoCropReward(image);
        } catch {
          // A user can always complete the required manual alignment, even
          // when a screenshot is too unusual for automatic detection.
        }
        setRewardAlignment({
          image,
          initial: automaticCrop,
          defaultCrop: automaticCrop,
          name: file.name,
        });
      } else {
        const content = await decodeImage(image);
        setCodes((c) => ({
          ...c,
          [kind]: {
            image,
            content,
            confirmed: true,
            name: file.name,
          },
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
        title:
          template?.nodes.find((n) => n.id === id)?.role === "rewardAvatar"
            ? "裁切赞赏码正方形头像"
            : "裁切头像",
        shape:
          template?.nodes.find((n) => n.id === id)?.role === "rewardAvatar"
            ? "square"
            : "circle",
        nodeId: id,
        fileName: file.name,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download() {
    if (!template || busy || rendering) return;
    setBusy("download");
    setError("");
    try {
      const mobile = window.matchMedia("(pointer: coarse)").matches;
      const c = await drawTemplate(
        renderTemplate(template),
        edits,
        codes,
        styles,
        // A 1000px square stays sharp on phone screens while making the PNG
        // quick to encode, upload, and long-press save in mobile browsers.
        mobile ? Math.min(1, 1000 / Math.max(template.width, template.height)) : 2,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG 导出失败"))),
          "image/png",
        ),
      );
      const filename = `Linkora-${template.id}-v${template.version}-${c.width}px.png`;
      if (mobile) {
        // WeChat and other in-app browsers cannot save a blob: URL to the
        // photo album. Upload first, then open only the ordinary HTTPS PNG
        // URL, so the image the user sees is also the image they long-press.
        say("高清图片已生成，正在准备可保存图片…");
        const response = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        const result = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !result.url)
          throw Error(result.error || "导出图片保存失败");
        setExportImage({ url: new URL(result.url, window.location.origin).href });
        say("图片已生成，长按图片即可保存到相册");
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
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
  function closeExportImage() {
    setExportImage(undefined);
  }
  const switchTemplate = (t: Template) => {
    if (t.id === template?.id && t.version === template.version) return;
    setTemplate(t);
    setEdits(t.defaults?.edits ?? emptyEdits());
    setStyles(
      t.defaults?.styles ?? { wechat: presetStyle(), alipay: presetStyle() },
    );
  };
  const signature = template?.nodes.find((n) => n.role === "signature");
  const avatar = template?.nodes.find((n) => n.role === "avatar");
  const background = template?.nodes.find((n) => n.role === "background");
  const backgroundArea = template
    ? backgroundViewport(template, template.nodes)
    : undefined;
  const rewardAvatar = template?.nodes.find((n) => n.role === "rewardAvatar");
  const rewardIcon = template?.nodes.find((n) => n.role === "rewardIcon");
  const backgroundSrc = background
    ? edits.images[background.id] || background.src
    : "";
  const backgroundTransform = backgroundSrc
      ? (edits.backgroundTransforms?.[backgroundSrc] ?? {
        scale: 1,
        x: 0,
        y: 0,
      })
    : undefined;
  const updateBackgroundTransform = (
    value: NonNullable<typeof backgroundTransform>,
  ) => {
    if (!background) return;
    setEdits((current) => ({
      ...current,
      backgroundTransforms: {
        ...current.backgroundTransforms,
        [current.images[background.id] || background.src]: value,
      },
    }));
  };
  const resetBackgroundTransform = () => {
    if (!background) return;
    setEdits((current) => {
      const src = current.images[background.id] || background.src;
      const transforms = { ...current.backgroundTransforms };
      const saved = resetDefaults?.edits.backgroundTransforms?.[src];
      if (saved) transforms[src] = saved;
      else delete transforms[src];
      return {
        ...current,
        backgroundTransforms: transforms,
        backgroundY:
          src === resetDefaults?.edits.images[background.id]
            ? resetDefaults.edits.backgroundY
            : 50,
      };
    });
  };
  const rewardLayerRoots = new Set(
    template?.nodes
      .filter((n) => n.role.startsWith("reward"))
      .map((n) => n.id.split("-")[0]),
  );
  const isRewardOption = (option: Template["options"][number]) =>
    option.choices.some((choice) =>
      choice.nodeIds.some((id) => rewardLayerRoots.has(id.split("-")[0])),
    );
  const baseSteps = [
    {
      title: "收款码上传与颜色",
      short: "收款码",
      description: "上传收款码，调整颜色，并选择赞赏码头像与图标。",
    },
    {
      title: "头像与背景",
      short: "头像与背景",
      description: "设置主头像、背景和装饰，颜色紧随对应选项。",
    },
    {
      title: "署名与提示文字",
      short: "署名与文字",
      description: "修改署名、底部两行文字，并分别调整颜色。",
    },
  ];
  const steps = adminTemplate
    ? baseSteps
    : [
        ...baseSteps,
        {
          title: "保存高清成品",
          short: "保存",
          description: "生成当前成品，长按高清图片即可保存到相册。",
        },
      ];
  function beginBackgroundEdit() {
    setBackgroundEditing(true);
  }
  function goStep(next: number) {
    setBackgroundEditing(false);
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
    requestAnimationFrame(() => {
      if (panelContent.current) panelContent.current.scrollTop = 0;
      stepHeading.current?.focus({ preventScroll: true });
    });
  }
  const colorNodes =
    template?.nodes.filter((n) => {
      if (!n.colorEditable && !(adminTemplate && n.role === "reward"))
        return false;
      const option = template.options.find((o) =>
        o.choices.some((c) => c.nodeIds.includes(n.id)),
      );
      return option
        ? selectedChoice(option, edits.choices[option.id]).nodeIds.includes(
            n.id,
          )
        : n.visible;
    }) ?? [];
  const rewardColorIds = template ? new Set([...rewardArtworkIds(template, "rewardIcon"), ...rewardArtworkIds(template, "rewardAvatar")]) : new Set<string>();
  function layerColor(n: TemplateNode | undefined, label?: string) {
    if (!n || rewardColorIds.has(n.id) || !colorNodes.some((colorNode) => colorNode.id === n.id))
      return null;
    return (
      <ColorField
        key={n.id}
        label={label ?? n.name + "颜色"}
        value={edits.colors[n.id] ?? n.color}
        onChange={(value) => updateEdit("colors", n.id, value)}
        onReset={() => resetEdit("colors", n.id)}
      />
    );
  }
  function updateLabelChoiceColor(nodeIds: string[], value: string) {
    setEdits((current) => ({
      ...current,
      colors: {
        ...current.colors,
        ...Object.fromEntries(nodeIds.map((id) => [id, value])),
      },
    }));
  }
  function resetLabelChoiceColor(nodeIds: string[]) {
    setEdits((current) => {
      const colors = { ...current.colors };
      nodeIds.forEach((id) => delete colors[id]);
      return { ...current, colors };
    });
  }
  function optionControl(option: Template["options"][number]) {
    const selected = selectedChoice(option, edits.choices[option.id]);
    const labelNode = template?.nodes.find((n) => n.id === selected.nodeIds[0]);
    return (
      <section
        className="studio-field-group"
        key={option.id}
        aria-label={option.name + "设置"}
      >
        {option.id === "label-language" ? (
          <div className="field" role="radiogroup" aria-label={option.name}>
            <span>{option.name}</span>
            <div className="label-language-choices">
              {option.choices.map((choice) => (
                <label className="check-label" key={choice.id}>
                  <input
                    type="radio"
                    name={option.id}
                    value={choice.id}
                    checked={
                      selected.id === choice.id
                    }
                    onChange={() => updateEdit("choices", option.id, choice.id)}
                  />
                  {choice.name}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <OptionPicker
            option={option}
            nodes={template!.nodes}
            value={edits.choices[option.id]}
            defaultValue={
              resetDefaults?.edits.choices[option.id] ?? option.defaultId
            }
            onChange={(value) => {
              if (option.replacementNodeId)
                updateEdit("images", option.replacementNodeId, "");
              updateEdit("choices", option.id, value);
            }}
          />
        )}
        {option.id === "label-language" ? (
          labelNode && (
            <ColorField
              label="二维码下方文字颜色"
              value={edits.colors[labelNode.id] ?? labelNode.color}
              onChange={(value) => updateLabelChoiceColor(selected.nodeIds, value)}
              onReset={() => resetLabelChoiceColor(selected.nodeIds)}
            />
          )
        ) : (
          selected.nodeIds.map((id) =>
            layerColor(
              template!.nodes.find((n) => n.id === id),
              option.id === "reward-icon" ? "赞赏码图标颜色" : undefined,
            ),
          )
        )}
      </section>
    );
  }
  function textControl(n: TemplateNode, label: string) {
    if (!adminTemplate && !n.contentEditable && !n.colorEditable) return null;
    const isSignature = n.role === "signature";
    return (
      <section
        className="studio-field-group"
        key={n.id}
        aria-label={label + "设置"}
      >
        {(adminTemplate || n.contentEditable) && (
          <div className="field">
            <div className="field-heading">
              <label htmlFor={"studio-text-" + n.id}>{label}</label>
              <Reset onClick={() => resetEdit("texts", n.id)} />
            </div>
            <div
              className={
                isSignature
                  ? "input-with-count"
                  : n.fixedDashes
                    ? "fixed-dash-input"
                    : undefined
              }
            >
              {n.fixedDashes && <span aria-hidden="true">-</span>}
              <input
                id={"studio-text-" + n.id}
                aria-label={label}
                value={edits.texts[n.id] ?? n.defaultText}
                onChange={(event) =>
                  updateEdit(
                    "texts",
                    n.id,
                    Array.from(event.target.value)
                      .slice(0, n.maxLength)
                      .join(""),
                  )
                }
              />
              {n.fixedDashes && <span aria-hidden="true">-</span>}
              {isSignature && (
                <span>
                  {Array.from(edits.texts[n.id] ?? n.defaultText).length}/
                  {n.maxLength}
                </span>
              )}
            </div>
            {n.fixedDashes && (
              <span className="muted">
                两侧短横线固定，文字自动居中 · 最多 {n.maxLength} 字
              </span>
            )}
          </div>
        )}
        {layerColor(n, label + "颜色")}
      </section>
    );
  }
  const frames =
    template?.nodes
      .filter((n) => ["wechat", "alipay", "reward"].includes(n.role))
      .map((n) => codeFrame(template, n)?.id) ?? [];
  const sharedColors = template ? codeColors(template, edits, styles.wechat) : { frame: "#bebcbc", ink: "#000000" };
  function updateCodeColor(key: "frame" | "ink", value: string) {
    setEdits((current) => ({ ...current, codeColors: { ...current.codeColors, [key]: value } }));
    if (key === "ink") setStyles((current) => ({
      wechat: unifiedQRColor(current.wechat, value),
      alipay: unifiedQRColor(current.alipay, value),
    }));
  }
  function resetCodeColor(key: "frame" | "ink") {
    if (!template) return;
    updateCodeColor(key, codeColors(template, resetDefaults?.edits ?? emptyEdits(), resetDefaults?.styles.wechat ?? presetStyle())[key]);
  }
  const disclosureToggle =
    (key: string) => (event: SyntheticEvent<HTMLDetailsElement>) => {
      if (event.currentTarget.open) setOpenDisclosure(key);
      else
        setOpenDisclosure((current) => (current === key ? null : current));
    };
  const otherArtworkColors = colorNodes.filter(
    (n) =>
      n.role === "image" &&
      !frames.includes(n.id) &&
      !template?.options.some((o) =>
        o.choices.some((choice) => choice.nodeIds.includes(n.id)),
      ),
  );
  function studioTools(className = "") {
    return (
      <div className={`studio-tools ${className}`.trim()}>
        <div>
          <button
            className="text-button"
            title="恢复模板默认设置（保留上传的三个码）"
            aria-label="恢复模板默认设置"
            onClick={() => {
              setEdits(resetDefaults?.edits ?? emptyEdits());
              setStyles(
                resetDefaults?.styles ?? {
                  wechat: presetStyle(),
                  alipay: presetStyle(),
                },
              );
              say("已恢复模板默认设置，上传的三个码已保留");
            }}
          >
            <RotateCcw size={16} />
            恢复默认
          </button>
          <span className="toolbar-divider" />
          <button
            className="text-button"
            disabled={!previewReady}
            aria-label="放大预览"
            onClick={() => setInspect(true)}
          >
            <Expand size={16} />
            放大预览
          </button>
        </div>
      </div>
    );
  }
  function panelFooter(className = "") {
    return (
      <div className={`panel-footer ${className}`.trim()}>
        <span className="footer-hint">
          {adminTemplate
            ? "可直接下载，修改后点击上方“保存草稿”保留。"
            : "本模板仅供个人免费使用，禁止售卖或用于任何盈利活动。"}
        </span>
        <div className="studio-footer-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={!!busy}
              onClick={() => goStep(step - 1)}
            >
              <ArrowLeft size={16} /> 上一步
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              type="button"
              className="secondary"
              disabled={!template || !!busy}
              onClick={() => goStep(step + 1)}
            >
              下一步 <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={!template || !!busy || rendering}
              onClick={download}
            >
              <Download size={16} />
              {busy === "download" ? "正在生成…" : "下载高清 PNG"}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      {!adminTemplate && <Header />}
      <main
        className={`studio${adminTemplate ? " default-display-studio" : ""}`}
        data-step={step + 1}
        data-background-editing={backgroundEditing && step === 1}
        aria-label="收款卡制作"
      >
        <div className="workspace">
          <section className="preview-panel">
            {adminTemplate && (
              <div className="preview-toolbar">
                <div>
                  <span className="live-dot" />
                  <strong>实时预览</strong>
                  <span className="preview-version">
                    {template ? `v${template.version}.0` : ""}
                  </span>
                </div>
              </div>
            )}
            <div className="preview-stage">
              <div className="artboard">
                <canvas
                  ref={previewCanvas}
                  role="img"
                  aria-label="收款卡实时预览"
                />
                {backgroundEditing &&
                  step === 1 &&
                  background &&
                  (adminTemplate || background.contentEditable) && (
                    <BackgroundCrop
                      key={backgroundSrc}
                      src={backgroundSrc}
                      canvas={template!}
                      onDone={() => setBackgroundEditing(false)}
                      node={background}
                      viewport={backgroundArea}
                      value={edits.backgroundTransforms?.[backgroundSrc]}
                      legacyY={edits.backgroundY}
                      onChange={updateBackgroundTransform}
                    />
                  )}
                {!previewReady && (
                  <div className="preview-placeholder">
                    <img
                      className="preview-fallback"
                      src={optimizedImageSource(
                        template?.cover ?? "/private-assets/original.png",
                      )}
                      alt="模板预览"
                      fetchPriority="high"
                    />
                  </div>
                )}
                {rendering && previewReady && (
                  <span className="render-indicator">
                    <LoaderCircle className="spin" size={12} />
                    更新中
                  </span>
                )}
              </div>
            </div>
            <div
              className="preview-background-tools"
              hidden={
                step !== 1 ||
                !background ||
                !(adminTemplate || background.contentEditable)
              }
            >
              {backgroundEditing && backgroundTransform ? (
                <div
                  className="background-preview-controls"
                  role="group"
                  aria-label="背景调整工具"
                >
                  <div className="field-heading">
                    <strong>调整背景</strong>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setBackgroundEditing(false)}
                    >
                      <Check size={14} />
                      完成调整
                    </button>
                  </div>
                  <p className="muted">
                    图片始终裁切在上方背景区内。桌面端可拖动和拖角缩放；
                    手机端单指上下拖动，双指捏合缩放。
                  </p>
                  <div className="background-preview-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={resetBackgroundTransform}
                    >
                      重置当前背景
                    </button>
                    {onSaveBackground && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          onSaveBackground({ edits, codes, styles })
                        }
                      >
                        保存当前背景
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={beginBackgroundEdit}
                >
                  调整背景
                </button>
              )}
            </div>
          </section>
          <section
            ref={settingsPanel}
            className="settings-panel"
            aria-label="制作操作"
          >
            <div className="panel-heading">
              <div>
                <h2 ref={stepHeading} tabIndex={-1}>
                  {steps[step].title}
                </h2>
                <p>{steps[step].description}</p>
              </div>
              <span className="count-badge">
                {step + 1} / {steps.length} 步
              </span>
            </div>
            <ol className="studio-step-progress" aria-label="制作步骤">
              {steps.map((item, index) => (
                <li key={item.short}>
                  <button
                    type="button"
                    aria-current={step === index ? "step" : undefined}
                    onClick={() => goStep(index)}
                  >
                    <span>{index + 1}</span>
                    {item.short}
                  </button>
                </li>
              ))}
            </ol>
            <div className="panel-content" ref={panelContent}>
              <div
                className="studio-page"
                hidden={step !== 0}
                role="region"
                aria-label="收款码上传与颜色"
              >
                {templates.length > 1 && (
                  <label className="field template-select">
                    模板
                    <select
                      value={template?.id ?? ""}
                      onChange={(e) => {
                        const selected = templates.find(
                          (t) => t.id === e.target.value,
                        );
                        if (selected) switchTemplate(selected);
                      }}
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="code-uploads">
                  {(["wechat", "alipay", "reward"] as CodeKind[]).map(
                    (kind) => {
                      const node = template?.nodes.find((n) => n.role === kind);
                      const canStyle =
                        kind !== "reward" &&
                        (adminTemplate || node?.styleEditable);
                      return (
                        <section
                          className={
                            "code-upload " + (codes[kind] ? "has-code" : "")
                          }
                          key={kind}
                          aria-label={names[kind] + "设置"}
                        >
                          <div className="code-heading">
                            <span className={"payment-icon " + kind}>
                              <img
                                src={
                                  kind === "alipay"
                                    ? "/ui/payment-smile-cat.png"
                                    : "/ui/payment-sparkle-cat.png"
                                }
                                alt=""
                                aria-hidden="true"
                              />
                            </span>
                            <div>
                              <strong>{names[kind]}</strong>
                              <span>
                                {codes[kind]
                                  ? kind === "reward"
                                    ? "已上传"
                                    : "已识别 · 内容已提取"
                                  : kind === "reward"
                                    ? "上传完整赞赏码后手动对齐"
                                    : "上传原码或完整收款截图"}
                              </span>
                            </div>
                            <span className="required">
                              {adminTemplate ? "默认展示" : "可选上传"}
                            </span>
                          </div>
                          {(codes[kind] || adminTemplate) && (
                            <div className="uploaded-row">
                              <img
                                src={codes[kind]?.image ?? node?.src}
                                alt={names[kind]}
                              />
                              <span>{codes[kind]?.name ?? "当前默认展示"}</span>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setCodes((current) => {
                                    const next = { ...current };
                                    delete next[kind];
                                    return next;
                                  })
                                }
                              >
                                {adminTemplate ? "恢复原图" : "移除"}
                              </button>
                            </div>
                          )}
                          <UploadButton
                            className="dropzone"
                            label={
                              busy === kind
                                ? "正在识别…"
                                : codes[kind] || adminTemplate
                                  ? "更换收款码图片"
                                  : "点击上传图片"
                            }
                            onFile={(file) => {
                              if (!busy) uploadCode(kind, file);
                            }}
                          />
                          {kind === "reward" && codes.reward && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                const reward = codes.reward;
                                if (!reward?.crop) return;
                                setRewardAlignment({
                                  image: reward.image,
                                  initial: reward.crop,
                                  defaultCrop: reward.defaultCrop ?? reward.crop,
                                  name: reward.name,
                                });
                              }}
                            >
                              重新对齐赞赏码
                            </button>
                          )}
                          {kind === "reward" && (
                            <details
                              className="studio-field-group reward-image-controls"
                              aria-label="赞赏码头像与图标"
                              open={openDisclosure === "reward-artwork"}
                              onToggle={disclosureToggle("reward-artwork")}
                            >
                              <summary>
                                <Settings2 size={14} /> 赞赏码头像与右下图标
                              </summary>
                              <div className="reward-settings-content">
                              {rewardAvatar &&
                                (adminTemplate ||
                                  rewardAvatar.contentEditable) && (
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
                                      onFile={(f) =>
                                        uploadContent(rewardAvatar.id, f)
                                      }
                                    />
                                    {template?.assets.some(
                                      (a) => a.category === "rewardAvatar",
                                    ) && (
                                      <select
                                        aria-label="赞赏码预设头像"
                                        value={
                                          edits.images[
                                            rewardAvatar.id
                                          ]?.startsWith("/")
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
                                            : resetEdit(
                                                "images",
                                                rewardAvatar.id,
                                              )
                                        }
                                      >
                                        <option value="">
                                          模板默认 / 上传头像
                                        </option>
                                        {template?.assets
                                          .filter(
                                            (a) =>
                                              a.category === "rewardAvatar",
                                          )
                                          .map((a) => (
                                            <option key={a.id} value={a.src}>
                                              {a.name}
                                            </option>
                                          ))}
                                      </select>
                                    )}
                                    {edits.images[rewardAvatar.id] && (
                                      <div className="avatar-edit reward-avatar-edit">
                                        <img
                                          src={edits.images[rewardAvatar.id]}
                                          alt="当前赞赏码中心头像"
                                        />
                                        <span className="muted">
                                          已使用上传或素材库头像，选择上方预设可切换回来。
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              {rewardIcon &&
                                template?.assets.some(
                                  (a) => a.category === "rewardIcon",
                                ) && (
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
                                        .filter(
                                          (a) => a.category === "rewardIcon",
                                        )
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

                              {template?.options
                                .filter(isRewardOption)
                                .map(optionControl)}
                              </div>
                            </details>
                          )}
                          {kind !== "reward" && canStyle && (
                            <details
                              className="code-style-options"
                              open={openDisclosure === `style-${kind}`}
                              onToggle={disclosureToggle(`style-${kind}`)}
                            >
                              <summary>
                                <Settings2 size={14} /> 更多码样式
                              </summary>
                              <QRControls
                                style={styles[kind]}
                                defaultStyle={
                                  resetDefaults?.styles[kind] ?? presetStyle()
                                }
                                onChange={(value) => {
                                  // A style change keeps only its own payment
                                  // panel active, so the other code's
                                  // settings are always collapsed.
                                  setOpenDisclosure(`style-${kind}`);
                                  setStyles((current) => ({
                                    ...current,
                                    [kind]: value,
                                  }));
                                }}
                              />
                            </details>
                          )}
                        </section>
                      );
                    },
                  )}
                </div>
                <p className="help-text">
                  已上传 {Object.keys(codes).length} / 3 个码 · 支持
                  JPG、PNG、WebP，每张最大 20 MB。
                </p>
                <section className="code-upload shared-code-colors" aria-label="三码统一颜色">
                  <details
                    className="code-style-options"
                    open={openDisclosure === "shared-colors"}
                    onToggle={disclosureToggle("shared-colors")}
                  >
                    <summary className="code-heading">
                      <span className="payment-icon shared-color-icon">
                        <img
                          src="/ui/color-picker-cat.png"
                          alt=""
                          aria-hidden="true"
                        />
                      </span>
                      <div>
                        <strong>三码统一颜色</strong>
                        <span>三个码、中心预设图案和右下角图标同步变色，上传头像保留原色</span>
                      </div>
                    </summary>
                    <div className="shared-color-controls">
                      <ColorField label="框颜色" value={sharedColors.frame} onChange={(value) => updateCodeColor("frame", value)} onReset={() => resetCodeColor("frame")} />
                      <ColorField label="内部码颜色" value={sharedColors.ink} onChange={(value) => updateCodeColor("ink", value)} onReset={() => resetCodeColor("ink")} />
                    </div>
                  </details>
                </section>
              </div>
              <div
                className="studio-page content-controls"
                hidden={step !== 1}
                role="region"
                aria-label="头像与背景"
              >
                {avatar && (adminTemplate || avatar.contentEditable) && (
                  <div className="field">
                    <div className="field-heading">
                      <label>主头像</label>
                      <Reset onClick={() => resetEdit("images", avatar.id)} />
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
                    {layerColor(avatar, "头像颜色")}
                  </div>
                )}

                {background &&
                  (adminTemplate || background.contentEditable) && (
                    <div className="field">
                      <div className="field-heading">
                        <label>背景图片</label>
                        <Reset
                          onClick={() => {
                            resetEdit("images", background.id);
                            setEdits((e) => ({
                              ...e,
                              backgroundY:
                                resetDefaults?.edits.backgroundY ?? 50,
                            }));
                          }}
                        />
                      </div>
                      <BackgroundPicker
                        key={`${template?.id}:${background.id}`}
                        defaultSrc={background.src}
                        assets={
                          template?.assets.filter(
                            (a) => a.category === "background",
                          ) ?? []
                        }
                        value={edits.images[background.id]}
                        onChange={(v) => {
                          beginBackgroundEdit();
                          setEdits((e) => ({
                            ...e,
                            images: {
                              ...e.images,
                              [background.id]: v || background.src,
                            },
                            backgroundTransforms: adminTemplate
                              ? e.backgroundTransforms
                              : {
                                  ...e.backgroundTransforms,
                                  [v || background.src]: {
                                    scale: 1,
                                    x: 0,
                                    y: 0,
                                  },
                                },
                            backgroundY: 50,
                          }));
                        }}
                      />
                      <p className="muted">
                        图片固定显示在上方背景区内，可拖动调整并缩放。
                      </p>
                      {layerColor(background, "背景颜色")}
                    </div>
                  )}

                {template?.options
                  .filter(
                    (option) =>
                      !isRewardOption(option) && option.id !== "label-language",
                  )
                  .map(optionControl)}
                {otherArtworkColors.map((n) => (
                  <section
                    key={n.id}
                    className="studio-field-group"
                    aria-label={n.name + "设置"}
                  >
                    {layerColor(n)}
                  </section>
                ))}
              </div>
              <div
                className="studio-page content-controls"
                hidden={step !== 2}
                role="region"
                aria-label="署名与提示文字"
              >
                {signature && textControl(signature, "署名")}
                {template?.nodes
                  .filter((n) => n.role === "text")
                  .map((n) => textControl(n, n.name))}
                {template?.options
                  .filter((option) => option.id === "label-language")
                  .map(optionControl)}
              </div>
              <div
                className="studio-page save-page"
                hidden={step !== 3}
                role="region"
                aria-label="保存高清成品"
              >
                <h3>保存高清成品</h3>
                <p>
                  点击下方下载按钮生成当前成品；出现预览后，长按图片即可保存到相册。
                </p>
              </div>
              {downloaded && (
                <div className="success-message">
                  <CheckCheck size={18} />
                  高清图片已下载，感谢每一份心意。
                </div>
              )}
              {studioTools("mobile-studio-tools")}
              {panelFooter("mobile-panel-footer")}
            </div>
            {studioTools("desktop-studio-tools")}
            {panelFooter("desktop-panel-footer")}
          </section>
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
          defaultCrop={crop.defaultCrop}
          title={crop.title}
          shape={crop.shape}
          onClose={() => setCrop(undefined)}
          onConfirm={(bounds, url, defaultCrop) => {
            if (crop.nodeId) updateEdit("images", crop.nodeId, url);
            setCrop(undefined);
          }}
        />
      )}
      {rewardAlignment && template && (() => {
        const guide = rewardAlignmentGuide(template);
        if (!guide) return null;
        return (
          <RewardAlignDialog
            src={rewardAlignment.image}
            initial={rewardAlignment.initial}
            defaultCrop={rewardAlignment.defaultCrop}
            guide={guide}
            onClose={() => setRewardAlignment(undefined)}
            onConfirm={(bounds) => {
              setCodes((current) => ({
                ...current,
                reward: {
                  image: rewardAlignment.image,
                  crop: bounds,
                  defaultCrop: rewardAlignment.defaultCrop,
                  confirmed: true,
                  name: rewardAlignment.name,
                },
              }));
              setRewardAlignment(undefined);
            }}
          />
        );
      })()}
      {inspect && (
        <div className="modal-backdrop inspect-backdrop">
          <button
            className="inspect-close secondary"
            onClick={() => setInspect(false)}
          >
            关闭预览 ×
          </button>
          <canvas ref={inspectCanvas} role="img" aria-label="高清成品预览" />
        </div>
      )}
      {exportImage && (
        <div className="modal-backdrop mobile-save-backdrop">
          <button
            className="inspect-close secondary"
            type="button"
            onClick={closeExportImage}
          >
            关闭 ×
          </button>
          <div className="mobile-save-content">
            <p>长按下方图片，选择“保存图片”即可保存到相册。</p>
            <img src={exportImage.url} alt="待保存的高清收款卡" />
          </div>
          <div className="mobile-save-actions">
            <button type="button" className="secondary" onClick={closeExportImage}>
              返回编辑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
