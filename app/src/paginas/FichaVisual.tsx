import { useEffect, useState, type ReactNode } from 'react'
import { Check, Gift, Heart, MapPin, MessageCircleHeart, Shirt, Sparkles, Store, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { AgendaConsultoria, Aluna, NotaAluna, RegistroConsultoria } from '../lib/tipos'
import { FINANCEIRO, SAUDE, STATUS_CONTRATO, data, diasDesde, hoje, reais } from '../lib/util'
import { Potencial } from '../componentes/ui'
import { Linhas } from '../componentes/graficos'

// A ficha e de uma pessoa, nao de um registro: tons de pele e rose, retrato,
// a jornada dela desenhada, e frases no lugar de codigos.

function iniciais(nome: string) {
  return nome.replace(/\(.*?\)/g, '').split(/\s+/).filter((p) => p && !/^(da|de|do|dos|das|e)$/i.test(p))
    .map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function primeiroNome(nome: string) {
  return nome.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? nome
}

export function Retrato({ nome, tamanho = 'g' }: { nome: string; tamanho?: 'g' | 'p' }) {
  const g = tamanho === 'g'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-200 via-[#f3dcc8] to-indigo-300 font-display font-semibold text-noite ring-4 ring-white shadow-[0_8px_24px_-8px_rgba(182,136,76,0.55)]
      ${g ? 'h-24 w-24 text-4xl' : 'h-8 w-8 text-sm ring-2 shadow-none'}`}>
      {iniciais(nome) || '·'}
    </span>
  )
}

function tempoDeCasa(inicio: string | null) {
  if (!inicio) return null
  const meses = Math.floor(diasDesde(inicio) / 30.4)
  if (meses < 1) return 'chegou este mês'
  if (meses < 12) return `com a gente há ${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `com a gente há ${anos} ${anos === 1 ? 'ano' : 'anos'}${meses % 12 ? ` e ${meses % 12} ${meses % 12 === 1 ? 'mês' : 'meses'}` : ''}`
}

export function CabecalhoAluna({ aluna, acoes }: { aluna: Aluna; acoes: ReactNode }) {
  const { nomeDe } = useSessao()
  const st = STATUS_CONTRATO[aluna.status_contrato]
  const fin = aluna.status_financeiro ? FINANCEIRO[aluna.status_financeiro] : null
  const casa = tempoDeCasa(aluna.inicio)
  const equipe = [
    aluna.consultor_id ? { nome: nomeDe(aluna.consultor_id), papel: 'consultor' } : aluna.consultor_planilha ? { nome: aluna.consultor_planilha, papel: 'consultor' } : null,
    aluna.cs_id ? { nome: nomeDe(aluna.cs_id), papel: 'CS' } : aluna.cs_planilha ? { nome: aluna.cs_planilha, papel: 'CS' } : null,
  ].filter(Boolean) as { nome: string; papel: string }[]
  return (
    <section className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-[#fff7f3] via-white to-[#fbf3ea] p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,#f6d7d0_0%,transparent_70%)] opacity-70" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,#f1e0c4_0%,transparent_70%)] opacity-60" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <Retrato nome={aluna.nome} />
          <div className="min-w-0">
            {casa && <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-indigo-600">{casa}</div>}
            <h1 className="mt-1 text-4xl font-semibold leading-tight text-noite">{aluna.nome}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              {aluna.empresa && <span className="flex items-center gap-1.5"><Store size={14} className="text-rose-400" />{aluna.empresa}</span>}
              {(aluna.cidade || aluna.uf) && <span className="flex items-center gap-1.5"><MapPin size={14} className="text-rose-400" />{[aluna.cidade, aluna.uf].filter(Boolean).join(' / ')}</span>}
              {aluna.produto && <span className="flex items-center gap-1.5"><Sparkles size={14} className="text-indigo-500" />{aluna.produto}{aluna.turma ? ` · ${aluna.turma}` : ''}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`selo ${st?.cor ?? 'bg-slate-100'}`}>{st?.rotulo ?? aluna.status_contrato}</span>
              {fin && aluna.status_financeiro !== 'adimplente' && <span className={`selo ${fin.cor}`}>{fin.rotulo}</span>}
              {aluna.saude && <span className={`selo ${SAUDE[aluna.saude].cor}`}>{SAUDE[aluna.saude].rotulo}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <div className="flex items-center gap-5">
            {equipe.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Acompanhada por</div>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {equipe.map((p) => (
                    <span key={p.papel} className="flex items-center gap-2 text-sm text-slate-700">
                      <Retrato nome={p.nome} tamanho="p" />
                      <span className="leading-tight">{primeiroNome(p.nome)}<span className="block text-[11px] text-slate-500">{p.papel}</span></span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {aluna.potencial_detalhe && (
              <div className="rounded-2xl bg-white/80 px-4 py-2.5 text-center shadow-sm ring-1 ring-rose-100">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Potencial</div>
                <Potencial pontos={aluna.potencial_detalhe.pontos} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="relative mt-6 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [&>*]:shrink-0">{acoes}</div>
    </section>
  )
}

const MARCOS = [0, 1, 2, 3, 4, 5]

/** A jornada dela: entrada e as cinco consultorias, mais o tempo de contrato. */
export function Jornada({ aluna, registros }: { aluna: Aluna; registros: RegistroConsultoria[] }) {
  const [agenda, setAgenda] = useState<AgendaConsultoria[]>([])
  useEffect(() => {
    supabase.from('consultoria_agenda').select('*').eq('aluna_id', aluna.id).then(({ data: d }) => setAgenda((d ?? []) as AgendaConsultoria[]))
  }, [aluna.id])
  const feita = (n: number) => registros.find((r) => r.realizada && r.numero === n)?.data ?? agenda.find((g) => g.numero === n)?.realizada_em ?? null
  const prevista = (n: number) => agenda.find((g) => g.numero === n)?.data_prevista ?? null
  const proxima = MARCOS.find((n) => !feita(n))
  const feitas = MARCOS.filter((n) => feita(n)).length
  const h = hoje()

  const ini = aluna.inicio, fim = aluna.termino
  const total = ini && fim ? Math.max(1, (new Date(fim).getTime() - new Date(ini).getTime()) / 86400000) : 0
  const passou = ini ? Math.max(0, diasDesde(ini)) : 0
  const pct = total ? Math.min(100, (passou / total) * 100) : 0
  const faltam = fim ? -diasDesde(fim) : null

  return (
    <section className="painel p-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold text-noite">A jornada de {primeiroNome(aluna.nome)}</h2>
        <span className="text-sm text-slate-500">{feitas} de 6 encontros</span>
      </div>
      <ol className="relative grid grid-cols-6 gap-1">
        <div className="absolute left-[8.33%] right-[8.33%] top-4 h-[2px] bg-rose-100" />
        <div className="absolute left-[8.33%] top-4 h-[2px] bg-gradient-to-r from-rose-300 to-indigo-400 transition-all"
          style={{ width: `${(Math.max(0, feitas - 1) / 5) * 83.33}%` }} />
        {MARCOS.map((n) => {
          const f = feita(n), p = prevista(n)
          const atual = n === proxima
          const atrasada = !f && p && p < h
          return (
            <li key={n} className="relative flex flex-col items-center text-center">
              <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold
                ${f ? 'bg-gradient-to-br from-rose-300 to-indigo-400 text-white shadow-sm' : atual ? 'bg-white text-indigo-700 ring-2 ring-indigo-400' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                {f ? <Check size={15} strokeWidth={3} /> : n === 0 ? '✦' : n}
              </span>
              <span className={`mt-2 text-xs font-medium ${f || atual ? 'text-slate-800' : 'text-slate-500'}`}>{n === 0 ? 'Entrada' : `${n}ª`}</span>
              <span className={`text-[11px] ${atrasada ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                {f ? data(f).slice(0, 5) : p ? `${atrasada ? 'atrasada · ' : ''}${data(p).slice(0, 5)}` : atual ? 'próxima' : ''}
              </span>
            </li>
          )
        })}
      </ol>
      {total > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex justify-between text-xs text-slate-500">
            <span>Início {data(ini)}</span>
            <span className={faltam != null && faltam <= 120 && faltam >= 0 ? 'font-medium text-amber-700' : ''}>
              {faltam == null ? '' : faltam < 0 ? 'Contrato vencido' : `Faltam ${faltam} dias · término ${data(fim)}`}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-rose-50">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-200 via-[#ecd2b4] to-indigo-400" style={{ width: `${pct}%` }} />
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500 shadow" style={{ left: `${pct}%` }} title="Hoje" />
          </div>
        </div>
      )}
    </section>
  )
}

const FRASE_SAUDE: Record<string, string> = {
  engajada: 'Animada e presente nas consultorias.',
  oscilante: 'Vai e volta. Vale um contato com carinho.',
  sem_contato: 'Não está respondendo. Tente outro canal, sem pressa.',
  risco_saida: 'Pensando em sair. Precisa de atenção agora.',
  renovou_upsell: 'Renovou ou subiu de programa. Momento lindo.',
}

/** Como ela esta: a saude dita em frase, o ultimo contato e o proximo. */
export function ComoEsta({ aluna }: { aluna: Aluna }) {
  const { nomeDe } = useSessao()
  const [ultimo, setUltimo] = useState<NotaAluna | null>(null)
  useEffect(() => {
    supabase.from('nota_aluna').select('*').eq('aluna_id', aluna.id).eq('tipo', 'contato').order('criado_em', { ascending: false }).limit(1)
      .then(({ data: d }) => setUltimo(((d ?? [])[0] ?? null) as NotaAluna | null))
  }, [aluna.id, aluna.ultimo_contato])
  const s = aluna.saude ? SAUDE[aluna.saude] : null
  const atrasado = aluna.proximo_contato && aluna.proximo_contato < hoje()
  return (
    <section className="overflow-hidden rounded-2xl border border-rose-100 bg-gradient-to-b from-[#fff6f2] to-white">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-rose-500"><Heart size={14} className="fill-rose-300 text-rose-400" /> Como ela está</div>
        <div className="mt-2 font-display text-2xl font-semibold text-noite">{s?.rotulo ?? 'Sem registro ainda'}</div>
        <p className="mt-1 text-sm text-slate-600">{aluna.saude ? FRASE_SAUDE[aluna.saude] : 'Registre uma consultoria para saber como ela está.'}</p>
      </div>
      <div className="space-y-3 border-t border-rose-100/80 px-5 py-4 text-sm">
        <div className="flex gap-3">
          <MessageCircleHeart size={18} className="mt-0.5 shrink-0 text-rose-400" />
          <div className="min-w-0">
            <div className="text-slate-800">
              {aluna.ultimo_contato ? `Último contato ${diasDesde(aluna.ultimo_contato) === 0 ? 'hoje' : `há ${diasDesde(aluna.ultimo_contato)} dias`}` : 'Nenhum contato registrado'}
              {ultimo?.canal && <span className="text-slate-500"> · {ultimo.canal}</span>}
            </div>
            {ultimo && <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-500">“{ultimo.texto}” {ultimo.autor_id && <span className="not-italic">({primeiroNome(nomeDe(ultimo.autor_id))})</span>}</p>}
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm ${atrasado ? 'bg-red-50 text-red-700' : aluna.proximo_contato ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-50 text-slate-500'}`}>
          {aluna.proximo_contato
            ? `${atrasado ? 'Retorno atrasado desde' : 'Próximo retorno em'} ${data(aluna.proximo_contato)}`
            : 'Nenhum retorno combinado'}
        </div>
      </div>
    </section>
  )
}

/** Evolucao do faturamento, a partir do que o consultor registrou em cada encontro. */
export function Evolucao({ aluna, registros }: { aluna: Aluna; registros: RegistroConsultoria[] }) {
  const pontos = [...registros].filter((r) => r.faturamento_mensal != null).sort((a, b) => a.data.localeCompare(b.data))
  if (pontos.length < 2) return null
  const primeiro = Number(pontos[0].faturamento_mensal), ultimo = Number(pontos[pontos.length - 1].faturamento_mensal)
  const cresc = primeiro > 0 ? Math.round(((ultimo - primeiro) / primeiro) * 100) : null
  return (
    <section className="painel p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-noite">Como o negócio dela cresceu</h2>
          <p className="text-sm text-slate-500">Faturamento mensal registrado em cada consultoria</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-medium text-noite">{reais(ultimo)}</div>
          {cresc != null && (
            <div className={`flex items-center justify-end gap-1 text-sm font-medium ${cresc >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              <TrendingUp size={14} className={cresc < 0 ? 'rotate-180' : ''} /> {cresc >= 0 ? '+' : ''}{cresc}% desde {data(pontos[0].data).slice(3)}
            </div>
          )}
        </div>
      </div>
      <Linhas altura={180} doZero={false} formatar={(v) => reais(v)} series={[{ nome: 'Faturamento', cor: '#c9a066' }]}
        pontos={pontos.map((r) => ({ rotulo: data(r.data).slice(0, 5), valores: [Number(r.faturamento_mensal)] }))} />
      <span className="sr-only">{aluna.nome}</span>
    </section>
  )
}

/** Os mimos e o cuidado da entrada: kit, cadastro, acesso, grupo. */
export function Mimos({ aluna }: { aluna: Aluna }) {
  const itens: { rotulo: string; ok: boolean; detalhe: string; icone: ReactNode }[] = [
    { rotulo: 'Pijama', ok: !!aluna.tamanho_kit, detalhe: aluna.tamanho_kit ? `tamanho ${aluna.tamanho_kit}` : 'tamanho a confirmar', icone: <Gift size={15} /> },
    { rotulo: 'Jaqueta', ok: !!aluna.jaqueta, detalhe: aluna.jaqueta ?? 'a confirmar', icone: <Shirt size={15} /> },
    { rotulo: 'Cadastro', ok: aluna.cadastro_preenchido, detalhe: aluna.cadastro_preenchido ? 'preenchido' : 'pendente', icone: <Check size={15} /> },
    { rotulo: 'Acesso à plataforma', ok: /liberad/i.test(aluna.acesso_plataforma ?? ''), detalhe: aluna.acesso_plataforma ?? 'pendente', icone: <Sparkles size={15} /> },
    { rotulo: 'Grupo de avisos', ok: /^sim/i.test(aluna.grupo_avisos ?? ''), detalhe: aluna.grupo_avisos ?? 'pendente', icone: <MessageCircleHeart size={15} /> },
  ]
  return (
    <section className="painel p-5">
      <h2 className="mb-3 font-display text-xl font-semibold text-noite">Boas-vindas e mimos</h2>
      <ul className="space-y-2.5">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-center gap-3 text-sm">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${i.ok ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-slate-400'}`}>{i.icone}</span>
            <span className="min-w-0 flex-1">
              <span className={i.ok ? 'text-slate-800' : 'text-slate-500'}>{i.rotulo}</span>
              <span className="block truncate text-xs text-slate-400">{i.detalhe}</span>
            </span>
            {i.ok && <Check size={15} className="text-emerald-600" />}
          </li>
        ))}
      </ul>
    </section>
  )
}
