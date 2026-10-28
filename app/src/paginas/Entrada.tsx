import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ClipboardCopy, ExternalLink, Send, Settings, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, FormularioEntrada, PreAnalise } from '../lib/tipos'
import { NIVEL, STATUS_ENTRADA, data, dataHora, diasDesde, mensagemErro } from '../lib/util'
import { TITULOS, acharPessoa, appsScript, lerResposta, textoParaGemini } from '../lib/entrada'
import { Campo, Carregando, EscolherAluna, EscolherPessoa, Erro, Gaveta, Modal, Selo, Titulo, Vazio } from '../componentes/ui'
import { Segmento } from '../componentes/painel'

type Linha = PreAnalise & { aluna: { id: number; nome: string; produto: string | null } }
type Aba = 'aguardando_formulario' | 'formulario_recebido' | 'para_validar' | 'sem_ficha' | 'concluidas'

/** Entrada da aluna: formulario do negocio, pre-analise da CS e validacao da coordenacao. */
export function Entrada() {
  const { eu } = useSessao()
  const coord = eu?.papel === 'coordenador'
  const [busca, setBusca] = useSearchParams()
  const aba = (busca.get('aba') as Aba) ?? (coord ? 'para_validar' : 'formulario_recebido')
  const aberta = busca.get('aluna')
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [semFicha, setSemFicha] = useState<FormularioEntrada[]>([])
  const [enviar, setEnviar] = useState(false)
  const [config, setConfig] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('pre_analise').select('*, aluna:aluna_id(id, nome, produto)').order('atualizado_em', { ascending: false }),
      supabase.from('formulario_entrada').select('*').is('aluna_id', null).order('recebido_em', { ascending: false }),
    ])
    setLinhas((p ?? []) as Linha[])
    setSemFicha((f ?? []) as FormularioEntrada[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const conta = (s: string) => (linhas ?? []).filter((l) => (s === 'concluidas' ? ['aprovada', 'ajustada'].includes(l.status) : l.status === s)).length
  const lista = (linhas ?? []).filter((l) => (aba === 'concluidas' ? ['aprovada', 'ajustada'].includes(l.status) : l.status === aba))
  const mudar = (k: string, v: string | null) => setBusca((b) => { if (v) b.set(k, v); else b.delete(k); return b })
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'formulario_recebido', rotulo: `Para analisar · ${conta('formulario_recebido')}` },
    { id: 'para_validar', rotulo: `Para validar · ${conta('para_validar')}` },
    { id: 'aguardando_formulario', rotulo: `Aguardando · ${conta('aguardando_formulario')}` },
    { id: 'sem_ficha', rotulo: `Sem ficha · ${semFicha.length}` },
    { id: 'concluidas', rotulo: `Concluídas · ${conta('concluidas')}` },
  ]

  return (
    <div className="space-y-5">
      <Titulo acoes={<>
        {coord && <button className="btn-secundario" onClick={() => setConfig(true)}><Settings size={16} /> Configurar</button>}
        <button className="btn-primario" onClick={() => setEnviar(true)}><Send size={16} /> Enviar formulário</button>
      </>}>Entrada</Titulo>
      <p className="text-sm text-slate-600">A aluna responde o formulário do negócio, a CS faz a pré-análise com o Gemini e a coordenação valida o consultor.</p>
      <Segmento opcoes={abas} valor={aba} mudar={(v) => mudar('aba', v)} />

      {linhas === null ? <Carregando /> : aba === 'sem_ficha' ? (
        semFicha.length === 0 ? <Vazio>Toda resposta achou a sua ficha.</Vazio> : (
          <div className="space-y-3">{semFicha.map((f) => <SemFicha key={f.id} f={f} mudou={carregar} />)}</div>
        )
      ) : lista.length === 0 ? <Vazio>Nada por aqui.</Vazio> : (
        <ul className="painel divide-y divide-slate-100">
          {lista.map((l) => {
            const dias = diasDesde(l.formulario_enviado_em ?? l.atualizado_em)
            return (
              <li key={l.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-nude/60" onClick={() => mudar('aluna', String(l.aluna_id))}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-noite">
                    {l.aluna.nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-noite">{l.aluna.nome}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {l.status === 'aguardando_formulario' ? `Enviado há ${dias} dias` : `Atualizado em ${data(l.atualizado_em)}`}
                    </span>
                  </span>
                  <Selo cor={l.status === 'aguardando_formulario' && dias > 3 ? 'bg-red-100 text-red-700' : STATUS_ENTRADA[l.status].cor}>
                    {l.status === 'aguardando_formulario' && dias > 3 ? 'Cobrar' : STATUS_ENTRADA[l.status].rotulo}
                  </Selo>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {aberta && <EntradaGaveta key={aberta} alunaId={Number(aberta)} fechar={() => mudar('aluna', null)} mudou={carregar} />}
      {enviar && <EnviarFormulario fechar={() => setEnviar(false)} enviado={() => { setEnviar(false); mudar('aba', 'aguardando_formulario'); carregar() }} />}
      {config && <Configurar fechar={() => setConfig(false)} />}
    </div>
  )
}

function EnviarFormulario({ fechar, enviado }: { fechar: () => void; enviado: () => void }) {
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [link, setLink] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { supabase.from('config_texto').select('valor').eq('chave', 'link_formulario').maybeSingle().then(({ data: d }) => setLink(d?.valor ?? '')) }, [])
  const mensagem = aluna ? `Oi, ${aluna.nome.split(' ')[0]}! Seja bem-vinda ao Moonshot. Para a gente preparar o seu diagnóstico, preencha o formulário do seu negócio: ${link || '[link do formulário]'}` : ''
  const fone = aluna?.telefone?.replace(/\D/g, '').replace(/^55/, '')

  async function marcar() {
    if (!aluna) return
    const { error } = await supabase.rpc('enviar_formulario', { p_aluna: aluna.id })
    if (error) { setErro(mensagemErro(error)); return }
    enviado()
  }
  return (
    <Modal titulo="Enviar formulário" aberto fechar={fechar}>
      <div className="space-y-4">
        <Campo rotulo="Aluna"><EscolherAluna valor={aluna} mudar={setAluna} /></Campo>
        {aluna && (
          <>
            <Campo rotulo="Mensagem"><textarea className="entrada min-h-24 text-sm" readOnly value={mensagem} /></Campo>
            {!link && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">O link do formulário ainda não foi configurado. A coordenação coloca em Entrada → Configurar.</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={() => navigator.clipboard.writeText(mensagem)}><ClipboardCopy size={16} /> Copiar mensagem</button>
              {fone && <a className="btn-secundario" href={`https://wa.me/55${fone}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>}
            </div>
          </>
        )}
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={!aluna} onClick={marcar}>Marcar como enviado</button>
        </div>
      </div>
    </Modal>
  )
}

function Configurar({ fechar }: { fechar: () => void }) {
  const [link, setLink] = useState('')
  const [token, setToken] = useState('')
  const [salvo, setSalvo] = useState(false)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receber-formulario`
  useEffect(() => {
    supabase.from('config_texto').select('valor').eq('chave', 'link_formulario').maybeSingle().then(({ data: d }) => setLink(d?.valor ?? ''))
    supabase.rpc('token_formulario').then(({ data: d }) => setToken((d as string) ?? ''))
  }, [])
  async function salvar() {
    await supabase.from('config_texto').update({ valor: link.trim() }).eq('chave', 'link_formulario')
    setSalvo(true)
  }
  return (
    <Modal titulo="Configurar a entrada" aberto fechar={fechar} largo>
      <div className="space-y-5 text-sm">
        <div className="space-y-2">
          <Campo rotulo="Link do Google Forms" dica="Vai na mensagem que a CS manda para a aluna.">
            <input className="entrada" value={link} onChange={(e) => { setLink(e.target.value); setSalvo(false) }} placeholder="https://forms.gle/..." />
          </Campo>
          <button className="btn-primario" onClick={salvar}>{salvo ? 'Salvo' : 'Salvar link'}</button>
        </div>
        <div className="space-y-2 rounded-xl bg-nude p-4">
          <h3 className="font-medium text-noite">Ligar a planilha de respostas ao sistema (uma vez)</h3>
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li>Abra a planilha de respostas do Forms e vá em Extensões → Apps Script.</li>
            <li>Apague o que estiver lá e cole o código abaixo.</li>
            <li>Salve e rode a função <b>instalar</b>. O Google vai pedir autorização: aceite.</li>
            <li>Para trazer as respostas que já existem, rode <b>enviarTodas</b> uma vez.</li>
          </ol>
          <button className="btn-secundario" disabled={!token} onClick={() => navigator.clipboard.writeText(appsScript(token, url))}><ClipboardCopy size={16} /> Copiar código do Apps Script</button>
          <p className="text-xs text-slate-500">O código leva uma chave que só o sistema conhece. Não compartilhe fora da planilha.</p>
        </div>
      </div>
    </Modal>
  )
}

function SemFicha({ f, mudou }: { f: FormularioEntrada; mudou: () => void }) {
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function ligar(id: number | null) {
    const { error } = await supabase.rpc('ligar_formulario_a', { p_form: f.id, p_aluna: id })
    if (error) setErro(mensagemErro(error)); else mudou()
  }
  return (
    <div className="painel space-y-3 p-4">
      <div>
        <div className="font-medium text-noite">{f.nome ?? 'Sem nome'}</div>
        <div className="text-xs text-slate-500">{[f.email, f.telefone, `respondeu em ${dataHora(f.enviado_em ?? f.recebido_em)}`].filter(Boolean).join(' · ')}</div>
      </div>
      <button className="text-xs text-indigo-700 hover:underline" onClick={() => setVer(!ver)}>{ver ? 'Esconder respostas' : 'Ver respostas'}</button>
      {ver && <Respostas f={f} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1"><Campo rotulo="Ligar a uma ficha"><EscolherAluna valor={aluna} mudar={setAluna} /></Campo></div>
        <button className="btn-secundario" disabled={!aluna} onClick={() => ligar(aluna!.id)}>Ligar</button>
        <button className="btn-secundario" onClick={() => ligar(null)}>Criar ficha nova</button>
      </div>
      <Erro msg={erro} />
    </div>
  )
}

export function Respostas({ f }: { f: FormularioEntrada }) {
  return (
    <dl className="space-y-2 text-sm">
      {f.respostas.map((r, i) => (
        <div key={i}>
          <dt className="text-xs text-slate-500">{r.pergunta}</dt>
          <dd className="whitespace-pre-line text-noite">{r.resposta}</dd>
        </div>
      ))}
    </dl>
  )
}

type Form = Record<'texto_ia' | 'resumo' | 'porte' | 'dores' | 'objetivos' | 'nivel' | 'justificativa' | 'pauta' | 'consultor_sugerido_id' | 'cs_sugerido_id', string>

function EntradaGaveta({ alunaId, fechar, mudou }: { alunaId: number; fechar: () => void; mudou: () => void }) {
  const { eu, equipe, nomeDe } = useSessao()
  const coord = eu?.papel === 'coordenador'
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [pa, setPa] = useState<PreAnalise | null>(null)
  const [form, setForm] = useState<FormularioEntrada | null>(null)
  const [f, setF] = useState<Form | null>(null)
  const [carteiras, setCarteiras] = useState<Record<string, number>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [{ data: a }, { data: p }, { data: v }] = await Promise.all([
      supabase.from('aluna').select('*').eq('id', alunaId).maybeSingle(),
      supabase.from('pre_analise').select('*').eq('aluna_id', alunaId).maybeSingle(),
      supabase.from('aluna').select('consultor_id, cs_id').not('status_contrato', 'in', '(cancelado,encerrado)'),
    ])
    setAluna(a as Aluna | null)
    const pre = p as PreAnalise | null
    setPa(pre)
    const n: Record<string, number> = {}
    for (const x of (v ?? []) as { consultor_id: string | null; cs_id: string | null }[]) {
      if (x.consultor_id) n[x.consultor_id] = (n[x.consultor_id] ?? 0) + 1
      if (x.cs_id) n[x.cs_id] = (n[x.cs_id] ?? 0) + 1
    }
    setCarteiras(n)
    setF({
      texto_ia: pre?.texto_ia ?? '', resumo: pre?.resumo ?? '', porte: pre?.porte ?? '', dores: pre?.dores ?? '',
      objetivos: pre?.objetivos ?? '', nivel: pre?.nivel ? String(pre.nivel) : '', justificativa: pre?.justificativa ?? '',
      pauta: pre?.pauta ?? '', consultor_sugerido_id: pre?.consultor_sugerido_id ?? '', cs_sugerido_id: pre?.cs_sugerido_id ?? '',
    })
    if (pre?.formulario_id) {
      const { data: fo } = await supabase.from('formulario_entrada').select('*').eq('id', pre.formulario_id).maybeSingle()
      setForm(fo as FormularioEntrada | null)
    }
  }, [alunaId])
  useEffect(() => { carregar() }, [carregar])

  const pessoas = useMemo(() => equipe.filter((p) => p.ativo && (p.papel === 'consultor' || p.papel === 'cs')), [equipe])
  const editavel = pa?.status === 'formulario_recebido'
  const muda = (k: keyof Form, v: string) => setF((x) => (x ? { ...x, [k]: v } : x))

  function copiar() {
    const texto = textoParaGemini(aluna?.nome ?? '', form, pessoas.map((p) => ({ nome: p.nome, papel: p.papel ?? '', alunas: carteiras[p.id] ?? 0 })))
    navigator.clipboard.writeText(texto)
    setAviso('Copiado. Cole no Gemini e, quando ele responder, cole a resposta no campo abaixo.')
  }
  function preencher() {
    if (!f) return
    const r = lerResposta(f.texto_ia)
    const nivel = r.nivel?.match(/[1-5]/)?.[0] ?? f.nivel
    setF({
      ...f, resumo: r.resumo ?? f.resumo, porte: r.porte ?? f.porte, dores: r.dores ?? f.dores, objetivos: r.objetivos ?? f.objetivos,
      nivel, justificativa: r.justificativa ?? f.justificativa, pauta: r.pauta ?? f.pauta,
      consultor_sugerido_id: acharPessoa(r.consultor, pessoas.filter((p) => p.papel === 'consultor')) ?? f.consultor_sugerido_id,
      cs_sugerido_id: acharPessoa(r.cs, pessoas.filter((p) => p.papel === 'cs')) ?? f.cs_sugerido_id,
    })
    const achados = Object.keys(r).length
    setAviso(achados ? `Separei ${achados} de ${TITULOS.length} partes. Confira os campos.` : 'Não achei os títulos na resposta. Confira se o Gemini usou os títulos pedidos.')
  }
  async function salvar(enviarValidacao: boolean) {
    setErro(null)
    const { error } = await supabase.rpc('salvar_pre_analise', { p_aluna: alunaId, p: f, p_enviar: enviarValidacao })
    if (error) { setErro(mensagemErro(error)); return }
    mudou(); if (enviarValidacao) fechar(); else { setAviso('Rascunho salvo.'); carregar() }
  }

  return (
    <Gaveta aberto fechar={fechar}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-ouro">Entrada</div>
          <h2 className="truncate font-display text-2xl font-semibold text-noite">{aluna?.nome ?? '...'}</h2>
          {pa && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Selo cor={STATUS_ENTRADA[pa.status].cor}>{STATUS_ENTRADA[pa.status].rotulo}</Selo>
              {pa.formulario_enviado_em && <span>Formulário enviado em {data(pa.formulario_enviado_em)}</span>}
              <Link to={`/alunas/${alunaId}`} className="inline-flex items-center gap-1 text-indigo-700 hover:underline">ficha <ExternalLink size={11} /></Link>
            </div>
          )}
        </div>
        <button className="btn-fantasma -mr-2 p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
      </div>
      {!pa || !f ? <Carregando /> : (
        <div className="space-y-6 p-5">
          <details className="rounded-xl border border-slate-200 p-4" open={pa.status === 'formulario_recebido'}>
            <summary className="cursor-pointer font-medium text-noite">Respostas do formulário</summary>
            <div className="mt-3">{form ? <Respostas f={form} /> : <p className="text-sm text-slate-500">A aluna ainda não respondeu.</p>}</div>
          </details>

          {editavel && (
            <section className="space-y-3 rounded-xl border border-ouro/40 p-4">
              <h3 className="font-display text-lg font-semibold text-noite">Pré-análise</h3>
              <button className="btn-secundario" disabled={!form} onClick={copiar}><ClipboardCopy size={16} /> Copiar para o Gemini</button>
              <Campo rotulo="Resposta do Gemini"><textarea className="entrada min-h-28 text-xs" value={f.texto_ia} onChange={(e) => muda('texto_ia', e.target.value)} /></Campo>
              <button className="btn-secundario" disabled={!f.texto_ia.trim()} onClick={preencher}><Sparkles size={16} /> Preencher os campos</button>
              {aviso && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">{aviso}</p>}
              <CamposAnalise f={f} muda={muda} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Consultor sugerido"><EscolherPessoa valor={f.consultor_sugerido_id || null} mudar={(v) => muda('consultor_sugerido_id', v ?? '')} papeis={['consultor']} vazio="Escolher" /></Campo>
                <Campo rotulo="CS sugerida"><EscolherPessoa valor={f.cs_sugerido_id || null} mudar={(v) => muda('cs_sugerido_id', v ?? '')} papeis={['cs']} vazio="Escolher" /></Campo>
              </div>
              <Erro msg={erro} />
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secundario" onClick={() => salvar(false)}>Salvar rascunho</button>
                <button className="btn-primario" onClick={() => salvar(true)}><Send size={16} /> Enviar para validação</button>
              </div>
            </section>
          )}

          {!editavel && pa.status !== 'aguardando_formulario' && <Resumo pa={pa} nomeDe={nomeDe} />}
          {pa.status === 'para_validar' && coord && <Validar pa={pa} validado={() => { mudou(); fechar() }} />}
          {pa.status === 'para_validar' && !coord && <p className="text-sm text-slate-500">Esperando a validação da coordenação.</p>}
        </div>
      )}
    </Gaveta>
  )
}

function CamposAnalise({ f, muda }: { f: Form; muda: (k: keyof Form, v: string) => void }) {
  const texto = (k: keyof Form, rotulo: string) => (
    <Campo rotulo={rotulo}><textarea className="entrada min-h-16" value={f[k]} onChange={(e) => muda(k, e.target.value)} /></Campo>
  )
  return (
    <div className="space-y-3">
      {texto('resumo', 'Resumo do negócio')}
      {texto('porte', 'Porte e faturamento')}
      {texto('dores', 'Dores')}
      {texto('objetivos', 'Objetivos')}
      <Campo rotulo="Nível da empresa">
        <select className="entrada" value={f.nivel} onChange={(e) => muda('nivel', e.target.value)}>
          <option value="">Sem avaliação</option>
          {Object.entries(NIVEL).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
        </select>
      </Campo>
      {texto('justificativa', 'Por que esse consultor')}
      {texto('pauta', 'Pauta do diagnóstico')}
    </div>
  )
}

/** Pre-analise pronta, para quem le (coordenacao, consultor e a ficha da aluna). */
export function Resumo({ pa, nomeDe }: { pa: PreAnalise; nomeDe: (id: string | null) => string }) {
  const item = (rotulo: string, valor: string | null) => valor ? (
    <div><dt className="text-xs text-slate-500">{rotulo}</dt><dd className="whitespace-pre-line text-sm text-noite">{valor}</dd></div>
  ) : null
  return (
    <section className="space-y-3">
      <dl className="space-y-3">
        {item('Resumo do negócio', pa.resumo)}
        {item('Porte e faturamento', pa.porte)}
        {item('Dores', pa.dores)}
        {item('Objetivos', pa.objetivos)}
        {item('Nível da empresa', pa.nivel ? `${pa.nivel} · ${NIVEL[pa.nivel]}` : null)}
        {item('Pauta do diagnóstico', pa.pauta)}
      </dl>
      <div className="rounded-xl bg-nude p-3 text-sm">
        <div><span className="text-slate-500">Sugestão:</span> {nomeDe(pa.consultor_sugerido_id)}{pa.cs_sugerido_id ? ` · CS ${nomeDe(pa.cs_sugerido_id)}` : ''}</div>
        {pa.justificativa && <div className="mt-1 whitespace-pre-line text-slate-600">{pa.justificativa}</div>}
        {pa.consultor_final_id && (
          <div className="mt-2 flex items-center gap-1 text-emerald-800">
            <CheckCircle2 size={14} /> {pa.status === 'ajustada' ? 'Ajustado para' : 'Aprovado:'} {nomeDe(pa.consultor_final_id)}{pa.cs_final_id ? ` · CS ${nomeDe(pa.cs_final_id)}` : ''}
          </div>
        )}
        {pa.motivo_ajuste && <div className="mt-1 text-slate-600">Motivo: {pa.motivo_ajuste}</div>}
      </div>
    </section>
  )
}

function Validar({ pa, validado }: { pa: PreAnalise; validado: () => void }) {
  const [consultor, setConsultor] = useState<string | null>(pa.consultor_sugerido_id)
  const [cs, setCs] = useState<string | null>(pa.cs_sugerido_id)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const troca = consultor !== pa.consultor_sugerido_id || cs !== pa.cs_sugerido_id
  async function validar() {
    const { error } = await supabase.rpc('validar_pre_analise', { p_aluna: pa.aluna_id, p_consultor: consultor, p_cs: cs, p_motivo: motivo || null })
    if (error) setErro(mensagemErro(error)); else validado()
  }
  return (
    <section className="space-y-3 rounded-xl border-2 border-noite p-4">
      <h3 className="font-display text-lg font-semibold text-noite">Validar</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Consultor"><EscolherPessoa valor={consultor} mudar={setConsultor} papeis={['consultor']} vazio="Escolher" /></Campo>
        <Campo rotulo="CS"><EscolherPessoa valor={cs} mudar={setCs} papeis={['cs']} vazio="Escolher" /></Campo>
      </div>
      {troca && (
        <Campo rotulo="Por que trocou? *" dica="Isso ensina as regras do Gemini.">
          <textarea className="entrada min-h-16" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      )}
      <Erro msg={erro} />
      <div className="flex justify-end">
        <button className="btn-primario" disabled={!consultor} onClick={validar}><CheckCircle2 size={16} /> {troca ? 'Validar com a troca' : 'Aprovar'}</button>
      </div>
    </section>
  )
}

/** Bloco da ficha da aluna: a pre-analise e a pauta para o consultor preparar o diagnostico. */
export function PreAnaliseFicha({ alunaId }: { alunaId: number }) {
  const { nomeDe } = useSessao()
  const [pa, setPa] = useState<PreAnalise | null>(null)
  const [form, setForm] = useState<FormularioEntrada | null>(null)
  useEffect(() => {
    supabase.from('pre_analise').select('*').eq('aluna_id', alunaId).maybeSingle().then(async ({ data: p }) => {
      setPa(p as PreAnalise | null)
      if (p?.formulario_id) {
        const { data: f } = await supabase.from('formulario_entrada').select('*').eq('id', p.formulario_id).maybeSingle()
        setForm(f as FormularioEntrada | null)
      }
    })
  }, [alunaId])
  if (!pa || (!pa.resumo && !form)) return null
  return (
    <section className="painel space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-noite">Pré-análise</h2>
        <Selo cor={STATUS_ENTRADA[pa.status].cor}>{STATUS_ENTRADA[pa.status].rotulo}</Selo>
      </div>
      {pa.resumo ? <Resumo pa={pa} nomeDe={nomeDe} /> : <p className="text-sm text-slate-500">A pré-análise ainda não foi feita.</p>}
      {form && (
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-noite">Respostas do formulário</summary>
          <div className="mt-3"><Respostas f={form} /></div>
        </details>
      )}
    </section>
  )
}

/** Aviso no Inicio: o que a entrada espera de quem esta logado. */
export function AvisoEntrada() {
  const { eu } = useSessao()
  const coord = eu?.papel === 'coordenador'
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!coord && eu?.papel !== 'cs') return
    supabase.from('pre_analise').select('id', { count: 'exact', head: true }).eq('status', coord ? 'para_validar' : 'formulario_recebido')
      .then(({ count }) => setN(count ?? 0))
  }, [coord, eu?.papel])
  if (!n) return null
  return (
    <Link to={`/entrada?aba=${coord ? 'para_validar' : 'formulario_recebido'}`}
      className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <span><b>{n}</b> {coord ? (n === 1 ? 'pré-análise esperando sua validação' : 'pré-análises esperando sua validação') : (n === 1 ? 'formulário respondido para analisar' : 'formulários respondidos para analisar')}</span>
      <span className="font-medium">Abrir</span>
    </Link>
  )
}
