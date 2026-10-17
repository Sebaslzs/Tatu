// Un subsidio por cobrar y cómo cobrarlo: a la cuenta verificada, con la cédula como llave Bre-B o
// en un punto de retiro.
import { useParams } from 'react-router'
import { Icono, PantallaCelular } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { formatearMonto } from '@/lib/formato'
import { Aviso, BloqueMonto, BotonEnlace, Cabecera, ErrorCarga, IconoEnlace } from './comunes'
import { pagoDe, useResumen } from './datos'

export function Subsidio() {
  const { programaId = '' } = useParams()
  const { datos: r, error, cargando, recargar } = useResumen()
  const pago = pagoDe(r, programaId)
  const cuenta = r?.cuenta?.estado === 'Verificada' ? r.cuenta : null
  const recibeCobros = pago?.programa.estado === 'Activo'

  return (
    <PantallaCelular className="gap-4">
      <Cabecera
        volver="/beneficiario"
        etiquetaVolver="Volver a mis subsidios"
        titulo={pago?.programa.nombre ?? 'Subsidio'}
        subtitulo={pago ? (recibeCobros ? 'Disponible' : 'Por ahora no recibe cobros') : undefined}
      />

      {cargando && <TatuCargando />}
      {!r && error !== null && <ErrorCarga error={error} reintentar={recargar} />}
      {r && !pago && (
        <>
          <p className="m-0 text-[17px]">Este subsidio ya no está por cobrar.</p>
          <BotonEnlace a="/beneficiario">Ver mis subsidios</BotonEnlace>
        </>
      )}

      {pago && (
        <>
          <BloqueMonto pago={pago} />

          {cuenta ? (
            <>
              <h1 className="m-0 mt-1 text-[17px] font-extrabold">¿Cómo quieres cobrarlo?</h1>
              {recibeCobros ? (
                <BotonEnlace a={`/beneficiario/cobrar/${programaId}`}>Cobrar {formatearMonto(pago.monto)} a mi cuenta</BotonEnlace>
              ) : (
                <ProgramaSinCobros />
              )}
              <div className="-mt-1 flex items-start gap-2.5 text-base leading-[1.4]">
                <Icono className="mt-px size-5" stroke="var(--color-enlace)">
                  <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                  <path d="M9 12l2 2 4-4" />
                </Icono>
                <span>
                  Llega en segundos a tu cuenta <b>{cuenta.llave ?? cuenta.billeteraCorta}</b>, ya verificada. No necesitas PIN.
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-linea bg-papel p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-azul-suave">
                  <IconoEnlace color="var(--color-enlace)" />
                </span>
                <h1 className="m-0 text-lg leading-[1.25] font-extrabold">Enlaza tu cuenta para cobrar aquí</h1>
              </div>
              <span className="text-base leading-[1.4] text-tinta-suave">Lo haces una sola vez. Después cobras con un toque, sin ir a ningún lado.</span>
              <BotonEnlace a={`/beneficiario/cuenta?programa=${programaId}`}>Enlazar mi cuenta</BotonEnlace>
              {recibeCobros && (
                <BotonEnlace a={`/beneficiario/cobrar/${programaId}`} variante="contorno">
                  Cobrar con mi cédula como llave Bre-B
                </BotonEnlace>
              )}
            </div>
          )}

          <BotonEnlace a={`/beneficiario/puntos?programa=${programaId}`} variante="contorno">
            Prefiero cobrar en un punto
          </BotonEnlace>
          <Aviso className="mt-auto">En un punto te entregan el valor completo en efectivo con tu cédula y tu PIN.</Aviso>
        </>
      )}
    </PantallaCelular>
  )
}

function ProgramaSinCobros() {
  return (
    <p className="m-0 rounded-[14px] bg-nota px-4 py-3.5 text-[15px] leading-[1.45]">
      La entidad todavía no habilita los cobros de este programa. Vuelve a intentarlo más tarde.
    </p>
  )
}
