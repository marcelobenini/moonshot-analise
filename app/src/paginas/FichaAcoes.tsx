import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Acontecimento, Aluna, Card, PotencialDetalhe, RegistroConsultoria } from '../lib/tipos'
import { CANAIS, FINANCEIRO, NOTA, SAUDE, STATUS_CONTRATO, data, diasDesde, hoje, mensagemErro, reais } from '../lib/util'
import { Campo, Erro, Modal, Potencial, Selo } from '../componentes/ui'

// Panorama: o que a planilha obrigava a ler em cinco abas, numa faixa so.
export function Panorama({ aluna, registros, cards }: { aluna: Aluna; registros: RegistroConsultoria[]; cards: Card[] }) {
  const feitas = new Set(registros.filter((r) => r.realizada && r.numero != null && r.numero > 0).map((r) => r.numero)).size
  const semConsultoria = aluna.ultima_consultoria ? diasDesde(aluna.ultima_consultoria) : null
  const semContato = aluna.ultimo_contato ? diasDesde(aluna.ultimo_contato) : null
  const paraVencer = aluna.termino ? -diasDesde(aluna.termino) : null
  const abertos = cards.filter((c) => !c.fechado_em).length
  const itens: [string, string, boolean][] = [
    ['Consultorias', `${feitas} de 5`, false],
    ['Sem consultoria', semConsultoria == null ? 'nenhuma ainda' : `${semConsultoria} dias`, (semConsultoria ?? 0) > 90],
    ['Último contato', semContato == null ? 'nunca' : semContato === 0 ? 'hoje' : `há ${semContato} dias`, semContato == null || semContato > 30],
    ['Próximo retorno', aluna.proximo_contato ? data(aluna.proximo_contato) : 'nenhum', !!aluna.proximo_contato && aluna.proximo_contato < hoje()],
    ['Vence em', paraVencer == null ? 'sem data' : paraVencer < 0 ? 'vencido' : `${paraVencer} dias`, paraVencer != null && paraVencer <= 120],
    ['Em funis', String(abertos), false],
  ]
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
      {itens.map(([r, v, alerta]) => (
        <div key={r} className="bg-white px-4 py-3">
          <div className="text-xs text-slate-500">{r}</div>
          <div className={`text-base font-semibold ${alerta ? 'text-red-600' : ''}`}>{v}</div>
        </div>
      ))}
    </div>
  )
}

