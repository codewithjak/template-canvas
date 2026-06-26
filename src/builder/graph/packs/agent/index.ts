/**
 * index.ts — agent DomainPack (stub).
 *
 * Mirrors the cloud pack's structure; split catalog/compile/lint/run into
 * sibling files (as in packs/cloud/) once it grows past a stub. See
 * AGENT_BUILDER_ARCHITECTURE.md (phases A0–A6).
 */

import type { DomainPack } from '../../spine/domainPack';
import { registerPack } from '../../spine/registry';

export const agentPack: DomainPack = {
  id: 'agent',
  mode: 'wire',
  catalog: [], // TODO A1: input · llm · tool · http · branch · loop · human · output
  compile: (bp) => `// WorkflowSpec for "${bp.meta.name}" — TODO A2\n`,
  lint: () => [],
  run: async (_artifact, ctx) => {
    ctx.onProgress?.({ status: 'log', message: 'Agent runtime not yet implemented (A4).' });
    return { ok: false };
  },
};

registerPack(agentPack);
