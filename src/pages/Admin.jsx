import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const TABS = [
  ['convites', 'Convites'],
  ['moderacao', 'Moderação'],
  ['membros', 'Membros'],
]

export default function Admin() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('convites')

  if (profile.role !== 'admin') {
    return <div className="h-full flex items-center justify-center text-gray-400">Apenas administradores.</div>
  }

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <header className="p-4 flex items-center gap-4 border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="text-green-600 text-xl">‹</Link>
        <h1 className="text-xl font-bold">Administração</h1>
      </header>
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition
              ${tab === id ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'convites' && <Invites me={profile.id} />}
        {tab === 'moderacao' && <Moderation />}
        {tab === 'membros' && <Members me={profile.id} />}
      </div>
    </div>
  )
}

// ---------------- CONVITES ----------------
function Invites({ me }) {
  const [invites, setInvites] = useState([])
  const [qr, setQr] = useState(null) // {token, dataUrl}

  const load = useCallback(async () => {
    const { data } = await supabase.from('invites').select('*').order('created_at', { ascending: false })
    setInvites(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const createInvite = async () => {
    await supabase.from('invites').insert({ created_by: me })
    load()
  }

  const linkFor = (token) => `${window.location.origin}/convite/${token}`

  const showQr = async (token) => {
    const dataUrl = await QRCode.toDataURL(linkFor(token), { width: 280, margin: 2 })
    setQr({ token, dataUrl })
  }

  const copy = (token) => {
    navigator.clipboard.writeText(linkFor(token))
    alert('Link copiado! Envie para o aluno.')
  }

  const statusOf = (inv) =>
    inv.used_by ? '✅ usado'
    : new Date(inv.expires_at) < new Date() ? '⏰ expirado'
    : '🟢 válido'

  return (
    <div className="space-y-4">
      <button onClick={createInvite} className="w-full py-3 rounded-2xl bg-green-600 text-white font-medium">
        + Gerar convite (válido por 48h)
      </button>

      {qr && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center space-y-2">
          <img src={qr.dataUrl} alt="QR Code do convite" className="mx-auto rounded-xl" />
          <p className="text-xs text-gray-400 break-all">{linkFor(qr.token)}</p>
          <button onClick={() => setQr(null)} className="text-sm text-gray-400 underline">fechar</button>
        </div>
      )}

      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-sm">
            <span className="flex-1 truncate font-mono text-xs">{inv.token}</span>
            <span className="shrink-0">{statusOf(inv)}</span>
            {!inv.used_by && new Date(inv.expires_at) > new Date() && (
              <>
                <button onClick={() => copy(inv.token)} className="text-green-600 font-medium shrink-0">copiar</button>
                <button onClick={() => showQr(inv.token)} className="text-green-600 font-medium shrink-0">QR</button>
              </>
            )}
          </div>
        ))}
        {invites.length === 0 && <p className="text-center text-gray-400 text-sm">Nenhum convite ainda.</p>}
      </div>
    </div>
  )
}

// ---------------- MODERAÇÃO ----------------
function Moderation() {
  const [strikes, setStrikes] = useState([])
  const [profiles, setProfiles] = useState({})

  useEffect(() => {
    const load = async () => {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from('strikes')
          .select('*, messages(content, image_url)')
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, name, banned'),
      ])
      setStrikes(s ?? [])
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x])))
    }
    load()
  }, [])

  // reincidentes: 3+ sinalizações nos últimos 7 dias
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const counts = {}
  for (const s of strikes) {
    if (new Date(s.created_at).getTime() > weekAgo) counts[s.user_id] = (counts[s.user_id] ?? 0) + 1
  }
  const repeat = Object.entries(counts).filter(([, n]) => n >= 3)

  const ban = async (userId) => {
    if (!confirm(`Banir ${profiles[userId]?.name}?`)) return
    await supabase.rpc('set_banned', { target: userId, value: true })
    setProfiles((prev) => ({ ...prev, [userId]: { ...prev[userId], banned: true } }))
  }

  return (
    <div className="space-y-4">
      {repeat.length > 0 && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4 space-y-2">
          <p className="font-semibold text-red-600">🔔 Comportamento repetitivo (3+ em 7 dias)</p>
          {repeat.map(([uid, n]) => (
            <div key={uid} className="flex items-center justify-between text-sm">
              <span>{profiles[uid]?.name} — {n} sinalizações</span>
              {profiles[uid]?.banned
                ? <span className="text-gray-400">banido</span>
                : <button onClick={() => ban(uid)} className="text-red-600 font-medium">banir</button>}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {strikes.map((s) => (
          <div key={s.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-sm space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{profiles[s.user_id]?.name ?? 'usuário removido'}</span>
              <span>{new Date(s.created_at).toLocaleString('pt-BR')}</span>
            </div>
            <p>
              <span className={s.blocked ? 'text-red-500' : 'text-amber-600'}>
                {s.blocked ? '🚫 bloqueada' : '⚠️ sinalizada'}
              </span>{' '}
              — {s.reason}
            </p>
            <p className="text-gray-500 italic break-words">
              "{s.messages?.content ?? s.excerpt ?? '(imagem ou mensagem removida)'}"
            </p>
          </div>
        ))}
        {strikes.length === 0 && (
          <p className="text-center text-gray-400 text-sm">Nenhuma sinalização — comunidade tranquila 🎉</p>
        )}
      </div>
    </div>
  )
}

// ---------------- MEMBROS ----------------
function Members({ me }) {
  const [members, setMembers] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setMembers(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const toggleBan = async (m) => {
    if (!confirm(`${m.banned ? 'Desbanir' : 'Banir'} ${m.name}?`)) return
    await supabase.rpc('set_banned', { target: m.id, value: !m.banned })
    load()
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-sm">
          <span className="flex-1">
            {m.name} {m.role === 'admin' && <span className="text-green-600 text-xs">(admin)</span>}
            {!m.approved && <span className="text-gray-400 text-xs"> — aguardando convite</span>}
            {m.banned && <span className="text-red-500 text-xs"> — banido</span>}
          </span>
          {m.id !== me && (
            <button onClick={() => toggleBan(m)} className={m.banned ? 'text-green-600' : 'text-red-500'}>
              {m.banned ? 'desbanir' : 'banir'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
