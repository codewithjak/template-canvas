/**
 * pdfImportService.ts
 *
 * Client side of the PDF → template flow.
 *
 *   PDF ──POST /pdf-import──► ExtractedDocument
 *       ──normalize (here)──► blocks
 *       ──POST /pdf-structure (best-effort, Phase 4 LLM)──► StructurePlan
 *       ──runImport(blocks, plan?)──► TemplateDocument
 *
 * The structure step is best-effort: if the backend has no API key (503), the
 * call fails, or the user opts out, we run the deterministic pass-through. The
 * import always succeeds. See AI_PDF_REBUILD_ARCHITECTURE.md §4 (fallback floor).
 */

import { API_BASE } from './config';
import {
  normalize,
  runImport,
  type ExtractedDocument,
  type ImportReport,
  type NormalizedDocument,
  type StructurePlan,
} from './pdfImport';
import type { TemplateDocument } from '../types/canvas';

export interface PdfImportResult {
  document: TemplateDocument;
  report: ImportReport;
  /** Whether the Phase 4 LLM structurer was applied (false = deterministic fallback). */
  structured: boolean;
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

/** Best-effort: returns a plan, or null if the structurer is unavailable/fails. */
async function fetchPlan(normalized: NormalizedDocument): Promise<StructurePlan | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: normalized.pages }),
    });
    if (!res.ok) return null; // 503 no key / 502 model error → fall back
    return await res.json();
  } catch {
    return null; // network error → fall back
  }
}

/** Upload a PDF and rebuild it as an editable TemplateDocument. */
export async function importPdfAsTemplate(
  file: File,
  opts: { useLlm?: boolean } = {},
): Promise<PdfImportResult> {
  const { useLlm = true } = opts;

  const extracted = await extract(file);
  const normalized = normalize(extracted);

  const plan = useLlm ? await fetchPlan(normalized) : null;
  const { document, report } = runImport(normalized, plan ?? undefined);

  return { document, report, structured: plan !== null };
}
