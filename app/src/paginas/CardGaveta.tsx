import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, ArrowRight, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, CardEvento, CampoFunil, Etapa, Funil } from '../lib/tipos'
import { SAUDE, data, dataHora, diasDesde, mensagemErro, reais } from '../lib/util'
import { Campo, Carregando, Erro, EscolherAluna, EscolherPessoa, Gaveta, Modal, Selo } from '../componentes/ui'
import { PedirMotivo } from './Funis'

export function CardGaveta({ id, fechar, mudou }: { id: number; fechar: () => void; mudou: () => void }) {
  const { funis, etapas, nomeDe, podeEditar } = useSessao()
  const [card, setCard] = useState<Card | null>(null)
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [eventos, setEventos] = useState<CardEvento[]>([])
  const [rascunho, setRascunho] = useState<Partial<Card>>({})
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pedeMotivo, setPedeMotivo] = useState<Etapa | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)

  const carregar = useCallback(async () => {
    const { data: c } = await supabase.from('card').select('*').eq('id', id).maybeSingle()
    if (!c) { setNaoEncontrado(true); return }
    setCard(c as Card)
    setRascunho({})
    const [a, ev] = await Promise.all([
      c.aluna_id ? supabase.from('aluna').select('*').eq('id', c.aluna_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('card_evento').select('*').eq('card_id', id).order('criado_em'),
    ])
    setAluna((a.data ?? null) as Aluna | null)
    setEventos((ev.data ?? []) as CardEvento[])
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  if (naoEncontrado) {
    return <Gaveta aberto fechar={fechar}><div className="p-6 text-sm text-slate-600">Card não encontrado ou sem permissão para ver. <button className="text-indigo-600" onClick={fechar}>Fechar</button></div></Gaveta>
  }
  if (!card) return <Gaveta aberto fechar={fechar}><Carregando /></Gaveta>

  const funil = funis.find((f) => f.id === card.funil_id)!
  const colunas = etapas.filter((e) => e.funil_id === card.funil_id)
  const etapa = colunas.find((e) => e.id === card.etapa_id)
  const editavel = podeEditar(card.funil_id)
  const atual = { ...card, ...rascunho, dados: { ...card.dados, ...(rascunho.dados ?? {}) } }
  const sujo = Object.keys(rascunho).length > 0

  async function salvar() {
    setErro(null)
    const { error } = await supabase.from('card').update(rascunho).eq('id', card!.id)
    if (error) { setErro(mensagemErro(error)); return }
    await supabase.from('card_evento').insert({ card_id: card!.id, tipo: 'comentario', texto: '✎ Dados do card atualizados' })
    await carregar(); mudou()
  }

  async function mover(e: Etapa, motivo?: string) {
    if (e.exige_motivo && !motivo) { setPedeMotivo(e); return }
    setErro(null)
    const { error } = await supabase.from('card').update({ ...rascunho, etapa_id: e.id, ...(motivo ? { motivo } : {}) }).eq('id', card!.id)
    if (error) { setErro(mensagemErro(error)); return }
    await carregar(); mudou()
  }

  async function comentar(ev: FormEvent) {
    ev.preventDefault()
    if (!comentario.trim()) return
    const { error } = await supabase.from('card_evento').insert({ card_id: card!.id, tipo: 'comentario', texto: comentario.trim() })
    if (error) { setErro(mensagemErro(error)); return }
    setComentario(''); carregar()
  }

  const muda = (k: keyof Card, v: unknown) => setRascunho((r) => ({ ...r, [k]: v }))
  const mudaDado = (k: string, v: string | number | null) =>
    setRascunho((r) => ({ ...r, dados: { ...card!.dados, ...(r.dados ?? {}), [k]: v } }))

  return (
    <Gaveta aberto fechar={fechar}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{funil.nome}</div>
          <h2 className="text-lg font-semibold leading-tight">{card.titulo}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Selo cor={etapa?.tipo === 'ganha' ? 'bg-emerald-100 text-emerald-800' : etapa?.tipo === 'perdida' ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-800'}>{etapa?.nome}</Selo>
            <span>há {diasDesde(card.etapa_desde)} dias nesta etapa</span>
          </div>
        </div>
        <button className="btn-fantasma p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
      </div>

      <div className="space-y-6 p-5">
        <Erro msg={erro} />

        {aluna && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <Link to={`/alunas/${aluna.id}`} className="flex items-center gap-1 font-medium text-indigo-700 hover:underline">
                {aluna.nome} <ExternalLink size={13} />
              </Link>
              {aluna.saude && <Selo cor={SAUDE[aluna.saude].cor}>{SAUDE[aluna.saude].rotulo}</Selo>}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
              <span>{aluna.telefone ?? 'sem telefone'}</span>
              <span className="truncate">{aluna.email ?? 'sem e-mail'}</span>
              <span>{[aluna.produto, aluna.turma].filter(Boolean).join(' · ')}</span>
              <span>Fatura {reais(aluna.faturamento_mensal)}/mês</span>
              <span>Consultor: {nomeDe(aluna.consultor_id)}</span>
              <span>Término: {data(aluna.termino)}</span>
            </div>
            {(aluna.resumo || aluna.dores || aluna.objetivos) && (
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-2 text-xs">
                {([['Resumo', aluna.resumo], ['Dores', aluna.dores], ['Objetivos', aluna.objetivos]] as const).filter(([, t]) => t).map(([r, t]) => (
                  <div key={r}><span className="font-medium text-slate-500">{r}: </span><span className="whitespace-pre-wrap text-slate-700">{t}</span></div>
                ))}
              </div>
            )}
            <Link to={`/alunas/${aluna.id}`} className="mt-2 inline-block text-xs text-indigo-700 hover:underline">
              Ficha completa: relatos, contatos e linha do tempo →
            </Link>
          </div>
        )}

        {editavel && (
          <div>
            <div className="rotulo">Mover para</div>
            <div className="flex flex-wrap gap-1.5">
              {colunas.filter((e) => e.id !== card.etapa_id).map((e) => (
                <button key={e.id} onClick={() => mover(e)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-slate-50 ${e.tipo === 'ganha' ? 'border-emerald-300 text-emerald-700' : e.tipo === 'perdida' ? 'border-slate-300 text-slate-600' : 'border-slate-200 text-slate-700'}`}>
                  <ArrowRight size={12} /> {e.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset disabled={!editavel} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Título">
            <input className="entrada" value={atual.titulo} onChange={(e) => muda('titulo', e.target.value)} />
          </Campo>
          <Campo rotulo="Responsável">
            <EscolherPessoa valor={atual.responsavel_id} mudar={(v) => muda('responsavel_id', v)} />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <input className="entrada" type="number" min="0" step="100" value={atual.valor ?? ''} onChange={(e) => muda('valor', e.target.value === '' ? null : Number(e.target.value))} />
          </Campo>
          <Campo rotulo="Prazo">
            <input className="entrada" type="date" value={atual.prazo ?? ''} onChange={(e) => muda('prazo', e.target.value || null)} />
          </Campo>
          {funil.campos.map((c) => (
            <CampoDinamico key={c.chave} campo={c} valor={atual.dados[c.chave] ?? null} mudar={(v) => mudaDado(c.chave, v)} />
          ))}
          {(atual.motivo || etapa?.exige_motivo) && (
            <Campo rotulo="Motivo">
              <input className="entrada" value={atual.motivo ?? ''} onChange={(e) => muda('motivo', e.target.value || null)} />
            </Campo>
          )}
        </fieldset>
        {editavel && sujo && (
          <div className="flex justify-end gap-2">
            <button className="btn-secundario" onClick={() => setRascunho({})}>Descartar</button>
            <button className="btn-primario" onClick={salvar}>Salvar alterações</button>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold">Histórico e comentários</h3>
          <form onSubmit={comentar} className="mb-4 flex gap-2">
            <input className="entrada" placeholder="Escreva um comentário…" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <button className="btn-primario px-3" aria-label="Enviar"><Send size={16} /></button>
          </form>
          <ol className="space-y-3">
            {[...eventos].reverse().map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.tipo === 'comentario' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                <div className="min-w-0">
                  <div className={e.tipo === 'comentario' ? 'whitespace-pre-wrap' : 'text-slate-600'}>
                    {e.tipo === 'criado' && <>Card criado em <b>{e.texto}</b></>}
                    {e.tipo === 'moveu' && <>Movido para <b>{e.texto}</b></>}
                    {e.tipo === 'responsavel' && <>Responsável agora é <b>{e.texto ?? 'ninguém'}</b></>}
                    {(e.tipo === 'comentario' || e.tipo === 'editou') && e.texto}
                  </div>
                  <div className="text-xs text-slate-400">{e.autor_id ? nomeDe(e.autor_id) : 'Sistema'} · {dataHora(e.criado_em)}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {pedeMotivo && (
        <PedirMotivo etapa={pedeMotivo} opcoes={funil.motivos} fechar={() => setPedeMotivo(null)}
          confirmar={(m) => { const e = pedeMotivo; setPedeMotivo(null); mover(e, m) }} />
      )}
    </Gaveta>
  )
}

function CampoDinamico({ campo, valor, mudar }: { campo: CampoFunil; valor: string | number | null; mudar: (v: string | number | null) => void }) {
  const v = valor ?? ''
  const largo = campo.tipo === 'textao' ? 'sm:col-span-2' : ''
  return (
    <div className={largo}>
      <Campo rotulo={campo.rotulo}>
        {campo.tipo === 'selecao' ? (
          <select className="entrada" value={String(v)} onChange={(e) => mudar(e.target.value || null)}>
            <option value="">Selecione</option>
            {campo.opcoes?.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        ) : campo.tipo === 'textao' ? (
          <textarea className="entrada min-h-20" value={String(v)} onChange={(e) => mudar(e.target.value || null)} />
        ) : (
          <input className="entrada" value={String(v)}
            type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' || campo.tipo === 'moeda' ? 'number' : 'text'}
            onChange={(e) => mudar(e.target.value === '' ? null : campo.tipo === 'numero' || campo.tipo === 'moeda' ? Number(e.target.value) : e.target.value)} />
        )}
      </Campo>
    </div>
  )
}

export function NovoCard({ funil, etapa, fechar, criado, alunaInicial }: {
  funil: Funil; etapa: Etapa; fechar: () => void; criado: (id: number) => void; alunaInicial?: Aluna
}) {
  const { eu } = useSessao()
  const [aluna, setAluna] = useState<Aluna | null>(alunaInicial ?? null)
  const [titulo, setTitulo] = useState(alunaInicial?.nome ?? '')
  const [responsavel, setResponsavel] = useState<string | null>(eu?.id ?? null)
  const [valor, setValor] = useState('')
  const [prazo, setPrazo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const { data: d, error } = await supabase.from('card').insert({
      funil_id: funil.id, etapa_id: etapa.id, aluna_id: aluna?.id ?? null,
      titulo: titulo.trim() || aluna?.nome, responsavel_id: responsavel,
      valor: valor ? Number(valor) : null, prazo: prazo || null,
    }).select('id').single()
    if (error) { setErro(mensagemErro(error)); return }
    criado(d.id)
  }

  return (
    <Modal titulo={`Novo card · ${funil.nome}`} aberto fechar={fechar}>
      <form onSubmit={criar} className="space-y-4">
        <p className="text-sm text-slate-500">Entra em <b>{etapa.nome}</b>.</p>
        <Campo rotulo="Aluna" dica="Uma aluna, um cadastro: se ela não aparecer, cadastre antes em Alunas.">
          <EscolherAluna valor={aluna} mudar={(a) => { setAluna(a); if (a && !titulo) setTitulo(a.nome) }} />
        </Campo>
        <Campo rotulo="Título">
          <input className="entrada" required={!aluna} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Responsável"><EscolherPessoa valor={responsavel} mudar={setResponsavel} /></Campo>
          <Campo rotulo="Prazo"><input className="entrada" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo>
          <Campo rotulo="Valor (R$)"><input className="entrada" type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        </div>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Criar card</button>
        </div>
      </form>
    </Modal>
  )
}
