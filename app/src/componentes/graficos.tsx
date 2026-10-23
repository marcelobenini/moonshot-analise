import { useEffect, useRef, useState, type ReactNode } from 'react'

// Graficos do painel em SVG puro: leves, sem biblioteca e dentro da CSP.
// Regras fixas: barras finas com ponta arredondada, linha de 2px, grade
// recessiva, um eixo so, texto em tinta de texto (nunca na cor da serie),
// legenda quando ha mais de uma serie, e tooltip ao passar o mouse.

const TINTA = { primaria: '#1d1916', secundaria: '#645950', fraca: '#a99b8f', grade: '#efe9e3', base: '#d3c8bd' }

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const o = new ResizeObserver(([e]) => setW(e.contentRect.width))
    o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return [ref, w] as const
}

function arredondar(max: number) {
  if (max <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  const n = max / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

export function compacto(v: number) {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',')}k`
  return String(v)
}

function Dica({ x, y, largura, children }: { x: number; y: number; largura: number; children: ReactNode }) {
  const esquerda = x > largura - 150
  return (
    <div className="pointer-events-none absolute z-10 min-w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ top: Math.max(0, y - 8), left: esquerda ? undefined : x + 12, right: esquerda ? largura - x + 12 : undefined }}>
      {children}
    </div>
  )
}

export function Legenda({ itens }: { itens: { nome: string; cor: string; valor?: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {itens.map((i) => (
        <li key={i.nome} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.cor }} />
          {i.nome}{i.valor != null && <span className="font-medium text-slate-800">{i.valor}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Rosca: partes de um todo, com o total no centro. */
export function Rosca({ fatias, centro, rotuloCentro }: {
  fatias: { nome: string; valor: number; cor: string }[]; centro: ReactNode; rotuloCentro: string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const r = 70, esp = 18, c = 2 * Math.PI * r
  // 2px de folga entre fatias, em comprimento de arco.
  const folga = fatias.filter((f) => f.valor > 0).length > 1 ? 2 : 0
  let acumulado = 0
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={rotuloCentro}>
          <circle cx="90" cy="90" r={r} fill="none" stroke={TINTA.grade} strokeWidth={esp} />
          {total > 0 && fatias.map((f, i) => {
            const comp = (f.valor / total) * c
            const el = f.valor > 0 && (
              <circle key={f.nome} cx="90" cy="90" r={r} fill="none" stroke={f.cor}
                strokeWidth={ativo === i ? esp + 4 : esp}
                strokeDasharray={`${Math.max(0, comp - folga)} ${c}`} strokeDashoffset={-acumulado}
                onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}
                className="cursor-pointer transition-[stroke-width]" />
            )
            acumulado += comp
            return el
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {ativo != null ? (
            <>
              <div className="font-mono text-2xl font-medium text-slate-900">{fatias[ativo].valor}</div>
              <div className="max-w-24 text-[11px] leading-tight text-slate-500">{fatias[ativo].nome} · {total ? Math.round((fatias[ativo].valor / total) * 100) : 0}%</div>
            </>
          ) : (
            <>
              <div className="font-mono text-2xl font-medium text-slate-900">{centro}</div>
              <div className="text-[11px] text-slate-500">{rotuloCentro}</div>
            </>
          )}
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {fatias.map((f, i) => (
          <li key={f.nome} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}
            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${ativo === i ? 'bg-slate-50' : ''}`}>
            <span className="flex min-w-0 items-center gap-2 text-xs text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} /><span className="truncate">{f.nome}</span></span>
            <span className="font-mono text-xs text-slate-800">{f.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Rotulos do eixo x sem encavalar: um a cada ~70px, sempre o ultimo, e nao o
// vizinho do ultimo.
function mostrarRotulo(i: number, n: number, larg: number) {
  const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(larg / 70))))
  if (i === n - 1) return true
  return i % passo === 0 && n - 1 - i >= passo
}

