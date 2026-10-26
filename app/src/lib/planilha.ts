// Leitura de planilha no navegador para a importacao. O banco faz o resto
// (supabase/sistema_planilhas.sql); aqui so se decide o que e cabecalho e se
// entrega cada linha como {cabecalho_normalizado: valor, _1: valor, _2: ...}.

export type TipoImportacao =
  | 'matriculas' | 'consultorias' | 'cancelamentos' | 'maquina'
  | 'inadimplentes' | 'evento' | 'kit' | 'cadastro'

export const TIPOS: Record<TipoImportacao, string> = {
  matriculas: 'Alunos matriculados (abas de turma)',
  consultorias: 'Controle Consultorias (abas de consultor)',
  cancelamentos: 'Cancelamentos',
  maquina: 'Máquina de Vendas',
  inadimplentes: 'Inadimplentes por consultor',
  evento: 'Evento (uma aba por data)',
  kit: 'Pijamas e jaquetas',
  cadastro: 'Cadastro de novo membro',
}

type Celula = string | number | boolean | Date | null
export interface Linha { linha: number; dados: Record<string, string> }
export interface Aba { nome: string; temCabecalho: boolean; colunas: string[]; linhas: Linha[] }

export function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/:$/, '')
}

// Data vem em UTC da biblioteca; o dia certo e o do UTC.
function texto(v: Celula): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return ''
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  return String(v).replace(/\r/g, '').trim()
}

// Coluna que o sistema nao usa e que nao deve sair do computador de quem
// importa: endereco, cartao, conta, senha. O CPF vai: e a chave mais segura
// para nao duplicar cadastro, e fica em tabela de acesso restrito.
const COLUNA_SENSIVEL = /\brg\b|endere|\bcep\b|logradouro|bairro|complemento|cartao|senha|nascimento|\brenda\b|\bconta\b|agencia|\bpix\b/

const PALAVRAS_DE_CABECALHO = /nome|alun|telefone|status|consultor|data|e-?mail|contato|produto|cidade|pijama|confirma|motivo|prazo|plano|faturamento|potencial|solicitante/

// Nota de cabecalho: quantos rotulos conhecidos a linha tem. Linha com
// e-mail, telefone, data ou texto longo e dado, nao rotulo (nota 0). Ganha a
// linha de maior nota nas 6 primeiras: uma faixa de titulo acima do
// cabecalho ("CONSULTOR VINICIUS") perde para o cabecalho de verdade. Nenhuma
// com nota: aba sem cabecalho (Downsell, Pijamas), vale a posicao.
function notaCabecalho(r: Celula[]) {
  const textos = r.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
  if (textos.length < 2) return 0
  if (textos.some((t) => /@|\d{6,}|\d{2} \d{4,5}/.test(t) || t.length > 60)) return 0
  if (r.some((c) => c instanceof Date)) return 0
  return textos.filter((t) => PALAVRAS_DE_CABECALHO.test(normalizar(t))).length
}

export function abasParaLinhas(abas: { sheet: string; data: Celula[][] }[]): Aba[] {
  return abas.map(({ sheet, data }) => {
    const linhasBrutas = data.map((r, i) => ({ r, i: i + 1 })).filter(({ r }) => r.some((c) => texto(c) !== ''))
    const notas = linhasBrutas.slice(0, 6).map(({ r }) => notaCabecalho(r))
    const melhor = Math.max(0, ...notas)
    const idxCab = melhor > 0 ? notas.indexOf(melhor) : -1
    // Rotulo da 1a coluna que nao e rotulo conhecido (alguem digitou um nome
    // em A1) nao vira chave: a coluna segue lida pela posicao, _1.
    const cab = idxCab >= 0
      ? linhasBrutas[idxCab].r.map((c, j) => {
          const k = normalizar(texto(c))
          return j === 0 && k && !PALAVRAS_DE_CABECALHO.test(k) ? '' : k
        })
      : []
    const corpo = idxCab >= 0 ? linhasBrutas.slice(idxCab + 1) : linhasBrutas
    const linhas = corpo.map(({ r, i }) => {
      const dados: Record<string, string> = {}
      r.forEach((c, j) => {
        const v = texto(c)
        if (v === '' || (cab[j] && COLUNA_SENSIVEL.test(cab[j]))) return
        dados[`_${j + 1}`] = v
        const k = cab[j]
        if (k && !(k in dados)) dados[k] = v
      })
      return { linha: i, dados }
    })
    return { nome: sheet, temCabecalho: idxCab >= 0, colunas: cab.filter((k) => k && !COLUNA_SENSIVEL.test(k)), linhas }
  })
}

// Palpite do tipo pela cara da planilha. A coordenacao confirma antes de enviar.
export function detectarTipo(abas: Aba[], arquivo = ''): TipoImportacao | null {
  const nomes = abas.map((a) => normalizar(a.nome))
  const cols = new Set(abas.flatMap((a) => a.colunas))
  const arq = normalizar(arquivo)
  if (abas.some((a) => a.linhas.slice(0, 5).some((l) => /^consultor\s/i.test(l.dados._1 ?? '')))) return 'inadimplentes'
  if (nomes.some((n) => /^p[bc]-|moonshot elite|privaty|in company/.test(n))) return 'matriculas'
  if (nomes.some((n) => /downsell|pedido.*cancelamento|cancelamento 7 dias/.test(n))) return 'cancelamentos'
  if (cols.has('pijama') || nomes.includes('pijamas')) return 'kit'
  if (cols.has('confirmacao') && cols.has('potencial')) return 'evento'
  if (cols.has('link notion')) return 'cadastro'
  if (cols.has('status do contrato') || /maquina/.test(arq)) return 'maquina'
  if (cols.has('faturamento mes') || [...cols].some((c) => /^\d\.consult/.test(c))) return 'consultorias'
  if (cols.has('data de termino do plano')) return 'matriculas'
  return null
}
