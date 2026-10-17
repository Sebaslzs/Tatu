// Prende la cámara frontal mientras el componente está montado y la apaga al salir.
// No se captura ni se guarda ningún cuadro: el video solo se muestra y lo mira el detector.
import { useEffect, useRef, useState } from 'react'

export type EstadoCamara = 'iniciando' | 'lista' | 'sinCamara'

export function useCamara() {
  const video = useRef<HTMLVideoElement>(null)
  const [estado, setEstado] = useState<EstadoCamara>('iniciando')

  useEffect(() => {
    let flujo: MediaStream | null = null
    let vivo = true
    async function prender() {
      // Sin mediaDevices (http en la red local, navegador viejo) no hay cámara
      if (!navigator.mediaDevices?.getUserMedia) return setEstado('sinCamara')
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (!vivo || !video.current) return flujo.getTracks().forEach((t) => t.stop())
        video.current.srcObject = flujo
        await video.current.play()
        if (vivo) setEstado('lista')
      } catch {
        if (vivo) setEstado('sinCamara')
      }
    }
    void prender()
    return () => {
      vivo = false
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return { video, estado }
}
