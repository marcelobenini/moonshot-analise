import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna } from '../lib/tipos'
import { FINANCEIRO, PRODUTOS, SAUDE, STATUS_CONTRATO, data, mensagemErro, reais } from '../lib/util'
import { Campo, Carregando, Erro, EscolherPessoa, Modal, Selo, Titulo, Vazio } from '../componentes/ui'

const POR_PAGINA = 50

export function Alunas() {
  const { eu, nomeDe } = useSessao()
  const nav = useNavigate()
  const [lista, setLista] = useState<Aluna[] | null>(null)
  const [total, setTotal] = useState(0)
  const [termo, setTermo] = useState('')
  const [status, setStatus] = useState('vivos')
  const [saude, setSaude] = useState('')
  const [produto, setProduto] = useState('')
  const [financeiro, setFinanceiro] = useState('')
  const [minhas, setMinhas] = useState(eu?.papel === 'consultor' || eu?.papel === 'cs')
  const [pagina, setPagina] = useState(0)
  const [nova, setNova] = useState(false)
  const podeCriar = ['coordenador', 'cs', 'comercial', 'retencao'].includes(eu?.papel ?? '')

  useEffect(() => { setPagina(0) }, [termo, status, saude, minhas, produto, financeiro])

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = supabase.from('aluna').select('*', { count: 'exact' })
      const s = termo.trim().replace(/[%,()]/g, ' ')
      if (s) q = q.or(`nome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%,empresa.ilike.%${s}%`)
      if (status === 'vivos') q = q.not('status_contrato', 'in', '(cancelado,encerrado)')
      else if (status) q = q.eq('status_contrato', status)
      if (saude) q = q.eq('saude', saude)
      if (produto) q = q.eq('produto', produto)
      if (financeiro) q = q.eq('status_financeiro', financeiro)
      if (minhas && eu) q = q.or(`consultor_id.eq.${eu.id},cs_id.eq.${eu.id}`)
      const { data: d, count } = await q.order('nome').range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
      setLista((d ?? []) as Aluna[]); setTotal(count ?? 0)
    }, 200)
    return () => clearTimeout(t)
  }, [termo, status, saude, minhas, pagina, eu, produto, financeiro])

  return (
    <div>
      <Titulo acoes={podeCriar && <button className="btn-primario" onClick={() => setNova(true)}><Plus size={16} /> Nova aluna</button>}>
        Alunas
      </Titulo>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="entrada pl-9" placeholder="Nome, e-mail, telefone ou empresa" value={termo} onChange={(e) => setTermo(e.target.value)} />
        </div>
        <select className="entrada w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="vivos">Contratos vivos</option>
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="pendente">Pendente</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="pausado">Pausado</option>
          <option value="encerrado">Encerrado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select className="entrada w-auto" value={saude} onChange={(e) => setSaude(e.target.value)}>
          <option value="">Qualquer saúde</option>
          {Object.entries(SAUDE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select className="entrada w-auto" value={produto} onChange={(e) => setProduto(e.target.value)}>
          <option value="">Qualquer produto</option>
          {PRODUTOS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="entrada w-auto" value={financeiro} onChange={(e) => setFinanceiro(e.target.value)}>
          <option value="">Qualquer financeiro</option>
          {Object.entries(FINANCEIRO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={minhas} onChange={(e) => setMinhas(e.target.checked)} /> Minha carteira
        </label>
      </div>

      {lista === null ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhuma aluna encontrada.</Vazio> : (
        <div className="painel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Aluna</th>
                <th className="px-4 py-2.5">Produto</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Consultor</th>
                <th className="px-4 py-2.5">Saúde</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Faturamento</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Última consultoria</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Último contato</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Término</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id} onClick={() => nav(`/alunas/${a.id}`)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{a.nome}</div>
                    <div className="text-xs text-slate-500">{a.empresa ?? a.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-2.5">{a.produto ?? '—'}
                    <div className="mt-0.5 flex gap-1">
                      {a.status_contrato !== 'ativo' && <Selo cor={STATUS_CONTRATO[a.status_contrato]?.cor ?? ''}>{STATUS_CONTRATO[a.status_contrato]?.rotulo}</Selo>}
                      {a.status_financeiro === 'inadimplente' && <Selo cor={FINANCEIRO.inadimplente.cor}>Inadimplente</Selo>}
                    </div></td>
                  <td className="hidden px-4 py-2.5 md:table-cell">{a.consultor_id ? nomeDe(a.consultor_id) : <span className="text-slate-400">{a.consultor_planilha ?? '—'}</span>}</td>
                  <td className="px-4 py-2.5">{a.saude ? <Selo cor={SAUDE[a.saude].cor}>{SAUDE[a.saude].rotulo}</Selo> : <span className="text-slate-400">—</span>}</td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">{reais(a.faturamento_mensal)}</td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">{data(a.ultima_consultoria)}</td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">{data(a.ultimo_contato)}</td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">{data(a.termino)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
            <span>{total} alunas</span>
            <div className="flex gap-1">
              <button className="btn-fantasma px-2 py-1" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
              <button className="btn-fantasma px-2 py-1" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
            </div>
          </div>
        </div>
      )}
      {nova && <AlunaForm fechar={() => setNova(false)} salvo={(id) => nav(`/alunas/${id}`)} />}
    </div>
  )
}

// So o que o formulario edita. Mandar a linha inteira de volta incluiria
// `nome_norm`, que e coluna gerada e o Postgres recusa.
const EDITAVEIS: (keyof Aluna)[] = ['nome', 'telefone', 'email', 'empresa', 'ramo', 'cidade', 'uf', 'produto', 'turma',
  'inicio', 'termino', 'status_contrato', 'status_financeiro', 'faturamento_mensal', 'funcionarios',
  'consultor_id', 'cs_id', 'tamanho_kit', 'telefone2', 'jaqueta', 'link_notion', 'forma_pagamento']

type Duplicata = { id: number; nome: string; email: string | null; telefone: string | null; motivo: string }

export function AlunaForm({ aluna, fechar, salvo }: { aluna?: Aluna; fechar: () => void; salvo: (id: number) => void }) {
  const { eu } = useSessao()
  const [f, setF] = useState<Partial<Aluna>>(aluna ?? { status_contrato: 'ativo', cs_id: eu?.papel === 'cs' ? eu.id : null })
  const [erro, setErro] = useState<string | null>(null)
  const [duplicatas, setDuplicatas] = useState<Duplicata[] | null>(null)
  const redistribui = eu?.papel === 'coordenador' || eu?.papel === 'cs'
  const muda = (k: keyof Aluna, v: unknown) => setF((x) => ({ ...x, [k]: v === '' ? null : v }))

  async function salvar(e: FormEvent, mesmoAssim = false) {
    e.preventDefault()
    setErro(null)
    // Antes de criar, pergunta ao banco se ela ja existe. As 95 duplicatas da
    // base nasceram exatamente de cadastro sem essa pergunta.
    if (!aluna && !mesmoAssim) {
      const { data: d } = await supabase.rpc('possiveis_duplicatas', { p_nome: f.nome ?? '', p_email: f.email ?? null, p_telefone: f.telefone ?? null })
      if (d && d.length) { setDuplicatas(d as Duplicata[]); return }
    }
    const campos = Object.fromEntries(EDITAVEIS.filter((k) => k in f).map((k) => [k, f[k]]))
    const r = aluna
      ? await supabase.from('aluna').update(campos).eq('id', aluna.id).select('id').single()
      : await supabase.from('aluna').insert(campos).select('id').single()
    if (r.error) { setErro(mensagemErro(r.error)); return }
    salvo(r.data.id)
    fechar()
  }

  if (duplicatas) {
    return (
      <Modal titulo="Ela já pode estar cadastrada" aberto fechar={fechar}>
        <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle size={18} className="shrink-0" />
            <span>Encontramos cadastros parecidos. Se for a mesma pessoa, abra o cadastro existente em vez de criar outro.</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {duplicatas.map((d) => (
              <li key={d.id}>
                <Link to={`/alunas/${d.id}`} onClick={fechar} className="block px-3 py-2 hover:bg-slate-50">
                  <div className="text-sm font-medium">{d.nome}</div>
                  <div className="text-xs text-slate-500">{d.motivo} · {[d.email, d.telefone].filter(Boolean).join(' · ')}</div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button className="btn-secundario" onClick={() => setDuplicatas(null)}>Voltar</button>
            <button className="btn-primario" onClick={(e) => salvar(e, true)}>É outra pessoa, cadastrar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo={aluna ? 'Editar aluna' : 'Nova aluna'} aberto fechar={fechar} largo>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Campo rotulo="Nome completo *"><input className="entrada" required value={f.nome ?? ''} onChange={(e) => muda('nome', e.target.value)} /></Campo></div>
          <Campo rotulo="Telefone"><input className="entrada" value={f.telefone ?? ''} onChange={(e) => muda('telefone', e.target.value)} /></Campo>
          <Campo rotulo="E-mail"><input className="entrada" type="email" value={f.email ?? ''} onChange={(e) => muda('email', e.target.value)} /></Campo>
          <Campo rotulo="Telefone secundário"><input className="entrada" value={f.telefone2 ?? ''} onChange={(e) => muda('telefone2', e.target.value)} /></Campo>
          <Campo rotulo="Forma de pagamento"><input className="entrada" value={f.forma_pagamento ?? ''} onChange={(e) => muda('forma_pagamento', e.target.value)} /></Campo>
          <Campo rotulo="Empresa"><input className="entrada" value={f.empresa ?? ''} onChange={(e) => muda('empresa', e.target.value)} /></Campo>
          <Campo rotulo="Ramo"><input className="entrada" value={f.ramo ?? ''} onChange={(e) => muda('ramo', e.target.value)} /></Campo>
          <Campo rotulo="Cidade"><input className="entrada" value={f.cidade ?? ''} onChange={(e) => muda('cidade', e.target.value)} /></Campo>
          <Campo rotulo="UF"><input className="entrada" maxLength={2} value={f.uf ?? ''} onChange={(e) => muda('uf', e.target.value.toUpperCase())} /></Campo>
          <Campo rotulo="Produto">
            <select className="entrada" value={f.produto ?? ''} onChange={(e) => muda('produto', e.target.value)}>
              <option value="">—</option>
              {PRODUTOS.map((p) => <option key={p}>{p}</option>)}
              {f.produto && !PRODUTOS.includes(f.produto) && <option>{f.produto}</option>}
            </select>
          </Campo>
          <Campo rotulo="Turma"><input className="entrada" value={f.turma ?? ''} onChange={(e) => muda('turma', e.target.value)} /></Campo>
          <Campo rotulo="Início do contrato"><input className="entrada" type="date" value={f.inicio ?? ''} onChange={(e) => muda('inicio', e.target.value)} /></Campo>
          <Campo rotulo="Término do contrato" dica="O card de renovação nasce sozinho 120 dias antes."><input className="entrada" type="date" value={f.termino ?? ''} onChange={(e) => muda('termino', e.target.value)} /></Campo>
          <Campo rotulo="Status do contrato">
            <select className="entrada" value={f.status_contrato ?? 'ativo'} onChange={(e) => muda('status_contrato', e.target.value)}>
              {['ativo', 'pendente', 'bloqueado', 'pausado', 'encerrado', 'cancelado'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Status financeiro">
            <select className="entrada" value={f.status_financeiro ?? ''} onChange={(e) => muda('status_financeiro', e.target.value)}>
              <option value="">—</option>
              {Object.entries(FINANCEIRO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              {f.status_financeiro && !FINANCEIRO[f.status_financeiro] && <option>{f.status_financeiro}</option>}
            </select>
          </Campo>
          <Campo rotulo="Faturamento mensal (R$)"><input className="entrada" type="number" min="0" value={f.faturamento_mensal ?? ''} onChange={(e) => muda('faturamento_mensal', e.target.value === '' ? null : Number(e.target.value))} /></Campo>
          <Campo rotulo="Nº de funcionários"><input className="entrada" type="number" min="0" value={f.funcionarios ?? ''} onChange={(e) => muda('funcionarios', e.target.value === '' ? null : Number(e.target.value))} /></Campo>
          <Campo rotulo="Consultor estratégico">
            {redistribui ? <EscolherPessoa valor={f.consultor_id ?? null} mudar={(v) => muda('consultor_id', v)} papeis={['consultor', 'coordenador']} />
              : <input className="entrada" disabled value="Definido pela coordenação/CS" />}
          </Campo>
          <Campo rotulo="CS responsável">
            {redistribui ? <EscolherPessoa valor={f.cs_id ?? null} mudar={(v) => muda('cs_id', v)} papeis={['cs', 'coordenador']} />
              : <input className="entrada" disabled value="Definido pela coordenação/CS" />}
          </Campo>
          <Campo rotulo="Jaqueta"><input className="entrada" placeholder="Tamanho ou entregue" value={f.jaqueta ?? ''} onChange={(e) => muda('jaqueta', e.target.value)} /></Campo>
          <Campo rotulo="Link do Notion"><input className="entrada" value={f.link_notion ?? ''} onChange={(e) => muda('link_notion', e.target.value)} /></Campo>
          <Campo rotulo="Tamanho do pijama">
            <select className="entrada" value={f.tamanho_kit ?? ''} onChange={(e) => muda('tamanho_kit', e.target.value)}>
              <option value="">—</option>
              {['PP', 'P', 'M', 'G', 'GG', 'GGG', 'XG', 'XXG'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Campo>
        </div>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
