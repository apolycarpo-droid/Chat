import { Routes, Route } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Rules from './pages/Rules'
import Pending from './pages/Pending'
import Banned from './pages/Banned'
import ChatLayout from './pages/ChatLayout'
import Admin from './pages/Admin'
import JoinInvite from './pages/JoinInvite'

function Splash() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-pulse text-2xl font-semibold text-green-600">Turma</div>
    </div>
  )
}

export default function App() {
  const { session, profile, loading } = useAuth()

  return (
    <Routes>
      <Route path="/convite/:token" element={<JoinInvite />} />
      <Route
        path="/*"
        element={
          loading ? <Splash />
          : !session ? <Login />
          : !profile ? <Splash />
          : profile.banned ? <Banned />
          : !profile.accepted_terms_at ? <Rules />
          : !profile.approved ? <Pending />
          : (
            <Routes>
              <Route path="/admin" element={<Admin />} />
              <Route path="/*" element={<ChatLayout />} />
            </Routes>
          )
        }
      />
    </Routes>
  )
}
