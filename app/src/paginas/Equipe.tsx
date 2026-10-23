import { useEffect, useState, type FormEvent } from 'react'
import { Copy, KeyRound, Link2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Papel, Perfil } from '../lib/tipos'
import { PAPEL, mensagemErro } from '../lib/util'
import { Campo, Erro, Modal, Selo, Titulo } from '../componentes/ui'

export function Equipe() {
  const { equipe, eu, recarregar } = useSessao()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [senha, setSenha] = useState<{ nome: string; email: string; senha: string } | null>(null)
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

  async function novaSenha(p: Perfil) {
    if (!confirm(`Gerar uma senha provisória nova para ${p.nome}? A senha atual deixa de valer.`)) return
    setErro(null); setAviso(null)
    const { data, error } = await supabase.rpc('redefinir_senha', { p_usuario: p.id })
    if (error) { setErro(mensagemErro(error)); return }
    setSenha({ nome: p.nome, email: p.email ?? '', senha: data as string })
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
      <Titulo acoes={<>
        <button className="btn-primario" onClick={() => setNovo(true)}><UserPlus size={16} /> Novo acesso</button>
        <button className="btn-secundario" onClick={vincular}><Link2 size={16} /> Vincular carteiras da planilha</button>
      </>}>Equipe</Titulo>
      <div className="mb-4 space-y-2 text-sm text-slate-600">
        <p>
          Para dar acesso a alguém, clique em <b>Novo acesso</b>: nome, e-mail e perfil. O sistema gera uma senha provisória de
          6 números para você mandar à pessoa; no primeiro login ela troca por uma senha dela, de 8 números.
        </p>
        <p>
          <b>Nome na planilha</b> é como a pessoa aparece nas planilhas, consultor ou CS. Aceita vários, separados por vírgula
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
                    <option value="">Definir perfil</option>
                    {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  {p.papel === 'consultor' || p.papel === 'cs' || p.papel === 'coordenador' ? (
                    <input className="entrada" placeholder="ex.: Thiago, Tiago" defaultValue={p.consultor_norm ?? ''}
                      onBlur={(e) => e.target.value !== (p.consultor_norm ?? '') && mudar(p, { consultor_norm: e.target.value.trim() || null })} />
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {p.id === eu?.id ? <Selo cor="bg-emerald-100 text-emerald-800">Você</Selo> : p.ativo ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.trocar_senha && (p.senha_provisoria_em
                        ? <Selo cor="bg-amber-100 text-amber-800">ainda não entrou</Selo>
                        : <Selo cor="bg-red-100 text-red-800">senha provisória venceu</Selo>)}
                      <button className="btn-secundario py-1" onClick={() => novaSenha(p)} title="Gerar senha provisória nova"><KeyRound size={14} /> Senha</button>
                      <button className="btn-secundario py-1" onClick={() => mudar(p, { ativo: false })}>Bloquear</button>
                    </div>
                  ) : (
                    <button className="btn-primario py-1" disabled={!p.papel} title={p.papel ? '' : 'Defina o papel primeiro'} onClick={() => mudar(p, { ativo: true })}>Liberar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PerfisDeAcesso />
      <RegistroSeguranca versao={aviso} />

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
      {novo && <NovoAcesso fechar={() => setNovo(false)} criado={async (r) => { setNovo(false); setSenha(r); await recarregar() }} />}
      {senha && <SenhaGerada {...senha} fechar={() => setSenha(null)} />}
    </div>
  )
}

function NovoAcesso({ fechar, criado }: { fechar: () => void; criado: (r: { nome: string; email: string; senha: string }) => void }) {
  const [f, setF] = useState({ nome: '', email: '', papel: 'cs' as Papel, planilha: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null); setEnviando(true)
    const { data, error } = await supabase.rpc('criar_acesso', {
      p_email: f.email, p_nome: f.nome, p_papel: f.papel, p_nome_planilha: f.planilha || null,
    })
    setEnviando(false)
    if (error) { setErro(mensagemErro(error)); return }
    criado({ nome: f.nome.trim(), email: f.email.trim().toLowerCase(), senha: data as string })
  }
  return (
    <Modal titulo="Novo acesso" aberto fechar={fechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><input className="entrada" required autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail" dica="É o login dela."><input className="entrada" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Perfil">
          <select className="entrada" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
            {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        {(f.papel === 'cs' || f.papel === 'consultor') && (
          <Campo rotulo="Nome na planilha" dica="Como ela aparece nas planilhas importadas, para a carteira vir junto. Aceita apelidos: “Thiago, Tiago”.">
            <input className="entrada" value={f.planilha} onChange={(e) => setF({ ...f, planilha: e.target.value })} />
          </Campo>
        )}
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={enviando}>Criar acesso</button>
        </div>
      </form>
    </Modal>
  )
}

// A senha so aparece aqui, uma vez. O banco guarda so o hash.
function SenhaGerada({ nome, email, senha, fechar }: { nome: string; email: string; senha: string; fechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const recado = `Oi, ${nome.split(' ')[0]}! Seu acesso ao Moonshot System está pronto.\n\nEndereço: ${location.origin}\nLogin: ${email}\nSenha provisória: ${senha}\n\nNo primeiro acesso o sistema pede para você criar sua senha, de 8 números. A senha provisória vale por 72 horas.`
  return (
    <Modal titulo="Acesso pronto" aberto fechar={fechar}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Mande para {nome}. Esta senha não aparece de novo e <b>vale por 72 horas</b>; depois disso, gere outra em <b>Senha</b>.</p>
        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-xs text-slate-500">{email}</div>
          <div className="mt-1 font-mono text-3xl font-semibold tracking-widest">{senha}</div>
        </div>
        <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-xs text-slate-700">{recado}</pre>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={() => { navigator.clipboard.writeText(recado); setCopiado(true) }}><Copy size={14} /> {copiado ? 'Copiado' : 'Copiar mensagem'}</button>
          <button className="btn-primario" onClick={fechar}>Pronto</button>
        </div>
      </div>
    </Modal>
  )
}

type Registro = { id: number; quando: string; autor_id: string | null; acao: string; alvo: string | null; detalhe: Record<string, unknown> }

// Quem deu, mudou ou tirou acesso, gerou senha, apagou ficha, importou planilha.
function RegistroSeguranca({ versao }: { versao: unknown }) {
  const { nomeDe } = useSessao()
  const [lista, setLista] = useState<Registro[]>([])
  useEffect(() => {
    supabase.from('auditoria').select('*').order('quando', { ascending: false }).limit(100)
      .then(({ data }) => setLista((data ?? []) as Registro[]))
  }, [versao])
  return (
    <details className="painel mt-6">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Registro de segurança{lista.length ? ` · ${lista.length} mais recentes` : ''}</summary>
      {lista.length === 0 ? <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">Nada registrado ainda.</p> : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {lista.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2">
              <span><b className="font-medium">{r.acao}</b>{r.alvo && <span className="text-slate-600"> · {r.alvo}</span>}
                {typeof r.detalhe.de !== 'undefined' && <span className="text-xs text-slate-500"> ({String(r.detalhe.de ?? 'vazio')} → {String(r.detalhe.para ?? 'vazio')})</span>}
                {typeof r.detalhe.perfil === 'string' && <span className="text-xs text-slate-500"> ({r.detalhe.perfil})</span>}</span>
              <span className="text-xs text-slate-500">{r.autor_id ? nomeDe(r.autor_id) : 'Sistema'} · {new Date(r.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

// O que cada perfil faz, como as regras do banco aplicam.
const PERMISSOES: [string, string, string, string, string, string][] = [
  ['', 'Coordenação', 'CS', 'Consultor', 'Comercial', 'Retenção'],
  ['Ver e buscar alunas', 'todas', 'todas', 'todas', 'todas', 'todas'],
  ['Cadastrar aluna', 'sim', 'sim', 'na própria carteira', 'sim', 'sim'],
  ['Editar ficha e perfil do negócio', 'todas', 'todas', 'da carteira', 'não', 'não'],
  ['Registrar contato', 'sim', 'sim', 'da carteira', 'com card aberto', 'sim'],
  ['Mudar status (inadimplente, cancelada…)', 'sim', 'sim', 'da carteira', 'não', 'sim'],
  ['Registrar consultoria e ler relatos', 'tudo', 'das suas alunas', 'da carteira', 'com card aberto (só ler)', 'com card aberto (só ler)'],
  ['Enviar ao comercial', 'sim', 'sim', 'da carteira', 'não', 'não'],
  ['Redistribuir carteira (consultor/CS)', 'sim', 'sim', 'não', 'não', 'não'],
  ['Contratos', 'editar', 'editar', 'ver', 'ver', 'ver'],
  ['Funis que move', 'todos', 'Onboarding, Renovação', 'Ciclo, Oportunidades, Renovação', 'Comercial', 'Retenção'],
  ['Eventos', 'editar', 'editar', 'marcar presença', 'editar', 'marcar presença'],
  ['Equipe, acessos e importar planilhas', 'sim', 'não', 'não', 'não', 'não'],
]

function PerfisDeAcesso() {
  return (
    <details className="painel mt-6">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">O que cada perfil pode fazer</summary>
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>{PERMISSOES[0].map((c, i) => <th key={i} className="px-3 py-2 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {PERMISSOES.slice(1).map((l) => (
              <tr key={l[0]} className="border-t border-slate-100">
                {l.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? 'font-medium text-slate-700' : c === 'não' ? 'text-slate-300' : 'text-slate-600'}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
