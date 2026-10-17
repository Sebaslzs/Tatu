// Piezas de las pantallas del beneficiario: cabeceras, botones, bloque del monto, filas de datos y
// errores.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { PagoPendiente } from '@/api/beneficiario'
import { mensajeDeError } from '@/api/client'
import { Icono } from '@/componentes/piezas'
import { formatearDiaMes, formatearMonto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { nombreTipo } from './datos'

export function BotonVolver({ a, etiqueta }: { a: string; etiqueta: string }) {
  return (
    <Link
      to={a}
      aria-label={etiqueta}
      className="flex size-11 flex-none items-center justify-center rounded-xl border-[1.5px] border-linea bg-papel text-foreground hover:border-foreground"
    >
      <Icono className="size-6" stroke="var(--foreground)" strokeWidth={2.4}>
        <path d="M15 6l-6 6 6 6" />
      </Icono>
    </Link>
  )
}

/** Cabecera de una pantalla interna: volver, título y una línea de contexto. */
export function Cabecera({ volver, etiquetaVolver, titulo, subtitulo }: { volver: string; etiquetaVolver: string; titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <BotonVolver a={volver} etiqueta={etiquetaVolver} />
      <div className="flex min-w-0 flex-col">
        <span className="text-lg leading-[1.2] font-extrabold">{titulo}</span>
        {subtitulo && <span className="truncate text-sm text-tinta-suave">{subtitulo}</span>}
      </div>
    </div>
  )
}

const BASE_BOTON = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-center font-sans text-lg font-bold no-underline transition-colors'
const VARIANTES = {
  primario: 'border-0 bg-azul text-white hover:bg-[#2752c4] hover:text-white',
  contorno: 'border-2 border-foreground bg-transparent text-foreground hover:bg-papel hover:text-foreground',
}

export function BotonEnlace({ a, variante = 'primario', className, children }: { a: string; variante?: keyof typeof VARIANTES; className?: string; children: ReactNode }) {
  return (
    <Link to={a} className={cn(BASE_BOTON, VARIANTES[variante], className)}>
      {children}
    </Link>
  )
}

export function Boton({
  onClick,
  variante = 'primario',
  disabled,
  tipo = 'button',
  className,
  children,
}: {
  onClick?: () => void
  variante?: keyof typeof VARIANTES
  disabled?: boolean
  tipo?: 'button' | 'submit'
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className={cn(BASE_BOTON, VARIANTES[variante], 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50', className)}
    >
      {children}
    </button>
  )
}

export function IconoReloj({ color }: { color: string }) {
  return (
    <Icono className="size-4" stroke={color}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icono>
  )
}

export function Vence({ fecha, color, className }: { fecha: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[15px]', className)} style={{ color }}>
      <IconoReloj color={color} />
      Cóbralo antes del {formatearDiaMes(fecha)}
    </span>
  )
}

/** Bloque azul noche con el valor grande de un subsidio y hasta cuándo se cobra. */
export function BloqueMonto({ pago }: { pago: PagoPendiente }) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] bg-noche p-5 text-arena">
      <span className="text-base">{nombreTipo(pago)}</span>
      <span className="ancho text-[50px] leading-[1.05] font-extrabold [overflow-wrap:anywhere] max-[380px]:text-[42px]">
        {formatearMonto(pago.monto)}
      </span>
      <Vence fecha={pago.vigenciaFin} color="#F6A623" className="mt-1" />
    </div>
  )
}

export function FilasDatos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="m-0 flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-linea bg-papel p-4">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex justify-between gap-3 text-base">
          <dt className="text-tinta-suave">{etiqueta}</dt>
          <dd className="m-0 text-right font-semibold [overflow-wrap:anywhere]">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ErrorCarga({ error, reintentar }: { error: unknown; reintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl bg-error-fondo p-4 text-error">
      <span className="text-base font-bold">{mensajeDeError(error)}</span>
      <button
        type="button"
        onClick={reintentar}
        className="min-h-11 cursor-pointer rounded-xl border-2 border-error bg-transparent px-4 font-sans text-base font-bold text-error"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}

export function Aviso({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[15px] leading-[1.45] text-tinta-suave', className)}>{children}</p>
}

export function IconoEnlace({ color, className = 'size-[22px]' }: { color: string; className?: string }) {
  return (
    <Icono className={className} stroke={color}>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </Icono>
  )
}
