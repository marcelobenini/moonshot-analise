import { useEffect, useState, type ReactNode } from 'react'
import { X, Loader2, Flame, Snowflake, Thermometer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Papel } from '../lib/tipos'
import { PAPEL } from '../lib/util'

export function Modal({ titulo, aberto, fechar, children, largo }: {
  titulo: string; aberto: boolean; fechar: () => void; children: ReactNode; largo?: boolean
}) {
  useEsc(aberto, fechar)
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={fechar}>
      <div className={`painel w-full ${largo ? 'max-w-2xl' : 'max-w-lg'} shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button className="btn-fantasma -mr-2 p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Gaveta({ aberto, fechar, children }: { aberto: boolean; fechar: () => void; children: ReactNode }) {
  useEsc(aberto, fechar)
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={fechar}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function useEsc(ativo: boolean, fn: () => void) {
  useEffect(() => {
    if (!ativo) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [ativo, fn])
}

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  )
}

export function Selo({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={`selo ${cor}`}>{children}</span>
}

export function Carregando() {
  return <div className="flex justify-center p-10 text-slate-400"><Loader2 className="animate-spin" /></div>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>
}

export function Erro({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>
}

export function Titulo({ children, acoes }: { children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-noite sm:text-3xl">{children}</h1>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

/** Escolha de alguem da equipe, opcionalmente so de alguns papeis. */
export function EscolherPessoa({ valor, mudar, papeis, vazio = 'Ninguém' }: {
  valor: string | null; mudar: (id: string | null) => void; papeis?: Papel[]; vazio?: string
}) {
  const { equipe } = useSessao()
  const lista = equipe.filter((p) => p.ativo && (!papeis || (p.papel && papeis.includes(p.papel))))
  return (
    <select className="entrada" value={valor ?? ''} onChange={(e) => mudar(e.target.value || null)}>
      <option value="">{vazio}</option>
      {lista.map((p) => (
        <option key={p.id} value={p.id}>{p.nome}{p.papel ? ` · ${PAPEL[p.papel]}` : ''}</option>
      ))}
    </select>
  )
}

/** Busca de aluna por nome, e-mail ou telefone. */
export function EscolherAluna({ valor, mudar }: { valor: Aluna | null; mudar: (a: Aluna | null) => void }) {
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<Aluna[]>([])
  useEffect(() => {
    if (termo.trim().length < 2) { setLista([]); return }
    const t = setTimeout(async () => {
      const q = termo.trim().replace(/[%,()]/g, ' ')
      const { data } = await supabase.from('aluna').select('*')
        .or(`nome.ilike.%${q}%,email.ilike.%${q}%,telefone.ilike.%${q}%`).order('nome').limit(8)
      setLista((data ?? []) as Aluna[])
    }, 250)
    return () => clearTimeout(t)
  }, [termo])

  if (valor) {
    return (
      <div className="entrada flex items-center justify-between">
        <span>{valor.nome}</span>
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => mudar(null)} aria-label="Trocar"><X size={16} /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input className="entrada" placeholder="Digite o nome, e-mail ou telefone" value={termo} onChange={(e) => setTermo(e.target.value)} />
      {lista.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {lista.map((a) => (
            <button type="button" key={a.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => { mudar(a); setTermo(''); setLista([]) }}>
              <div className="font-medium">{a.nome}</div>
              <div className="text-xs text-slate-500">{[a.produto, a.turma, a.email].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Pontuacao de potencial (0 a 100): fogo quente, termometro morno, floco frio. */
export function Potencial({ pontos, grande }: { pontos: number | null | undefined; grande?: boolean }) {
  if (pontos == null) return null
  const faixa = pontos >= 70 ? 'quente' : pontos >= 40 ? 'morno' : 'frio'
  const I = faixa === 'quente' ? Flame : faixa === 'morno' ? Thermometer : Snowflake
  const cor = faixa === 'quente' ? 'text-red-600' : faixa === 'morno' ? 'text-amber-700' : 'text-sky-600'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-mono font-medium ${cor} ${grande ? 'text-3xl' : 'text-sm'}`}
      title={`Potencial ${pontos} de 100 (${faixa})`}>
      <I size={grande ? 24 : 14} strokeWidth={2.2} /> {pontos}
    </span>
  )
}
