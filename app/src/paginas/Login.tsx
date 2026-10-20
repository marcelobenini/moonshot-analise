import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, configurado } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { Campo, Erro } from '../componentes/ui'
import { mensagemErro } from '../lib/util'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'link'>('entrar')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null); setAviso(null); setEnviando(true)
    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemErro(error))
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/senha` })
      if (error) setErro(mensagemErro(error))
      else setAviso('Se o e-mail estiver cadastrado, chega um link em instantes para você criar a senha.')
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
          <input className="entrada" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        {modo === 'entrar' && (
          <Campo rotulo="Senha">
            <input className="entrada" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
        )}
        <Erro msg={erro} />
        {aviso && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div>}
        <button className="btn-primario w-full" disabled={enviando}>
          {modo === 'entrar' ? 'Entrar' : 'Enviar link'}
        </button>
        <button type="button" className="w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => { setModo(modo === 'entrar' ? 'link' : 'entrar'); setErro(null); setAviso(null) }}>
          {modo === 'entrar' ? 'Primeiro acesso ou esqueceu a senha?' : 'Voltar para o login'}
        </button>
      </form>
    </Tela>
  )
}

export function DefinirSenha() {
  const nav = useNavigate()
  const { sessao } = useSessao()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 8) { setErro('Use pelo menos 8 caracteres.'); return }
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) setErro(mensagemErro(error))
    else nav('/')
  }

  if (!sessao) return <Tela><p className="text-sm text-slate-600">O link expirou. Volte ao login e peça outro.</p></Tela>
  return (
    <Tela>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-slate-600">Crie sua senha de acesso para <b>{sessao.user.email}</b>.</p>
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
          <input className="entrada" type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Erro msg={erro} />
        <button className="btn-primario w-full">Salvar senha</button>
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="painel w-full max-w-sm p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <img src="/icone.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="font-semibold">Moonshot System</div>
            <div className="text-xs text-slate-500">Sistema de acompanhamento</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
