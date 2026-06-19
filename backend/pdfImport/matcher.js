'use strict';
/**
 * backend/pdfImport/matcher.js  —  retrieval (corpus match, Claude)
 *
 * Given the uploaded document's text labels and a list of candidate templates
 * (key/name/labels), pick the template whose document TYPE best matches — or
 * none. Tiny corpus (dozens), so the whole corpus goes in one Messages call;
 * no embeddings / vector DB needed (Anthropic has no embeddings endpoint).
 * See AI_PDF_REBUILD_ARCHITECTURE.md §8.
 *
 * Conservative by design: a wrong family match is worse than no match, so the
 * model is told to prefer key:"" unless the type is clearly the same.
 */

const { structuredJson, isAvailable } = require('./ai');

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string' },        // matched corpus key, or "" for no clear match
    confidence: { type: 'number' }, // 0..1
    reason: { type: 'string' },
  },
  required: ['key', 'confidence', 'reason'],
};

const SYSTEM = `You match an uploaded document to a library of template types.
You get the upload's text LABELS (headings, column headers, field names) and a
list of candidate templates, each with a key, name, and its own labels.

Pick the ONE template whose DOCUMENT TYPE the upload clearly is (e.g. both are
invoices, both are bills of lading). Judge by shared label vocabulary and
purpose — never by exact wording.

Be conservative: if no candidate is clearly the same type, return key:"" with a
low confidence. A wrong match is worse than no match. confidence is 0..1.
Return only a key from the provided list, or "".`;

/**
 * @typedef {{ key: string, name?: string, labels: string[] }} CorpusCandidate
 * @param {{ extracted: { labels: string[] }, corpus: CorpusCandidate[] }} input
 * @returns {Promise<{ key: string, confidence: number, reason: string }>}
 */
async function matchTemplate({ extracted, corpus }) {
  // Latency: family match is a quick classification — low effort.
  const r = await structuredJson({
    system: SYSTEM,
    user: 'Upload labels and candidate templates:\n\n' +
      JSON.stringify({ upload: extracted.labels, candidates: corpus }),
    schema: RESULT_SCHEMA,
    maxTokens: 800,
    effort: 'low',
  });
  // Guard: the model must return a key that exists in the corpus, else treat as no match.
  if (r.key && !corpus.some((c) => c.key === r.key)) return { key: '', confidence: 0, reason: 'hallucinated key' };
  return r;
}

module.exports = { matchTemplate, isAvailable };
