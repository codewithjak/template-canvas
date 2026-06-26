/**
 * architect.ts — cloud pack's intent → blueprint (P10).
 *
 * Tries the server LLM architect to pick a reference pattern; on any failure
 * (signed out, no API key, offline) falls back to a local keyword match. Either
 * way it returns a vetted blueprint (never free-generated), adapted with the
 * chosen name/region, ready to drop on the canvas and review.
 */

import type { Blueprint } from '../../../types/blueprint';
import { PATTERNS, patternMeta } from './patterns';
import { architectSelect } from '../../../run/architectApi';

function localMatch(intent: string) {
  const text = intent.toLowerCase();
  let best = PATTERNS[0];
  let bestScore = -1;
  for (const p of PATTERNS) {
    const score = p.tags.reduce((s, tag) => s + (text.includes(tag) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export async function suggestBlueprint(intent: string): Promise<Blueprint | null> {
  const text = intent.trim();
  if (!text) return null;

  let patternId: string | null = null;
  let region = 'us-east-1';
  let name = text.length > 40 ? text.slice(0, 40) : text;

  try {
    const choice = await architectSelect(text, patternMeta());
    patternId = choice.patternId;
    region = choice.region || region;
    name = choice.name || name;
  } catch {
    // LLM unavailable — local keyword match below.
  }

  const chosen = (patternId && PATTERNS.find((p) => p.id === patternId)) || localMatch(text);
  if (!chosen) return null;

  const blueprint = structuredClone(chosen.blueprint);
  blueprint.meta = { pack: 'cloud', name: name || chosen.title, provider: 'aws', region };
  return blueprint;
}
