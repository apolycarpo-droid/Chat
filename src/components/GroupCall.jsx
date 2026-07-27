// Chamada em grupo usando o servidor público e gratuito do Jitsi Meet.
// Cada canal tem uma sala fixa e privada (o nome inclui o id do canal,
// que só os membros conhecem).
export default function GroupCall({ channelId, name, onClose }) {
  const room = `TurmaApp-${channelId}`
  const url =
    `https://meet.jit.si/${room}` +
    `#userInfo.displayName="${encodeURIComponent(name)}"` +
    `&config.prejoinConfig.enabled=false`

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="p-3 flex justify-between items-center bg-black text-white">
        <span className="font-medium">Chamada em grupo</span>
        <button onClick={onClose} className="px-4 py-1.5 rounded-full bg-red-500">Sair</button>
      </div>
      <iframe
        title="Chamada em grupo"
        src={url}
        className="flex-1 w-full border-0"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
      />
    </div>
  )
}
