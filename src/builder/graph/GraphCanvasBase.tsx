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
import { HelpOverlay } from './HelpOverlay';
import { ApprovalGate } from '../run/ApprovalGate';
import { OutcomeOverlay } from '../run/OutcomeOverlay';
import { startRun, type RunHandle } from '../run/runController';
import { downloadTerraform } from '../run/exportTerraform';
import { blueprintSignature, appliedNodeIds } from '../run/outcome';
import type { Plan } from '../run/planTypes';
import type { AppliedResult } from '../run/simulateApply';

interface GraphCanvasBaseProps {
  pack: DomainPack;
  initial?: Blueprint;
  connectionId?: string; // run target (cloud pack): which account Plan/Apply use
}

export function GraphCanvasBase({ pack, initial, connectionId }: GraphCanvasBaseProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(toRFNodes(initial, pack.catalog));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(toRFEdges(initial));

  const [compiled, setCompiled] = useState<string | null>(null);
  const [run, setRun] = useState<RunHandle | null>(null);
  const [intent, setIntent] = useState('');
  const [thinking, setThinking] = useState(false);
  const [diagOpen, setDiagOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appliedSig, setAppliedSig] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ count: number; nodeIds: Set<string>; outputs: Record<string, string> } | null>(null);

  const groups = useMemo(() => groupByGroup(pack.catalog), [pack.catalog]);
  const selected = nodes.find((n) => n.selected) ?? null;
  const selectedParentId = selected?.data.parentId;

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
      const classes: string[] = [];
      const sev = worstByNode.get(n.id);
      if (sev) classes.push(`gcb-diag-${sev}`);
      else if (outcome?.nodeIds.has(n.id)) classes.push('gcb-applied');
      if (n.id === selectedParentId) classes.push('gcb-container'); // this node contains the selection
      return {
        ...n,
        className: classes.length ? classes.join(' ') : undefined,
        data: { ...n.data, label: displayLabel(n) },
      };
    }),
    [nodes, worstByNode, outcome, selectedParentId],
  );

  function selectNode(id: string) {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
  }

  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }

  function setParent(childId: string, parentId: string | undefined) {
    setNodes((nds) => nds.map((n) => (n.id === childId ? { ...n, data: { ...n.data, parentId } } : n)));
  }

  // Valid container nodes for the selection (types allowed by the catalog).
  const selectedEntry = selected ? pack.catalog.find((e) => e.type === selected.data.nodeType) : undefined;
  const parentChoices = selectedEntry?.parents?.length
    ? nodes
      .filter((n) => selectedEntry.parents!.includes(n.data.nodeType) && n.id !== selected!.id)
      .map((n) => ({ id: n.id, label: displayLabel(n) }))
    : undefined;

  function compile() {
    const blocking = diagnostics.filter((d) => d.severity === 'block');
    if (blocking.length) {
      setCompiled('# Cannot compile — resolve blocking issues first:\n'
        + blocking.map((d) => `#  • ${d.message}`).join('\n'));
      return;
    }
    setCompiled(pack.compile(toBlueprint(pack.id, nodes, edges, 'blueprint')));
  }

  // S4 (export-only): download runnable Terraform, fully client-side, no backend.
  function exportTf() {
    downloadTerraform(pack.compile(toBlueprint(pack.id, nodes, edges, 'blueprint')));
  }

  async function planRun() {
    const blocking = diagnostics.filter((d) => d.severity === 'block');
    if (blocking.length) {
      setCompiled('# Cannot plan — resolve blocking issues first:\n'
        + blocking.map((d) => `#  • ${d.message}`).join('\n'));
      return;
    }
    const bp = toBlueprint(pack.id, nodes, edges, 'blueprint');
    const sig = blueprintSignature(bp);

    // Idempotency: unchanged since the last apply ⇒ no changes (real path gets
    // this from terraform state; this is the local equivalent).
    if (sig === appliedSig) {
      const empty: Plan = { summary: { add: 0, change: 0, destroy: 0 }, resources: [], simulated: true };
      setRun({ plan: empty, apply: async (): Promise<AppliedResult> => ({ created: [], outputs: {}, simulated: true }) });
      return;
    }

    setThinking(true);
    try {
      const handle = await startRun(pack.compile(bp), connectionId);
      setRun({
        plan: handle.plan,
        apply: async () => {
          const result = await handle.apply();
          setAppliedSig(sig);
          setOutcome({ count: result.created.length, nodeIds: appliedNodeIds(bp, result.created), outputs: result.outputs });
          return result;
        },
      });
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
    setNodes((nds) => {
      const id = nextNodeId(nds, node.type);                 // specific id: vpc-1, subnet-1, …
      const props = withUniqueName(nds, node.type, node.props); // unique name: main, main-2, …
      return [
        ...nds.map((n) => ({ ...n, selected: false })),
        {
          id,
          position: node.position ?? { x: 120 + nds.length * 28, y: 80 + nds.length * 28 },
          data: { label: entry.label, nodeType: node.type, props },
          selected: true,
        } satisfies RFNode,
      ];
    });
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
        <button className="gcb-compile" onClick={exportTf}>Export ▸ .tf</button>
        <button className="gcb-help-btn" onClick={() => setHelpOpen(true)}>? How to use</button>
      </aside>

      {/* CANVAS — React Flow node/edge surface */}
      <main className="gcb-canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode={['Delete', 'Backspace']}
          onNodesDelete={(deleted) => {
            const ids = new Set(deleted.map((n) => n.id));
            setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
          }}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
        {compiled !== null && (
          <div className="gcb-output">
            {!compiled.startsWith('# Cannot') && (
              <button className="gcb-output-dl" onClick={() => downloadTerraform(compiled)}>Download .tf</button>
            )}
            <button className="gcb-output-close" onClick={() => setCompiled(null)}>×</button>
            <pre>{compiled}</pre>
          </div>
        )}
        {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
        {run && <ApprovalGate plan={run.plan} onApply={run.apply} onClose={() => setRun(null)} />}
        {outcome && !run && (
          <OutcomeOverlay count={outcome.count} outputs={outcome.outputs} onClose={() => setOutcome(null)} />
        )}
        {diagnostics.length > 0 && diagOpen && (
          <div className="gcb-diagnostics">
            <div className="gcb-diag-head">
              <strong>{diagnostics.length} issue{diagnostics.length > 1 ? 's' : ''}</strong>
              <button className="gcb-diag-x" onClick={() => setDiagOpen(false)}>×</button>
            </div>
            <div className="gcb-diag-list">
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
          </div>
        )}
        {diagnostics.length > 0 && !diagOpen && (
          <button className="gcb-diag-pill" onClick={() => setDiagOpen(true)}>
            ⚠ {diagnostics.length}
          </button>
        )}
      </main>

      {/* PROPERTIES — data-driven from the selected node's catalog fields */}
      <aside className="gcb-props">
        {selected
          ? (
            <NodeProperties
              pack={pack}
              node={selected}
              onChange={updateProp}
              onDelete={() => deleteNode(selected.id)}
              parents={parentChoices}
              onSetParent={(pid) => setParent(selected.id, pid)}
            />
          )
          : <p className="gcb-empty">Select a node.</p>}
      </aside>
    </div>
  );
}

/** One small properties panel, built from the catalog entry's field schema. */
function NodeProperties({ pack, node, onChange, onDelete, parents, onSetParent }: {
  pack: DomainPack;
  node: RFNode;
  onChange: (key: string, value: unknown) => void;
  onDelete: () => void;
  parents?: { id: string; label: string }[];
  onSetParent?: (parentId: string | undefined) => void;
}) {
  const entry = pack.catalog.find((e) => e.type === node.data.nodeType);
  const fields = entry?.fields ?? [];
  const parentTypes = entry?.parents?.map((t) => pack.catalog.find((e) => e.type === t)?.label ?? t).join(' or ');
  return (
    <div>
      <h4>{entry?.label ?? node.data.nodeType}</h4>
      <div className="gcb-node-id">id: {node.id}</div>
      {parents && (
        <label className="gcb-field">
          <span>Container ({parentTypes})</span>
          <select
            value={node.data.parentId ?? ''}
            onChange={(e) => onSetParent?.(e.target.value || undefined)}
          >
            <option value="">— none —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}
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
      <button className="gcb-delete" onClick={onDelete}>Delete node</button>
    </div>
  );
}

/** Short type token used in node ids, e.g. aws_instance -> instance. */
function typeToken(type: string): string {
  return type.replace(/^aws_/, '');
}

/** Next sequential, unique id for a type: vpc-1, vpc-2, subnet-1, … */
function nextNodeId(nodes: RFNode[], type: string): string {
  const token = typeToken(type);
  const re = new RegExp(`^${token}-(\\d+)$`);
  let max = 0;
  for (const n of nodes) {
    const m = n.id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${token}-${max + 1}`;
}

/** Auto-number a colliding default name (free-form `name` field only). */
function withUniqueName(nodes: RFNode[], type: string, props: Record<string, unknown>): Record<string, unknown> {
  const base = props.name;
  if (typeof base !== 'string' || base === '') return props;
  const taken = new Set(nodes.filter((n) => n.data.nodeType === type).map((n) => String(n.data.props.name ?? '')));
  if (!taken.has(base)) return props;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return { ...props, name: `${base}-${i}` };
}

/** The most identifying prop value for display (name, else cidr, else comment). */
function nodeIdentity(n: RFNode): string | undefined {
  const p = n.data.props;
  const v = p.name ?? p.cidr ?? p.comment;
  return v != null && v !== '' ? String(v) : undefined;
}

/** Canvas + dropdown label: the specific id plus its identity, e.g. "vpc-1 · main". */
function displayLabel(n: RFNode): string {
  const id = nodeIdentity(n);
  return id ? `${n.id} · ${id}` : n.id;
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
