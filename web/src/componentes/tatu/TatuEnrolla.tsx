// El tatú es la barra de carga de los pagos (la coreografía de Gemini con los dibujos de la lámina):
// de pie, alerta → arquea el lomo → se enrolla → rueda mientras se paga. Si el pago sale bien, frena,
// asoma la cabeza (pose 8) y pasa al logo oficial con la cerradura verde; si sale mal, frena (más
// corto) y termina en el logo con la cerradura roja (`finalError="logo"`, lo que usa la app) o se
// desenrolla hasta quedar otra vez de pie. Tomado del piloto (rama produccion).
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { TatuAnimado, TatuPagado } from './TatuAnimado'
import { ANGULOS_BOLA, ASPECTO_POSES, CAIDA, CENTRO_BOLA, LOGO_EN_CAJA, POSES, RADIO_BOLA, SUELO, VIEWBOX_POSES } from './poses'

const ALERTA_MS = 560
const POSE_MS = 170
/** Una vuelta de la bolita a velocidad de crucero. */
const VUELTA_MS = 1000
const ABRE_MS = 300
/** Las rayitas del suelo miden 24 px: el bucle corre 3 para que no salte. */
const PASO_SUELO = 72
/** Las bolitas dibujadas son las poses 4 a 7 (índices en POSES). */
const BOLITAS = [3, 4, 5, 6] as const
/** Dónde termina de rodar si sale bien: la bolita 7 derecha (cabeza arriba), la que sigue a la pose 8. */
const ANGULO_PAGADO = ANGULOS_BOLA[3]
/** Si sale mal: la bolita 4 derecha (cabeza abajo), la que sigue a la pose 3 al desenrollarse. */
const ANGULO_FALLIDO = ANGULOS_BOLA[0]
/** Arranque en media vuelta con aceleración constante: termina justo a la velocidad de crucero. */
const ACELERA = 'cubic-bezier(0.333, 0, 0.667, 0.333)'

export type EstadoPago = 'pagando' | 'pagado' | 'fallido'

type Fase = 'alerta' | 'arquea' | 'enrolla' | 'rueda' | 'frena' | 'abre' | 'final' | 'vuelve3' | 'vuelve2' | 'de-pie'

const POSE_FIJA: Partial<Record<Fase, number>> = { alerta: 0, arquea: 1, enrolla: 2, abre: 7, final: 7, vuelve3: 2, vuelve2: 1, 'de-pie': 0 }
const SIGUIENTE: Partial<Record<Fase, [Fase, number]>> = {
  alerta: ['arquea', ALERTA_MS],
  arquea: ['enrolla', POSE_MS],
  enrolla: ['rueda', POSE_MS],
  abre: ['final', ABRE_MS],
  vuelve3: ['vuelve2', POSE_MS],
  vuelve2: ['de-pie', POSE_MS],
}

const s = (x: number, y = x) => `translateY(0) scale(${x}, ${y})`
/** Rebote con estiramiento al cambiar de pose (squash and stretch), apoyado en el suelo. */
const REBOTES: Partial<Record<Fase, [Keyframe[], KeyframeAnimationOptions]>> = {
  // De pie; al final se agazapa (anticipación) antes de arquearse
  alerta: [[{ transform: s(1) }, { transform: s(1), offset: 0.72 }, { transform: s(1.04, 0.94) }], { duration: ALERTA_MS, fill: 'forwards' }],
  arquea: [[{ transform: s(1.04, 0.94) }, { transform: s(0.97, 1.05), offset: 0.5 }, { transform: s(1) }], { duration: POSE_MS * 1.4, easing: 'ease-out' }],
  enrolla: [[{ transform: s(1) }, { transform: s(1.03, 0.97), offset: 0.5 }, { transform: s(1) }], { duration: POSE_MS, easing: 'ease-out' }],
  // La bolita cae desde donde estaba el caparazón en C y se aplasta contra el suelo
  rueda: [
    [
      { transform: `translateY(-${CAIDA}%) scale(1, 1)`, easing: 'cubic-bezier(0.5, 0, 1, 1)' },
      { transform: s(1), offset: 0.28 },
      { transform: s(1.08, 0.9), offset: 0.5 },
      { transform: s(0.97, 1.04), offset: 0.75 },
      { transform: s(1) },
    ],
    { duration: 380 },
  ],
  abre: [[{ transform: s(0.9) }, { transform: s(1.06), offset: 0.55 }, { transform: s(1) }], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }],
  // Al desenrollarse: se estira y se vuelve a parar, con un asentón al final
  vuelve3: [[{ transform: s(1.04, 0.95) }, { transform: s(0.97, 1.04), offset: 0.6 }, { transform: s(1) }], { duration: POSE_MS, easing: 'ease-out' }],
  vuelve2: [[{ transform: s(0.97, 1.05) }, { transform: s(1) }], { duration: POSE_MS, easing: 'ease-out' }],
  'de-pie': [[{ transform: s(1.03, 0.95) }, { transform: s(0.99, 1.02), offset: 0.55 }, { transform: s(1) }], { duration: 300, easing: 'ease-out' }],
}

