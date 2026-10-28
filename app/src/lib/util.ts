import type { Papel, Saude, StatusDemanda, Demanda } from './tipos'

export const PAPEL: Record<Papel, string> = {
  coordenador: 'Coordenação',
  cs: 'CS',
  consultor: 'Consultor',
  comercial: 'Comercial',
  retencao: 'Retenção',
  gestao: 'Gestão',
}

export const SAUDE: Record<Saude, { rotulo: string; cor: string }> = {
  engajada: { rotulo: 'Engajada', cor: 'bg-emerald-100 text-emerald-800' },
  oscilante: { rotulo: 'Oscilante', cor: 'bg-amber-100 text-amber-800' },
  sem_contato: { rotulo: 'Sem contato', cor: 'bg-orange-100 text-orange-800' },
  risco_saida: { rotulo: 'Risco de saída', cor: 'bg-red-100 text-red-800' },
  renovou_upsell: { rotulo: 'Renovou / upsell', cor: 'bg-indigo-100 text-indigo-800' },
}

export const STATUS_DEMANDA: Record<StatusDemanda, { rotulo: string; cor: string }> = {
  aberta: { rotulo: 'Aberta', cor: 'bg-sky-100 text-sky-800' },
  em_andamento: { rotulo: 'Em andamento', cor: 'bg-indigo-100 text-indigo-800' },
  aguardando: { rotulo: 'Aguardando', cor: 'bg-amber-100 text-amber-800' },
  concluida: { rotulo: 'Concluída', cor: 'bg-emerald-100 text-emerald-800' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-slate-200 text-slate-700' },
}

export const PRIORIDADE: Record<Demanda['prioridade'], { rotulo: string; cor: string }> = {
  baixa: { rotulo: 'Baixa', cor: 'bg-slate-100 text-slate-700' },
  normal: { rotulo: 'Normal', cor: 'bg-slate-100 text-slate-700' },
  alta: { rotulo: 'Alta', cor: 'bg-orange-100 text-orange-800' },
  urgente: { rotulo: 'Urgente', cor: 'bg-red-100 text-red-800' },
}

export const TIPO_DEMANDA: Record<Demanda['tipo'], string> = {
  solicitacao: 'Solicitação',
  tarefa: 'Tarefa',
  duvida: 'Dúvida',
  problema: 'Problema',
  aviso: 'Aviso',
}

export const FINANCEIRO: Record<string, { rotulo: string; cor: string }> = {
  adimplente: { rotulo: 'Adimplente', cor: 'bg-emerald-100 text-emerald-800' },
  quitado: { rotulo: 'Quitado', cor: 'bg-emerald-100 text-emerald-800' },
  parcelado: { rotulo: 'Parcelado', cor: 'bg-sky-100 text-sky-800' },
  pendente: { rotulo: 'Pagamento pendente', cor: 'bg-amber-100 text-amber-800' },
  inadimplente: { rotulo: 'Inadimplente', cor: 'bg-red-100 text-red-800' },
}

export const PRODUTOS = ['Moonshot Club', 'Moonshot Pró', 'Moonshot Elite', 'Moonshot Private', 'Moonshot In Company', 'Máquina de Vendas']

export const NOTA: Record<string, string> = {
  nota: 'Anotação',
  situacao: 'Situação (planilha do consultor)',
  obs_cs: 'Observação da CS',
  obs_consultor: 'Observação do consultor',
  potencial: 'Potencial',
  contato: 'Contato da CS',
  status: 'Mudança de status',
}

export const CANAIS = ['WhatsApp', 'Ligação', 'Reunião online', 'Presencial', 'E-mail']

export const STATUS_CONTRATO: Record<string, { rotulo: string; cor: string }> = {
  ativo: { rotulo: 'Ativa', cor: 'bg-emerald-100 text-emerald-800' },
  pendente: { rotulo: 'Pendente', cor: 'bg-amber-100 text-amber-800' },
  bloqueado: { rotulo: 'Bloqueada', cor: 'bg-red-100 text-red-800' },
  pausado: { rotulo: 'Pausada', cor: 'bg-sky-100 text-sky-800' },
  em_cancelamento: { rotulo: 'Em processo de cancelamento', cor: 'bg-orange-100 text-orange-800' },
  encerrado: { rotulo: 'Encerrada', cor: 'bg-slate-200 text-slate-700' },
  cancelado: { rotulo: 'Cancelada', cor: 'bg-slate-800 text-white' },
}

export const PRAZO_RETENCAO: Record<string, string> = {
  dentro_7_dias: 'Dentro dos 7 dias',
  fora_7_dias: 'Fora dos 7 dias',
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function reais(v: number | null | undefined) {
  return v == null ? 'não informado' : moeda.format(Number(v))
}

// Data do banco vem como 'AAAA-MM-DD'; new Date() leria como UTC e mostraria o
// dia anterior no Brasil.
export function data(v: string | null | undefined) {
  if (!v) return 'sem data'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function dataHora(v: string | null | undefined) {
  if (!v) return 'sem data'
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ha(v: string) {
  const s = (Date.now() - new Date(v).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

export function diasDesde(v: string) {
  return Math.floor((Date.now() - new Date(v).getTime()) / 86400000)
}

export function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Erro do Postgres vem com o texto do `raise exception`, que ja esta em
// portugues e diz o que fazer. Mostra ele em vez de um generico.
export function mensagemErro(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: string }).message)
    if (m.includes('row-level security')) return 'Você não tem permissão para isso.'
    if (m.includes('ux_card_aberto')) return 'Esta aluna já tem um card aberto neste funil.'
    return m
  }
  return 'Algo deu errado. Tente de novo.'
}

// Link do WhatsApp: numero brasileiro sem DDI ganha o 55; o de fora (351...)
// ja vem com o codigo do pais.
export function linkWhats(tel: string | null | undefined) {
  const d = (tel ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
}

// Origem do card em portugues de gente: "consultor" vira "Indicação de Marcelo".
export function rotuloOrigem(dados: Record<string, unknown>) {
  const o = typeof dados.origem === 'string' ? dados.origem : null
  const quem = typeof dados.enviado_por === 'string' ? dados.enviado_por : null
  if (o === 'consultor' || (!o && quem)) return quem ? `Indicação de ${quem}` : 'Indicação do consultor'
  if (o === 'lista') return 'Lista'
  if (o === 'inbound') return 'Inbound'
  return o
}

export const STATUS_CASO: Record<string, { rotulo: string; cor: string }> = {
  implantacao: { rotulo: 'Implantação', cor: 'bg-sky-100 text-sky-800' },
  em_andamento: { rotulo: 'Em andamento', cor: 'bg-emerald-100 text-emerald-800' },
  atencao: { rotulo: 'Atenção', cor: 'bg-amber-100 text-amber-800' },
  em_risco: { rotulo: 'Em risco', cor: 'bg-red-100 text-red-800' },
  concluido: { rotulo: 'Concluído', cor: 'bg-slate-200 text-slate-700' },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-slate-800 text-white' },
}

// Nivel da empresa da aluna no acompanhamento de In Company e Private.
export const NIVEL: Record<number, string> = {
  1: 'Inicial', 2: 'Em estruturação', 3: 'Estruturada', 4: 'Em escala', 5: 'Referência',
}

export const PRODUTOS_FECHAMENTO = ['Moonshot In Company', 'Moonshot Private', 'Moonshot Pró', 'Moonshot Elite', 'Moonshot Club']

// Quem edita a ficha da aluna (cadastro, agenda, contratos, status). Espelha edita_aluna() no banco.
export const EDITA_ALUNA: string[] = ['coordenador', 'cs', 'consultor', 'comercial', 'retencao']

export const STATUS_ENTRADA: Record<string, { rotulo: string; cor: string }> = {
  aguardando_formulario: { rotulo: 'Aguardando resposta', cor: 'bg-slate-100 text-slate-700' },
  formulario_recebido: { rotulo: 'Para analisar', cor: 'bg-sky-100 text-sky-800' },
  para_validar: { rotulo: 'Para validar', cor: 'bg-amber-100 text-amber-800' },
  aprovada: { rotulo: 'Aprovada', cor: 'bg-emerald-100 text-emerald-800' },
  ajustada: { rotulo: 'Ajustada', cor: 'bg-indigo-100 text-indigo-800' },
}
