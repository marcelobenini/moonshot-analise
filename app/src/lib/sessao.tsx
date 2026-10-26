import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { manterConectado, supabase } from './supabase'
import type { Etapa, Funil, Perfil } from './tipos'

interface Sessao {
  carregando: boolean
  sessao: Session | null
  eu: Perfil | null
  equipe: Perfil[]
  funis: Funil[]
  etapas: Etapa[]
  nomeDe: (id: string | null | undefined) => string
  podeEditar: (funilId: string) => boolean
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Ctx = createContext<Sessao | null>(null)

// Sem uso por 60 minutos, a sessao cai: a ficha tem dado pessoal e relato
// sigiloso, e o computador pode ser compartilhado. Quem marca "manter
// conectado" no login (computador proprio) cai so depois de 30 dias parado.
// A ultima atividade fica no localStorage para valer entre abas.
const inatividadeMs = () => (manterConectado() ? 30 * 24 : 1) * 60 * 60 * 1000
const CHAVE_ATIVIDADE = 'moonshot.ultima_atividade'
export const CHAVE_SAIU = 'moonshot.saiu_por_inatividade'

function lerAtividade() {
  try { return Number(localStorage.getItem(CHAVE_ATIVIDADE)) || Date.now() } catch { return Date.now() }
}
function marcarAtividade() {
  try { localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now())) } catch { /* sem storage: vale so a aba */ }
}

// Equipe, funis e etapas mudam pouco e aparecem em toda tela: carregam uma vez
// na entrada e ficam aqui, em vez de cada pagina buscar de novo.
export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [sessao, setSessao] = useState<Session | null>(null)
  const [eu, setEu] = useState<Perfil | null>(null)
  const [equipe, setEquipe] = useState<Perfil[]>([])
  const [funis, setFunis] = useState<Funil[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])

  const carregar = useCallback(async (s: Session | null) => {
    setSessao(s)
    if (!s) {
      setEu(null); setEquipe([]); setFunis([]); setEtapas([])
      setCarregando(false)
      return
    }
    const [p, f, e] = await Promise.all([
      supabase.from('perfil').select('*').order('nome'),
      supabase.from('funil').select('*').order('ordem'),
      supabase.from('etapa').select('*').order('ordem'),
    ])
    const perfis = (p.data ?? []) as Perfil[]
    setEquipe(perfis)
    setEu(perfis.find((x) => x.id === s.user.id) ?? null)
    setFunis((f.data ?? []) as Funil[])
    setEtapas((e.data ?? []) as Etapa[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => carregar(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') carregar(s)
    })
    return () => data.subscription.unsubscribe()
  }, [carregar])

  useEffect(() => {
    if (!sessao) return
    let ultima = 0
    const ativo = () => {
      const agora = Date.now()
      if (agora - ultima > 30000) { ultima = agora; marcarAtividade() }
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove']
    // Voltar depois de horas com a aba aberta: confere antes de contar como uso.
    const conferir = () => {
      if (Date.now() - lerAtividade() > inatividadeMs()) {
        try { sessionStorage.setItem(CHAVE_SAIU, '1') } catch { /* ok */ }
        supabase.auth.signOut()
      }
    }
    conferir()
    marcarAtividade()
    eventos.forEach((e) => window.addEventListener(e, ativo, { passive: true }))
    document.addEventListener('visibilitychange', conferir)
    const t = setInterval(conferir, 60000)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, ativo))
      document.removeEventListener('visibilitychange', conferir)
      clearInterval(t)
    }
  }, [sessao])

  const valor = useMemo<Sessao>(() => ({
    carregando, sessao, eu, equipe, funis, etapas,
    nomeDe: (id) => (id ? equipe.find((p) => p.id === id)?.nome ?? 'ninguém' : 'ninguém'),
    podeEditar: (funilId) => {
      if (!eu?.papel) return false
      if (eu.papel === 'coordenador') return true
      return funis.find((f) => f.id === funilId)?.papeis_editam.includes(eu.papel) ?? false
    },
    recarregar: () => carregar(sessao),
    sair: async () => { await supabase.auth.signOut() },
  }), [carregando, sessao, eu, equipe, funis, etapas, carregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSessao() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}
