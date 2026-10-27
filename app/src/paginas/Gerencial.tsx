import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Briefcase, FileSignature, HeartHandshake, Plus, Receipt, UserCheck, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Fechamento } from '../lib/tipos'
import { NIVEL, STATUS_CASO, data, diasDesde, reais } from '../lib/util'
import { Carregando, Selo, Titulo, Vazio } from '../componentes/ui'
import { BarrasH, Colunas, compacto } from '../componentes/graficos'
import { Cartao, Indicador, Segmento } from '../componentes/painel'
import { CasoGaveta } from './CasoGaveta'

type PorProduto = { produto: string; qtd: number; contratado: number; pago: number; saldo: number }
type Painel = {
  fechamentos: {
    qtd: number; contratado: number; pago: number; saldo: number; sem_valor: number; sem_atualizacao_30d: number
    por_produto: PorProduto[]; por_mes: { mes: string; qtd: number; contratado: number; pago: number }[]
    por_status: Record<string, number>
  }
  consultores: {
    id: string; nome: string; carteira: number; por_produto: Record<string, number>; consultorias_30d: number
    sem_consultoria: number; em_risco: number; inadimplentes: number; oportunidades_90d: number
    oportunidades_ganhas_90d: number; fechamentos: number; fechamentos_valor: number
  }[]
  contratos: {
    produto: string; ativos: number; em_cancelamento: number; parados: number; cancelados: number
    encerrados: number; inadimplentes: number; vencendo_60d: number
  }[]
  cs: {
    id: string; nome: string; produto: string; alunas: number; contato_30d: number; sem_contato_30d: number
    em_risco: number; retidas_90d: number; perdidas_90d: number
  }[]
}

const ABAS = [
  { id: 'fechamentos', rotulo: 'Fechamentos', icone: FileSignature },
  { id: 'consultores', rotulo: 'Consultores', icone: UserCheck },
  { id: 'contratos', rotulo: 'Contratos', icone: Briefcase },
  { id: 'cs', rotulo: 'CS', icone: HeartHandshake },
] as const

/** Aba da coordenacao: KPIs de fechamentos, consultores, contratos e CS. */
export function Gerencial() {
  const [busca, setBusca] = useSearchParams()
  const aba = busca.get('aba') ?? 'fechamentos'
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    supabase.rpc('painel_gerencial').then(({ data: d, error }) => {
      if (error) setErro(error.message); else setPainel(d as Painel)
    })
  }, [])
  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="space-y-5">
      <Titulo>Gerencial</Titulo>
      <Segmento opcoes={ABAS.map(({ id, rotulo, icone: I }) => ({ id, rotulo, icone: <I size={15} /> }))}
        valor={aba} mudar={(id) => setBusca((b) => { b.set('aba', id); return b })} />
      {erro ? <Vazio>{erro}</Vazio> : !painel ? <Carregando /> : (
        <>
          {aba === 'fechamentos' && <AbaFechamentos painel={painel} recarregar={carregar} />}
          {aba === 'consultores' && <AbaConsultores painel={painel} />}
          {aba === 'contratos' && <AbaContratos painel={painel} />}
          {aba === 'cs' && <AbaCs painel={painel} />}
        </>
      )}
    </div>
  )
}

function AbaFechamentos({ painel, recarregar }: { painel: Painel; recarregar: () => void }) {
  const f = painel.fechamentos
  const meses = f.por_mes.map((m) => ({
    rotulo: new Date(m.mes + '-15').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    valor: m.contratado,
    detalhe: `${new Date(m.mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · ${m.qtd} fechamento${m.qtd === 1 ? '' : 's'}`,
  }))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Total contratado" valor={`R$ ${compacto(f.contratado)}`} sub={`${f.qtd} fechamentos${f.sem_valor ? `, ${f.sem_valor} sem valor` : ''}`} icone={<FileSignature size={20} />} tom="noite" />
        <Indicador rotulo="Já recebido" valor={`R$ ${compacto(f.pago)}`} sub={f.contratado ? `${Math.round((f.pago / f.contratado) * 100)}% do contratado` : ''} icone={<Wallet size={20} />} tom="ouro" />
        <Indicador rotulo="A receber" valor={`R$ ${compacto(f.saldo)}`} sub="saldo dos contratos" icone={<Receipt size={20} />} tom="ambar" />
        <Indicador rotulo="Sem atualização" valor={String(f.sem_atualizacao_30d)} alerta={f.sem_atualizacao_30d > 0} sub="casos sem registro há 30 dias" icone={<AlertTriangle size={20} />} tom="vermelho" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Contratado por mês" className="lg:col-span-2">
          {meses.length === 0 ? <p className="text-sm text-slate-500">Sem fechamentos.</p>
            : <Colunas cor="#141110" dados={meses} formatar={(v) => reais(v)} />}
        </Cartao>
        <Cartao titulo="Por produto">
          <BarrasH cor="#b6884c" formatar={(v) => reais(v)} dados={f.por_produto.map((p) => ({ rotulo: `${p.produto} (${p.qtd})`, valor: p.contratado }))} />
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(f.por_status).map(([k, n]) => <Selo key={k} cor={STATUS_CASO[k]?.cor ?? ''}>{STATUS_CASO[k]?.rotulo ?? k}: {n}</Selo>)}
          </div>
        </Cartao>
      </div>
      <ListaCasos mudou={recarregar} />
    </div>
  )
}

