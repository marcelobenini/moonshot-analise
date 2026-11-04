// Planilha "BANCO DE DADOS MOONSHOT" (a base validada pela equipe) virando
// fichas. O navegador le as abas e monta um registro por aluna; o banco
// (supabase/sistema_banco.sql, importar_banco) grava aluna, contrato, CPF,
// agenda de consultorias, anotacao, fechamento e card do ciclo.
//
// Abas lidas: CLUB, PRÓ, PRIVATE, IN COMPANY, SEM PROGRAMA (formato largo, com
// ID MS-xxxx), ELITE (mistura: colunas A-H no formato das matriculadas e o
// resto no largo) e MATRICULADAS FORA DO DB (so as marcadas "Entra no banco").
// A aba MÁQUINA DE VENDAS fica de fora por enquanto.

type Celula = string | number | boolean | Date | null | undefined
export type Registro = Record<string, unknown> & { pid: number; nome: string; origem: string }

const MES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const LARGAS = ['CLUB', 'PRÓ', 'PRIVATE', 'IN COMPANY', 'SEM PROGRAMA']
const PROD: Record<string, string> = {
  club: 'Moonshot Club', pro: 'Moonshot Pró', elite: 'Moonshot Elite', private: 'Moonshot Private',
  // Franquia e Pro: a franqueada da Natalia Beauty ganha o Moonshot Pro. Vira anotacao.
  'in company': 'Moonshot In Company', franquia: 'Moonshot Pró',
}
const PROD_ABA: Record<string, string> = {
  CLUB: 'Moonshot Club', 'PRÓ': 'Moonshot Pró', ELITE: 'Moonshot Elite', PRIVATE: 'Moonshot Private', 'IN COMPANY': 'Moonshot In Company',
}
const CONS: Record<string, string | null> = { dani: 'Daniela', 'ana elisa': 'Ana Elisa', private: null, 'felipe pacheco': 'Felipe Pacheco' }
const TEXTOS_CONSULTORIA = ['nao realizada', 'perdeu', 'trancado', 'nao marcou', 'nao agendou', 'feita pelo daniel']
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a'])

export const norm = (v: Celula) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const fone = (v: Celula) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : '' }

function s(v: Celula): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return dt(v)
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t || null
}
function dt(v: Celula): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const t = typeof v === 'string' ? v.trim() : ''
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[0] : null
}
function mesAno(v: Celula): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 7) + '-01'
  const m = norm(v).match(/^([a-z]{3})\/(\d{2})$/)
  return m && MES[m[1]] ? `20${m[2]}-${String(MES[m[1]]).padStart(2, '0')}-01` : null
}
function num(v: Celula): number | null {
  if (typeof v === 'number') return v
  const t = s(v)
  if (!t) return null
  const n = Number(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}
const meses = (v: Celula) => { const m = (s(v) ?? '').match(/\d+/); return m ? Number(m[0]) : null }
const produto = (p: Celula, aba: string | null) => PROD[norm(p)] ?? (aba ? PROD_ABA[aba] : undefined) ?? null

function consultor(v: Celula): string | null {
  let t = s(v)
  if (!t) return null
  t = t.split(',')[0].trim().replace(/\s+gera(l|is)$/i, '')
  return norm(t) in CONS ? CONS[norm(t)] : t
}
function status(plano: Celula, sit: Celula, eng: Celula) {
  const p = norm(plano), x = norm(sit)
  if (p.includes('cancel') || x.startsWith('cancelad')) return 'cancelado'
  if (p.includes('encerr') || x.includes('conclu')) return 'encerrado'
  if (x.includes('processo')) return 'em_cancelamento'
  if (p.includes('paus') || norm(eng).includes('tranc')) return 'pausado'
  return 'ativo'
}
function saude(sit: Celula, eng: Celula) {
  const x = `${norm(sit)} ${norm(eng)}`
  if (x.includes('processo')) return 'risco_saida'
  if (x.includes('inativ') || x.includes('desengaj') || x.includes('nao e engajada')) return 'sem_contato'
  if (x.includes('engajad')) return 'engajada'
  return null
}

// Remove vazio para o registro viajar enxuto.
function enxuto<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) delete o[k]
  }
  return o
}

// Chave estavel para quem nao tem ID MS-xxxx: reimportar nao duplica.
function chaveNome(nome: string) {
  let h = 0
  for (const c of norm(nome)) h = (h * 31 + c.charCodeAt(0)) | 0
  return 1_000_000 + (Math.abs(h) % 8_000_000)
}

