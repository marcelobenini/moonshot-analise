import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Clock, Search, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Etapa } from '../lib/tipos'
import { data, diasDesde, mensagemErro, reais } from '../lib/util'
import { Carregando, Erro, Modal, Campo, Vazio } from '../componentes/ui'
import { CardGaveta, NovoCard } from './CardGaveta'

type CardComAluna = Card & { aluna: Pick<Aluna, 'id' | 'nome' | 'produto' | 'saude' | 'faturamento_mensal'> | null }

export function Funis() {
  const { funis, etapas, nomeDe, podeEditar, eu } = useSessao()
  const { funilId } = useParams()
  const [busca] = useSearchParams()
  const nav = useNavigate()
  const funil = funis.find((f) => f.id === funilId) ?? null

  useEffect(() => {
    if (!funilId && funis.length) nav(`/funis/${funis[0].id}`, { replace: true })
  }, [funilId, funis, nav])

  const colunas = useMemo(() => etapas.filter((e) => e.funil_id === funilId), [etapas, funilId])
  const [cards, setCards] = useState<CardComAluna[] | null>(null)
  const [verFechados, setVerFechados] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [soMeus, setSoMeus] = useState(false)
  const [porMes, setPorMes] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<Etapa | null>(null)
  const [pedeMotivo, setPedeMotivo] = useState<{ card: CardComAluna; etapa: Etapa } | null>(null)
  const aberto = Number(busca.get('card')) || null

  const carregar = useCallback(async () => {
    if (!funilId) return
    let q = supabase.from('card').select('*, aluna(id, nome, produto, saude, faturamento_mensal)').eq('funil_id', funilId)
    if (!verFechados) q = q.is('fechado_em', null)
    else q = q.or(`fechado_em.is.null,fechado_em.gte.${new Date(Date.now() - 30 * 86400000).toISOString()}`)
    const { data: d, error } = await q.order('posicao')
    if (error) setErro(mensagemErro(error))
    setCards((d ?? []) as CardComAluna[])
  }, [funilId, verFechados])

  useEffect(() => { setCards(null); carregar() }, [carregar])

  // Outro usuario moveu um card: o quadro se atualiza sozinho.
  useEffect(() => {
    if (!funilId) return
    const canal = supabase.channel('funil-' + funilId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card', filter: `funil_id=eq.${funilId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [funilId, carregar])

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const editavel = funil ? podeEditar(funil.id) : false

  async function mover(card: CardComAluna, etapa: Etapa, motivo?: string) {
    if (card.etapa_id === etapa.id) return
    if (etapa.exige_motivo && !motivo) { setPedeMotivo({ card, etapa }); return }
    setErro(null)
    const antes = cards
    setCards((cs) => cs?.map((c) => (c.id === card.id ? { ...c, etapa_id: etapa.id, motivo: motivo ?? c.motivo } : c)) ?? null)
    const { error } = await supabase.from('card').update({ etapa_id: etapa.id, ...(motivo ? { motivo } : {}) }).eq('id', card.id)
    if (error) { setErro(mensagemErro(error)); setCards(antes) }
    carregar()
  }

  function soltar(e: DragEndEvent) {
    const card = cards?.find((c) => c.id === e.active.id)
    const etapa = colunas.find((x) => x.id === e.over?.id)
    if (card && etapa) mover(card, etapa)
  }

  const visiveis = (cards ?? []).filter((c) => {
    if (soMeus && c.responsavel_id !== eu?.id) return false
    if (!filtro) return true
    const t = filtro.toLowerCase()
    return c.titulo.toLowerCase().includes(t) || nomeDe(c.responsavel_id).toLowerCase().includes(t)
  })

  if (!funis.length) return <Vazio>Seu perfil ainda não tem acesso a nenhum funil.</Vazio>
  if (!funil) return <Carregando />

  return (
    <div>
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 sm:inline-flex">
          {funis.map((f) => (
            <button key={f.id} onClick={() => nav(`/funis/${f.id}`)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${f.id === funilId ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              {f.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="entrada pl-9" placeholder="Filtrar cards" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} /> Só os meus
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={verFechados} onChange={(e) => setVerFechados(e.target.checked)} /> Fechados nos últimos 30 dias
        </label>
        {funil.id === 'renovacao' && (
          <button className={porMes ? 'btn-primario' : 'btn-secundario'} onClick={() => setPorMes(!porMes)}>
            <CalendarDays size={16} /> Por mês de vencimento
          </button>
        )}
        {editavel && colunas[0] && (
          <button className="btn-primario ml-auto" onClick={() => setNovo(colunas[0])}><Plus size={16} /> Novo card</button>
        )}
      </div>
      {funil.descricao && <p className="mb-3 text-sm text-slate-500">{funil.descricao}</p>}
      <Erro msg={erro} />

      {cards === null ? <Carregando /> : porMes ? (
        <PorMes cards={visiveis} abrir={(id) => nav(`?card=${id}`)} />
      ) : (
        <DndContext sensors={sensores} onDragEnd={soltar}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            {colunas.map((etapa) => {
              const doEtapa = visiveis.filter((c) => c.etapa_id === etapa.id)
              return (
                <Coluna key={etapa.id} etapa={etapa} total={doEtapa.length}
                  soma={doEtapa.reduce((s, c) => s + Number(c.valor ?? 0), 0)}
                  podeCriar={editavel && etapa.tipo === 'aberta'} criar={() => setNovo(etapa)}>
                  {doEtapa.map((c) => (
                    <CartaoArrastavel key={c.id} card={c} etapa={etapa} arrastavel={editavel}
                      responsavel={nomeDe(c.responsavel_id)} abrir={() => nav(`?card=${c.id}`)} />
                  ))}
                </Coluna>
              )
            })}
          </div>
        </DndContext>
      )}

      {aberto && (
        <CardGaveta id={aberto} fechar={() => nav(`/funis/${funil.id}`)} mudou={carregar} />
      )}
      {novo && <NovoCard funil={funil} etapa={novo} fechar={() => setNovo(null)} criado={(id) => { setNovo(null); carregar(); nav(`?card=${id}`) }} />}
      {pedeMotivo && (
        <PedirMotivo etapa={pedeMotivo.etapa} opcoes={funil.motivos} fechar={() => setPedeMotivo(null)}
          confirmar={(m) => { const p = pedeMotivo; setPedeMotivo(null); mover(p.card, p.etapa, m) }} />
      )}
    </div>
  )
}

function Coluna({ etapa, total, soma, podeCriar, criar, children }: {
  etapa: Etapa; total: number; soma: number; podeCriar: boolean; criar: () => void; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const cor = etapa.tipo === 'ganha' ? 'border-t-emerald-500' : etapa.tipo === 'perdida' ? 'border-t-slate-400' : 'border-t-indigo-500'
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-xl border border-t-4 border-slate-200 ${cor} ${isOver ? 'bg-indigo-50' : 'bg-slate-100/70'}`}>
      <div className="flex items-start justify-between px-3 pb-2 pt-2.5">
        <div>
          <div className="text-sm font-semibold">{etapa.nome}</div>
          <div className="text-xs text-slate-500">
            {total} {total === 1 ? 'card' : 'cards'}{soma > 0 && ` · ${reais(soma)}`}
            {etapa.alerta_dias != null && ` · alerta ${etapa.alerta_dias}d`}
          </div>
        </div>
        {podeCriar && <button className="btn-fantasma p-1" onClick={criar} aria-label="Novo card nesta etapa"><Plus size={16} /></button>}
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
    </div>
  )
}

function CartaoArrastavel({ card, etapa, arrastavel, responsavel, abrir }: {
  card: CardComAluna; etapa: Etapa; arrastavel: boolean; responsavel: string; abrir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !arrastavel })
  const estilo = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const parado = diasDesde(card.etapa_desde)
  const atrasado = etapa.alerta_dias != null && !card.fechado_em && parado > etapa.alerta_dias
  return (
    <div ref={setNodeRef} style={estilo} {...attributes} {...listeners} onClick={abrir}
      className={`cursor-pointer rounded-lg border bg-white p-3 text-sm shadow-sm hover:border-indigo-300 ${isDragging ? 'z-50 rotate-1 shadow-lg' : ''} ${atrasado ? 'border-red-300' : 'border-slate-200'} ${card.fechado_em ? 'opacity-60' : ''}`}>
      <div className="font-medium leading-snug">{card.titulo}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {card.aluna?.produto && <span>{card.aluna.produto}</span>}
        {card.valor != null && <span>{reais(card.valor)}</span>}
        {card.prazo && <span>prazo {data(card.prazo)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="truncate text-slate-600">{responsavel}</span>
        <span className={`flex items-center gap-1 ${atrasado ? 'font-medium text-red-600' : 'text-slate-400'}`}>
          <Clock size={12} /> {parado}d
        </span>
      </div>
    </div>
  )
}

function PorMes({ cards, abrir }: { cards: CardComAluna[]; abrir: (id: number) => void }) {
  const { etapas, nomeDe } = useSessao()
  const grupos = new Map<string, CardComAluna[]>()
  for (const c of [...cards].sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''))) {
    const m = c.prazo?.slice(0, 7) ?? 'sem data'
    grupos.set(m, [...(grupos.get(m) ?? []), c])
  }
  if (!grupos.size) return <Vazio>Nenhum card.</Vazio>
  return (
    <div className="space-y-4">
      {[...grupos].map(([mes, cs]) => (
        <div key={mes} className="painel overflow-hidden">
          <div className="flex justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold">
            <span>{mes === 'sem data' ? mes : new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
            <span className="text-slate-500">{cs.length} contratos · {reais(cs.reduce((s, c) => s + Number(c.aluna?.faturamento_mensal ?? 0), 0))}/mês</span>
          </div>
          {cs.map((c) => (
            <button key={c.id} onClick={() => abrir(c.id)} className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <span className="font-medium">{c.titulo}</span>
              <span className="flex gap-3 text-xs text-slate-500">
                <span>{etapas.find((e) => e.id === c.etapa_id)?.nome}</span>
                <span>{nomeDe(c.responsavel_id)}</span>
                <span>{data(c.prazo)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function PedirMotivo({ etapa, opcoes, fechar, confirmar }: {
  etapa: Etapa; opcoes: string[]; fechar: () => void; confirmar: (m: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [outro, setOutro] = useState('')
  const final = motivo === 'Outro' || !opcoes.length ? outro.trim() : motivo
  return (
    <Modal titulo={`Mover para "${etapa.nome}"`} aberto fechar={fechar}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Esta etapa exige motivo — é o que permite medir depois por que se perde.</p>
        {opcoes.length > 0 && (
          <Campo rotulo="Motivo">
            <select className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus>
              <option value="">Escolha…</option>
              {opcoes.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Campo>
        )}
        {(motivo === 'Outro' || !opcoes.length) && (
          <Campo rotulo="Descreva">
            <input className="entrada" value={outro} onChange={(e) => setOutro(e.target.value)} />
          </Campo>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={!final} onClick={() => confirmar(motivo === 'Outro' ? `Outro: ${final}` : final)}>Mover</button>
        </div>
      </div>
    </Modal>
  )
}
