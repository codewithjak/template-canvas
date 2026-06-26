/**
 * GraphCanvasBase.tsx — src/builder/graph/GraphCanvasBase.tsx
 *
 * THE PARENT graph canvas. All shared graph behavior lives here, ONCE; each
 * builder (cloud / agent / ui) is a thin file that renders this with its pack:
 *
 *     export const CloudCanvas = () => <GraphCanvasBase pack={cloudPack} />;
 *
 * Skeleton scope (platform P0): a palette derived from the catalog, a node
 * list, and a data-driven properties panel. The node-edge surface is wired with
 * React Flow in P1 — the placeholder <main> below is where it mounts. No
 * pack-specific code appears in this file (it only knows the DomainPack
 * contract), which is what keeps it reusable across every builder.
 *
 * See BUILDER_PLATFORM_ARCHITECTURE.md §3, VISUAL_CLOUD_BUILDER_ARCHITECTURE.md §3.2.
 */

import { useMemo, useState } from 'react';
import type { DomainPack, NodeCatalog } from './spine/domainPack';
import type { Blueprint, GraphNode } from '../types/blueprint';
import { emptyBlueprint, nodeById } from '../types/blueprint';

interface GraphCanvasBaseProps {
  pack: DomainPack;
  initial?: Blueprint;
}

export function GraphCanvasBase({ pack, initial }: GraphCanvasBaseProps) {
  const [bp, setBp] = useState<Blueprint>(initial ?? emptyBlueprint(pack.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? nodeById(bp, selectedId) : undefined;
  const groups = useMemo(() => groupByGroup(pack.catalog), [pack.catalog]);

  function addNode(create: () => GraphNode) {
    const node = create();
    setBp((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedId(node.id);
  }

  function updateProp(key: string, value: unknown) {
    if (!selected) return;
    setBp((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selected.id ? { ...n, props: { ...n.props, [key]: value } } : n,
      ),
    }));
  }

  return (
    <div className="gcb-root" data-mode={pack.mode}>
      {/* PALETTE — derived from pack.catalog */}
      <aside className="gcb-palette">
        {groups.map(([group, entries]) => (
          <section key={group}>
            <h4>{group}</h4>
            {entries.map((e) => (
              <button key={e.type} onClick={() => addNode(e.create)}>{e.label}</button>
            ))}
          </section>
        ))}
      </aside>

      {/* CANVAS — React Flow mounts here in P1; placeholder lists nodes for now */}
      <main className="gcb-canvas">
        {bp.nodes.length === 0 && <p className="gcb-empty">Add a node from the palette.</p>}
        {bp.nodes.map((n) => (
          <button
            key={n.id}
            className="gcb-node"
            data-selected={n.id === selectedId ? 'true' : undefined}
            onClick={() => setSelectedId(n.id)}
          >
            {n.type}
          </button>
        ))}
      </main>

      {/* PROPERTIES — data-driven from the selected node's catalog fields */}
      <aside className="gcb-props">
        {selected
          ? <NodeProperties pack={pack} node={selected} onChange={updateProp} />
          : <p className="gcb-empty">Select a node.</p>}
      </aside>
    </div>
  );
}

/** One small properties panel, built from the catalog entry's field schema. */
function NodeProperties({ pack, node, onChange }: {
  pack: DomainPack;
  node: GraphNode;
  onChange: (key: string, value: unknown) => void;
}) {
  const entry = pack.catalog.find((e) => e.type === node.type);
  const fields = entry?.fields ?? [];
  return (
    <div>
      <h4>{entry?.label ?? node.type}</h4>
      {fields.map((f) => (
        <label key={f.key} className="gcb-field">
          <span>{f.label}</span>
          {f.kind === 'select' ? (
            <select
              value={String(node.props[f.key] ?? '')}
              onChange={(ev) => onChange(f.key, ev.target.value)}
            >
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.kind === 'number' ? 'number' : 'text'}
              value={String(node.props[f.key] ?? '')}
              onChange={(ev) => onChange(f.key, ev.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** Group catalog entries by their `group` for the palette. */
function groupByGroup(catalog: NodeCatalog): [string, NodeCatalog][] {
  const map = new Map<string, NodeCatalog>();
  for (const e of catalog) {
    const list = map.get(e.group) ?? [];
    list.push(e);
    map.set(e.group, list);
  }
  return [...map.entries()];
}
