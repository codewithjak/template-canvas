/**
 * pdfImport/index.ts
 *
 * The PDF → TemplateDocument pipeline:
 *
 *   ExtractedDocument ─[normalize]─► NormalizedDocument
 *                     ─[structure]─► CanvasElement[] per page
 *                          pass-through (no plan) OR materialize(plan)  (Phase 4)
 *                     ─[validate ]─► repaired elements + drops
 *                     ─[assemble ]─► TemplateDocument + fidelity report
 *
 * Phase 1 (extract, pdfjs) runs server-side and produces ExtractedDocument.
 * Phase 4 (LLM) is optional: when a StructurePlan is supplied the structurer
 * materializes it (geometry still from the blocks); without one it falls back to
 * the deterministic pass-through. Geometry never comes from the model. (arch §3)
 */

import type { TemplateDocument } from '../../types/canvas';
import type { ExtractedDocument, NormalizedDocument, StructurePlan, Block } from './types';
import { emptyReport, record } from './types';
import { normalize } from './normalize';
import { structurePage, materializePage } from './structure';
import { validatePage } from './validate';
import { assemble, type AssembledPage } from './assemble';
import { CONFIDENCE_LOW } from './config';

export interface ImportResult {
  document: TemplateDocument;
  report: ReturnType<typeof emptyReport>;
}

/**
 * Run structure→validate→assemble over an already-normalized document.
 * Pass a `plan` to use the LLM structurer's output; omit it for the
 * deterministic pass-through. Either way the import always completes.
 */
export function runImport(normalized: NormalizedDocument, plan?: StructurePlan): ImportResult {
  const report = emptyReport();

  const assembledPages: AssembledPage[] = normalized.pages.map((page, i) => {
    const confidenceById = new Map<string, number>(page.blocks.map((b: Block) => [b.id, b.confidence]));

    const pagePlan = plan?.pages?.[i];
    const { elements, zones } = pagePlan
      ? materializePage(page, pagePlan)
      : { elements: structurePage(page), zones: {} as { headerBoundaryY?: number; footerBoundaryY?: number } };

    const { elements: valid, dropped } = validatePage(elements, page.widthPx, page.heightPx);

    for (const el of valid) {
      record(report, { ref: el.id, state: 'mapped' });
      const c = confidenceById.get(el.id);
      if (c !== undefined && c < CONFIDENCE_LOW) report.lowConfidence.push(el.id);
    }
    for (const d of dropped) record(report, { ref: d.id, state: 'dropped', reason: d.reason });

    return {
      elements: valid,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      headerBoundaryY: zones.headerBoundaryY,
      footerBoundaryY: zones.footerBoundaryY,
    };
  });

  const document = assemble(assembledPages, normalized.fileName, report);
  return { document, report };
}

/** Deterministic pipeline over a raw extraction (normalize + pass-through). */
export function runDeterministicImport(extracted: ExtractedDocument): ImportResult {
  return runImport(normalize(extracted));
}

export { normalize } from './normalize';
export { structurePage, materializePage } from './structure';
export { validatePage } from './validate';
export { assemble } from './assemble';
export * from './types';
