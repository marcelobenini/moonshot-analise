import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && chave)

// "Manter conectado": a sessao fica no localStorage e sobrevive a fechar o
// navegador. Desmarcado, fica no sessionStorage e some junto com a janela.
const CHAVE_MANTER = 'moonshot.manter_conectado'

export function manterConectado() {
  try { return localStorage.getItem(CHAVE_MANTER) === '1' } catch { return false }
}
export function definirManterConectado(sim: boolean) {
  try { if (sim) localStorage.setItem(CHAVE_MANTER, '1'); else localStorage.removeItem(CHAVE_MANTER) } catch { /* sem storage */ }
}

function guardado(): Storage | null {
  try { return manterConectado() ? localStorage : sessionStorage } catch { return null }
}
function outro(): Storage | null {
  try { return manterConectado() ? sessionStorage : localStorage } catch { return null }
}

const armazenamento = {
  getItem: (k: string) => guardado()?.getItem(k) ?? null,
  setItem: (k: string, v: string) => { guardado()?.setItem(k, v); outro()?.removeItem(k) },
  removeItem: (k: string) => { localStorage.removeItem(k); sessionStorage.removeItem(k) },
}

export const supabase = createClient(url ?? 'http://localhost', chave ?? 'sem-chave', {
  auth: { storage: armazenamento, persistSession: true, detectSessionInUrl: true },
})

// Quais logins externos estao ligados no painel do Supabase. O botao do
// Google so aparece depois que a coordenacao liga o provedor.
export async function provedoresLigados(): Promise<{ google: boolean }> {
  if (!configurado) return { google: false }
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave! } })
    const j = await r.json()
    return { google: Boolean(j?.external?.google) }
  } catch { return { google: false } }
}
