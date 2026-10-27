// Le a transcricao de uma reuniao de acompanhamento (In Company / Private) e
// sugere o preenchimento do caso: resumo, status, nivel e proximas acoes.
// Quem chama precisa enxergar o caso (a RLS decide, com o token de quem chamou).
// A chave da API fica no segredo ANTHROPIC_API_KEY do projeto, nunca no app.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ESQUEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string', description: 'O que aconteceu na reunião, em 3 a 6 frases.' },
    status: { type: 'string', enum: ['implantacao', 'em_andamento', 'atencao', 'em_risco', 'concluido'] },
    nivel: { type: 'integer', enum: [0, 1, 2, 3, 4, 5], description: '0 quando a conversa não permite dizer.' },
    acoes: { type: 'array', items: { type: 'string' }, description: 'Próximas ações combinadas, uma por item.' },
    pontos_de_atencao: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'status', 'nivel', 'acoes', 'pontos_de_atencao'],
  additionalProperties: false,
}

const SISTEMA = `Você ajuda consultores do programa Moonshot (mentoria empresarial da Natalia Beauty) a registrar o acompanhamento de clientes In Company e Private.
Leia a transcrição e preencha o caso em português do Brasil, com base só no que foi dito.
Status: implantacao (começando, onboarding), em_andamento (andando bem), atencao (travas ou atrasos), em_risco (insatisfação, sinal de cancelamento ou de não pagamento), concluido (entrega encerrada).
Nível da empresa: 1 inicial (sem processos), 2 em estruturação, 3 estruturada, 4 em escala, 5 referência. Use 0 se a conversa não permitir avaliar.
Ações: tarefas concretas combinadas, com responsável e prazo quando aparecerem na conversa.`

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const chave = Deno.env.get('ANTHROPIC_API_KEY')
  if (!chave) return resposta({ erro: 'sem_chave' }, 503)

  const { fechamento_id, texto } = await req.json().catch(() => ({}))
  if (!fechamento_id || typeof texto !== 'string' || texto.trim().length < 40) {
    return resposta({ erro: 'Mande o caso e a transcrição.' }, 400)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: caso } = await supabase.from('fechamento')
    .select('nome, produto, status, nivel, proximas_acoes').eq('id', fechamento_id).maybeSingle()
  if (!caso) return resposta({ erro: 'Caso não encontrado ou sem acesso.' }, 404)

  const cliente = new Anthropic({ apiKey: chave })
  try {
    // deno-lint-ignore no-explicit-any
    const msg: any = await cliente.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SISTEMA,
      messages: [{
        role: 'user',
        content: `Caso: ${caso.nome} (${caso.produto}). Status atual: ${caso.status}. Nível atual: ${caso.nivel ?? 'sem registro'}.\n` +
          `Ações em aberto: ${caso.proximas_acoes ?? 'nenhuma'}\n\n<transcricao>\n${texto}\n</transcricao>`,
      }],
    // deno-lint-ignore no-explicit-any
    } as any)
    if (msg.stop_reason === 'refusal') return resposta({ erro: 'A leitura automática recusou este texto.' }, 422)
    // deno-lint-ignore no-explicit-any
    const bloco = msg.content.find((b: any) => b.type === 'text')
    if (!bloco) return resposta({ erro: 'Sem resposta da leitura automática.' }, 502)
    return resposta(JSON.parse(bloco.text))
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: 'Muitas leituras agora, tente em um minuto.' }, 429)
    if (e instanceof Anthropic.APIError) return resposta({ erro: `Falha na leitura automática (${e.status ?? 'rede'}).` }, 502)
    return resposta({ erro: 'Falha na leitura automática.' }, 502)
  }
})