// ---------------------------------------------------------------------------------------------
// Rodar con los 4 dibujos: el contenedor gira de forma continua y en cada tramo se ve la bolita
// dibujada más cerca de ese ángulo, girada lo que le falta. Al cambiar de dibujo no hay salto
// (se comprobó superponiéndolos), solo el leve temblor de un dibujo a mano.
// ---------------------------------------------------------------------------------------------

/** Límites entre una bolita y la siguiente: a mitad de camino entre sus ángulos (en [0, 360)). */
const LIMITES = ANGULOS_BOLA.map((a, i) => (a + (i + 1 < ANGULOS_BOLA.length ? ANGULOS_BOLA[i + 1] : ANGULOS_BOLA[0] + 360)) / 2)

interface Tramo {
  desde: number
  hasta: number
  /** Qué bolita se ve (índice en BOLITAS) y a qué ángulo está dibujada. */
  capa: number
  base: number
}

function tramos(desde: number, hasta: number): Tramo[] {
  const cortes: number[] = []
  for (let v = Math.floor(desde / 360) * 360; v < hasta; v += 360) {
    for (const l of LIMITES) if (v + l > desde && v + l < hasta) cortes.push(v + l)
  }
  cortes.sort((a, b) => a - b)
  const puntos = [desde, ...cortes, hasta]
  return puntos.slice(1).map((fin, i) => {
    const medio = (puntos[i] + fin) / 2
    let capa = 0
    let base = 0
    let distancia = Infinity
    ANGULOS_BOLA.forEach((a, j) => {
      const v = a + 360 * Math.round((medio - a) / 360)
      if (Math.abs(medio - v) < distancia) {
        distancia = Math.abs(medio - v)
        capa = j
        base = v
      }
    })
    return { desde: puntos[i], hasta: fin, capa, base }
  })
}

/** Cuadros para girar de `desde` a `hasta` grados: el giro del contenedor y la opacidad de cada bolita. */
function cuadrosDeGiro(desde: number, hasta: number) {
  const off = (x: number) => Math.min(1, Math.max(0, (x - desde) / (hasta - desde)))
  const giro: Keyframe[] = []
  const capas: Keyframe[][] = BOLITAS.map(() => [])
  for (const t of tramos(desde, hasta)) {
    // Dos cuadros con el mismo offset en cada límite: el cambio de dibujo es instantáneo
    giro.push({ offset: off(t.desde), transform: `rotate(${t.desde - t.base}deg)` }, { offset: off(t.hasta), transform: `rotate(${t.hasta - t.base}deg)` })
    capas.forEach((c, j) => {
      const o = j === t.capa ? 1 : 0
      c.push({ offset: off(t.desde), opacity: o }, { offset: off(t.hasta), opacity: o })
    })
  }
  return { giro, capas }
}

interface Giro {
  animaciones: Animation[]
  desde: number
  hasta: number
}

/** Lanza el giro y las 4 capas con el mismo inicio, para que dibujo y ángulo no se desfasen. */
function girar(contenedor: HTMLElement, capas: HTMLElement[], desde: number, hasta: number, opciones: KeyframeAnimationOptions): Giro {
  const c = cuadrosDeGiro(desde, hasta)
  const animaciones = [contenedor.animate(c.giro, opciones), ...capas.map((el, j) => el.animate(c.capas[j], opciones))]
  const ahora = document.timeline.currentTime
  if (ahora !== null) for (const a of animaciones) a.startTime = ahora
  return { animaciones, desde, hasta }
}

/** El ángulo en que va el giro (con su aceleración o frenado aplicados). */
function anguloDe(g: Giro): number {
  const p = g.animaciones[0].effect?.getComputedTiming().progress ?? 0
  return g.desde + p * (g.hasta - g.desde)
}

