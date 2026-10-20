import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Upload, CheckCircle2, Users } from 'lucide-react'
import readXlsxFile from 'read-excel-file/browser'
import { supabase } from '../lib/supabase'
import { abasParaLinhas, detectarTipo, TIPOS, type Aba, type TipoImportacao } from '../lib/planilha'
import type { Importacao, Pendencia } from '../lib/tipos'
import { dataHora, mensagemErro } from '../lib/util'
import { Campo, Carregando, Erro, Selo, Titulo, Vazio } from '../componentes/ui'

// Rotulos do resumo que o banco devolve (processar_importacao).
const ROTULO_RESUMO: Record<string, string> = {
  alunas_novas: 'Alunas novas', alunas_atualizadas: 'Alunas atualizadas', contratos: 'Contratos',
  onboarding_em_aberto: 'Onboardings em aberto', anotacoes: 'Anotações', datas_de_agenda: 'Datas de consultoria',
  pedidos: 'Pedidos de cancelamento', marcadas_inadimplentes: 'Marcadas inadimplentes',
  nao_encontradas: 'Não encontradas', eventos: 'Eventos', participantes: 'Participantes',
  alunas_com_kit: 'Alunas com kit', cadastros: 'Cadastros', pendencias: 'Pendências para revisar',
}

const LOTE = 500

