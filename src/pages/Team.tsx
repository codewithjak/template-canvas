/**
 * src/pages/Team.tsx
 * The `/team` route: manage who shares this workspace — members, pending invites,
 * seats, and the team switcher. All of it lives in `TeamSection`; this page is the
 * thin composition (see docs/ACCOUNT_ROUTES_ARCHITECTURE.md).
 */
import TeamSection from '../account/TeamSection'
import '../account/account.css'

export default function Team() {
  return (
    <div className="settings">
      <main className="settings__main">
        <TeamSection />
      </main>
    </div>
  )
}