/** Tabela dos casos com o status de cada um. A RLS decide quem ve quais. */
export function ListaCasos({ mudou }: { mudou?: () => void }) {
  const { eu, nomeDe } = useSessao()
  const [busca, setBusca] = useSearchParams()
  const [casos, setCasos] = useState<Fechamento[] | null>(null)
  const [produto, setProduto] = useState('')
  const [status, setStatus] = useState('')
  const aberto = busca.get('caso')
  const lanca = eu?.papel === 'coordenador' || eu?.papel === 'comercial'

  const carregar = useCallback(() => {
    supabase.from('fechamento').select('*').order('data_fechamento', { ascending: false })
      .then(({ data: d }) => setCasos((d ?? []) as Fechamento[]))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => (casos ?? []).filter((c) => (!produto || c.produto === produto) && (!status || c.status === status)), [casos, produto, status])
  const abrir = (id: string | null) => setBusca((b) => { if (id) b.set('caso', id); else b.delete('caso'); return b })

  return (
    <section className="painel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="font-display text-lg font-semibold text-noite sm:text-xl">Casos In Company e Private</h2>
        <div className="flex flex-wrap gap-2">
          <select className="entrada w-auto py-1 text-xs" value={produto} onChange={(e) => setProduto(e.target.value)}>
            <option value="">Todos os produtos</option>
            {[...new Set((casos ?? []).map((c) => c.produto))].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="entrada w-auto py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CASO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
          {lanca && <button className="btn-primario py-1 text-xs" onClick={() => abrir('novo')}><Plus size={14} /> Novo fechamento</button>}
        </div>
      </div>
      {!casos ? <Carregando /> : lista.length === 0 ? <div className="p-6"><Vazio>Nenhum caso por aqui.</Vazio></div> : (
        <>
        <ul className="divide-y divide-slate-100 md:hidden">
          {lista.map((c) => {
            const dias = c.ultima_atualizacao ? diasDesde(c.ultima_atualizacao) : null
            return (
              <li key={c.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-nude" onClick={() => abrir(String(c.id))}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-noite">
                    {c.nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-noite">{c.nome}</span>
                    <span className="block truncate text-xs text-slate-500">{c.produto.replace('Moonshot ', '')} · {data(c.data_fechamento)}</span>
                    <span className={`block text-[11px] ${dias == null || dias > 30 ? 'text-red-600' : 'text-slate-400'}`}>{dias == null ? 'sem atualização' : `atualizado há ${dias} dias`}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-sm text-noite">{c.valor_total == null ? 'sem valor' : `R$ ${compacto(c.valor_total)}`}</span>
                    <Selo cor={STATUS_CASO[c.status]?.cor ?? ''}>{STATUS_CASO[c.status]?.rotulo}</Selo>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Cliente</th><th className="px-3 py-2">Fechado</th><th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">A receber</th><th className="px-3 py-2">Consultor · CS</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Nível</th><th className="px-3 py-2">Próxima ação</th><th className="px-3 py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => {
                const dias = c.ultima_atualizacao ? diasDesde(c.ultima_atualizacao) : null
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-nude/60" onClick={() => abrir(String(c.id))}>
                    <td className="min-w-52 px-4 py-2.5"><div className="font-medium text-noite">{c.nome}</div><div className="text-xs text-slate-500">{c.produto}</div></td>
                    <td className="px-3 py-2.5 text-slate-600">{data(c.data_fechamento)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{c.valor_total == null ? 'sem valor' : reais(c.valor_total)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${c.saldo > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{reais(c.saldo)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{nomeDe(c.consultor_id)}<br />{nomeDe(c.cs_id)}</td>
                    <td className="px-3 py-2.5"><Selo cor={STATUS_CASO[c.status]?.cor ?? ''}>{STATUS_CASO[c.status]?.rotulo}</Selo></td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{c.nivel ? `${c.nivel} · ${NIVEL[c.nivel]}` : 'sem avaliação'}</td>
                    <td className="max-w-56 truncate px-3 py-2.5 text-xs text-slate-600" title={c.proximas_acoes ?? ''}>{c.proximas_acoes ?? 'nenhuma'}</td>
                    <td className={`px-3 py-2.5 text-xs ${dias == null || dias > 30 ? 'text-red-600' : 'text-slate-500'}`}>{dias == null ? 'nunca' : `há ${dias} dias`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {aberto && <CasoGaveta key={aberto} id={aberto === 'novo' ? 'novo' : Number(aberto)} fechar={() => abrir(null)} mudou={() => { carregar(); mudou?.() }} />}
    </section>
  )
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: (string | number)[][] }) {
  return (
    <>
    <div className="space-y-3 md:hidden">
      {linhas.map((l, i) => (
        <div key={i} className="painel p-4">
          <div className="mb-2 font-medium text-noite">{l[0]}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {l.slice(1).map((v, j) => (
              <div key={j}>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">{cabecalho[j + 1]}</dt>
                <dd className="font-mono text-sm text-noite">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
    <div className="painel hidden overflow-x-auto md:block">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{cabecalho.map((c, i) => <th key={c} className={`px-3 py-2 ${i ? 'text-right' : 'pl-4'}`}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l, i) => (
            <tr key={i}>{l.map((v, j) => <td key={j} className={`px-3 py-2.5 ${j ? 'text-right font-mono' : 'pl-4 font-medium text-noite'}`}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function AbaConsultores({ painel }: { painel: Painel }) {
  const c = painel.consultores
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Carteira por consultor">
          <BarrasH cor="#2a78d6" dados={c.map((x) => ({ rotulo: x.nome, valor: x.carteira }))} />
        </Cartao>
        <Cartao titulo="Consultorias nos últimos 30 dias">
          <BarrasH cor="#141110" dados={c.map((x) => ({ rotulo: x.nome, valor: x.consultorias_30d }))} />
        </Cartao>
      </div>
      <Tabela cabecalho={['Consultor', 'Carteira', 'Consultorias 30d', 'Sem consultoria', 'Em risco', 'Inadimplentes', 'Oportunidades 90d', 'Ganhas 90d', 'Fechamentos', 'Valor fechado']}
        linhas={c.map((x) => [x.nome, x.carteira, x.consultorias_30d, x.sem_consultoria, x.em_risco, x.inadimplentes,
          x.oportunidades_90d, x.oportunidades_ganhas_90d, x.fechamentos, reais(x.fechamentos_valor)])} />
      <Tabela cabecalho={['Consultor', ...produtosDe(c.map((x) => x.por_produto))]}
        linhas={c.map((x) => [x.nome, ...produtosDe(c.map((y) => y.por_produto)).map((p) => x.por_produto[p] ?? 0)])} />
    </div>
  )
}

function produtosDe(mapas: Record<string, number>[]) {
  return [...new Set(mapas.flatMap((m) => Object.keys(m)))].sort()
}

function AbaContratos({ painel }: { painel: Painel }) {
  const c = painel.contratos
  const vivos = c.reduce((s, x) => s + x.ativos + x.em_cancelamento + x.parados, 0)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Contratos vivos" valor={String(vivos)} sub="ativos, parados e em cancelamento" icone={<Briefcase size={20} />} tom="noite" />
        <Indicador rotulo="Em cancelamento" valor={String(c.reduce((s, x) => s + x.em_cancelamento, 0))} sub="com a retenção" icone={<AlertTriangle size={20} />} tom="vermelho" alerta />
        <Indicador rotulo="Inadimplentes" valor={String(c.reduce((s, x) => s + x.inadimplentes, 0))} sub="com contrato vivo" icone={<Receipt size={20} />} tom="ambar" />
        <Indicador rotulo="Vencem em 60 dias" valor={String(c.reduce((s, x) => s + x.vencendo_60d, 0))} sub="renovação" icone={<FileSignature size={20} />} tom="ouro" />
      </div>
      <Tabela cabecalho={['Produto', 'Ativos', 'Em cancelamento', 'Pausados ou bloqueados', 'Inadimplentes', 'Vencem em 60 dias', 'Cancelados', 'Encerrados']}
        linhas={c.map((x) => [x.produto, x.ativos, x.em_cancelamento, x.parados, x.inadimplentes, x.vencendo_60d, x.cancelados, x.encerrados])} />
    </div>
  )
}

function AbaCs({ painel }: { painel: Painel }) {
  const nomes = [...new Set(painel.cs.map((x) => x.nome))]
  const total = (n: string, k: 'alunas' | 'contato_30d' | 'sem_contato_30d') => painel.cs.filter((x) => x.nome === n).reduce((s, x) => s + x[k], 0)
  return (
    <div className="space-y-5">
      <Cartao titulo="Alunas com contato nos últimos 30 dias">
        <BarrasH cor="#0ca30c" dados={nomes.map((n) => ({ rotulo: `${n} (${total(n, 'alunas')} alunas)`, valor: total(n, 'contato_30d') }))} />
      </Cartao>
      <Tabela cabecalho={['CS · produto', 'Alunas', 'Contato 30d', 'Sem contato 30d', 'Em risco', 'Retidas 90d', 'Perdidas 90d']}
        linhas={painel.cs.map((x) => [`${x.nome} · ${x.produto}`, x.alunas, x.contato_30d, x.sem_contato_30d, x.em_risco, x.retidas_90d, x.perdidas_90d])} />
    </div>
  )
}

/** Pagina de casos para quem acompanha (consultor, CS, comercial). */
export function Fechamentos() {
  return (
    <div className="space-y-5">
      <Titulo>Fechamentos</Titulo>
      <p className="text-sm text-slate-600">Seus casos de In Company e Private. Abra um caso para registrar a reunião, subir a transcrição e atualizar status, nível e ações.</p>
      <ListaCasos />
    </div>
  )
}