function largo(d: Record<string, Celula>, aba: string, linha: number, extra: Partial<Registro> = {}): Registro {
  const c: [number, string][] = []
  ;['1ª consultoria', '2ª consultoria', '3ª consultoria', '4ª consultoria', '5ª consultoria'].forEach((col, i) => {
    const v = d[col], m = mesAno(v), t = s(v)
    if (m) c.push([i + 1, m])
    else if (t && TEXTOS_CONSULTORIA.some((x) => norm(t).startsWith(x))) c.push([i + 1, t])
  })
  const id = s(d['ID'])
  const temFech = d['Valor total (R$)'] != null || d['Data do fechamento'] != null
  const r: Registro = {
    pid: id && /^MS-\d+$/.test(id) ? Number(id.slice(3)) : 0,
    nome: s(d['Aluna']) ?? '', produto: produto(d['Programa'], aba), consultor: consultor(d['Consultor']), cs: s(d['CS']),
    telefone: s(d['Contato (telefone)']), telefone2: s(d['Telefone 2']), email: s(d['E-mail']), cpf: s(d['CPF']),
    inicio: dt(d['Início do plano']), termino: dt(d['Término do plano']), plano_meses: meses(d['Período do plano']),
    status: status(d['Status do plano'], d['Situação'], d['Engajamento (planilha)']),
    inadimplente: norm(d['Inadimplente']) === 'sim' || norm(d['Situação']) === 'inadimplente',
    saude: saude(d['Situação'], d['Engajamento (planilha)']),
    assinatura: s(d['Status do contrato']), forma_pagamento: s(d['Pagamento e forma']),
    acesso: s(d['Acesso à plataforma']), onboarding: s(d['Onboarding']), grupo: s(d['Adicionado no grupo']),
    cidade: s(d['Cidade/Estado']), ramo: s(d['Ramo de atividade']), faturamento: num(d['Faturamento mensal (R$)']),
    turma: s(d['Turma / aba de matrícula']), obs: s(d['Observações / situação']), entrada: mesAno(d['Data de entrada']),
    entrega_plano: mesAno(d['Entrega do plano de ação']), c,
    franquia: norm(d['Programa']) === 'franquia' || norm(d['Plano na matrícula']) === 'franquia',
    fech: temFech ? enxuto({
      data: dt(d['Data do fechamento']) ?? dt(d['Início do plano']), total: num(d['Valor total (R$)']), pago: num(d['Valor pago (R$)']) ?? 0,
      forma: s(d['Pagamento e forma']), plano: s(d['Plano de pagamento']),
    }) : null,
    origem: `${aba} linha ${linha}`,
    ...extra,
  }
  return enxuto(r)
}

function matriculada(d: Record<string, Celula>, aba: string, linha: number, forcado?: string): Registro {
  let plano = forcado ?? produto(d['Plano'], null)
  const ini = dt(d['Início'])
  // Club antes de ago/26 e o Pro de hoje (o Pro se chamava Club), salvo downsell.
  if (plano === 'Moonshot Club' && ini && ini < '2026-08-01' && !norm(d['Observações']).includes('downsell')) plano = 'Moonshot Pró'
  const st = norm(d['Status'])
  return enxuto({
    pid: 0, nome: s(d['Aluna']) ?? '', produto: plano, consultor: consultor(d['Consultor']), cs: s(d['CS']),
    telefone: s(d['Telefone']), email: s(d['E-mail']), cpf: s(d['CPF']),
    inicio: ini, termino: dt(d['Término']), plano_meses: ini ? 12 : null,
    status: st.includes('cancel') ? 'cancelado' : st.includes('encerr') ? 'encerrado' : 'ativo',
    forma_pagamento: s(d['Pagamento']), onboarding: s(d['Onboarding']), grupo: s(d['Grupo']),
    turma: s(d['Turma / aba']), obs: s(d['Observações']), origem: `${aba} linha ${linha}`,
  } as Registro)
}

// Mesma pessoa: telefone igual e nome compativel (cada palavra do nome menor
// aparece, com erro de digitacao, no maior). Telefone igual com nome diferente
// sao socias ou familia: ficam separadas.
function parecido(a: string, b: string) {
  const r = (x: string, y: string) => { // razao de semelhanca simples (Dice por bigramas)
    if (x === y) return 1
    const bg = (t: string) => Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2))
    const p = bg(x), q = bg(y)
    if (!p.length || !q.length) return 0
    const resto = [...q]
    let n = 0
    for (const g of p) { const i = resto.indexOf(g); if (i >= 0) { n++; resto.splice(i, 1) } }
    return (2 * n) / (p.length + q.length)
  }
  const toks = (n: string) => norm(n).replace(/[^a-z ]/g, ' ').split(' ').filter((t) => t && !PARTICULAS.has(t))
  let x = toks(a), y = toks(b)
  if (!x.length || !y.length) return false
  if (x.length > y.length) [x, y] = [y, x]
  return x.every((t) => y.some((u) => r(t, u) >= 0.6))
}

