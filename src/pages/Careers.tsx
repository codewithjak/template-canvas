import { Link } from 'react-router-dom'
import '../App.css'

function Careers() {
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
          <span className="eyebrow">Join our team</span>
          <h1>Help us build the future of document automation.</h1>
          <p className="hero__text">
            We're looking for talented individuals who are passionate about creating
            tools that make work easier and more efficient for teams worldwide.
          </p>

          <div className="hero__actions">
            <a href="mailto:careers@mapdoc.com" className="button button--primary">
              Send Resume
            </a>
            <Link to="/" className="button button--secondary">
              Back to Home
            </Link>
          </div>
        </div>

        <div className="hero__card" aria-label="Careers overview">
          <div className="metric-card">
            <p className="metric-card__label">Our Mission</p>
            <p className="metric-card__value">Empower teams with better tools</p>
            <p className="metric-card__detail">
              We believe that great software should eliminate repetitive work and
              help teams focus on what matters most.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--muted">
        <div className="section-heading">
          <span className="section-heading__eyebrow">Open positions</span>
          <h2>Current opportunities at Mapdoc.</h2>
          <p>
            We're growing our team and looking for exceptional talent in these areas.
          </p>
        </div>

        <div className="pain-grid">
          <article className="info-card">
            <h3>Frontend Developer</h3>
            <p>
              Build beautiful, responsive interfaces using React and TypeScript.
              Experience with design systems and component libraries preferred.
            </p>
            <a href="mailto:careers@mapdoc.com?subject=Frontend Developer Application" className="button button--secondary" style={{marginTop: '1rem'}}>
              Apply Now
            </a>
          </article>
          <article className="info-card">
            <h3>Backend Developer</h3>
            <p>
              Design and implement scalable APIs and data processing systems.
              Experience with Node.js, databases, and cloud services required.
            </p>
            <a href="mailto:careers@mapdoc.com?subject=Backend Developer Application" className="button button--secondary" style={{marginTop: '1rem'}}>
              Apply Now
            </a>
          </article>
          <article className="info-card">
            <h3>Product Designer</h3>
            <p>
              Create intuitive user experiences and beautiful interfaces.
              Strong portfolio and experience with design tools required.
            </p>
            <a href="mailto:careers@mapdoc.com?subject=Product Designer Application" className="button button--secondary" style={{marginTop: '1rem'}}>
              Apply Now
            </a>
          </article>
          <article className="info-card">
            <h3>DevOps Engineer</h3>
            <p>
              Build and maintain our infrastructure and deployment pipelines.
              Experience with AWS, Docker, and CI/CD required.
            </p>
            <a href="mailto:careers@mapdoc.com?subject=DevOps Engineer Application" className="button button--secondary" style={{marginTop: '1rem'}}>
              Apply Now
            </a>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="section-heading__eyebrow">Why Mapdoc</span>
          <h2>We're building something special.</h2>
        </div>

        <div className="pain-grid">
          <article className="info-card">
            <h3>Impact</h3>
            <p>
              Your work will directly impact thousands of teams and help them
              eliminate repetitive document work.
            </p>
          </article>
          <article className="info-card">
            <h3>Growth</h3>
            <p>
              Join an early-stage company with opportunities to grow and take
              ownership of important projects.
            </p>
          </article>
          <article className="info-card">
            <h3>Culture</h3>
            <p>
              Work with a collaborative team that values transparency,
              learning, and work-life balance.
            </p>
          </article>
        </div>
      </section>

      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-waitlist">
            <span className="eyebrow">Ready to join?</span>
            <h2>Send us your resume and let's talk about your future at Mapdoc.</h2>
            <div className="hero__actions">
              <a href="mailto:careers@mapdoc.com" className="button button--primary">
                Apply for a Position
              </a>
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

export default Careers