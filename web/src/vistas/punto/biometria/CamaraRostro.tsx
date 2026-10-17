// Rostro: video frontal en espejo con un óvalo. El detector guía la pose; con la cara sostenida en el
// óvalo pasa a «Reconocimiento facial en proceso…» y luego a «Identidad verificada». En la demo
// cualquier rostro es válido (no se compara contra la cédula), pero sin nadie frente a la cámara no avanza.
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { CircleCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { cargarDetector } from './detectorRostro'
import { MENSAJES_GUIA } from './guia'
import { CONFIRMADO_MS, PROCESAR_ROSTRO_MS } from './pasos'
import { useCamara } from './useCamara'
import { useGuiaRostro } from './useGuiaRostro'

type Fase = 'guiando' | 'procesando' | 'verificado'

export function CamaraRostro({ alVerificar, alNoDisponible }: { alVerificar: () => void; alNoDisponible: (motivo: string) => void }) {
  const { video, estado } = useCamara()
  const [detector, setDetector] = useState<FaceDetector | null>(null)
  const [fase, setFase] = useState<Fase>('guiando')

  useEffect(() => {
    let vivo = true
    cargarDetector()
      .then((d) => vivo && setDetector(d))
      .catch(() => vivo && alNoDisponible('No pudimos iniciar el reconocimiento facial. Usa la huella.'))
    return () => {
      vivo = false
    }
  }, [alNoDisponible])

  useEffect(() => {
    if (estado === 'sinCamara') alNoDisponible('No hay cámara disponible en este equipo. Usa la huella.')
  }, [estado, alNoDisponible])

  const guia = useGuiaRostro(video, detector, estado === 'lista' && fase === 'guiando', () => setFase('procesando'))

  useEffect(() => {
    if (fase === 'procesando') {
      const t = window.setTimeout(() => setFase('verificado'), PROCESAR_ROSTRO_MS)
      return () => window.clearTimeout(t)
    }
    if (fase === 'verificado') {
      const t = window.setTimeout(alVerificar, CONFIRMADO_MS)
      return () => window.clearTimeout(t)
    }
  }, [fase, alVerificar])

  const alineado = fase === 'guiando' && guia === 'alineado'
  const mensaje =
    fase === 'verificado'
      ? 'Identidad verificada exitosamente'
      : fase === 'procesando'
        ? 'Reconocimiento facial en proceso…'
        : estado === 'iniciando' || !detector
          ? 'Preparando la cámara…'
          : MENSAJES_GUIA[guia]

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-[20px] bg-noche">
        {/* El video va en espejo, como un espejo de verdad */}
        <video ref={video} muted playsInline className="size-full -scale-x-100 object-cover" aria-label="Vista de la cámara frontal" />
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[12%]">
          <div
            className={cn(
              'aspect-[3/4] w-[62%] rounded-[50%] border-4 shadow-[0_0_0_999px_rgba(0,0,0,0.45)] transition-colors',
              fase === 'verificado' ? 'border-pagado' : alineado || fase === 'procesando' ? 'border-ambar' : 'border-white/80',
            )}
          />
        </div>
        {fase === 'procesando' && <div aria-hidden className="pointer-events-none absolute inset-x-[19%] top-[12%] h-1 animate-pulse rounded bg-ambar motion-reduce:animate-none" />}
        {fase === 'verificado' && (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center">
            <CircleCheck className="size-20 text-pagado" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <p role="status" className="m-0 min-h-[1.5em] text-center text-lg font-bold">
        {mensaje}
      </p>
    </div>
  )
}
