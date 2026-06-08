/**
 * src/auth/AuthContext.tsx
 * Exposes the Supabase session to React as auth *state*.
 *
 * Important: this context does NOT store the credential — the Supabase
 * client owns tokens (httpOnly-style handling + refresh). React just
 * mirrors "who is logged in" so components can render accordingly.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { clearTeamCache } from '../services/teamService'

const POST_LOGIN_KEY = 'mapdoc:postLoginRedirect'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithGoogle: (redirectPath?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Hydrate from any persisted session on first load.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // 2. Stay in sync with sign-in / sign-out / token-refresh events.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (redirectPath = '/canvas') => {
    // Remember where to land after the round-trip to Google. Stored in
    // sessionStorage (not the URL) so it survives Supabase rewriting the
    // callback URL while exchanging the OAuth code.
    sessionStorage.setItem(POST_LOGIN_KEY, redirectPath)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }

  const signOut = async () => {
    clearTeamCache()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export { POST_LOGIN_KEY }
