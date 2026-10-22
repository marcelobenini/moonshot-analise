// Espelho das tabelas de supabase/sistema.sql. Mudou la, muda aqui.

export type Papel = 'coordenador' | 'cs' | 'consultor' | 'comercial' | 'retencao'

export type Saude = 'engajada' | 'oscilante' | 'sem_contato' | 'risco_saida' | 'renovou_upsell'

export interface Perfil {
  id: string
  nome: string
  email: string | null
  papel: Papel | null
  ativo: boolean
  consultor_norm: string | null
  trocar_senha: boolean
  senha_provisoria_em: string | null
}

export interface Aluna {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  empresa: string | null
  ramo: string | null
  cidade: string | null
  uf: string | null
  produto: string | null
  turma: string | null
  inicio: string | null
  termino: string | null
  status_contrato: 'ativo' | 'pendente' | 'bloqueado' | 'pausado' | 'encerrado' | 'cancelado'
  status_financeiro: string | null
  faturamento_mensal: number | null
  funcionarios: number | null
  consultor_id: string | null
  cs_id: string | null
  consultor_planilha: string | null
  saude: Saude | null
  ultima_consultoria: string | null
  tamanho_kit: string | null
  telefone2: string | null
  forma_pagamento: string | null
  plano_meses: number | null
  contrato_assinatura: string | null
  acesso_plataforma: string | null
  onboarding_status: string | null
  grupo_avisos: string | null
  cadastro_preenchido: boolean
  link_notion: string | null
  jaqueta: string | null
  cs_planilha: string | null
  dores: string | null
  objetivos: string | null
  resumo: string | null
  instagram: string | null
  ultimo_contato: string | null
  proximo_contato: string | null
}

export type StatusFinanceiro = 'adimplente' | 'inadimplente' | 'parcelado' | 'quitado' | 'pendente'

export interface Contrato {
  id: number
  aluna_id: number
  produto: string
  turma: string | null
  inicio: string | null
  termino: string | null
  plano_meses: number | null
  status: Aluna['status_contrato']
  status_financeiro: StatusFinanceiro | null
  forma_pagamento: string | null
  assinatura: string | null
  observacao: string | null
}

export interface AgendaConsultoria {
  id: number
  aluna_id: number
  numero: number
  data_prevista: string | null
  realizada_em: string | null
  observacao: string | null
}

export interface NotaAluna {
  id: number
  aluna_id: number
  autor_id: string | null
  tipo: string
  texto: string
  origem: string | null
  criado_em: string
  canal: string | null
  retorno_em: string | null
  retorno_feito: boolean
}

// Uma linha de vw_linha_tempo: tudo que aconteceu com a aluna, de todas as areas.
export interface Acontecimento {
  aluna_id: number
  quando: string
  tipo: 'status' | 'consultoria' | 'contato' | 'nota' | 'funil' | 'contrato' | 'demanda' | 'evento'
  titulo: string | null
  texto: string | null
  extra: Record<string, unknown>
  autor_id: string | null
  link: string | null
}

export interface Evento {
  id: number
  nome: string
  data: string | null
  local: string | null
  descricao: string | null
}

export interface Participante {
  id: number
  evento_id: number
  aluna_id: number | null
  nome: string
  contato: string | null
  tipo: 'aluna' | 'socio' | 'convidado'
  confirmado: boolean | null
  presente: boolean | null
  programa_informado: string | null
  faturamento_informado: string | null
  potencial: 'alto' | 'medio' | 'baixo' | null
  potencial_obs: string | null
}

export interface Importacao {
  id: number
  tipo: string
  arquivo: string
  status: 'recebendo' | 'processada' | 'erro'
  resumo: Record<string, unknown> | null
  criado_em: string
}

export interface Pendencia {
  id: number
  importacao_id: number
  aba: string | null
  linha: number | null
  nome: string | null
  motivo: string
  candidatos: { nova?: number; parecidas?: { id: number; nome: string; similaridade: number }[] } | { id: number; nome: string; similaridade: number }[] | null
  resolvida: boolean
}

export interface CampoFunil {
  chave: string
  rotulo: string
  tipo: 'texto' | 'textao' | 'numero' | 'moeda' | 'data' | 'selecao'
  opcoes?: string[]
}

export interface Funil {
  id: string
  nome: string
  descricao: string | null
  ordem: number
  papeis_editam: Papel[]
  papeis_leem: Papel[]
  campos: CampoFunil[]
  motivos: string[]
}

export interface Etapa {
  id: number
  funil_id: string
  nome: string
  ordem: number
  tipo: 'aberta' | 'ganha' | 'perdida'
  exige_motivo: boolean
  alerta_dias: number | null
}

export interface Card {
  id: number
  funil_id: string
  etapa_id: number
  aluna_id: number | null
  titulo: string
  responsavel_id: string | null
  valor: number | null
  prazo: string | null
  motivo: string | null
  dados: Record<string, string | number | null>
  origem_card_id: number | null
  posicao: number
  criado_em: string
  etapa_desde: string
  fechado_em: string | null
}

export interface CardEvento {
  id: number
  card_id: number
  tipo: 'criado' | 'moveu' | 'comentario' | 'responsavel' | 'editou'
  texto: string | null
  autor_id: string | null
  criado_em: string
}

export interface RegistroConsultoria {
  id: number
  aluna_id: number
  consultor_id: string | null
  data: string
  numero: number | null
  realizada: boolean
  saude: Saude
  situacao: string
  faturamento_mensal: number | null
  proximo_passo: string | null
  criado_em: string
}

export type StatusDemanda = 'aberta' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada'

export interface Demanda {
  id: number
  titulo: string
  descricao: string | null
  tipo: 'solicitacao' | 'tarefa' | 'duvida' | 'problema' | 'aviso'
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  status: StatusDemanda
  solicitante_id: string | null
  responsavel_id: string | null
  equipe: Papel | null
  aluna_id: number | null
  prazo: string | null
  criado_em: string
  atualizado_em: string
  concluida_em: string | null
}

export interface DemandaComentario {
  id: number
  demanda_id: number
  autor_id: string | null
  texto: string
  criado_em: string
}

export interface Notificacao {
  id: number
  tipo: string
  titulo: string
  corpo: string | null
  link: string | null
  lida_em: string | null
  criado_em: string
}
