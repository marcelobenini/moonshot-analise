import type { FormularioEntrada, Perfil } from './tipos'

// Ponte com o Gemini na fase manual: o texto que a CS cola no Gem e a leitura
// da resposta de volta, separada em campos pelos titulos fixos.

export const TITULOS = [
  { campo: 'resumo', titulo: 'Resumo do negócio', chaves: ['resumo'] },
  { campo: 'porte', titulo: 'Porte e faturamento', chaves: ['porte', 'faturamento'] },
  { campo: 'dores', titulo: 'Dores', chaves: ['dor'] },
  { campo: 'objetivos', titulo: 'Objetivos', chaves: ['objetivo'] },
  { campo: 'nivel', titulo: 'Nível da empresa (1 a 5)', chaves: ['nivel'] },
  { campo: 'consultor', titulo: 'Consultor sugerido', chaves: ['consultor'] },
  { campo: 'cs', titulo: 'CS sugerida', chaves: ['cs sugerid', 'cs '] },
  { campo: 'justificativa', titulo: 'Por que esse consultor', chaves: ['por que', 'porque', 'justificativa', 'motivo'] },
  { campo: 'pauta', titulo: 'Pauta do diagnóstico', chaves: ['pauta', 'diagnostico'] },
] as const

export type Campo = (typeof TITULOS)[number]['campo']

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function textoParaGemini(nome: string, form: FormularioEntrada | null, carteiras: { nome: string; papel: string; alunas: number }[]) {
  const respostas = form?.respostas.map((r) => `- ${r.pergunta}: ${r.resposta}`).join('\n') ?? '(sem respostas)'
  const equipe = carteiras.map((c) => `- ${c.nome} (${c.papel === 'cs' ? 'CS' : 'consultor'}): ${c.alunas} alunas ativas`).join('\n')
  return `Pré-análise de nova aluna do Moonshot: ${nome}

Respostas do formulário do negócio:
${respostas}

Carteira atual da equipe:
${equipe}

Responda usando exatamente estes títulos, um por linha, com o conteúdo embaixo de cada um:
${TITULOS.map((t) => `## ${t.titulo}`).join('\n')}

Em "Consultor sugerido" e "CS sugerida", escreva só o nome, como aparece na carteira acima. Em "Nível da empresa", só o número.`
}

/** Separa a resposta do Gemini pelos titulos. Aceita "## Titulo", "**Titulo**" ou "Titulo:". */
export function lerResposta(texto: string) {
  const saida: Partial<Record<Campo, string>> = {}
  let atual: Campo | null = null
  for (const linha of texto.split('\n')) {
    const limpa = linha.replace(/^[#>*\s-]+|[*:\s]+$/g, '').trim()
    const pareceTitulo = /^\s*(#{1,6}\s|\*\*)/.test(linha) || (/:\s*$/.test(linha) && limpa.length < 50)
    const alvo = semAcento(limpa + ' ')
    const t = !pareceTitulo ? undefined
      : TITULOS.find((x) => x.chaves.some((c) => alvo.startsWith(c))) ?? TITULOS.find((x) => x.chaves.some((c) => alvo.includes(c)))
    if (t) { atual = t.campo; saida[atual] = ''; continue }
    if (atual) saida[atual] = `${saida[atual] ?? ''}${linha}\n`
  }
  for (const k of Object.keys(saida) as Campo[]) saida[k] = saida[k]!.trim()
  return saida
}

/** Acha a pessoa da equipe pelo nome escrito pelo Gemini. */
export function acharPessoa(texto: string | undefined, pessoas: Perfil[]) {
  if (!texto) return null
  const t = semAcento(texto)
  const exato = pessoas.find((p) => t.includes(semAcento(p.nome)))
  if (exato) return exato.id
  const porPrimeiro = pessoas.filter((p) => t.includes(semAcento(p.nome.split(' ')[0])))
  return porPrimeiro.length === 1 ? porPrimeiro[0].id : null
}

export function appsScript(token: string, url: string) {
  return `// Moonshot System: manda cada resposta do Forms para o sistema.
// Instale uma vez: cole aqui, salve e rode "instalar". Para as respostas antigas, rode "enviarTodas".
const URL_MOONSHOT = '${url}'
const TOKEN = '${token}'

function instalar() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('aoResponder').forSpreadsheet(SpreadsheetApp.getActive()).onFormSubmit().create()
}

function aoResponder(e) {
  enviarLinha(e.range.getSheet(), e.range.getRow())
}

function enviarTodas() {
  const aba = abaDeRespostas()
  for (let linha = 2; linha <= aba.getLastRow(); linha++) enviarLinha(aba, linha)
}

function abaDeRespostas() {
  const abas = SpreadsheetApp.getActive().getSheets()
  return abas.find((a) => a.getFormUrl()) || abas[0]
}

function enviarLinha(aba, linha) {
  const colunas = aba.getLastColumn()
  const perguntas = aba.getRange(1, 1, 1, colunas).getDisplayValues()[0]
  const valores = aba.getRange(linha, 1, 1, colunas).getDisplayValues()[0]
  const carimbo = aba.getRange(linha, 1).getValue()
  const respostas = perguntas.map((p, i) => ({ pergunta: p, resposta: valores[i] }))
  UrlFetchApp.fetch(URL_MOONSHOT, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ token: TOKEN, respostas, enviado_em: carimbo instanceof Date ? carimbo.toISOString() : null }),
  })
}
`
}
