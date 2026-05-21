/**
 * src/services/dataSourceService.ts
 *
 * All data-source network calls.
 * Every function works exclusively with CanonicalDocument { fields, collections, source }.
 * No legacy aliases. No staticData. No metadata.
 *
 * Exports
 * ───────
 *   parseFile(file)          → CanonicalDocument
 *   parseJsonData(data)      → CanonicalDocument
 *   generateDocument(params) → Blob
 *   downloadDocument(params) → void  (triggers browser download)
 */

import type { CanonicalDocument, FieldMapping, CollectionMappings, TableCollectionBindings } from '../types/dataSource';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

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

/**
 * Read { fields, collections, source } from the server response.
 * Throws immediately if the shape is wrong so callers find out at parse time.
 */
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
// File upload  (Excel / CSV / JSON file)
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
// PDF generation
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
}

export async function generateDocument(params: GenerateDocumentParams): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-document`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      pages:          params.pages,
      ir:             params.ir,
      outputFileName: params.outputFileName ?? 'document',
    }),
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

export async function downloadDocument(params: GenerateDocumentParams): Promise<void> {
  const blob   = await generateDocument(params);
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `${params.outputFileName ?? 'document'}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}