import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSessao } from './sessao'

// Filtro por consultor: quem tem acesso ao sistema (pelo perfil) e quem só
// existe pelo nome da planilha (Vinícius, Mell…), mais "sem consultor".
export interface OpcaoConsultor { valor: string; rotulo: string }

export function useConsultores(): OpcaoConsultor[] {
  const { equipe } = useSessao()
  const [planilha, setPlanilha] = useState<string[]>([])
  useEffect(() => {
    supabase.from('aluna').select('consultor_planilha').is('consultor_id', null).not('consultor_planilha', 'is', null).limit(2000)
      .then(({ data: d }) => {
        const nomes = new Set(((d ?? []) as { consultor_planilha: string }[]).map((x) => x.consultor_planilha.trim()).filter(Boolean))
        setPlanilha([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')))
      })
  }, [])
  const comAcesso = equipe.filter((p) => p.ativo && (p.papel === 'consultor' || p.papel === 'coordenador'))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p) => ({ valor: `id:${p.id}`, rotulo: p.nome }))
  const semAcesso = planilha.filter((n) => !comAcesso.some((c) => c.rotulo.toLowerCase() === n.toLowerCase()))
    .map((n) => ({ valor: `nome:${n}`, rotulo: `${n} (sem acesso)` }))
  return [...comAcesso, ...semAcesso, { valor: 'sem', rotulo: 'Sem consultor' }]
}

/** Aplica o filtro de consultor numa consulta de `aluna`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filtrarConsultor<Q>(q: Q, valor: string): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = q as any
  if (!valor) return q
  if (valor === 'sem') return b.is('consultor_id', null).is('consultor_planilha', null)
  if (valor.startsWith('id:')) return b.eq('consultor_id', valor.slice(3))
  if (valor.startsWith('nome:')) return b.is('consultor_id', null).eq('consultor_planilha', valor.slice(5))
  return q
}
