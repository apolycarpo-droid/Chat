import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ERRORS = {
  invalido: 'Convite inválido. Confira o código com quem te convidou.',
  ja_usado: 'Este convite já foi usado.',
  expirado: 'Este convite expirou. Peça um novo.',
  nao_autenticado: 'Faça login novamente.',
}

export default function Pending() {
  const { session, refreshProfile, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const redeem = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const token = code.trim().split('/').pop() // aceita o código puro ou o link inteiro
    const { data, error: err } = await supabase.rpc('redeem_invite', { invite_token: token })
    setBusy(false)
    if (err) { setError(err.message); return }
    if (data !== 'ok') { setError(ERRORS[data] ?? 'Não foi possível usar o convite.'); return }
    await refreshProfile(session.user.id)
  }

  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="text-4xl">🎟️</div>
        <h1 className="text-xl font-bold">Falta só o convite</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Esta comunidade é fechada. Cole abaixo o link ou o código de convite
          que você recebeu (ou escaneie o QR Code — ele abre o link sozinho).
        </p>
        <form onSubmit={redeem} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código ou link do convite"
            className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700
                       bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            disabled={busy || !code.trim()}
            className="w-full py-3 rounded-2xl bg-green-600 text-white font-medium
                       hover:bg-green-700 transition disabled:opacity-40"
          >
            {busy ? 'Verificando…' : 'Entrar na comunidade'}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button onClick={signOut} className="text-sm text-gray-400 underline">Sair</button>
      </div>
    </div>
  )
}
