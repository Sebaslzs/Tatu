// Lo que comparten las pantallas del punto: desde qué punto se atiende, su caja y sus cobros de hoy,
// y la consulta de una cédula hasta pedir el cobro. Sin JSX.
import { createContext, useContext, useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router'
import { mensajeDeError } from '@/api/http'
import { cajaDelPunto, cobrosDelPunto, pagosDeCedula, pedirCobro, type CajaPunto, type PagosEnPunto } from '@/api/punto'
import type { Cobro, CobroResumen, Punto } from '@/api/tipos'
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
 * carga. Mientras se pedía, el tatú ya venía rodando: si el cobro se rechazó al pedirlo (ya cobrado,
 * en proceso…), el rechazo llega rodando y termina en rojo; si sigue al PIN, el PIN sale de una vez.
 */
export function irAlCobro(navegar: NavigateFunction, c: Cobro) {
  if (c.estado === 'Rechazado' || c.estado === 'Fallido') marcarPagando(c.id)
  navegar(`/punto/cobros/${c.id}`, { state: { cobro: c } })
}

// ── Consultar la cédula y pedir el cobro ──────────────────────────────────────

const CEDULA = /^\d{5,12}$/

/**
 * Consultar la cédula (P1) y pedir el cobro del subsidio elegido (P1b). Si la persona tiene pagos se
 * muestran siempre, aunque sea uno; si no, se pide igual y la API deja el rechazo en pantalla
 * (HU-13). Una llave por cédula digitada y por subsidio (CA-10.07): la misma en el doble clic y en
 * el reintento.
 */
export function useConsultaCedula(puntoId: string) {
  const navegar = useNavigate()
  const [cedula, setCedula] = useState('')
  const [llave, setLlave] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  // Pidiendo el cobro (no consultando la cédula): se ve el tatú de los pagos rodando
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opciones, setOpciones] = useState<PagosEnPunto | null>(null)

  const pedir = async (programaId?: string) => {
    setEnviando(true)
    setPidiendo(true)
    setError(null)
    try {
      const c = await pedirCobro({
        cedula,
        canal: 'retiro',
        puntoId,
        programaId,
        // El doble clic en la misma opción no crea dos cobros
        llaveIdempotencia: programaId ? `${llave}-${programaId}` : llave,
      })
      irAlCobro(navegar, c)
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
    cambiarCedula: (v: string) => {
      setCedula(v.replace(/\D/g, ''))
      setLlave(crypto.randomUUID())
      setError(null)
      setOpciones(null)
    },
    consultar,
    pedir,
    opciones,
    volver: () => {
      setOpciones(null)
      setError(null)
    },
    enviando,
    pidiendo,
    error,
  }
}

export type ConsultaCedula = ReturnType<typeof useConsultaCedula>
