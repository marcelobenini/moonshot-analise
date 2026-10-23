import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Clock, Search, CalendarDays, ChevronDown, Columns3, List, Flag, Layers, MoreHorizontal, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Etapa } from '../lib/tipos'
import { SAUDE, data, diasDesde, hoje, mensagemErro, reais } from '../lib/util'
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
  const [visao, setVisao] = useState<'kanban' | 'lista' | 'mes'>('kanban')
  const [escolherFunil, setEscolherFunil] = useState(false)
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
  useEffect(() => { if (funilId !== 'renovacao') setVisao((v) => (v === 'mes' ? 'kanban' : v)) }, [funilId])

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

  const abasVisao = [
    { id: 'kanban' as const, rotulo: 'Kanban', icone: Columns3 },
    { id: 'lista' as const, rotulo: 'Lista', icone: List },
    ...(funil.id === 'renovacao' ? [{ id: 'mes' as const, rotulo: 'Por mês de vencimento', icone: CalendarDays }] : []),
  ]

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      {/* Barra do funil: qual funil, como ver, filtros. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="relative py-2">
          <button className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50" onClick={() => setEscolherFunil(!escolherFunil)}>
            <span className="font-display text-2xl font-semibold text-noite">{funil.nome}</span>
            <span className="rounded-md bg-indigo-50 p-0.5 text-indigo-700"><ChevronDown size={16} /></span>
          </button>
          {escolherFunil && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setEscolherFunil(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                {funis.map((f) => (
                  <button key={f.id} onClick={() => { setEscolherFunil(false); nav(`/funis/${f.id}`) }}
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${f.id === funilId ? 'font-medium text-indigo-700' : 'text-slate-700'}`}>
                    {f.nome}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <nav className="flex items-stretch gap-4 self-stretch">
          {abasVisao.map(({ id, rotulo, icone: I }) => (
            <button key={id} onClick={() => setVisao(id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 text-sm ${visao === id ? 'border-indigo-500 font-medium text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              <I size={15} /> {rotulo}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 py-2">
          <div className="relative w-52">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input className="entrada py-1.5 pl-9" placeholder="Buscar card" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} /> Só os meus
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={verFechados} onChange={(e) => setVerFechados(e.target.checked)} /> Fechados (30 dias)
          </label>
          {editavel && colunas[0] && (
            <button className="btn-primario py-1.5" onClick={() => setNovo(colunas[0])}><Plus size={16} /> Novo card</button>
          )}
        </div>
      </div>
      {funil.descricao && <p className="px-4 pt-3 text-xs text-slate-500 sm:px-6">{funil.descricao}</p>}
      {erro && <div className="px-4 pt-3 sm:px-6"><Erro msg={erro} /></div>}

      {cards === null ? <Carregando /> : visao === 'mes' ? (
        <div className="p-4 sm:p-6"><PorMes cards={visiveis} abrir={(id) => nav(`?card=${id}`)} /></div>
      ) : visao === 'lista' ? (
        <div className="p-4 sm:p-6"><Lista cards={visiveis} colunas={colunas} abrir={(id) => nav(`?card=${id}`)} /></div>
      ) : (
        <DndContext sensors={sensores} onDragEnd={soltar}>
          <div className="flex h-[calc(100vh-9.5rem)] gap-3 overflow-x-auto px-4 pb-3 pt-3 sm:px-6">
            {colunas.map((etapa) => {
              const doEtapa = visiveis.filter((c) => c.etapa_id === etapa.id)
              return (
                <Coluna key={etapa.id} etapa={etapa} total={doEtapa.length}
                  soma={doEtapa.reduce((s, c) => s + Number(c.valor ?? 0), 0)}
                  parados={doEtapa.filter((c) => etapa.alerta_dias != null && !c.fechado_em && diasDesde(c.etapa_desde) > etapa.alerta_dias).length}
                  podeCriar={editavel && etapa.tipo === 'aberta'} criar={() => setNovo(etapa)}>
                  {doEtapa.map((c) => (
                    <CartaoArrastavel key={c.id} card={c} etapa={etapa} arrastavel={editavel}
                      responsavel={c.responsavel_id ? nomeDe(c.responsavel_id) : null} abrir={() => nav(`?card=${c.id}`)} />
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

function Coluna({ etapa, total, soma, parados, podeCriar, criar, children }: {
  etapa: Etapa; total: number; soma: number; parados: number; podeCriar: boolean; criar: () => void; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  // Etapa final (ganha/perdida) fica num tom mais fechado, como coluna "arquivada".
  const fundo = isOver ? 'bg-indigo-100/70 ring-2 ring-indigo-300' : etapa.tipo === 'aberta' ? 'bg-slate-200/50' : 'bg-slate-300/55'
  return (
    <div ref={setNodeRef} className={`flex h-full w-[17.5rem] shrink-0 flex-col rounded-xl ${fundo}`}>
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold text-slate-700">{etapa.nome}</div>
          <span className="flex items-center gap-1">
            {etapa.tipo === 'ganha' && <span className="selo bg-emerald-100 text-emerald-800">ganha</span>}
            {etapa.tipo === 'perdida' && <span className="selo bg-slate-200 text-slate-600">perdida</span>}
            <MoreHorizontal size={16} className="text-slate-400" />
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1" title="Cards"><Layers size={12} /> {total}</span>
          {soma > 0 && <span className="flex items-center gap-1" title="Valor somado"><Wallet size={12} /> {reais(soma)}</span>}
          {etapa.alerta_dias != null && (
            <span className={`flex items-center gap-1 ${parados ? 'font-medium text-red-600' : ''}`} title={`Alerta depois de ${etapa.alerta_dias} dias na etapa`}>
              <Clock size={12} /> {parados ? `${parados} parado${parados > 1 ? 's' : ''}` : `${etapa.alerta_dias}d`}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
      {podeCriar && (
        <button onClick={criar} className="flex items-center gap-1.5 px-4 py-2.5 text-left text-xs font-medium text-indigo-700 hover:text-indigo-900">
          <Plus size={14} /> Adicionar card
        </button>
      )}
    </div>
  )
}

// Cor da etiqueta do card: o produto da aluna, para bater o olho no quadro.
const COR_PRODUTO: Record<string, string> = {
  'Moonshot Club': 'bg-sky-400', 'Moonshot Pró': 'bg-indigo-400', 'Moonshot Elite': 'bg-amber-500',
  'Moonshot Private': 'bg-noite', 'Moonshot In Company': 'bg-violet-400', 'Máquina de Vendas': 'bg-emerald-500',
}

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome.split(/\s+/).filter((p) => !/^(da|de|do|dos|das|e|\(.*)$/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <span title={nome} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-noite text-[10px] font-semibold text-indigo-200 ring-2 ring-white">
      {iniciais || '?'}
    </span>
  )
}

function CartaoArrastavel({ card, etapa, arrastavel, responsavel, abrir }: {
  card: CardComAluna; etapa: Etapa; arrastavel: boolean; responsavel: string | null; abrir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !arrastavel })
  const estilo = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const parado = diasDesde(card.etapa_desde)
  const atrasado = etapa.alerta_dias != null && !card.fechado_em && parado > etapa.alerta_dias
  const h = hoje()
  const prazoVencido = !!card.prazo && card.prazo < h && !card.fechado_em
  // Barra de tempo na etapa: quanto do prazo de alerta ja foi usado.
  const uso = etapa.alerta_dias ? Math.min(1, parado / etapa.alerta_dias) : null
  const saude = card.aluna?.saude ? SAUDE[card.aluna.saude] : null
  return (
    <div ref={setNodeRef} style={estilo} {...attributes} {...listeners} onClick={abrir}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border text-sm shadow-[0_1px_2px_rgba(20,17,16,0.08)] transition hover:shadow-md
        ${atrasado || prazoVencido ? 'border-red-200 bg-red-50' : 'border-slate-200/70 bg-white'}
        ${isDragging ? 'z-50 rotate-2 shadow-xl' : ''} ${card.fechado_em ? 'opacity-60' : ''}`}>
      <div className="p-3 pb-2.5">
        <div className="flex items-center justify-between">
          <span className={`h-1 w-6 rounded-full ${COR_PRODUTO[card.aluna?.produto ?? ''] ?? 'bg-slate-300'}`} title={card.aluna?.produto ?? ''} />
          <MoreHorizontal size={15} className="text-slate-400 opacity-0 transition group-hover:opacity-100" />
        </div>
        <div className="mt-2 font-semibold leading-snug text-slate-800">{card.titulo}</div>
        {(card.aluna?.produto || card.valor != null) && (
          <div className="mt-0.5 text-xs text-slate-500">{[card.aluna?.produto, card.valor != null && reais(card.valor)].filter(Boolean).join(' · ')}</div>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {responsavel ? <Avatar nome={responsavel} /> : <span className="h-6 w-6 rounded-full border border-dashed border-slate-300" title="Sem responsável" />}
            {saude && <span className={`selo ${saude.cor}`}>{saude.rotulo}</span>}
          </div>
          {card.prazo && (
            <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${prazoVencido ? 'text-red-600' : 'text-indigo-700'}`}>
              {new Date(card.prazo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
              <Flag size={13} className={prazoVencido ? 'fill-red-500 text-red-500' : 'text-slate-400'} />
            </span>
          )}
        </div>
        <div className={`mt-2 flex items-center gap-1 text-[11px] ${atrasado ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
          <Clock size={11} /> {parado === 0 ? 'entrou hoje' : `${parado} ${parado === 1 ? 'dia' : 'dias'} na etapa`}
        </div>
      </div>
      {uso != null && !card.fechado_em && (
        <div className="h-[3px] bg-slate-100">
          <div className={`h-full ${atrasado ? 'bg-red-500' : uso > 0.7 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.max(uso, 0.04) * 100}%` }} />
        </div>
      )}
    </div>
  )
}

function Lista({ cards, colunas, abrir }: { cards: CardComAluna[]; colunas: Etapa[]; abrir: (id: number) => void }) {
  const { nomeDe } = useSessao()
  if (!cards.length) return <Vazio>Nenhum card.</Vazio>
  const ordem = new Map(colunas.map((e, i) => [e.id, i]))
  const linhas = [...cards].sort((a, b) => (ordem.get(a.etapa_id) ?? 0) - (ordem.get(b.etapa_id) ?? 0))
  return (
    <div className="painel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-2.5">Card</th><th className="px-4 py-2.5">Etapa</th><th className="px-4 py-2.5">Responsável</th>
            <th className="px-4 py-2.5">Prazo</th><th className="px-4 py-2.5">Na etapa</th><th className="px-4 py-2.5 text-right">Valor</th></tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const e = colunas.find((x) => x.id === c.etapa_id)
            const parado = diasDesde(c.etapa_desde)
            const atrasado = e?.alerta_dias != null && !c.fechado_em && parado > e.alerta_dias
            return (
              <tr key={c.id} onClick={() => abrir(c.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5"><div className="font-medium">{c.titulo}</div><div className="text-xs text-slate-500">{c.aluna?.produto}</div></td>
                <td className="px-4 py-2.5">{e?.nome}</td>
                <td className="px-4 py-2.5">{c.responsavel_id ? nomeDe(c.responsavel_id) : <span className="text-slate-400">—</span>}</td>
                <td className={`px-4 py-2.5 ${c.prazo && c.prazo < hoje() ? 'font-medium text-red-600' : ''}`}>{data(c.prazo)}</td>
                <td className={`px-4 py-2.5 ${atrasado ? 'font-medium text-red-600' : 'text-slate-600'}`}>{parado}d</td>
                <td className="px-4 py-2.5 text-right">{c.valor != null ? reais(c.valor) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
