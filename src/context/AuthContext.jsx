import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (userId) => {
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!id) { setProfile(null); return null }
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data ?? null)
    return data
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await refreshProfile(session.user.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) await refreshProfile(session.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [refreshProfile])

  // Se a pessoa chegou por um link de convite antes de logar, o token fica
  // guardado e é resgatado automaticamente assim que ela entra.
  useEffect(() => {
    const pending = localStorage.getItem('pending_invite')
    if (session && pending) {
      supabase.rpc('redeem_invite', { invite_token: pending }).then(({ data }) => {
        if (data === 'ok' || data === 'ja_usado') localStorage.removeItem('pending_invite')
        refreshProfile(session.user.id)
      })
    }
  }, [session, refreshProfile])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
