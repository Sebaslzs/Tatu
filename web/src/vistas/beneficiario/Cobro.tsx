// Un cobro a la cuenta, de principio a fin. En /beneficiario/cobrar/:programaId pide el cobro y pasa
// a /beneficiario/cobros/:id sin desmontarse, para que el tatú siga la misma animación; en
// /beneficiario/cobros/:id muestra un cobro ya pedido. Mientras no tenga estado final se consulta
// cada segundo.
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { cobrarACuenta, consultarCobro, ESTADOS_FINALES, type Cobro as DatosCobro, type EstadoCobro } from '@/api/beneficiario'
import { codigoDeError, mensajeDeError } from '@/api/client'
import { Icono } from '@/componentes/piezas'
import { TatuCargando } from '@/componentes/tatu/TatuCargando'
import { TatuEnrolla, type EstadoPago } from '@/componentes/tatu/TatuEnrolla'
import { useRol } from '@/contexto/Rol'
import { formatearHora, formatearMonto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useConsulta } from '@/lib/useConsulta'
import { Aviso, BotonEnlace, Cabecera, ErrorCarga, FilasDatos, PantallaBeneficiario } from './comunes'

const CONSULTA_MS = 1000
/** Motivos que se resuelven enlazando (otra) cuenta. */
const MOTIVOS_DE_CUENTA = ['CuentaNoVerificada', 'LlaveNoExiste']

const esFinal = (e: EstadoCobro) => ESTADOS_FINALES.includes(e)

export function Cobro({ visita }: { visita: string }) {
  const { programaId, id } = useParams()
  const location = useLocation()
  const navegar = useNavigate()
  const { cedula } = useRol()
  const [desdeElInicio] = useState(() => Boolean(programaId))
  const [pedido, setPedido] = useState<DatosCobro | null>(() => (location.state as { cobro?: DatosCobro } | null)?.cobro ?? null)
  const [errorPedido, setErrorPedido] = useState<unknown>(null)
  // Una llave por visita: si el pedido se repite (doble montaje, reintento de red) la API devuelve el mismo cobro
  const [llave] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (!programaId || !cedula) return
    let vigente = true
    cobrarACuenta(cedula, programaId, llave)
      .then((c) => {
        if (!vigente) return
        setPedido(c)
        navegar(`/beneficiario/cobros/${c.id}`, { replace: true, state: { cobro: c, visita } })
      })
      .catch((e: unknown) => {
        if (vigente) setErrorPedido(e)
      })
    return () => {
      vigente = false
    }
  }, [programaId, cedula, llave, navegar, visita])

  const cobroId = pedido?.id ?? id ?? null
  const consulta = useConsulta<DatosCobro>(cobroId, () => consultarCobro(cobroId ?? ''), {
    inicial: pedido,
    cadaMs: CONSULTA_MS,
    seguir: (c) => !esFinal(c.estado),
  })
  const cobro = consulta.datos ?? pedido

  const estadoTatu: EstadoPago =
    errorPedido !== null ? 'fallido' : cobro?.estado === 'Pagado' ? 'pagado' : cobro && esFinal(cobro.estado) ? 'fallido' : 'pagando'
  const enCurso = estadoTatu === 'pagando'
  const enPunto = cobro?.canal === 'retiro'
  // Abierto por id: hasta conocer el cobro no se sabe si el tatú debe rodar o aparecer en su resultado
  const sinCobro = !cobro && errorPedido === null && !programaId
  const fallo = estadoTatu === 'fallido'
  // Si se lo vio rodar, el tatú del rechazo llega rodando y frena; si no, aparece quieto en su final
  const [vioRodar, setVioRodar] = useState(desdeElInicio)
  if (!vioRodar && !sinCobro && enCurso) setVioRodar(true)

  return (
    <PantallaBeneficiario ancho="formulario" className="gap-4">
      <Cabecera
        volver="/beneficiario"
        etiquetaVolver={enCurso ? 'Volver a mis subsidios; el pago sigue en curso' : 'Volver a mis subsidios'}
        titulo={enPunto ? 'Cobro en un punto' : 'Cobro a tu cuenta'}
        subtitulo={cobro?.programa.nombre}
      />

      {sinCobro && consulta.error !== null && <ErrorCarga error={consulta.error} reintentar={consulta.recargar} />}
      {sinCobro && consulta.error === null && <TatuCargando texto="Buscando tu cobro…" />}
      {!sinCobro && (
        <>
          {!fallo && (
            <div className="flex justify-center pt-3">
              <TatuDelCobro estado={estadoTatu} desdeElInicio={desdeElInicio} />
            </div>
          )}

          {errorPedido !== null && (
            <NoSePago mensaje={mensajeDeError(errorPedido)} codigo={codigoDeError(errorPedido)} programaId={programaId ?? null} vioRodar={vioRodar} />
          )}
          {errorPedido === null && enCurso && <EnCurso cobro={cobro} />}
          {cobro?.estado === 'Pagado' && <Pagado cobro={cobro} />}
          {cobro && esFinal(cobro.estado) && cobro.estado !== 'Pagado' && (
            <NoSePago
              mensaje={cobro.motivo?.mensaje ?? 'El pago no se pudo hacer.'}
              codigo={cobro.motivo?.codigo ?? null}
              programaId={cobro.programa.id}
              vioRodar={vioRodar}
            />
          )}
        </>
      )}
    </PantallaBeneficiario>
  )
}

