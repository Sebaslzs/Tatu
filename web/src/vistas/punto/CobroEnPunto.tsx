// Un cobro en el punto, de principio a fin (P2 a P7 en el celular, PD2 a PD4 en el computador), en una
// sola ruta: la pantalla sale del estado del cobro que manda la API y se consulta hasta que termina.
// PorConfirmar → rostro o huella en un retiro, el PIN en una compra con bono · Pagando → «No entregues efectivo todavía» · Pagado → entrega ·
// Rechazado o Fallido → «No entregues efectivo».
import { Clock, TriangleAlert, Wallet } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useConfig } from '@/api/config'
import { ErrorHttp, mensajeDeError } from '@/api/http'
import { cancelarCobro, confirmarConBiometria, confirmarConPin, consultarCobro } from '@/api/punto'
import type { Cobro } from '@/api/tipos'
import { usePolling, type Consulta } from '@/api/usePolling'
import { BotonEnlace as BotonEnlaceMedio, Boton as BotonMedio, Cargando, ErrorCarga, Titulo } from '@/componentes/Comun'
import { EstadoCobro } from '@/componentes/EstadoCobro'
import { PantallaCelular } from '@/componentes/piezas'
import { marcarPagando, TatuResultado } from '@/componentes/tatu/TatuEnrolla'
import { textoMonto } from '@/lib/montos'
import { esEstadoFinal, inicioPagando, pantallaDelCobro } from '@/lib/pantallas'
import { explicacionMotivo, formatCuentaRegresiva, formatSegundos, MOTIVO_CORTO } from '@/lib/textos'
import { useEnComputador } from '@/lib/useEnComputador'
import { usePunteroTactil } from '@/lib/usePunteroTactil'
import { cn } from '@/lib/utils'
import { personaConCedula, primerNombre, textoCompra } from './datos'
import { EsperaPagando } from './Espera'
import { Boton, BotonEnlace, Cabecera, Caja, claseEnlaceSuave, Datos, PantallaPuntoEscritorio, VolverEscritorio } from './piezas'
import { PuntosPin, TecladoPin } from './TecladoPin'
import { useCuentaRegresiva } from './tiempo'
import type { MetodoBiometrico } from './biometria/pasos'
import { VerificacionBiometrica } from './biometria/VerificacionBiometrica'

export function CobroEnPunto() {
  const { id = '' } = useParams()
  const config = useConfig()
  const computador = useEnComputador()
  const consulta = usePolling(() => consultarCobro(id), config.pollIntervaloMs, (c) => !c || !esEstadoFinal(c.estado), { clave: id })
  // El cobro recién pedido llega con los datos que devolvió la API: no pasa por la pantalla de carga
  const inicial = (useLocation().state as { cobro?: Cobro } | null)?.cobro
  const c = consulta.datos ?? (inicial?.id === id ? inicial : undefined)
  const pantalla = pantallaDelCobro(c?.estado)

  if (!c) {
    const carga = consulta.error ? <ErrorCarga mensaje={consulta.error} reintentar={() => void consulta.recargar()} /> : <Cargando texto="Buscando el cobro…" />
    return computador ? <PantallaPuntoEscritorio>{carga}</PantallaPuntoEscritorio> : <PantallaCelular className="gap-4">{carga}</PantallaCelular>
  }
  return (
    <div aria-live="polite">
      {pantalla === 'confirmarPin' && c.canal === 'retiro' && <ConfirmarIdentidad cobro={c} consulta={consulta} computador={computador} />}
      {pantalla === 'confirmarPin' && c.canal !== 'retiro' && <ConfirmarPin cobro={c} consulta={consulta} computador={computador} />}
      {pantalla === 'pagando' && <Pagando cobro={c} computador={computador} />}
      {pantalla === 'pagado' && <Pagado cobro={c} computador={computador} />}
      {pantalla === 'rechazo' && <Rechazo cobro={c} computador={computador} />}
    </div>
  )
}

const quien = (c: Cobro) => (c.canal === 'compra' ? 'comercio' : 'tienda')

