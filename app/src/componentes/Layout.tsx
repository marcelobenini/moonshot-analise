import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, KanbanSquare, Users, MessageSquare, UserCog, LogOut, Menu, X, CalendarDays, FileUp, FileSignature, LineChart } from 'lucide-react'
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
    { para: '/eventos', rotulo: 'Eventos', icone: CalendarDays },
    ...(eu?.papel === 'coordenador' ? [{ para: '/gerencial', rotulo: 'Gerencial', icone: LineChart }]
      : eu?.papel && ['consultor', 'cs', 'comercial'].includes(eu.papel) ? [{ para: '/fechamentos', rotulo: 'Fechamentos', icone: FileSignature }] : []),
    ...(eu?.papel === 'coordenador' ? [
      { para: '/equipe', rotulo: 'Equipe', icone: UserCog },
      { para: '/importar', rotulo: 'Importar planilha', icone: FileUp },
    ] : []),
  ]

  const nav = (
    <nav className="flex flex-col gap-1">
      {itens.map(({ para, rotulo, icone: I }) => (
        <NavLink key={para} to={para} end={para === '/'} onClick={() => setMenu(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 font-medium text-indigo-200' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
          {({ isActive }) => <><I size={18} className={isActive ? 'text-ouro' : ''} /> {rotulo}</>}
        </NavLink>
      ))}
    </nav>
  )

  const rodape = (
    <div className="border-t border-white/10 pt-3">
      <div className="px-3 text-sm font-medium text-white">{eu?.nome}</div>
      <div className="px-3 text-xs uppercase tracking-wider text-ouro">{eu?.papel ? PAPEL[eu.papel] : ''}</div>
      <button className="btn mt-2 w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white" onClick={sair}><LogOut size={16} /> Sair</button>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-noite p-3 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Marca />
          {nav}
        </div>
        {rodape}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-nude/85 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 lg:invisible">
            <button className="btn-fantasma p-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={20} /></button>
            <span className="font-display text-lg font-semibold tracking-[0.2em] lg:hidden">MOONSHOT</span>
          </div>
          <Sino />
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6"><Outlet /></main>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden" onClick={() => setMenu(false)}>
          <aside className="flex h-full w-64 flex-col justify-between bg-noite p-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="flex items-center justify-between"><Marca /><button className="btn p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setMenu(false)}><X size={18} /></button></div>
              {nav}
            </div>
            {rodape}
          </aside>
        </div>
      )}
    </div>
  )
}

export function Marca({ clara = true }: { clara?: boolean }) {
  return (
    <div className="mb-6 flex items-center gap-3 px-3 py-3">
      <img src="/icone.svg" alt="" className="h-9 w-9" />
      <div className="leading-none">
        <div className={`font-display text-xl font-semibold tracking-[0.22em] ${clara ? 'text-white' : 'text-noite'}`}>MOONSHOT</div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.3em] text-ouro">System</div>
      </div>
    </div>
  )
}