export interface ResultadoBanco { registros: Registro[]; duplicadas: string[]; ignoradas: number; semDecisao: number }

export function bancoParaRegistros(abas: { sheet: string; data: Celula[][] }[]): ResultadoBanco {
  const aba = (nome: string) => abas.find((a) => a.sheet.trim().toUpperCase() === nome)
  const registros: Registro[] = []
  const duplicadas: string[] = []
  const porFone = new Map<string, Registro[]>()
  const porNome = new Map<string, Registro[]>()
  function add(r: Registro) {
    if (!r.nome || ['private', 'pro', 'club', 'elite', 'in company'].includes(norm(r.nome))) return
    const f = fone(r.telefone as string)
    const candidatos = [...(f ? porFone.get(f) ?? [] : []), ...(porNome.get(norm(r.nome)) ?? [])]
    const igual = candidatos.find((o) => norm(o.nome) === norm(r.nome) || parecido(o.nome, r.nome))
    if (igual) { duplicadas.push(`${r.origem} = ${igual.origem}`); return }
    if (f) porFone.set(f, [...(porFone.get(f) ?? []), r])
    porNome.set(norm(r.nome), [...(porNome.get(norm(r.nome)) ?? []), r])
    registros.push(r)
  }
  const linhas = (nome: string) => {
    const a = aba(nome)
    if (!a) return [] as { d: Record<string, Celula>; bruta: Celula[]; linha: number }[]
    const iCab = a.data.findIndex((r) => ['ID', 'Aluna'].includes(String(r?.[0] ?? '').trim()))
    if (iCab < 0) return []
    const cab = a.data[iCab].map((c) => String(c ?? '').trim())
    return a.data.slice(iCab + 1).map((bruta, i) => ({
      d: Object.fromEntries(cab.map((k, j) => [k, bruta[j] ?? null])), bruta, linha: iCab + i + 2,
    }))
  }
  const largoCab = (() => {
    const a = aba('PRÓ')
    const r = a?.data.find((x) => String(x?.[0] ?? '').trim() === 'ID')
    return (r ?? []).map((c) => String(c ?? '').trim())
  })()

  // 1) ELITE primeiro: prevalece sobre a mesma aluna em outra aba.
  for (const { d, bruta, linha } of linhas('ELITE')) {
    if (!s(bruta[0])) continue
    const veioDoDb = [21, 23, 45].some((j) => bruta[j] != null && bruta[j] !== '')
    if (veioDoDb && largoCab.length) {
      const dl: Record<string, Celula> = {}
      largoCab.forEach((k, j) => { if (j >= 8) dl[k] = bruta[j] ?? null })
      const origemDb = s(bruta[45]) ?? ''
      add(largo(dl, 'ELITE', linha, enxuto({
        nome: s(bruta[0]) ?? '', produto: 'Moonshot Elite', cs: s(bruta[4]), telefone: s(bruta[5]), email: s(bruta[6]), cpf: s(bruta[7]),
        consultor: /geral/i.test(origemDb) ? consultor(origemDb) : null,
      }) as Partial<Registro>))
    } else {
      add(matriculada(d, 'ELITE', linha, 'Moonshot Elite'))
    }
  }
  // 2) Abas do formato largo.
  for (const nome of LARGAS) for (const { d, linha } of linhas(nome)) if (s(d['Aluna'])) add(largo(d, nome, linha))
  // 3) Matriculadas fora do DB que a equipe mandou entrar.
  let ignoradas = 0, semDecisao = 0
  for (const { d, linha } of linhas('MATRICULADAS FORA DO DB')) {
    if (!s(d['Aluna'])) continue
    const dec = norm(d['Decisão'])
    if (dec === 'entra no banco') add(matriculada(d, 'MATRICULADAS', linha))
    else if (!dec) semDecisao++
    else ignoradas++
  }
  for (const r of registros) if (!r.pid) r.pid = chaveNome(r.nome)
  return { registros, duplicadas, ignoradas, semDecisao }
}

export function pareceBanco(nomesAbas: string[]) {
  const n = new Set(nomesAbas.map((x) => x.trim().toUpperCase()))
  return n.has('CLUB') && n.has('PRÓ') && n.has('MATRICULADAS FORA DO DB')
}
