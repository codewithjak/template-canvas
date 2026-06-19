/**
 * src/services/dataSourceService.ts
 *
 * All data-source network calls.
 * Every function works exclusively with CanonicalDocument { fields, collections, source }.
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 * GenerateDocumentParams now accepts three optional row-scoping fields:
 *   rowIndex            — which driver row to render (default 0)
 *   driverCollectionKey — which collection drives the loop
 *   relatedCollections  — FK config so server scopes child collections
 *
 * These are passed to POST /generate-document so the server can call
 * buildRowIr() and produce a single-record scoped IR — fixing the bug
 * where all rows from every collection were rendered into one PDF.
 */

import type {
  CanonicalDocument,
  FieldMapping,
  CollectionMappings,
  TableCollectionBindings,
} from '../types/dataSource';

import { API_BASE, authHeaders } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function expectJson(res: Response, context: string): Promise<Record<string, unknown>> {
  if (!res.ok) {
    let msg = `${context} failed (${res.status})`;
    try {
      const b = await res.json() as { error?: string };
      if (b.error) msg = b.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

function toCanonicalDocument(raw: Record<string, unknown>): CanonicalDocument {
  if (!raw.fields || typeof raw.fields !== 'object' || Array.isArray(raw.fields)) {
    throw new Error('Server response is missing "fields". Ensure the server is running v2.');
  }
  if (!raw.collections || typeof raw.collections !== 'object' || Array.isArray(raw.collections)) {
    throw new Error('Server response is missing "collections".');
  }
  return {
    fields:      raw.fields      as Record<string, string>,
    collections: raw.collections as CanonicalDocument['collections'],
    source:      raw.source      as CanonicalDocument['source'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// File upload
// ─────────────────────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<CanonicalDocument> {
  const form = new FormData();
  form.append('file', file);
  const res  = await fetch(`${API_BASE}/parse-data`, { method: 'POST', body: form });
  const body = await expectJson(res, 'parseFile');
  return toCanonicalDocument(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON / API data
// ─────────────────────────────────────────────────────────────────────────────

export async function parseJsonData(data: unknown): Promise<CanonicalDocument> {
  const res = await fetch(`${API_BASE}/parse-json`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data }),
  });
  const body = await expectJson(res, 'parseJsonData');
  return toCanonicalDocument(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageExportData {
  pageId:                   string;
  label?:                   string;
  templateElements:         unknown[];
  header?:                  object | null;
  footer?:                  object | null;
  fieldMapping?:            FieldMapping;
  tableCollectionBindings?: TableCollectionBindings;
  collectionMappings?:      CollectionMappings;
}

export interface GenerateDocumentParams {
  pages:           PageExportData[];
  ir:              CanonicalDocument;
  outputFileName?: string;
  /**
   * Row-scoping for single PDF export.
   * The server passes these to buildRowIr() so only the requested record's
   * data is rendered — related collections are filtered by FK, and driver
   * row columns are promoted to ir.fields.
   *
   * When omitted the server renders without row scoping (static templates).
   */
  rowIndex?:            number;
  driverCollectionKey?: string;
  relatedCollections?:  Record<string, {
    filterColumn:   string;   // column in the related collection
    driverRowField: string;   // field in the driver row to match against
  }>;
  pageSize?: { canvasWidth: number; canvasHeight: number; pdfWidth: number; pdfHeight: number };
  format?: 'pdf' | 'zpl' | 'png' | 'jpeg';
  dpi?:         number;   // image formats only; server clamps 72–600, defaults 300
  jpegQuality?: number;   // 0..1, jpeg only
}

/** Response deadline for the calendar reminder — relative to now, or absolute. */
export type DeadlineSpec =
  | { mode: 'relative'; value: { days?: number; hours?: number; minutes?: number } }
  | { mode: 'absolute'; value: string };

export interface EmailDelivery {
  to:       string;
  subject?: string;
  message?: string;
}

export interface CalendarReminder {
  title?:   string;
  deadline: DeadlineSpec;
}

/** Where an export should be sent. `calendar` adds an optional .ics reminder. */
export interface DeliverySpec {
  email:     EmailDelivery;
  calendar?: CalendarReminder;
}

export interface SendDocumentResult {
  ok:            boolean;
  viaLink:       boolean;
  withReminder?: boolean;
}

export interface BulkDocumentOptions {
  driverCollectionKey: string;
  fileNameTemplate?:   string;
  zipFileName?:        string;
  relatedCollections?: Record<string, {
    filterColumn:   string;
    driverRowField: string;
  }>;
}

export interface GenerateBulkDocumentsParams extends GenerateDocumentParams {
  bulk: BulkDocumentOptions;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF generation — single document
// ─────────────────────────────────────────────────────────────────────────────

/** The /generate-document request body shared by download and email-send. */
function generatePayload(params: GenerateDocumentParams): Record<string, unknown> {
  return {
    pages:               params.pages,
    ir:                  params.ir,
    outputFileName:      params.outputFileName ?? 'document',
    // Row-scoping fields — forwarded to server buildRowIr()
    rowIndex:            params.rowIndex ?? 0,
    driverCollectionKey: params.driverCollectionKey,
    relatedCollections:  params.relatedCollections ?? {},
    pageSize:            params.pageSize ?? null,
    format:              params.format ?? 'pdf',
    dpi:                 params.dpi,
    jpegQuality:         params.jpegQuality,
  };
}

export async function generateDocument(params: GenerateDocumentParams): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-document`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    JSON.stringify(generatePayload(params)),
  });

  if (!res.ok) {
    let msg = `generateDocument failed (${res.status})`;
    try {
      const b = await res.json() as { error?: string };
      if (b.error) msg = b.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.blob();
}

/**
 * Render an export and email it (instead of downloading). Same payload as
 * generateDocument plus a `delivery` block; the server sends the file and
 * returns a small JSON status.
 */
export async function sendDocument(
  params:   GenerateDocumentParams,
  delivery: DeliverySpec,
): Promise<SendDocumentResult> {
  const res = await fetch(`${API_BASE}/generate-document`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    JSON.stringify({ ...generatePayload(params), delivery }),
  });
  const body = await expectJson(res, 'sendDocument');
  return {
    ok:           body.ok === true,
    viaLink:      body.viaLink === true,
    withReminder: body.withReminder === true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF generation — bulk documents
// ─────────────────────────────────────────────────────────────────────────────

export async function generateBulkDocuments(params: GenerateBulkDocumentsParams): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-bulk-documents`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    JSON.stringify({
      pages:          params.pages,
      ir:             params.ir,
      outputFileName: params.outputFileName ?? 'documents',
      bulk:           params.bulk,
      pageSize:       params.pageSize ?? null,
      format:         params.format ?? 'pdf',
      dpi:            params.dpi,
      jpegQuality:    params.jpegQuality,
    }),
  });

  if (!res.ok) {
    let msg = `generateBulkDocuments failed (${res.status})`;
    try {
      const b = await res.json() as { error?: string };
      if (b.error) msg = b.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.blob();
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience — download single document directly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File extension for a downloaded export blob, derived from its MIME type.
 * Handles the multi-page image case: a single export spanning >1 page comes back
 * as application/zip, not an image. Falls back to the requested format.
 */
export function extFromBlob(blob: Blob, fallbackFormat: string = 'pdf'): string {
  const t = (blob.type || '').toLowerCase();
  if (t.startsWith('application/pdf')) return 'pdf';
  if (t.startsWith('application/zip')) return 'zip';
  if (t.startsWith('image/png'))       return 'png';
  if (t.startsWith('image/jpeg'))      return 'jpg';
  if (t.startsWith('text/plain'))      return 'zpl';
  return fallbackFormat === 'jpeg' ? 'jpg' : fallbackFormat === 'png' ? 'png' : fallbackFormat === 'zpl' ? 'zpl' : 'pdf';
}

export async function downloadDocument(params: GenerateDocumentParams): Promise<void> {
  const blob   = await generateDocument(params);
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `${params.outputFileName ?? 'document'}.${extFromBlob(blob, params.format)}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}