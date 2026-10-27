import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, MessageSquare, CalendarClock, ArrowRight, PhoneCall, Flame, Users, Wallet, HeartPulse, Receipt, Activity, KanbanSquare, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Demanda } from '../lib/tipos'
import { PRIORIDADE, SAUDE, data, diasDesde, hoje, reais } from '../lib/util'
import { Carregando, Potencial, Selo } from '../componentes/ui'
import { BarrasH, Colunas, Legenda, Linhas, Rosca, compacto } from '../componentes/graficos'

type CardEtapa = Card & { etapa: { nome: string; alerta_dias: number | null } }
type Resumo = { funil_id: string; etapa: string; ordem: number; cards: number; parados: number; valor: number | null }
type Carteira = { consultor_id: string; consultor: string; alunas: number; em_risco: number; sem_consultoria_recente: number; faturamento_carteira: number | null }
type Mes = { mes: string; contratos: number; faturamento_mensal: number | null }
type Retencao = { prazo: string; desfecho: string; tipo: string; pedidos: number }
type AgendaItem = { id: number; aluna_id: number; nome: string; numero: number; data_prevista: string; consultor: string | null; atrasada: boolean; consultor_id: string | null }
type Painel = {
  ativas: number; novas_30d: number; faturamento: number; com_faturamento: number; em_risco: number; inadimplentes: number
  saude: Record<string, number> | null; potencial: { quente: number; morno: number; frio: number }
  produtos: Record<string, number> | null; semanas: { semana: string; contatos: number; consultorias: number }[]
}
type Inadimplente = { aluna_id: number; nome: string; consultor: string | null; consultor_id: string | null; produto_contrato: string }

