// Chamada pelo Cron da Vercel (vercel.json) uma vez por dia. O plano gratuito
// do Supabase pausa o projeto depois de dias sem acesso pela API, e o pg_cron
// interno nao conta como acesso. Esta chamada conta.
export default async function handler(req, res) {
  // Com CRON_SECRET definido no projeto, a Vercel manda o segredo no cabecalho
  // e so ela consegue disparar. Sem ele, a rota fica aberta, o que e inofensivo:
  // ela nao le nem grava dado nenhum.
  const segredo = process.env.CRON_SECRET
  if (segredo && req.headers.authorization !== `Bearer ${segredo}`) {
    return res.status(401).json({ ok: false })
  }

  const url = process.env.VITE_SUPABASE_URL
  const chave = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !chave) {
    return res.status(500).json({ ok: false, erro: 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nao configuradas' })
  }

  const r = await fetch(`${url}/rest/v1/rpc/manter_ativo`, {
    method: 'POST',
    // So `apikey`: a chave nova (sb_publishable_...) nao e JWT e nao vai no Authorization.
    headers: { apikey: chave, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const corpo = await r.text()
  return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, supabase: corpo })
}
