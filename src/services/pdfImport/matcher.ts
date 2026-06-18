/**
 * pdfImport/matcher.ts  —  retrieval (corpus candidates)
 *
 * Builds the corpus candidates (text labels only — no geometry) used to find the
 * uploaded PDF's template FAMILY. The match is used solely as a naming/structure
 * alignment hint for the structurer — never to replace the PDF (the corpus is a
 * translator, not an inventory — arch doc §2.1, §3). The match decision itself is
 * a Claude call behind /pdf-match; the IO wrapper is in pdfImportService.
 */

import type { TemplateDocument } from '../../types/canvas';
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
