// Pantalla o bloque de carga: el tatú del logo rueda y su cerradura late mientras llegan los datos.
import { cn } from '@/lib/utils'
import { TatuAnimado } from './TatuAnimado'

interface Props {
  texto?: string
  /** Lado del tatú, en píxeles. */
  tamano?: number
  className?: string
}

/**
 * Mientras carga una pantalla: el tatú del logo rodando, centrado en lo que queda de la pantalla (con
 * «reducir movimiento» queda quieto). El trazo sale del color del texto. Solo se anima con
 * `transform` (GPU) y aparece a los 200 ms: no le quita tiempo a la carga.
 */
export function TatuCargando({ texto = 'Cargando…', tamano = 96, className }: Props) {
  return (
    <div role="status" className={cn('aparece-tarde flex min-h-[45dvh] flex-1 flex-col items-center justify-center gap-4 py-12 text-tinta-suave', className)}>
      <span className="inline-flex" style={{ width: tamano, height: tamano }}>
        <TatuAnimado estado="pagando" variante="cerradura" className="size-full" />
      </span>
      <span className="text-[17px]">{texto}</span>
    </div>
  )
}
