import { Link } from 'react-router-dom'
import '../App.css'

const Icons = {
  Template: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="9" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="11" y="2" width="7" height="4" rx="1.5" fill="currentColor" opacity=".5"/>
      <rect x="11" y="8" width="7" height="3" rx="1.5" fill="currentColor" opacity=".5"/>
      <rect x="2" y="13" width="16" height="3" rx="1.5" fill="currentColor" opacity=".3"/>
    </svg>
  ),
  Reuse: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10a6 6 0 0 1 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M16 10a6 6 0 0 1-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M9 4.5 10.5 3 12 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 15.5 9.5 17 8 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Export: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v9m0 0-3-3m3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 13v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  Map: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="6" width="4" height="3" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="13" y="11" width="4" height="3" rx="1" fill="currentColor" opacity=".8"/>
      <path d="M7 7.5h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Bolt: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M11 2 5 11h5l-1 7 6-9h-5l1-7Z" fill="currentColor" opacity=".9"/>
    </svg>
  ),
  Eye: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="10" cy="10" r="2.5" fill="currentColor" opacity=".7"/>
    </svg>
  ),
  Team: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M2.5 16a4.5 4.5 0 0 1 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M13 5.2a2.5 2.5 0 0 1 0 4.6M14.5 16a4.5 4.5 0 0 0-2.2-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Arrow: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
}

const features = [
  {
    Icon: Icons.Template,
    title: 'Rich element library',
    body: 'Text, paragraphs, tables, images, lines, boxes, checkboxes, radios, date fields, watermarks, and signatures — compose any document from scratch.',
  },
  {
    Icon: Icons.Bolt,
    title: 'Barcodes & QR codes',
    body: 'Drop in scannable barcodes and QR codes across dozens of symbologies — ideal for labels, shipping, and inventory documents.',
  },
  {
    Icon: Icons.Map,
    title: 'Dynamic data mapping',
    body: 'Connect CSV, Excel, or API data. Mapdoc auto-detects fields and relationships and maps them straight into your template.',
  },
  {
    Icon: Icons.Reuse,
    title: 'Bulk generation',
    body: 'Turn one template and a dataset into hundreds of personalised documents in a single run — no copy-paste, no repetition.',
  },
  {
    Icon: Icons.Export,
    title: 'PDF & ZPL export',
    body: 'Generate pixel-perfect, print-ready PDFs — or ZPL output for thermal and label printers. What you see is what you get.',
  },
  {
    Icon: Icons.Eye,
    title: 'Multi-page & live preview',
    body: 'Multiple pages, custom page sizes, page breaks, and page numbers — all with an accurate, real-time preview as you build.',
  },
  {
    Icon: Icons.Team,
    title: 'Team workspaces',
    body: 'Shared template libraries and role-based access, so your whole organisation works from the same source of truth.',
  },
]

