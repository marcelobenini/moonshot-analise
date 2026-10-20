import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Papel, Perfil } from '../lib/tipos'
import { PAPEL, mensagemErro } from '../lib/util'
import { Erro, Selo, Titulo } from '../componentes/ui'

export function Equipe() {
  const { equipe, eu, recarregar } = useSessao()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const pendentes = equipe.filter((p) => !p.ativo)
  const [nomes, setNomes] = useState<{ papel: string; exemplo: string; alunas: number; vinculadas: number }[]>([])
  useEffect(() => {
    supabase.from('vw_nomes_planilha').select('*').order('alunas', { ascending: false }).then(({ data }) => setNomes((data ?? []) as never))
  }, [aviso])

  async function mudar(p: Perfil, campos: Partial<Perfil>) {
    setErro(null); setAviso(null)
    const { error } = await supabase.from('perfil').update(campos).eq('id', p.id)
    if (error) setErro(mensagemErro(error))
    await recarregar()
  }

  async function vincular() {
    setErro(null); setAviso(null)
    const { data, error } = await supabase.rpc('vincular_equipe')
    if (error) { setErro(mensagemErro(error)); return }
    setAviso(`${data.alunas_vinculadas} alunas ligadas ao consultor e ${data.cards_atribuidos} cards atribuídos.`)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Titulo acoes={<button className="btn-secundario" onClick={vincular}><Link2 size={16} /> Vincular carteiras da planilha</button>}>Equipe</Titulo>
      <div className="mb-4 space-y-2 text-sm text-slate-600">
        <p>
          Para dar acesso a alguém: no painel do Supabase, em <b>Authentication → Users → Invite user</b>, convide pelo e-mail.
          A pessoa aparece aqui como <b>pendente</b>; escolha o papel e libere.
        </p>
        <p>
          <b>Nome na planilha</b> é como a pessoa aparece nas planilhas — consultor ou CS. Aceita vários, separados por vírgula
          (ex.: “Thiago, Tiago”). Preencha e clique em “Vincular carteiras” para as alunas importadas irem para a carteira certa.
        </p>
      </div>
      <Erro msg={erro} />
      {aviso && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div>}
      {pendentes.length > 0 && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{pendentes.length} acesso(s) aguardando liberação.</div>}

      <div className="painel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2.5">Pessoa</th><th className="px-4 py-2.5">Papel</th><th className="px-4 py-2.5">Nome na planilha</th><th className="px-4 py-2.5">Acesso</th></tr>
          </thead>
          <tbody>
            {[...pendentes, ...equipe.filter((p) => p.ativo)].map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-4 py-2.5">
                  <input className="entrada border-transparent px-1 font-medium hover:border-slate-300" defaultValue={p.nome}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== p.nome && mudar(p, { nome: e.target.value.trim() })} />
                  <div className="px-1 text-xs text-slate-500">{p.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <select className="entrada" value={p.papel ?? ''} disabled={p.id === eu?.id}
                    onChange={(e) => mudar(p, { papel: (e.target.value || null) as Papel | null })}>
                    <option value="">— definir —</option>
                    {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  {p.papel === 'consultor' || p.papel === 'cs' || p.papel === 'coordenador' ? (
                    <input className="entrada" placeholder="ex.: Thiago, Tiago" defaultValue={p.consultor_norm ?? ''}
                      onBlur={(e) => e.target.value !== (p.consultor_norm ?? '') && mudar(p, { consultor_norm: e.target.value.trim() || null })} />
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  {p.id === eu?.id ? <Selo cor="bg-emerald-100 text-emerald-800">Você</Selo> : p.ativo ? (
                    <button className="btn-secundario py-1" onClick={() => mudar(p, { ativo: false })}>Bloquear</button>
                  ) : (
                    <button className="btn-primario py-1" disabled={!p.papel} title={p.papel ? '' : 'Defina o papel primeiro'} onClick={() => mudar(p, { ativo: true })}>Liberar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nomes.length > 0 && (
        <div className="painel mt-6 overflow-x-auto">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Nomes que vieram das planilhas</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="px-4 py-2">Como aparece</th><th className="px-4 py-2">Papel</th><th className="px-4 py-2">Alunas</th><th className="px-4 py-2">Ligadas a alguém da equipe</th></tr>
            </thead>
            <tbody>
              {nomes.map((n) => (
                <tr key={n.papel + n.exemplo} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{n.exemplo}</td>
                  <td className="px-4 py-2">{n.papel === 'cs' ? 'CS' : 'Consultor'}</td>
                  <td className="px-4 py-2">{n.alunas}</td>
                  <td className={`px-4 py-2 ${n.vinculadas < n.alunas ? 'text-amber-700' : 'text-emerald-700'}`}>{n.vinculadas} de {n.alunas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