export function Importar() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [abas, setAbas] = useState<Aba[] | null>(null)
  const [tipo, setTipo] = useState<TipoImportacao | ''>('')
  const [lendo, setLendo] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ id: number; resumo: Record<string, unknown> } | null>(null)
  const [historico, setHistorico] = useState<Importacao[]>([])

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase.from('importacao').select('*').order('criado_em', { ascending: false }).limit(15)
    setHistorico((data ?? []) as Importacao[])
  }, [])
  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  async function escolher(f: File | null) {
    setArquivo(f); setAbas(null); setTipo(''); setErro(null); setResultado(null)
    if (!f) return
    setLendo(true)
    try {
      const lidas = abasParaLinhas(await readXlsxFile(f) as never)
      setAbas(lidas)
      setTipo(detectarTipo(lidas, f.name) ?? '')
    } catch (e) {
      setErro('Não consegui ler o arquivo. Ele precisa ser .xlsx (no Google Sheets: Arquivo → Fazer download → Microsoft Excel).')
      console.error(e)
    }
    setLendo(false)
  }

  async function enviar() {
    if (!arquivo || !abas || !tipo) return
    setErro(null); setResultado(null)
    const linhas = abas.flatMap((a) => a.linhas.map((l) => ({ aba: a.nome, linha: l.linha, dados: l.dados })))
    setProgresso('Criando a importação…')
    const { data: imp, error } = await supabase.from('importacao').insert({ tipo, arquivo: arquivo.name }).select('id').single()
    if (error) { setErro(mensagemErro(error)); setProgresso(null); return }
    for (let i = 0; i < linhas.length; i += LOTE) {
      setProgresso(`Enviando linhas ${i + 1}–${Math.min(i + LOTE, linhas.length)} de ${linhas.length}…`)
      const { error: e2 } = await supabase.from('importacao_linha').insert(linhas.slice(i, i + LOTE).map((l) => ({ ...l, importacao_id: imp.id })))
      if (e2) { setErro(mensagemErro(e2)); setProgresso(null); return }
    }
    setProgresso('Casando cada linha com as alunas do sistema…')
    const { data: resumo, error: e3 } = await supabase.rpc('processar_importacao', { p_imp: imp.id })
    setProgresso(null)
    if (e3) { setErro(mensagemErro(e3)); return }
    setResultado({ id: imp.id, resumo: resumo as Record<string, unknown> })
    carregarHistorico()
  }

  const total = abas?.reduce((s, a) => s + a.linhas.length, 0) ?? 0

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Titulo>Importar planilha</Titulo>
      <div className="painel space-y-4 p-5">
        <p className="text-sm text-slate-600">
          Baixe a planilha do Drive como <b>.xlsx</b> (Arquivo → Fazer download → Microsoft Excel) e escolha aqui.
          O sistema reconhece o tipo, casa cada linha com a aluna que já existe e mostra o que precisou de olho humano.
          Pode importar de novo a mesma planilha depois de atualizada: nada se duplica.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/40">
          <FileSpreadsheet size={20} />
          {arquivo ? <b>{arquivo.name}</b> : 'Escolher arquivo .xlsx'}
          <input type="file" accept=".xlsx" className="hidden" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
        </label>
        {lendo && <Carregando />}
        <Erro msg={erro} />

        {abas && (
          <>
            <Campo rotulo="Que planilha é esta?" dica={tipo ? 'Reconhecida pela cara das abas e colunas. Troque se estiver errado.' : 'Não reconheci; escolha o tipo.'}>
              <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as TipoImportacao)}>
                <option value="">Escolha…</option>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr><th className="px-3 py-2">Aba</th><th className="px-3 py-2">Linhas</th><th className="px-3 py-2">Colunas reconhecidas</th></tr>
                </thead>
                <tbody>
                  {abas.map((a) => (
                    <tr key={a.nome} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{a.nome}</td>
                      <td className="px-3 py-2">{a.linhas.length}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{a.temCabecalho ? a.colunas.slice(0, 8).join(', ') + (a.colunas.length > 8 ? '…' : '') : 'sem cabeçalho (lida pela posição)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">{total} linhas no total</span>
              <button className="btn-primario" disabled={!tipo || !!progresso} onClick={enviar}><Upload size={16} /> Importar</button>
            </div>
          </>
        )}
        {progresso && <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">{progresso}</div>}
      </div>

      {resultado && (
        <div className="painel p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={18} /> Importação concluída</h2>
          <Resumo resumo={resultado.resumo} />
          <Pendencias importacao={resultado.id} />
        </div>
      )}

      <div className="painel">
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Importações anteriores</h2>
        {historico.length === 0 ? <div className="p-5 text-sm text-slate-500">Nenhuma ainda.</div> : historico.map((h) => (
          <details key={h.id} className="border-b border-slate-50 px-5 py-3">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
              <span><b>{h.arquivo}</b> · {TIPOS[h.tipo as TipoImportacao] ?? h.tipo}</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {Number(h.resumo?.pendencias ?? 0) > 0 && <Selo cor="bg-amber-100 text-amber-800">{String(h.resumo?.pendencias)} pendências</Selo>}
                {dataHora(h.criado_em)}
              </span>
            </summary>
            <div className="mt-3">
              {h.resumo && <Resumo resumo={h.resumo} />}
              <Pendencias importacao={h.id} />
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function Resumo({ resumo }: { resumo: Record<string, unknown> }) {
  const ignoradas = resumo.abas_ignoradas as Record<string, number> | undefined
  return (
    <div className="mb-4 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(resumo).filter(([k]) => k !== 'abas_ignoradas').map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">{ROTULO_RESUMO[k] ?? k}</div>
            <div className="text-lg font-semibold">{String(v)}</div>
          </div>
        ))}
      </div>
      {ignoradas && Object.keys(ignoradas).length > 0 && (
        <p className="text-xs text-slate-500">
          Abas deixadas de fora de propósito (não são de alunas ou vêm por outra planilha): {Object.entries(ignoradas).map(([a, n]) => `${a} (${n})`).join(', ')}.
        </p>
      )}
    </div>
  )
}

function Pendencias({ importacao }: { importacao: number }) {
  const [lista, setLista] = useState<Pendencia[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('importacao_pendencia').select('*').eq('importacao_id', importacao).eq('resolvida', false).order('id')
    setLista((data ?? []) as Pendencia[])
  }, [importacao])
  useEffect(() => { carregar() }, [carregar])

  async function resolver(p: Pendencia) {
    await supabase.from('importacao_pendencia').update({ resolvida: true }).eq('id', p.id)
    carregar()
  }
  async function unir(manter: number, remover: number, p: Pendencia) {
    setErro(null)
    const { error } = await supabase.rpc('unir_alunas', { p_manter: manter, p_remover: remover })
    if (error) { setErro(mensagemErro(error)); return }
    await resolver(p)
  }

  if (lista === null) return null
  if (lista.length === 0) return <Vazio>Nenhuma pendência em aberto.</Vazio>
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Para revisar ({lista.length})</h3>
      <Erro msg={erro} />
      {lista.map((p) => {
        const c = p.candidatos
        const dup = c && !Array.isArray(c) && 'nova' in c ? c : null
        const parecidas = dup?.parecidas ?? (Array.isArray(c) ? c : [])
        return (
          <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{p.nome}</div>
                <div className="text-xs text-slate-500">{p.motivo} · aba {p.aba}, linha {p.linha}</div>
              </div>
              <button className="btn-fantasma py-1 text-xs" onClick={() => resolver(p)}>{dup ? 'São pessoas diferentes' : 'Marcar como visto'}</button>
            </div>
            {parecidas.length > 0 && (
              <div className="mt-2 space-y-1">
                {parecidas.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                    <Link to={`/alunas/${x.id}`} className="text-indigo-700 hover:underline">{x.nome}</Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {Math.round(x.similaridade * 100)}% parecido
                      {dup?.nova && <button className="btn-secundario py-0.5 text-xs" onClick={() => unir(x.id, dup.nova!, p)}><Users size={12} /> É a mesma pessoa</button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
