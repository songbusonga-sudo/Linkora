import type { Template } from "./model";

export type RewardAlignmentGuide = { x: number; y: number; size: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

// The uploaded screenshot is drawn as the largest square inside the reward
// layer. Derive the alignment guide from that rendered square and the current
// avatar cover, rather than from any original PSD dimensions.
export function rewardAlignmentGuide(
  template: Template,
): RewardAlignmentGuide | undefined {
  const reward = template.nodes.find((node) => node.role === "reward");
  const avatar = template.nodes.find((node) => node.role === "rewardAvatar");
  if (!reward || !avatar) return undefined;

  const outputSize = Math.min(reward.width, reward.height);
  if (!Number.isFinite(outputSize) || outputSize <= 0) return undefined;

  const outputX = reward.x + (reward.width - outputSize) / 2;
  const outputY = reward.y + (reward.height - outputSize) / 2;
  const avatarSize = Math.min(avatar.width, avatar.height) / outputSize;
  const size = clamp(avatarSize * 0.94, 0, 1);
  const centerX = (avatar.x + avatar.width / 2 - outputX) / outputSize;
  const centerY = (avatar.y + avatar.height / 2 - outputY) / outputSize;

  return {
    x: clamp(centerX - size / 2, 0, 1 - size),
    y: clamp(centerY - size / 2, 0, 1 - size),
    size,
  };
}
