export const RECENT_COLORS_KEY = "linkora-recent-colors";
export const RECENT_COLORS_EVENT = "linkora-recent-colors-change";
export const RECENT_COLORS_LIMIT = 8;

export function normalizeRecentColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((color): color is string =>
    typeof color === "string" && /^#[\da-f]{6}$/i.test(color),
  ).map((color) => color.toLowerCase()))].slice(0, RECENT_COLORS_LIMIT);
}

let memory: string[] = [];
let pending: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

export function readRecentColors(): string[] {
  try {
    memory = normalizeRecentColors(JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? "[]"));
  } catch { /* Keep this session's colors when browser storage is unavailable. */ }
  return memory;
}

export function flushRecentColor() {
  clearTimeout(timer);
  if (!pending) return;
  const colors = normalizeRecentColors([pending, ...readRecentColors()]);
  pending = undefined;
  memory = colors;
  try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors)); } catch {}
  window.dispatchEvent(new Event(RECENT_COLORS_EVENT));
}

// Save settled selections, without filling history with every drag/RGB keystroke.
export function rememberColor(color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  if (!listening) {
    window.addEventListener("pagehide", flushRecentColor);
    listening = true;
  }
  pending = color;
  clearTimeout(timer);
  timer = setTimeout(flushRecentColor, 400);
}
