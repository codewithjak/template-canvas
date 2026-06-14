import { useState, type FormEvent } from 'react'
import { API_BASE } from '../services/config'

/**
 * "Contact us" form for the marketing site.
 *
 * Posts to the backend POST /contact, which emails the submission to the team
 * inbox (junaid.khan@map-doc.com) via SendGrid with the visitor's address as
 * Reply-To. The hidden "company" field is a honeypot — bots fill it, humans
 * never see it, and the server silently accepts (but drops) those submissions.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, company }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
      setStatus('sent')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="contact-form contact-form--done">
        <div className="contact-done__check">✓</div>
        <h3>Thanks — we’ve got your message.</h3>
        <p>We’ll get back to you at the email you provided shortly.</p>
      </div>
    )
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <div className="contact-field">
        <label htmlFor="contact-name" className="contact-label">Name</label>
        <input
          id="contact-name"
          className="contact-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={120}
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="contact-email" className="contact-label">Email</label>
        <input
          id="contact-email"
          className="contact-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          maxLength={254}
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="contact-message" className="contact-label">
          Feedback, query or suggestion
        </label>
        <textarea
          id="contact-message"
          className="contact-input contact-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          maxLength={5000}
          rows={5}
          required
        />
      </div>

      {/* Honeypot — positioned off-screen, hidden from real users. */}
      <input
        type="text"
        className="contact-hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />

      {status === 'error' && <p className="contact-error">{error}</p>}

      <button type="submit" className="btn btn--primary btn--lg" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