/**
 * «Nuevo cobro» e «Ir al inicio», abajo en el celular. En la sede de un comercio la venta empieza en
 * su inicio: «Nueva venta».
 */
function AccionesFinales({ cobro: c }: { cobro: Cobro }) {
  if (c.canal === 'compra') {
    return (
      <div className="mt-auto flex flex-col gap-1">
        <BotonEnlace to="/punto">Nueva venta</BotonEnlace>
      </div>
    )
  }
  return (
    <div className="mt-auto flex flex-col gap-1">
      <BotonEnlace to="/punto/nuevo">Nuevo cobro</BotonEnlace>
      <Link to="/punto" className={claseEnlaceSuave}>
        Ir al inicio
      </Link>
    </div>
  )
}

/** En el computador, «Nuevo cobro» (o «Nueva venta») en su tarjeta, con una nota debajo. */
function AccionesEscritorio({ cobro: c, nota }: { cobro: Cobro; nota: string }) {
  return (
    <Caja grande className="flex-[1_1_300px]">
      <BotonEnlaceMedio to="/punto" tamano="grande" className="w-full">
        {c.canal === 'compra' ? 'Nueva venta' : 'Nuevo cobro'}
      </BotonEnlaceMedio>
      <span className="text-[15px] text-tinta-suave">{nota}</span>
    </Caja>
  )
}

// ── Rostro o huella en un retiro ──────────────────────────────────────────────

/**
 * Retiro en un punto: la persona elige rostro o huella. Con la verificación exitosa se confirma el
 * cobro (pasa a Pagando y el tatú rueda). Volver o «Cancelar cobro» lo cancela, como con el PIN.
 */
