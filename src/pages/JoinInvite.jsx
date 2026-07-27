import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Rota /convite/:token — guarda o convite e manda a pessoa para o fluxo normal.
// Se já estiver logada, resgata na hora; se não, o AuthContext resgata após o login.
export default function JoinInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { session, refreshProfile } = useAuth()

  useEffect(() => {
    const run = async () => {
      if (session) {
        await supabase.rpc('redeem_invite', { invite_token: token })
        await refreshProfile(session.user.id)
      } else {
        localStorage.setItem('pending_invite', token)
      }
      navigate('/', { replace: true })
    }
    run()
  }, [token, session, navigate, refreshProfile])

  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      Processando convite…
    </div>
  )
}
