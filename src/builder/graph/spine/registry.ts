/**
 * registry.ts — src/builder/graph/spine/registry.ts
 *
 * A tiny registry so the app can resolve a pack by id. Packs self-register on
 * import; the workspace/editor looks one up by the project's `kind`.
 */

import type { DomainPack } from './domainPack';

const packs = new Map<string, DomainPack>();

export function registerPack(pack: DomainPack): void {
  packs.set(pack.id, pack);
}

export function getPack(id: string): DomainPack | undefined {
  return packs.get(id);
}

export function allPacks(): DomainPack[] {
  return [...packs.values()];
}
