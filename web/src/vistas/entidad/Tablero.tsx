// Tablero del programa (HU-15, wireframe 04): autorizado, cobrado y lo que no ha salido, por canal,
// y la lista de cobros. Pausar y reanudar (HU-18). Se actualiza cada 5 s.
import { CreditCard, Pause, Play, ShoppingBag, Store, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { http, mensajeDeError } from '@/api/http'
import type { CobroResumen, Monto } from '@/api/tipos'
import { AvisoPendiente, Boton, BotonEnlace, CifraGrande, MensajeError, Tarjeta, Titulo, Volver } from '@/componentes/Comun'
import { EstadoCobro } from '@/componentes/EstadoCobro'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { Celda, Encabezado, Fila, FilaEncabezado, Tabla } from '@/componentes/Tabla'
import { montoCero, porcentaje, textoMonto } from '@/lib/montos'
import { formatFecha, formatHora, formatSegundos, plural } from '@/lib/textos'
import { cn } from '@/lib/utils'
import { AVISO_TABLERO, personaTexto } from './textos'
import type { DatosPrograma } from './useTablero'

type Filtro = 'todos' | 'pagados' | 'rechazados'

function filtrar(cobros: CobroResumen[], filtro: Filtro) {
  if (filtro === 'pagados') return cobros.filter((c) => c.estado === 'Pagado')
  if (filtro === 'rechazados') return cobros.filter((c) => c.estado === 'Rechazado' || c.estado === 'Fallido')
  return cobros
}

export default function Tablero({ datos, error, recargar }: { datos: DatosPrograma; error: string | null; recargar: () => Promise<unknown> }) {
  const { programa: p, tablero: t, tableroPendiente } = datos
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [enviando, setEnviando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const pausado = p.estado === 'Pausado'
  const autorizado: Monto | null = t?.autorizado ?? p.tope
  const pct = t ? porcentaje(t.cobrado, t.autorizado) : 0
  const cero = montoCero(p.moneda)

  const alternarPausa = async () => {
    setEnviando(true)
    setErrorAccion(null)
    try {
      await http.post(`/programas/${p.id}/${pausado ? 'reanudar' : 'pausar'}`)
      await recargar()
    } catch (e) {
      setErrorAccion(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const canales =
    p.tipo === 'bono'
      ? ([['En comercios', ShoppingBag, t?.porCanal.compra]] as const)
      : ([
          ['A la cuenta', CreditCard, t?.porCanal.cuenta],
          ['En un punto', Store, t?.porCanal.retiro],
        ] as const)

  return (
    <MarcoEntidad entidadId={p.entidadId}>
      <Volver to="/entidad">Tus programas</Volver>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-tenue">
            {p.nombre} · Vigencia: {formatFecha(p.vigenciaInicio)} al {formatFecha(p.vigenciaFin)}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Titulo>Tablero</Titulo>
            <span className={cn('rounded-full px-3 py-1 text-sm font-bold', pausado ? 'border-2 border-pagando bg-pagando-fondo text-pagando' : 'bg-azul text-white')}>
              {pausado ? 'Pausado' : 'Activo'}
            </span>
            <span className="text-sm text-tenue">Se actualiza cada 5 s</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <BotonEnlace variante="contorno" to={`/entidad/programas/${p.id}/beneficiarios`}>
            Beneficiarios
          </BotonEnlace>
          <Boton variante="contorno" onClick={() => void alternarPausa()} disabled={enviando}>
            {pausado ? <Play aria-hidden /> : <Pause aria-hidden />}
            {pausado ? 'Reanudar' : 'Pausar'}
          </Boton>
          <BotonEnlace variante="contorno" to={`/entidad/programas/${p.id}/cerrar`}>
            Cerrar programa
          </BotonEnlace>
        </div>
      </div>

      {p.permisoVencido && (
        <section role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-rechazo bg-rechazo-fondo p-5 text-rechazo">
          <h2 className="m-0 flex items-center gap-2 text-lg font-bold">
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            El permiso en tu banco venció
          </h2>
          <p className="m-0 text-noche">Mientras tanto, los cobros fallan sin mover dinero. Hay que aprobar de nuevo el permiso en tu banco por lo que falta del tope.</p>
        </section>
      )}
      {pausado && (
        <p role="status" className="m-0 rounded-xl border-2 border-pagando bg-pagando-fondo px-4 py-3 font-bold text-pagando">
          El programa está en pausa: los cobros nuevos se rechazan con «El programa no está recibiendo cobros».
        </p>
      )}
      {tableroPendiente && <AvisoPendiente>{AVISO_TABLERO}</AvisoPendiente>}
      <MensajeError>{errorAccion}</MensajeError>
      {error && <MensajeError>No pudimos actualizar el tablero: {error}. Lo que ves es de la última consulta.</MensajeError>}

      <div className="flex flex-wrap gap-4">
        <CifraGrande etiqueta="Autorizado" apoyo="El tope que aprobaste en tu banco">
          {textoMonto(autorizado)}
        </CifraGrande>
        <CifraGrande
          etiqueta="Cobrado"
          apoyo={
            t
              ? t.fuente === 'banco'
                ? `Leído del permiso en tu banco · ${plural(t.cobrosPagados, 'cobro')}`
                : `Calculado por la plataforma · ${plural(t.cobrosPagados, 'cobro')}`
              : 'Pendiente del tablero'
          }
        >
          {textoMonto(t?.cobrado)}
        </CifraGrande>
        <CifraGrande etiqueta="Todavía no ha salido" apoyo="Sigue en la cuenta del programa" noche ambar>
          {textoMonto(t?.noHaSalido)}
        </CifraGrande>
      </div>

      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Cobrado del tope"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${Math.round(pct)} %`}
          className="h-3.5 overflow-hidden rounded-full bg-nota"
        >
          <div className="h-full rounded-full bg-noche transition-[width]" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="flex justify-between text-sm text-tinta-suave">
          <span>Cobrado {t ? `${Math.round(pct)} %` : '—'}</span>
          <span>Tope {textoMonto(autorizado)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Tarjeta className="flex-[2_1_420px] gap-3 py-5">
          <h2 className="m-0 text-lg font-bold">Cobros por canal</h2>
          <div className="flex flex-wrap gap-3">
            {canales.map(([nombre, Icono, d]) => (
              <div key={nombre} className="flex flex-[1_1_180px] items-center gap-3 rounded-xl bg-nota px-3.5 py-3">
                <Icono aria-hidden className="size-[22px]" />
                <div className="flex flex-col">
                  <strong>{nombre}</strong>
                  <span className="text-sm text-tinta-suave">{d ? `${plural(d.cobros, 'cobro')} · ${textoMonto(d.monto)}` : t ? `0 cobros · ${textoMonto(cero)}` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </Tarjeta>
        <dl className="m-0 flex flex-[1_1_300px] flex-col gap-2">
          {(
            [
              [t ? textoMonto(t.giradoPorAdelantado) : '—', 'girado por adelantado'],
              [t?.reembolsoSegundos != null ? formatSegundos(t.reembolsoSegundos) : '—', 'reembolso al punto después del PIN'],
              [t?.sinCobrar ? plural(t.sinCobrar.cedulas, 'cédula') : '—', 'sin cobrar todavía'],
            ] as const
          ).map(([valor, texto]) => (
            <div key={texto} className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-nota px-4 py-3">
              <dt className="order-last text-sm text-tinta-suave">{texto}</dt>
              <dd className="cifra m-0 text-xl">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Tarjeta className="gap-3.5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold" id="titulo-cobros">
            Cobros
          </h2>
          {t && (
            <div role="group" aria-label="Mostrar" className="flex flex-wrap gap-1 rounded-xl bg-nota p-1">
              {(
                [
                  ['todos', `Todos (${t.cobros.length})`],
                  ['pagados', `Pagados (${t.cobrosPagados})`],
                  ['rechazados', `Rechazados y fallidos (${t.rechazadosYFallidos})`],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-lg border-0 px-3 font-sans text-sm',
                    filtro === valor ? 'bg-papel font-bold text-noche shadow-sm' : 'bg-transparent text-tinta-suave',
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
          )}
        </div>
        {t ? <TablaCobros cobros={filtrar(t.cobros, filtro)} /> : <p className="m-0 text-tenue">Los cobros aparecen aquí cuando la API tenga el tablero.</p>}
      </Tarjeta>
    </MarcoEntidad>
  )
}

export function TablaCobros({ cobros }: { cobros: CobroResumen[] }) {
  return (
    <Tabla aria-labelledby="titulo-cobros" className="min-w-[860px]">
      <thead>
        <FilaEncabezado>
          {['Referencia', 'Persona', 'Canal', 'Dónde'].map((h) => (
            <Encabezado key={h}>{h}</Encabezado>
          ))}
          <Encabezado className="text-right">Monto</Encabezado>
          <Encabezado>Estado</Encabezado>
          <Encabezado>Hora</Encabezado>
          <Encabezado>
            <span className="sr-only">Detalle</span>
          </Encabezado>
        </FilaEncabezado>
      </thead>
      <tbody>
        {cobros.length === 0 && (
          <Fila>
            <Celda colSpan={8} className="text-tenue">
              Todavía no hay cobros aquí.
            </Celda>
          </Fila>
        )}
        {cobros.map((c) => {
          // El rechazado lleva referencia en la base, pero la pantalla muestra «—»
          const sinReferencia = c.estado === 'Rechazado'
          return (
            <Fila key={c.id}>
              <Celda className={sinReferencia ? 'text-tenue' : 'mono text-sm'}>{sinReferencia ? '—' : c.referencia}</Celda>
              <Celda>{personaTexto(c)}</Celda>
              <Celda>{c.canal === 'cuenta' ? 'Cuenta' : c.canal === 'compra' ? 'Compra' : 'Punto'}</Celda>
              <Celda>{c.canal === 'cuenta' ? <span className="mono text-[13px]">{c.cuenta?.billeteraCorta ?? '—'}</span> : (c.punto?.nombre ?? '—')}</Celda>
              <Celda className="text-right">{textoMonto(c.monto)}</Celda>
              <Celda>
                <EstadoCobro estado={c.estado} motivo={c.motivo} />
              </Celda>
              <Celda className="text-tinta-suave">
                <time dateTime={c.creado}>{formatHora(c.creado, false)}</time>
              </Celda>
              <Celda>
                <Link to={`/entidad/cobros/${c.id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={`Ver el cobro de ${personaTexto(c)} de las ${formatHora(c.creado, false)}`}>
                  Ver
                </Link>
              </Celda>
            </Fila>
          )
        })}
      </tbody>
    </Tabla>
  )
}
