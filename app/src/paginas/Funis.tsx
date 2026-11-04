import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Clock, Search, CalendarDays, ChevronDown, Columns3, List, Phone, Mail, UserRound, FileText, HeartHandshake, MoreVertical, Pencil, SlidersHorizontal, ArrowUpDown, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Etapa } from '../lib/tipos'
import { SAUDE, data, diasDesde, hoje, mensagemErro, reais, rotuloOrigem } from '../lib/util'
import { Carregando, Erro, Modal, Campo, Potencial, Vazio } from '../componentes/ui'
import { CardGaveta, NovoCard } from './CardGaveta'
import { AlternarVisao } from './Acompanhamento'
import { EditarFunil, NovoFunil } from './FunilEditor'

// Temperatura do card: guardada em card.dados.temperatura.
const TEMPERATURAS = {
  quente: { rotulo: 'Quente', cor: 'border-red-200 bg-red-50 text-red-700', emoji: '🔥' },
  morno: { rotulo: 'Morno', cor: 'border-amber-200 bg-amber-50 text-amber-700', emoji: '🌤' },
  frio: { rotulo: 'Frio', cor: 'border-sky-200 bg-sky-50 text-sky-700', emoji: '❄' },
} as const
type Temperatura = keyof typeof TEMPERATURAS
const temperaturaDe = (c: Card) => (typeof c.dados?.temperatura === 'string' && c.dados.temperatura in TEMPERATURAS ? c.dados.temperatura as Temperatura : null)

const ORDENS = {
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  parados: 'Há mais tempo na etapa',
  valor: 'Maior valor',
  nome: 'Nome (A a Z)',
} as const
type Ordem = keyof typeof ORDENS

type Filtros = { responsavel: string; cs: string; produto: string; temperatura: string; parados: boolean; prazoVencido: boolean; soMeus: boolean; fechados: boolean }
const FILTROS_VAZIOS: Filtros = { responsavel: '', cs: '', produto: '', temperatura: '', parados: false, prazoVencido: false, soMeus: false, fechados: false }

type CardComAluna = Card & { aluna: Pick<Aluna, 'id' | 'nome' | 'produto' | 'saude' | 'faturamento_mensal' | 'potencial' | 'telefone' | 'email' | 'cs_id' | 'cs_planilha'> | null }

