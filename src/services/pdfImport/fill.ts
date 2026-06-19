/**
 * pdfImport/slots.ts (file: fill.ts) — slot extraction for the alignment exemplar
 *
 * Reads a matched corpus template's fillable SLOTS — scalar `{{token}}` field
 * names (with their label context) and table column tokens (with headers). This
 * is the geometry-stripped skeleton fed to the structurer as a NAMING/STRUCTURE
 * hint so the template generated from the uploaded PDF aligns its token names to
 * the matched family (arch doc §2.1, §3). No geometry, no content — names only.
 */

import type { TemplateDocument } from '../../types/canvas';
import { isLayoutTable, type LayoutTableElement } from '../../model/layoutTable';
import { tokensIn, stripTokens } from './tokens';

export interface FillSlots {
  /** Scalar token slots in text/paragraph elements, with their label context. */
  fields: { token: string; label: string }[];
  /** Tokenized tables: their per-column tokens + header labels. */
  tables: { elementId: string; columns: { token: string; header: string }[] }[];
}

/** Collect the token vocabulary (fields + table columns) from a template. */
export function extractSlots(doc: TemplateDocument): FillSlots {
  const fields: FillSlots['fields'] = [];
  const tables: FillSlots['tables'] = [];
  const seen = new Set<string>();

  for (const page of doc.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'text' || el.type === 'paragraph') {
        const content = (el as { content?: string }).content ?? '';
        const label = stripTokens(content).replace(/\s+/g, ' ').trim();
        for (const token of tokensIn(content)) {
          if (seen.has(token)) continue;
          seen.add(token);
          fields.push({ token, label: label || token });
        }
      } else if (isLayoutTable(el)) {
        const tbl = el as LayoutTableElement;
        const bodyRow = tbl.rows?.[0];
        if (!bodyRow) continue;
        const columns: { token: string; header: string }[] = [];
        bodyRow.cells.forEach((cell, i) => {
          const t = tokensIn(cell.content?.value ?? '')[0];
          if (!t) return;
          const header = stripTokens(tbl.headerRow?.cells?.[i]?.content?.value ?? '').trim() || t;
          columns.push({ token: t, header });
        });
        if (columns.length) tables.push({ elementId: tbl.id, columns });
      }
    }
  }
  return { fields, tables };
}
