// Bucle del detector: unas 10 veces por segundo mira el video y decide el mensaje de guía. Solo llama
// `alSostener` cuando el rostro queda alineado en el óvalo el tiempo configurado. Sin cara, no avanza.
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { aVisible, evaluarRostro, type CajaRostro, type Guia } from './guia'
import { DETECCIONES_POR_SEGUNDO, SOSTENER_ROSTRO_MS } from './pasos'

export function useGuiaRostro(video: RefObject<HTMLVideoElement | null>, detector: FaceDetector | null, activo: boolean, alSostener: () => void) {
  const [guia, setGuia] = useState<Guia>('sinRostro')
  const alineadoDesde = useRef<number | null>(null)
  const avisar = useRef(alSostener)
  avisar.current = alSostener

  useEffect(() => {
    if (!activo || !detector) return
    alineadoDesde.current = null
    let ultimoTiempo = -1
    const intervalo = window.setInterval(() => {
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth) return
      // detectForVideo exige tiempos crecientes
      const ahora = Math.max(performance.now(), ultimoTiempo + 1)
      ultimoTiempo = ahora
      let cajas: CajaRostro[] = []
      try {
        cajas = detector
          .detectForVideo(v, ahora)
          .detections.flatMap((d) => (d.boundingBox ? [{ x: d.boundingBox.originX, y: d.boundingBox.originY, ancho: d.boundingBox.width, alto: d.boundingBox.height }] : []))
          .map((c) => aVisible(c, { ancho: v.videoWidth, alto: v.videoHeight }, { ancho: v.clientWidth, alto: v.clientHeight }))
      } catch {
        return
      }
      const actual = evaluarRostro(cajas)
      // Mismo valor: React no vuelve a pintar, así el mensaje no parpadea
      setGuia(actual)
      if (actual !== 'alineado') {
        alineadoDesde.current = null
        return
      }
      alineadoDesde.current ??= ahora
      if (ahora - alineadoDesde.current >= SOSTENER_ROSTRO_MS) {
        window.clearInterval(intervalo)
        avisar.current()
      }
    }, 1000 / DETECCIONES_POR_SEGUNDO)
    return () => window.clearInterval(intervalo)
  }, [video, detector, activo])

  return guia
}
