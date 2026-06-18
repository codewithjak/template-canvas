/**
 * pdfImport/matcher.ts  —  retrieval / match-and-diff (pure helpers)
 *
 * Pure, testable pieces of corpus matching:
 *   - buildCorpus()    — turn the template library into match candidates
 *   - buildFromMatch() — clone a matched template into a fresh editable doc
 *
 * The actual match decision (a Claude call) lives behind the backend
 * /pdf-match endpoint; the IO wrapper is in pdfImportService. See arch doc §8.
 */

import { createTemplateDocument, type CanvasPage, type TemplateDocument } from '../../types/canvas';
import { signatureFromTemplate } from './signature';

/** A corpus candidate as sent to the matcher (text labels only — no geometry). */
export interface CorpusEntry {
  key: string;
  name: string;
  labels: string[];
}

/** The matcher's verdict. `key === ''` (or confidence 0) means no clear match. */
export interface MatchResult {
  key: string;
  name?: string;
  confidence: number;
  reason?: string;
}

/** Build corpus candidates from template-library entries ({ id, name, doc }). */
export function buildCorpus(
  templates: { id: string; name: string; doc: TemplateDocument }[],
): CorpusEntry[] {
  return templates.map(t => {
    const sig = signatureFromTemplate(t.doc);
    return { key: t.id, name: t.name, labels: sig.labels };
  });
}

/**
 * Match-and-diff: adopt a matched template's known-good layout. Deep-clones the
 * template into a fresh, unsaved document (new id/name, matched executionMode
 * preserved) and records the match provenance in `ai`. Layout/tables/zones/
 * bindings come from the proven template; the user fills values via binding.
 */
export function buildFromMatch(
  matched: TemplateDocument,
  fileName: string,
  match: MatchResult,
): TemplateDocument {
  const clonedPages: CanvasPage[] = JSON.parse(JSON.stringify(matched.pages ?? []));
  const pageSize = matched.pageSize ? JSON.parse(JSON.stringify(matched.pageSize)) : undefined;
  const name = fileName.replace(/\.[^.]+$/, '') || matched.meta?.name || 'Imported PDF';

  const doc = createTemplateDocument(
    clonedPages,
    name,
    matched.meta?.executionMode ? { executionMode: matched.meta.executionMode } : undefined,
    pageSize,
  );
  doc.ai = {
    importer: 'pdf-match',
    matchedTemplate: { key: match.key, name: match.name, confidence: match.confidence },
  };
  return doc;
}
