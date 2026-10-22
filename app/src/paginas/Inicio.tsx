import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, MessageSquare, CalendarClock, ArrowRight, PhoneCall } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Demanda } from '../lib/tipos'
import { PRIORIDADE, SAUDE, data, diasDesde, hoje, reais } from '../lib/util'
import { Carregando, Selo } from '../componentes/ui'

type CardEtapa = Card & { etapa: { nome: string; alerta_dias: number | null } }
type Resumo = { funil_id: string; etapa: string; ordem: number; cards: number; parados: number; valor: number | null }
type Carteira = { consultor_id: string; consultor: string; alunas: number; em_risco: number; sem_consultoria_recente: number; faturamento_carteira: number | null }
type Mes = { mes: string; contratos: number; faturamento_mensal: number | null }
type Retencao = { prazo: string; desfecho: string; tipo: string; pedidos: number }
type AgendaItem = { id: number; aluna_id: number; nome: string; numero: number; data_prevista: string; consultor: string | null; atrasada: boolean; consultor_id: string | null }
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
  const [semContato, setSemContato] = useState<{ lista: Aluna[]; total: number }>({ lista: [], total: 0 })
  const coord = eu?.papel === 'coordenador'

  useEffect(() => {
    if (!eu) return
    let qRisco = supabase.from('aluna').select('*').in('saude', ['risco_saida', 'sem_contato'])
      .not('status_contrato', 'in', '(cancelado,encerrado)').order('ultima_consultoria', { ascending: true, nullsFirst: true }).limit(8)
    if (!coord) qRisco = qRisco.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
    // Retornos combinados ate daqui a 3 dias e quem esta ha 30 dias sem contato.
    const em3 = new Date(); em3.setDate(em3.getDate() + 3)
    const ha30 = new Date(); ha30.setDate(ha30.getDate() - 30)
    let qRetorno = supabase.from('aluna').select('*').lte('proximo_contato', em3.toLocaleDateString('sv-SE'))
      .not('status_contrato', 'in', '(cancelado,encerrado)').order('proximo_contato').limit(12)
    let qSem = supabase.from('aluna').select('*', { count: 'exact' }).eq('status_contrato', 'ativo')
      .or(`ultimo_contato.is.null,ultimo_contato.lt.${ha30.toLocaleDateString('sv-SE')}`)
      .order('ultimo_contato', { ascending: true, nullsFirst: true }).limit(8)
    if (!coord) {
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
      supabase.from('vw_renovacao_mes').select('*').order('mes').limit(6),
      coord ? supabase.from('vw_retencao_sistema').select('*') : Promise.resolve({ data: [] }),
      // A visao respeita a RLS: consultor ve a agenda da propria carteira.
      supabase.from('vw_agenda_proxima').select('*').order('data_prevista').limit(40),
      coord || eu.papel === 'cs' ? supabase.from('vw_inadimplentes').select('*').order('consultor')
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Cards comigo" valor={meusCards.length} icone={<Clock size={18} />} />
        <Numero rotulo="Parados além do prazo" valor={parados.length} icone={<AlertTriangle size={18} />} alerta={parados.length > 0} />
        <Numero rotulo="Demandas comigo" valor={demandas.length} icone={<MessageSquare size={18} />} />
        <Numero rotulo={coord ? 'Alunas em risco' : 'Em risco na carteira'} valor={risco.length} icone={<AlertTriangle size={18} />} alerta={risco.length > 0} />
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

        <Bloco titulo={`Retornos combinados${retornos.length ? ` (${retornos.length})` : ''}`} icone={<PhoneCall size={16} />}>
          {retornos.length === 0 ? <Nada>Nenhum retorno para os próximos dias.</Nada> : retornos.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={`último contato ${data(a.ultimo_contato)}${coord ? ` · CS ${nomeDe(a.cs_id)}` : ''}`}
              direita={<span className={`text-xs font-medium ${a.proximo_contato! < hoje() ? 'text-red-600' : a.proximo_contato === hoje() ? 'text-amber-700' : 'text-slate-600'}`}>
                {a.proximo_contato! < hoje() ? 'atrasado · ' : a.proximo_contato === hoje() ? 'hoje · ' : ''}{data(a.proximo_contato)}</span>} />
          ))}
        </Bloco>

        <Bloco titulo={`Há mais de 30 dias sem contato${semContato.total ? ` (${semContato.total})` : ''}`} link="/alunas">
          {semContato.lista.length === 0 ? <Nada>Todas as alunas ativas tiveram contato no último mês.</Nada> : semContato.lista.map((a) => (
            <Linha key={a.id} para={`/alunas/${a.id}`} titulo={a.nome}
              sub={`${a.ultimo_contato ? `último contato ${data(a.ultimo_contato)}` : 'nenhum contato registrado'}${coord ? ` · CS ${nomeDe(a.cs_id)}` : ''}`} />
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
              sub={`${g.numero === 0 ? 'Entrada' : `${g.numero}ª consultoria`}${coord ? ` · ${g.consultor ?? 'sem consultor'}` : ''}`}
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

        <Bloco titulo="Vencimentos dos próximos meses" link="/funis/renovacao" icone={<CalendarClock size={16} />}>
          {meses.length === 0 ? <Nada>Sem vencimentos cadastrados.</Nada> : (
            <div className="space-y-2 p-4">
              {meses.map((m) => {
                const max = Math.max(...meses.map((x) => x.contratos))
                return (
                  <div key={m.mes} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-slate-600">{new Date(m.mes + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</span>
                    <div className="h-5 flex-1 rounded bg-slate-100">
                      <div className="h-5 rounded bg-indigo-500" style={{ width: `${(m.contratos / max) * 100}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs text-slate-600">{m.contratos} · {reais(m.faturamento_mensal)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Bloco>
      </div>

      {carteira.length > 0 && (
        <Bloco titulo={coord ? 'Carteiras' : 'Minha carteira'}>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {funis.map((f) => {
              const linhas = resumo.filter((r) => r.funil_id === f.id).sort((a, b) => a.ordem - b.ordem)
              return (
                <Bloco key={f.id} titulo={f.nome} link={`/funis/${f.id}`}>
                  {linhas.length === 0 ? <Nada>Sem cards abertos.</Nada> : (
                    <div className="space-y-1 p-4 text-sm">
                      {linhas.map((l) => (
                        <div key={l.etapa} className="flex justify-between">
                          <span className="text-slate-600">{l.etapa}</span>
                          <span>{l.cards}{l.parados > 0 && <span className="ml-2 text-xs font-medium text-red-600">{l.parados} parados</span>}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Bloco>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, icone, alerta }: { rotulo: string; valor: number; icone: React.ReactNode; alerta?: boolean }) {
  return (
    <div className="painel p-4">
      <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${alerta ? 'text-red-600' : 'text-slate-500'}`}>
        <span className={alerta ? '' : 'text-ouro'}>{icone}</span>{rotulo}</div>
      <div className={`mt-1 font-display text-4xl font-semibold ${alerta ? 'text-red-700' : 'text-noite'}`}>{valor}</div>
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
