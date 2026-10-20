import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { AgendaConsultoria, Aluna, Contrato, NotaAluna, Participante } from '../lib/tipos'
import { FINANCEIRO, NOTA, PRODUTOS, data, dataHora, hoje, mensagemErro } from '../lib/util'
import { Campo, Erro, Modal, Selo } from '../componentes/ui'

// Contratos: uma linha por compra. O que a planilha resolvia repetindo a
// aluna em abas de turma diferentes.
export function Contratos({ aluna, mudou }: { aluna: Aluna; mudou: () => void }) {
  const { eu } = useSessao()
  const [lista, setLista] = useState<Contrato[]>([])
  const [editando, setEditando] = useState<Partial<Contrato> | null>(null)
  const pode = eu?.papel === 'coordenador' || eu?.papel === 'cs'
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('contrato').select('*').eq('aluna_id', aluna.id).order('termino', { ascending: false, nullsFirst: false })
    setLista((d ?? []) as Contrato[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar])

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Contratos</h2>
        {pode && <button className="btn-fantasma p-1" onClick={() => setEditando({ aluna_id: aluna.id, produto: 'Moonshot Club', status: 'ativo' })} aria-label="Novo contrato"><Plus size={16} /></button>}
      </div>
      <div className="painel divide-y divide-slate-100">
        {lista.length === 0 && <div className="p-4 text-sm text-slate-500">Nenhum contrato registrado.</div>}
        {lista.map((c) => (
          <button key={c.id} disabled={!pode} onClick={() => setEditando(c)} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50 disabled:hover:bg-transparent">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.produto}</span>
              <Selo cor={c.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{c.status}</Selo>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              {c.turma && <span>{c.turma}</span>}
              <span>{data(c.inicio)} → {data(c.termino)}</span>
              {c.forma_pagamento && <span>{c.forma_pagamento}</span>}
              {c.status_financeiro && <Selo cor={FINANCEIRO[c.status_financeiro].cor}>{FINANCEIRO[c.status_financeiro].rotulo}</Selo>}
            </div>
          </button>
        ))}
      </div>
      {editando && <ContratoForm c={editando} fechar={() => setEditando(null)} salvo={() => { setEditando(null); carregar(); mudou() }} />}
    </section>
  )
}

