import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Notificacao } from '../lib/tipos'
import { ha } from '../lib/util'

export function Sino() {
  const { eu } = useSessao()
  const nav = useNavigate()
  const [lista, setLista] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase.from('notificacao').select('*').order('criado_em', { ascending: false }).limit(12),
      supabase.from('notificacao').select('id', { count: 'exact', head: true }).is('lida_em', null),
    ])
    setLista((data ?? []) as Notificacao[])
    setNaoLidas(count ?? 0)
  }, [])

  useEffect(() => {
    if (!eu) return
    carregar()
    // Tempo real: a notificacao aparece sem recarregar a pagina e, se a pessoa
    // permitiu, vira aviso do navegador mesmo com a aba em segundo plano.
    const canal = supabase.channel('notificacoes-' + eu.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacao', filter: `usuario_id=eq.${eu.id}` },
        (p) => {
          carregar()
          const n = p.new as Notificacao
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            const aviso = new Notification(n.titulo, { body: n.corpo ?? undefined, icon: '/icone.svg' })
            aviso.onclick = () => { window.focus(); if (n.link) nav(n.link) }
          }
        })
      .subscribe()
    // Sem tempo real configurado, ainda atualiza a cada minuto.
    const t = setInterval(carregar, 60000)
    return () => { supabase.removeChannel(canal); clearInterval(t) }
  }, [eu, carregar, nav])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function abrir(n: Notificacao) {
    setAberto(false)
    if (!n.lida_em) await supabase.from('notificacao').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
    carregar()
    if (n.link) nav(n.link)
  }

  async function lerTodas() {
    await supabase.from('notificacao').update({ lida_em: new Date().toISOString() }).is('lida_em', null)
    carregar()
  }

  const podePedirPermissao = 'Notification' in window && Notification.permission === 'default'

  return (
    <div className="relative" ref={caixa}>
      <button className="btn-fantasma relative p-2" onClick={() => setAberto(!aberto)} aria-label="Notificações">
        <Bell size={20} />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">Notificações</span>
            {naoLidas > 0 && (
              <button className="flex items-center gap-1 text-xs text-indigo-600 hover:underline" onClick={lerTodas}>
                <CheckCheck size={14} /> Marcar todas como lidas
              </button>
            )}
          </div>
          {podePedirPermissao && (
            <button className="w-full bg-indigo-50 px-4 py-2 text-left text-xs text-indigo-700 hover:bg-indigo-100"
              onClick={() => Notification.requestPermission()}>
              Ativar avisos do navegador para não perder nada
            </button>
          )}
          <div className="max-h-96 overflow-y-auto">
            {lista.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Nada por aqui.</div>}
            {lista.map((n) => (
              <button key={n.id} onClick={() => abrir(n)}
                className={`block w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50 ${n.lida_em ? '' : 'bg-indigo-50/40'}`}>
                <div className="flex items-start gap-2">
                  {!n.lida_em && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{n.titulo}</div>
                    {n.corpo && <div className="truncate text-xs text-slate-600">{n.corpo}</div>}
                    <div className="mt-0.5 text-[11px] text-slate-400">{ha(n.criado_em)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button className="block w-full px-4 py-2 text-center text-xs font-medium text-indigo-600 hover:bg-slate-50"
            onClick={() => { setAberto(false); nav('/notificacoes') }}>
            Ver todas
          </button>
        </div>
      )}
    </div>
  )
}
