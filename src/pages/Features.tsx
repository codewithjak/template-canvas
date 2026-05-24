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
    body: 'Text blocks, images, layout tables, lines, and boxes — everything you need to compose any document type from scratch.',
  },
  {
    Icon: Icons.Reuse,
    title: 'Save & reload',
    body: 'Export templates as JSON and reload them instantly. Share a single file across your whole team for consistent results.',
  },
  {
    Icon: Icons.Export,
    title: 'One-click PDF export',
    body: 'Generate pixel-perfect, print-ready PDFs directly from your template. What you see is exactly what you get.',
  },
  {
    Icon: Icons.Map,
    title: 'Dynamic data mapping',
    body: 'Connect CSV, Excel, or API data to auto-fill fields and generate documents at scale — no copy-paste, no repetition.',
  },
  {
    Icon: Icons.Bolt,
    title: 'Drag & drop canvas',
    body: 'Intuitive canvas interface with precise element positioning and snapping. No code, no configuration required.',
  },
  {
    Icon: Icons.Eye,
    title: 'Real-time preview',
    body: 'Every change renders live as you build. The preview is your output — accurate, instant, and always up to date.',
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
                <div className="stat__num">6+</div>
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
              Data mapping, API connectors, team workspaces, and bulk generation
              are all in active development.
            </p>
          </div>
          <div className="feat-grid">
            {[
              { title: 'Bulk generation',    body: 'Upload a spreadsheet and generate hundreds of personalised documents in one run.' },
              { title: 'API connector',      body: 'Pull live data from your existing systems directly into any template field.' },
              { title: 'Team workspaces',    body: 'Shared template libraries, role-based access, and version history for your whole org.' },
            ].map(({ title, body }) => (
              <article className="feat-card feat-card--dark" key={title}>
                <div className="feat-card__icon" style={{ opacity: 0.5 }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3"/>
                    <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>{title}</h3>
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
          { icon: '📝', label: 'Text & paragraphs',  done: true  },
          { icon: '▦',  label: 'Layout tables',      done: true  },
          { icon: '🖼', label: 'Image blocks',        done: true  },
          { icon: '📄', label: 'PDF export',         done: true  },
          { icon: '⚡', label: 'Data mapping',        done: false },
          { icon: '👥', label: 'Team workspaces',    done: false },
        ].map(({ icon, label, done }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 0.85rem',
            borderRadius: '10px',
            background: done ? 'rgba(35,85,244,0.06)' : 'rgba(15,23,42,0.03)',
            border: `1px solid ${done ? 'rgba(35,85,244,0.12)' : 'rgba(15,23,42,0.06)'}`,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', color: done ? '#0f172a' : '#94a3b8' }}>
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              {label}
            </span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
              padding: '2px 8px', borderRadius: '999px',
              background: done ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.12)',
              color: done ? '#15803d' : '#94a3b8',
            }}>
              {done ? 'Live' : 'Soon'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}