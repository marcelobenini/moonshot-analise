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
  return (
    <div className="painel flex items-start gap-4 p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TOM[tom]}`}>{icone}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
        <div className={`mt-0.5 font-mono text-3xl font-medium ${alerta ? 'text-red-700' : 'text-noite'}`}>{valor}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

export function Cartao({ titulo, icone, link, acoes, children, className = '' }: {
  titulo: string; icone?: ReactNode; link?: string; acoes?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`painel p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-noite"><span className="text-ouro">{icone}</span>{titulo}</h2>
        <div className="flex items-center gap-2">
          {acoes}
          {link && <Link to={link} className="flex items-center gap-1 text-xs text-indigo-700 hover:underline">ver <ArrowRight size={12} /></Link>}
        </div>
      </div>
      {children}
    </section>
  )
}
