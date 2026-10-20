import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Notificacao } from '../lib/tipos'
import { dataHora } from '../lib/util'
import { Carregando, Titulo, Vazio } from '../componentes/ui'

export function Notificacoes() {
  const nav = useNavigate()
  const [lista, setLista] = useState<Notificacao[] | null>(null)
  const [soNaoLidas, setSoNaoLidas] = useState(false)

  useEffect(() => {
    let q = supabase.from('notificacao').select('*').order('criado_em', { ascending: false }).limit(200)
    if (soNaoLidas) q = q.is('lida_em', null)
    q.then(({ data }) => setLista((data ?? []) as Notificacao[]))
  }, [soNaoLidas])

  async function abrir(n: Notificacao) {
    if (!n.lida_em) await supabase.from('notificacao').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
    if (n.link) nav(n.link)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Titulo acoes={
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} /> Só não lidas
        </label>
      }>Notificações</Titulo>
      {lista === null ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhuma notificação.</Vazio> : (
        <div className="painel divide-y divide-slate-100">
          {lista.map((n) => (
            <button key={n.id} onClick={() => abrir(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.lida_em ? '' : 'bg-indigo-50/40'}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lida_em ? 'bg-transparent' : 'bg-indigo-600'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{n.titulo}</div>
                {n.corpo && <div className="text-sm text-slate-600">{n.corpo}</div>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{dataHora(n.criado_em)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
