/**
 * DeploymentsPanel.tsx — the visible per-account registry (Phase 3).
 *
 * For the selected connection, lists the live infras deployed in that account,
 * with rename (inline), destroy (inline-confirm, no blocking dialog), and open
 * (load a deployment's template back into the canvas). This is what stops a
 * multi-infra account from being an untracked black box.
 */

import { useCallback, useEffect, useState } from 'react';
import { listDeployments, renameDeployment, destroyDeployment, type Deployment } from './deploymentsApi';

export function DeploymentsPanel({ connectionId, currentTemplateId, onOpen }: {
  connectionId?: string;
  currentTemplateId?: string;
  onOpen: (templateId: string) => void;
}) {
  const [items, setItems] = useState<Deployment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!connectionId) { setItems([]); return; }
    listDeployments(connectionId).then((r) => setItems(r.deployments)).catch(() => setItems([]));
  }, [connectionId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!connectionId) return null;

  async function saveName(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    setBusy(true);
    try { await renameDeployment(id, name); refresh(); } finally { setBusy(false); }
  }

  async function doDestroy(id: string) {
    setConfirmId(null);
    setBusy(true);
    try { await destroyDeployment(id); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="dep-panel">
      <div className="dep-head">
        <span>Deployments in this account</span>
        <button className="dep-refresh" onClick={refresh} title="Refresh">↻</button>
      </div>
      {items.length === 0 && <div className="dep-empty">Nothing deployed here yet.</div>}
      {items.map((d) => (
        <div key={d.id} className={`dep-row${d.status === 'destroyed' ? ' destroyed' : ''}`}>
          {editingId === d.id ? (
            <input
              autoFocus
              className="dep-name-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => void saveName(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName(d.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
          ) : (
            <span className="dep-name">{d.name}</span>
          )}
          <span className={`dep-status ${d.status}`}>{d.status}</span>
          <span className="dep-actions">
            {d.template_id && d.status !== 'destroyed' && (
              <button disabled={d.template_id === currentTemplateId} onClick={() => onOpen(d.template_id as string)}>Open</button>
            )}
            {d.status !== 'destroyed' && (
              <button onClick={() => { setEditingId(d.id); setEditName(d.name); }}>Rename</button>
            )}
            {d.status !== 'destroyed' && (confirmId === d.id ? (
              <>
                <button className="dep-danger" disabled={busy} onClick={() => void doDestroy(d.id)}>Confirm</button>
                <button onClick={() => setConfirmId(null)}>Cancel</button>
              </>
            ) : (
              <button className="dep-danger" onClick={() => setConfirmId(d.id)}>Destroy</button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
