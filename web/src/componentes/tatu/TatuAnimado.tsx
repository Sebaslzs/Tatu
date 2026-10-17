// El tatú enrollado del logo, rodando: la carga de las pantallas (TatuCargando) y el logo de los
// pagos ya hechos (TatuPagado). Tomado del piloto (rama produccion), igual que TatuEnrolla.
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CERRADURA, LINEA, SOMBRA, VIEWBOX } from './trazos'

/** Una vuelta completa. Rueda en el sentido del reloj: hacia donde mira la cabeza. */
const VUELTA_MS = 1400

// Todo lo que se mueve es `transform` sobre elementos HTML (el cuerpo, la cerradura en su propio
// <svg> encima y las rayitas del suelo): lo anima la GPU sin recalcular estilos ni layout en cada
// cuadro. Animar un <g> o `background-position` costaba ~40 % del hilo principal en un celular lento.
/** Centro del dibujo dentro del viewBox (para girar sobre sí mismo) y centro de la cerradura. */
const CENTRO_CUERPO = '49.6% 46.3%'
const CENTRO_CERRADURA = '38.6% 62%'
/** Lo que corre el suelo por media vuelta: 3 rayitas de 24 px, para que el bucle no salte. */
const PASO_SUELO = 72

export type EstadoTatu = 'pagando' | 'pagado'

interface Props {
  estado: EstadoTatu
  /** `rodar`: solo rueda. `cerradura`: además la cerradura late y al pagar se vuelve verde. */
  variante: 'rodar' | 'cerradura'
  /** Fuerza el modo sin movimiento (para la demo); si no, se sigue la preferencia del sistema. */
  sinMovimiento?: boolean
  /** Sobre un bloque Noche: el trazo va en arena, como en `tatu-logo-oscuro.svg`. */
  sobreOscuro?: boolean
  className?: string
}

function prefiereQuieto() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * El tatú enrollado del logo, rodando mientras el cobro está en «Pagando». Es decorativo: el estado
 * siempre lo dice el texto que lo acompaña.
 */
export function TatuAnimado({ estado, variante, sinMovimiento, sobreOscuro = false, className }: Props) {
  const cuerpo = useRef<HTMLSpanElement>(null)
  const suelo = useRef<HTMLSpanElement>(null)
  const cerradura = useRef<SVGSVGElement>(null)
  const quieto = sinMovimiento ?? prefiereQuieto()
  // Si ya llega pagado (la pantalla de «Pagado» es otra), la cerradura arranca ámbar y cambia a
  // verde en el primer cuadro, para que se vea abrirse.
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    // setTimeout y no requestAnimationFrame: si la pestaña no dibuja, igual debe quedar verde.
    const t = setTimeout(() => setMontado(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Rodar, y al pagar terminar la vuelta en curso hasta quedar derecho.
  useEffect(() => {
    const g = cuerpo.current
    const s = suelo.current
    if (!g || !s || quieto) return
    if (estado !== 'pagando') return

    const giro = g.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: VUELTA_MS, iterations: Infinity })
    const piso = s.animate([{ transform: 'translateX(0)' }, { transform: `translateX(-${PASO_SUELO}px)` }], {
      duration: VUELTA_MS / 2,
      iterations: Infinity,
    })
    return () => {
      const t = Number(giro.currentTime ?? 0)
      const avance = (t % VUELTA_MS) / VUELTA_MS
      giro.cancel()
      piso.cancel()
      // Lo que falta de la vuelta, frenando. Si iba casi al final, da una vuelta más corta.
      const desde = avance * 360
      const hasta = avance > 0.75 ? 720 : 360
      g.animate([{ transform: `rotate(${desde}deg)` }, { transform: `rotate(${hasta}deg)` }], {
        duration: ((hasta - desde) / 360) * VUELTA_MS * 1.8,
        easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      })
    }
  }, [estado, quieto])

  // La cerradura: late mientras paga; al pagar, «se abre» con un salto corto.
  useEffect(() => {
    const c = cerradura.current
    if (!c || variante !== 'cerradura' || quieto) return
    if (estado === 'pagando') {
      const latido = c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
        duration: 1100,
        iterations: Infinity,
        easing: 'ease-in-out',
      })
      return () => latido.cancel()
    }
    if (!montado) return
    c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1)' }], {
      duration: 650,
      delay: 250,
      easing: 'ease-out',
    })
  }, [estado, variante, quieto, montado])

  const verde = variante === 'cerradura' && estado === 'pagado' && (montado || quieto)

  return (
    <span aria-hidden className={cn('relative inline-flex flex-col items-center', className)}>
      {verde && !quieto && <span className="tatu-halo absolute top-[62%] left-[44%] size-[45%] rounded-full" />}
      <span ref={cuerpo} className="relative min-h-0 w-full flex-1" style={{ transformOrigin: CENTRO_CUERPO }}>
        {/* La cerradura va en su propio <svg>, debajo del contorno como en el logo, para latir sin
            repintar el resto. */}
        <svg ref={cerradura} viewBox={VIEWBOX} className="absolute inset-0 size-full overflow-visible" style={{ transformOrigin: CENTRO_CERRADURA }}>
          <path d={CERRADURA} className="transition-[fill] duration-500" fill={verde ? 'var(--color-pagado-relleno)' : 'var(--color-ambar)'} />
        </svg>
        <svg viewBox={VIEWBOX} className="absolute inset-0 size-full overflow-visible">
          <path d={SOMBRA} fill="#9C5A3C" fillOpacity={0.16} />
          <path d={LINEA} fill={sobreOscuro ? 'var(--color-bloque-texto)' : 'var(--foreground)'} fillRule="evenodd" />
        </svg>
      </span>
      {/* El suelo: rayitas que corren hacia atrás mientras rueda (una tira más larga que se desliza). */}
      <span
        className={cn('-mt-1 h-1 w-[120%] shrink-0 overflow-hidden rounded-full transition-opacity duration-500', estado === 'pagando' && !quieto ? 'opacity-100' : 'opacity-0')}
      >
        <span ref={suelo} className={cn(sobreOscuro ? 'tatu-suelo-claro' : 'tatu-suelo', 'block h-full')} style={{ width: `calc(100% + ${PASO_SUELO}px)` }} />
      </span>
    </span>
  )
}

/**
 * Para las pantallas de «Pagado»: el tatú con la cerradura abierta y un chulito verde al lado.
 * `medallon`: dentro de un círculo arena, para ponerlo sobre el bloque verde sin que se pierda.
 */
export function TatuPagado({ className, medallon = false }: { className?: string; medallon?: boolean }) {
  return (
    <span aria-hidden className={cn('relative inline-flex', medallon && 'rounded-full bg-background p-3', className)}>
      <TatuAnimado estado="pagado" variante="cerradura" className="size-full" />
      <span
        className={cn(
          'absolute flex size-[34%] items-center justify-center rounded-full border-[3px] bg-pagado-relleno text-primary-foreground',
          medallon ? 'right-[-4%] bottom-[-2%] border-pagado-relleno ring-[3px] ring-background' : 'right-0 bottom-[6%] border-background',
        )}
      >
        <Check className="size-[60%]" strokeWidth={3.5} />
      </span>
    </span>
  )
}
