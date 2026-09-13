// SQLite stores CURRENT_TIMESTAMP in UTC. Keep the administrative history
// independent of the browser's own timezone and always show China Standard Time.
export function formatBeijingTime(value: string) {
  const source = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}（北京时间）`;
}
