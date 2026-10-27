import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Pecas dos paineis (Inicio e Gerencial): numero em destaque e cartao com titulo.
export const TOM = {
  ouro: 'bg-indigo-100 text-indigo-700', noite: 'bg-noite text-indigo-200',
  vermelho: 'bg-red-100 text-red-700', ambar: 'bg-amber-100 text-amber-700',
}

export function Indicador({ rotulo, valor, sub, icone, tom, alerta }: {
  rotulo: string; valor: string; sub: string; icone: ReactNode; tom: keyof typeof TOM; alerta?: boolean
}) {
  // Celular: icone em cima e numero grande, dois por linha. Desktop: icone ao lado.
  return (
    <div className="painel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${TOM[tom]}`}>{icone}</span>
      <div className="flex min-w-0 flex-col">
        <div className={`font-mono text-2xl font-medium leading-tight sm:order-2 sm:mt-0.5 sm:text-3xl ${alerta ? 'text-red-700' : 'text-noite'}`}>{valor}</div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:order-1 sm:text-xs">{rotulo}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:order-3 sm:truncate">{sub}</div>
      </div>
    </div>
  )
}

/** Escolha entre poucas opcoes, como abas em pilula (rola de lado no celular). */
export function Segmento<T extends string>({ opcoes, valor, mudar }: {
  opcoes: { id: T; rotulo: string; icone?: ReactNode }[]; valor: T; mudar: (v: T) => void
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
        {opcoes.map((o) => (
          <button key={o.id} onClick={() => mudar(o.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${valor === o.id ? 'bg-noite text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            {o.icone} {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Cartao({ titulo, icone, link, acoes, children, className = '' }: {
  titulo: string; icone?: ReactNode; link?: string; acoes?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`painel p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-noite sm:text-xl"><span className="text-ouro">{icone}</span>{titulo}</h2>
        <div className="flex items-center gap-2">
          {acoes}
          {link && <Link to={link} className="flex items-center gap-1 text-xs text-indigo-700 hover:underline">ver <ArrowRight size={12} /></Link>}
        </div>
      </div>
      {children}
    </section>
  )
}
