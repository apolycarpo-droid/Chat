import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/image'

export default function Composer({ channelId, me, onTyping }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState(null) // aviso de bloqueio/sinalização
  const fileRef = useRef(null)

  const send = async (imageFile) => {
    const content = text.trim()
    if (!content && !imageFile) return
    setSending(true)
    setNotice(null)
    try {
      let image_url = null
      if (imageFile) {
        const blob = await compressImage(imageFile)
        const path = `${me}/${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('media').upload(path, blob, {
          contentType: 'image/jpeg',
        })
        if (upErr) throw upErr
        image_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      }

      // Toda mensagem passa pela Edge Function de moderação
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: { channel_id: channelId, content, image_url },
      })
      if (error) throw new Error('Falha ao enviar. Tente de novo.')
      if (data?.blocked) {
        setNotice({ kind: 'block', text: `🚫 Mensagem bloqueada: ${data.reason}.` })
        return
      }
      if (data?.flagged) {
        setNotice({ kind: 'flag', text: `⚠️ Sua mensagem foi enviada, mas sinalizada (${data.reason}). Cuidado com as regras.` })
      }
      setText('')
    } catch (e) {
      setNotice({ kind: 'block', text: e.message })
    } finally {
      setSending(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {notice && (
        <p className={`text-xs mb-2 px-2 ${notice.kind === 'block' ? 'text-red-500' : 'text-amber-600'}`}>
          {notice.text}
        </p>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); send(null) }}
        className="flex items-end gap-2"
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0"
          title="Enviar foto"
        >📷</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
        />
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping() }}
          placeholder="Mensagem…"
          disabled={sending}
          className="flex-1 px-4 py-2.5 rounded-3xl border border-gray-300 dark:border-gray-700
                     bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          disabled={sending || !text.trim()}
          className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center
                     shrink-0 disabled:opacity-40 transition"
          title="Enviar"
        >➤</button>
      </form>
    </div>
  )
}
