import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, ClipboardPlus, MessageSquarePlus, Phone, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Card, Demanda, Etapa, Funil, RegistroConsultoria, Saude } from '../lib/tipos'
import { FINANCEIRO, SAUDE, STATUS_DEMANDA, data, hoje, mensagemErro, reais } from '../lib/util'
import { Campo, Carregando, Erro, Modal, Selo, Vazio } from '../componentes/ui'
import { AlunaForm } from './Alunas'
import { NovoCard } from './CardGaveta'
import { NovaDemanda } from './Demandas'
import { Agenda, Contratos, EventosDaAluna, Notas } from './FichaExtras'

export function AlunaFicha() {
  const { id } = useParams()
  const nav = useNavigate()
  const { eu, nomeDe, funis, etapas, podeEditar } = useSessao()
  const [aluna, setAluna] = useState<Aluna | null | undefined>(undefined)
  const [cards, setCards] = useState<Card[]>([])
  const [registros, setRegistros] = useState<RegistroConsultoria[]>([])
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [editar, setEditar] = useState(false)
  const [registrar, setRegistrar] = useState(false)
  const [novoCard, setNovoCard] = useState<{ funil: Funil; etapa: Etapa } | null>(null)
  const [novaDemanda, setNovaDemanda] = useState(false)

  const carregar = useCallback(async () => {
    const [a, c, r, d] = await Promise.all([
      supabase.from('aluna').select('*').eq('id', id).maybeSingle(),
      supabase.from('card').select('*').eq('aluna_id', id).order('criado_em', { ascending: false }),
      supabase.from('registro_consultoria').select('*').eq('aluna_id', id).order('data', { ascending: false }).order('id', { ascending: false }),
      supabase.from('demanda').select('*').eq('aluna_id', id).order('criado_em', { ascending: false }),
    ])
    setAluna((a.data ?? null) as Aluna | null)
    setCards((c.data ?? []) as Card[])
    setRegistros((r.data ?? []) as RegistroConsultoria[])
    setDemandas((d.data ?? []) as Demanda[])
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  if (aluna === undefined) return <Carregando />
  if (aluna === null) return <Vazio>Aluna não encontrada.</Vazio>

  const minha = aluna.consultor_id === eu?.id || aluna.cs_id === eu?.id
  const podeEditarFicha = eu?.papel === 'coordenador' || eu?.papel === 'cs' || minha
  const podeRegistrar = eu?.papel === 'coordenador' || minha
  const abertosPorFunil = new Set(cards.filter((c) => !c.fechado_em).map((c) => c.funil_id))
  const funisParaAbrir = funis.filter((f) => podeEditar(f.id) && !abertosPorFunil.has(f.id))

  return (
    <div className="space-y-5">
      <div className="painel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{aluna.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {aluna.saude && <Selo cor={SAUDE[aluna.saude].cor}>{SAUDE[aluna.saude].rotulo}</Selo>}
              <Selo cor={aluna.status_contrato === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}>{aluna.status_contrato}</Selo>
              <span>{[aluna.produto, aluna.turma, aluna.empresa].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeRegistrar && <button className="btn-primario" onClick={() => setRegistrar(true)}><ClipboardPlus size={16} /> Registrar consultoria</button>}
            <button className="btn-secundario" onClick={() => setNovaDemanda(true)}><MessageSquarePlus size={16} /> Abrir demanda</button>
            {podeEditarFicha && <button className="btn-secundario" onClick={() => setEditar(true)}><Pencil size={16} /> Editar</button>}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Dado rotulo="Telefone">{aluna.telefone ? <a className="flex items-center gap-1 text-indigo-700" href={`https://wa.me/55${aluna.telefone.replace(/\D/g, '').replace(/^55/, '')}`} target="_blank" rel="noreferrer"><Phone size={13} />{aluna.telefone}</a> : '—'}</Dado>
          <Dado rotulo="E-mail">{aluna.email ? <a className="flex items-center gap-1 truncate text-indigo-700" href={`mailto:${aluna.email}`}><Mail size={13} />{aluna.email}</a> : '—'}</Dado>
          <Dado rotulo="Consultor">{aluna.consultor_id ? nomeDe(aluna.consultor_id) : aluna.consultor_planilha ? `${aluna.consultor_planilha} (planilha)` : '—'}</Dado>
          <Dado rotulo="CS">{aluna.cs_id ? nomeDe(aluna.cs_id) : aluna.cs_planilha ? `${aluna.cs_planilha} (planilha)` : '—'}</Dado>
          <Dado rotulo="Faturamento">{reais(aluna.faturamento_mensal)}/mês</Dado>
          <Dado rotulo="Funcionários">{aluna.funcionarios ?? '—'}</Dado>
          <Dado rotulo="Início">{data(aluna.inicio)}</Dado>
          <Dado rotulo="Término">{data(aluna.termino)}</Dado>
          <Dado rotulo="Última consultoria">{data(aluna.ultima_consultoria)}</Dado>
          <Dado rotulo="Financeiro">{aluna.status_financeiro && FINANCEIRO[aluna.status_financeiro]
            ? <Selo cor={FINANCEIRO[aluna.status_financeiro].cor}>{FINANCEIRO[aluna.status_financeiro].rotulo}</Selo> : aluna.status_financeiro ?? '—'}</Dado>
          <Dado rotulo="Pagamento">{aluna.forma_pagamento ?? '—'}</Dado>
          <Dado rotulo="Kit">{[aluna.tamanho_kit && `pijama ${aluna.tamanho_kit}`, aluna.jaqueta && `jaqueta ${aluna.jaqueta}`].filter(Boolean).join(' · ') || '—'}</Dado>
          <Dado rotulo="Onboarding">{[aluna.onboarding_status, aluna.acesso_plataforma && `acesso ${aluna.acesso_plataforma.toLowerCase()}`].filter(Boolean).join(' · ') || '—'}</Dado>
          <Dado rotulo="Cadastro">{aluna.cadastro_preenchido ? (aluna.link_notion ? <a className="text-indigo-700" href={aluna.link_notion} target="_blank" rel="noreferrer">preenchido · Notion</a> : 'preenchido') : '—'}</Dado>
          <Dado rotulo="Cidade">{[aluna.cidade, aluna.uf].filter(Boolean).join(' / ') || '—'}</Dado>
          <Dado rotulo="Ramo">{aluna.ramo ?? '—'}</Dado>
        </dl>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
        <Agenda aluna={aluna} podeEditar={podeRegistrar || eu?.papel === 'cs'} />
        <section className="space-y-3">
          <h2 className="font-semibold">Consultorias</h2>
          {registros.length === 0 ? (
            <Vazio>{podeRegistrar ? 'Nenhuma consultoria registrada ainda.' : 'Nenhuma consultoria visível para você — o relato fica com quem atende a aluna e com a coordenação.'}</Vazio>
          ) : registros.map((r) => (
            <div key={r.id} className="painel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="font-medium">
                  {r.numero === 0 ? 'Entrada / diagnóstico' : r.numero ? `${r.numero}ª consultoria` : 'Contato'}
                  {!r.realizada && <span className="ml-2 text-xs font-normal text-amber-700">não realizada</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Selo cor={SAUDE[r.saude].cor}>{SAUDE[r.saude].rotulo}</Selo>
                  {data(r.data)} · {nomeDe(r.consultor_id)}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.situacao}</p>
              {(r.proximo_passo || r.faturamento_mensal) && (
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                  {r.proximo_passo && <span><b>Próximo passo:</b> {r.proximo_passo}</span>}
                  {r.faturamento_mensal != null && <span><b>Faturamento:</b> {reais(r.faturamento_mensal)}</span>}
                </div>
              )}
            </div>
          ))}
        </section>

        <Notas aluna={aluna} />
        </div>

        <aside className="space-y-5">
          <Contratos aluna={aluna} mudou={carregar} />
          <section>
            <h2 className="mb-3 font-semibold">Nos funis</h2>
            <div className="painel divide-y divide-slate-100">
              {cards.length === 0 && <div className="p-4 text-sm text-slate-500">Em nenhum funil.</div>}
              {cards.map((c) => (
                <Link key={c.id} to={`/funis/${c.funil_id}?card=${c.id}`} className={`block px-4 py-2.5 hover:bg-slate-50 ${c.fechado_em ? 'opacity-60' : ''}`}>
                  <div className="text-sm font-medium">{funis.find((f) => f.id === c.funil_id)?.nome ?? c.funil_id}</div>
                  <div className="text-xs text-slate-500">{etapas.find((e) => e.id === c.etapa_id)?.nome}{c.fechado_em && ` · fechado em ${data(c.fechado_em)}`}</div>
                </Link>
              ))}
            </div>
            {funisParaAbrir.length > 0 && (
              <select className="entrada mt-2" value="" onChange={(e) => {
                const f = funis.find((x) => x.id === e.target.value)
                const et = etapas.filter((x) => x.funil_id === f?.id).sort((a, b) => a.ordem - b.ordem)[0]
                if (f && et) setNovoCard({ funil: f, etapa: et })
              }}>
                <option value="">+ Colocar em um funil…</option>
                {funisParaAbrir.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Demandas</h2>
            <div className="painel divide-y divide-slate-100">
              {demandas.length === 0 && <div className="p-4 text-sm text-slate-500">Nenhuma demanda.</div>}
              {demandas.map((d) => (
                <Link key={d.id} to={`/demandas/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                  <span className="truncate text-sm">{d.titulo}</span>
                  <Selo cor={STATUS_DEMANDA[d.status].cor}>{STATUS_DEMANDA[d.status].rotulo}</Selo>
                </Link>
              ))}
            </div>
          </section>
          <EventosDaAluna aluna={aluna} />
        </aside>
      </div>

      {editar && <AlunaForm aluna={aluna} fechar={() => setEditar(false)} salvo={() => carregar()} />}
      {registrar && <RegistrarConsultoria aluna={aluna} ultimo={registros[0]} fechar={() => setRegistrar(false)} salvo={() => { setRegistrar(false); carregar() }} />}
      {novoCard && <NovoCard funil={novoCard.funil} etapa={novoCard.etapa} alunaInicial={aluna} fechar={() => setNovoCard(null)}
        criado={(cid) => nav(`/funis/${novoCard.funil.id}?card=${cid}`)} />}
      {novaDemanda && <NovaDemanda alunaInicial={aluna} fechar={() => setNovaDemanda(false)} criada={(did) => nav(`/demandas/${did}`)} />}
    </div>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  )
}

function RegistrarConsultoria({ aluna, ultimo, fechar, salvo }: {
  aluna: Aluna; ultimo?: RegistroConsultoria; fechar: () => void; salvo: () => void
}) {
  const { eu } = useSessao()
  const proximo = ultimo?.numero != null ? Math.min(ultimo.numero + (ultimo.realizada ? 1 : 0), 5) : 0
  const [f, setF] = useState({
    data: hoje(), numero: String(proximo), realizada: true, saude: '' as Saude | '',
    situacao: '', faturamento_mensal: aluna.faturamento_mensal != null ? String(aluna.faturamento_mensal) : '', proximo_passo: '',
  })
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!f.saude) { setErro('Escolha a saúde da aluna — é o campo que dispara retenção e oportunidade.'); return }
    const { error } = await supabase.from('registro_consultoria').insert({
      aluna_id: aluna.id, consultor_id: eu?.id, data: f.data, numero: f.numero === '' ? null : Number(f.numero),
      realizada: f.realizada, saude: f.saude, situacao: f.situacao.trim(),
      faturamento_mensal: f.faturamento_mensal ? Number(f.faturamento_mensal) : null, proximo_passo: f.proximo_passo.trim() || null,
    })
    if (error) { setErro(mensagemErro(error)); return }
    salvo()
  }

  return (
    <Modal titulo={`Registrar consultoria · ${aluna.nome}`} aberto fechar={fechar} largo>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo rotulo="Data"><input className="entrada" type="date" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
          <Campo rotulo="Qual consultoria">
            <select className="entrada" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })}>
              <option value="0">Entrada / diagnóstico</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}ª consultoria</option>)}
              <option value="">Contato avulso</option>
            </select>
          </Campo>
          <Campo rotulo="Aconteceu?">
            <select className="entrada" value={f.realizada ? 's' : 'n'} onChange={(e) => setF({ ...f, realizada: e.target.value === 's' })}>
              <option value="s">Sim, realizada</option>
              <option value="n">Não — agendada e não aconteceu</option>
            </select>
          </Campo>
        </div>
        <div>
          <span className="rotulo">Saúde da aluna *</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAUDE) as Saude[]).map((s) => (
              <button type="button" key={s} onClick={() => setF({ ...f, saude: s })}
                className={`rounded-full border px-3 py-1 text-sm ${f.saude === s ? `${SAUDE[s].cor} border-transparent ring-2 ring-indigo-400` : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {SAUDE[s].rotulo}
              </button>
            ))}
          </div>
          {(f.saude === 'risco_saida' || f.saude === 'sem_contato') && (
            <p className="mt-2 text-xs text-red-700">Ao salvar, a retenção e a CS são avisadas e um card de retenção é aberto.</p>
          )}
        </div>
        <Campo rotulo="Situação da aluna *" dica="O relato: como está o negócio, o que foi tratado, o que preocupa. Visível só para quem atende a aluna e a coordenação.">
          <textarea className="entrada min-h-32" required value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Faturamento mensal atual (R$)"><input className="entrada" type="number" min="0" value={f.faturamento_mensal} onChange={(e) => setF({ ...f, faturamento_mensal: e.target.value })} /></Campo>
          <Campo rotulo="Próximo passo"><input className="entrada" value={f.proximo_passo} onChange={(e) => setF({ ...f, proximo_passo: e.target.value })} /></Campo>
        </div>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Salvar registro</button>
        </div>
      </form>
    </Modal>
  )
}

