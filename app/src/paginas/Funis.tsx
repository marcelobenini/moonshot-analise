import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Clock, Search, CalendarDays, ChevronDown, Columns3, List } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Etapa } from '../lib/tipos'
import { SAUDE, data, diasDesde, hoje, mensagemErro, reais } from '../lib/util'
import { Carregando, Erro, Modal, Campo, Potencial, Vazio } from '../componentes/ui'
import { CardGaveta, NovoCard } from './CardGaveta'

type CardComAluna = Card & { aluna: Pick<Aluna, 'id' | 'nome' | 'produto' | 'saude' | 'faturamento_mensal' | 'potencial'> | null }

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
    let q = supabase.from('card').select('*, aluna(id, nome, produto, saude, faturamento_mensal, potencial)').eq('funil_id', funilId)
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
          <div className="flex h-[calc(100vh-9.5rem)] gap-4 overflow-x-auto px-4 pb-4 pt-4 sm:px-6">
            {colunas.map((etapa, i) => {
              const doEtapa = visiveis.filter((c) => c.etapa_id === etapa.id)
              const maior = Math.max(1, ...colunas.map((e) => visiveis.filter((c) => c.etapa_id === e.id).length))
              const cor = corDaEtapa(etapa, i)
              return (
                <Coluna key={etapa.id} etapa={etapa} total={doEtapa.length} cor={cor} proporcao={doEtapa.length / maior}
                  soma={doEtapa.reduce((s, c) => s + Number(c.valor ?? 0), 0)}
                  parados={doEtapa.filter((c) => etapa.alerta_dias != null && !c.fechado_em && diasDesde(c.etapa_desde) > etapa.alerta_dias).length}
                  podeCriar={editavel && etapa.tipo === 'aberta'} criar={() => setNovo(etapa)}>
                  {doEtapa.map((c) => (
                    <CartaoArrastavel key={c.id} card={c} etapa={etapa} arrastavel={editavel} cor={cor}
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

// Cada etapa tem a sua cor: bolinha, faixa do topo, borda dos cards. Etapa de
// fim usa verde (ganha) ou cinza (perdida), em qualquer funil.
type Cor = { ponto: string; topo: string; barra: string; borda: string; card: string; borda2: string }
const PALETA: Cor[] = [
  { ponto: 'bg-violet-700', topo: 'bg-violet-50/80', barra: 'bg-violet-700', borda: 'border-l-violet-700', card: 'bg-violet-50', borda2: 'border-violet-100' },
  { ponto: 'bg-sky-500', topo: 'bg-sky-50', barra: 'bg-sky-500', borda: 'border-l-sky-500', card: 'bg-sky-50', borda2: 'border-sky-100' },
  { ponto: 'bg-purple-400', topo: 'bg-purple-50/80', barra: 'bg-purple-400', borda: 'border-l-purple-400', card: 'bg-purple-50', borda2: 'border-purple-100' },
  { ponto: 'bg-amber-400', topo: 'bg-amber-50/80', barra: 'bg-amber-400', borda: 'border-l-amber-400', card: 'bg-amber-50', borda2: 'border-amber-100' },
  { ponto: 'bg-rose-400', topo: 'bg-rose-50/80', barra: 'bg-rose-400', borda: 'border-l-rose-400', card: 'bg-rose-50', borda2: 'border-rose-100' },
  { ponto: 'bg-teal-500', topo: 'bg-teal-50/80', barra: 'bg-teal-500', borda: 'border-l-teal-500', card: 'bg-teal-50', borda2: 'border-teal-100' },
]
const COR_GANHA: Cor = { ponto: 'bg-emerald-500', topo: 'bg-emerald-50/80', barra: 'bg-emerald-500', borda: 'border-l-emerald-500', card: 'bg-emerald-50', borda2: 'border-emerald-100' }
const COR_PERDIDA: Cor = { ponto: 'bg-slate-400', topo: 'bg-slate-100', barra: 'bg-slate-400', borda: 'border-l-slate-400', card: 'bg-slate-50', borda2: 'border-slate-200' }

function corDaEtapa(e: Etapa, i: number): Cor {
  return e.tipo === 'ganha' ? COR_GANHA : e.tipo === 'perdida' ? COR_PERDIDA : PALETA[i % PALETA.length]
}

function Coluna({ etapa, total, soma, parados, podeCriar, criar, cor, proporcao, children }: {
  etapa: Etapa; total: number; soma: number; parados: number; podeCriar: boolean; criar: () => void
  cor: Cor; proporcao: number; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  return (
    <div ref={setNodeRef}
      className={`flex h-full w-[18.5rem] shrink-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-100/70 to-slate-200/60 ${isOver ? 'border-slate-400 ring-2 ring-slate-300' : 'border-slate-200'}`}>
      <div className={`border-b border-slate-200/80 px-5 pb-4 pt-4 ${cor.topo}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor.ponto}`} />
            <span className="truncate font-semibold text-slate-800">{etapa.nome}</span>
          </div>
          <span className="font-mono text-lg font-medium text-slate-700">{total}</span>
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-sm text-slate-700">
          <span>{soma > 0 ? reais(soma) : 'R$ 0'}</span>
          {parados > 0 && <span className="flex items-center gap-1 font-sans text-xs font-semibold text-red-600"><Clock size={12} /> {parados} parado{parados > 1 ? 's' : ''}</span>}
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${total ? Math.max(proporcao, 0.06) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="flex min-h-16 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
      {podeCriar && (
        <button onClick={criar} className="flex items-center gap-1.5 border-t border-slate-200/70 px-5 py-3 text-left text-xs font-medium text-slate-500 hover:bg-white/50 hover:text-slate-800">
          <Plus size={14} /> Adicionar card
        </button>
      )}
    </div>
  )
}

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome.split(/\s+/).filter((p) => !/^(da|de|do|dos|das|e|\(.*)$/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <span title={nome} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-noite text-[9px] font-semibold text-indigo-200">
      {iniciais || '?'}
    </span>
  )
}

// "Hoje", "Ontem", "4d": ha quanto tempo o card esta nesta etapa.
function haQuanto(dias: number) {
  return dias <= 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `${dias}d`
}

function CartaoArrastavel({ card, etapa, arrastavel, responsavel, abrir, cor }: {
  card: CardComAluna; etapa: Etapa; arrastavel: boolean; responsavel: string | null; abrir: () => void; cor: Cor
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !arrastavel })
  const estilo = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const parado = diasDesde(card.etapa_desde)
  const atrasado = etapa.alerta_dias != null && !card.fechado_em && parado > etapa.alerta_dias
  const prazoVencido = !!card.prazo && card.prazo < hoje() && !card.fechado_em
  const saude = card.aluna?.saude ? SAUDE[card.aluna.saude] : null
  const dados = card.dados ?? {}
  // Linha de apoio: o que o consultor escreveu, ou o produto e o faturamento.
  const escrito = (typeof dados.justificativa === 'string' && dados.justificativa)
    || (typeof dados.sinal === 'string' && dados.sinal) || ''
  const apoio = escrito || [card.aluna?.produto, card.aluna?.faturamento_mensal ? `${reais(card.aluna.faturamento_mensal)}/mês` : null].filter(Boolean).join(' · ')
  const origem = (typeof dados.enviado_por === 'string' && `de ${dados.enviado_por}`) || (typeof dados.origem === 'string' && dados.origem) || responsavel?.split(' ')[0]
  return (
    <div ref={setNodeRef} style={estilo} {...attributes} {...listeners} onClick={abrir}
      className={`cursor-pointer rounded-xl border border-l-[3px] px-5 py-4 shadow-[0_1px_2px_rgba(20,17,16,0.05)] transition hover:-translate-y-px hover:shadow-md
        ${cor.borda} ${cor.borda2} ${cor.card} ${isDragging ? 'z-50 rotate-2 shadow-xl' : ''} ${card.fechado_em ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-slate-900">{card.titulo}</div>
          {apoio && <div className="mt-0.5 line-clamp-2 text-sm text-slate-500">{apoio}</div>}
        </div>
        <Potencial pontos={card.aluna?.potencial} />
      </div>
      {card.valor != null && <div className="mt-3 font-mono text-lg font-medium text-slate-900">{reais(card.valor)}</div>}
      {(atrasado || saude || (escrito && card.aluna?.produto)) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {atrasado && <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">parado</span>}
          {saude && <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${saude.cor}`}>{saude.rotulo.toLowerCase()}</span>}
          {escrito && card.aluna?.produto && <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">{card.aluna.produto.replace('Moonshot ', '')}</span>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
        <span className="flex min-w-0 items-center gap-2">
          {responsavel ? <Avatar nome={responsavel} /> : <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-slate-300" title="Sem responsável" />}
          {origem && <span className="truncate">{origem}</span>}
          {card.prazo && (
            <span className={`flex shrink-0 items-center gap-1 font-semibold ${prazoVencido ? 'text-red-600' : 'text-amber-700'}`}>
              <Clock size={12} /> {data(card.prazo).slice(0, 5)}
            </span>
          )}
        </span>
        <span className={`shrink-0 ${atrasado ? 'font-semibold text-red-600' : ''}`}>{haQuanto(parado)}</span>
      </div>
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
                <td className="px-4 py-2.5">{c.responsavel_id ? nomeDe(c.responsavel_id) : null}</td>
                <td className={`px-4 py-2.5 ${c.prazo && c.prazo < hoje() ? 'font-medium text-red-600' : ''}`}>{data(c.prazo)}</td>
                <td className={`px-4 py-2.5 ${atrasado ? 'font-medium text-red-600' : 'text-slate-600'}`}>{parado}d</td>
                <td className="px-4 py-2.5 text-right">{c.valor != null ? reais(c.valor) : ''}</td>
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
        <p className="text-sm text-slate-600">Esta etapa exige motivo: é o que permite medir depois por que se perde.</p>
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
