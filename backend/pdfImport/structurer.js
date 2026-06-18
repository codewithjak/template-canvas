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
 * Model + params per the claude-api skill: claude-opus-4-8, adaptive thinking,
 * structured outputs (output_config.format). No sampling params (removed on 4.8).
 */

const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default ?? AnthropicMod;

const MODEL = 'claude-opus-4-8';

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
              },
              required: ['blockIds', 'type', 'role'],
            },
          },
          headerBlockIds: { type: 'array', items: { type: 'string' } },
          footerBlockIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['groups', 'headerBlockIds', 'footerBlockIds'],
      },
    },
  },
  required: ['pages'],
};

const SYSTEM = `You are a layout-structuring assistant for a PDF→template importer.
You are given, per page, a list of already-extracted layout BLOCKS with exact
measured geometry (canvas pixels, top-left origin). Your ONLY job is to CLASSIFY
and GROUP them. You MUST NOT invent block IDs, and you MUST NOT output any
coordinates — geometry is owned by the extractor, not you.

For each page return:
- groups: arrays of TEXT block ids that should merge into one element.
  * Merge consecutive lines of the same paragraph into one "paragraph" group.
  * A single standalone line is a "text" group with one id.
  * role: "title"/"heading" for prominent headings, "watermark" for faint
    diagonal/background text, otherwise "none".
  * Only group blocks of kind "text". Never put a line/rect/image id in a group.
  * Every text block id must appear in exactly one group.
- headerBlockIds: ids of blocks in the top header band (logo, letterhead, page
  title running across the top). Empty if there is no clear header.
- footerBlockIds: ids of blocks in the bottom footer band (page numbers, fine
  print). Empty if there is no clear footer.

Group by reading order and visual proximity using the provided geometry. Be
conservative: when unsure whether two lines are one paragraph, keep them
separate.`;

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

/** True when the structurer can run (API key present). */
function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * @param {Array} pages  normalized pages: { widthPx, heightPx, blocks: Block[] }
 * @returns {Promise<{pages: Array}>}  the structure plan (one entry per input page)
 * @throws if no API key or the model call fails — caller falls back to pass-through.
 */
async function structureBlocks(pages) {
  if (!isAvailable()) {
    const err = new Error('LLM structurer unavailable: ANTHROPIC_API_KEY not set');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const client = new Anthropic();
  const promptPages = toPromptPages(pages);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          'Structure these pages. Return JSON matching the schema.\n\n' +
          JSON.stringify({ pages: promptPages }),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('LLM structurer returned no text content');
  return JSON.parse(textBlock.text);
}

module.exports = { structureBlocks, isAvailable };
