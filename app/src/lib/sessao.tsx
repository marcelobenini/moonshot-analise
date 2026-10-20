import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
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

  const valor = useMemo<Sessao>(() => ({
    carregando, sessao, eu, equipe, funis, etapas,
    nomeDe: (id) => (id ? equipe.find((p) => p.id === id)?.nome ?? '—' : '—'),
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
