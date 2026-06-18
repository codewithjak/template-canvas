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
  buildFromMatch,
  extractSlots,
  applyFill,
  toFillValues,
  MATCH_STRONG,
  type CorpusEntry,
  type FillSlots,
  type MatchResult,
  type RawFill,
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
  /** How the document was built. */
  mode: 'matched' | 'structured' | 'deterministic';
  /** The corpus match suggestion, if the matcher ran (surfaced even when not adopted). */
  match?: MatchResult;
}

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

/** Best-effort value fill for a matched template; null when unavailable/fails. */
async function fetchFill(slots: FillSlots, texts: string[]): Promise<RawFill | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots, texts }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** All text-line content from the normalized blocks (values + labels), in order. */
function textLines(normalized: NormalizedDocument): string[] {
  const out: string[] = [];
  for (const page of normalized.pages) {
    for (const b of page.blocks) {
      if (b.kind === 'text' || b.kind === 'paragraph') out.push(b.text);
    }
  }
  return out;
}

/** Best-effort structure plan; null when the structurer is unavailable/fails. */
async function fetchPlan(normalized: NormalizedDocument): Promise<StructurePlan | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: normalized.pages }),
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
  opts: { useLlm?: boolean; useMatch?: boolean } = {},
): Promise<PdfImportResult> {
  const { useLlm = true, useMatch = true } = opts;

  const extracted = await extract(file);
  const normalized = normalize(extracted);

  // Retrieval: does this PDF match a known template family?
  let match: MatchResult | null = null;
  if (useMatch) {
    const corpus = buildCorpus(BUILTIN_TEMPLATES);
    match = await fetchMatch(signatureFromBlocks(normalized).labels, corpus);

    // Strong match → adopt the known-good layout (match-and-diff v1) and
    // transplant the PDF's actual values into its slots (v2, best-effort).
    if (match && match.key && match.confidence >= MATCH_STRONG) {
      const hit = BUILTIN_TEMPLATES.find(t => t.id === match!.key);
      if (hit) {
        const document = buildFromMatch(hit.doc, file.name, { ...match, name: hit.name });
        const raw = useLlm ? await fetchFill(extractSlots(document), textLines(normalized)) : null;
        if (raw) applyFill(document, toFillValues(raw));
        const report: ImportReport = { coverage: { mapped: 0, approximated: 0, dropped: 0 }, entries: [], lowConfidence: [] };
        return { document, report, mode: 'matched', match };
      }
    }
  }

  // No strong match → faithful rebuild (LLM structure if available, else deterministic).
  const plan = useLlm ? await fetchPlan(normalized) : null;
  const { document, report } = runImport(normalized, plan ?? undefined);
  if (match && match.key) {
    document.ai = { ...(document.ai ?? {}), matchSuggestion: match };
  }
  return { document, report, mode: plan ? 'structured' : 'deterministic', match: match ?? undefined };
}
