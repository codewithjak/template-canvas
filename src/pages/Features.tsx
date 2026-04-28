import { Link } from 'react-router-dom'
import '../App.css'

function Features() {
  return (
    <main className="landing-page">
      <header className="topbar">
        <Link to="/" className="brand">Mapdoc</Link>
        <Link to="/canvas" className="button button--secondary topbar__launch">
          Launch App
        </Link>
      </header>

      <section className="hero">
        <div className="hero__content">
          <span className="eyebrow">Product features</span>
          <h1>Powerful template creation and document automation.</h1>
          <p className="hero__text">
            Discover all the tools and capabilities that make Mapdoc the perfect solution
            for creating reusable business document templates.
          </p>

          <div className="hero__actions">
            <Link to="/canvas" className="button button--primary">
              Try Mapdoc Now
            </Link>
            <Link to="/" className="button button--secondary">
              Back to Home
            </Link>
          </div>
        </div>

        <div className="hero__card" aria-label="Features overview">
          <div className="metric-card">
            <p className="metric-card__label">Core Features</p>
            <p className="metric-card__value">Visual Template Builder</p>
            <p className="metric-card__detail">
              Drag-and-drop interface for creating professional document layouts
              with text, images, tables, and shapes.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--muted">
        <div className="section-heading">
          <span className="section-heading__eyebrow">Capabilities</span>
          <h2>Everything you need to create and manage document templates.</h2>
        </div>

        <div className="pain-grid">
          <article className="info-card">
            <h3>Template Elements</h3>
            <p>
              Add text, images, tables, lines, and boxes to create any document layout.
            </p>
          </article>
          <article className="info-card">
            <h3>Save & Load</h3>
            <p>
              Save templates as JSON files and load them back for reuse and sharing.
            </p>
          </article>
          <article className="info-card">
            <h3>PDF Export</h3>
            <p>
              Export your templates as high-quality PDF documents ready for use.
            </p>
          </article>
          <article className="info-card">
            <h3>Responsive Design</h3>
            <p>
              Templates work across different screen sizes and print formats.
            </p>
          </article>
          <article className="info-card">
            <h3>Drag & Drop</h3>
            <p>
              Intuitive drag-and-drop interface for easy element positioning.
            </p>
          </article>
          <article className="info-card">
            <h3>Real-time Preview</h3>
            <p>
              See changes instantly as you build and modify your templates.
            </p>
          </article>
        </div>
      </section>

      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-waitlist">
            <span className="eyebrow">Ready to get started?</span>
            <h2>Join thousands of teams using Mapdoc for their document workflows.</h2>
            <div className="hero__actions">
              <Link to="/canvas" className="button button--primary">
                Launch Mapdoc
              </Link>
              <Link to="/" className="button button--secondary">
                Learn More
              </Link>
            </div>
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

export default Features