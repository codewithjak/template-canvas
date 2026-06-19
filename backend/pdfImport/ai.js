'use strict';
/**
 * backend/pdfImport/ai.js — shared LLM client for the AI import steps.
 *
 * One place for the SDK wiring, model, availability check, and the
 * JSON-schema-constrained call + parse — reused by the matcher and structurer.
 * Per the claude-api skill: claude-opus-4-8, structured outputs (output_config),
 * no sampling params; thinking is off and effort is tuned per call for latency.
 */

const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default ?? AnthropicMod;

const MODEL = 'claude-opus-4-8';

/** True when the AI steps can run (API key present). */
function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Call the model with a JSON-schema-constrained response and return the parsed object.
 * @template T
 * @param {object} opts
 * @param {string} opts.system        system prompt
 * @param {string} opts.user          user message text
 * @param {object} opts.schema        JSON schema for output_config.format
 * @param {number} [opts.maxTokens]   response cap (default 4000)
 * @param {'low'|'medium'|'high'|'max'} [opts.effort]  thinking/effort (default 'medium')
 * @returns {Promise<T>}
 * @throws {Error & {code?: string}} `NO_API_KEY` when unconfigured; caller falls back.
 */
async function structuredJson({ system, user, schema, maxTokens = 4000, effort = 'medium' }) {
  if (!isAvailable()) {
    const err = new Error('AI step unavailable: ANTHROPIC_API_KEY not set');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const client = new Anthropic();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('AI step returned no text content');
  return JSON.parse(textBlock.text);
}

module.exports = { structuredJson, isAvailable, MODEL };
