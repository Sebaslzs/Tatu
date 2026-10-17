// Detalle de un cobro (wireframe 05): línea de tiempo y datos. Se consulta hasta un estado final.
import { useParams } from 'react-router'
import { http } from '@/api/http'
import type { Cobro } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { Cargando, ErrorCarga, ListaDatos, Tarjeta, Titulo, Volver } from '@/componentes/Comun'
import { EstadoCobro } from '@/componentes/EstadoCobro'
import { LineaDeTiempo } from '@/componentes/LineaDeTiempo'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { textoMonto } from '@/lib/montos'
import { esEstadoFinal } from '@/lib/pantallas'
import { formatSegundos } from '@/lib/textos'
import { personaTexto } from './textos'

export default function DetalleCobro() {
  const { id = '' } = useParams()
  const consulta = usePolling(() => http.get<Cobro>(`/cobros/${id}`), 2000, (x) => !x || !esEstadoFinal(x.estado), { clave: id })
  const c = consulta.datos
  const vivo = c && !esEstadoFinal(c.estado)

  return (
    <MarcoEntidad>
      <Volver to={c ? `/entidad/programas/${c.programa.id}` : '/entidad'}>{c ? 'Volver al tablero' : 'Tus programas'}</Volver>
      {consulta.error && !c && <ErrorCarga mensaje={consulta.error} reintentar={() => void consulta.recargar()} />}
      {!c && !consulta.error && <Cargando />}
      {c && (
        <>
          <div className="flex flex-wrap items-center gap-3" aria-live={vivo ? 'polite' : undefined}>
            <Titulo>
              Cobro <span className="mono font-medium">{c.estado === 'Rechazado' ? '—' : c.referencia}</span>
            </Titulo>
            <EstadoCobro estado={c.estado} motivo={c.motivo} grande />
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <Tarjeta className="flex-[999_1_560px]">
              <h2 className="m-0 text-xl font-bold">Línea de tiempo</h2>
              <LineaDeTiempo eventos={c.eventos ?? []} />
            </Tarjeta>
            <Tarjeta as="aside" className="flex-[1_1_320px] gap-3.5">
              <h2 className="m-0 text-xl font-bold">Datos del cobro</h2>
              <ListaDatos
                className="text-[15px]"
                filas={[
                  ['Programa', c.programa.nombre],
                  ['Persona', `${personaTexto(c)} · ${c.persona.cedula}`],
                  ['Canal', c.canal === 'retiro' ? 'Retiro en un punto' : c.canal === 'compra' ? 'Compra con bono' : 'A la cuenta'],
                  ['Dónde', c.canal === 'cuenta' ? <span key="c" className="mono text-sm">{c.cuenta?.billeteraCorta ?? '—'}</span> : (c.punto?.nombre ?? '—')],
                  ['Monto', <strong key="m">{textoMonto(c.monto)}</strong>],
                  ['Referencia', <span key="r" className="mono">{c.referencia}</span>],
                  c.motivo && ['Motivo', c.motivo.mensaje],
                  c.segundosHastaPagado !== null && [
                    c.canal === 'retiro' ? 'Reembolso al punto' : 'Tiempo hasta Pagado',
                    `${formatSegundos(c.segundosHastaPagado)} después ${c.canal === 'retiro' ? 'del PIN' : 'de pedirlo'}`,
                  ],
                ]}
              />
            </Tarjeta>
          </div>
        </>
      )}
    </MarcoEntidad>
  )
}
