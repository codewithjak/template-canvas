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

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './GraphCanvasBase.css';

import type { CatalogEntry, DomainPack, NodeCatalog } from './spine/domainPack';
import type { Blueprint } from '../types/blueprint';
import { type RFNode, type RFEdge, toRFNodes, toRFEdges, toBlueprint } from './graphConversions';
import { ApprovalGate } from '../run/ApprovalGate';
import { startRun, type RunHandle } from '../run/runController';

interface GraphCanvasBaseProps {
  pack: DomainPack;
  initial?: Blueprint;
}

export function GraphCanvasBase({ pack, initial }: GraphCanvasBaseProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(toRFNodes(initial, pack.catalog));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(toRFEdges(initial));

  const [compiled, setCompiled] = useState<string | null>(null);
  const [run, setRun] = useState<RunHandle | null>(null);
  const [intent, setIntent] = useState('');
  const [thinking, setThinking] = useState(false);

  const groups = useMemo(() => groupByGroup(pack.catalog), [pack.catalog]);
  const selected = nodes.find((n) => n.selected) ?? null;

  // Live lint — pure, recomputed from the graph.
  const diagnostics = useMemo(
    () => pack.lint(toBlueprint(pack.id, nodes, edges, 'blueprint')),
    [pack, nodes, edges],
  );

  // Worst severity per node, for outlining the offending nodes.
  const worstByNode = useMemo(() => {
    const m = new Map<string, 'block' | 'warn'>();
    for (const d of diagnostics) {
      if (!d.nodeId) continue;
      if (d.severity === 'block' || !m.has(d.nodeId)) m.set(d.nodeId, d.severity);
    }
    return m;
  }, [diagnostics]);

  const displayNodes = useMemo(
    () => nodes.map((n) => {
      const sev = worstByNode.get(n.id);
      return sev ? { ...n, className: `gcb-diag-${sev}` } : n;
    }),
    [nodes, worstByNode],
  );

  function selectNode(id: string) {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
  }

  function compile() {
    const blocking = diagnostics.filter((d) => d.severity === 'block');
    if (blocking.length) {
      setCompiled('# Cannot compile — resolve blocking issues first:\n'
        + blocking.map((d) => `#  • ${d.message}`).join('\n'));
      return;
    }
    setCompiled(pack.compile(toBlueprint(pack.id, nodes, edges, 'blueprint')));
  }

  async function planRun() {
    const blocking = diagnostics.filter((d) => d.severity === 'block');
    if (blocking.length) {
      setCompiled('# Cannot plan — resolve blocking issues first:\n'
        + blocking.map((d) => `#  • ${d.message}`).join('\n'));
      return;
    }
    setThinking(true);
    try {
      const hcl = pack.compile(toBlueprint(pack.id, nodes, edges, 'blueprint'));
      setRun(await startRun(hcl));
    } finally {
      setThinking(false);
    }
  }

  async function describe() {
    if (!pack.suggest || !intent.trim()) return;
    setThinking(true);
    try {
      const bp = await pack.suggest(intent.trim());
      if (bp) {
        setNodes(toRFNodes(bp, pack.catalog));
        setEdges(toRFEdges(bp));
      }
    } finally {
      setThinking(false);
    }
  }

  // Enforce the source node's connection rules; tag the edge with its domain type.
  const onConnect = useCallback(
    (c: Connection) => {
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return;
      const entry = pack.catalog.find((e) => e.type === src.data.nodeType);
      const rule = entry?.edges?.find((r) => r.to.includes(tgt.data.nodeType));
      if (entry?.edges && !rule) return; // connection not permitted by the source's rules
      setEdges((eds) => {
        if (eds.some((e) => e.source === c.source && e.target === c.target)) return eds;
        return eds.concat({
          id: `e-${c.source}-${c.target}-${Date.now()}`,
          source: c.source,
          target: c.target,
          sourceHandle: c.sourceHandle,
          targetHandle: c.targetHandle,
          label: rule?.type,
        });
      });
    },
    [nodes, pack, setEdges],
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
        {pack.suggest && (
          <div className="gcb-describe">
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void describe(); }}
              placeholder="Describe your app…"
            />
            <button disabled={thinking || !intent.trim()} onClick={() => void describe()}>
              {thinking ? '…' : '✨'}
            </button>
          </div>
        )}
        {groups.map(([group, entries]) => (
          <section key={group}>
            <h4>{group}</h4>
            {entries.map((e) => (
              <button key={e.type} className="gcb-add" onClick={() => addNode(e)}>+ {e.label}</button>
            ))}
          </section>
        ))}
        <button className="gcb-compile" onClick={compile}>Compile ▸ Terraform</button>
        <button className="gcb-compile" disabled={thinking} onClick={() => void planRun()}>Plan ▸ review</button>
      </aside>

      {/* CANVAS — React Flow node/edge surface */}
      <main className="gcb-canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
        {compiled !== null && (
          <div className="gcb-output">
            <button className="gcb-output-close" onClick={() => setCompiled(null)}>×</button>
            <pre>{compiled}</pre>
          </div>
        )}
        {run && <ApprovalGate plan={run.plan} onApply={run.apply} onClose={() => setRun(null)} />}
        {diagnostics.length > 0 && (
          <div className="gcb-diagnostics">
            {diagnostics.map((d, i) => (
              <button
                key={`${d.code}-${d.nodeId ?? i}`}
                className={`gcb-diag ${d.severity}`}
                onClick={() => d.nodeId && selectNode(d.nodeId)}
              >
                <span className="gcb-diag-dot" />
                {d.message}
              </button>
            ))}
          </div>
        )}
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
