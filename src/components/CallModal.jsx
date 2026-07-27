import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Chamada de vídeo 1-a-1 com WebRTC ponto-a-ponto (custo zero de servidor):
// a sinalização (offer/answer/ICE) viaja pelo Supabase Realtime e o vídeo
// vai direto de um aparelho ao outro, usando o STUN público do Google.
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function CallModal({ channelId, me, myName, otherName, mode, incomingOffer, onClose }) {
  const [phase, setPhase] = useState(mode === 'caller' ? 'calling' : 'ringing')
  const [error, setError] = useState('')
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const sigRef = useRef(null)
  const pendingIce = useRef([])   // candidatos recebidos antes da remote description
  const outboxIce = useRef([])    // candidatos locais gerados antes do outro lado conectar
  const peerReady = useRef(false)

  const cleanup = () => {
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  const hangup = () => {
    sigRef.current?.send({ type: 'broadcast', event: 'hangup', payload: { from: me } })
    cleanup()
    onClose()
  }

  useEffect(() => {
    let closed = false
    const sig = supabase.channel(`call-${channelId}-rtc`)
    sigRef.current = sig

    const makePc = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
      const pc = new RTCPeerConnection(RTC_CONFIG)
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        // quem liga só envia candidatos depois que o outro lado respondeu
        // (antes disso ele ainda não está ouvindo o canal de sinalização)
        if (peerReady.current) {
          sig.send({ type: 'broadcast', event: 'ice', payload: { from: me, candidate: e.candidate } })
        } else {
          outboxIce.current.push(e.candidate)
        }
      }
      pc.ontrack = (e) => {
        if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
        setPhase('connected')
      }
      return pc
    }

    const flushIce = async (pc) => {
      for (const c of pendingIce.current) await pc.addIceCandidate(c).catch(() => {})
      pendingIce.current = []
    }

    sig
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.from === me || !pcRef.current) return
        await pcRef.current.setRemoteDescription(payload.sdp)
        peerReady.current = true
        for (const c of outboxIce.current) {
          sig.send({ type: 'broadcast', event: 'ice', payload: { from: me, candidate: c } })
        }
        outboxIce.current = []
        await flushIce(pcRef.current)
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
        if (payload.from === me) return
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(payload.candidate).catch(() => {})
        } else {
          pendingIce.current.push(payload.candidate)
        }
      })
      .on('broadcast', { event: 'hangup' }, ({ payload }) => {
        if (payload.from !== me && !closed) { cleanup(); onClose() }
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || closed) return
        try {
          if (mode === 'caller') {
            const pc = await makePc()
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            // o convite toca no canal principal da conversa (ChatWindow escuta lá)
            const ring = supabase.channel(`call-${channelId}`)
            ring.subscribe((s) => {
              if (s === 'SUBSCRIBED') {
                ring.send({ type: 'broadcast', event: 'offer', payload: { from: me, name: myName, sdp: offer } })
              }
            })
          }
        } catch (e) {
          setError('Não foi possível acessar câmera/microfone: ' + e.message)
        }
      })

    return () => { closed = true; supabase.removeChannel(sig) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    try {
      setPhase('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
      const pc = new RTCPeerConnection(RTC_CONFIG)
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sigRef.current?.send({ type: 'broadcast', event: 'ice', payload: { from: me, candidate: e.candidate } })
        }
      }
      pc.ontrack = (e) => {
        if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
        setPhase('connected')
      }
      await pc.setRemoteDescription(incomingOffer.sdp)
      for (const c of pendingIce.current) await pc.addIceCandidate(c).catch(() => {})
      pendingIce.current = []
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sigRef.current?.send({ type: 'broadcast', event: 'answer', payload: { from: me, sdp: answer } })
    } catch (e) {
      setError('Não foi possível acessar câmera/microfone: ' + e.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-1 relative">
        <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
        <video
          ref={localRef} autoPlay playsInline muted
          className="absolute bottom-4 right-4 w-28 md:w-40 rounded-xl border-2 border-white/40"
        />
        {phase !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
            <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center text-3xl">
              {phase === 'ringing' ? '📞' : '📹'}
            </div>
            <p className="text-lg">
              {phase === 'calling' && `Chamando ${otherName}…`}
              {phase === 'ringing' && `${incomingOffer?.name ?? otherName} está te chamando`}
              {phase === 'connecting' && 'Conectando…'}
            </p>
            {error && <p className="text-red-400 text-sm px-6 text-center">{error}</p>}
            {phase === 'ringing' && (
              <button onClick={accept} className="px-8 py-3 rounded-full bg-green-500 font-medium">
                Atender
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-5 flex justify-center bg-black/80">
        <button onClick={hangup} className="w-14 h-14 rounded-full bg-red-500 text-white text-xl">✕</button>
      </div>
    </div>
  )
}
