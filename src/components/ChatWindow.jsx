import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import MessageBubble from './MessageBubble'
import Composer from './Composer'
import CallModal from './CallModal'
import GroupCall from './GroupCall'

export default function ChatWindow({ channel, me, profile, members, title, onBack, onMessageSent }) {
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})       // id -> nome (para grupos)
  const [typing, setTyping] = useState(null)         // nome de quem está digitando
  const [otherRead, setOtherRead] = useState(null)   // last_read_at do outro (DM)
  const [call, setCall] = useState(null)             // {mode:'caller'} | {mode:'callee', offer}
  const [groupCall, setGroupCall] = useState(false)
  const bottomRef = useRef(null)
  const typingTimeout = useRef(null)
  const liveChannel = useRef(null)

  const isDm = channel.kind === 'dm'
  const other = members.find((m) => m.user_id !== me)

  // ---- carregar histórico + nomes ----
  useEffect(() => {
    const load = async () => {
      const [{ data: msgs }, { data: profs }] = await Promise.all([
        supabase.from('messages').select('*')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: true })
          .limit(200),
        supabase.from('profiles').select('id, name'),
      ])
      setMessages(msgs ?? [])
      setProfiles(Object.fromEntries((profs ?? []).map((p) => [p.id, p.name])))
      if (other) setOtherRead(other.last_read_at)
    }
    load()
  }, [channel.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- tempo real: mensagens novas + leitura do outro ----
  useEffect(() => {
    const sub = supabase
      .channel(`room-${channel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new])
          onMessageSent()
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channel_members', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          if (payload.new.user_id !== me) setOtherRead(payload.new.last_read_at)
        })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel.id, me]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- "digitando..." e chamada recebida, via broadcast ----
  useEffect(() => {
    const sub = supabase
      .channel(`live-${channel.id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === me) return
        setTyping(payload.name)
        clearTimeout(typingTimeout.current)
        typingTimeout.current = setTimeout(() => setTyping(null), 2500)
      })
      .subscribe()
    liveChannel.current = sub
    return () => { liveChannel.current = null; supabase.removeChannel(sub) }
  }, [channel.id, me])

  // chamada 1-a-1 recebida (só em conversas diretas)
  useEffect(() => {
    if (!isDm) return
    const sub = supabase
      .channel(`call-${channel.id}`)
      .on('broadcast', { event: 'offer' }, ({ payload }) => {
        if (payload.from !== me) setCall({ mode: 'callee', offer: payload })
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel.id, me, isDm])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const sendTyping = () => {
    liveChannel.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: me, name: profile.name },
    })
  }

  const lastMine = [...messages].reverse().find((m) => m.sender_id === me)
  const lastMineRead =
    isDm && lastMine && otherRead && new Date(otherRead) >= new Date(lastMine.created_at)

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-4 py-3 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800">
        <button onClick={onBack} className="md:hidden text-green-600 text-xl">‹</button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{title}</h2>
          {typing && <p className="text-xs text-green-600 animate-pulse">digitando…</p>}
        </div>
        {isDm ? (
          <button
            onClick={() => setCall({ mode: 'caller' })}
            title="Chamada de vídeo"
            className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center"
          >📹</button>
        ) : (
          <button
            onClick={() => setGroupCall(true)}
            title="Chamada em grupo"
            className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center"
          >📹</button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            mine={m.sender_id === me}
            senderName={!isDm && m.sender_id !== me ? profiles[m.sender_id] : null}
            showName={!isDm && (i === 0 || messages[i - 1].sender_id !== m.sender_id)}
          />
        ))}
        {lastMineRead && (
          <p className="text-right text-[11px] text-gray-400 pr-1">Lida ✓✓</p>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer channelId={channel.id} me={me} onTyping={sendTyping} />

      {call && (
        <CallModal
          channelId={channel.id}
          me={me}
          myName={profile.name}
          otherName={title}
          mode={call.mode}
          incomingOffer={call.mode === 'callee' ? call.offer : null}
          onClose={() => setCall(null)}
        />
      )}
      {groupCall && (
        <GroupCall channelId={channel.id} name={profile.name} onClose={() => setGroupCall(false)} />
      )}
    </div>
  )
}
