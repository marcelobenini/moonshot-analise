import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Circle, ClipboardList, ExternalLink, KanbanSquare, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Acompanhamento as Registro, AgendaConsultoria, Aluna, JornadaEtapa, RegistroConsultoria, Saude } from '../lib/tipos'
import { EDITA_ALUNA, SAUDE, data, mensagemErro } from '../lib/util'
import { Campo, Carregando, Erro, Gaveta, Selo, Titulo, Vazio } from '../componentes/ui'
import { Segmento } from '../componentes/painel'

// O Elite segue o roteiro do Pro.
const PROGRAMAS = [
  { id: 'Moonshot Club', rotulo: 'Club' },
  { id: 'Moonshot Pró', rotulo: 'Pró' },
  { id: 'Moonshot In Company', rotulo: 'In Company' },
  { id: 'Moonshot Private', rotulo: 'Private' },
]
const programaDe = (produto: string | null) => (produto === 'Moonshot Elite' ? 'Moonshot Pró' : produto ?? '')

type Situacao = { estado: 'feito' | 'agendado' | 'pendente' | 'nao_se_aplica'; data: string | null }
type Dados = { registros: RegistroConsultoria[]; agenda: AgendaConsultoria[]; encontros: Registro[] }

function situacao(etapa: JornadaEtapa, alunaId: number, d: Dados): Situacao {
  if (etapa.tipo === 'consultoria') {
    const r = d.registros.find((x) => x.aluna_id === alunaId && x.numero === etapa.numero && x.realizada)
    if (r) return { estado: 'feito', data: r.data }
    const g = d.agenda.find((x) => x.aluna_id === alunaId && x.numero === etapa.numero)
    if (g?.realizada_em) return { estado: 'feito', data: g.realizada_em }
    if (g?.data_prevista) return { estado: 'agendado', data: g.data_prevista }
    return { estado: 'pendente', data: null }
  }
  const e = d.encontros.find((x) => x.aluna_id === alunaId && x.etapa_chave === etapa.chave)
  if (!e) return { estado: 'pendente', data: null }
  return { estado: e.status === 'agendado' ? 'agendado' : e.status, data: e.data }
}

