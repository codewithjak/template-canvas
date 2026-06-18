/**
 * pdfImport/fill.ts  —  match-and-diff v2 (value transplant, deterministic halves)
 *
 * When a PDF strongly matches a corpus template, v1 adopts the template's
 * layout but leaves its {{tokens}} unfilled. v2 transplants the uploaded
 * document's actual values into those slots:
 *
 *   extractSlots(template)  → the fillable slots (scalar tokens + table columns)
 *   [ LLM fill call maps extracted text → values — backend /pdf-fill ]
 *   applyFill(clone, values) → tokens replaced, bound table expanded to real rows
 *
 * Both ends here are deterministic/testable; only the value mapping is the LLM.
 * Missing values keep their token (safe partial fill). See arch doc §8.
 */

import type { TemplateDocument } from '../../types/canvas';
import { isLayoutTable, type LayoutTableElement, type TableRow } from '../../model/layoutTable';

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

const tokensIn = (s: string): string[] => {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s)) !== null) out.push(m[1].trim());
  return out;
};

export interface FillSlots {
  /** Scalar token slots in text/paragraph elements, with their label context. */
  fields: { token: string; label: string }[];
  /** Bound/tokenized tables: their per-row column tokens + header labels. */
  tables: { elementId: string; columns: { token: string; header: string }[] }[];
}

export interface FillValues {
  fields: Record<string, string>;
  tables: { elementId: string; rows: Record<string, string>[] }[];
}

/** Schema-friendly shape returned by the backend filler ({token,value} pairs). */
export interface RawFill {
  fields: { token: string; value: string }[];
  tables: { elementId: string; rows: { token: string; value: string }[][] }[];
}

/** Convert the filler's pair-arrays into the record-keyed FillValues used here. */
export function toFillValues(raw: RawFill): FillValues {
  const fields: Record<string, string> = {};
  for (const f of raw.fields ?? []) if (f.value !== '') fields[f.token] = f.value;
  const tables = (raw.tables ?? []).map(t => ({
    elementId: t.elementId,
    rows: (t.rows ?? []).map(row => {
      const o: Record<string, string> = {};
      for (const c of row) o[c.token] = c.value;
      return o;
    }),
  }));
  return { fields, tables };
}

/** Collect the fillable slots from a matched template (what the LLM must fill). */
export function extractSlots(doc: TemplateDocument): FillSlots {
  const fields: FillSlots['fields'] = [];
  const tables: FillSlots['tables'] = [];
  const seen = new Set<string>();

  for (const page of doc.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'text' || el.type === 'paragraph') {
        const content = (el as { content?: string }).content ?? '';
        const label = content.replace(TOKEN_RE, ' ').replace(/\s+/g, ' ').trim();
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
          const header = tbl.headerRow?.cells?.[i]?.content?.value?.replace(TOKEN_RE, ' ').trim() || t;
          columns.push({ token: t, header });
        });
        if (columns.length) tables.push({ elementId: tbl.id, columns });
      }
    }
  }
  return { fields, tables };
}

/** Replace every {{token}} in a string with its value; unknown tokens stay. */
function substitute(s: string, values: Record<string, string>): string {
  return s.replace(TOKEN_RE, (_m, name) => {
    const v = values[String(name).trim()];
    return v !== undefined ? v : _m;
  });
}

/**
 * Apply filled values to a (cloned) matched template, in place. Scalars get
 * substituted; a tokenized table is expanded into one concrete row per extracted
 * row (binding disabled — this is a filled one-off instance, not a data-driven one).
 */
export function applyFill(doc: TemplateDocument, values: FillValues): void {
  const tableValues = new Map(values.tables.map(t => [t.elementId, t.rows]));

  for (const page of doc.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.type === 'text' || el.type === 'paragraph') {
        const e = el as { content: string };
        e.content = substitute(e.content, values.fields);
      } else if (isLayoutTable(el)) {
        const tbl = el as LayoutTableElement;
        const rows = tableValues.get(tbl.id);
        if (!rows || !rows.length || !tbl.rows?.[0]) continue;
        const templateRow = tbl.rows[0];
        tbl.rows = rows.map((rowVals): TableRow => ({
          ...JSON.parse(JSON.stringify(templateRow)),
          id: `${templateRow.id}-${Math.random().toString(36).slice(2, 8)}`,
          cells: templateRow.cells.map((cell) => ({
            ...JSON.parse(JSON.stringify(cell)),
            content: { type: 'text' as const, value: substitute(cell.content?.value ?? '', rowVals) },
          })),
        }));
        if (tbl.binding) tbl.binding = { ...tbl.binding, enabled: false };
      }
    }
  }
}
