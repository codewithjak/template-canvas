/**
 * pdfImport/normalize.ts  —  Phase 2
 *
 * Deterministic, no model. Two jobs:
 *   1. Coordinate transform: PDF points (bottom-left origin) → canvas px
 *      (top-left origin). Exact inverse of the existing PDF export.
 *   2. Clustering: merge fragmented text runs sharing a baseline into line
 *      blocks so the structurer reasons over blocks, not raw runs.
 *
 * Geometry only — never consults the corpus. (arch doc §2, §3)
 */

import {
  PX_PER_PT,
  type ExtractedDocument,
  type ExtractedPage,
  type NormalizedDocument,
  type NormalizedPage,
  type Block,
  type TextBlock,
  type RawPrimitive,
  type RawTextPrimitive,
  type Rect,
} from './types';

/** Map a raw embedded/subset PDF font name (or CSS family) to a house family. */
function mapFontFamily(fontName: string): string {
  // Strip subset prefix like "ABCDEE+" then match a known family by substring.
  const name = fontName.replace(/^[A-Z]{6}\+/, '').toLowerCase();
  if (name.includes('courier') || name.includes('mono')) return 'Courier New';
  // Check 'sans' before 'serif' — "sans-serif" contains the substring "serif".
  if (name.includes('sans') || name.includes('helvetica') || name.includes('arial')) return 'Arial';
  if (name.includes('times') || name.includes('georgia') || name.includes('serif')) return 'Georgia';
  return 'Arial';
}

/** Infer a CSS font-weight token from the raw font name. */
function mapFontWeight(fontName: string): string {
  const n = fontName.toLowerCase();
  return n.includes('bold') ? 'bold' : 'normal';
}

/**
 * Transform a PDF-space rect (lower-left origin) to a canvas-space rect
 * (top-left origin). The PDF top edge is `rect.y + rect.height`.
 */
function rectToCanvas(rect: Rect, pageHeightPt: number): Rect {
  const topPt = pageHeightPt - (rect.y + rect.height);
  return {
    x: rect.x * PX_PER_PT,
    y: topPt * PX_PER_PT,
    width: rect.width * PX_PER_PT,
    height: rect.height * PX_PER_PT,
  };
}

/** Two text runs cluster if their baselines align and they sit on the same line. */
function sameLine(a: RawTextPrimitive, b: RawTextPrimitive): boolean {
  const aMid = a.rect.y + a.rect.height / 2;
  const bMid = b.rect.y + b.rect.height / 2;
  const tol = Math.max(a.rect.height, b.rect.height) * 0.4;
  return Math.abs(aMid - bMid) <= tol;
}

/**
 * Merge text runs on a shared baseline into single line blocks, preserving
 * left-to-right order and inserting a space when there's a visible gap.
 * Non-text primitives pass through one block each.
 */
function clusterTextRuns(primitives: RawPrimitive[], pageHeightPt: number): Block[] {
  const texts = primitives.filter((p): p is RawTextPrimitive => p.kind === 'text');
  const others = primitives.filter(p => p.kind !== 'text');

  // Group into lines: sort by descending PDF-y (top first), then cluster.
  const remaining = [...texts].sort((a, b) => b.rect.y - a.rect.y);
  const lines: RawTextPrimitive[][] = [];
  for (const run of remaining) {
    const line = lines.find(l => sameLine(l[0], run));
    if (line) line.push(run);
    else lines.push([run]);
  }

  const blocks: Block[] = [];

  // Build one text block from a contiguous segment of runs (joins words with a
  // space across small gaps; bbox + style from the runs).
  const buildTextBlock = (runs: RawTextPrimitive[]): TextBlock | null => {
    let text = '';
    let prevRight: number | null = null;
    for (const run of runs) {
      if (prevRight !== null && run.rect.x - prevRight > run.fontSizePt * 0.25) text += ' ';
      text += run.text;
      prevRight = run.rect.x + run.rect.width;
    }
    text = text.trim();
    if (!text) return null;
    const minX = Math.min(...runs.map(r => r.rect.x));
    const maxX = Math.max(...runs.map(r => r.rect.x + r.rect.width));
    const minY = Math.min(...runs.map(r => r.rect.y));
    const maxY = Math.max(...runs.map(r => r.rect.y + r.rect.height));
    const head = runs[0];
    return {
      id: `blk-${head.id}`,
      sourceIds: runs.map(r => r.id),
      source: head.source,
      confidence: Math.min(...runs.map(r => r.confidence)),
      kind: 'text',
      rect: rectToCanvas({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, pageHeightPt),
      text,
      fontFamily: mapFontFamily(head.fontName),
      fontSizePx: head.fontSizePt * PX_PER_PT,
      fontWeight: mapFontWeight(head.fontName),
      color: head.color,
      rotation: head.rotation,
    };
  };

  for (const line of lines) {
    line.sort((a, b) => a.rect.x - b.rect.x);
    // Split a line into segments at COLUMN-sized gaps. Word spacing keeps runs
    // together; a large gap (> 2.5× font size) starts a new block — so table
    // cells stay distinct instead of collapsing into one line (which would hide
    // the column structure from the Phase 4 table detector).
    let segment: RawTextPrimitive[] = [];
    let prevRight: number | null = null;
    for (const run of line) {
      if (prevRight !== null && run.rect.x - prevRight > run.fontSizePt * 2.5) {
        const b = buildTextBlock(segment); if (b) blocks.push(b);
        segment = [];
      }
      segment.push(run);
      prevRight = run.rect.x + run.rect.width;
    }
    const b = buildTextBlock(segment); if (b) blocks.push(b);
  }

  // Non-text primitives → one block each.
  for (const p of others) {
    const r = rectToCanvas(p.rect, pageHeightPt);
    if (p.kind === 'line') {
      blocks.push({
        id: `blk-${p.id}`, sourceIds: [p.id], source: p.source, confidence: p.confidence,
        kind: 'line', rect: r,
        direction: r.width >= r.height ? 'horizontal' : 'vertical',
        thicknessPx: p.thicknessPt * PX_PER_PT,
        color: p.color,
      });
    } else if (p.kind === 'rect') {
      blocks.push({
        id: `blk-${p.id}`, sourceIds: [p.id], source: p.source, confidence: p.confidence,
        kind: 'rect', rect: r,
        borderWidthPx: p.strokeWidthPt * PX_PER_PT,
        borderColor: p.strokeColor,
        backgroundColor: p.fillColor ?? 'transparent',
      });
    } else if (p.kind === 'image') {
      blocks.push({
        id: `blk-${p.id}`, sourceIds: [p.id], source: p.source, confidence: p.confidence,
        kind: 'image', rect: r, dataUrl: p.dataUrl,
      });
    }
  }

  return blocks;
}

function normalizePage(page: ExtractedPage): NormalizedPage {
  return {
    widthPx: page.widthPt * PX_PER_PT,
    heightPx: page.heightPt * PX_PER_PT,
    blocks: clusterTextRuns(page.primitives, page.heightPt),
  };
}

export function normalize(doc: ExtractedDocument): NormalizedDocument {
  return { fileName: doc.fileName, pages: doc.pages.map(normalizePage) };
}
