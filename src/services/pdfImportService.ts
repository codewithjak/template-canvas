/**
 * pdfImportService.ts
 *
 * Client side of the PDF → template flow. Uploads a PDF to the backend
 * extraction endpoint (Phase 1), then runs the deterministic pipeline
 * (Phases 2–6) in the browser to produce an editable TemplateDocument.
 *
 *   PDF file ──POST /pdf-import──► ExtractedDocument ──runDeterministicImport──► TemplateDocument
 *
 * Mirrors dataSourceService.parseFile. See AI_PDF_REBUILD_ARCHITECTURE.md.
 */

import { API_BASE } from './config';
import { runDeterministicImport, type ExtractedDocument, type ImportReport } from './pdfImport';
import type { TemplateDocument } from '../types/canvas';

export interface PdfImportResult {
  document: TemplateDocument;
  report: ImportReport;
}

/** Upload a PDF and rebuild it as an editable TemplateDocument. */
export async function importPdfAsTemplate(file: File): Promise<PdfImportResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/pdf-import`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PDF import failed (${res.status})`);
  }

  const extracted: ExtractedDocument = await res.json();
  const { document, report } = runDeterministicImport(extracted);
  return { document, report };
}
