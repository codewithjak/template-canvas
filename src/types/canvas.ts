/**
 * canvas.ts  —  src/types/canvas.ts
 * Shared type definitions for the multi-page canvas.
 * Single source of truth — imported by components, services, and future AI layer.
 * No React, no JSX — pure TypeScript interfaces and helpers.
 */

// ── Page size presets ─────────────────────────────────────────────────────────

export interface PageSizePreset {
  name: string;
  widthInches: number;
  heightInches: number;
  canvasWidth: number;
  canvasHeight: number;
  pdfWidth: number;
  pdfHeight: number;
}

export const PAGE_SIZE_PRESETS: Record<string, PageSizePreset> = {
  'a4':       { name: 'A4',         widthInches: 8.27, heightInches: 11.69, canvasWidth: 794,  canvasHeight: 1123, pdfWidth: 595.28, pdfHeight: 841.89 },
  'letter':   { name: 'US Letter',  widthInches: 8.5,  heightInches: 11,    canvasWidth: 816,  canvasHeight: 1056, pdfWidth: 612,    pdfHeight: 792 },
  '4x6':      { name: '4×6 Label',  widthInches: 4,    heightInches: 6,     canvasWidth: 384,  canvasHeight: 576,  pdfWidth: 288,    pdfHeight: 432 },
  '4x4':      { name: '4×4 Label',  widthInches: 4,    heightInches: 4,     canvasWidth: 384,  canvasHeight: 384,  pdfWidth: 288,    pdfHeight: 288 },
  '3x5':      { name: '3×5 Label',  widthInches: 3,    heightInches: 5,     canvasWidth: 288,  canvasHeight: 480,  pdfWidth: 216,    pdfHeight: 360 },
};

export interface PageSizeConfig {
  preset: string;           // key from PAGE_SIZE_PRESETS or 'custom'
  canvasWidth: number;
  canvasHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  widthInches?: number;     // original inches (for custom sizes)
  heightInches?: number;    // original inches (for custom sizes)
}

/**
 * Create a PageSizeConfig from arbitrary inch dimensions.
 * Conversion: 1 inch = 96 CSS px (canvas), 1 inch = 72 pt (PDF).
 */
export function customPageSize(widthInches: number, heightInches: number): PageSizeConfig {
  return {
    preset:       'custom',
    canvasWidth:  Math.round(widthInches * 96),
    canvasHeight: Math.round(heightInches * 96),
    pdfWidth:     Math.round(widthInches * 72 * 100) / 100,
    pdfHeight:    Math.round(heightInches * 72 * 100) / 100,
    widthInches,
    heightInches,
  };
}

export function defaultPageSize(): PageSizeConfig {
  const a4 = PAGE_SIZE_PRESETS['a4'];
  return {
    preset: 'a4',
    canvasWidth:  a4.canvasWidth,
    canvasHeight: a4.canvasHeight,
    pdfWidth:     a4.pdfWidth,
    pdfHeight:    a4.pdfHeight,
  };
}

// ── Element types ─────────────────────────────────────────────────────────────

export interface TextElementType {
  id: string; type: 'text'; content: string; role?: 'watermark';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    width?: number;
    opacity?: number;
    rotation?: number;
    textAlign?: 'left' | 'center' | 'right';
  };
  // Page number config — only applies to text elements inside footer zone
  pageNumber?: {
    enabled         : boolean;
    format          : 'Page X of Y' | 'X / Y' | 'X';
    alignment       : 'left' | 'center' | 'right';
    startFrom       : number;
  };
}

export interface ImageElementType {
  id: string; type: 'image'; src: string; role?: 'signature';
  position: { x: number; y: number };
  style: { width: number; height: number; objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'; opacity?: number };
}

export interface LineElementType {
  id: string; type: 'line';
  position: { x: number; y: number };
  style: { length: number; thickness: number; direction: 'horizontal' | 'vertical'; color: string; style: 'solid' | 'dashed' | 'dotted'; opacity?: number };
}

export interface BoxElementType {
  id: string; type: 'box'; shape?: string;
  position: { x: number; y: number };
  style: { width: number; height: number; borderWidth: number; borderColor: string; borderStyle: 'solid' | 'dashed' | 'dotted' | 'double'; backgroundColor: string; opacity?: number; borderRadius?: number };
}

export interface ParagraphElementType {
  id: string; type: 'paragraph'; content: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string; lineHeight?: number };
}

export interface RadioElementType {
  id: string; type: 'radio'; options: number; selected?: string; orientation?: string;
  position: { x: number; y: number; relativeOffset?: number };
}

export interface CheckboxElementType {
  id: string; type: 'checkbox'; count?: number; checkedValues?: string[]; orientation?: string;
  position: { x: number; y: number; relativeOffset?: number };
}

export interface DateElementType {
  id: string; type: 'date'; value?: string; time?: string; includeTime?: boolean; format?: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string };
}

export interface BarcodeElementType {
  id: string;
  type: 'barcode';
  content: string;            // the value to encode
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
  };
  barcode: {
    format: 'code128' | 'code39' | 'qrcode' | 'ean13' | 'upca' | 'itf14';
    showText: boolean;        // show human-readable text below barcode
  };
}