// Perfil do negocio: resumo, dores e objetivos. E o que a comercial le
// antes de ligar e o que a CS nova le antes do primeiro contato.
export function PerfilNegocio({ aluna, pode, mudou }: { aluna: Aluna; pode: boolean; mudou: () => void }) {
  const [editar, setEditar] = useState(false)
  const [f, setF] = useState({ resumo: '', dores: '', objetivos: '', instagram: '' })
  const [erro, setErro] = useState<string | null>(null)
  function abrir() {
    setF({ resumo: aluna.resumo ?? '', dores: aluna.dores ?? '', objetivos: aluna.objetivos ?? '', instagram: aluna.instagram ?? '' })
    setEditar(true)
  }
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const campos = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]))
    const { error } = await supabase.from('aluna').update(campos).eq('id', aluna.id)
    if (error) { setErro(mensagemErro(error)); return }
    setEditar(false); mudou()
  }
  const vazio = !aluna.resumo && !aluna.dores && !aluna.objetivos
  return (
    <section className="painel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Perfil do negócio</h2>
        {pode && <button className="btn-fantasma px-2 py-1 text-xs" onClick={abrir}><Pencil size={13} /> Editar</button>}
      </div>
      {vazio ? (
        <p className="text-sm text-slate-500">
          Ainda sem resumo, dores ou objetivos.{pode && ' Preencha: é o que a comercial e a retenção leem antes de falar com ela.'}
        </p>
      ) : (
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <Bloco titulo="Resumo" texto={aluna.resumo} />
          <Bloco titulo="Dores" texto={aluna.dores} />
          <Bloco titulo="Objetivos" texto={aluna.objetivos} />
        </div>
      )}
      {aluna.instagram && <div className="mt-3 text-xs text-slate-500">Instagram: <a className="text-indigo-700" target="_blank" rel="noreferrer" href={`https://instagram.com/${aluna.instagram.replace(/^@/, '')}`}>{aluna.instagram}</a></div>}
      {editar && (
        <Modal titulo="Perfil do negócio" aberto fechar={() => setEditar(false)} largo>
          <form onSubmit={salvar} className="space-y-4">
            <Campo rotulo="Resumo" dica="Quem é, o que vende, tamanho, momento. Três ou quatro linhas.">
              <textarea className="entrada min-h-24" value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} />
            </Campo>
            <Campo rotulo="Dores" dica="O que trava o negócio hoje, nas palavras dela.">
              <textarea className="entrada min-h-24" value={f.dores} onChange={(e) => setF({ ...f, dores: e.target.value })} />
            </Campo>
            <Campo rotulo="Objetivos" dica="Onde quer chegar: faturamento, equipe, unidades, prazo.">
              <textarea className="entrada min-h-24" value={f.objetivos} onChange={(e) => setF({ ...f, objetivos: e.target.value })} />
            </Campo>
            <Campo rotulo="Instagram"><input className="entrada" placeholder="@perfil" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} /></Campo>
            <Erro msg={erro} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setEditar(false)}>Cancelar</button>
              <button className="btn-primario">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <p className="whitespace-pre-wrap text-slate-700">{texto || <span className="text-slate-400">Não preenchido</span>}</p>
    </div>
  )
}

