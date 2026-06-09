import { Link } from 'react-router-dom'
import '../App.css'

/* ── Inline SVG icons ─────────────────────────────────────── */
const Icon = {
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
  Shield: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2 4 5v5c0 3.55 2.5 6.88 6 7.93C14.5 16.88 17 13.55 17 10V5l-7-3Z" fill="currentColor" opacity=".25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="m7.5 10 1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Arrow: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Play: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M5 3.5 13 8 5 12.5V3.5Z" fill="currentColor"/>
    </svg>
  ),
}

/* ── Product mockup ───────────────────────────────────────── */
function ProductMockup() {
  return (
    <div className="hero__mockup">
      <div className="mockup__bar">
        <span className="mockup__dot" />
        <span className="mockup__dot" />
        <span className="mockup__dot" />
      </div>
      <div className="mockup__body">
        <div className="mockup__sidebar">
          {['📄','🖼','⊞','—','□'].map((icon, i) => (
            <div key={i} className={`mockup__icon${i === 0 ? ' mockup__icon--active' : ''}`}>
              {icon}
            </div>
          ))}
        </div>
        <div className="mockup__canvas">
          <div className="mockup__doc">
            <div className="mockup__doc-header">
              <div>
                <div className="mockup__doc-title" style={{fontSize:'0.55rem',marginBottom:'0.2rem'}}>INVOICE</div>
                <div className="mockup__line mockup__line--short" style={{height:'5px',marginBottom:0}} />
              </div>
              <div className="mockup__doc-logo" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.4rem',margin:'0.6rem 0'}}>
              {[1,2,3,4].map(i => (
                <div key={i} className="mockup__line" style={{height:'5px',width:'100%',marginBottom:0}} />
              ))}
            </div>
            <div className="mockup__table">
              <div className="mockup__tr mockup__tr--head">
                <div className="mockup__td">Description</div>
                <div className="mockup__td">Qty</div>
                <div className="mockup__td">Amount</div>
              </div>
              {[
                ['Template design','1','$240'],
                ['Data mapping','3','$180'],
                ['Export setup','1','$80'],
              ].map(([d,q,a]) => (
                <div className="mockup__tr" key={d}>
                  <div className="mockup__td">{d}</div>
                  <div className="mockup__td">{q}</div>
                  <div className="mockup__td" style={{color:'#2355f4',fontWeight:700}}>{a}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'0.5rem'}}>
              <div style={{background:'rgba(35,85,244,0.08)',borderRadius:'6px',padding:'0.3rem 0.6rem',fontSize:'0.6rem',fontWeight:700,color:'#2355f4'}}>
                Total: $500
              </div>
            </div>
          </div>
          <div className="mockup__badge">
            <div className="mockup__badge-dot" />
            PDF exported
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function Home() {
  return (
    <div className="lp">

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">Mapdoc</div>
          <nav className="topbar__nav">
            <Link to="/features" className="topbar__link">Features</Link>
            <Link to="/careers" className="topbar__link">Careers</Link>
          </nav>
          <Link to="/canvas" className="btn btn--primary btn--sm">Launch App</Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero">
        <div className="wrap hero__inner">
          <div className="hero__content">
            <span className="eyebrow hero__eyebrow">✦ Map it. Make it.</span>
            <h1>Build document templates <em>in minutes.</em></h1>
            <p className="hero__sub">
              Mapdoc lets teams create invoices, receipts, reports, and proposals
              with a single reusable template — so every document looks polished
              and consistent, every time.
            </p>
            <div className="hero__actions">
              <Link to="/canvas" className="btn btn--primary btn--lg">
                Open Mapdoc <Icon.Arrow />
              </Link>
              <a className="btn btn--ghost btn--lg" href="#demo">
                <Icon.Play /> See it in action
              </a>
            </div>
            <ul className="hero__bullets">
              <li>Create once, reuse across every document</li>
              <li>Keep formatting consistent across your team</li>
              <li>Export polished PDFs in one click</li>
            </ul>
          </div>

          <div className="hero__visual">
            <ProductMockup />
            <div className="stats">
              <div className="stat">
                <div className="stat__num">3×</div>
                <div className="stat__label">Faster setup</div>
              </div>
              <div className="stat">
                <div className="stat__num">100%</div>
                <div className="stat__label">Consistent</div>
              </div>
              <div className="stat">
                <div className="stat__num">∞</div>
                <div className="stat__label">Reusable</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why it works ─────────────────────────────────── */}
      <section className="section section--tinted" id="solution">
        <div className="wrap">
          <div className="section__head">
            <span className="eyebrow section__eyebrow">Why it works</span>
            <h2>Stop rebuilding the same layout <em>over and over.</em></h2>
            <p className="section__lead">
              Mapdoc gives teams a visual way to define page structure and reuse
              it for invoices, delivery notes, quotes, and more.
            </p>
          </div>
          <div className="feat-grid">
            {[
              { Icon: Icon.Bolt,     title: 'Save time',       body: 'Build a template once, then use it across every document without redesigning or copy-pasting.' },
              { Icon: Icon.Template, title: 'Stay consistent', body: 'Use the same structure for all business documents so formatting stays aligned and on-brand.' },
              { Icon: Icon.Shield,   title: 'Scale better',    body: 'Manage templates for growing teams, new document types, and evolving client workflows.' },
            ].map(({ Icon: Ic, title, body }) => (
              <article className="feat-card" key={title}>
                <div className="feat-card__icon" style={{color:'var(--blue)'}}>
                  <Ic />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="section section--dark" id="how-it-works">
        <div className="wrap">
          <div className="section__head section__head--center">
            <span className="eyebrow eyebrow--light">How it works</span>
            <h2>Three steps to a <em>polished document.</em></h2>
            <p className="section__lead" style={{textAlign:'center',marginInline:'auto'}}>
              From blank canvas to mapped data and a print-ready PDF or ZPL export — Mapdoc keeps the process simple.
            </p>
          </div>
          <div className="steps">
            {[
              { label: 'Design',  title: 'Build your template', body: 'Drag and drop text, tables, images, barcodes, QR codes, and shapes onto the canvas to lay out your document — no code required.' },
              { label: 'Map data', title: 'Connect your data',   body: 'Upload a CSV or Excel file, or connect an API. Mapdoc auto-detects fields and relationships and maps them into your template.' },
              { label: 'Export',  title: 'Generate at scale',   body: 'Produce one polished file or bulk-generate hundreds of personalised documents — exported as print-ready PDF or ZPL in a single click.' },
            ].map(({ label, title, body }, i) => (
              <article className="step-card feat-card feat-card--dark" key={title}>
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

      {/* ── Features ─────────────────────────────────────── */}
      <section className="section" id="features">
        <div className="wrap">
          <div className="section__head section__head--center" style={{marginInline:'auto'}}>
            <span className="eyebrow">Capabilities</span>
            <h2>Everything you need to <em>create and manage</em> templates.</h2>
          </div>
          <div className="feat-grid">
            {[
              { Icon: Icon.Template, title: 'Rich element library', body: 'Text, paragraphs, tables, images, lines, boxes, checkboxes, radios, dates, watermarks, and signatures.' },
              { Icon: Icon.Map,      title: 'Barcodes & QR codes',  body: 'Drop in scannable barcodes and QR codes across dozens of symbologies — perfect for labels and tracking.' },
              { Icon: Icon.Reuse,    title: 'Data mapping',         body: 'Connect CSV, Excel, or API data. Mapdoc auto-detects relationships and maps fields to your template.' },
              { Icon: Icon.Bolt,     title: 'Bulk generation',      body: 'Turn one template and a dataset into hundreds of personalised documents in a single run.' },
              { Icon: Icon.Export,   title: 'PDF & ZPL export',     body: 'One-click, print-ready PDFs — or ZPL output for thermal and label printers.' },
              { Icon: Icon.Shield,   title: 'Multi-page layouts',   body: 'Multiple pages, custom page sizes, page breaks, and page numbers — with a live, real-time preview.' },
            ].map(({ Icon: Ic, title, body }) => (
              <article className="feat-card" key={title}>
                <div className="feat-card__icon" style={{color:'var(--blue)'}}>
                  <Ic />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo video ───────────────────────────────────── */}
      <section className="section section--tinted" id="demo">
        <div className="wrap">
          <div className="section__head section__head--center" style={{marginInline:'auto'}}>
            <span className="eyebrow">See it in action</span>
            <h2>Build a template, map your data, and <em>export polished documents.</em></h2>
            <p className="section__lead" style={{textAlign:'center',marginInline:'auto'}}>
              Template creation, element arrangement, data mapping, and PDF or ZPL export — all in a few minutes.
            </p>
          </div>
          <div className="video-wrap" style={{ background: '#fff', padding: '2.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ maxWidth: 520, width: '100%' }}>
              <ProductMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer / waitlist ────────────────────────────── */}
      <footer className="footer">
        <div className="wrap footer__inner">
          <div>
            <span className="eyebrow eyebrow--light footer__tag">✦ Map it. Make it.</span>
            <h2>Map your data. Make your documents. <em>At scale.</em></h2>
            <p className="footer__sub">
              Upload CSV, Excel, or connect your API to instantly map fields and
              generate documents at scale — invoices, HR letters, reports, bulk
              workflows, all without manual copy-paste.
            </p>
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