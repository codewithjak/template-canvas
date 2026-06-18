/**
 * pdfImport/types.ts
 *
 * Internal IR for the PDF → TemplateDocument pipeline.
 * See AI_PDF_REBUILD_ARCHITECTURE.md for the full design.
 *
 * Two coordinate spaces live here, kept deliberately distinct:
 *
 *   RawPrimitive  — Phase 1 (extraction) output. PDF user space:
 *                   points (1in = 72pt), origin BOTTOM-LEFT, (x,y) = lower-left
 *                   corner of the box, height grows upward.
 *
 *   NormalizedBlock — Phase 2 (normalization) output. Canvas space:
 *                     CSS px (1in = 96px), origin TOP-LEFT — the same space
 *                     CanvasElement.position uses. This is the inverse of the
 *                     existing PDF export transform.
 *
 * No pdfjs / DOM / React imports — pure data, so the same IR can be produced by
 * a future OCR or DOM adapter (arch doc §14–15) without touching Phases 2–6.
 */

// ── Provenance (cheap future-proofing — arch doc §14.4) ─────────────────────────

/** Where a primitive came from. The pdfjs adapter always emits 'vector'. */
export type PrimitiveSource = 'vector' | 'ocr' | 'cv';

/** Axis-aligned rectangle. Units depend on the stage (pt for raw, px for block). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Phase 1: raw extracted primitives (PDF points, bottom-left origin) ──────────

interface RawBase {
  id: string;
  source: PrimitiveSource;
  /** 0–1. The pdfjs adapter sets 1.0; OCR/CV adapters set their recognition score. */
  confidence: number;
  /** Lower-left corner + size, in PDF points. */
  rect: Rect;
}

export interface RawTextPrimitive extends RawBase {
  kind: 'text';
  text: string;
  fontName: string;     // raw PDF font name, e.g. "ABCDEE+Helvetica"
  fontSizePt: number;
  /** Degrees, counter-clockwise, from the text transform. 0 for upright text. */
  rotation: number;
  color: string;        // hex, '#000000' default
}

export interface RawLinePrimitive extends RawBase {
  kind: 'line';
  thicknessPt: number;
  color: string;
}

export interface RawRectPrimitive extends RawBase {
  kind: 'rect';
  strokeWidthPt: number;
  strokeColor: string;
  fillColor: string | null;   // null = no fill
}

export interface RawImagePrimitive extends RawBase {
  kind: 'image';
  /** data: URL of the embedded image bytes. */
  dataUrl: string;
}

export type RawPrimitive =
  | RawTextPrimitive
  | RawLinePrimitive
  | RawRectPrimitive
  | RawImagePrimitive;

/** One extracted PDF page, before normalization. */
export interface ExtractedPage {
  /** Page box in PDF points. */
  widthPt: number;
  heightPt: number;
  primitives: RawPrimitive[];
}

/** Full extraction result — the Phase 1 → Phase 2 contract. */
export interface ExtractedDocument {
  fileName: string;
  pages: ExtractedPage[];
}

// ── Phase 2: normalized blocks (canvas px, top-left origin) ─────────────────────

export type BlockKind = 'text' | 'paragraph' | 'line' | 'rect' | 'image';

interface BlockBase {
  id: string;
  /** Primitive id(s) this block was built from — geometry provenance handle. */
  sourceIds: string[];
  source: PrimitiveSource;
  confidence: number;
  /** Canvas px, top-left origin. */
  rect: Rect;
}

export interface TextBlock extends BlockBase {
  kind: 'text' | 'paragraph';
  text: string;
  fontFamily: string;   // already mapped to a house family
  fontSizePx: number;
  fontWeight: string;
  color: string;
  rotation: number;
}

export interface LineBlock extends BlockBase {
  kind: 'line';
  direction: 'horizontal' | 'vertical';
  thicknessPx: number;
  color: string;
}

export interface RectBlock extends BlockBase {
  kind: 'rect';
  borderWidthPx: number;
  borderColor: string;
  backgroundColor: string;   // 'transparent' when unfilled
}

export interface ImageBlock extends BlockBase {
  kind: 'image';
  dataUrl: string;
}

export type Block = TextBlock | LineBlock | RectBlock | ImageBlock;

/** One normalized page. `widthPx`/`heightPx` drive page-size matching in Phase 6. */
export interface NormalizedPage {
  widthPx: number;
  heightPx: number;
  blocks: Block[];
}

export interface NormalizedDocument {
  fileName: string;
  pages: NormalizedPage[];
}

// ── Fidelity report (written to TemplateDocument.ai — arch doc §6, §9) ──────────

export type TerminalState = 'mapped' | 'approximated' | 'dropped';

export interface ReportEntry {
  /** Block id, or primitive id when the failure is pre-block. */
  ref: string;
  state: TerminalState;
  reason?: string;
}

export interface ImportReport {
  coverage: { mapped: number; approximated: number; dropped: number };
  entries: ReportEntry[];
  /** Element ids the structurer/validator flagged as low-confidence. */
  lowConfidence: string[];
}

export function emptyReport(): ImportReport {
  return { coverage: { mapped: 0, approximated: 0, dropped: 0 }, entries: [], lowConfidence: [] };
}

export function record(report: ImportReport, entry: ReportEntry): void {
  report.entries.push(entry);
  report.coverage[entry.state] += 1;
}

// ── Phase 4: structure plan (LLM output, references block ids only) ─────────────

export type GroupRole = 'title' | 'heading' | 'watermark' | 'none';

export interface StructureGroup {
  /** Ids of text blocks to merge into one element. */
  blockIds: string[];
  type: 'text' | 'paragraph';
  role: GroupRole;
}

export interface PageStructurePlan {
  groups: StructureGroup[];
  headerBlockIds: string[];
  footerBlockIds: string[];
}

export interface StructurePlan {
  pages: PageStructurePlan[];
}

// ── Geometry constant — the inverse of the PDF export transform ─────────────────

/** 1in = 96 CSS px = 72 pt → px per pt. (canvas.ts: canvasW = in*96, pdfW = in*72) */
export const PX_PER_PT = 96 / 72;
