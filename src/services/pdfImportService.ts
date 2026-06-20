/**
 * pdfImportService.ts
 *
 * Client side of the PDF → template flow.
 *
 *   PDF ──POST /pdf-import──► ExtractedDocument
 *       ──normalize (here)──► blocks
 *       ──POST /pdf-match  (best-effort, retrieval)──► template match?
 *            strong match ─► clone matched template (match-and-diff)
 *            else          ─► POST /pdf-structure (best-effort, LLM)
 *                            ──runImport(blocks, plan?)──► faithful rebuild
 *
 * Every AI step is best-effort: no API key (503), failure, or no clear match all
 * degrade to the deterministic floor. The import always succeeds, and the match
 * suggestion is surfaced either way. See AI_PDF_REBUILD_ARCHITECTURE.md §8.
 */

import { API_BASE, authHeaders } from './config';
import {
  normalize,
  runImport,
  signatureFromBlocks,
  buildCorpus,
  extractSlots,
  MATCH_STRONG,
  type CorpusEntry,
  type FillSlots,
  type MatchResult,
  type ExtractedDocument,
  type ImportReport,
  type NormalizedDocument,
  type StructurePlan,
} from './pdfImport';
import { BUILTIN_TEMPLATES } from '../templates/registry';
import type { TemplateDocument } from '../types/canvas';

export interface PdfImportResult {
  document: TemplateDocument;
  report: ImportReport;
  /** The corpus family suggestion, if the matcher ran. Used only to align token names. */
  match?: MatchResult;
}

/**
 * Progress stages, in order. Each maps to one boundary in importPdfAsTemplate
 * below; the callback fires immediately BEFORE that step's work begins, so a UI
 * can show the step that is currently running. `normalize`/`assemble` are folded
 * into the awaited steps either side of them (they're sub-millisecond, sync).
 */
export type PdfImportStage = 'extract' | 'match' | 'structure' | 'assemble';

export interface PdfImportStepInfo {
  id: PdfImportStage;
  label: string;
  /** Sub-label shown under the step while it runs. */
  hint: string;
}

/** Ordered step list — the single source of truth shared by the progress UI. */
export const PDF_IMPORT_STEPS: PdfImportStepInfo[] = [
  { id: 'extract',   label: 'Reading the PDF',     hint: 'Extracting text & measuring layout' },
  { id: 'match',     label: 'Matching a template', hint: 'Looking for a similar design' },
  { id: 'structure', label: 'Rebuilding with AI',  hint: 'Tokenizing fields — usually 5–15s' },
  { id: 'assemble',  label: 'Finalizing template', hint: 'Validating & assembling pages' },
];

/** Geometry-stripped naming/structure skeleton of a matched template family. */
type PlanExemplar = { fields: FillSlots['fields']; tables: { columns: FillSlots['tables'][number]['columns'] }[] };

/** Entitlement statuses the AI endpoints use to signal a quota/plan block. */
const ENTITLEMENT_STATUS = new Set([401, 402, 403]);

/** Thrown when the server rejects a build for plan/quota reasons (NOT degradable). */
export class AiQuotaError extends Error {}

/**
 * POST JSON (auth-attached) and parse the response; throws on a non-OK status
 * (with the server's error). The bearer token lets the server attribute and
 * meter the AI build to the right team.
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: string }).error || `${path} failed (${res.status})`;
    throw ENTITLEMENT_STATUS.has(res.status) ? new AiQuotaError(message) : new Error(message);
  }
  return res.json() as Promise<T>;
}

/**
 * Best-effort POST: returns null when the step is merely unavailable so the caller
 * can degrade. A plan/quota rejection (AiQuotaError) is re-thrown — it is a
 * deliberate block the user must see, not a degradable failure.
 */
async function postJsonOrNull<T>(path: string, body: unknown): Promise<T | null> {
  try {
    return await postJson<T>(path, body);
  } catch (err) {
    if (err instanceof AiQuotaError) throw err;
    return null;
  }
}

async function extract(file: File): Promise<ExtractedDocument> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/pdf-import`, {
    method: 'POST',
    body: form,
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `PDF import failed (${res.status})`);
  }
  return res.json();
}

/** Best-effort corpus match; null when the matcher is unavailable/fails. */
const fetchMatch = (labels: string[], corpus: CorpusEntry[]) =>
  postJsonOrNull<MatchResult>('/pdf-match', { extracted: { labels }, corpus });

/** Best-effort structure plan; null when the structurer is unavailable/fails. */
const fetchPlan = (normalized: NormalizedDocument, exemplar: PlanExemplar | null) =>
  postJsonOrNull<StructurePlan>('/pdf-structure', { pages: normalized.pages, exemplar: exemplar ?? undefined });

/** Geometry-stripped skeleton of a matched template — token names + table columns only. */
function toExemplar(slots: FillSlots): PlanExemplar {
  return { fields: slots.fields, tables: slots.tables.map(t => ({ columns: t.columns })) };
}

/**
 * Upload a PDF and rebuild it as a REUSABLE TOKENIZED TEMPLATE — values become
 * {{placeholders}}, tables become one token row + a binding (fillable only once a
 * data source is linked). This always tokenizes via the AI structurer; if that's
 * unavailable it throws (it never silently produces a literal/filled document).
 */
export async function importPdfAsTemplate(
  file: File,
  opts: { useMatch?: boolean; onProgress?: (stage: PdfImportStage) => void } = {},
): Promise<PdfImportResult> {
  const { useMatch = true, onProgress } = opts;

  onProgress?.('extract');
  const extracted = await extract(file);
  const normalized = normalize(extracted);

  // Retrieval: find the matching template FAMILY — used ONLY as a geometry-stripped
  // naming/structure hint to align this PDF's tokens. It NEVER replaces the PDF
  // (the corpus is a translator, not an inventory — arch doc §2.1, §3).
  onProgress?.('match');
  let match: MatchResult | null = null;
  let exemplar: PlanExemplar | null = null;
  if (useMatch) {
    const corpus = buildCorpus(BUILTIN_TEMPLATES);
    match = await fetchMatch(signatureFromBlocks(normalized).labels, corpus);
    if (match && match.key && match.confidence >= MATCH_STRONG) {
      const hit = BUILTIN_TEMPLATES.find(t => t.id === match!.key);
      if (hit) exemplar = toExemplar(extractSlots(hit.doc));
    }
  }

  // Tokenize THIS PDF via the structurer (aligned to the exemplar's names when
  // present). Mandatory — no literal fallback.
  onProgress?.('structure');
  const plan = await fetchPlan(normalized, exemplar);
  if (!plan) {
    throw new Error(
      'Could not tokenize the PDF — the AI structurer is unavailable. ' +
      'Ensure the backend is running with ANTHROPIC_API_KEY set.',
    );
  }

  onProgress?.('assemble');
  const { document, report } = runImport(normalized, plan);
  if (match && match.key) {
    document.ai = { ...(document.ai ?? {}), matchSuggestion: match };
  }
  return { document, report, match: match ?? undefined };
}
