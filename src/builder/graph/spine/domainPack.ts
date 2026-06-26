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

/** A permitted outgoing connection from a node type — compiles to a ref/rule/flow. */
export interface EdgeRule {
  type: string;  // domain edge type, e.g. "connects_to" | "attached_to"
  to: string[];  // target node types this edge may point at
}

/** One drawable node type — a maker + its property fields. Mirrors elementFactories.ts. */
export interface CatalogEntry {
  type: string;
  label: string;
  group: string;              // palette grouping, e.g. "Compute"
  create: () => GraphNode;    // a fresh node with defaults + a unique id
  fields?: FieldDescriptor[]; // properties-panel schema
  parents?: string[];         // node types this may be nested inside (omitted = top-level)
  edges?: EdgeRule[];         // permitted outgoing connections (omitted = any)
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
}
