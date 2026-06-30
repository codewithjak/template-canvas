/**
 * domainPack.ts — src/builder/graph/spine/domainPack.ts
 *
 * The plugin contract every builder implements. GraphCanvasBase and the
 * run-loop are written ONCE against this interface; cloud / agent / ui are
 * packs. Logic + data only — a pack's UI lives in its own *Canvas.tsx.
 *
 * See BUILDER_PLATFORM_ARCHITECTURE.md §3.
 */

import type { Blueprint, GraphNode } from '../../types/blueprint';

/** How the shared graph canvas behaves for a pack. */
export type CanvasMode = 'wire' | 'layout';

/** A single editable field shown in the properties panel (data-driven). */
export interface FieldDescriptor {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  options?: string[]; // for kind: 'select'
}

/** Where a service may be contained (the provider's containment rule). */
export interface ContainerRule {
  types: string[];   // allowed parent types, e.g. subnet -> ['aws_vpc']
  required: boolean; // must it have a parent? (subnet: yes; s3 bucket: no)
}

/** A permitted outgoing connection from a service — compiles to a ref/rule/flow. */
export interface ConnectionRule {
  type: string;       // domain edge type, e.g. "connects_to" | "attached_to"
  to: string[];       // valid target node types
  sameVpc?: boolean;  // both ends must share a VPC (e.g. security group <-> instance)
  max?: number;       // optional cardinality cap per source
}

/**
 * One drawable service — a maker, its property fields, and the provider's hard
 * rules (container + connections + invariants). See CLOUD_CONSTRAINTS_ARCHITECTURE.md.
 */
export interface CatalogEntry {
  type: string;
  label: string;
  group: string;                  // palette grouping, e.g. "Compute"
  create: () => GraphNode;        // a fresh node with defaults + a unique id
  fields?: FieldDescriptor[];     // properties-panel schema
  container?: ContainerRule;      // containment rule (omitted = top-level)
  connections?: ConnectionRule[]; // permitted outgoing connections (omitted = none)
  invariants?: string[];          // named cross-cutting validators
}

export type NodeCatalog = CatalogEntry[];

/** A lint finding over the graph. */
export interface Diagnostic {
  nodeId?: string;
  severity: 'block' | 'warn';
  code: string;
  message: string;
}

/** Progress event streamed back during a run (a node lights up, a log line, …). */
export interface RunEvent {
  nodeId?: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'log';
  message?: string;
}

/** Everything a run needs that the pack itself doesn't own. */
export interface RunContext {
  onProgress?: (e: RunEvent) => void;
}

export interface RunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  logs?: string[];
}

/**
 * The pack contract — pure logic + data:
 *   catalog  — what you can draw
 *   compile  — graph → artifact (deterministic; IaC text / workflow JSON)
 *   lint     — pure rules over the graph
 *   run      — execute the artifact (the runtime adapter)
 */
export interface DomainPack {
  id: string;
  mode: CanvasMode;
  catalog: NodeCatalog;
  compile: (bp: Blueprint) => string;
  lint: (bp: Blueprint) => Diagnostic[];
  run: (artifact: string, ctx: RunContext) => Promise<RunResult>;
  /** Optional: natural-language intent → a starter blueprint (the LLM architect). */
  suggest?: (intent: string) => Promise<Blueprint | null>;
  /** Optional: ready-made starter blueprints, loadable directly (no LLM). */
  templates?: Array<{ id: string; title: string; blueprint: Blueprint }>;
}
