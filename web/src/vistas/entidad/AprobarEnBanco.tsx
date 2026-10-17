// «Aprueba una sola vez en tu banco» (HU-04, HU-05): pide el permiso con tope y lleva a la Test
// Wallet. El banco vuelve por /callback/:id, que redirige aquí con ?resultado=.
// Se navega en la misma pestaña: el rol vive en sessionStorage y una pestaña nueva no lo tendría.
import { Clock, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { http, mensajeDeError } from '@/api/http'
import type { Autorizacion, Liquidacion, Programa } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { BilleteraCorta, Boton, BotonEnlace, Cargando, ErrorCarga, ListaDatos, MensajeError, Tarjeta, Titulo } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { PasosPrograma } from '@/componentes/PasosPrograma'
import { textoMonto } from '@/lib/montos'
import { tienePermiso } from '@/lib/pantallas'
import { formatFecha, plural } from '@/lib/textos'

const DIEZ_MINUTOS = 10 * 60_000

const MENSAJE_RESULTADO: Record<string, string> = {
  rechazado: 'No aprobaste el permiso; puedes intentarlo de nuevo.',
  vencido: 'La aprobación venció a los 10 minutos; puedes intentarlo de nuevo.',
  invalido: 'No pudimos confirmar la respuesta del banco; intenta de nuevo.',
}

interface Datos {
  programa: Programa
  liquidacion: Liquidacion | null
}

export default function AprobarEnBanco() {
  const { id = '' } = useParams()
  const [busqueda, setBusqueda] = useSearchParams()
  const resultado = busqueda.get('resultado')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consulta = usePolling<Datos>(
    async () => {
      const [programa, liquidacion] = await Promise.all([
        http.get<Programa>(`/programas/${id}`),
        http.get<Liquidacion>(`/programas/${id}/liquidacion`).catch(() => null),
      ])
      return { programa, liquidacion }
    },
    2000,
    true,
    { clave: id, maxMs: DIEZ_MINUTOS },
  )
  const programa = consulta.datos?.programa
  const liquidacion = consulta.datos?.liquidacion

  if (programa && tienePermiso(programa.estado)) return <Navigate to={`/entidad/programas/${id}`} replace />

  const aprobar = async () => {
    setEnviando(true)
    setError(null)
    if (resultado) setBusqueda({}, { replace: true })
    try {
      const r = await http.post<Autorizacion>(`/programas/${id}/autorizar`)
      location.assign(r.redirect)
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  const cancelar = async () => {
    setEnviando(true)
    try {
      await http.post(`/programas/${id}/cancelar-aprobacion`)
      await consulta.recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const esperando = programa?.estado === 'EsperandoAprobacion'
  const tope = programa?.tope ?? liquidacion?.total ?? null
  const mensajeResultado = resultado && resultado !== 'aprobado' ? (MENSAJE_RESULTADO[resultado] ?? MENSAJE_RESULTADO.rechazado) : null

  return (
    <MarcoEntidad entidadId={programa?.entidadId}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-tenue">{programa?.nombre ?? ' '}</span>
          <Titulo>Aprueba una sola vez en tu banco</Titulo>
        </div>
        {programa && <PasosPrograma estado={programa.estado} />}
      </div>

      {mensajeResultado && !esperando && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border-2 border-noche bg-papel px-5 py-4">
          <TriangleAlert aria-hidden className="size-6 shrink-0" />
          <div className="flex flex-col gap-1">
            <strong className="text-[17px]">{mensajeResultado}</strong>
            <span className="text-[15px] text-tinta-suave">Tu configuración se conservó y el programa volvió a Borrador.</span>
          </div>
        </div>
      )}

      {consulta.error && !consulta.datos && <ErrorCarga mensaje={consulta.error} reintentar={() => void consulta.recargar()} />}
      {!consulta.datos && !consulta.error && <Cargando />}

      {programa && (
        <div className="flex flex-wrap items-start gap-6">
          <Tarjeta className="flex-[999_1_560px] gap-[18px]">
            <h2 className="m-0 text-xl font-bold">El permiso que vas a aprobar</h2>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-tenue">Tope total</span>
              <span className="cifra text-[40px] [overflow-wrap:anywhere] sm:text-[48px]">{textoMonto(tope)}</span>
              {liquidacion && <span className="text-[15px] text-tinta-suave">La suma de la liquidación: {plural(liquidacion.cedulas, 'cédula')}</span>}
            </div>
            <ListaDatos
              className="border-t border-linea text-[15px]"
              filas={[
                ['Cuenta que paga', <BilleteraCorta key="b" url={programa.billetera} completa />],
                ['A quién puede pagar', 'Cuentas verificadas de beneficiarios y puntos registrados'],
                ['Vigencia', `${formatFecha(programa.vigenciaInicio)} – ${formatFecha(programa.vigenciaFin)}`],
              ]}
            />
            <p className="m-0 rounded-lg bg-nota px-3.5 py-3 text-[15px]">
              El permiso fija un límite de desembolso: no reserva ni separa la plata. Nada sale de tu cuenta hasta que alguien cobra.
            </p>

            <MensajeError>{error}</MensajeError>

            {!esperando && (
              <div className="flex flex-wrap gap-3">
                <Boton tamano="grande" className="flex-[1_1_240px]" onClick={() => void aprobar()} disabled={enviando}>
                  {enviando ? 'Abriendo tu banco…' : 'Aprobar en mi banco'}
                </Boton>
                <BotonEnlace variante="contorno" tamano="grande" className="flex-[0_1_200px]" to={`/entidad/programas/${id}/editar`}>
                  Volver a editar
                </BotonEnlace>
              </div>
            )}

            {esperando && (
              <div aria-live="polite" className="flex flex-col gap-3 rounded-xl bg-nota px-[18px] py-4">
                <div className="flex items-center gap-2.5">
                  <Clock aria-hidden className="size-[22px]" />
                  <strong className="text-[17px]">Esperando tu aprobación en el banco…</strong>
                </div>
                <p className="m-0 text-[15px] text-tinta-suave">
                  Si no apruebas en 10 minutos, el programa vuelve a Borrador sin perder nada. Si cerraste tu banco sin aprobar, cancela y pide el permiso otra vez.
                </p>
                <Boton variante="contorno" className="self-start" onClick={() => void cancelar()} disabled={enviando}>
                  Cancelar la aprobación
                </Boton>
              </div>
            )}
          </Tarjeta>

          <aside className="flex flex-[1_1_320px] flex-col gap-4">
            <Tarjeta className="gap-3">
              <h2 className="m-0 text-lg font-bold">Cómo funciona</h2>
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px]">
                {['Pulsas «Aprobar en mi banco».', 'Tu banco te muestra el tope y tú lo apruebas.', 'Vuelves aquí y el programa queda Activo.'].map((t, i) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-noche text-[13px] font-bold text-arena">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
            </Tarjeta>
            <figure className="m-0 flex flex-col gap-2.5 rounded-xl border-2 border-dashed border-control bg-papel p-5">
              <div aria-hidden className="flex flex-col gap-2.5">
                <div className="h-3.5 w-[55%] rounded bg-nota" />
                <div className="h-2.5 w-[85%] rounded bg-nota" />
                <div className="h-2.5 w-[70%] rounded bg-nota" />
                <div className="mt-1.5 flex gap-2">
                  <div className="h-9 flex-1 rounded-md bg-linea" />
                  <div className="h-9 flex-1 rounded-md border border-linea" />
                </div>
              </div>
              <figcaption className="text-sm text-tinta-suave">Pantalla de consentimiento de la Test Wallet. La muestra tu banco, fuera de Tatú.</figcaption>
            </figure>
          </aside>
        </div>
      )}
    </MarcoEntidad>
  )
}
