// Cómo cobrar en efectivo en un punto de retiro y cuáles hay.
import { useSearchParams } from 'react-router'
import { Icono, PantallaCelular } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { formatearDiaMes, formatearMonto } from '@/lib/formato'
import { Aviso, Cabecera, ErrorCarga } from './comunes'
import { pagoDe, useResumen } from './datos'

const PASOS = ['Lleva tu cédula original.', 'El cajero digita tu número.', 'Confirmas con tu PIN y recibes el efectivo.']

export function DondeCobrar() {
  const [parametros] = useSearchParams()
  const programaId = parametros.get('programa')
  const { datos: r, error, cargando, recargar } = useResumen()
  const pago = programaId ? pagoDe(r, programaId) : undefined

  return (
    <PantallaCelular className="gap-4">
      <Cabecera
        volver={programaId ? `/beneficiario/subsidios/${programaId}` : '/beneficiario'}
        etiquetaVolver={programaId ? 'Volver al subsidio' : 'Volver a mis subsidios'}
        titulo="Cobrar en un punto"
        subtitulo={pago ? `${pago.programa.nombre} · ${formatearMonto(pago.monto)}` : undefined}
      />

      <section className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-linea bg-papel p-4">
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

      <section className="flex flex-col">
        <h2 className="m-0 mb-1.5 text-[17px] font-extrabold">Puntos de retiro</h2>
        {cargando && <TatuCargando texto="Buscando puntos…" tamano={72} className="py-6" />}
        {!r && error !== null && <ErrorCarga error={error} reintentar={recargar} />}
        {r && r.puntos.length === 0 && <Aviso className="border-t border-linea py-3.5">Todavía no hay puntos de retiro registrados.</Aviso>}
        {r && (
          <ul className="m-0 list-none p-0">
            {r.puntos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t border-linea py-3.5">
                <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-ambar">
                  <Icono className="size-[22px]" stroke="#13203A">
                    <path d="M4 10h16l-1-5H5z" />
                    <path d="M5 10v10h14V10" />
                    <path d="M10 20v-5h4v5" />
                  </Icono>
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{p.nombre}</span>
                  <span className="text-[15px] text-tinta-suave">{p.direccion}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pago && (
        <Aviso className="mt-auto">
          Te entregan el valor completo: {formatearMonto(pago.monto)}. Cóbralo antes del {formatearDiaMes(pago.vigenciaFin)}.
        </Aviso>
      )}
    </PantallaCelular>
  )
}