function prefiereQuieto() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------------------------
// Pagando y el resultado son pantallas distintas: la de Pagando anota el cobro y la del resultado
// termina la animación (rodando → frena) solo si lo vio pagando; si se abre después, queda quieto.
// ---------------------------------------------------------------------------------------------

const vistosPagando = new Set<string>()

/** Lo llaman «Cobrar» (si el cobro quedó en curso) y la pantalla de Pagando: el resultado de este cobro llega con el tatú rodando. */
export function marcarPagando(id: string) {
  vistosPagando.add(id)
}

interface Props {
  estado: EstadoPago
  /**
   * `de-pie`: la animación completa, desde la pose 1 (pantalla de Pagando). `rodando`: llega rodando
   * y termina según el estado (pantalla del resultado). `final`: quieto en el resultado.
   */
  inicio?: 'de-pie' | 'rodando' | 'final'
  /** Sobre un bloque de color (Noche, verde o rojo): toma el color del texto del bloque. */
  sobreColor?: boolean
  /** Cómo termina si falla: de pie (pose 1) o en el logo con la cerradura roja. */
  finalError?: 'de-pie' | 'logo'
  /** Fuerza el modo sin movimiento (para la demo); si no, se sigue la preferencia del sistema. */
  sinMovimiento?: boolean
  className?: string
}

function faseInicial(estado: EstadoPago, inicio: Props['inicio'], finalError: Props['finalError']): Fase {
  if (inicio === 'rodando') return 'rueda'
  if (inicio === 'final' && (estado === 'pagado' || (estado === 'fallido' && finalError === 'logo'))) return 'final'
  if (inicio === 'final' && estado === 'fallido') return 'de-pie'
  return 'alerta'
}

/**
 * El tatú de la lámina como barra de carga del pago. Decorativo: el estado lo dice el texto que lo
 * acompaña. Para volver a empezar, cambiar su `key`.
 */
