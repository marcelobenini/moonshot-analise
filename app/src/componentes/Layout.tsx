import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, KanbanSquare, Users, MessageSquare, UserCog, LogOut, Menu, X } from 'lucide-react'
import { useSessao } from '../lib/sessao'
import { PAPEL } from '../lib/util'
import { Sino } from './Sino'

export function Layout() {
  const { eu, sair } = useSessao()
  const [menu, setMenu] = useState(false)
  const itens = [
    { para: '/', rotulo: 'Início', icone: Home },
    { para: '/funis', rotulo: 'Funis', icone: KanbanSquare },
    { para: '/alunas', rotulo: 'Alunas', icone: Users },
    { para: '/demandas', rotulo: 'Demandas', icone: MessageSquare },
    ...(eu?.papel === 'coordenador' ? [{ para: '/equipe', rotulo: 'Equipe', icone: UserCog }] : []),
  ]

  const nav = (
    <nav className="flex flex-col gap-1">
      {itens.map(({ para, rotulo, icone: I }) => (
        <NavLink key={para} to={para} end={para === '/'} onClick={() => setMenu(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
          <I size={18} /> {rotulo}
        </NavLink>
      ))}
    </nav>
  )

  const rodape = (
    <div className="border-t border-slate-200 pt-3">
      <div className="px-3 text-sm font-medium">{eu?.nome}</div>
      <div className="px-3 text-xs text-slate-500">{eu?.papel ? PAPEL[eu.papel] : ''}</div>
      <button className="btn-fantasma mt-2 w-full justify-start" onClick={sair}><LogOut size={16} /> Sair</button>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-3 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Marca />
          {nav}
        </div>
        {rodape}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 lg:invisible">
            <button className="btn-fantasma p-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={20} /></button>
            <span className="font-semibold lg:hidden">Moonshot System</span>
          </div>
          <Sino />
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6"><Outlet /></main>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setMenu(false)}>
          <aside className="flex h-full w-64 flex-col justify-between bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="flex items-center justify-between"><Marca /><button className="btn-fantasma p-1.5" onClick={() => setMenu(false)}><X size={18} /></button></div>
              {nav}
            </div>
            {rodape}
          </aside>
        </div>
      )}
    </div>
  )
}

function Marca() {
  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2">
      <img src="/icone.svg" alt="" className="h-7 w-7" />
      <span className="font-semibold">Moonshot System</span>
    </div>
  )
}
