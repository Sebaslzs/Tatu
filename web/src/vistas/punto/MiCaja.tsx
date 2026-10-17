// Mi caja: cuánto efectivo entregó el punto, cuánto le reembolsaron (todo, porque solo se entrega al
// ver «Pagado») y en cuánto tiempo, más el historial con filtros. Se actualiza cada 5 s.
import { ChevronRight, CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { cajaDelPunto, cobrosDelPunto, type PeriodoCaja } from '@/api/punto'
import { usePolling } from '@/api/usePolling'
import { BilleteraCorta, Cargando, CargandoEnLinea, CifraGrande, ErrorCarga } from '@/componentes/Comun'
import { EstadoCobro } from '@/componentes/EstadoCobro'
import { PantallaCelular } from '@/componentes/piezas'
import { textoMonto } from '@/lib/montos'
import { formatFechaHora, formatSegundos, plural } from '@/lib/textos'
import { useEnComputador } from '@/lib/useEnComputador'
import { cn } from '@/lib/utils'
import { cifrasCaja, usePunto } from './datos'
import { Cabecera, PantallaPuntoEscritorio } from './piezas'

const PERIODOS: Array<[PeriodoCaja, string]> = [
  ['hoy', 'Hoy'],
  ['7d', 'Últimos 7 días'],
  ['todo', 'Todo'],
]

type Filtro = 'todos' | 'pagados' | 'rechazados'
const FILTROS: Array<[Filtro, string]> = [
  ['todos', 'Todos'],
  ['pagados', 'Pagados'],
  ['rechazados', 'Rechazados y fallidos'],
]

function Botonera<T extends string>({ opciones, valor, cambiar, etiqueta }: { opciones: Array<[T, string]>; valor: T; cambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1 self-start rounded-xl bg-nota p-1">
      {opciones.map(([v, texto]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => cambiar(v)}
          className={cn(
            'min-h-10 cursor-pointer rounded-lg border-0 px-3.5 font-sans text-[15px]',
            valor === v ? 'bg-background font-bold text-foreground shadow-sm' : 'bg-transparent text-tinta-suave hover:text-foreground',
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

export function MiCaja() {
  const punto = usePunto()
  const computador = useEnComputador()
  const [periodo, setPeriodo] = useState<PeriodoCaja>('hoy')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const caja = usePolling(() => cajaDelPunto(punto.id, periodo), 5000, true, { clave: `${punto.id}-${periodo}` })
  const lista = usePolling(() => cobrosDelPunto(punto.id, periodo), 5000, true, { clave: `${punto.id}-${periodo}` })

  const datos = caja.datos
  const c = cifrasCaja(datos)
  // La sede de un comercio no entrega efectivo: recibe el pago de los bonos
  const comercio = (datos?.punto.tipo ?? punto.datos?.tipo) === 'compra'
  const cobros = (lista.datos ?? []).filter((x) =>
    filtro === 'pagados' ? x.estado === 'Pagado' : filtro === 'rechazados' ? x.estado === 'Rechazado' || x.estado === 'Fallido' : true,
  )

  const contenido = (
    <>
      <Botonera opciones={PERIODOS} valor={periodo} cambiar={setPeriodo} etiqueta="Periodo" />

      {!datos && caja.error && <ErrorCarga mensaje={caja.error} reintentar={() => void caja.recargar()} />}
      {!datos && !caja.error && <Cargando texto="Contando tu caja…" />}

      {datos && (
        <>
          <div className="flex flex-wrap gap-4">
            <CifraGrande
              etiqueta={comercio ? 'Vendiste con bonos' : 'Entregaste en efectivo'}
              apoyo={comercio ? plural(c.pagados, 'compra con bono', 'compras con bono') : plural(c.pagados, 'retiro pagado', 'retiros pagados')}
            >
              {c.entregado}
            </CifraGrande>
            <CifraGrande
              etiqueta={comercio ? 'Te pagaron los bonos' : 'Te reembolsaron'}
              noche
              apoyo={
                <span className="inline-flex items-center gap-1.5">
                  <CircleCheck aria-hidden className="size-4" />
                  {comercio ? 'Cada bono ya está en tu billetera' : 'Todo lo que entregaste ya está en tu billetera'}
                </span>
              }
            >
              {c.reembolsado}
            </CifraGrande>
            {!comercio && c.hayVentas && (
              <CifraGrande etiqueta="Vendiste con retiros" apoyo="Compras pagadas con el subsidio: listas para facturar">
                {c.vendido}
              </CifraGrande>
            )}
            {!comercio && (
              <CifraGrande etiqueta="Pusiste por adelantado" apoyo="Nunca giras plata antes de que te paguen" noche ambar>
                {c.adelantado}
              </CifraGrande>
            )}
          </div>

          {c.enCamino && (
            <p role="status" className="m-0 flex items-start gap-2 rounded-xl border-2 border-pagando bg-pagando-fondo px-4 py-3 font-bold text-pagando">
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              {c.pendiente} en camino a tu billetera: no entregues {comercio ? 'esa compra' : 'ese efectivo'} hasta ver «Pagado».
            </p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-tinta-suave">
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="size-4" />
              {datos.reembolsoSegundos === null ? 'Todavía no hay reembolsos en este periodo' : `Reembolso en promedio: ${formatSegundos(datos.reembolsoSegundos)} después del PIN`}
            </span>
            <span>
              {plural(c.rechazados, 'rechazado')} · {c.enCurso} en curso
            </span>
            <span>
              Tu billetera: <BilleteraCorta url={datos.punto.billetera} />
            </span>
          </div>
        </>
      )}

      <section aria-labelledby="titulo-historial" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-historial" className="m-0 text-xl font-bold">
            Historial
          </h2>
          <Botonera opciones={FILTROS} valor={filtro} cambiar={setFiltro} etiqueta="Filtrar por estado" />
        </div>
        <p className="m-0 text-sm text-tenue">Cada pago aparece en tu billetera con su referencia (SUB-…).</p>
        {lista.error && !lista.datos && <ErrorCarga mensaje={lista.error} reintentar={() => void lista.recargar()} />}
        {cobros.length ? (
          <ul className={cn('m-0 grid list-none gap-2 p-0 md:grid-cols-2', computador && 'grid-cols-2')}>
            {cobros.map((x) => (
              <li key={x.id}>
                <Link
                  to={`/punto/cobros/${x.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-linea bg-papel px-3.5 py-2.5 text-foreground no-underline hover:border-foreground hover:text-foreground"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <strong>{x.persona.nombre}</strong>
                      {x.monto && <span className="text-tinta-suave">{textoMonto(x.monto)}</span>}
                      {x.estado !== 'Rechazado' && <span className="mono text-sm text-tenue">{x.referencia}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <EstadoCobro estado={x.estado} motivo={x.motivo} />
                      <time dateTime={x.creado} className="text-sm text-tenue">
                        {formatFechaHora(x.creado)}
                      </time>
                    </span>
                    <span className="text-sm text-tenue">{x.programa.nombre}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-linea px-4 py-5 text-center text-tenue">
            {lista.datos ? 'No hay cobros en este periodo.' : <CargandoEnLinea />}
          </div>
        )}
      </section>
    </>
  )

  if (computador) {
    return (
      <PantallaPuntoEscritorio subtitulo={punto.nombre} titulo="Mi caja">
        {contenido}
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular amplia className="gap-[18px]">
      <Cabecera volver="/punto" etiquetaVolver="Volver al inicio del punto" titulo="Mi caja" subtitulo={punto.nombre} />
      <h1 className="sr-only">Mi caja</h1>
      {contenido}
    </PantallaCelular>
  )
}
