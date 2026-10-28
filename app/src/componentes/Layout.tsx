import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, KanbanSquare, Users, MessageSquare, UserCog, LogOut, MoreHorizontal, X, CalendarDays, FileUp, FileSignature, LineChart, ClipboardList, ListChecks } from 'lucide-react'
import { useSessao } from '../lib/sessao'
import { PAPEL } from '../lib/util'
import { Sino } from './Sino'

export function Layout() {
  const { eu, sair } = useSessao()
  const [menu, setMenu] = useState(false)
  const itens = eu?.papel === 'gestao' ? [
    { para: '/', rotulo: 'Início', icone: Home },
    { para: '/alunas', rotulo: 'Alunas', icone: Users },
    { para: '/gerencial', rotulo: 'Gerencial', icone: LineChart },
  ] : [
    { para: '/', rotulo: 'Início', icone: Home },
    // Consultor trabalha pelo roteiro de cada programa; o funil fica a um toque, dentro dele.
    eu?.papel === 'consultor' ? { para: '/acompanhamento', rotulo: 'Acompanhamento', icone: ListChecks } : { para: '/funis', rotulo: 'Funis', icone: KanbanSquare },
    { para: '/alunas', rotulo: 'Alunas', icone: Users },
    { para: '/demandas', rotulo: 'Demandas', icone: MessageSquare },
    { para: '/eventos', rotulo: 'Eventos', icone: CalendarDays },
    ...(eu?.papel === 'coordenador' ? [{ para: '/acompanhamento', rotulo: 'Acompanhamento', icone: ListChecks }] : []),
    ...(eu?.papel === 'coordenador' || eu?.papel === 'cs' ? [{ para: '/entrada', rotulo: 'Entrada', icone: ClipboardList }] : []),
    ...(eu?.papel === 'coordenador' ? [{ para: '/gerencial', rotulo: 'Gerencial', icone: LineChart }]
      : eu?.papel && ['consultor', 'cs', 'comercial'].includes(eu.papel) ? [{ para: '/fechamentos', rotulo: 'Fechamentos', icone: FileSignature }] : []),
    ...(eu?.papel === 'coordenador' ? [
      { para: '/equipe', rotulo: 'Equipe', icone: UserCog },
      { para: '/importar', rotulo: 'Importar planilha', icone: FileUp },
    ] : []),
  ]

  // Celular: as quatro primeiras ficam na barra de baixo; o resto e o Sair vao em "Mais".
  const ordemCelular = ['/', '/funis', '/acompanhamento', '/alunas', '/gerencial', '/entrada', '/fechamentos', '/demandas']
  const principais = [...itens].sort((a, b) => ordemCelular.indexOf(a.para) - ordemCelular.indexOf(b.para))
    .filter((i) => ordemCelular.includes(i.para)).slice(0, 4)
  const extras = itens.filter((i) => !principais.includes(i))

  const nav = (
    <nav className="flex flex-col gap-1">
      {itens.map(({ para, rotulo, icone: I }) => (
        <NavLink key={para} to={para} end={para === '/'}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 font-medium text-indigo-200' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
          {({ isActive }) => <><I size={18} className={isActive ? 'text-ouro' : ''} /> {rotulo}</>}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-noite p-3 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Marca />
          {nav}
        </div>
        <div className="border-t border-white/10 pt-3">
          <div className="px-3 text-sm font-medium text-white">{eu?.nome}</div>
          <div className="px-3 text-xs uppercase tracking-wider text-ouro">{eu?.papel ? PAPEL[eu.papel] : ''}</div>
          <button className="btn mt-2 w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white" onClick={sair}><LogOut size={16} /> Sair</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-nude/85 px-4 py-2 backdrop-blur [padding-top:max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 lg:invisible">
            <img src="/icone.svg" alt="" className="h-7 w-7 lg:hidden" />
            <span className="font-display text-lg font-semibold tracking-[0.2em] lg:hidden">MOONSHOT</span>
          </div>
          <div className="flex items-center gap-2">
            <Sino />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-noite text-xs font-semibold text-ouro lg:hidden" title={eu?.nome}>
              {(eu?.nome ?? '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6"><Outlet /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden [padding-bottom:env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {principais.map(({ para, rotulo, icone: I }) => (
            <NavLink key={para} to={para} end={para === '/'} onClick={() => setMenu(false)}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'font-semibold text-noite' : 'text-slate-400'}`}>
              {({ isActive }) => <><I size={22} strokeWidth={isActive ? 2.4 : 1.8} /> {rotulo}</>}
            </NavLink>
          ))}
          <button onClick={() => setMenu(!menu)} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${menu ? 'font-semibold text-noite' : 'text-slate-400'}`}>
            <MoreHorizontal size={22} /> Mais
          </button>
        </div>
      </nav>

      {menu && (
        <div className="fixed inset-0 z-20 bg-slate-950/40 lg:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-24 shadow-2xl [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <div className="font-medium text-noite">{eu?.nome}</div>
                <div className="text-xs uppercase tracking-wider text-ouro">{eu?.papel ? PAPEL[eu.papel] : ''}</div>
              </div>
              <button className="btn-fantasma p-1.5" onClick={() => setMenu(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {extras.map(({ para, rotulo, icone: I }) => (
                <NavLink key={para} to={para} onClick={() => setMenu(false)}
                  className={({ isActive }) => `flex flex-col items-center gap-2 rounded-2xl p-3 text-center text-xs ${isActive ? 'bg-noite text-white' : 'bg-nude text-noite'}`}>
                  <I size={22} /> {rotulo}
                </NavLink>
              ))}
              <button onClick={sair} className="flex flex-col items-center gap-2 rounded-2xl bg-nude p-3 text-xs text-red-700"><LogOut size={22} /> Sair</button>
            </div>
          </div>
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
