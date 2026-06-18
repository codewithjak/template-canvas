'use strict';
/**
 * backend/pdfImport/filler.js  —  match-and-diff v2 (value fill, Claude)
 *
 * Given a matched template's fillable slots (scalar fields with labels, tables
 * with column headers) and the uploaded document's text lines, map each slot to
 * its value from the document. Scalars → one value; tables → one row per data
 * row found. The model fills VALUES only; it never invents tokens or geometry.
 * See AI_PDF_REBUILD_ARCHITECTURE.md §8.
 */

const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default ?? AnthropicMod;

const MODEL = 'claude-opus-4-8';

const PAIR = {
  type: 'object', additionalProperties: false,
  properties: { token: { type: 'string' }, value: { type: 'string' } },
  required: ['token', 'value'],
};
const FILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fields: { type: 'array', items: PAIR },
    tables: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          elementId: { type: 'string' },
          rows: { type: 'array', items: { type: 'array', items: PAIR } },
        },
        required: ['elementId', 'rows'],
      },
    },
  },
  required: ['fields', 'tables'],
};

const SYSTEM = `You transplant a document's values into a matched template.
You get the template's SLOTS:
- fields: scalar tokens, each with a label describing what it holds.
- tables: each has an elementId and column tokens (with header names).
And the uploaded document's TEXT lines.

Fill each slot with the matching value found in the text:
- fields: return {token, value} for every field token; use "" if the document
  has no matching value. Match by meaning of the label, not exact wording.
- tables: for each table, return one row per data row in the document, each row
  being {token, value} per column. Preserve document order. Omit the header row.

Only use values present in the document. Never invent data. Echo token strings
exactly as given. Echo elementId exactly.`;

function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * @param {{slots:object, texts:string[]}} input
 * @returns {Promise<{fields:Array,tables:Array}>}
 */
async function fillTemplate({ slots, texts }) {
  if (!isAvailable()) {
    const err = new Error('Filler unavailable: ANTHROPIC_API_KEY not set');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const client = new Anthropic();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: FILL_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify({ slots, document: texts }) }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Filler returned no text content');
  return JSON.parse(textBlock.text);
}

module.exports = { fillTemplate, isAvailable };
