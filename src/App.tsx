import { useState } from 'react'
import TemplateCanvas from './components/TemplateCanvas/TemplateCanvas'
import './App.css'

const feedbackFormUrl =
  'https://docs.google.com/forms/d/e/1FAIpQLSdX5hhEWa7775FCeSbRk9PvFtRU9Q_LtCMlM-eCeICMFa7PLA/viewform?usp=publish-editor'

function App() {
  const [showCanvas, setShowCanvas] = useState(false)

  if (showCanvas) {
    return <TemplateCanvas />
  }

  return (
    <main className="landing-page">
      <section className="hero">
        <div className="hero__content">
          <span className="eyebrow">Design once. Reuse anytime.</span>
          <h1>Create repeatable document templates without rebuilding the same layout every time.</h1>
          <p className="hero__text">
            TemplateCanvas is a visual template system for receipts, invoices, reports,
            brochures, and other structured documents, so teams stop repeating layout work
            every time content changes.
          </p>
          <div className="hero__actions">
            <button className="button button--primary" type="button" onClick={() => setShowCanvas(true)}>
              Open Template Canvas
            </button>
            <a
              className="button button--secondary"
              href={feedbackFormUrl}
              target="_blank"
              rel="noreferrer"
            >
              Give Feedback
            </a>
          </div>
        </div>

        <div className="hero__card" aria-label="Product summary card">
          <div className="metric-card">
            <p className="metric-card__label">Solution</p>
            <p className="metric-card__value">One place to design reusable document structures.</p>
            <p className="metric-card__detail">
              The product removes repeated formatting and rebuilding by letting teams create
              a template once and use it across many documents and document types.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--muted" id="solution">
        <div className="section-heading">
          <span className="section-heading__eyebrow">What it does</span>
          <h2>TemplateCanvas removes repetitive layout work from recurring documents.</h2>
          <p>
            If a team keeps producing the same kind of document with different content,
            TemplateCanvas turns that repeated manual effort into a reusable visual template
            workflow.
          </p>
        </div>

        <div className="pain-grid">
          <article className="info-card">
            <h3>Receipts and invoices</h3>
            <p>
              Reuse the same structure instead of rebuilding the same business document layout.
            </p>
          </article>
          <article className="info-card">
            <h3>Reports and brochures</h3>
            <p>
              Keep repeatable formats consistent even when the content changes each time.
            </p>
          </article>
          <article className="info-card">
            <h3>Direct product access</h3>
            <p>
              The primary CTA opens the actual canvas so users can start designing immediately.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <span className="section-heading__eyebrow">See it in action</span>
          <h2>Watch how to create and use templates in minutes.</h2>
        </div>
        <div className="video-container">
          <video width="100%" controls poster="/video-placeholder.jpg">
            <source src="/demo-video.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </section>
    </main>
  )
}

export default App