function ContratoForm({ c, fechar, salvo }: { c: Partial<Contrato>; fechar: () => void; salvo: () => void }) {
  const [f, setF] = useState(c)
  const [erro, setErro] = useState<string | null>(null)
  const muda = (k: keyof Contrato, v: unknown) => setF((x) => ({ ...x, [k]: v === '' ? null : v }))
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const campos = { aluna_id: f.aluna_id, produto: f.produto, turma: f.turma ?? null, inicio: f.inicio ?? null, termino: f.termino ?? null,
      plano_meses: f.plano_meses ?? null, status: f.status, status_financeiro: f.status_financeiro ?? null,
      forma_pagamento: f.forma_pagamento ?? null, assinatura: f.assinatura ?? null, observacao: f.observacao ?? null }
    const r = f.id ? await supabase.from('contrato').update(campos).eq('id', f.id) : await supabase.from('contrato').insert(campos)
    if (r.error) { setErro(mensagemErro(r.error)); return }
    salvo()
  }
  return (
    <Modal titulo={f.id ? 'Contrato' : 'Novo contrato'} aberto fechar={fechar}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Produto">
          <select className="entrada" value={f.produto ?? ''} onChange={(e) => muda('produto', e.target.value)}>
            {[...new Set([...PRODUTOS, f.produto ?? ''])].filter(Boolean).map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Turma"><input className="entrada" value={f.turma ?? ''} onChange={(e) => muda('turma', e.target.value)} /></Campo>
        <Campo rotulo="Início"><input className="entrada" type="date" value={f.inicio ?? ''} onChange={(e) => muda('inicio', e.target.value)} /></Campo>
        <Campo rotulo="Término" dica="A renovação nasce 120 dias antes."><input className="entrada" type="date" value={f.termino ?? ''} onChange={(e) => muda('termino', e.target.value)} /></Campo>
        <Campo rotulo="Status">
          <select className="entrada" value={f.status ?? 'ativo'} onChange={(e) => muda('status', e.target.value)}>
            {['ativo', 'pendente', 'bloqueado', 'pausado', 'encerrado', 'cancelado'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Financeiro">
          <select className="entrada" value={f.status_financeiro ?? ''} onChange={(e) => muda('status_financeiro', e.target.value)}>
            <option value="">—</option>
            {Object.entries(FINANCEIRO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Forma de pagamento"><input className="entrada" placeholder="BOLETO TMB, Stripe, crédito parcelado…" value={f.forma_pagamento ?? ''} onChange={(e) => muda('forma_pagamento', e.target.value)} /></Campo>
        <Campo rotulo="Contrato (assinatura)"><input className="entrada" placeholder="Assinado, aguardando assinatura…" value={f.assinatura ?? ''} onChange={(e) => muda('assinatura', e.target.value)} /></Campo>
        <div className="sm:col-span-2"><Erro msg={erro} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

// Agenda das consultorias: o que as colunas 1.CONSULT. a 5.CONSULT. faziam.
export function Agenda({ aluna, podeEditar }: { aluna: Aluna; podeEditar: boolean }) {
  const [lista, setLista] = useState<AgendaConsultoria[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('consultoria_agenda').select('*').eq('aluna_id', aluna.id).order('numero')
    setLista((d ?? []) as AgendaConsultoria[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar])

  async function salvarData(numero: number, data_prevista: string) {
    setErro(null)
    const { error } = await supabase.from('consultoria_agenda')
      .upsert({ aluna_id: aluna.id, numero, data_prevista: data_prevista || null }, { onConflict: 'aluna_id,numero' })
    if (error) setErro(mensagemErro(error))
    carregar()
  }

  const linha = (n: number) => lista.find((g) => g.numero === n)
  const h = hoje()
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Agenda de consultorias</h2>
      <Erro msg={erro} />
      <div className="painel grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-6 sm:divide-y-0">
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const g = linha(n)
          const atrasada = g && !g.realizada_em && g.data_prevista && g.data_prevista < h
          return (
            <div key={n} className="p-3">
              <div className="text-xs font-medium text-slate-500">{n === 0 ? 'Entrada' : `${n}ª consultoria`}</div>
              {g?.realizada_em ? (
                <div className="mt-1 flex items-center gap-1 text-sm font-medium text-emerald-700"><Check size={14} /> {data(g.realizada_em)}</div>
              ) : podeEditar ? (
                <input className={`entrada mt-1 px-2 py-1 text-xs ${atrasada ? 'border-red-300 text-red-700' : ''}`} type="date"
                  value={g?.data_prevista ?? ''} onChange={(e) => salvarData(n, e.target.value)} />
              ) : (
                <div className={`mt-1 text-sm ${atrasada ? 'font-medium text-red-600' : ''}`}>{data(g?.data_prevista)}</div>
              )}
              {atrasada && <div className="mt-0.5 text-[11px] text-red-600">atrasada</div>}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500">Registrar a consultoria marca a data como realizada aqui.</p>
    </section>
  )
}

export function Notas({ aluna }: { aluna: Aluna }) {
  const { nomeDe } = useSessao()
  const [lista, setLista] = useState<NotaAluna[] | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('nota_aluna').select('*').eq('aluna_id', aluna.id).order('criado_em', { ascending: false })
    setLista((d ?? []) as NotaAluna[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar])

  async function anotar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('nota_aluna').insert({ aluna_id: aluna.id, texto: texto.trim(), autor_id: u.user?.id })
    if (error) { setErro(mensagemErro(error)); return }
    setTexto(''); carregar()
  }

  if (lista === null) return null
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Anotações</h2>
      <form onSubmit={anotar} className="flex gap-2">
        <input className="entrada" placeholder="Anotar algo sobre a aluna…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="btn-primario px-3" aria-label="Anotar"><Send size={16} /></button>
      </form>
      <Erro msg={erro} />
      {lista.length === 0 && <p className="text-sm text-slate-500">Nenhuma anotação visível para você.</p>}
      {lista.map((n) => (
        <div key={n.id} className="painel p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-600">{NOTA[n.tipo] ?? n.tipo}</span>
            <span>{n.autor_id ? nomeDe(n.autor_id) : n.origem ?? 'planilha'} · {dataHora(n.criado_em)}</span>
          </div>
          <p className="whitespace-pre-wrap text-slate-700">{n.texto}</p>
        </div>
      ))}
    </section>
  )
}

export function EventosDaAluna({ aluna }: { aluna: Aluna }) {
  const [lista, setLista] = useState<(Participante & { evento: { id: number; nome: string; data: string | null } })[]>([])
  useEffect(() => {
    supabase.from('evento_participante').select('*, evento(id, nome, data)').eq('aluna_id', aluna.id)
      .then(({ data: d }) => setLista((d ?? []) as never))
  }, [aluna.id])
  if (lista.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 font-semibold">Eventos</h2>
      <div className="painel divide-y divide-slate-100">
        {lista.map((p) => (
          <Link key={p.id} to={`/eventos/${p.evento.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
            <div className="text-sm font-medium">{p.evento.nome}</div>
            <div className="text-xs text-slate-500">
              {data(p.evento.data)} · {p.presente ? 'esteve' : p.confirmado ? 'confirmou' : p.confirmado === false ? 'não confirmou' : 'convidada'}
              {p.potencial && ` · potencial ${p.potencial}`}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
