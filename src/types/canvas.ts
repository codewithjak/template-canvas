/**
 * canvas.ts  —  src/types/canvas.ts
 * Shared type definitions for the multi-page canvas.
 * Single source of truth — imported by components, services, and future AI layer.
 * No React, no JSX — pure TypeScript interfaces and helpers.
 */

// ── Element types ─────────────────────────────────────────────────────────────

export interface TextElementType {
  id: string; type: 'text'; content: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string };
}

export interface ImageElementType {
  id: string; type: 'image'; src: string;
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

export type CanvasElement =
  | TextElementType | ImageElementType | LineElementType | BoxElementType
  | ParagraphElementType | RadioElementType | CheckboxElementType | DateElementType
  | import('../model/layoutTable').LayoutTableElement;  // model lives at src/model/layoutTable.ts

// ── Canvas page ───────────────────────────────────────────────────────────────

export interface CanvasPage {
  pageId           : string;
  label            : string;
  repeatHeader     : boolean;
  headerElementIds : string[];
  elements         : CanvasElement[];
}

// ── Template document (the saved JSON shape) ──────────────────────────────────

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
  ai      : null | Record<string, unknown>;  // reserved for future AI enrichment
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function createPage(overrides?: Partial<CanvasPage>): CanvasPage {
  return {
    pageId           : `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label            : 'Page',
    repeatHeader     : false,
    headerElementIds : [],
    elements         : [],
    ...overrides,
  };
}

export function createTemplateDocument(
  pages: CanvasPage[],
  name  = 'Untitled Template',
  existing?: Partial<TemplateMeta>,
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
    ai : null,
  };
}

/**
 * Migrate a v1.0 flat template to v2.0 pages format.
 * Called automatically when loading an old JSON file.
 */
export function migrateV1(json: any): TemplateDocument {
  const elements: CanvasElement[] = Array.isArray(json.elements) ? json.elements : [];
  const page = createPage({ pageId: 'page-1', label: 'Page 1', elements });
  return createTemplateDocument([page], 'Imported Template');
}