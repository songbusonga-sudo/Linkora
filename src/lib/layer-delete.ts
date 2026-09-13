import { Template, TemplateNode } from "./model";
import { isCodeFrame } from "./code-placement";

export function canDeleteLayer(node: TemplateNode) {
  return !isCodeFrame(node) && !["wechat", "alipay", "reward"].includes(node.role);
}

export function deleteLayer(t: Template, id: string): Template {
  const target = t.nodes.find((n) => n.id === id);
  if (!target) return t;
  if (!canDeleteLayer(target)) throw Error("三个收款码的码体为必填区域，不能删除");
  const nodes = t.nodes.filter((n) => n.id !== id).map((n) => {
    if (n.clipTo !== id) return n;
    const { clipTo: _clipTo, ...rest } = n;
    return rest;
  });
  const options = t.options.flatMap((option) => {
    const choices = option.choices.flatMap((choice) => {
      if (!choice.nodeIds.includes(id)) return [choice];
      const nodeIds = choice.nodeIds.filter((nodeId) => nodeId !== id);
      return nodeIds.length ? [{ ...choice, nodeIds }] : [];
    });
    if (!choices.length) return [];
    const { replacementNodeId, ...rest } = option;
    return [{
      ...rest,
      ...(replacementNodeId && replacementNodeId !== id ? { replacementNodeId } : {}),
      choices,
      defaultId: choices.some((choice) => choice.id === option.defaultId)
        ? option.defaultId : choices[0].id,
    }];
  });
  return { ...t, nodes, options, verified: false };
}
