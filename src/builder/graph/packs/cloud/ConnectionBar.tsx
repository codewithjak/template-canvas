/**
 * ConnectionBar.tsx — "Run target" selector for the cloud builder.
 *
 * Lists the team's VERIFIED AWS connections; the chosen one is passed to the
 * canvas as connectionId so Plan/Apply run for real in that account. "Simulated"
 * (no id) keeps the local dry-run. Requires being signed in; if the fetch fails
 * (signed out / no connections), it just offers a link to connect one.
 */

import { useEffect, useState } from 'react';
import { listConnections, type CloudConnection } from '../../../connect/cloudConnectApi';

export function ConnectionBar({ value, onChange }: {
  value?: string;
  onChange: (id: string | undefined) => void;
}) {
  const [connections, setConnections] = useState<CloudConnection[]>([]);

  useEffect(() => {
    let alive = true;
    listConnections().then((c) => { if (alive) setConnections(c); }).catch(() => { if (alive) setConnections([]); });
    return () => { alive = false; };
  }, []);

  const verified = connections.filter((c) => c.status === 'verified');

  return (
    <div className="cb-bar">
      <span>Run target</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Simulated (no real apply)</option>
        {verified.map((c) => (
          <option key={c.id} value={c.id}>
            {(c.account_id ?? 'AWS')} · {c.region} (via Mapdoc)
          </option>
        ))}
      </select>
      {value ? <span className="cb-live">● live</span> : <span className="cb-sim">simulated</span>}
      <a className="cb-link" href="/builder/connect">Connect an account →</a>
    </div>
  );
}
