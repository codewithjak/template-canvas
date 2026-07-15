/**
 * src/account/SectionCard.tsx
 *
 * The card shell shared by every account section (Plan, Usage, Team, API access,
 * Webhooks, Quickstart) plus the header icon set. Lifted verbatim from the old
 * one-page Settings so the sections that now live on their own routes keep an
 * identical look. Styling rides account.css / the app design tokens.
 */
import type { ReactNode } from 'react'
import './account.css'

export function SectionCard({ id, title, subtitle, icon, children }: { id?: string; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="scard" id={id}>
      <div className="scard__head">
        <h2 className="scard__title">{icon && <span className="scard__icon">{icon}</span>}{title}</h2>
        {subtitle && <p className="scard__sub">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