export function Inicio() {
  const { eu, funis, nomeDe } = useSessao()
  const [meusCards, setMeusCards] = useState<CardEtapa[] | null>(null)
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [risco, setRisco] = useState<Aluna[]>([])
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [carteira, setCarteira] = useState<Carteira[]>([])
  const [meses, setMeses] = useState<Mes[]>([])
  const [retencao, setRetencao] = useState<Retencao[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [inadimplentes, setInadimplentes] = useState<Inadimplente[]>([])
  const [retornos, setRetornos] = useState<Aluna[]>([])
  const [potenciais, setPotenciais] = useState<Aluna[]>([])
  const [painel, setPainel] = useState<Painel | null>(null)
  const [funilGrafico, setFunilGrafico] = useState<string | null>(null)
  const [semContato, setSemContato] = useState<{ lista: Aluna[]; total: number }>({ lista: [], total: 0 })
  const coord = eu?.papel === 'coordenador'
  // A CS acompanha a base inteira, como a coordenacao; o consultor ve a carteira.
  const geral = coord || eu?.papel === 'cs'

  useEffect(() => {
    if (!eu) return
    let qRisco = supabase.from('aluna').select('*').in('saude', ['risco_saida', 'sem_contato'])
      .not('status_contrato', 'in', '(cancelado,encerrado)').order('ultima_consultoria', { ascending: true, nullsFirst: true }).limit(8)
    if (!geral) qRisco = qRisco.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
    // Retornos combinados ate daqui a 3 dias e quem esta ha 30 dias sem contato.
    const em3 = new Date(); em3.setDate(em3.getDate() + 3)
    const ha30 = new Date(); ha30.setDate(ha30.getDate() - 30)
    let qRetorno = supabase.from('aluna').select('*').lte('proximo_contato', em3.toLocaleDateString('sv-SE'))
      .not('status_contrato', 'in', '(cancelado,encerrado)').order('proximo_contato').limit(12)
    let qSem = supabase.from('aluna').select('*', { count: 'exact' }).eq('status_contrato', 'ativo')
      .or(`ultimo_contato.is.null,ultimo_contato.lt.${ha30.toLocaleDateString('sv-SE')}`)
      .order('ultimo_contato', { ascending: true, nullsFirst: true }).limit(8)
    supabase.rpc('painel', { p_minha: !geral }).then(({ data: d }) => setPainel((d ?? null) as Painel | null))
    let qPot = supabase.from('aluna').select('*, potencial').eq('status_contrato', 'ativo').order('potencial', { ascending: false }).limit(8)
    if (!geral) qPot = qPot.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
    qPot.then(({ data: d }) => setPotenciais((d ?? []) as Aluna[]))
    if (!geral) {
      qRetorno = qRetorno.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
      qSem = qSem.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
    }
    Promise.all([qRetorno, qSem]).then(([rt, sc]) => {
      setRetornos((rt.data ?? []) as Aluna[])
      setSemContato({ lista: (sc.data ?? []) as Aluna[], total: sc.count ?? 0 })
    })
    Promise.all([
      supabase.from('card').select('*, etapa(nome, alerta_dias)').eq('responsavel_id', eu.id).is('fechado_em', null).order('etapa_desde').limit(100),
      supabase.from('demanda').select('*').eq('responsavel_id', eu.id).not('status', 'in', '(concluida,cancelada)').order('prazo', { nullsFirst: false }).limit(6),
      qRisco,
      supabase.from('vw_funil_resumo').select('*'),
      supabase.from('vw_carteira').select('*').order('consultor'),
      supabase.from('vw_renovacao_mes').select('*').order('mes').limit(12),
      coord ? supabase.from('vw_retencao_sistema').select('*') : Promise.resolve({ data: [] }),
      // A visao respeita a RLS: consultor ve a agenda da propria carteira.
      supabase.from('vw_agenda_proxima').select('*').order('data_prevista').limit(40),
      geral ? supabase.from('vw_inadimplentes').select('*').order('consultor')
        : supabase.from('vw_inadimplentes').select('*').eq('consultor_id', eu.id),
    ]).then(([c, d, r, fr, ca, m, rt, ag, ina]) => {
      setAgenda((ag.data ?? []) as AgendaItem[])
      setInadimplentes((ina.data ?? []) as Inadimplente[])
      setMeusCards((c.data ?? []) as CardEtapa[])
      setDemandas((d.data ?? []) as Demanda[])
      setRisco((r.data ?? []) as Aluna[])
      setResumo((fr.data ?? []) as Resumo[])
      setCarteira((ca.data ?? []) as Carteira[])
      setMeses((m.data ?? []) as Mes[])
      setRetencao((rt.data ?? []) as Retencao[])
    })
  }, [eu, coord])

  if (meusCards === null) return <Carregando />

  const parados = meusCards.filter((c) => c.etapa.alerta_dias != null && diasDesde(c.etapa_desde) > c.etapa.alerta_dias)
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  // Taxa de retencao sem os 7 dias de arrependimento, como no REGRAS.md.
  const fora7 = retencao.filter((r) => r.prazo !== 'dentro_7_dias')
  const retidas = fora7.filter((r) => r.tipo === 'ganha').reduce((s, r) => s + r.pedidos, 0)
  const decididas = fora7.reduce((s, r) => s + r.pedidos, 0)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-noite px-6 py-7 text-white">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e8d4b4_0%,#b6884c_35%,transparent_70%)] opacity-30 blur-xl" />
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-[0.35em] text-ouro">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="mt-2 text-4xl font-semibold text-white">{saudacao}, <span className="italic text-indigo-200">{eu?.nome.split(' ')[0]}</span></h1>
          <p className="mt-1 text-sm text-slate-300">O que precisa da sua atenção hoje.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo={geral ? 'Alunas ativas' : 'Alunas ativas na carteira'} valor={painel ? String(painel.ativas) : '…'}
          sub={painel ? `${painel.novas_30d} novas nos últimos 30 dias` : ''} icone={<Users size={20} />} tom="ouro" />
        <Indicador rotulo="Faturamento" valor={painel ? `R$ ${compacto(painel.faturamento)}` : '…'}
          sub={painel ? `por mês, de ${painel.com_faturamento} alunas` : ''} icone={<Wallet size={20} />} tom="noite" />
        <Indicador rotulo="Em risco" valor={painel ? String(painel.em_risco) : '…'} alerta={!!painel?.em_risco}
          sub="risco de saída ou sem contato" icone={<HeartPulse size={20} />} tom="vermelho" />
        <Indicador rotulo="Inadimplentes" valor={painel ? String(painel.inadimplentes) : '…'} alerta={!!painel?.inadimplentes}
          sub="com contrato vivo" icone={<Receipt size={20} />} tom="ambar" />
      </div>

      {painel && <Graficos painel={painel} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Funis" icone={<KanbanSquare size={16} />} link={`/funis/${funilGrafico ?? funis[0]?.id ?? ''}`}
          acoes={
            <select className="entrada w-auto py-1 text-xs" value={funilGrafico ?? funis[0]?.id ?? ''} onChange={(e) => setFunilGrafico(e.target.value)}>
              {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          }>
          {(() => {
            const fid = funilGrafico ?? funis[0]?.id
            const linhas = resumo.filter((r) => r.funil_id === fid).sort((x, y) => x.ordem - y.ordem)
            return linhas.length === 0 ? <Nada>Sem cards abertos neste funil.</Nada>
              : <BarrasH dados={linhas.map((l) => ({ rotulo: l.etapa, valor: l.cards, alerta: l.parados }))} cor="#b6884c" />
          })()}
        </Cartao>
        <Cartao titulo="Vencimentos por mês" icone={<CalendarClock size={16} />} link="/funis/renovacao">
          {meses.length === 0 ? <Nada>Sem vencimentos cadastrados.</Nada> : (
            <Colunas cor="#141110" dados={meses.map((m) => ({
              rotulo: new Date(m.mes + '-15').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
              valor: m.contratos,
              detalhe: `${new Date(m.mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · ${reais(m.faturamento_mensal)}/mês`,
            }))} formatar={(v) => `${v} contrato${v === 1 ? '' : 's'}`} />
          )}
        </Cartao>
        <Cartao titulo="Alunas por produto" icone={<Package size={16} />} link="/alunas">
          {!painel?.produtos ? <Nada>Nenhuma aluna ativa.</Nada> : (
            <BarrasH cor="#2a78d6" dados={Object.entries(painel.produtos).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ rotulo: k, valor: v }))} />
          )}
        </Cartao>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <h2 className="font-display text-2xl font-semibold text-noite">Para agir hoje</h2>
        <span className="selo bg-white text-slate-600 ring-1 ring-slate-200"><Clock size={12} className="mr-1" />{meusCards.length} cards comigo</span>
        <span className={`selo ring-1 ${parados.length ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-white text-slate-600 ring-slate-200'}`}><AlertTriangle size={12} className="mr-1" />{parados.length} parados</span>
        <span className="selo bg-white text-slate-600 ring-1 ring-slate-200"><MessageSquare size={12} className="mr-1" />{demandas.length} demandas</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Bloco titulo="Cards parados" link="/funis">
          {parados.length === 0 ? <Nada>Nenhum card parado. Bom trabalho.</Nada> : parados.slice(0, 8).map((c) => (
            <Linha key={c.id} para={`/funis/${c.funil_id}?card=${c.id}`}
              titulo={c.titulo} sub={`${funis.find((f) => f.id === c.funil_id)?.nome} · ${c.etapa.nome}`}
              direita={<span className="text-xs font-medium text-red-600">{diasDesde(c.etapa_desde)} dias</span>} />
          ))}
        </Bloco>

        <Bloco titulo="Demandas comigo" link="/demandas">
          {demandas.length === 0 ? <Nada>Nenhuma demanda em aberto com você.</Nada> : demandas.map((d) => (
            <Linha key={d.id} para={`/demandas/${d.id}`} titulo={d.titulo} sub={d.prazo ? `prazo ${data(d.prazo)}` : 'sem prazo'}
              direita={d.prioridade !== 'normal' && <Selo cor={PRIORIDADE[d.prioridade].cor}>{PRIORIDADE[d.prioridade].rotulo}</Selo>} />
          ))}
        </Bloco>

        <Bloco titulo={geral ? 'Maiores potenciais' : 'Maiores potenciais da carteira'} link="/alunas" icone={<Flame size={16} />}>
          {potenciais.length === 0 ? <Nada>Nenhuma aluna ativa.</Nada> : potenciais.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={[a.produto, a.faturamento_mensal != null ? `${reais(a.faturamento_mensal)}/mês` : null].filter(Boolean).join(' · ')}
              direita={<Potencial pontos={a.potencial} />} />
          ))}
        </Bloco>

        <Bloco titulo={`Retornos combinados${retornos.length ? ` (${retornos.length})` : ''}`} icone={<PhoneCall size={16} />}>
          {retornos.length === 0 ? <Nada>Nenhum retorno para os próximos dias.</Nada> : retornos.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={`último contato ${data(a.ultimo_contato)}${geral ? ` · CS ${nomeDe(a.cs_id)}` : ''}`}
              direita={<span className={`text-xs font-medium ${a.proximo_contato! < hoje() ? 'text-red-600' : a.proximo_contato === hoje() ? 'text-amber-700' : 'text-slate-600'}`}>
                {a.proximo_contato! < hoje() ? 'atrasado · ' : a.proximo_contato === hoje() ? 'hoje · ' : ''}{data(a.proximo_contato)}</span>} />
          ))}
        </Bloco>

        <Bloco titulo={`Há mais de 30 dias sem contato${semContato.total ? ` (${semContato.total})` : ''}`} link="/alunas">
          {semContato.lista.length === 0 ? <Nada>Todas as alunas ativas tiveram contato no último mês.</Nada> : semContato.lista.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={`${a.ultimo_contato ? `último contato ${data(a.ultimo_contato)}` : 'nenhum contato registrado'}${geral ? ` · CS ${nomeDe(a.cs_id)}` : ''}`} />
          ))}
        </Bloco>

        <Bloco titulo="Alunas em risco ou sem contato" link="/alunas">
          {risco.length === 0 ? <Nada>Ninguém sinalizado em risco.</Nada> : risco.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={`última consultoria ${data(a.ultima_consultoria)} · ${reais(a.faturamento_mensal)}/mês`}
              direita={a.saude && <Selo cor={SAUDE[a.saude].cor}>{SAUDE[a.saude].rotulo}</Selo>} />
          ))}
        </Bloco>

        <Bloco titulo="Consultorias dos próximos 14 dias">
          {agenda.length === 0 ? <Nada>Nada marcado na agenda.</Nada> : agenda.slice(0, 10).map((g) => (
            <Linha key={g.id} para={`/alunas/${g.aluna_id}`} titulo={g.nome}
              sub={`${g.numero === 0 ? 'Entrada' : `${g.numero}ª consultoria`}${geral ? ` · ${g.consultor ?? 'sem consultor'}` : ''}`}
              direita={<span className={`text-xs font-medium ${g.atrasada ? 'text-red-600' : 'text-slate-600'}`}>{g.atrasada ? 'atrasada · ' : ''}{data(g.data_prevista)}</span>} />
          ))}
        </Bloco>

        <Bloco titulo={`Inadimplentes${inadimplentes.length ? ` (${inadimplentes.length})` : ''}`} link="/alunas">
          {inadimplentes.length === 0 ? <Nada>Nenhum contrato inadimplente.</Nada> : (
            <div className="p-4 text-sm">
              {Object.entries(inadimplentes.reduce<Record<string, Inadimplente[]>>((g, i) => {
                const k = i.consultor ?? 'Sem consultor'; (g[k] ??= []).push(i); return g
              }, {})).map(([consultor, lista]) => (
                <details key={consultor} className="border-b border-slate-50 py-1.5">
                  <summary className="flex cursor-pointer justify-between"><span className="font-medium">{consultor}</span><span className="text-red-600">{lista.length}</span></summary>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {lista.map((i) => <li key={i.aluna_id + i.produto_contrato}><Link to={`/alunas/${i.aluna_id}`} className="text-indigo-700 hover:underline">{i.nome}</Link> <span className="text-xs text-slate-500">{i.produto_contrato}</span></li>)}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </Bloco>

      </div>

      {carteira.length > 0 && (
        <Bloco titulo={geral ? 'Carteiras' : 'Minha carteira'}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2">Consultor</th><th className="px-4 py-2">Alunas ativas</th><th className="px-4 py-2">Em risco</th><th className="px-4 py-2">Sem consultoria recente</th><th className="px-4 py-2">Faturamento somado</th></tr>
              </thead>
              <tbody>
                {carteira.map((c) => (
                  <tr key={c.consultor_id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{c.consultor}</td>
                    <td className="px-4 py-2">{c.alunas}</td>
                    <td className={`px-4 py-2 ${c.em_risco ? 'font-medium text-red-600' : ''}`}>{c.em_risco}</td>
                    <td className={`px-4 py-2 ${c.sem_consultoria_recente ? 'font-medium text-amber-700' : ''}`}>{c.sem_consultoria_recente}</td>
                    <td className="px-4 py-2">{reais(c.faturamento_carteira)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      {coord && (
        <>
          {decididas > 0 && (
            <div className="painel p-4 text-sm">
              <b>Retenção no sistema:</b> {Math.round((retidas / decididas) * 100)}% ({retidas} de {decididas} pedidos fora dos 7 dias terminaram com a aluna ficando).
            </div>
          )}
        </>
      )}
    </div>
  )
}

const TOM = {
  ouro: 'bg-indigo-100 text-indigo-700', noite: 'bg-noite text-indigo-200',
  vermelho: 'bg-red-100 text-red-700', ambar: 'bg-amber-100 text-amber-700',
}

function Indicador({ rotulo, valor, sub, icone, tom, alerta }: {
  rotulo: string; valor: string; sub: string; icone: React.ReactNode; tom: keyof typeof TOM; alerta?: boolean
}) {
  return (
    <div className="painel flex items-start gap-4 p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TOM[tom]}`}>{icone}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
        <div className={`mt-0.5 font-mono text-3xl font-medium ${alerta ? 'text-red-700' : 'text-noite'}`}>{valor}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

function Cartao({ titulo, icone, link, acoes, children, className = '' }: {
  titulo: string; icone?: React.ReactNode; link?: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`painel p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-noite"><span className="text-ouro">{icone}</span>{titulo}</h2>
        <div className="flex items-center gap-2">
          {acoes}
          {link && <Link to={link} className="flex items-center gap-1 text-xs text-indigo-700 hover:underline">ver <ArrowRight size={12} /></Link>}
        </div>
      </div>
      {children}
    </section>
  )
}

// Cores dos graficos. Serie: azul e laranja (paleta validada para daltonismo).
// Saude e estado, nao serie: verde, ambar, laranja, vermelho, sempre com rotulo.
const COR_SERIE = ['#2a78d6', '#eb6834']
const COR_SAUDE: [string, string, string][] = [
  ['engajada', 'Engajada', '#0ca30c'], ['renovou_upsell', 'Renovou / upsell', '#2a78d6'],
  ['oscilante', 'Oscilante', '#fab219'], ['sem_contato', 'Sem contato', '#ec835a'],
  ['risco_saida', 'Risco de saída', '#d03b3b'], ['sem_registro', 'Sem registro', '#d3c8bd'],
]

function Graficos({ painel }: { painel: Painel }) {
  const pontos = useMemo(() => painel.semanas.map((s) => ({
    rotulo: new Date(s.semana + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    valores: [s.contatos, s.consultorias],
  })), [painel])
  const totais = [painel.semanas.reduce((t, s) => t + s.contatos, 0), painel.semanas.reduce((t, s) => t + s.consultorias, 0)]
  const pot = painel.potencial
  const totalPot = pot.quente + pot.morno + pot.frio
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Cartao titulo="Atividade com as alunas" icone={<Activity size={16} />} className="lg:col-span-2"
        acoes={<span className="text-xs text-slate-500">últimas 12 semanas</span>}>
        <div className="mb-3 flex flex-wrap items-end gap-6">
          {['Contatos da CS', 'Consultorias realizadas'].map((n, i) => (
            <div key={n}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_SERIE[i] }} />{n}</div>
              <div className="font-mono text-2xl font-medium text-noite">{totais[i]}</div>
            </div>
          ))}
        </div>
        <Linhas altura={300} pontos={pontos} series={[{ nome: 'Contatos da CS', cor: COR_SERIE[0] }, { nome: 'Consultorias', cor: COR_SERIE[1] }]} />
      </Cartao>
      <Cartao titulo="Saúde da carteira" icone={<HeartPulse size={16} />}>
        <Rosca rotuloCentro="ativas" centro={painel.ativas}
          fatias={COR_SAUDE.map(([k, nome, cor]) => ({ nome, cor, valor: painel.saude?.[k] ?? 0 })).filter((f) => f.valor > 0)} />
        {totalPot > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide text-slate-500">Potencial</span>
              <Legenda itens={[{ nome: 'quente', cor: '#d03b3b', valor: pot.quente }, { nome: 'morno', cor: '#fab219', valor: pot.morno }, { nome: 'frio', cor: '#2a78d6', valor: pot.frio }]} />
            </div>
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              {[[pot.quente, '#d03b3b'], [pot.morno, '#fab219'], [pot.frio, '#2a78d6']].map(([v, c]) => Number(v) > 0 && (
                <div key={String(c)} style={{ width: `${(Number(v) / totalPot) * 100}%`, background: String(c) }} />
              ))}
            </div>
          </div>
        )}
      </Cartao>
    </div>
  )
}

function Bloco({ titulo, link, icone, children }: { titulo: string; link?: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="painel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-noite"><span className="text-ouro">{icone}</span>{titulo}</h2>
        {link && <Link to={link} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">ver <ArrowRight size={12} /></Link>}
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </section>
  )
}

function Linha({ para, titulo, sub, direita }: { para: string; titulo: string; sub: string; direita?: React.ReactNode }) {
  return (
    <Link to={para} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{titulo}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
      {direita}
    </Link>
  )
}

function Nada({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-slate-500">{children}</div>
}
