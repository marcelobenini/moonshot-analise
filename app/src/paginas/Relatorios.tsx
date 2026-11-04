import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { AgendaConsultoria, Aluna, FaturamentoMes, Saude } from '../lib/tipos'
import { FINANCEIRO, PRODUTOS, SAUDE, STATUS_CONTRATO, hoje } from '../lib/util'
import { useConsultores, filtrarConsultor } from '../lib/consultores'
import { baixarPdf, baixarXlsx, formatar, type Coluna, type Planilha } from '../lib/exportar'
import { Carregando, Erro, Titulo, Vazio } from '../componentes/ui'

type TipoRel = 'fichas' | 'faturamento' | 'evolucao' | 'mensal' | 'saude' | 'consultorias'

const RELATORIOS: { id: TipoRel; nome: string; descricao: string }[] = [
  { id: 'fichas', nome: 'Fichas das alunas', descricao: 'Cadastro completo de cada aluna filtrada.' },
  { id: 'faturamento', nome: 'Maiores faturamentos', descricao: 'Ranking pelo faturamento atual, com rentabilidade.' },
  { id: 'evolucao', nome: 'Evolução do faturamento', descricao: 'Primeiro e último mês informados no período e quanto cresceu.' },
  { id: 'mensal', nome: 'Faturamento mês a mês', descricao: 'Uma coluna por mês do período.' },
  { id: 'saude', nome: 'Saúde da carteira', descricao: 'Quantas alunas em cada saúde, por consultor.' },
  { id: 'consultorias', nome: 'Consultorias', descricao: 'Realizadas, atrasadas e próxima prevista de cada aluna.' },
]

interface Filtros {
  termo: string; status: string; produto: string; consultor: string; cs: string; saude: string; financeiro: string
  fatMin: string; fatMax: string; rentMin: string; de: string; ate: string; limite: string
}

const mesMenos = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const INICIAL: Filtros = { termo: '', status: 'vivos', produto: '', consultor: '', cs: '', saude: '', financeiro: '', fatMin: '', fatMax: '', rentMin: '', de: mesMenos(5), ate: mesMenos(0), limite: '50' }
const num = (s: string) => s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.'))

async function todas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const saida: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data: d, error } = await montar(i, i + 999)
    if (error) throw error
    const lote = (d ?? []) as T[]
    saida.push(...lote)
    if (lote.length < 1000) return saida
  }
}

type Linha = Record<string, string | number | null | undefined>
interface Resultado { colunas: Coluna<Linha>[]; linhas: Linha[]; extra?: Planilha<Linha>; nota?: string }

