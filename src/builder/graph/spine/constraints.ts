/**
 * constraints.ts — the service-constraint engine.
 *
 * Pure helpers that read the provider rules declared on each catalog entry
 * (container / connections). One source of truth, consumed by every enforcement
 * point: connect (canvas edges), container (the dropdown), and lint.
 *
 * See CLOUD_CONSTRAINTS_ARCHITECTURE.md.
 */

import type { ConnectionRule, DomainPack } from './domainPack';

/** The connection rule (if any) the provider allows from one type to another. */
export function connectionRule(pack: DomainPack, fromType: string, toType: string): ConnectionRule | undefined {
  return pack.catalog
    .find((e) => e.type === fromType)
    ?.connections?.find((r) => r.to.includes(toType));
}

/** Parent types a service may be contained in (empty = top-level). */
export function containerTypes(pack: DomainPack, type: string): string[] {
  return pack.catalog.find((e) => e.type === type)?.container?.types ?? [];
}

/** Whether a service must have a container. */
export function containerRequired(pack: DomainPack, type: string): boolean {
  return Boolean(pack.catalog.find((e) => e.type === type)?.container?.required);
}
