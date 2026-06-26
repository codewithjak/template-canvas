'use strict';

/**
 * backend/cloud/llm/architect.js
 *
 * The LLM architect (P10): given an app description and a list of vetted
 * reference patterns, pick the single best-matching pattern id. It SELECTS, it
 * never invents — the frontend owns the actual blueprints. Reuses the shared
 * Claude client (pdfImport/ai.js), the same intent→structure muscle as the
 * AI PDF→template feature.
 */

const ai = require('../../pdfImport/ai');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['patternId', 'region', 'name'],
  properties: {
    patternId: { type: 'string', description: 'One of the provided pattern ids — never invent one.' },
    region: { type: 'string', description: 'A sensible AWS region, e.g. us-east-1.' },
    name: { type: 'string', description: 'A short name for the project.' },
    rationale: { type: 'string' },
  },
};

async function selectPattern({ intent, patterns, provider = 'aws' }) {
  if (!ai.isAvailable || !ai.isAvailable()) {
    const e = new Error('AI architect unavailable: ANTHROPIC_API_KEY not set.');
    e.code = 'NO_API_KEY';
    e.status = 503;
    throw e;
  }

  const list = patterns.map((p) => `- ${p.id}: ${p.title} — ${p.description}`).join('\n');
  const system =
    'You are a senior cloud architect. Choose the SINGLE best-matching reference '
    + 'architecture for the user\'s app from the provided list. You MUST return one of the '
    + `given patternId values exactly — never invent one. Target provider: ${provider}. `
    + 'Pick a sensible region (default us-east-1).';
  const user = `App description:\n${intent}\n\nAvailable patterns:\n${list}`;

  const choice = await ai.structuredJson({ system, user, schema: SCHEMA, effort: 'low', maxTokens: 500 });

  // Guard: never trust a hallucinated id.
  if (!patterns.some((p) => p.id === choice.patternId)) {
    choice.patternId = patterns[0].id;
  }
  return choice;
}

module.exports = { selectPattern };
