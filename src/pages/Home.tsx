import { Link } from 'react-router-dom'
import '../App.css'

function Home() {

  return (
    <main className="landing-page">
      <header className="topbar">
        <div className="brand">Mapdoc</div>
        <Link to="/canvas" className="button button--secondary topbar__launch">
          Launch App
        </Link>
      </header>

      <section className="hero">
        <div className="hero__content">
          <span className="eyebrow">Design once. Reuse anytime.</span>
          <h1>Build reusable business document templates in minutes.</h1>
          <p className="hero__text">
            Mapdoc helps teams create invoices, receipts, reports, and proposals with a single
            reusable template so every document looks polished and consistent.
          </p>

          <div className="hero__actions">
            <Link to="/canvas" className="button button--primary">
              Open Mapdoc
            </Link>
            <a className="button button--secondary" href="#how-it-works">
              Watch Demo
            </a>
          </div>

          <ul className="hero__highlights">
            <li>Create once and reuse every time</li>
            <li>Keep formatting consistent across documents</li>
            <li>Speed up operations for teams and clients</li>
          </ul>
        </div>

        <div className="hero__card" aria-label="Product summary card">
          <div className="metric-card">
            <p className="metric-card__label">Why Mapdoc</p>
            <p className="metric-card__value">Design smarter templates with consistent results.</p>
            <p className="metric-card__detail">
              Mapdoc eliminates repeated layout work and makes it easy to update,
              export, and reuse document templates across your team.
            </p>
            <div className="metric-summary">
              <div>
                <strong>3x faster</strong>
                <span>template setup</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>layout consistency</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--muted" id="solution">
        <div className="section-heading">
          <span className="section-heading__eyebrow">Why it works</span>
          <h2>Keep every recurring document accurate, branded, and easy to update.</h2>
          <p>
            Mapdoc gives teams a visual way to define page structure and reuse it for invoices,
            delivery notes, quotes, and more—without rebuilding the same layout every time.
          </p>
        </div>

        <div className="pain-grid">
          <article className="info-card">
            <h3>Save time</h3>
            <p>
              Build a template once, then use it across every document without redesigning.
            </p>
          </article>
          <article className="info-card">
            <h3>Stay consistent</h3>
            <p>
              Use the same structure for all business documents so formatting stays aligned.
            </p>
          </article>
          <article className="info-card">
            <h3>Scale better</h3>
            <p>
              Manage templates for growing teams, new document types, and evolving workflows.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <span className="section-heading__eyebrow">See Mapdoc in action</span>
          <h2>Watch how to build a template and export polished documents.</h2>
          <p>
            The demo shows template creation, element arrangement, and the workflow for launching
            consistent documents across teams.
          </p>
        </div>
        <div className="video-container">
          <video width="100%" controls poster="/video-placeholder.jpg">
            <source src="/demo-video.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-waitlist">
            <span className="eyebrow">Join the waitlist</span>
            <h2>Turn your templates into automated documents using dynamic data mapping.</h2>
            <p>
              Upload CSV, Excel, or connect your API to instantly map fields and generate documents at scale — no manual copy-paste, no repetitive work.
            </p>
            <p>
              Perfect for invoices, HR letters, reports, forms, claims, and bulk document workflows.
            </p>
            <p>
              Be the first to access early launch updates and priority onboarding.
            </p>
            <form className="waitlist-form" onSubmit={(event) => event.preventDefault()}>
              <input
                type="email"
                aria-label="Enter your email"
                placeholder="Enter your email"
                className="waitlist-input"
                required
              />
              <button className="button button--primary waitlist-button" type="submit">
                Join waitlist
              </button>
            </form>
          </div>

          <div className="footer-nav">
            <div>
              <h3>Quick links</h3>
              <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/features">Features</Link></li>
                <li><Link to="/careers">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul>
                <li><Link to="/careers">Careers</Link></li>
                <li><button type="button" className="footer-link footer-link--disabled" disabled>Privacy</button></li>
                <li><button type="button" className="footer-link footer-link--disabled" disabled>Terms</button></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default Home