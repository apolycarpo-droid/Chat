import { useAuth } from '../context/AuthContext'

export default function Banned() {
  const { signOut } = useAuth()
  return (
    <div className="h-full flex items-center justify-center px-6 text-center">
      <div className="space-y-4">
        <div className="text-4xl">🚫</div>
        <h1 className="text-xl font-bold">Acesso suspenso</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          Sua conta foi suspensa pela administração da comunidade por violação das regras.
          Se você acha que foi um engano, fale com o responsável pela comunidade.
        </p>
        <button onClick={signOut} className="text-sm text-gray-400 underline">Sair</button>
      </div>
    </div>
  )
}
