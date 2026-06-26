/**
 * GraphCanvasBase.tsx — src/builder/graph/GraphCanvasBase.tsx
 *
 * THE PARENT graph canvas, now wired with React Flow (platform P1). All shared
 * graph behavior lives here, ONCE; each builder (cloud / agent / ui) is a thin
 * file that renders this with its pack:
 *
 *     export const CloudCanvas = () => <GraphCanvasBase pack={cloudPack} />;
 *
 * Responsibilities (all pack-agnostic — this file only knows the DomainPack
 * contract, which is what keeps it reusable):
 *   • palette       — derived from pack.catalog (one button per node type)
 *   • canvas        — React Flow nodes/edges; drag to move, drag handles to connect
 *   • properties    — data-driven from the selected node's catalog `fields`
 *   • toBlueprint() — converts the live canvas back to the pure Blueprint model
 *                     (consumed by pack.compile / lint / run in the run-loop)
 *
 * Node containment (parent nesting) and typed edges are carried through the
 * conversion helpers; the drag-to-nest interaction lands in a follow-up.
 *
 * See BUILDER_PLATFORM_ARCHITECTURE.md §3–4, VISUAL_CLOUD_BUILDER_ARCHITECTURE.md §3.2.
 */

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './GraphCanvasBase.css';

import type { CatalogEntry, DomainPack, NodeCatalog } from './spine/domainPack';
import type { Blueprint } from '../types/blueprint';
import { type RFNode, type RFEdge, toRFNodes, toRFEdges } from './graphConversions';

interface GraphCanvasBaseProps {
  pack: DomainPack;
  initial?: Blueprint;
}

export function GraphCanvasBase({ pack, initial }: GraphCanvasBaseProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(toRFNodes(initial, pack.catalog));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(toRFEdges(initial));

  const groups = useMemo(() => groupByGroup(pack.catalog), [pack.catalog]);
  const selected = nodes.find((n) => n.selected) ?? null;

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  function addNode(entry: CatalogEntry) {
    const node = entry.create();
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: node.id,
        position: node.position ?? { x: 120 + nds.length * 28, y: 80 + nds.length * 28 },
        data: { label: entry.label, nodeType: node.type, props: node.props },
        selected: true,
      } satisfies RFNode,
    ]);
  }

  function updateProp(key: string, value: unknown) {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selected.id
          ? { ...n, data: { ...n.data, props: { ...n.data.props, [key]: value } } }
          : n,
      ),
    );
  }

  return (
    <div className="gcb-root" data-mode={pack.mode}>
      {/* PALETTE — derived from pack.catalog */}
      <aside className="gcb-palette">
        {groups.map(([group, entries]) => (
          <section key={group}>
            <h4>{group}</h4>
            {entries.map((e) => (
              <button key={e.type} className="gcb-add" onClick={() => addNode(e)}>+ {e.label}</button>
            ))}
          </section>
        ))}
      </aside>

      {/* CANVAS — React Flow node/edge surface */}
      <main className="gcb-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
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
  node: RFNode;
  onChange: (key: string, value: unknown) => void;
}) {
  const entry = pack.catalog.find((e) => e.type === node.data.nodeType);
  const fields = entry?.fields ?? [];
  return (
    <div>
      <h4>{entry?.label ?? node.data.nodeType}</h4>
      {fields.length === 0 && <p className="gcb-empty">No editable fields.</p>}
      {fields.map((f) => (
        <label key={f.key} className="gcb-field">
          <span>{f.label}</span>
          {f.kind === 'select' ? (
            <select
              value={String(node.data.props[f.key] ?? '')}
              onChange={(ev) => onChange(f.key, ev.target.value)}
            >
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.kind === 'number' ? 'number' : 'text'}
              value={String(node.data.props[f.key] ?? '')}
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
