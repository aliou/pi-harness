import type { RateLimitWindow } from "../types";

export interface WindowProjection {
  pacePercent: number | null;
  progress: number | null; // 0..1
  projectedPercent: number; // 0..+
  usedPercent: number;
}

export type RiskSeverity = "none" | "warning" | "high" | "critical";

export interface RiskAssessment extends WindowProjection {
  usedFloorPercent: number | null;
  warnProjectedPercent: number | null;
  highProjectedPercent: number | null;
  criticalProjectedPercent: number | null;
  severity: RiskSeverity;
}

const MIN_PACE_PERCENT = 5;

// Threshold interpolation points
// Early window (0% progress) -> Late window (100% progress)
const THRESHOLDS = {
  usedFloor: { start: 33, end: 8 },
  warnProjected: { start: 260, end: 120 },
  highProjected: { start: 320, end: 145 },
  criticalProjected: { start: 400, end: 170 },
};

function interpolate(start: number, end: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return start + (end - start) * clampedProgress;
}

export function inferWindowSeconds(label: string): number | null {
  const lower = label.toLowerCase();
  if (lower.includes("5-hour") || lower.includes("5h")) {
    return 5 * 60 * 60;
  }
  if (
    lower.includes("7-day") ||
    lower.includes("week") ||
    lower.includes("weekly")
  ) {
    return 7 * 24 * 60 * 60;
  }
  const hourMatch = lower.match(/(\d+)\s*h/);
  if (hourMatch?.[1]) return Number(hourMatch[1]) * 60 * 60;
  const dayMatch = lower.match(/(\d+)\s*d/);
  if (dayMatch?.[1]) return Number(dayMatch[1]) * 24 * 60 * 60;
  return null;
}

export function getPacePercent(window: RateLimitWindow): number | null {
  const windowSeconds =
    window.windowSeconds ?? inferWindowSeconds(window.label);
  if (!windowSeconds || !window.resetsAt) return null;
  const totalMs = windowSeconds * 1000;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = totalMs - remainingMs;
  const percent = (elapsedMs / totalMs) * 100;
  return Math.max(0, Math.min(100, percent));
}

export function getProjectedPercent(
  usedPercent: number,
  pacePercent?: number | null,
): number {
  if (pacePercent === null || pacePercent === undefined) return usedPercent;
  const effectivePace = Math.max(MIN_PACE_PERCENT, pacePercent);
  return Math.max(0, (usedPercent / effectivePace) * 100);
}

export function assessWindowRisk(window: RateLimitWindow): RiskAssessment {
  const pacePercent = getPacePercent(window);
  const projectedPercent = getProjectedPercent(window.usedPercent, pacePercent);

  // Calculate progress (0 to 1) through the window
  let progress: number | null = null;
  if (pacePercent !== null) {
    progress = pacePercent / 100;
  }

  const base: WindowProjection = {
    pacePercent,
    progress,
    projectedPercent,
    usedPercent: window.usedPercent,
  };

  // Fallback when pace/progress unavailable: use static thresholds on projected only
  if (progress === null) {
    let severity: RiskSeverity = "none";
    if (projectedPercent >= 100) severity = "critical";
    else if (projectedPercent >= 90) severity = "high";
    else if (projectedPercent >= 80) severity = "warning";

    return {
      ...base,
      usedFloorPercent: null,
      warnProjectedPercent: 80,
      highProjectedPercent: 90,
      criticalProjectedPercent: 100,
      severity,
    };
  }

  // Dynamic thresholds based on window progress
  const usedFloorPercent = interpolate(
    THRESHOLDS.usedFloor.start,
    THRESHOLDS.usedFloor.end,
    progress,
  );
  const warnProjectedPercent = interpolate(
    THRESHOLDS.warnProjected.start,
    THRESHOLDS.warnProjected.end,
    progress,
  );
  const highProjectedPercent = interpolate(
    THRESHOLDS.highProjected.start,
    THRESHOLDS.highProjected.end,
    progress,
  );
  const criticalProjectedPercent = interpolate(
    THRESHOLDS.criticalProjected.start,
    THRESHOLDS.criticalProjected.end,
    progress,
  );

  // Determine severity
  let severity: RiskSeverity = "none";
  if (window.usedPercent >= usedFloorPercent) {
    if (projectedPercent >= criticalProjectedPercent) {
      severity = "critical";
    } else if (projectedPercent >= highProjectedPercent) {
      severity = "high";
    } else if (projectedPercent >= warnProjectedPercent) {
      severity = "warning";
    }
  }

  return {
    ...base,
    usedFloorPercent,
    warnProjectedPercent,
    highProjectedPercent,
    criticalProjectedPercent,
    severity,
  };
}

export function getSeverityColor(
  severity: RiskSeverity,
): "success" | "warning" | "error" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "warning":
      return "warning";
    default:
      return "success";
  }
}
