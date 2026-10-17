// Cada transición del cobro, en orden, con hora (hh:mm:ss) y texto (wireframe 05).
import type { EstadoCobro, EventoCobro } from '@/api/tipos'
import { formatHora, NOMBRE_ESTADO_COBRO } from '@/lib/textos'
import { cn } from '@/lib/utils'

const nombre = (estado: string) => NOMBRE_ESTADO_COBRO[estado as EstadoCobro] ?? estado

export function LineaDeTiempo({ eventos }: { eventos: EventoCobro[] }) {
  if (eventos.length === 0) return <p className="m-0 text-tenue">Todavía no hay eventos.</p>
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {eventos.map((ev, i) => {
        const ultimo = i === eventos.length - 1
        const titulo = ev.desde && ev.hacia ? `${nombre(ev.desde)} → ${nombre(ev.hacia)}` : nombre(ev.hacia ?? ev.desde ?? 'Evento')
        return (
          <li key={i} className="flex gap-4">
            <div aria-hidden className="flex flex-col items-center">
              <span className={cn('size-3.5 shrink-0 rounded-full border-2 border-foreground', ultimo ? 'bg-foreground' : 'bg-background')} />
              {!ultimo && <span className="w-0.5 flex-1 bg-linea" />}
            </div>
            <div className={cn('flex flex-1 flex-col gap-1', !ultimo && 'pb-[22px]')}>
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{titulo}</strong>
                <time dateTime={ev.creado} className="text-sm text-tenue">
                  {formatHora(ev.creado)}
                </time>
              </div>
              {ev.texto && <span className="text-[15px] text-tinta-suave">{ev.texto}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
