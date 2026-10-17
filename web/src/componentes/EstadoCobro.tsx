// Etiqueta del estado del cobro: siempre con ícono y texto, nunca solo color.
import { Ban, Check, Clock, Landmark, LoaderCircle } from 'lucide-react'
import type { EstadoCobro as Estado, Motivo } from '@/api/tipos'
import { MOTIVO_CORTO, NOMBRE_ESTADO_COBRO } from '@/lib/textos'
import { cn } from '@/lib/utils'

const ESTILO: Record<Estado, string> = {
  Solicitado: 'border-control bg-background text-foreground',
  PorConfirmar: 'border-control bg-background text-foreground',
  Pagando: 'border-pagando-fondo bg-pagando-fondo text-pagando',
  Pagado: 'border-pagado-relleno bg-pagado-relleno text-white',
  Rechazado: 'border-rechazo-fondo bg-rechazo-fondo text-rechazo',
  Fallido: 'border-rechazo-fondo bg-rechazo-fondo text-rechazo',
}

const ICONO = {
  Solicitado: Clock,
  PorConfirmar: Clock,
  Pagando: LoaderCircle,
  Pagado: Check,
  Rechazado: Ban,
  Fallido: Landmark,
} satisfies Record<Estado, unknown>

export function EstadoCobro({ estado, motivo, grande = false }: { estado: Estado; motivo?: Motivo | null; grande?: boolean }) {
  const Icono = ICONO[estado]
  const corto = motivo ? (MOTIVO_CORTO[motivo.codigo] ?? motivo.mensaje) : null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap',
        grande ? 'px-3 py-1 text-[15px] font-bold' : 'px-2.5 py-0.5 text-sm font-semibold',
        ESTILO[estado],
      )}
    >
      <Icono aria-hidden className={cn(grande ? 'size-4' : 'size-3.5', estado === 'Pagando' && 'animate-spin motion-reduce:animate-none')} strokeWidth={2.5} />
      {NOMBRE_ESTADO_COBRO[estado]}
      {corto && ` · ${corto}`}
    </span>
  )
}
