import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './index.css'
import { ProvedorSessao, useSessao } from './lib/sessao'
import { supabase } from './lib/supabase'
import { Layout } from './componentes/Layout'
import { Carregando } from './componentes/ui'
import { Login, DefinirSenha, Aguardando } from './paginas/Login'
import { Inicio } from './paginas/Inicio'
import { Funis } from './paginas/Funis'
import { Alunas } from './paginas/Alunas'
import { AlunaFicha } from './paginas/AlunaFicha'
import { Demandas } from './paginas/Demandas'
import { DemandaDetalhe } from './paginas/DemandaDetalhe'
import { Notificacoes } from './paginas/Notificacoes'
import { Equipe } from './paginas/Equipe'

function Rotas() {
  const { carregando, sessao, eu } = useSessao()
  const nav = useNavigate()

  // Link de convite ou de "esqueci a senha" entra logado; leva direto a criar senha.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') nav('/senha')
    })
    return () => data.subscription.unsubscribe()
  }, [nav])

  if (carregando) return <Carregando />
  if (!sessao) {
    return (
      <Routes>
        <Route path="/senha" element={<DefinirSenha />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  // Senha provisoria: o banco ja nao entrega dado nenhum ate a troca; a tela
  // so deixa fazer isso.
  if (eu?.trocar_senha) return <DefinirSenha obrigatoria />
  if (!eu?.ativo || !eu.papel) {
    return (
      <Routes>
        <Route path="/senha" element={<DefinirSenha />} />
        <Route path="*" element={<Aguardando />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route path="/senha" element={<DefinirSenha />} />
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="funis" element={<Funis />} />
        <Route path="funis/:funilId" element={<Funis />} />
        <Route path="alunas" element={<Alunas />} />
        <Route path="alunas/:id" element={<AlunaFicha />} />
        <Route path="demandas" element={<Demandas />} />
        <Route path="demandas/:id" element={<DemandaDetalhe />} />
        <Route path="notificacoes" element={<Notificacoes />} />
        {eu.papel === 'coordenador' && <Route path="equipe" element={<Equipe />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorSessao>
        <Rotas />
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