export function TatuEnrolla({ estado, inicio = 'de-pie', sobreColor = false, finalError = 'de-pie', sinMovimiento, className }: Props) {
  const quieto = sinMovimiento ?? prefiereQuieto()
  const [fase, setFase] = useState<Fase>(() => faseInicial(estado, inicio, finalError))
  // Si falla y termina en el logo rojo, rueda y frena como cuando paga (hasta la bolita 7 y la pose 8)
  const comoLogo = estado === 'pagado' || (estado === 'fallido' && finalError === 'logo')
  const caja = useRef<HTMLSpanElement>(null)
  const cuerpo = useRef<HTMLSpanElement>(null)
  const giro = useRef<HTMLSpanElement>(null)
  const capas = useRef<(HTMLSpanElement | null)[]>([])
  const suelo = useRef<HTMLSpanElement>(null)
  const logo = useRef<HTMLSpanElement>(null)
  const rebote = useRef<Animation | null>(null)
  const rodando = useRef<Giro | null>(null)
  const frenado = useRef<Giro | null>(null)
  // Si llega rodando, la bolita no cae ni arranca: ya venía girando
  const yaRodaba = useRef(inicio === 'rodando')

  // Las poses fijas se suceden solas
  useEffect(() => {
    if (quieto) return
    const sig = SIGUIENTE[fase]
    if (!sig) return
    const t = setTimeout(() => setFase(sig[0]), sig[1])
    return () => clearTimeout(t)
  }, [fase, quieto])

  // Rebote en cada cambio de pose
  useEffect(() => {
    const r = REBOTES[fase]
    if (quieto || !r || !cuerpo.current || (fase === 'rueda' && yaRodaba.current)) return
    if ((fase === 'final' || fase === 'de-pie') && inicio === 'final') return
    rebote.current?.cancel()
    rebote.current = cuerpo.current.animate(...r)
  }, [fase, quieto, inicio])

  // Rueda: media vuelta acelerando y luego vueltas a velocidad constante, con el suelo corriendo
  useEffect(() => {
    const g = giro.current
    const cs = capas.current.filter((c): c is HTMLSpanElement => c !== null)
    if (quieto || fase !== 'rueda' || !g || cs.length !== BOLITAS.length) return
    let piso: Animation | undefined
    let vivo = true
    const crucero = (desde: number) => {
      const giroCrucero = girar(g, cs, desde, desde + 360, { duration: VUELTA_MS, iterations: Infinity })
      rodando.current = giroCrucero
      // El suelo corre lo mismo que rueda la bolita (2πr por vuelta)
      const r = ((caja.current?.offsetWidth ?? 0) * RADIO_BOLA) / 100
      const velocidad = (2 * Math.PI * r) / VUELTA_MS
      piso = suelo.current?.animate([{ transform: 'translateX(0)' }, { transform: `translateX(-${PASO_SUELO}px)` }], {
        duration: velocidad > 0 ? PASO_SUELO / velocidad : VUELTA_MS,
        iterations: Infinity,
      })
      return giroCrucero
    }
    let actual: Giro
    if (yaRodaba.current) {
      // Antes de donde se detiene: media vuelta si pagó o vuelve a pararse; un tercio (más corto) si
      // termina en el logo rojo
      const objetivo = estado === 'fallido' && finalError !== 'logo' ? ANGULO_FALLIDO + 360 : ANGULO_PAGADO
      actual = crucero(objetivo - (estado === 'fallido' && finalError === 'logo' ? 120 : 180))
    } else {
      actual = girar(g, cs, 0, 180, { duration: VUELTA_MS, easing: ACELERA, fill: 'forwards' })
      rodando.current = actual
      actual.animaciones[0].finished
        .then(() => {
          if (!vivo) return
          for (const a of actual.animaciones) a.cancel()
          actual = crucero(180)
        })
        .catch(() => {})
    }
    return () => {
      vivo = false
      piso?.cancel()
      for (const a of actual.animaciones) a.cancel()
    }
    // `estado` no va en las dependencias: solo elige dónde empieza a rodar quien llega rodando;
    // después el resultado lo maneja el frenado
  }, [fase, quieto])

  // Con el resultado: termina de rodar frenando hasta la bolita que sigue (7 si pagó, 4 si falló)
  useEffect(() => {
    if (estado === 'pagando' || fase !== 'rueda') return
    if (quieto) {
      setFase(comoLogo ? 'final' : 'de-pie')
      return
    }
    const g = giro.current
    const cs = capas.current.filter((c): c is HTMLSpanElement => c !== null)
    if (!g || cs.length !== BOLITAS.length) return
    let desde = 0
    if (rodando.current) {
      desde = anguloDe(rodando.current)
      for (const a of rodando.current.animaciones) a.cancel()
    }
    // En desarrollo React corre los efectos dos veces al montar: un solo frenado a la vez
    if (frenado.current) for (const a of frenado.current.animaciones) a.cancel()
    let hasta = comoLogo ? ANGULO_PAGADO : ANGULO_FALLIDO
    while (hasta < desde + 90) hasta += 360
    // Frena sin salto de velocidad: la pendiente inicial de la curva iguala la velocidad de crucero
    const ms = 1.4 * ((hasta - desde) / 360) * VUELTA_MS + 300
    const pendiente = (ms * 360) / ((hasta - desde) * VUELTA_MS)
    const giroFrenado = girar(g, cs, desde, hasta, { duration: ms, easing: `cubic-bezier(0.2, ${(0.2 * pendiente).toFixed(3)}, 0.5, 1)`, fill: 'forwards' })
    rodando.current = giroFrenado
    frenado.current = giroFrenado
    setFase('frena')
    const despues: Fase = comoLogo ? 'abre' : 'vuelve3'
    giroFrenado.animaciones[0].finished.then(() => setFase(despues)).catch(() => {})
  }, [estado, fase, quieto, comoLogo])

  // El logo oficial aparece sobre la pose 8, que calza con él
  useEffect(() => {
    if (fase === 'final' && !quieto && inicio !== 'final') logo.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' })
  }, [fase, quieto, inicio])

  const enCaja = {
    left: `${LOGO_EN_CAJA.left}%`,
    top: `${LOGO_EN_CAJA.top}%`,
    width: `${LOGO_EN_CAJA.width}%`,
    height: `${LOGO_EN_CAJA.height}%`,
  }
  const logoFinal = estado === 'fallido' ? <TatuError className="size-full" medallon={sobreColor} /> : <TatuPagado className="size-full" medallon={sobreColor} />
  const pose = (i: number, clase?: string) => (
    <svg viewBox={VIEWBOX_POSES} className={cn('absolute inset-0 size-full', clase)}>
      <path d={POSES[i]} fill="currentColor" fillRule="evenodd" />
    </svg>
  )

  // Sin movimiento: el logo quieto con la cerradura ámbar mientras paga, verde si pagó; de pie si falló
  if (quieto) {
    return (
      <span aria-hidden className={cn('relative inline-block', !sobreColor && 'text-foreground', className)}>
        <span className="relative block w-full" style={{ aspectRatio: ASPECTO_POSES }}>
          {estado === 'fallido' && finalError !== 'logo' ? (
            pose(0)
          ) : (
            <span className="absolute" style={enCaja}>
              {estado !== 'pagando' ? logoFinal : <TatuAnimado estado="pagando" variante="cerradura" sinMovimiento sobreOscuro={sobreColor} className="size-full" />}
            </span>
          )}
        </span>
      </span>
    )
  }

  const fija = POSE_FIJA[fase]
  const bolita = fase === 'rueda' || fase === 'frena'

  return (
    <span aria-hidden className={cn('relative inline-block', !sobreColor && 'text-foreground', className)}>
      <span ref={caja} className="relative block w-full" style={{ aspectRatio: ASPECTO_POSES }}>
        {/* El suelo, bajo la bolita: rayitas que corren hacia atrás mientras rueda */}
        <span
          className={cn('absolute h-1 overflow-hidden rounded-full transition-opacity duration-500', fase === 'rueda' ? 'opacity-100' : 'opacity-0')}
          style={{ top: `calc(${SUELO}% + 3px)`, left: `${CENTRO_BOLA.x - 1.4 * RADIO_BOLA}%`, width: `${2.8 * RADIO_BOLA}%` }}
        >
          <span ref={suelo} className={cn(sobreColor ? 'tatu-suelo-claro' : 'tatu-suelo', 'block h-full')} style={{ width: `calc(100% + ${PASO_SUELO}px)` }} />
        </span>

        {/* Lo que rebota y se aplasta contra el suelo (el suelo no) */}
        <span ref={cuerpo} className="absolute inset-0" style={{ transformOrigin: `${CENTRO_BOLA.x}% ${SUELO}%` }}>
          {fija !== undefined && pose(fija, cn('transition-opacity duration-300', fase === 'final' && 'opacity-0'))}

          {bolita && (
            <span ref={giro} className="absolute inset-0" style={{ transformOrigin: `${CENTRO_BOLA.x}% ${CENTRO_BOLA.y}%` }}>
              {BOLITAS.map((p, j) => (
                <span
                  key={p}
                  ref={(el) => {
                    capas.current[j] = el
                  }}
                  className="absolute inset-0"
                  style={{ opacity: j === 0 ? 1 : 0 }}
                >
                  {pose(p)}
                </span>
              ))}
            </span>
          )}

          {fase === 'final' && (
            <span ref={logo} className="absolute" style={enCaja}>
              {logoFinal}
            </span>
          )}
        </span>
      </span>
    </span>
  )
}

