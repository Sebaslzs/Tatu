// El tatú que acompaña un pago: de pie y quieto, se enrolla, rueda mientras el pago está en curso y,
// cuando hay resultado, frena derecho y su cerradura se pone verde (pagado) o roja (no se pagó).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { BOLITA_LAMINA, BOLITA_LOGO, CENTRO_GIRO, DIBUJO_LOGO, LAMINA, LOGO, POSES, SUELO_LOGO } from './geometria'

export type EstadoTatuPago = 'esperando' | 'pagado' | 'fallido'

/** Duración de cada pose al enrollarse: la primera es la pausa de pie. */
const PAUSAS_POSE = [650, 170, 170, 170]
const VUELTA_MS = 900
/** Si el resultado llega mientras se enrolla, rueda al menos esto antes de frenar. */
const RODAR_MINIMO_MS = VUELTA_MS

type Fase = 0 | 1 | 2 | 3 | 'rodando' | 'frenando' | 'listo'

interface Props {
  estado: EstadoTatuPago
  /**
   * true: hace la animación completa desde de pie. false: aparece directo en su estado (un resultado
   * que se abre después de pagado, o rodando si el pago sigue en curso).
   */
  desdeElInicio: boolean
  /** Lado del cuadro del logo, en píxeles. */
  tamano?: number
  className?: string
}

function sinMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function TatuPago({ estado, desdeElInicio, tamano = 168, className }: Props) {
  const [quieto] = useState(sinMovimiento)
  const [fase, setFase] = useState<Fase>(() => {
    if (quieto) return 'listo'
    if (estado !== 'esperando' && !desdeElInicio) return 'listo'
    return desdeElInicio ? 0 : 'rodando'
  })
  const cuerpo = useRef<HTMLDivElement>(null)
  const giro = useRef<Animation | null>(null)
  const final = estado !== 'esperando'

  // Las poses se suceden solas hasta quedar en bolita
  useEffect(() => {
    if (typeof fase !== 'number') return
    const t = setTimeout(() => setFase(fase === 3 ? 'rodando' : ((fase + 1) as Fase)), PAUSAS_POSE[fase])
    return () => clearTimeout(t)
  }, [fase])

  // Rueda sin fin mientras se espera
  useEffect(() => {
    const el = cuerpo.current
    if (fase !== 'rodando' || !el) return
    giro.current = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: VUELTA_MS,
      iterations: Infinity,
    })
    return () => {
      giro.current?.cancel()
    }
  }, [fase])

  // Con el resultado, termina la vuelta en curso frenando hasta quedar derecho
  useEffect(() => {
    if (fase !== 'rodando' || !final) return
    const recorrido = Number(giro.current?.currentTime ?? 0)
    const espera = Math.max(0, RODAR_MINIMO_MS - recorrido)
    const t = setTimeout(() => {
      const el = cuerpo.current
      const actual = giro.current
      if (!el || !actual) return setFase('listo')
      const angulo = ((Number(actual.currentTime ?? 0) % VUELTA_MS) / VUELTA_MS) * 360
      // Si va casi derecho, da una vuelta más para que el frenado se note
      const hasta = angulo > 250 ? 720 : 360
      actual.cancel()
      setFase('frenando')
      const frenado = el.animate([{ transform: `rotate(${angulo}deg)` }, { transform: `rotate(${hasta}deg)` }], {
        duration: ((hasta - angulo) / 360) * VUELTA_MS * 1.9,
        easing: 'cubic-bezier(0.15, 0.6, 0.3, 1)',
      })
      frenado.onfinish = () => setFase('listo')
    }, espera)
    return () => clearTimeout(t)
  }, [fase, final])

  const escala = (BOLITA_LOGO * tamano) / BOLITA_LAMINA
  const enPose = typeof fase === 'number'
  const rueda = fase === 'rodando' || fase === 'frenando'
  const conResultado = fase === 'listo' && final
  const logoResultado = estado === 'pagado' ? LOGO.pagado : LOGO.error

  return (
    <div aria-hidden className={cn('relative shrink-0', className)} style={{ width: tamano, height: tamano }}>
      {enPose && <PoseLamina indice={fase} escala={escala} tamano={tamano} />}

      <div ref={cuerpo} className={cn('absolute inset-0', enPose && 'invisible')} style={{ transformOrigin: `${CENTRO_GIRO.x * 100}% ${CENTRO_GIRO.y * 100}%` }}>
        <img src={LOGO.claro} alt="" className={cn('absolute inset-0 size-full transition-opacity duration-300', conResultado && 'opacity-0')} />
        {final && (
          <img
            src={logoResultado}
            alt=""
            className={cn('absolute transition-opacity duration-300', conResultado ? 'tatu-resultado opacity-100' : 'opacity-0')}
            style={{
              left: `${DIBUJO_LOGO.x * 100}%`,
              top: `${DIBUJO_LOGO.y * 100}%`,
              width: `${DIBUJO_LOGO.ancho * 100}%`,
              height: `${DIBUJO_LOGO.alto * 100}%`,
            }}
          />
        )}
      </div>

      {conResultado && <Insignia pagado={estado === 'pagado'} />}

      <span
        className={cn('tatu-suelo absolute left-[-10%] h-[3px] w-[120%] transition-opacity duration-300', rueda && !quieto ? 'opacity-100' : 'opacity-0')}
        style={{ top: `${SUELO_LOGO * 100 + 2}%` }}
      />
    </div>
  )
}

function PoseLamina({ indice, escala, tamano }: { indice: number; escala: number; tamano: number }) {
  const p = POSES[indice]
  const ventana: CSSProperties = {
    left: CENTRO_GIRO.x * tamano + (p.x0 - p.centro) * escala,
    top: SUELO_LOGO * tamano + (p.y0 - LAMINA.suelo) * escala,
    width: (p.x1 - p.x0) * escala,
    height: (p.y1 - p.y0) * escala,
  }
  return (
    <div className="tatu-pose absolute overflow-hidden" style={ventana}>
      <img
        src={LAMINA.url}
        alt=""
        className="absolute max-w-none mix-blend-multiply"
        style={{ width: LAMINA.ancho * escala, height: LAMINA.alto * escala, left: -p.x0 * escala, top: -p.y0 * escala }}
      />
    </div>
  )
}

function Insignia({ pagado }: { pagado: boolean }) {
  return (
    <span
      className={cn(
        'tatu-insignia absolute right-[2%] bottom-[8%] flex size-[30%] items-center justify-center rounded-full border-[3px] border-arena text-white',
        pagado ? 'bg-pagado' : 'bg-error',
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" className="size-[58%]">
        {pagado ? <path d="M20 6L9 17l-5-5" /> : <path d="M18 6L6 18M6 6l12 12" />}
      </svg>
    </span>
  )
}