/** Linhas com area leve: evolucao no tempo, uma ou mais series, mesmo eixo. */
export function Linhas({ pontos, series, altura = 220 }: {
  pontos: { rotulo: string; valores: number[] }[]; series: { nome: string; cor: string }[]; altura?: number
}) {
  const [ref, w] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = useState<number | null>(null)
  const esq = 32, dir = 12, topo = 12, baixo = 26
  const larg = Math.max(0, w - esq - dir), alt = altura - topo - baixo
  const max = arredondar(Math.max(1, ...pontos.flatMap((p) => p.valores)))
  const x = (i: number) => esq + (pontos.length <= 1 ? larg / 2 : (i / (pontos.length - 1)) * larg)
  const y = (v: number) => topo + alt - (v / max) * alt
  const ticks = [0, max / 2, max]
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setAtivo(null)}>
      {w > 0 && (
        <svg width={w} height={altura} role="img" aria-label={series.map((s) => s.nome).join(' e ')}
          onMouseMove={(e) => {
            const bx = e.currentTarget.getBoundingClientRect().left
            const i = Math.round(((e.clientX - bx - esq) / Math.max(1, larg)) * (pontos.length - 1))
            setAtivo(Math.max(0, Math.min(pontos.length - 1, i)))
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={esq} x2={w - dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? TINTA.base : TINTA.grade} />
              <text x={esq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={TINTA.fraca}>{compacto(t)}</text>
            </g>
          ))}
          {pontos.map((p, i) => mostrarRotulo(i, pontos.length, larg) && (
            <text key={i} x={x(i)} y={altura - 6} textAnchor={i === pontos.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="10" fill={TINTA.fraca}>{p.rotulo}</text>
          ))}
          {series.map((s, si) => {
            const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valores[si])}`).join(' ')
            return (
              <g key={s.nome}>
                <path d={`${linha} L${x(pontos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.cor} opacity="0.1" />
                <path d={linha} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            )
          })}
          {ativo != null && (
            <g>
              <line x1={x(ativo)} x2={x(ativo)} y1={topo} y2={topo + alt} stroke={TINTA.base} />
              {series.map((s, si) => (
                <circle key={s.nome} cx={x(ativo)} cy={y(pontos[ativo].valores[si])} r="4.5" fill={s.cor} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
      )}
      {ativo != null && (
        <Dica x={x(ativo)} y={topo} largura={w}>
          <div className="mb-1 font-medium text-slate-800">{pontos[ativo].rotulo}</div>
          {series.map((s, si) => (
            <div key={s.nome} className="flex items-center justify-between gap-4 text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>
              <span className="font-mono text-slate-900">{pontos[ativo].valores[si]}</span>
            </div>
          ))}
        </Dica>
      )}
    </div>
  )
}

/** Colunas: uma serie ao longo de categorias (meses). Rotula so o maior; o resto no tooltip. */
export function Colunas({ dados, cor, altura = 200, formatar = String }: {
  dados: { rotulo: string; valor: number; detalhe?: string }[]; cor: string; altura?: number; formatar?: (v: number) => string
}) {
  const [ref, w] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = useState<number | null>(null)
  const esq = 28, topo = 18, baixo = 24
  const larg = Math.max(0, w - esq), alt = altura - topo - baixo
  const max = arredondar(Math.max(1, ...dados.map((d) => d.valor)))
  const banda = dados.length ? larg / dados.length : 0
  const grossura = Math.min(24, banda * 0.6)
  const iMaior = dados.reduce((m, d, i) => (d.valor > (dados[m]?.valor ?? -1) ? i : m), 0)
  const y = (v: number) => topo + alt - (v / max) * alt
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setAtivo(null)}>
      {w > 0 && (
        <svg width={w} height={altura} role="img" aria-label="Colunas">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={esq} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? TINTA.base : TINTA.grade} />
              <text x={esq - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={TINTA.fraca}>{compacto(t)}</text>
            </g>
          ))}
          {dados.map((d, i) => {
            const cx = esq + banda * i + banda / 2
            const h = (d.valor / max) * alt
            const r = Math.min(4, h / 2, grossura / 2)
            const x0 = cx - grossura / 2, yb = topo + alt
            return (
              <g key={d.rotulo} onMouseEnter={() => setAtivo(i)}>
                <rect x={esq + banda * i} y={topo} width={banda} height={alt} fill="transparent" />
                {h > 0 && (
                  <path d={`M${x0},${yb} V${yb - h + r} Q${x0},${yb - h} ${x0 + r},${yb - h} H${x0 + grossura - r} Q${x0 + grossura},${yb - h} ${x0 + grossura},${yb - h + r} V${yb} Z`}
                    fill={cor} opacity={ativo == null || ativo === i ? 1 : 0.45} />
                )}
                {i === iMaior && d.valor > 0 && (
                  <text x={cx} y={yb - h - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill={TINTA.secundaria}>{formatar(d.valor)}</text>
                )}
                <text x={cx} y={altura - 6} textAnchor="middle" fontSize="10" fill={TINTA.fraca}>{d.rotulo}</text>
              </g>
            )
          })}
        </svg>
      )}
      {ativo != null && dados[ativo] && (
        <Dica x={esq + banda * ativo + banda / 2} y={topo} largura={w}>
          <div className="font-medium text-slate-800">{dados[ativo].rotulo}</div>
          <div className="font-mono text-slate-900">{formatar(dados[ativo].valor)}</div>
          {dados[ativo].detalhe && <div className="text-slate-500">{dados[ativo].detalhe}</div>}
        </Dica>
      )}
    </div>
  )
}

/** Barras deitadas: etapas de funil, carteiras. Valor na ponta. */
export function BarrasH({ dados, cor, formatar = String }: {
  dados: { rotulo: string; valor: number; alerta?: number }[]; cor: string; formatar?: (v: number) => string
}) {
  const max = Math.max(1, ...dados.map((d) => d.valor))
  return (
    <ul className="space-y-3">
      {dados.map((d) => (
        <li key={d.rotulo} title={`${d.rotulo}: ${formatar(d.valor)}${d.alerta ? ` · ${d.alerta} parado(s)` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-slate-600">{d.rotulo}</span>
            <span className="flex shrink-0 items-center gap-2">
              {!!d.alerta && <span className="font-medium text-red-600">{d.alerta} parado{d.alerta > 1 ? 's' : ''}</span>}
              <span className="font-mono font-medium text-slate-800">{formatar(d.valor)}</span>
            </span>
          </div>
          <div className="h-2.5 rounded-r-full bg-slate-100">
            <div className="h-full rounded-r-full" style={{ width: `${(d.valor / max) * 100}%`, background: cor, minWidth: d.valor ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
