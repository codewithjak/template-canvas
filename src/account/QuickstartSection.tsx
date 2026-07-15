/**
 * src/account/QuickstartSection.tsx
 *
 * Integrations quickstart: the three steps to a first API call — issue a key,
 * push JSON, receive a webhook — around the `curl` snippet moved verbatim from
 * the old Push data card. Per-tool setup is NOT re-authored here; it names the
 * no-code tools that connect through the same webhook (architecture doc §2.5).
 */
import { API_BASE } from '../services/config'
import { SectionCard } from './SectionCard'
import { ICONS } from './sectionIcons'
import type { ApiKeyMeta } from '../services/apiIntegration'
import './account.css'

export default function QuickstartSection({ meta, freshKey }: { meta: ApiKeyMeta | null; freshKey: string | null }) {
  const sampleKey = freshKey || (meta ? `${meta.key_prefix}…` : 'tc_live_…')
  const curl =
    `curl -X POST ${API_BASE}/v1/ingest \\\n` +
    `  -H "X-API-Key: ${sampleKey}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"templateId":"<your-template-id>","data":{ ... }}'`

  return (
    <SectionCard title="Quickstart" subtitle="Get to your first API call in three steps." icon={ICONS.push}>
      <ol className="quickstart">
        <li>
          <strong>Issue an API key</strong> above, then keep it somewhere safe —
          it is shown only once.
        </li>
        <li>
          <strong>Push JSON to a template.</strong> Find <code className="mono" style={{ fontSize: 12 }}>templateId</code> in
          the template you want to fill, then send your data:
          <pre className="codeblock">{curl}</pre>
        </li>
        <li>
          <strong>Receive a webhook</strong> when the document is generated. Add an
          endpoint in the Webhooks section above to be notified on
          <code className="mono" style={{ fontSize: 12 }}> document.generated</code>.
        </li>
      </ol>
      <div className="smeta" style={{ marginTop: 12 }}>
        No-code tools — <strong>Zapier</strong>, <strong>n8n</strong> and{' '}
        <strong>Make</strong> — connect through the same webhook: add their catch
        URL in the Webhooks section above.
      </div>
    </SectionCard>
  )
}
