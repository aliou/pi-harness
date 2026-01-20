export const DUMB_ZONE_MESSAGE = "YOU HAVE ENTERED THE DUMB ZONE";

// ============================================================================
// QUANTITATIVE THRESHOLDS
// ============================================================================

/**
 * Context window utilization thresholds (as percentages).
 * These determine when we're entering the "dumb zone" based on token usage.
 */
export const CONTEXT_THRESHOLDS = {
  /** Warning threshold - getting close to dumb zone */
  WARNING: 30,

  /** Danger threshold - fully in the dumb zone */
  DANGER: 35,

  /** Critical threshold - severe degradation expected */
  CRITICAL: 50,
} as const;

/**
 * Compaction sensitivity multiplier.
 * After compaction, apply this multiplier to thresholds (making them stricter).
 *
 * Rationale: Compaction is lossy. If you're hitting high token usage AFTER
 * compaction, you're doing it wrong and should start fresh.
 *
 * Examples with 0.7 multiplier:
 * - WARNING: 30% → 21% after compaction
 * - DANGER: 35% → 24.5% after compaction
 */
export const POST_COMPACTION_MULTIPLIER = 0.7;

/**
 * Token growth rate thresholds.
 * Measures tokens added per turn to detect bloat/churn.
 */
export const GROWTH_RATE_THRESHOLDS = {
  /** Normal: ~1-2k tokens per turn is reasonable */
  NORMAL: 2000,

  /** High: >4k tokens per turn suggests verbosity/churn */
  HIGH: 4000,

  /** Extreme: >8k tokens per turn is likely slop/bloat */
  EXTREME: 8000,
} as const;

/**
 * Output/Input ratio thresholds.
 * Ratio of output tokens to input tokens in recent turns.
 * Declining ratio can indicate degrading response quality.
 */
export const OUTPUT_INPUT_RATIO = {
  /** Healthy: Agent producing substantial output relative to context */
  HEALTHY_MIN: 0.05,

  /** Concerning: Very low output relative to massive context */
  CONCERNING_MAX: 0.02,
} as const;

/**
 * Message density thresholds.
 * Average tokens per message - trending up indicates bloat.
 */
export const MESSAGE_DENSITY = {
  /** Normal: ~1-2k tokens per message */
  NORMAL: 2000,

  /** High: >3k tokens per message */
  HIGH: 3000,
} as const;

// ============================================================================
// PHRASE PATTERN DETECTION (supplementary)
// ============================================================================

/**
 * Phrase patterns that indicate dumb zone behavior.
 * These are supplementary to quantitative checks.
 */
export const DUMB_ZONE_PATTERNS: readonly RegExp[] = [
  /excellent catch/i,
  /good\s+catch/i,
  /you are absolutely right/i,
];

// ============================================================================
// UI SETTINGS
// ============================================================================

/** Minimum time between overlay displays to avoid spam (ms) */
export const OVERLAY_COOLDOWN_MS = 30000; // 30 seconds
