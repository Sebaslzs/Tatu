import { Moon, Sun } from 'lucide-react'
import { useTema } from '@/lib/tema'
import { cn } from '@/lib/utils'

/**
 * Interruptor del modo oscuro (☀ / ☾). `sobreBloque`: dentro de una barra Noche, donde el borde y el
 * texto siguen al color del bloque.
 */
export function BotonTema({ sobreBloque = false, className }: { sobreBloque?: boolean; className?: string }) {
  const { oscuro, alternar } = useTema()
  const Icono = oscuro ? Sun : Moon
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oscuro}
      aria-label="Modo oscuro"
      title={oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
      className={cn(
        'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-transparent',
        sobreBloque ? 'border-noche-tenue text-bloque-texto hover:text-ambar' : 'border-control text-foreground hover:bg-nota',
        className,
      )}
    >
      <Icono aria-hidden className="size-5" />
    </button>
  )
}