/**
 * En la pantalla del resultado (Pagado, Rechazado o Fallido): si el cobro se vio pagando, el tatú
 * llega rodando y termina (se pone verde o vuelve a pararse); si no (por ejemplo, un rechazo por PIN
 * o un cobro abierto después), queda quieto en su pose final.
 */
export function TatuResultado({
  id,
  estado,
  sobreColor = false,
  finalError,
  className,
}: {
  id: string
  estado: 'pagado' | 'fallido'
  sobreColor?: boolean
  finalError?: Props['finalError']
  className?: string
}) {
  const [inicio] = useState<'rodando' | 'final'>(() => (vistosPagando.has(id) ? 'rodando' : 'final'))
  useEffect(() => {
    vistosPagando.delete(id)
  }, [id])
  return <TatuEnrolla estado={estado} inicio={inicio} sobreColor={sobreColor} finalError={finalError} className={className} />
}

/** Si la pantalla de Pagando llega con el tatú ya rodando (lo venía haciendo mientras se pedía el pago). */
export function llegaRodando(id: string) {
  return vistosPagando.has(id)
}

/**
 * El logo de la marca con la cerradura roja (public/brand/tatu-logo-error.svg), espejo de TatuPagado,
 * con una ✕ al lado. `medallon`: en un círculo del fondo, sobre el bloque rojo.
 */
function TatuError({ className, medallon = false }: { className?: string; medallon?: boolean }) {
  return (
    <span aria-hidden className={cn('relative inline-flex items-center justify-center', medallon && 'rounded-full bg-background p-3', className)}>
      <img src="/brand/tatu-logo-error.svg" alt="" className="size-full object-contain" />
      <span
        className={cn(
          'absolute flex size-[34%] items-center justify-center rounded-full border-[3px] bg-rechazo-relleno text-white',
          medallon ? 'right-[-4%] bottom-[-2%] border-rechazo-relleno ring-[3px] ring-background' : 'right-0 bottom-[6%] border-background',
        )}
      >
        <X className="size-[60%]" strokeWidth={3.5} />
      </span>
    </span>
  )
}
