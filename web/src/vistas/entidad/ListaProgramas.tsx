// Pantalla E0 del prototipo: tus programas, con lo cobrado y lo que no ha salido de cada uno.
import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { http } from '@/api/http'
import type { Moneda, Programa, Tablero } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { BotonEnlace, Cargando, ErrorCarga, Titulo } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { sumarMontos, textoMonto } from '@/lib/montos'
import { rutaDelPrograma, tienePermiso } from '@/lib/pantallas'
import { formatFecha, NOMBRE_ESTADO_PROGRAMA } from '@/lib/textos'
import { cn } from '@/lib/utils'

interface Fila {
  programa: Programa
  tablero: Tablero | null
}

const COP: Moneda = { assetCode: 'COP', assetScale: 2 }

function Estado({ estado }: { estado: Programa['estado'] }) {
  const clase =
    estado === 'Activo'
      ? 'bg-azul text-white'
      : estado === 'Pausado' || estado === 'EsperandoAprobacion'
        ? 'border-2 border-pagando bg-pagando-fondo text-pagando'
        : 'bg-nota text-tinta-suave'
  return <span className={cn('self-start rounded-full px-2.5 py-1 text-[13px] font-bold', clase)}>{NOMBRE_ESTADO_PROGRAMA[estado]}</span>
}

/** El tablero de un programa con permiso; null si la API todavía no lo tiene (501) o falla: la fila muestra «—». */
async function tableroDe(p: Programa): Promise<Tablero | null> {
  if (!tienePermiso(p.estado)) return null
  return http.get<Tablero>(`/programas/${p.id}/tablero`).catch(() => null)
}

export default function ListaProgramas() {
  const { datos, error, recargar } = usePolling<Fila[]>(async () => {
    const programas = await http.get<Programa[]>('/programas')
    return Promise.all(programas.map(async (programa) => ({ programa, tablero: await tableroDe(programa) })))
  }, 5000)

  const filas = datos ?? []
  const moneda = filas[0]?.programa.moneda ?? COP
  const activos = filas.filter((f) => f.programa.estado === 'Activo').length
  const conTablero = filas.some((f) => f.tablero)
  const suma = (campo: 'cobrado' | 'giradoPorAdelantado') => textoMonto(sumarMontos(moneda, filas.map((f) => f.tablero?.[campo])))
  // Todos son de la misma entidad en la demo: el encabezado muestra la del primero
  const entidadId = filas[0]?.programa.entidadId

  return (
    <MarcoEntidad entidadId={entidadId}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-tenue">Entidad</span>
          <Titulo>Tus programas</Titulo>
        </div>
        <BotonEnlace to="/entidad/programas/nuevo">
          <Plus aria-hidden />
          Nuevo programa
        </BotonEnlace>
      </div>

      {error && !datos && <ErrorCarga mensaje={error} reintentar={() => void recargar()} />}
      {!datos && !error && <Cargando />}

      {datos && (
        <>
          <div className="flex flex-wrap gap-4">
            <section className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl border border-linea bg-papel px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Programas activos</h2>
              <span className="cifra text-[34px] sm:text-[38px]">{activos}</span>
            </section>
            <section className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl border border-linea bg-papel px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Cobrado</h2>
              <span className="cifra text-[34px] [overflow-wrap:anywhere] sm:text-[38px]">{conTablero ? suma('cobrado') : '—'}</span>
              <span className="text-sm text-tenue">En todos tus programas</span>
            </section>
            <section className="bloque flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Girado por adelantado</h2>
              <span className="cifra text-[34px] text-ambar sm:text-[38px]">{conTablero ? suma('giradoPorAdelantado') : '—'}</span>
              <span className="text-sm text-noche-tenue">La plata sale solo cuando alguien cobra</span>
            </section>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="m-0 text-xl font-bold">Programas</h2>
            {filas.length === 0 && (
              <p className="m-0 rounded-xl border-2 border-dashed border-linea px-4 py-4 text-tenue">Todavía no hay programas. Crea el primero.</p>
            )}
            {[...filas].reverse().map(({ programa: p, tablero: t }) => (
              <Link
                key={p.id}
                to={rutaDelPrograma(p.id, p.estado)}
                className="grid grid-cols-1 items-center gap-4 rounded-[18px] border border-linea bg-papel px-5 py-[18px] text-foreground no-underline hover:border-control hover:text-foreground md:grid-cols-3 pc:grid-cols-[minmax(220px,2fr)_repeat(3,minmax(120px,1fr))_auto]"
              >
                <div className="flex flex-col gap-1.5 md:col-span-2 md:row-start-1 pc:col-span-1 pc:row-start-auto">
                  <span className="text-[19px] font-bold">{p.nombre}</span>
                  <span className="text-[15px] text-tenue">
                    {formatFecha(p.vigenciaInicio)} al {formatFecha(p.vigenciaFin)}
                    {!tienePermiso(p.estado) && ' · sin aprobar'}
                  </span>
                  <Estado estado={p.estado} />
                </div>
                {(
                  [
                    ['Autorizado', t?.autorizado ?? (tienePermiso(p.estado) ? p.tope : null)],
                    ['Cobrado', t?.cobrado],
                    ['Todavía no ha salido', t?.noHaSalido],
                  ] as const
                ).map(([etiqueta, valor]) => (
                  <div key={etiqueta}>
                    <div className="text-sm text-tenue">{etiqueta}</div>
                    <div className="text-[22px] font-bold">{textoMonto(valor)}</div>
                  </div>
                ))}
                {/* En tablet el enlace sube al lado del nombre y las tres cifras quedan en una fila */}
                <span className="inline-flex items-center gap-1.5 font-bold text-enlace md:col-start-3 md:row-start-1 md:self-start md:justify-self-end pc:col-start-auto pc:row-start-auto pc:self-auto pc:justify-self-auto">
                  {p.estado === 'Cerrado' ? 'Ver cierre' : tienePermiso(p.estado) ? 'Ver tablero' : 'Continuar'}
                  <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2.4} />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </MarcoEntidad>
  )
}
