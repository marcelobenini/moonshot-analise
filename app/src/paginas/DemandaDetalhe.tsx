import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Hand, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Demanda, DemandaComentario, StatusDemanda } from '../lib/tipos'
import { PAPEL, PRIORIDADE, STATUS_DEMANDA, TIPO_DEMANDA, data, dataHora, mensagemErro } from '../lib/util'
import { Carregando, Erro, EscolherPessoa, Selo, Vazio } from '../componentes/ui'

export function DemandaDetalhe() {
  const { id } = useParams()
  const { eu, nomeDe } = useSessao()
  const [d, setD] = useState<Demanda | null | undefined>(undefined)
  const [aluna, setAluna] = useState<{ id: number; nome: string } | null>(null)
  const [comentarios, setComentarios] = useState<DemandaComentario[]>([])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [a, c] = await Promise.all([
      supabase.from('demanda').select('*').eq('id', id).maybeSingle(),
      supabase.from('demanda_comentario').select('*').eq('demanda_id', id).order('criado_em'),
    ])
    const dem = (a.data ?? null) as Demanda | null
    setD(dem)
    setComentarios((c.data ?? []) as DemandaComentario[])
    if (dem?.aluna_id) {
      const { data: al } = await supabase.from('aluna').select('id, nome').eq('id', dem.aluna_id).maybeSingle()
      setAluna(al)
    } else setAluna(null)
  }, [id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const canal = supabase.channel('demanda-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demanda_comentario', filter: `demanda_id=eq.${id}` }, () => carregar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'demanda', filter: `id=eq.${id}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [id, carregar])

  if (d === undefined) return <Carregando />
  if (d === null) return <Vazio>Demanda não encontrada ou sem permissão para ver.</Vazio>

  async function mudar(campos: Partial<Demanda>) {
    setErro(null)
    const { error } = await supabase.from('demanda').update(campos).eq('id', d!.id)
    if (error) setErro(mensagemErro(error))
    carregar()
  }

  async function comentar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const { error } = await supabase.from('demanda_comentario').insert({ demanda_id: d!.id, autor_id: eu?.id, texto: texto.trim() })
    if (error) { setErro(mensagemErro(error)); return }
    setTexto(''); carregar()
  }

  const fechada = d.status === 'concluida' || d.status === 'cancelada'

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/demandas" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Demandas</Link>
      <div className="painel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Selo cor={STATUS_DEMANDA[d.status].cor}>{STATUS_DEMANDA[d.status].rotulo}</Selo>
          <Selo cor={PRIORIDADE[d.prioridade].cor}>{PRIORIDADE[d.prioridade].rotulo}</Selo>
          <span className="text-xs text-slate-500">{TIPO_DEMANDA[d.tipo]}</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-noite">{d.titulo}</h1>
        {d.descricao && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{d.descricao}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Pedido por</dt><dd className="font-medium">{nomeDe(d.solicitante_id)}</dd></div>
          <div><dt className="text-xs text-slate-500">Equipe</dt><dd className="font-medium">{d.equipe ? PAPEL[d.equipe] : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Prazo</dt><dd className="font-medium">{data(d.prazo)}</dd></div>
          <div><dt className="text-xs text-slate-500">Aluna</dt><dd className="font-medium">{aluna ? <Link className="text-indigo-700 hover:underline" to={`/alunas/${aluna.id}`}>{aluna.nome}</Link> : '—'}</dd></div>
        </dl>

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <span className="rotulo">Responsável</span>
            <div className="flex gap-2">
              <EscolherPessoa valor={d.responsavel_id} mudar={(v) => mudar({ responsavel_id: v })} vazio="— ninguém ainda —" />
              {d.responsavel_id !== eu?.id && !fechada && (
                <button className="btn-secundario shrink-0" onClick={() => mudar({ responsavel_id: eu!.id, status: d.status === 'aberta' ? 'em_andamento' : d.status })}>
                  <Hand size={16} /> Pegar
                </button>
              )}
            </div>
          </div>
          <div>
            <span className="rotulo">Status</span>
            <select className="entrada" value={d.status} onChange={(e) => mudar({ status: e.target.value as StatusDemanda })}>
              {Object.entries(STATUS_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3"><Erro msg={erro} /></div>
      </div>

      <div className="painel p-5">
        <h2 className="mb-4 font-semibold">Conversa</h2>
        <ol className="mb-4 space-y-4">
          {comentarios.length === 0 && <li className="text-sm text-slate-500">Ninguém respondeu ainda.</li>}
          {comentarios.map((c) => (
            <li key={c.id} className={`flex ${c.autor_id === eu?.id ? 'justify-end' : ''}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${c.autor_id === eu?.id ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>
                <div className="whitespace-pre-wrap">{c.texto}</div>
                <div className={`mt-1 text-[11px] ${c.autor_id === eu?.id ? 'text-indigo-200' : 'text-slate-500'}`}>{nomeDe(c.autor_id)} · {dataHora(c.criado_em)}</div>
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={comentar} className="flex gap-2">
          <textarea className="entrada min-h-11" rows={1} placeholder="Escreva uma resposta…" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); comentar(e) } }} />
          <button className="btn-primario px-3" aria-label="Enviar"><Send size={16} /></button>
        </form>
      </div>
    </div>
  )
}
