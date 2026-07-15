/**
 * draftStore.ts — local draft persistence for the canvas (activation doc T0.4).
 *
 * One draft slot per user (the key is scoped by user id), in localStorage. The
 * draft is a safety net between explicit saves: while the document is dirty it
 * is written (debounced, plus flushed at exit points), and it is cleared when
 * the document becomes clean again — either a clean cloud save or an undo back
 * to the savepoint. Clearing is driven by those events, never by a bare
 * dirty→clean transition: loading another document also lands on "clean", and
 * that must PRESERVE the outgoing document's draft, not delete it.
 *
 * Failure contract (from the doc):
 *  - `saveDraft` NEVER throws — same fire-and-forget contract as
 *    `analytics.logEvent`. Documents can embed images as base64 data URIs, so
 *    a draft can exceed the localStorage quota. In that case the draft is
 *    SKIPPED, not stripped (a restored document silently missing its images
 *    would be a worse trust failure than no draft), and any previously stored
 *    draft is deleted so restore can never offer content older than what the
 *    user last saw. The beforeunload guard remains the protection for
 *    oversized documents.
 *  - `restoreDraft` returns null on anything unparseable and clears the bad
 *    entry, so a corrupt draft can never wedge the canvas.
 */
import type { TemplateDocument } from '../types/canvas'

/**
 * The key is scoped per user id so a draft saved by one account can never be
 * offered to another on the same machine (the restore card ships in Phase 1;
 * an unscoped key would be a cross-account leak the moment it does).
 */
const draftKey = (userId: string | null | undefined): string =>
  `mapdoc.canvas.draft.v1:${userId || 'anon'}`

export interface DraftRestore {
  doc: TemplateDocument
  savedAt: string
  /** The team the draft was written under; the card compares it to the active team. */
  teamId: string | null
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Shape check — enough to reject corrupt/foreign payloads so a bad draft can
 * never wedge the canvas. `typeof null === 'object'`, so `meta` and every page
 * are checked for non-null objects explicitly; a page must at least carry an
 * `elements` array (what the renderer and the load path both dereference).
 */
function isTemplateDocument(value: unknown): value is TemplateDocument {
  if (!isObject(value)) return false
  if (value.version !== '2.0' || !isObject(value.meta)) return false
  if (!Array.isArray(value.pages)) return false
  return value.pages.every((p) => isObject(p) && Array.isArray(p.elements))
}

export function saveDraft(
  doc: TemplateDocument,
  userId: string | null | undefined,
  teamId: string | null,
): void {
  try {
    // teamId is stored in the PAYLOAD (not the key) so the restore card can
    // withhold a draft written under a different team — templates save
    // team-scoped, so restoring another team's draft would leak content across
    // teams (activation doc T0.4 caveat / T1.6).
    const payload = JSON.stringify({ savedAt: new Date().toISOString(), teamId, doc })
    window.localStorage.setItem(draftKey(userId), payload)
  } catch {
    // Quota exceeded (or storage unavailable): skip this draft and drop any
    // stale one — restore must never offer older content than the user sees.
    clearDraft(userId)
  }
}

export function restoreDraft(userId: string | null | undefined): DraftRestore | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const { savedAt, teamId, doc } = parsed as { savedAt?: unknown; teamId?: unknown; doc?: unknown }
    if (typeof savedAt !== 'string' || !isTemplateDocument(doc)) {
      clearDraft(userId)
      return null
    }
    return { doc, savedAt, teamId: typeof teamId === 'string' ? teamId : null }
  } catch {
    clearDraft(userId)
    return null
  }
}

export function clearDraft(userId: string | null | undefined): void {
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
