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
import ApiAccessModal from './ApiAccessModal'

/** Deterministic accent color from a string, so each user gets a stable hue. */
function colorFromString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`
}

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showApi, setShowApi] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
  const accent = colorFromString(email || name || 'user')

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <>
    {showApi && <ApiAccessModal onClose={() => setShowApi(false)} />}
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
        {avatarUrl ? (
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
            onClick={() => { setOpen(false); setShowApi(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderBottom: '1px solid #eef1f6',
              background: 'transparent',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
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
                d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            API access
          </button>
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
    </>
  )
}