/**
 * El tatú del pago: de pie se enrolla y rueda mientras se paga; con el resultado frena y termina en el
 * logo con la cerradura verde (pagado) o roja (no se pagó). Si el cobro ya tenía resultado al abrirlo,
 * queda quieto en ese final.
 */
function TatuDelCobro({ estado, desdeElInicio }: { estado: EstadoPago; desdeElInicio: boolean }) {
  // TatuEnrolla toma el inicio al montarse: se fija aquí para que no cambie con las consultas
  const [inicio] = useState<'de-pie' | 'final'>(() => (desdeElInicio || estado === 'pagando' ? 'de-pie' : 'final'))
  return <TatuEnrolla estado={estado} inicio={inicio} finalError="logo" className="w-56" />
}

type Paso = 'hecho' | 'actual' | 'pendiente'

function EnCurso({ cobro }: { cobro: DatosCobro | null }) {
  const pagando = cobro?.estado === 'Pagando'
  const destino = cobro?.cuenta ? ` a tu cuenta ${cobro.cuenta.billeteraCorta}` : ''
  const pasos: [string, Paso][] = [
    ['Solicitado', pagando ? 'hecho' : 'actual'],
    ['Pagando', pagando ? 'actual' : 'pendiente'],
    ['Pagado', 'pendiente'],
  ]
  return (
    <>
      <div role="status" className="flex flex-col gap-3.5 rounded-[22px] bg-noche px-5 py-[22px] text-arena">
        <span className="ancho text-[36px] leading-[1.05] font-extrabold">{pagando ? 'Pagando…' : 'Pidiendo el pago…'}</span>
        <span className="text-[17px] leading-[1.4]">
          {cobro?.monto ? `Estamos enviando ${formatearMonto(cobro.monto)}${destino}.` : 'Un momento: estamos pidiendo tu pago.'}
        </span>
        <ol className="m-0 mt-1.5 flex list-none flex-col gap-3 p-0">
          {pasos.map(([nombre, estado]) => (
            <PasoPago key={nombre} nombre={nombre} estado={estado} />
          ))}
        </ol>
      </div>
      <Aviso className="text-base">Suele tardar unos segundos. Si sales, el pago sigue y verás el resultado en tus subsidios.</Aviso>
    </>
  )
}