// Contato da CS (ou de quem atende): o que foi falado e quando volta a falar.
export function RegistrarContato({ aluna, fechar, salvo }: { aluna: Aluna; fechar: () => void; salvo: () => void }) {
  const [f, setF] = useState({ canal: 'WhatsApp', texto: '', retorno_em: '' })
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('nota_aluna').insert({
      aluna_id: aluna.id, tipo: 'contato', canal: f.canal, texto: f.texto.trim(),
      retorno_em: f.retorno_em || null, autor_id: u.user?.id,
    })
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }
  const atalho = (dias: number) => {
    const d = new Date(); d.setDate(d.getDate() + dias)
    setF({ ...f, retorno_em: d.toLocaleDateString('sv-SE') })
  }
  return (
    <Modal titulo={`Registrar contato · ${aluna.nome}`} aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Canal">
          <div className="flex flex-wrap gap-1.5">
            {CANAIS.map((c) => (
              <button type="button" key={c} onClick={() => setF({ ...f, canal: c })}
                className={`rounded-full border px-3 py-1 text-sm ${f.canal === c ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{c}</button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="O que foi falado *">
          <textarea className="entrada min-h-28" required autoFocus value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
        </Campo>
        <Campo rotulo="Retornar em" dica="Aparece no Início de quem atende a aluna quando chegar o dia.">
          <div className="flex flex-wrap items-center gap-2">
            <input className="entrada w-auto" type="date" value={f.retorno_em} onChange={(e) => setF({ ...f, retorno_em: e.target.value })} />
            {[[3, '3 dias'], [7, '1 semana'], [15, '15 dias'], [30, '1 mês']].map(([d, r]) => (
              <button type="button" key={d} className="btn-fantasma px-2 py-1 text-xs" onClick={() => atalho(d as number)}>{r}</button>
            ))}
          </div>
        </Campo>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Salvar contato</button>
        </div>
      </form>
    </Modal>
  )
}

const STATUS_RAPIDO: { rotulo: string; contrato?: string; financeiro?: string; cor: string }[] = [
  { rotulo: 'Ativa', contrato: 'ativo', cor: 'border-emerald-300 text-emerald-800' },
  { rotulo: 'Inadimplente', financeiro: 'inadimplente', cor: 'border-red-300 text-red-700' },
  { rotulo: 'Pagamento em dia', financeiro: 'adimplente', cor: 'border-emerald-300 text-emerald-800' },
  { rotulo: 'Pausada', contrato: 'pausado', cor: 'border-sky-300 text-sky-800' },
  { rotulo: 'Bloqueada', contrato: 'bloqueado', cor: 'border-red-300 text-red-700' },
  { rotulo: 'Cancelada', contrato: 'cancelado', cor: 'border-slate-400 text-slate-800' },
  { rotulo: 'Encerrada', contrato: 'encerrado', cor: 'border-slate-300 text-slate-600' },
]

export function MudarStatus({ aluna, fechar, salvo }: { aluna: Aluna; fechar: () => void; salvo: () => void }) {
  const [escolha, setEscolha] = useState<(typeof STATUS_RAPIDO)[number] | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const exige = escolha && (escolha.financeiro === 'inadimplente' || ['cancelado', 'pausado', 'bloqueado', 'encerrado'].includes(escolha.contrato ?? ''))
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!escolha) return
    const { error } = await supabase.rpc('mudar_status_aluna', {
      p_aluna: aluna.id, p_status_contrato: escolha.contrato ?? null,
      p_status_financeiro: escolha.financeiro ?? null, p_motivo: motivo.trim() || null,
    })
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }
  return (
    <Modal titulo={`Status · ${aluna.nome}`} aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          Hoje:
          <Selo cor={STATUS_CONTRATO[aluna.status_contrato]?.cor ?? ''}>{STATUS_CONTRATO[aluna.status_contrato]?.rotulo ?? aluna.status_contrato}</Selo>
          {aluna.status_financeiro && <Selo cor={FINANCEIRO[aluna.status_financeiro]?.cor ?? 'bg-slate-100'}>{FINANCEIRO[aluna.status_financeiro]?.rotulo ?? aluna.status_financeiro}</Selo>}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_RAPIDO.map((s) => (
            <button type="button" key={s.rotulo} onClick={() => setEscolha(s)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${s.cor} ${escolha === s ? 'ring-2 ring-indigo-400' : 'hover:bg-slate-50'}`}>{s.rotulo}</button>
          ))}
        </div>
        {escolha && (
          <Campo rotulo={exige ? 'Motivo *' : 'Motivo'} dica="Fica no histórico da aluna e vai no aviso para o consultor e a CS.">
            <textarea className="entrada min-h-20" required={!!exige} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        )}
        {escolha?.contrato === 'cancelado' && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            Pedido de cancelamento em andamento? Coloque a aluna no funil de <b>Retenção</b> em vez de cancelar direto: assim a retenção tenta reverter e o motivo entra na taxa.
          </p>
        )}
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={!escolha}>Salvar status</button>
        </div>
      </form>
    </Modal>
  )
}

