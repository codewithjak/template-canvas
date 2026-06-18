/**
 * pdfImport/signature.ts  —  Phase: retrieval (corpus matching)
 *
 * A template "signature" is the text-only fingerprint used to recognise a
 * document family: its name + the static LABEL vocabulary (headings, table
 * column headers, field names). NO geometry — that's the contamination fence
 * (arch doc §2.1, §8): the corpus answers "what kind of doc is this", never
 * "where do things go". Geometry only ever comes from the extracted blocks.
 *
 * Two producers that must yield the same shape:
 *   - signatureFromTemplate(doc)   — for each corpus template
 *   - signatureFromBlocks(pages)   — for the uploaded PDF
 */

import type { TemplateDocument } from '../../types/canvas';
import type { NormalizedDocument } from './types';

export interface TemplateSignature {
  /** Human/doc-type name (templates only; undefined for an unknown upload). */
  name?: string;
  /** Deduped, lowercased short label/field tokens — the discriminative vocabulary. */
  labels: string[];
}

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const MAX_LABELS = 60;
const MAX_LEN = 48;

/** Normalize + dedupe label candidates: short, lowercased, non-empty, unique. */
function tidy(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (!s) continue;
    const t = s.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t || t.length < 2 || t.length > MAX_LEN || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

/** Pull {{token}} field-names out of a string (returns the inner names). */
function tokens(s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s)) !== null) out.push(m[1]);
  return out;
}

export function signatureFromTemplate(doc: TemplateDocument): TemplateSignature {
  const raw: string[] = [];
  for (const page of doc.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'text' || el.type === 'paragraph') {
        const c = (el as { content?: string }).content ?? '';
        // Static label text (tokens removed) + token field-names — never the raw "{{x}}".
        raw.push(c.replace(TOKEN_RE, ' '), ...tokens(c));
      } else if (el.type === 'table') {
        const tbl = el as {
          columns?: unknown[];
          headerRow?: { cells?: { content?: { value?: string } }[] };
          rows?: { cells?: { content?: { value?: string } }[] }[];
        };
        for (const cell of tbl.headerRow?.cells ?? []) raw.push(cell.content?.value ?? '');
        for (const row of tbl.rows ?? []) for (const cell of row.cells ?? []) {
          raw.push(...tokens(cell.content?.value ?? ''));
        }
      }
    }
  }
  return { name: doc.meta?.name, labels: tidy(raw) };
}

export function signatureFromBlocks(doc: NormalizedDocument): TemplateSignature {
  const raw: string[] = [];
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.kind === 'text' || b.kind === 'paragraph') raw.push(b.text);
    }
  }
  return { labels: tidy(raw) };
}