export function Relatorios() {
  const { nomeDe, equipe } = useSessao()
  const consultores = useConsultores()
  const [tipo, setTipo] = useState<TipoRel>('fichas')
  const [f, setF] = useState<Filtros>(INICIAL)
  const [res, setRes] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<'' | 'xlsx' | 'pdf'>('')
  const muda = (k: keyof Filtros, v: string) => setF((x) => ({ ...x, [k]: v }))
  const usaPeriodo = tipo === 'evolucao' || tipo === 'mensal'
  const rel = RELATORIOS.find((r) => r.id === tipo)!

  useEffect(() => {
    let vivo = true
    setRes(null); setErro(null)
    const t = setTimeout(async () => {
      try {
        const r = await gerar(tipo, f, nomeDe)
        if (vivo) setRes(r)
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui gerar o relatório.') }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [tipo, f, nomeDe])

  const descricaoFiltros = useMemo(() => {
    const partes: string[] = []
    partes.push(f.status === 'vivos' ? 'contratos vivos' : f.status ? STATUS_CONTRATO[f.status]?.rotulo ?? f.status : 'todos os status')
    if (f.produto) partes.push(f.produto)
    if (f.consultor) partes.push(`consultor ${consultores.find((c) => c.valor === f.consultor)?.rotulo ?? ''}`)
    if (f.cs) partes.push(f.cs === 'sem' ? 'sem CS' : `CS ${nomeDe(f.cs)}`)
    if (f.saude) partes.push(SAUDE[f.saude as Saude]?.rotulo ?? f.saude)
    if (f.financeiro) partes.push(FINANCEIRO[f.financeiro]?.rotulo ?? f.financeiro)
    if (f.fatMin) partes.push(`faturamento a partir de R$ ${f.fatMin}`)
    if (f.fatMax) partes.push(`faturamento até R$ ${f.fatMax}`)
    if (f.rentMin) partes.push(`rentabilidade a partir de ${f.rentMin}%`)
    if (usaPeriodo) partes.push(`de ${formatar(f.de, 'data')} a ${formatar(f.ate, 'data')}`)
    if (tipo === 'faturamento' && f.limite) partes.push(`top ${f.limite}`)
    if (f.termo) partes.push(`busca "${f.termo}"`)
    return partes.join(' · ')
  }, [f, tipo, usaPeriodo, consultores, nomeDe])

  async function excel() {
    if (!res) return
    setBaixando('xlsx')
    try { await baixarXlsx(rel.nome, [{ aba: rel.nome, colunas: res.colunas, linhas: res.linhas }, ...(res.extra ? [res.extra] : [])]) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falhou ao gerar o Excel.') }
    finally { setBaixando('') }
  }
  async function pdf() {
    if (!res) return
    setBaixando('pdf')
    try {
      await baixarPdf(rel.nome, rel.nome, `${descricaoFiltros} · ${res.linhas.length} linhas`, [
        { colunas: res.colunas, linhas: res.linhas },
        ...(res.extra ? [{ titulo: res.extra.aba, colunas: res.extra.colunas, linhas: res.extra.linhas }] : []),
      ])
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falhou ao gerar o PDF.') }
    finally { setBaixando('') }
  }

  return (
    <div>
      <Titulo acoes={<>
        <button className="btn-secundario" disabled={!res || !!baixando} onClick={excel}><FileSpreadsheet size={16} /> {baixando === 'xlsx' ? 'Gerando…' : 'Baixar Excel'}</button>
        <button className="btn-primario" disabled={!res || !!baixando} onClick={pdf}><FileText size={16} /> {baixando === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</button>
      </>}>Relatórios</Titulo>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {RELATORIOS.map((r) => (
          <button key={r.id} onClick={() => setTipo(r.id)}
            className={`shrink-0 rounded-2xl border px-4 py-2.5 text-left transition ${tipo === r.id ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <div className="text-sm font-semibold text-noite">{r.nome}</div>
            <div className="max-w-[14rem] text-xs text-slate-500">{r.descricao}</div>
          </button>
        ))}
      </div>

      <div className="painel mb-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <input className="entrada col-span-2" placeholder="Nome, empresa ou e-mail" value={f.termo} onChange={(e) => muda('termo', e.target.value)} />
        <select className="entrada" value={f.status} onChange={(e) => muda('status', e.target.value)}>
          <option value="vivos">Contratos vivos</option>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select className="entrada" value={f.produto} onChange={(e) => muda('produto', e.target.value)}>
          <option value="">Qualquer programa</option>
          {PRODUTOS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="entrada" value={f.consultor} onChange={(e) => muda('consultor', e.target.value)}>
          <option value="">Qualquer consultor</option>
          {consultores.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
        <select className="entrada" value={f.cs} onChange={(e) => muda('cs', e.target.value)}>
          <option value="">Qualquer CS</option>
          {equipe.filter((p) => p.ativo && p.papel === 'cs').map((p) => <option key={p.id} value={p.id}>CS {p.nome}</option>)}
          <option value="sem">Sem CS</option>
        </select>
        <select className="entrada" value={f.saude} onChange={(e) => muda('saude', e.target.value)}>
          <option value="">Qualquer saúde</option>
          {Object.entries(SAUDE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select className="entrada" value={f.financeiro} onChange={(e) => muda('financeiro', e.target.value)}>
          <option value="">Qualquer financeiro</option>
          {Object.entries(FINANCEIRO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <input className="entrada" inputMode="decimal" placeholder="Faturamento mín. R$" value={f.fatMin} onChange={(e) => muda('fatMin', e.target.value)} />
        <input className="entrada" inputMode="decimal" placeholder="Faturamento máx. R$" value={f.fatMax} onChange={(e) => muda('fatMax', e.target.value)} />
        <input className="entrada" inputMode="decimal" placeholder="Rentabilidade mín. %" value={f.rentMin} onChange={(e) => muda('rentMin', e.target.value)} />
        {usaPeriodo && <>
          <label className="flex items-center gap-2 text-xs text-slate-500">De <input className="entrada" type="month" value={f.de} onChange={(e) => muda('de', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs text-slate-500">Até <input className="entrada" type="month" value={f.ate} onChange={(e) => muda('ate', e.target.value)} /></label>
        </>}
        {tipo === 'faturamento' && (
          <select className="entrada" value={f.limite} onChange={(e) => muda('limite', e.target.value)}>
            {['10', '20', '50', '100'].map((n) => <option key={n} value={n}>Top {n}</option>)}
            <option value="">Todas</option>
          </select>
        )}
        <button className="btn-fantasma text-sm" onClick={() => setF(INICIAL)}>Limpar filtros</button>
      </div>

      <Erro msg={erro} />
      {!res && !erro ? <Carregando /> : res && (
        <>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-500">
            <span>{res.linhas.length} {res.linhas.length === 1 ? 'linha' : 'linhas'} · {descricaoFiltros}</span>
            {res.linhas.length > 200 && <span>Mostrando as 200 primeiras; o arquivo leva todas.</span>}
          </div>
          {res.nota && <p className="mb-2 text-xs text-slate-500">{res.nota}</p>}
          {res.linhas.length === 0 ? <Vazio>Nenhuma aluna com esses filtros.</Vazio> : (
            <div className="painel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>{res.colunas.map((c) => <th key={c.titulo} className={`whitespace-nowrap px-3 py-2 ${['reais', 'numero', 'pct'].includes(c.tipo ?? '') ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr>
                </thead>
                <tbody>
                  {res.linhas.slice(0, 200).map((l, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {res.colunas.map((c) => <td key={c.titulo} className={`whitespace-nowrap px-3 py-1.5 ${['reais', 'numero', 'pct'].includes(c.tipo ?? '') ? 'text-right font-mono' : ''}`}>{formatar(c.valor(l), c.tipo)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

async function buscarAlunas(f: Filtros): Promise<Aluna[]> {
  return todas<Aluna>((de, ate) => {
    let q = supabase.from('aluna').select('*')
    const s = f.termo.trim().replace(/[%,()]/g, ' ')
    if (s) q = q.or(`nome.ilike.%${s}%,email.ilike.%${s}%,empresa.ilike.%${s}%`)
    if (f.status === 'vivos') q = q.not('status_contrato', 'in', '(cancelado,encerrado)')
    else if (f.status) q = q.eq('status_contrato', f.status)
    if (f.produto) q = q.eq('produto', f.produto)
    if (f.saude) q = q.eq('saude', f.saude)
    if (f.financeiro) q = q.eq('status_financeiro', f.financeiro)
    if (f.cs === 'sem') q = q.is('cs_id', null)
    else if (f.cs) q = q.eq('cs_id', f.cs)
    q = filtrarConsultor(q, f.consultor)
    const min = num(f.fatMin), max = num(f.fatMax), rent = num(f.rentMin)
    if (min != null && !isNaN(min)) q = q.gte('faturamento_mensal', min)
    if (max != null && !isNaN(max)) q = q.lte('faturamento_mensal', max)
    if (rent != null && !isNaN(rent)) q = q.gte('rentabilidade', rent)
    return q.order('nome').range(de, ate)
  })
}

async function porAluna<T extends { aluna_id: number }>(tabela: string, ids: number[], desdeMes?: string): Promise<T[]> {
  const saida: T[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    const r = await todas<T>((de, ate) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from(tabela).select('*').in('aluna_id', lote)
      if (desdeMes) q = q.gte('mes', desdeMes)
      return q.order('id').range(de, ate)
    })
    saida.push(...r)
  }
  return saida
}

async function gerar(tipo: TipoRel, f: Filtros, nomeDe: (id: string | null | undefined) => string): Promise<Resultado> {
  const alunas = await buscarAlunas(f)
  const consultor = (a: Aluna) => a.consultor_id ? nomeDe(a.consultor_id) : a.consultor_planilha ?? ''
  const cs = (a: Aluna) => a.cs_id ? nomeDe(a.cs_id) : a.cs_planilha ?? ''
  const base = (a: Aluna): Linha => ({
    nome: a.nome, programa: a.produto, turma: a.turma, consultor: consultor(a), cs: cs(a),
    status: STATUS_CONTRATO[a.status_contrato]?.rotulo ?? a.status_contrato,
    financeiro: a.status_financeiro ? FINANCEIRO[a.status_financeiro]?.rotulo ?? a.status_financeiro : '',
    saude: a.saude ? SAUDE[a.saude].rotulo : '', faturamento: a.faturamento_mensal, rentabilidade: a.rentabilidade,
  })
  const c = (titulo: string, chave: string, tipo?: Coluna<Linha>['tipo'], largura?: number): Coluna<Linha> => ({ titulo, valor: (l) => l[chave], tipo, largura })
  const ident = [c('Aluna', 'nome', undefined, 32), c('Programa', 'programa', undefined, 20), c('Consultor', 'consultor', undefined, 18)]

  if (tipo === 'fichas') {
    return {
      colunas: [...ident, c('CS', 'cs', undefined, 16), c('Turma', 'turma'), c('Status', 'status'), c('Financeiro', 'financeiro'), c('Saúde', 'saude'),
        c('Telefone', 'telefone', undefined, 16), c('E-mail', 'email', undefined, 28), c('Cidade', 'cidade'), c('UF', 'uf'), c('Empresa', 'empresa', undefined, 22), c('Ramo', 'ramo'),
        c('Faturamento', 'faturamento', 'reais', 14), c('Rentabilidade', 'rentabilidade', 'pct'), c('Início', 'inicio', 'data', 12), c('Término', 'termino', 'data', 12),
        c('Última consultoria', 'ultima', 'data', 14), c('Último contato', 'contato', 'data', 14)],
      linhas: alunas.map((a) => ({ ...base(a), telefone: a.telefone, email: a.email, cidade: a.cidade, uf: a.uf, empresa: a.empresa, ramo: a.ramo,
        inicio: a.inicio, termino: a.termino, ultima: a.ultima_consultoria, contato: a.ultimo_contato })),
    }
  }

  if (tipo === 'faturamento') {
    const ord = alunas.filter((a) => a.faturamento_mensal != null).sort((a, b) => Number(b.faturamento_mensal) - Number(a.faturamento_mensal))
    const lim = f.limite ? ord.slice(0, Number(f.limite)) : ord
    return {
      colunas: [c('#', 'pos', 'numero', 5), ...ident, c('Status', 'status'), c('Saúde', 'saude'), c('Faturamento', 'faturamento', 'reais', 14), c('Rentabilidade', 'rentabilidade', 'pct'), c('Cidade', 'cidade'), c('Ramo', 'ramo')],
      linhas: lim.map((a, i) => ({ ...base(a), pos: i + 1, cidade: [a.cidade, a.uf].filter(Boolean).join(' / '), ramo: a.ramo })),
      nota: `${alunas.length - ord.length} alunas filtradas não têm faturamento informado.`,
    }
  }

  if (tipo === 'saude') {
    const grupos = new Map<string, Aluna[]>()
    for (const a of alunas) { const k = consultor(a) || 'Sem consultor'; grupos.set(k, [...(grupos.get(k) ?? []), a]) }
    const chaves = Object.keys(SAUDE) as Saude[]
    const linhas: Linha[] = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([k, l]) => ({
      consultor: k, total: l.length, ...Object.fromEntries(chaves.map((s) => [s, l.filter((a) => a.saude === s).length])),
      sem: l.filter((a) => !a.saude).length,
      risco: l.length ? Math.round((l.filter((a) => a.saude === 'risco_saida' || a.saude === 'sem_contato').length / l.length) * 1000) / 10 : 0,
      fat: l.reduce((t, a) => t + Number(a.faturamento_mensal ?? 0), 0),
    }))
    return {
      colunas: [c('Consultor', 'consultor', undefined, 22), c('Alunas', 'total', 'numero'), ...chaves.map((s) => c(SAUDE[s].rotulo, s, 'numero')), c('Sem registro', 'sem', 'numero'), c('% em risco', 'risco', 'pct'), c('Faturamento da carteira', 'fat', 'reais', 18)],
      linhas,
      extra: { aba: 'Alunas', colunas: [...ident, c('Saúde', 'saude'), c('Status', 'status'), c('Última consultoria', 'ultima', 'data'), c('Faturamento', 'faturamento', 'reais')],
        linhas: alunas.map((a) => ({ ...base(a), ultima: a.ultima_consultoria })) },
    }
  }

  const ids = alunas.map((a) => a.id)

  if (tipo === 'consultorias') {
    const agenda = await porAluna<AgendaConsultoria>('consultoria_agenda', ids)
    const h = hoje()
    return {
      colunas: [...ident, c('Status', 'status'), c('Saúde', 'saude'), c('Realizadas', 'feitas', 'numero'), c('Não realizadas', 'nao', 'numero'), c('Atrasadas', 'atrasadas', 'numero'),
        c('Última consultoria', 'ultima', 'data', 14), c('Próxima prevista', 'proxima', 'data', 14), c('Próxima etapa', 'etapa')],
      linhas: alunas.map((a) => {
        const g = agenda.filter((x) => x.aluna_id === a.id)
        const abertas = g.filter((x) => !x.realizada_em && x.situacao !== 'cancelada' && x.data_prevista).sort((x, y) => x.data_prevista!.localeCompare(y.data_prevista!))
        const prox = abertas.find((x) => x.data_prevista! >= h) ?? abertas[0]
        return { ...base(a), feitas: g.filter((x) => x.realizada_em).length, nao: g.filter((x) => x.situacao === 'nao_realizada').length,
          atrasadas: abertas.filter((x) => x.data_prevista! < h).length, ultima: a.ultima_consultoria, proxima: prox?.data_prevista,
          etapa: prox ? (prox.numero === 0 ? 'Entrada' : `${prox.numero}ª consultoria`) : '' }
      }),
    }
  }

  // Evolução e mês a mês usam o histórico mensal.
  const de = `${f.de || mesMenos(5)}-01`, ate = `${f.ate || mesMenos(0)}-01`
  const meses = await porAluna<FaturamentoMes>('faturamento_mes', ids, de)
  const noPeriodo = meses.filter((m) => m.mes >= de && m.mes <= ate)
  const doAluno = (id: number) => noPeriodo.filter((m) => m.aluna_id === id).sort((x, y) => x.mes.localeCompare(y.mes))

  if (tipo === 'mensal') {
    const lista: string[] = []
    for (let d = new Date(de + 'T12:00:00'); d <= new Date(ate + 'T12:00:00'); d.setMonth(d.getMonth() + 1)) lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    const comHist = alunas.filter((a) => doAluno(a.id).length)
    return {
      colunas: [...ident, ...lista.map((m) => c(formatar(m, 'data'), `m${m}`, 'reais', 12)), c('Rentab. no último mês', 'rent', 'pct', 12)],
      linhas: comHist.map((a) => {
        const h = doAluno(a.id)
        const ultRent = [...h].reverse().find((x) => x.rentabilidade != null)
        return { ...base(a), ...Object.fromEntries(lista.map((m) => [`m${m}`, h.find((x) => x.mes.startsWith(m))?.faturamento ?? null])), rent: ultRent?.rentabilidade }
      }),
      nota: `${alunas.length - comHist.length} alunas filtradas não têm faturamento informado no período.`,
    }
  }

  // evolucao
  const linhas = alunas.map((a) => {
    const h = doAluno(a.id).filter((x) => x.faturamento != null)
    if (!h.length) return null
    const p = h[0], u = h[h.length - 1]
    const r = doAluno(a.id).filter((x) => x.rentabilidade != null)
    const cresc = h.length > 1 && Number(p.faturamento) > 0 ? Math.round(((Number(u.faturamento) - Number(p.faturamento)) / Number(p.faturamento)) * 1000) / 10 : null
    return { ...base(a), mes1: p.mes.slice(0, 7), fat1: p.faturamento, mes2: u.mes.slice(0, 7), fat2: u.faturamento, cresc,
      dif: h.length > 1 ? Number(u.faturamento) - Number(p.faturamento) : null, rent1: r[0]?.rentabilidade, rent2: r[r.length - 1]?.rentabilidade, meses: h.length }
  }).filter(Boolean) as Linha[]
  linhas.sort((x, y) => Number(y.cresc ?? -1e9) - Number(x.cresc ?? -1e9))
  return {
    colunas: [...ident, c('Primeiro mês', 'mes1', 'data'), c('Faturamento inicial', 'fat1', 'reais', 14), c('Último mês', 'mes2', 'data'), c('Faturamento atual', 'fat2', 'reais', 14),
      c('Crescimento', 'cresc', 'pct'), c('Diferença', 'dif', 'reais', 14), c('Rentab. inicial', 'rent1', 'pct'), c('Rentab. atual', 'rent2', 'pct'), c('Meses informados', 'meses', 'numero')],
    linhas,
    nota: `${alunas.length - linhas.length} alunas filtradas não têm faturamento informado no período.`,
  }
}
