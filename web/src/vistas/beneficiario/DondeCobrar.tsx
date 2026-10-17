// Cómo cobrar en efectivo en un punto de retiro y cuáles hay.
// Celular: una columna. Tablet y computador: los puntos en dos columnas; en el computador, «Así
// cobras» queda a la izquierda y los puntos a la derecha.
import { useSearchParams } from 'react-router'
import { Icono } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { formatearDiaMes, formatearMonto } from '@/lib/formato'
import { Aviso, Cabecera, ErrorCarga, PantallaBeneficiario } from './comunes'
import { pagoDe, useResumen } from './datos'

const PASOS = ['Lleva tu cédula original.', 'El cajero digita tu número.', 'Confirmas con tu PIN y recibes el efectivo.']

export function DondeCobrar() {
  const [parametros] = useSearchParams()
  const programaId = parametros.get('programa')
  const { datos: r, error, cargando, recargar } = useResumen()
  const pago = programaId ? pagoDe(r, programaId) : undefined
  const avisoFinal = pago && (
    <>
      Te entregan el valor completo: {formatearMonto(pago.monto)}. Cóbralo antes del {formatearDiaMes(pago.vigenciaFin)}.
    </>
  )

  return (
    <PantallaBeneficiario nombre={r?.persona.nombre} className="gap-4 pc:gap-6">
      <Cabecera
        volver={programaId ? `/beneficiario/subsidios/${programaId}` : '/beneficiario'}
        etiquetaVolver={programaId ? 'Volver al subsidio' : 'Volver a mis subsidios'}
        titulo="Cobrar en un punto"
        subtitulo={pago ? `${pago.programa.nombre} · ${formatearMonto(pago.monto)}` : undefined}
      />

      <div className="flex flex-1 flex-col gap-4 pc:grid pc:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] pc:items-start pc:gap-8">
        <div className="flex flex-col gap-4 max-pc:contents">
          <section className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-linea bg-papel p-4 pc:p-5">
            <h1 className="m-0 text-lg font-extrabold">Así cobras</h1>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {PASOS.map((paso, i) => (
                <li key={paso} className="flex items-center gap-3 text-base">
                  <span
                    className={`flex size-[30px] flex-none items-center justify-center rounded-full font-extrabold ${i === PASOS.length - 1 ? 'bg-ambar text-noche' : 'bg-noche text-arena'}`}
                  >
                    {i + 1}
                  </span>
                  {paso}
                </li>
              ))}
            </ol>
          </section>

          {r && !r.persona.tienePin && (
            <p className="m-0 rounded-[14px] bg-nota px-4 py-3.5 text-[15px] leading-[1.45]">
              Todavía no tienes PIN. Pídelo a la entidad que te asignó el subsidio antes de ir al punto.
            </p>
          )}
          {avisoFinal && <Aviso className="hidden pc:block">{avisoFinal}</Aviso>}
        </div>

        <section className="flex flex-col">
          <h2 className="m-0 mb-1.5 text-[17px] font-extrabold pc:text-xl">Puntos de retiro</h2>
          {cargando && <TatuCargando texto="Buscando puntos…" tamano={72} className="min-h-0 flex-none py-6" />}
          {!r && error !== null && <ErrorCarga error={error} reintentar={recargar} />}
          {r && r.puntos.length === 0 && <Aviso className="border-t border-linea py-3.5">Todavía no hay puntos de retiro registrados.</Aviso>}
          {r && (
            <ul className="m-0 list-none p-0 md:grid md:grid-cols-2 md:gap-x-6">
              {r.puntos.map((p) => (
                <li key={p.id} className="flex min-w-0 items-center gap-3 border-t border-linea py-3.5">
                  <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-ambar">
                    <Icono className="size-[22px]" stroke="#13203A">
                      <path d="M4 10h16l-1-5H5z" />
                      <path d="M5 10v10h14V10" />
                      <path d="M10 20v-5h4v5" />
                    </Icono>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] font-bold [overflow-wrap:anywhere]">{p.nombre}</span>
                    <span className="text-[15px] text-tinta-suave [overflow-wrap:anywhere]">{p.direccion}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {avisoFinal && <Aviso className="mt-auto pc:hidden">{avisoFinal}</Aviso>}
      </div>
    </PantallaBeneficiario>
  )
}
