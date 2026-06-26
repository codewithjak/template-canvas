/**
 * index.ts — ui DomainPack (stub).
 *
 * Runs the shared canvas in LAYOUT mode (drag-to-nest, not wired arrows). Its
 * emitter and runtime reuse COMPONENT_EXPORT_ARCHITECTURE.md (React bundle +
 * WebContainers); only the editing surface is re-homed onto the graph canvas.
 */

import type { DomainPack } from '../../spine/domainPack';
import { registerPack } from '../../spine/registry';

export const uiPack: DomainPack = {
  id: 'ui',
  mode: 'layout',
  catalog: [], // TODO: layout containers (stack/row/grid) + leaf elements (button/input/text)
  compile: (bp) => `// React bundle for "${bp.meta.name}" — see COMPONENT_EXPORT\n`,
  lint: () => [],
  run: async (_artifact, ctx) => {
    ctx.onProgress?.({ status: 'log', message: 'UI preview runs via WebContainers (future).' });
    return { ok: false };
  },
};

registerPack(uiPack);
