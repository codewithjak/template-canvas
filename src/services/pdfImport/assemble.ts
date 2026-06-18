/**
 * pdfImport/assemble.ts  —  Phase 6
 *
 * Wraps the validated per-page elements into a TemplateDocument the editor can
 * open, matches the page size to a known preset (or a custom size), and writes
 * the fidelity report into the reserved `ai` field. (arch doc Phase 6)
 */

import {
  createPage,
  createTemplateDocument,
  customPageSize,
  defaultFooter,
  defaultHeader,
  PAGE_SIZE_PRESETS,
  syncRepeatFlag,
  zoneScope,
  type CanvasElement,
  type CanvasPage,
  type PageSizeConfig,
  type TemplateDocument,
} from '../../types/canvas';
import type { ImportReport } from './types';

export interface AssembledPage {
  elements: CanvasElement[];
  widthPx: number;
  heightPx: number;
  /** Optional header/footer zone boundaries (canvas px) from the Phase 4 plan. */
  headerBoundaryY?: number;
  footerBoundaryY?: number;
}

/** Build a CanvasPage, enabling header/footer zones when the plan supplied them. */
function buildPage(p: AssembledPage, index: number): CanvasPage {
  const overrides: Partial<CanvasPage> = {
    pageId: `page-${index + 1}`,
    label: `Page ${index + 1}`,
    elements: p.elements,
  };
  if (p.headerBoundaryY !== undefined) {
    const h = { ...defaultHeader(), enabled: true, boundaryY: p.headerBoundaryY };
    overrides.header = syncRepeatFlag({ ...h, scope: zoneScope(h) });
  }
  if (p.footerBoundaryY !== undefined) {
    const f = { ...defaultFooter(p.heightPx), enabled: true, boundaryY: p.footerBoundaryY };
    overrides.footer = syncRepeatFlag({ ...f, scope: zoneScope(f) });
  }
  return createPage(overrides);
}

/** Match canvas px dimensions to a known preset, else build a custom size. */
function matchPageSize(widthPx: number, heightPx: number): PageSizeConfig {
  for (const [preset, p] of Object.entries(PAGE_SIZE_PRESETS)) {
    if (Math.abs(p.canvasWidth - widthPx) <= 2 && Math.abs(p.canvasHeight - heightPx) <= 2) {
      return {
        preset,
        canvasWidth: p.canvasWidth,
        canvasHeight: p.canvasHeight,
        pdfWidth: p.pdfWidth,
        pdfHeight: p.pdfHeight,
      };
    }
  }
  // 1in = 96 canvas px.
  return customPageSize(widthPx / 96, heightPx / 96);
}

export function assemble(
  pages: AssembledPage[],
  fileName: string,
  report: ImportReport,
): TemplateDocument {
  const canvasPages = pages.map((p, i) => buildPage(p, i));

  const first = pages[0];
  const pageSize = first ? matchPageSize(first.widthPx, first.heightPx) : undefined;

  const name = fileName.replace(/\.[^.]+$/, '') || 'Imported PDF';
  const doc = createTemplateDocument(canvasPages, name, undefined, pageSize);

  doc.ai = {
    importer: 'pdf',
    coverage: report.coverage,
    entries: report.entries,
    lowConfidence: report.lowConfidence,
  };

  return doc;
}