export default function Features() {
  return (
    <div className="lp">

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">Mapdoc</Link>
          <nav className="topbar__nav">
            <Link to="/features" className="topbar__link" style={{ color: 'var(--blue)' }}>Features</Link>
            <Link to="/pricing" className="topbar__link">Pricing</Link>
            <Link to="/careers" className="topbar__link">Careers</Link>
          </nav>
          <Link to="/canvas" className="btn btn--primary btn--sm">Launch App</Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap hero__inner">
          <div className="hero__content">
            <span className="eyebrow hero__eyebrow">✦ Product features</span>
            <h1>Every tool you need to build <em>perfect documents.</em></h1>
            <p className="hero__sub">
              From a drag-and-drop canvas to one-click PDF export and dynamic
              data mapping — Mapdoc gives teams everything to create, reuse,
              and automate business documents at scale.
            </p>
            <div className="hero__actions">
              <Link to="/canvas" className="btn btn--primary btn--lg">
                Try Mapdoc free <Arrow />
              </Link>
              <Link to="/" className="btn btn--ghost btn--lg">
                Back to home
              </Link>
            </div>
          </div>

          <div className="hero__visual">
            <FeatureHighlight />
            <div className="stats">
              <div className="stat">
                <div className="stat__num">7+</div>
                <div className="stat__label">Core tools</div>
              </div>
              <div className="stat">
                <div className="stat__num">1×</div>
                <div className="stat__label">Click export</div>
              </div>
              <div className="stat">
                <div className="stat__num">∞</div>
                <div className="stat__label">Templates</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="section section--tinted">
        <div className="wrap">
          <div className="section__head section__head--center" style={{ marginInline: 'auto' }}>
            <span className="eyebrow">Capabilities</span>
            <h2>Everything you need to <em>create and manage</em> templates.</h2>
            <p className="section__lead" style={{ textAlign: 'center', marginInline: 'auto' }}>
              Built for teams who create recurring business documents and need
              consistency without the manual work.
            </p>
          </div>
          <div className="feat-grid">
            {features.map(({ Icon, title, body }) => (
              <article className="feat-card" key={title}>
                <div className="feat-card__icon" style={{ color: 'var(--blue)' }}>
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coming soon ── */}
      <section className="section section--dark">
        <div className="wrap">
          <div className="section__head section__head--center" style={{ marginInline: 'auto' }}>
            <span className="eyebrow eyebrow--light">Coming soon</span>
            <h2>The roadmap is <em>just getting started.</em></h2>
            <p className="section__lead" style={{ textAlign: 'center', marginInline: 'auto' }}>
              Data mapping, bulk generation, PDF/ZPL export, and team workspaces
              are already live. AI template extraction is in active development —
              with more on the roadmap.
            </p>
          </div>
          <div className="feat-grid">
            {[
              { title: 'AI template extraction', badge: 'In progress', body: 'Upload a PDF and Mapdoc’s AI rebuilds it as a fully editable template — grounded on real template JSON so it reproduces the original’s structure accurately.' },
              { title: 'Version history',  body: 'Track every change to a template, compare revisions, and roll back to any previous version.' },
              { title: 'Cloud sync',       body: 'Save templates and data sources to the cloud and pick up where you left off on any device.' },
            ].map(({ title, body, badge }) => (
              <article className="feat-card feat-card--dark" key={title}>
                <div className="feat-card__icon" style={{ opacity: 0.5 }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3"/>
                    <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                {badge ? (
                  <div className="feat-card__title">
                    <h3>{title}</h3>
                    <span className="feat-badge feat-badge--progress">{badge}</span>
                  </div>
                ) : (
                  <h3>{title}</h3>
                )}
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="wrap footer__inner">
          <div>
            <span className="eyebrow eyebrow--light footer__tag">✦ Map it. Make it.</span>
            <h2>Ready to build your first template?</h2>
            <p className="footer__sub">
              Open the canvas, drag in your elements, and export a polished PDF
              in minutes — no account required.
            </p>
            <div className="hero__actions" style={{ marginTop: '1.5rem' }}>
              <Link to="/canvas" className="btn btn--primary btn--lg">
                Launch Mapdoc <Arrow />
              </Link>
              <Link to="/" className="btn btn--ghost btn--lg" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(240,244,255,0.75)' }}>
                Learn more
              </Link>
            </div>
          </div>

          <div className="footer__nav">
            <div className="footer__nav-group">
              <h4>Product</h4>
              <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/features">Features</Link></li>
                <li><Link to="/canvas">Launch App</Link></li>
              </ul>
            </div>
            <div className="footer__nav-group">
              <h4>Company</h4>
              <ul>
                <li><Link to="/careers">Careers</Link></li>
                <li><button type="button" className="footer__nav-btn footer__nav-btn--dim" disabled>Privacy</button></li>
                <li><button type="button" className="footer__nav-btn footer__nav-btn--dim" disabled>Terms</button></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="wrap footer__bottom">
          <span>© 2025 Mapdoc. All rights reserved.</span>
          <span>Map it. Make it.</span>
        </div>
      </footer>
    </div>
  )
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function FeatureHighlight() {
  return (
    <div className="hero__mockup">
      <div className="mockup__bar">
        <span className="mockup__dot" />
        <span className="mockup__dot" />
        <span className="mockup__dot" />
      </div>
      <div style={{ padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
        {[
          { icon: '📝', label: 'Text, tables & images', status: 'live'     },
          { icon: '▦',  label: 'Barcodes & QR codes',   status: 'live'     },
          { icon: '⚡', label: 'Data mapping',           status: 'live'     },
          { icon: '📄', label: 'PDF & ZPL export',       status: 'live'     },
          { icon: '👥', label: 'Team workspaces',        status: 'live'     },
          { icon: '✨', label: 'AI template extraction', status: 'progress' },
        ].map(({ icon, label, status }) => {
          const accent = {
            live:     { rowBg: 'rgba(35,85,244,0.06)',  rowBorder: 'rgba(35,85,244,0.12)',  text: '#0f172a', badgeBg: 'rgba(34,197,94,0.1)',   badgeColor: '#15803d', badgeText: 'Live' },
            progress: { rowBg: 'rgba(245,166,35,0.07)', rowBorder: 'rgba(245,166,35,0.20)', text: '#0f172a', badgeBg: 'rgba(245,166,35,0.14)', badgeColor: '#b45309', badgeText: 'In progress' },
            soon:     { rowBg: 'rgba(15,23,42,0.03)',   rowBorder: 'rgba(15,23,42,0.06)',   text: '#94a3b8', badgeBg: 'rgba(148,163,184,0.12)', badgeColor: '#94a3b8', badgeText: 'Soon' },
          }[status] ?? { rowBg: 'rgba(15,23,42,0.03)', rowBorder: 'rgba(15,23,42,0.06)', text: '#94a3b8', badgeBg: 'rgba(148,163,184,0.12)', badgeColor: '#94a3b8', badgeText: 'Soon' }
          return (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.6rem 0.85rem',
              borderRadius: '10px',
              background: accent.rowBg,
              border: `1px solid ${accent.rowBorder}`,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', color: accent.text }}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                {label}
              </span>
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                padding: '2px 8px', borderRadius: '999px',
                background: accent.badgeBg,
                color: accent.badgeColor,
              }}>
                {accent.badgeText}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}