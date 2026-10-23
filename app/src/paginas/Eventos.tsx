import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Evento, Participante } from '../lib/tipos'
import { data, mensagemErro } from '../lib/util'
import { Campo, Carregando, Erro, EscolherAluna, Modal, Selo, Titulo, Vazio } from '../componentes/ui'

const POTENCIAL: Record<string, { rotulo: string; cor: string }> = {
  alto: { rotulo: 'Alto', cor: 'bg-emerald-100 text-emerald-800' },
  medio: { rotulo: 'Médio', cor: 'bg-amber-100 text-amber-800' },
  baixo: { rotulo: 'Baixo', cor: 'bg-slate-100 text-slate-700' },
}

type EventoComContagem = Evento & { evento_participante: { count: number }[] }

export function Eventos() {
  const { eu } = useSessao()
  const nav = useNavigate()
  const [lista, setLista] = useState<EventoComContagem[] | null>(null)
  const [novo, setNovo] = useState(false)
  const pode = ['coordenador', 'cs', 'comercial'].includes(eu?.papel ?? '')
  useEffect(() => {
    supabase.from('evento').select('*, evento_participante(count)').order('data', { ascending: false, nullsFirst: false })
      .then(({ data: d }) => setLista((d ?? []) as EventoComContagem[]))
  }, [])
  return (
    <div className="mx-auto max-w-4xl">
      <Titulo acoes={pode && <button className="btn-primario" onClick={() => setNovo(true)}><Plus size={16} /> Novo evento</button>}>Eventos</Titulo>
      {lista === null ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhum evento. Crie um ou importe a planilha de eventos.</Vazio> : (
        <div className="painel divide-y divide-slate-100">
          {lista.map((e) => (
            <Link key={e.id} to={`/eventos/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
              <div>
                <div className="font-medium">{e.nome}</div>
                <div className="text-xs text-slate-500">{data(e.data)}{e.local && ` · ${e.local}`}</div>
              </div>
              <span className="text-sm text-slate-500">{e.evento_participante[0]?.count ?? 0} convidados</span>
            </Link>
          ))}
        </div>
      )}
      {novo && <NovoEvento fechar={() => setNovo(false)} criado={(id) => nav(`/eventos/${id}`)} />}
    </div>
  )
}

function NovoEvento({ fechar, criado }: { fechar: () => void; criado: (id: number) => void }) {
  const [f, setF] = useState({ nome: '', data: '', local: '' })
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { data: d, error } = await supabase.from('evento').insert({ nome: f.nome.trim(), data: f.data || null, local: f.local || null }).select('id').single()
    if (error) { setErro(mensagemErro(error)); return }
    criado(d.id)
  }
  return (
    <Modal titulo="Novo evento" aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><input className="entrada" required autoFocus placeholder="Ex.: Moonshot Day, Check Point" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo rotulo="Data"><input className="entrada" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
          <Campo rotulo="Local"><input className="entrada" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} /></Campo>
        </div>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Criar</button>
        </div>
      </form>
    </Modal>
  )
}

export function EventoDetalhe() {
  const { id } = useParams()
  const [ev, setEv] = useState<Evento | null | undefined>(undefined)
  const [parts, setParts] = useState<Participante[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [adicionar, setAdicionar] = useState(false)
  const carregar = useCallback(async () => {
    const [e, p] = await Promise.all([
      supabase.from('evento').select('*').eq('id', id).maybeSingle(),
      supabase.from('evento_participante').select('*').eq('evento_id', id).order('nome'),
    ])
    setEv((e.data ?? null) as Evento | null)
    setParts((p.data ?? []) as Participante[])
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  async function mudar(p: Participante, campos: Partial<Participante>) {
    setErro(null)
    setParts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...campos } : x)))
    const { error } = await supabase.from('evento_participante').update(campos).eq('id', p.id)
    if (error) { setErro(mensagemErro(error)); carregar() }
  }
  async function remover(p: Participante) {
    if (!confirm(`Tirar ${p.nome} da lista?`)) return
    const { error } = await supabase.from('evento_participante').delete().eq('id', p.id)
    if (error) setErro(mensagemErro(error))
    carregar()
  }

  if (ev === undefined) return <Carregando />
  if (ev === null) return <Vazio>Evento não encontrado.</Vazio>
  const confirmados = parts.filter((p) => p.confirmado).length
  const presentes = parts.filter((p) => p.presente).length
  return (
    <div className="space-y-5">
      <Link to="/eventos" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Eventos</Link>
      <Titulo acoes={<button className="btn-primario" onClick={() => setAdicionar(true)}><Plus size={16} /> Convidar</button>}>
        {ev.nome} <span className="ml-2 text-base font-normal text-slate-500">{data(ev.data)}</span>
      </Titulo>
      <div className="grid grid-cols-3 gap-3">
        {[['Convidados', parts.length], ['Confirmados', confirmados], ['Presentes', presentes]].map(([r, v]) => (
          <div key={r} className="painel p-3"><div className="text-xs text-slate-500">{r}</div><div className="text-xl font-semibold">{v}</div></div>
        ))}
      </div>
      <Erro msg={erro} />
      {parts.length === 0 ? <Vazio>Ninguém convidado ainda.</Vazio> : (
        <div className="painel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Programa</th><th className="px-3 py-2">Confirmou</th><th className="px-3 py-2">Veio</th><th className="px-3 py-2">Potencial</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2">
                    {p.aluna_id ? <Link to={`/alunas/${p.aluna_id}`} className="font-medium text-indigo-700 hover:underline">{p.nome}</Link> : <span className="font-medium">{p.nome}</span>}
                    <div className="text-xs text-slate-500">{p.tipo !== 'aluna' ? (p.tipo === 'socio' ? 'sócio(a) / acompanhante' : 'convidado(a)') : p.contato}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{p.programa_informado ?? ''}{p.faturamento_informado && <div className="text-slate-500">{p.faturamento_informado}</div>}</td>
                  <td className="px-3 py-2"><input type="checkbox" checked={!!p.confirmado} onChange={(e) => mudar(p, { confirmado: e.target.checked })} /></td>
                  <td className="px-3 py-2"><input type="checkbox" checked={!!p.presente} onChange={(e) => mudar(p, { presente: e.target.checked })} /></td>
                  <td className="px-3 py-2">
                    <select className="entrada w-auto px-2 py-1 text-xs" value={p.potencial ?? ''} onChange={(e) => mudar(p, { potencial: (e.target.value || null) as Participante['potencial'] })}>
                      <option value="">Avaliar</option>
                      {Object.entries(POTENCIAL).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                    </select>
                    {p.potencial && <span className="ml-1"><Selo cor={POTENCIAL[p.potencial].cor}>{POTENCIAL[p.potencial].rotulo}</Selo></span>}
                    {p.potencial_obs && <details className="mt-1 max-w-sm text-xs text-slate-600"><summary className="cursor-pointer text-slate-500">por quê</summary>{p.potencial_obs}</details>}
                  </td>
                  <td className="px-3 py-2"><button className="btn-fantasma p-1" onClick={() => remover(p)} aria-label="Remover"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adicionar && <Convidar evento={ev.id} fechar={() => setAdicionar(false)} feito={() => { setAdicionar(false); carregar() }} />}
    </div>
  )
}

function Convidar({ evento, fechar, feito }: { evento: number; fechar: () => void; feito: () => void }) {
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<Participante['tipo']>('convidado')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('evento_participante').insert({
      evento_id: evento, aluna_id: aluna?.id ?? null, nome: aluna?.nome ?? nome.trim(), contato: aluna?.telefone ?? null,
      tipo: aluna ? 'aluna' : tipo, programa_informado: aluna?.produto ?? null,
    })
    if (error) { setErro(error.message.includes('duplicate') ? 'Essa pessoa já está na lista.' : mensagemErro(error)); return }
    feito()
  }
  return (
    <Modal titulo="Convidar" aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Aluna"><EscolherAluna valor={aluna} mudar={setAluna} /></Campo>
        {!aluna && (
          <>
            <p className="text-xs text-slate-500">Ou, para quem não é aluna:</p>
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Nome"><input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
              <Campo rotulo="Tipo">
                <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as Participante['tipo'])}>
                  <option value="socio">Sócio(a) / acompanhante</option>
                  <option value="convidado">Convidado(a)</option>
                </select>
              </Campo>
            </div>
          </>
        )}
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={!aluna && !nome.trim()}>Adicionar</button>
        </div>
      </form>
    </Modal>
  )
}
