/**
 * src/auth/UserMenu.tsx
 * Avatar button + dropdown for the signed-in user.
 *
 * Shows the Google profile photo when available, otherwise a colored
 * circle with the user's initial. Clicking opens a small menu with the
 * name, email, and a Sign out action.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  // True when the provider "photo" is actually a generated monogram (a flat
  // 2-3 colour letter avatar) rather than a real uploaded photo. We only show
  // the picture when it's a real photo; monograms fall back to our branded
  // initial. Google gives both the same URL format, so we tell them apart by
  // sampling the pixels: a monogram has very few distinct colours.
  const [isMonogram, setIsMonogram] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const meta = user?.user_metadata ?? {}
    const url: string | undefined = meta.avatar_url || meta.picture
    if (!url) { setIsMonogram(false); return }

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const s = 20
        const canvas = document.createElement('canvas')
        canvas.width = s; canvas.height = s
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, s, s)
        const { data } = ctx.getImageData(0, 0, s, s)
        const colours = new Set<number>()
        for (let i = 0; i < data.length; i += 4) {
          // Quantise to 3 bits per channel so anti-aliasing doesn't inflate the count.
          colours.add(((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5))
        }
        if (!cancelled) setIsMonogram(colours.size <= 12)
      } catch {
        // Cross-origin taint: can't inspect, so assume it's a real photo and show it.
      }
    }
    img.src = url
    return () => { cancelled = true }
  }, [user])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const meta = user.user_metadata ?? {}
  const name: string = meta.full_name || meta.name || ''
  const email = user.email ?? ''
  const avatarUrl: string | undefined = meta.avatar_url || meta.picture
  const initial = (name || email || '?').trim().charAt(0).toUpperCase()
  // Same gradient as the header logo tile so the avatar matches it exactly.
  const accent = 'linear-gradient(135deg, #2355f4, #1740d0)'
  // Show the real photo only when it isn't a generated monogram.
  const showPhoto = !!avatarUrl && !isMonogram

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name || email}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px 4px 4px',
          borderRadius: '999px',
          border: '1px solid #e5e9f1',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        {showPhoto ? (
          <img
            src={avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {initial}
          </span>
        )}
        <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>
          {name || email}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2.5"
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: '220px',
            background: '#fff',
            border: '1px solid #e5e9f1',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(15,23,42,0.14)',
            overflow: 'hidden',
            zIndex: 1100,
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef1f6' }}>
            {name && (
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {name}
              </div>
            )}
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {email}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