function PasoPago({ nombre, estado }: { nombre: string; estado: Paso }) {
  return (
    <li className={cn('flex items-center gap-3 text-[17px]', estado === 'actual' && 'font-extrabold', estado === 'pendiente' && 'text-noche-texto-tenue')}>
      {estado === 'hecho' && (
        <span className="flex size-7 items-center justify-center rounded-full bg-arena">
          <Icono className="size-4" stroke="#13203A" strokeWidth={3}>
            <path d="M20 6L9 17l-5-5" />
          </Icono>
        </span>
      )}
      {estado === 'actual' && (
        <span className="flex size-7 items-center justify-center rounded-full border-[3px] border-ambar">
          <span className="size-2.5 rounded-full bg-ambar" />
        </span>
      )}
      {estado === 'pendiente' && <span className="size-7 rounded-full border-2 border-borde-campo" />}
      {nombre}
      {estado !== 'pendiente' && <span className="sr-only">{estado === 'hecho' ? ' (listo)' : ' (en curso)'}</span>}
    </li>
  )
}

function Pagado({ cobro }: { cobro: DatosCobro }) {
  const monto = cobro.monto ? formatearMonto(cobro.monto) : 'El dinero'
  const filas: [string, ReactNode][] = []
  if (cobro.cuenta) filas.push(['Cuenta', cobro.cuenta.billeteraCorta])
  if (cobro.punto) filas.push(['Punto', cobro.punto.nombre])
  filas.push(['Programa', cobro.programa.nombre], ['Hora', formatearHora(cobro.actualizado)])
  if (cobro.segundosHastaPagado !== null) filas.push(['Tiempo', `${cobro.segundosHastaPagado} s`])

  return (
    <>
      <div role="status" className="flex flex-col gap-1.5 rounded-[22px] bg-pagado px-5 py-[22px] text-white">
        <span className="ancho text-[40px] leading-[1.05] font-extrabold">Pagado</span>
        <span className="text-xl leading-[1.35] font-semibold">
          {cobro.canal === 'retiro' ? `Recibiste ${monto} en efectivo` : `${monto} llegaron a tu cuenta`}
        </span>
        <span className="mt-0.5 text-base">Referencia {cobro.referencia}</span>
      </div>
      <FilasDatos filas={filas} />
      {cobro.canal === 'cuenta' && <Aviso className="text-base">Ya lo puedes ver en tu billetera con esta misma referencia.</Aviso>}
      <BotonEnlace a="/beneficiario" className="mt-auto">
        Volver a mis subsidios
      </BotonEnlace>
    </>
  )
}

function NoSePago({ mensaje, codigo, programaId, vioRodar }: { mensaje: string; codigo: string | null; programaId: string | null; vioRodar: boolean }) {
  const deCuenta = codigo !== null && MOTIVOS_DE_CUENTA.includes(codigo)
  // TatuEnrolla toma el inicio al montarse
  const [inicio] = useState<'rodando' | 'final'>(() => (vioRodar ? 'rodando' : 'final'))
  return (
    <>
      <div role="alert" className="mt-3 flex items-center gap-3.5 rounded-[22px] bg-error px-5 py-[22px] text-white">
        <TatuEnrolla estado="fallido" inicio={inicio} finalError="logo" sobreColor className="w-28 flex-none" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-2xl leading-[1.15] font-extrabold">No se hizo el pago</span>
          <span className="text-lg leading-[1.35] font-semibold">{mensaje}</span>
          <span className="mt-0.5 text-base">No se movió dinero.</span>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        {deCuenta && programaId && <BotonEnlace a={`/beneficiario/cuenta?programa=${programaId}`}>Enlazar mi cuenta</BotonEnlace>}
        {programaId && (
          <BotonEnlace a={`/beneficiario/puntos?programa=${programaId}`} variante={deCuenta ? 'contorno' : 'primario'}>
            Prefiero cobrar en un punto
          </BotonEnlace>
        )}
        <BotonEnlace a="/beneficiario" variante="contorno">
          Volver a mis subsidios
        </BotonEnlace>
      </div>
    </>
  )
}