// A passagem: o consultor diz por que, a comercial recebe tudo isso no card.
export function EnviarComercial({ aluna, fechar, enviado }: { aluna: Aluna; fechar: () => void; enviado: (card: number | null) => void }) {
  const [f, setF] = useState({ produto: 'Elite', faturamento: aluna.faturamento_mensal != null ? String(aluna.faturamento_mensal) : '', justificativa: '', canal: '', observacao: '' })
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { data: card, error } = await supabase.rpc('enviar_ao_comercial', {
      p_aluna: aluna.id, p_produto: f.produto, p_faturamento: f.faturamento ? Number(f.faturamento) : null,
      p_justificativa: f.justificativa, p_canal: f.canal || null, p_observacao: f.observacao || null,
    })
    if (error) { setErro(mensagemErro(error)); return }
    enviado(card as number | null)
  }
  return (
    <Modal titulo={`Enviar ao comercial · ${aluna.nome}`} aberto fechar={fechar} largo>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-slate-600">
          A comercial recebe a aluna no funil dela com a ficha completa, os seus relatos de consultoria e o que você escrever aqui.
          Você é avisado quando ela fechar ou for devolvida.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Produto de interesse">
            <select className="entrada" value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })}>
              {['Elite', 'Private', 'Presencial', 'Clínica', 'Produtos'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Faturamento mensal atual (R$)"><input className="entrada" type="number" min="0" value={f.faturamento} onChange={(e) => setF({ ...f, faturamento: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Por que é uma oportunidade? *" dica="Porte, momento, interesse que ela demonstrou.">
          <textarea className="entrada min-h-24" required value={f.justificativa} onChange={(e) => setF({ ...f, justificativa: e.target.value })} />
        </Campo>
        <Campo rotulo="Melhor canal e horário"><input className="entrada" placeholder="WhatsApp, à tarde" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} /></Campo>
        <Campo rotulo="Observação para a comercial" dica="O que ela precisa saber antes de ligar: objeções, sócio, cuidado com algum assunto.">
          <textarea className="entrada min-h-20" value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
        </Campo>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Enviar ao comercial</button>
        </div>
      </form>
    </Modal>
  )
}

const TIPOS_TEMPO: Record<Acontecimento['tipo'], { rotulo: string; cor: string }> = {
  contato: { rotulo: 'Contato', cor: 'bg-sky-500' },
  consultoria: { rotulo: 'Consultoria', cor: 'bg-indigo-500' },
  nota: { rotulo: 'Anotação', cor: 'bg-slate-400' },
  status: { rotulo: 'Status', cor: 'bg-amber-500' },
  funil: { rotulo: 'Funis', cor: 'bg-violet-500' },
  contrato: { rotulo: 'Contrato', cor: 'bg-emerald-500' },
  demanda: { rotulo: 'Demanda', cor: 'bg-rose-400' },
  evento: { rotulo: 'Evento', cor: 'bg-teal-500' },
}

const CAMPO_STATUS: Record<string, string> = {
  status_contrato: 'Contrato', status_financeiro: 'Financeiro', saude: 'Saúde', produto: 'Produto', consultor: 'Consultor', cs: 'CS',
}

function rotuloValor(campo: string | null, v: unknown) {
  if (v == null || v === '') return 'vazio'
  const s = String(v)
  if (campo === 'saude') return SAUDE[s as keyof typeof SAUDE]?.rotulo ?? s
  if (campo === 'status_contrato') return STATUS_CONTRATO[s]?.rotulo ?? s
  if (campo === 'status_financeiro') return FINANCEIRO[s]?.rotulo ?? s
  return s
}

