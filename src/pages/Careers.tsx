import { Link } from 'react-router-dom'
import '../App.css'

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const roles = [
  {
    title: 'Frontend Developer',
    type: 'Full-time · Remote',
    body: 'Build beautiful, responsive interfaces using React and TypeScript. Experience with design systems and component libraries preferred.',
    subject: 'Frontend Developer Application',
  },
  {
    title: 'Backend Developer',
    type: 'Full-time · Remote',
    body: 'Design and implement scalable APIs and data processing pipelines. Experience with Node.js, databases, and cloud services required.',
    subject: 'Backend Developer Application',
  },
  {
    title: 'Product Designer',
    type: 'Full-time · Remote',
    body: 'Create intuitive user experiences and polished interfaces. Strong portfolio and hands-on experience with design tools required.',
    subject: 'Product Designer Application',
  },
  {
    title: 'DevOps Engineer',
    type: 'Contract · Remote',
    body: 'Build and maintain our infrastructure and deployment pipelines. Experience with AWS, Docker, and CI/CD workflows required.',
    subject: 'DevOps Engineer Application',
  },
]

const perks = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2 12.5 7.5H18l-4.5 3.5 1.5 6L10 14l-5 3 1.5-6L2 7.5h5.5L10 2Z" fill="currentColor" opacity=".85"/>
      </svg>
    ),
    title: 'Real impact',
    body: 'Your work directly helps thousands of teams eliminate repetitive document work and focus on what matters.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Z" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Early-stage ownership',
    body: 'Join early and take real ownership of critical features. Your decisions shape the product from day one.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="14" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 16c0-2.5 2.5-4 6-4s6 1.5 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M14 14c1.5 0 3 .75 3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Great culture',
    body: 'A collaborative team that values transparency, honest feedback, continuous learning, and real work-life balance.',
  },
]

export default function Careers() {
  return (
    <div className="lp">

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">Mapdoc</Link>
          <nav className="topbar__nav">
            <Link to="/features" className="topbar__link">Features</Link>
            <Link to="/careers" className="topbar__link" style={{ color: 'var(--blue)' }}>Careers</Link>
          </nav>
          <Link to="/canvas" className="btn btn--primary btn--sm">Launch App</Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap hero__inner">
          <div className="hero__content">
            <span className="eyebrow hero__eyebrow">✦ Join our team</span>
            <h1>Help us build the future of <em>document automation.</em></h1>
            <p className="hero__sub">
              We're looking for people who care deeply about great software,
              want to move fast, and want their work to matter from day one.
            </p>
            <div className="hero__actions">
              <a href="mailto:careers@mapdoc.com" className="btn btn--primary btn--lg">
                Send your resume <Arrow />
              </a>
              <Link to="/" className="btn btn--ghost btn--lg">
                Back to home
              </Link>
            </div>
            <ul className="hero__bullets">
              <li>Fully remote team</li>
              <li>Early-stage with real ownership</li>
              <li>Work on a product people actually use</li>
            </ul>
          </div>

          <div className="hero__visual">
            <div className="hero__mockup">
              <div className="mockup__bar">
                <span className="mockup__dot" />
                <span className="mockup__dot" />
                <span className="mockup__dot" />
              </div>
              <div style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '1rem' }}>
                  Open positions
                </div>
                {roles.map(({ title, type }) => (
                  <div key={title} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.75rem 0',
                    borderBottom: '1px solid rgba(15,23,42,0.07)',
                    gap: '1rem',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{title}</div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.15rem' }}>{type}</div>
                    </div>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                      padding: '3px 10px', borderRadius: '999px',
                      background: 'rgba(35,85,244,0.08)', color: '#2355f4',
                    }}>Hiring</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="stat__num">4</div>
                <div className="stat__label">Open roles</div>
              </div>
              <div className="stat">
                <div className="stat__num">100%</div>
                <div className="stat__label">Remote</div>
              </div>
              <div className="stat">
                <div className="stat__num">🌍</div>
                <div className="stat__label">Global</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open roles ── */}
      <section className="section section--tinted" id="roles">
        <div className="wrap">
          <div className="section__head">
            <span className="eyebrow">Open positions</span>
            <h2>Find your role at <em>Mapdoc.</em></h2>
            <p className="section__lead">
              We hire for attitude and ability. If you're passionate about building
              great tools and working with a focused team, we want to hear from you.
            </p>
          </div>
          <div className="feat-grid">
            {roles.map(({ title, type, body, subject }) => (
              <article className="feat-card" key={title} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      padding: '3px 10px', borderRadius: '999px', flexShrink: 0,
                      background: 'rgba(35,85,244,0.08)', color: '#2355f4',
                    }}>Hiring</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem', fontWeight: 500 }}>{type}</div>
                  <p>{body}</p>
                </div>
                <a
                  href={`mailto:careers@mapdoc.com?subject=${subject}`}
                  className="btn btn--ghost btn--sm"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Apply now <Arrow />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Mapdoc ── */}
      <section className="section section--dark">
        <div className="wrap">
          <div className="section__head section__head--center" style={{ marginInline: 'auto' }}>
            <span className="eyebrow eyebrow--light">Why Mapdoc</span>
            <h2>We're building something <em>worth working on.</em></h2>
          </div>
          <div className="feat-grid">
            {perks.map(({ icon, title, body }) => (
              <article className="feat-card feat-card--dark" key={title}>
                <div className="feat-card__icon" style={{ color: '#93b4ff' }}>{icon}</div>
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
            <h2>Ready to join the team?</h2>
            <p className="footer__sub">
              Send us your resume and a short note about what excites you about Mapdoc.
              We read every application personally.
            </p>
            <div className="hero__actions" style={{ marginTop: '1.5rem' }}>
              <a href="mailto:careers@mapdoc.com" className="btn btn--primary btn--lg">
                Apply for a position <Arrow />
              </a>
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