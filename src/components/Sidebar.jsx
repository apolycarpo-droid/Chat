import { useState } from 'react'

export default function Sidebar({ channels, me, everyone, dmName, selectedId, lastMsgAt, myReads, onSelect, onOpenDm }) {
  const [showPeople, setShowPeople] = useState(false)

  const groups = channels.filter((c) => c.kind === 'group')
  const dms = channels.filter((c) => c.kind === 'dm')
  const others = everyone.filter((p) => p.id !== me)

  const unread = (id) => {
    const last = lastMsgAt[id]
    const read = myReads[id]
    return last && (!read || new Date(last) > new Date(read))
  }

  const Item = ({ id, icon, label }) => (
    <button
      onClick={() => onSelect(id)}
      className={`w-full px-4 py-3 flex items-center gap-3 text-left transition
        ${selectedId === id ? 'bg-green-50 dark:bg-green-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}
    >
      <span className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-lg shrink-0">
        {icon}
      </span>
      <span className="flex-1 font-medium truncate">{label}</span>
      {unread(id) && <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />}
    </button>
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <p className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase">Grupos</p>
      {groups.map((c) => <Item key={c.id} id={c.id} icon="👥" label={c.name} />)}

      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase">Conversas</p>
        <button onClick={() => setShowPeople(!showPeople)} className="text-green-600 text-sm font-medium">
          {showPeople ? 'fechar' : '+ nova'}
        </button>
      </div>

      {showPeople && (
        <div className="mx-3 mb-2 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {others.length === 0 && (
            <p className="p-3 text-sm text-gray-400">Ninguém mais entrou ainda.</p>
          )}
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => { onOpenDm(p.id); setShowPeople(false) }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              💬 {p.name}
            </button>
          ))}
        </div>
      )}

      {dms.map((c) => <Item key={c.id} id={c.id} icon="🙂" label={dmName(c.id)} />)}
    </div>
  )
}
