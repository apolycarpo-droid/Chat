import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const googleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError('Não foi possível entrar com Google: ' + error.message)
  }

  const magicLink = async (e) => {
    e.preventDefault()
    if (!email) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl">💬</div>
          <h1 className="text-3xl font-bold text-green-600">Turma</h1>
          <p className="text-gray-500 dark:text-gray-400">
            O chat da nossa comunidade de alunos, com um ambiente seguro cuidado por IA.
          </p>
        </div>

        <button
          onClick={googleLogin}
          className="w-full py-3 rounded-2xl border border-gray-300 dark:border-gray-700 font-medium
                     hover:bg-gray-50 dark:hover:bg-gray-900 transition flex items-center justify-center gap-2"
        >
          <span className="text-lg">🇬</span> Entrar com Google
        </button>

        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" /> ou
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
        </div>

        {sent ? (
          <p className="text-center text-green-600 font-medium">
            ✉️ Enviamos um link de acesso para <b>{email}</b>.<br />
            Abra o e-mail neste aparelho e toque no link.
          </p>
        ) : (
          <form onSubmit={magicLink} className="space-y-3">
            <input
              type="email"
              required
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-700
                         bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-green-600 text-white font-medium
                         hover:bg-green-700 transition disabled:opacity-50"
            >
              {busy ? 'Enviando…' : 'Receber link por e-mail'}
            </button>
          </form>
        )}

        {error && <p className="text-center text-red-500 text-sm">{error}</p>}

        <p className="text-center text-xs text-gray-400">
          A entrada na comunidade é apenas por convite. As mensagens são analisadas
          por inteligência artificial para a segurança de todos.
        </p>
      </div>
    </div>
  )
}
