// Tabla con scroll horizontal en pantallas angostas (las de shadcn, sin dependencias).
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Tabla({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-[15px]', className)} {...props} />
    </div>
  )
}

export function Fila({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-linea last:border-b-0', className)} {...props} />
}

export function Encabezado({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-2 py-2.5 align-bottom font-bold whitespace-nowrap', className)} {...props} />
}

export function Celda({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-2 py-3 align-middle', className)} {...props} />
}

/** Fila de encabezado con la línea gruesa del prototipo. */
export function FilaEncabezado({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b-2 border-foreground', className)} {...props} />
}
