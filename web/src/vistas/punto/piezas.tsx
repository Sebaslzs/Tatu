// Piezas de las pantallas del punto, con las medidas del prototipo (P0 a P7 en el celular, PD0 a PD4
// en el computador): cabeceras, el marco de computador, tarjetas, avisos, chips y los pasos del cobro.
import { ChevronLeft, Clock, type LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { BarraSuperior, type Seccion } from '@/componentes/BarraSuperior'
import { Titulo } from '@/componentes/Comun'
import { claseBoton, type VarianteBoton } from '@/lib/boton'
import { cn } from '@/lib/utils'
import { usePunto } from './datos'

// ── Botones ───────────────────────────────────────────────────────────────────

/** Botón de celular: 56 px, radio 14, a todo el ancho. */
const claseBotonCelular = (variante: VarianteBoton = 'primario', className?: string) => claseBoton(variante, 'grande', cn('w-full rounded-[14px]', className))

export function Boton({ variante, className, type = 'button', ...props }: { variante?: VarianteBoton } & ComponentProps<'button'>) {
  return <button type={type} className={claseBotonCelular(variante, className)} {...props} />
}

export function BotonEnlace({ variante, className, ...props }: { variante?: VarianteBoton } & LinkProps) {
  return <Link className={claseBotonCelular(variante, className)} {...props} />
}

/** «Ir al inicio», «Cancelar cobro»: texto subrayado de 44 px de alto. */
export const claseEnlaceSuave =
  'flex min-h-11 cursor-pointer items-center justify-center border-0 bg-transparent font-sans text-[17px] font-semibold text-foreground underline underline-offset-[3px] hover:text-foreground disabled:opacity-50'

// ── Celular ───────────────────────────────────────────────────────────────────

const claseCuadroVolver =
  'flex size-11 flex-none cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-linea bg-papel p-0 text-foreground hover:border-foreground hover:text-foreground'

/** ‹ en un cuadro de 44 px: un enlace, o un botón cuando volver hace algo (cancelar el cobro). */
export function CuadroVolver({ a, alVolver, etiqueta }: { a?: string; alVolver?: () => void; etiqueta: string }) {
  const icono = <ChevronLeft aria-hidden className="size-6" strokeWidth={2.4} />
  if (alVolver || !a) {
    return (
      <button type="button" aria-label={etiqueta} onClick={alVolver} className={claseCuadroVolver}>
        {icono}
      </button>
    )
  }
  return (
    <Link to={a} aria-label={etiqueta} className={claseCuadroVolver}>
      {icono}
    </Link>
  )
}

/** Cabecera del celular: volver, el título del paso y una línea de contexto. */
export function Cabecera({
  volver,
  alVolver,
  etiquetaVolver = 'Volver',
  titulo,
  subtitulo,
}: {
  volver?: string
  alVolver?: () => void
  etiquetaVolver?: string
  titulo: string
  subtitulo?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <CuadroVolver a={volver} alVolver={alVolver} etiqueta={etiquetaVolver} />
      <div className="flex min-w-0 flex-col">
        <span className="text-lg leading-[1.2] font-extrabold">{titulo}</span>
        {/* Hasta dos líneas: en 320 px el nombre largo no se come la cédula que el punto debe leer */}
        {subtitulo && <span className="line-clamp-2 text-sm text-tinta-suave">{subtitulo}</span>}
      </div>
    </div>
  )
}

// ── Computador ────────────────────────────────────────────────────────────────

/** «‹ Inicio»: el volver del computador, con su texto. Un botón cuando volver cancela el cobro. */
export function VolverEscritorio({ a, onClick, children }: { a?: string; onClick?: () => void; children: ReactNode }) {
  const clase =
    'inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border-[1.5px] border-linea bg-papel py-0 pr-3.5 pl-2 font-sans text-base font-bold text-foreground no-underline hover:border-foreground hover:text-foreground'
  const icono = <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={2.4} />
  if (onClick || !a) {
    return (
      <button type="button" onClick={onClick} className={clase}>
        {icono}
        {children}
      </button>
    )
  }
  return (
    <Link to={a} className={clase}>
      {icono}
      {children}
    </Link>
  )
}

const PESTANAS: Seccion[] = [
  { a: '/punto', texto: 'Inicio', fin: true },
  { a: '/punto/caja', texto: 'Mi caja' },
]

/**
 * El punto en el computador (PD0 a PD4): barra Noche con la marca, «Inicio» y «Mi caja», y debajo el
 * volver, el subtítulo y el título de 34 px. El contenido llega hasta 1240 px.
 */
export function PantallaPuntoEscritorio({
  volver,
  subtitulo,
  titulo,
  junto,
  children,
}: {
  volver?: ReactNode
  subtitulo?: ReactNode
  titulo?: ReactNode
  /** Un chip junto al título («Rechazado»). */
  junto?: ReactNode
  children: ReactNode
}) {
  const { nombre } = usePunto()
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <BarraSuperior
        inicio="/"
        etiquetaInicio="Volver a elegir rol"
        contexto={nombre}
        secciones={PESTANAS}
        etiquetaSecciones="Secciones del punto"
        rol="Punto"
        ancho="max-w-[1240px]"
      />
      <main className="mx-auto box-border flex w-full max-w-[1240px] flex-col gap-[22px] px-8 pt-6 pb-14 max-sm:px-4">
        {volver}
        {(titulo || subtitulo) && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              {subtitulo && <span className="text-[15px] text-tinta-suave">{subtitulo}</span>}
              {titulo && <Titulo className="text-[34px] sm:text-[34px]">{titulo}</Titulo>}
            </div>
            {junto}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

// ── Tarjetas, datos y avisos ──────────────────────────────────────────────────

/** Tarjeta del prototipo: fondo papel, borde de 1,5 px y radio 18 (celular) o 20 con 24 px (computador). */
export function Caja({ children, className, grande = false }: { children: ReactNode; className?: string; grande?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col border-[1.5px] border-linea bg-papel', grande ? 'gap-4 rounded-[20px] p-6' : 'gap-2.5 rounded-[18px] p-4', className)}>
      {children}
    </div>
  )
}

/** «Programa · Subsidio de transporte»: etiqueta a la izquierda, dato a la derecha. */
export function Datos({ filas }: { filas: Array<[string, ReactNode]> }) {
  return (
    <dl className="m-0 flex flex-col gap-2.5">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex justify-between gap-3 text-base">
          <dt className="text-tinta-suave">{etiqueta}</dt>
          <dd className="m-0 min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Tarjeta de cifra del computador: radio 20, cifra de 38 px; `noche` la pinta en Noche y ámbar. */
export function TarjetaCifra({ etiqueta, children, apoyo, noche = false }: { etiqueta: string; children: ReactNode; apoyo?: ReactNode; noche?: boolean }) {
  return (
    <div className={cn('flex flex-[1_1_220px] flex-col gap-1.5 rounded-[20px] border-[1.5px] px-[22px] py-5', noche ? 'bloque border-bloque' : 'border-linea bg-papel')}>
      <span className="text-base font-semibold">{etiqueta}</span>
      <span className={cn('cifra text-[38px] [overflow-wrap:anywhere]', noche && 'text-ambar')}>{children}</span>
      {apoyo && <span className={cn('text-[15px]', noche ? 'text-noche-texto-tenue' : 'text-tinta-suave')}>{apoyo}</span>}
    </div>
  )
}

/** Recuadro arena con ícono: «Entrega efectivo solo cuando la pantalla diga Pagado». */
export function AvisoArena({ icono: Icono, children, className }: { icono: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl bg-nota p-3.5 text-base leading-[1.4]', className)}>
      <Icono aria-hidden className="mt-px size-[22px] flex-none" strokeWidth={2} />
      <p className="m-0">{children}</p>
    </div>
  )
}

/** Nota gris con ícono, sin fondo («Al elegir un pago, Jorge confirma con su PIN…»). */
export function NotaGris({ icono: Icono, children, className }: { icono: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 text-[15px] leading-[1.4] text-tinta-suave', className)}>
      <Icono aria-hidden className="mt-0.5 size-[18px] flex-none" strokeWidth={2} />
      <span>{children}</span>
    </div>
  )
}

/** Chip de un pago por cobrar: «Disponible» (ámbar claro) o «En pausa» (gris). */
export function ChipPago({ pausado }: { pausado: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-[5px] self-start rounded-full px-2.5 py-1 text-[13px] font-bold whitespace-nowrap',
        pausado ? 'bg-nota text-tinta-suave' : 'bg-pagando-fondo text-foreground',
      )}
    >
      {!pausado && <Clock aria-hidden className="size-3.5" strokeWidth={2.5} />}
      {pausado ? 'En pausa' : 'Disponible'}
    </span>
  )
}

// ── Pasos del cobro en el celular ─────────────────────────────────────────────

const PASOS = ['Cédula', 'Pago', 'PIN', 'Resultado'] as const
export type PasoCobro = (typeof PASOS)[number]

/** Cédula · Pago · PIN · Resultado: barra de 4 px y el nombre debajo. */
export function PasosCobro({ paso }: { paso: PasoCobro }) {
  const actual = PASOS.indexOf(paso)
  return (
    <ol aria-label={`Paso ${actual + 1} de ${PASOS.length}`} className="m-0 flex list-none gap-1.5 p-0">
      {PASOS.map((texto, i) => (
        <li key={texto} aria-current={i === actual ? 'step' : undefined} className="flex flex-1 flex-col gap-1">
          <span aria-hidden className={cn('h-1 rounded', i <= actual ? 'bg-foreground' : 'bg-linea')} />
          <span className={cn('text-[13px]', i <= actual ? 'text-foreground' : 'text-tinta-suave', i === actual ? 'font-bold' : 'font-medium')}>{texto}</span>
        </li>
      ))}
    </ol>
  )
}