// Com ano: a linha do tempo vai ate a matricula de anos atras.
function quando(v: string) {
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Linha do tempo: tudo que aconteceu com a aluna, de todas as areas.
export function LinhaDoTempo({ aluna, versao, limite }: { aluna: Aluna; versao: number; limite?: number }) {
  const { nomeDe } = useSessao()
  const [lista, setLista] = useState<Acontecimento[] | null>(null)
  const [filtro, setFiltro] = useState<string>('')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('vw_linha_tempo').select('*').eq('aluna_id', aluna.id).order('quando', { ascending: false }).limit(300)
    setLista((d ?? []) as Acontecimento[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar, versao])

  async function anotar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('nota_aluna').insert({ aluna_id: aluna.id, texto: texto.trim(), autor_id: u.user?.id })
    if (error) { setErro(mensagemErro(error)); return }
    setTexto(''); carregar()
  }

  if (lista === null) return null
  const tipos = [...new Set(lista.map((a) => a.tipo))]
  const visiveis = (filtro ? lista.filter((a) => a.tipo === filtro) : lista).slice(0, limite ?? Infinity)
  return (
    <section className="space-y-3">
      {!limite && <form onSubmit={anotar} className="flex gap-2">
        <input className="entrada" placeholder="Anotar algo sobre a aluna…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="btn-primario">Anotar</button>
      </form>}
      <Erro msg={erro} />
      {!limite && tipos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFiltro('')} className={`rounded-full px-3 py-1 text-xs ${filtro === '' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Tudo · {lista.length}</button>
          {tipos.map((t) => (
            <button key={t} onClick={() => setFiltro(t)} className={`rounded-full px-3 py-1 text-xs ${filtro === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {TIPOS_TEMPO[t]?.rotulo ?? t} · {lista.filter((a) => a.tipo === t).length}
            </button>
          ))}
        </div>
      )}
      {visiveis.length === 0 ? <p className="text-sm text-slate-500">Nada registrado ainda.</p> : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
          {visiveis.map((a, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${TIPOS_TEMPO[a.tipo]?.cor ?? 'bg-slate-400'}`} />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {a.tipo === 'status' ? `${CAMPO_STATUS[a.titulo ?? ''] ?? a.titulo}: ${rotuloValor(a.titulo, a.extra.de)} → ${rotuloValor(a.titulo, a.extra.para)}`
                    : a.tipo === 'nota' ? NOTA[a.titulo ?? ''] ?? 'Anotação'
                    : a.tipo === 'contato' ? `Contato${a.extra.canal ? ` por ${a.extra.canal}` : ''}`
                    : a.link ? <Link to={a.link} className="text-indigo-700 hover:underline">{a.titulo}</Link> : a.titulo}
                </span>
                <span>{a.autor_id ? nomeDe(a.autor_id) : a.extra.origem ? 'planilha' : 'Sistema'} · {quando(a.quando)}</span>
              </div>
              {a.texto && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{a.texto}</p>}
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                {typeof a.extra.saude === 'string' && <Selo cor={SAUDE[a.extra.saude as keyof typeof SAUDE]?.cor ?? ''}>{SAUDE[a.extra.saude as keyof typeof SAUDE]?.rotulo}</Selo>}
                {a.extra.realizada === false && <span className="text-amber-700">não realizada</span>}
                {typeof a.extra.proximo_passo === 'string' && <span><b>Próximo passo:</b> {a.extra.proximo_passo}</span>}
                {typeof a.extra.faturamento === 'number' && <span><b>Faturamento:</b> {reais(a.extra.faturamento)}</span>}
                {typeof a.extra.retorno_em === 'string' && <span><b>Retorno:</b> {data(a.extra.retorno_em)}</span>}
                {a.tipo === 'contrato' && <span>{data(a.extra.inicio as string)} → {data(a.extra.termino as string)}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// De onde veio cada ponto: a regra a vista, para poder ser contestada.
export function PainelPotencial({ detalhe }: { detalhe: PotencialDetalhe }) {
  const rotulo = { quente: 'Quente', morno: 'Morno', frio: 'Frio' }[detalhe.faixa]
  return (
    <section className="painel p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Potencial</div>
          <div className="mt-1 text-sm font-semibold text-slate-700">{rotulo}</div>
        </div>
        <Potencial pontos={detalhe.pontos} grande />
      </div>
      <ul className="mt-4 space-y-2.5">
        {detalhe.itens.map((i) => (
          <li key={i.item}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700">{i.item}</span>
              <span className={`font-mono ${i.pontos < 0 ? 'text-red-600' : 'text-slate-600'}`}>{i.pontos > 0 ? '+' : ''}{i.pontos}{i.max ? ` / ${i.max}` : ''}</span>
            </div>
            {i.max ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(Math.max(0, i.pontos) / i.max) * 100}%` }} />
              </div>
            ) : null}
            <div className="mt-0.5 text-[11px] text-slate-500">{i.porque}</div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-snug text-slate-400">Calculado na hora: porte, engajamento, contato recente, consultorias feitas e produto atual. Inadimplência e contrato parado descontam.</p>
    </section>
  )
}