/** Quadro de funis. Dentro do Acompanhamento ganha a alternancia de visao e fica na mesma aba. */
export function Funis({ base = '/funis' }: { base?: string }) {
  const { funis, etapas, nomeDe, podeEditar, eu, equipe } = useSessao()
  const { funilId } = useParams()
  const [busca] = useSearchParams()
  const nav = useNavigate()
  const funil = funis.find((f) => f.id === funilId) ?? null

  useEffect(() => {
    // No Acompanhamento, o quadro abre no ciclo de consultoria.
    const inicial = (base !== '/funis' && funis.find((f) => f.id === 'consultoria')) || funis[0]
    if (!funilId && inicial) nav(`${base}/${inicial.id}`, { replace: true })
  }, [funilId, funis, nav, base])

  const colunas = useMemo(() => etapas.filter((e) => e.funil_id === funilId), [etapas, funilId])
  const [cards, setCards] = useState<CardComAluna[] | null>(null)
  const [filtro, setFiltro] = useState('')
  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS)
  const verFechados = f.fechados
  const [verFiltros, setVerFiltros] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [verOrdem, setVerOrdem] = useState(false)
  const [editarFunil, setEditarFunil] = useState(false)
  const [criarFunil, setCriarFunil] = useState(false)
  const [visao, setVisao] = useState<'kanban' | 'lista' | 'mes'>('kanban')
  const [escolherFunil, setEscolherFunil] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<Etapa | null>(null)
  const [pedeMotivo, setPedeMotivo] = useState<{ card: CardComAluna; etapa: Etapa } | null>(null)
  const aberto = Number(busca.get('card')) || null
  // Tela larga: o card abre num painel fixo a direita e o quadro encolhe ao
  // lado. No celular continua por cima.
  const [largo, setLargo] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const h = () => setLargo(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])

  const carregar = useCallback(async () => {
    if (!funilId) return
    let q = supabase.from('card').select('*, aluna(id, nome, produto, saude, faturamento_mensal, potencial, telefone, email, cs_id, cs_planilha)').eq('funil_id', funilId)
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

  async function mudarTemperatura(card: CardComAluna, t: Temperatura | null) {
    setErro(null)
    const dados = { ...(card.dados ?? {}), temperatura: t }
    setCards((cs) => cs?.map((c) => (c.id === card.id ? { ...c, dados } : c)) ?? null)
    const { error } = await supabase.from('card').update({ dados }).eq('id', card.id)
    if (error) { setErro(mensagemErro(error)); carregar() }
  }

  const csDe = (c: CardComAluna) => (c.aluna?.cs_id ? nomeDe(c.aluna.cs_id) : c.aluna?.cs_planilha ?? '')
  const etapaDe = (c: CardComAluna) => colunas.find((e) => e.id === c.etapa_id)
  const estaParado = (c: CardComAluna) => {
    const e = etapaDe(c)
    return e?.alerta_dias != null && !c.fechado_em && diasDesde(c.etapa_desde) > e.alerta_dias
  }

  // Opcoes dos filtros: so o que existe nos cards deste funil.
  const opcoes = useMemo(() => {
    const todos = cards ?? []
    const unico = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      responsaveis: unico(todos.map((c) => c.responsavel_id)).map((id) => ({ id, nome: equipe.find((p) => p.id === id)?.nome ?? id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      cs: unico(todos.map(csDe)),
      produtos: unico(todos.map((c) => c.aluna?.produto ?? (typeof c.dados?.produto === 'string' ? c.dados.produto : null))),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, equipe])

  const nFiltros = [f.responsavel, f.cs, f.produto, f.temperatura].filter(Boolean).length + [f.parados, f.prazoVencido, f.soMeus, f.fechados].filter(Boolean).length

  const visiveis = (cards ?? []).filter((c) => {
    if (f.soMeus && c.responsavel_id !== eu?.id) return false
    if (f.responsavel && (f.responsavel === 'ninguem' ? c.responsavel_id : c.responsavel_id !== f.responsavel)) return false
    if (f.cs && csDe(c) !== f.cs) return false
    if (f.produto && (c.aluna?.produto ?? c.dados?.produto) !== f.produto) return false
    if (f.temperatura && (f.temperatura === 'sem' ? temperaturaDe(c) : temperaturaDe(c) !== f.temperatura)) return false
    if (f.parados && !estaParado(c)) return false
    if (f.prazoVencido && !(c.prazo && c.prazo < hoje() && !c.fechado_em)) return false
    if (!filtro) return true
    const t = filtro.toLowerCase()
    const digitos = filtro.replace(/\D/g, '')
    return c.titulo.toLowerCase().includes(t) || nomeDe(c.responsavel_id).toLowerCase().includes(t)
      || (c.aluna?.nome ?? '').toLowerCase().includes(t) || (c.aluna?.email ?? '').toLowerCase().includes(t)
      || (digitos.length >= 4 && (c.aluna?.telefone ?? '').replace(/\D/g, '').includes(digitos))
  }).sort((a, b) => {
    switch (ordem) {
      case 'antigos': return a.criado_em.localeCompare(b.criado_em)
      case 'parados': return a.etapa_desde.localeCompare(b.etapa_desde)
      case 'valor': return Number(b.valor ?? -1) - Number(a.valor ?? -1)
      case 'nome': return (a.aluna?.nome ?? a.titulo).localeCompare(b.aluna?.nome ?? b.titulo, 'pt-BR')
      default: return b.criado_em.localeCompare(a.criado_em)
    }
  })
  const somaTotal = visiveis.reduce((s, c) => s + Number(c.valor ?? 0), 0)
  const coordenador = eu?.papel === 'coordenador'

  if (!funis.length) return <Vazio>Seu perfil ainda não tem acesso a nenhum funil.</Vazio>
  if (!funil) return <Carregando />

  const abasVisao = [
    { id: 'kanban' as const, rotulo: 'Kanban', icone: Columns3 },
    { id: 'lista' as const, rotulo: 'Lista', icone: List },
    ...(funil.id === 'renovacao' ? [{ id: 'mes' as const, rotulo: 'Por mês de vencimento', icone: CalendarDays }] : []),
  ]

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      {base !== '/funis' && <div className="px-4 pt-3 sm:px-6"><AlternarVisao atual="funil" /></div>}
      {/* Topo: nome do funil, resumo e botao de novo card. */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-noite">Funil · {funil.nome}</h1>
            <p className="text-xs text-slate-500">
              {visiveis.length} {visiveis.length === 1 ? 'card' : 'cards'} · {reais(somaTotal)} total
              {nFiltros > 0 && cards && visiveis.length !== cards.length && <> · filtrado de {cards.length}</>}
            </p>
          </div>
          {editavel && colunas[0] && (
            <button className="btn-primario py-1.5" onClick={() => setNovo(colunas[0])}><Plus size={16} /> Novo card</button>
          )}
        </div>
        {/* Barra: funil, editar/criar, filtros, ordem, busca, visao. */}
        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative">
            <button className="entrada flex w-48 items-center justify-between gap-2 py-1.5 text-left" onClick={() => setEscolherFunil(!escolherFunil)}>
              <span className="truncate">{funil.nome}</span><ChevronDown size={15} className="shrink-0 text-slate-400" />
            </button>
            {escolherFunil && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setEscolherFunil(false)} />
                <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {funis.map((x) => (
                    <button key={x.id} onClick={() => { setEscolherFunil(false); setF(FILTROS_VAZIOS); nav(`${base}/${x.id}`) }}
                      className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${x.id === funilId ? 'font-medium text-indigo-700' : 'text-slate-700'}`}>
                      {x.nome}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {coordenador && (
            <>
              <button className="btn-secundario px-2.5 py-1.5" title="Editar funil e etapas" onClick={() => setEditarFunil(true)}><Pencil size={15} /></button>
              <button className="btn-secundario px-2.5 py-1.5" title="Novo funil" onClick={() => setCriarFunil(true)}><Plus size={15} /></button>
            </>
          )}
          <div className="relative">
            <button className={`btn-secundario py-1.5 ${nFiltros ? 'border-indigo-300 text-indigo-700' : ''}`} onClick={() => setVerFiltros(!verFiltros)}>
              <SlidersHorizontal size={15} /> Filtros{nFiltros > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-xs text-white">{nFiltros}</span>}
            </button>
            {verFiltros && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setVerFiltros(false)} />
                <PainelFiltros f={f} setF={setF} opcoes={opcoes} fechar={() => setVerFiltros(false)} />
              </>
            )}
          </div>
          <div className="relative">
            <button className="btn-secundario py-1.5" onClick={() => setVerOrdem(!verOrdem)}><ArrowUpDown size={15} /> {ORDENS[ordem]} <ChevronDown size={14} /></button>
            {verOrdem && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setVerOrdem(false)} />
                <div className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {(Object.keys(ORDENS) as Ordem[]).map((o) => (
                    <button key={o} onClick={() => { setOrdem(o); setVerOrdem(false) }}
                      className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${o === ordem ? 'font-medium text-indigo-700' : 'text-slate-700'}`}>
                      {ORDENS[o]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative min-w-[12rem] flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input className="entrada py-1.5 pl-9" placeholder="Buscar nome, telefone, e-mail" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <nav className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {abasVisao.map(({ id, rotulo, icone: I }) => (
              <button key={id} onClick={() => setVisao(id)} title={rotulo}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm ${visao === id ? 'bg-white font-medium text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                <I size={15} /> <span className="hidden sm:inline">{rotulo}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      {funil.descricao && <p className="px-4 pt-3 text-xs text-slate-500 sm:px-6">{funil.descricao}</p>}
      {erro && <div className="px-4 pt-3 sm:px-6"><Erro msg={erro} /></div>}

      {cards === null ? <Carregando /> : visao === 'mes' ? (
        <div className="p-4 sm:p-6"><PorMes cards={visiveis} abrir={(id) => nav(`?card=${id}`)} /></div>
      ) : visao === 'lista' ? (
        <div className="p-4 sm:p-6"><Lista cards={visiveis} colunas={colunas} abrir={(id) => nav(`?card=${id}`)} /></div>
      ) : (
        <div className="flex h-[calc(100vh-9.5rem)]">
        <DndContext sensors={sensores} onDragEnd={soltar}>
          <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto px-4 pb-4 pt-4 sm:px-6">
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
                    <CartaoArrastavel key={c.id} card={c} etapa={etapa} arrastavel={editavel} cor={cor} selecionado={c.id === aberto}
                      responsavel={c.responsavel_id ? nomeDe(c.responsavel_id) : null} abrir={() => nav(`?card=${c.id}`)}
                      etapas={colunas} mover={(e) => mover(c, e)} temperatura={(t) => mudarTemperatura(c, t)}
                      ficha={c.aluna ? () => nav(`/alunas/${c.aluna!.id}`) : null} />
                  ))}
                </Coluna>
              )
            })}
          </div>
        </DndContext>
        {aberto && largo && <CardGaveta encaixado id={aberto} fechar={() => nav(`${base}/${funil.id}`)} mudou={carregar} />}
        </div>
      )}

      {aberto && (!largo || visao !== 'kanban' || cards === null) && (
        <CardGaveta id={aberto} fechar={() => nav(`${base}/${funil.id}`)} mudou={carregar} />
      )}
      {novo && <NovoCard funil={funil} etapa={novo} fechar={() => setNovo(null)} criado={(id) => { setNovo(null); carregar(); nav(`?card=${id}`) }} />}
      {editarFunil && <EditarFunil funil={funil} fechar={() => setEditarFunil(false)} />}
      {criarFunil && <NovoFunil fechar={() => setCriarFunil(false)} criado={(id) => { setCriarFunil(false); nav(`${base}/${id}`) }} />}
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

function Coluna({ etapa, total, soma, parados, podeCriar, criar, cor, children }: {
  etapa: Etapa; total: number; soma: number; parados: number; podeCriar: boolean; criar: () => void
  cor: Cor; proporcao: number; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  return (
    <div ref={setNodeRef}
      className={`flex h-full w-[18.5rem] shrink-0 flex-col overflow-hidden rounded-2xl border ${cor.topo} ${isOver ? 'border-slate-400 ring-2 ring-slate-300' : cor.borda2}`}>
      <div className="space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor.ponto}`} />
            <span className="truncate text-[15px] font-semibold text-slate-800">{etapa.nome}</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-xs font-medium text-slate-600 ring-1 ring-slate-200">{total}</span>
          </div>
          {parados > 0 && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-red-600" title="Parados além do prazo da etapa"><Clock size={12} /> {parados}</span>}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-[0_1px_2px_rgba(20,17,16,0.05)]">
          <span className="font-medium text-slate-700">Total</span>
          <span className={`font-mono font-semibold ${soma > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{reais(soma)}</span>
        </div>
        {podeCriar && (
          <button onClick={criar} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white/40 py-2 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800">
            <Plus size={14} /> Adicionar card
          </button>
        )}
      </div>
      <div className="flex min-h-16 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  )
}

function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  const iniciais = nome.split(/\s+/).filter((p) => p && !/^(da|de|do|dos|das|e|\(.*)$/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <span title={nome} className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${grande ? 'h-9 w-9 bg-nude text-xs text-noite ring-1 ring-ouro/40' : 'h-5 w-5 bg-noite text-[9px] text-indigo-200'}`}>
      {iniciais || '?'}
    </span>
  )
}

// "hoje", "ontem", "há 4 dias": ha quanto tempo o card esta nesta etapa.
function haQuanto(dias: number) {
  return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`
}

function PainelFiltros({ f, setF, opcoes, fechar }: {
  f: Filtros; setF: (f: Filtros) => void; fechar: () => void
  opcoes: { responsaveis: { id: string; nome: string }[]; cs: string[]; produtos: string[] }
}) {
  const muda = (m: Partial<Filtros>) => setF({ ...f, ...m })
  const sel = (rotulo: string, valor: string, mudar: (v: string) => void, itens: { v: string; r: string }[]) => (
    <label className="block text-xs font-medium text-slate-600">
      {rotulo}
      <select className="entrada mt-1 py-1.5" value={valor} onChange={(e) => mudar(e.target.value)}>
        <option value="">Todos</option>
        {itens.map((i) => <option key={i.v} value={i.v}>{i.r}</option>)}
      </select>
    </label>
  )
  const marca = (rotulo: string, valor: boolean, mudar: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={valor} onChange={(e) => mudar(e.target.checked)} /> {rotulo}
    </label>
  )
  return (
    <div className="absolute left-0 top-full z-40 mt-1 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">Filtros</span>
        <button className="text-slate-400 hover:text-slate-700" onClick={fechar}><X size={16} /></button>
      </div>
      {sel('Responsável', f.responsavel, (v) => muda({ responsavel: v }), [
        { v: 'ninguem', r: 'Sem responsável' }, ...opcoes.responsaveis.map((p) => ({ v: p.id, r: p.nome })),
      ])}
      {sel('CS', f.cs, (v) => muda({ cs: v }), opcoes.cs.map((x) => ({ v: x, r: x })))}
      {sel('Programa', f.produto, (v) => muda({ produto: v }), opcoes.produtos.map((x) => ({ v: x, r: x })))}
      {sel('Temperatura', f.temperatura, (v) => muda({ temperatura: v }), [
        ...(Object.keys(TEMPERATURAS) as Temperatura[]).map((t) => ({ v: t, r: TEMPERATURAS[t].rotulo })), { v: 'sem', r: 'Sem temperatura' },
      ])}
      <div className="space-y-1.5 border-t border-slate-100 pt-3">
        {marca('Só os meus', f.soMeus, (v) => muda({ soMeus: v }))}
        {marca('Parados além do prazo da etapa', f.parados, (v) => muda({ parados: v }))}
        {marca('Prazo vencido', f.prazoVencido, (v) => muda({ prazoVencido: v }))}
        {marca('Incluir fechados (30 dias)', f.fechados, (v) => muda({ fechados: v }))}
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-3">
        <button className="text-sm text-indigo-700 hover:underline" onClick={() => setF(FILTROS_VAZIOS)}>Limpar filtros</button>
      </div>
    </div>
  )
}

// Menu do card (os tres pontinhos): mover de etapa, temperatura, abrir ficha.
function MenuCard({ etapas, atual, mover, temperatura, ficha, abrir, editavel, aoAbrir }: {
  etapas: Etapa[]; atual: number; mover: (e: Etapa) => void; temperatura: (t: Temperatura | null) => void
  ficha: (() => void) | null; abrir: () => void; editavel: boolean; aoAbrir: (aberto: boolean) => void
}) {
  const [aberto, setAbertoInterno] = useState(false)
  const setAberto = (v: boolean) => { setAbertoInterno(v); aoAbrir(v) }
  const parar = (e: React.SyntheticEvent) => e.stopPropagation()
  const item = 'block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50'
  return (
    <div className="relative" onPointerDown={parar} onClick={parar}>
      <button className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Ações" onClick={() => setAberto(!aberto)}>
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 max-h-96 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <button className={item} onClick={() => { setAberto(false); abrir() }}>Abrir card</button>
            {ficha && <button className={item} onClick={() => { setAberto(false); ficha() }}>Abrir ficha da aluna</button>}
            {editavel && (
              <>
                <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Temperatura</div>
                {(Object.keys(TEMPERATURAS) as Temperatura[]).map((t) => (
                  <button key={t} className={item} onClick={() => { setAberto(false); temperatura(t) }}>{TEMPERATURAS[t].emoji} {TEMPERATURAS[t].rotulo}</button>
                ))}
                <button className={`${item} text-slate-500`} onClick={() => { setAberto(false); temperatura(null) }}>Tirar temperatura</button>
                <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mover para</div>
                {etapas.filter((e) => e.id !== atual).map((e) => (
                  <button key={e.id} className={item} onClick={() => { setAberto(false); mover(e) }}>{e.nome}</button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CartaoArrastavel({ card, etapa, arrastavel, responsavel, abrir, cor, selecionado, etapas, mover, temperatura, ficha }: {
  card: CardComAluna; etapa: Etapa; arrastavel: boolean; responsavel: string | null; abrir: () => void; cor: Cor; selecionado: boolean
  etapas: Etapa[]; mover: (e: Etapa) => void; temperatura: (t: Temperatura | null) => void; ficha: (() => void) | null
}) {
  const { nomeDe } = useSessao()
  const temp = temperaturaDe(card)
  const [menuAberto, setMenuAberto] = useState(false)
  const cs = card.aluna?.cs_id ? nomeDe(card.aluna.cs_id).split(' ')[0] : card.aluna?.cs_planilha?.split(' ')[0] ?? null
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !arrastavel })
  const estilo = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const parado = diasDesde(card.etapa_desde)
  const atrasado = etapa.alerta_dias != null && !card.fechado_em && parado > etapa.alerta_dias
  const prazoVencido = !!card.prazo && card.prazo < hoje() && !card.fechado_em
  const saude = card.aluna?.saude ? SAUDE[card.aluna.saude] : null
  const dados = card.dados ?? {}
  const nome = card.aluna?.nome ?? card.titulo
  const origem = rotuloOrigem(dados)
    || [card.aluna?.produto, card.aluna?.faturamento_mensal ? `${reais(card.aluna.faturamento_mensal)}/mês` : null].filter(Boolean).join(' · ')
  const produto = typeof dados.produto === 'string' ? dados.produto : null
  return (
    <div ref={setNodeRef} style={estilo} {...attributes} {...listeners} onClick={abrir}
      className={`cursor-pointer rounded-xl border bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(20,17,16,0.05)] transition hover:-translate-y-px hover:shadow-md
        ${selecionado ? 'border-ouro ring-2 ring-ouro/40' : 'border-slate-200'} ${isDragging ? 'z-50 rotate-2 shadow-xl' : ''} ${menuAberto ? 'relative z-40' : ''} ${card.fechado_em ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <Avatar nome={nome} grande />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-900" title={nome}>{nome}</div>
          {origem && <div className="truncate text-xs text-slate-500">{origem}</div>}
        </div>
        <Potencial pontos={card.aluna?.potencial} />
        <MenuCard etapas={etapas} atual={card.etapa_id} mover={mover} temperatura={temperatura} ficha={ficha} abrir={abrir} editavel={arrastavel} aoAbrir={setMenuAberto} />
      </div>
      <div className="mt-2.5 space-y-1 text-xs text-slate-600">
        {card.aluna?.telefone && <div className="flex items-center gap-1.5 truncate"><Phone size={12} className="shrink-0 text-slate-400" /> {card.aluna.telefone}</div>}
        {card.aluna?.email && <div className="flex items-center gap-1.5 truncate"><Mail size={12} className="shrink-0 text-slate-400" /> {card.aluna.email}</div>}
        <div className="flex items-center gap-1.5 truncate"><UserRound size={12} className="shrink-0 text-slate-400" /> {responsavel ?? <span className="text-slate-400">sem responsável</span>}</div>
      </div>
      {cs && <div className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-nude px-2 py-0.5 text-xs font-medium text-noite ring-1 ring-ouro/30"><HeartHandshake size={11} /> CS {cs}</div>}
      {(card.valor != null || temp) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {card.valor != null ? <span className="font-mono text-base font-semibold text-emerald-700">{reais(card.valor)}</span> : <span />}
          {temp && <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TEMPERATURAS[temp].cor}`}>{TEMPERATURAS[temp].emoji} {TEMPERATURAS[temp].rotulo}</span>}
        </div>
      )}
      {(atrasado || saude || produto || prazoVencido) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {atrasado && <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">parado</span>}
          {prazoVencido && <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">prazo vencido</span>}
          {produto && <span className={`rounded-md border px-2 py-0.5 text-xs font-medium text-slate-700 ${cor.borda2}`}>{produto}</span>}
          {saude && <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${saude.cor}`}>{saude.rotulo.toLowerCase()}</span>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        <span className="flex items-center gap-3">
          {ficha && (
            <button className="flex items-center gap-1 hover:text-indigo-700" onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); ficha() }}><FileText size={12} /> Ficha</button>
          )}
          <span className={`flex items-center gap-1 ${prazoVencido ? 'font-semibold text-red-600' : ''}`} title={card.prazo ? 'Prazo / próximo compromisso' : 'Sem prazo definido'}>
            <CalendarDays size={12} /> {card.prazo ? data(card.prazo).slice(0, 5) : 'Agenda'}
          </span>
        </span>
        <span className={atrasado ? 'font-semibold text-red-600' : ''}>{haQuanto(parado)}</span>
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
