/**
 * ConnectAccount.tsx — connect an AWS account to the cloud builder (P5).
 *
 * Flow: Connect → run the CloudFormation stack with the shown ExternalId +
 * platform account → paste back the Connect-Role ARN → Verify (assume-role).
 * We never receive the customer's keys.
 */

import { useEffect, useState } from 'react';
import { API_BASE } from '../../services/config';
import * as api from './cloudConnectApi';
import type { Bootstrap, CloudConnection } from './cloudConnectApi';
import './ConnectAccount.css';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function ConnectAccount() {
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [roleArn, setRoleArn] = useState('');
  const [stateBucket, setStateBucket] = useState('');
  const [lockTable, setLockTable] = useState('');
  const [runnerProject, setRunnerProject] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tmplFormat, setTmplFormat] = useState<'yaml' | 'json'>('yaml');

  async function refresh() {
    try { setConnections(await api.listConnections()); } catch (e) { setError(errMsg(e)); }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setError(null); setBusy(true);
    try { await fn(); await refresh(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  async function begin() {
    await run(async () => {
      const { connection, bootstrap } = await api.beginConnection(region);
      setBootstrap(bootstrap); setActiveId(connection.id); setRoleArn('');
    });
  }

  const ext = tmplFormat === 'json' ? 'json' : 'yaml';
  const cliCommand = bootstrap
    ? [
      `curl -s "${API_BASE}/v1/cloud/bootstrap/template?format=${ext}" -o mapdoc-connect.${ext} && \\`,
      'aws cloudformation deploy \\',
      `  --template-file mapdoc-connect.${ext} \\`,
      '  --stack-name mapdoc-connect \\',
      `  --parameter-overrides PlatformAccountId=${bootstrap.platformAccountId ?? '<account-id>'} ExternalId=${bootstrap.externalId} \\`,
      '  --capabilities CAPABILITY_IAM \\',
      `  --region ${bootstrap.region}`,
    ].join('\n')
    : '';

  return (
    <div className="cna-root">
      <h2>Connect an AWS account</h2>
      <p className="cna-sub">
        Mapdoc runs Terraform <strong>inside your account</strong> via a role you create —
        it never receives your keys.
      </p>

      {error && <div className="cna-error">{error}</div>}

      <section className="cna-card">
        <h3>1 · Start a connection</h3>
        <div className="cna-row">
          <label>Region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {['us-east-1', 'us-east-2', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-south-1'].map((r) =>
                <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button className="cna-btn primary" disabled={busy} onClick={begin}>Connect AWS</button>
        </div>
      </section>

      {bootstrap && (
        <section className="cna-card">
          <h3>2 · Launch the CloudFormation stack</h3>
          <p>Deploy <code>infra/connect-account/stack.yaml</code> in your account with these parameters:</p>
          <dl className="cna-params">
            <dt>PlatformAccountId</dt><dd><code>{bootstrap.platformAccountId ?? '(set PLATFORM_AWS_ACCOUNT_ID on the server)'}</code></dd>
            <dt>ExternalId</dt><dd><code>{bootstrap.externalId}</code></dd>
            <dt>Region</dt><dd><code>{bootstrap.region}</code></dd>
          </dl>

          {bootstrap.launchStackUrl && (
            <a className="cna-launch" href={bootstrap.launchStackUrl} target="_blank" rel="noreferrer">
              🚀 Launch Stack in AWS Console
            </a>
          )}

          <div className="cna-template">
            <p className="cna-cli-label">{bootstrap.launchStackUrl ? 'Or deploy from the CLI:' : 'Deploy from the CLI:'}</p>
            <div className="cna-toggle">
              <span>Template</span>
              <button className={tmplFormat === 'yaml' ? 'on' : ''} onClick={() => setTmplFormat('yaml')}>YAML</button>
              <button className={tmplFormat === 'json' ? 'on' : ''} onClick={() => setTmplFormat('json')}>JSON</button>
              <a className="cna-btn sm" href={`${API_BASE}/v1/cloud/bootstrap/template?format=${tmplFormat}`} download>
                Download .{tmplFormat}
              </a>
            </div>
            <pre className="cna-cli">{cliCommand}</pre>
            <button className="cna-btn sm" onClick={() => navigator.clipboard?.writeText(cliCommand)}>Copy command</button>
          </div>

          <h3>3 · Paste the stack outputs</h3>
          <div className="cna-stack">
            <input className="cna-input" placeholder="ConnectRoleArn  (arn:aws:iam::…:role/…)" value={roleArn} onChange={(e) => setRoleArn(e.target.value)} />
            <input className="cna-input" placeholder="StateBucket" value={stateBucket} onChange={(e) => setStateBucket(e.target.value)} />
            <input className="cna-input" placeholder="LockTable" value={lockTable} onChange={(e) => setLockTable(e.target.value)} />
            <input className="cna-input" placeholder="RunnerProject" value={runnerProject} onChange={(e) => setRunnerProject(e.target.value)} />
            <button
              className="cna-btn"
              disabled={busy || !activeId || !roleArn.trim()}
              onClick={() => activeId && run(() => api.saveConnection(activeId, {
                roleArn: roleArn.trim(),
                stateBucket: stateBucket.trim() || undefined,
                lockTable: lockTable.trim() || undefined,
                runnerProject: runnerProject.trim() || undefined,
              }))}
            >
              Save
            </button>
          </div>
        </section>
      )}

      <section className="cna-card">
        <h3>Connected accounts</h3>
        {connections.length === 0 && <p className="cna-empty">No connections yet.</p>}
        <ul className="cna-list">
          {connections.map((c) => (
            <li key={c.id}>
              <span className={`cna-status ${c.status}`}>{c.status}</span>
              <span className="cna-acct">{c.account_id ?? c.role_arn ?? '—'}</span>
              <span className="cna-region">{c.region}</span>
              <span className="cna-actions">
                {c.status !== 'verified' && (
                  <button className="cna-btn sm" disabled={busy} onClick={() => run(() => api.verifyConnection(c.id))}>Verify</button>
                )}
                <button className="cna-btn sm danger" disabled={busy} onClick={() => run(() => api.deleteConnection(c.id))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
