/**
 * src/account/useApiKey.ts
 *
 * Owns the team API-key state — the meta record plus issue / rotate / revoke —
 * so the Integrations page fetches it ONCE and both the API access section and
 * the Quickstart snippet read the same source (architecture doc §2.3). Lifted
 * from the key logic that lived inline in the old one-page Settings.
 */
import { useCallback, useEffect, useState } from 'react'
import { issueApiKey, getApiKeyMeta, revokeApiKey, type ApiKeyMeta } from '../services/apiIntegration'
import { confirm } from '../notify'

export interface ApiKeyState {
  meta: ApiKeyMeta | null
  /** The plaintext key, shown once right after issue/rotate; null otherwise. */
  freshKey: string | null
  loading: boolean
  busy: boolean
  error: string | null
  issue: () => Promise<void>
  revoke: () => Promise<void>
}

export function useApiKey(): ApiKeyState {
  const [meta, setMeta] = useState<ApiKeyMeta | null>(null)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setMeta(await getApiKeyMeta())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const issue = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const { apiKey } = await issueApiKey()
      setFreshKey(apiKey)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [load])

  const revoke = useCallback(async () => {
    if (!(await confirm({ message: 'apiKey.revokeConfirm', danger: true }))) return
    setBusy(true); setError(null)
    try {
      await revokeApiKey()
      setFreshKey(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [load])

  return { meta, freshKey, loading, busy, error, issue, revoke }
}