function ConfirmarIdentidad({ cobro: c, consulta, computador }: { cobro: Cobro; consulta: Consulta<Cobro>; computador: boolean }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restante = useCuentaRegresiva(c.confirmarAntesDe, () => void consulta.recargar())
  const vencido = restante === 0
  const nombre = c.persona.nombre

  const confirmar = useCallback(
    async (metodo: MetodoBiometrico) => {
      setEnviando(true)
      setError(null)
      try {
        const r = await confirmarConBiometria(c.id, metodo)
        if (r.estado === 'Rechazado' || r.estado === 'Fallido') marcarPagando(r.id)
        consulta.setDatos(r)
      } catch (e) {
        setError(mensajeDeError(e))
        await consulta.recargar()
      } finally {
        setEnviando(false)
      }
    },
    [c.id, consulta],
  )

  const cancelar = async () => {
    setEnviando(true)
    try {
      consulta.setDatos(await cancelarCobro(c.id))
    } catch (e) {
      setError(mensajeDeError(e))
      await consulta.recargar()
    } finally {
      setEnviando(false)
    }
  }

  const reloj = restante !== null && (
    <span className="inline-flex items-center gap-1.5 text-base font-bold">
      <Clock aria-hidden className="size-[18px]" strokeWidth={2} />
      <time aria-label={`${formatCuentaRegresiva(restante)} para confirmar`}>{formatCuentaRegresiva(restante)}</time>
    </span>
  )
  const alerta = error && (
    <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-rechazo-fondo px-3 py-2.5 text-base font-bold text-rechazo">
      <TriangleAlert aria-hidden className="size-5 flex-none" />
      {error.endsWith('.') ? error : `${error}.`}
    </div>
  )
  const contenido = (
    <>
      <div className="flex flex-col gap-0.5 rounded-[18px] border-[1.5px] border-linea bg-papel px-4 py-3">
        <span className="text-sm font-semibold text-tinta-suave">{c.programa.nombre} · valor completo</span>
        <span className="cifra text-[34px] [overflow-wrap:anywhere]">{textoMonto(c.monto)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Titulo className="text-lg font-extrabold sm:text-lg">{primerNombre(nombre)}, verifica tu identidad</Titulo>
        {reloj}
      </div>
      {alerta}
      {vencido ? (
        <p className="m-0 text-base font-bold">Se acabó el tiempo para confirmar. Empieza un cobro nuevo.</p>
      ) : (
        <VerificacionBiometrica alVerificar={(m) => void confirmar(m)} deshabilitado={enviando} />
      )}
      {enviando && <Cargando texto="Liberando el pago…" />}
      <button type="button" onClick={() => void cancelar()} disabled={enviando} className={claseEnlaceSuave}>
        Cancelar cobro
      </button>
    </>
  )

  if (computador) {
    return (
      <PantallaPuntoEscritorio
        volver={<VolverEscritorio onClick={() => void cancelar()}>Pagos de {nombre}</VolverEscritorio>}
        subtitulo={personaConCedula(c)}
        titulo="Verificar identidad"
      >
        <div className="flex max-w-[640px] flex-col gap-4">{contenido}</div>
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-[11px]">
      <Cabecera alVolver={() => void cancelar()} etiquetaVolver="Cancelar el cobro y volver" titulo="Verificar identidad" subtitulo={personaConCedula(c)} />
      {contenido}
    </PantallaCelular>
  )
}

// ── PIN en una compra con bono (P2, P3, PD2) ──────────────────────────────────

function ConfirmarPin({ cobro: c, consulta, computador }: { cobro: Cobro; consulta: Consulta<Cobro>; computador: boolean }) {
  // El PIN solo vive aquí: se envía una vez y se borra (CA-11.06)
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Una tablet en horizontal o una pantalla táctil usa la vista del computador pero no tiene teclado
  // físico: ahí también se dibuja el teclado del PIN
  const tactil = usePunteroTactil()
  // Al llegar a cero se vuelve a consultar: la API lo pasa a Rechazado por tiempo agotado (CA-11.04)
  const restante = useCuentaRegresiva(c.confirmarAntesDe, () => void consulta.recargar())
  const vencido = restante === 0
  const nombre = c.persona.nombre
  const monto = textoMonto(c.monto)

  const confirmar = async () => {
    if (pin.length !== 4) return
    const enviado = pin
    setPin('')
    setEnviando(true)
    setError(null)
    try {
      const r = await confirmarConPin(c.id, enviado)
      // Al tercer PIN incorrecto el rechazo llega rodando y termina en rojo
      if (r.estado === 'Rechazado' || r.estado === 'Fallido') marcarPagando(r.id)
      consulta.setDatos(r)
    } catch (e) {
      setError(mensajeDeError(e))
      // PIN incorrecto: los intentos que quedan vienen con el cobro
      if (e instanceof ErrorHttp && e.status === 422) await consulta.recargar()
    } finally {
      setEnviando(false)
    }
  }

  /** Volver o «Cancelar cobro»: se cancela para que la cédula no quede con un cobro en curso (CA-11.05). */
  const cancelar = async () => {
    setEnviando(true)
    try {
      consulta.setDatos(await cancelarCobro(c.id))
    } catch (e) {
      setError(mensajeDeError(e))
      // Si ya no espera el PIN (venció o pasó a pagarse), la consulta trae su estado
      await consulta.recargar()
    } finally {
      setEnviando(false)
    }
  }

  const reloj = restante !== null && (
    <span className={cn('inline-flex items-center font-bold', computador ? 'gap-1.5 text-[17px]' : 'gap-[5px] text-[15px]')}>
      <Clock aria-hidden className={computador ? 'size-5' : 'size-[18px]'} strokeWidth={2} />
      <time aria-label={`${formatCuentaRegresiva(restante)} para confirmar`}>{formatCuentaRegresiva(restante)}</time>
    </span>
  )
  const alerta = error && (
    <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-rechazo-fondo px-3 py-2.5 text-base font-bold text-rechazo">
      <TriangleAlert aria-hidden className="size-5 flex-none" />
      {error.endsWith('.') ? error : `${error}.`}
    </div>
  )
  const titulo = `${primerNombre(nombre)}, digita tu PIN`
  const queCubre = c.canal === 'compra' ? `${c.programa.nombre} · el bono cubre` : `${c.programa.nombre} · valor completo`

  if (computador) {
    return (
      <PantallaPuntoEscritorio
        volver={<VolverEscritorio onClick={() => void cancelar()}>Pagos de {nombre}</VolverEscritorio>}
        subtitulo={personaConCedula(c)}
        titulo="Confirmar con PIN"
      >
        <div className="flex flex-wrap items-stretch gap-6">
          {/* La tarjeta crece hasta el ancho de la cifra: un monto no se parte en dos líneas */}
          <Caja grande className="min-w-fit flex-[1_1_360px]">
            <span className="text-base font-semibold text-tinta-suave">{c.canal === 'compra' ? 'El bono cubre' : 'Pago disponible'}</span>
            <span className="cifra text-[60px] leading-none whitespace-nowrap">{monto}</span>
            <span className="text-base">{c.programa.nombre}</span>
            <span className="text-[15px] text-tinta-suave">{c.canal === 'compra' ? textoCompra(c) : 'Se entrega el valor completo.'}</span>
          </Caja>
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] rounded-[20px] bg-ambar p-7 text-noche">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="ancho text-[26px] font-extrabold">{titulo}</span>
              {reloj}
            </div>
            <PuntosPin largo={pin.length} grande error={Boolean(error)} />
            <span className="text-base leading-[1.45]">Pásale el teclado o gira la pantalla hacia {primerNombre(nombre)}. Mientras digita, no mires el PIN.</span>
            {alerta}
            {tactil ? (
              <div className="w-full max-w-[380px]">
                <TecladoPin onChange={setPin} deshabilitado={enviando || vencido} />
              </div>
            ) : (
              <TecladoPin onChange={setPin} deshabilitado={enviando || vencido} oculto />
            )}
            <div className="mt-1 flex flex-wrap gap-3">
              <BotonMedio className="min-w-[200px]" onClick={() => void confirmar()} disabled={pin.length !== 4 || enviando || vencido}>
                {enviando ? 'Confirmando…' : 'Confirmar'}
              </BotonMedio>
              <BotonMedio variante="contorno" className="hover:bg-[#e5951a]" onClick={() => void cancelar()} disabled={enviando}>
                Cancelar cobro
              </BotonMedio>
            </div>
          </div>
        </div>
      </PantallaPuntoEscritorio>
    )
  }

  return (
    <PantallaCelular className="gap-[11px]">
      <Cabecera alVolver={() => void cancelar()} etiquetaVolver="Cancelar el cobro y volver" titulo="Confirmar con PIN" subtitulo={personaConCedula(c)} />
      <div className="flex flex-col gap-0.5 rounded-[18px] border-[1.5px] border-linea bg-papel px-4 py-3">
        <span className="text-sm font-semibold text-tinta-suave">{queCubre}</span>
        <span className="cifra text-[34px] [overflow-wrap:anywhere]">{monto}</span>
        {c.canal === 'compra' && <span className="text-sm text-tinta-suave">{textoCompra(c)}</span>}
      </div>
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-ambar p-3.5 text-noche">
        <div className="flex items-center justify-between gap-2">
          <Titulo className="text-lg font-extrabold sm:text-lg">{titulo}</Titulo>
          {reloj}
        </div>
        <PuntosPin largo={pin.length} error={Boolean(error)} />
      </div>
      {alerta}
      <TecladoPin onChange={setPin} deshabilitado={enviando || vencido} />
      <Boton onClick={() => void confirmar()} disabled={pin.length !== 4 || enviando || vencido}>
        {enviando ? 'Confirmando…' : 'Confirmar'}
      </Boton>
      <button type="button" onClick={() => void cancelar()} disabled={enviando} className={claseEnlaceSuave}>
        Cancelar cobro
      </button>
    </PantallaCelular>
  )
}

// ── Pagando (P4) ──────────────────────────────────────────────────────────────

function Pagando({ cobro: c, computador }: { cobro: Cobro; computador: boolean }) {
  const contenido = (
    <EsperaPagando cobroId={c.id} desde={inicioPagando(c.eventos) ?? c.actualizado}>
      Estamos pagando {textoMonto(c.monto)} desde la cuenta del programa a la billetera de tu {quien(c)}.
    </EsperaPagando>
  )
  if (computador) {
    return (
      <PantallaPuntoEscritorio volver={<VolverEscritorio a="/punto">Inicio</VolverEscritorio>} subtitulo={personaConCedula(c)} titulo="Pagando">
        <div className="flex max-w-[640px] flex-col gap-4">{contenido}</div>
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-4">
      <Cabecera volver="/punto" etiquetaVolver="Volver al inicio; el cobro sigue en curso" titulo="Pagando" subtitulo={personaConCedula(c)} />
      <h1 className="sr-only">Pagando</h1>
      {contenido}
      <p className="m-0 mt-auto text-[15px] leading-[1.45] text-tinta-suave">Si vuelves al inicio, el cobro sigue en curso y lo encuentras en {c.canal === 'compra' ? 'Mi caja' : 'Cobros de hoy'}.</p>
    </PantallaCelular>
  )
}

// ── Pagado (P5, PD3) ──────────────────────────────────────────────────────────

function Reembolso({ cobro: c, grande = false }: { cobro: Cobro; grande?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', !grande && 'rounded-[18px] border-[1.5px] border-linea bg-papel px-4 py-3.5')}>
      <span aria-hidden className={cn('flex flex-none items-center justify-center rounded-xl bg-noche text-ambar', grande ? 'size-12' : 'size-11')}>
        <Wallet className={grande ? 'size-6' : 'size-[22px]'} strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className={cn('font-extrabold', grande ? 'text-[19px]' : 'text-[17px]')}>{c.canal === 'compra' ? 'El pago del bono ya llegó' : 'Tu reembolso ya llegó'}</span>
        <span className={cn('text-tinta-suave', grande ? 'text-base' : 'text-[15px]')}>
          {textoMonto(c.monto)} en la billetera de tu {quien(c)}
          {c.segundosHastaPagado !== null ? `, ${formatSegundos(c.segundosHastaPagado)} después del PIN` : ''}.
        </span>
      </div>
    </div>
  )
}

function Pagado({ cobro: c, computador }: { cobro: Cobro; computador: boolean }) {
  const monto = textoMonto(c.monto)
  const aQuien = c.canal === 'compra' ? `El bono cubrió ${monto}` : `Entrega a ${primerNombre(c.persona.nombre)}`
  if (computador) {
    return (
      <PantallaPuntoEscritorio volver={<VolverEscritorio a="/punto">Inicio</VolverEscritorio>} subtitulo={personaConCedula(c)} titulo="Resultado del cobro">
        <div role="status" className="flex flex-wrap items-center gap-7 rounded-3xl bg-pagado-relleno p-8 text-white">
          <TatuResultado id={c.id} estado="pagado" sobreColor className="w-44 flex-none" />
          <div className="flex flex-[1_1_360px] flex-col gap-1.5">
            <span className="cifra text-[44px] leading-none">Pagado</span>
            <span className="text-xl font-semibold">{c.canal === 'compra' ? textoCompra(c) : aQuien}</span>
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <span className="cifra text-[72px] leading-none [overflow-wrap:anywhere] max-sm:text-5xl">{monto}</span>
            <span className="text-[17px]">Referencia {c.referencia}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <Caja grande className="flex-[999_1_520px]">
            <Reembolso cobro={c} grande />
          </Caja>
          <AccionesEscritorio cobro={c} nota={c.canal === 'compra' ? 'La venta ya aparece en Mi caja.' : 'El cobro ya aparece en Cobros de hoy.'} />
        </div>
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-4">
      <Cabecera volver="/punto" etiquetaVolver="Volver al inicio" titulo="Resultado del cobro" subtitulo={personaConCedula(c)} />
      <div role="status" className="flex flex-col gap-1.5 rounded-[22px] bg-pagado-relleno p-5 text-white">
        <TatuResultado id={c.id} estado="pagado" sobreColor className="w-32" />
        <Titulo className="mt-1.5 text-[38px] leading-[1.05] sm:text-[38px]">Pagado</Titulo>
        <span className="text-lg font-semibold">{aQuien}</span>
        {c.canal === 'compra' ? <span className="text-base">{textoCompra(c)}</span> : <span className="cifra text-[44px] leading-none [overflow-wrap:anywhere]">{monto}</span>}
        <span className="mt-1 text-base">Referencia {c.referencia}</span>
      </div>
      <Reembolso cobro={c} />
      <AccionesFinales cobro={c} />
    </PantallaCelular>
  )
}

// ── Rechazado o fallido (P6, P7, PD4) ─────────────────────────────────────────

function BloqueNoEntregues({ cobro: c, grande = false }: { cobro: Cobro; grande?: boolean }) {
  const compra = c.canal === 'compra'
  return (
    <div role="alert" className={cn('flex items-center bg-rechazo-relleno text-white', grande ? 'flex-wrap gap-6 rounded-3xl p-8' : 'gap-3.5 rounded-[20px] p-[18px]')}>
      <TatuResultado id={c.id} estado="fallido" finalError="logo" sobreColor className={grande ? 'w-32 flex-none' : 'w-24 flex-none'} />
      <div className={cn('flex flex-col', grande ? 'flex-[1_1_420px] gap-1.5' : 'gap-0.5')}>
        <span className={grande ? 'cifra text-[40px]' : 'text-2xl font-extrabold'}>{compra ? 'El bono no se aplicó' : 'No entregues efectivo'}</span>
        <span className={grande ? 'text-xl' : 'text-base'}>{compra ? 'Cobra la compra completa por otro medio.' : 'No se movió dinero.'}</span>
      </div>
    </div>
  )
}

function Rechazo({ cobro: c, computador }: { cobro: Cobro; computador: boolean }) {
  const codigo = c.motivo?.codigo
  const titulo = c.motivo?.mensaje ?? (c.estado === 'Fallido' ? 'El pago falló' : 'El cobro fue rechazado')
  const datos: Array<[string, ReactNode]> = [
    ['Persona', personaConCedula(c)],
    ['Programa', `${c.programa.nombre}${codigo === 'ProgramaCerrado' ? ' · Cerrado' : ''}`],
  ]
  if (c.monto) datos.push(['Valor solicitado', `${textoMonto(c.monto)}${c.persona.novedad ? ' · retroactivo' : ''}`])
  if (c.motivo) datos.push(['Motivo', MOTIVO_CORTO[c.motivo.codigo] ?? c.motivo.mensaje])
  // Un fallido sí llegó al banco: su referencia sirve para buscarlo
  if (c.estado === 'Fallido') datos.push(['Referencia', c.referencia])
  const chip = <EstadoCobro estado={c.estado} motivo={c.motivo} grande />

  if (computador) {
    return (
      <PantallaPuntoEscritorio volver={<VolverEscritorio a="/punto">Inicio</VolverEscritorio>} subtitulo={personaConCedula(c)} titulo="Resultado del cobro" junto={chip}>
        <p className="m-0 text-lg font-bold">{titulo}</p>
        <BloqueNoEntregues cobro={c} grande />
        <div className="flex flex-wrap items-start gap-6">
          <Caja grande className="flex-[999_1_520px]">
            <h2 className="m-0 text-[21px] font-extrabold">Este intento</h2>
            <Datos filas={datos} />
          </Caja>
          <AccionesEscritorio cobro={c} nota={explicacionMotivo(codigo, c.estado)} />
        </div>
      </PantallaPuntoEscritorio>
    )
  }
  return (
    <PantallaCelular className="gap-3.5">
      <Cabecera volver="/punto" etiquetaVolver="Volver al inicio" titulo="Resultado del cobro" subtitulo={personaConCedula(c)} />
      <span className="self-start">{chip}</span>
      <Titulo className="text-[27px] leading-[1.15] sm:text-[27px]">{titulo}</Titulo>
      <p className="m-0 text-[17px] leading-[1.45]">{explicacionMotivo(codigo, c.estado)}</p>
      <BloqueNoEntregues cobro={c} />
      <Caja>
        <Datos filas={datos} />
      </Caja>
      <AccionesFinales cobro={c} />
    </PantallaCelular>
  )
}
