// Pantalla o bloque de carga: el tatú enrollado rueda sobre su suelo mientras llegan los datos.
import { cn } from '@/lib/utils'
import { CENTRO_GIRO, LOGO, SUELO_LOGO } from './geometria'

interface Props {
  texto?: string
  tamano?: number
  className?: string
}

export function TatuCargando({ texto = 'Cargando…', tamano = 96, className }: Props) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-3 py-10 text-tinta-suave', className)}>
      <div aria-hidden className="relative" style={{ width: tamano, height: tamano }}>
        <img
          src={LOGO.claro}
          alt=""
          className="tatu-rueda absolute inset-0 size-full"
          style={{ transformOrigin: `${CENTRO_GIRO.x * 100}% ${CENTRO_GIRO.y * 100}%` }}
        />
        <span className="tatu-suelo absolute left-[-10%] h-[3px] w-[120%]" style={{ top: `${SUELO_LOGO * 100 + 2}%` }} />
      </div>
      <span className="text-base font-semibold">{texto}</span>
    </div>
  )
}
