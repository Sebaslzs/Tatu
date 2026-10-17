// Lo que comparten las pantallas del punto: desde qué punto se atiende, su caja y sus cobros de hoy,
// y la consulta de una cédula hasta pedir el cobro. Sin JSX.
import { createContext, useContext, useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router'
import { mensajeDeError } from '@/api/http'
import { cajaDelPunto, cobrosDelPunto, pagosDeCedula, pedirCobro, type CajaPunto, type PagoPendiente, type PagosEnPunto, type PedidoCobro } from '@/api/punto'
import type { Cobro, CobroResumen, Monto, Punto } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { marcarPagando } from '@/componentes/tatu/TatuEnrolla'
import { textoMonto } from '@/lib/montos'
import { formatHora, formatSegundos, MOTIVO_CORTO, plural } from '@/lib/textos'

// ── El punto que atiende ──────────────────────────────────────────────────────

export interface PuntoActual {
  id: string
  /** El punto con su nombre y su tipo; null mientras llega la lista o si no se pudo traer. */
  datos: Punto | null
  /** «Tienda Marta» (o «Punto de retiro» mientras llega). */
  nombre: string
  cargando: boolean
  error: string | null
  recargar: () => void
}

export const ContextoPunto = createContext<PuntoActual | null>(null)

export function usePunto(): PuntoActual {
  const valor = useContext(ContextoPunto)
  if (!valor) throw new Error('usePunto debe usarse dentro de <RutasPunto>')
  return valor
}

// ── La caja y los cobros de hoy ───────────────────────────────────────────────

/** La caja de hoy y los cobros de hoy, que se refrescan mientras la vista está abierta. */
export function useHoy(puntoId: string) {
  const caja = usePolling(() => cajaDelPunto(puntoId, 'hoy'), 10_000, true, { clave: puntoId })
  const cobros = usePolling(() => cobrosDelPunto(puntoId, 'hoy'), 5000, true, { clave: puntoId })
  return { caja, cobros }
}

/** Las cifras de la caja ya formateadas, con los textos del prototipo. */
export function cifrasCaja(c: CajaPunto | undefined) {
  const t = c?.totales[0]
  const enCamino = t !== undefined && t.pendiente.valor !== '0'
  return {
    entregado: t ? textoMonto(t.entregado) : '$0',
    reembolsado: t ? textoMonto(t.reembolsado) : '$0',
    vendido: t ? textoMonto(t.vendido) : '$0',
    hayVentas: t !== undefined && t.vendido.valor !== '0',
    pendiente: t ? textoMonto(t.pendiente) : '$0',
    adelantado: t ? textoMonto(t.giradoPorAdelantado) : '$0',
    enCamino,
    pagados: c?.cobros.pagados ?? 0,
    enCurso: c?.cobros.enCurso ?? 0,
    rechazados: c?.cobros.rechazados ?? 0,
    reembolsoTexto: enCamino ? `${textoMonto(t.pendiente)} en camino a tu billetera` : 'Ya te reembolsaron todo',
    adelantadoTexto: t && t.giradoPorAdelantado.valor !== '0' ? 'Por recuperar' : 'Nada por recuperar',
  }
}

// ── Textos de cada cobro ──────────────────────────────────────────────────────

/** «••• 003»: la API manda la cédula enmascarada («******0003»); se muestran sus últimos 3 dígitos. */
export const cedulaCorta = (cedula: string) => `••• ${cedula.replace(/\D/g, '').slice(-3)}`

/** «Jorge Ruiz · ••• 003», para las filas de los cobros. */
export function personaTexto(c: Pick<CobroResumen, 'persona'>): string {
  return `${c.persona.nombre} · ${cedulaCorta(c.persona.cedula)}${c.persona.novedad ? ' · novedad' : ''}`
}

/** «Jorge», para «Jorge, digita tu PIN». Sin el nombre de la liquidación queda «Persona 0003» completo. */
export const primerNombre = (nombre: string) => (nombre.startsWith('Persona ') ? nombre : nombre.split(' ')[0]!)

/** «Jorge Ruiz · C.C. ••• 003», debajo del título de cada paso del cobro. */
export const personaConCedula = (c: Pick<CobroResumen, 'persona'>) => `${c.persona.nombre} · C.C. ${cedulaCorta(c.persona.cedula)}`

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Reembolso en 4 s» o el motivo corto («Tope del banco»). */
export function detalleCobro(c: CobroResumen): string | null {
  if (c.estado === 'Pagado' && c.segundosHastaPagado !== null) {
    return c.canal === 'compra' ? `Pagado en ${formatSegundos(c.segundosHastaPagado)}` : `Reembolso en ${formatSegundos(c.segundosHastaPagado)}`
  }
  if (c.motivo) return conMayuscula(MOTIVO_CORTO[c.motivo.codigo] ?? c.motivo.mensaje)
  return null
}

/** «SUB-0004 · 10:50 · Tope del banco»: la línea de abajo de cada cobro. Un rechazo no movió dinero: va sin referencia. */
export function lineaCobro(c: CobroResumen): string {
  return [c.estado === 'Rechazado' ? null : c.referencia, formatHora(c.creado, false), detalleCobro(c)].filter(Boolean).join(' · ')
}

/** «Tiene 1 pago disponible.» */
export const textoPagos = (n: number) => plural(n, 'pago disponible', 'pagos disponibles')

/** En una compra con bono, cuánto paga el cliente por fuera (total − lo que cubre el bono). */
export function textoCompra(c: Pick<Cobro, 'monto' | 'totalCompra'>): string {
  if (!c.totalCompra || !c.monto) return 'compra con bono'
  const resto = BigInt(c.totalCompra.valor) - BigInt(c.monto.valor)
  return resto === 0n ? 'el cliente no paga nada más' : `cobra ${textoMonto({ ...c.monto, valor: resto.toString() })} al cliente`
}

// ── Del cobro pedido a su pantalla ────────────────────────────────────────────

/**
 * Lleva a la pantalla del cobro con los datos que ya devolvió la API, sin pasar por la pantalla de
 * carga. Si el cobro se rechazó al pedirlo (ya cobrado, en proceso…), el resultado abre con el tatú
 * rodando y termina en rojo; si sigue al PIN, el PIN sale de una vez.
 */
export function irAlCobro(navegar: NavigateFunction, c: Cobro) {
  if (c.estado === 'Rechazado' || c.estado === 'Fallido') marcarPagando(c.id)
  navegar(`/punto/cobros/${c.id}`, { state: { cobro: c } })
}

// ── Consultar la cédula y pedir el cobro ──────────────────────────────────────

const CEDULA = /^\d{5,12}$/

/** Dónde se digitó la cédula: al pasar del computador al celular, el celular retoma el nuevo cobro. */
export type DondeSeDigito = 'celular' | 'computador' | null

// ── El retiro: cuánto y si hubo compra (HU-26, HU-27) ────────────────────────

/** Lo que el punto llena antes de pedir el PIN. Los valores van en pesos, como los digita. */
export interface FormRetiro {
  /** Todo el saldo o solo una parte. */
  modo: 'todo' | 'parte'
  monto: string
  /** Si la persona compró algo en la tienda con parte del retiro. */
  conVenta: boolean
  venta: string
  descripcion: string
}

export const FORM_RETIRO_INICIAL: FormRetiro = { modo: 'todo', monto: '', conVenta: false, venta: '', descripcion: '' }

/** El desglose que ve el punto antes de pedir el PIN, y lo que se le pide a la API. */
export interface CalculoRetiro {
  retiro: Monto | null
  venta: Monto | null
  efectivo: Monto | null
  saldo: Monto | null
  errorMonto: string | null
  errorVenta: string | null
  /** Lo que va en el pedido del cobro; null mientras haya un error. */
  pedido: Pick<PedidoCobro, 'monto' | 'venta'> | null
}

/** «90.000» o «90000» en pesos → unidades mínimas; null si no es un número entero de pesos. */
export function pesosAUnidades(texto: string, escala: number): bigint | null {
  const limpio = texto.replace(/[\s.$]/g, '')
  if (!/^\d+$/.test(limpio)) return null
  return BigInt(limpio) * 10n ** BigInt(escala)
}

/**
 * La misma cuenta que hará la API (RN-19 a RN-23), para mostrar el desglose y los errores mientras
 * se digita. La API vuelve a validar todo: esto no decide nada.
 *   efectivo = retiro − compra · le queda = saldo − retiro
 */
export function calcularRetiro(p: PagoPendiente, f: FormRetiro): CalculoRetiro {
  const { assetCode, assetScale } = p.monto
  const m = (v: bigint): Monto => ({ valor: v.toString(), assetCode, assetScale })
  const disponible = BigInt(p.monto.valor)
  let errorMonto: string | null = null
  let errorVenta: string | null = null

  let retiro: bigint | null = disponible
  if (f.modo === 'parte') {
    retiro = f.monto.trim() ? pesosAUnidades(f.monto, assetScale) : null
    if (!f.monto.trim()) errorMonto = 'Escribe cuánto va a retirar.'
    else if (retiro === null) errorMonto = 'Escribe el valor en pesos, sin centavos.'
    else if (retiro <= 0n) errorMonto = 'El retiro debe ser mayor que cero.'
    else if (retiro > disponible) errorMonto = `Supera el saldo disponible (${textoMonto(p.monto)}).`
    else if (p.montoMinimo && retiro < BigInt(p.montoMinimo.valor) && retiro !== disponible) errorMonto = `El retiro mínimo es ${textoMonto(p.montoMinimo)}.`
  }
  const retiroValido = errorMonto === null && retiro !== null ? retiro : null

  let venta: bigint | null = null
  if (f.conVenta) {
    venta = f.venta.trim() ? pesosAUnidades(f.venta, assetScale) : null
    if (!f.venta.trim()) errorVenta = 'Escribe el valor de la compra.'
    else if (venta === null) errorVenta = 'Escribe el valor en pesos, sin centavos.'
    else if (venta <= 0n) errorVenta = 'La compra debe ser mayor que cero.'
    else if (retiroValido !== null && venta >= retiroValido) errorVenta = `La compra debe ser menor que el retiro (${textoMonto(m(retiroValido))}).`
  }
  const ventaValida = f.conVenta && errorVenta === null && venta !== null ? venta : null

  const listo = retiroValido !== null && (!f.conVenta || ventaValida !== null)
  return {
    retiro: retiroValido === null ? null : m(retiroValido),
    venta: ventaValida === null ? null : m(ventaValida),
    efectivo: retiroValido === null ? null : m(retiroValido - (ventaValida ?? 0n)),
    saldo: retiroValido === null ? null : m(disponible - retiroValido),
    errorMonto,
    errorVenta,
    pedido: listo
      ? {
          ...(f.modo === 'parte' ? { monto: retiroValido!.toString() } : {}),
          ...(ventaValida !== null ? { venta: { valor: ventaValida.toString(), ...(f.descripcion.trim().length >= 2 ? { descripcion: f.descripcion.trim() } : {}) } } : {}),
        }
      : null,
  }
}

/**
 * Consultar la cédula (P1) y pedir el cobro del subsidio elegido (P1b). Si la persona tiene pagos se
 * muestran siempre, aunque sea uno; si no, se pide igual y la API deja el rechazo en pantalla
 * (HU-13). Una llave por cédula digitada y por subsidio (CA-10.07): la misma en el doble clic y en
 * el reintento.
 *
 * El estado vive en las rutas del punto (RutasPunto, `ContextoConsultaCedula`), no en cada pantalla:
 * la vista del celular y la del computador comparten la misma consulta, así girar el celular o
 * redimensionar la ventana no borra la cédula digitada ni los pagos que ya se ven. Se reinicia al
 * pedir el cobro y al salir del nuevo cobro con «volver».
 */
export function useEstadoConsultaCedula(puntoId: string) {
  const navegar = useNavigate()
  const [cedula, setCedula] = useState('')
  const [llave, setLlave] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  // Pidiendo el cobro de un pago elegido (no consultando la cédula)
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opciones, setOpciones] = useState<PagosEnPunto | null>(null)
  const [donde, setDonde] = useState<DondeSeDigito>(null)
  // HU-26 y HU-27: el subsidio elegido y lo que el punto llena antes de pedir el PIN
  const [elegido, setElegido] = useState<string | null>(null)
  const [retiro, setRetiro] = useState<FormRetiro>(FORM_RETIRO_INICIAL)

  const reiniciar = () => {
    setCedula('')
    setLlave(crypto.randomUUID())
    setEnviando(false)
    setPidiendo(false)
    setError(null)
    setOpciones(null)
    setDonde(null)
    setElegido(null)
    setRetiro(FORM_RETIRO_INICIAL)
  }

  const pedir = async (programaId?: string, extra: Pick<PedidoCobro, 'monto' | 'venta'> = {}) => {
    setEnviando(true)
    setPidiendo(true)
    setError(null)
    try {
      const c = await pedirCobro({
        cedula,
        canal: 'retiro',
        puntoId,
        programaId,
        ...extra,
        // El doble clic en la misma opción no crea dos cobros; otro monto u otra compra es otro intento
        llaveIdempotencia: programaId ? [llave, programaId, extra.monto ?? 'todo', extra.venta?.valor ?? 'sin-venta'].join('-') : llave,
      })
      irAlCobro(navegar, c)
      // El cobro ya tiene su pantalla: el próximo «Nuevo cobro» empieza de cero
      reiniciar()
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
      setPidiendo(false)
    }
  }

  const consultar = async () => {
    if (!CEDULA.test(cedula)) return setError('Digita el número de la cédula, sin puntos ni espacios.')
    setEnviando(true)
    setError(null)
    let consulta: PagosEnPunto | null = null
    try {
      consulta = await pagosDeCedula(puntoId, cedula)
    } catch {
      // Cédula sin pagos, desconocida o liquidación caída: el cobro lo dice como siempre
    }
    if (consulta && consulta.pagos.length > 0) {
      setOpciones(consulta)
      setEnviando(false)
      return
    }
    await pedir()
  }

  return {
    cedula,
    cambiarCedula: (v: string, desde: Exclude<DondeSeDigito, null> = 'celular') => {
      setCedula(v.replace(/\D/g, ''))
      setLlave(crypto.randomUUID())
      setError(null)
      setOpciones(null)
      setDonde(desde)
    },
    consultar,
    pedir,
    opciones,
    volver: () => {
      setOpciones(null)
      setElegido(null)
      setError(null)
    },
    /** El subsidio que se va a retirar; null mientras se ven los pagos. */
    elegido: opciones?.pagos.find((p) => p.programa.id === elegido) ?? null,
    elegir: (programaId: string) => {
      setElegido(programaId)
      setRetiro(FORM_RETIRO_INICIAL)
      setError(null)
    },
    /** Del retiro, de vuelta a los pagos de la cédula. */
    volverAPagos: () => {
      setElegido(null)
      setError(null)
    },
    retiro,
    cambiarRetiro: (cambio: Partial<FormRetiro>) => {
      setRetiro((actual) => ({ ...actual, ...cambio }))
      setError(null)
    },
    /** Deja todo como al entrar: sin cédula, sin pagos y sin errores. */
    reiniciar,
    donde,
    /** El celular ya retomó lo digitado en el computador. */
    retomadoEnCelular: () => setDonde('celular'),
    enviando,
    pidiendo,
    error,
  }
}

export type ConsultaCedula = ReturnType<typeof useEstadoConsultaCedula>

export const ContextoConsultaCedula = createContext<ConsultaCedula | null>(null)

/** La consulta de la cédula que comparten el inicio del computador y el nuevo cobro del celular. */
export function useConsultaCedula(): ConsultaCedula {
  const valor = useContext(ContextoConsultaCedula)
  if (!valor) throw new Error('useConsultaCedula debe usarse dentro de <RutasPunto>')
  return valor
}
