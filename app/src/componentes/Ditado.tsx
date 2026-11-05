import { useEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { Mic, Square } from 'lucide-react'

// Ditado por voz com o reconhecimento de fala do próprio navegador (Chrome,
// Edge, Safari e celulares). Sem custo e sem chave de API. No Firefox o botão
// não aparece. O áudio é processado pelo serviço de voz do navegador; nada
// fica gravado.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reconhecedor = any

function criarReconhecedor(): Reconhecedor | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!SR) return null
  const r = new SR()
  r.lang = 'pt-BR'
  r.continuous = true
  r.interimResults = true
  return r
}

export const temDitado = () => typeof window !== 'undefined' && !!((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition)

const ERROS: Record<string, string> = {
  'not-allowed': 'Libere o microfone para este site nas permissões do navegador.',
  'service-not-allowed': 'Libere o microfone para este site nas permissões do navegador.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'Sem conexão com o serviço de voz do navegador.',
}

/** Liga e desliga o ditado. `escrever` recebe o texto completo (o que já havia + o que foi falado). */
export function useDitado(valor: string, escrever: (v: string) => void) {
  const [ouvindo, setOuvindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const rec = useRef<Reconhecedor | null>(null)
  const atual = useRef({ valor, escrever })
  atual.current = { valor, escrever }

  useEffect(() => () => { rec.current?.abort?.() }, [])

  function alternar() {
    if (ouvindo) { rec.current?.stop(); return }
    const r = criarReconhecedor()
    if (!r) return
    setErro(null)
    const v = atual.current.valor
    const base = v && !/\s$/.test(v) ? `${v} ` : v
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let texto = ''
      for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript
      texto = texto.replace(/\s+/g, ' ').trimStart()
      if (!base.trim() || /[.!?]\s*$/.test(base)) texto = texto.charAt(0).toUpperCase() + texto.slice(1)
      atual.current.escrever(base + texto)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') setErro(ERROS[e.error] ?? 'O ditado parou. Tente de novo.') }
    r.onend = () => { setOuvindo(false); rec.current = null }
    rec.current = r
    try { r.start(); setOuvindo(true) } catch { setErro('Não consegui ligar o microfone.') }
  }

  return { ouvindo, erro, alternar, disponivel: temDitado() }
}

export function BotaoDitado({ ouvindo, alternar, className = '' }: { ouvindo: boolean; alternar: () => void; className?: string }) {
  return (
    <button type="button" onClick={alternar} title={ouvindo ? 'Parar ditado' : 'Ditar por voz'} aria-label={ouvindo ? 'Parar ditado' : 'Ditar por voz'}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${ouvindo ? 'animate-pulse bg-red-500 text-white shadow' : 'bg-white/90 text-slate-500 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600'} ${className}`}>
      {ouvindo ? <Square size={12} fill="currentColor" /> : <Mic size={15} />}
    </button>
  )
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (e: { target: { value: string } }) => void
}

/** Textarea com botão de microfone: fala e o texto entra no campo. */
export function TextoLongo({ value, onChange, className = '', ...resto }: Props) {
  const { ouvindo, erro, alternar, disponivel } = useDitado(value, (v) => onChange({ target: { value: v } }))
  return (
    <div className="relative w-full min-w-0 flex-1">
      <textarea {...resto} value={value} onChange={(e) => onChange(e)}
        className={`${className} ${disponivel ? 'pr-11' : ''} ${ouvindo ? 'ring-2 ring-red-300' : ''}`} />
      {disponivel && <BotaoDitado ouvindo={ouvindo} alternar={alternar} className="absolute bottom-2 right-2" />}
      {ouvindo && <div className="mt-1 text-[11px] text-red-600">Ouvindo… fale normalmente e toque no quadrado para parar.</div>}
      {erro && <div className="mt-1 text-[11px] text-red-600">{erro}</div>}
    </div>
  )
}
