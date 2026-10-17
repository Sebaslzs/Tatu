// «Cobros de hoy» del punto: filas en el celular (P0) y tabla en el computador (PD0). Cada cobro
// abre su pantalla, que muestra lo que diga la API (PIN, pagando o el resultado).
import { Link } from 'react-router'
import type { CobroResumen } from '@/api/tipos'
import { EstadoCobro } from '@/componentes/EstadoCobro'
import { textoMonto } from '@/lib/montos'
import { formatHora } from '@/lib/textos'
import { cn } from '@/lib/utils'
import { detalleCobro, lineaCobro, personaTexto } from './datos'

const textoVacio = (cobros: CobroResumen[] | undefined, cargando: boolean) =>
  cobros ? 'Todavía no hay cobros hoy.' : cargando ? 'Cargando…' : 'No pudimos cargar los cobros de hoy.'

/** P0: los cobros de hoy en filas con línea arriba. */
export function ListaCobrosHoy({ cobros, cargando }: { cobros: CobroResumen[] | undefined; cargando: boolean }) {
  if (!cobros?.length) return <p className="m-0 mt-1.5 border-t border-linea py-3 text-tinta-suave">{textoVacio(cobros, cargando)}</p>
  return (
    <ul className="m-0 mt-1.5 list-none p-0">
      {cobros.map((c) => (
        <li key={c.id}>
          <Link to={`/punto/cobros/${c.id}`} className="flex items-center gap-3 border-t border-linea py-3 text-noche no-underline hover:text-noche">
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-base font-bold">{personaTexto(c)}</span>
              <span className="text-sm text-tinta-suave">{lineaCobro(c)}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="text-base font-bold">{textoMonto(c.monto)}</span>
              <EstadoCobro estado={c.estado} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const TH = 'px-3 py-2.5 text-left text-sm font-semibold text-tinta-suave'
const TD = 'border-t border-linea px-3 py-3.5 text-left align-middle'

/** PD0: los cobros de hoy en tabla. */
export function TablaCobrosHoy({ cobros, cargando }: { cobros: CobroResumen[] | undefined; cargando: boolean }) {
  return (
    <div className="relative min-w-0 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-base">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Referencia
            </th>
            <th scope="col" className={TH}>
              Beneficiario
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              Valor
            </th>
            <th scope="col" className={TH}>
              Estado
            </th>
            <th scope="col" className={TH}>
              Hora
            </th>
          </tr>
        </thead>
        <tbody>
          {!cobros?.length && (
            <tr>
              <td colSpan={5} className={cn(TD, 'text-tinta-suave')}>
                {textoVacio(cobros, cargando)}
              </td>
            </tr>
          )}
          {cobros?.map((c) => {
            const detalle = detalleCobro(c)
            return (
              <tr key={c.id}>
                <td className={cn(TD, 'whitespace-nowrap')}>
                  <Link
                    to={`/punto/cobros/${c.id}`}
                    className="font-bold text-noche hover:text-azul"
                    aria-label={c.estado === 'Rechazado' ? `Ver el cobro rechazado de ${personaTexto(c)}` : undefined}
                  >
                    {c.estado === 'Rechazado' ? '—' : c.referencia}
                  </Link>
                </td>
                <td className={TD}>{personaTexto(c)}</td>
                <td className={cn(TD, 'text-right whitespace-nowrap')}>
                  <b>{textoMonto(c.monto)}</b>
                </td>
                <td className={TD}>
                  <EstadoCobro estado={c.estado} />
                  {detalle && <div className="mt-1 text-sm text-tinta-suave">{detalle}</div>}
                </td>
                <td className={cn(TD, 'whitespace-nowrap')}>
                  <time dateTime={c.creado}>{formatHora(c.creado, false)}</time>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