export type CanvasElement =
  | TextElementType | ImageElementType | LineElementType | BoxElementType
  | ParagraphElementType | RadioElementType | CheckboxElementType | DateElementType
  | BarcodeElementType
  | import('../model/layoutTable').LayoutTableElement;

// ── Header / Footer config ────────────────────────────────────────────────────

export interface ZoneStyle {
  backgroundColor : string;
  borderColor     : string;
  borderWidth     : number;   // top border for footer, bottom border for header
  opacity         : number;   // 0-1 for background transparency
}

export interface HeaderConfig {
  enabled          : boolean;
  repeatOnOverflow : boolean;   // repeat on every PDF overflow page from this canvas page
  boundaryY        : number;    // px from top of canvas — line position
  style            : ZoneStyle;
}

export interface FooterConfig {
  enabled          : boolean;
  repeatOnOverflow : boolean;
  boundaryY        : number;    // px from top of canvas — line position
  style            : ZoneStyle;
  // Page number formatting options
  pageNumberFormat    ?: 'Page X of Y' | 'X / Y' | 'X';
  pageNumberAlignment ?: 'left' | 'center' | 'right';
  pageNumberStartFrom ?: number;
}

export function defaultHeader(): HeaderConfig {
  return {
    enabled         : false,
    repeatOnOverflow: false,
    boundaryY       : 80,
    style           : { backgroundColor: 'transparent', borderColor: '#e2e8f0', borderWidth: 1, opacity: 1 },
  };
}

export function defaultFooter(canvasHeight?: number): FooterConfig {
  const h = canvasHeight ?? 1123;
  return {
    enabled         : false,
    repeatOnOverflow: false,
    boundaryY       : h - 80,
    style           : { backgroundColor: 'transparent', borderColor: '#e2e8f0', borderWidth: 1, opacity: 1 },
  };
}

// ── Canvas page ───────────────────────────────────────────────────────────────

export interface CanvasPage {
  pageId           : string;
  label            : string;
  repeatHeader     : boolean;       // legacy — kept for backward compat
  headerElementIds : string[];      // legacy — kept for backward compat
  elements         : CanvasElement[];
  header           : HeaderConfig;
  footer           : FooterConfig;
}

// ── Template document ─────────────────────────────────────────────────────────

export interface TemplateMeta {
  templateId : string;
  name       : string;
  createdAt  : string;
  updatedAt  : string;
}

export interface TemplateDocument {
  version : '2.0';
  meta    : TemplateMeta;
  pages   : CanvasPage[];
  pageSize?: PageSizeConfig;
  ai      : null | Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function createPage(overrides?: Partial<CanvasPage>): CanvasPage {
  return {
    pageId           : `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label            : 'Page',
    repeatHeader     : false,
    headerElementIds : [],
    elements         : [],
    header           : defaultHeader(),
    footer           : defaultFooter(),
    ...overrides,
  };
}

export function createTemplateDocument(
  pages    : CanvasPage[],
  name      = 'Untitled Template',
  existing ?: Partial<TemplateMeta>,
  pageSize ?: PageSizeConfig,
): TemplateDocument {
  const now = new Date().toISOString();
  return {
    version : '2.0',
    meta    : {
      templateId : existing?.templateId || crypto.randomUUID(),
      name,
      createdAt  : existing?.createdAt  || now,
      updatedAt  : now,
    },
    pages,
    pageSize,
    ai : null,
  };
}

/**
 * Migrate a v1.0 flat template to v2.0 pages format.
 */
export function migrateV1(json: any): TemplateDocument {
  const elements: CanvasElement[] = Array.isArray(json.elements) ? json.elements : [];
  const page = createPage({ pageId: 'page-1', label: 'Page 1', elements });
  return createTemplateDocument([page], 'Imported Template');
}

/**
 * Ensure a loaded page has header/footer fields (for templates saved
 * before header/footer was introduced).
 */
export function ensurePageDefaults(page: any): CanvasPage {
  return {
    ...page,
    header: page.header ?? defaultHeader(),
    footer: page.footer ?? defaultFooter(),
  };
}

// ── Zone helpers ──────────────────────────────────────────────────────────────

/** Elements whose Y is above the header boundary — in the header zone. */
export function getHeaderElements(page: CanvasPage): CanvasElement[] {
  if (!page.header.enabled) return [];
  return page.elements.filter(el => (el.position?.y ?? 0) < page.header.boundaryY);
}

/** Elements whose Y is at or below the footer boundary — in the footer zone. */
export function getFooterElements(page: CanvasPage): CanvasElement[] {
  if (!page.footer.enabled) return [];
  return page.elements.filter(el => (el.position?.y ?? 0) >= page.footer.boundaryY);
}

/** Elements in the content zone — between header and footer boundaries. */
export function getContentElements(page: CanvasPage, canvasHeight?: number): CanvasElement[] {
  const topBound    = page.header.enabled ? page.header.boundaryY : 0;
  const bottomBound = page.footer.enabled ? page.footer.boundaryY : (canvasHeight ?? 1123);
  return page.elements.filter(el => {
    const y = el.position?.y ?? 0;
    return y >= topBound && y < bottomBound;
  });
}
