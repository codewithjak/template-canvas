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
  AI: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 11.4 7l4.5 1.4-4.5 1.4L10 14.3 8.6 9.8 4.1 8.4 8.6 7 10 2.5Z" fill="currentColor" opacity=".9"/>
      <path d="m15.5 12.5.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" fill="currentColor" opacity=".6"/>
    </svg>
  ),
  Email: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="m3.5 5.5 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Component: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 14 6l-4 3.5L6 6l4-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M13 9.5 16.5 13 13 16.5 9.5 13 13 9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Integrations: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="15" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="10" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M6.7 6.6 9 13M13.3 6.6 11 13M7.2 5h5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
    title: 'PDF, image & ZPL export',
    body: 'Generate pixel-perfect, print-ready PDFs, high-resolution PNG, JPG, and JPEG images, or ZPL output for thermal and label printers. What you see is what you get.',
  },
  {
    Icon: Icons.Export,
    title: 'Email delivery',
    body: 'Send a generated document straight from Mapdoc — export to PDF and email it to recipients without leaving the canvas.',
  },
  {
    Icon: Icons.Integrations,
    title: 'Webhooks & integrations',
    body: 'Put Mapdoc inside your workflow. Trigger generation from any system through the API, and receive a signed webhook the moment documents are ready — connect Zapier, n8n, Make, or your own backend without building a separate integration for each tool.',
  },
  {
    Icon: Icons.Eye,
    title: 'Multi-page & live preview',
    body: 'Multiple pages, custom page sizes, page breaks, and page numbers — all with an accurate, real-time preview as you build.',
  },
  {
    Icon: Icons.AI,
    title: 'AI rebuild from PDF',
    body: 'Upload a PDF and Mapdoc’s AI rebuilds it as a reusable, editable template — values become data placeholders and tables become bound rows, ready to drive with your own data. The layout is measured from the PDF, so structure stays faithful, never hallucinated.',
  },
  {
    Icon: Icons.Template,
    title: 'Built-in template library',
    body: 'Start from ready-made, industry-specific designs — invoices, labels, logistics docs and more — that open as fully editable copies.',
  },
  {
    Icon: Icons.Team,
    title: 'Team workspaces',
    body: 'Shared template libraries, invites, and role-based access, so your whole organisation works from the same source of truth.',
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
            <h1>Every tool you need to <em>design once and export anywhere.</em></h1>
            <p className="hero__sub">
              From a drag-and-drop canvas to one-click PDF, image, and ZPL export,
              AI rebuild from PDF, and dynamic data mapping — Mapdoc gives you
              everything to design, reuse, and generate at scale. And it's growing
              beyond documents: reusable UI components are next.
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
            <h2>Everything you need to <em>design, map, and ship</em> at scale.</h2>
            <p className="section__lead" style={{ textAlign: 'center', marginInline: 'auto' }}>
              One visual canvas, one data flow, many kinds of output — so whatever
              you design can be generated cleanly, in bulk, and on-brand.
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

      {/* ── How the AI works ── */}
      <section className="section" id="how-ai-works">
        <div className="wrap">
          <div className="section__head section__head--center" style={{ marginInline: 'auto' }}>
            <span className="eyebrow">How the AI works</span>
            <h2>Upload a PDF, get a <em>reusable template</em> back.</h2>
            <p className="section__lead" style={{ textAlign: 'center', marginInline: 'auto' }}>
              Mapdoc’s AI rebuild runs as a four-stage pipeline. The exact layout is
              measured from your PDF — the AI only names and organises what’s there,
              so the structure can’t drift or be invented. Every AI step is
              best-effort: if it can’t run, the import still falls back to a faithful copy.
            </p>
          </div>
          <div className="steps steps--ai">
            {[
              { label: 'Extract', title: 'Read the PDF exactly', body: 'A deterministic pass pulls the real text, fonts, tables, lines, and images with their measured positions. This geometry is the source of truth — no AI touches it.' },
              { label: 'Match',   title: 'Find a similar design', body: 'The AI compares your document to Mapdoc’s built-in template families and picks the closest match as a naming hint — never as a replacement for your actual layout.' },
              { label: 'Rebuild', title: 'Tokenise with AI',      body: 'The AI classifies and groups the content, detects line-item tables, and turns values into data placeholders and tables into bound rows — a reusable template, not a static snapshot.' },
              { label: 'Finalise', title: 'Validate & open',      body: 'The result is checked against Mapdoc’s schema, assembled into editable pages with a fidelity report, and opened on the canvas as an AI draft you refine.' },
            ].map(({ label, title, body }, i) => (
              <article className="step-card feat-card" key={title}>
                <div className="step-card__head">
                  <span className="step-card__num">{i + 1}</span>
                  <span className="step-card__label">{label}</span>
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
              Data mapping, bulk generation, PDF/image/ZPL export, AI rebuild
              from PDF, and team workspaces are already live. Next up: Mapdoc moves
              beyond documents to generate reusable UI components — with more on the roadmap.
            </p>
          </div>
          <div className="feat-grid">
            {[
              { title: 'UI component export', badge: 'Coming soon', body: 'Design on the same canvas and generate reusable, standalone UI components — turning a visual layout into production-ready front-end code.' },
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
                    <span className="feat-badge feat-badge--soon">{badge}</span>
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
          <span>© 2026 Mapdoc. All rights reserved.</span>
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
          { icon: '📄', label: 'PDF, image & ZPL export', status: 'live'     },
          { icon: '👥', label: 'Team workspaces',        status: 'live'     },
          { icon: '✨', label: 'AI rebuild from PDF',     status: 'live'     },
          { icon: '🔗', label: 'Webhooks & integrations', status: 'live'     },
          { icon: '◈',  label: 'UI component export',    status: 'soon'     },
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