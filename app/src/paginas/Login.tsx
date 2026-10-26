import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, configurado, definirManterConectado, manterConectado, provedoresLigados } from '../lib/supabase'
import { CHAVE_SAIU, useSessao } from '../lib/sessao'
import { Campo, Erro } from '../componentes/ui'
import { mensagemErro } from '../lib/util'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'link'>('entrar')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem(CHAVE_SAIU)) { sessionStorage.removeItem(CHAVE_SAIU); return 'Você saiu automaticamente por tempo sem uso. Entre de novo.' }
    } catch { /* sem storage */ }
    return null
  })
  const [enviando, setEnviando] = useState(false)
  const [manter, setManter] = useState(manterConectado)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    provedoresLigados().then((p) => setGoogle(p.google))
    // Volta do Google com erro: conta que a coordenacao nao criou (o cadastro
    // aberto fica desligado), ou login cancelado.
    const q = new URLSearchParams(location.search + '&' + location.hash.slice(1))
    const desc = q.get('error_description')
    if (desc) {
      setErro(/signup|not allowed|user not found/i.test(desc)
        ? 'Este Google não tem acesso ao Moonshot. Use o mesmo e-mail que a coordenação cadastrou, ou peça seu acesso.'
        : 'Não foi possível entrar com o Google. Tente de novo.')
      history.replaceState(null, '', location.pathname)
    }
  }, [])

  async function entrarComGoogle() {
    setErro(null); setAviso(null)
    definirManterConectado(manter)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin, queryParams: { prompt: 'select_account' } },
    })
    if (error) setErro(mensagemErro(error))
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null); setAviso(null); setEnviando(true)
    if (modo === 'entrar') {
      definirManterConectado(manter)
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      // Mesma mensagem para e-mail inexistente e senha errada: nao revela quem tem acesso.
      if (error) setErro(error.status === 429 ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
        : error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemErro(error))
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/senha` })
      if (error) setErro(mensagemErro(error))
      else setAviso('Se o e-mail estiver cadastrado, chega um link em instantes para você criar a senha. Se não chegar, peça uma senha provisória à coordenação.')
    }
    setEnviando(false)
  }

  return (
    <Tela>
      {!configurado && (
        <Erro msg="O app ainda não foi ligado ao Supabase: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja app/.env.example)." />
      )}
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="E-mail">
          <input className="entrada" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        {modo === 'entrar' && (
          <Campo rotulo="Senha">
            <input className="entrada" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
        )}
        {modo === 'entrar' && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#b6884c]" checked={manter} onChange={(e) => setManter(e.target.checked)} />
            Manter conectado
            <span className="text-xs text-slate-400">(só em computador seu)</span>
          </label>
        )}
        <Erro msg={erro} />
        {aviso && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div>}
        <button className="btn-primario w-full" disabled={enviando}>
          {modo === 'entrar' ? 'Entrar' : 'Enviar link'}
        </button>
        {modo === 'entrar' && google && (
          <>
            <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />ou<span className="h-px flex-1 bg-slate-200" /></div>
            <button type="button" onClick={entrarComGoogle}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              <LogoGoogle /> Entrar com Google
            </button>
          </>
        )}
        <button type="button" className="w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => { setModo(modo === 'entrar' ? 'link' : 'entrar'); setErro(null); setAviso(null) }}>
          {modo === 'entrar' ? 'Esqueceu a senha?' : 'Voltar para o login'}
        </button>
      </form>
    </Tela>
  )
}

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

// Senha de acesso: exatamente 8 digitos.
const SENHA_VALIDA = /^\d{8}$/

export function DefinirSenha({ obrigatoria = false }: { obrigatoria?: boolean }) {
  const nav = useNavigate()
  const { sessao, recarregar, sair } = useSessao()
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!SENHA_VALIDA.test(senha)) { setErro('A senha precisa ter exatamente 8 números.'); return }
    if (senha !== confirma) { setErro('As duas senhas não são iguais.'); return }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      setErro(error.message.includes('different from the old') ? 'Use uma senha diferente da atual.' : mensagemErro(error))
      return
    }
    // O banco tira a marca de senha provisoria ao ver a senha mudar; recarrega o perfil.
    await recarregar()
    nav('/')
  }

  const soNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  if (!sessao) return <Tela><p className="text-sm text-slate-600">O link expirou. Volte ao login e peça outro.</p></Tela>
  return (
    <Tela>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-slate-600">
          {obrigatoria
            ? <>Você entrou com uma senha provisória. Para continuar, defina sua senha definitiva para <b>{sessao.user.email}</b>.</>
            : <>Crie sua senha de acesso para <b>{sessao.user.email}</b>.</>}
        </p>
        <Campo rotulo="Nova senha" dica="Exatamente 8 números.">
          <input className="entrada tracking-widest" type="password" inputMode="numeric" autoComplete="new-password"
            autoFocus maxLength={8} value={senha} onChange={(e) => setSenha(soNumeros(e.target.value))} />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input className="entrada tracking-widest" type="password" inputMode="numeric" autoComplete="new-password"
            maxLength={8} value={confirma} onChange={(e) => setConfirma(soNumeros(e.target.value))} />
        </Campo>
        <Erro msg={erro} />
        <button className="btn-primario w-full" disabled={salvando}>Salvar senha</button>
        {obrigatoria && <button type="button" className="w-full text-center text-sm text-slate-500 hover:underline" onClick={sair}>Sair</button>}
      </form>
    </Tela>
  )
}

export function Aguardando() {
  const { eu, sessao, sair } = useSessao()
  return (
    <Tela>
      <div className="space-y-3 text-sm text-slate-600">
        <p>Olá{eu?.nome ? `, ${eu.nome}` : ''}! Seu acesso foi criado e está <b>aguardando liberação</b> da coordenação.</p>
        <p>Assim que seu perfil for definido (CS, consultor, comercial…), é só recarregar esta página.</p>
        <p className="text-xs text-slate-400">{sessao?.user.email}</p>
        <div className="flex gap-2">
          <button className="btn-primario" onClick={() => location.reload()}>Recarregar</button>
          <button className="btn-secundario" onClick={sair}>Sair</button>
        </div>
      </div>
    </Tela>
  )
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-noite p-4">
      {/* Lua: o brilho dourado atras do cartao. */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_35%_35%,#e8d4b4_0%,#b6884c_35%,transparent_70%)] opacity-25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-48 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,#7f5a34_0%,transparent_70%)] opacity-30 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icone.svg" alt="" className="mx-auto h-12 w-12" />
          <div className="mt-4 font-display text-3xl font-semibold tracking-[0.3em] text-white">MOONSHOT</div>
          <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.4em] text-ouro">System</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/40">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Acesso restrito à equipe Moonshot.</p>
      </div>
    </div>
  )
}
