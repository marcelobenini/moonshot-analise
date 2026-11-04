// Exportar tabelas para Excel (.xlsx) e PDF. As bibliotecas carregam só na
// hora de baixar, para não pesar a abertura do sistema.

export type TipoColuna = 'texto' | 'reais' | 'numero' | 'pct' | 'data'
export type Valor = string | number | null | undefined

export interface Coluna<T> {
  titulo: string
  valor: (linha: T) => Valor
  tipo?: TipoColuna
  largura?: number // em caracteres, no Excel
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function formatar(v: Valor, tipo: TipoColuna = 'texto'): string {
  if (v == null || v === '') return ''
  if (tipo === 'reais') return moeda.format(Number(v))
  if (tipo === 'pct') return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (tipo === 'numero') return Number(v).toLocaleString('pt-BR')
  if (tipo === 'data') {
    const s = String(v)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const [a, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${a}` }
    if (/^\d{4}-\d{2}$/.test(s)) { const [a, m] = s.split('-'); return `${m}/${a}` }
  }
  return String(v)
}

function nomeArquivo(base: string, ext: string) {
  const limpo = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const d = new Date()
  return `${limpo}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.${ext}`
}

export interface Planilha<T> { aba: string; colunas: Coluna<T>[]; linhas: T[] }

/** Uma ou mais abas num .xlsx. Números e datas saem como número e data de verdade. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function baixarXlsx(nome: string, abas: Planilha<any>[]) {
  const { default: escrever } = await import('write-excel-file/browser')
  const folhas = abas.map(({ aba, colunas, linhas }) => {
    const cab = colunas.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const, backgroundColor: '#F3E7DD' }))
    const corpo = linhas.map((l) => colunas.map((c) => {
      const v = c.valor(l)
      if (v == null || v === '') return null
      const t = c.tipo ?? 'texto'
      if (t === 'reais' && !isNaN(Number(v))) return { value: Number(v), type: Number, format: '"R$" #,##0' }
      if (t === 'pct' && !isNaN(Number(v))) return { value: Number(v) / 100, type: Number, format: '0.0%' }
      if (t === 'numero' && !isNaN(Number(v))) return { value: Number(v), type: Number }
      if (t === 'data' && /^\d{4}-\d{2}-\d{2}/.test(String(v))) {
        const [a, m, d] = String(v).slice(0, 10).split('-').map(Number)
        return { value: new Date(Date.UTC(a, m - 1, d)), type: Date, format: 'dd/mm/yyyy' }
      }
      return { value: t === 'data' ? formatar(v, 'data') : String(v), type: String }
    }))
    return {
      sheet: aba.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '),
      data: [cab, ...corpo],
      columns: colunas.map((c) => ({ width: c.largura ?? Math.min(40, Math.max(10, c.titulo.length + 2)) })),
      stickyRowsCount: 1,
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await escrever(folhas as any).toFile(nomeArquivo(nome, 'xlsx'))
}

export interface SecaoPdf<T> { titulo?: string; colunas: Coluna<T>[]; linhas: T[] }

/** Relatório em PDF: título, subtítulo (filtros) e uma ou mais tabelas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function baixarPdf(nome: string, titulo: string, subtitulo: string, secoes: SecaoPdf<any>[], opcoes: { retrato?: boolean; blocos?: { titulo: string; texto: string }[] } = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const larga = !opcoes.retrato && secoes.some((s) => s.colunas.length > 6)
  const doc = new jsPDF({ orientation: larga ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 36
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 27, 75)
  doc.text(limpar(titulo), M, M + 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
  const sub = doc.splitTextToSize(limpar(subtitulo), W - 2 * M) as string[]
  doc.text(sub, M, M + 24)
  let y = M + 30 + sub.length * 11

  for (const b of opcoes.blocos ?? []) {
    if (y > H - 80) { doc.addPage(); y = M }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 27, 75)
    doc.text(limpar(b.titulo), M, y); y += 13
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(51, 65, 85)
    for (const linha of doc.splitTextToSize(limpar(b.texto), W - 2 * M) as string[]) {
      if (y > H - M) { doc.addPage(); y = M }
      doc.text(linha, M, y); y += 11
    }
    y += 8
  }

  for (const s of secoes) {
    if (s.titulo) {
      if (y > H - 80) { doc.addPage(); y = M }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 27, 75)
      doc.text(limpar(s.titulo), M, y + 4); y += 12
    }
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [s.colunas.map((c) => limpar(c.titulo))],
      body: s.linhas.length ? s.linhas.map((l) => s.colunas.map((c) => limpar(formatar(c.valor(l), c.tipo)))) : [[{ content: 'Nada a mostrar.', colSpan: s.colunas.length }]],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 27, 75], textColor: [238, 242, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [253, 248, 245] },
      columnStyles: Object.fromEntries(s.colunas.map((c, i) => [i, ['reais', 'numero', 'pct'].includes(c.tipo ?? '') ? { halign: 'right' as const } : {}])),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 18
  }

  const n = doc.getNumberOfPages()
  const quando = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(148, 163, 184)
    doc.text(`Moonshot System · gerado em ${quando}`, M, H - 16)
    doc.text(`${i} / ${n}`, W - M, H - 16, { align: 'right' })
  }
  doc.save(nomeArquivo(nome, 'pdf'))
}

// A fonte padrão do PDF cobre o português, mas não emojis e alguns símbolos.
function limpar(s: string) {
  return s.replace(/[→]/g, '>').replace(/[✓✔]/g, 'ok').replace(/[^\x20-\x7E -ÿ\n·ºª€]/g, '')
}
