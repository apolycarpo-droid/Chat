import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { askNotificationPermission, notify } from '../lib/notify'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'

export default function ChatLayout() {
  const { session, profile, signOut } = useAuth()
  const me = session.user.id

  const [channels, setChannels] = useState([])
  const [members, setMembers] = useState([])         // membros de todos os meus canais (com nome)
  const [everyone, setEveryone] = useState([])       // todos os perfis (para abrir conversa direta)
  const [selectedId, setSelectedId] = useState(null)
  const [lastMsgAt, setLastMsgAt] = useState({})     // channel_id -> data da última mensagem
  const [myReads, setMyReads] = useState({})         // channel_id -> meu last_read_at

  const loadAll = useCallback(async () => {
    const [{ data: chs }, { data: mems }, { data: profs }] = await Promise.all([
      supabase.from('channels').select('*').order('created_at'),
      supabase.from('channel_members').select('channel_id, user_id, last_read_at, profiles(name)'),
      supabase.from('profiles').select('id, name, role, approved, banned').eq('approved', true).eq('banned', false),
    ])
    setChannels(chs ?? [])
    setMembers(mems ?? [])
    setEveryone(profs ?? [])
    const reads = {}
    for (const m of mems ?? []) if (m.user_id === me) reads[m.channel_id] = m.last_read_at
    setMyReads(reads)
    // última mensagem de cada canal, para o indicador de "não lido"
    const { data: lasts } = await supabase
      .from('messages')
      .select('channel_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    const map = {}
    for (const m of lasts ?? []) if (!map[m.channel_id]) map[m.channel_id] = m.created_at
    setLastMsgAt(map)
  }, [me])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { askNotificationPermission() }, [])

  // Assinatura global: qualquer mensagem nova nos meus canais (a RLS filtra)
  // atualiza o indicador de não lido e dispara notificação se o app estiver em segundo plano.
  useEffect(() => {
    const ch = supabase
      .channel('global-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new
        setLastMsgAt((prev) => ({ ...prev, [m.channel_id]: m.created_at }))
        if (m.sender_id !== me) notify('Turma', 'Nova mensagem na comunidade')
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me, loadAll])

  const dmName = useCallback((channelId) => {
    const other = members.find((m) => m.channel_id === channelId && m.user_id !== me)
    return other?.profiles?.name ?? 'Conversa'
  }, [members, me])

  const openDm = async (otherId) => {
    const { data, error } = await supabase.rpc('get_or_create_dm', { other_id: otherId })
    if (error) { alert('Não foi possível abrir a conversa: ' + error.message); return }
    await loadAll()
    setSelectedId(data)
  }

  const markRead = useCallback(async (channelId) => {
    const now = new Date().toISOString()
    setMyReads((prev) => ({ ...prev, [channelId]: now }))
    await supabase.from('channel_members')
      .update({ last_read_at: now })
      .eq('channel_id', channelId).eq('user_id', me)
  }, [me])

  const deleteAccount = async () => {
    const ok = confirm('Excluir sua conta apaga TODAS as suas mensagens e dados, para sempre. Confirmar?')
    if (!ok) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { alert(error.message); return }
    await signOut()
  }

  const selected = useMemo(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  )

  return (
    <div className="h-full flex">
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-gray-200 dark:border-gray-800`}>
        <header className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-xl font-bold text-green-600">Turma</h1>
          <div className="flex items-center gap-3 text-sm">
            {profile.role === 'admin' && (
              <Link to="/admin" className="text-green-600 font-medium">Admin</Link>
            )}
            <button onClick={signOut} className="text-gray-400">Sair</button>
          </div>
        </header>
        <Sidebar
          channels={channels}
          me={me}
          everyone={everyone}
          dmName={dmName}
          selectedId={selectedId}
          lastMsgAt={lastMsgAt}
          myReads={myReads}
          onSelect={(id) => { setSelectedId(id); markRead(id) }}
          onOpenDm={openDm}
        />
        <footer className="p-3 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-400 flex justify-between">
          <span>{profile.name}</span>
          <button onClick={deleteAccount} className="underline">Excluir minha conta</button>
        </footer>
      </div>

      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {selected ? (
          <ChatWindow
            key={selected.id}
            channel={selected}
            me={me}
            profile={profile}
            members={members.filter((m) => m.channel_id === selected.id)}
            title={selected.kind === 'dm' ? dmName(selected.id) : selected.name}
            onBack={() => setSelectedId(null)}
            onMessageSent={() => markRead(selected.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Escolha uma conversa 💬
          </div>
        )}
      </div>
    </div>
  )
}
