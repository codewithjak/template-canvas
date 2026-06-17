/**
 * pdfImport/eval/diff.ts  —  Phase 0 (scoring half)
 *
 * Schema-level diff between an expected TemplateDocument and one the pipeline
 * produced. Pure functions returning a score (mirrors the assertRdsInvariants
 * convention — no test framework needed). The round-trip producer
 * (template → PDF → extract) is added with the pdfjs adapter; this half scores
 * whatever two documents it's handed.
 */

import type { CanvasElement, TemplateDocument } from '../../../types/canvas';
import { IOU_MATCH } from '../config';

interface BBox { x: number; y: number; w: number; h: number; }

/** Best-effort bounding box for any element, in canvas px. */
function bboxOf(el: CanvasElement): BBox {
  const x = el.position?.x ?? 0;
  const y = el.position?.y ?? 0;
  switch (el.type) {
    case 'image':
    case 'box':
    case 'chart':
      return { x, y, w: el.style.width ?? 0, h: el.style.height ?? 0 };
    case 'line': {
      const len = el.style.length ?? 0;
      const th = el.style.thickness ?? 1;
      return el.style.direction === 'vertical'
        ? { x, y, w: th, h: len }
        : { x, y, w: len, h: th };
    }
    case 'text':
    case 'paragraph': {
      const fs = el.style.fontSize ?? 12;
      const width = 'width' in el.style ? el.style.width : undefined;
      return { x, y, w: width ?? fs * (el.content?.length ?? 0) * 0.5, h: fs * 1.2 };
    }
    default:
      return { x, y, w: 10, h: 10 };
  }
}

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function allElements(doc: TemplateDocument): CanvasElement[] {
  return doc.pages.flatMap(p => p.elements);
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export interface DiffScore {
  expectedCount: number;
  actualCount: number;
  matched: number;
  byType: Record<string, { expected: number; actual: number }>;
  meanIoU: number;        // over matched pairs
  textMatchRate: number;  // over matched text/paragraph pairs
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Greedily match expected→actual elements of the same type by best IoU
 * (≥ IOU_MATCH), then score geometry, text, and count fidelity.
 */
export function diffTemplates(expected: TemplateDocument, actual: TemplateDocument): DiffScore {
  const exp = allElements(expected);
  const act = allElements(actual);

  const byType: Record<string, { expected: number; actual: number }> = {};
  for (const e of exp) (byType[e.type] ??= { expected: 0, actual: 0 }).expected++;
  for (const a of act) (byType[a.type] ??= { expected: 0, actual: 0 }).actual++;

  const used = new Set<number>();
  let matched = 0;
  let iouSum = 0;
  let textPairs = 0;
  let textHits = 0;

  for (const e of exp) {
    const eb = bboxOf(e);
    let bestIdx = -1;
    let bestIoU = IOU_MATCH;
    act.forEach((a, i) => {
      if (used.has(i) || a.type !== e.type) return;
      const score = iou(eb, bboxOf(a));
      if (score >= bestIoU) { bestIoU = score; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      matched++;
      iouSum += bestIoU;
      if (e.type === 'text' || e.type === 'paragraph') {
        textPairs++;
        const a = act[bestIdx] as Extract<CanvasElement, { content: string }>;
        if (norm((e as { content: string }).content) === norm(a.content)) textHits++;
      }
    }
  }

  const precision = act.length ? matched / act.length : 0;
  const recall = exp.length ? matched / exp.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    expectedCount: exp.length,
    actualCount: act.length,
    matched,
    byType,
    meanIoU: matched ? iouSum / matched : 0,
    textMatchRate: textPairs ? textHits / textPairs : 0,
    precision,
    recall,
    f1,
  };
}