/** Alterna entre o roteiro do consultor e o quadro de funis. */
export function AlternarVisao({ atual }: { atual: 'acompanhamento' | 'funil' }) {
  const item = (id: 'acompanhamento' | 'funil', para: string, rotulo: string, I: typeof ClipboardList) => (
    <Link to={para} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${atual === id ? 'bg-noite text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
      <I size={15} /> {rotulo}
    </Link>
  )
  return (
    <div className="inline-flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
      {item('acompanhamento', '/acompanhamento', 'Acompanhamento', ClipboardList)}
      {item('funil', '/funis', 'Funil', KanbanSquare)}
    </div>
  )
}

/** Roteiro de cada aluna, por programa: o consultor preenche etapa por etapa. */
export function Acompanhamento() {
  const { eu } = useSessao()
  const [busca, setBusca] = useSearchParams()
  const programa = busca.get('programa') ?? PROGRAMAS[0].id
  const aberta = busca.get('aluna')
  const [etapas, setEtapas] = useState<JornadaEtapa[]>([])
  const [alunas, setAlunas] = useState<Aluna[] | null>(null)
  const [dados, setDados] = useState<Dados>({ registros: [], agenda: [], encontros: [] })
  const [minhas, setMinhas] = useState(eu?.papel === 'consultor')
  const [termo, setTermo] = useState('')

  const carregar = useCallback(async () => {
    let q = supabase.from('aluna').select('*').not('status_contrato', 'in', '(cancelado,encerrado)')
      .in('produto', ['Moonshot Club', 'Moonshot Pró', 'Moonshot Elite', 'Moonshot In Company', 'Moonshot Private']).order('nome')
    if (minhas && eu) q = q.eq('consultor_id', eu.id)
    const [{ data: e }, { data: a }] = await Promise.all([
      supabase.from('jornada_etapa').select('*').order('ordem'), q,
    ])
    const lista = (a ?? []) as Aluna[]
    const ids = lista.map((x) => x.id)
    const [{ data: r }, { data: g }, { data: n }] = ids.length ? await Promise.all([
      supabase.from('registro_consultoria').select('id, aluna_id, numero, realizada, data').in('aluna_id', ids),
      supabase.from('consultoria_agenda').select('*').in('aluna_id', ids),
      supabase.from('acompanhamento').select('*').in('aluna_id', ids),
    ]) : [{ data: [] }, { data: [] }, { data: [] }]
    setEtapas((e ?? []) as JornadaEtapa[])
    setAlunas(lista)
    setDados({ registros: (r ?? []) as RegistroConsultoria[], agenda: (g ?? []) as AgendaConsultoria[], encontros: (n ?? []) as Registro[] })
  }, [minhas, eu])
  useEffect(() => { carregar() }, [carregar])

  const mudar = (k: string, v: string | null) => setBusca((b) => { if (v) b.set(k, v); else b.delete(k); return b })
  const doPrograma = (p: string) => (alunas ?? []).filter((a) => programaDe(a.produto) === p)
  const roteiro = etapas.filter((e) => e.programa === programa)
  const lista = doPrograma(programa).filter((a) => !termo || a.nome.toLowerCase().includes(termo.toLowerCase()))
  const alunaAberta = (alunas ?? []).find((a) => String(a.id) === aberta)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo>Acompanhamento</Titulo>
        <AlternarVisao atual="acompanhamento" />
      </div>
      <Segmento opcoes={PROGRAMAS.map((p) => ({ id: p.id, rotulo: `${p.rotulo} · ${doPrograma(p.id).length}` }))} valor={programa} mudar={(v) => mudar('programa', v)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="entrada pl-9" placeholder="Buscar aluna" value={termo} onChange={(e) => setTermo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={minhas} onChange={(e) => setMinhas(e.target.checked)} /> Minha carteira
        </label>
      </div>

      {alunas === null ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhuma aluna neste programa.</Vazio> : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((a) => {
            const s = roteiro.map((e) => ({ e, s: situacao(e, a.id, dados) }))
            const feitas = s.filter((x) => x.s.estado === 'feito' || x.s.estado === 'nao_se_aplica').length
            const proxima = s.find((x) => x.s.estado !== 'feito' && x.s.estado !== 'nao_se_aplica')
            return (
              <li key={a.id}>
                <button className="painel w-full p-4 text-left hover:ring-2 hover:ring-ouro/40" onClick={() => mudar('aluna', String(a.id))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-noite">{a.nome}</div>
                      <div className="truncate text-xs text-slate-500">{a.produto?.replace('Moonshot ', '')}{a.empresa ? ` · ${a.empresa}` : ''}</div>
                    </div>
                    {a.saude && <Selo cor={SAUDE[a.saude].cor}>{SAUDE[a.saude].rotulo}</Selo>}
                  </div>
                  <div className="mt-3 flex gap-1">
                    {s.map(({ e, s: st }) => (
                      <span key={e.chave} title={e.nome} className={`h-1.5 flex-1 rounded-full ${st.estado === 'feito' ? 'bg-emerald-500' : st.estado === 'agendado' ? 'bg-amber-400' : st.estado === 'nao_se_aplica' ? 'bg-slate-300' : 'bg-slate-100'}`} />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{feitas} de {roteiro.length} etapas</span>
                    <span className="truncate">{proxima ? `Próxima: ${proxima.e.nome}${proxima.s.estado === 'agendado' ? ` em ${data(proxima.s.data)}` : ''}` : 'Roteiro completo'}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {alunaAberta && <RoteiroGaveta key={alunaAberta.id} aluna={alunaAberta} etapas={etapas.filter((e) => e.programa === programaDe(alunaAberta.produto))}
        dados={dados} fechar={() => mudar('aluna', null)} mudou={carregar} />}
    </div>
  )
}

function RoteiroGaveta({ aluna, etapas, dados, fechar, mudou }: {
  aluna: Aluna; etapas: JornadaEtapa[]; dados: Dados; fechar: () => void; mudou: () => void
}) {
  const [aberta, setAberta] = useState<string | null>(null)
  return (
    <Gaveta aberto fechar={fechar}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-ouro">{aluna.produto}</div>
          <h2 className="truncate font-display text-2xl font-semibold text-noite">{aluna.nome}</h2>
          <Link to={`/alunas/${aluna.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">abrir ficha <ExternalLink size={11} /></Link>
        </div>
        <button className="btn-fantasma -mr-2 p-1.5" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
      </div>
      <ol className="space-y-2 p-5">
        {etapas.map((e) => {
          const s = situacao(e, aluna.id, dados)
          const reg = e.tipo === 'consultoria'
            ? dados.registros.find((x) => x.aluna_id === aluna.id && x.numero === e.numero && x.realizada)
            : undefined
          const enc = dados.encontros.find((x) => x.aluna_id === aluna.id && x.etapa_chave === e.chave)
          return (
            <li key={e.chave} className="rounded-xl border border-slate-200">
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setAberta(aberta === e.chave ? null : e.chave)}>
                {s.estado === 'feito' ? <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
                  : s.estado === 'agendado' ? <CalendarClock size={20} className="shrink-0 text-amber-500" />
                    : <Circle size={20} className={`shrink-0 ${s.estado === 'nao_se_aplica' ? 'text-slate-300' : 'text-slate-300'}`} />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${s.estado === 'nao_se_aplica' ? 'text-slate-400 line-through' : 'text-noite'}`}>{e.nome}</span>
                  <span className="block text-xs text-slate-500">
                    {s.estado === 'feito' ? `Feito em ${data(s.data)}` : s.estado === 'agendado' ? `Agendado para ${data(s.data)}` : s.estado === 'nao_se_aplica' ? 'Não se aplica' : 'Pendente'}
                  </span>
                </span>
              </button>
              {aberta === e.chave && (
                <div className="border-t border-slate-100 px-4 py-4">
                  {reg ? <RegistroFeito r={reg} /> : (
                    <FormEtapa aluna={aluna} etapa={e} encontro={enc} agendada={s.estado === 'agendado' ? s.data : null}
                      salvo={() => { setAberta(null); mudou() }} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </Gaveta>
  )
}

function RegistroFeito({ r }: { r: RegistroConsultoria }) {
  const [completo, setCompleto] = useState<RegistroConsultoria | null>(null)
  useEffect(() => { supabase.from('registro_consultoria').select('*').eq('id', r.id).maybeSingle().then(({ data: d }) => setCompleto(d as RegistroConsultoria | null)) }, [r.id])
  if (!completo) return <Carregando />
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex items-center gap-2"><Selo cor={SAUDE[completo.saude].cor}>{SAUDE[completo.saude].rotulo}</Selo><span className="text-xs text-slate-500">{data(completo.data)}</span></div>
      <div><dt className="text-xs text-slate-500">Como foi</dt><dd className="whitespace-pre-line">{completo.situacao}</dd></div>
      {completo.proximo_passo && <div><dt className="text-xs text-slate-500">Próximos passos</dt><dd className="whitespace-pre-line">{completo.proximo_passo}</dd></div>}
    </dl>
  )
}

function FormEtapa({ aluna, etapa, encontro, agendada, salvo }: {
  aluna: Aluna; etapa: JornadaEtapa; encontro?: Registro; agendada: string | null; salvo: () => void
}) {
  const { eu } = useSessao()
  const pode = EDITA_ALUNA.includes(eu?.papel ?? '')
  const consultoria = etapa.tipo === 'consultoria'
  const hoje = new Date().toISOString().slice(0, 10)
  const [status, setStatus] = useState<'feito' | 'agendado' | 'nao_se_aplica'>(encontro?.status ?? (agendada ? 'feito' : 'feito'))
  const [dia, setDia] = useState(encontro?.data ?? agendada ?? hoje)
  const [resumo, setResumo] = useState(encontro?.resumo ?? '')
  const [passos, setPassos] = useState(encontro?.proximos_passos ?? '')
  const [proxima, setProxima] = useState(encontro?.proxima_data ?? '')
  const [saude, setSaude] = useState<Saude | ''>(aluna.saude ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const opcoes = useMemo(() => [
    { id: 'feito' as const, rotulo: 'Feito' }, { id: 'agendado' as const, rotulo: 'Agendar' },
    ...(consultoria ? [] : [{ id: 'nao_se_aplica' as const, rotulo: 'Não se aplica' }]),
  ], [consultoria])

  async function salvar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    if (consultoria && status === 'agendado') {
      const { error } = await supabase.from('consultoria_agenda').upsert({ aluna_id: aluna.id, numero: etapa.numero, data_prevista: dia }, { onConflict: 'aluna_id,numero' })
      if (error) { setErro(mensagemErro(error)); return }
    } else if (consultoria) {
      if (!saude) { setErro('Escolha como a aluna está: é o que dispara retenção e oportunidade.'); return }
      if (!resumo.trim()) { setErro('Conte como foi o encontro.'); return }
      const { error } = await supabase.from('registro_consultoria').insert({
        aluna_id: aluna.id, consultor_id: eu?.id, data: dia, numero: etapa.numero, realizada: true,
        saude, situacao: resumo.trim(), proximo_passo: passos.trim() || null,
      })
      if (error) { setErro(mensagemErro(error)); return }
      if (proxima && etapa.numero != null && etapa.numero < 10) {
        await supabase.from('consultoria_agenda').upsert({ aluna_id: aluna.id, numero: etapa.numero + 1, data_prevista: proxima }, { onConflict: 'aluna_id,numero' })
      }
    } else {
      const { error } = await supabase.from('acompanhamento').upsert({
        aluna_id: aluna.id, etapa_chave: etapa.chave, status, data: status === 'nao_se_aplica' ? null : dia,
        resumo: resumo.trim() || null, proximos_passos: passos.trim() || null, proxima_data: proxima || null,
        autor_id: eu?.id, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'aluna_id,etapa_chave' })
      if (error) { setErro(mensagemErro(error)); return }
    }
    salvo()
  }

  if (!pode) return <p className="text-sm text-slate-500">{encontro?.resumo ?? 'Ainda não preenchido.'}</p>
  return (
    <form onSubmit={salvar} className="space-y-3">
      <Segmento opcoes={opcoes} valor={status} mudar={setStatus} />
      {status !== 'nao_se_aplica' && (
        <Campo rotulo={status === 'agendado' ? 'Data marcada' : 'Data do encontro'}>
          <input type="date" className="entrada" value={dia} onChange={(e) => setDia(e.target.value)} required />
        </Campo>
      )}
      {status === 'feito' && (
        <>
          {consultoria && (
            <Campo rotulo="Como a aluna está *">
              <select className="entrada" value={saude} onChange={(e) => setSaude(e.target.value as Saude)}>
                <option value="">Escolher</option>
                {Object.entries(SAUDE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo={consultoria ? 'Como foi *' : 'Como foi'}>
            <textarea className="entrada min-h-24" value={resumo} onChange={(e) => setResumo(e.target.value)} />
          </Campo>
          <Campo rotulo="Próximos passos"><textarea className="entrada min-h-20" value={passos} onChange={(e) => setPassos(e.target.value)} /></Campo>
          <Campo rotulo={consultoria ? 'Próximo encontro em' : 'Próxima data'} dica={consultoria ? 'Já agenda a próxima consultoria.' : undefined}>
            <input type="date" className="entrada" value={proxima} onChange={(e) => setProxima(e.target.value)} />
          </Campo>
        </>
      )}
      <Erro msg={erro} />
      <div className="flex justify-end"><button className="btn-primario">Salvar</button></div>
    </form>
  )
}
