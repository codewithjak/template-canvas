/**
 * src/pages/Settings.tsx
 * Account settings: Plan · Usage — and the home for future account config
 * (billing details, defaults, notification preferences).
 *
 * Integrations (API key, webhooks, quickstart) and Team (members, invites, seats)
 * used to stack here as hash-anchored cards; each now owns its own route —
 * `/integrations` and `/team` (see docs/ACCOUNT_ROUTES_ARCHITECTURE.md). This page
 * is deliberately thin as a result.
 */
import PlanSection from '../account/PlanSection'
import UsageSection from '../account/UsageSection'
import '../account/account.css'

export default function Settings() {
  return (
    <div className="settings">
      <main className="settings__main">
        <PlanSection />
        <UsageSection />
      </main>
    </div>
  )
}
