import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Download, FileText, Pencil, Plus, Trash2, TrendingUp, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, ArquivoAluna, FaturamentoMes, Saude } from '../lib/tipos'
import { EDITA_ALUNA, SAUDE, data, dataHora, hoje, mensagemErro, reais } from '../lib/util'
import { Campo, Erro, Modal, Selo } from '../componentes/ui'
import { Linhas } from '../componentes/graficos'
import { baixarPdf, type Coluna } from '../lib/exportar'
import { TextoLongo } from '../componentes/Ditado'

const mesRotulo = (mes: string) => { const [a, m] = mes.split('-'); return `${m}/${a}` }
const pct = (v: number | null | undefined) => v == null ? '' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

// ---------------------------------------------------------------------------
// Faturamento e rentabilidade mês a mês. O faturamento de cada consultoria
// entra aqui sozinho; o resto a equipe atualiza pela ficha.
// ---------------------------------------------------------------------------
export function FaturamentoMensal({ aluna, pode, mudou }: { aluna: Aluna; pode: boolean; mudou: () => void }) {
  const [lista, setLista] = useState<FaturamentoMes[]>([])
  const [editando, setEditando] = useState<Partial<FaturamentoMes> | null>(null)
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('faturamento_mes').select('*').eq('aluna_id', aluna.id).order('mes')
    setLista((d ?? []) as FaturamentoMes[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar])

  const comFat = lista.filter((l) => l.faturamento != null)
  const comRent = lista.filter((l) => l.rentabilidade != null)
  const primeiro = comFat[0], ultimo = comFat[comFat.length - 1]
  const cresc = primeiro && ultimo && comFat.length > 1 && Number(primeiro.faturamento) > 0
    ? Math.round(((Number(ultimo.faturamento) - Number(primeiro.faturamento)) / Number(primeiro.faturamento)) * 100) : null
  const mesAtual = hoje().slice(0, 7) + '-01'

  return (
    <section className="painel p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-noite">Faturamento e rentabilidade</h2>
          <p className="text-sm text-slate-500">Atualização mensal. O faturamento informado na consultoria entra no mês dela.</p>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="font-mono text-2xl font-medium text-noite">{aluna.faturamento_mensal != null ? reais(aluna.faturamento_mensal) : ''}</div>
            {aluna.rentabilidade != null && <div className="text-sm text-slate-600">rentabilidade {pct(aluna.rentabilidade)}</div>}
            {cresc != null && (
              <div className={`flex items-center justify-end gap-1 text-sm font-medium ${cresc >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                <TrendingUp size={14} className={cresc < 0 ? 'rotate-180' : ''} /> {cresc >= 0 ? '+' : ''}{cresc}% desde {mesRotulo(primeiro.mes)}
              </div>
            )}
          </div>
          {pode && <button className="btn-primario" onClick={() => setEditando(lista.find((l) => l.mes === mesAtual) ?? { mes: mesAtual })}><Plus size={16} /> Atualizar mês</button>}
        </div>
      </div>
      {comFat.length >= 2 && (
        <Linhas altura={180} doZero={false} formatar={(v) => reais(v)} series={[{ nome: 'Faturamento', cor: '#c9a066' }]}
          pontos={comFat.map((r) => ({ rotulo: mesRotulo(r.mes), valores: [Number(r.faturamento)] }))} />
      )}
      {comRent.length >= 2 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-slate-500">Rentabilidade (%)</div>
          <Linhas altura={120} doZero={false} formatar={(v) => pct(v)} series={[{ nome: 'Rentabilidade', cor: '#6366f1' }]}
            pontos={comRent.map((r) => ({ rotulo: mesRotulo(r.mes), valores: [Number(r.rentabilidade)] }))} />
        </div>
      )}
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">{aluna.faturamento_mensal != null
          ? `Faturamento de referência ${reais(aluna.faturamento_mensal)} (veio do cadastro ou da planilha). Atualize o mês para começar o histórico.`
          : 'Nenhum mês informado ainda.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr><th className="py-1.5 pr-3">Mês</th><th className="py-1.5 pr-3 text-right">Faturamento</th><th className="py-1.5 pr-3 text-right">Rentabilidade</th><th className="py-1.5 pr-3">Observação</th><th /></tr>
            </thead>
            <tbody>
              {[...lista].reverse().map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-medium">{mesRotulo(l.mes)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{l.faturamento != null ? reais(l.faturamento) : ''}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{pct(l.rentabilidade)}</td>
                  <td className="max-w-xs truncate py-1.5 pr-3 text-slate-600" title={l.observacao ?? ''}>{l.observacao ?? ''}</td>
                  <td className="py-1.5 text-right">{pode && <button className="btn-fantasma p-1" onClick={() => setEditando(l)} aria-label="Editar mês"><Pencil size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && <MesForm aluna={aluna} m={editando} fechar={() => setEditando(null)} salvo={() => { setEditando(null); carregar(); mudou() }} />}
    </section>
  )
}

function MesForm({ aluna, m, fechar, salvo }: { aluna: Aluna; m: Partial<FaturamentoMes>; fechar: () => void; salvo: () => void }) {
  const [mes, setMes] = useState((m.mes ?? hoje()).slice(0, 7))
  const [fat, setFat] = useState(m.faturamento != null ? String(m.faturamento) : '')
  const [rent, setRent] = useState(m.rentabilidade != null ? String(m.rentabilidade) : '')
  const [obs, setObs] = useState(m.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const num = (s: string) => s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.'))
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const f = num(fat), r = num(rent)
    if (f == null && r == null) { setErro('Informe o faturamento, a rentabilidade ou os dois.'); return }
    if ((f != null && isNaN(f)) || (r != null && isNaN(r))) { setErro('Use só números.'); return }
    const linha = { aluna_id: aluna.id, mes: `${mes}-01`, faturamento: f, rentabilidade: r, observacao: obs.trim() || null }
    const { error } = m.id
      ? await supabase.from('faturamento_mes').update(linha).eq('id', m.id)
      : await supabase.from('faturamento_mes').upsert(linha, { onConflict: 'aluna_id,mes' })
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }
  async function apagar() {
    if (!m.id || !confirm(`Apagar o mês ${mesRotulo(m.mes!)}?`)) return
    const { error } = await supabase.from('faturamento_mes').delete().eq('id', m.id)
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }
  return (
    <Modal titulo="Faturamento do mês" aberto fechar={fechar}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo rotulo="Mês"><input className="entrada" type="month" required value={mes} disabled={!!m.id} onChange={(e) => setMes(e.target.value)} /></Campo>
        <Campo rotulo="Faturamento (R$)"><input className="entrada" inputMode="decimal" placeholder="35000" value={fat} onChange={(e) => setFat(e.target.value)} /></Campo>
        <Campo rotulo="Rentabilidade (%)" dica="Margem de lucro do mês."><input className="entrada" inputMode="decimal" placeholder="22,5" value={rent} onChange={(e) => setRent(e.target.value)} /></Campo>
        <div className="sm:col-span-3"><Campo rotulo="Observação"><TextoLongo className="entrada min-h-20" value={obs} onChange={(e) => setObs(e.target.value)} /></Campo></div>
        <div className="sm:col-span-3"><Erro msg={erro} /></div>
        <div className="flex justify-between gap-2 sm:col-span-3">
          {m.id ? <button type="button" className="btn-fantasma text-red-600" onClick={apagar}><Trash2 size={15} /> Apagar mês</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
            <button className="btn-primario">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Saúde por observação, a qualquer momento (não só na consultoria).
// ---------------------------------------------------------------------------
export function AtualizarSaude({ aluna, fechar, salvo }: { aluna: Aluna; fechar: () => void; salvo: () => void }) {
  const [saude, setSaude] = useState<Saude | ''>(aluna.saude ?? '')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!saude) { setErro('Escolha a saúde.'); return }
    if (!obs.trim()) { setErro('Conte o que aconteceu: fica no histórico da aluna.'); return }
    const { error } = await supabase.rpc('mudar_saude_aluna', { p_aluna: aluna.id, p_saude: saude, p_observacao: obs.trim() })
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }
  return (
    <Modal titulo={`Saúde · ${aluna.nome}`} aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <span className="rotulo">Como ela está agora</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAUDE) as Saude[]).map((s) => (
              <button type="button" key={s} onClick={() => setSaude(s)}
                className={`rounded-full border px-3 py-1 text-sm ${saude === s ? `${SAUDE[s].cor} border-transparent ring-2 ring-indigo-400` : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {SAUDE[s].rotulo}
              </button>
            ))}
          </div>
          {(saude === 'risco_saida' || saude === 'sem_contato') && saude !== aluna.saude && (
            <p className="mt-2 text-xs text-red-700">Ao salvar, um card de retenção é aberto.</p>
          )}
        </div>
        <Campo rotulo="Observação *" dica="Ex.: sumiu depois da 1ª consultoria; voltou a responder e retomou o plano.">
          <TextoLongo className="entrada min-h-24" required value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

interface MudancaSaude { id: number; de: string | null; para: string | null; motivo: string | null; autor_id: string | null; criado_em: string }

/** A saúde ao longo do tempo: de onde veio cada mudança. */
export function HistoricoSaude({ aluna, versao }: { aluna: Aluna; versao: number }) {
  const { nomeDe } = useSessao()
  const [lista, setLista] = useState<MudancaSaude[]>([])
  useEffect(() => {
    supabase.from('aluna_historico').select('id, de, para, motivo, autor_id, criado_em').eq('aluna_id', aluna.id).eq('campo', 'saude')
      .order('criado_em', { ascending: false }).limit(12)
      .then(({ data: d }) => setLista((d ?? []) as MudancaSaude[]))
  }, [aluna.id, versao])
  if (lista.length === 0) return null
  return (
    <section className="painel p-5">
      <h2 className="mb-3 font-display text-xl font-semibold text-noite">Saúde ao longo do tempo</h2>
      <ol className="space-y-3">
        {lista.map((h) => {
          const s = h.para ? SAUDE[h.para as Saude] : null
          return (
            <li key={h.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-300" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {s ? <Selo cor={s.cor}>{s.rotulo}</Selo> : <span className="text-slate-500">sem saúde</span>}
                  <span className="text-xs text-slate-500">{dataHora(h.criado_em)}{h.autor_id ? ` · ${nomeDe(h.autor_id)}` : ''}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{h.motivo ?? (h.de ? `antes: ${SAUDE[h.de as Saude]?.rotulo ?? h.de}` : 'registrada na consultoria')}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Arquivos da aluna: transcrições de consultoria e outros documentos.
// ---------------------------------------------------------------------------
const BUCKET = 'aluna-arquivos'
const TIPO_ARQUIVO: Record<ArquivoAluna['tipo'], string> = { transcricao: 'Transcrição', documento: 'Documento', outro: 'Outro' }
const tamanho = (b: number | null) => b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export function Arquivos({ aluna }: { aluna: Aluna }) {
  const { eu, nomeDe } = useSessao()
  const [lista, setLista] = useState<ArquivoAluna[]>([])
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pode = EDITA_ALUNA.includes(eu?.papel ?? '')
  const carregar = useCallback(async () => {
    const { data: d } = await supabase.from('aluna_arquivo').select('*').eq('aluna_id', aluna.id).order('criado_em', { ascending: false })
    setLista((d ?? []) as ArquivoAluna[])
  }, [aluna.id])
  useEffect(() => { carregar() }, [carregar])

  async function baixar(a: ArquivoAluna) {
    setErro(null)
    const { data: d, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 120, { download: a.nome })
    if (error || !d) { setErro(mensagemErro(error)); return }
    window.open(d.signedUrl, '_blank', 'noopener')
  }
  async function apagar(a: ArquivoAluna) {
    if (!confirm(`Apagar ${a.nome}?`)) return
    setErro(null)
    const { error } = await supabase.storage.from(BUCKET).remove([a.caminho])
    if (error) { setErro(mensagemErro(error)); return }
    const r = await supabase.from('aluna_arquivo').delete().eq('id', a.id)
    if (r.error) setErro(mensagemErro(r.error))
    carregar()
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-noite">Transcrições e arquivos</h2>
        {pode && <button className="btn-secundario" onClick={() => setSubindo(true)}><Upload size={16} /> Subir arquivo</button>}
      </div>
      <Erro msg={erro} />
      <div className="painel divide-y divide-slate-100">
        {lista.length === 0 && <div className="p-4 text-sm text-slate-500">Nenhum arquivo ainda.</div>}
        {lista.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
            <FileText size={18} className="shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.nome}</div>
              <div className="text-xs text-slate-500">
                {TIPO_ARQUIVO[a.tipo]}{a.numero != null ? ` · ${a.numero === 0 ? 'entrada' : `${a.numero}ª consultoria`}` : ''} · {tamanho(a.tamanho)} · {nomeDe(a.autor_id)} · {dataHora(a.criado_em)}
              </div>
            </div>
            <button className="btn-fantasma p-1.5" onClick={() => baixar(a)} aria-label="Baixar"><Download size={15} /></button>
            {(eu?.papel === 'coordenador' || (pode && a.autor_id === eu?.id)) &&
              <button className="btn-fantasma p-1.5" onClick={() => apagar(a)} aria-label="Apagar"><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      {subindo && <SubirArquivo aluna={aluna} fechar={() => setSubindo(false)} salvo={() => { setSubindo(false); carregar() }} />}
    </section>
  )
}

function SubirArquivo({ aluna, fechar, salvo }: { aluna: Aluna; fechar: () => void; salvo: () => void }) {
  const { eu } = useSessao()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tipo, setTipo] = useState<ArquivoAluna['tipo']>('transcricao')
  const [numero, setNumero] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!arquivo || !eu) return
    if (arquivo.size > 50 * 1048576) { setErro('O arquivo passa de 50 MB.'); return }
    setEnviando(true); setErro(null)
    const seguro = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
    const caminho = `${aluna.id}/${Date.now()}_${seguro}`
    const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined })
    if (up.error) { setErro(mensagemErro(up.error)); setEnviando(false); return }
    const { error } = await supabase.from('aluna_arquivo').insert({
      aluna_id: aluna.id, tipo, numero: numero === '' ? null : Number(numero), nome: arquivo.name,
      caminho, tamanho: arquivo.size, mime: arquivo.type || null, autor_id: eu.id,
    })
    if (error) { await supabase.storage.from(BUCKET).remove([caminho]); setErro(mensagemErro(error)); setEnviando(false); return }
    salvo()
  }
  return (
    <Modal titulo="Subir arquivo" aberto fechar={fechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Arquivo" dica="Transcrição em .txt, .docx, .pdf, .vtt ou .srt, ou o áudio. Até 50 MB.">
          <input className="entrada" type="file" required onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo">
            <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as ArquivoAluna['tipo'])}>
              {Object.entries(TIPO_ARQUIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo rotulo="De qual consultoria">
            <select className="entrada" value={numero} onChange={(e) => setNumero(e.target.value)}>
              <option value="">Nenhuma em especial</option>
              <option value="0">Entrada / diagnóstico</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}ª consultoria</option>)}
            </select>
          </Campo>
        </div>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={enviando || !arquivo}>{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Ficha completa em PDF.
// ---------------------------------------------------------------------------
export async function exportarFichaPdf(aluna: Aluna, nomeDe: (id: string | null) => string) {
  const [fm, ag, ct, nt, rc] = await Promise.all([
    supabase.from('faturamento_mes').select('*').eq('aluna_id', aluna.id).order('mes'),
    supabase.from('consultoria_agenda').select('*').eq('aluna_id', aluna.id).order('numero'),
    supabase.from('contrato').select('*').eq('aluna_id', aluna.id).order('inicio'),
    supabase.from('nota_aluna').select('*').eq('aluna_id', aluna.id).order('criado_em', { ascending: false }),
    supabase.from('registro_consultoria').select('*').eq('aluna_id', aluna.id).order('data'),
  ])
  type L = Record<string, unknown>
  const s = (k: string): Coluna<L>['valor'] => (l) => l[k] as string | number | null
  const consultor = aluna.consultor_id ? nomeDe(aluna.consultor_id) : aluna.consultor_planilha ?? ''
  const cs = aluna.cs_id ? nomeDe(aluna.cs_id) : aluna.cs_planilha ?? ''
  const dados: [string, string][] = [
    ['Programa', [aluna.produto, aluna.turma].filter(Boolean).join(' · ')],
    ['Status', aluna.status_contrato], ['Financeiro', aluna.status_financeiro ?? ''],
    ['Saúde', aluna.saude ? SAUDE[aluna.saude].rotulo : ''],
    ['Consultor', consultor], ['CS', cs],
    ['Início', aluna.inicio ? data(aluna.inicio) : ''], ['Término', aluna.termino ? data(aluna.termino) : ''],
    ['Telefone', aluna.telefone ?? ''], ['E-mail', aluna.email ?? ''],
    ['Cidade', [aluna.cidade, aluna.uf].filter(Boolean).join(' / ')], ['Empresa', aluna.empresa ?? ''], ['Ramo', aluna.ramo ?? ''],
    ['Faturamento atual', aluna.faturamento_mensal != null ? reais(aluna.faturamento_mensal) : ''],
    ['Rentabilidade', pct(aluna.rentabilidade)],
    ['Última consultoria', aluna.ultima_consultoria ? data(aluna.ultima_consultoria) : ''],
  ]
  const agenda = (ag.data ?? []) as L[]
  await baixarPdf(`Ficha_${aluna.nome}`, aluna.nome, `Ficha da aluna · ${aluna.produto ?? ''}`, [
    { titulo: 'Dados', colunas: [{ titulo: 'Campo', valor: (l: [string, string]) => l[0] }, { titulo: 'Valor', valor: (l: [string, string]) => l[1] || 'não informado' }], linhas: dados },
    { titulo: 'Faturamento mês a mês', colunas: [
      { titulo: 'Mês', valor: (l: L) => String(l.mes).slice(0, 7), tipo: 'data' }, { titulo: 'Faturamento', valor: s('faturamento'), tipo: 'reais' },
      { titulo: 'Rentabilidade', valor: s('rentabilidade'), tipo: 'pct' }, { titulo: 'Observação', valor: s('observacao') }], linhas: (fm.data ?? []) as L[] },
    { titulo: 'Agenda de consultorias', colunas: [
      { titulo: 'Etapa', valor: (l: L) => Number(l.numero) === 0 ? 'Entrada' : `${l.numero}ª consultoria` },
      { titulo: 'Prevista', valor: s('data_prevista'), tipo: 'data' }, { titulo: 'Realizada', valor: s('realizada_em'), tipo: 'data' },
      { titulo: 'Situação', valor: (l: L) => l.realizada_em ? 'realizada' : l.situacao === 'nao_realizada' ? 'não realizada' : (l.situacao as string) ?? 'prevista' },
      { titulo: 'Observação', valor: s('observacao') }], linhas: agenda },
    { titulo: 'Relatos de consultoria', colunas: [
      { titulo: 'Data', valor: s('data'), tipo: 'data' }, { titulo: 'Etapa', valor: (l: L) => l.numero == null ? 'contato' : Number(l.numero) === 0 ? 'entrada' : `${l.numero}ª` },
      { titulo: 'Saúde', valor: (l: L) => SAUDE[l.saude as Saude]?.rotulo ?? '' }, { titulo: 'Relato', valor: s('situacao') },
      { titulo: 'Consultor', valor: (l: L) => nomeDe(l.consultor_id as string) }], linhas: (rc.data ?? []) as L[] },
    { titulo: 'Contratos', colunas: [
      { titulo: 'Produto', valor: s('produto') }, { titulo: 'Turma', valor: s('turma') }, { titulo: 'Início', valor: s('inicio'), tipo: 'data' },
      { titulo: 'Término', valor: s('termino'), tipo: 'data' }, { titulo: 'Status', valor: s('status') }, { titulo: 'Pagamento', valor: s('forma_pagamento') }], linhas: (ct.data ?? []) as L[] },
    { titulo: 'Anotações', colunas: [
      { titulo: 'Data', valor: (l: L) => String(l.criado_em).slice(0, 10), tipo: 'data' }, { titulo: 'Texto', valor: s('texto') },
      { titulo: 'Autor', valor: (l: L) => l.autor_id ? nomeDe(l.autor_id as string) : (l.origem as string) ?? 'planilha' }], linhas: (nt.data ?? []) as L[] },
  ], { retrato: true })
}
