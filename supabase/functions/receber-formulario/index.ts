// Recebe a resposta do Google Forms (Apps Script da planilha de respostas) e
// entrega ao banco. Nao usa login: quem prova a origem e o token, conferido
// dentro de receber_formulario() contra a tabela segredo.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 })
  const corpo = await req.json().catch(() => null)
  if (!corpo?.token || !corpo?.respostas) return Response.json({ erro: 'faltou token ou respostas' }, { status: 400 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await supabase.rpc('receber_formulario', {
    p_token: String(corpo.token), p_respostas: corpo.respostas, p_enviado_em: corpo.enviado_em ?? null,
  })
  if (error) return Response.json({ erro: error.message.includes('token') ? 'token invalido' : 'nao deu para gravar' }, { status: error.message.includes('token') ? 401 : 500 })
  return Response.json(data)
})
