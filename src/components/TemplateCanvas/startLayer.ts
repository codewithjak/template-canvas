/**
 * startLayer.ts — pure visibility logic for the canvas Start Layer
 * (activation doc T1.2). Kept out of the component so it is unit-testable
 * without React.
 */
import type { CanvasPage } from '../../types/canvas'

/**
 * A pristine document: exactly one page and that page empty. This is the
 * condition for a data-flow post-condition (T1.7 seeding) — which must NOT be
 * disabled just because the user dismissed the visual layer.
 */
export function isCanvasPristine(pages: CanvasPage[]): boolean {
  return pages.length === 1 && pages[0].elements.length === 0
}

/**
 * The Start Layer shows on a pristine document that has not been dismissed this
 * session. Loading a template or inserting any element makes `pages`
 * non-pristine, so the layer hides naturally — no separate route/entry check
 * (activation doc §4). Dismissal (`'Start blank'`) hides only the visual layer,
 * not the seeding post-condition — see `isCanvasPristine`.
 */
export function shouldShowStartLayer(pages: CanvasPage[], dismissed: boolean): boolean {
  return !dismissed && isCanvasPristine(pages)
}
