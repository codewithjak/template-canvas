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

import { API_BASE } from './config';
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
  type ImportMode,
} from './pdfImport';
import { BUILTIN_TEMPLATES } from '../templates/registry';
import type { TemplateDocument } from '../types/canvas';

export interface PdfImportResult {
  document: TemplateDocument;
  report: ImportReport;
  /** Which path built it: the LLM structurer, or the deterministic floor (no key). */
  via: 'structured' | 'deterministic';
  /** The corpus family suggestion, if the matcher ran. Used only to align naming. */
  match?: MatchResult;
}

/** Geometry-stripped naming/structure skeleton of a matched template family. */
type PlanExemplar = { fields: FillSlots['fields']; tables: { columns: FillSlots['tables'][number]['columns'] }[] };

async function extract(file: File): Promise<ExtractedDocument> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/pdf-import`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PDF import failed (${res.status})`);
  }
  return res.json();
}

/** Best-effort corpus match; null when the matcher is unavailable/fails. */
async function fetchMatch(labels: string[], corpus: CorpusEntry[]): Promise<MatchResult | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted: { labels }, corpus }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Geometry-stripped skeleton of a matched template — token names + table columns only. */
function toExemplar(slots: FillSlots): PlanExemplar {
  return { fields: slots.fields, tables: slots.tables.map(t => ({ columns: t.columns })) };
}

/** Best-effort structure plan; null when the structurer is unavailable/fails. */
async function fetchPlan(normalized: NormalizedDocument, exemplar: PlanExemplar | null): Promise<StructurePlan | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: normalized.pages, exemplar: exemplar ?? undefined }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Upload a PDF and rebuild it as an editable TemplateDocument. */
export async function importPdfAsTemplate(
  file: File,
  opts: { useLlm?: boolean; useMatch?: boolean; mode?: ImportMode } = {},
): Promise<PdfImportResult> {
  // mode 'template' (default): a REUSABLE template — values become {{tokens}},
  //   tables become one token row + a binding (fillable only once data is linked).
  // mode 'document': this PDF's actual values filled in (a one-off document).
  const { useLlm = true, useMatch = true, mode = 'template' } = opts;

  const extracted = await extract(file);
  const normalized = normalize(extracted);

  // Retrieval: find the matching template FAMILY — used ONLY as a geometry-stripped
  // naming/structure hint to align this PDF's tokens. It NEVER replaces the PDF
  // (the corpus is a translator, not an inventory — arch doc §2.1, §3).
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

  // The template is ALWAYS built from THIS PDF. Template mode tokenizes via the LLM
  // structurer (aligned to the exemplar's names when present); document mode keeps
  // literal values. Falls back to the deterministic floor without a key.
  const plan = useLlm ? await fetchPlan(normalized, exemplar) : null;
  const { document, report } = runImport(normalized, plan ?? undefined, mode);
  if (match && match.key) {
    document.ai = { ...(document.ai ?? {}), matchSuggestion: match };
  }
  return { document, report, via: plan ? 'structured' : 'deterministic', match: match ?? undefined };
}
