import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import type { Etapa, Funil } from '../lib/tipos'
import { mensagemErro } from '../lib/util'
import { Campo, Erro, Modal } from '../componentes/ui'

const TIPOS: { id: Etapa['tipo']; rotulo: string }[] = [
  { id: 'aberta', rotulo: 'Em andamento' },
  { id: 'ganha', rotulo: 'Fim: ganho' },
  { id: 'perdida', rotulo: 'Fim: perdido' },
]

/** Editar o funil: nome, descrição e etapas (nome, tipo, prazo de alerta, motivo, ordem). Só coordenação. */
export function EditarFunil({ funil, fechar }: { funil: Funil; fechar: () => void }) {
  const { etapas, recarregar } = useSessao()
  const doFunil = etapas.filter((e) => e.funil_id === funil.id).sort((a, b) => a.ordem - b.ordem)
  const [nome, setNome] = useState(funil.nome)
  const [descricao, setDescricao] = useState(funil.descricao ?? '')
  const [lista, setLista] = useState<Etapa[]>(doFunil)
  const [novaEtapa, setNovaEtapa] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function feito(p: PromiseLike<{ error: unknown }>) {
    const { error } = await p
    if (error) { setErro(mensagemErro(error)); return false }
    return true
  }

  async function salvarFunil() {
    setErro(null); setOcupado(true)
    const ok = await feito(supabase.from('funil').update({ nome: nome.trim() || funil.nome, descricao: descricao.trim() || null }).eq('id', funil.id))
    if (ok) {
      for (const e of lista) {
        const antes = doFunil.find((x) => x.id === e.id)
        if (!antes) continue
        if (antes.nome !== e.nome || antes.tipo !== e.tipo || antes.alerta_dias !== e.alerta_dias || antes.exige_motivo !== e.exige_motivo) {
          const ok2 = await feito(supabase.from('etapa').update({
            nome: e.nome.trim() || antes.nome, tipo: e.tipo, alerta_dias: e.alerta_dias, exige_motivo: e.exige_motivo,
          }).eq('id', e.id))
          if (!ok2) { setOcupado(false); return }
        }
      }
      await recarregar()
      fechar()
    }
    setOcupado(false)
  }

  // A ordem e unica por funil: troca passando por um valor provisorio.
  async function trocar(i: number, j: number) {
    const a = lista[i], b = lista[j]
    if (!a || !b) return
    setErro(null); setOcupado(true)
    const ok = await feito(supabase.from('etapa').update({ ordem: -a.id }).eq('id', a.id))
      && await feito(supabase.from('etapa').update({ ordem: a.ordem }).eq('id', b.id))
      && await feito(supabase.from('etapa').update({ ordem: b.ordem }).eq('id', a.id))
    if (ok) {
      const nova = [...lista]
      nova[i] = { ...b, ordem: a.ordem }
      nova[j] = { ...a, ordem: b.ordem }
      setLista(nova)
      await recarregar()
    }
    setOcupado(false)
  }

  async function adicionar() {
    const n = novaEtapa.trim()
    if (!n) return
    setErro(null); setOcupado(true)
    // Entra antes das etapas de fim, que ficam sempre por ultimo.
    const abertas = lista.filter((e) => e.tipo === 'aberta')
    const fins = lista.filter((e) => e.tipo !== 'aberta')
    const maior = Math.max(0, ...lista.map((e) => e.ordem))
    const { data: criada, error } = await supabase.from('etapa')
      .insert({ funil_id: funil.id, nome: n, ordem: maior + 1, tipo: 'aberta' }).select('*').single()
    if (error || !criada) { setErro(mensagemErro(error)); setOcupado(false); return }
    let atual = [...abertas, ...fins, criada as Etapa]
    // Sobe a nova ate ficar antes do primeiro fim.
    for (let k = atual.length - 1; k > abertas.length; k--) {
      const a = atual[k], b = atual[k - 1]
      const ok = await feito(supabase.from('etapa').update({ ordem: -a.id }).eq('id', a.id))
        && await feito(supabase.from('etapa').update({ ordem: a.ordem }).eq('id', b.id))
        && await feito(supabase.from('etapa').update({ ordem: b.ordem }).eq('id', a.id))
      if (!ok) break
      atual = [...atual]
      atual[k] = { ...b, ordem: a.ordem }
      atual[k - 1] = { ...a, ordem: b.ordem }
    }
    setLista(atual)
    setNovaEtapa('')
    await recarregar()
    setOcupado(false)
  }

  async function remover(e: Etapa) {
    setErro(null)
    const { count } = await supabase.from('card').select('id', { count: 'exact', head: true }).eq('etapa_id', e.id)
    if (count) { setErro(`A etapa "${e.nome}" tem ${count} card(s). Mova os cards para outra etapa antes de apagar.`); return }
    if (!confirm(`Apagar a etapa "${e.nome}"?`)) return
    setOcupado(true)
    if (await feito(supabase.from('etapa').delete().eq('id', e.id))) {
      setLista((l) => l.filter((x) => x.id !== e.id))
      await recarregar()
    }
    setOcupado(false)
  }

  const muda = (id: number, m: Partial<Etapa>) => setLista((l) => l.map((e) => (e.id === id ? { ...e, ...m } : e)))

  return (
    <Modal titulo="Editar funil" aberto largo fechar={fechar}>
      <div className="space-y-4">
        {erro && <Erro msg={erro} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do funil"><input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Descrição"><input className="entrada" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Etapas</div>
          <div className="space-y-2">
            {lista.map((e, i) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-col">
                  <button className="text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={ocupado || i === 0} onClick={() => trocar(i, i - 1)} title="Subir"><ArrowUp size={14} /></button>
                  <button className="text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={ocupado || i === lista.length - 1} onClick={() => trocar(i, i + 1)} title="Descer"><ArrowDown size={14} /></button>
                </div>
                <input className="entrada min-w-0 flex-1 py-1.5" value={e.nome} onChange={(x) => muda(e.id, { nome: x.target.value })} />
                <select className="entrada w-36 py-1.5" value={e.tipo} onChange={(x) => muda(e.id, { tipo: x.target.value as Etapa['tipo'] })}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-600" title="Avisa quando o card passa desse número de dias na etapa">
                  Alerta
                  <input type="number" min={0} className="entrada w-16 py-1.5" value={e.alerta_dias ?? ''}
                    onChange={(x) => muda(e.id, { alerta_dias: x.target.value === '' ? null : Number(x.target.value) })} />
                  dias
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={e.exige_motivo} onChange={(x) => muda(e.id, { exige_motivo: x.target.checked })} /> Pede motivo
                </label>
                <button className="text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={ocupado} onClick={() => remover(e)} title="Apagar etapa"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="entrada py-1.5" placeholder="Nova etapa" value={novaEtapa} onChange={(e) => setNovaEtapa(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
            <button className="btn-secundario py-1.5" disabled={ocupado || !novaEtapa.trim()} onClick={adicionar}><Plus size={15} /> Adicionar</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Subir, descer, adicionar e apagar valem na hora. Nome, tipo, alerta e motivo valem ao salvar.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={fechar}>Fechar</button>
          <button className="btn-primario" disabled={ocupado} onClick={salvarFunil}>Salvar</button>
        </div>
      </div>
    </Modal>
  )
}

/** Criar um funil novo com etapas básicas. Só coordenação. */
export function NovoFunil({ fechar, criado }: { fechar: () => void; criado: (id: string) => void }) {
  const { funis, recarregar } = useSessao()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function criar() {
    const n = nome.trim()
    if (!n) return
    setErro(null); setOcupado(true)
    const base = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'funil'
    let id = base
    for (let k = 2; funis.some((f) => f.id === id); k++) id = `${base}_${k}`
    const { error } = await supabase.from('funil').insert({ id, nome: n, ordem: Math.max(0, ...funis.map((f) => f.ordem)) + 1 })
    if (error) { setErro(mensagemErro(error)); setOcupado(false); return }
    const { error: e2 } = await supabase.from('etapa').insert([
      { funil_id: id, nome: 'Novo', ordem: 1, tipo: 'aberta' },
      { funil_id: id, nome: 'Em andamento', ordem: 2, tipo: 'aberta' },
      { funil_id: id, nome: 'Ganho', ordem: 3, tipo: 'ganha' },
      { funil_id: id, nome: 'Perdido', ordem: 4, tipo: 'perdida', exige_motivo: true },
    ])
    if (e2) { setErro(mensagemErro(e2)); setOcupado(false); return }
    await recarregar()
    criado(id)
  }

  return (
    <Modal titulo="Novo funil" aberto fechar={fechar}>
      <div className="space-y-4">
        {erro && <Erro msg={erro} />}
        <Campo rotulo="Nome do funil">
          <input className="entrada" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criar() }} />
        </Campo>
        <p className="text-xs text-slate-500">Começa com as etapas Novo, Em andamento, Ganho e Perdido. Depois é só editar. No início, só a coordenação vê o funil novo.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button className="btn-primario" disabled={ocupado || !nome.trim()} onClick={criar}>Criar</button>
        </div>
      </div>
    </Modal>
  )
}
