import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, KeyRound, LogOut, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { PAPEL, mensagemErro } from '../lib/util'
import { Campo, Erro, Modal } from './ui'

const BUCKET = 'avatares'

export function fotoUrl(caminho: string | null | undefined) {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null
}

const iniciais = (nome: string) => nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export function AvatarPessoa({ nome, foto, tamanho = 32, className = '' }: { nome: string; foto?: string | null; tamanho?: number; className?: string }) {
  const url = fotoUrl(foto)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => setFalhou(false), [url])
  return url && !falhou
    ? <img src={url} alt={nome} onError={() => setFalhou(true)} style={{ width: tamanho, height: tamanho }} className={`shrink-0 rounded-full object-cover ${className}`} />
    : <span style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }} className={`flex shrink-0 items-center justify-center rounded-full bg-noite font-semibold text-ouro ${className}`}>{iniciais(nome)}</span>
}

/** Avatar clicável: abre trocar foto, alterar senha e sair. */
export function MenuConta({ abrePara = 'baixo', comNome = false }: { abrePara?: 'cima' | 'baixo'; comNome?: boolean }) {
  const { eu, sair } = useSessao()
  const [aberto, setAberto] = useState(false)
  const [modal, setModal] = useState<'foto' | 'senha' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  if (!eu) return null
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-nude'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} aria-label="Minha conta" aria-expanded={aberto}
        className={`flex items-center gap-3 rounded-full ${comNome ? 'w-full rounded-xl p-2 text-left hover:bg-white/5' : ''}`}>
        <AvatarPessoa nome={eu.nome} foto={eu.foto} tamanho={comNome ? 36 : 32} className="ring-2 ring-ouro/40" />
        {comNome && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{eu.nome}</span>
            <span className="block text-xs uppercase tracking-wider text-ouro">{eu.papel ? PAPEL[eu.papel] : ''}</span>
          </span>
        )}
      </button>
      {aberto && (
        <div className={`absolute z-50 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ${abrePara === 'cima' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}>
          <div className="flex items-center gap-3 border-b border-slate-100 px-2 pb-2.5 pt-1">
            <AvatarPessoa nome={eu.nome} foto={eu.foto} tamanho={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-noite">{eu.nome}</div>
              <div className="truncate text-xs text-slate-500">{eu.email}</div>
            </div>
          </div>
          <div className="pt-1.5">
            <button className={item} onClick={() => { setAberto(false); setModal('foto') }}><Camera size={16} /> Trocar foto</button>
            <button className={item} onClick={() => { setAberto(false); setModal('senha') }}><KeyRound size={16} /> Alterar senha</button>
            <button className={`${item} text-red-700`} onClick={sair}><LogOut size={16} /> Sair</button>
          </div>
        </div>
      )}
      {/* Portal: o cabeçalho do celular tem desfoque, que prenderia o modal dentro dele. */}
      {modal === 'foto' && createPortal(<TrocarFoto fechar={() => setModal(null)} />, document.body)}
      {modal === 'senha' && createPortal(<AlterarSenha fechar={() => setModal(null)} />, document.body)}
    </div>
  )
}

// Recorta no centro e reduz para 400x400 em JPEG: a foto fica leve em qualquer tela.
async function prepararFoto(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo)
  const lado = Math.min(img.width, img.height)
  const tam = Math.min(400, lado)
  const c = document.createElement('canvas')
  c.width = tam; c.height = tam
  c.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam)
  return new Promise((ok, falha) => c.toBlob((b) => b ? ok(b) : falha(new Error('Não consegui ler a imagem.')), 'image/jpeg', 0.88))
}

function TrocarFoto({ fechar }: { fechar: () => void }) {
  const { eu, recarregar } = useSessao()
  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url) }, [previa])
  if (!eu) return null

  async function escolher(f: File | undefined) {
    setErro(null)
    if (!f) return
    if (!f.type.startsWith('image/')) { setErro('Escolha uma imagem (JPG, PNG ou WEBP).'); return }
    try { const blob = await prepararFoto(f); setPrevia({ blob, url: URL.createObjectURL(blob) }) }
    catch { setErro('Não consegui abrir essa imagem. Tente outra.') }
  }
  async function salvar() {
    if (!previa || !eu) return
    setSalvando(true); setErro(null)
    const caminho = `${eu.id}/${Date.now()}.jpg`
    const up = await supabase.storage.from(BUCKET).upload(caminho, previa.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (up.error) { setErro(mensagemErro(up.error)); setSalvando(false); return }
    const { error } = await supabase.from('perfil').update({ foto: caminho }).eq('id', eu.id)
    if (error) { await supabase.storage.from(BUCKET).remove([caminho]); setErro(mensagemErro(error)); setSalvando(false); return }
    if (eu.foto) await supabase.storage.from(BUCKET).remove([eu.foto])
    await recarregar()
    fechar()
  }
  async function remover() {
    if (!eu?.foto || !confirm('Tirar sua foto?')) return
    setSalvando(true)
    const { error } = await supabase.from('perfil').update({ foto: null }).eq('id', eu.id)
    if (error) { setErro(mensagemErro(error)); setSalvando(false); return }
    await supabase.storage.from(BUCKET).remove([eu.foto])
    await recarregar()
    fechar()
  }

  return (
    <Modal titulo="Trocar foto" aberto fechar={fechar}>
      <div className="space-y-4">
        <div className="flex justify-center">
          {previa ? <img src={previa.url} alt="Prévia" className="h-32 w-32 rounded-full object-cover ring-4 ring-rose-100" />
            : <AvatarPessoa nome={eu.nome} foto={eu.foto} tamanho={128} className="ring-4 ring-rose-100" />}
        </div>
        <label className="btn-secundario w-full cursor-pointer justify-center">
          <Camera size={16} /> {previa ? 'Escolher outra' : 'Escolher imagem'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
        </label>
        <p className="text-center text-xs text-slate-500">A foto é recortada em quadrado e aparece para a equipe.</p>
        <Erro msg={erro} />
        <div className="flex justify-between gap-2">
          {eu.foto && !previa ? <button className="btn-fantasma text-red-600" disabled={salvando} onClick={remover}><Trash2 size={15} /> Tirar foto</button> : <span />}
          <div className="flex gap-2">
            <button className="btn-secundario" onClick={fechar}>Cancelar</button>
            <button className="btn-primario" disabled={!previa || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

const SENHA_VALIDA = /^\d{8}$/
const soNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 8)

function AlterarSenha({ fechar }: { fechar: () => void }) {
  const { eu } = useSessao()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!SENHA_VALIDA.test(nova)) { setErro('A nova senha precisa ter exatamente 8 números.'); return }
    if (nova !== confirma) { setErro('As duas senhas novas não são iguais.'); return }
    if (nova === atual) { setErro('Use uma senha diferente da atual.'); return }
    const { data: u } = await supabase.auth.getUser()
    const email = u.user?.email ?? eu?.email
    if (!email) { setErro('Não encontrei seu e-mail. Entre de novo.'); return }
    setSalvando(true)
    // Confere a senha atual antes de trocar: protege quem deixou a sessão aberta.
    const conf = await supabase.auth.signInWithPassword({ email, password: atual })
    if (conf.error) { setSalvando(false); setErro('Senha atual incorreta.'); return }
    const { error } = await supabase.auth.updateUser({ password: nova })
    setSalvando(false)
    if (error) { setErro(error.message.includes('different from the old') ? 'Use uma senha diferente da atual.' : mensagemErro(error)); return }
    setOk(true)
  }

  return (
    <Modal titulo="Alterar senha" aberto fechar={fechar}>
      {ok ? (
        <div className="space-y-4">
          <p className="text-sm text-emerald-700">Senha alterada. Use a nova senha no próximo login.</p>
          <div className="flex justify-end"><button className="btn-primario" onClick={fechar}>Fechar</button></div>
        </div>
      ) : (
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Senha atual">
            <input className="entrada tracking-widest" type="password" autoComplete="current-password" autoFocus
              required value={atual} onChange={(e) => setAtual(e.target.value)} />
          </Campo>
          <Campo rotulo="Nova senha" dica="Exatamente 8 números.">
            <input className="entrada tracking-widest" type="password" inputMode="numeric" autoComplete="new-password"
              maxLength={8} required value={nova} onChange={(e) => setNova(soNumeros(e.target.value))} />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <input className="entrada tracking-widest" type="password" inputMode="numeric" autoComplete="new-password"
              maxLength={8} required value={confirma} onChange={(e) => setConfirma(soNumeros(e.target.value))} />
          </Campo>
          <Erro msg={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
            <button className="btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Alterar senha'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
