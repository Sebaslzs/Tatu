// Huella simulada: no hay lector real. La lectura cuenta con un clic (o toque) en el ícono, o con una
// tecla mientras este paso está activo. La huella se llena y aparece «Proceso biométrico exitoso».
import { CircleCheck, Fingerprint } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CONFIRMADO_MS, LEER_HUELLA_MS } from './pasos'

type Fase = 'esperando' | 'leyendo' | 'listo'

export function LectorHuella({ alVerificar }: { alVerificar: () => void }) {
  const [fase, setFase] = useState<Fase>('esperando')
  const leer = useCallback(() => setFase((f) => (f === 'esperando' ? 'leyendo' : f)), [])

  // Una tecla cuenta como poner el dedo; se ignora la repetición de una tecla mantenida y lo que se
  // escribe en un campo de texto
  useEffect(() => {
    if (fase !== 'esperando') return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Tab' || e.key === 'Escape') return
      leer()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [fase, leer])

  useEffect(() => {
    if (fase === 'leyendo') {
      const t = window.setTimeout(() => setFase('listo'), LEER_HUELLA_MS)
      return () => window.clearTimeout(t)
    }
    if (fase === 'listo') {
      const t = window.setTimeout(alVerificar, CONFIRMADO_MS)
      return () => window.clearTimeout(t)
    }
  }, [fase, alVerificar])

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={leer}
        disabled={fase !== 'esperando'}
        aria-label="Leer la huella"
        className={cn(
          'relative flex size-40 items-center justify-center rounded-full border-4 transition-colors',
          fase === 'listo' ? 'border-pagado bg-pagado-fondo' : fase === 'leyendo' ? 'border-ambar bg-ambar/20' : 'border-linea bg-papel',
        )}
      >
        {fase === 'esperando' && <span aria-hidden className="absolute inset-0 animate-ping rounded-full border-2 border-ambar/60 motion-reduce:animate-none" />}
        {fase === 'listo' ? (
          <CircleCheck aria-hidden className="size-20 text-pagado" strokeWidth={2.5} />
        ) : (
          <Fingerprint aria-hidden className={cn('size-24', fase === 'leyendo' ? 'text-ambar' : 'text-tinta-suave')} strokeWidth={1.75} />
        )}
      </button>
      <p role="status" className="m-0 text-center text-lg font-bold">
        {fase === 'listo' ? 'Proceso biométrico exitoso' : fase === 'leyendo' ? 'Leyendo huella…' : 'Coloca tu dedo en el lector'}
      </p>
      {fase === 'esperando' && <p className="m-0 text-center text-[15px] text-tinta-suave">Toca el ícono o pulsa una tecla.</p>}
    </div>
  )
}
