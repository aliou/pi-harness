import { visibleWidth } from "@mariozechner/pi-tui";

export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "-";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost)}`;
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "-";
  if (count < 1000) return Math.floor(count).toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n.toLocaleString();
}

export function formatResetTime(date: Date | null, timezone?: string): string {
  if (!date) return "Unknown";
  const tz = timezone ?? getLocalTimezone();
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  };
  if (isToday) {
    return date.toLocaleTimeString(undefined, timeFormat).toLowerCase();
  }
  const dateFormat: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...timeFormat,
  };
  return date.toLocaleString(undefined, dateFormat).toLowerCase();
}

export function padLeft(value: string, len: number): string {
  const width = visibleWidth(value);
  if (width >= len) return value;
  return `${" ".repeat(len - width)}${value}`;
}

export function padRight(value: string, len: number): string {
  const width = visibleWidth(value);
  if (width >= len) return value;
  return `${value}${" ".repeat(len - width)}`;
}

export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
