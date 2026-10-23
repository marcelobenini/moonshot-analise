import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Aluna, Demanda, Papel } from '../lib/tipos'
import { PAPEL, PRIORIDADE, STATUS_DEMANDA, TIPO_DEMANDA, data, ha, mensagemErro } from '../lib/util'
import { Campo, Carregando, Erro, EscolherAluna, EscolherPessoa, Modal, Selo, Titulo, Vazio } from '../componentes/ui'

type Aba = 'para_mim' | 'abri' | 'equipe' | 'todas'

export function Demandas() {
  const { eu, nomeDe } = useSessao()
  const nav = useNavigate()
  const [aba, setAba] = useState<Aba>('para_mim')
  const [abertas, setAbertas] = useState(true)
  const [lista, setLista] = useState<Demanda[] | null>(null)
  const [nova, setNova] = useState(false)

  useEffect(() => {
    if (!eu) return
    setLista(null)
    let q = supabase.from('demanda').select('*')
    if (aba === 'para_mim') q = q.eq('responsavel_id', eu.id)
    if (aba === 'abri') q = q.eq('solicitante_id', eu.id)
    if (aba === 'equipe') q = q.eq('equipe', eu.papel!).is('responsavel_id', null)
    if (abertas) q = q.not('status', 'in', '(concluida,cancelada)')
    q.order('atualizado_em', { ascending: false }).limit(200).then(({ data: d }) => setLista((d ?? []) as Demanda[]))
  }, [aba, abertas, eu])

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'para_mim', rotulo: 'Comigo' },
    { id: 'equipe', rotulo: `Sem dono na equipe ${eu?.papel ? PAPEL[eu.papel] : ''}` },
    { id: 'abri', rotulo: 'Que eu abri' },
    ...(eu?.papel === 'coordenador' ? [{ id: 'todas' as Aba, rotulo: 'Todas' }] : []),
  ]

  return (
    <div>
      <Titulo acoes={<button className="btn-primario" onClick={() => setNova(true)}><Plus size={16} /> Nova demanda</button>}>Demandas</Titulo>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${aba === a.id ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{a.rotulo}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={abertas} onChange={(e) => setAbertas(e.target.checked)} /> Só em aberto
        </label>
      </div>

      {lista === null ? <Carregando /> : lista.length === 0 ? <Vazio>Nada aqui. 🎉</Vazio> : (
        <div className="painel divide-y divide-slate-100">
          {lista.map((d) => {
            const vencida = d.prazo && d.prazo < new Date().toISOString().slice(0, 10) && !['concluida', 'cancelada'].includes(d.status)
            return (
              <button key={d.id} onClick={() => nav(`/demandas/${d.id}`)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.titulo}</div>
                  <div className="text-xs text-slate-500">
                    {TIPO_DEMANDA[d.tipo]} · de {nomeDe(d.solicitante_id)} · para {d.responsavel_id ? nomeDe(d.responsavel_id) : d.equipe ? `equipe ${PAPEL[d.equipe]}` : 'ninguém'} · {ha(d.atualizado_em)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.prazo && <span className={`text-xs ${vencida ? 'font-medium text-red-600' : 'text-slate-500'}`}>prazo {data(d.prazo)}</span>}
                  {d.prioridade !== 'normal' && <Selo cor={PRIORIDADE[d.prioridade].cor}>{PRIORIDADE[d.prioridade].rotulo}</Selo>}
                  <Selo cor={STATUS_DEMANDA[d.status].cor}>{STATUS_DEMANDA[d.status].rotulo}</Selo>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {nova && <NovaDemanda fechar={() => setNova(false)} criada={(id) => nav(`/demandas/${id}`)} />}
    </div>
  )
}

export function NovaDemanda({ fechar, criada, alunaInicial }: { fechar: () => void; criada: (id: number) => void; alunaInicial?: Aluna }) {
  const { eu } = useSessao()
  const [f, setF] = useState({
    titulo: '', descricao: '', tipo: 'solicitacao' as Demanda['tipo'], prioridade: 'normal' as Demanda['prioridade'], prazo: '',
  })
  const [destino, setDestino] = useState<'pessoa' | 'equipe'>('pessoa')
  const [responsavel, setResponsavel] = useState<string | null>(null)
  const [equipe, setEquipe] = useState<Papel>('cs')
  const [aluna, setAluna] = useState<Aluna | null>(alunaInicial ?? null)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (destino === 'pessoa' && !responsavel) { setErro('Escolha para quem é a demanda.'); return }
    const { data: d, error } = await supabase.from('demanda').insert({
      ...f, descricao: f.descricao.trim() || null, prazo: f.prazo || null, solicitante_id: eu?.id,
      responsavel_id: destino === 'pessoa' ? responsavel : null, equipe: destino === 'equipe' ? equipe : null,
      aluna_id: aluna?.id ?? null,
    }).select('id').single()
    if (error) { setErro(mensagemErro(error)); return }
    criada(d.id)
  }

  return (
    <Modal titulo="Nova demanda" aberto fechar={fechar} largo>
      <form onSubmit={criar} className="space-y-4">
        <Campo rotulo="O que você precisa? *"><input className="entrada" required autoFocus value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo rotulo="Detalhes"><textarea className="entrada min-h-24" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo rotulo="Tipo">
            <select className="entrada" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Demanda['tipo'] })}>
              {Object.entries(TIPO_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prioridade">
            <select className="entrada" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as Demanda['prioridade'] })}>
              {Object.entries(PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prazo"><input className="entrada" type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></Campo>
        </div>
        <div>
          <span className="rotulo">Para</span>
          <div className="mb-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={destino === 'pessoa'} onChange={() => setDestino('pessoa')} /> Uma pessoa</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={destino === 'equipe'} onChange={() => setDestino('equipe')} /> Uma equipe (quem estiver livre pega)</label>
          </div>
          {destino === 'pessoa' ? <EscolherPessoa valor={responsavel} mudar={setResponsavel} vazio="Escolha…" /> : (
            <select className="entrada" value={equipe} onChange={(e) => setEquipe(e.target.value as Papel)}>
              {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
        <Campo rotulo="Sobre qual aluna (opcional)"><EscolherAluna valor={aluna} mudar={setAluna} /></Campo>
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario">Enviar demanda</button>
        </div>
      </form>
    </Modal>
  )
}
