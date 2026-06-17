/**
 * pdfImport/config.ts
 *
 * Tunable thresholds for the import pipeline, in one place — never inline magic
 * numbers (mirrors the CONFIDENCE convention in runtimeDataStructure.ts).
 * These are the knobs Phase 0's eval harness exercises.
 */

/** Below this block confidence, an element is flagged in the fidelity report. */
export const CONFIDENCE_LOW = 0.7;

/** IoU at/above which two elements are considered a positional match (eval). */
export const IOU_MATCH = 0.5;
