import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Rules() {
  const { session, refreshProfile } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    await supabase.from('profiles')
      .update({ accepted_terms_at: new Date().toISOString() })
      .eq('id', session.user.id)
    await refreshProfile(session.user.id)
    setBusy(false)
  }

  return (
    <div className="h-full overflow-y-auto flex justify-center px-6 py-10">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-bold">Regras da comunidade 🤝</h1>

        <ul className="space-y-3 text-gray-700 dark:text-gray-300">
          <li>1. Respeite todos os colegas. Bullying, ofensas e exclusão não são tolerados.</li>
          <li>2. Não compartilhe dados pessoais (telefone, CPF, endereço) — nem os seus, nem os dos outros.</li>
          <li>3. Não envie links externos, fotos ou vídeos inadequados.</li>
          <li>4. O que acontece na comunidade fica na comunidade.</li>
        </ul>

        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-200">
          <b>Transparência:</b> para manter o ambiente seguro, todas as mensagens e imagens
          são analisadas automaticamente por inteligência artificial no servidor. Mensagens que
          violarem as regras podem ser borradas ou bloqueadas, e reincidências são informadas
          à administração. Os dados ficam criptografados em repouso e você pode excluir sua
          conta e todos os seus dados a qualquer momento.
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-5 h-5 accent-green-600"
          />
          <span className="text-sm">
            Li e aceito as regras. Confirmo que tenho autorização do meu responsável
            para participar desta comunidade e que ele está ciente da análise automática
            das mensagens.
          </span>
        </label>

        <button
          disabled={!checked || busy}
          onClick={accept}
          className="w-full py-3 rounded-2xl bg-green-600 text-white font-medium
                     hover:bg-green-700 transition disabled:opacity-40"
        >
          Aceitar e continuar
        </button>
      </div>
    </div>
  )
}
