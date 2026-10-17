// Tabla con scroll horizontal en pantallas angostas (las de shadcn, sin dependencias).
// `apilada`: por debajo de 768 px cada fila se vuelve una tarjeta y cada celda muestra su encabezado
// (la `etiqueta` de <Celda>); desde 768 px es una tabla normal. Los estilos están en index.css.
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Tabla({ className, apilada = false, ...props }: ComponentProps<'table'> & { apilada?: boolean }) {
  return (
    // relative: los textos sr-only de las celdas quedan dentro del scroll y no ensanchan la página
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-[15px]', apilada && 'tabla-apilada', className)} {...props} />
    </div>
  )
}

export function Fila({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-linea last:border-b-0', className)} {...props} />
}

export function Encabezado({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-2 py-2.5 align-bottom font-bold whitespace-nowrap', className)} {...props} />
}

/**
 * Celda. En una tabla `apilada`, `etiqueta` es lo que se lee a su izquierda en el celular (el texto de
 * su encabezado) y `titulo` la vuelve el título de la tarjeta.
 */
export function Celda({ className, etiqueta, titulo = false, ...props }: ComponentProps<'td'> & { etiqueta?: string; titulo?: boolean }) {
  return <td data-etiqueta={etiqueta} className={cn('px-2 py-3 align-middle', titulo && 'titulo-fila', className)} {...props} />
}

/** Fila de encabezado con la línea gruesa del prototipo. */
export function FilaEncabezado({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b-2 border-foreground', className)} {...props} />
}
