/**
 * pdfImport/index.ts
 *
 * The deterministic PDF → TemplateDocument pipeline:
 *
 *   ExtractedDocument ─[normalize]─► NormalizedDocument
 *                     ─[structure]─► CanvasElement[] per page   (pass-through)
 *                     ─[validate ]─► repaired elements + drops
 *                     ─[assemble ]─► TemplateDocument + fidelity report
 *
 * Phase 1 (extract, pdfjs) plugs in BEFORE this as the producer of
 * ExtractedDocument; the LLM structurer (Phase 4 real) replaces `structurePage`
 * later. Neither changes this orchestration. (arch doc §3)
 */

import type { TemplateDocument } from '../../types/canvas';
import type { ExtractedDocument, Block } from './types';
import { emptyReport, record } from './types';
import { normalize } from './normalize';
import { structurePage } from './structure';
import { validatePage } from './validate';
import { assemble, type AssembledPage } from './assemble';
import { CONFIDENCE_LOW } from './config';

export interface ImportResult {
  document: TemplateDocument;
  /** Convenience mirror of document.ai for callers that want it typed. */
  report: ReturnType<typeof emptyReport>;
}

/** Run the deterministic pipeline over an already-extracted document. */
export function runDeterministicImport(extracted: ExtractedDocument): ImportResult {
  const normalized = normalize(extracted);
  const report = emptyReport();

  const assembledPages: AssembledPage[] = normalized.pages.map(page => {
    const confidenceById = new Map<string, number>(page.blocks.map((b: Block) => [b.id, b.confidence]));

    const elements = structurePage(page);
    const { elements: valid, dropped } = validatePage(elements, page.widthPx, page.heightPx);

    for (const el of valid) {
      record(report, { ref: el.id, state: 'mapped' });
      const c = confidenceById.get(el.id);
      if (c !== undefined && c < CONFIDENCE_LOW) report.lowConfidence.push(el.id);
    }
    for (const d of dropped) {
      record(report, { ref: d.id, state: 'dropped', reason: d.reason });
    }

    return { elements: valid, widthPx: page.widthPx, heightPx: page.heightPx };
  });

  const document = assemble(assembledPages, extracted.fileName, report);
  return { document, report };
}

export { normalize } from './normalize';
export { structurePage } from './structure';
export { validatePage } from './validate';
export { assemble } from './assemble';
export * from './types';
