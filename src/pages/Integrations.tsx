/**
 * src/pages/Integrations.tsx
 * The `/integrations` route: connect external systems to your templates —
 * API key, outbound webhooks, and a quickstart to a first API call.
 *
 * The API key is fetched ONCE here (`useApiKey`) and shared with both the API
 * access section and the quickstart snippet, so they never disagree
 * (docs/ACCOUNT_ROUTES_ARCHITECTURE.md §2.3). Webhooks and quickstart only appear
 * when the team has the `api` capability — the same gating as before the split.
 */
import { usePlan } from '../plan/PlanProvider'
import { useApiKey } from '../account/useApiKey'
import ApiKeySection from '../account/ApiKeySection'
import WebhooksSection from '../account/WebhooksSection'
import QuickstartSection from '../account/QuickstartSection'
import '../account/account.css'

export default function Integrations() {
  const { can } = usePlan()
  const api = useApiKey()

  return (
    <div className="settings">
      <main className="settings__main">
        <ApiKeySection api={api} />
        {can('api') && <WebhooksSection />}
        {can('api') && <QuickstartSection meta={api.meta} freshKey={api.freshKey} />}
      </main>
    </div>
  )
}
