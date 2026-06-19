'use strict';
/**
 * backend/pdfImport/structurer.js  —  Phase 4 (LLM structurer)
 *
 * Calls Claude to produce a STRUCTURE PLAN over already-normalized blocks:
 * which text blocks group into paragraphs, their semantic role, and which
 * blocks fall in the header/footer zones. See AI_PDF_REBUILD_ARCHITECTURE.md §4.
 *
 * INVARIANTS (the whole point of the design):
 *  - The model only CLASSIFIES and GROUPS — it references block IDs, never
 *    authors coordinates. Geometry is re-injected from the blocks downstream
 *    (frontend materializer), so the model cannot perturb positions.
 *  - Deterministic fallback floor: if there's no API key or the call fails,
 *    the endpoint signals that and the client uses the pass-through structurer.
 *    The import always succeeds.
 *
 * Model + params per the claude-api skill: claude-opus-4-8, structured outputs
 * (output_config.format), thinking off + tuned effort for latency.
 */

const { structuredJson, isAvailable } = require('./ai');

// JSON schema for the plan — obeys structured-output limits (additionalProperties
// false everywhere, no numeric/length constraints, all properties required).
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                blockIds: { type: 'array', items: { type: 'string' } },
                type: { type: 'string', enum: ['text', 'paragraph'] },
                role: { type: 'string', enum: ['title', 'heading', 'watermark', 'none'] },
                content: { type: 'string' },
              },
              required: ['blockIds', 'type', 'role', 'content'],
            },
          },
          tables: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                headerBlockIds: { type: 'array', items: { type: 'string' } },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                columnTokens: { type: 'array', items: { type: 'string' } },
                collectionKey: { type: 'string' },
              },
              required: ['headerBlockIds', 'rows', 'columnTokens', 'collectionKey'],
            },
          },
          headerBlockIds: { type: 'array', items: { type: 'string' } },
          footerBlockIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['groups', 'tables', 'headerBlockIds', 'footerBlockIds'],
      },
    },
  },
  required: ['pages'],
};

const SYSTEM = `You convert an uploaded PDF into a REUSABLE TOKENIZED TEMPLATE.
You are given, per page, already-extracted text BLOCKS with measured geometry
(canvas px, top-left origin). You CLASSIFY and GROUP them, and you TOKENIZE their
content — replacing the specific document's VALUES with named placeholders so the
template can later be filled from a data source. You MUST NOT invent block IDs and
MUST NOT output coordinates — geometry is owned by the extractor.

TOKENIZATION (the core job):
- A "value" is content specific to this one document (names, numbers, dates, IDs,
  amounts, addresses, line-item cells). Replace each value with a {{snake_case}}
  placeholder named for what it holds, e.g. "INV-2026-014" → {{invoice_no}},
  "ACME Corp" → {{company_name}}, "2026-06-18" → {{invoice_date}}, "$500" → {{amount}}.
- A "label" is fixed boilerplate (field captions, column headers, headings, legal
  text). Keep labels VERBATIM — do not tokenize them.
- Mixed lines keep the label and tokenize the value: "Invoice No: INV-2026-014"
  → "Invoice No: {{invoice_no}}". A standalone value becomes just its token.

For each page return:
- tables: repeating rows of values aligned into columns (line items, data grids).
  * headerBlockIds: one block id per column for the header row (the column LABELS),
    left-to-right; [] if there is no header row.
  * rows: array of rows; each row is the cell block ids left-to-right, ONE ENTRY
    PER COLUMN, "" for an empty cell. (Used only to locate/size columns.)
  * columnTokens: a {{}}-free snake_case token name per column, same order as the
    columns, e.g. ["qty","description","amount"].
  * collectionKey: snake_case name for the row collection, e.g. "line_items".
  * Only "text" blocks; a block in a table must NOT also be in a group. Only emit
    a table for genuine tabular structure (≥2 columns, ≥2 aligned rows).
- groups: TEXT blocks NOT in a table, each becoming one element.
  * Merge continuation lines of one paragraph into a "paragraph" group; a standalone
    line is a "text" group.
  * role: "title"/"heading" for prominent headings, "watermark" for faint background
    text, else "none".
  * content: the TOKENIZED text for the whole group (labels kept, values → tokens).
  * Every text block id appears in exactly one place: a table cell OR a group.
- headerBlockIds / footerBlockIds: ids of blocks in the top header band / bottom
  footer band (letterhead, running titles, page numbers). Empty if none.

Reuse the SAME token name when the same field recurs. Be conservative about tables.`;

/** Compact per-page block payload for the prompt (text content + geometry only). */
function toPromptPages(pages) {
  return pages.map((p, i) => ({
    page: i,
    width: Math.round(p.widthPx),
    height: Math.round(p.heightPx),
    blocks: p.blocks.slice(0, 250).map((b) => ({
      id: b.id,
      kind: b.kind,
      x: Math.round(b.rect.x),
      y: Math.round(b.rect.y),
      w: Math.round(b.rect.width),
      h: Math.round(b.rect.height),
      ...(b.kind === 'text' || b.kind === 'paragraph'
        ? { text: b.text, fontSize: Math.round(b.fontSizePx) }
        : {}),
    })),
  }));
}

const ALIGN_PREAMBLE =
  'An "exemplar" (a matching template family\'s token/column NAMES) is included as an ' +
  'ALIGNMENT guide: prefer its token names + table column tokens + collectionKey when the ' +
  'field semantics match THIS document. Never copy its content or invent fields it has but ' +
  'this document lacks.\n\n';

/**
 * @typedef {{ fields: {token:string,label:string}[], tables: {columns:{token:string,header:string}[]}[] }} Exemplar
 * @param {Array<{widthPx:number,heightPx:number,blocks:object[]}>} pages  normalized pages
 * @param {Exemplar|null} [exemplar]  geometry-stripped naming/structure skeleton of a matched
 *   corpus template. ALIGNMENT HINT ONLY — guides token names; never copied as content/geometry.
 *   The template is always built from THIS PDF's blocks.
 * @returns {Promise<{pages: object[]}>}  the structure plan (one entry per input page)
 * @throws if no API key or the model call fails — caller falls back to pass-through.
 */
async function structureBlocks(pages, exemplar = null) {
  const payload = { pages: toPromptPages(pages) };
  if (exemplar) payload.exemplar = exemplar;

  return structuredJson({
    system: SYSTEM,
    user:
      (exemplar ? ALIGN_PREAMBLE : '') +
      'Structure these pages into a tokenized template. Return JSON matching the schema.\n\n' +
      JSON.stringify(payload),
    schema: PLAN_SCHEMA,
    // Latency: thinking off + medium effort cuts this from ~minutes to ~15s while keeping
    // tokenization thorough (low effort under-tokenized, e.g. left a title company name literal).
    maxTokens: 8000,
    effort: 'medium',
  });
}

module.exports = { structureBlocks, isAvailable };
