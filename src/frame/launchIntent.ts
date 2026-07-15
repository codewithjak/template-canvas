/**
 * launchIntent.ts — how a framed page asks the canvas to do something on arrival
 * (app-frame doc §5, T2.0).
 *
 * The Dashboard cannot open a template itself: `handleOpenCloudTemplate` lives in
 * `TemplateCanvas` and hydration must stay there. So the Dashboard DECLARES an
 * intent and the canvas EXECUTES it with handlers it already has. No canvas
 * state leaks out; no hydration logic leaves the canvas.
 *
 * Carried as react-router location state, which is `unknown` at runtime (a user
 * can land on a history entry we never wrote). `readLaunchIntent` therefore
 * validates and returns null on anything unrecognised — a malformed intent must
 * never wedge the canvas, the same contract `restoreDraft` holds.
 */

export type CanvasLaunchIntent =
  | { kind: 'open-template'; templateId: string }
// 'restore-draft' | 'rebuild-ai' | 'bind-data' land with the Dashboard cards
// they belong to (Phases 3 and 4). Only what is used is defined.

/** The key the intent travels under in `navigate(path, { state })`. */
export const LAUNCH_INTENT_KEY = 'launchIntent'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

export function readLaunchIntent(state: unknown): CanvasLaunchIntent | null {
  if (!isObject(state)) return null
  const intent = state[LAUNCH_INTENT_KEY]
  if (!isObject(intent)) return null

  if (intent.kind === 'open-template' && typeof intent.templateId === 'string' && intent.templateId) {
    return { kind: 'open-template', templateId: intent.templateId }
  }
  return null
}

/** Build the `state` object for `navigate('/canvas', toLaunchState(intent))`. */
export function toLaunchState(intent: CanvasLaunchIntent): { state: Record<string, unknown> } {
  return { state: { [LAUNCH_INTENT_KEY]: intent } }
}
