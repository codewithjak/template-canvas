/**
 * src/plan/PlanProvider.tsx
 *
 * App-wide plan/entitlement context. One GET /v1/usage on mount gives the
 * team's plan + usage; capabilities are derived from the client plan mirror
 * (src/config/plans.ts). Also owns the shared "Upgrade" modal so any gated
 * action can call promptUpgrade(...) without wiring its own dialog.
 *
 * The UI uses this to HIDE/BLOCK gated features for a nicer experience; the
 * server still enforces every limit independently.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getUsage, type UsageSummary } from '../services/apiIntegration'
import {
  PLANS,
  getPlan,
  planAllows,
  minPlanFor,
  type Capability,
  type PlanId,
  type PlanLimits,
} from '../config/plans'

interface UpgradePrompt {
  title: string
  message: string
  /** Plan to steer the user toward (defaults to the cheapest unlocking one). */
  target?: PlanId
}

interface PlanContextValue {
  plan: PlanId
  usage: UsageSummary | null
  loading: boolean
  can: (capability: Capability) => boolean
  limit: (key: keyof PlanLimits) => number | null
  /** True when a counted resource is at/over its plan limit. */
  atLimit: (key: 'templates' | 'exportsThisMonth' | 'aiBuildsThisMonth') => boolean
  refresh: () => Promise<void>
  promptUpgrade: (prompt: { capability?: Capability; title?: string; message?: string }) => void
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

export function PlanProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState<UpgradePrompt | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setUsage(await getUsage())
    } catch {
      // Backend unreachable / signed out → fall back to free. Server stays
      // the real gate, so a pessimistic default here is safe.
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const plan: PlanId = getPlan(usage?.plan).id

  const value = useMemo<PlanContextValue>(() => ({
    plan,
    usage,
    loading,
    can: (capability) => planAllows(plan, capability),
    limit: (key) => getPlan(plan).limits[key],
    atLimit: (key) => {
      const counter = usage?.[key]
      if (!counter) return false
      const { used, limit } = counter
      return limit != null && used >= limit
    },
    refresh,
    promptUpgrade: ({ capability, title, message }) => {
      const target = capability ? minPlanFor(capability) : null
      setPrompt({
        title: title ?? 'Upgrade to unlock this',
        message:
          message ??
          (target
            ? `This feature is included in the ${target.name} plan.`
            : 'This feature requires a paid plan.'),
        target: target?.id,
      })
    },
  }), [plan, usage, loading, refresh])

  return (
    <PlanContext.Provider value={value}>
      {children}
      {prompt && <UpgradeModal prompt={prompt} onClose={() => setPrompt(null)} />}
    </PlanContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used within <PlanProvider>')
  return ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared upgrade modal
// ─────────────────────────────────────────────────────────────────────────────

function UpgradeModal({ prompt, onClose }: { prompt: UpgradePrompt; onClose: () => void }) {
  const navigate = useNavigate()
  const target = prompt.target ? PLANS[prompt.target] : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(15,23,42,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: 28, width: 'min(440px, 100%)',
          boxShadow: '0 24px 60px rgba(15,23,42,.3)',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: '#eef2ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
            <path d="M11 2 5 11h5l-1 7 6-9h-5l1-7Z" fill="#4f46e5" />
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{prompt.title}</h2>
        <p style={{ margin: '8px 0 22px', fontSize: 14, lineHeight: 1.55, color: '#475569' }}>
          {prompt.message}
          {target && (
            <> {` `}<strong>{target.name}</strong> is ${target.price}/mo.</>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
              borderRadius: 9, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={() => { onClose(); navigate('/pricing') }}
            style={{
              border: 'none', background: '#4f46e5', color: '#fff',
              borderRadius: 9, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  )
}
