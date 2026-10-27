import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, ExternalLink, Phone, Mail, MessageCircle, ChevronDown, Info as Info2, MessagesSquare, History,
  Filter, Thermometer, Share2, UserRound, DollarSign, CalendarClock, Trash2, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, CardEvento, CampoFunil, Etapa, Funil } from '../lib/tipos'
import { SAUDE, data, dataHora, diasDesde, linkWhats, mensagemErro, reais, rotuloOrigem } from '../lib/util'
import { Campo, Carregando, Erro, EscolherAluna, EscolherPessoa, Gaveta, Modal, Potencial } from '../componentes/ui'
import { PedirMotivo } from './Funis'

export function CardGaveta({ id, fechar, mudou, encaixado = false }: { id: number; fechar: () => void; mudou: () => void; encaixado?: boolean }) {
  const { funis, etapas, nomeDe, podeEditar } = useSessao()
  const [card, setCard] = useState<Card | null>(null)
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [eventos, setEventos] = useState<CardEvento[]>([])
  const [rascunho, setRascunho] = useState<Partial<Card>>({})
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pedeMotivo, setPedeMotivo] = useState<Etapa | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [aba, setAba] = useState<'info' | 'atividade' | 'historico'>('info')
  const [verMais, setVerMais] = useState(false)

  const carregar = useCallback(async () => {
    const { data: c } = await supabase.from('card').select('*').eq('id', id).maybeSingle()
    if (!c) { setNaoEncontrado(true); return }
    setNaoEncontrado(false)
    setCard(c as Card)
    setRascunho({})
    const [a, ev] = await Promise.all([
      c.aluna_id ? supabase.from('aluna').select('*, potencial').eq('id', c.aluna_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('card_evento').select('*').eq('card_id', id).order('criado_em'),
    ])
    setAluna((a.data ?? null) as Aluna | null)
    setEventos((ev.data ?? []) as CardEvento[])
  }, [id])

  useEffect(() => { setCard(null); setAba('info'); setVerMais(false); carregar() }, [carregar])

  // Funcao, nao componente: recriar um componente a cada render faria os
  // campos perderem o foco a cada tecla.
  const moldura = (children: ReactNode) => encaixado
    ? <aside className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white lg:w-[27rem] lg:shrink-0">{children}</aside>
    : <Gaveta aberto fechar={fechar}><div className="flex h-full flex-col">{children}</div></Gaveta>

  if (naoEncontrado) {
    return moldura(<div className="p-6 text-sm text-slate-600">Card não encontrado ou sem permissão para ver. <button className="text-indigo-600" onClick={fechar}>Fechar</button></div>)
  }
  if (!card) return moldura(<Carregando />)

  const funil = funis.find((f) => f.id === card.funil_id)!
  const colunas = etapas.filter((e) => e.funil_id === card.funil_id).sort((a, b) => a.ordem - b.ordem)
  const etapa = colunas.find((e) => e.id === card.etapa_id)
  const abertas = colunas.filter((e) => e.tipo === 'aberta')
  const posicao = etapa?.tipo === 'aberta' ? abertas.findIndex((e) => e.id === etapa.id) + 1 : abertas.length
  const ganha = colunas.find((e) => e.tipo === 'ganha')
  const perdida = colunas.find((e) => e.tipo === 'perdida')
  const editavel = podeEditar(card.funil_id)
  const atual = { ...card, ...rascunho, dados: { ...card.dados, ...(rascunho.dados ?? {}) } }
  const sujo = Object.keys(rascunho).length > 0
  const nome = aluna?.nome ?? card.titulo
  const origem = rotuloOrigem(atual.dados)
  const subtitulo = [aluna?.produto, aluna?.turma?.trim()].filter(Boolean).join(' · ') || funil.nome
  const whats = linkWhats(aluna?.telefone)
  const comentarios = eventos.filter((e) => e.tipo === 'comentario')
  const historico = eventos.filter((e) => e.tipo !== 'comentario')

  async function salvar() {
    setErro(null)
    const { error } = await supabase.from('card').update(rascunho).eq('id', card!.id)
    if (error) { setErro(mensagemErro(error)); return }
    await supabase.from('card_evento').insert({ card_id: card!.id, tipo: 'editou', texto: 'Dados do card atualizados' })
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

  return moldura(
    <>
      {/* Cabecalho: quem e, como falar com ela. */}
      <div className="border-b border-slate-200 px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nude font-semibold text-noite ring-1 ring-ouro/40">{iniciais(nome)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight text-slate-900" title={nome}>{nome}</h2>
            <div className="truncate text-xs text-slate-500">{subtitulo}</div>
          </div>
          {aluna && (
            <Link to={`/alunas/${aluna.id}`} className="btn-fantasma p-1.5" title="Abrir a ficha completa"><ExternalLink size={16} /></Link>
          )}
          <button className="btn-fantasma p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        {aluna && (
          <div className="mt-3 space-y-1 text-sm">
            {aluna.telefone && (
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <Phone size={14} className="text-slate-400" /> {aluna.telefone}
                {whats && <a href={whats} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700" title="Abrir no WhatsApp"><MessageCircle size={15} /></a>}
              </div>
            )}
            {aluna.email && (
              <a href={`mailto:${aluna.email}`} className="flex items-center gap-2 truncate text-slate-600 hover:text-indigo-700"><Mail size={14} className="text-slate-400" /> {aluna.email}</a>
            )}
            <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800" onClick={() => setVerMais(!verMais)}>
              {verMais ? 'Ver menos' : 'Ver mais'} <ChevronDown size={13} className={verMais ? 'rotate-180' : ''} />
            </button>
            {verMais && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                <Info rotulo="Faturamento">{aluna.faturamento_mensal != null ? `${reais(aluna.faturamento_mensal)}/mês` : ''}</Info>
                <Info rotulo="Consultor">{aluna.consultor_id ? nomeDe(aluna.consultor_id) : ''}</Info>
                <Info rotulo="Término">{data(aluna.termino)}</Info>
                <Info rotulo="Momento">{aluna.saude ? SAUDE[aluna.saude].rotulo : ''}</Info>
                <Info rotulo="Cidade">{[aluna.cidade, aluna.uf].filter(Boolean).join(' / ')}</Info>
                <Info rotulo="Ramo">{aluna.ramo ?? ''}</Info>
              </dl>
            )}
          </div>
        )}
      </div>

      <div className="border-b border-slate-200 px-5 py-2">
        <div className="flex gap-1 rounded-full bg-slate-100 p-1">
          {([['info', 'Informações', Info2], ['atividade', `Atividade${comentarios.length ? ` · ${comentarios.length}` : ''}`, MessagesSquare], ['historico', 'Histórico', History]] as const).map(([k, r, I]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium transition ${aba === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <I size={13} /> {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Erro msg={erro} />
        {aba === 'info' && (
          <>
            <section>
              <h3 className="rotulo">Status no funil</h3>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700"><Filter size={13} /> Etapa do funil</span>
                  <span className="uppercase tracking-wide">{funil.nome}</span>
                </div>
                <select className="entrada bg-white" disabled={!editavel} value={card.etapa_id}
                  onChange={(e) => { const x = colunas.find((c) => c.id === Number(e.target.value)); if (x) mover(x) }}>
                  {colunas.map((e) => <option key={e.id} value={e.id}>{e.tipo === 'ganha' ? '✓ ' : e.tipo === 'perdida' ? '✕ ' : ''}{e.nome}</option>)}
                </select>
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${etapa?.tipo === 'ganha' ? 'bg-emerald-500' : etapa?.tipo === 'perdida' ? 'bg-slate-400' : 'bg-ouro'}`}
                      style={{ width: `${abertas.length ? (posicao / abertas.length) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>há {diasDesde(card.etapa_desde)} dia(s) nesta etapa</span>
                    <span>{etapa?.tipo === 'aberta' ? `Etapa ${posicao} de ${abertas.length}` : etapa?.tipo === 'ganha' ? 'Ganha' : 'Encerrada'}</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-200/70 border-t border-slate-200/70">
                  <Linha icone={Thermometer} rotulo="Temperatura do lead">
                    {aluna?.potencial != null ? <span className="flex items-center gap-2"><Potencial pontos={aluna.potencial} /> <span className="text-xs text-slate-500">{aluna.potencial >= 70 ? 'quente' : aluna.potencial >= 40 ? 'morna' : 'fria'}</span></span> : <span className="text-slate-400">Não definida</span>}
                  </Linha>
                  <Linha icone={Share2} rotulo="Origem">{origem ?? <span className="text-slate-400">Não informada</span>}</Linha>
                  <Linha icone={UserRound} rotulo="Responsável">
                    {editavel
                      ? <div className="w-52"><EscolherPessoa valor={atual.responsavel_id} mudar={(v) => muda('responsavel_id', v)} /></div>
                      : nomeDe(atual.responsavel_id)}
                  </Linha>
                  <Linha icone={DollarSign} rotulo="Valor potencial">
                    {editavel
                      ? <input className="entrada w-32 py-1 text-right font-mono" type="number" min="0" step="100" value={atual.valor ?? ''} placeholder="R$"
                          onChange={(e) => muda('valor', e.target.value === '' ? null : Number(e.target.value))} />
                      : <span className="font-mono font-semibold">{reais(atual.valor)}</span>}
                  </Linha>
                  <Linha icone={CalendarClock} rotulo="Prazo">
                    {editavel
                      ? <input className="entrada w-40 py-1" type="date" value={atual.prazo ?? ''} onChange={(e) => muda('prazo', e.target.value || null)} />
                      : data(atual.prazo)}
                  </Linha>
                </div>
              </div>
            </section>

            {(funil.campos.length > 0 || atual.motivo || etapa?.exige_motivo) && (
              <section>
                <h3 className="rotulo">Detalhes</h3>
                <fieldset disabled={!editavel} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {funil.campos.map((c) => (
                    <CampoDinamico key={c.chave} campo={c} valor={atual.dados[c.chave] ?? null} mudar={(v) => mudaDado(c.chave, v)} />
                  ))}
                  {(atual.motivo || etapa?.exige_motivo) && (
                    <Campo rotulo="Motivo">
                      <input className="entrada" value={atual.motivo ?? ''} onChange={(e) => muda('motivo', e.target.value || null)} />
                    </Campo>
                  )}
                  <div className="sm:col-span-2">
                    <Campo rotulo="Título do card">
                      <input className="entrada" value={atual.titulo} onChange={(e) => muda('titulo', e.target.value)} />
                    </Campo>
                  </div>
                </fieldset>
              </section>
            )}

            {aluna && (aluna.resumo || aluna.dores || aluna.objetivos) && (
              <section className="space-y-2 rounded-xl bg-nude p-4 text-sm">
                {([['Quem é', aluna.resumo], ['Dores', aluna.dores], ['Objetivos', aluna.objetivos]] as const).filter(([, t]) => t).map(([r, t]) => (
                  <div key={r}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</div><p className="whitespace-pre-wrap text-slate-700">{t}</p></div>
                ))}
              </section>
            )}
          </>
        )}

        {aba === 'atividade' && (
          <section>
            <form onSubmit={comentar} className="mb-4 flex gap-2">
              <input className="entrada" placeholder="Registrar um comentário…" value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <button className="btn-primario px-3" aria-label="Enviar"><Send size={16} /></button>
            </form>
            {comentarios.length === 0 && <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>}
            <ol className="space-y-3">
              {[...comentarios].reverse().map((e) => (
                <li key={e.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="whitespace-pre-wrap text-slate-800">{e.texto}</div>
                  <div className="mt-1 text-xs text-slate-400">{e.autor_id ? nomeDe(e.autor_id) : 'Sistema'} · {dataHora(e.criado_em)}</div>
                </li>
              ))}
            </ol>
            {aluna && <Link to={`/alunas/${aluna.id}`} className="mt-4 inline-block text-xs text-indigo-700 hover:underline">Contatos, consultorias e relatos estão na ficha →</Link>}
          </section>
        )}

        {aba === 'historico' && (
          <ol className="relative space-y-4 border-l border-slate-200 pl-4">
            {[...historico].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white" />
                <div className="text-slate-700">
                  {e.tipo === 'criado' && <>Card criado em <b>{e.texto}</b></>}
                  {e.tipo === 'moveu' && <>Movido para <b>{e.texto}</b></>}
                  {e.tipo === 'responsavel' && <>Responsável agora é <b>{e.texto ?? 'ninguém'}</b></>}
                  {e.tipo === 'editou' && e.texto}
                </div>
                <div className="text-xs text-slate-400">{e.autor_id ? nomeDe(e.autor_id) : 'Sistema'} · {dataHora(e.criado_em)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Rodape: salvar o que mudou, ou fechar o card como ganho ou perdido. */}
      {editavel && (sujo || (etapa?.tipo === 'aberta' && (ganha || perdida))) && (
        <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-3">
          {sujo ? (
            <>
              <button className="btn-secundario flex-1" onClick={() => setRascunho({})}>Desfazer</button>
              <button className="btn-primario flex-1" onClick={salvar}>Salvar alterações</button>
            </>
          ) : (
            <>
              {perdida && <button className="btn-secundario flex-1" onClick={() => mover(perdida)}><Trash2 size={15} /> {perdida.nome === 'Perdida' ? 'Descartar' : perdida.nome}</button>}
              {ganha && <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => mover(ganha)}><Trophy size={15} /> {ganha.nome === 'Ganha' ? 'Ganhar' : ganha.nome}</button>}
            </>
          )}
        </div>
      )}
      {pedeMotivo && (
        <PedirMotivo etapa={pedeMotivo} opcoes={funil.motivos} fechar={() => setPedeMotivo(null)}
          confirmar={(m) => { const e = pedeMotivo; setPedeMotivo(null); mover(e, m) }} />
      )}
    </>
  )
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter((p) => p && !/^(da|de|do|dos|das|e|\(.*)$/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-slate-400">{rotulo}</dt><dd className="truncate text-slate-700">{children || <span className="text-slate-300">não informado</span>}</dd></div>
}

function Linha({ icone: I, rotulo, children }: { icone: typeof Phone; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-slate-600"><I size={14} className="text-slate-400" /> {rotulo}</span>
      <span className="min-w-0 text-right font-medium text-slate-800">{children}</span>
    </div>
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
