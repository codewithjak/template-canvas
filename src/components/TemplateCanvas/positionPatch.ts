/**
 * positionPatch.ts
 *
 * The pure merge rule behind the format bar's X/Y fields, kept out of the
 * component file so it is unit-testable and so `PositionFields.tsx` stays
 * component-only (react-refresh/only-export-components).
 */
import type { CanvasElement } from './properties/elementTypes';

/** A position with any sibling fields (e.g. radio/checkbox `relativeOffset`). */
export type ElementPosition = CanvasElement['position'];

/**
 * Merge one axis onto an existing position, preserving the untouched axis and any
 * sibling field. One place owns the rule.
 */
export function mergePosition(current: ElementPosition, patch: Partial<{ x: number; y: number }>): ElementPosition {
  return { ...current, ...patch };
}
