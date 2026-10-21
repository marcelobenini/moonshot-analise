import type { Papel, Saude, StatusDemanda, Demanda } from './tipos'

export const PAPEL: Record<Papel, string> = {
  coordenador: 'Coordenação',
  cs: 'CS',
  consultor: 'Consultor',
  comercial: 'Comercial',
  retencao: 'Retenção',
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
  encerrado: { rotulo: 'Encerrada', cor: 'bg-slate-200 text-slate-700' },
  cancelado: { rotulo: 'Cancelada', cor: 'bg-slate-800 text-white' },
}

export const PRAZO_RETENCAO: Record<string, string> = {
  dentro_7_dias: 'Dentro dos 7 dias',
  fora_7_dias: 'Fora dos 7 dias',
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function reais(v: number | null | undefined) {
  return v == null ? '—' : moeda.format(Number(v))
}

// Data do banco vem como 'AAAA-MM-DD'; new Date() leria como UTC e mostraria o
// dia anterior no Brasil.
export function data(v: string | null | undefined) {
  if (!v) return '—'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function dataHora(v: string | null | undefined) {
  if (!v) return '—'
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
