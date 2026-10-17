// Piezas comunes de las vistas de escritorio (entidad), tomadas del piloto (rama produccion).
import { ChevronLeft, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { TatuAnimado } from '@/componentes/tatu/TatuAnimado'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { claseBoton, type TamanoBoton, type VarianteBoton } from '@/lib/boton'
import { billeteraCorta } from '@/lib/textos'
import { cn } from '@/lib/utils'

type PropsBoton = { variante?: VarianteBoton; tamano?: TamanoBoton } & ComponentProps<'button'>

export function Boton({ variante, tamano, className, type = 'button', ...props }: PropsBoton) {
  return <button type={type} className={claseBoton(variante, tamano, className)} {...props} />
}

export function BotonEnlace({ variante, tamano, className, ...props }: { variante?: VarianteBoton; tamano?: TamanoBoton } & LinkProps) {
  return <Link className={claseBoton(variante, tamano, className)} {...props} />
}

/** Título de la pantalla: al cambiar de pantalla, el foco va aquí (RNF-08). */
export function Titulo({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={cn('titular m-0 text-[28px] [overflow-wrap:anywhere] sm:text-[32px]', className)}>
      {children}
    </h1>
  )
}

/** Tarjeta clara con borde, como las secciones de los wireframes. */
export function Tarjeta({
  children,
  className,
  as: Etiqueta = 'section',
  ...resto
}: { children: ReactNode; className?: string; as?: 'section' | 'aside' | 'div'; 'aria-labelledby'?: string }) {
  return (
    <Etiqueta className={cn('flex min-w-0 flex-col gap-4 rounded-xl border border-linea bg-papel p-5 sm:p-6', className)} {...resto}>
      {children}
    </Etiqueta>
  )
}

/** Etiqueta, monto grande y texto de apoyo. `noche`: la cifra que importa, en bloque Noche. */
export function CifraGrande({
  etiqueta,
  children,
  apoyo,
  noche = false,
  ambar = false,
  className,
}: {
  etiqueta: string
  children: ReactNode
  apoyo?: ReactNode
  noche?: boolean
  ambar?: boolean
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 rounded-2xl px-6 py-[22px]', noche ? 'bloque' : 'border border-linea bg-papel', className)}>
      <h2 className="m-0 text-base font-bold">{etiqueta}</h2>
      <span className={cn('cifra text-[34px] [overflow-wrap:anywhere] sm:text-[40px]', ambar && 'text-ambar')}>{children}</span>
      {apoyo && <span className={cn('text-sm', noche ? 'text-noche-tenue' : 'text-tenue')}>{apoyo}</span>}
    </section>
  )
}

/** Lista de datos («Persona · Jorge»), con separadores. */
export function ListaDatos({ filas, className }: { filas: Array<[ReactNode, ReactNode] | false | null | undefined>; className?: string }) {
  const visibles = filas.filter(Boolean) as Array<[ReactNode, ReactNode]>
  return (
    <dl className={cn('m-0 flex flex-col', className)}>
      {visibles.map(([dt, dd], i) => (
        <div key={i} className={cn('flex flex-wrap justify-between gap-3 py-3', i < visibles.length - 1 && 'border-b border-linea')}>
          <dt className="text-tenue">{dt}</dt>
          <dd className="m-0 min-w-0 text-right">{dd}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Volver, como en el prototipo: el ‹ en un cuadro claro, junto al texto. */
export function Volver({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="group inline-flex min-h-11 items-center gap-2.5 self-start text-base font-bold text-noche no-underline hover:text-noche">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-[10px] border border-linea bg-papel group-hover:border-control">
        <ChevronLeft className="size-5" strokeWidth={2.5} />
      </span>
      {children}
    </Link>
  )
}

/** Mientras carga: el tatú del logo rodando (TatuCargando), después de 200 ms. */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <TatuCargando texto={texto} />
}

/** Lo mismo, en chico, para una lista que todavía no llega: el tatú solo rueda. */
export function CargandoEnLinea({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <span role="status" className="aparece-tarde inline-flex items-center gap-2.5">
      <TatuAnimado estado="pagando" variante="rodar" className="size-8" />
      {texto}
    </span>
  )
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border-2 border-rechazo bg-rechazo-fondo p-4 text-rechazo">
      <p className="m-0 flex items-start gap-2 font-bold">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        {mensaje}
      </p>
      {reintentar && (
        <Boton variante="contorno" tamano="chico" onClick={reintentar}>
          Intentar de nuevo
        </Boton>
      )}
    </div>
  )
}

/** Mensaje de error de un formulario, anunciado al lector de pantalla. */
export function MensajeError({ children, id }: { children: ReactNode; id?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="m-0 flex items-start gap-2 text-[15px] font-bold text-rechazo">
      <TriangleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** Aviso de algo que la API todavía no ofrece (rutas que responden 501). */
export function AvisoPendiente({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-xl border-2 border-dashed border-control bg-nota px-4 py-3 text-[15px]">
      {children}
    </p>
  )
}

/** Pastilla neutra («Borrador»). */
export function Pastilla({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 self-start rounded-full border border-control px-3 py-0.5 text-sm whitespace-nowrap', className)}>{children}</span>
}

/** `https://ilp.interledger-test.dev/ana` → `…/ana`, en mono, con la dirección completa al pasar. */
export function BilleteraCorta({ url, completa = false, className }: { url: string; completa?: boolean; className?: string }) {
  return (
    <span className={cn('mono text-sm [overflow-wrap:anywhere]', className)} title={url}>
      {completa ? url : billeteraCorta(url)}
    </span>
  )
}

/** Campo con su etiqueta encima y una ayuda opcional debajo. */
export function Campo({
  etiqueta,
  ayuda,
  mono = false,
  className,
  ...props
}: { etiqueta: ReactNode; ayuda?: ReactNode; mono?: boolean; className?: string } & Omit<ComponentProps<'input'>, 'className'>) {
  const generado = useId()
  const id = props.id ?? generado
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        className={cn(
          'min-h-12 w-full rounded-lg border-2 border-borde-campo bg-papel px-3 py-2.5 font-sans text-base text-noche',
          'disabled:opacity-60',
          mono && 'mono text-[15px]',
        )}
        {...props}
      />
      {ayuda && (
        <span id={`${id}-ayuda`} className="text-sm text-tenue">
          {ayuda}
        </span>
      )}
    </div>
  )
}
