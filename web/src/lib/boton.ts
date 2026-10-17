// Botones del prototipo (alto mínimo de 44 px para tocar). Se usan en <button> y en <Link>.
import { cn } from '@/lib/utils'

const VARIANTES = {
  primario: 'border-transparent bg-azul text-white hover:bg-[#2752c4] hover:text-white',
  contorno: 'border-foreground bg-transparent text-foreground hover:bg-nota hover:text-foreground',
  suave: 'border-transparent bg-transparent text-foreground hover:bg-nota hover:text-foreground',
  peligro: 'border-transparent bg-rechazo-relleno text-white hover:bg-[#7f1d16] hover:text-white',
} as const

const TAMANOS = {
  normal: 'min-h-12 px-5 text-base',
  chico: 'min-h-11 px-3.5 text-[15px]',
  grande: 'min-h-14 px-6 text-lg',
} as const

export type VarianteBoton = keyof typeof VARIANTES
export type TamanoBoton = keyof typeof TAMANOS

export function claseBoton(variante: VarianteBoton = 'primario', tamano: TamanoBoton = 'normal', extra?: string): string {
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 font-sans font-bold whitespace-nowrap no-underline transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
    VARIANTES[variante],
    TAMANOS[tamano],
    extra,
  )
}
