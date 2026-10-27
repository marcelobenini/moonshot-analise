import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Fechamento, FechamentoRegistro } from '../lib/tipos'
import { NIVEL, PRODUTOS_FECHAMENTO, STATUS_CASO, data, dataHora, mensagemErro, reais } from '../lib/util'
import { Campo, Carregando, EscolherAluna, EscolherPessoa, Erro, Gaveta, Selo } from '../componentes/ui'

/** Caso de In Company / Private: financeiro, situacao e o historico de registros. */
export function CasoGaveta({ id, fechar, mudou }: { id: number | 'novo'; fechar: () => void; mudou: () => void }) {
  const { eu, nomeDe } = useSessao()
  const financeiro = eu?.papel === 'coordenador' || eu?.papel === 'comercial'
  const [caso, setCaso] = useState<Fechamento | null>(null)
  const [registros, setRegistros] = useState<FechamentoRegistro[]>([])
  const [editando, setEditando] = useState(id === 'novo')

  const carregar = useCallback(async () => {
    if (id === 'novo') return
    const [{ data: f }, { data: r }] = await Promise.all([
      supabase.from('fechamento').select('*').eq('id', id).maybeSingle(),
      supabase.from('fechamento_registro').select('*').eq('fechamento_id', id).order('criado_em', { ascending: false }),
    ])
    setCaso((f ?? null) as Fechamento | null)
    setRegistros((r ?? []) as FechamentoRegistro[])
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  const salvo = () => { carregar(); mudou() }

  return (
    <Gaveta aberto fechar={fechar}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-ouro">{caso?.produto ?? 'Novo fechamento'}</div>
          <h2 className="truncate font-display text-2xl font-semibold text-noite">{caso?.nome ?? 'Lançar fechamento'}</h2>
          {caso && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Selo cor={STATUS_CASO[caso.status]?.cor ?? ''}>{STATUS_CASO[caso.status]?.rotulo}</Selo>
              {caso.nivel && <span>Nível {caso.nivel} · {NIVEL[caso.nivel]}</span>}
              <span>Fechado em {data(caso.data_fechamento)}</span>
              {caso.aluna_id && <Link to={`/alunas/${caso.aluna_id}`} className="inline-flex items-center gap-1 text-indigo-700 hover:underline">ficha <ExternalLink size={11} /></Link>}
            </div>
          )}
        </div>
        <button className="btn-fantasma -mr-2 p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
      </div>

      {id !== 'novo' && !caso ? <Carregando /> : (
        <div className="space-y-6 p-5">
          {editando && financeiro
            ? <FormFechamento caso={caso} cancelar={() => (caso ? setEditando(false) : fechar())}
                salvo={() => { setEditando(false); if (caso) salvo(); else { mudou(); fechar() } }} />
            : caso && (
              <>
                <section className="grid grid-cols-3 gap-3">
                  <Valor rotulo="Total" valor={caso.valor_total == null ? 'sem valor' : reais(caso.valor_total)} />
                  <Valor rotulo="Pago" valor={reais(caso.valor_pago)} />
                  <Valor rotulo="A receber" valor={reais(caso.saldo)} destaque={caso.saldo > 0} />
                </section>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Info rotulo="Consultor" valor={nomeDe(caso.consultor_id)} />
                  <Info rotulo="CS" valor={nomeDe(caso.cs_id)} />
                  <Info rotulo="Como já pagou" valor={caso.forma_pagamento} />
                  <Info rotulo="Meio futuro" valor={caso.meio_pagamento_futuro} />
                  <Info rotulo="Plano de pagamento" valor={caso.plano_pagamento} largo />
                  <Info rotulo="Observação" valor={caso.observacao} largo />
                </dl>
                {financeiro && <button className="btn-secundario" onClick={() => setEditando(true)}>Editar fechamento</button>}

                <section className="rounded-xl bg-nude p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Próximas ações</h3>
                  <p className="whitespace-pre-line text-sm text-noite">{caso.proximas_acoes || 'Nenhuma ação registrada ainda.'}</p>
                  {caso.proxima_acao_em && <p className="mt-2 text-xs text-slate-500">Próximo passo em {data(caso.proxima_acao_em)}</p>}
                </section>

                {eu?.papel !== 'gestao' && <NovoRegistro caso={caso} salvo={salvo} />}

                <section>
                  <h3 className="mb-3 font-display text-lg font-semibold text-noite">Histórico do caso</h3>
                  {registros.length === 0 ? <p className="text-sm text-slate-500">Nenhum registro ainda.</p> : (
                    <ol className="space-y-3">
                      {registros.map((r) => <Registro key={r.id} r={r} autor={nomeDe(r.autor_id)} />)}
                    </ol>
                  )}
                </section>
              </>
            )}
        </div>
      )}
    </Gaveta>
  )
}

function Valor({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={`mt-0.5 font-mono text-lg ${destaque ? 'text-amber-700' : 'text-noite'}`}>{valor}</div>
    </div>
  )
}

function Info({ rotulo, valor, largo }: { rotulo: string; valor: string | null; largo?: boolean }) {
  return (
    <div className={largo ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="whitespace-pre-line text-noite">{valor || 'não informado'}</dd>
    </div>
  )
}

function Registro({ r, autor }: { r: FechamentoRegistro; autor: string }) {
  const [aberta, setAberta] = useState(false)
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-noite">{autor}</span>
        <span>{dataHora(r.criado_em)}</span>
        {r.tipo === 'transcricao' && <span className="inline-flex items-center gap-1"><FileText size={12} /> transcrição</span>}
        {r.status && <Selo cor={STATUS_CASO[r.status]?.cor ?? ''}>{STATUS_CASO[r.status]?.rotulo}</Selo>}
        {r.nivel && <span>Nível {r.nivel}</span>}
      </div>
      {r.resumo && <p className="mt-2 whitespace-pre-line">{r.resumo}</p>}
      {r.acoes && <p className="mt-2 whitespace-pre-line text-slate-700"><b className="font-medium">Ações:</b> {r.acoes}</p>}
      {r.transcricao && (
        <button className="mt-2 text-xs text-indigo-700 hover:underline" onClick={() => setAberta(!aberta)}>
          {aberta ? 'Esconder transcrição' : 'Ver transcrição'}
        </button>
      )}
      {aberta && <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{r.transcricao}</pre>}
    </li>
  )
}

function NovoRegistro({ caso, salvo }: { caso: Fechamento; salvo: () => void }) {
  const [transcricao, setTranscricao] = useState('')
  const [resumo, setResumo] = useState('')
  const [status, setStatus] = useState<string>(caso.status)
  const [nivel, setNivel] = useState<string>(caso.nivel ? String(caso.nivel) : '')
  const [acoes, setAcoes] = useState('')
  const [quando, setQuando] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function arquivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/\.(txt|vtt|srt|md)$/i.test(f.name)) { setErro('Use um arquivo de texto (.txt, .vtt, .srt ou .md) ou cole o texto.'); return }
    setTranscricao(await f.text())
    setErro(null)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!transcricao.trim() && !resumo.trim() && !acoes.trim() && status === caso.status && nivel === String(caso.nivel ?? '')) {
      setErro('Suba a transcrição, escreva o que aconteceu ou mude o status, o nível ou as ações.'); return
    }
    const { error } = await supabase.from('fechamento_registro').insert({
      fechamento_id: caso.id, tipo: transcricao.trim() ? 'transcricao' : 'atualizacao',
      transcricao: transcricao.trim() || null, resumo: resumo.trim() || null,
      status: status !== caso.status ? status : null, nivel: nivel && nivel !== String(caso.nivel ?? '') ? Number(nivel) : null,
      acoes: acoes.trim() || null, proxima_acao_em: quando || null,
    })
    if (error) { setErro(mensagemErro(error)); return }
    setTranscricao(''); setResumo(''); setAcoes(''); setQuando('')
    salvo()
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border border-ouro/40 p-4">
      <h3 className="font-display text-lg font-semibold text-noite">Registrar acompanhamento</h3>
      <Campo rotulo="Transcrição da reunião" dica="Cole o texto ou suba o arquivo. A transcrição fica arquivada no histórico do caso.">
        <textarea className="entrada min-h-28 text-xs" value={transcricao} onChange={(e) => setTranscricao(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-secundario cursor-pointer"><FileText size={15} /> Subir arquivo
          <input type="file" accept=".txt,.vtt,.srt,.md,text/plain" className="hidden" onChange={arquivo} />
        </label>
      </div>
      <Campo rotulo="O que aconteceu">
        <textarea className="entrada min-h-20" value={resumo} onChange={(e) => setResumo(e.target.value)} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Status do caso">
          <select className="entrada" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_CASO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nível da empresa">
          <select className="entrada" value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Sem avaliação</option>
            {Object.entries(NIVEL).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Próximas ações">
        <textarea className="entrada min-h-20" value={acoes} onChange={(e) => setAcoes(e.target.value)} />
      </Campo>
      <Campo rotulo="Próximo passo em">
        <input type="date" className="entrada" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Campo>
      <Erro msg={erro} />
      <div className="flex justify-end"><button className="btn-primario">Salvar registro</button></div>
    </form>
  )
}

function FormFechamento({ caso, cancelar, salvo }: { caso: Fechamento | null; cancelar: () => void; salvo: () => void }) {
  const [f, setF] = useState<Partial<Fechamento>>(caso ?? { produto: 'Moonshot In Company', valor_pago: 0, status: 'implantacao', data_fechamento: new Date().toISOString().slice(0, 10) })
  const [aluna, setAluna] = useState<Aluna | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const muda = <K extends keyof Fechamento>(k: K, v: Fechamento[K] | null) => setF((x) => ({ ...x, [k]: v }))
  const num = (v: string) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const corpo = {
      nome: (f.nome ?? aluna?.nome ?? '').trim(), produto: f.produto, data_fechamento: f.data_fechamento,
      valor_total: f.valor_total ?? null, valor_pago: f.valor_pago ?? 0, forma_pagamento: f.forma_pagamento || null,
      plano_pagamento: f.plano_pagamento || null, meio_pagamento_futuro: f.meio_pagamento_futuro || null,
      observacao: f.observacao || null, consultor_id: f.consultor_id ?? null, cs_id: f.cs_id ?? null, status: f.status,
      ...(caso ? {} : { aluna_id: aluna?.id ?? null }),
    }
    if (!corpo.nome) { setErro('Diga o nome do cliente ou escolha a aluna.'); return }
    const { error } = caso
      ? await supabase.from('fechamento').update(corpo).eq('id', caso.id)
      : await supabase.from('fechamento').insert(corpo)
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      {!caso && (
        <Campo rotulo="Aluna" dica="Ligar à ficha sobe a aluna de programa e cria o contrato.">
          <EscolherAluna valor={aluna} mudar={(a) => { setAluna(a); if (a && !f.nome) muda('nome', a.nome); if (a) { muda('consultor_id', a.consultor_id); muda('cs_id', a.cs_id) } }} />
        </Campo>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do cliente"><input className="entrada" value={f.nome ?? ''} onChange={(e) => muda('nome', e.target.value)} /></Campo>
        <Campo rotulo="Produto">
          <select className="entrada" value={f.produto} onChange={(e) => muda('produto', e.target.value)}>
            {PRODUTOS_FECHAMENTO.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Data do fechamento"><input type="date" className="entrada" value={f.data_fechamento ?? ''} onChange={(e) => muda('data_fechamento', e.target.value)} /></Campo>
        <Campo rotulo="Status do caso">
          <select className="entrada" value={f.status} onChange={(e) => muda('status', e.target.value as Fechamento['status'])}>
            {Object.entries(STATUS_CASO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor total (R$)"><input className="entrada" inputMode="decimal" value={f.valor_total ?? ''} onChange={(e) => muda('valor_total', num(e.target.value))} /></Campo>
        <Campo rotulo="Valor já pago (R$)"><input className="entrada" inputMode="decimal" value={f.valor_pago ?? ''} onChange={(e) => muda('valor_pago', num(e.target.value) ?? 0)} /></Campo>
        <Campo rotulo="Consultor"><EscolherPessoa valor={f.consultor_id ?? null} mudar={(v) => muda('consultor_id', v)} papeis={['consultor']} /></Campo>
        <Campo rotulo="CS"><EscolherPessoa valor={f.cs_id ?? null} mudar={(v) => muda('cs_id', v)} papeis={['cs']} /></Campo>
        <Campo rotulo="Como já pagou"><input className="entrada" value={f.forma_pagamento ?? ''} onChange={(e) => muda('forma_pagamento', e.target.value)} /></Campo>
        <Campo rotulo="Meio de pagamento futuro"><input className="entrada" value={f.meio_pagamento_futuro ?? ''} onChange={(e) => muda('meio_pagamento_futuro', e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Plano de pagamento"><textarea className="entrada min-h-16" value={f.plano_pagamento ?? ''} onChange={(e) => muda('plano_pagamento', e.target.value)} /></Campo>
      <Campo rotulo="Observação"><textarea className="entrada min-h-16" value={f.observacao ?? ''} onChange={(e) => muda('observacao', e.target.value)} /></Campo>
      <Erro msg={erro} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secundario" onClick={cancelar}>Cancelar</button>
        <button className="btn-primario">Salvar fechamento</button>
      </div>
    </form>
  )
}
