import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MessageBubble({ message, mine, senderName, showName }) {
  // mensagens sinalizadas pela IA chegam borradas; ver é uma escolha do leitor
  const [revealed, setRevealed] = useState(false)
  const [reported, setReported] = useState(false)
  const flagged = message.status === 'flagged' && !revealed

  // a IA não é perfeita: qualquer membro pode pedir revisão humana
  const report = async () => {
    const reason = prompt('Por que você está denunciando esta mensagem? (opcional)')
    if (reason === null) return
    const { error } = await supabase.from('reports').insert({ message_id: message.id, reason })
    if (error) alert('Não foi possível denunciar: ' + error.message)
    else setReported(true)
  }

  const time = new Date(message.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
      {!mine && (
        <button
          onClick={report}
          disabled={reported}
          title={reported ? 'Denúncia enviada ao administrador' : 'Denunciar esta mensagem'}
          className="self-center order-last ml-1 text-xs opacity-0 group-hover:opacity-60
                     focus:opacity-60 transition disabled:opacity-60"
        >
          {reported ? '✓' : '🚩'}
        </button>
      )}
      <div className="max-w-[78%]">
        {showName && senderName && (
          <p className="text-[11px] text-gray-400 ml-3 mb-0.5">{senderName}</p>
        )}
        <div
          className={`relative px-4 py-2 rounded-3xl text-[15px] leading-snug break-words
            ${mine
              ? 'bg-green-500 text-white rounded-br-md'
              : 'bg-gray-200 dark:bg-gray-800 rounded-bl-md'}`}
        >
          {message.status === 'flagged' && (
            <p className={`text-[11px] mb-1 font-medium ${mine ? 'text-green-100' : 'text-amber-600'}`}>
              ⚠️ Esta mensagem pode violar as regras ({message.flag_reason})
            </p>
          )}
          <div className={flagged ? 'msg-blur' : ''}>
            {message.image_url && (
              <img
                src={message.image_url}
                alt=""
                className="rounded-xl mb-1 max-h-64 object-cover"
                loading="lazy"
              />
            )}
            {message.content && <span>{message.content}</span>}
          </div>
          {flagged && (
            <button
              onClick={() => setRevealed(true)}
              className={`mt-1 text-[11px] underline ${mine ? 'text-green-100' : 'text-gray-500'}`}
            >
              ver mesmo assim
            </button>
          )}
          <span className={`block text-right text-[10px] mt-0.5 ${mine ? 'text-green-100/80' : 'text-gray-400'}`}>
            {time}
          </span>
        </div>
      </div>
    </div>
  )
}
